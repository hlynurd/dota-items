/**
 * Tool execution functions used by the chat agent.
 * These wrap OpenDota API calls in a format suitable for Claude tool-use responses.
 */

import type { Tool } from "@anthropic-ai/sdk/resources";
import {
  getHeroes,
  getHeroItemPopularity,
  getHeroMatchups,
  getItemsMap,
  topItemsFromBucket,
} from "../opendota/client";

// ─── Tool schemas (used by chat agent only) ──────────────────────────────────

export const toolDefinitions: Tool[] = [
  {
    name: "get_hero_item_popularity",
    description:
      "Returns the most popular items for a hero grouped by game phase. " +
      "Each item includes its name and purchase count.",
    input_schema: {
      type: "object" as const,
      properties: {
        hero_id: { type: "number", description: "Numeric hero ID" },
      },
      required: ["hero_id"],
    },
  },
  {
    name: "get_hero_matchups_vs_enemies",
    description:
      "Returns win rate data for a hero against specific enemy heroes, " +
      "plus the hero's overall average win rate.",
    input_schema: {
      type: "object" as const,
      properties: {
        hero_id: { type: "number", description: "Numeric hero ID" },
        enemy_hero_ids: {
          type: "array",
          items: { type: "number" },
          description: "Array of enemy hero numeric IDs",
        },
      },
      required: ["hero_id", "enemy_hero_ids"],
    },
  },
];

// ─── Tool execution ──────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "get_hero_item_popularity": {
      const heroId = input.hero_id as number;
      const [popularity, itemsMap] = await Promise.all([
        getHeroItemPopularity(heroId),
        getItemsMap(),
      ]);
      const resolve = (bucket: Record<string, number>, n = 10) =>
        topItemsFromBucket(bucket, n).map(({ item_id, count }) => {
          const entry = Object.entries(itemsMap).find(([, item]) => item.id === item_id);
          return {
            item_id,
            item_name: entry?.[0] ?? "unknown",
            display_name: entry?.[1]?.dname ?? "Unknown",
            purchase_count: count,
          };
        });
      return {
        starting: resolve(popularity.start_game_items),
        early: resolve(popularity.early_game_items),
        mid: resolve(popularity.mid_game_items),
        late: resolve(popularity.late_game_items),
      };
    }

    case "get_hero_matchups_vs_enemies": {
      const heroId = input.hero_id as number;
      const enemyIds = input.enemy_hero_ids as number[];
      const [allMatchups, heroes] = await Promise.all([
        getHeroMatchups(heroId),
        getHeroes(),
      ]);
      const totalGames = allMatchups.reduce((s, m) => s + m.games_played, 0);
      const totalWins = allMatchups.reduce((s, m) => s + m.wins, 0);
      const overallWinRate = totalGames > 0 ? totalWins / totalGames : 0.5;
      const vsEnemies = allMatchups
        .filter((m) => enemyIds.includes(m.hero_id))
        .map((m) => ({
          hero_id: m.hero_id,
          hero_name: heroes.find((h) => h.id === m.hero_id)?.localized_name ?? "Unknown",
          games_played: m.games_played,
          wins: m.wins,
          win_rate: m.games_played > 0 ? m.wins / m.games_played : 0.5,
        }));
      const avgVsEnemies =
        vsEnemies.length > 0
          ? vsEnemies.reduce((s, m) => s + m.win_rate, 0) / vsEnemies.length
          : overallWinRate;
      return {
        overall_win_rate: Math.round(overallWinRate * 1000) / 1000,
        avg_vs_these_enemies: Math.round(avgVsEnemies * 1000) / 1000,
        matchup_delta: Math.round((avgVsEnemies - overallWinRate) * 1000) / 1000,
        vs_enemies: vsEnemies,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
