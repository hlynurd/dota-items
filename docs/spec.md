# Dota 2 Itemization Advisor — Full Spec

## Core Concept

A 5v5 draft input tool that uses a deterministic data pipeline (own Postgres DB + OpenDota API + Bayesian smoothing) to recommend items based on **team-level marginal statistics**, broken down by game phase. An optional Claude-powered chat panel answers on-demand questions about the builds.

---

## Input: The Draft Board

- Two columns: **Radiant** (left, green) vs **Dire** (right, red)
- Each column has 5 hero slots
- **Partial drafts are allowed** — any number of heroes on either side

### Hero Selection
- Searchable autocomplete by hero name (instant, client-side)
- Supports ~200 nicknames/aliases (e.g. "crix" for Sand King, "cm" for Crystal Maiden) via `lib/opendota/hero-aliases.ts`
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

**Item filtering:**
- Leaf components filtered (Void Stone, Chainmail, etc.)
- Mid-tier items >= 2000g kept (Eul's, Shadow Blade, etc.)
- Cheap intermediates < 2000g filtered (Perseverance, Buckler, etc.)

Items are ranked by matchup-adjusted win rate (not popularity).

### Per-Item Display
- Item icon + name + confidence dot (green=high >=100 games/enemy, yellow=medium >=25, dark=low)
- **win_rate** — Bayesian-smoothed win rate vs this specific enemy lineup
- **diff** — win_rate minus overall_win_rate, signed and color-coded

### Hero Card Header
- Hero portrait + name + position label
- **matchup_delta** — hero's avg win rate vs this lineup minus overall win rate (shown once, not per-item)

### Team Items Card
- `TeamItemsCard.tsx` — shows all items for the team with sortable columns
- Columns: Buy lift, WR With, WR Without, Diff, N matches
- Uses match-level deduplication (unique matches via match_games/match_wins, not purchase events)

### Win Rate Timeline
- Buckets: 10 / 20 / 30 / 40 / 50 minutes
- Top 3 completed items per bucket, real win rates from DB

### Debug Section
- Collapsed `<details>` at bottom of each card
- Table: items x each enemy, game count per cell (hover for wins/games/smoothed%)
- Sections: "phase items" and "timing items"

---

## Analysis Pipeline

Analysis uses **team-level marginal statistics**: "when anyone buys item X and hero Y is on the enemy team" — not hero-specific "when hero H buys item X vs hero Y". This yields much denser data.

`lib/analysis/build-analyzer.ts`, all heroes in parallel:

1. Fetch `itemPopularity` + `matchups` from OpenDota (1hr cached)
2. Fetch marginal/baseline win rates from DB — one query for all context heroes
3. Scoring: **70% enemy marginal + 30% ally marginal**, Bayesian smoothed toward baseline (K=10)
4. Phase items: all candidates scored, sorted, top 6 kept
5. Timing buckets use per-bucket win rates from DB

---

## Multi-DB Sharding

- **Primary DB** (`DATABASE_URL`): aggregate tables only (item_marginal_win_rates, item_baseline_win_rates, context_hero_totals)
- **Shard DBs** (`SHARD_URLS`): raw data (matches, item_timings)
- Backwards compatible: no `SHARD_URLS` = single-shard mode using `DATABASE_URL`
- `lib/db/shards.ts` manages shard connections
- `scripts/setup-shard.ts` provisions raw tables on new Neon projects
- Aggregate reads from all shards, writes to primary

---

## Data Pipeline

### Ingest (hourly at :00 via Vercel Cron -> /api/cron/ingest)
- Pages through OpenDota `/parsedMatches` (purchase_log attached)
- All ranks included (no rank filter), no time-based pruning
- Writes to the least-full shard; checks all shards for duplicate match_ids
- Parses purchase_log, skips components, inserts matches + item_timings

### Aggregate (hourly at :30 via Vercel Cron -> /api/cron/aggregate)
- Reads all shards (paginated in 2000-match chunks for Neon 67MB response limit)
- Joins item_timings + matches, derives opponent and ally heroes
- Accumulates marginal (item, context_hero, side, before_minute) and baseline (item, before_minute) counts
- Computes context_hero_totals (total matches per enemy/ally hero)
- before_minute buckets: 10, 20, 30, 40, 50, 999 (any time)
- Upserts into primary DB

### Background Refresh
- Page refresh triggers background aggregate via `after()`

---

## DB Schema

```
matches                  (match_id PK, ingested_at, start_time, radiant_win, avg_rank_tier, radiant_0..4, dire_0..4)
                         [in shard DBs]

item_timings             (match_id, hero_id, item_id, time_s, won) PK: all three ids
                         [in shard DBs]

item_marginal_win_rates  (item_id, context_hero_id, context_side, before_minute, games, wins, match_games, match_wins, updated_at)
                         PK: item_id+context_hero_id+context_side+before_minute
                         [in primary DB]

item_baseline_win_rates  (item_id, before_minute, games, wins, updated_at) PK: item_id+before_minute
                         [in primary DB]

context_hero_totals      (context_hero_id, context_side, total_matches, total_wins, updated_at)
                         PK: context_hero_id+context_side
                         [in primary DB] — used to compute "WR when item NOT bought"
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
Pass enemy hero attributes to Claude when surfacing specific items (e.g. BKB for disable-heavy lineup). Trigger on-demand.

---

## Deployment

- Vercel, auto-deploys on push to main (hlynurd/dota-items)
- Crons: ingest :00, aggregate :30 — both require CRON_SECRET Bearer auth
- Env vars: ANTHROPIC_API_KEY, DATABASE_URL, SHARD_URLS, CRON_SECRET, OPENDOTA_API_KEY
