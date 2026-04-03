@AGENTS.md

# Dota 2 Itemization Advisor

A web app where users input two Dota 2 teams (5v5) and get data-driven item recommendations for each hero, broken down by game phase. See `docs/spec.md` for the full feature spec.

## Stack

- **Framework**: Next.js 16 (App Router), TypeScript, Tailwind CSS
- **AI**: Claude API via `@anthropic-ai/sdk` — used **only** for the chat panel (on-demand Q&A)
- **Analysis**: Deterministic pipeline — OpenDota data + pure math, no LLM
- **Dota data**: OpenDota API (free, no key required for most endpoints)
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
    HeroBuildCard.tsx         # Per-hero card: item phases + timing win rate table
    ItemChip.tsx              # Item icon + base win rate + matchup delta
    ChatPanel.tsx             # Streaming chat panel with suggestion prompts
  api/
    analyze/
      route.ts                # POST — runs deterministic analyzer, streams NDJSON
    chat/
      route.ts                # POST — runs Claude chat agent, streams plain text
lib/
  analysis/
    build-analyzer.ts         # Deterministic build pipeline (no LLM)
  opendota/
    client.ts                 # Typed fetch wrappers for OpenDota API (1hr cache)
    types.ts                  # Raw OpenDota API response types
  tools/
    index.ts                  # Tool definitions + executeTool() used by chat agent only
  agent/
    chat.ts                   # Claude chat agent with tool access + draft context
    prompts.ts                # CHAT_SYSTEM_PROMPT only (analyze prompt removed)
    types.ts                  # Shared app types: Hero, DraftInput, HeroBuild, etc.
  utils/
    cdn.ts                    # Valve CDN URL helpers for hero/item images
docs/
  spec.md                     # Full feature spec
```

## Key Types (defined in lib/agent/types.ts)

- `Hero` — id, name, attribute, position (1–5 | null)
- `DraftInput` — radiant: Hero[], dire: Hero[]
- `ItemRecommendation` — item_id, item_name, display_name, base_win_rate, matchup_delta, confidence
- `TimingBucket` — before_minute (5|10|20|30|40|50), top_items with base_win_rate + matchup_delta
- `HeroBuild` — hero + phases (starting/early/core/situational) + timing_winrates
- `ChatMessage` — role ("user" | "assistant") + content
- `ChatContext` — draft + builds (passed to chat agent)

## How Analysis Works (deterministic, no LLM)

`lib/analysis/build-analyzer.ts` runs all heroes in parallel:

1. Fetch `itemPopularity` + `matchups` from OpenDota for each hero (parallel per hero)
2. `base_win_rate` = hero's actual overall win rate ± rank bonus (+3% rank 1, -3% last)
3. `matchup_delta` = avg win rate vs specific enemies − overall win rate (real match data)
4. Items ranked by purchase count per phase bucket

Total time: ~1s for a full 10-hero draft (was ~60s with LLM).

## Role Assignment

- Row index determines default position: row 0 = Pos 1 (Carry), …, row 4 = Pos 5 (Hard Support)
- Each hero slot shows a toggle button: "Pos X — Role" by default
- Clicking the toggle marks the hero as "uncertain role" (position = null), shown in yellow
- Clicking again restores the row-assigned position
- When position = null the analysis aggregates across all roles

## Key Conventions

- All OpenDota fetch logic lives in `lib/opendota/client.ts` — never fetch OpenDota directly elsewhere
- `lib/tools/index.ts` is **chat-only** — do not use it in the analyze pipeline
- The deterministic analyzer lives entirely in `lib/analysis/build-analyzer.ts`
- Claude is **never called** during draft analysis — only when the user sends a chat message
- Valve CDN for images:
  - Heroes: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/{name}.png`
  - Items: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/{name}.png`
- OpenDota base URL: `https://api.opendota.com/api`
- OpenDota rate limit: 60 req/min — Next.js fetch cache (revalidate: 3600) handles this
- Never hardcode API keys — use `.env.local` and `process.env`

## Environment Variables

```
ANTHROPIC_API_KEY=       # Claude API key (used for chat only)
```

## What NOT to Do

- Do not use the Pages Router — App Router only
- Do not use `any` types — define proper interfaces
- Do not fetch Dota data from the frontend — all data fetching goes through API routes or server components
- Do not call Claude in the analyze route — analysis is deterministic
- Do not add a position dropdown — positions are row-assigned with an uncertain toggle
