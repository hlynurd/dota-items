@AGENTS.md

# Dota 2 Itemization Advisor

A web app where users input two Dota 2 teams (5v5) and get data-driven item recommendations based on team-level marginal statistics, broken down by game phase. See `docs/spec.md` for the full feature spec.

## Stack

- **Framework**: Next.js 16 (App Router), TypeScript, Tailwind CSS
- **AI**: Claude API via `@anthropic-ai/sdk` — used **only** for the chat panel (on-demand Q&A)
- **Analysis**: Deterministic pipeline — own Postgres DB + OpenDota matchup data + Bayesian smoothing
- **Database**: Neon (serverless Postgres) via Drizzle ORM, multi-DB sharding
- **Dota data**: OpenDota API (free, no key required; optional OPENDOTA_API_KEY for higher rate limits)
- **Testing**: Vitest
- **Deployment**: Vercel (connected to GitHub repo: hlynurd/dota-items)

## Project Structure

```
app/
  page.tsx                    # Server component: fetches hero list, renders DraftApp
  components/
    DraftApp.tsx              # Main client component — all state, NDJSON stream reader
    DraftBoard.tsx            # 5v5 slot grid + Analyze button
    HeroSlot.tsx              # Single slot: portrait, row-assigned position, uncertain toggle
    HeroPicker.tsx            # Hero selection modal: search + attribute-grouped grid + ~200 aliases
    ResultsPanel.tsx          # Grid of HeroBuildCards + skeleton loader
    HeroBuildCard.tsx         # Per-hero card: item phases + timing table + debug section
    TeamItemsCard.tsx         # Sortable team item analysis card (Buy lift, WR With, WR Without, Diff, N)
    ItemChip.tsx              # Item icon + win_rate + diff vs baseline
    ChatPanel.tsx             # Streaming chat panel with suggestion prompts
  api/
    analyze/
      route.ts                # POST — runs deterministic analyzer, streams NDJSON (rate limited: 5/IP/min)
    chat/
      route.ts                # POST — runs Claude chat agent, streams plain text
    cron/
      ingest/route.ts         # GET — runs ingest script (Vercel Cron, hourly at :00)
      aggregate/route.ts      # GET — runs aggregate script (Vercel Cron, hourly at :30)
lib/
  analysis/
    build-analyzer.ts         # Deterministic build pipeline (no LLM)
  db/
    client.ts                 # Drizzle + Neon client (lazy init, DATABASE_URL)
    schema.ts                 # matches, item_timings, item_marginal_win_rates, item_baseline_win_rates, context_hero_totals
    queries.ts                # getItemMarginals(), getItemBaselines() — marginal/baseline queries
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
    types.ts                  # Shared app types: Hero, DraftInput, HeroBuild, etc.
  utils/
    cdn.ts                    # Valve CDN URL helpers for hero/item images
scripts/
  ingest.ts                   # Fetch parsedMatches → insert to shard DB (all ranks, no time pruning)
  aggregate.ts                # Read all shards → compute marginal/baseline/hero totals → write to primary
  setup-shard.ts              # Provision raw tables (matches, item_timings) on a new Neon shard
tests/
  item-coverage.test.ts       # Vitest tests for item filtering/coverage
docs/
  spec.md                     # Full feature spec
drizzle.config.ts             # Drizzle Kit config (reads DATABASE_URL)
vitest.config.ts              # Vitest configuration
vercel.json                   # Cron schedule config
```

## Key Types (defined in lib/agent/types.ts)

- `Hero` — id, name, attribute, position (1–5 | null)
- `DraftInput` — radiant: Hero[], dire: Hero[]
- `ItemRecommendation` — item_id, item_name, display_name, win_rate, overall_win_rate, confidence, debug?
- `ItemDebugEntry` — hero_id, localized_name, games, wins, smoothed_wr (per-enemy breakdown)
- `TimingBucket` — before_minute (10|20|30|40|50), top_items with win_rate + overall_games + debug?
- `HeroBuild` — hero + matchup_delta + phases (early/core/situational) + timing_winrates
- `ChatMessage` — role ("user" | "assistant") + content
- `ChatContext` — draft + builds (passed to chat agent)

## How Analysis Works

Analysis uses **team-level marginal statistics** — not hero-specific. The question is "when anyone buys item X and hero Y is on the enemy team" rather than "when hero H buys item X vs hero Y". This yields much denser data.

`lib/analysis/build-analyzer.ts` runs all heroes in parallel:

