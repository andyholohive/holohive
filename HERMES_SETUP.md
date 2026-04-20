# Setting up HERMES — Step-by-Step

**What this is:** HERMES is an always-on AI agent that runs on its own cheap VPS.
It watches Korean Telegram groups and Upbit/Bithumb volumes 24/7 and sends
signals back to our HoloHive app.

**Why we need it:** Our app only scans once a day. HERMES fills the gaps —
real-time TG mentions and between-scan volume spikes.

**Cost:** ~$5/month for the VPS. Everything else is free.

**Total setup time:** ~60 minutes (most of it is waiting for the VPS to install).

---

## Before you start

You'll need:

- [ ] A credit card (for the VPS)
- [ ] Access to our Vercel project (to set one env var)
- [ ] A terminal / SSH on your laptop
- [ ] Telegram on your phone (to authenticate Hermes)

---

## Step 1 — Generate a shared secret (2 min)

This is a password that HoloHive and HERMES use to talk to each other.

Open your terminal and run:

```bash
openssl rand -hex 32
```

Copy the long hex string it prints. **Save it somewhere** — you'll paste it in
two places (Vercel + VPS). Call it `HERMES_WEBHOOK_SECRET`.

---

## Step 2 — Add the secret to Vercel (3 min)

1. Go to https://vercel.com → HoloHive project → **Settings** → **Environment Variables**
2. Click **Add New**
3. Name: `HERMES_WEBHOOK_SECRET`
4. Value: paste the hex string from Step 1
5. Environments: check **Production**, **Preview**, and **Development**
6. Click **Save**
7. Go to **Deployments** → click the three-dot menu on the latest deployment → **Redeploy**

Wait ~2 min for the redeploy to finish before continuing.

---

## Step 3 — Rent a VPS (10 min)

Any of these works. Pick one:

| Provider       | Plan            | Cost    | Link                                  |
|----------------|-----------------|---------|---------------------------------------|
| Hetzner        | CX22            | ~$4/mo  | https://www.hetzner.com/cloud         |
| DigitalOcean   | Basic $4        | $4/mo   | https://www.digitalocean.com          |
| Vultr          | Regular Cloud   | $5/mo   | https://www.vultr.com                 |

When setting up the VPS:

- [ ] **Location:** Seoul or Tokyo (closest to the KR exchanges — faster responses)
- [ ] **OS:** Ubuntu 24.04 LTS
- [ ] **SSH key:** upload your public key (or use password auth if you prefer)

After it provisions, the provider shows you the VPS's IP address. SSH in:

```bash
ssh root@<your-vps-ip>
```

---

## Step 4 — Install HERMES on the VPS (15 min)

Once you're SSH'd into the VPS, run:

```bash
# Update the system
apt update && apt upgrade -y

# Install prerequisites (curl, git, Node.js)
apt install -y curl git build-essential
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install HERMES (follow their current docs for the exact command)
# As of this writing:
npm install -g @nousresearch/hermes

# Or if they provide an installer script:
# curl -fsSL https://get-hermes.ai/install.sh | sh
```

**If any of the above commands change**, follow the official install instructions
at https://get-hermes.ai/ — they take priority over this doc.

Initialize HERMES:

```bash
hermes init
```

This creates `~/.hermes/` with `config.yaml`, `skills/`, and `memory/` folders.

---

## Step 5 — Configure HERMES environment (3 min)

Edit the HERMES env file:

```bash
nano ~/.hermes/.env
```

Add these lines (paste your actual values):

```
HERMES_WEBHOOK_SECRET=<paste the hex string from Step 1>
HOLOHIVE_API_BASE=https://<your-vercel-domain>
ANTHROPIC_API_KEY=<your Claude API key — HERMES uses this for reasoning>
TELEGRAM_PHONE=<your phone number with country code, e.g. +821012345678>
```

Save (Ctrl+O, Enter, Ctrl+X).

