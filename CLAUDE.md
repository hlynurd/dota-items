@AGENTS.md

# Dota 2 Itemisation Stats

A web app for exploring Dota 2 itemization data through team-level marginal statistics. Users pick an enemy hero or item and see sortable tables of purchase rates and win rate impacts.

## Stack

- **Framework**: Next.js 16 (App Router), TypeScript, Tailwind CSS
- **Analysis**: Deterministic pipeline — Valve Steam API bulk data + streaming in-memory aggregation
- **Dota data**: Valve Steam Web API (`GetMatchHistoryBySequenceNum`) — free, 100 matches/call, end-game items
- **Database**: Neon (serverless Postgres) via Drizzle ORM — legacy, no longer needed for primary data path
- **Static data**: `public/data.json` — pre-computed marginal stats, served to client, computed client-side
- **Testing**: Vitest
- **Deployment**: Vercel (connected to GitHub repo: hlynurd/dota-items)

## Project Structure

```
app/
  page.tsx                    # Server component: fetches hero/item lists, renders DraftApp
  components/
    DraftApp.tsx              # Main client component — single-column foe-only layout, all state
    HeroPicker.tsx            # Hero selection modal: search + attribute-grouped grid + ~200 aliases
    ItemPicker.tsx            # Item selection modal: search + cost-sorted grid (filtered to items with data)
    HeroItemTable.tsx         # Bare sortable item table for hero-mode quadrants
    ItemHeroTable.tsx         # Bare sortable hero table for item-mode quadrants
  api/
    analyze/
      route.ts                # Legacy: POST — deterministic analyzer, streams NDJSON
    chat/
      route.ts                # Legacy: POST — Claude chat agent, streams plain text
lib/
  analysis/
    client-compute.ts         # Client-side indexing + computation from static data.json
    build-analyzer.ts         # Legacy: deterministic build pipeline
  db/
    client.ts                 # Drizzle + Neon client (lazy init, DATABASE_URL)
    schema.ts                 # matches, item_timings, item_marginal_win_rates, item_baseline_win_rates, context_hero_totals
    queries.ts                # getItemMarginals(), getItemBaselines(), getHeroItems(), getItemVsHeroes(), getItemIdsWithData(), getItemBaselinePurchaseRates()
    shards.ts                 # Multi-DB shard client management
  opendota/
    client.ts                 # Typed fetch wrappers for OpenDota API (1hr cache)
    types.ts                  # Raw OpenDota API response types
    hero-aliases.ts           # ~200 hero nicknames/aliases (e.g. "crix" → Sand King, "cm" → Crystal Maiden)
  tools/
    index.ts                  # Tool definitions + executeTool() used by chat agent only
  agent/
    chat.ts                   # Claude chat agent with tool access + draft context
    prompts.ts                # CHAT_SYSTEM_PROMPT only
    types.ts                  # Shared app types: Hero, DraftInput, HeroBuild, ItemHeroEntry, HeroItemEntry, etc.
  utils/
    cdn.ts                    # Valve CDN URL helpers for hero/item images
    excluded-items.ts         # Consumable/ward item names excluded from all analyses
scripts/
  valve-harvest.ts             # PRIMARY: Valve Steam API bulk harvester — streaming aggregation → data.json
  harvest-loop.sh              # Continuous harvest loop: harvest → commit → push → deploy every 2h
  ingest.ts                   # Legacy: OpenDota ingest → shard DB
  aggregate.ts                # Legacy: Read shards → compute marginals → write to primary DB + data.json
  setup-shard.ts              # Legacy: Provision raw tables on a new Neon shard
tests/
  client-compute.test.ts       # Core: indexing, hero/item lookups, buy rate, WR math (17 tests)
  data-integrity.test.ts       # Core: validates data.json structure, coverage, sanity (14 tests)
  excluded-items.test.ts       # Core: consumable/ward/recipe filtering (3 tests)
  item-coverage.test.ts       # Legacy: component filter tests (5 tests)
docs/
  spec.md                     # Full feature spec
drizzle.config.ts             # Drizzle Kit config (reads DATABASE_URL)
vitest.config.ts              # Vitest configuration
vercel.json                   # Cron schedule config
```

