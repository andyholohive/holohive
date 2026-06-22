# KOL scan fixtures — contract reference

What the Telegram MCP scan layer + `kol-database` Claude skill should produce per KOL, in the exact shape HHP write endpoints accept.

Source: Bolt's June 10 2026 KOL Intelligence Index scan, 86 Korea-region KOLs. Original deliverable at `/Users/andylee/Downloads/KOL Intelligence Index (June 2026)/kol_master_index.xlsx`.

## `kol_scan_sample_2026-06-10.json` — 86 records

Each record has 4 sections:

```jsonc
{
  "kol_id": "uuid",        // HHP-owned, MCP read-only
  "name": "...",           // HHP-owned, MCP read-only

  "profile": { ... },      // kol-database skill output → POST /api/mcp/kol-profile/update
  "snapshot": { ... },     // tg_channel_snapshot output → POST /api/mcp/kol-snapshot/upsert

  "_bolt_interim": { ... } // Bolt's interim 4-component score (NOT the new model — reference only)
}
```

### `profile` — kol-database skill output

What the Claude skill produces after analyzing a channel. Persisted to `master_kols` via `POST /api/mcp/kol-profile/update`.

| Field | Type | Notes |
|---|---|---|
| `link` | text | `t.me/...` or `x.com/...` |
| `platform` | text[] | `["Telegram"]` / `["X"]` |
| `region` | text | One of the existing region enum values |
| `follower_count` | int | Skill writes the same number as snapshot.follower_count |
| `pricing` | text | `<$200` / `$200-500` / `$500-1K` / `$1K-2K` / `$2K-3K` / `>$3K` |
| `niche_tags` | text[] | 15-tag enum (see below); legacy tags auto-remap server-side |
| `creator_types` | text[] | Max 2 from 8-value enum (see below) |
| `style_summary` | text | 1–3 sentence Korean/English voice + post-format characterization |
| `audience_summary` | text | 1–3 sentences on who reads + what travels |
| `brief_angle_hint` | text | Actionable how-to-brief-this-KOL guidance |

### `snapshot` — `tg_channel_snapshot` output

What the Telethon scan produces from organic posts. Persisted to `kol_channel_snapshots` via `POST /api/mcp/kol-snapshot/upsert` (upsert on `(kol_id, snapshot_date)`).

| Field | Type | Notes |
|---|---|---|
| `snapshot_date` | date | `YYYY-MM-DD`, the scan run date |
| `follower_count` | int | Subscriber count at scan time |
| `avg_views_per_post` | numeric | Across organic posts only (hashtag + forward exclusion) |
| `avg_forwards_per_post` | numeric | Same organic pool |
| `avg_reactions_per_post` | numeric | Same organic pool |
| `avg_replies_per_post` | numeric \| null | **Currently null in this fixture** — Doc 2 §11 open item, Bolt's pipeline doesn't capture replies yet. When it does, populates from linked discussion group |
| `posting_frequency` | numeric | Posts per week |
| `organic_posts_analyzed` | int | How many organic posts the averages drew from |
| `low_organic_volume_flag` | boolean | True when `organic_posts_analyzed < 10` (low-confidence marker) |
| `follower_growth_pct` | numeric \| null | Month-over-month. Null on month-1 scans per Doc 2 §3a + Jdot Q4 |

Note: `engagement_rate` is NOT in the payload — it's a GENERATED column on the DB side (`avg_views_per_post / follower_count`). The upsert endpoint strips any inbound `engagement_rate` value.

### `_bolt_interim` — reference only

Bolt's June 10 4-component interim score (`engagement_rate`, `reach_efficiency`, `channel_activity`, `reaction_density`) — a historical reference for what the team had before Doc 2's two-score model landed. **Not used by the new compute** (`lib/kolScoreService.ts`). Included so the fixture documents the full pre-Doc-2 state of the team's thinking.

## Niche taxonomy (Doc 2 §7)

Final enum is 15 tags:

```
AI · DeFi · L1/L2 · Trading · Airdrop · NFT/Gaming
RWA · Regulation · Macro · Meme/Degen
Base · Solana · Ethereum · Infra/DePIN · Neobank
```

Inbound legacy remaps the write endpoint performs:
- `AI x Crypto` → `AI`
- `CeFi/Exchange` → `Trading`
- `Payments/Neobank` → `Neobank`

Invalid tags get dropped and reported back in the response's `droppedNiches[]`.

## Creator type taxonomy

8-value enum, max 2 per KOL:

```
Native · Scout · Tracker · Analyst
Educator · Visionary · Onboarder · Curator
```

Beyond 2 valid entries get trimmed silently per spec.

## How HHP uses this fixture

1. **Contract documentation.** When wiring the MCP scan service, point its output validator at this shape.
2. **Integration test seeds.** A mock MCP server can replay this file to exercise the write endpoints end-to-end without a live Telegram session.
3. **Score-compute preview.** `GET /api/kols/scores-preview` (added 2026-06-22) computes scores from this fixture instead of the DB. Proves the pipeline end-to-end with realistic data without touching prod. The route is internal-only (auth-gated) and never used by the regular `/kols` list.
4. **Reference for the skill prompt.** When tuning the `kol-database` profiling skill, these examples document what "good" `style_summary` / `audience_summary` / `brief_angle_hint` outputs look like.

**Do NOT re-import this into prod** — the Telegram MCP scan layer should populate `master_kols` profile fields fresh, monthly cadence + on-demand refresh per Doc 2 §10 + §4 Mode 3.
