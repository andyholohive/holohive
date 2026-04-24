import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/korean-exchanges/run
 *
 * Manually triggers the scanner from the UI (Exchanges tab "Run Now" button).
 * Forwards to the existing cron endpoint with CRON_SECRET attached server-side
 * so the secret never leaves the server.
 *
 * This is the "health check" button — it proves the pipeline runs, without
 * making any synthetic changes.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server missing CRON_SECRET' }, { status: 500 });
  }

  // Self-call the cron handler. Works both locally (NEXT_PUBLIC_APP_URL or
  // localhost fallback) and in Vercel production (VERCEL_URL).
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  try {
    const res = await fetch(`${baseUrl}/api/cron/korean-exchange-listings`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${cronSecret}` },
      // Long timeout — diff + write can take ~60s if there are many markets
      signal: AbortSignal.timeout(110_000),
    });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Manual run failed' },
      { status: 500 },
    );
  }
}
