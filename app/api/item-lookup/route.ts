import { getItemVsHeroes } from "@/lib/db/queries";
import { getHeroes } from "@/lib/opendota/client";
import type { ItemLookupResult, ItemHeroEntry } from "@/lib/agent/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const itemId = Number(url.searchParams.get("item_id"));
  const itemName = url.searchParams.get("item_name") ?? "unknown";
  const displayName = url.searchParams.get("display_name") ?? "Unknown";
  const side = (url.searchParams.get("side") ?? "enemy") as "enemy" | "ally";

  if (!itemId || isNaN(itemId)) {
    return Response.json({ error: "item_id required" }, { status: 400 });
  }

  const [rows, heroes] = await Promise.all([
    getItemVsHeroes(itemId, side),
    getHeroes(),
  ]);

  const heroNameMap = new Map(heroes.map((h) => [h.id, h.localized_name]));
  const heroInternalMap = new Map(heroes.map((h) => [h.id, h.name]));

  const eligible = rows.filter((r) => r.match_games >= 5);

  // Compute baseline purchase rate: avg(match_games / total_matches) across all heroes
  const rates = eligible.map((r) => r.match_games / r.total_matches);
  const avgRate = rates.length > 0 ? rates.reduce((s, r) => s + r, 0) / rates.length : 1;

  const entries: ItemHeroEntry[] = eligible.map((r) => {
    const wrWith = r.match_games > 0 ? r.match_wins / r.match_games : 0;
    const without_games = r.total_matches - r.match_games;
    const without_wins = r.total_wins - r.match_wins;
    const wrWithout = without_games > 0 ? without_wins / without_games : 0;
    // positive diff = buying this item against this hero is good
    const diff = wrWith - wrWithout;
    const heroRate = r.match_games / r.total_matches;
    const buyRate = avgRate > 0 ? heroRate / avgRate : 1;
    return {
      hero_id: r.context_hero_id,
      hero_name: heroNameMap.get(r.context_hero_id) ?? "Unknown",
      hero_internal_name: heroInternalMap.get(r.context_hero_id) ?? "",
      wr_with: Math.round(wrWith * 10000) / 10000,
      wr_without: Math.round(wrWithout * 10000) / 10000,
      diff: Math.round(diff * 10000) / 10000,
      buy_rate: Math.round(buyRate * 100) / 100,
      match_games: r.match_games,
    };
  });

  const result: ItemLookupResult = {
    item_id: itemId,
    item_name: itemName,
    display_name: displayName,
    heroes: entries,
  };

  return Response.json(result);
}
