import type { HeroBuild } from "@/lib/agent/types";
import { POSITION_LABELS } from "@/lib/agent/types";
import { heroImgUrl, itemImgUrl } from "@/lib/utils/cdn";
import ItemChip from "./ItemChip";

const PHASES: { key: keyof HeroBuild["phases"]; label: string }[] = [
  { key: "early", label: "Early Game" },
  { key: "core", label: "Core" },
  { key: "situational", label: "Situational / Late" },
];

const TIMING_MINUTES = [5, 10, 20, 30, 40, 50] as const;

export default function HeroBuildCard({ build }: { build: HeroBuild }) {
  const { hero, phases, timing_winrates } = build;
  const posLabel = hero.position ? POSITION_LABELS[hero.position] : null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Hero header */}
      <div className="flex items-center gap-4 p-4 border-b border-zinc-800 bg-zinc-900/80">
        <div className="w-24 h-14 rounded overflow-hidden shrink-0 bg-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroImgUrl(hero.name)}
            alt={hero.localized_name}
            className="w-full h-full object-cover object-top"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
        <div>
          <h3 className="font-semibold text-lg">{hero.localized_name}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            {posLabel && (
              <span className="text-xs text-zinc-400 font-mono uppercase tracking-wide">
                {posLabel}
              </span>
            )}
            {build.matchup_delta !== 0 && (
              <span className={`text-xs font-mono ${build.matchup_delta >= 0 ? "text-green-400" : "text-red-400"}`}>
                {build.matchup_delta >= 0 ? "+" : ""}{(build.matchup_delta * 100).toFixed(1)}% vs this lineup
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-5">
        {/* Item phases */}
        {PHASES.map(({ key, label }) => {
          const items = phases[key];
          if (!items?.length) return null;
          return (
            <div key={key}>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">
                {label}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {items.map((item) => (
                  <ItemChip key={item.item_id} item={item} />
                ))}
              </div>
            </div>
          );
        })}

        {/* Win rate timeline */}
        {timing_winrates?.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
              Win Rate by Minute
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-zinc-600">
                    <th className="text-left pb-2 pr-4 font-medium">Minute</th>
                    {[1, 2, 3].map((n) => (
                      <th key={n} className="text-left pb-2 pr-4 font-medium">#{n} Item</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timing_winrates.map((bucket) => (
                    <tr key={bucket.before_minute} className="border-t border-zinc-800">
                      <td className="py-2 pr-4 text-zinc-500 font-mono whitespace-nowrap">
                        &lt;{bucket.before_minute}m
                      </td>
                      {bucket.top_items.slice(0, 3).map((item, idx) => (
                        <td key={idx} className="py-2 pr-4">
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-5 rounded overflow-hidden bg-zinc-800 shrink-0">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={itemImgUrl(item.item_name)}
                                alt={item.display_name}
                                className="w-full h-full object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                            </div>
                            <div>
                              <span className="text-zinc-300 truncate block max-w-[80px]">
                                {item.display_name}
                              </span>
                              <span className="text-zinc-500">
                                {(item.win_rate * 100).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {/* Debug: item × enemy game counts (collapsed by default) */}
        {(() => {
          const phaseItems = PHASES.flatMap(({ key }) => phases[key] ?? [])
            .filter((item) => item.debug && item.debug.length > 0);
          // Deduplicate timing items vs phase items by item_id
          const phaseItemIds = new Set(phaseItems.map((i) => i.item_id));
          const timingItems = timing_winrates
            .flatMap((b) => b.top_items)
            .filter((item) => item.debug && item.debug.length > 0 && !phaseItemIds.has(item.item_id))
            .filter((item, idx, arr) => arr.findIndex((x) => x.item_id === item.item_id) === idx);

          const allItems = [...phaseItems, ...timingItems];
          if (!allItems.length) return null;
          const enemies = allItems[0].debug!;

          return (
            <details className="mt-1">
              <summary className="text-xs text-zinc-700 hover:text-zinc-500 cursor-pointer select-none">
                debug: item × enemy coverage
              </summary>
              <div className="overflow-x-auto mt-2">
                <table className="text-xs border-collapse">
                  <thead>
                    <tr className="text-zinc-700">
                      <th className="text-left pb-1 pr-4 font-mono font-normal">item</th>
                      {enemies.map((e) => (
                        <th key={e.hero_id} className="text-left pb-1 pr-3 font-mono font-normal whitespace-nowrap">
                          {e.localized_name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {phaseItems.length > 0 && (
                      <tr>
                        <td colSpan={enemies.length + 1} className="pt-1 pb-0.5 text-zinc-700 font-mono text-xs">
                          — phase items —
                        </td>
                      </tr>
                    )}
                    {phaseItems.map((item) => (
                      <tr key={item.item_id} className="border-t border-zinc-800/40">
                        <td className="py-0.5 pr-4 text-zinc-500 truncate max-w-[100px]">
                          {item.display_name}
                        </td>
                        {item.debug!.map((e) => (
                          <td
                            key={e.hero_id}
                            className="py-0.5 pr-3 font-mono text-zinc-600 whitespace-nowrap"
                            title={`${e.wins}W / ${e.games}G — smoothed ${(e.smoothed_wr * 100).toFixed(1)}%`}
                          >
                            {e.games}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {timingItems.length > 0 && (
                      <tr>
                        <td colSpan={enemies.length + 1} className="pt-2 pb-0.5 text-zinc-700 font-mono text-xs">
                          — timing items —
                        </td>
                      </tr>
                    )}
                    {timingItems.map((item) => (
                      <tr key={item.item_id} className="border-t border-zinc-800/40">
                        <td className="py-0.5 pr-4 text-zinc-500 truncate max-w-[100px]">
                          {item.display_name}
                        </td>
                        {item.debug!.map((e) => (
                          <td
                            key={e.hero_id}
                            className="py-0.5 pr-3 font-mono text-zinc-600 whitespace-nowrap"
                            title={`${e.wins}W / ${e.games}G — smoothed ${(e.smoothed_wr * 100).toFixed(1)}%`}
                          >
                            {e.games}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })()}
      </div>
    </div>
  );
}
