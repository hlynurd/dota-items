# Dota 2 Itemization Advisor — Full Spec

## Core Concept

A single-page app for exploring Dota 2 itemization data through **team-level marginal statistics**. Pick an enemy hero or item and see sortable tables of purchase rates and win rate impacts.

---

## UI: Single Column (Foe Only)

The main page has two stacked cards, both focused on enemy-side data:

| **By Hero** | Pick enemy hero → items bought more against them |
|---|---|
| **By Item** | Pick item → enemy heroes it's bought against |

Each card has:
- A compact header with picker button (hero portrait or item icon)
- An internally-scrolling sortable data table

### Table Columns
- Thumbnail (item icon or hero portrait)
- Name (sortable alphabetically)
- **Buy** — purchase rate vs baseline (Nx multiplier). Green ≥1.2x, red ≤0.8x
- **Diff** — WR With minus WR Without, color-coded green (positive) / red (negative)

### Hero Selection
- Searchable modal by hero name (instant, client-side)
- Supports ~200 nicknames/aliases (e.g. "crix" for Sand King, "cm" for Crystal Maiden)
- Grid grouped by attribute (Strength / Agility / Intelligence / Universal), alphabetical within each group

### Item Selection
- Searchable modal sorted by cost descending, gold cost shown per item
- Only items with existing data in the DB are shown
- Consumables/wards excluded (Tango, Salve, Clarity, TP, Mango, Smoke, Wards, Tome)

---

## Analysis Pipeline

Uses **team-level marginal statistics**: "when anyone on the team buys item X and hero Y is on the enemy team" — not hero-specific. This yields ~130x denser data than per-hero tables.

### Hero Lookup
- Query: all items for a given `context_hero_id` + `context_side=enemy` + `before_minute=999`
- Buy rate: this hero's item purchase rate / avg purchase rate across all heroes (per-item baseline)
- WR With: `match_wins / match_games`
- WR Without: `(total_wins - match_wins) / (total_matches - match_games)`

### Item Lookup
- Query: all heroes for a given `item_id` + `context_side=enemy` + `before_minute=999`
- Buy rate: per-hero purchase rate / avg across all heroes for this item
- Same WR With/Without formula

---

## Data Pipeline

### Primary: Valve Steam API Harvester (`scripts/valve-harvest.ts`)

Streaming aggregation — fetches matches from Valve's API, accumulates counters in memory, writes `data.json` directly. **No database needed.**

- Calls `GetMatchHistoryBySequenceNum` (100 matches/call, free)
- Filters to ranked All Pick (`game_mode=22`, `lobby_type=7`, 10 humans, duration >= 10 min)
- Uses end-game item slots (`item_0..item_5`) — no purchase timing
- Accumulates per-(item, hero, side) match-level win rates in memory
- Writes `public/data.json` at end + checkpoints every 50K matches
- Rate: ~20 calls/min, ~100K ranked matches/hour
- Run: `npm run valve-harvest` or `npm run valve-harvest -- --max 1000000`

### Legacy: OpenDota Pipeline

Still present but no longer the primary data source:
- `scripts/ingest.ts` — OpenDota API ingest to Neon shard DB
- `scripts/aggregate.ts` — reads shards, writes to primary DB + data.json

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

---

## Deployment

- Vercel, auto-deploys on push to main (hlynurd/dota-items)
- Env vars: ANTHROPIC_API_KEY, DATABASE_URL, SHARD_URLS, STEAM_API_KEY, CRON_SECRET
