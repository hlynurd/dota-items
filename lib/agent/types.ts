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
  win_rate: number; // 0–1
  confidence: Confidence;
  justification: string; // one sentence from agent
}

export interface TimingBucket {
  before_minute: 5 | 10 | 20 | 30 | 40 | 50;
  top_items: {
    item_id: number;
    item_name: string;
    display_name: string;
    win_rate: number;
  }[];
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
