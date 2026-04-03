export type Position = 1 | 2 | 3 | 4 | 5;

export const POSITION_LABELS: Record<Position, string> = {
  1: "Carry",
  2: "Mid",
  3: "Offlane",
  4: "Soft Support",
  5: "Hard Support",
};

export type HeroAttribute = "str" | "agi" | "int" | "all";

export interface Hero {
  id: number;
  name: string; // npc_dota_hero_antimage
  localized_name: string; // Anti-Mage
  primary_attr: HeroAttribute;
  attack_type: "Melee" | "Ranged";
  roles: string[];
  position: Position | null;
}

export interface DraftInput {
  radiant: Hero[];
  dire: Hero[];
}

export type Confidence = "high" | "medium" | "low";

// Per-enemy breakdown included in ItemRecommendation for debugging
export interface ItemDebugEntry {
  hero_id: number;
  localized_name: string;
  games: number;      // games where hero H bought item I vs this enemy
  wins: number;       // wins among those games
  smoothed_wr: number; // after Bayesian smoothing toward pairwise win rate
}

export interface ItemRecommendation {
  item_id: number;
  item_name: string; // internal name, e.g. "blink"
  display_name: string; // e.g. "Blink Dagger"
  win_rate: number;  // 0–1, smoothed win rate vs this specific enemy lineup
  confidence: Confidence;
  debug?: ItemDebugEntry[]; // per-enemy game counts, omitted in non-debug builds
}

export interface TimingBucket {
  before_minute: 5 | 10 | 20 | 30 | 40 | 50;
  top_items: {
    item_id: number;
    item_name: string;
    display_name: string;
    win_rate: number; // popularity-rank proxy around hero overall win rate
  }[];
}

// Chat window types
export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

// Context passed to the chat agent so it knows the current draft + builds
export interface ChatContext {
  draft: DraftInput;
  builds: HeroBuild[];
}

export interface HeroBuild {
  hero: Hero;
  matchup_delta: number; // signed float — hero's win rate delta vs this specific enemy lineup
  phases: {
    starting: ItemRecommendation[];
    early: ItemRecommendation[];
    core: ItemRecommendation[];
    situational: ItemRecommendation[];
  };
  timing_winrates: TimingBucket[];
}

export interface AgentResponse {
  builds: HeroBuild[];
  draft: DraftInput;
}
