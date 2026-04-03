# Dota 2 Itemization Advisor — Full Spec

## Core Concept

A 5v5 draft input tool that uses a deterministic data pipeline (OpenDota API + math)
to recommend items for each hero, broken down by game phase. An optional Claude-powered
chat panel answers on-demand questions about the builds.

---

## Input: The Draft Board

- Two columns: **Radiant** (left, green) vs **Dire** (right, red)
- Each column has 5 hero slots
- **Partial drafts are allowed** — any number of heroes on either side
- At minimum: at least 1 hero on either team to generate recommendations

### Hero Selection
- Searchable autocomplete by hero name (instant, client-side)
- Alternatively: click a hero from a categorized grid grouped by attribute:
  - Strength / Agility / Intelligence / Universal
- Hero portraits shown once selected (from Valve CDN)

### Role Designation
- **Row index determines position by default**: row 1 = Pos 1 (Carry), row 2 = Pos 2 (Mid), etc.
- Each filled slot shows a toggle button: `Pos X — Role Label`
- **Clicking the toggle** marks the hero as **uncertain role** (shown in yellow, position = null)
- Clicking again restores the row-assigned position
- When position = null the analysis aggregates across all roles rather than conditioning on one

Position labels:
- Pos 1 = Carry
- Pos 2 = Mid
- Pos 3 = Offlane
- Pos 4 = Soft Support
- Pos 5 = Hard Support

---

## Output: Item Recommendations

### Layout
- One card per hero on both teams
- Each card shows: hero portrait, name, position label (if set), item build by phase

### Item Timeline
Broken into 4 game phases:

| Phase | Timing | Examples |
|---|---|---|
| Starting Items | min 0 | Tango, Faerie Fire, Branches, Quelling Blade |
| Early Game | min 5–15 | Boots, Magic Wand, Bracers, Null Talismans |
| Core Items | min 15–30 | Power Treads, Blink Dagger, BKB, key damage items |
| Situational / Late | min 30+ | Luxury items, late counters |

### Per-Item Display
- Item icon (Valve CDN)
- Item name
- **Base win rate** — hero's overall win rate ± popularity rank bonus (±3%)
- **Matchup delta** — `avg win rate vs these specific enemies − overall win rate`, signed and color-coded (`+4.2%` green / `-1.8%` red)
- **Confidence dot** — green = top-3 by purchase count, yellow = top-7, grey = lower

### Win Rate Timeline
Below the build: **"Win Rate by Minute"** table
- Buckets: min 5 / 10 / 20 / 30 / 40 / 50
- Top 3 items per bucket, each showing base win rate + matchup delta
- Phase → bucket mapping: starting→5, early→10&20, mid→30&40, late→50

---

## Analysis Pipeline (deterministic, no LLM)

All heroes are analyzed **in parallel** via `lib/analysis/build-analyzer.ts`:

1. Fetch `GET /heroes/{id}/itemPopularity` — purchase counts by phase
2. Fetch `GET /heroes/{id}/matchups` — win rates vs every other hero
3. Compute `overall_win_rate` = totalWins / totalGames across all matchups
4. Compute `matchup_delta` = avgWinRateVsTheseEnemies − overallWinRate
5. Rank items by purchase count per phase
6. Assign `base_win_rate` = overallWinRate + rankBonus (top item +3%, last item −3%)

Total time: ~1 second for a full 10-hero draft.

---

## Chat Window

A persistent chat panel visible after analysis runs.

- User can ask: *"Why is BKB recommended here?"*, *"What counters Axe?"*, etc.
- Claude has full context: current draft, both teams, all builds, win rate data
- Responses stream in real time
- Claude can also call live data tools (item popularity, matchup win rates) if needed
- Chat history is session-only (no persistence across page reloads)
- API route: `POST /api/chat` — accepts `{ messages: ChatMessage[], context: ChatContext }`
- Model: `claude-sonnet-4-6`, max_tokens: 8192

---

## Data Source: OpenDota API

Base URL: `https://api.opendota.com/api`

Key endpoints used:
- `GET /heroes` — full hero list (fetched server-side on page load, cached 1hr)
- `GET /constants/items` — item details and display names (cached 1hr)
- `GET /heroes/{hero_id}/itemPopularity` — item purchase counts by phase (cached 1hr)
- `GET /heroes/{hero_id}/matchups` — per-hero matchup win rates (cached 1hr)

No API key required. Rate limit: 60 req/min on free tier (mitigated by Next.js fetch cache).

---

## Aesthetic

- Always-dark theme (zinc-950 base, matches Dota 2 native UI)
- Green for Radiant, Red for Dire
- Valve CDN for images:
  - Heroes: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/{name}.png`
  - Items: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/{name}.png`

---

## Deployment

- Hosted on Vercel (free tier)
- GitHub repo: hlynurd/dota-items
- Required env var: `ANTHROPIC_API_KEY` (chat only — analyze route uses no API credits)
