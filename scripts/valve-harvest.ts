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

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const STEAM_KEY = process.env.STEAM_API_KEY ?? "";
if (!STEAM_KEY) { console.error("STEAM_API_KEY not set"); process.exit(1); }

const API_URL = "https://api.steampowered.com/IDOTA2Match_570/GetMatchHistoryBySequenceNum/v1/";
const MATCHES_PER_CALL = 100;
const DELAY_MS = 4000; // ~15 calls/min — conservative to avoid 429s

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

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  let maxMatches = 500_000;
  let startSeq = 7_350_000_000; // patch 7.41a (March 27, 2026): Largo, Consecrated Wraps, Crella's Crozier
  let merge = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--max" && args[i + 1]) maxMatches = parseInt(args[i + 1]);
    if (args[i] === "--seq" && args[i + 1]) startSeq = parseInt(args[i + 1]);
    if (args[i] === "--merge") merge = true;
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

  console.log(`[harvest] Starting from seq ${startSeq}, target ${maxMatches} ranked matches`);
  console.log(`[harvest] Est. time: ${Math.round(maxMatches / 360_000 * 60)} min (assuming ~30% ranked yield)`);

  let seq = startSeq;
  let totalFetched = 0;
  let rankedProcessed = 0;
  let calls = 0;
  let emptyStreak = 0;
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

      processMatch(match);
      rankedProcessed++;
    }

    if (calls % 100 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = Math.round(rankedProcessed / elapsed * 3600);
      console.log(`[harvest] ${rankedProcessed.toLocaleString()} ranked / ${totalFetched.toLocaleString()} total | ${calls} calls | ${Math.round(elapsed)}s | ${rate.toLocaleString()}/hr | seq ${seq}`);
    }

    // Save checkpoint every 50K processed matches
    if (rankedProcessed > 0 && rankedProcessed % 50_000 === 0) {
      writeDataJson();
      console.log(`[harvest] Checkpoint saved at ${rankedProcessed.toLocaleString()} matches`);
    }

    await sleep(DELAY_MS);
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`[harvest] Done. ${rankedProcessed.toLocaleString()} ranked matches from ${totalFetched.toLocaleString()} total in ${elapsed}s (${calls} API calls)`);
  console.log(`[harvest] Accumulators: ${matchLevel.size} marginal keys, ${heroTotals.size} hero totals`);

  writeDataJson();
}

main().catch((e) => { console.error("[harvest] Fatal:", e); process.exit(1); });
