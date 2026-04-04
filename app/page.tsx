import { after } from "next/server";
import { getHeroes, getItemsMap } from "@/lib/opendota/client";
import { getItemIdsWithData } from "@/lib/db/queries";
import type { OpenDotaHero } from "@/lib/opendota/types";
import type { ItemOption } from "./components/ItemPicker";
import { runMarginalAggregate } from "@/scripts/aggregate";
import { EXCLUDED_ITEM_NAMES } from "@/lib/utils/excluded-items";
import DraftApp from "./components/DraftApp";

export default async function Page() {
  // Recompute win rates after every page load so data is fresh on the next request.
  // after() runs after the response is sent — does not block rendering.
  after(async () => {
    try {
      await runMarginalAggregate();
    } catch (err) {
      console.error("[page] Background aggregate failed:", err);
    }
  });

  let heroes: OpenDotaHero[] = [];
  let items: ItemOption[] = [];
  try {
    const [h, itemsMap, itemIdsWithData] = await Promise.all([
      getHeroes(),
      getItemsMap(),
      getItemIdsWithData(),
    ]);
    heroes = h;
    items = Object.entries(itemsMap)
      .filter(([name, item]) => item.cost > 0 && item.dname && itemIdsWithData.has(item.id) && !EXCLUDED_ITEM_NAMES.has(name))
      .map(([name, item]) => ({
        id: item.id,
        name,
        dname: item.dname,
        cost: item.cost,
      }));
  } catch {
    // OpenDota unreachable — app still renders, pickers will be empty
  }
  return <DraftApp heroes={heroes} items={items} />;
}
