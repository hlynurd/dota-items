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

  // Hero & Item selections (foe only)
  const [foeHero, setFoeHero] = useState<SelectedHero | null>(null);
  const [foeItem, setFoeItem] = useState<ItemOption | null>(null);
  const [showHeroPicker, setShowHeroPicker] = useState(false);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [debug, setDebug] = useState(false);
  const [showLowN, setShowLowN] = useState(false);
  const [showBasic, setShowBasic] = useState(false);

  const filteredItemIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const basicItemIds = useMemo(() => new Set(items.filter((i) => i.basic).map((i) => i.id)), [items]);

  // ─── Computed results (instant, no API calls) ─────────────────────────────

  const foeHeroResult = useMemo<HeroLookupResult | null>(() => {
    if (!indexed || !foeHero) return null;
    return computeHeroLookup(indexed, foeHero.id, foeHero.localized_name, "enemy", itemsById, filteredItemIds);
  }, [indexed, foeHero, itemsById, filteredItemIds]);

  const foeItemResult = useMemo<ItemLookupResult | null>(() => {
    if (!indexed || !foeItem) return null;
    return computeItemLookup(indexed, foeItem.id, foeItem.name, foeItem.dname, "enemy", heroesById);
  }, [indexed, foeItem, heroesById]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function handleHeroSelect(hero: OpenDotaHero) {
    setFoeHero({ id: hero.id, name: hero.name, localized_name: hero.localized_name });
    setShowHeroPicker(false);
  }

  function handleItemSelect(item: ItemOption) {
    setFoeItem(item);
    setShowItemPicker(false);
  }

  // ─── Card shell ───────────────────────────────────────────────────────────

  function Card({ children, header }: {
    header: React.ReactNode; children: React.ReactNode;
  }) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 border-l-2 border-l-red-800 rounded-xl overflow-hidden flex flex-col max-h-[70vh] md:max-h-[calc(80vh-100px)]">
        <div className="p-3 border-b border-zinc-800 shrink-0">{header}</div>
        {children}
      </div>
    );
  }

  // ─── Picker buttons ───────────────────────────────────────────────────────

  function HeroPickerButton() {
    return (
      <div className="flex items-center gap-3">
        {foeHero ? (
          <>
            <button onClick={() => setShowHeroPicker(true)} className="shrink-0 w-12 h-7 rounded overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={heroImgUrl(foeHero.name)} alt={foeHero.localized_name}
                className="w-full h-full object-cover object-top"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                loading="lazy" decoding="async" />
            </button>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-zinc-200 truncate block">{foeHero.localized_name}</span>
              <span className="text-[10px] text-zinc-500">Items bought more against this hero</span>
            </div>
            <button onClick={() => setFoeHero(null)} className="shrink-0 text-zinc-600 hover:text-zinc-300 text-lg leading-none px-1 py-1" aria-label="Remove selection">×</button>
          </>
        ) : (
          <button onClick={() => setShowHeroPicker(true)}
            className="h-10 px-3 rounded-lg border border-dashed border-zinc-700 hover:border-zinc-500 flex items-center gap-2 text-sm text-red-400">
            <span className="text-lg leading-none">+</span> Pick Enemy Hero
          </button>
        )}
      </div>
    );
  }

  function ItemPickerButton() {
    return (
      <div className="flex items-center gap-3">
        {foeItem ? (
          <>
            <button onClick={() => setShowItemPicker(true)} className="shrink-0 w-9 h-7 rounded overflow-hidden bg-zinc-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={itemImgUrl(foeItem.name)} alt={foeItem.dname}
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                loading="lazy" decoding="async" />
            </button>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-zinc-200 truncate block">{foeItem.dname}</span>
              <span className="text-[10px] text-zinc-500">Enemy heroes this item is bought against</span>
            </div>
            <button onClick={() => setFoeItem(null)} className="shrink-0 text-zinc-600 hover:text-zinc-300 text-lg leading-none px-1 py-1" aria-label="Remove selection">×</button>
          </>
        ) : (
          <button onClick={() => setShowItemPicker(true)}
            className="h-10 px-3 rounded-lg border border-dashed border-zinc-700 hover:border-zinc-500 flex items-center gap-2 text-sm text-red-400">
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
          <h1 className="text-xl font-semibold tracking-tight">Dota 2 Itemisation Stats</h1>
          <span className="ml-2 text-xs text-zinc-500 font-mono">beta</span>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] mx-auto w-full p-4 flex flex-col gap-4">
        {!staticData && (
          <div className="bg-red-950 border border-red-900 text-red-200 text-sm rounded-lg px-4 py-3">
            Data failed to load. Try refreshing the page.
          </div>
        )}

        {/* Row label: BY HERO */}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">By Hero</span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>

        <Card header={<HeroPickerButton />}>
          {foeHeroResult ? <HeroItemTable data={foeHeroResult} debug={debug} minGames={showLowN ? 0 : 100} hideBasic={!showBasic} basicItemIds={basicItemIds} /> :
            <div className="flex-1 flex items-center justify-center p-8">
              <p className="text-sm text-zinc-500">Pick an enemy hero to see what items are bought against them</p>
            </div>}
        </Card>

        {/* Row label: BY ITEM */}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">By Item</span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>

        <Card header={<ItemPickerButton />}>
          {foeItemResult ? <ItemHeroTable data={foeItemResult} debug={debug} minGames={showLowN ? 0 : 100} /> :
            <div className="flex-1 flex items-center justify-center p-8">
              <p className="text-sm text-zinc-500">Pick an item to see which enemy heroes it&apos;s bought against</p>
            </div>}
        </Card>
        {/* Bottom toggles */}
        <div className="flex justify-center gap-2 pt-4 pb-2 flex-wrap">
          <button
            onClick={() => setShowBasic(!showBasic)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              showBasic
                ? "border-zinc-600 text-zinc-300 bg-zinc-800"
                : "border-zinc-800 text-zinc-600 hover:text-zinc-400 hover:border-zinc-700"
            }`}
          >
            {showBasic ? "Hide basic items" : "Show basic items"}
          </button>
          <button
            onClick={() => setShowLowN(!showLowN)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              showLowN
                ? "border-zinc-600 text-zinc-300 bg-zinc-800"
                : "border-zinc-800 text-zinc-600 hover:text-zinc-400 hover:border-zinc-700"
            }`}
          >
            {showLowN ? "Hide N<100" : "Show N<100"}
          </button>
          <button
            onClick={() => setDebug(!debug)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              debug
                ? "border-zinc-600 text-zinc-300 bg-zinc-800"
                : "border-zinc-800 text-zinc-600 hover:text-zinc-400 hover:border-zinc-700"
            }`}
          >
            {debug ? "Hide CI & N" : "CI & N"}
          </button>
        </div>
      </main>

      {showHeroPicker && (
        <HeroPicker heroes={heroes} excludeIds={new Set()}
          onSelect={handleHeroSelect} onClose={() => setShowHeroPicker(false)} />
      )}
      {showItemPicker && (
        <ItemPicker items={items}
          onSelect={handleItemSelect} onClose={() => setShowItemPicker(false)} />
      )}
    </div>
  );
}
