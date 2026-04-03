# Dota 2 Itemization Advisor — Full Spec

## Core Concept

A 5v5 draft input tool that uses an AI agent + real match data to recommend
items for each hero, broken down by game phase, with statistical backing and
LLM-generated justifications.

---

## Input: The Draft Board

- Two columns: **Radiant** (left, green) vs **Dire** (right, red)
- Each column has 5 hero slots
- **Partial drafts are allowed** — user can fill in any number of heroes on either side
- At minimum: at least 1 hero on either team to generate recommendations

### Hero Selection
- Searchable autocomplete by hero name (instant, client-side)
- Alternatively: click a hero from a categorized grid grouped by attribute:
  - Strength / Agility / Intelligence / Universal
- Hero portraits shown once selected (from Valve CDN)

### Role Designation (optional per hero)
- Each hero slot has a dropdown: **Pos 1 / Pos 2 / Pos 3 / Pos 4 / Pos 5**
- Defaults to unset if not chosen
- Affects item recommendations significantly (e.g. Earthshaker Pos 3 vs Pos 4)
- Role labels shown in UI:
  - Pos 1 = Carry
  - Pos 2 = Mid
  - Pos 3 = Offlane
  - Pos 4 = Soft Support
  - Pos 5 = Hard Support

---

## Output: Item Recommendations

### Layout
- One card per hero on both teams
- Each card shows the hero portrait, name, role (if set), and item build

### Item Timeline (horizontal or vertical checklist)
Broken into 4 game phases:

| Phase | Timing | Examples |
|---|---|---|
| Starting Items | min 0 | Tango, Faerie Fire, Branches, Quelling Blade |
| Early Game | min 5–15 | Boots, Magic Wand, Bracers, Null Talismans |
| Core Items | min 15–30 | Power Treads, Blink Dagger, BKB, key damage items |
| Situational / Late | min 30+ | Counter-items, luxury items, replacements |

### Per-Item Display
- Item icon (Valve CDN)
- Item name
- **Win rate bar** — color-coded confidence indicator showing win rate for this item in this matchup context
- **"Why" justification** — one sentence from the agent explaining the recommendation in context of the specific enemy lineup

### Win Rate Timeline
Below the build, a section: **"Highest win rate items by minute"**
- Buckets: before min 5 / min 10 / min 20 / min 30 / min 40 / min 50
- Shows top 3 items per bucket for this hero in the current matchup
- Data-driven from OpenDota match statistics

---

## The Agent

Claude is used as an agent with tool use (not just a prompt).

### Tools available to the agent:
1. `get_hero_info(hero_name)` — attributes, roles, abilities summary
2. `get_hero_item_popularity(hero_id, position?)` — popular items on this hero, grouped by timing
3. `get_hero_matchups(hero_id)` — win rates vs all other heroes
4. `get_item_winrates_by_timing(hero_id, enemy_hero_ids[])` — item win rates at different game minute buckets
5. `get_pro_builds(hero_id)` — recent pro game item builds for context

### Agent output (structured JSON):
```typescript
{
  hero_id: number,
  hero_name: string,
  position: 1 | 2 | 3 | 4 | 5 | null,
  phases: {
    starting: ItemRecommendation[],
    early: ItemRecommendation[],
    core: ItemRecommendation[],
    situational: ItemRecommendation[],
  },
  timing_winrates: TimingBucket[],
}

ItemRecommendation: {
  item_id: number,
  item_name: string,
  win_rate: number,        // 0-1
  confidence: "high" | "medium" | "low",
  justification: string,  // one sentence, context-aware
}

TimingBucket: {
  before_minute: number,  // 5, 10, 20, 30, 40, 50
  top_items: { item_id: number, item_name: string, win_rate: number }[],
}
```

### Streaming
- Response streams to the UI — hero cards appear one by one as the agent finishes each
- UI shows a "thinking" indicator while agent is calling tools

---

## Data Source: OpenDota API

Base URL: `https://api.opendota.com/api`

Key endpoints used:
- `GET /heroes` — full hero list
- `GET /constants/heroes` — hero details (attributes, roles)
- `GET /constants/items` — item details
- `GET /heroes/{hero_id}/itemPopularity` — item popularity by timing bucket
- `GET /heroes/{hero_id}/matchups` — per-hero matchup win rates
- `GET /proMatches` + `GET /matches/{match_id}` — pro build data
- `GET /explorer?sql=...` — SQL queries for complex timing win rate data

No API key required for most endpoints (rate limit: 60 req/min on free tier).

---

## Aesthetic

- Dark theme throughout (matches Dota 2 native UI)
- Green for Radiant, Red for Dire
- Hero/item images from Valve CDN:
  - Heroes: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/{hero_name}.png`
  - Items: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/{item_name}.png`

---

## Deployment

- Hosted on Vercel (free tier)
- GitHub repo: hlynurd/dota-items
- Env vars: `ANTHROPIC_API_KEY`
- Rate limiting on `/api/analyze` to protect Claude API credits
