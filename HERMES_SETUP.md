# HERMES Agent Setup

HERMES is a self-hosted AI agent (from Nous Research — https://get-hermes.ai/) that
runs on a separate VPS and watches things our Vercel-hosted app can't reach:

- Korean crypto Telegram groups — mentions of our prospects in real time
- Upbit / Bithumb order books — volume spikes between our daily scans
- Anything else you configure as a Hermes "skill"

Hermes does the monitoring; our app receives signals via a webhook and shows them in
the Intelligence → Korea Signals feed and on the AI Agents dashboard.

---

## Integration points (already built on our side)

| Endpoint                          | Method | Purpose                                                    |
|-----------------------------------|--------|------------------------------------------------------------|
| `/api/webhooks/hermes`            | POST   | Receives signals Hermes detects                            |
| `/api/hermes/watchlist`           | GET    | Returns current prospect list for Hermes to watch          |

Both use the same shared secret: `HERMES_WEBHOOK_SECRET`
(header: `Authorization: Bearer <secret>`).

HERMES is also registered in the agent dashboard (Intelligence → AI Agents tab)
so its runs show up alongside RADAR, SCOUT, etc.

---

## One-time setup on our side

1. Generate a long random string, e.g.
   `openssl rand -hex 32`
2. Add it to Vercel project env vars as `HERMES_WEBHOOK_SECRET` (Production + Preview).
3. Redeploy.

---

## VPS setup (Hermes side)

1. **Provision a cheap VPS** (~$4–8/mo — Hetzner CX11, DigitalOcean basic, etc.).
2. **Install Hermes** following the Nous Research docs
   (https://hermes-agent.nousresearch.com/).
3. **Configure three skills** (these live as markdown files in Hermes's memory/skills dir):

### Skill 1 — `watchlist_sync.md`
Pulls our prospect list every 6 hours so Hermes knows what to watch.

```
Every 6 hours, fetch GET https://<our-vercel-domain>/api/hermes/watchlist
with header Authorization: Bearer $HERMES_WEBHOOK_SECRET.

Store the `prospects` array in memory under key `watchlist`.
For each prospect, remember its `aliases` array — these are the strings to
match in Telegram messages.
```

### Skill 2 — `korean_tg_monitor.md`
Joins Korean crypto groups and flags prospect mentions.

```
Join these Telegram groups (read-only):
  - @cryptokorea
  - @koreanblockchain
  - @upbit_official
  - @bithumb_official_kr
  (add more as you discover them)

Listen to every new message. For each message:
  1. Check if any alias from watchlist.prospects[*].aliases appears (case-insensitive).
  2. If yes, POST to https://<our-vercel-domain>/api/webhooks/hermes with:
     {
       "project_name": <matched prospect name>,
       "prospect_id": <matched prospect id>,
       "signal_type": "telegram_kr_mention",
       "headline": "<short summary, e.g. 'Avalanche mentioned in @cryptokorea (2.1k members)'>",
       "snippet": <first 200 chars of the message>,
       "source_url": <t.me link to the message>,
       "source_name": "hermes_telegram_kr",
       "relevancy_weight": 8,
       "tier": 2,
       "confidence": "confirmed",
       "shelf_life_days": 7,
       "metadata": {
         "group_name": <group>,
         "member_count": <int>,
         "message_views": <int or null>
       }
     }

Dedupe in local memory: don't re-send the same (prospect_id, group, message_id)
within 24h.
```

### Skill 3 — `korean_volume_spike.md`
Hourly check of Upbit / Bithumb for volume anomalies.

```
Every hour:
  1. Fetch https://api.upbit.com/v1/ticker?markets=KRW-BTC,KRW-ETH,... (symbols
     from watchlist.prospects[*].symbol, KRW-prefixed).
  2. Fetch https://api.bithumb.com/public/ticker/ALL_KRW similarly.
  3. For each symbol, compare acc_trade_volume_24h to the 7-day rolling median
     stored in memory under key `volume_baselines.<symbol>`.
  4. If current > 3x baseline, POST to /api/webhooks/hermes:
     {
       "project_name": <name>,
       "symbol": <symbol>,
       "signal_type": "volume_spike_upbit"  // or "volume_spike_bithumb"
       "headline": "<symbol> volume 3.4x above 7-day median on Upbit",
       "source_url": "https://upbit.com/exchange?code=CRIX.UPBIT.KRW-<symbol>",
       "source_name": "hermes_upbit_spike",
       "relevancy_weight": 15,
       "tier": 2,
       "confidence": "confirmed",
       "shelf_life_days": 3,
       "metadata": {
         "current_volume_24h_krw": <number>,
         "baseline_volume_7d": <number>,
         "multiplier": <number>
       }
     }
  5. Update the rolling baseline.
```

### Environment on the VPS

Add to `~/.hermes/env` (or wherever Hermes reads env from):

```
HERMES_WEBHOOK_SECRET=<same long random string>
HOLOHIVE_API_BASE=https://<our-vercel-domain>
```

---

## Webhook contract (for reference)

**POST** `/api/webhooks/hermes`

Headers:
```
Authorization: Bearer $HERMES_WEBHOOK_SECRET
Content-Type: application/json
```

Body (single signal or array of signals):
```json
{
  "project_name": "Avalanche",
  "prospect_id": "uuid-if-known-else-omit",
  "signal_type": "telegram_kr_mention",
  "headline": "Short human-readable summary",
  "snippet": "Longer excerpt / context (optional)",
  "source_url": "https://t.me/...",
  "source_name": "hermes_telegram_kr",
  "relevancy_weight": 8,
  "tier": 2,
  "confidence": "confirmed",
  "shelf_life_days": 7,
  "metadata": { "anything": "Hermes wants to attach" },
  "detected_at": "2026-04-19T12:34:56Z"
}
```

Response:
```json
{ "success": true, "inserted": 1, "duplicates": 0, "errors": [] }
```

**Dedupe rule:** signals with the same
`(project_name, signal_type, source_name, headline)` detected within the last
24h are skipped (counted as duplicates).

**Resolving `prospect_id`:** if Hermes doesn't know the UUID, just send
`project_name` and we'll try to match against `prospects.name` / `prospects.symbol`.

---

## Signal types Hermes emits

| `signal_type`              | Weight | Tier | Shelf life | What it means                            |
|----------------------------|--------|------|------------|------------------------------------------|
| `telegram_kr_mention`      | 8      | 2    | 7d         | Prospect mentioned in Korean TG group    |
| `telegram_kr_community`    | 12     | 2    | 14d        | Sustained community activity detected    |
| `volume_spike_upbit`       | 15     | 2    | 3d         | Upbit volume >3x 7-day median            |
| `volume_spike_bithumb`     | 15     | 2    | 3d         | Bithumb volume >3x 7-day median          |
| `volume_spike_korean`      | 12     | 2    | 3d         | Generic Korean exchange volume spike     |
| `hermes_custom`            | 5      | 3    | 14d        | Anything else Hermes flags               |

These are already wired into `SIGNAL_LABELS` so the hover cards render proper labels.

---

## Verifying it works

After setup, from the VPS:

```bash
curl -X POST https://<our-vercel-domain>/api/webhooks/hermes \
  -H "Authorization: Bearer $HERMES_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "project_name": "Test Project",
    "signal_type": "hermes_custom",
    "headline": "Hermes webhook smoke test",
    "source_name": "hermes_test"
  }'
```

Expected: `{ "success": true, "inserted": 1, "duplicates": 0, "errors": [] }`

Check the AI Agents tab — there should be a HERMES run in the Recent Runs list.
Check Korea Signals — the test signal should appear in the feed.

---

## Cost notes

- VPS: $4–8/mo
- Upbit / Bithumb APIs: free, no key needed
- Telegram: free (uses Hermes's built-in TG client — no Bot API rate limits)

Total: ~$5/mo for 24/7 coverage of signal sources we can't currently reach.
