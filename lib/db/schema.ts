import {
  pgTable,
  bigint,
  boolean,
  integer,
  text,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";

// ─── Raw match store ──────────────────────────────────────────────────────────

export const matches = pgTable("matches", {
  match_id:       bigint("match_id", { mode: "number" }).primaryKey(),
  ingested_at:    timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
  start_time:     timestamp("start_time", { withTimezone: true }).notNull(),
  radiant_win:    boolean("radiant_win").notNull(),
  avg_rank_tier:  integer("avg_rank_tier").notNull(),
  // hero ids for each team stored as individual columns (simpler than arrays for Drizzle)
  radiant_0: integer("radiant_0").notNull(),
  radiant_1: integer("radiant_1").notNull(),
  radiant_2: integer("radiant_2").notNull(),
  radiant_3: integer("radiant_3").notNull(),
  radiant_4: integer("radiant_4").notNull(),
  dire_0:    integer("dire_0").notNull(),
  dire_1:    integer("dire_1").notNull(),
  dire_2:    integer("dire_2").notNull(),
  dire_3:    integer("dire_3").notNull(),
  dire_4:    integer("dire_4").notNull(),
});

// One row per (match, hero, item) — only completed non-component items.
// time_s is when the item appeared in purchase_log (game seconds).
export const item_timings = pgTable("item_timings", {
  match_id: bigint("match_id", { mode: "number" }).notNull(),
  hero_id:  integer("hero_id").notNull(),
  item_id:  integer("item_id").notNull(),
  time_s:   integer("time_s").notNull(),
  won:      boolean("won").notNull(),
}, (t) => [primaryKey({ columns: [t.match_id, t.hero_id, t.item_id] })]);

// ─── Marginal win rate tables ─────────────────────────────────────────────────

// Team-level item win rates conditioned on a context hero being present.
// "When anyone buys item X and hero Y is on the enemy/ally team, what's the win rate?"
// Team-level: no hero_id dimension, so much denser than per-hero tables.
export const item_marginal_win_rates = pgTable("item_marginal_win_rates", {
  item_id:          integer("item_id").notNull(),
  context_hero_id:  integer("context_hero_id").notNull(), // the enemy or ally hero
  context_side:     text("context_side").notNull(),        // 'enemy' | 'ally'
  before_minute:    integer("before_minute").notNull(),    // 10 | 20 | 30 | 40 | 50 | 999
  games:            integer("games").notNull(),            // purchase-event-level count
  wins:             integer("wins").notNull(),
  match_games:      integer("match_games").notNull().default(0), // match-level deduped: unique matches where item was bought
  match_wins:       integer("match_wins").notNull().default(0),  // wins among those unique matches
  updated_at:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.item_id, t.context_hero_id, t.context_side, t.before_minute] })]);

// Total matches per context hero — used to compute "WR when item NOT bought"
// total_matches - match_games = matches where item was not bought
export const context_hero_totals = pgTable("context_hero_totals", {
  context_hero_id:  integer("context_hero_id").notNull(),
  context_side:     text("context_side").notNull(),
  total_matches:    integer("total_matches").notNull(),
  total_wins:       integer("total_wins").notNull(),    // wins from the buyer's team perspective
  updated_at:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.context_hero_id, t.context_side] })]);

// Unconditional item win rates — "when anyone buys item X, what's the win rate?"
// Used as the baseline for computing diffs.
export const item_baseline_win_rates = pgTable("item_baseline_win_rates", {
  item_id:          integer("item_id").notNull(),
  before_minute:    integer("before_minute").notNull(),
  games:            integer("games").notNull(),
  wins:             integer("wins").notNull(),
  updated_at:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.item_id, t.before_minute] })]);