## UI Layout — Single Column (Foe Only)

The main page has two stacked cards, both focused on enemy-side data:

| **By Hero** | Pick enemy hero → items bought more against them |
|---|---|
| **By Item** | Pick item → enemy heroes it's bought against |

Each card has a picker header and an internally-scrolling sortable table.
Columns: Item/Hero thumbnail, Name, Buy rate (Nx), WR Diff %.

## Key Types (defined in lib/agent/types.ts)

- `Hero` — id, name, attribute, position (1–5 | null)
- `DraftInput` — radiant: Hero[], dire: Hero[]
- `HeroItemEntry` — item_id, item_name, display_name, buy_rate, wr_with, wr_without, diff, match_games
- `HeroLookupResult` — hero_id, hero_name, side, items: HeroItemEntry[]
- `ItemHeroEntry` — hero_id, hero_name, hero_internal_name, buy_rate, wr_with, wr_without, diff, match_games
- `ItemLookupResult` — item_id, item_name, display_name, heroes: ItemHeroEntry[]
- `ItemRecommendation` — item_id, item_name, display_name, win_rate, baseline_win_rate, confidence, debug?
- `HeroBuild` — hero + matchup_delta + phases (early/core/situational) + timing_winrates
- `TeamItemEntry` — item stats with buy lift, wr_with, wr_without, match-level deduplication

## How Analysis Works

Analysis uses **team-level marginal statistics** — not hero-specific. The question is "when anyone buys item X and hero Y is on the enemy/ally team" rather than "when hero H buys item X vs hero Y". This yields much denser data.

### Hero Lookup (client-side via `computeHeroLookup`)
- Indexes `data.json` marginals by hero+side key
- WR with = match_wins / match_games; WR without = (total_wins - match_wins) / (total_matches - match_games)
- Buy rate = this hero's item purchase rate / avg purchase rate across all heroes (per-item baseline)
- Filtered by `allowedItemIds` (pre-filtered to exclude consumables/wards/recipes)

### Item Lookup (client-side via `computeItemLookup`)
- Indexes `data.json` marginals by item+side key
- Same WR with/without formula
- Buy rate = per-hero purchase rate / avg across all heroes for this item

### Data integrity
- Valve harvester tracks items per-side using absolute radiant/dire
- `itemBuyers: Map<item_id, Set<hero_id>>` — ally counts exclude the buyer
- No component filter needed — Valve API returns end-game items only

## DB Schema (lib/db/schema.ts)

- `matches` — match_id PK, ingested_at, start_time, radiant_win, avg_rank_tier, radiant_0..4, dire_0..4 *(in shard DBs)*
- `item_timings` — match_id, hero_id, item_id, time_s, won (PK: match_id+hero_id+item_id) *(in shard DBs)*
- `item_marginal_win_rates` — item_id, context_hero_id, context_side, before_minute, games, wins, match_games, match_wins, updated_at (PK: item_id+context_hero_id+context_side+before_minute) *(in primary DB)*
- `item_baseline_win_rates` — item_id, before_minute, games, wins, updated_at (PK: item_id+before_minute) *(in primary DB)*
- `context_hero_totals` — context_hero_id, context_side, total_matches, total_wins, updated_at (PK: context_hero_id+context_side) *(in primary DB)* — used to compute "WR when item NOT bought"

## Multi-DB Sharding

- **Primary DB** (`DATABASE_URL`): aggregate tables only (item_marginal_win_rates, item_baseline_win_rates, context_hero_totals)
- **Shard DBs** (`SHARD_URLS`): raw data (matches, item_timings)
- Backwards compatible: no `SHARD_URLS` = single-shard mode using `DATABASE_URL`
- `lib/db/shards.ts` manages shard connections
- `scripts/setup-shard.ts` provisions raw tables on new Neon projects
- Aggregate reads from all shards, writes to primary

## Data Pipeline

### Primary: Valve Steam API Harvester (`scripts/valve-harvest.ts`)

