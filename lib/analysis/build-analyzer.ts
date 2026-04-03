import {
  getHeroItemPopularity,
  getHeroMatchups,
  getItemsMap,
  topItemsFromBucket,
} from "../opendota/client";
import { getItemWinRatesForHero } from "../db/queries";
import type { ItemWinRateRow } from "../db/queries";
import type { OpenDotaItemsMap } from "../opendota/types";
import type {
  DraftInput,
  Hero,
  HeroBuild,
  ItemDebugEntry,
  ItemRecommendation,
  TimingBucket,
  Confidence,
} from "../agent/types";

const OVERALL_SENTINEL = -1;
const SMOOTHING_K = 50;

// ─── Item resolution ──────────────────────────────────────────────────────────

function resolveItem(
  itemsMap: OpenDotaItemsMap,
  item_id: number
): { item_name: string; display_name: string } {
  const entry = Object.entries(itemsMap).find(([, item]) => item.id === item_id);
  return {
    item_name: entry?.[0] ?? "unknown",
    display_name: entry?.[1]?.dname ?? "Unknown",
  };
}

const MIN_ITEM_COST = 2000; // items below this that are components are always upgraded

function buildComponentSet(itemsMap: OpenDotaItemsMap): Set<string> {
  // Collect every item name that appears as a component of another item
  const components = new Set<string>();
  for (const item of Object.values(itemsMap)) {
    for (const c of item.components ?? []) components.add(c);
  }
  // Keep items that are crafted (have components) AND cost >= 2000 gold.
  // Cheap intermediates like Perseverance (1700), Buckler (200), Oblivion Staff (1500)
  // are always upgraded and should stay filtered. Real items like Eul's (2625),
  // Shadow Blade (3000), Maelstrom (2700) are kept.
  for (const [name, item] of Object.entries(itemsMap)) {
    if (item.components && item.components.length > 0 && item.cost >= MIN_ITEM_COST) {
      components.delete(name);
    }
  }
  return components;
}

// ─── Win rate index ───────────────────────────────────────────────────────────

// Organise DB rows into fast lookup structures:
//   overallByItem: itemId → { games, wins } (opponent_hero_id = -1)
//   vsEnemyByItem: enemyId → itemId → { games, wins }
interface WrEntry { games: number; wins: number }

function buildWrIndex(rows: ItemWinRateRow[], enemies: Hero[], beforeMinute: number) {
  const overallByItem = new Map<number, WrEntry>();
  const vsEnemyByItem = new Map<number, Map<number, WrEntry>>();

  for (const enemy of enemies) vsEnemyByItem.set(enemy.id, new Map());

  for (const row of rows) {
    if (row.before_minute !== beforeMinute) continue;
    if (row.opponent_hero_id === OVERALL_SENTINEL) {
      overallByItem.set(row.item_id, { games: row.games, wins: row.wins });
    } else {
      vsEnemyByItem.get(row.opponent_hero_id)?.set(row.item_id, { games: row.games, wins: row.wins });
    }
  }

  return { overallByItem, vsEnemyByItem };
}

// ─── Smoothed lineup score ────────────────────────────────────────────────────

function computeLineupScore(
  itemId: number,
  enemies: Hero[],
  vsEnemyByItem: Map<number, Map<number, WrEntry>>,
  pairwiseWinRates: Map<number, number>
): { win_rate: number; confidence: Confidence; debug: ItemDebugEntry[] } {
  if (enemies.length === 0) return { win_rate: 0.5, confidence: "low", debug: [] };

  let totalSmoothed = 0;
  let totalGames = 0;
  const debug: ItemDebugEntry[] = [];

  for (const enemy of enemies) {
    const row = vsEnemyByItem.get(enemy.id)?.get(itemId);
    const games = row?.games ?? 0;
    const wins = row?.wins ?? 0;
    const pairwiseWr = pairwiseWinRates.get(enemy.id) ?? 0.5;
    const smoothed_wr = (wins + SMOOTHING_K * pairwiseWr) / (games + SMOOTHING_K);

    debug.push({ hero_id: enemy.id, localized_name: enemy.localized_name, games, wins, smoothed_wr });
    totalSmoothed += smoothed_wr;
    totalGames += games;
  }

  const win_rate = Math.round((totalSmoothed / enemies.length) * 1000) / 1000;
  const avgGames = totalGames / enemies.length;
  const confidence: Confidence = avgGames >= 100 ? "high" : avgGames >= 25 ? "medium" : "low";

  return { win_rate, confidence, debug };
}

// ─── Phase builder ────────────────────────────────────────────────────────────

