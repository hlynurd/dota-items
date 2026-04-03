import type { Hero } from "@/lib/agent/types";
import HeroSlot from "./HeroSlot";

interface Props {
  radiant: (Hero | null)[];
  dire: (Hero | null)[];
  isAnalyzing: boolean;
  statusMessage: string;
  onOpenPicker: (side: "radiant" | "dire", slot: number) => void;
  onUncertainToggle: (side: "radiant" | "dire", slot: number) => void;
  onHeroRemove: (side: "radiant" | "dire", slot: number) => void;
  onAnalyze: () => void;
}

export default function DraftBoard({
  radiant,
  dire,
  isAnalyzing,
  statusMessage,
  onOpenPicker,
  onUncertainToggle,
  onHeroRemove,
  onAnalyze,
}: Props) {
  const anyHero = [...radiant, ...dire].some(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Radiant */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm font-semibold text-green-400 uppercase tracking-widest">
              Radiant
            </span>
          </div>
          {radiant.map((hero, i) => (
            <HeroSlot
              key={i}
              hero={hero}
              slot={i}
              side="radiant"
              onOpenPicker={() => onOpenPicker("radiant", i)}
              onUncertainToggle={() => onUncertainToggle("radiant", i)}
              onRemove={() => onHeroRemove("radiant", i)}
            />
          ))}
        </div>

        {/* Dire */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-sm font-semibold text-red-400 uppercase tracking-widest">
              Dire
            </span>
          </div>
          {dire.map((hero, i) => (
            <HeroSlot
              key={i}
              hero={hero}
              slot={i}
              side="dire"
              onOpenPicker={() => onOpenPicker("dire", i)}
              onUncertainToggle={() => onUncertainToggle("dire", i)}
              onRemove={() => onHeroRemove("dire", i)}
            />
          ))}
        </div>
      </div>

      {/* Analyze button + status */}
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={onAnalyze}
          disabled={!anyHero || isAnalyzing}
          className="px-8 py-3 rounded-lg font-semibold text-sm tracking-wide
            bg-red-600 hover:bg-red-500 disabled:bg-zinc-700 disabled:text-zinc-500
            disabled:cursor-not-allowed transition-colors"
        >
          {isAnalyzing ? "Analyzing..." : "Analyze Draft"}
        </button>
        {statusMessage && (
          <p className="text-sm text-zinc-400 animate-pulse">{statusMessage}</p>
        )}
      </div>
    </div>
  );
}
