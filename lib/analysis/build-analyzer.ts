import {
  getHeroItemPopularity,
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

// ─── Smoothing ────────────────────────────────────────────────────────────────

// Pseudo-count for Bayesian smoothing toward the pairwise win rate.
// With K=50: an item with 0 games vs enemy E gets exactly the pairwise win rate;
// with 50 real games it's a 50/50 blend; with 200+ games real data dominates.
const SMOOTHING_K = 50;

/**
 * Compute a matchup-adjusted win rate for `itemId` when `hero` plays vs `enemies`.
 *
 * Method: independence decomposition (Naive Bayes assumption).
 * For each enemy ei:
 *   smoothed_wr(item, ei) = (wins_vs_ei + K × pairwise_wr(hero, ei)) / (games_vs_ei + K)
 * lineup_score = mean over all enemies of smoothed_wr
 *
 * When games_vs_ei = 0 the score falls back to pairwise_wr(hero, ei).
 * When pairwise data is also absent it falls back to 0.5.
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
 * Take the top 20 most-popular items in a phase bucket, re-rank them by
 * matchup-adjusted win rate, return the top n.
 */
function buildPhaseItems(
  bucket: Record<string, number>,
  n: number,
  enemies: Hero[],
  explorerData: Map<number, Map<number, ExplorerItemRow>>,
  pairwiseWinRates: Map<number, number>,
  itemsMap: OpenDotaItemsMap
): ItemRecommendation[] {
  const candidates = topItemsFromBucket(bucket, 20);

  return candidates
    .map(({ item_id }) => {
      const { win_rate, confidence, debug } = computeLineupScore(
        item_id, enemies, explorerData, pairwiseWinRates
      );
      return { item_id, ...resolveItem(itemsMap, item_id), win_rate, confidence, debug };
    })
    .sort((a, b) => b.win_rate - a.win_rate)
    .slice(0, n);
}

// ─── Timing buckets (popularity-based, not matchup-adjusted) ─────────────────

function rankToWinRate(rank: number, total: number, overallWinRate: number): number {
  const t = total > 1 ? rank / (total - 1) : 0.5;
  return Math.round((overallWinRate + 0.03 * (1 - 2 * t)) * 1000) / 1000;
}

// ─── Per-hero analysis ────────────────────────────────────────────────────────

async function analyzeHero(
  hero: Hero,
  enemies: Hero[],
  itemsMap: OpenDotaItemsMap
): Promise<HeroBuild> {
  // Fetch base data and per-enemy explorer data in parallel
  const [popularity, allMatchups, explorerByEnemyArr] = await Promise.all([
    getHeroItemPopularity(hero.id),
    getHeroMatchups(hero.id),
    Promise.all(
      enemies.map((enemy) =>
        getItemWinRatesVsEnemy(hero.id, enemy.id).then((rows) => ({ enemyId: enemy.id, rows }))
      )
    ),
  ]);

  // Build item lookup: enemyId → itemId → ExplorerItemRow
  const explorerData = new Map<number, Map<number, ExplorerItemRow>>();
  for (const { enemyId, rows } of explorerByEnemyArr) {
    const itemMap = new Map<number, ExplorerItemRow>();
    for (const row of rows) itemMap.set(row.item_id, row);
    explorerData.set(enemyId, itemMap);
  }

  // Overall win rate from matchup data
  const totalGames = allMatchups.reduce((s, m) => s + m.games_played, 0);
  const totalWins = allMatchups.reduce((s, m) => s + m.wins, 0);
  const overallWinRate = totalGames > 0 ? totalWins / totalGames : 0.5;

  // Pairwise win rate vs each enemy (used as smoothing prior)
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

  // Phase items: popularity-seeded, matchup-reranked
  const phases: HeroBuild["phases"] = {
    starting:    buildPhaseItems(popularity.start_game_items,  6, enemies, explorerData, pairwiseWinRates, itemsMap),
    early:       buildPhaseItems(popularity.early_game_items,  6, enemies, explorerData, pairwiseWinRates, itemsMap),
    core:        buildPhaseItems(popularity.mid_game_items,    6, enemies, explorerData, pairwiseWinRates, itemsMap),
    situational: buildPhaseItems(popularity.late_game_items,   6, enemies, explorerData, pairwiseWinRates, itemsMap),
  };

  // Timing buckets: popularity-only (phase-assignment aid, not matchup-specific)
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
    top_items: topItemsFromBucket(bucket, 3).map(({ item_id }, rank) => ({
      item_id,
      ...resolveItem(itemsMap, item_id),
      win_rate: rankToWinRate(rank, 3, overallWinRate),
    })),
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
