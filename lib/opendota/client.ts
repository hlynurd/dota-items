import type {
  OpenDotaHero,
  OpenDotaItem,
  OpenDotaItemsMap,
  OpenDotaItemPopularity,
  OpenDotaMatchup,
  ExplorerItemRow,
} from "./types";

const BASE_URL = "https://api.opendota.com/api";

async function fetchOpenDota<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    next: { revalidate: 3600 }, // cache for 1 hour (Next.js fetch cache)
  });
  if (!res.ok) {
    throw new Error(`OpenDota API error: ${res.status} on ${path}`);
  }
  return res.json() as Promise<T>;
}

// Full list of all heroes
export async function getHeroes(): Promise<OpenDotaHero[]> {
  return fetchOpenDota<OpenDotaHero[]>("/heroes");
}

// All item constants keyed by internal name (e.g. "blink")
export async function getItemsMap(): Promise<OpenDotaItemsMap> {
  return fetchOpenDota<OpenDotaItemsMap>("/constants/items");
}

// Look up a single item by its numeric id
export async function getItemById(
  itemsMap: OpenDotaItemsMap,
  id: number
): Promise<{ name: string; item: OpenDotaItem } | null> {
  const entry = Object.entries(itemsMap).find(([, item]) => item.id === id);
  if (!entry) return null;
  return { name: entry[0], item: entry[1] };
}

// Item popularity for a hero, broken into game phases
export async function getHeroItemPopularity(
  heroId: number
): Promise<OpenDotaItemPopularity> {
  return fetchOpenDota<OpenDotaItemPopularity>(
    `/heroes/${heroId}/itemPopularity`
  );
}

// Win rate vs every other hero
export async function getHeroMatchups(
  heroId: number
): Promise<OpenDotaMatchup[]> {
  return fetchOpenDota<OpenDotaMatchup[]>(`/heroes/${heroId}/matchups`);
}

// Win rates vs a specific set of enemy hero ids
// Returns filtered matchup rows for only the enemies present in the draft
export async function getMatchupWinRatesVsEnemies(
  heroId: number,
  enemyHeroIds: number[]
): Promise<OpenDotaMatchup[]> {
  const all = await getHeroMatchups(heroId);
  return all.filter((m) => enemyHeroIds.includes(m.hero_id));
}

type ExplorerRow = { item_id: string | number; games: string | number; wins: string | number };

async function fetchExplorer(sql: string): Promise<ExplorerItemRow[]> {
  const res = await fetch(
    `${BASE_URL}/explorer?sql=${encodeURIComponent(sql)}`,
    { next: { revalidate: 86400 } } // 24h cache
  );
  if (!res.ok) throw new Error(`OpenDota explorer error: ${res.status}`);
  const data = await res.json() as { rows: ExplorerRow[]; err: string | null };
  if (data.err) throw new Error(`OpenDota explorer query error: ${data.err}`);
  return data.rows.map(r => ({
    item_id: Number(r.item_id),
    games: Number(r.games),
    wins: Number(r.wins),
  }));
}

// Overall item win rates for heroId across ALL games (no enemy filter).
// Used as the baseline for the matchup diff. Fast — no self-join.
export async function getHeroItemWinRates(heroId: number): Promise<ExplorerItemRow[]> {
  const sql = [
    "SELECT item_id, COUNT(*) as games, SUM(win) as wins FROM (",
    "SELECT unnest(ARRAY[p.item_0,p.item_1,p.item_2,p.item_3,p.item_4,p.item_5]) as item_id,",
    "CASE WHEN (p.player_slot < 128) = m.radiant_win THEN 1 ELSE 0 END as win",
    "FROM player_matches p",
    "JOIN matches m ON p.match_id = m.match_id",
    `WHERE p.hero_id = ${heroId}`,
    ") sub WHERE item_id != 0 GROUP BY item_id ORDER BY games DESC LIMIT 300",
  ].join(" ");
  return fetchExplorer(sql);
}

// Per-item win rate for heroId in games where enemyHeroId was on the opposing team.
// Expensive (full-table self-join) — cached 24h.
export async function getItemWinRatesVsEnemy(
  heroId: number,
  enemyHeroId: number
): Promise<ExplorerItemRow[]> {
  const sql = [
    "SELECT item_id, COUNT(*) as games, SUM(win) as wins FROM (",
    "SELECT unnest(ARRAY[p.item_0,p.item_1,p.item_2,p.item_3,p.item_4,p.item_5]) as item_id,",
    "CASE WHEN (p.player_slot < 128) = m.radiant_win THEN 1 ELSE 0 END as win",
    "FROM player_matches p",
    "JOIN matches m ON p.match_id = m.match_id",
    `JOIN player_matches opp ON p.match_id = opp.match_id AND opp.hero_id = ${enemyHeroId}`,
    "AND (p.player_slot < 128) != (opp.player_slot < 128)",
    `WHERE p.hero_id = ${heroId}`,
    ") sub WHERE item_id != 0 GROUP BY item_id ORDER BY games DESC LIMIT 200",
  ].join(" ");
  return fetchExplorer(sql);
}

// Top N items from a phase bucket by popularity count
export function topItemsFromBucket(
  bucket: Record<string, number>,
  n = 8
): { item_id: number; count: number }[] {
  return Object.entries(bucket)
    .map(([id, count]) => ({ item_id: parseInt(id, 10), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}
