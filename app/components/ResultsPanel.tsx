import type { HeroBuild } from "@/lib/agent/types";
import HeroBuildCard from "./HeroBuildCard";

interface Props {
  builds: HeroBuild[];
  isAnalyzing: boolean;
}

function SkeletonCard() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden animate-pulse">
      <div className="flex items-center gap-4 p-4 border-b border-zinc-800">
        <div className="w-24 h-14 rounded bg-zinc-800" />
        <div className="flex flex-col gap-2">
          <div className="h-4 w-28 bg-zinc-800 rounded" />
          <div className="h-3 w-16 bg-zinc-800 rounded" />
        </div>
      </div>
      <div className="p-4 flex flex-col gap-4">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex flex-col gap-2">
            <div className="h-3 w-24 bg-zinc-800 rounded" />
            <div className="grid grid-cols-2 gap-2">
              <div className="h-12 bg-zinc-800 rounded-lg" />
              <div className="h-12 bg-zinc-800 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ResultsPanel({ builds, isAnalyzing }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest">
        Item Recommendations
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {builds.map((build) => (
          <HeroBuildCard key={build.hero.id} build={build} />
        ))}
        {/* Show skeletons for heroes still being analyzed */}
        {isAnalyzing && <SkeletonCard />}
      </div>
    </div>
  );
}
