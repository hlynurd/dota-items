/**
 * Valve Steam API bulk harvester — streaming aggregation.
 *
 * Fetches matches via GetMatchHistoryBySequenceNum (100/call, free, no raw storage).
 * Accumulates marginal win rate counters in memory, writes public/data.json at the end.
 *
 * Usage:
 *   npm run valve-harvest                    # default: 500K matches, start from recent
 *   npm run valve-harvest -- --max 1000000   # custom max
 *   npm run valve-harvest -- --seq 7000000000  # custom start sequence
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { writeFileSync, readFileSync, existsSync, appendFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const STEAM_KEY = process.env.STEAM_API_KEY ?? "";
if (!STEAM_KEY) { console.error("STEAM_API_KEY not set"); process.exit(1); }

const API_URL = "https://api.steampowered.com/IDOTA2Match_570/GetMatchHistoryBySequenceNum/v1/";
const MATCHES_PER_CALL = 100;
const DELAY_MS = 6000; // ~10 calls/min — very conservative for Valve rate limits

// ─── Excluded / component item IDs ───────────────────────────────────────────

const EXCLUDED_ITEM_IDS = new Set([
  0,    // empty slot
  44,   // Tango
  39,   // Healing Salve
  38,   // Clarity
  46,   // Town Portal Scroll
  216,  // Enchanted Mango
  188,  // Smoke of Deceit
  42,   // Observer Ward
  43,   // Sentry Ward
  218,  // Ward Dispenser
  257,  // Tome of Knowledge
  33,   // Cheese
  237,  // Faerie Fire
]);

// No component filter needed — Valve API returns end-game items which are
// naturally finished items. The excluded consumables list above is sufficient.

function isRelevantItem(id: number): boolean {
  return !EXCLUDED_ITEM_IDS.has(id);
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ValveMatch {
  match_id: number;
  match_seq_num: number;
  radiant_win: boolean;
  start_time: number; // unix epoch
  game_mode: number;
  lobby_type: number;
  human_players: number;
  duration: number;
  players: ValvePlayer[];
}

interface ValvePlayer {
  hero_id: number;
  player_slot: number;
  item_0: number;
  item_1: number;
  item_2: number;
  item_3: number;
  item_4: number;
  item_5: number;
}

interface ApiResponse {
  result: {
    status: number;
    matches: ValveMatch[];
  };
}

// ─── Rank filtering via OpenDota publicMatches ──────────────────────────────

const OPENDOTA_PUBLIC = "https://api.opendota.com/api/publicMatches";
// Map<match_id, avg_rank_tier>
const rankCache = new Map<number, number>();
let rankCacheHighWater = 0; // highest match_id we've fetched rank data for

/**
 * Fetch Legend+ ranked match IDs from OpenDota publicMatches.
 * Populates rankCache with match_id → avg_rank_tier.
 * Returns the number of new entries added.
 */
