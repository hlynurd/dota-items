import { getHeroItems, getItemBaselinePurchaseRates } from "@/lib/db/queries";
import { getItemsMap } from "@/lib/opendota/client";
import { EXCLUDED_ITEM_NAMES } from "@/lib/utils/excluded-items";
import type { HeroLookupResult, HeroItemEntry } from "@/lib/agent/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const heroId = Number(url.searchParams.get("hero_id"));
  const heroName = url.searchParams.get("hero_name") ?? "Unknown";
  const side = url.searchParams.get("side") as "enemy" | "ally" | null;

  if (!heroId || isNaN(heroId) || !side || !["enemy", "ally"].includes(side)) {
    return Response.json({ error: "hero_id and side (enemy|ally) required" }, { status: 400 });
  }

  const [{ items: rows, totalMatches, totalWins }, itemsMap, baselineRates] = await Promise.all([
    getHeroItems(heroId, side),
    getItemsMap(),
    getItemBaselinePurchaseRates(side),
  ]);

  // Build a set of excluded item IDs from the items map
  const excludedIds = new Set(
    Object.entries(itemsMap)
      .filter(([name]) => EXCLUDED_ITEM_NAMES.has(name))
      .map(([, item]) => item.id)
  );

  const eligible = rows.filter((r) => r.match_games >= 5 && !excludedIds.has(r.item_id));

  const entries: HeroItemEntry[] = eligible.map((r) => {
    const wrWith = r.match_games > 0 ? r.match_wins / r.match_games : 0;
    const withoutGames = totalMatches - r.match_games;
    const withoutWins = totalWins - r.match_wins;
    const wrWithout = withoutGames > 0 ? withoutWins / withoutGames : 0;
    const diff = wrWith - wrWithout;

    // Buy rate: this hero's purchase rate vs avg purchase rate across all heroes
    const heroRate = totalMatches > 0 ? r.match_games / totalMatches : 0;
    const baseline = baselineRates.get(r.item_id) ?? heroRate;
    const buyRate = baseline > 0 ? heroRate / baseline : 1;

    const entry = Object.entries(itemsMap).find(([, item]) => item.id === r.item_id);

    return {
      item_id: r.item_id,
      item_name: entry?.[0] ?? "unknown",
      display_name: entry?.[1]?.dname ?? "Unknown",
      buy_rate: Math.round(buyRate * 100) / 100,
      wr_with: Math.round(wrWith * 10000) / 10000,
      wr_without: Math.round(wrWithout * 10000) / 10000,
      diff: Math.round(diff * 10000) / 10000,
      match_games: r.match_games,
    };
  });

  const result: HeroLookupResult = {
    hero_id: heroId,
    hero_name: heroName,
    side,
    items: entries,
  };

  return Response.json(result);
}
