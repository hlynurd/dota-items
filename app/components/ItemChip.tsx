import type { ItemRecommendation } from "@/lib/agent/types";
import { itemImgUrl } from "@/lib/utils/cdn";

interface Props {
  item: ItemRecommendation;
  size?: "sm" | "md";
}

export default function ItemChip({ item, size = "md" }: Props) {
  const winPct = (item.win_rate * 100).toFixed(1);
  const diff = item.win_rate - item.overall_win_rate;
  const diffPct = (Math.abs(diff) * 100).toFixed(1);
  const diffSign = diff >= 0 ? "+" : "−";
  const diffColor = diff >= 0.005 ? "text-green-400" : diff <= -0.005 ? "text-red-400" : "text-zinc-600";

  const confidenceDot: Record<typeof item.confidence, string> = {
    high: "bg-green-500",
    medium: "bg-yellow-500",
    low: "bg-zinc-600",
  };

  return (
    <div className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg px-3 py-2
      border border-zinc-700 transition-colors group">
      {/* Item icon */}
      <div className="shrink-0 w-9 h-7 rounded overflow-hidden bg-zinc-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={itemImgUrl(item.item_name)}
          alt={item.display_name}
          className="w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      </div>

      {/* Name + stats */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`font-medium truncate ${size === "sm" ? "text-xs" : "text-sm"}`}>
            {item.display_name}
          </span>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${confidenceDot[item.confidence]}`} />
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-zinc-400">{winPct}%</span>
          <span className={`text-xs font-mono ${diffColor}`}>
            {diffSign}{diffPct}% vs baseline
          </span>
        </div>
      </div>
    </div>
  );
}
