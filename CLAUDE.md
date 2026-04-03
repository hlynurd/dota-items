@AGENTS.md

# Dota 2 Itemization Advisor

A web app where users input two Dota 2 teams (5v5) and get data-driven item recommendations for each hero, broken down by game phase. See `docs/spec.md` for the full feature spec.

## Stack

- **Framework**: Next.js 16 (App Router), TypeScript, Tailwind CSS
- **AI**: Claude API via `@anthropic-ai/sdk` — used **only** for the chat panel (on-demand Q&A)
- **Analysis**: Deterministic pipeline — own Postgres DB + OpenDota matchup data + Bayesian smoothing
- **Database**: Neon (serverless Postgres) via Drizzle ORM
- **Dota data**: OpenDota API (free, no key required)
- **Deployment**: Vercel (connected to GitHub repo: hlynurd/dota-items)

## Project Structure

```
app/
  page.tsx                    # Server component: fetches hero list, renders DraftApp
  components/
    DraftApp.tsx              # Main client component — all state, NDJSON stream reader
    DraftBoard.tsx            # 5v5 slot grid + Analyze button
    HeroSlot.tsx              # Single slot: portrait, row-assigned position, uncertain toggle
    HeroPicker.tsx            # Hero selection modal: search + attribute-grouped grid
    ResultsPanel.tsx          # Grid of HeroBuildCards + skeleton loader
    HeroBuildCard.tsx         # Per-hero card: item phases + timing table + debug section
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
    schema.ts                 # matches, item_timings, item_win_rates tables
    queries.ts                # getItemWinRatesForHero() — single query per hero
  opendota/
    client.ts                 # Typed fetch wrappers for OpenDota API (1hr cache)
    types.ts                  # Raw OpenDota API response types
  tools/
    index.ts                  # Tool definitions + executeTool() used by chat agent only
  agent/
    chat.ts                   # Claude chat agent with tool access + draft context
    prompts.ts                # CHAT_SYSTEM_PROMPT only
    types.ts                  # Shared app types: Hero, DraftInput, HeroBuild, etc.
  utils/
    cdn.ts                    # Valve CDN URL helpers for hero/item images
scripts/
  ingest.ts                   # Fetch parsedMatches → filter Ancient+ ranked → insert to DB
  aggregate.ts                # Join item_timings + matches → compute item_win_rates
docs/
  spec.md                     # Full feature spec
drizzle.config.ts             # Drizzle Kit config (reads DATABASE_URL)
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

`lib/analysis/build-analyzer.ts` runs all heroes in parallel:

1. Fetch `itemPopularity` + `matchups` from OpenDota for each hero
2. Fetch pre-aggregated item win rates from Neon DB (`item_win_rates` table) — one query per hero
3. `overall_win_rate` for each item = wins/games from DB (opponent_hero_id = -1 rows)
4. `win_rate` for each item = Bayesian-smoothed average across all 5 enemies:
   - For each enemy: `smoothed_wr = (wins_vs_enemy + 50 × pairwise_wr) / (games_vs_enemy + 50)`
   - Lineup score = mean of 5 smoothed_wr values
5. Phase items: ALL items in popularity bucket scored and re-ranked by win_rate, top 6 kept
6. Component items filtered out (Void Stone, Chainmail, etc.) using component set from items map
7. Starting items not shown — only early/core/situational
8. `matchup_delta` (hero-level) = avgVsEnemies − overallHeroWinRate, shown in card header
9. Confidence: high ≥100 avg games/enemy, medium ≥25, low <25

## DB Schema (lib/db/schema.ts)

- `matches` — match_id, start_time, radiant_win, avg_rank_tier, radiant_0..4, dire_0..4
- `item_timings` — match_id, hero_id, item_id, time_s, won (PK: match_id+hero_id+item_id)
- `item_win_rates` — hero_id, item_id, opponent_hero_id (-1=overall), before_minute, games, wins (PK: all four)

## Data Pipeline

**ingest.ts** (runs hourly at :00):
- Pages through `/parsedMatches` from OpenDota (has purchase_log pre-attached)
- Filters: game_mode=22 (ranked), avg_rank_tier ≥ 70 (Ancient+, highest available on free API)
- Note: Divine+ (rank 80+) not available — those players have private profiles
- Parses purchase_log, skips component items, inserts into matches + item_timings
- Prunes matches older than 7 days

**aggregate.ts** (runs hourly at :30, 30 min after ingest):
- Joins item_timings + matches to derive opponent heroes per row
- Accumulates (hero, item, opponent, before_minute) → games/wins
- before_minute buckets: 10, 20, 30, 40, 50, 999 (999 = any time = broadest sample)
- Upserts into item_win_rates in batches of 500

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
- Component item filter: built from `item.components` in OpenDota constants — any item that appears as a component of another item is excluded from recommendations
- Valve CDN for images:
  - Heroes: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/{name}.png`
  - Items: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/{name}.png`
- OpenDota base URL: `https://api.opendota.com/api`
- Never hardcode API keys — use `.env.local` and `process.env`

## Environment Variables

```
ANTHROPIC_API_KEY=   # Claude API key (chat only)
DATABASE_URL=        # Neon Postgres connection string
CRON_SECRET=         # Shared secret for Vercel Cron auth (Bearer token)
```

## npm Scripts

```
npm run dev          # Local dev server
npm run build        # Production build
npm run ingest       # Run ingest script manually (reads .env.local)
npm run aggregate    # Run aggregate script manually (reads .env.local)
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
