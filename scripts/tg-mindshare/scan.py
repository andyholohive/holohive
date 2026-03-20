"""
Korean Telegram Mindshare Scanner (GitHub Actions version)

Connects to Telegram, scans monitored channels for keyword mentions,
sends matches to the mindshare API, then exits.

Designed to run on a schedule (every 5-10 minutes via GitHub Actions).

Usage:
  python scan.py

Requires TG_SESSION_STRING env var (base64-encoded Telethon session).
Generate it once with: python generate_session.py
"""

import asyncio
import base64
import os
import sys
from datetime import datetime, timedelta, timezone

import httpx
from dotenv import load_dotenv
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.tl.types import Channel

load_dotenv()

API_ID = int(os.getenv("TG_API_ID", "0"))
API_HASH = os.getenv("TG_API_HASH", "")
SESSION_STRING = os.getenv("TG_SESSION_STRING", "")
API_URL = os.getenv("API_URL", "http://localhost:3000/api/mindshare")
CRON_SECRET = os.getenv("CRON_SECRET", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
SCAN_MINUTES = int(os.getenv("SCAN_MINUTES", "10"))


def supabase_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }


async def load_config():
    """Load monitored channels and client keywords from Supabase."""
    channels = []
    client_keywords = {}

    async with httpx.AsyncClient(timeout=10) as http:
        r = await http.get(
            f"{SUPABASE_URL}/rest/v1/tg_monitored_channels?is_active=eq.true&select=*",
            headers=supabase_headers(),
        )
        if r.status_code == 200:
            channels = r.json()

        r = await http.get(
            f"{SUPABASE_URL}/rest/v1/client_mindshare_config?is_enabled=eq.true&select=client_id,tracked_keywords",
            headers=supabase_headers(),
        )
        if r.status_code == 200:
            for row in r.json():
                kws = row.get("tracked_keywords", [])
                if isinstance(kws, list) and len(kws) > 0:
                    client_keywords[row["client_id"]] = [k.lower() for k in kws]

    return channels, client_keywords


def match_keywords(text, client_keywords):
    """Check message text against all client keywords."""
    text_lower = text.lower()
    matches = []
    for client_id, keywords in client_keywords.items():
        for kw in keywords:
            if kw in text_lower:
                matches.append((client_id, kw))
                break
    return matches


async def send_mention(client_id, keyword, message_text, message_date):
    """Post a mention to the mindshare API."""
    payload = {
        "client_id": client_id,
        "matched_keyword": keyword,
        "message_text": message_text[:2000],
        "message_date": message_date,
    }
    headers = {}
    if CRON_SECRET:
        headers["Authorization"] = f"Bearer {CRON_SECRET}"

    try:
        async with httpx.AsyncClient(timeout=10) as http:
            r = await http.post(API_URL, json=payload, headers=headers)
            return r.status_code == 200
    except Exception as e:
        print(f"  Error sending mention: {e}")
        return False


async def main():
    if not API_ID or not API_HASH or not SESSION_STRING:
        print("Error: TG_API_ID, TG_API_HASH, and TG_SESSION_STRING are required.")
        print("Run 'python generate_session.py' to create your session string.")
        sys.exit(1)

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY are required.")
        sys.exit(1)

    print("Loading config...")
    channels, client_keywords = await load_config()
    print(f"  {len(channels)} channels, {len(client_keywords)} clients with keywords")

    if not channels or not client_keywords:
        print("Nothing to scan. Add channels and keywords first.")
        return

    print("Connecting to Telegram...")
    client = TelegramClient(StringSession(SESSION_STRING), API_ID, API_HASH)
    await client.connect()

    if not await client.is_user_authorized():
        print("Error: Session is invalid. Run 'python generate_session.py' again.")
        await client.disconnect()
        sys.exit(1)

    me = await client.get_me()
    print(f"  Logged in as {me.first_name}")

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=SCAN_MINUTES)
    total_mentions = 0

    for ch in channels:
        username = ch.get("channel_username")
        if not username:
            continue

        try:
            entity = await client.get_entity(username)
            if not isinstance(entity, Channel):
                continue

            count = 0
            async for msg in client.iter_messages(entity, limit=50):
                if msg.date < cutoff:
                    break
                if not msg.text:
                    continue

                matches = match_keywords(msg.text, client_keywords)
                for client_id, keyword in matches:
                    success = await send_mention(
                        client_id=client_id,
                        keyword=keyword,
                        message_text=msg.text,
                        message_date=msg.date.isoformat(),
                    )
                    if success:
                        count += 1

            if count > 0:
                print(f"  @{username}: {count} mention(s)")
            total_mentions += count

        except Exception as e:
            print(f"  Error scanning @{username}: {e}")

        await asyncio.sleep(0.5)

    await client.disconnect()
    print(f"\nDone. {total_mentions} total mentions sent.")


if __name__ == "__main__":
    asyncio.run(main())
