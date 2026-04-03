/**
 * DB-backed replacements for the OpenDota /explorer queries.
 * These read from the pre-aggregated item_win_rates table.
 */

import { db } from "./client";
import { item_win_rates } from "./schema";
import { eq, inArray, or, and } from "drizzle-orm";

export interface ItemWinRateRow {
  item_id: number;
  opponent_hero_id: number; // -1 = overall baseline
  before_minute: number;
  games: number;
  wins: number;
}

const OVERALL_SENTINEL = -1;

/**
 * Fetch all win rate rows for a given hero: both the overall baseline rows
 * (opponent_hero_id = -1) and the per-enemy rows for each enemy in the lineup.
 * Returns everything in one query.
 */
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
