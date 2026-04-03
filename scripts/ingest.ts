/**
 * Ingest script — fetches recent ranked matches from OpenDota and stores raw
 * match + item timing data in Postgres.
 *
 * Run via: npm run ingest          (cron mode: Ancient 5+, 7-day window)
 *          npm run backfill        (bulk mode: all ranks, no pruning, 10 000 matches)
 * Or triggered by Vercel Cron via GET /api/cron/ingest
 *
 * Strategy:
 *  1. Fetch pages of /parsedMatches (recently parsed, purchase_log available)
 *  2. Filter to game_mode=22 (ranked) and avg_rank_tier >= minRankTier
 *  3. Skip match_ids already in DB
 *  4. Fetch full match detail, parse purchase_log, insert rows
 *  5. Prune matches older than pruneWindowDays (if set)
 *  6. Evict oldest low-rank matches when total exceeds evictAt threshold
 *
 * Rank tier reference (OpenDota):
 *   Herald 11-15 | Guardian 21-25 | Crusader 31-35 | Archon 41-45 |
 *   Legend 51-55 | Ancient 61-65 | Divine 71-75 | Immortal 80
 *   Ancient 5 = 65
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { matches, item_timings } from "../lib/db/schema";
import { getShards, getLeastFullShard, type ShardDb } from "../lib/db/shards";
import { inArray, lt, sql } from "drizzle-orm";

const OPENDOTA = "https://api.opendota.com/api";
const GAME_MODE_RANKED = 22;
const API_KEY = process.env.OPENDOTA_API_KEY ?? "";
const HAS_KEY = API_KEY.length > 0;
const RATE_DELAY_MS = HAS_KEY ? 200 : 1200; // 200ms with key (3000/min), 1200ms without (60/min)
const BATCH_SIZE = HAS_KEY ? 15 : 5;         // more parallelism with key

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IngestOptions {
  /** Maximum qualifying matches to insert in this run. Default: 200 */
  maxMatches?: number;
  /** Minimum avg_rank_tier to accept. 0 = all ranks. Default: 65 (Ancient 5) */
  minRankTier?: number;
  /** How many /parsedMatches pages to scan for candidates. Default: 20 */
  maxPages?: number;
  /**
   * Delete matches older than this many days. null = no time-based pruning.
   * Default: 7
   */
  pruneWindowDays?: number | null;
  /**
   * Once the total match count reaches this number, start evicting the oldest
   * matches whose avg_rank_tier < evictBelowRank to make room for better data.
   * Default: 15000
   */
  evictAt?: number;
  /**
   * Rank tier threshold for eviction. Matches below this are evicted first
   * when the total exceeds evictAt. Default: 65 (Ancient 5)
   */
  evictBelowRank?: number;
}

interface ParsedMatch { match_id: number }

interface MatchDetail {
  match_id: number;
  radiant_win: boolean;
  start_time: number;
  game_mode: number;
  players: Player[];
}

