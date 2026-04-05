"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { OpenDotaItem } from "@/lib/opendota/types";
import { itemImgUrl } from "@/lib/utils/cdn";

export interface ItemOption {
  id: number;
  name: string; // internal name e.g. "blink"
  dname: string; // display name e.g. "Blink Dagger"
  cost: number;
  basic: boolean; // true = no components (bought directly from shop)
}

interface Props {
  items: ItemOption[];
  onSelect: (item: ItemOption) => void;
  onClose: () => void;
}

export default function ItemPicker({ items, onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? items.filter(
          (item) =>
            item.dname.toLowerCase().includes(q) ||
            item.name.toLowerCase().includes(q)
        )
      : items;
    return list.sort((a, b) => b.cost - a.cost);
  }, [items, query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm pt-16 px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Pick an item"
    >
      <div
        className="w-full max-w-2xl bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl
          flex flex-col max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-zinc-800">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2
              text-sm placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
          />
        </div>

        <div className="overflow-y-auto p-4">
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelect(item)}
                className="flex flex-col items-center gap-1 group"
              >
                <div className="w-full aspect-[4/3] rounded overflow-hidden border border-zinc-700
                  group-hover:border-zinc-400 transition-colors bg-zinc-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={itemImgUrl(item.name)}
                    alt={item.dname}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
                <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors
                  text-center leading-tight truncate w-full">
                  {item.dname}
                </span>
                <span className="text-[10px] text-yellow-600/80">{item.cost}g</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="col-span-6 text-zinc-500 text-sm text-center py-4">
                No items found
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
