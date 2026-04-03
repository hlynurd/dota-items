# Dota 2 Itemization Advisor — Full Spec

## Core Concept

A 5v5 draft input tool that uses a deterministic data pipeline (own Postgres DB + OpenDota API + Bayesian smoothing) to recommend items for each hero, broken down by game phase. An optional Claude-powered chat panel answers on-demand questions about the builds.

---

## Input: The Draft Board

- Two columns: **Radiant** (left, green) vs **Dire** (right, red)
- Each column has 5 hero slots
- **Partial drafts are allowed** — any number of heroes on either side

### Hero Selection
- Searchable autocomplete by hero name (instant, client-side)
- Click a hero from a categorized grid grouped by attribute (Strength / Agility / Intelligence / Universal)
- Hero portraits shown once selected (from Valve CDN)

### Role Designation
- Row index determines position by default: row 1 = Pos 1 (Carry), …, row 5 = Pos 5 (Hard Support)
- Each slot shows a toggle button: "Pos X — Role Label"
- Clicking the toggle marks the hero as uncertain role (position = null, shown in yellow)
- Clicking again restores the row-assigned position

---

## Output: Item Recommendations

### Item Phases (3 phases — starting items not shown)

| Phase | OpenDota bucket | Examples |
|---|---|---|
| Early Game | early_game_items | Boots, Magic Wand, Wraith Band |
| Core Items | mid_game_items | Power Treads, Blink Dagger, BKB |
| Situational / Late | late_game_items | Luxury items, late counters |

Only **completed items** shown — component items (Void Stone, Chainmail, etc.) filtered out via the component graph in OpenDota's item constants.

Items are ranked by matchup-adjusted win rate (not popularity).

### Per-Item Display
- Item icon + name + confidence dot (green=high ≥100 games/enemy, yellow=medium ≥25, dark=low)
- **win_rate** — Bayesian-smoothed win rate vs this specific enemy lineup
- **diff** — win_rate − overall_win_rate, signed and color-coded

### Hero Card Header
- Hero portrait + name + position label
- **matchup_delta** — hero's avg win rate vs this lineup minus overall win rate (shown once, not per-item)

### Win Rate Timeline
- Buckets: 10 / 20 / 30 / 40 / 50 minutes
- Top 3 completed items per bucket, real win rates from DB

### Debug Section
- Collapsed `<details>` at bottom of each card
- Table: items × each enemy, game count per cell (hover for wins/games/smoothed%)
- Sections: "phase items" and "timing items"

---

## Analysis Pipeline

`lib/analysis/build-analyzer.ts`, all heroes in parallel:

1. Fetch `itemPopularity` + `matchups` from OpenDota (1hr cached)
2. Single DB query per hero: all `item_win_rates` rows for this hero × these enemies
3. Build overallByItem (opponent=-1) and vsEnemyByItem maps per timing bucket
4. **Bayesian smoothing** K=50 per item × per enemy:
   `smoothed_wr = (wins_vs_enemy + 50 × pairwise_wr) / (games_vs_enemy + 50)`
5. Lineup score = mean smoothed_wr across 5 enemies
6. Phase items: all candidates scored, sorted, top 6 kept
7. Timing buckets use per-bucket win rates from DB

---

## Data Pipeline

### Ingest (hourly at :00 via Vercel Cron → /api/cron/ingest)
- Pages through OpenDota `/parsedMatches` (purchase_log attached)
- Filter: game_mode=22, avg_rank_tier ≥ 70 (Ancient+)
- **Note**: Divine+ (rank ≥80) unavailable via free API — players have private profiles
- Parses purchase_log, skips components, inserts matches + item_timings
- Prunes rows older than 7 days

### Aggregate (hourly at :30 via Vercel Cron → /api/cron/aggregate)
- Joins item_timings + matches, derives opponent heroes
- Accumulates (hero, item, opponent, before_minute) → games/wins
- opponent_hero_id = -1 means overall baseline
- before_minute buckets: 10, 20, 30, 40, 50, 999 (any time)
- Full upsert into item_win_rates

---

## DB Schema

```
matches        (match_id PK, start_time, radiant_win, avg_rank_tier, radiant_0..4, dire_0..4)
item_timings   (match_id, hero_id, item_id, time_s, won) PK: all three ids
item_win_rates (hero_id, item_id, opponent_hero_id, before_minute, games, wins) PK: all four
```

Hosted on Neon (serverless Postgres). Accessed via Drizzle ORM.

---

## Rate Limiting

`/api/analyze`: 5 requests per IP per 60 seconds (in-memory sliding window).

---

## Chat

- POST /api/chat — Claude Sonnet, streams plain text
- Has full draft + build context
- Session-only history (no persistence)

### Future: LLM Explanation Layer
Pass enemy hero attributes to Claude when surfacing specific items (e.g. BKB → explain disable-heavy lineup). Trigger on-demand.

---

## Deployment

- Vercel, auto-deploys on push to main (hlynurd/dota-items)
- Crons: ingest :00, aggregate :30 — both require CRON_SECRET Bearer auth
- Env vars: ANTHROPIC_API_KEY, DATABASE_URL, CRON_SECRET
