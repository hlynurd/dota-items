import {
  getHeroItemPopularity,
  getHeroMatchups,
  getItemsMap,
  topItemsFromBucket,
} from "../opendota/client";
import { getItemMarginals, getItemBaselines } from "../db/queries";
import type { ItemMarginalRow, ItemBaselineRow } from "../db/queries";
import type { OpenDotaItemsMap } from "../opendota/types";
import type {
  DraftInput,
  Hero,
  HeroBuild,
  MarginalDebugEntry,
  ItemRecommendation,
  TimingBucket,
  Confidence,
  TeamItemEntry,
  TeamItemsResult,
} from "../agent/types";

const SMOOTHING_K = 10; // lower than before (50) — marginal data is ~130x denser

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

const MIN_ITEM_COST = 2000;

function buildComponentSet(itemsMap: OpenDotaItemsMap): Set<string> {
  const components = new Set<string>();
  for (const item of Object.values(itemsMap)) {
    for (const c of item.components ?? []) components.add(c);
  }
  for (const [name, item] of Object.entries(itemsMap)) {
    if (item.components && item.components.length > 0 && item.cost >= MIN_ITEM_COST) {
      components.delete(name);
    }
  }
  return components;
}

// ─── Marginal indexes ─────────────────────────────────────────────────────────

interface WrEntry { games: number; wins: number }

// key: "item_id:context_hero_id" → { games, wins }
type MarginalIndex = Map<string, WrEntry>;
// key: "item_id" → { games, wins }
type BaselineIndex = Map<string, WrEntry>;

function buildMarginalIndex(
  rows: ItemMarginalRow[],
  side: "enemy" | "ally",
  beforeMinute: number
): MarginalIndex {
  const idx: MarginalIndex = new Map();
  for (const row of rows) {
    if (row.context_side !== side || row.before_minute !== beforeMinute) continue;
    idx.set(`${row.item_id}:${row.context_hero_id}`, { games: row.games, wins: row.wins });
  }
  return idx;
}

function buildBaselineIndex(rows: ItemBaselineRow[], beforeMinute: number): BaselineIndex {
  const idx: BaselineIndex = new Map();
  for (const row of rows) {
    if (row.before_minute !== beforeMinute) continue;
    idx.set(`${row.item_id}`, { games: row.games, wins: row.wins });
  }
  return idx;
}

// ─── Marginal scoring ─────────────────────────────────────────────────────────

function computeMarginalScore(
  itemId: number,
  heroes: Hero[],
  margIdx: MarginalIndex,
  basIdx: BaselineIndex,
  side: "enemy" | "ally",
): { score: number; totalGames: number; debug: MarginalDebugEntry[] } {
  const baseline = basIdx.get(`${itemId}`);
  const baselineWr = baseline && baseline.games > 0 ? baseline.wins / baseline.games : 0.5;

  if (heroes.length === 0) return { score: baselineWr, totalGames: 0, debug: [] };

  let totalSmoothed = 0;
  let totalGames = 0;
  const debug: MarginalDebugEntry[] = [];

  for (const hero of heroes) {
    const row = margIdx.get(`${itemId}:${hero.id}`);
    const games = row?.games ?? 0;
    const wins = row?.wins ?? 0;
    const marginalWr = games > 0 ? wins / games : baselineWr;
    const smoothed = (wins + SMOOTHING_K * baselineWr) / (games + SMOOTHING_K);

    debug.push({
      hero_id: hero.id,
      localized_name: hero.localized_name,
      side,
      games,
      wins,
      marginal_wr: Math.round(marginalWr * 1000) / 1000,
      baseline_wr: Math.round(baselineWr * 1000) / 1000,
      diff: Math.round((marginalWr - baselineWr) * 1000) / 1000,
    });

    totalSmoothed += smoothed;
    totalGames += games;
  }

  return {
    score: Math.round((totalSmoothed / heroes.length) * 1000) / 1000,
    totalGames,
    debug,
  };
}

// ─── Phase builder (marginal) ─────────────────────────────────────────────────

