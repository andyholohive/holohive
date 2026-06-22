# KOL scan fixtures — contract reference

What the Telegram MCP scan layer + `kol-database` Claude skill should produce.

Source: Bolt's June 10 2026 KOL Intelligence Index scan, 86 Korea-region KOLs. Original deliverable at `/Users/andylee/Downloads/KOL Intelligence Index (June 2026)/kol_master_index.xlsx`.

## `kol_scan_sample_2026-06-10.json` — 86 records

Each record is the output shape of:
- `tg_channel_snapshot(channel)` for the metric fields (`follower_count`, but in production add `avg_views_per_post`, `avg_forwards_per_post`, `avg_reactions_per_post`, `avg_replies_per_post`, `engagement_rate`, `posting_frequency`, `follower_growth_pct`, `organic_posts_analyzed`, `low_organic_volume_flag`)
- `kol-database` skill profiling output for the textual fields (`niche_tags`, `creator_types`, `style_summary`, `audience_summary`, `brief_angle_hint`)

These get persisted via the two MCP write endpoints already built in HHP:
- `POST /api/mcp/kol-snapshot/upsert` — for the snapshot row
- `POST /api/mcp/kol-profile/update` — for the master_kols profile fields

### Niche taxonomy

Doc 2 §7 final enum is 15 tags:
```
AI · DeFi · L1/L2 · Trading · Airdrop · NFT/Gaming
RWA · Regulation · Macro · Meme/Degen
Base · Solana · Ethereum · Infra/DePIN · Neobank
```

Inbound niche remaps the MCP must perform:
- `AI x Crypto` → `AI`
- `CeFi/Exchange` → `Trading`
- `Payments/Neobank` → `Neobank`

The write endpoint at `/api/mcp/kol-profile/update` enforces the enum and reports invalid tags in `droppedNiches[]`.

### Creator type taxonomy

8-value enum, max 2 per KOL:
```
Native · Scout · Tracker · Analyst
Educator · Visionary · Onboarder · Curator
```

### Field shape

| Field | Type | Source | Notes |
|---|---|---|---|
| `id` | uuid | HHP | master_kols.id; identifies the KOL |
| `name` | text | HHP | Read-only from skill perspective |
| `link` | text | scan | t.me URL or x.com URL |
| `platform` | text[] | HHP / scan | `["Telegram"]` or `["X"]` |
| `region` | text | HHP | One of the existing region enum values |
| `followers` | int | scan | Latest subscriber count |
| `pricing` | text | manual | `<$200` / `$200-500` / `$500-1K` / `$1K-2K` / `$2K-3K` / `>$3K` — sales fills, scan ignores |
| `niche_tags` | text[] | skill | After remap; matches 15-tag enum |
| `creator_types` | text[] | skill | Max 2 from the 8-value enum |
| `style_summary` | text | skill | Free-form Korean/English, 1–3 sentences |
| `audience_summary` | text | skill | Free-form Korean/English, 1–3 sentences |
| `brief_angle_hint` | text | skill | Free-form, actionable how-to-brief-this-KOL guidance |

## Why this fixture exists

This data was originally imported into prod (Phase 1, 2026-06-22) — then reverted per Andy's call to treat all of it as sample data. By the time the Telegram MCP server is built and starts feeding HHP, the actual data should come from a fresh scan, not from this 4+ week stale snapshot.

The fixture's role going forward:
1. **Contract documentation.** When wiring the MCP scan service, point its output validator at this shape.
2. **Integration test seeds.** A mock MCP server can replay this file to exercise the write endpoints end-to-end without a live Telegram session.
3. **Reference for the skill prompt.** When tuning the `kol-database` profiling skill, these examples document what "good" style/audience/brief outputs look like.

Do NOT re-import this into prod — the Telegram MCP scan layer should populate `master_kols` profile fields fresh, monthly cadence + on-demand refresh per Doc 2 §10 + §4 Mode 3.
