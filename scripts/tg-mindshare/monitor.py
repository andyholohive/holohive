"""
Korean Telegram Mindshare Monitor

Monitors public Korean Telegram channels for client keyword mentions.
Uses Telethon (MTProto) to read channel messages without being a member.
Sends matches to the KOL Campaign Manager mindshare API.

Usage:
  1. Copy .env.example to .env and fill in your values
  2. pip install -r requirements.txt
  3. python monitor.py

First run will ask for your Telegram login code (one-time).
"""

import asyncio
import json
import os
import sys
from datetime import datetime, timezone, timedelta

import httpx
from dotenv import load_dotenv
from telethon import TelegramClient, events
from telethon.tl.types import Channel

load_dotenv()

# Config
API_ID = int(os.getenv("TG_API_ID", "0"))
API_HASH = os.getenv("TG_API_HASH", "")
PHONE = os.getenv("TG_PHONE", "")
API_URL = os.getenv("API_URL", "http://localhost:3000/api/mindshare")
CRON_SECRET = os.getenv("CRON_SECRET", "")
SCAN_INTERVAL = int(os.getenv("SCAN_INTERVAL", "300"))
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

SESSION_FILE = os.path.join(os.path.dirname(__file__), "session")

# In-memory cache (refreshed periodically from Supabase)
monitored_channels: list[dict] = []
client_keywords: dict[str, list[str]] = {}  # client_id -> [keywords]


def supabase_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }


async def load_config():
    """Load monitored channels and client keywords from Supabase."""
    global monitored_channels, client_keywords

    async with httpx.AsyncClient() as http:
        # Load channels
        r = await http.get(
            f"{SUPABASE_URL}/rest/v1/tg_monitored_channels?is_active=eq.true&select=*",
            headers=supabase_headers(),
        )
        if r.status_code == 200:
            monitored_channels = r.json()
            print(f"[config] Loaded {len(monitored_channels)} monitored channels")
        else:
            print(f"[config] Failed to load channels: {r.status_code}")

        # Load client keywords
        r = await http.get(
            f"{SUPABASE_URL}/rest/v1/client_mindshare_config?is_enabled=eq.true&select=client_id,tracked_keywords",
            headers=supabase_headers(),
        )
        if r.status_code == 200:
            client_keywords = {}
            for row in r.json():
                kws = row.get("tracked_keywords", [])
                if isinstance(kws, list) and len(kws) > 0:
                    client_keywords[row["client_id"]] = [
                        k.lower() for k in kws
                    ]
            print(f"[config] Loaded keywords for {len(client_keywords)} clients")
        else:
            print(f"[config] Failed to load keywords: {r.status_code}")


def match_keywords(text: str) -> list[tuple[str, str]]:
    """Check message text against all client keywords.
    Returns list of (client_id, matched_keyword) tuples.
    """
    text_lower = text.lower()
    matches = []
    for client_id, keywords in client_keywords.items():
        for kw in keywords:
            if kw in text_lower:
                matches.append((client_id, kw))
                break  # one match per client per message
    return matches


async def send_mention(client_id: str, keyword: str, message_text: str, message_date: str, channel_name: str):
    """Post a mention to the mindshare API."""
    payload = {
        "client_id": client_id,
        "matched_keyword": keyword,
        "message_text": message_text[:2000],  # truncate long messages
        "message_date": message_date,
    }

    headers = {}
    if CRON_SECRET:
        headers["Authorization"] = f"Bearer {CRON_SECRET}"

    try:
        async with httpx.AsyncClient(timeout=10) as http:
            r = await http.post(API_URL, json=payload, headers=headers)
            if r.status_code == 200:
                print(f"  [sent] {channel_name} → {keyword} (client: {client_id[:8]}...)")
            else:
                print(f"  [error] API returned {r.status_code}: {r.text[:200]}")
    except Exception as e:
        print(f"  [error] Failed to send mention: {e}")