---

## Step 6 — Authenticate Telegram (5 min)

HERMES needs to log in as a Telegram user to join public groups. Run:

```bash
hermes telegram login
```

It'll text your phone a code. Enter it when prompted. That's it — HERMES now
has a Telegram session stored in `~/.hermes/memory/telegram.session`.

**Important:** Use a separate Telegram account if you can (a secondary phone number).
This account will be the one joining crypto groups, so keep it clean.

---

## Step 7 — Install the three skills (10 min)

Skills are markdown files in `~/.hermes/skills/`. Create three of them:

### Skill 1: Sync the watchlist

```bash
nano ~/.hermes/skills/watchlist_sync.md
```

Paste:

```markdown
# Watchlist Sync

Schedule: every 6 hours

Task:
  1. GET $HOLOHIVE_API_BASE/api/hermes/watchlist
     with header: Authorization: Bearer $HERMES_WEBHOOK_SECRET
  2. Parse the `prospects` array from the response.
  3. Store it in memory under key `watchlist`.
  4. For each prospect, also store its `aliases` array under
     `watchlist.{prospect_id}.aliases` — these are the strings to
     match when scanning Telegram messages.
```

### Skill 2: Monitor Korean Telegram

```bash
nano ~/.hermes/skills/korean_tg_monitor.md
```

Paste:

```markdown
# Korean Telegram Monitor

Schedule: always-on (listener)

Telegram groups to join (read-only):
  - @cryptokorea
  - @koreanblockchain
  - @upbit_official
  - @bithumb_official_kr
  - (add more as you find them)

Task: for every new message in any of these groups:
  1. Get the message text and message URL.
  2. Look through memory.watchlist — does any alias from any prospect
     appear in the message text? (case-insensitive, word boundary match)
  3. If yes, POST to $HOLOHIVE_API_BASE/api/webhooks/hermes with:
     - Authorization: Bearer $HERMES_WEBHOOK_SECRET
     - Content-Type: application/json
     - Body:
       {
         "project_name": <the matched prospect name>,
         "prospect_id":  <the matched prospect id>,
         "signal_type":  "telegram_kr_mention",
         "headline":     "<prospect> mentioned in @<group> (<member_count> members)",
         "snippet":      <first 200 chars of the message>,
         "source_url":   <t.me link to the message>,
         "source_name":  "hermes_telegram_kr",
         "relevancy_weight": 8,
         "tier": 2,
         "confidence": "confirmed",
         "shelf_life_days": 7,
         "metadata": {
           "group_name":     "<group>",
           "member_count":   <int>,
           "message_views":  <int or null>
         }
       }

Dedupe: don't re-send the same (prospect_id, group, message_id) within 24h.
Store seen keys in memory.telegram_seen.
```

### Skill 3: Monitor exchange volumes

```bash
nano ~/.hermes/skills/korean_volume_spike.md
```

Paste:

```markdown
# Korean Exchange Volume Spike Detector

Schedule: every 1 hour

Task:
  1. Build symbol list from memory.watchlist — collect prospects[*].symbol
     where symbol is not null.
  2. Fetch Upbit tickers:
       GET https://api.upbit.com/v1/ticker?markets=KRW-<SYM1>,KRW-<SYM2>,...
       (batch into groups of 50 symbols per request)
  3. Fetch Bithumb tickers:
       GET https://api.bithumb.com/public/ticker/ALL_KRW
  4. For each symbol, get the current acc_trade_volume_24h (in KRW).
  5. Compare to the 7-day rolling median stored at
     memory.volume_baselines.<exchange>.<symbol>.
  6. If current > 3x baseline, POST to $HOLOHIVE_API_BASE/api/webhooks/hermes:
       {
         "project_name":    <prospect name>,
         "prospect_id":     <prospect id>,
         "signal_type":     "volume_spike_upbit"   // or volume_spike_bithumb
         "headline":        "<SYMBOL> volume <X.X>x above 7-day median on <Exchange>",
         "source_url":      <link to the exchange's page for that pair>,
         "source_name":     "hermes_upbit_spike",   // or hermes_bithumb_spike
         "relevancy_weight": 15,
         "tier":             2,
         "confidence":       "confirmed",
         "shelf_life_days":  3,
         "metadata": {
           "current_volume_24h_krw": <number>,
           "baseline_volume_7d":     <number>,
           "multiplier":             <number>
         }
       }
  7. Update the rolling 7-day baseline: push today's volume, drop 8-day-old entries,
     recompute the median, store in memory.volume_baselines.
```