async function fetchRankWindow(minRank: number, lessThanMatchId?: number): Promise<number> {
  const params = new URLSearchParams({
    min_rank: String(minRank),
    lobby_type: "7", // ranked
  });
  if (lessThanMatchId) params.set("less_than_match_id", String(lessThanMatchId));
  const url = `${OPENDOTA_PUBLIC}?${params}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return 0;
    const matches = (await res.json()) as { match_id: number; avg_rank_tier: number; match_seq_num: number }[];
    let added = 0;
    for (const m of matches) {
      if (!rankCache.has(m.match_id)) {
        rankCache.set(m.match_id, m.avg_rank_tier);
        added++;
      }
      if (m.match_id > rankCacheHighWater) rankCacheHighWater = m.match_id;
    }
    return added;
  } catch {
    return 0;
  }
}

/**
 * Fill rank cache around a specific match_id window.
 * OpenDota publicMatches with less_than_match_id paginates backward from a given match.
 * We need to fetch pages that overlap with the Valve API's current position.
 */
async function fillRankCacheAround(minRank: number, aroundMatchId: number): Promise<void> {
  // Fetch pages starting from slightly above the target match_id
  let cursor = aroundMatchId + 50000; // start a bit ahead to ensure overlap
  let total = 0;
  for (let page = 0; page < 30; page++) { // up to 3000 match IDs
    const added = await fetchRankWindow(minRank, cursor);
    total += added;
    if (added === 0) break;
    // Find lowest match_id for next page
    let minId = Infinity;
    for (const [id] of rankCache) {
      if (id < minId) minId = id;
    }
    // Stop if we've gone far enough below our target
    if (minId < aroundMatchId - 100000) break;
    cursor = minId;
    await sleep(1100); // OpenDota rate limit: ~1 req/sec without API key
  }
  console.log(`[harvest] Rank cache: ${rankCache.size.toLocaleString()} IDs (added ${total} around match ${aroundMatchId})`);
}

// ─── Raw match log (NDJSON for future 5v5 project) ──────────────────────────

const RAW_LOG_PATH = join(process.cwd(), "data", "matches.ndjson");
let rawBuffer: string[] = [];

/**
 * Log a ranked match as a compact NDJSON row.
 * Schema per line: { m: match_id, w: radiant_win(0|1), d: duration,
 *   r: [[hero_id, [item_ids...]], ...],  // radiant 5 players
 *   d: [[hero_id, [item_ids...]], ...]   // dire 5 players
 * }
 */
function logRawMatch(match: ValveMatch, avgRankTier?: number) {
  const radiant: [number, number[]][] = [];
  const dire: [number, number[]][] = [];
  for (const p of match.players) {
    const items = [p.item_0, p.item_1, p.item_2, p.item_3, p.item_4, p.item_5].filter(id => id !== 0);
    const entry: [number, number[]] = [p.hero_id, items];
    if (p.player_slot < 128) radiant.push(entry);
    else dire.push(entry);
  }
  const row: Record<string, unknown> = { m: match.match_id, w: match.radiant_win ? 1 : 0, s: match.duration, r: radiant, e: dire };
  if (avgRankTier !== undefined) row.k = avgRankTier; // k = rank tier
  rawBuffer.push(JSON.stringify(row));
}

function flushRawBuffer() {
  if (rawBuffer.length === 0) return;
  appendFileSync(RAW_LOG_PATH, rawBuffer.join("\n") + "\n");
  const totalLines = existsSync(RAW_LOG_PATH)
    ? readFileSync(RAW_LOG_PATH, "utf-8").split("\n").filter(Boolean).length
    : rawBuffer.length;
  console.log(`[harvest] Flushed ${rawBuffer.length} raw matches → ${RAW_LOG_PATH} (${totalLines} total)`);
  rawBuffer = [];
}

// ─── Accumulators ────────────────────────────────────────────────────────────

const matchLevel = new Map<string, { match_games: number; match_wins: number }>();
const heroTotals = new Map<string, { total_matches: number; total_wins: number }>();

function bumpMatch(key: string, won: boolean) {
  const cur = matchLevel.get(key) ?? { match_games: 0, match_wins: 0 };
  cur.match_games++;
  if (won) cur.match_wins++;
  matchLevel.set(key, cur);
}

function bumpTotal(key: string, won: boolean) {
  const cur = heroTotals.get(key) ?? { total_matches: 0, total_wins: 0 };
  cur.total_matches++;
  if (won) cur.total_wins++;
  heroTotals.set(key, cur);
}

// ─── Process a single match ──────────────────────────────────────────────────

function processMatch(match: ValveMatch) {
  const radiant: number[] = [];
  const dire: number[] = [];
  const radiantItems = new Map<number, Set<number>>(); // item_id → buyer hero_ids
  const direItems = new Map<number, Set<number>>();

  for (const p of match.players) {
    const isRadiant = p.player_slot < 128;
    if (isRadiant) radiant.push(p.hero_id);
    else dire.push(p.hero_id);

    const items = [p.item_0, p.item_1, p.item_2, p.item_3, p.item_4, p.item_5]
      .filter(isRelevantItem);

    const sideItems = isRadiant ? radiantItems : direItems;
    for (const item_id of items) {
      let buyers = sideItems.get(item_id);
      if (!buyers) { buyers = new Set(); sideItems.set(item_id, buyers); }
      buyers.add(p.hero_id);
    }
  }

  if (radiant.length !== 5 || dire.length !== 5) return;

  // Hero totals
  for (const hero of radiant) {
    bumpTotal(`${hero}:enemy`, !match.radiant_win);
    bumpTotal(`${hero}:ally`, match.radiant_win);
  }
  for (const hero of dire) {
    bumpTotal(`${hero}:enemy`, match.radiant_win);
    bumpTotal(`${hero}:ally`, !match.radiant_win);
  }

  // Radiant items
  for (const [item_id, buyers] of radiantItems) {
    for (const enemy of dire) {
      bumpMatch(`${item_id}:${enemy}:enemy`, match.radiant_win);
    }
    for (const ally of radiant) {
      if (!buyers.has(ally)) {
        bumpMatch(`${item_id}:${ally}:ally`, match.radiant_win);
      }
    }
  }

  // Dire items
  for (const [item_id, buyers] of direItems) {
    for (const enemy of radiant) {
      bumpMatch(`${item_id}:${enemy}:enemy`, !match.radiant_win);
    }
    for (const ally of dire) {
      if (!buyers.has(ally)) {
        bumpMatch(`${item_id}:${ally}:ally`, !match.radiant_win);
      }
    }
  }
}

// ─── Fetch helpers ───────────────────────────────────────────────────────────

async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchBatch(seqNum: number): Promise<ValveMatch[]> {
  const url = `${API_URL}?key=${STEAM_KEY}&start_at_match_seq_num=${seqNum}&matches_requested=${MATCHES_PER_CALL}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        console.warn(`[harvest] 429 rate limited, waiting 30s...`);
        await sleep(30_000);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ApiResponse;
      return data.result.matches ?? [];
    } catch (err) {
      if (attempt < 2) { await sleep(5000); continue; }
      throw err;
    }
  }
  return [];
}

