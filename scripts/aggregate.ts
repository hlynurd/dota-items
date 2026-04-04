/**
 * Aggregate script — reads raw match + item_timings from ALL shards and writes
 * pre-computed marginal and baseline win rates to the primary DB.
 *
 * Run via: npx tsx scripts/aggregate.ts
 * Or triggered by Vercel Cron via POST /api/cron/aggregate
 *
 * before_minute buckets: 10, 20, 30, 40, 50, 999 (999 = any time / item purchased at all)
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "../lib/db/client";
import { getShards } from "../lib/db/shards";
import { item_marginal_win_rates, item_baseline_win_rates, context_hero_totals } from "../lib/db/schema";
import { sql } from "drizzle-orm";

const BEFORE_MINUTES = [10, 20, 30, 40, 50, 999] as const;

type BeforeMinute = typeof BEFORE_MINUTES[number];

function timeToBucket(time_s: number): BeforeMinute[] {
  const minutes = time_s / 60;
  return BEFORE_MINUTES.filter((b) => b === 999 || minutes < b);
}

interface MarginalRawRow extends Record<string, unknown> {
  match_id: number;
  hero_id: number;
  item_id: number;
  time_s: number;
  won: boolean;
  radiant_win: boolean;
  opp_0: number; opp_1: number; opp_2: number; opp_3: number; opp_4: number;
  team_0: number; team_1: number; team_2: number; team_3: number; team_4: number;
  r0: number; r1: number; r2: number; r3: number; r4: number;
  d0: number; d1: number; d2: number; d3: number; d4: number;
}

export async function runMarginalAggregate(): Promise<{ marginal_rows: number; baseline_rows: number }> {
  const shards = getShards();

  // Truncate aggregate tables to remove stale rows from previous runs
  await db.execute(sql`TRUNCATE ${item_marginal_win_rates}, ${item_baseline_win_rates}, ${context_hero_totals}`);
  console.log(`[marginal] Truncated aggregate tables`);
  console.log(`[marginal] Reading raw data from ${shards.length} shard(s)...`);

  // Purchase-event-level accumulators (existing)
  const marginal = new Map<string, { games: number; wins: number }>();
  const baseline = new Map<string, { games: number; wins: number }>();

  // Match-level accumulators (new): track unique matches per (item, context_hero, side, bucket)
  // Key = same as marginal. Value = Set<match_id> would be too large.
  // Instead, collect per-match item sets and compute match-level counts.
  // Structure: matchItems[match_id] = { items: Set<item_id>, enemies: number[], won: boolean }
  // Match-level dedup uses absolute radiant/dire to avoid perspective bugs.
  // Each side's items are tracked separately with their buyers.
  const matchData = new Map<number, {
    radiant: number[];  // 5 hero ids
    dire: number[];     // 5 hero ids
    radiantWon: boolean;
    radiantItems: Map<number, Set<number>>; // item_id → set of hero_ids who bought it
    direItems: Map<number, Set<number>>;
    timings: Map<number, number>;
  }>();

  const bumpMap = (map: Map<string, { games: number; wins: number }>, key: string, won: boolean) => {
    const cur = map.get(key) ?? { games: 0, wins: 0 };
    cur.games++;
    if (won) cur.wins++;
    map.set(key, cur);
  };

  let totalRawRows = 0;
  for (let s = 0; s < shards.length; s++) {
    const shard = shards[s];

    // Paginate: Neon HTTP has a 67MB response limit, so fetch in chunks by match_id range
    const matchIdResult = await shard.execute<{ min_id: string; max_id: string }>(
      sql`SELECT MIN(match_id)::text AS min_id, MAX(match_id)::text AS max_id FROM matches`
    );
    const minId = parseInt(matchIdResult.rows[0]?.min_id ?? "0", 10);
    const maxId = parseInt(matchIdResult.rows[0]?.max_id ?? "0", 10);
    if (minId === 0 && maxId === 0) { console.log(`[marginal] Shard ${s}: empty`); continue; }

    const CHUNK = 2000; // matches per chunk
    let shardRows = 0;
    let cursor = minId;

    while (cursor <= maxId) {
      const chunkEnd = cursor + CHUNK;
      const raw = await shard.execute<MarginalRawRow>(sql`
        SELECT
          it.match_id, it.hero_id, it.item_id, it.time_s, it.won,
          m.radiant_win,
          m.radiant_0 AS r0, m.radiant_1 AS r1, m.radiant_2 AS r2, m.radiant_3 AS r3, m.radiant_4 AS r4,
          m.dire_0 AS d0, m.dire_1 AS d1, m.dire_2 AS d2, m.dire_3 AS d3, m.dire_4 AS d4,
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
        WHERE m.match_id >= ${cursor} AND m.match_id < ${chunkEnd}
      `);
      shardRows += raw.rows.length;

      for (const row of raw.rows) {
        const buckets = timeToBucket(row.time_s);
        const opps = [row.opp_0, row.opp_1, row.opp_2, row.opp_3, row.opp_4];
        const allies = [row.team_0, row.team_1, row.team_2, row.team_3, row.team_4]
          .filter((id) => id !== row.hero_id);

        for (const bucket of buckets) {
          bumpMap(baseline, `${row.item_id}:${bucket}`, row.won);
          for (const opp of opps) {
            bumpMap(marginal, `${row.item_id}:${opp}:enemy:${bucket}`, row.won);
          }
          for (const ally of allies) {
            bumpMap(marginal, `${row.item_id}:${ally}:ally:${bucket}`, row.won);
          }
        }

        // Collect per-match data for match-level dedup (absolute radiant/dire)
        let md = matchData.get(row.match_id);
        if (!md) {
          md = {
            radiant: [row.r0, row.r1, row.r2, row.r3, row.r4],
            dire: [row.d0, row.d1, row.d2, row.d3, row.d4],
            radiantWon: row.radiant_win,
            radiantItems: new Map(),
            direItems: new Map(),
            timings: new Map(),
          };
          matchData.set(row.match_id, md);
        }
        // Determine which side the buyer is on and track per-side
        const isRadiant = md.radiant.includes(row.hero_id);
        const sideItems = isRadiant ? md.radiantItems : md.direItems;
        let buyers = sideItems.get(row.item_id);
        if (!buyers) { buyers = new Set(); sideItems.set(row.item_id, buyers); }
        buyers.add(row.hero_id);
        const prev = md.timings.get(row.item_id);
        if (prev === undefined || row.time_s < prev) {
          md.timings.set(row.item_id, row.time_s);
        }
      }

      cursor = chunkEnd;
    } // end while (pagination)

    totalRawRows += shardRows;
    console.log(`[marginal] Shard ${s}: ${shardRows} raw rows`);
  } // end for (shards)

  console.log(`[marginal] ${totalRawRows} total raw rows, ${matchData.size} unique matches`);

  // Match-level counts: for each match, for each item bought, bump match_games/match_wins
  // Key = "item_id:context_hero_id:side:bucket"
  const matchLevel = new Map<string, { match_games: number; match_wins: number }>();
  // Also compute context_hero_totals: total matches per (enemy/ally hero)
  const heroTotals = new Map<string, { total_matches: number; total_wins: number }>();

  const bumpMatch = (key: string, won: boolean) => {
    const cur = matchLevel.get(key) ?? { match_games: 0, match_wins: 0 };
    cur.match_games++;
    if (won) cur.match_wins++;
    matchLevel.set(key, cur);
  };

  const bumpTotal = (key: string, won: boolean) => {
    const cur = heroTotals.get(key) ?? { total_matches: 0, total_wins: 0 };
    cur.total_matches++;
    if (won) cur.total_wins++;
    heroTotals.set(key, cur);
  };

  for (const [, md] of matchData) {
    // Hero totals: each hero counted once as enemy (for the other side) and once as ally (for own side)
    for (const hero of md.radiant) {
      bumpTotal(`${hero}:enemy`, !md.radiantWon); // radiant hero is enemy from dire's POV; dire "won" = !radiantWon
      bumpTotal(`${hero}:ally`, md.radiantWon);
    }
    for (const hero of md.dire) {
      bumpTotal(`${hero}:enemy`, md.radiantWon);  // dire hero is enemy from radiant's POV; radiant "won" = radiantWon
      bumpTotal(`${hero}:ally`, !md.radiantWon);
    }

    // Process items bought by radiant
    for (const [item_id, buyers] of md.radiantItems) {
      const time_s = md.timings.get(item_id) ?? 0;
      const buckets = timeToBucket(time_s);
      const won = md.radiantWon;
      for (const bucket of buckets) {
        // Enemy side: radiant bought this item, dire heroes are enemies
        for (const enemy of md.dire) {
          bumpMatch(`${item_id}:${enemy}:enemy:${bucket}`, won);
        }
        // Ally side: radiant heroes who did NOT buy this item
        for (const ally of md.radiant) {
          if (!buyers.has(ally)) {
            bumpMatch(`${item_id}:${ally}:ally:${bucket}`, won);
          }
        }
      }
    }

    // Process items bought by dire
    for (const [item_id, buyers] of md.direItems) {
      const time_s = md.timings.get(item_id) ?? 0;
      const buckets = timeToBucket(time_s);
      const won = !md.radiantWon;
      for (const bucket of buckets) {
        // Enemy side: dire bought this item, radiant heroes are enemies
        for (const enemy of md.radiant) {
          bumpMatch(`${item_id}:${enemy}:enemy:${bucket}`, won);
        }
        // Ally side: dire heroes who did NOT buy this item
        for (const ally of md.dire) {
          if (!buyers.has(ally)) {
            bumpMatch(`${item_id}:${ally}:ally:${bucket}`, won);
          }
        }
      }
    }
  }

  console.log(`[marginal] ${marginal.size} marginal, ${baseline.size} baseline, ${matchLevel.size} match-level, ${heroTotals.size} hero-totals`);

  // Write to PRIMARY DB
  const BATCH = 500;

  // 1. Baseline
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

  // 2. Marginals (merge purchase-event and match-level)
  const marginalEntries = [...marginal.entries()];
  let marginal_rows = 0;
  for (let i = 0; i < marginalEntries.length; i += BATCH) {
    const batch = marginalEntries.slice(i, i + BATCH).map(([key, { games, wins }]) => {
      const parts = key.split(":");
      const ml = matchLevel.get(key) ?? { match_games: 0, match_wins: 0 };
      return {
        item_id: Number(parts[0]),
        context_hero_id: Number(parts[1]),
        context_side: parts[2],
        before_minute: Number(parts[3]),
        games, wins,
        match_games: ml.match_games,
        match_wins: ml.match_wins,
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
      set: {
        games: sql`excluded.games`, wins: sql`excluded.wins`,
        match_games: sql`excluded.match_games`, match_wins: sql`excluded.match_wins`,
        updated_at: sql`excluded.updated_at`,
      },
    });
    marginal_rows += batch.length;
    if (i % 10000 === 0 && i > 0) console.log(`[marginal] Written ${marginal_rows}...`);
  }

  // 3. Hero totals
  const totalEntries = [...heroTotals.entries()];
  for (let i = 0; i < totalEntries.length; i += BATCH) {
    const batch = totalEntries.slice(i, i + BATCH).map(([key, { total_matches, total_wins }]) => {
      const [context_hero_id, context_side] = key.split(":");
      return {
        context_hero_id: Number(context_hero_id),
        context_side,
        total_matches, total_wins,
        updated_at: new Date(),
      };
    });
    await db.insert(context_hero_totals).values(batch).onConflictDoUpdate({
      target: [context_hero_totals.context_hero_id, context_hero_totals.context_side],
      set: {
        total_matches: sql`excluded.total_matches`,
        total_wins: sql`excluded.total_wins`,
        updated_at: sql`excluded.updated_at`,
      },
    });
  }
  console.log(`[marginal] Hero totals written: ${totalEntries.length}`);

  console.log(`[marginal] Done. Marginal: ${marginal_rows}, baseline: ${baseline_rows}`);
  return { marginal_rows, baseline_rows };
}

if (process.argv[1]?.endsWith("aggregate.ts")) {
  runMarginalAggregate()
    .then((result) => { console.log("[aggregate] Complete:", result); process.exit(0); })
    .catch((e) => { console.error("[aggregate] Error:", e); process.exit(1); });
}
