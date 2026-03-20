"""
Generate a Telethon session string.

Run this ONCE locally. It will:
1. Ask for your Telegram login code
2. Output a session string

Copy the session string and add it as:
- TG_SESSION_STRING in your .env (for local testing)
- A GitHub Actions secret called TG_SESSION_STRING (for production)
"""

import asyncio
import os

from dotenv import load_dotenv
from telethon import TelegramClient
from telethon.sessions import StringSession

load_dotenv()

API_ID = int(os.getenv("TG_API_ID", "0"))
API_HASH = os.getenv("TG_API_HASH", "")
PHONE = os.getenv("TG_PHONE", "")


async def main():
    if not API_ID or not API_HASH:
        print("Error: Set TG_API_ID and TG_API_HASH in .env first")
        return

    print("Generating Telethon session string...")
    print(f"Phone: {PHONE}")
    print()

    client = TelegramClient(StringSession(), API_ID, API_HASH)
    await client.start(phone=PHONE)

    session_string = client.session.save()

    print()
    print("=" * 60)
    print("SESSION STRING (copy everything below):")
    print("=" * 60)
    print(session_string)
    print("=" * 60)
    print()
    print("Next steps:")
    print("1. Add to .env:  TG_SESSION_STRING=<the string above>")
    print("2. Add as GitHub secret:  TG_SESSION_STRING")
    print()

    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
