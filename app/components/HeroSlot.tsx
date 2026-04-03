import type { Hero } from "@/lib/agent/types";
import { POSITION_LABELS } from "@/lib/agent/types";
import { heroImgUrl } from "@/lib/utils/cdn";

interface Props {
  hero: Hero | null;
  slot: number;           // 0-indexed row; determines default position
  side: "radiant" | "dire";
  onOpenPicker: () => void;
  onUncertainToggle: () => void;
  onRemove: () => void;
}

export default function HeroSlot({ hero, slot, side, onOpenPicker, onUncertainToggle, onRemove }: Props) {
  const rowPosition = slot + 1; // row 0 → pos 1
  const accent = side === "radiant"
    ? "border-green-800 hover:border-green-600"
    : "border-red-900 hover:border-red-700";
  const emptyAccent = side === "radiant"
    ? "text-green-600 hover:text-green-400"
    : "text-red-700 hover:text-red-500";

  if (!hero) {
    return (
      <button
        onClick={onOpenPicker}
        className={`w-full h-14 rounded-lg border border-dashed border-zinc-700 hover:border-zinc-500
          flex items-center justify-center gap-2 transition-colors text-sm ${emptyAccent}`}
      >
        <span className="text-lg leading-none">+</span>
        <span>
          Pos {rowPosition} — {POSITION_LABELS[rowPosition as keyof typeof POSITION_LABELS]}
        </span>
      </button>
    );
  }

  const isUncertain = hero.position === null;

  return (
    <div className={`flex items-center gap-3 h-14 rounded-lg border ${accent} bg-zinc-900 px-3 transition-colors`}>
      {/* Portrait */}
      <button onClick={onOpenPicker} className="shrink-0 w-20 h-10 overflow-hidden rounded">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={heroImgUrl(hero.name)}
          alt={hero.localized_name}
          className="w-full h-full object-cover object-top"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      </button>

      {/* Name */}
      <span className="flex-1 text-sm font-medium truncate">{hero.localized_name}</span>

      {/* Position label + uncertain toggle */}
      <button
        onClick={onUncertainToggle}
        title={isUncertain ? "Click to assign Pos " + rowPosition : "Click to mark as uncertain role"}
        className={`shrink-0 text-xs rounded px-2 py-1 border transition-colors
          ${isUncertain
            ? "border-yellow-700 text-yellow-500 bg-yellow-950/40 hover:border-yellow-500"
            : "border-zinc-700 text-zinc-400 bg-zinc-800 hover:border-zinc-500 hover:text-zinc-200"
          }`}
      >
        {isUncertain
          ? "uncertain role"
          : `Pos ${rowPosition} — ${POSITION_LABELS[rowPosition as keyof typeof POSITION_LABELS]}`}
      </button>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors text-lg leading-none"
        aria-label="Remove hero"
      >
        ×
      </button>
    </div>
  );
}
