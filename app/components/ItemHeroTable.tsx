"use client";

import { useState, useMemo } from "react";
import type { ItemLookupResult, ItemHeroEntry } from "@/lib/agent/types";
import { heroImgUrl } from "@/lib/utils/cdn";

type SortKey = "hero_name" | "buy_rate" | "diff" | "wr_with" | "wr_without" | "match_games";

function SortHeader({
  label, sortKey, active, ascending, onClick, className,
}: {
  label: string; sortKey: SortKey; active: boolean; ascending: boolean;
  onClick: (key: SortKey) => void; className?: string;
}) {
  const arrow = active ? (ascending ? " \u25B2" : " \u25BC") : "";
  return (
    <button
      onClick={() => onClick(sortKey)}
      className={`text-right hover:text-zinc-300 transition-colors cursor-pointer select-none ${active ? "text-zinc-300" : ""} ${className ?? ""}`}
    >{label}{arrow}</button>
  );
}

function HeroRow({ entry }: { entry: ItemHeroEntry }) {
  const wrWithPct = (entry.wr_with * 100).toFixed(1);
  const wrWithoutPct = (entry.wr_without * 100).toFixed(1);
  const diffPct = (Math.abs(entry.diff) * 100).toFixed(1);
  const diffSign = entry.diff >= 0 ? "+" : "-";
  const diffColor = entry.diff >= 0.005 ? "text-green-400" : entry.diff <= -0.005 ? "text-red-400" : "text-zinc-600";
  const buyColor = entry.buy_rate >= 1.2 ? "text-green-400" : entry.buy_rate <= 0.8 ? "text-red-400" : "text-zinc-400";

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-zinc-800/50 last:border-0">
      <div className="w-8 h-6 rounded overflow-hidden bg-zinc-800 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={heroImgUrl(entry.hero_internal_name)} alt={entry.hero_name}
          className="w-full h-full object-cover object-top"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      </div>
      <span className="text-sm text-zinc-300 truncate flex-1 min-w-0">{entry.hero_name}</span>
      <span className={`text-xs font-mono shrink-0 w-12 text-right ${buyColor}`}>{entry.buy_rate.toFixed(1)}x</span>
      <span className="text-xs font-mono text-zinc-400 shrink-0 w-12 text-right">{wrWithPct}%</span>
      <span className="text-xs font-mono text-zinc-500 shrink-0 w-12 text-right">{wrWithoutPct}%</span>
      <span className={`text-xs font-mono shrink-0 w-12 text-right ${diffColor}`}>{diffSign}{diffPct}%</span>
      <span className="text-xs text-zinc-600 font-mono shrink-0 w-8 text-right">({entry.match_games})</span>
    </div>
  );
}

/** Bare table — no card wrapper. Parent provides the card shell. */
export default function ItemHeroTable({ data }: { data: ItemLookupResult }) {
  const [sortKey, setSortKey] = useState<SortKey>("diff");
  const [ascending, setAscending] = useState(false);

  function handleSort(key: SortKey) {
    if (key === sortKey) setAscending(!ascending);
    else { setSortKey(key); setAscending(key === "hero_name"); }
  }

  const sorted = useMemo(() => {
    const items = [...data.heroes];
    items.sort((a, b) => {
      if (sortKey === "hero_name") return ascending ? a.hero_name.localeCompare(b.hero_name) : b.hero_name.localeCompare(a.hero_name);
      const av = a[sortKey];
      const bv = b[sortKey];
      return ascending ? av - bv : bv - av;
    });
    return items;
  }, [data.heroes, sortKey, ascending]);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center gap-2 pb-2 mb-1 border-b border-zinc-800 text-xs text-zinc-600 font-mono shrink-0 px-3">
        <span className="w-8 shrink-0" />
        <SortHeader label="Hero" sortKey="hero_name" active={sortKey === "hero_name"} ascending={ascending} onClick={handleSort} className="flex-1 !text-left" />
        <SortHeader label="Buy" sortKey="buy_rate" active={sortKey === "buy_rate"} ascending={ascending} onClick={handleSort} className="shrink-0 w-12" />
        <SortHeader label="With" sortKey="wr_with" active={sortKey === "wr_with"} ascending={ascending} onClick={handleSort} className="shrink-0 w-12" />
        <SortHeader label="W/o" sortKey="wr_without" active={sortKey === "wr_without"} ascending={ascending} onClick={handleSort} className="shrink-0 w-12" />
        <SortHeader label="Diff" sortKey="diff" active={sortKey === "diff"} ascending={ascending} onClick={handleSort} className="shrink-0 w-12" />
        <SortHeader label="N" sortKey="match_games" active={sortKey === "match_games"} ascending={ascending} onClick={handleSort} className="shrink-0 w-8" />
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 px-3 pb-2">
        {sorted.map((entry) => (
          <HeroRow key={entry.hero_id} entry={entry} />
        ))}
        {sorted.length === 0 && (
          <p className="text-zinc-500 text-sm text-center py-8">No data yet</p>
        )}
      </div>
    </div>
  );
}