// ─── Write data.json ─────────────────────────────────────────────────────────

function writeDataJson() {
  const jsonMarginals: [number, number, string, number, number][] = [];
  for (const [key, { match_games, match_wins }] of matchLevel) {
    if (match_games < 5) continue;
    const parts = key.split(":");
    jsonMarginals.push([Number(parts[0]), Number(parts[1]), parts[2], match_games, match_wins]);
  }
  const jsonTotals: [number, string, number, number][] = [];
  for (const [key, { total_matches, total_wins }] of heroTotals) {
    const [hero_id, side] = key.split(":");
    jsonTotals.push([Number(hero_id), side, total_matches, total_wins]);
  }
  const staticData = { m: jsonMarginals, t: jsonTotals, ts: Date.now() };
  const jsonPath = join(process.cwd(), "public", "data.json");
  writeFileSync(jsonPath, JSON.stringify(staticData));
  const sizeKB = Math.round(JSON.stringify(staticData).length / 1024);
  console.log(`[harvest] Wrote data.json: ${jsonMarginals.length} marginals, ${jsonTotals.length} totals (${sizeKB} KB)`);
}

// ─── Skip-to-today: binary search for recent matches ────────────────────────

const MAX_AGE_HOURS = 24; // if matches are older than this, skip ahead

