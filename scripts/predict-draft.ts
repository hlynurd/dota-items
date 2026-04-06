/**
 * Predict top 6 end-game items for each hero in a 5v5 draft
 * using the additive log-odds model with shrinkage (λ=0.54).
 *
 * Usage:
 *   npx tsx scripts/predict-draft.ts
 *   npx tsx scripts/predict-draft.ts --lambda 0.4
 */

import { readFileSync } from "fs";
import { join } from "path";

// ─── Config ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let LAMBDA = 0.54;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--lambda" && args[i + 1]) LAMBDA = parseFloat(args[i + 1]);
}

// ─── Non-purchasable / win-indicator items to exclude from recommendations ──

const NON_PURCHASABLE_IDS = new Set([
  112,  // Aegis of the Immortal (Roshan drop)
  266,  // Cheese (Roshan drop)
  182,  // Gem of True Sight (win-more indicator)
  133,  // Divine Rapier (extreme outlier)
]);

// Also exclude any item whose name contains "Recipe" — data artifact
function isRecommendableItem(itemId: number, itemName: string): boolean {
  if (NON_PURCHASABLE_IDS.has(itemId)) return false;
  if (itemName.toLowerCase().includes("recipe")) return false;
  if (itemName.toLowerCase().includes("grimoire")) return false; // Black Grimoire = Roshan drop
  return true;
}

// ─── Draft ──────────────────────────────────────────────────────────────────

const radiant = [
  { id: 63, name: "Weaver" },
  { id: 22, name: "Zeus" },
  { id: 99, name: "Bristleback" },
  { id: 93, name: "Slark" },
  { id: 11, name: "Shadow Fiend" },
];

const dire = [
  { id: 17, name: "Storm Spirit" },
  { id: 56, name: "Clinkz" },
  { id: 29, name: "Tidehunter" },
  { id: 62, name: "Bounty Hunter" },
  { id: 31, name: "Lich" },
];

// ─── Math ───────────────────────────────────────────────────────────────────

function logit(p: number): number {
  const c = Math.max(1e-6, Math.min(1 - 1e-6, p));
  return Math.log(c / (1 - c));
}
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

// ─── Load data.json ─────────────────────────────────────────────────────────

interface MarginalRow {
  item_id: number;
  hero_id: number;
  side: string;
  match_games: number;
  match_wins: number;
}

interface HeroTotal { total_matches: number; total_wins: number; }

const marginals = new Map<string, MarginalRow>();  // "item:hero:side"
const heroTotals = new Map<string, HeroTotal>();    // "hero:side"
const itemBases = new Map<string, {
  sumLogitWith: number; sumLogitWithout: number; count: number;
}>();
const allItemIds = new Set<number>();

function loadData() {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "public", "data.json"), "utf-8"));

  for (const [hero_id, side, total_matches, total_wins] of raw.t) {
    heroTotals.set(`${hero_id}:${side}`, { total_matches, total_wins });
  }

  for (const [item_id, hero_id, side, match_games, match_wins] of raw.m) {
    marginals.set(`${item_id}:${hero_id}:${side}`, { item_id, hero_id, side, match_games, match_wins });
    allItemIds.add(item_id);

    const wrWith = match_games > 0 ? match_wins / match_games : 0.5;
    const ht = heroTotals.get(`${hero_id}:${side}`);
    const tm = ht?.total_matches ?? 0;
    const tw = ht?.total_wins ?? 0;
    const wog = tm - match_games;
    const wow = tw - match_wins;
    const wrWithout = wog > 0 ? wow / wog : 0.5;

    const key = `${item_id}:${side}`;
    let b = itemBases.get(key);
    if (!b) { b = { sumLogitWith: 0, sumLogitWithout: 0, count: 0 }; itemBases.set(key, b); }
    b.sumLogitWith += logit(wrWith);
    b.sumLogitWithout += logit(wrWithout);
    b.count++;
  }
}

// ─── Fetch item/hero names from OpenDota ────────────────────────────────────

async function fetchItemNames(): Promise<Map<number, string>> {
  const res = await fetch("https://api.opendota.com/api/constants/items");
  const items = await res.json() as Record<string, { id: number; dname?: string }>;
  const map = new Map<number, string>();
  for (const [, v] of Object.entries(items)) {
    if (v.id && v.dname) map.set(v.id, v.dname);
  }
  return map;
}

// ─── Compute draft-aware item diff ──────────────────────────────────────────

interface ContextHero { heroId: number; side: "enemy" | "ally" }

