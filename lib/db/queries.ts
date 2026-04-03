/**
 * DB-backed queries for the analyze pipeline.
 * Reads from pre-aggregated marginal/baseline tables.
 */

import { db } from "./client";
import { item_marginal_win_rates, item_baseline_win_rates, context_hero_totals } from "./schema";
import { inArray, sql } from "drizzle-orm";

// ─── Marginal queries ────────────────────────────────────────────────────────

export interface ItemMarginalRow {
  item_id: number;
  context_hero_id: number;
  context_side: string; // 'enemy' | 'ally'
  before_minute: number;
  games: number;
  wins: number;
  match_games: number;
  match_wins: number;
}

export interface HeroTotalRow {
  context_hero_id: number;
  context_side: string;
  total_matches: number;
  total_wins: number;
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
      match_games: item_marginal_win_rates.match_games,
      match_wins: item_marginal_win_rates.match_wins,
    })
    .from(item_marginal_win_rates)
    .where(inArray(item_marginal_win_rates.context_hero_id, contextHeroIds));
}

export async function getHeroTotals(
  contextHeroIds: number[]
): Promise<HeroTotalRow[]> {
  return db
    .select({
      context_hero_id: context_hero_totals.context_hero_id,
      context_side: context_hero_totals.context_side,
      total_matches: context_hero_totals.total_matches,
      total_wins: context_hero_totals.total_wins,
    })
    .from(context_hero_totals)
    .where(inArray(context_hero_totals.context_hero_id, contextHeroIds));
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

/**
 * Total match count in the DB. Used for purchase rate normalization.
 */
export async function getTotalMatches(): Promise<number> {
  const res = await db.execute(sql`SELECT COUNT(*)::text AS c FROM matches`);
  return parseInt((res.rows[0] as { c: string }).c, 10);
}
