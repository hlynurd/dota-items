/**
 * Data integrity tests — validates the actual data.json used in production.
 * Catches data pipeline issues: missing heroes, corrupt entries, unreasonable values.
 *
 * Run: npm test
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { type StaticData, indexStaticData, type IndexedData } from "@/lib/analysis/client-compute";

let data: StaticData;
let idx: IndexedData;

beforeAll(() => {
  const raw = readFileSync(join(process.cwd(), "public", "data.json"), "utf-8");
  data = JSON.parse(raw);
  idx = indexStaticData(data);
});

// ─── Structural integrity ───────────────────────────────────────────────────

describe("data.json structure", () => {
  it("has marginal and total arrays", () => {
    expect(Array.isArray(data.m)).toBe(true);
    expect(Array.isArray(data.t)).toBe(true);
    expect(data.m.length).toBeGreaterThan(10_000);
    expect(data.t.length).toBeGreaterThan(100);
  });

  it("has a recent timestamp", () => {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    expect(data.ts).toBeGreaterThan(oneWeekAgo);
  });

  it("marginal tuples have correct shape [item_id, hero_id, side, games, wins]", () => {
    for (const row of data.m.slice(0, 100)) {
      expect(row.length).toBe(5);
      expect(typeof row[0]).toBe("number"); // item_id
      expect(typeof row[1]).toBe("number"); // hero_id
      expect(["enemy", "ally"]).toContain(row[2]); // side
      expect(row[3]).toBeGreaterThanOrEqual(5); // match_games >= 5 (pre-filtered)
      expect(row[4]).toBeLessThanOrEqual(row[3]); // wins <= games
      expect(row[4]).toBeGreaterThanOrEqual(0);
    }
  });

  it("hero total tuples have correct shape [hero_id, side, matches, wins]", () => {
    for (const row of data.t) {
      expect(row.length).toBe(4);
      expect(typeof row[0]).toBe("number");
      expect(["enemy", "ally"]).toContain(row[1]);
      expect(row[2]).toBeGreaterThan(0); // total_matches > 0
      expect(row[3]).toBeLessThanOrEqual(row[2]); // wins <= matches
    }
  });
});

// ─── Hero coverage ──────────────────────────────────────────────────────────

describe("hero coverage", () => {
  it("has data for at least 120 unique heroes", () => {
    const heroIds = new Set(data.m.map((r) => r[1]));
    expect(heroIds.size).toBeGreaterThanOrEqual(120);
  });

  it("has hero totals for both enemy and ally sides", () => {
    const enemyHeroes = data.t.filter((r) => r[1] === "enemy");
    const allyHeroes = data.t.filter((r) => r[1] === "ally");
    expect(enemyHeroes.length).toBeGreaterThan(100);
    expect(allyHeroes.length).toBeGreaterThan(100);
  });

  it("popular heroes have substantial data (Pudge, Invoker)", () => {
    // Pudge = 14, Invoker = 74
    const pudgeEnemy = idx.heroTotals.get("14:enemy");
    const invokerEnemy = idx.heroTotals.get("74:enemy");
    expect(pudgeEnemy).toBeDefined();
    expect(pudgeEnemy!.total_matches).toBeGreaterThan(1000);
    expect(invokerEnemy).toBeDefined();
    expect(invokerEnemy!.total_matches).toBeGreaterThan(1000);
  });
});

// ─── Item coverage ──────────────────────────────────────────────────────────

describe("item coverage", () => {
  it("has data for at least 80 unique items", () => {
    const itemIds = new Set(data.m.map((r) => r[0]));
    expect(itemIds.size).toBeGreaterThanOrEqual(80);
  });

  it("core items are present: BKB (116), Blink (1), Mekansm (79)", () => {
    const itemIds = new Set(data.m.map((r) => r[0]));
    expect(itemIds.has(116)).toBe(true); // BKB
    expect(itemIds.has(1)).toBe(true);   // Blink Dagger
    expect(itemIds.has(79)).toBe(true);  // Mekansm
  });

  it("consumables are excluded: Tango (44), TP (46), Clarity (38)", () => {
    const itemIds = new Set(data.m.map((r) => r[0]));
    expect(itemIds.has(44)).toBe(false); // Tango
    expect(itemIds.has(46)).toBe(false); // TP Scroll
    expect(itemIds.has(38)).toBe(false); // Clarity
  });
});

// ─── Win rate sanity ────────────────────────────────────────────────────────

describe("win rate sanity", () => {
  it("overall win rates cluster around 50%", () => {
    // Check hero totals — each hero's total_wins/total_matches should be 30-70%
    for (const [, { total_matches, total_wins }] of idx.heroTotals) {
      if (total_matches < 100) continue;
      const wr = total_wins / total_matches;
      expect(wr).toBeGreaterThan(0.25);
      expect(wr).toBeLessThan(0.75);
    }
  });

  it("median win rate across all entries is close to 50%", () => {
    const wrs = data.m
      .filter((r) => r[3] >= 50)
      .map((r) => r[4] / r[3])
      .sort((a, b) => a - b);
    const median = wrs[Math.floor(wrs.length / 2)];
    expect(median).toBeGreaterThan(0.40);
    expect(median).toBeLessThan(0.60);
  });
});

// ─── Ally-side buyer exclusion ──────────────────────────────────────────────

describe("ally-side buyer exclusion", () => {
  it("ally match_games <= total_matches for each hero", () => {
    for (const row of data.m) {
      if (row[2] !== "ally") continue;
      const heroTotal = idx.heroTotals.get(`${row[1]}:ally`);
      if (!heroTotal) continue;
      expect(row[3]).toBeLessThanOrEqual(heroTotal.total_matches);
    }
  });

  it("enemy match_games <= total_matches for each hero", () => {
    for (const row of data.m) {
      if (row[2] !== "enemy") continue;
      const heroTotal = idx.heroTotals.get(`${row[1]}:enemy`);
      if (!heroTotal) continue;
      expect(row[3]).toBeLessThanOrEqual(heroTotal.total_matches);
    }
  });
});
