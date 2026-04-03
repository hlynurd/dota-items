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

// Per-enemy breakdown included in ItemRecommendation for debugging (legacy hero-specific)
export interface ItemDebugEntry {
  hero_id: number;
  localized_name: string;
  games: number;
  wins: number;
  smoothed_wr: number;
}

// Marginal debug: team-level item stats conditioned on a context hero
export interface MarginalDebugEntry {
  hero_id: number;
  localized_name: string;
  side: "enemy" | "ally";
  games: number;
  wins: number;
  marginal_wr: number;  // win rate when this item is bought and this hero is present
  baseline_wr: number;  // win rate when this item is bought regardless of context
  diff: number;          // marginal_wr - baseline_wr
}

export interface ItemRecommendation {
  item_id: number;
  item_name: string; // internal name, e.g. "blink"
  display_name: string; // e.g. "Blink Dagger"
  win_rate: number;          // 0–1, combined marginal score vs this lineup
  baseline_win_rate: number; // 0–1, unconditional win rate for this item
  confidence: Confidence;
  enemy_debug?: MarginalDebugEntry[];
  ally_debug?: MarginalDebugEntry[];
  debug?: ItemDebugEntry[]; // legacy, kept for backwards compat
}

export interface TimingBucket {
  before_minute: 5 | 10 | 20 | 30 | 40 | 50;
  top_items: {
    item_id: number;
    item_name: string;
    display_name: string;
    win_rate: number;         // real overall win rate from explorer (or rank proxy fallback)
    overall_games: number;    // total games this hero bought this item (for debug)
    debug?: ItemDebugEntry[]; // per-enemy breakdown, same as phase items
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
    early: ItemRecommendation[];
    core: ItemRecommendation[];
    situational: ItemRecommendation[];
  };
  timing_winrates: TimingBucket[];
}

export interface TeamItemEntry {
  item_id: number;
  item_name: string;
  display_name: string;
  baseline_wr: number;      // unconditional win rate
  lineup_wr: number;        // marginal score vs this lineup
  lift: number;             // lineup_wr - baseline_wr
  purchase_lift: number;    // how much likelier this item is bought vs this lineup (1.0 = same, 2.0 = 2x)
  games: number;            // avg games per enemy context
  enemy_breakdown: MarginalDebugEntry[];
}

export interface TeamItemsResult {
  top_by_winrate: TeamItemEntry[];
  top_by_lift: TeamItemEntry[];
  top_by_purchase: TeamItemEntry[];
}

export interface AgentResponse {
  builds: HeroBuild[];
  draft: DraftInput;
}
