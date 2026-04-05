/**
 * Counter item tests — validates that well-known item-hero counters appear in
 * the data with elevated buy rates.
 *
 * These are community-consensus counter items: MKB vs PA, Silver Edge vs
 * Bristleback, Linken's vs Doom, etc. The test checks that players actually
 * buy these items more often against these heroes (buy_rate > 1.0x).
 *
 * Win rate diff may be positive or negative (selection bias: counter-items
 * are often bought reactively when losing). The key signal is elevated
 * purchase rate.
 *
 * Run: npm test
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { type StaticData, indexStaticData, type IndexedData } from "@/lib/analysis/client-compute";

let data: StaticData;
let idx: IndexedData;

// Lookup helpers
let marginalLookup: Map<string, { match_games: number; match_wins: number }>;
let heroTotalLookup: Map<string, { total_matches: number; total_wins: number }>;

beforeAll(() => {
  const raw = readFileSync(join(process.cwd(), "public", "data.json"), "utf-8");
  data = JSON.parse(raw);
  idx = indexStaticData(data);

  marginalLookup = new Map();
  for (const [item_id, hero_id, side, mg, mw] of data.m) {
    marginalLookup.set(`${item_id}:${hero_id}:${side}`, { match_games: mg, match_wins: mw });
  }
  heroTotalLookup = new Map();
  for (const [hero_id, side, tm, tw] of data.t) {
    heroTotalLookup.set(`${hero_id}:${side}`, { total_matches: tm, total_wins: tw });
  }
});

function getBuyRate(itemId: number, heroId: number): number | null {
  const entry = marginalLookup.get(`${itemId}:${heroId}:enemy`);
  if (!entry) return null;
  const heroTotal = heroTotalLookup.get(`${heroId}:enemy`);
  if (!heroTotal || heroTotal.total_matches === 0) return null;
  const heroRate = entry.match_games / heroTotal.total_matches;

  // Avg rate across all heroes for this item
  const allRates: number[] = [];
  for (const [key, val] of marginalLookup) {
    const [iid, hid, side] = key.split(":");
    if (Number(iid) === itemId && side === "enemy") {
      const ht = heroTotalLookup.get(`${hid}:enemy`);
      if (ht && ht.total_matches > 0) {
        allRates.push(val.match_games / ht.total_matches);
      }
    }
  }
  const avgRate = allRates.length > 0 ? allRates.reduce((s, r) => s + r, 0) / allRates.length : heroRate;
  return avgRate > 0 ? heroRate / avgRate : 1;
}

function hasData(itemId: number, heroId: number): boolean {
  return marginalLookup.has(`${itemId}:${heroId}:enemy`);
}

function getGames(itemId: number, heroId: number): number {
  return marginalLookup.get(`${itemId}:${heroId}:enemy`)?.match_games ?? 0;
}

// ─── Iconic hard counters (buy rate should be significantly elevated) ───────

describe("iconic hard counters (buy rate > 1.5x)", () => {
  // MKB vs Phantom Assassin — True Strike pierces Blur evasion
  it("MKB (135) vs Phantom Assassin (44): buy rate > 2x", () => {
    expect(hasData(135, 44)).toBe(true);
    expect(getBuyRate(135, 44)!).toBeGreaterThan(2.0);
  });

  // Silver Edge vs Bristleback — Break disables Bristleback passive
  it("Silver Edge (249) vs Bristleback (99): buy rate > 2x", () => {
    expect(hasData(249, 99)).toBe(true);
    expect(getBuyRate(249, 99)!).toBeGreaterThan(2.0);
  });

  // Linken's Sphere vs Doom — blocks Doom ultimate
  it("Linken's (123) vs Doom (69): buy rate > 2x", () => {
    expect(hasData(123, 69)).toBe(true);
    expect(getBuyRate(123, 69)!).toBeGreaterThan(2.0);
  });

  // Diffusal Blade vs Medusa — mana burn shreds Mana Shield
  it("Diffusal (174) vs Medusa (94): buy rate > 2x", () => {
    expect(hasData(174, 94)).toBe(true);
    expect(getBuyRate(174, 94)!).toBeGreaterThan(2.0);
  });

  // MKB vs Windranger — True Strike pierces Windrun evasion
  it("MKB (135) vs Windranger (21): buy rate > 1.5x", () => {
    expect(hasData(135, 21)).toBe(true);
    expect(getBuyRate(135, 21)!).toBeGreaterThan(1.5);
  });

  // Mage Slayer vs Leshrac — reduces spell damage from AoE caster
  it("Mage Slayer (598) vs Leshrac (52): buy rate > 1.5x", () => {
    expect(hasData(598, 52)).toBe(true);
    expect(getBuyRate(598, 52)!).toBeGreaterThan(1.5);
  });

  // Lotus Orb vs Doom — Echo Shell reflects Doom ultimate
  it("Lotus Orb (226) vs Doom (69): buy rate > 1.5x", () => {
    expect(hasData(226, 69)).toBe(true);
    expect(getBuyRate(226, 69)!).toBeGreaterThan(1.5);
  });

  // Heaven's Halberd vs Huskar — disarm shuts down attack-based hero
  it("Halberd (210) vs Huskar (59): buy rate > 1.5x", () => {
    expect(hasData(210, 59)).toBe(true);
    expect(getBuyRate(210, 59)!).toBeGreaterThan(1.5);
  });

  // Orchid vs Storm Spirit — silence prevents Ball Lightning escape
  it("Orchid (98) vs Storm Spirit (17): buy rate > 1.5x", () => {
    expect(hasData(98, 17)).toBe(true);
    expect(getBuyRate(98, 17)!).toBeGreaterThan(1.5);
  });
});

// ─── Moderate counters (buy rate elevated but not extreme) ──────────────────

describe("moderate counters (buy rate > 1.1x)", () => {
  // Spirit Vessel vs Necrophos — reduces healing
  it("Spirit Vessel (267) vs Necrophos (36): buy rate > 1.2x", () => {
    expect(hasData(267, 36)).toBe(true);
    expect(getBuyRate(267, 36)!).toBeGreaterThan(1.2);
  });

  // Spirit Vessel vs Huskar — counters Berserker's Blood regen
  it("Spirit Vessel (267) vs Huskar (59): buy rate > 1.2x", () => {
    expect(hasData(267, 59)).toBe(true);
    expect(getBuyRate(267, 59)!).toBeGreaterThan(1.2);
  });

  // Spirit Vessel vs Alchemist — counters Chemical Rage regen
  it("Spirit Vessel (267) vs Alchemist (73): buy rate > 1.1x", () => {
    expect(hasData(267, 73)).toBe(true);
    expect(getBuyRate(267, 73)!).toBeGreaterThan(1.1);
  });

  // Guardian Greaves vs Silencer — purges Global Silence
  it("Guardian Greaves (231) vs Silencer (75): buy rate > 1.1x", () => {
    expect(hasData(231, 75)).toBe(true);
    expect(getBuyRate(231, 75)!).toBeGreaterThan(1.1);
  });

  // Force Staff vs Clockwerk — push out of Power Cogs
  it("Force Staff (102) vs Clockwerk (51): buy rate > 1.3x", () => {
    expect(hasData(102, 51)).toBe(true);
    expect(getBuyRate(102, 51)!).toBeGreaterThan(1.3);
  });

  // Ghost Scepter vs Juggernaut — immunity to Omnislash
  it("Ghost Scepter (37) vs Juggernaut (8): buy rate > 1.2x", () => {
    expect(hasData(37, 8)).toBe(true);
    expect(getBuyRate(37, 8)!).toBeGreaterThan(1.2);
  });

  // Eul's vs Juggernaut — cyclone dodges Omnislash
  it("Eul's (100) vs Juggernaut (8): buy rate > 1.1x", () => {
    expect(hasData(100, 8)).toBe(true);
    expect(getBuyRate(100, 8)!).toBeGreaterThan(1.1);
  });

  // Silver Edge vs Spectre — Break disables Dispersion
  it("Silver Edge (249) vs Spectre (67): buy rate > 1.2x", () => {
    expect(hasData(249, 67)).toBe(true);
    expect(getBuyRate(249, 67)!).toBeGreaterThan(1.2);
  });

  // Diffusal Blade vs Wraith King — drains mana to prevent Reincarnation
  it("Diffusal (174) vs Wraith King (42): buy rate > 1.1x", () => {
    expect(hasData(174, 42)).toBe(true);
    expect(getBuyRate(174, 42)!).toBeGreaterThan(1.1);
  });

  // Silver Edge vs Phantom Assassin — Break disables Blur + Coup de Grace
  it("Silver Edge (249) vs PA (44): buy rate > 1.2x", () => {
    expect(hasData(249, 44)).toBe(true);
    expect(getBuyRate(249, 44)!).toBeGreaterThan(1.2);
  });
});

// ─── Situational counters (just verify data exists with decent sample) ──────

describe("situational counters (data exists with sufficient games)", () => {
  // BKB vs Skywrath Mage — magic immunity vs pure magic hero
  it("BKB (116) vs Skywrath Mage (101): has 1000+ games", () => {
    expect(getGames(116, 101)).toBeGreaterThan(1000);
  });

  // Blade Mail vs Skywrath Mage — reflect burst damage
  it("Blade Mail (127) vs Skywrath Mage (101): has 1000+ games", () => {
    expect(getGames(127, 101)).toBeGreaterThan(1000);
  });

  // Blade Mail vs Leshrac — reflect AoE damage
  it("Blade Mail (127) vs Leshrac (52): has 1000+ games", () => {
    expect(getGames(127, 52)).toBeGreaterThan(1000);
  });

  // Heaven's Halberd vs Medusa — disarm vs Split Shot
  it("Halberd (210) vs Medusa (94): has data", () => {
    expect(hasData(210, 94)).toBe(true);
  });

  // Force Staff vs Spirit Breaker — disrupt Charge
  it("Force Staff (102) vs Spirit Breaker (71): has 1000+ games", () => {
    expect(getGames(102, 71)).toBeGreaterThan(1000);
  });
});
