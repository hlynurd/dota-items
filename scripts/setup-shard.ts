/**
 * Set up raw data tables on a new shard DB.
 * Usage: SHARD_URL=postgres://... npx tsx scripts/setup-shard.ts
 *
 * Creates `matches` and `item_timings` tables if they don't exist.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";

async function main() {
  const url = process.argv[2] || process.env.SHARD_URL;
  if (!url) {
    console.error("Usage: npx tsx scripts/setup-shard.ts <postgres-url>");
    console.error("   or: SHARD_URL=... npx tsx scripts/setup-shard.ts");
    process.exit(1);
  }

  const db = drizzle(neon(url));

  console.log("[setup-shard] Creating tables...");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS matches (
      match_id BIGINT PRIMARY KEY,
      ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      start_time TIMESTAMPTZ NOT NULL,
      radiant_win BOOLEAN NOT NULL,
      avg_rank_tier INTEGER NOT NULL,
      radiant_0 INTEGER NOT NULL,
      radiant_1 INTEGER NOT NULL,
      radiant_2 INTEGER NOT NULL,
      radiant_3 INTEGER NOT NULL,
      radiant_4 INTEGER NOT NULL,
      dire_0 INTEGER NOT NULL,
      dire_1 INTEGER NOT NULL,
      dire_2 INTEGER NOT NULL,
      dire_3 INTEGER NOT NULL,
      dire_4 INTEGER NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS item_timings (
      match_id BIGINT NOT NULL,
      hero_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      time_s INTEGER NOT NULL,
      won BOOLEAN NOT NULL,
      PRIMARY KEY (match_id, hero_id, item_id)
    )
  `);

  const count = await db.execute<{ c: string }>(sql`SELECT COUNT(*)::text AS c FROM matches`);
  console.log(`[setup-shard] Done. Matches in this shard: ${count.rows[0].c}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
