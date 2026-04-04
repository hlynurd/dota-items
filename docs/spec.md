# Dota 2 Itemization Advisor — Full Spec

## Core Concept

A single-page app for exploring Dota 2 itemization data through **team-level marginal statistics**. Pick a hero or item from a Friend (ally) or Foe (enemy) perspective and see sortable tables of purchase rates and win rate impacts.

---

## UI: 2x2 Grid Layout

The main page shows a 2x2 grid (2 columns on desktop, stacked on mobile):

|  | **Friend** (ally, green accent) | **Foe** (enemy, red accent) |
|---|---|---|
| **By Hero** | Pick hero → items teammates buy more | Pick hero → items bought against them |
| **By Item** | Pick item → ally heroes whose teams buy it | Pick item → enemy heroes it's bought against |

Each quadrant is a card with:
- A compact header with picker button (hero portrait or item icon)
- An internally-scrolling sortable data table

### Table Columns
- Thumbnail (item icon or hero portrait)
- Name (sortable alphabetically)
- **Buy** — purchase rate vs baseline (Nx multiplier). Green ≥1.2x, red ≤0.8x
- **With** — win rate when this item is bought (given hero context)
- **W/o** — win rate when this item is NOT bought
- **Diff** — With minus W/o, color-coded green (positive) / red (negative)
- **N** — number of matches in sample

### Hero Selection
- Searchable modal by hero name (instant, client-side)
- Supports ~200 nicknames/aliases (e.g. "crix" for Sand King, "cm" for Crystal Maiden)
- Grid grouped by attribute (Strength / Agility / Intelligence / Universal)

### Item Selection
- Searchable modal sorted by cost descending
- Only items with existing data in the DB are shown
- Consumables/wards excluded (Tango, Salve, Clarity, TP, Mango, Smoke, Wards, Tome)

---

## Analysis Pipeline

Uses **team-level marginal statistics**: "when anyone on the team buys item X and hero Y is on the enemy/ally team" — not hero-specific. This yields ~130x denser data than per-hero tables.

### Hero Lookup
- Query: all items for a given `context_hero_id` + `context_side` + `before_minute=999`
- Buy rate: this hero's item purchase rate / avg purchase rate across all heroes (per-item baseline)
- WR With: `match_wins / match_games`
- WR Without: `(total_wins - match_wins) / (total_matches - match_games)`

### Item Lookup
- Query: all heroes for a given `item_id` + `context_side` + `before_minute=999`
- Buy rate: per-hero purchase rate / avg across all heroes for this item
- Same WR With/Without formula

### Ally-side integrity
- Aggregate uses absolute radiant/dire (not relative to buyer's perspective)
- Ally match-level counts **exclude the buyer**: `buyers.has(hero)` check
- Aggregate truncates all tables before each run — no stale data

---

## Data Pipeline

### Ingest (hourly at :00 via Vercel Cron)
- Pages through OpenDota `/parsedMatches` (purchase_log attached)
- All ranks included, no time-based pruning
- Writes to least-full shard; deduplicates across all shards
- Parses purchase_log, skips component items

### Aggregate (hourly at :30 via Vercel Cron)
- Truncates aggregate tables first
- Reads all shards (paginated in 2000-match chunks for Neon 67MB limit)
- Tracks `radiantItems` / `direItems` separately with buyer sets
- Computes marginal, baseline, match-level, and hero-total accumulators
- before_minute buckets: 10, 20, 30, 40, 50, 999

### Background Refresh
- Page load triggers background aggregate via `after()`

---

## DB Schema

```
matches                  (match_id PK, start_time, radiant_win, avg_rank_tier, radiant_0..4, dire_0..4)  [shard DBs]
item_timings             (match_id, hero_id, item_id, time_s, won)  PK: all three  [shard DBs]
item_marginal_win_rates  (item_id, context_hero_id, context_side, before_minute, games, wins, match_games, match_wins)  [primary DB]
item_baseline_win_rates  (item_id, before_minute, games, wins)  [primary DB]
context_hero_totals      (context_hero_id, context_side, total_matches, total_wins)  [primary DB]
```

## Multi-DB Sharding

- **Primary DB** (`DATABASE_URL`): aggregate tables only
- **Shard DBs** (`SHARD_URLS`): raw data (matches, item_timings)
- Backwards compatible: no `SHARD_URLS` = single-shard mode
- Neon free tier: 100 projects × 0.5GB = 50GB potential

---

## Deployment

- Vercel, auto-deploys on push to main (hlynurd/dota-items)
- Crons: ingest :00, aggregate :30 — both require CRON_SECRET Bearer auth
- Env vars: ANTHROPIC_API_KEY, DATABASE_URL, SHARD_URLS, CRON_SECRET, OPENDOTA_API_KEY
