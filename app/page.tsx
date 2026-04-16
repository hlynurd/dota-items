import { getHeroes, getItemsMap } from "@/lib/opendota/client";
import type { OpenDotaHero } from "@/lib/opendota/types";
import type { ItemOption } from "./components/ItemPicker";
import type { StaticData } from "@/lib/analysis/client-compute";
import { isExcludedItem } from "@/lib/utils/excluded-items";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import DraftApp from "./components/DraftApp";

function loadStaticData(filename: string): StaticData | null {
  const p = join(process.cwd(), "public", filename);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as StaticData;
}

export default async function Page() {
  let heroes: OpenDotaHero[] = [];
  let items: ItemOption[] = [];
  let staticData: StaticData | null = null;

  try {
    const [h, itemsMap] = await Promise.all([getHeroes(), getItemsMap()]);
    heroes = h;
    staticData = loadStaticData("data.json");
    const legendData = loadStaticData("data-legend.json");

    // Build set of item IDs that have data in either JSON
    const itemIdsWithData = new Set<number>();
    for (const src of [staticData, legendData]) {
      if (src) {
        for (const [item_id, , side] of src.m) {
          if (side === "enemy") itemIdsWithData.add(item_id);
        }
      }
    }

    items = Object.entries(itemsMap)
      .filter(([name, item]) => item.cost > 0 && item.dname && itemIdsWithData.has(item.id) && !isExcludedItem(name))
      .map(([name, item]) => ({
        id: item.id,
        name,
        dname: item.dname,
        cost: item.cost,
        basic: !item.components || item.components.length === 0,
      }));
  } catch {
    // OpenDota unreachable — app still renders, pickers will be empty
  }

  return <DraftApp heroes={heroes} items={items} staticData={staticData} legendData={loadStaticData("data-legend.json")} />;
}
