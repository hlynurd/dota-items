import {
  getHeroItemPopularity,
  getHeroMatchups,
  getItemsMap,
  topItemsFromBucket,
} from "../opendota/client";
import type { OpenDotaItemsMap } from "../opendota/types";
import type {
  DraftInput,
  Hero,
  HeroBuild,
  ItemRecommendation,
  TimingBucket,
  Confidence,
} from "../agent/types";

// ─── Item resolution helpers ─────────────────────────────────────────────────

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

// ─── Win rate helpers ────────────────────────────────────────────────────────

/**
 * Assign a base win rate for an item based on its rank within a phase.
 * We don't have per-item win rate data from OpenDota without SQL queries,
 * so we distribute around the hero's overall win rate:
 *   rank 0 (most popular) → overall_win_rate + 0.03
 *   rank n-1 (least popular) → overall_win_rate - 0.03
 */
function rankToBaseWinRate(
  rank: number,
  totalInPhase: number,
  heroOverallWinRate: number
): number {
  const t = totalInPhase > 1 ? rank / (totalInPhase - 1) : 0.5;
  const bonus = 0.03 * (1 - 2 * t);
  return Math.round((heroOverallWinRate + bonus) * 1000) / 1000;
}

function rankToConfidence(rank: number): Confidence {
  if (rank < 3) return "high";
  if (rank < 7) return "medium";
  return "low";
}

// ─── Phase builder ───────────────────────────────────────────────────────────

function buildPhaseItems(
  bucket: Record<string, number>,
  n: number,
  heroOverallWinRate: number,
  matchupDelta: number,
  itemsMap: OpenDotaItemsMap
): ItemRecommendation[] {
  const ranked = topItemsFromBucket(bucket, n);
  return ranked.map(({ item_id }, rank) => ({
    item_id,
    ...resolveItem(itemsMap, item_id),
    base_win_rate: rankToBaseWinRate(rank, ranked.length, heroOverallWinRate),
    matchup_delta: matchupDelta,
    confidence: rankToConfidence(rank),
  }));
}

// ─── Per-hero analysis ───────────────────────────────────────────────────────

async function analyzeHero(
  hero: Hero,
  enemies: Hero[],
  itemsMap: OpenDotaItemsMap
): Promise<HeroBuild> {
  const [popularity, allMatchups] = await Promise.all([
    getHeroItemPopularity(hero.id),
    getHeroMatchups(hero.id),
  ]);

  // Overall win rate across all matchups
  const totalGames = allMatchups.reduce((s, m) => s + m.games_played, 0);
  const totalWins = allMatchups.reduce((s, m) => s + m.wins, 0);
  const overallWinRate = totalGames > 0 ? totalWins / totalGames : 0.5;

  // Win rate specifically vs the enemies in this draft
  const enemyIds = new Set(enemies.map((e) => e.id));
  const vsEnemies = allMatchups.filter((m) => enemyIds.has(m.hero_id));
  const avgVsEnemies =
    vsEnemies.length > 0
      ? vsEnemies.reduce(
          (s, m) => s + (m.games_played > 0 ? m.wins / m.games_played : 0.5),
          0
        ) / vsEnemies.length
      : overallWinRate;

  const matchupDelta = Math.round((avgVsEnemies - overallWinRate) * 1000) / 1000;

  // Build item phases
  const phases: HeroBuild["phases"] = {
    starting: buildPhaseItems(
      popularity.start_game_items, 6, overallWinRate, matchupDelta, itemsMap
    ),
    early: buildPhaseItems(
      popularity.early_game_items, 6, overallWinRate, matchupDelta, itemsMap
    ),
    core: buildPhaseItems(
      popularity.mid_game_items, 6, overallWinRate, matchupDelta, itemsMap
    ),
    situational: buildPhaseItems(
      popularity.late_game_items, 6, overallWinRate, matchupDelta, itemsMap
    ),
  };

  // Timing buckets — map each minute window to the appropriate phase data
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
      base_win_rate: rankToBaseWinRate(rank, 3, overallWinRate),
      matchup_delta: matchupDelta,
    })),
  }));

  return { hero, phases, timing_winrates };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Analyze all heroes in the draft in parallel.
 * Returns builds in the same order as [...radiant, ...dire].
 */
export async function analyzeDraft(draft: DraftInput): Promise<HeroBuild[]> {
  const allHeroes = [...draft.radiant, ...draft.dire];

  // Fetch items map once, shared across all hero analyses
  const itemsMap = await getItemsMap();

  return Promise.all(
    allHeroes.map((hero) => {
      const isRadiant = draft.radiant.some((h) => h.id === hero.id);
      const enemies = isRadiant ? draft.dire : draft.radiant;
      return analyzeHero(hero, enemies, itemsMap);
    })
  );
}
