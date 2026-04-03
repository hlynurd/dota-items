# Dota 2 Itemization Advisor

AI-assisted item recommendations for any Dota 2 draft. Pick your heroes, see what to buy.

## What it does

Enter a 5v5 draft (or any partial lineup) and get data-driven item recommendations for each hero, broken down by game phase (Starting → Early → Core → Situational). Items are ranked by purchase popularity from real matches, with win rate stats adjusted for the specific enemy lineup.

A chat panel lets you ask follow-up questions like *"Why is BKB recommended here?"* — answered by Claude with full draft context.

## How it works

- **Analysis**: Fully deterministic — fetches live data from the [OpenDota API](https://www.opendota.com/), does the math locally. No LLM involved, no API cost per analysis, ~1s for a full 10-hero draft.
- **Chat**: Claude Sonnet answers on-demand questions about the builds. Only costs API credits when you ask something.
- **Data**: Item popularity and hero matchup win rates from OpenDota (free, no key required).

## Running locally

```bash
npm install
```

Add your Anthropic API key to `.env.local`:
```
ANTHROPIC_API_KEY=sk-ant-...
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Stack

- [Next.js 16](https://nextjs.org) (App Router, TypeScript)
- [Tailwind CSS v4](https://tailwindcss.com)
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) — chat only
- [OpenDota API](https://docs.opendota.com) — all Dota data
