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

// ─── Item-mode queries ──────────────────────────────────────────────────────

/**
 * Returns the set of item_ids that have marginal data (before_minute=999, enemy side).
 */
export async function getItemIdsWithData(): Promise<Set<number>> {
  const rows = await db
    .selectDistinct({ item_id: item_marginal_win_rates.item_id })
    .from(item_marginal_win_rates)
    .where(sql`${item_marginal_win_rates.context_side} = 'enemy' AND ${item_marginal_win_rates.before_minute} = 999`);
  return new Set(rows.map((r) => r.item_id));
}

export interface HeroItemRow {
  item_id: number;
  games: number;
  wins: number;
  match_games: number;
  match_wins: number;
}

/**
 * For a given hero + side, fetch all items' marginal stats (before_minute=999)
 * plus the hero's total matches for computing WR without.
 */
export async function getHeroItems(
  heroId: number,
  side: "enemy" | "ally"
): Promise<{ items: HeroItemRow[]; totalMatches: number; totalWins: number }> {
  const [itemRows, heroTotalRows] = await Promise.all([
    db
      .select({
        item_id: item_marginal_win_rates.item_id,
        games: item_marginal_win_rates.games,
        wins: item_marginal_win_rates.wins,
        match_games: item_marginal_win_rates.match_games,
        match_wins: item_marginal_win_rates.match_wins,
      })
      .from(item_marginal_win_rates)
      .where(
        sql`${item_marginal_win_rates.context_hero_id} = ${heroId}
          AND ${item_marginal_win_rates.context_side} = ${side}
          AND ${item_marginal_win_rates.before_minute} = 999`
      ),
    db
      .select({
        total_matches: context_hero_totals.total_matches,
        total_wins: context_hero_totals.total_wins,
      })
      .from(context_hero_totals)
      .where(
        sql`${context_hero_totals.context_hero_id} = ${heroId}
          AND ${context_hero_totals.context_side} = ${side}`
      ),
  ]);
  const ht = heroTotalRows[0];
  return {
    items: itemRows,
    totalMatches: ht?.total_matches ?? 0,
    totalWins: ht?.total_wins ?? 0,
  };
}

export interface ItemBaselinePurchaseRow {
  item_id: number;
  avg_match_games: number;
  avg_total_matches: number;
}

/**
 * For each item, compute the average purchase rate across all context heroes on a given side.
 * purchase_rate = match_games / total_matches per hero, averaged over all heroes.
 * Returns avg_match_games and avg_total_matches so the caller can compute the rate.
 */
export async function getItemBaselinePurchaseRates(
  side: "enemy" | "ally"
): Promise<Map<number, number>> {
  const rows = await db.execute<{ item_id: number; avg_rate: string }>(sql`
    SELECT
      m.item_id,
      AVG(m.match_games::float / NULLIF(h.total_matches, 0)) AS avg_rate
    FROM ${item_marginal_win_rates} m
    JOIN ${context_hero_totals} h
      ON m.context_hero_id = h.context_hero_id AND m.context_side = h.context_side
    WHERE m.context_side = ${side} AND m.before_minute = 999
    GROUP BY m.item_id
  `);
  const map = new Map<number, number>();
  for (const r of rows.rows) {
    map.set(r.item_id, parseFloat(r.avg_rate) || 0);
  }
  return map;
}

export interface ItemHeroRow {
  context_hero_id: number;
  match_games: number;
  match_wins: number;
  total_matches: number;
  total_wins: number;
}

/**
 * For a given item, fetch per-enemy-hero marginal stats (before_minute=999)
 * joined with hero totals so we can compute WR with/without.
 */
export async function getItemVsHeroes(itemId: number, side: "enemy" | "ally" = "enemy"): Promise<ItemHeroRow[]> {
  const rows = await db
    .select({
      context_hero_id: item_marginal_win_rates.context_hero_id,
      match_games: item_marginal_win_rates.match_games,
      match_wins: item_marginal_win_rates.match_wins,
      total_matches: context_hero_totals.total_matches,
      total_wins: context_hero_totals.total_wins,
    })
    .from(item_marginal_win_rates)
    .innerJoin(
      context_hero_totals,
      sql`${item_marginal_win_rates.context_hero_id} = ${context_hero_totals.context_hero_id}
        AND ${item_marginal_win_rates.context_side} = ${context_hero_totals.context_side}`
    )
    .where(
      sql`${item_marginal_win_rates.item_id} = ${itemId}
        AND ${item_marginal_win_rates.context_side} = ${side}
        AND ${item_marginal_win_rates.before_minute} = 999`
    );
  return rows;
}
