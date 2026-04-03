/**
 * DB-backed queries for the analyze pipeline.
 * Reads from pre-aggregated item_win_rates (hero-specific, legacy)
 * and the new marginal/baseline tables.
 */

import { db } from "./client";
import { item_win_rates, item_marginal_win_rates, item_baseline_win_rates } from "./schema";
import { eq, inArray, or, and } from "drizzle-orm";

// ─── Legacy hero-specific queries ────────────────────────────────────────────

export interface ItemWinRateRow {
  item_id: number;
  opponent_hero_id: number; // -1 = overall baseline
  before_minute: number;
  games: number;
  wins: number;
}

const OVERALL_SENTINEL = -1;

export async function getItemWinRatesForHero(
  heroId: number,
  enemyHeroIds: number[]
): Promise<ItemWinRateRow[]> {
  const opponentFilter = [OVERALL_SENTINEL, ...enemyHeroIds];

  const rows = await db
    .select({
      item_id: item_win_rates.item_id,
      opponent_hero_id: item_win_rates.opponent_hero_id,
      before_minute: item_win_rates.before_minute,
      games: item_win_rates.games,
      wins: item_win_rates.wins,
    })
    .from(item_win_rates)
    .where(
      and(
        eq(item_win_rates.hero_id, heroId),
        inArray(item_win_rates.opponent_hero_id, opponentFilter)
      )
    );

  return rows;
}

// ─── Marginal queries ────────────────────────────────────────────────────────

export interface ItemMarginalRow {
  item_id: number;
  context_hero_id: number;
  context_side: string; // 'enemy' | 'ally'
  before_minute: number;
  games: number;
  wins: number;
}

export interface ItemBaselineRow {
  item_id: number;
  before_minute: number;
  games: number;
  wins: number;
}

/**
 * Fetch marginal win rates for all items conditioned on the given context heroes.
 * One query serves the entire draft (not per-hero).
 */
export async function getItemMarginals(
  contextHeroIds: number[]
): Promise<ItemMarginalRow[]> {
  return db
    .select({
      item_id: item_marginal_win_rates.item_id,
      context_hero_id: item_marginal_win_rates.context_hero_id,
      context_side: item_marginal_win_rates.context_side,
      before_minute: item_marginal_win_rates.before_minute,
      games: item_marginal_win_rates.games,
      wins: item_marginal_win_rates.wins,
    })
    .from(item_marginal_win_rates)
    .where(inArray(item_marginal_win_rates.context_hero_id, contextHeroIds));
}

/**
 * Fetch all baseline (unconditional) item win rates.
 * Small table (~items × 6 buckets), so fetch all.
 */
export async function getItemBaselines(): Promise<ItemBaselineRow[]> {
  return db
    .select({
      item_id: item_baseline_win_rates.item_id,
      before_minute: item_baseline_win_rates.before_minute,
      games: item_baseline_win_rates.games,
      wins: item_baseline_win_rates.wins,
    })
    .from(item_baseline_win_rates);
}
