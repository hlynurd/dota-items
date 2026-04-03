import {
  pgTable,
  bigint,
  boolean,
  integer,
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

// ─── Aggregated win rate table ────────────────────────────────────────────────

// Pre-computed by aggregate.ts. Read directly by /api/analyze.
// opponent_hero_id = -1 means "vs any opponent" (the overall baseline row).
// before_minute bucket: item was completed before this many minutes into the game.
export const item_win_rates = pgTable("item_win_rates", {
  hero_id:          integer("hero_id").notNull(),
  item_id:          integer("item_id").notNull(),
  opponent_hero_id: integer("opponent_hero_id").notNull(), // -1 = overall baseline
  before_minute:    integer("before_minute").notNull(),    // 10 | 20 | 30 | 40 | 50 | 999 (any time)
  games:            integer("games").notNull(),
  wins:             integer("wins").notNull(),
  updated_at:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.hero_id, t.item_id, t.opponent_hero_id, t.before_minute] })]);
