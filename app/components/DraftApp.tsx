"use client";

import { useState, useMemo } from "react";
import type { OpenDotaHero } from "@/lib/opendota/types";
import type { HeroLookupResult, ItemLookupResult } from "@/lib/agent/types";
import {
  type StaticData, type IndexedData,
  indexStaticData, computeHeroLookup, computeItemLookup,
} from "@/lib/analysis/client-compute";
import HeroPicker from "./HeroPicker";
import ItemPicker, { type ItemOption } from "./ItemPicker";
import HeroItemTable from "./HeroItemTable";
import ItemHeroTable from "./ItemHeroTable";
import { heroImgUrl, itemImgUrl } from "@/lib/utils/cdn";

type Side = "friend" | "foe";

interface SelectedHero {
  id: number;
  name: string;
  localized_name: string;
}

export default function DraftApp({
  heroes, items, staticData,
}: {
  heroes: OpenDotaHero[];
  items: ItemOption[];
  staticData: StaticData | null;
}) {
  // Index static data once
  const indexed = useMemo<IndexedData | null>(
    () => staticData ? indexStaticData(staticData) : null,
    [staticData]
  );

  // Lookup maps for resolving IDs to names
  const itemsById = useMemo(() => {
    const m = new Map<number, { name: string; dname: string }>();
    for (const item of items) m.set(item.id, { name: item.name, dname: item.dname });
    return m;
  }, [items]);

  const heroesById = useMemo(() => {
    const m = new Map<number, { localized_name: string; name: string }>();
    for (const h of heroes) m.set(h.id, { localized_name: h.localized_name, name: h.name });
    return m;
  }, [heroes]);

  // Hero quadrants
  const [friendHero, setFriendHero] = useState<SelectedHero | null>(null);
  const [foeHero, setFoeHero] = useState<SelectedHero | null>(null);
  const [heroPicker, setHeroPicker] = useState<Side | null>(null);

  // Item quadrants
  const [friendItem, setFriendItem] = useState<ItemOption | null>(null);
  const [foeItem, setFoeItem] = useState<ItemOption | null>(null);
  const [itemPicker, setItemPicker] = useState<Side | null>(null);

  const selectedHeroIds = new Set(
    [friendHero, foeHero].filter(Boolean).map((h) => h!.id)
  );

  // Build a set of excluded item IDs by finding items in the static data that
  // are NOT in our filtered items list (which already excludes consumables)
  const filteredItemIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);

  // ─── Computed results (instant, no API calls) ─────────────────────────────

  const friendHeroResult = useMemo<HeroLookupResult | null>(() => {
    if (!indexed || !friendHero) return null;
    return computeHeroLookup(indexed, friendHero.id, friendHero.localized_name, "ally", itemsById, filteredItemIds);
  }, [indexed, friendHero, itemsById, filteredItemIds]);

  const foeHeroResult = useMemo<HeroLookupResult | null>(() => {
    if (!indexed || !foeHero) return null;
    return computeHeroLookup(indexed, foeHero.id, foeHero.localized_name, "enemy", itemsById, filteredItemIds);
  }, [indexed, foeHero, itemsById, filteredItemIds]);

  const friendItemResult = useMemo<ItemLookupResult | null>(() => {
    if (!indexed || !friendItem) return null;
    return computeItemLookup(indexed, friendItem.id, friendItem.name, friendItem.dname, "ally", heroesById);
  }, [indexed, friendItem, heroesById]);

  const foeItemResult = useMemo<ItemLookupResult | null>(() => {
    if (!indexed || !foeItem) return null;
    return computeItemLookup(indexed, foeItem.id, foeItem.name, foeItem.dname, "enemy", heroesById);
  }, [indexed, foeItem, heroesById]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function handleHeroSelect(hero: OpenDotaHero) {
    if (!heroPicker) return;
    const selected: SelectedHero = { id: hero.id, name: hero.name, localized_name: hero.localized_name };
    if (heroPicker === "friend") setFriendHero(selected);
    else setFoeHero(selected);
    setHeroPicker(null);
  }

  function handleItemSelect(item: ItemOption) {
    if (!itemPicker) return;
    if (itemPicker === "friend") setFriendItem(item);
    else setFoeItem(item);
    setItemPicker(null);
  }

  function clearHero(side: Side) {
    if (side === "friend") setFriendHero(null);
    else setFoeHero(null);
  }

  function clearItem(side: Side) {
    if (side === "friend") setFriendItem(null);
    else setFoeItem(null);
  }

  // ─── Card shell ───────────────────────────────────────────────────────────

  function QuadrantCard({ side, children, header }: {
    side: Side; header: React.ReactNode; children: React.ReactNode;
  }) {
    const accent = side === "friend" ? "border-l-green-700" : "border-l-red-800";
    return (
      <div className={`bg-zinc-900 border border-zinc-800 border-l-2 ${accent} rounded-xl overflow-hidden flex flex-col max-h-[70vh] lg:max-h-[calc(50vh-52px)]`}>
        <div className="p-3 border-b border-zinc-800 shrink-0">{header}</div>
        {children}
      </div>
    );
  }

  // ─── Picker buttons ───────────────────────────────────────────────────────

  function HeroPickerButton({ side, hero }: { side: Side; hero: SelectedHero | null }) {
    const accent = side === "friend" ? "text-green-400" : "text-red-400";
    const subtitle = side === "friend" ? "Items teammates buy more" : "Items bought more against";

    return (
      <div className="flex items-center gap-3">
        {hero ? (
          <>
            <button onClick={() => setHeroPicker(side)} className="shrink-0 w-12 h-7 rounded overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={heroImgUrl(hero.name)} alt={hero.localized_name}
                className="w-full h-full object-cover object-top"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </button>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-zinc-200 truncate block">{hero.localized_name}</span>
              <span className="text-[10px] text-zinc-600">{subtitle}</span>
            </div>
            <button onClick={() => clearHero(side)} className="shrink-0 text-zinc-600 hover:text-zinc-300 text-lg leading-none">×</button>
          </>
        ) : (
          <button onClick={() => setHeroPicker(side)}
            className={`h-9 px-3 rounded-lg border border-dashed border-zinc-700 hover:border-zinc-500 flex items-center gap-2 text-sm ${accent}`}>
            <span className="text-lg leading-none">+</span> Pick Hero
          </button>
        )}
      </div>
    );
  }

  function ItemPickerButton({ side, item }: { side: Side; item: ItemOption | null }) {
    const accent = side === "friend" ? "text-green-400" : "text-red-400";
    const subtitle = side === "friend" ? "Heroes whose teams buy this more" : "Enemy heroes this is bought against";

    return (
      <div className="flex items-center gap-3">
        {item ? (
          <>
            <button onClick={() => setItemPicker(side)} className="shrink-0 w-9 h-7 rounded overflow-hidden bg-zinc-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={itemImgUrl(item.name)} alt={item.dname}
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </button>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-zinc-200 truncate block">{item.dname}</span>
              <span className="text-[10px] text-zinc-600">{subtitle}</span>
            </div>
            <button onClick={() => clearItem(side)} className="shrink-0 text-zinc-600 hover:text-zinc-300 text-lg leading-none">×</button>
          </>
        ) : (
          <button onClick={() => setItemPicker(side)}
            className={`h-9 px-3 rounded-lg border border-dashed border-zinc-700 hover:border-zinc-500 flex items-center gap-2 text-sm ${accent}`}>
            <span className="text-lg leading-none">+</span> Pick Item
          </button>
        )}
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center gap-3">
          <div className="w-2 h-6 bg-red-500 rounded-sm" />
          <h1 className="text-xl font-semibold tracking-tight">Dota 2 Itemization Advisor</h1>
          <span className="ml-2 text-xs text-zinc-500 font-mono">beta</span>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] mx-auto w-full p-4 flex flex-col gap-4">
        {/* Column headers — desktop only */}
        <div className="hidden lg:grid lg:grid-cols-2 gap-4">
          <div className="flex items-center gap-2 px-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs font-semibold uppercase tracking-widest text-green-400">Friend</span>
            <span className="text-[10px] text-zinc-600">— ally on your team</span>
          </div>
          <div className="flex items-center gap-2 px-1">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-xs font-semibold uppercase tracking-widest text-red-400">Foe</span>
            <span className="text-[10px] text-zinc-600">— enemy on their team</span>
          </div>
        </div>

        {/* Row label: BY HERO */}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">By Hero</span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <QuadrantCard side="friend"
            header={<HeroPickerButton side="friend" hero={friendHero} />}>
            {friendHeroResult ? <HeroItemTable data={friendHeroResult} /> :
              <div className="flex-1 flex items-center justify-center p-8">
                <p className="text-sm text-zinc-600">Pick a hero to see what items their teammates buy</p>
              </div>}
          </QuadrantCard>

          <QuadrantCard side="foe"
            header={<HeroPickerButton side="foe" hero={foeHero} />}>
            {foeHeroResult ? <HeroItemTable data={foeHeroResult} /> :
              <div className="flex-1 flex items-center justify-center p-8">
                <p className="text-sm text-zinc-600">Pick a hero to see what items are bought against them</p>
              </div>}
          </QuadrantCard>
        </div>

        {/* Row label: BY ITEM */}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">By Item</span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <QuadrantCard side="friend"
            header={<ItemPickerButton side="friend" item={friendItem} />}>
            {friendItemResult ? <ItemHeroTable data={friendItemResult} /> :
              <div className="flex-1 flex items-center justify-center p-8">
                <p className="text-sm text-zinc-600">Pick an item to see which ally heroes correlate with it</p>
              </div>}
          </QuadrantCard>

          <QuadrantCard side="foe"
            header={<ItemPickerButton side="foe" item={foeItem} />}>
            {foeItemResult ? <ItemHeroTable data={foeItemResult} /> :
              <div className="flex-1 flex items-center justify-center p-8">
                <p className="text-sm text-zinc-600">Pick an item to see which enemy heroes it&apos;s bought against</p>
              </div>}
          </QuadrantCard>
        </div>
      </main>

      {heroPicker && (
        <HeroPicker heroes={heroes} excludeIds={selectedHeroIds}
          onSelect={handleHeroSelect} onClose={() => setHeroPicker(null)} />
      )}
      {itemPicker && (
        <ItemPicker items={items}
          onSelect={handleItemSelect} onClose={() => setItemPicker(null)} />
      )}
    </div>
  );
}
