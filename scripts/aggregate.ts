/**
 * Aggregate script — reads raw match + item_timings and writes pre-computed
 * win rates into item_win_rates for fast lookup by /api/analyze.
 *
 * Run via: npx tsx scripts/aggregate.ts
 * Or triggered by Vercel Cron via POST /api/cron/aggregate
 *
 * Output rows in item_win_rates:
 *   (hero_id, item_id, opponent_hero_id=-1, before_minute) → overall baseline
 *   (hero_id, item_id, opponent_hero_id=X,  before_minute) → vs specific enemy
 *
 * before_minute buckets: 10, 20, 30, 40, 50, 999 (999 = any time / item purchased at all)
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "../lib/db/client";
import { matches, item_timings, item_win_rates, item_marginal_win_rates, item_baseline_win_rates } from "../lib/db/schema";
import { eq, sql } from "drizzle-orm";

const BEFORE_MINUTES = [10, 20, 30, 40, 50, 999] as const;
const OVERALL_SENTINEL = -1; // opponent_hero_id value meaning "vs anyone"

type BeforeMinute = typeof BEFORE_MINUTES[number];

interface RawRow extends Record<string, unknown> {
  match_id: number;
  hero_id: number;
  item_id: number;
  time_s: number;
  won: boolean;
  opp_0: number; opp_1: number; opp_2: number; opp_3: number; opp_4: number;
}

// ─── Aggregation logic ────────────────────────────────────────────────────────

function timeToBucket(time_s: number): BeforeMinute[] {
  const minutes = time_s / 60;
  return BEFORE_MINUTES.filter((b) => b === 999 || minutes < b);
}

export async function runAggregate(): Promise<{ rows_written: number }> {
  console.log("[aggregate] Loading raw item timing data...");

  // Join item_timings with matches to get opponent hero ids alongside each timing row.
  // We join on match_id and derive opponents from the match hero columns.
  // For a radiant player (hero in radiant_0..4), opponents are dire_0..4 and vice versa.
  const raw = await db.execute<RawRow>(sql`
    SELECT
      it.match_id,
      it.hero_id,
      it.item_id,
      it.time_s,
      it.won,
      CASE WHEN it.hero_id IN (m.radiant_0, m.radiant_1, m.radiant_2, m.radiant_3, m.radiant_4)
        THEN m.dire_0    ELSE m.radiant_0 END AS opp_0,
      CASE WHEN it.hero_id IN (m.radiant_0, m.radiant_1, m.radiant_2, m.radiant_3, m.radiant_4)
        THEN m.dire_1    ELSE m.radiant_1 END AS opp_1,
      CASE WHEN it.hero_id IN (m.radiant_0, m.radiant_1, m.radiant_2, m.radiant_3, m.radiant_4)
        THEN m.dire_2    ELSE m.radiant_2 END AS opp_2,
      CASE WHEN it.hero_id IN (m.radiant_0, m.radiant_1, m.radiant_2, m.radiant_3, m.radiant_4)
        THEN m.dire_3    ELSE m.radiant_3 END AS opp_3,
      CASE WHEN it.hero_id IN (m.radiant_0, m.radiant_1, m.radiant_2, m.radiant_3, m.radiant_4)
        THEN m.dire_4    ELSE m.radiant_4 END AS opp_4
    FROM item_timings it
    JOIN matches m ON it.match_id = m.match_id
  `);

  console.log(`[aggregate] ${raw.rows.length} raw timing rows loaded`);

  // Accumulate: key → { games, wins }
  // key = "hero_id:item_id:opponent_hero_id:before_minute"
  const acc = new Map<string, { games: number; wins: number }>();

  const bump = (hero_id: number, item_id: number, opp: number, bucket: BeforeMinute, won: boolean) => {
    const k = `${hero_id}:${item_id}:${opp}:${bucket}`;
    const cur = acc.get(k) ?? { games: 0, wins: 0 };
    cur.games++;
    if (won) cur.wins++;
    acc.set(k, cur);
  };

  for (const row of raw.rows) {
    const buckets = timeToBucket(row.time_s);
    const opps = [row.opp_0, row.opp_1, row.opp_2, row.opp_3, row.opp_4];

    for (const bucket of buckets) {
      // Overall baseline (no opponent conditioning)
      bump(row.hero_id, row.item_id, OVERALL_SENTINEL, bucket, row.won);
      // Per-opponent
      for (const opp of opps) {
        bump(row.hero_id, row.item_id, opp, bucket, row.won);
      }
    }
  }

  console.log(`[aggregate] ${acc.size} aggregated (hero, item, opp, bucket) entries`);

  // Write to DB in batches
  const BATCH = 500;
  const entries = [...acc.entries()];
  let rows_written = 0;

  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH).map(([key, { games, wins }]) => {
      const [hero_id, item_id, opponent_hero_id, before_minute] = key.split(":").map(Number);
      return {
        hero_id, item_id,
        opponent_hero_id,
        before_minute,
        games, wins,
        updated_at: new Date(),
      };
    });

    await db
      .insert(item_win_rates)
      .values(batch)
      .onConflictDoUpdate({
        target: [
          item_win_rates.hero_id,
          item_win_rates.item_id,
          item_win_rates.opponent_hero_id,
          item_win_rates.before_minute,
        ],
        set: {
          games: sql`excluded.games`,
          wins: sql`excluded.wins`,
          updated_at: sql`excluded.updated_at`,
        },
      });

    rows_written += batch.length;
    if (i % 10000 === 0 && i > 0) console.log(`[aggregate] Written ${rows_written}...`);
  }

  console.log(`[aggregate] Done. Total rows written: ${rows_written}`);
  return { rows_written };
}

// ─── Marginal aggregation ─────────────────────────────────────────────────────

interface MarginalRawRow extends Record<string, unknown> {
  match_id: number;
  hero_id: number;
  item_id: number;
  time_s: number;
  won: boolean;
  opp_0: number; opp_1: number; opp_2: number; opp_3: number; opp_4: number;
  team_0: number; team_1: number; team_2: number; team_3: number; team_4: number;
}

export async function runMarginalAggregate(): Promise<{ marginal_rows: number; baseline_rows: number }> {
  console.log("[marginal] Loading raw item timing data with team info...");

  const raw = await db.execute<MarginalRawRow>(sql`
    SELECT
      it.match_id,
      it.hero_id,
      it.item_id,
      it.time_s,
      it.won,
      CASE WHEN it.hero_id IN (m.radiant_0, m.radiant_1, m.radiant_2, m.radiant_3, m.radiant_4)
        THEN m.dire_0    ELSE m.radiant_0 END AS opp_0,
      CASE WHEN it.hero_id IN (m.radiant_0, m.radiant_1, m.radiant_2, m.radiant_3, m.radiant_4)
        THEN m.dire_1    ELSE m.radiant_1 END AS opp_1,
      CASE WHEN it.hero_id IN (m.radiant_0, m.radiant_1, m.radiant_2, m.radiant_3, m.radiant_4)
        THEN m.dire_2    ELSE m.radiant_2 END AS opp_2,
      CASE WHEN it.hero_id IN (m.radiant_0, m.radiant_1, m.radiant_2, m.radiant_3, m.radiant_4)
        THEN m.dire_3    ELSE m.radiant_3 END AS opp_3,
      CASE WHEN it.hero_id IN (m.radiant_0, m.radiant_1, m.radiant_2, m.radiant_3, m.radiant_4)
        THEN m.dire_4    ELSE m.radiant_4 END AS opp_4,
      CASE WHEN it.hero_id IN (m.radiant_0, m.radiant_1, m.radiant_2, m.radiant_3, m.radiant_4)
        THEN m.radiant_0 ELSE m.dire_0 END AS team_0,
      CASE WHEN it.hero_id IN (m.radiant_0, m.radiant_1, m.radiant_2, m.radiant_3, m.radiant_4)
        THEN m.radiant_1 ELSE m.dire_1 END AS team_1,
      CASE WHEN it.hero_id IN (m.radiant_0, m.radiant_1, m.radiant_2, m.radiant_3, m.radiant_4)
        THEN m.radiant_2 ELSE m.dire_2 END AS team_2,
      CASE WHEN it.hero_id IN (m.radiant_0, m.radiant_1, m.radiant_2, m.radiant_3, m.radiant_4)
        THEN m.radiant_3 ELSE m.dire_3 END AS team_3,
      CASE WHEN it.hero_id IN (m.radiant_0, m.radiant_1, m.radiant_2, m.radiant_3, m.radiant_4)
        THEN m.radiant_4 ELSE m.dire_4 END AS team_4
    FROM item_timings it
    JOIN matches m ON it.match_id = m.match_id
  `);

  console.log(`[marginal] ${raw.rows.length} raw timing rows loaded`);

  // Accumulate marginal: key = "item_id:context_hero_id:side:bucket"
  const marginal = new Map<string, { games: number; wins: number }>();
  // Accumulate baseline: key = "item_id:bucket"
  const baseline = new Map<string, { games: number; wins: number }>();

  const bumpMap = (map: Map<string, { games: number; wins: number }>, key: string, won: boolean) => {
    const cur = map.get(key) ?? { games: 0, wins: 0 };
    cur.games++;
    if (won) cur.wins++;
    map.set(key, cur);
  };

  for (const row of raw.rows) {
    const buckets = timeToBucket(row.time_s);
    const opps = [row.opp_0, row.opp_1, row.opp_2, row.opp_3, row.opp_4];
    const allies = [row.team_0, row.team_1, row.team_2, row.team_3, row.team_4]
      .filter((id) => id !== row.hero_id);

    for (const bucket of buckets) {
      // Baseline (unconditional)
      bumpMap(baseline, `${row.item_id}:${bucket}`, row.won);
      // Enemy marginals
      for (const opp of opps) {
        bumpMap(marginal, `${row.item_id}:${opp}:enemy:${bucket}`, row.won);
      }
      // Ally marginals (excluding the buyer)
      for (const ally of allies) {
        bumpMap(marginal, `${row.item_id}:${ally}:ally:${bucket}`, row.won);
      }
    }
  }

  console.log(`[marginal] ${marginal.size} marginal entries, ${baseline.size} baseline entries`);

  // Write baseline
  const BATCH = 500;
  const baselineEntries = [...baseline.entries()];
  let baseline_rows = 0;
  for (let i = 0; i < baselineEntries.length; i += BATCH) {
    const batch = baselineEntries.slice(i, i + BATCH).map(([key, { games, wins }]) => {
      const [item_id, before_minute] = key.split(":").map(Number);
      return { item_id, before_minute, games, wins, updated_at: new Date() };
    });
    await db.insert(item_baseline_win_rates).values(batch).onConflictDoUpdate({
      target: [item_baseline_win_rates.item_id, item_baseline_win_rates.before_minute],
      set: { games: sql`excluded.games`, wins: sql`excluded.wins`, updated_at: sql`excluded.updated_at` },
    });
    baseline_rows += batch.length;
  }
  console.log(`[marginal] Baseline rows written: ${baseline_rows}`);

  // Write marginals
  const marginalEntries = [...marginal.entries()];
  let marginal_rows = 0;
  for (let i = 0; i < marginalEntries.length; i += BATCH) {
    const batch = marginalEntries.slice(i, i + BATCH).map(([key, { games, wins }]) => {
      const parts = key.split(":");
      return {
        item_id: Number(parts[0]),
        context_hero_id: Number(parts[1]),
        context_side: parts[2],
        before_minute: Number(parts[3]),
        games, wins,
        updated_at: new Date(),
      };
    });
    await db.insert(item_marginal_win_rates).values(batch).onConflictDoUpdate({
      target: [
        item_marginal_win_rates.item_id,
        item_marginal_win_rates.context_hero_id,
        item_marginal_win_rates.context_side,
        item_marginal_win_rates.before_minute,
      ],
      set: { games: sql`excluded.games`, wins: sql`excluded.wins`, updated_at: sql`excluded.updated_at` },
    });
    marginal_rows += batch.length;
    if (i % 10000 === 0 && i > 0) console.log(`[marginal] Written ${marginal_rows}...`);
  }

  console.log(`[marginal] Done. Marginal: ${marginal_rows}, baseline: ${baseline_rows}`);
  return { marginal_rows, baseline_rows };
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

if (process.argv[1]?.endsWith("aggregate.ts")) {
  Promise.all([runAggregate(), runMarginalAggregate()])
    .then(([r1, r2]) => {
      console.log("[aggregate] Complete:", r1, r2);
      process.exit(0);
    })
    .catch((e) => { console.error("[aggregate] Error:", e); process.exit(1); });
}
