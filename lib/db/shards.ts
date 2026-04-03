/**
 * Shard DB management. Each shard stores raw matches + item_timings.
 * The primary DB (DATABASE_URL) stores only aggregate tables.
 *
 * Env: SHARD_URLS — comma-separated Neon connection strings.
 * If not set, falls back to DATABASE_URL as a single shard (backwards compat).
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { sql } from "drizzle-orm";

export type ShardDb = ReturnType<typeof drizzle>;

let _shards: ShardDb[] | null = null;

export function getShards(): ShardDb[] {
  if (_shards) return _shards;

  const shardUrls = process.env.SHARD_URLS;
  if (shardUrls) {
    _shards = shardUrls
      .split(",")
      .map((url) => url.trim())
      .filter((url) => url.length > 0)
      .map((url) => drizzle(neon(url), { schema }));
  } else {
    // Fallback: use primary DB as single shard
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Neither SHARD_URLS nor DATABASE_URL is set");
    _shards = [drizzle(neon(url), { schema })];
  }

  if (_shards.length === 0) throw new Error("No shard URLs configured");
  return _shards;
}

/**
 * Get the shard with the fewest matches (for round-robin ingest).
 */
export async function getLeastFullShard(): Promise<{ shard: ShardDb; index: number }> {
  const shards = getShards();
  if (shards.length === 1) return { shard: shards[0], index: 0 };

  const counts = await Promise.all(
    shards.map(async (shard) => {
      try {
        const res = await shard.execute<{ c: string }>(
          sql`SELECT COUNT(*)::text AS c FROM matches`
        );
        return parseInt(res.rows[0]?.c ?? "0", 10);
      } catch {
        return Infinity; // skip broken shards
      }
    })
  );

  let minIdx = 0;
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] < counts[minIdx]) minIdx = i;
  }

  return { shard: shards[minIdx], index: minIdx };
}
