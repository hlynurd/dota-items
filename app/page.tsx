import { getHeroes, getItemsMap } from "@/lib/opendota/client";
import type { OpenDotaHero } from "@/lib/opendota/types";
import type { ItemOption } from "./components/ItemPicker";
import type { StaticData } from "@/lib/analysis/client-compute";
import { EXCLUDED_ITEM_NAMES } from "@/lib/utils/excluded-items";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import DraftApp from "./components/DraftApp";

function loadStaticData(): StaticData | null {
  const p = join(process.cwd(), "public", "data.json");
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
    staticData = loadStaticData();

    // Build set of item IDs that have data in the static JSON
    const itemIdsWithData = new Set<number>();
    if (staticData) {
      for (const [item_id, , side] of staticData.m) {
        if (side === "enemy") itemIdsWithData.add(item_id);
      }
    }

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

  return <DraftApp heroes={heroes} items={items} staticData={staticData} />;
}