function buildPhaseItems(
  bucket: Record<string, number>,
  n: number,
  enemies: Hero[],
  allies: Hero[],
  enemyIdx: MarginalIndex,
  allyIdx: MarginalIndex,
  basIdx: BaselineIndex,
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
      const enemyResult = computeMarginalScore(item_id, enemies, enemyIdx, basIdx, "enemy");
      const allyResult = computeMarginalScore(item_id, allies, allyIdx, basIdx, "ally");

      // Combined: 70% enemy context, 30% ally context
      const win_rate = Math.round((0.7 * enemyResult.score + 0.3 * allyResult.score) * 1000) / 1000;
      const baseline = basIdx.get(`${item_id}`);
      const baseline_win_rate = baseline && baseline.games > 0
        ? Math.round((baseline.wins / baseline.games) * 1000) / 1000
        : 0.5;

      const avgGames = (enemyResult.totalGames + allyResult.totalGames) /
        (enemies.length + allies.length || 1);
      const confidence: Confidence = avgGames >= 100 ? "high" : avgGames >= 25 ? "medium" : "low";

      return {
        item_id,
        ...resolveItem(itemsMap, item_id),
        win_rate,
        baseline_win_rate,
        confidence,
        enemy_debug: enemyResult.debug,
        ally_debug: allyResult.debug,
      };
    })
    .sort((a, b) => b.win_rate - a.win_rate)
    .slice(0, n);
}

// ─── Per-hero analysis ────────────────────────────────────────────────────────

async function analyzeHero(
  hero: Hero,
  allies: Hero[],
  enemies: Hero[],
  itemsMap: OpenDotaItemsMap,
  marginalRows: ItemMarginalRow[],
  baselineRows: ItemBaselineRow[],
): Promise<HeroBuild> {
  const [popularity, allMatchups] = await Promise.all([
    getHeroItemPopularity(hero.id),
    getHeroMatchups(hero.id),
  ]);

  // Hero overall win rate
  const totalGames = allMatchups.reduce((s, m) => s + m.games_played, 0);
  const totalWins = allMatchups.reduce((s, m) => s + m.wins, 0);
  const overallWinRate = totalGames > 0 ? totalWins / totalGames : 0.5;

  // Hero-level matchup delta
  const pairwiseWinRates = new Map<number, number>();
  for (const enemy of enemies) {
    const matchup = allMatchups.find((m) => m.hero_id === enemy.id);
    pairwiseWinRates.set(enemy.id, matchup && matchup.games_played > 0
      ? matchup.wins / matchup.games_played : overallWinRate);
  }
  const enemyWrs = [...pairwiseWinRates.values()];
  const avgVsEnemies = enemyWrs.length > 0
    ? enemyWrs.reduce((s, w) => s + w, 0) / enemyWrs.length : overallWinRate;
  const matchupDelta = Math.round((avgVsEnemies - overallWinRate) * 1000) / 1000;

  const componentSet = buildComponentSet(itemsMap);

  // Build marginal indexes for the "999" (any time) bucket — used for phase items
  const enemyIdx999 = buildMarginalIndex(marginalRows, "enemy", 999);
  const allyIdx999 = buildMarginalIndex(marginalRows, "ally", 999);
  const basIdx999 = buildBaselineIndex(baselineRows, 999);

  const phases: HeroBuild["phases"] = {
    early:       buildPhaseItems(popularity.early_game_items,  6, enemies, allies, enemyIdx999, allyIdx999, basIdx999, itemsMap, componentSet),
    core:        buildPhaseItems(popularity.mid_game_items,    6, enemies, allies, enemyIdx999, allyIdx999, basIdx999, itemsMap, componentSet),
    situational: buildPhaseItems(popularity.late_game_items,   6, enemies, allies, enemyIdx999, allyIdx999, basIdx999, itemsMap, componentSet),
  };

  // Timing buckets
  const TIMING: { before_minute: TimingBucket["before_minute"]; bucket: Record<string, number> }[] = [
    { before_minute: 10, bucket: popularity.early_game_items },
    { before_minute: 20, bucket: popularity.early_game_items },
    { before_minute: 30, bucket: popularity.mid_game_items },
    { before_minute: 40, bucket: popularity.mid_game_items },
    { before_minute: 50, bucket: popularity.late_game_items },
  ];

  const timing_winrates: TimingBucket[] = TIMING.map(({ before_minute, bucket }) => {
    const basIdx = buildBaselineIndex(baselineRows, before_minute);
    const enemyIdx = buildMarginalIndex(marginalRows, "enemy", before_minute);

    return {
      before_minute,
      top_items: topItemsFromBucket(bucket, Infinity)
        .filter(({ item_id }) => {
          const entry = Object.entries(itemsMap).find(([, item]) => item.id === item_id);
          return entry ? !componentSet.has(entry[0]) : false;
        })
        .map(({ item_id }) => {
          const baseline = basIdx.get(`${item_id}`);
          const win_rate = baseline && baseline.games > 0
            ? Math.round((baseline.wins / baseline.games) * 1000) / 1000
            : overallWinRate;
          const overall_games = baseline?.games ?? 0;
          const { debug } = computeMarginalScore(item_id, enemies, enemyIdx, basIdx, "enemy");
          return { item_id, ...resolveItem(itemsMap, item_id), win_rate, overall_games, debug: debug as any };
        })
        .filter((item) => item.overall_games >= 3)
        .slice(0, 3),
    };
  });

  return { hero, matchup_delta: matchupDelta, phases, timing_winrates };
}

