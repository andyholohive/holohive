# SOP — Send call notes to a client's Telegram group

Per HHP Team Dashboard Spec § 4.3, the dashboard's Recent Call Notes
card has a **"Send to TG"** button that pushes the weekly sync recap
to the client's Telegram group. This SOP covers the one-time setup
to make that button work.

## What the button does

When clicked, the HHP bot posts a formatted recap to the configured
client TG group:

```
🤝 Altura — sync recap
06/14/2026

Discussed launch timeline for Q3 campaign.
Reviewed Tier-1 KOL list and confirmed budget allocation.
...

Action items
• Send Tier-1 brief by Wed (Holo Hive)
• Lock Q3 campaign date by Fri (Holo Hive)
• Confirm creative review SLA
```

After a successful send, a green **"Sent to TG"** badge appears on
the card (persisted in `client_context.call_notes[].sent_to_client_tg_at`).

## One-time setup per client (~2 min)

The send button needs the client's Telegram chat ID stored on
`client_context.telegram_chat_id`. Each client only has to be
configured once.

### Step 1 — Get the chat ID

The bot needs to be a member of the client's Telegram group, and you
need that group's chat ID (a negative number for groups, e.g.
`-1001234567890`).

Two ways to find it:

**Option A — Use the HHP TG chat list (recommended)**
1. Open `/crm/telegram` in HHP
2. Find the client's chat in the list (use the search bar)
3. Copy the **chat_id** shown under the chat title (mono-font row)

**Option B — Ask the bot directly**
1. In the client's TG group, type `/whoami` or any command that
   triggers the bot
2. The bot's reply context includes the chat_id, or check
   `app/api/telegram/webhook/route.ts` debug logs in Vercel

### Step 2 — Save it on the client

1. Open HHP → `/clients`
2. Click **Edit Portal** on the target client
3. Modal opens → **Context** tab (default)
4. Scroll to the Resources block → paste the chat ID into the
   **Telegram Chat ID** field
5. Click **Save Changes**

Verify by reopening the modal — the chat ID should persist.

### Step 3 — Send a recap

1. Go to `/dashboard` → **Client Success** tab
2. Find that client's most recent call note card under Recent Call Notes
3. Click **Send to TG** in the card header
4. The bot posts the recap; the button flips to a green **"Sent to TG"**
   badge with the timestamp

If it fails, the card shows an inline error. The most common cause:
the bot isn't a member of that group. Add the bot, then retry.

## Idempotency + re-sends

The button is safe to mash — once a note has been sent, subsequent
clicks return `skipped: already_sent` and don't double-post. To force
a re-send (e.g. after editing the note), call the endpoint with
`{ force: true }`:

```bash
curl -X POST 'https://hhp.vercel.app/api/clients/CLIENT_ID/meeting-notes/NOTE_ID/send-tg' \
  -H 'Content-Type: application/json' \
  -d '{"force": true}'
```

## Where things live (for debugging)

| Concern | Location |
|---|---|
| Chat ID storage | `client_context.telegram_chat_id` |
| Note content (incl. send stamp) | `client_context.call_notes` (JSONB array) |
| Send endpoint | `app/api/clients/[clientId]/meeting-notes/[noteId]/send-tg/route.ts` |
| Bot token | `TELEGRAM_BOT_TOKEN` env var (Vercel) |
| TG send service | `lib/telegramService.ts` → `sendToChat()` |

## Related specs

- **HHP Team Dashboard v2** § 4.3 (Client Call Notes display + push)
- **HHP TG Bot · KOL Content Submission** (separate bot flow for KOL `/submit`)
