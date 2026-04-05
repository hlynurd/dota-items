/**
 * Tests for excluded item filtering.
 */

import { describe, it, expect } from "vitest";
import { isExcludedItem } from "@/lib/utils/excluded-items";

describe("isExcludedItem", () => {
  it("excludes consumables", () => {
    expect(isExcludedItem("tango")).toBe(true);
    expect(isExcludedItem("flask")).toBe(true);
    expect(isExcludedItem("clarity")).toBe(true);
    expect(isExcludedItem("tpscroll")).toBe(true);
    expect(isExcludedItem("enchanted_mango")).toBe(true);
  });

  it("excludes wards and smoke", () => {
    expect(isExcludedItem("ward_observer")).toBe(true);
    expect(isExcludedItem("ward_sentry")).toBe(true);
    expect(isExcludedItem("ward_dispenser")).toBe(true);
    expect(isExcludedItem("smoke_of_deceit")).toBe(true);
  });

  it("excludes recipes", () => {
    expect(isExcludedItem("recipe_bkb")).toBe(true);
    expect(isExcludedItem("recipe_cyclone")).toBe(true);
    expect(isExcludedItem("recipe_travel_boots")).toBe(true);
  });

  it("keeps real items", () => {
    expect(isExcludedItem("black_king_bar")).toBe(false);
    expect(isExcludedItem("blink")).toBe(false);
    expect(isExcludedItem("cyclone")).toBe(false);
    expect(isExcludedItem("ancient_janggo")).toBe(false); // Drum
    expect(isExcludedItem("mekansm")).toBe(false);
    expect(isExcludedItem("dust")).toBe(false);
    expect(isExcludedItem("gem")).toBe(false);
    expect(isExcludedItem("blood_grenade")).toBe(false);
  });
});