---

## Step 8 — Start HERMES (2 min)

```bash
# Run it as a systemd service so it survives reboots
hermes service install
systemctl enable hermes
systemctl start hermes

# Check it's running
systemctl status hermes
```

You should see `active (running)`. Ctrl+C to exit.

Tail the logs to see HERMES doing its thing:

```bash
journalctl -u hermes -f
```

Expect to see lines like:
- `[watchlist_sync] Synced 247 prospects from HoloHive`
- `[korean_tg_monitor] Joined @cryptokorea (18,422 members)`
- `[korean_volume_spike] Checked 247 symbols, 0 spikes`

Ctrl+C to stop tailing.

---

## Step 9 — Verify the webhook end-to-end (2 min)

From the VPS, send a test signal:

```bash
source ~/.hermes/.env

curl -X POST $HOLOHIVE_API_BASE/api/webhooks/hermes \
  -H "Authorization: Bearer $HERMES_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "project_name": "Test Project",
    "signal_type": "hermes_custom",
    "headline": "Hermes webhook smoke test",
    "source_name": "hermes_test"
  }'
```

Expected output:

```json
{"success":true,"inserted":1,"duplicates":0,"errors":[]}
```

Now open HoloHive:

1. Go to **Intelligence** → **AI Agents** tab
2. Scroll to **Recent Runs** — you should see a **HERMES** run that just finished
3. Click **Intelligence** → **Korea Signals** — the "Hermes webhook smoke test"
   signal should appear in the recent signals feed

If both of those show up, **you're done**. 🎉

---

## Troubleshooting

**401 Unauthorized from the webhook**
The secret doesn't match. Double-check `HERMES_WEBHOOK_SECRET` matches exactly in:
- Vercel env vars (Step 2)
- `~/.hermes/.env` on the VPS (Step 5)
No extra spaces, no quotes around the value.

**500 "Server missing HERMES_WEBHOOK_SECRET"**
You added the env var to Vercel but didn't redeploy. Go back to Step 2 and redeploy.

**HERMES Telegram login fails**
Your phone number format might be wrong. Include the country code with `+`,
e.g. `+821012345678` for Korea.

**"signals appearing but prospect_id is null"**
HERMES is sending the right data, but our app couldn't match `project_name`
to an existing prospect. That's fine — the signal is still recorded. The
match is by exact `name` or `symbol`. If you want tighter matching, update
the project name in HERMES's config to exactly match the prospect name in
our DB.

**I want to add more Telegram groups**
Edit `~/.hermes/skills/korean_tg_monitor.md`, add the group to the list,
save, then `systemctl restart hermes`.

---

## Ongoing maintenance

There's basically none. HERMES keeps its own memory, re-syncs the watchlist
every 6 hours, and auto-restarts if the VPS reboots (thanks to systemd).

Check in every couple of weeks with:

```bash
ssh root@<vps-ip>
systemctl status hermes
journalctl -u hermes --since "1 week ago" | grep -i error
```

If you ever want to pause HERMES (e.g. to save on API costs during a slow week):

```bash
systemctl stop hermes
# restart with: systemctl start hermes
```

When you pause it, no signals flow in — but nothing breaks, and when you
start it again it picks up right where it left off.
