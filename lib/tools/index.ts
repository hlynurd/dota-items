import type { Tool } from "@anthropic-ai/sdk/resources";
import {
  getHeroes,
  getHeroItemPopularity,
  getHeroMatchups,
  getItemsMap,
  topItemsFromBucket,
} from "../opendota/client";

// ─── Tool schemas (passed to Claude) ────────────────────────────────────────

export const toolDefinitions: Tool[] = [
  {
    name: "get_hero_item_popularity",
    description:
      "Returns the most popular items for a hero grouped by game phase " +
      "(starting items, early game, mid game, late game). " +
      "Each item includes its internal name, display name, and purchase count. " +
      "Higher purchase count = more popular in this phase.",
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
      "plus the hero's overall average win rate across all matchups. " +
      "Use this to compute matchup_delta = avg_vs_these_enemies - overall_win_rate.",
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

      const resolvePhase = (bucket: Record<string, number>, n = 10) =>
        topItemsFromBucket(bucket, n).map(({ item_id, count }) => {
          const entry = Object.entries(itemsMap).find(
            ([, item]) => item.id === item_id
          );
          return {
            item_id,
            item_name: entry?.[0] ?? "unknown",
            display_name: entry?.[1].dname ?? "Unknown",
            purchase_count: count,
          };
        });

      return {
        starting: resolvePhase(popularity.start_game_items),
        early: resolvePhase(popularity.early_game_items),
        mid: resolvePhase(popularity.mid_game_items),
        late: resolvePhase(popularity.late_game_items),
      };
    }

    case "get_hero_matchups_vs_enemies": {
      const heroId = input.hero_id as number;
      const enemyIds = input.enemy_hero_ids as number[];
      const [allMatchups, heroes] = await Promise.all([
        getHeroMatchups(heroId),
        getHeroes(),
      ]);

      // Overall win rate across all matchups
      const totalGames = allMatchups.reduce((s, m) => s + m.games_played, 0);
      const totalWins = allMatchups.reduce((s, m) => s + m.wins, 0);
      const overallWinRate = totalGames > 0 ? totalWins / totalGames : 0.5;

      // Win rates vs the specific enemies in this draft
      const vsEnemies = allMatchups
        .filter((m) => enemyIds.includes(m.hero_id))
        .map((m) => {
          const hero = heroes.find((h) => h.id === m.hero_id);
          return {
            hero_id: m.hero_id,
            hero_name: hero?.localized_name ?? "Unknown",
            games_played: m.games_played,
            wins: m.wins,
            win_rate: m.games_played > 0 ? m.wins / m.games_played : 0.5,
          };
        });

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