async def scan_channel(tg_client: TelegramClient, channel_username: str, since_minutes: int = None):
    """Scan a channel for recent messages matching keywords."""
    if since_minutes is None:
        since_minutes = SCAN_INTERVAL // 60 + 1

    try:
        entity = await tg_client.get_entity(channel_username)
        if not isinstance(entity, Channel):
            return

        cutoff = datetime.now(timezone.utc) - timedelta(minutes=since_minutes)
        count = 0

        async for msg in tg_client.iter_messages(entity, limit=50):
            if msg.date < cutoff:
                break
            if not msg.text:
                continue

            matches = match_keywords(msg.text)
            for client_id, keyword in matches:
                await send_mention(
                    client_id=client_id,
                    keyword=keyword,
                    message_text=msg.text,
                    message_date=msg.date.isoformat(),
                    channel_name=channel_username,
                )
                count += 1

        if count > 0:
            print(f"[scan] {channel_username}: {count} mention(s) found")

    except Exception as e:
        print(f"[scan] Error scanning {channel_username}: {e}")


async def scan_all(tg_client: TelegramClient):
    """Scan all monitored channels."""
    if not monitored_channels or not client_keywords:
        return

    print(f"\n[scan] Scanning {len(monitored_channels)} channels...")
    for ch in monitored_channels:
        username = ch.get("channel_username")
        if username:
            await scan_channel(tg_client, username)
            await asyncio.sleep(1)  # rate limit buffer


async def periodic_scan(tg_client: TelegramClient):
    """Run scans on an interval."""
    while True:
        await load_config()
        await scan_all(tg_client)
        print(f"[scan] Next scan in {SCAN_INTERVAL}s...")
        await asyncio.sleep(SCAN_INTERVAL)


async def setup_live_listener(tg_client: TelegramClient):
    """Set up real-time listener for monitored channels."""
    channel_entities = []
    for ch in monitored_channels:
        username = ch.get("channel_username")
        if username:
            try:
                entity = await tg_client.get_entity(username)
                if isinstance(entity, Channel):
                    channel_entities.append(entity)
            except Exception as e:
                print(f"[live] Could not resolve {username}: {e}")

    if not channel_entities:
        print("[live] No channels resolved for live listening")
        return

    @tg_client.on(events.NewMessage(chats=channel_entities))
    async def on_new_message(event):
        if not event.message.text:
            return
        matches = match_keywords(event.message.text)
        for client_id, keyword in matches:
            chat = await event.get_chat()
            channel_name = getattr(chat, "username", None) or getattr(chat, "title", "unknown")
            await send_mention(
                client_id=client_id,
                keyword=keyword,
                message_text=event.message.text,
                message_date=event.message.date.isoformat(),
                channel_name=channel_name,
            )

    print(f"[live] Listening to {len(channel_entities)} channels in real-time")


async def main():
    if not API_ID or not API_HASH:
        print("Error: Set TG_API_ID and TG_API_HASH in .env")
        print("Get them from https://my.telegram.org → API development tools")
        sys.exit(1)

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env")
        sys.exit(1)

    print("=" * 50)
    print("Korean Telegram Mindshare Monitor")
    print("=" * 50)

    tg_client = TelegramClient(SESSION_FILE, API_ID, API_HASH)
    await tg_client.start(phone=PHONE)
    print(f"[auth] Logged in as {(await tg_client.get_me()).first_name}")

    # Initial config load
    await load_config()

    if not monitored_channels:
        print("\n[!] No monitored channels found.")
        print("    Add channels to the tg_monitored_channels table:")
        print("    INSERT INTO tg_monitored_channels (channel_name, channel_username)")
        print("    VALUES ('Channel Name', 'channel_username');")
        print()

    if not client_keywords:
        print("[!] No client keywords found.")
        print("    Update client_mindshare_config with tracked_keywords:")
        print('    UPDATE client_mindshare_config SET tracked_keywords = \'["keyword1", "keyword2"]\'')
        print("    WHERE client_id = '<client-id>';")
        print()

    # Set up real-time listener
    if monitored_channels and client_keywords:
        await setup_live_listener(tg_client)

    # Run periodic scan loop (also refreshes config)
    await periodic_scan(tg_client)


if __name__ == "__main__":
    asyncio.run(main())
