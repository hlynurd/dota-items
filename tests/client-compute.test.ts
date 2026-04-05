/**
 * Tests for client-side computation — the core logic that turns static data
 * into hero/item lookup results displayed in the UI.
 *
 * Covers: indexing, hero lookup, item lookup, buy rate, WR with/without,
 * excluded items, edge cases.
 *
 * Run: npm test
 */

import { describe, it, expect } from "vitest";
import {
  type StaticData,
  indexStaticData,
  computeHeroLookup,
  computeItemLookup,
} from "@/lib/analysis/client-compute";

// ─── Test fixtures ──────────────────────────────────────────────────────────

/** Minimal static data for testing. Hero 1 = "Anti-Mage", Hero 2 = "Axe". Item 116 = BKB, Item 100 = Eul's. */
function makeStaticData(overrides?: Partial<StaticData>): StaticData {
  return {
    // [item_id, context_hero_id, side, match_games, match_wins]
    m: [
      // BKB bought against Axe: 200 games, 120 wins (60% WR)
      [116, 2, "enemy", 200, 120],
      // BKB bought against Anti-Mage: 150 games, 70 wins (46.7% WR)
      [116, 1, "enemy", 150, 70],
      // Eul's bought against Axe: 100 games, 55 wins (55% WR)
      [100, 2, "enemy", 100, 55],
      // Eul's bought against Anti-Mage: 80 games, 40 wins (50% WR)
      [100, 1, "enemy", 80, 40],
      // BKB ally-side with Anti-Mage: 180 games, 100 wins
      [116, 1, "ally", 180, 100],
      // Item with too few games (should be filtered at match_games < 5)
      [999, 2, "enemy", 3, 2],
    ],
    // [context_hero_id, side, total_matches, total_wins]
    t: [
      // Axe as enemy: 500 matches, 240 wins (48% WR from buyer's perspective)
      [2, "enemy", 500, 240],
      // Anti-Mage as enemy: 400 matches, 200 wins (50% WR)
      [1, "enemy", 400, 200],
      // Anti-Mage as ally: 400 matches, 210 wins
      [1, "ally", 400, 210],
    ],
    ts: Date.now(),
    ...overrides,
  };
}

const ITEMS_BY_ID = new Map([
  [116, { name: "black_king_bar", dname: "Black King Bar" }],
  [100, { name: "cyclone", dname: "Eul's Scepter of Divinity" }],
  [999, { name: "test_item", dname: "Test Item" }],
]);

const HEROES_BY_ID = new Map([
  [1, { localized_name: "Anti-Mage", name: "npc_dota_hero_antimage" }],
  [2, { localized_name: "Axe", name: "npc_dota_hero_axe" }],
]);

// ─── indexStaticData ────────────────────────────────────────────────────────

describe("indexStaticData", () => {
  it("indexes marginals by hero and item", () => {
    const idx = indexStaticData(makeStaticData());
    // Hero 2 (Axe) as enemy should have BKB, Eul's, and item 999
    const axeEnemy = idx.byHero.get("2:enemy");
    expect(axeEnemy).toBeDefined();
    expect(axeEnemy!.length).toBe(3);

    // Item 116 (BKB) as enemy should have Axe and AM
    const bkbEnemy = idx.byItem.get("116:enemy");
    expect(bkbEnemy).toBeDefined();
    expect(bkbEnemy!.length).toBe(2);
  });

  it("indexes hero totals", () => {
    const idx = indexStaticData(makeStaticData());
    const axeTotal = idx.heroTotals.get("2:enemy");
    expect(axeTotal).toEqual({ total_matches: 500, total_wins: 240 });
  });

  it("computes item baseline purchase rates", () => {
    const idx = indexStaticData(makeStaticData());
    // BKB enemy baseline = avg of (200/500, 150/400) = avg(0.4, 0.375) = 0.3875
    const bkbRate = idx.itemBaselineRates.get("116:enemy");
    expect(bkbRate).toBeCloseTo(0.3875, 4);
  });

  it("tracks itemIdsWithData from enemy side", () => {
    const idx = indexStaticData(makeStaticData());
    expect(idx.itemIdsWithData.has(116)).toBe(true);
    expect(idx.itemIdsWithData.has(100)).toBe(true);
    expect(idx.itemIdsWithData.has(999)).toBe(true); // low-games item still tracked
  });
});

// ─── computeHeroLookup ─────────────────────────────────────────────────────