function buildPhaseItems(
  bucket: Record<string, number>,
  n: number,
  enemies: Hero[],
  vsEnemyByItem: Map<number, Map<number, WrEntry>>,
  overallByItem: Map<number, WrEntry>,
  pairwiseWinRates: Map<number, number>,
  itemsMap: OpenDotaItemsMap,
  componentSet: Set<string>
): ItemRecommendation[] {
  const candidates = topItemsFromBucket(bucket, Infinity);

  return candidates
    .map((c) => c.item_id)
    .filter((item_id) => {
      const entry = Object.entries(itemsMap).find(([, item]) => item.id === item_id);
      return entry ? !componentSet.has(entry[0]) : false;
    })
    .map((item_id) => {
      const { win_rate, confidence, debug } = computeLineupScore(
        item_id, enemies, vsEnemyByItem, pairwiseWinRates
      );
      const overall = overallByItem.get(item_id);
      const overall_win_rate = overall && overall.games > 0
        ? Math.round((overall.wins / overall.games) * 1000) / 1000
        : win_rate;
      return { item_id, ...resolveItem(itemsMap, item_id), win_rate, overall_win_rate, confidence, debug };
    })
    .sort((a, b) => b.win_rate - a.win_rate)
    .slice(0, n);
}

// ─── Per-hero analysis ────────────────────────────────────────────────────────

async function analyzeHero(
  hero: Hero,
  enemies: Hero[],
  itemsMap: OpenDotaItemsMap
): Promise<HeroBuild> {
  const [popularity, allMatchups, dbRows] = await Promise.all([
    getHeroItemPopularity(hero.id),
    getHeroMatchups(hero.id),
    getItemWinRatesForHero(hero.id, enemies.map((e) => e.id)),
  ]);

  // Hero overall win rate from matchup aggregates (pairwise vs everyone)
  const totalGames = allMatchups.reduce((s, m) => s + m.games_played, 0);
  const totalWins = allMatchups.reduce((s, m) => s + m.wins, 0);
  const overallWinRate = totalGames > 0 ? totalWins / totalGames : 0.5;

  // Pairwise win rate per enemy (smoothing prior)
  const pairwiseWinRates = new Map<number, number>();
  for (const enemy of enemies) {
    const matchup = allMatchups.find((m) => m.hero_id === enemy.id);
    const wr = matchup && matchup.games_played > 0
      ? matchup.wins / matchup.games_played
      : overallWinRate;
    pairwiseWinRates.set(enemy.id, wr);
  }

  // Hero-level matchup delta (shown in card header)
  const enemyWrs = [...pairwiseWinRates.values()];
  const avgVsEnemies = enemyWrs.length > 0
    ? enemyWrs.reduce((s, w) => s + w, 0) / enemyWrs.length
    : overallWinRate;
  const matchupDelta = Math.round((avgVsEnemies - overallWinRate) * 1000) / 1000;

  const componentSet = buildComponentSet(itemsMap);

  // Phase items use the "999" (any time) bucket — broadest sample
  const { overallByItem: overallAny, vsEnemyByItem: vsEnemyAny } =
    buildWrIndex(dbRows, enemies, 999);

  const phases: HeroBuild["phases"] = {
    early:       buildPhaseItems(popularity.early_game_items,  6, enemies, vsEnemyAny, overallAny, pairwiseWinRates, itemsMap, componentSet),
    core:        buildPhaseItems(popularity.mid_game_items,    6, enemies, vsEnemyAny, overallAny, pairwiseWinRates, itemsMap, componentSet),
    situational: buildPhaseItems(popularity.late_game_items,   6, enemies, vsEnemyAny, overallAny, pairwiseWinRates, itemsMap, componentSet),
  };

  // Timing buckets use per-bucket win rates
  const TIMING: { before_minute: TimingBucket["before_minute"]; bucket: Record<string, number> }[] = [
    { before_minute: 10, bucket: popularity.early_game_items },
    { before_minute: 20, bucket: popularity.early_game_items },
    { before_minute: 30, bucket: popularity.mid_game_items },
    { before_minute: 40, bucket: popularity.mid_game_items },
    { before_minute: 50, bucket: popularity.late_game_items },
  ];

  const timing_winrates: TimingBucket[] = TIMING.map(({ before_minute, bucket }) => {
    const { overallByItem, vsEnemyByItem } = buildWrIndex(dbRows, enemies, before_minute);

    return {
      before_minute,
      top_items: topItemsFromBucket(bucket, Infinity)
        .filter(({ item_id }) => {
          const entry = Object.entries(itemsMap).find(([, item]) => item.id === item_id);
          return entry ? !componentSet.has(entry[0]) : false;
        })
        .map(({ item_id }) => {
          const overall = overallByItem.get(item_id);
          const win_rate = overall && overall.games > 0
            ? Math.round((overall.wins / overall.games) * 1000) / 1000
            : overallWinRate;
          const overall_games = overall?.games ?? 0;
          const { debug } = computeLineupScore(item_id, enemies, vsEnemyByItem, pairwiseWinRates);
          return { item_id, ...resolveItem(itemsMap, item_id), win_rate, overall_games, debug };
        })
        .filter((item) => item.overall_games >= 3) // skip 1-game 100% noise
        .slice(0, 3),
    };
  });

  return { hero, matchup_delta: matchupDelta, phases, timing_winrates };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function analyzeDraft(draft: DraftInput): Promise<HeroBuild[]> {
  const allHeroes = [...draft.radiant, ...draft.dire];
  const itemsMap = await getItemsMap();

  return Promise.all(
    allHeroes.map((hero) => {
      const isRadiant = draft.radiant.some((h) => h.id === hero.id);
      const enemies = isRadiant ? draft.dire : draft.radiant;
      return analyzeHero(hero, enemies, itemsMap);
    })
  );
}
