import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// DATABASE_URL is set in .env.local (and Vercel env vars).
// Neon's serverless driver works over HTTP — no persistent connection needed.
// Lazy getter so the build doesn't fail when DATABASE_URL isn't set at build time.
let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL environment variable is not set");
    _db = drizzle(neon(url), { schema });
  }
  return _db;
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getDb() as any)[prop];
  },
});
export type Db = ReturnType<typeof getDb>;
