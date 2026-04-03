/**
 * Ingest script — fetches recent Divine+ ranked matches from OpenDota and
 * stores raw match + item timing data in Postgres.
 *
 * Run via: npx tsx scripts/ingest.ts
 * Or triggered by Vercel Cron via POST /api/cron/ingest
 *
 * Strategy:
 *  1. Fetch a page of recent match IDs from /publicMatches (game_mode=22)
 *  2. Filter to avg_rank_tier >= 80 (Divine+) within 7 days
 *  3. Skip match_ids already in DB
 *  4. Fetch full match detail, parse purchase_log, insert rows
 *  5. Prune matches older than 7 days
 */

// dotenv/config is only needed when running this script directly via tsx.
// In Next.js (cron routes) env vars are already available.
if (typeof window === "undefined" && process.argv[1]?.endsWith("ingest.ts")) {
  await import("dotenv/config");
}
import { db } from "../lib/db/client";
import { matches, item_timings } from "../lib/db/schema";
import { inArray, lt } from "drizzle-orm";

const OPENDOTA = "https://api.opendota.com/api";
const GAME_MODE_RANKED = 22;
const MIN_RANK_TIER = 80;       // Divine = 80–89, Immortal = 90+
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 10;          // parallel match detail fetches
const RATE_DELAY_MS = 1100;     // stay under 1 req/s per OpenDota guidelines

// ─── OpenDota types ───────────────────────────────────────────────────────────

interface PublicMatch {
  match_id: number;
  radiant_win: boolean;
  start_time: number; // unix seconds
  game_mode: number;
  avg_rank_tier: number;
  radiant_team: number[];
  dire_team: number[];
}

interface MatchDetail {
  match_id: number;
  radiant_win: boolean;
  start_time: number;
  game_mode: number;
  players: Player[];
}