// ─── Team-level item analysis ─────────────────────────────────────────────────

function analyzeTeamItemsFromData(
  enemies: Hero[],
  itemsMap: OpenDotaItemsMap,
  marginalRows: ItemMarginalRow[],
  baselineRows: ItemBaselineRow[],
): TeamItemsResult {
  const enemyIdx = buildMarginalIndex(marginalRows, "enemy", 999);
  const basIdx = buildBaselineIndex(baselineRows, 999);
  const componentSet = buildComponentSet(itemsMap);

  // Score every item that has baseline data
  const entries: TeamItemEntry[] = [];
  for (const [key, baseline] of basIdx.entries()) {
    const item_id = parseInt(key);
    if (baseline.games < 10) continue; // skip very rare items

    const { item_name, display_name } = resolveItem(itemsMap, item_id);
    if (item_name === "unknown") continue;

    // Check component filter
    const entry = Object.entries(itemsMap).find(([, item]) => item.id === item_id);
    if (entry && componentSet.has(entry[0])) continue;

    const baselineWr = baseline.wins / baseline.games;
    const { score, totalGames, debug } = computeMarginalScore(
      item_id, enemies, enemyIdx, basIdx, "enemy"
    );

    entries.push({
      item_id,
      item_name,
      display_name,
      baseline_wr: Math.round(baselineWr * 1000) / 1000,
      lineup_wr: score,
      lift: Math.round((score - baselineWr) * 1000) / 1000,
      games: enemies.length > 0 ? Math.round(totalGames / enemies.length) : 0,
      enemy_breakdown: debug,
    });
  }

  const byWinrate = [...entries].sort((a, b) => b.lineup_wr - a.lineup_wr).slice(0, 15);
  const byLift = [...entries].sort((a, b) => b.lift - a.lift).slice(0, 15);

  return { top_by_winrate: byWinrate, top_by_lift: byLift };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function analyzeDraft(
  draft: DraftInput
): Promise<{ builds: HeroBuild[]; teamItems: TeamItemsResult | null }> {
  const allHeroes = [...draft.radiant, ...draft.dire];
  const allHeroIds = allHeroes.map((h) => h.id);

  // Fetch shared data ONCE for the entire draft
  const [itemsMap, marginalRows, baselineRows] = await Promise.all([
    getItemsMap(),
    getItemMarginals(allHeroIds),
    getItemBaselines(),
  ]);

  const builds = await Promise.all(
    allHeroes.map((hero) => {
      const isRadiant = draft.radiant.some((h) => h.id === hero.id);
      const enemies = isRadiant ? draft.dire : draft.radiant;
      const allies = (isRadiant ? draft.radiant : draft.dire).filter((h) => h.id !== hero.id);
      return analyzeHero(hero, allies, enemies, itemsMap, marginalRows, baselineRows);
    })
  );

  // Team-level item analysis (use radiant's perspective — enemies = dire)
  const teamItems = draft.dire.length > 0
    ? analyzeTeamItemsFromData(draft.dire, itemsMap, marginalRows, baselineRows)
    : null;

  return { builds, teamItems };
}
