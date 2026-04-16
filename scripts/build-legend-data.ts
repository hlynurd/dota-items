/**
 * Build data-legend.json from NDJSON rows that have rank tags (k >= 50).
 * Same format as data.json but only from Legend+ matches.
 *
 * Usage: npx tsx scripts/build-legend-data.ts
 */

import { readFileSync, writeFileSync, createReadStream } from "fs";
import { join } from "path";
import { createInterface } from "readline";

const NDJSON_PATH = join(process.cwd(), "data", "matches.ndjson");
const OUTPUT_PATH = join(process.cwd(), "public", "data-legend.json");
const MIN_RANK = 50; // Legend = 50, Ancient = 60, Divine = 70

// Same excluded items as valve-harvest.ts
const EXCLUDED_ITEM_IDS = new Set([
  0, 44, 39, 38, 46, 216, 188, 42, 43, 218, 257, 33, 237,
]);

function isRelevantItem(id: number): boolean {
  return !EXCLUDED_ITEM_IDS.has(id);
}

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

interface NdjsonRow {
  m: number;
  w: number;
  s: number;
  r: [number, number[]][];
  e: [number, number[]][];
  k?: number;
}

async function main() {
  console.log(`[build-legend] Reading ${NDJSON_PATH}...`);

  const rl = createInterface({ input: createReadStream(NDJSON_PATH), crlfDelay: Infinity });
  let total = 0;
  let legendCount = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    total++;
    const row: NdjsonRow = JSON.parse(line);
    if (!row.k || row.k < MIN_RANK) continue;
    legendCount++;

    const radiantWon = row.w === 1;
    const radiantHeroes = row.r.map(p => p[0]);
    const direHeroes = row.e.map(p => p[0]);

    if (radiantHeroes.length !== 5 || direHeroes.length !== 5) continue;

    // Build item maps (same logic as valve-harvest.ts processMatch)
    const radiantItems = new Map<number, Set<number>>();
    const direItems = new Map<number, Set<number>>();

    for (const [hero_id, items] of row.r) {
      for (const item_id of items.filter(isRelevantItem)) {
        let buyers = radiantItems.get(item_id);
        if (!buyers) { buyers = new Set(); radiantItems.set(item_id, buyers); }
        buyers.add(hero_id);
      }
    }
    for (const [hero_id, items] of row.e) {
      for (const item_id of items.filter(isRelevantItem)) {
        let buyers = direItems.get(item_id);
        if (!buyers) { buyers = new Set(); direItems.set(item_id, buyers); }
        buyers.add(hero_id);
      }
    }

    // Hero totals
    for (const hero of radiantHeroes) {
      bumpTotal(`${hero}:enemy`, !radiantWon);
      bumpTotal(`${hero}:ally`, radiantWon);
    }
    for (const hero of direHeroes) {
      bumpTotal(`${hero}:enemy`, radiantWon);
      bumpTotal(`${hero}:ally`, !radiantWon);
    }

    // Radiant items
    for (const [item_id, buyers] of radiantItems) {
      for (const enemy of direHeroes) {
        bumpMatch(`${item_id}:${enemy}:enemy`, radiantWon);
      }
      for (const ally of radiantHeroes) {
        if (!buyers.has(ally)) {
          bumpMatch(`${item_id}:${ally}:ally`, radiantWon);
        }
      }
    }

    // Dire items
    for (const [item_id, buyers] of direItems) {
      for (const enemy of radiantHeroes) {
        bumpMatch(`${item_id}:${enemy}:enemy`, !radiantWon);
      }
      for (const ally of direHeroes) {
        if (!buyers.has(ally)) {
          bumpMatch(`${item_id}:${ally}:ally`, !radiantWon);
        }
      }
    }
  }

  console.log(`[build-legend] Processed ${total.toLocaleString()} total, ${legendCount.toLocaleString()} Legend+ matches`);

  // Write output in same format as data.json
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
  writeFileSync(OUTPUT_PATH, JSON.stringify(staticData));
  const sizeKB = Math.round(JSON.stringify(staticData).length / 1024);
  console.log(`[build-legend] Wrote ${OUTPUT_PATH}: ${jsonMarginals.length} marginals, ${jsonTotals.length} totals (${sizeKB} KB)`);
}

main().catch((e) => { console.error("[build-legend] Fatal:", e); process.exit(1); });
