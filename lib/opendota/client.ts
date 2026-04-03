import type {
  OpenDotaHero,
  OpenDotaItem,
  OpenDotaItemsMap,
  OpenDotaItemPopularity,
  OpenDotaMatchup,
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