1. Fetch `itemPopularity` + `matchups` from OpenDota for each hero
2. Fetch pre-aggregated marginal/baseline win rates from Neon DB — one query for all context heroes
3. Scoring: **70% enemy marginal + 30% ally marginal**, Bayesian smoothed toward baseline (K=10)
4. Phase items: ALL items in popularity bucket scored and re-ranked, top 6 kept
5. Component items filtered out (leaf components like Void Stone, Chainmail; cheap intermediates <2000g like Perseverance, Buckler). Mid-tier items >=2000g kept (Eul's, Shadow Blade, etc.)
6. Starting items not shown — only early/core/situational
7. `matchup_delta` (hero-level) = avgVsEnemies − overallHeroWinRate, shown in card header
8. Confidence: high >=100 avg games/enemy, medium >=25, low <25

### Team Items Card

`TeamItemsCard.tsx` shows all items with sortable columns: Buy lift, WR With, WR Without, Diff, N matches. Uses match-level deduplication (unique matches, not purchase events) via `match_games`/`match_wins` columns.

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

**ingest.ts** (runs hourly at :00):
- Pages through `/parsedMatches` from OpenDota (has purchase_log pre-attached)
- All ranks included (no rank filter), no time-based pruning
- Writes to the least-full shard; checks all shards for duplicate match_ids
- Parses purchase_log, skips component items, inserts into matches + item_timings

**aggregate.ts** (runs hourly at :30, 30 min after ingest):
- Reads all shards (paginated in 2000-match chunks to stay within Neon 67MB response limit)
- Joins item_timings + matches to derive opponent and ally heroes per row
- Accumulates marginal (item, context_hero, side, before_minute) and baseline (item, before_minute) counts
- before_minute buckets: 10, 20, 30, 40, 50, 999 (999 = any time = broadest sample)
- Computes context_hero_totals (total matches per enemy/ally hero)
- Upserts into primary DB (item_marginal_win_rates, item_baseline_win_rates, context_hero_totals)

**Page refresh** triggers background aggregate via `after()`.

## Role Assignment

- Row index determines default position: row 0 = Pos 1 (Carry), …, row 4 = Pos 5 (Hard Support)
- Each hero slot shows a toggle button: "Pos X — Role" by default
- Clicking the toggle marks the hero as "uncertain role" (position = null), shown in yellow
- Clicking again restores the row-assigned position

## Key Conventions

- All OpenDota fetch logic lives in `lib/opendota/client.ts`
- DB query logic lives in `lib/db/queries.ts`
- `lib/tools/index.ts` is **chat-only** — do not use it in the analyze pipeline
- Claude is **never called** during draft analysis — only when the user sends a chat message
- Component item filter: leaf components filtered (Void Stone, Chainmail, etc.); mid-tier items >=2000g kept (Eul's, Shadow Blade); cheap intermediates <2000g filtered (Perseverance, Buckler)
- HeroPicker supports ~200 hero nicknames/aliases via `lib/opendota/hero-aliases.ts`
- Valve CDN for images:
  - Heroes: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/{name}.png`
  - Items: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/{name}.png`
- OpenDota base URL: `https://api.opendota.com/api`
- Never hardcode API keys — use `.env.local` and `process.env`

## Environment Variables

```
ANTHROPIC_API_KEY=   # Claude API key (chat only)
DATABASE_URL=        # Neon Postgres connection string (primary — aggregates)
SHARD_URLS=          # Optional, comma-separated shard connection strings (raw data)
CRON_SECRET=         # Shared secret for Vercel Cron auth (Bearer token)
OPENDOTA_API_KEY=    # Optional, for higher OpenDota rate limits
```

## npm Scripts

```
npm run dev          # Local dev server
npm run build        # Production build
npm run ingest       # Run ingest script manually (reads .env.local)
npm run backfill     # Bulk all-rank ingest mode
npm run aggregate    # Recompute marginals from all shards
npm run setup-shard  # Provision raw tables on a new Neon shard (pass URL as arg)
npm test             # Run vitest tests
npm run db:push      # Push schema to Neon (run after schema changes)
npm run db:generate  # Generate Drizzle migration files
```

## What NOT to Do

- Do not use the Pages Router — App Router only
- Do not use `any` types except where Drizzle forces it in the DB client proxy
- Do not fetch Dota data from the frontend — all fetching goes through API routes or server components
- Do not call Claude in the analyze route — analysis is deterministic
- Do not add a position dropdown — positions are row-assigned with an uncertain toggle
- Do not remove the debug section from HeroBuildCard — it is intentionally kept for debugging item data quality
