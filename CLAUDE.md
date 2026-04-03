@AGENTS.md

# Dota 2 Itemization Advisor

A web app where users input two Dota 2 teams (5v5) and an AI agent recommends optimal item builds for each hero based on the matchup.

## Stack

- **Framework**: Next.js 16 (App Router), TypeScript, Tailwind CSS
- **AI**: Claude API via `@anthropic-ai/sdk` — agentic tool use with streaming
- **Dota data**: OpenDota API (free, no key required for most endpoints)
- **Deployment**: Vercel (connected to GitHub repo: hlynurd/dota-items)

## Project Structure

```
app/
  page.tsx              # Main UI: team picker + results
  api/
    analyze/
      route.ts          # POST endpoint — runs the agent, streams response
lib/
  tools/                # Agent tools (functions Claude can call)
    get_hero_data.ts
    get_item_winrates.ts
    get_pro_builds.ts
  agent/
    index.ts            # Agentic loop: tool definitions, system prompt, streaming
    types.ts            # Shared types: Hero, Item, ItemBuild, AgentResponse
docs/
  spec.md               # Full feature spec
```

## Key Conventions

- All agent tool definitions live in `lib/tools/` — one file per tool
- The agent loop is in `lib/agent/index.ts` — do not scatter agent logic into API routes
- Use streaming (`stream: true`) on all Claude calls so the UI feels live
- Structured output: agent always returns `AgentResponse` type (see `lib/agent/types.ts`)
- OpenDota base URL: `https://api.opendota.com/api`
- Never hardcode API keys — use `.env.local` and `process.env`

## Environment Variables

```
ANTHROPIC_API_KEY=       # Claude API key
```

## What NOT to Do

- Do not use the Pages Router — App Router only
- Do not use `any` types — define proper interfaces in `lib/agent/types.ts`
- Do not fetch Dota data from the frontend — all data fetching goes through the API route
