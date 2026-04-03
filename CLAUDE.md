@AGENTS.md

# Dota 2 Itemization Advisor

A web app where users input two Dota 2 teams (5v5) and an AI agent recommends optimal item builds for each hero based on the matchup. See `docs/spec.md` for the full feature spec.

## Stack

- **Framework**: Next.js 16 (App Router), TypeScript, Tailwind CSS
- **AI**: Claude API via `@anthropic-ai/sdk` — agentic tool use with streaming
- **Dota data**: OpenDota API (free, no key required for most endpoints)
- **Deployment**: Vercel (connected to GitHub repo: hlynurd/dota-items)

## Project Structure

```
app/
  page.tsx                    # Main UI: draft board + results
  api/
    analyze/
      route.ts                # POST endpoint — runs agent, streams response
lib/
  opendota/
    client.ts                 # Typed fetch wrappers for OpenDota API
    types.ts                  # Raw OpenDota API response types
  tools/                      # Agent tools (functions Claude can call)
    get_hero_info.ts
    get_hero_item_popularity.ts
    get_hero_matchups.ts
    get_item_winrates_by_timing.ts
    get_pro_builds.ts
    index.ts                  # Exports all tool definitions for the agent
  agent/
    index.ts                  # Agentic loop: system prompt, tool dispatch, streaming
    types.ts                  # Shared app types: Hero, Item, ItemBuild, AgentResponse
docs/
  spec.md                     # Full feature spec — read this for feature details
```

## Key Types (defined in lib/agent/types.ts)

- `Hero` — id, name, attribute, position (1-5 | null)
- `DraftInput` — radiant: Hero[], dire: Hero[]
- `ItemRecommendation` — item_id, item_name, win_rate, confidence, justification
- `HeroBuild` — hero + phases (starting/early/core/situational) + timing_winrates
- `AgentResponse` — HeroBuild[] for all heroes in the draft

## Key Conventions

- All OpenDota fetch logic lives in `lib/opendota/client.ts` — never fetch OpenDota directly from tools or API routes
- All agent tool definitions live in `lib/tools/` — one file per tool, export all from `index.ts`
- The agent loop is in `lib/agent/index.ts` — do not scatter agent logic into API routes
- Use streaming on all Claude calls so the UI feels live
- Hero positions: 1=Carry, 2=Mid, 3=Offlane, 4=Soft Support, 5=Hard Support
- Valve CDN for images:
  - Heroes: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/{name}.png`
  - Items: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/{name}.png`
- OpenDota base URL: `https://api.opendota.com/api`
- OpenDota rate limit: 60 req/min — batch or cache calls where possible
- Never hardcode API keys — use `.env.local` and `process.env`

## Environment Variables

```
ANTHROPIC_API_KEY=       # Claude API key
```

## What NOT to Do

- Do not use the Pages Router — App Router only
- Do not use `any` types — define proper interfaces
- Do not fetch Dota data from the frontend — all data fetching goes through API routes
- Do not block on all 10 heroes before streaming — stream hero builds one at a time