interface Player {
  hero_id: number;
  player_slot: number; // 0–4 radiant, 128–132 dire
  win: number;         // 1 = won
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

// Build set of all item names that are components of another item.
// These should be excluded from item_timings (we only want completed items).
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

// Resolve item name → numeric id using the constants map
async function fetchItemIdMap(): Promise<Map<string, number>> {
  const itemsMap = await fetchJson<Record<string, { id: number }>>(
    `${OPENDOTA}/constants/items`
  );
  const map = new Map<string, number>();
  for (const [name, item] of Object.entries(itemsMap)) {
    map.set(name, item.id);
  }
  return map;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runIngest(maxMatches = 200): Promise<{ inserted: number; skipped: number }> {
  const cutoff = new Date(Date.now() - WINDOW_MS);
  let inserted = 0;
  let skipped = 0;

  console.log("[ingest] Fetching item constants...");
  const [componentSet, itemIdMap] = await Promise.all([
    fetchComponentSet(),
    fetchItemIdMap(),
  ]);
  console.log(`[ingest] ${itemIdMap.size} items, ${componentSet.size} components to exclude`);

  // 1. Fetch recent public match list
  console.log("[ingest] Fetching recent public matches...");
  const publicMatches = await fetchJson<PublicMatch[]>(
    `${OPENDOTA}/publicMatches?game_mode=${GAME_MODE_RANKED}`
  );

  const candidates = publicMatches.filter(
    (m) =>
      m.game_mode === GAME_MODE_RANKED &&
      m.avg_rank_tier >= MIN_RANK_TIER &&
      m.start_time * 1000 > cutoff.getTime() &&
      m.radiant_team?.length === 5 &&
      m.dire_team?.length === 5
  );
  console.log(`[ingest] ${candidates.length} divine+ candidates from ${publicMatches.length} total`);

  if (candidates.length === 0) {
    console.log("[ingest] No candidates found — publicMatches may not have divine+ results right now");
    return { inserted, skipped };
  }

  // 2. Filter out already-ingested match IDs
  const candidateIds = candidates.map((m) => m.match_id).slice(0, maxMatches);
  const existing = await db
    .select({ match_id: matches.match_id })
    .from(matches)
    .where(inArray(matches.match_id, candidateIds));
  const existingIds = new Set(existing.map((r) => r.match_id));

  const toFetch = candidateIds.filter((id) => !existingIds.has(id));
  skipped = candidateIds.length - toFetch.length;
  console.log(`[ingest] ${toFetch.length} new matches to fetch, ${skipped} already in DB`);

  // 3. Fetch match details in small batches (respect rate limit)
  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE);
    const details = await Promise.allSettled(
      batch.map((id) => fetchJson<MatchDetail>(`${OPENDOTA}/matches/${id}`))
    );

    for (const result of details) {
      if (result.status === "rejected") {
        console.warn("[ingest] fetch failed:", result.reason);
        continue;
      }
      const match = result.value;

      // Compute avg_rank_tier from player data (more accurate than publicMatches field)
      const rankTiers = match.players
        .map((p) => p.rank_tier)
        .filter((r): r is number => r != null && r >= 10);
      const avg_rank_tier = rankTiers.length > 0
        ? Math.round(rankTiers.reduce((s, r) => s + r, 0) / rankTiers.length)
        : 0;

      // Drop matches that don't actually average divine+
      if (avg_rank_tier < MIN_RANK_TIER) {
        skipped++;
        continue;
      }

      const startTime = new Date(match.start_time * 1000);

      // 4. Parse item timings for each player
      const timingRows: typeof item_timings.$inferInsert[] = [];
      for (const player of match.players) {
        if (!player.hero_id || !player.purchase_log?.length) continue;
        const won = player.win === 1;

        for (const entry of player.purchase_log) {
          const itemName = entry.key;
          // Skip component items
          if (componentSet.has(itemName)) continue;
          const item_id = itemIdMap.get(itemName);
          if (!item_id) continue;

          timingRows.push({
            match_id: match.match_id,
            hero_id: player.hero_id,
            item_id,
            time_s: entry.time,
            won,
          });
        }
      }

      if (timingRows.length === 0) {
        skipped++;
        continue;
      }

      // Extract hero arrays from players
      const radiant = match.players.filter((p) => p.player_slot < 128).map((p) => p.hero_id);
      const dire = match.players.filter((p) => p.player_slot >= 128).map((p) => p.hero_id);
      if (radiant.length !== 5 || dire.length !== 5) {
        skipped++;
        continue;
      }

      try {
        // Insert match row
        await db.insert(matches).values({
          match_id: match.match_id,
          start_time: startTime,
          radiant_win: match.radiant_win,
          avg_rank_tier,
          radiant_0: radiant[0], radiant_1: radiant[1], radiant_2: radiant[2],
          radiant_3: radiant[3], radiant_4: radiant[4],
          dire_0: dire[0], dire_1: dire[1], dire_2: dire[2],
          dire_3: dire[3], dire_4: dire[4],
        }).onConflictDoNothing();

        // Insert timing rows (skip duplicates)
        await db.insert(item_timings).values(timingRows).onConflictDoNothing();
        inserted++;
      } catch (err) {
        console.warn(`[ingest] DB insert failed for match ${match.match_id}:`, err);
      }
    }

    if (i + BATCH_SIZE < toFetch.length) await sleep(RATE_DELAY_MS);
  }

  // 5. Prune old matches (cascades to item_timings via delete)
  const pruneResult = await db.delete(matches).where(lt(matches.start_time, cutoff));
  console.log(`[ingest] Pruned old matches. Inserted: ${inserted}, skipped: ${skipped}`);
  void pruneResult;

  return { inserted, skipped };
}

// Allow direct invocation
if (process.argv[1]?.endsWith("ingest.ts")) {
  runIngest(200)
    .then((r) => { console.log("[ingest] Done:", r); process.exit(0); })
    .catch((e) => { console.error("[ingest] Error:", e); process.exit(1); });
}
