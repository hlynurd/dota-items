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

export interface ItemRecommendation {
  item_id: number;
  item_name: string; // internal name, e.g. "blink"
  display_name: string; // e.g. "Blink Dagger"
  base_win_rate: number;    // 0–1, general win rate on this hero regardless of matchup
  matchup_delta: number;    // signed float, e.g. +0.04 means +4% better in this specific matchup
  confidence: Confidence;
}

export interface TimingBucket {
  before_minute: 5 | 10 | 20 | 30 | 40 | 50;
  top_items: {
    item_id: number;
    item_name: string;
    display_name: string;
    base_win_rate: number;
    matchup_delta: number;
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
