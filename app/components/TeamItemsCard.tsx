"use client";

import { useState, useMemo } from "react";
import type { TeamItemsResult, TeamItemEntry } from "@/lib/agent/types";
import { itemImgUrl } from "@/lib/utils/cdn";

type SortKey = "purchase_lift" | "wr_with" | "wr_without" | "wr_diff" | "match_games";

function ItemRow({ item }: { item: TeamItemEntry }) {
  const wrWithPct = (item.wr_with * 100).toFixed(1);
  const wrWithoutPct = (item.wr_without * 100).toFixed(1);
  const diff = item.wr_with - item.wr_without;
  const diffPct = (Math.abs(diff) * 100).toFixed(1);
  const diffSign = diff >= 0 ? "+" : "-";
  const diffColor = diff >= 0.005 ? "text-green-400" : diff <= -0.005 ? "text-red-400" : "text-zinc-600";
  const purchaseColor = item.purchase_lift >= 1.2 ? "text-green-400" : item.purchase_lift <= 0.8 ? "text-red-400" : "text-zinc-400";

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-zinc-800/50 last:border-0">
      <div className="w-8 h-6 rounded overflow-hidden bg-zinc-800 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={itemImgUrl(item.item_name)}
          alt={item.display_name}
          className="w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      </div>
      <span className="text-sm text-zinc-300 truncate flex-1 min-w-0">{item.display_name}</span>
      <span className={`text-xs font-mono shrink-0 w-12 text-right ${purchaseColor}`}>
        {item.purchase_lift.toFixed(1)}x
      </span>
      <span className="text-xs font-mono text-zinc-400 shrink-0 w-14 text-right">
        {wrWithPct}%
      </span>
      <span className="text-xs font-mono text-zinc-500 shrink-0 w-14 text-right">
        {wrWithoutPct}%
      </span>
      <span className={`text-xs font-mono shrink-0 w-14 text-right ${diffColor}`}>
        {diffSign}{diffPct}%
      </span>
      <span className="text-xs text-zinc-600 font-mono shrink-0 w-10 text-right">
        ({item.match_games})
      </span>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  active,
  ascending,
  onClick,
  className,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  ascending: boolean;
  onClick: (key: SortKey) => void;
  className?: string;
}) {
  const arrow = active ? (ascending ? " \u25B2" : " \u25BC") : "";
  return (
    <button
      onClick={() => onClick(sortKey)}
      className={`text-right hover:text-zinc-300 transition-colors cursor-pointer select-none ${active ? "text-zinc-300" : ""} ${className ?? ""}`}
    >
      {label}{arrow}
    </button>
  );
}

export default function TeamItemsCard({ data }: { data: TeamItemsResult }) {
  const [sortKey, setSortKey] = useState<SortKey>("purchase_lift");
  const [ascending, setAscending] = useState(false);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setAscending(!ascending);
    } else {
      setSortKey(key);
      setAscending(false);
    }
  }

  const sorted = useMemo(() => {
    const items = [...data.all_items];
    items.sort((a, b) => {
      const av = sortKey === "wr_diff" ? a.wr_with - a.wr_without : a[sortKey];
      const bv = sortKey === "wr_diff" ? b.wr_with - b.wr_without : b[sortKey];
      return ascending ? av - bv : bv - av;
    });
    return items;
  }, [data.all_items, sortKey, ascending]);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest">
          Team Item Analysis
        </h2>
        <p className="text-xs text-zinc-600 mt-1">
          Win rates when your team buys vs doesn&apos;t buy each item against their lineup
        </p>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 pb-2 mb-1 border-b border-zinc-800 text-xs text-zinc-600 font-mono">
          <span className="w-8 shrink-0" />
          <span className="flex-1">Item</span>
          <SortHeader label="Buy" sortKey="purchase_lift" active={sortKey === "purchase_lift"} ascending={ascending} onClick={handleSort} className="shrink-0 w-12" />
          <SortHeader label="With" sortKey="wr_with" active={sortKey === "wr_with"} ascending={ascending} onClick={handleSort} className="shrink-0 w-14" />
          <SortHeader label="W/o" sortKey="wr_without" active={sortKey === "wr_without"} ascending={ascending} onClick={handleSort} className="shrink-0 w-14" />
          <SortHeader label="Diff" sortKey="wr_diff" active={sortKey === "wr_diff"} ascending={ascending} onClick={handleSort} className="shrink-0 w-14" />
          <SortHeader label="N" sortKey="match_games" active={sortKey === "match_games"} ascending={ascending} onClick={handleSort} className="shrink-0 w-10" />
        </div>
        <div className="max-h-[600px] overflow-y-auto">
          {sorted.map((item) => (
            <ItemRow key={item.item_id} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}