interface Player {
  hero_id: number;
  player_slot: number;
  win: number;
  rank_tier: number | null;
  purchase_log: Array<{ time: number; key: string }> | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function withKey(url: string): string {
  if (!API_KEY) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}api_key=${API_KEY}`;
}

async function fetchJson<T>(url: string, retries = 3): Promise<T> {
  const fullUrl = withKey(url);
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(fullUrl);
    if (res.status === 429 && attempt < retries) {
      const wait = (HAS_KEY ? 10_000 : 60_000) * (attempt + 1);
      console.warn(`[ingest] Rate limited (429), waiting ${wait / 1000}s before retry...`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`OpenDota ${res.status}: ${url}`);
    return res.json() as Promise<T>;
  }
  throw new Error(`OpenDota 429 after ${retries} retries: ${url}`);
}

async function fetchComponentSet(): Promise<Set<string>> {
  const itemsMap = await fetchJson<Record<string, { components: string[] | null; cost: number }>>(
    `${OPENDOTA}/constants/items`
  );
  const components = new Set<string>();
  for (const item of Object.values(itemsMap)) {
    for (const c of item.components ?? []) components.add(c);
  }
  // Keep items that are crafted (have components) AND cost >= 2000 gold.
  // Cheap intermediates (Perseverance, Buckler) stay filtered.
  // Real items (Eul's 2625, Shadow Blade 3000) are kept.
  for (const [name, item] of Object.entries(itemsMap)) {
    if (item.components && item.components.length > 0 && item.cost >= 2000) {
      components.delete(name);
    }
  }
  return components;
}

async function fetchItemIdMap(): Promise<Map<string, number>> {
  const itemsMap = await fetchJson<Record<string, { id: number }>>(
    `${OPENDOTA}/constants/items`
  );
  const map = new Map<string, number>();
  for (const [name, item] of Object.entries(itemsMap)) map.set(name, item.id);
  return map;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runIngest(options: IngestOptions = {}): Promise<{ inserted: number; skipped: number }> {
  const {
    maxMatches = 200,
    minRankTier = 65,
    maxPages = 20,
    pruneWindowDays = 7,
    evictAt = 15000,
    evictBelowRank = 65,
  } = options;

  const candidateMultiplier = minRankTier >= 65 ? 10 : 3;
  const cutoff = pruneWindowDays != null
    ? new Date(Date.now() - pruneWindowDays * 24 * 60 * 60 * 1000)
    : null;

  let inserted = 0;
  let skipped = 0;

  // Pick the least-full shard for writes
  const shards = getShards();
  const { shard: targetShard, index: shardIdx } = await getLeastFullShard();
  console.log(`[ingest] Using shard ${shardIdx} of ${shards.length} for writes`);

  console.log("[ingest] Fetching item constants...");
  const [componentSet, itemIdMap] = await Promise.all([fetchComponentSet(), fetchItemIdMap()]);
  console.log(`[ingest] ${itemIdMap.size} items, ${componentSet.size} components to exclude`);

  // 1. Collect candidate match IDs by paginating /parsedMatches
  console.log(`[ingest] Scanning up to ${maxPages} pages for candidates (minRankTier=${minRankTier})...`);
  const candidateIds: number[] = [];
  let lastMatchId: number | undefined;
  let pages = 0;
  const targetCandidates = maxMatches * candidateMultiplier;

  while (candidateIds.length < targetCandidates && pages < maxPages) {
    const url = `${OPENDOTA}/parsedMatches${lastMatchId ? `?less_than_match_id=${lastMatchId}` : ""}`;
    const page = await fetchJson<ParsedMatch[]>(url);
    if (!page.length) break;
    for (const m of page) candidateIds.push(m.match_id);
    lastMatchId = page[page.length - 1].match_id;
    pages++;
    await sleep(RATE_DELAY_MS);
  }
  console.log(`[ingest] ${candidateIds.length} candidate IDs from ${pages} pages`);

  // 2. Filter out already-ingested match IDs — check ALL shards
  const existingIds = new Set<number>();
  for (let i = 0; i < candidateIds.length; i += 1000) {
    const chunk = candidateIds.slice(i, i + 1000);
    const results = await Promise.all(
      shards.map((shard) =>
        shard.select({ match_id: matches.match_id })
          .from(matches)
          .where(inArray(matches.match_id, chunk))
      )
    );
    for (const rows of results) {
      for (const r of rows) existingIds.add(r.match_id);
    }
  }
  const toFetch = candidateIds.filter((id) => !existingIds.has(id)).slice(0, targetCandidates);
  skipped += existingIds.size;
  console.log(`[ingest] ${toFetch.length} to fetch (${skipped} already across ${shards.length} shards)`);

  // 3. Fetch match details, filter, insert into target shard
  let fetched = 0;
  for (let i = 0; i < toFetch.length && inserted < maxMatches; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((id) => fetchJson<MatchDetail>(`${OPENDOTA}/matches/${id}`))
    );

    for (const result of results) {
      if (result.status === "rejected") { skipped++; continue; }
      const match = result.value;
      fetched++;

      if (match.game_mode !== GAME_MODE_RANKED) { skipped++; continue; }
      if (cutoff && match.start_time * 1000 < cutoff.getTime()) { skipped++; continue; }

      const rankTiers = match.players
        .map((p) => p.rank_tier)
        .filter((r): r is number => r != null && r >= 10);
      const avg_rank_tier = rankTiers.length > 0
        ? Math.round(rankTiers.reduce((s, r) => s + r, 0) / rankTiers.length)
        : 0;
      if (avg_rank_tier < minRankTier) { skipped++; continue; }

      const radiant = match.players.filter((p) => p.player_slot < 128).map((p) => p.hero_id);
      const dire    = match.players.filter((p) => p.player_slot >= 128).map((p) => p.hero_id);
      if (radiant.length !== 5 || dire.length !== 5) { skipped++; continue; }

      const timingRows: typeof item_timings.$inferInsert[] = [];
      for (const player of match.players) {
        if (!player.hero_id || !player.purchase_log?.length) continue;
        const won = player.win === 1;
        for (const entry of player.purchase_log) {
          if (componentSet.has(entry.key)) continue;
          const item_id = itemIdMap.get(entry.key);
          if (!item_id) continue;
          timingRows.push({ match_id: match.match_id, hero_id: player.hero_id, item_id, time_s: entry.time, won });
        }
      }
      if (timingRows.length === 0) { skipped++; continue; }

      try {
        await targetShard.insert(matches).values({
          match_id: match.match_id,
          start_time: new Date(match.start_time * 1000),
          radiant_win: match.radiant_win,
          avg_rank_tier,
          radiant_0: radiant[0], radiant_1: radiant[1], radiant_2: radiant[2],
          radiant_3: radiant[3], radiant_4: radiant[4],
          dire_0: dire[0], dire_1: dire[1], dire_2: dire[2],
          dire_3: dire[3], dire_4: dire[4],
        }).onConflictDoNothing();
        await targetShard.insert(item_timings).values(timingRows).onConflictDoNothing();
        inserted++;
        if (inserted % 25 === 0) console.log(`[ingest] ${inserted} inserted, ${fetched} fetched...`);
      } catch (err) {
        console.warn(`[ingest] DB insert failed for match ${match.match_id}:`, err);
        skipped++;
      }
    }

    if (i + BATCH_SIZE < toFetch.length && inserted < maxMatches) await sleep(RATE_DELAY_MS);
  }

  // 4. Time-based pruning — run on ALL shards
  if (cutoff) {
    for (const shard of shards) {
      await shard.execute(sql`
        DELETE FROM item_timings
        WHERE match_id IN (SELECT match_id FROM matches WHERE start_time < ${cutoff})
      `);
      await shard.delete(matches).where(lt(matches.start_time, cutoff));
    }
    console.log(`[ingest] Pruned matches older than ${pruneWindowDays} days across ${shards.length} shards`);
  }

  // 5. Eviction — count total across all shards, evict from the shard with most low-rank matches
  let totalAcrossShards = 0;
  for (const shard of shards) {
    const r = await shard.execute<{ c: string }>(sql`SELECT COUNT(*)::text AS c FROM matches`);
    totalAcrossShards += parseInt(r.rows[0]?.c ?? "0", 10);
  }
  if (totalAcrossShards >= evictAt) {
    const toEvict = totalAcrossShards - evictAt + Math.min(inserted, 500);
    console.log(`[ingest] ${totalAcrossShards} total matches >= ${evictAt}; evicting ${toEvict} (low-rank first)`);
    // Evict proportionally from each shard
    const perShard = Math.ceil(toEvict / shards.length);
    for (const shard of shards) {
      await shard.execute(sql`
        DELETE FROM item_timings WHERE match_id IN (
          SELECT match_id FROM matches
          ORDER BY CASE WHEN avg_rank_tier < ${evictBelowRank} THEN 0 ELSE 1 END ASC, start_time ASC
          LIMIT ${perShard}
        )
      `);
      await shard.execute(sql`
        DELETE FROM matches WHERE match_id IN (
          SELECT match_id FROM matches
          ORDER BY CASE WHEN avg_rank_tier < ${evictBelowRank} THEN 0 ELSE 1 END ASC, start_time ASC
          LIMIT ${perShard}
        )
      `);
    }
  }

  console.log(`[ingest] Done. Inserted: ${inserted}, skipped: ${skipped}, fetched: ${fetched}`);
  return { inserted, skipped };
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

if (process.argv[1]?.endsWith("ingest.ts")) {
  const isBackfill = process.argv.includes("--backfill");

  const cliOptions: IngestOptions = isBackfill
    ? {
        maxMatches: 10000,
        minRankTier: 0,        // accept all ranks for initial population
        maxPages: 100,
        pruneWindowDays: null, // no pruning — keep everything we get
        evictAt: 15000,
        evictBelowRank: 65,
      }
    : {
        maxMatches: 200,
        minRankTier: 65,       // Ancient 5+
        maxPages: 20,
        pruneWindowDays: 7,
        evictAt: 15000,
        evictBelowRank: 65,
      };

  console.log(`[ingest] Mode: ${isBackfill ? "BACKFILL (all ranks, no prune)" : "CRON (Ancient 5+, 7-day window)"}`);

  runIngest(cliOptions)
    .then((r) => { console.log("[ingest] Complete:", r); process.exit(0); })
    .catch((e) => { console.error("[ingest] Error:", e); process.exit(1); });
}
