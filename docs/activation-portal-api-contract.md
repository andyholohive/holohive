# HHP Activation Portal API Contract

**Audience:** engineers building or maintaining a HoloHive activation microsite (PFP generator, Trader Card, sticker drop, leaderboard, etc.) whose results should appear in the HoloHive Portal's public campaign page.

**Status:** v1.1, June 2026. Owner: HoloHive engineering team. Questions → @andy.

**v1.1 changelog (2026-06-10):** clarified that `kol_id` is the single highest-leverage field. HoloHive's `/kols` admin page now has a per-KOL Activations column that's UUID-driven — label-only entries don't appear there. Strengthened section 3 + the handoff checklist accordingly.

---

## What this is

HoloHive runs **activation microsites** for crypto-marketing campaigns — small standalone web apps where the audience does some action (mint a PFP, claim a Trader Card, register a wallet, etc.). Each microsite tracks its own activity in its own database.

Historically, results were reported back to the client as one-off Vercel report pages (`fogo-tradingcard-report.vercel.app`, etc.) hand-built per campaign. **That doesn't scale.**

Instead, the HoloHive Portal (HHP, `app.holohive.io`) now has a built-in **Activation Results section** that renders on every campaign's public page. It pulls live data from each microsite via the JSON API documented below.

If your microsite exposes this API, your activation's KPIs, charts, and per-KOL breakdowns appear automatically on the client-facing campaign page within an hour of any data change. No more bespoke report builds.

---

## How it works

```
┌─────────────────────────┐                  ┌─────────────────────────┐
│  Your microsite         │   GET /api/...   │  HHP cron               │
│  (your database)        │ <─────────────── │  /api/cron/activation-  │
│  Exposes 5 endpoints    │                  │  sync (hourly)          │
└─────────────────────────┘                  └─────────────┬───────────┘
                                                            │
                                                            ▼
                                              ┌──────────────────────┐
                                              │  activation_snapshots│
                                              │  (HHP Postgres)      │
                                              └─────────────┬────────┘
                                                            │
                                                            ▼
                                              ┌──────────────────────┐
                                              │  Public campaign page│
                                              │  Activation Results  │
                                              │  section renders     │
                                              └──────────────────────┘
```

**Key points:**
- **Pull, not push.** HHP fetches from your endpoints on a schedule. You don't push anything.
- **One base URL per campaign.** A HoloHive admin sets your microsite's URL on the matching campaign in HHP. The cron then hits `<your-base-url>/api/activation/*` for that campaign.
- **Hourly cadence.** Snapshots refresh every hour. Real-time is not the goal; the client page doesn't need second-by-second data.
- **Cached.** The public campaign page reads from the cached snapshot, never live from your microsite. Your endpoints take traffic at most once per hour per campaign.

---

## The contract

HHP polls **5 endpoints** under your base URL. Path pattern is fixed; field shapes are forgiving.

### Common rules

- All endpoints are **`GET`** requests (no query parameters).
- Response **must be valid JSON** with `Content-Type: application/json`.
- HTTP **status 200** = success; anything else (404, 500, etc.) = "no data this round, try again next hour."
- **10-second timeout.** A response slower than that is treated as a failure.
- **No authentication required** (currently). Endpoints must be publicly readable. We'll add Bearer-token support when needed — give us a heads-up if you want to ship a private API.
- Every field shown below is **optional**. Missing fields just mean the corresponding UI component on HHP renders less data, or hides entirely.
- **CORS is irrelevant.** HHP fetches server-side, not browser-side, so you don't need CORS headers.

---

### 1. `GET /api/activation/summary` — **REQUIRED**

This is the only endpoint that's strictly required. If `/summary` returns nothing valid, HHP skips your activation for that sync cycle (no snapshot row created). All other endpoints are graceful — missing them just hides specific UI components.

**Purpose:** activation metadata + headline KPIs.

**Response shape:**

```json
{
  "name": "Venice PFP Generator",
  "type": "PFP Generator",
  "status": "active",
  "start_date": "2026-05-01",
  "end_date":   "2026-06-01",
  "target_market": "Korea",

  "total_entries":        1247,
  "unique_participants":   893,
  "kols_activated":          8,

  "wallets_registered": 412,
  "cards_minted":       300,
  "frames_created":     150,

  "prize_pool": "$10,000 USDC",
  "draw_structure": "Weekly winners + grand prize",
  "points_by_source": [
    { "source": "PFP generated",     "points": 5000 },
    { "source": "Wallet registered", "points": 2000 }
  ],

  "context_sublabels": {
    "wallets_registered": "46% of registered wallets"
  }
}
```

