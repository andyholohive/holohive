"""
Weekly Mindshare Aggregator

Run this weekly (e.g., via cron every Sunday) to compute weekly mention
counts and mindshare percentages, then insert into client_mindshare_weekly.

Usage:
  python aggregate.py

Reads from tg_mentions, computes stats, writes to client_mindshare_weekly.
"""

import asyncio
import os
from datetime import datetime, timedelta, timezone

import httpx
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

# Benchmark: number of mentions a fully-penetrated project gets per week.
# Adjust this based on your market research.
BENCHMARK_MENTIONS_PER_WEEK = 500


def headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


async def run():
    now = datetime.now(timezone.utc)
    # Current week: Monday to Sunday
    week_start = now - timedelta(days=now.weekday())
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    week_end = week_start + timedelta(days=7)

    print(f"Aggregating week: {week_start.date()} to {week_end.date()}")

    async with httpx.AsyncClient(timeout=15) as http:
        # Get all enabled clients
        r = await http.get(
            f"{SUPABASE_URL}/rest/v1/client_mindshare_config?is_enabled=eq.true&select=client_id,campaign_start_date",
            headers=headers(),
        )
        if r.status_code != 200:
            print(f"Failed to load configs: {r.status_code}")
            return

        clients = r.json()
        print(f"Processing {len(clients)} clients...")

        for client in clients:
            client_id = client["client_id"]
            campaign_start = client.get("campaign_start_date")

            # Calculate week number relative to campaign start
            if campaign_start:
                start_date = datetime.strptime(campaign_start, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                week_number = max(1, ((week_start - start_date).days // 7) + 1)
            else:
                week_number = 1

            # Count mentions this week
            r = await http.get(
                f"{SUPABASE_URL}/rest/v1/tg_mentions"
                f"?client_id=eq.{client_id}"
                f"&message_date=gte.{week_start.isoformat()}"
                f"&message_date=lt.{week_end.isoformat()}"
                f"&select=id",
                headers={**headers(), "Prefer": "count=exact"},
            )

            mention_count = 0
            if r.status_code == 200:
                # Count from content-range header
                content_range = r.headers.get("content-range", "")
                if "/" in content_range:
                    total = content_range.split("/")[-1]
                    mention_count = int(total) if total != "*" else len(r.json())
                else:
                    mention_count = len(r.json())

            mindshare_pct = round((mention_count / BENCHMARK_MENTIONS_PER_WEEK) * 100, 2)

            # Check if this week already has a record
            r = await http.get(
                f"{SUPABASE_URL}/rest/v1/client_mindshare_weekly"
                f"?client_id=eq.{client_id}&week_number=eq.{week_number}&select=id",
                headers=headers(),
            )
            existing = r.json() if r.status_code == 200 else []

            if existing:
                # Update
                await http.patch(
                    f"{SUPABASE_URL}/rest/v1/client_mindshare_weekly?id=eq.{existing[0]['id']}",
                    json={"mention_count": mention_count, "mindshare_pct": float(mindshare_pct)},
                    headers=headers(),
                )
                print(f"  [{client_id[:8]}] W{week_number}: {mention_count} mentions, {mindshare_pct}% (updated)")
            else:
                # Insert
                await http.post(
                    f"{SUPABASE_URL}/rest/v1/client_mindshare_weekly",
                    json={
                        "client_id": client_id,
                        "week_number": week_number,
                        "week_start": week_start.date().isoformat(),
                        "mention_count": mention_count,
                        "mindshare_pct": float(mindshare_pct),
                    },
                    headers=headers(),
                )
                print(f"  [{client_id[:8]}] W{week_number}: {mention_count} mentions, {mindshare_pct}% (created)")

    print("Done.")


if __name__ == "__main__":
    asyncio.run(run())