describe("computeHeroLookup", () => {
  it("returns items bought against an enemy hero", () => {
    const idx = indexStaticData(makeStaticData());
    const allowedIds = new Set([116, 100]);
    const result = computeHeroLookup(idx, 2, "Axe", "enemy", ITEMS_BY_ID, allowedIds);

    expect(result.hero_id).toBe(2);
    expect(result.hero_name).toBe("Axe");
    expect(result.side).toBe("enemy");
    expect(result.items.length).toBe(2);
  });

  it("computes WR with and WR without correctly", () => {
    const idx = indexStaticData(makeStaticData());
    const allowedIds = new Set([116, 100]);
    const result = computeHeroLookup(idx, 2, "Axe", "enemy", ITEMS_BY_ID, allowedIds);

    const bkb = result.items.find((i) => i.item_id === 116)!;
    // WR with = 120/200 = 0.6
    expect(bkb.wr_with).toBeCloseTo(0.6, 2);
    // WR without = (240-120)/(500-200) = 120/300 = 0.4
    expect(bkb.wr_without).toBeCloseTo(0.4, 2);
    // Diff = 0.6 - 0.4 = 0.2
    expect(bkb.diff).toBeCloseTo(0.2, 2);
  });

  it("computes buy rate as ratio to baseline", () => {
    const idx = indexStaticData(makeStaticData());
    const allowedIds = new Set([116, 100]);
    const result = computeHeroLookup(idx, 2, "Axe", "enemy", ITEMS_BY_ID, allowedIds);

    const bkb = result.items.find((i) => i.item_id === 116)!;
    // Hero rate for BKB vs Axe = 200/500 = 0.4
    // Baseline rate for BKB enemy = 0.3875
    // Buy rate = 0.4 / 0.3875 ≈ 1.032
    expect(bkb.buy_rate).toBeCloseTo(1.03, 1);
  });

  it("filters by allowedItemIds", () => {
    const idx = indexStaticData(makeStaticData());
    const onlyBkb = new Set([116]);
    const result = computeHeroLookup(idx, 2, "Axe", "enemy", ITEMS_BY_ID, onlyBkb);
    expect(result.items.length).toBe(1);
    expect(result.items[0].item_id).toBe(116);
  });

  it("returns empty items for hero with no data", () => {
    const idx = indexStaticData(makeStaticData());
    const allowedIds = new Set([116, 100]);
    const result = computeHeroLookup(idx, 999, "Nobody", "enemy", ITEMS_BY_ID, allowedIds);
    expect(result.items).toEqual([]);
  });

  it("resolves item names from itemsById map", () => {
    const idx = indexStaticData(makeStaticData());
    const allowedIds = new Set([116]);
    const result = computeHeroLookup(idx, 2, "Axe", "enemy", ITEMS_BY_ID, allowedIds);
    expect(result.items[0].item_name).toBe("black_king_bar");
    expect(result.items[0].display_name).toBe("Black King Bar");
  });
});

// ─── computeItemLookup ─────────────────────────────────────────────────────

describe("computeItemLookup", () => {
  it("returns heroes that an item is bought against", () => {
    const idx = indexStaticData(makeStaticData());
    const result = computeItemLookup(idx, 116, "black_king_bar", "Black King Bar", "enemy", HEROES_BY_ID);

    expect(result.item_id).toBe(116);
    expect(result.heroes.length).toBe(2); // Axe + AM
  });

  it("computes per-hero WR with/without correctly", () => {
    const idx = indexStaticData(makeStaticData());
    const result = computeItemLookup(idx, 116, "black_king_bar", "BKB", "enemy", HEROES_BY_ID);

    const vsAxe = result.heroes.find((h) => h.hero_id === 2)!;
    expect(vsAxe.wr_with).toBeCloseTo(0.6, 2);
    expect(vsAxe.wr_without).toBeCloseTo(0.4, 2);
    expect(vsAxe.diff).toBeCloseTo(0.2, 2);
  });

  it("computes buy rate relative to avg across heroes", () => {
    const idx = indexStaticData(makeStaticData());
    const result = computeItemLookup(idx, 116, "black_king_bar", "BKB", "enemy", HEROES_BY_ID);

    // Axe rate = 200/500 = 0.4, AM rate = 150/400 = 0.375
    // Avg rate = (0.4 + 0.375) / 2 = 0.3875
    const vsAxe = result.heroes.find((h) => h.hero_id === 2)!;
    expect(vsAxe.buy_rate).toBeCloseTo(0.4 / 0.3875, 1);

    const vsAM = result.heroes.find((h) => h.hero_id === 1)!;
    expect(vsAM.buy_rate).toBeCloseTo(0.375 / 0.3875, 1);
  });

  it("resolves hero names from heroesById map", () => {
    const idx = indexStaticData(makeStaticData());
    const result = computeItemLookup(idx, 116, "black_king_bar", "BKB", "enemy", HEROES_BY_ID);
    const vsAxe = result.heroes.find((h) => h.hero_id === 2)!;
    expect(vsAxe.hero_name).toBe("Axe");
    expect(vsAxe.hero_internal_name).toBe("npc_dota_hero_axe");
  });

  it("returns empty for item with no data", () => {
    const idx = indexStaticData(makeStaticData());
    const result = computeItemLookup(idx, 888, "nope", "Nope", "enemy", HEROES_BY_ID);
    expect(result.heroes).toEqual([]);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("handles empty static data", () => {
    const idx = indexStaticData({ m: [], t: [], ts: 0 });
    expect(idx.byHero.size).toBe(0);
    expect(idx.heroTotals.size).toBe(0);
    const result = computeHeroLookup(idx, 1, "AM", "enemy", ITEMS_BY_ID, new Set([116]));
    expect(result.items).toEqual([]);
  });

  it("handles hero with zero total matches gracefully", () => {
    const data = makeStaticData({
      t: [[99, "enemy", 0, 0]], // hero 99 with 0 matches
      m: [[116, 99, "enemy", 10, 5]],
    });
    const idx = indexStaticData(data);
    const result = computeHeroLookup(idx, 99, "Ghost", "enemy", ITEMS_BY_ID, new Set([116]));
    // Should not crash — WR without should be 0 when total_matches = match_games
    expect(result.items.length).toBe(1);
  });
});
