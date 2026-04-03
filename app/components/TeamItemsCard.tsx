import type { TeamItemsResult, TeamItemEntry } from "@/lib/agent/types";
import { itemImgUrl } from "@/lib/utils/cdn";

function ItemRow({ item, showLift }: { item: TeamItemEntry; showLift: boolean }) {
  const pct = (item.lineup_wr * 100).toFixed(1);
  const liftPct = (Math.abs(item.lift) * 100).toFixed(1);
  const liftSign = item.lift >= 0 ? "+" : "-";
  const liftColor = item.lift >= 0.005 ? "text-green-400" : item.lift <= -0.005 ? "text-red-400" : "text-zinc-600";

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
      {showLift ? (
        <span className={`text-sm font-mono shrink-0 ${liftColor}`}>
          {liftSign}{liftPct}%
        </span>
      ) : (
        <span className="text-sm font-mono text-zinc-400 shrink-0">{pct}%</span>
      )}
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
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-zinc-800">
        {/* Left column: highest win rate */}
        <div className="p-4">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
            Highest Win Rate
          </h3>
          {data.top_by_winrate.map((item) => (
            <ItemRow key={item.item_id} item={item} showLift={false} />
          ))}
        </div>
        {/* Right column: highest lift */}
        <div className="p-4">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
            Biggest Lift vs Baseline
          </h3>
          {data.top_by_lift.map((item) => (
            <ItemRow key={item.item_id} item={item} showLift={true} />
          ))}
        </div>
      </div>
    </div>
  );
}
