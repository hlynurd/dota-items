import {
  getHeroItemPopularity,
  getHeroItemWinRates,
  getHeroMatchups,
  getItemWinRatesVsEnemy,
  getItemsMap,
  topItemsFromBucket,
} from "../opendota/client";
import type { ExplorerItemRow, OpenDotaItemsMap } from "../opendota/types";
import type {
  DraftInput,
  Hero,
  HeroBuild,
  ItemDebugEntry,
  ItemRecommendation,
  TimingBucket,
  Confidence,
} from "../agent/types";

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

/**
 * Build a set of item names that appear as a component of any other item.
 * These are "partial" items (Void Stone, Chainmail, etc.) and should be
 * excluded from recommendations — we only want completed items.
 */
function buildComponentSet(itemsMap: OpenDotaItemsMap): Set<string> {
  const components = new Set<string>();
  for (const item of Object.values(itemsMap)) {
    for (const c of item.components ?? []) components.add(c);
  }
  return components;
}

// ─── Smoothing ────────────────────────────────────────────────────────────────

// K=50: with 0 real games vs enemy → pure pairwise fallback.
// With 50 games → 50/50 blend. With 200+ → real data dominates.
const SMOOTHING_K = 50;

/**
 * Compute smoothed lineup win rate for an item and return per-enemy debug entries.
 * For each enemy ei:
 *   smoothed_wr = (wins_vs_ei + K × pairwise_wr(hero, ei)) / (games_vs_ei + K)
 * lineup_score = mean of smoothed_wr across all enemies
 */
