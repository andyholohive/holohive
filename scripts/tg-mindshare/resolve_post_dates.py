"""
Telegram post-date resolver (GitHub Actions version)

For freshly-submitted content whose post date is still the /submit default,
fetch the ACTUAL Telegram message date and write it to content_items.posted_at.
This fixes the "posted last week, /submitted this Monday → counted this week"
mis-attribution automatically, so nobody has to tap the receipt buttons.

Only touches rows where posted_at_source = 'submit_default' — a 'manual'
correction from the receipt buttons is authoritative and never overridden.
Non-Telegram links (X / YouTube) and un-fetchable messages are marked with a
terminal source so they aren't retried forever.

Runs on a schedule via GitHub Actions (see .github/workflows/resolve-post-dates.yml).
Reuses the same TG session + Supabase creds as the mindshare scan.

Usage:
  python resolve_post_dates.py
"""

import asyncio
import os
import re
import sys
from datetime import datetime, timedelta, timezone

import httpx
from dotenv import load_dotenv
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.tl.types import PeerChannel

load_dotenv()

API_ID = int(os.getenv("TG_API_ID", "0"))
API_HASH = os.getenv("TG_API_HASH", "")
SESSION_STRING = os.getenv("TG_SESSION_STRING", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
# Only look back this far — bounds the working set. Older un-resolved rows keep
# their submit-date default (the buttons remain available on the receipt).
LOOKBACK_DAYS = int(os.getenv("POSTDATE_LOOKBACK_DAYS", "14"))
BATCH_LIMIT = int(os.getenv("POSTDATE_BATCH_LIMIT", "200"))


def supabase_headers(extra=None):
    h = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if extra:
        h.update(extra)
    return h


# t.me/<username>/<msgid>  |  t.me/c/<internalid>/<msgid>  |  telegram.me/...
_TME_RE = re.compile(
    r"^https?://(?:www\.)?(?:t\.me|telegram\.me)/(c/)?([^/?#]+)/(\d+)",
    re.IGNORECASE,
)


def parse_tme(link):
    """Return (entity, message_id) for a t.me post link, or None if not one."""
    m = _TME_RE.match((link or "").strip())
    if not m:
        return None
    is_private, ident, msgid = m.group(1), m.group(2), int(m.group(3))
    if is_private:
        # t.me/c/<internal>/<msg> → channel id is -100 + internal
        try:
            return PeerChannel(int("-100" + ident)), msgid
        except ValueError:
            return None
    return ident, msgid  # public @username


async def fetch_unresolved(http):
    """content_items still on the submit-date default, submitted recently."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)).isoformat()
    r = await http.get(
        f"{SUPABASE_URL}/rest/v1/content_items",
        params={
            "select": "id,link,campaign_id",
            "posted_at_source": "eq.submit_default",
            "submitted_at": f"gte.{cutoff}",
            "status": "neq.rejected",
            "order": "submitted_at.desc",
            "limit": str(BATCH_LIMIT),
        },
        headers=supabase_headers(),
    )
    return r.json() if r.status_code == 200 else []


async def mark_item(http, item_id, source, posted_at=None):
    body = {"posted_at_source": source}
    if posted_at:
        body["posted_at"] = posted_at
    await http.patch(
        f"{SUPABASE_URL}/rest/v1/content_items",
        params={"id": f"eq.{item_id}"},
        json=body,
        headers=supabase_headers({"Prefer": "return=minimal"}),
    )


async def sync_contents_activation(http, campaign_id, link, posted_at):
    """Keep the Content Dashboard's activation_date consistent with the real
    post date once we've detected it."""
    await http.patch(
        f"{SUPABASE_URL}/rest/v1/contents",
        params={"campaign_id": f"eq.{campaign_id}", "content_link": f"eq.{link}"},
        json={"activation_date": posted_at},
        headers=supabase_headers({"Prefer": "return=minimal"}),
    )


async def main():
    if not (API_ID and API_HASH and SESSION_STRING):
        print("Error: TG_API_ID, TG_API_HASH, TG_SESSION_STRING required.")
        sys.exit(1)
    if not (SUPABASE_URL and SUPABASE_KEY):
        print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY required.")
        sys.exit(1)

    async with httpx.AsyncClient(timeout=15) as http:
        rows = await fetch_unresolved(http)
        print(f"{len(rows)} unresolved content_items in last {LOOKBACK_DAYS}d")
        if not rows:
            return

        client = TelegramClient(StringSession(SESSION_STRING), API_ID, API_HASH)
        await client.connect()
        if not await client.is_user_authorized():
            print("Error: TG session invalid. Regenerate TG_SESSION_STRING.")
            await client.disconnect()
            sys.exit(1)
        me = await client.get_me()
        print(f"Logged in as {me.first_name}")

        detected = unsupported = failed = 0
        for row in rows:
            item_id, link, campaign_id = row["id"], row.get("link"), row.get("campaign_id")
            parsed = parse_tme(link)
            if not parsed:
                # X / YouTube / other — terminal, keeps the submit-date default.
                await mark_item(http, item_id, "unsupported")
                unsupported += 1
                continue
            entity, msgid = parsed
            try:
                msg = await client.get_messages(entity, ids=msgid)
                if msg and msg.date:
                    posted_at = msg.date.astimezone(timezone.utc).date().isoformat()
                    await mark_item(http, item_id, "tg_detected", posted_at)
                    if campaign_id and link:
                        await sync_contents_activation(http, campaign_id, link, posted_at)
                    detected += 1
                    print(f"  {link} → {posted_at}")
                else:
                    # message deleted / not returned
                    await mark_item(http, item_id, "tg_failed")
                    failed += 1
            except Exception as e:
                # private channel we're not in, bad link, rate-limit, etc.
                await mark_item(http, item_id, "tg_failed")
                failed += 1
                print(f"  ! {link}: {e}")
            await asyncio.sleep(0.4)

        await client.disconnect()
        print(f"\nDone. detected={detected} unsupported={unsupported} failed={failed}")


if __name__ == "__main__":
    asyncio.run(main())
