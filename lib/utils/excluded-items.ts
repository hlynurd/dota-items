/**
 * Items excluded from all analyses — consumables and wards that add noise.
 * Keyed by internal name (matches OpenDota items map keys).
 */
const EXCLUDED_EXACT = new Set([
  "tango",
  "flask",              // Healing Salve
  "clarity",
  "tpscroll",           // Town Portal Scroll
  "enchanted_mango",
  "smoke_of_deceit",
  "ward_observer",
  "ward_sentry",
  "ward_dispenser",     // Observer and Sentry Wards
  "tome_of_knowledge",
  "cheese",
  "faerie_fire",
]);

/** Returns true if an item name should be excluded from analyses. */
export function isExcludedItem(name: string): boolean {
  return EXCLUDED_EXACT.has(name) || name.startsWith("recipe_");
}
