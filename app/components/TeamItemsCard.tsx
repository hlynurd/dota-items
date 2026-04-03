import type { TeamItemsResult, TeamItemEntry } from "@/lib/agent/types";
import { itemImgUrl } from "@/lib/utils/cdn";

function ItemRow({ item }: { item: TeamItemEntry }) {
  const wrPct = (item.lineup_wr * 100).toFixed(1);
  const liftPct = (Math.abs(item.lift) * 100).toFixed(1);
  const liftSign = item.lift >= 0 ? "+" : "-";
  const liftColor = item.lift >= 0.005 ? "text-green-400" : item.lift <= -0.005 ? "text-red-400" : "text-zinc-600";
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
      <span className={`text-sm font-mono shrink-0 ${purchaseColor}`}>
        {item.purchase_lift.toFixed(1)}x
      </span>
      <span className="text-xs font-mono text-zinc-400 shrink-0 w-14 text-right">
        {wrPct}%
      </span>
      <span className={`text-xs font-mono shrink-0 w-14 text-right ${liftColor}`}>
        {liftSign}{liftPct}%
      </span>
      <span className="text-xs text-zinc-600 font-mono shrink-0 w-10 text-right">
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
          Items most bought against their lineup, with win rate and lift vs baseline
        </p>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 pb-2 mb-1 border-b border-zinc-800 text-xs text-zinc-600 font-mono">
          <span className="w-8 shrink-0" />
          <span className="flex-1">Item</span>
          <span className="shrink-0 w-10 text-right">Buy</span>
          <span className="shrink-0 w-14 text-right">WR</span>
          <span className="shrink-0 w-14 text-right">Lift</span>
          <span className="shrink-0 w-10 text-right">N</span>
        </div>
        {data.top_by_purchase.map((item) => (
          <ItemRow key={item.item_id} item={item} />
        ))}
      </div>
    </div>
  );
}
