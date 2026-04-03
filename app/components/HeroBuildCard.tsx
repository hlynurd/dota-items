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
        {/* Debug: marginal item × context hero diffs (collapsed by default) */}
        {(() => {
          const allPhaseItems = PHASES.flatMap(({ key }) => phases[key] ?? [])
            .filter((item, idx, arr) => arr.findIndex((x) => x.item_id === item.item_id) === idx);

          if (!allPhaseItems.length || !allPhaseItems[0].enemy_debug?.length) return null;
          const enemies = allPhaseItems[0].enemy_debug!;
          const allies = allPhaseItems[0].ally_debug ?? [];

          const fmtDiff = (d: number) => {
            const pct = (Math.abs(d) * 100).toFixed(1);
            if (d >= 0.005) return `+${pct}%`;
            if (d <= -0.005) return `−${pct}%`;
            return `${pct}%`;
          };
          const diffColor = (d: number) =>
            d >= 0.005 ? "text-green-500" : d <= -0.005 ? "text-red-500" : "text-zinc-600";

          return (
            <details className="mt-1">
              <summary className="text-xs text-zinc-700 hover:text-zinc-500 cursor-pointer select-none">
                debug: marginal item × hero diffs
              </summary>
              <div className="overflow-x-auto mt-2 flex flex-col gap-4">
                {/* Enemy context table */}
                <div>
                  <div className="text-zinc-600 font-mono text-xs mb-1">— vs enemies (team-level) —</div>
                  <table className="text-xs border-collapse">
                    <thead>
                      <tr className="text-zinc-700">
                        <th className="text-left pb-1 pr-4 font-mono font-normal">item</th>
                        <th className="text-left pb-1 pr-3 font-mono font-normal">base</th>
                        {enemies.map((e) => (
                          <th key={e.hero_id} className="text-left pb-1 pr-3 font-mono font-normal whitespace-nowrap">
                            {e.localized_name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allPhaseItems.map((item) => (
                        <tr key={item.item_id} className="border-t border-zinc-800/40">
                          <td className="py-0.5 pr-4 text-zinc-500 truncate max-w-[100px]">
                            {item.display_name}
                          </td>
                          <td className="py-0.5 pr-3 font-mono text-zinc-500">
                            {((item.baseline_win_rate ?? 0.5) * 100).toFixed(0)}%
                          </td>
                          {(item.enemy_debug ?? []).map((e) => (
                            <td
                              key={e.hero_id}
                              className={`py-0.5 pr-3 font-mono whitespace-nowrap ${diffColor(e.diff)}`}
                              title={`${e.wins}W / ${e.games}G — ${(e.marginal_wr * 100).toFixed(1)}% (base ${(e.baseline_wr * 100).toFixed(1)}%)`}
                            >
                              {fmtDiff(e.diff)} <span className="text-zinc-700">({e.games})</span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Ally context table */}
                {allies.length > 0 && (
                  <div>
                    <div className="text-zinc-600 font-mono text-xs mb-1">— with allies (team-level) —</div>
                    <table className="text-xs border-collapse">
                      <thead>
                        <tr className="text-zinc-700">
                          <th className="text-left pb-1 pr-4 font-mono font-normal">item</th>
                          <th className="text-left pb-1 pr-3 font-mono font-normal">base</th>
                          {allies.map((a) => (
                            <th key={a.hero_id} className="text-left pb-1 pr-3 font-mono font-normal whitespace-nowrap">
                              {a.localized_name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {allPhaseItems.map((item) => (
                          <tr key={item.item_id} className="border-t border-zinc-800/40">
                            <td className="py-0.5 pr-4 text-zinc-500 truncate max-w-[100px]">
                              {item.display_name}
                            </td>
                            <td className="py-0.5 pr-3 font-mono text-zinc-500">
                              {((item.baseline_win_rate ?? 0.5) * 100).toFixed(0)}%
                            </td>
                            {(item.ally_debug ?? []).map((a) => (
                              <td
                                key={a.hero_id}
                                className={`py-0.5 pr-3 font-mono whitespace-nowrap ${diffColor(a.diff)}`}
                                title={`${a.wins}W / ${a.games}G — ${(a.marginal_wr * 100).toFixed(1)}% (base ${(a.baseline_wr * 100).toFixed(1)}%)`}
                              >
                                {fmtDiff(a.diff)} <span className="text-zinc-700">({a.games})</span>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </details>
          );
        })()}
      </div>
    </div>
  );
}