interface ItemScore {
  item_id: number;
  item_name: string;
  draft_diff: number;    // sigmoid(with) - sigmoid(without) under additive model
  p_with: number;        // P(win | item bought, this draft)
  p_without: number;     // P(win | item not bought, this draft)
  context_found: number; // how many context heroes had data for this item
  buy_rate: number;      // relative to baseline
  hero_item_rate: number; // how often this hero's games feature this item
  composite: number;     // draft_diff * sqrt(hero_item_rate), for ranking
}

function scoreItem(itemId: number, context: ContextHero[]): { draft_diff: number; p_with: number; p_without: number; found: number } | null {
  let excessWithSum = 0;
  let excessWithoutSum = 0;
  let found = 0;

  for (const { heroId, side } of context) {
    const row = marginals.get(`${itemId}:${heroId}:${side}`);
    if (!row || row.match_games < 5) continue;

    const wrWith = row.match_wins / row.match_games;
    const ht = heroTotals.get(`${heroId}:${side}`);
    if (!ht) continue;
    const wog = ht.total_matches - row.match_games;
    const wow = ht.total_wins - row.match_wins;
    const wrWithout = wog > 0 ? wow / wog : 0.5;

    const base = itemBases.get(`${itemId}:${side}`);
    if (!base || base.count === 0) continue;

    const baseLogitWith = base.sumLogitWith / base.count;
    const baseLogitWithout = base.sumLogitWithout / base.count;

    excessWithSum += logit(wrWith) - baseLogitWith;
    excessWithoutSum += logit(wrWithout) - baseLogitWithout;
    found++;
  }

  if (found < 3) return null; // need minimum context

  // Blend base across enemy/ally sides
  const enemyBase = itemBases.get(`${itemId}:enemy`);
  const allyBase = itemBases.get(`${itemId}:ally`);
  const eWith = enemyBase ? enemyBase.sumLogitWith / enemyBase.count : 0;
  const aWith = allyBase ? allyBase.sumLogitWith / allyBase.count : 0;
  const eWithout = enemyBase ? enemyBase.sumLogitWithout / enemyBase.count : 0;
  const aWithout = allyBase ? allyBase.sumLogitWithout / allyBase.count : 0;

  const nEnemy = context.filter(c => c.side === "enemy").length;
  const nAlly = context.filter(c => c.side === "ally").length;
  const total = nEnemy + nAlly;

  const baseWith = (nEnemy * eWith + nAlly * aWith) / total;
  const baseWithout = (nEnemy * eWithout + nAlly * aWithout) / total;

  const pWith = sigmoid(baseWith + LAMBDA * excessWithSum);
  const pWithout = sigmoid(baseWithout + LAMBDA * excessWithoutSum);

  return { draft_diff: pWith - pWithout, p_with: pWith, p_without: pWithout, found };
}