**Field reference:**

| Field | Type | Required? | Notes |
|---|---|---|---|
| `name` | string | Recommended | Display name for the activation |
| `type` | string | Recommended | Free-text — e.g. `"PFP Generator"`, `"Trader Card"`, `"Sticker Drop"`. Renders as a small chip |
| `status` | string | Recommended | `"active"` / `"completed"` / `"draft"` / etc. HHP renders this as a colored badge |
| `start_date` | `YYYY-MM-DD` | Recommended | |
| `end_date` | `YYYY-MM-DD` | Recommended | |
| `target_market` | string | Optional | e.g. `"Korea"`, `"Vietnam"`, `"Global"` |
| `total_entries` | number | Strong recommendation | Headline KPI |
| `unique_participants` | number | Strong recommendation | Distinct wallets / users |
| `kols_activated` | number | Recommended | How many KOL channels drove traffic |
| `wallets_registered` | number | Activation-specific | Show when relevant |
| `cards_minted` | number | Activation-specific | For Trader Card-style campaigns |
| `frames_created` | number | Activation-specific | For Farcaster Frame campaigns |
| `prize_pool` | string | Optional | Renders as `"$10,000 USDC"` — preformat with currency symbol |
| `draw_structure` | string | Optional | Free-text description |
| `points_by_source` | array of `{ source, points }` | Optional | Renders as a small breakdown list |
| `context_sublabels` | object | Optional | Map of KPI key → small sub-label string (e.g. `"46% of registered wallets"`). Renders under the corresponding KPI card |

**Minimal valid response:**

```json
{ "name": "Cool Activation", "total_entries": 500 }
```

That alone produces a visible Activation Results section on HHP with the name + one KPI card. Everything else hides.

---

### 2. `GET /api/activation/entries-daily` — Optional

**Purpose:** daily entry submission count → renders as a bar chart.

**Response shape:** array of `{ date, entries }`.

```json
[
  { "date": "May 1",  "entries":  89 },
  { "date": "May 2",  "entries": 142 },
  { "date": "May 3",  "entries": 201 },
  { "date": "May 4",  "entries": 178 },
  { "date": "May 5",  "entries":  95 }
]
```

**Notes:**
- `date` is free-form display text. HHP renders it as the X-axis label verbatim. Use `"May 1"`, `"2026-05-01"`, or `"Week 1"` — whatever reads best for your campaign.
- Order matters — HHP renders left-to-right in the order you return.
- 7 to 30 entries is the sweet spot for the bar chart. Empty array → chart hides.

---

### 3. `GET /api/activation/entries-by-kol` — Optional, but high-value

**Purpose:** per-KOL channel entry counts → renders as a donut chart + a ranked leaderboard table on the campaign page, AND (when `kol_id` is provided) drives the per-KOL participation tracking on HoloHive's KOL admin page.

> 🔑 **Include `kol_id` whenever possible.** This is the single highest-leverage field in the contract. Providing the HoloHive Master KOL UUID unlocks two integrations the `label` field can't:
>
> 1. **Per-KOL participation history** — HoloHive's `/kols` admin page surfaces a per-KOL "Activations" column showing every activation a KOL has driven entries to, with totals and share %. UUID is how HoloHive joins the data; label-only rows go dark on this surface.
> 2. **Activation Impact scoring** (future, KOL Database Overhaul spec) — feeds 20% of the composite KOL score automatically. Pure-`label` data doesn't reach the scorer.
>
> If you have access to HoloHive's KOL list during activation registration, **store the UUID alongside whatever your microsite uses internally**. Ask the HoloHive AM running the campaign for the export — it's a single CSV/JSON.

**Response shape:** array of `{ kol_id?, label?, entries }`.

**Preferred — with `kol_id`:**

```json
[
  { "kol_id": "9f8e7d6c-1234-5678-9abc-def012345678", "entries": 320 },
  { "kol_id": "abcdef01-2345-6789-abcd-ef0123456789", "entries": 280 }
]
```

