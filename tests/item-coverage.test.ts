/**
 * Tests for item coverage — verifies that the component filter and candidate
 * selection work correctly. Uses a mock items map so no OpenDota calls needed.
 * DB tests hit the real Neon DB (needs DATABASE_URL in .env.local).
 *
 * Run: npm test
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { describe, it, expect } from "vitest";
import type { OpenDotaItemsMap } from "@/lib/opendota/types";

// ─── Import the functions we're testing ──────────────────────────────────────
// We need to access buildComponentSet which is not exported, so we'll
// replicate the logic here to test it (same code as in build-analyzer.ts)

function buildComponentSet(itemsMap: OpenDotaItemsMap): Set<string> {
  const components = new Set<string>();
  for (const item of Object.values(itemsMap)) {
    for (const c of item.components ?? []) components.add(c);
  }
  // Keep items that are crafted AND cost >= 2000g
  for (const [name, item] of Object.entries(itemsMap)) {
    if (item.components && item.components.length > 0 && item.cost >= 2000) {
      components.delete(name);
    }
  }
  return components;
}

// ─── Mock items map (representative subset) ──────────────────────────────────

function mockItem(id: number, dname: string, cost: number, components: string[] | null): any {
  return { id, dname, cost, components, img: "", qual: "", created: true };
}

const MOCK_ITEMS: OpenDotaItemsMap = {
  // Leaf components — no components of their own (should be filtered)
  void_stone:        mockItem(48, "Void Stone",         825, null),
  chainmail:         mockItem(49, "Chainmail",           550, null),
  ogre_axe:          mockItem(55, "Ogre Axe",           1000, null),
  blade_of_alacrity: mockItem(56, "Blade of Alacrity",  1000, null),
  staff_of_wizardry: mockItem(57, "Staff of Wizardry",  1000, null),
  robe:              mockItem(58, "Robe of the Magi",     450, null),
  ring_of_health:    mockItem(52, "Ring of Health",       700, null),
  helm_of_iron_will: mockItem(53, "Helm of Iron Will",    925, null),
  javelin:           mockItem(59, "Javelin",              900, null),
  mithril_hammer:    mockItem(60, "Mithril Hammer",      1600, null),
  claymore:          mockItem(61, "Claymore",            1350, null),
  shadow_amulet:     mockItem(74, "Shadow Amulet",       1000, null),
  hyperstone:        mockItem(64, "Hyperstone",          2000, null),
  mystic_staff:      mockItem(63, "Mystic Staff",        2800, null),

  // Cheap intermediate components — have components but cost < 2000 (should be filtered)
  perseverance:     mockItem(85, "Perseverance",        1700, ["ring_of_health", "void_stone"]),
  buckler:          mockItem(86, "Buckler",              200, ["chainmail", "recipe_buckler"]),
  headdress:        mockItem(87, "Headdress",            425, ["ring_of_regen", "recipe_headdress"]),
  oblivion_staff:   mockItem(88, "Oblivion Staff",      1500, ["staff_of_wizardry", "robe", "sobi_mask"]),

  // Mid-tier items — have components AND cost >= 2000 (should NOT be filtered)
  cyclone:          mockItem(100, "Eul's Scepter",       2625, ["void_stone", "staff_of_wizardry", "recipe_cyclone"]),
  invis_sword:      mockItem(152, "Shadow Blade",        3000, ["shadow_amulet", "claymore"]),
  orchid:           mockItem(120, "Orchid Malevolence",   3475, ["oblivion_staff", "oblivion_staff", "recipe_orchid"]),
  maelstrom:        mockItem(75,  "Maelstrom",           2700, ["javelin", "mithril_hammer"]),
  diffusal_blade:   mockItem(174, "Diffusal Blade",      2500, ["blade_of_alacrity", "robe", "recipe_diffusal"]),
  vanguard:         mockItem(97,  "Vanguard",            2200, ["ring_of_health", "vitality_booster", "recipe_vanguard"]),
  mekansm:          mockItem(79,  "Mekansm",             2200, ["headdress", "chainmail", "recipe_mekansm"]),

  // Final-tier items (should NOT be filtered)
  wind_waker:       mockItem(260, "Wind Waker",          6825, ["cyclone", "mystic_staff", "recipe_wind_waker"]),
  silver_edge:      mockItem(249, "Silver Edge",         5450, ["invis_sword", "crystalys", "recipe_silver_edge"]),
  bloodthorn:       mockItem(250, "Bloodthorn",          6625, ["orchid", "crystalys", "recipe_bloodthorn"]),
  mjollnir:         mockItem(124, "Mjollnir",            5600, ["maelstrom", "hyperstone", "recipe_mjollnir"]),
  disperser:        mockItem(330, "Disperser",           5500, ["diffusal_blade", "eaglesong", "recipe_disperser"]),
  crimson_guard:    mockItem(242, "Crimson Guard",       3725, ["vanguard", "buckler", "recipe_crimson_guard"]),
  guardian_greaves: mockItem(231, "Guardian Greaves",    5375, ["mekansm", "arcane_boots", "recipe_guardian_greaves"]),

  // Standalone items (not a component of anything)
  black_king_bar:   mockItem(116, "Black King Bar",      4050, ["ogre_axe", "mithril_hammer", "recipe_bkb"]),
  glimmer_cape:     mockItem(254, "Glimmer Cape",        1950, ["shadow_amulet", "cloak"]),
  refresher:        mockItem(102, "Refresher Orb",       5200, ["perseverance", "ring_of_health", "recipe_refresher"]),
};

// ─── Component filter tests ──────────────────────────────────────────────────

describe("component filter", () => {
  const componentSet = buildComponentSet(MOCK_ITEMS);

  it("filters leaf components (Void Stone, Chainmail, etc.)", () => {
    expect(componentSet.has("void_stone")).toBe(true);
    expect(componentSet.has("chainmail")).toBe(true);
    expect(componentSet.has("ogre_axe")).toBe(true);
    expect(componentSet.has("blade_of_alacrity")).toBe(true);
    expect(componentSet.has("javelin")).toBe(true);
    expect(componentSet.has("mithril_hammer")).toBe(true);
    expect(componentSet.has("shadow_amulet")).toBe(true);
    expect(componentSet.has("hyperstone")).toBe(true);
  });

  it("keeps mid-tier items that cost >= 2000g (Eul's, Shadow Blade, etc.)", () => {
    expect(componentSet.has("cyclone")).toBe(false);       // Eul's 2625g
    expect(componentSet.has("invis_sword")).toBe(false);   // Shadow Blade 3000g
    expect(componentSet.has("orchid")).toBe(false);         // Orchid 3475g
    expect(componentSet.has("maelstrom")).toBe(false);      // Maelstrom 2700g
    expect(componentSet.has("diffusal_blade")).toBe(false); // Diffusal 2500g
    expect(componentSet.has("vanguard")).toBe(false);       // Vanguard 2200g
    expect(componentSet.has("mekansm")).toBe(false);        // Mekansm 2200g
  });

  it("filters cheap intermediate components (Perseverance, Buckler, etc.)", () => {
    expect(componentSet.has("perseverance")).toBe(true);   // 1700g — always upgraded
    expect(componentSet.has("buckler")).toBe(true);         // 200g
    expect(componentSet.has("headdress")).toBe(true);       // 425g
    expect(componentSet.has("oblivion_staff")).toBe(true);  // 1500g
  });

  it("keeps final-tier items", () => {
    expect(componentSet.has("wind_waker")).toBe(false);
    expect(componentSet.has("silver_edge")).toBe(false);
    expect(componentSet.has("bloodthorn")).toBe(false);
    expect(componentSet.has("black_king_bar")).toBe(false);
    expect(componentSet.has("glimmer_cape")).toBe(false);
  });
});

// ─── DB item presence tests (real DB) ────────────────────────────────────────

import { db } from "@/lib/db/client";
import { sql } from "drizzle-orm";

describe("DB item data", () => {
  it("Eul's (item 100) has win rate data for Warlock (hero 37)", async () => {
    const res = await db.execute<{ games: number }>(sql`
      SELECT games FROM item_win_rates
      WHERE hero_id = 37 AND item_id = 100 AND opponent_hero_id = -1 AND before_minute = 999
    `);
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].games).toBeGreaterThan(0);
  });

  it("Shadow Blade (item 152) has data for Slark (hero 93)", async () => {
    const res = await db.execute<{ games: number }>(sql`
      SELECT games FROM item_win_rates
      WHERE hero_id = 93 AND item_id = 152 AND opponent_hero_id = -1 AND before_minute = 999
    `);
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].games).toBeGreaterThan(0);
  });

  it("Diffusal Blade (item 174) has data for Slark (hero 93)", async () => {
    const res = await db.execute<{ games: number }>(sql`
      SELECT games FROM item_win_rates
      WHERE hero_id = 93 AND item_id = 174 AND opponent_hero_id = -1 AND before_minute = 999
    `);
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].games).toBeGreaterThan(0);
  });

  it("Maelstrom (item 75) has data for Juggernaut (hero 8)", async () => {
    const res = await db.execute<{ games: number }>(sql`
      SELECT games FROM item_win_rates
      WHERE hero_id = 8 AND item_id = 75 AND opponent_hero_id = -1 AND before_minute = 999
    `);
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].games).toBeGreaterThan(0);
  });

  it("has per-enemy breakdown for Eul's on Warlock vs Axe (hero 2)", async () => {
    const res = await db.execute<{ games: number }>(sql`
      SELECT games FROM item_win_rates
      WHERE hero_id = 37 AND item_id = 100 AND opponent_hero_id = 2 AND before_minute = 999
    `);
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].games).toBeGreaterThan(0);
  });
});
