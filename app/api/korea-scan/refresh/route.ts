import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/requireSuperAdmin';

export const dynamic = 'force-dynamic';

/**
 * Korea Scan → Telegram MCP: run the crawl now.
 *
 * Starts kol-telegram-mcp's mindshare crawl (scrape-mindshare.yml) instead
 * of waiting for its 6-hourly schedule. It pulls every new post from all
 * monitored channels (~15 min), and the next scan of any project includes
 * them.
 *
 * Why the crawl and not a live Telegram search: tested 2026-10-02 on RISE.
 * Telegram's own search for 라이즈엑스 across 117 roster channels found 5
 * posts in 3 channels, all already collected; the crawl matched 239 posts
 * in 42 channels on the same spellings. Search takes one term at a time
 * and misses most Korean mentions.
 *
 * Every Telegram workflow shares one session behind a concurrency lock, so
 * a requested crawl queues behind anything running rather than colliding
 * (two at once is what got the session revoked, Aug 9 and Sep 7).
 *
 * POST → start a crawl unless one is running, queued, or finished in the last 30 min (admin+)
 * GET  → the latest crawl run, for the page's status line
 */

const REPO = () => process.env.GH_DISPATCH_REPO || 'andyholohive/kol-telegram-mcp';
const WORKFLOW = 'scrape-mindshare.yml';
const FRESH_MS = 30 * 60_000;
const gh = (token: string) => ({ Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' });

type Run = { status: string; conclusion: string | null; createdAt: string; updatedAt: string };

async function latestRun(token: string): Promise<Run | null> {
  const res = await fetch(`https://api.github.com/repos/${REPO()}/actions/workflows/${WORKFLOW}/runs?per_page=1`, { headers: gh(token), cache: 'no-store' }).catch(() => null);
  if (!res?.ok) return null;
  const r = (await res.json()).workflow_runs?.[0];
  return r ? { status: r.status, conclusion: r.conclusion ?? null, createdAt: r.created_at, updatedAt: r.updated_at } : null;
}

export async function POST(request: Request) {
  const guard = await requireRole(request, ['admin', 'super_admin']);
  if (!guard.ok) return guard.response;
  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) return NextResponse.json({ error: 'GH_DISPATCH_TOKEN is not set, so HHP cannot start the Telegram crawl.' }, { status: 500 });

  const last = await latestRun(token);
  if (last && last.status !== 'completed') return NextResponse.json({ ok: true, started: false, reason: 'A crawl is already running.', run: last });
  if (last && last.conclusion === 'success' && Date.now() - Date.parse(last.updatedAt) < FRESH_MS) {
    return NextResponse.json({ ok: true, started: false, reason: 'The data is already fresh: a crawl finished in the last 30 minutes.', run: last });
  }

  const res = await fetch(`https://api.github.com/repos/${REPO()}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST', headers: { ...gh(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main' }),
  }).catch((e) => e as Error);
  if (res instanceof Error) return NextResponse.json({ error: `GitHub unreachable: ${res.message}` }, { status: 502 });
  if (res.status !== 204) {
    const hint = res.status === 401 ? 'The GitHub token is invalid or expired.' : res.status === 403 ? 'The GitHub token lacks actions:write.' : `GitHub said ${res.status}.`;
    return NextResponse.json({ error: `Could not start the crawl. ${hint}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, started: true });
}

export async function GET(request: Request) {
  const guard = await requireRole(request, ['admin', 'super_admin']);
  if (!guard.ok) return guard.response;
  const token = process.env.GH_DISPATCH_TOKEN;
  return NextResponse.json({ run: token ? await latestRun(token) : null });
}
