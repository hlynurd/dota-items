import type { HeroBuild } from "@/lib/agent/types";
import { POSITION_LABELS } from "@/lib/agent/types";
import { heroImgUrl, itemImgUrl } from "@/lib/utils/cdn";
import ItemChip from "./ItemChip";

const PHASES: { key: keyof HeroBuild["phases"]; label: string }[] = [
  { key: "starting", label: "Starting Items" },
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
          {posLabel && (
            <span className="text-xs text-zinc-400 font-mono uppercase tracking-wide">
              {posLabel}
            </span>
          )}
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
                      {bucket.top_items.slice(0, 3).map((item, idx) => {
                        const delta = item.matchup_delta;
                        const deltaColor = delta >= 0 ? "text-green-400" : "text-red-400";
                        const sign = delta >= 0 ? "+" : "";
                        return (
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
                                  {(item.base_win_rate * 100).toFixed(1)}%{" "}
                                  <span className={`${deltaColor} font-mono`}>
                                    {sign}{(Math.abs(delta) * 100).toFixed(1)}%
                                  </span>
                                </span>
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
