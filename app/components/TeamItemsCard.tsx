import type { TeamItemsResult, TeamItemEntry } from "@/lib/agent/types";
import { itemImgUrl } from "@/lib/utils/cdn";

type Mode = "winrate" | "lift" | "purchase";

function ItemRow({ item, mode }: { item: TeamItemEntry; mode: Mode }) {
  const liftColor = (d: number) =>
    d >= 0.005 ? "text-green-400" : d <= -0.005 ? "text-red-400" : "text-zinc-600";

  let stat: React.ReactNode;
  if (mode === "winrate") {
    stat = <span className="text-sm font-mono text-zinc-400 shrink-0">{(item.lineup_wr * 100).toFixed(1)}%</span>;
  } else if (mode === "lift") {
    const pct = (Math.abs(item.lift) * 100).toFixed(1);
    const sign = item.lift >= 0 ? "+" : "-";
    stat = <span className={`text-sm font-mono shrink-0 ${liftColor(item.lift)}`}>{sign}{pct}%</span>;
  } else {
    const color = item.purchase_lift >= 1.2 ? "text-green-400" : item.purchase_lift <= 0.8 ? "text-red-400" : "text-zinc-400";
    stat = <span className={`text-sm font-mono shrink-0 ${color}`}>{item.purchase_lift.toFixed(1)}x</span>;
  }

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
      {stat}
      <span className="text-xs text-zinc-600 font-mono shrink-0 w-12 text-right">
        ({item.games})
      </span>
    </div>
  );
}

export default function TeamItemsCard({ data }: { data: TeamItemsResult }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest">
          Team Item Analysis
        </h2>
        <p className="text-xs text-zinc-600 mt-1">
          Win rates when anyone on your team buys these items against their lineup
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-zinc-800">
        <div className="p-4">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
            Highest Win Rate
          </h3>
          {data.top_by_winrate.map((item) => (
            <ItemRow key={item.item_id} item={item} mode="winrate" />
          ))}
        </div>
        <div className="p-4">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
            Biggest Lift vs Baseline
          </h3>
          {data.top_by_lift.map((item) => (
            <ItemRow key={item.item_id} item={item} mode="lift" />
          ))}
        </div>
        <div className="p-4">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
            Most Bought Against
          </h3>
          {data.top_by_purchase.map((item) => (
            <ItemRow key={item.item_id} item={item} mode="purchase" />
          ))}
        </div>
      </div>
    </div>
  );
}