Streaming aggregation — fetches matches from Valve's API, accumulates counters in memory, writes `data.json` directly. **No database needed.**

- Calls `GetMatchHistoryBySequenceNum` (100 matches/call, free)
- Filters to ranked All Pick (`game_mode=22`, `lobby_type=7`, 10 humans, duration >= 10 min)
- Uses end-game item slots (`item_0..item_5`) — no purchase timing
- Accumulates per-(item, hero, side) match-level win rates in memory
- Ally counts exclude the buyer (same as aggregate.ts)
- Writes `public/data.json` at end + checkpoints every 50K matches
- Supports `--merge` flag to seed accumulators from existing data.json
- Default start: seq 7,350,000,000 (patch 7.41a, March 27 2026)
- Rate: ~10 calls/min, ~42K ranked matches/hour
- Run: `npm run valve-harvest` or `npm run valve-harvest -- --max 1000000 --seq 7350000000 --merge`

### Continuous Local Harvesting (`scripts/harvest-escalating.sh`)
- Escalating deploy intervals: 5K x10, 10K x10, 20K x10, 50K x10, then 100K forever
- Auto commits, pushes, and deploys at each checkpoint via `--deploy` flag
- Tracks sequence cursor in `.harvest-seq` file
- Run: `nohup bash scripts/harvest-escalating.sh > /tmp/harvest-escalating.log 2>&1 &`

### Daily GitHub Actions Harvest (`.github/workflows/harvest.yml`)
- Runs at midnight UTC daily (also manually triggerable)
- Harvests 100K matches with `--merge`, commits data.json, deploys to Vercel
- Requires secrets: `STEAM_API_KEY`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`

### Legacy: OpenDota Pipeline

Still present but no longer the primary data source:
- `scripts/ingest.ts` — OpenDota API ingest to Neon shard DB
- `scripts/aggregate.ts` — reads shards, writes to primary DB + data.json

## Excluded Items

Excluded from all analyses (defined in `lib/utils/excluded-items.ts`):
- Consumables: Tango, Healing Salve, Clarity, Town Portal Scroll, Enchanted Mango, Cheese, Faerie Fire
- Wards/utility: Smoke of Deceit, Observer Ward, Sentry Ward, Ward Dispenser, Tome of Knowledge
- All recipes (name starts with `recipe_`)

## Key Conventions

- All OpenDota fetch logic lives in `lib/opendota/client.ts`
- DB query logic lives in `lib/db/queries.ts`
- No component item filter — Valve API returns end-game items which are naturally finished items
- HeroPicker supports ~200 hero nicknames/aliases via `lib/opendota/hero-aliases.ts`
- Valve CDN for images:
  - Heroes: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/{name}.png`
  - Items: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/{name}.png`
- OpenDota base URL: `https://api.opendota.com/api`
- Never hardcode API keys — use `.env.local` and `process.env`

## Environment Variables

```
STEAM_API_KEY=       # Valve Steam Web API key (free, required for valve-harvest)
ANTHROPIC_API_KEY=   # Claude API key (chat only)
DATABASE_URL=        # Neon Postgres connection string (legacy — aggregates)
SHARD_URLS=          # Optional, comma-separated shard connection strings (legacy)
CRON_SECRET=         # Shared secret for Vercel Cron auth (Bearer token)
OPENDOTA_API_KEY=    # Optional, for higher OpenDota rate limits (legacy)
```

## npm Scripts

```
npm run dev          # Local dev server
npm run build        # Production build
npm run valve-harvest  # PRIMARY: Valve API bulk harvest → data.json (default from patch 7.41a)
npm run ingest       # Legacy: OpenDota ingest
npm run aggregate    # Legacy: recompute marginals from DB shards
npm test             # Run vitest tests
```

## What NOT to Do

- Do not use the Pages Router — App Router only
- Do not use `any` types except where Drizzle forces it in the DB client proxy
- Do not fetch Dota data from the frontend — all fetching goes through API routes or server components
- Do not call Claude in the analyze route — analysis is deterministic