**Acceptable — label-only (campaign-page render works, per-KOL surfaces don't):**

```json
[
  { "label": "CryptoJin",   "entries": 320 },
  { "label": "0xKim",       "entries": 280 },
  { "label": "KoreanWhale", "entries": 210 },
  { "label": "SeoulApe",    "entries": 150 }
]
```

**Best of both — `kol_id` primary, `label` as fallback for missing matches:**

```json
[
  { "kol_id": "9f8e7d6c-1234-5678-9abc-def012345678", "label": "CryptoJin", "entries": 320 },
  { "label": "WalkInParticipant", "entries": 12 }
]
```

**Notes:**
- Provide `kol_id` whenever available. Fall back to `label` only when you genuinely don't have the UUID (e.g., a walk-in participant who's not in HoloHive's KOL roster).
- HHP prefers `kol_id` for the join; falls back to `label` for display when no match exists.
- If neither is provided, HHP labels the slot generically (`KOL #1`, `KOL #2`, etc.).
- HHP sorts the response by `entries` descending automatically — return them in any order.
- The donut handles showcase-mode masking automatically — when an HHP user shares a "sales-safe" version of the campaign, KOL labels are hidden regardless of which field they came from.

---

### 4. `GET /api/activation/clicks` — Optional

**Purpose:** ecosystem engagement / referral tracking → renders as the "Ecosystem Engagement" card.

**Response shape:**

```json
{
  "total_referrals": 412,
  "by_protocol": [
    { "protocol": "Jupiter", "clicks": 187 },
    { "protocol": "Raydium", "clicks": 124 }
  ],
  "by_source": [
    { "source": "Direct",    "clicks": 245 },
    { "source": "KOL link",  "clicks": 167 }
  ]
}
```

**Notes:**
- All three subkeys (`total_referrals`, `by_protocol`, `by_source`) are independently optional.
- `by_protocol` is for tracking outbound clicks to ecosystem dApps your activation drove traffic to.
- `by_source` is for tracking inbound traffic origin to your microsite.
- If only one subkey is present, only that subsection renders.

---

### 5. `GET /api/activation/ugc` — Optional

**Purpose:** user-generated content / social engagement → renders as the "UGC Performance" card.

**Response shape:**

```json
{
  "posts_approved": 23,
  "creators": 8,
  "approval_rate": 0.92,
  "views": 145000,
  "top_post": {
    "creator_label": "CryptoJin",
    "snippet": "My Venice PFP turned out amazing — anyone else minting today?",
    "views": 28000,
    "likes": 1200,
    "link": "https://x.com/cryptojin/status/example"
  }
}
```

**Notes:**
- `approval_rate` is a decimal between 0 and 1 (HHP multiplies by 100 for display).
- `top_post` is the single highest-performing UGC submission, shown as a quote card.
- `top_post.link` renders as an external link icon — provide the canonical X / Telegram / etc. URL.
- Any subkey can be omitted; HHP just won't render that part.

---

## Implementation guide

The contract is intentionally simple — any backend can do this. Below is a starter for the most common stack (Next.js on Vercel, since most HoloHive microsites are built that way).

### Next.js App Router (TypeScript)

Create `app/api/activation/summary/route.ts`:

```ts
import { NextResponse } from 'next/server';

// Disable Next's static optimization — these endpoints reflect live data.
export const dynamic = 'force-dynamic';

export async function GET() {
  // Replace with your actual data query.
  // Pull from your DB, KV store, or wherever you track activation data.
  const stats = await getActivationStats();

  return NextResponse.json({
    name: 'Venice PFP Generator',
    type: 'PFP Generator',
    status: stats.isLive ? 'active' : 'completed',
    start_date: '2026-05-01',
    end_date: '2026-06-01',
    target_market: 'Korea',
    total_entries: stats.totalEntries,
    unique_participants: stats.uniqueWallets,
    kols_activated: stats.kolChannelCount,
    wallets_registered: stats.walletsRegistered,
    context_sublabels: {
      wallets_registered: `${
        Math.round((stats.walletsRegistered / stats.uniqueWallets) * 100)
      }% of unique participants`,
    },
  });
}
```

Create `app/api/activation/entries-daily/route.ts`:

```ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const dailyCounts = await getDailyEntryCounts(); // your DB query
  return NextResponse.json(
    dailyCounts.map(d => ({
      date: d.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      entries: d.count,
    }))
  );
}
```

Repeat the same pattern for `entries-by-kol`, `clicks`, and `ugc`. Each is a single GET that returns JSON.

### Other stacks

The contract is just HTTP + JSON, so any backend works:

| Stack | Notes |
|---|---|
| Express / Node | Standard `app.get('/api/activation/summary', ...)` |
| Cloudflare Workers | Use `Response.json(...)` |
| FastAPI / Python | `@app.get("/api/activation/summary")` returning a dict |
| Static + cron-generated | Pre-compute the 5 JSON files daily, serve as static assets. Stale by up to a day but zero infra. Reasonable for activations that don't change often |

---

## Testing your implementation

### 1. Curl test each endpoint

Before handing off to HoloHive, smoke-test from your terminal:

```bash
BASE=https://your-microsite.com

curl -s $BASE/api/activation/summary | jq
curl -s $BASE/api/activation/entries-daily | jq
curl -s $BASE/api/activation/entries-by-kol | jq
curl -s $BASE/api/activation/clicks | jq
curl -s $BASE/api/activation/ugc | jq
```

Each should return valid JSON in well under 10 seconds.

### 2. Use HoloHive's built-in test button

Once you give HoloHive your base URL, an admin can:

1. Open `app.holohive.io/campaigns/<campaign-id>` (the matching campaign)
2. Click the **Activation** button in the header
3. Paste your base URL → click **Test connection**
4. HoloHive hits `<your-url>/api/activation/summary` and shows the JSON response inline, or the exact error if something's wrong (HTTP code, timeout, parse failure)

This is the fastest way to confirm your endpoint is reachable from HoloHive's network. The test button only hits `/summary` — once that works, save the URL and HoloHive's hourly cron picks up the rest.

### 3. Force a sync

After saving the URL, the admin can click **Sync now** in the same dialog to skip the hourly wait. The result toast tells you whether all 5 endpoints succeeded and a snapshot was written, or which one failed and why.

---

## Operational considerations

**Caching:** Your endpoints get hit at most **once per campaign per hour** by HoloHive. There's no need to add aggressive caching — the load is trivial. If your stats query is expensive, cache for a few minutes server-side; that's plenty.

**Uptime:** If HoloHive's hourly fetch fails, no big deal — HoloHive keeps the previous snapshot live on the campaign page and tries again next hour. The cron logs failures to HoloHive's `agent_runs` table; if your endpoint is unreachable for 24+ hours, the alerting will surface it.

**Schema evolution:** Adding new fields is always safe — HoloHive ignores anything it doesn't know. Removing fields is fine too — HoloHive treats missing fields as "no data, hide the component." Renaming a field is a breaking change; coordinate with HoloHive before doing that.

**Date formats:**
- `start_date` / `end_date` → ISO `YYYY-MM-DD` (strict)
- The `date` field inside `entries-daily` → free-form display text, whatever reads best on the chart
- Anything else date-related → ISO datetimes (`2026-05-15T12:34:56Z`) if you must include them

**Numbers:**
- Use raw integers, not pre-formatted strings — HoloHive handles `1247 → "1.2K"` formatting
- Exception: `prize_pool` is a string because it's currency-formatted (`"$10,000 USDC"`)
- Exception: `approval_rate` is `0..1`, not `0..100` (HoloHive multiplies for display)

**Identifying KOLs:** See the call-out in section 3 above. Short version: **include `kol_id` whenever you have it**. The UUID isn't just a future feature — HoloHive's KOL admin page already surfaces a per-KOL Activations column today that's UUID-driven. Label-only entries render fine on the campaign page but stay invisible on the KOL surface. Ask the HoloHive AM for the campaign's KOL roster export (CSV/JSON with UUIDs) and store the UUID alongside whatever your microsite tracks internally.

**Showcase mode:** HoloHive supports a "sales-safe" view where KOL handles are masked to `KOL #1`, `KOL #2`, etc. Your API doesn't need to do anything special for this — HoloHive handles the masking at render time based on the labels/IDs you provide.

---

## Quick checklist for handoff

Before telling HoloHive your microsite is ready to wire up:

- [ ] `GET /api/activation/summary` returns valid JSON within 10 seconds
- [ ] At minimum, `summary` includes `name`, `total_entries`, and either `status` or date range
- [ ] All endpoints return `Content-Type: application/json`
- [ ] Endpoints are publicly accessible (no auth required, or alert HoloHive in advance)
- [ ] Production URL is stable (not a preview/staging deploy)
- [ ] Your team is OK with HoloHive hitting these endpoints hourly indefinitely
- [ ] You've smoke-tested with the curl commands above
- [ ] **`/api/activation/entries-by-kol` includes `kol_id` for participants who are in the HoloHive KOL roster.** This is the single biggest leverage point in the integration — see section 3 for why. If you don't have UUIDs, ask the HoloHive AM for the campaign's KOL export before launch.

Then send HoloHive admin (@andy) the base URL.

---

## Questions?

- **General:** ask in the activation-portal Slack channel
- **Specific to a campaign:** ask the HoloHive AM running it
- **Spec changes / new fields:** open a ticket on the HoloHive Portal repo

---

## Reference

Spec source: HHP Campaign Dashboard Spec § 4.2 (June 2026).
Implementation: `/Users/andylee/Downloads/KOL Campaign Manager/app/api/cron/activation-sync/route.ts`.
Schema: `activation_snapshots` table.