function computeBuyRate(itemId: number, heroId: number, side: string): number {
  const row = marginals.get(`${itemId}:${heroId}:${side}`);
  if (!row) return 0;
  const ht = heroTotals.get(`${heroId}:${side}`);
  if (!ht || ht.total_matches === 0) return 0;
  const heroRate = row.match_games / ht.total_matches;

  // Baseline: avg purchase rate for this item across all heroes on this side
  let sumRates = 0, count = 0;
  for (const [key, r] of marginals) {
    if (r.item_id !== itemId) continue;
    if (r.side !== side) continue;
    const h = heroTotals.get(`${r.hero_id}:${side}`);
    if (h && h.total_matches > 0) {
      sumRates += r.match_games / h.total_matches;
      count++;
    }
  }
  const baseline = count > 0 ? sumRates / count : heroRate;
  return baseline > 0 ? heroRate / baseline : 1;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  loadData();
  const itemNames = await fetchItemNames();

  console.log(`\n  Additive log-odds model, λ = ${LAMBDA}`);
  console.log(`  Radiant: ${radiant.map(h => h.name).join(", ")}`);
  console.log(`  Dire:    ${dire.map(h => h.name).join(", ")}`);

  for (const team of [
    { label: "RADIANT", heroes: radiant, allies: radiant, enemies: dire },
    { label: "DIRE", heroes: dire, allies: dire, enemies: radiant },
  ]) {
    console.log(`\n${"═".repeat(90)}`);
    console.log(`  ${team.label}`);
    console.log(`${"═".repeat(90)}`);

    for (const hero of team.heroes) {
      // Build context: allies (excl this hero) + enemies
      const context: ContextHero[] = [];
      for (const ally of team.allies) {
        if (ally.id !== hero.id) context.push({ heroId: ally.id, side: "ally" });
      }
      for (const enemy of team.enemies) {
        context.push({ heroId: enemy.id, side: "enemy" });
      }

      // Score all items
      const scores: ItemScore[] = [];
      for (const itemId of allItemIds) {
        const name = itemNames.get(itemId) ?? `item_${itemId}`;
        if (!isRecommendableItem(itemId, name)) continue;

        const result = scoreItem(itemId, context);
        if (!result) continue;

        // Buy rate: how often does THIS hero's team buy this item (using ally-side data)
        // We use ally-side since the hero is on the buying team
        const buyRate = computeBuyRate(itemId, hero.id, "ally");

        // Filter out items this hero essentially never buys (buy rate < 0.1x)
        if (buyRate < 0.1) continue;

        scores.push({
          item_id: itemId,
          item_name: itemNames.get(itemId) ?? `item_${itemId}`,
          draft_diff: result.draft_diff,
          p_with: result.p_with,
          p_without: result.p_without,
          context_found: result.found,
          buy_rate: buyRate,
          hero_item_rate: 0,
          composite: 0,
        });
      }

      // Compute hero-specific purchase rate using ENEMY-side data
      // (enemy-side counts ALL purchases by the opposing team, so it reflects
      //  how often this hero's opponents see this item — a proxy for hero buy rate)
      for (const s of scores) {
        // Direct: how often does this item appear when THIS hero is on ally side?
        // ally-side excludes buyer, so not perfect. Let's use a blend.
        const allyRow = marginals.get(`${s.item_id}:${hero.id}:ally`);
        const enemyRow = marginals.get(`${s.item_id}:${hero.id}:enemy`);
        const allyHt = heroTotals.get(`${hero.id}:ally`);
        const enemyHt = heroTotals.get(`${hero.id}:enemy`);
        // Use enemy-side rate as a proxy for "how often is this item in games with this hero"
        const heroItemRate = enemyRow && enemyHt && enemyHt.total_matches > 0
          ? enemyRow.match_games / enemyHt.total_matches : 0;
        s.hero_item_rate = heroItemRate;
      }

      // Composite score: draft_diff weighted by sqrt(hero_item_rate) to prefer items the hero actually builds
      // This balances "what's good for the draft" with "what this hero actually buys"
      for (const s of scores) {
        s.composite = s.draft_diff * Math.max(0.1, Math.sqrt(s.hero_item_rate * 5));
      }

      // Sort by composite score, take top 6
      scores.sort((a, b) => b.composite - a.composite);
      const top = scores.slice(0, 6);

      console.log(`\n  ${hero.name} (id ${hero.id})`);
      console.log(`  ${"#".padEnd(4)} ${"Item".padEnd(24)} ${"Draft Diff".padStart(11)} ${"Hero Rate".padStart(10)} ${"Buy Nx".padStart(8)} ${"Ctx".padStart(4)}`);
      console.log(`  ${"─".repeat(55)}`);

      for (let i = 0; i < top.length; i++) {
        const s = top[i];
        const diffStr = (s.draft_diff > 0 ? "+" : "") + (s.draft_diff * 100).toFixed(2) + "%";
        const rateStr = (s.hero_item_rate * 100).toFixed(1) + "%";
        console.log(`  ${(i + 1 + ".").padEnd(4)} ${s.item_name.padEnd(24)} ${diffStr.padStart(11)} ${rateStr.padStart(10)} ${s.buy_rate.toFixed(2).padStart(7)}x ${s.context_found.toString().padStart(4)}`);
      }

      // Also show bottom 3 (worst items with meaningful buy rate)
      scores.sort((a, b) => a.composite - b.composite);
      const bottom = scores.filter(s => s.hero_item_rate > 0.02).slice(0, 3);
      console.log(`  ${"─".repeat(55)}`);
      for (const s of bottom) {
        const diffStr = (s.draft_diff > 0 ? "+" : "") + (s.draft_diff * 100).toFixed(2) + "%";
        const rateStr = (s.hero_item_rate * 100).toFixed(1) + "%";
        console.log(`  ${"✗".padEnd(4)} ${s.item_name.padEnd(24)} ${diffStr.padStart(11)} ${rateStr.padStart(10)} ${s.buy_rate.toFixed(2).padStart(7)}x ${s.context_found.toString().padStart(4)}`);
      }
    }
  }

  console.log(`\n${"═".repeat(90)}`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
