"use client";

import { useState } from "react";
import type { OpenDotaHero } from "@/lib/opendota/types";
import type { HeroLookupResult, ItemLookupResult } from "@/lib/agent/types";
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

export default function DraftApp({ heroes, items }: { heroes: OpenDotaHero[]; items: ItemOption[] }) {
  // Hero quadrants
  const [friendHero, setFriendHero] = useState<SelectedHero | null>(null);
  const [foeHero, setFoeHero] = useState<SelectedHero | null>(null);
  const [friendHeroResult, setFriendHeroResult] = useState<HeroLookupResult | null>(null);
  const [foeHeroResult, setFoeHeroResult] = useState<HeroLookupResult | null>(null);
  const [heroLoading, setHeroLoading] = useState<Side | null>(null);
  const [heroPicker, setHeroPicker] = useState<Side | null>(null);

  // Item quadrants
  const [friendItem, setFriendItem] = useState<ItemOption | null>(null);
  const [foeItem, setFoeItem] = useState<ItemOption | null>(null);
  const [friendItemResult, setFriendItemResult] = useState<ItemLookupResult | null>(null);
  const [foeItemResult, setFoeItemResult] = useState<ItemLookupResult | null>(null);
  const [itemLoading, setItemLoading] = useState<Side | null>(null);
  const [itemPicker, setItemPicker] = useState<Side | null>(null);

  const selectedHeroIds = new Set(
    [friendHero, foeHero].filter(Boolean).map((h) => h!.id)
  );

  // ─── Handlers ──────────────────────────────────────────────────────────────

  async function handleHeroSelect(hero: OpenDotaHero) {
    if (!heroPicker) return;
    const selected: SelectedHero = { id: hero.id, name: hero.name, localized_name: hero.localized_name };
    const side = heroPicker;
    const dbSide = side === "friend" ? "ally" : "enemy";

    if (side === "friend") { setFriendHero(selected); setFriendHeroResult(null); }
    else { setFoeHero(selected); setFoeHeroResult(null); }
    setHeroPicker(null);
    setHeroLoading(side);

    try {
      const params = new URLSearchParams({ hero_id: String(hero.id), hero_name: hero.localized_name, side: dbSide });
      const res = await fetch(`/api/hero-lookup?${params}`);
      const data: HeroLookupResult = await res.json();
      if (side === "friend") setFriendHeroResult(data);
      else setFoeHeroResult(data);
    } finally {
      setHeroLoading(null);
    }
  }

  async function handleItemSelect(item: ItemOption) {
    if (!itemPicker) return;
    const side = itemPicker;
    const dbSide = side === "friend" ? "ally" : "enemy";

    if (side === "friend") { setFriendItem(item); setFriendItemResult(null); }
    else { setFoeItem(item); setFoeItemResult(null); }
    setItemPicker(null);
    setItemLoading(side);

    try {
      const params = new URLSearchParams({ item_id: String(item.id), item_name: item.name, display_name: item.dname, side: dbSide });
      const res = await fetch(`/api/item-lookup?${params}`);
      const data: ItemLookupResult = await res.json();
      if (side === "friend") setFriendItemResult(data);
      else setFoeItemResult(data);
    } finally {
      setItemLoading(null);
    }
  }

  function clearHero(side: Side) {
    if (side === "friend") { setFriendHero(null); setFriendHeroResult(null); }
    else { setFoeHero(null); setFoeHeroResult(null); }
  }

  function clearItem(side: Side) {
    if (side === "friend") { setFriendItem(null); setFriendItemResult(null); }
    else { setFoeItem(null); setFoeItemResult(null); }
  }

  // ─── Card shell ────────────────────────────────────────────────────────────

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

  // ─── Picker buttons ────────────────────────────────────────────────────────

  function HeroPickerButton({ side, hero, loading }: { side: Side; hero: SelectedHero | null; loading: boolean }) {
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
            {loading && <span className="text-xs text-zinc-500 animate-pulse shrink-0">Loading...</span>}
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

  function ItemPickerButton({ side, item, loading }: { side: Side; item: ItemOption | null; loading: boolean }) {
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
            {loading && <span className="text-xs text-zinc-500 animate-pulse shrink-0">Loading...</span>}
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

  // ─── Render ────────────────────────────────────────────────────────────────

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

        {/* Hero row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Hero Friend */}
          <QuadrantCard side="friend"
            header={<HeroPickerButton side="friend" hero={friendHero} loading={heroLoading === "friend"} />}>
            {friendHeroResult ? <HeroItemTable data={friendHeroResult} /> :
              <div className="flex-1 flex items-center justify-center p-8">
                <p className="text-sm text-zinc-600">Pick a hero to see what items their teammates buy</p>
              </div>}
          </QuadrantCard>

          {/* Hero Foe */}
          <QuadrantCard side="foe"
            header={<HeroPickerButton side="foe" hero={foeHero} loading={heroLoading === "foe"} />}>
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

        {/* Item row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Item Friend */}
          <QuadrantCard side="friend"
            header={<ItemPickerButton side="friend" item={friendItem} loading={itemLoading === "friend"} />}>
            {friendItemResult ? <ItemHeroTable data={friendItemResult} /> :
              <div className="flex-1 flex items-center justify-center p-8">
                <p className="text-sm text-zinc-600">Pick an item to see which ally heroes correlate with it</p>
              </div>}
          </QuadrantCard>

          {/* Item Foe */}
          <QuadrantCard side="foe"
            header={<ItemPickerButton side="foe" item={foeItem} loading={itemLoading === "foe"} />}>
            {foeItemResult ? <ItemHeroTable data={foeItemResult} /> :
              <div className="flex-1 flex items-center justify-center p-8">
                <p className="text-sm text-zinc-600">Pick an item to see which enemy heroes it&apos;s bought against</p>
              </div>}
          </QuadrantCard>
        </div>
      </main>

      {/* Modals */}
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