async function findRecentSeq(currentSeq: number): Promise<number> {
  // Probe the current position to see how old it is
  const probe = await fetchBatch(currentSeq);
  if (probe.length === 0) return currentSeq;

  const matchAge = Date.now() / 1000 - probe[0].start_time;
  const ageHours = matchAge / 3600;
  if (ageHours <= MAX_AGE_HOURS) {
    console.log(`[harvest] Current seq is ${ageHours.toFixed(1)}h old — no skip needed`);
    return currentSeq;
  }

  console.log(`[harvest] Current seq is ${ageHours.toFixed(1)}h old — binary searching for today's matches...`);

  // Binary search: find a seq whose matches are within MAX_AGE_HOURS
  // Upper bound: estimate ~500K seq numbers per hour based on typical Dota match volume
  let lo = currentSeq;
  let hi = currentSeq + Math.ceil(ageHours * 500_000);

  for (let i = 0; i < 15; i++) { // max 15 iterations for convergence
    const mid = Math.floor((lo + hi) / 2);
    await sleep(DELAY_MS);
    const batch = await fetchBatch(mid);

    if (batch.length === 0) {
      // Overshot — no matches yet at this seq
      hi = mid;
      continue;
    }

    const midAge = (Date.now() / 1000 - batch[0].start_time) / 3600;
    console.log(`[harvest]   probe seq ${mid}: ${midAge.toFixed(1)}h old`);

    if (midAge > MAX_AGE_HOURS) {
      lo = mid;
    } else if (midAge < 1) {
      // Too recent — we want ~MAX_AGE_HOURS ago to not miss data
      hi = mid;
    } else {
      // Within 1-24 hours — good enough
      console.log(`[harvest] Found recent seq: ${mid} (${midAge.toFixed(1)}h ago)`);
      return mid;
    }
  }

  // Fallback to lo — at least it's closer than where we started
  console.log(`[harvest] Binary search converged to seq ${lo}`);
  return lo;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  let maxMatches = 500_000;
  let startSeq = 7_350_000_000; // patch 7.41a (March 27, 2026): Largo, Consecrated Wraps, Crella's Crozier
  let merge = false;
  let deploy = false;
  let checkpointEvery = 50_000;
  let minRank = 0; // 0 = no filter, 50 = Legend+, 60 = Ancient+, 70 = Divine+

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--max" && args[i + 1]) maxMatches = parseInt(args[i + 1]);
    if (args[i] === "--seq" && args[i + 1]) startSeq = parseInt(args[i + 1]);
    if (args[i] === "--merge") merge = true;
    if (args[i] === "--deploy") deploy = true;
    if (args[i] === "--checkpoint" && args[i + 1]) checkpointEvery = parseInt(args[i + 1]);
    if (args[i] === "--min-rank" && args[i + 1]) minRank = parseInt(args[i + 1]);
  }

  // Seed accumulators from existing data.json if --merge
  if (merge) {
    const jsonPath = join(process.cwd(), "public", "data.json");
    if (existsSync(jsonPath)) {
      const existing = JSON.parse(readFileSync(jsonPath, "utf-8"));
      for (const [item_id, hero_id, side, mg, mw] of existing.m) {
        const key = `${item_id}:${hero_id}:${side}`;
        matchLevel.set(key, { match_games: mg, match_wins: mw });
      }
      for (const [hero_id, side, tm, tw] of existing.t) {
        heroTotals.set(`${hero_id}:${side}`, { total_matches: tm, total_wins: tw });
      }
      console.log(`[harvest] Merged existing data: ${matchLevel.size} marginals, ${heroTotals.size} totals`);
    }
  }

  // Skip ahead to recent matches if current position is too far in the past
  startSeq = await findRecentSeq(startSeq);

  // Warm rank cache: need a match_id from the current seq position
  if (minRank > 0) {
    const probe = await fetchBatch(startSeq);
    if (probe.length > 0) {
      const probeMatchId = probe[Math.floor(probe.length / 2)].match_id;
      console.log(`[harvest] Probed match_id ${probeMatchId} at seq ${startSeq}`);
      await fillRankCacheAround(minRank, probeMatchId);
    }
  }

  console.log(`[harvest] Starting from seq ${startSeq}, target ${maxMatches} ranked matches${minRank > 0 ? ` (min rank: ${minRank})` : ""}`);
  console.log(`[harvest] Est. time: ${Math.round(maxMatches / 360_000 * 60)} min (assuming ~30% ranked yield)`);

  let seq = startSeq;
  let totalFetched = 0;
  let rankedProcessed = 0;
  let calls = 0;
  let emptyStreak = 0;
  let nextCheckpoint = checkpointEvery;
  const startTime = Date.now();

  while (rankedProcessed < maxMatches) {
    const matches = await fetchBatch(seq);
    calls++;

    if (matches.length === 0) {
      emptyStreak++;
      if (emptyStreak > 10) {
        console.log(`[harvest] 10 empty responses in a row — reached end of available matches`);
        break;
      }
      seq += 100;
      await sleep(DELAY_MS);
      continue;
    }

    emptyStreak = 0;
    totalFetched += matches.length;
    seq = matches[matches.length - 1].match_seq_num + 1;

    for (const match of matches) {
      if (match.game_mode !== 22) continue; // ranked All Pick
      if (match.lobby_type !== 7) continue; // ranked matchmaking
      if (match.human_players !== 10) continue;
      if (match.duration < 600) continue; // skip very short games (<10 min)

      // Rank filter: only process if match is in the Legend+ set
      const rankTier = rankCache.get(match.match_id);
      if (minRank > 0 && !rankTier) continue;

      logRawMatch(match, rankTier);
      processMatch(match);
      rankedProcessed++;
    }

    // Periodically refresh rank cache around current position (every 200 calls)
    if (minRank > 0 && calls % 200 === 0 && matches.length > 0) {
      const currentMatchId = matches[Math.floor(matches.length / 2)].match_id;
      await fillRankCacheAround(minRank, currentMatchId);
    }

    // Flush raw log every 1K matches
    if (rawBuffer.length >= 1000) flushRawBuffer();

    if (calls % 100 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = Math.round(rankedProcessed / elapsed * 3600);
      const rankInfo = minRank > 0 ? ` | rank cache: ${rankCache.size.toLocaleString()}` : "";
      console.log(`[harvest] ${rankedProcessed.toLocaleString()} ranked / ${totalFetched.toLocaleString()} total | ${calls} calls | ${Math.round(elapsed)}s | ${rate.toLocaleString()}/hr | seq ${seq}${rankInfo}`);
    }

    // Save checkpoint + optionally deploy
    if (rankedProcessed >= nextCheckpoint) {
      writeDataJson();
      console.log(`[harvest] Checkpoint at ${rankedProcessed.toLocaleString()} matches`);
      if (deploy) {
        try {
          execSync('git add public/data.json && git commit -m "data.json: ' + rankedProcessed.toLocaleString() + ' ranked matches (patch 7.41a)" && git push origin main', { stdio: "pipe", cwd: process.cwd() });
          execSync('vercel --prod --yes', { stdio: "pipe", cwd: process.cwd(), timeout: 300_000 });
          console.log(`[harvest] Deployed at ${rankedProcessed.toLocaleString()} matches`);
        } catch (e) {
          console.warn(`[harvest] Deploy failed, continuing harvest`);
        }
      }
      nextCheckpoint += checkpointEvery;
    }

    await sleep(DELAY_MS);
  }

  flushRawBuffer(); // flush remaining raw matches

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`[harvest] Done. ${rankedProcessed.toLocaleString()} ranked matches from ${totalFetched.toLocaleString()} total in ${elapsed}s (${calls} API calls)`);
  console.log(`[harvest] Accumulators: ${matchLevel.size} marginal keys, ${heroTotals.size} hero totals`);

  writeDataJson();
}

main().catch((e) => { console.error("[harvest] Fatal:", e); process.exit(1); });
