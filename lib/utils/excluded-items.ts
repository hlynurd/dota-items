/**
 * Items excluded from all analyses — consumables and wards that add noise.
 * Keyed by internal name (matches OpenDota items map keys).
 */
export const EXCLUDED_ITEM_NAMES = new Set([
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
]);
