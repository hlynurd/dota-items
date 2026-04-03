"use client";

import { useState, useEffect, useRef } from "react";
import type { OpenDotaHero } from "@/lib/opendota/types";
import { heroImgUrl } from "@/lib/utils/cdn";
import { matchesAlias } from "@/lib/opendota/hero-aliases";

const ATTR_LABELS: Record<string, string> = {
  str: "Strength",
  agi: "Agility",
  int: "Intelligence",
  all: "Universal",
};
const ATTR_ORDER = ["str", "agi", "int", "all"];

interface Props {
  heroes: OpenDotaHero[];
  excludeIds: Set<number>;
  onSelect: (hero: OpenDotaHero) => void;
  onClose: () => void;
}

export default function HeroPicker({ heroes, excludeIds, onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const available = heroes.filter((h) => !excludeIds.has(h.id));

  const filtered = query.trim()
    ? available.filter((h) =>
        h.localized_name.toLowerCase().includes(query.toLowerCase()) ||
        h.name.toLowerCase().includes(query.toLowerCase()) ||
        matchesAlias(h.id, query.trim())
      )
    : null; // null means show grouped view

  const grouped = ATTR_ORDER.reduce<Record<string, OpenDotaHero[]>>((acc, attr) => {
    acc[attr] = available.filter((h) => h.primary_attr === attr);
    return acc;
  }, {});

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm pt-16 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl
          flex flex-col max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search */}
        <div className="p-4 border-b border-zinc-800">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search heroes..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2
              text-sm placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
          />
        </div>

        {/* Hero grid */}
        <div className="overflow-y-auto p-4 flex flex-col gap-4">
          {filtered ? (
            // Search results — flat grid
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {filtered.map((hero) => (
                <HeroCard key={hero.id} hero={hero} onSelect={onSelect} />
              ))}
              {filtered.length === 0 && (
                <p className="col-span-6 text-zinc-500 text-sm text-center py-4">No heroes found</p>
              )}
            </div>
          ) : (
            // Grouped by attribute
            ATTR_ORDER.map((attr) =>
              grouped[attr].length > 0 ? (
                <div key={attr}>
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">
                    {ATTR_LABELS[attr]}
                  </h3>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {grouped[attr].map((hero) => (
                      <HeroCard key={hero.id} hero={hero} onSelect={onSelect} />
                    ))}
                  </div>
                </div>
              ) : null
            )
          )}
        </div>
      </div>
    </div>
  );
}

function HeroCard({ hero, onSelect }: { hero: OpenDotaHero; onSelect: (h: OpenDotaHero) => void }) {
  return (
    <button
      onClick={() => onSelect(hero)}
      className="flex flex-col items-center gap-1 group"
    >
      <div className="w-full aspect-video rounded overflow-hidden border border-zinc-700
        group-hover:border-zinc-400 transition-colors">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={heroImgUrl(hero.name)}
          alt={hero.localized_name}
          className="w-full h-full object-cover object-top"
          onError={(e) => {
            (e.target as HTMLImageElement).src = "";
            (e.target as HTMLImageElement).parentElement!.style.background = "#27272a";
          }}
        />
      </div>
      <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors
        text-center leading-tight truncate w-full">
        {hero.localized_name}
      </span>
    </button>
  );
}
