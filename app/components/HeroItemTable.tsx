"use client";

import { useState, useMemo } from "react";
import type { HeroLookupResult, HeroItemEntry } from "@/lib/agent/types";
import { itemImgUrl } from "@/lib/utils/cdn";

type SortKey = "display_name" | "buy_rate" | "wr_diff" | "match_games";

const COLUMN_TOOLTIPS: Record<string, string> = {
  display_name: "Item name",
  buy_rate: "How much more this item is bought vs average (1.0x = normal)",
  wr_diff: "Win rate difference (With item minus Without)",
  match_games: "Number of matches in sample",
};

function ci95(p: number, n: number): number {
  if (n <= 0) return 0;
  return 1.96 * Math.sqrt(p * (1 - p) / n);
}

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
      title={COLUMN_TOOLTIPS[sortKey]}
      className={`text-right hover:text-zinc-300 transition-colors cursor-pointer select-none ${active ? "text-zinc-300" : ""} ${className ?? ""}`}
    >{label}{arrow}</button>
  );
}

function ItemRow({ item, debug }: { item: HeroItemEntry; debug: boolean }) {
  const diffPct = (Math.abs(item.diff) * 100).toFixed(1);
  const diffSign = item.diff >= 0 ? "+" : "-";
  const diffColor = item.diff >= 0.005 ? "text-green-400" : item.diff <= -0.005 ? "text-red-400" : "text-zinc-600";
  const buyColor = item.buy_rate >= 1.2 ? "text-green-400" : item.buy_rate <= 0.8 ? "text-red-400" : "text-zinc-400";

  const wrWith = item.wr_with;
  const ciWith = ci95(wrWith, item.match_games);
  const ciDiff = ci95(Math.abs(item.diff), item.match_games); // approximate CI for the diff

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/40 rounded-sm transition-colors">
      <div className="w-8 h-6 rounded overflow-hidden bg-zinc-800 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={itemImgUrl(item.item_name)} alt={item.display_name}
          className="w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          loading="lazy" decoding="async" />
      </div>
      <span className="text-sm text-zinc-300 truncate flex-1 min-w-0">{item.display_name}</span>
      <span className={`text-xs font-mono shrink-0 w-12 text-right ${buyColor}`}>{item.buy_rate.toFixed(1)}x</span>
      <span className={`text-xs font-mono shrink-0 ${debug ? "w-28" : "w-14"} text-right ${diffColor}`}>
        {diffSign}{diffPct}%{debug && <span className="text-zinc-600"> ±{(ciDiff * 100).toFixed(1)}%</span>}
      </span>
      {debug && (
        <span className="text-xs text-zinc-600 font-mono shrink-0 w-10 text-right">({item.match_games.toLocaleString()})</span>
      )}
    </div>
  );
}

export default function HeroItemTable({ data, debug = false, minGames = 0 }: { data: HeroLookupResult; debug?: boolean; minGames?: number }) {
  const [sortKey, setSortKey] = useState<SortKey>("buy_rate");
  const [ascending, setAscending] = useState(false);

  function handleSort(key: SortKey) {
    if (key === sortKey) setAscending(!ascending);
    else { setSortKey(key); setAscending(key === "display_name"); }
  }

  const sorted = useMemo(() => {
    const items = data.items.filter((i) => i.match_games >= minGames);
    items.sort((a, b) => {
      if (sortKey === "display_name") return ascending ? a.display_name.localeCompare(b.display_name) : b.display_name.localeCompare(a.display_name);
      const av = sortKey === "wr_diff" ? a.diff : a[sortKey];
      const bv = sortKey === "wr_diff" ? b.diff : b[sortKey];
      return ascending ? av - bv : bv - av;
    });
    return items;
  }, [data.items, sortKey, ascending, minGames]);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center gap-2 pb-2 mb-1 border-b border-zinc-800 text-xs text-zinc-600 font-mono shrink-0 px-3">
        <span className="w-8 shrink-0" />
        <SortHeader label="Item" sortKey="display_name" active={sortKey === "display_name"} ascending={ascending} onClick={handleSort} className="flex-1 !text-left" />
        <SortHeader label="Buy" sortKey="buy_rate" active={sortKey === "buy_rate"} ascending={ascending} onClick={handleSort} className="shrink-0 w-12" />
        <SortHeader label="WR Diff" sortKey="wr_diff" active={sortKey === "wr_diff"} ascending={ascending} onClick={handleSort} className={`shrink-0 ${debug ? "w-28" : "w-14"}`} />
        {debug && (
          <SortHeader label="N" sortKey="match_games" active={sortKey === "match_games"} ascending={ascending} onClick={handleSort} className="shrink-0 w-10" />
        )}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 px-3 pb-2">
        {sorted.map((item) => (
          <ItemRow key={item.item_id} item={item} debug={debug} />
        ))}
        {sorted.length === 0 && (
          <p className="text-zinc-500 text-sm text-center py-8">No data yet</p>
        )}
      </div>
    </div>
  );
}
