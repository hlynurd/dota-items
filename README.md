# Dota 2 Itemization Advisor

Data-driven item recommendations for any Dota 2 draft. Pick your heroes, see what to buy against this specific lineup.

## What it does

Enter a 5v5 draft (or any partial lineup) and get item recommendations for each hero, broken down by game phase (Early → Core → Situational). Items are ranked by win rate specifically against the enemies in your draft — not just general popularity.

A chat panel lets you ask follow-up questions like *"Why is BKB recommended here?"* — answered by Claude with full draft context.

## How it works

- **Analysis**: Fully deterministic — no LLM, no API cost per analysis. Pulls item win rate data from our own Postgres database of recent Ancient+ ranked matches, uses Bayesian smoothing to handle sparse matchups.
- **Data**: Rolling 7-day window of Ancient+ ranked matches ingested hourly from OpenDota. Item win rates pre-aggregated per (hero, item, opponent, timing bucket).
- **Chat**: Claude Sonnet answers on-demand questions. Only costs API credits when you ask something.

## Running locally

```bash
npm install
```

Create `.env.local`:
```
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgresql://...   # Neon connection string
CRON_SECRET=any-secret-string
```

```bash
npm run dev
```

To seed the database locally:
```bash
npm run ingest      # fetch recent matches from OpenDota
npm run aggregate   # compute win rate summaries
```

To push schema changes to Neon:
```bash
npm run db:push
```

## Stack

- [Next.js 16](https://nextjs.org) (App Router, TypeScript)
- [Tailwind CSS v4](https://tailwindcss.com)
- [Neon](https://neon.tech) — serverless Postgres
- [Drizzle ORM](https://orm.drizzle.team)
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) — chat only
- [OpenDota API](https://docs.opendota.com) — hero/item metadata + matchup data