function computeLineupScore(
  itemId: number,
  enemies: Hero[],
  explorerData: Map<number, Map<number, ExplorerItemRow>>,
  pairwiseWinRates: Map<number, number>
): { win_rate: number; confidence: Confidence; debug: ItemDebugEntry[] } {
  if (enemies.length === 0) {
    return { win_rate: 0.5, confidence: "low", debug: [] };
  }

  let totalSmoothed = 0;
  let totalGames = 0;
  const debug: ItemDebugEntry[] = [];

  for (const enemy of enemies) {
    const row = explorerData.get(enemy.id)?.get(itemId);
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

/**
 * Score ALL items in the phase popularity bucket by matchup-adjusted win rate,
 * return the top n sorted by win_rate descending.
 * overall_win_rate is looked up from the unconditional explorer data.
 */
function buildPhaseItems(
  bucket: Record<string, number>,
  n: number,
  enemies: Hero[],
  explorerData: Map<number, Map<number, ExplorerItemRow>>,
  pairwiseWinRates: Map<number, number>,
  overallWinRates: Map<number, ExplorerItemRow>,
  itemsMap: OpenDotaItemsMap,
  componentSet: Set<string>
): ItemRecommendation[] {
  // Use ALL items in the bucket, not just top-N — broader coverage
  const candidates = topItemsFromBucket(bucket, Infinity);

  return candidates
    .filter(({ item_id }) => {
      const entry = Object.entries(itemsMap).find(([, item]) => item.id === item_id);
      if (!entry) return false;
      // Drop items that are components of other items (Void Stone, Chainmail, etc.)
      return !componentSet.has(entry[0]);
    })
    .map(({ item_id }) => {
      const { win_rate, confidence, debug } = computeLineupScore(
        item_id, enemies, explorerData, pairwiseWinRates
      );
      const overall = overallWinRates.get(item_id);
      const overall_win_rate = overall && overall.games > 0
        ? Math.round((overall.wins / overall.games) * 1000) / 1000
        : win_rate; // fallback: treat overall same as lineup (diff = 0)
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
  // Fetch all data in parallel
  const [popularity, allMatchups, overallRows, explorerByEnemyArr] = await Promise.all([
    getHeroItemPopularity(hero.id),
    getHeroMatchups(hero.id),
    getHeroItemWinRates(hero.id),
    Promise.all(
      enemies.map((enemy) =>
        getItemWinRatesVsEnemy(hero.id, enemy.id).then((rows) => ({ enemyId: enemy.id, rows }))
      )
    ),
  ]);

  // Overall (unconditional) win rate map: itemId → ExplorerItemRow
  const overallWinRates = new Map<number, ExplorerItemRow>();
  for (const row of overallRows) overallWinRates.set(row.item_id, row);

  // Per-enemy item lookup: enemyId → itemId → ExplorerItemRow
  const explorerData = new Map<number, Map<number, ExplorerItemRow>>();
  for (const { enemyId, rows } of explorerByEnemyArr) {
    const itemMap = new Map<number, ExplorerItemRow>();
    for (const row of rows) itemMap.set(row.item_id, row);
    explorerData.set(enemyId, itemMap);
  }

  // Hero overall win rate from matchup aggregates
  const totalGames = allMatchups.reduce((s, m) => s + m.games_played, 0);
  const totalWins = allMatchups.reduce((s, m) => s + m.wins, 0);
  const overallWinRate = totalGames > 0 ? totalWins / totalGames : 0.5;

  // Pairwise win rate per enemy (Bayesian prior for smoothing)
  const pairwiseWinRates = new Map<number, number>();
  for (const enemy of enemies) {
    const matchup = allMatchups.find((m) => m.hero_id === enemy.id);
    const wr = matchup && matchup.games_played > 0 ? matchup.wins / matchup.games_played : overallWinRate;
    pairwiseWinRates.set(enemy.id, wr);
  }

  // Hero-level matchup delta (shown in card header)
  const enemyWrs = [...pairwiseWinRates.values()];
  const avgVsEnemies = enemyWrs.length > 0 ? enemyWrs.reduce((s, w) => s + w, 0) / enemyWrs.length : overallWinRate;
  const matchupDelta = Math.round((avgVsEnemies - overallWinRate) * 1000) / 1000;

  const componentSet = buildComponentSet(itemsMap);

  // Phase items: all candidates in popularity bucket, re-ranked by lineup win rate
  const phases: HeroBuild["phases"] = {
    early:       buildPhaseItems(popularity.early_game_items,  6, enemies, explorerData, pairwiseWinRates, overallWinRates, itemsMap, componentSet),
    core:        buildPhaseItems(popularity.mid_game_items,    6, enemies, explorerData, pairwiseWinRates, overallWinRates, itemsMap, componentSet),
    situational: buildPhaseItems(popularity.late_game_items,   6, enemies, explorerData, pairwiseWinRates, overallWinRates, itemsMap, componentSet),
  };

  // Timing buckets: real overall win rates + per-enemy debug
  const TIMING: { before_minute: TimingBucket["before_minute"]; bucket: Record<string, number> }[] = [
    { before_minute: 5,  bucket: popularity.start_game_items },
    { before_minute: 10, bucket: popularity.early_game_items },
    { before_minute: 20, bucket: popularity.early_game_items },
    { before_minute: 30, bucket: popularity.mid_game_items },
    { before_minute: 40, bucket: popularity.mid_game_items },
    { before_minute: 50, bucket: popularity.late_game_items },
  ];

  const timing_winrates: TimingBucket[] = TIMING.map(({ before_minute, bucket }) => ({
    before_minute,
    top_items: topItemsFromBucket(bucket, Infinity)
      .filter(({ item_id }) => {
        const entry = Object.entries(itemsMap).find(([, item]) => item.id === item_id);
        return entry ? !componentSet.has(entry[0]) : false;
      })
      .slice(0, 3)
      .map(({ item_id }) => {
      const overall = overallWinRates.get(item_id);
      const win_rate = overall && overall.games > 0
        ? Math.round((overall.wins / overall.games) * 1000) / 1000
        : overallWinRate;
      const overall_games = overall?.games ?? 0;
      const { debug } = computeLineupScore(item_id, enemies, explorerData, pairwiseWinRates);
      return { item_id, ...resolveItem(itemsMap, item_id), win_rate, overall_games, debug };
    }),
  }));

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
