/**
 * Ingest script — fetches recent high-rank ranked matches from OpenDota and
 * stores raw match + item timing data in Postgres.
 *
 * Run via: npm run ingest
 * Or triggered by Vercel Cron via GET /api/cron/ingest
 *
 * Strategy:
 *  1. Fetch pages of /parsedMatches (recently parsed, purchase_log available)
 *  2. Filter to game_mode=22 (ranked) and avg_rank_tier >= 70 (Ancient+)
 *     Note: Divine+ (rank 80) is not accessible via the free public API —
 *     high-rank players have private profiles. Ancient+ is the highest rank
 *     tier reliably available and represents top ~2% of players.
 *  3. Skip match_ids already in DB
 *  4. Fetch full match detail, parse purchase_log, insert rows
 *  5. Prune matches older than 7 days
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../lib/db/client";
import { matches, item_timings } from "../lib/db/schema";
import { inArray, lt } from "drizzle-orm";

const OPENDOTA = "https://api.opendota.com/api";
const GAME_MODE_RANKED = 22;
const MIN_RANK_TIER = 70;    // Ancient+ (Divine+ not available via free API)
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 5;        // parallel match detail fetches
const RATE_DELAY_MS = 1200;  // ~50 req/min, safely under OpenDota's 60/min limit

// ─── Types ────────────────────────────────────────────────────────────────────

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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenDota ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

async function fetchComponentSet(): Promise<Set<string>> {
  const itemsMap = await fetchJson<Record<string, { components: string[] | null }>>(
    `${OPENDOTA}/constants/items`
  );
  const components = new Set<string>();
  for (const item of Object.values(itemsMap)) {
    for (const c of item.components ?? []) components.add(c);
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

export async function runIngest(maxMatches = 200): Promise<{ inserted: number; skipped: number }> {
  const cutoff = new Date(Date.now() - WINDOW_MS);
  let inserted = 0;
  let skipped = 0;

  console.log("[ingest] Fetching item constants...");
  const [componentSet, itemIdMap] = await Promise.all([fetchComponentSet(), fetchItemIdMap()]);
  console.log(`[ingest] ${itemIdMap.size} items, ${componentSet.size} components to exclude`);

  // 1. Collect candidate match IDs from parsedMatches (paginate to get enough)
  console.log("[ingest] Fetching parsed match IDs...");
  const candidateIds: number[] = [];
  let lastMatchId: number | undefined;
  let pages = 0;
  const maxPages = 10; // up to 1000 match IDs

  while (candidateIds.length < maxMatches * 3 && pages < maxPages) {
    const url = `${OPENDOTA}/parsedMatches${lastMatchId ? `?less_than_match_id=${lastMatchId}` : ""}`;
    const page = await fetchJson<ParsedMatch[]>(url);
    if (!page.length) break;
    for (const m of page) candidateIds.push(m.match_id);
    lastMatchId = page[page.length - 1].match_id;
    pages++;
    await sleep(RATE_DELAY_MS);
  }
  console.log(`[ingest] ${candidateIds.length} candidate IDs from ${pages} pages`);

  // 2. Filter out already-ingested
  const existing = await db
    .select({ match_id: matches.match_id })
    .from(matches)
    .where(inArray(matches.match_id, candidateIds.slice(0, 1000)));
  const existingIds = new Set(existing.map((r) => r.match_id));
  const toFetch = candidateIds.filter((id) => !existingIds.has(id)).slice(0, maxMatches * 3);
  skipped += existingIds.size;
  console.log(`[ingest] ${toFetch.length} to fetch (${skipped} already in DB)`);

  // 3. Fetch match details, filter by rank and game mode, insert
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

      // Filter: ranked mode only
      if (match.game_mode !== GAME_MODE_RANKED) { skipped++; continue; }

      // Filter: must be within rolling window
      if (match.start_time * 1000 < cutoff.getTime()) { skipped++; continue; }

      // Filter: Ancient+ by actual player rank_tier
      const rankTiers = match.players
        .map((p) => p.rank_tier)
        .filter((r): r is number => r != null && r >= 10);
      const avg_rank_tier = rankTiers.length > 0
        ? Math.round(rankTiers.reduce((s, r) => s + r, 0) / rankTiers.length)
        : 0;
      if (avg_rank_tier < MIN_RANK_TIER) { skipped++; continue; }

      const radiant = match.players.filter((p) => p.player_slot < 128).map((p) => p.hero_id);
      const dire    = match.players.filter((p) => p.player_slot >= 128).map((p) => p.hero_id);
      if (radiant.length !== 5 || dire.length !== 5) { skipped++; continue; }

      // Parse item timings — completed items only
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
        await db.insert(matches).values({
          match_id: match.match_id,
          start_time: new Date(match.start_time * 1000),
          radiant_win: match.radiant_win,
          avg_rank_tier,
          radiant_0: radiant[0], radiant_1: radiant[1], radiant_2: radiant[2],
          radiant_3: radiant[3], radiant_4: radiant[4],
          dire_0: dire[0], dire_1: dire[1], dire_2: dire[2],
          dire_3: dire[3], dire_4: dire[4],
        }).onConflictDoNothing();
        await db.insert(item_timings).values(timingRows).onConflictDoNothing();
        inserted++;
        if (inserted % 10 === 0) console.log(`[ingest] ${inserted} inserted, ${fetched} fetched so far...`);
      } catch (err) {
        console.warn(`[ingest] DB insert failed for match ${match.match_id}:`, err);
        skipped++;
      }
    }

    if (i + BATCH_SIZE < toFetch.length) await sleep(RATE_DELAY_MS);
  }

  // 4. Prune old matches
  await db.delete(matches).where(lt(matches.start_time, cutoff));
  console.log(`[ingest] Done. Inserted: ${inserted}, skipped: ${skipped}, fetched: ${fetched}`);
  return { inserted, skipped };
}

if (process.argv[1]?.endsWith("ingest.ts")) {
  runIngest(200)
    .then((r) => { console.log("[ingest] Complete:", r); process.exit(0); })
    .catch((e) => { console.error("[ingest] Error:", e); process.exit(1); });
}
