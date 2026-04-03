import type { Hero, Position, POSITION_LABELS } from "@/lib/agent/types";
import { heroImgUrl } from "@/lib/utils/cdn";

const POSITIONS: { value: Position; label: string }[] = [
  { value: 1, label: "Pos 1 — Carry" },
  { value: 2, label: "Pos 2 — Mid" },
  { value: 3, label: "Pos 3 — Offlane" },
  { value: 4, label: "Pos 4 — Soft Support" },
  { value: 5, label: "Pos 5 — Hard Support" },
];

interface Props {
  hero: Hero | null;
  side: "radiant" | "dire";
  onOpenPicker: () => void;
  onPositionChange: (pos: Position | null) => void;
  onRemove: () => void;
}

export default function HeroSlot({ hero, side, onOpenPicker, onPositionChange, onRemove }: Props) {
  const accent = side === "radiant" ? "border-green-800 hover:border-green-600" : "border-red-900 hover:border-red-700";
  const emptyAccent = side === "radiant" ? "text-green-600 hover:text-green-400" : "text-red-700 hover:text-red-500";

  if (!hero) {
    return (
      <button
        onClick={onOpenPicker}
        className={`w-full h-14 rounded-lg border border-dashed border-zinc-700 hover:border-zinc-500
          flex items-center justify-center gap-2 text-zinc-600 hover:text-zinc-400
          transition-colors text-sm ${emptyAccent}`}
      >
        <span className="text-lg leading-none">+</span>
        <span>Add hero</span>
      </button>
    );
  }

  return (
    <div className={`flex items-center gap-3 h-14 rounded-lg border ${accent} bg-zinc-900 px-3 transition-colors`}>
      {/* Portrait */}
      <button onClick={onOpenPicker} className="shrink-0 w-20 h-10 overflow-hidden rounded relative">
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

      {/* Position dropdown */}
      <select
        value={hero.position ?? ""}
        onChange={(e) => onPositionChange(e.target.value ? (Number(e.target.value) as Position) : null)}
        className="shrink-0 text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1
          text-zinc-300 hover:border-zinc-500 focus:outline-none focus:border-zinc-400 cursor-pointer"
      >
        <option value="">— role —</option>
        {POSITIONS.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>

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
