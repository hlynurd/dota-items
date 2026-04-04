/**
 * Client-side computation from static data.json.
 * Replaces /api/hero-lookup and /api/item-lookup with pure in-memory operations.
 */

import type { HeroLookupResult, HeroItemEntry, ItemLookupResult, ItemHeroEntry } from "../agent/types";
import type { ItemOption } from "../../app/components/ItemPicker";


// ─── Static data shape (compact tuples from aggregate) ──────────────────────

export interface StaticData {
  /** [item_id, context_hero_id, side, match_games, match_wins] */
  m: [number, number, string, number, number][];
  /** [context_hero_id, side, total_matches, total_wins] */
  t: [number, string, number, number][];
  ts: number; // timestamp
}

// ─── Parsed + indexed form ──────────────────────────────────────────────────

interface MarginalRow {
  item_id: number;
  context_hero_id: number;
  side: string;
  match_games: number;
  match_wins: number;
}

interface HeroTotal {
  total_matches: number;
  total_wins: number;
}

export interface IndexedData {
  /** Map<"hero_id:side", MarginalRow[]> — for hero lookups */
  byHero: Map<string, MarginalRow[]>;
  /** Map<"item_id:side", MarginalRow[]> — for item lookups */
  byItem: Map<string, MarginalRow[]>;
  /** Map<"hero_id:side", HeroTotal> */
  heroTotals: Map<string, HeroTotal>;
  /** Map<"item_id:side", number> — avg purchase rate across all heroes for this item+side */
  itemBaselineRates: Map<string, number>;
  /** Set of item_ids that have data */
  itemIdsWithData: Set<number>;
  ts: number;
}

export function indexStaticData(raw: StaticData): IndexedData {
  const byHero = new Map<string, MarginalRow[]>();
  const byItem = new Map<string, MarginalRow[]>();
  const heroTotals = new Map<string, HeroTotal>();
  const itemIdsWithData = new Set<number>();

  // Index hero totals
  for (const [hero_id, side, total_matches, total_wins] of raw.t) {
    heroTotals.set(`${hero_id}:${side}`, { total_matches, total_wins });
  }

  // Index marginals
  for (const [item_id, context_hero_id, side, match_games, match_wins] of raw.m) {
    const row: MarginalRow = { item_id, context_hero_id, side, match_games, match_wins };

    const heroKey = `${context_hero_id}:${side}`;
    let heroArr = byHero.get(heroKey);
    if (!heroArr) { heroArr = []; byHero.set(heroKey, heroArr); }
    heroArr.push(row);

    const itemKey = `${item_id}:${side}`;
    let itemArr = byItem.get(itemKey);
    if (!itemArr) { itemArr = []; byItem.set(itemKey, itemArr); }
    itemArr.push(row);

    if (side === "enemy") itemIdsWithData.add(item_id);
  }

  // Compute per-item baseline purchase rates (avg across all heroes for each item+side)
  const itemBaselineRates = new Map<string, number>();
  for (const [key, rows] of byItem) {
    const side = key.split(":")[1];
    let sumRates = 0;
    let count = 0;
    for (const row of rows) {
      const ht = heroTotals.get(`${row.context_hero_id}:${side}`);
      if (ht && ht.total_matches > 0) {
        sumRates += row.match_games / ht.total_matches;
        count++;
      }
    }
    if (count > 0) itemBaselineRates.set(key, sumRates / count);
  }

  return { byHero, byItem, heroTotals, itemBaselineRates, itemIdsWithData, ts: raw.ts };
}

// ─── Compute functions (replace API routes) ─────────────────────────────────

export function computeHeroLookup(
  data: IndexedData,
  heroId: number,
  heroName: string,
  side: "enemy" | "ally",
  itemsById: Map<number, { name: string; dname: string }>,
  allowedItemIds: Set<number>,
): HeroLookupResult {
  const rows = data.byHero.get(`${heroId}:${side}`) ?? [];
  const ht = data.heroTotals.get(`${heroId}:${side}`);
  const totalMatches = ht?.total_matches ?? 0;
  const totalWins = ht?.total_wins ?? 0;

  const items: HeroItemEntry[] = rows
    .filter((r) => allowedItemIds.has(r.item_id))
    .map((r) => {
      const wrWith = r.match_games > 0 ? r.match_wins / r.match_games : 0;
      const withoutGames = totalMatches - r.match_games;
      const withoutWins = totalWins - r.match_wins;
      const wrWithout = withoutGames > 0 ? withoutWins / withoutGames : 0;
      const diff = wrWith - wrWithout;
      const heroRate = totalMatches > 0 ? r.match_games / totalMatches : 0;
      const baseline = data.itemBaselineRates.get(`${r.item_id}:${side}`) ?? heroRate;
      const buyRate = baseline > 0 ? heroRate / baseline : 1;
      const info = itemsById.get(r.item_id);
      return {
        item_id: r.item_id,
        item_name: info?.name ?? "unknown",
        display_name: info?.dname ?? "Unknown",
        buy_rate: Math.round(buyRate * 100) / 100,
        wr_with: Math.round(wrWith * 10000) / 10000,
        wr_without: Math.round(wrWithout * 10000) / 10000,
        diff: Math.round(diff * 10000) / 10000,
        match_games: r.match_games,
      };
    });

  return { hero_id: heroId, hero_name: heroName, side, items };
}

export function computeItemLookup(
  data: IndexedData,
  itemId: number,
  itemName: string,
  displayName: string,
  side: "enemy" | "ally",
  heroesById: Map<number, { localized_name: string; name: string }>,
): ItemLookupResult {
  const rows = data.byItem.get(`${itemId}:${side}`) ?? [];

  // Buy rate baseline: avg purchase rate across all heroes for this item
  const rates = rows.map((r) => {
    const ht = data.heroTotals.get(`${r.context_hero_id}:${side}`);
    return ht && ht.total_matches > 0 ? r.match_games / ht.total_matches : 0;
  });
  const avgRate = rates.length > 0 ? rates.reduce((s, r) => s + r, 0) / rates.length : 1;

  const heroes: ItemHeroEntry[] = rows.map((r) => {
    const ht = data.heroTotals.get(`${r.context_hero_id}:${side}`);
    const totalMatches = ht?.total_matches ?? 0;
    const totalWins = ht?.total_wins ?? 0;
    const wrWith = r.match_games > 0 ? r.match_wins / r.match_games : 0;
    const withoutGames = totalMatches - r.match_games;
    const withoutWins = totalWins - r.match_wins;
    const wrWithout = withoutGames > 0 ? withoutWins / withoutGames : 0;
    const diff = wrWith - wrWithout;
    const heroRate = totalMatches > 0 ? r.match_games / totalMatches : 0;
    const buyRate = avgRate > 0 ? heroRate / avgRate : 1;
    const hero = heroesById.get(r.context_hero_id);
    return {
      hero_id: r.context_hero_id,
      hero_name: hero?.localized_name ?? "Unknown",
      hero_internal_name: hero?.name ?? "",
      wr_with: Math.round(wrWith * 10000) / 10000,
      wr_without: Math.round(wrWithout * 10000) / 10000,
      diff: Math.round(diff * 10000) / 10000,
      buy_rate: Math.round(buyRate * 100) / 100,
      match_games: r.match_games,
    };
  });

  return { item_id: itemId, item_name: itemName, display_name: displayName, heroes };
}
