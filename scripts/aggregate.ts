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
import { matches, item_timings, item_win_rates } from "../lib/db/schema";
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

if (process.argv[1]?.endsWith("aggregate.ts")) {
  runAggregate()
    .then((r) => { console.log("[aggregate] Done:", r); process.exit(0); })
    .catch((e) => { console.error("[aggregate] Error:", e); process.exit(1); });
}
