import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/requireSuperAdmin';
import { pickQuery } from '@/lib/koreaScan/telegram';

export const dynamic = 'force-dynamic';

/**
 * Korea Scan → Telegram MCP. Asks kol-telegram-mcp's coverage-scan
 * workflow to search Telegram live for one project, so a scan isn't limited
 * to what the 6-hourly crawl already holds (channels outside the crawl list,
 * posts the crawl's window missed).
 *
 * One search term per run: Telegram searches one channel for one term at a
 * time, paced 5s per channel to stay under its rate limits, so a run takes
 * roughly 15 minutes. The workflows share one Telegram session behind a
 * concurrency lock, so this queues behind a running crawl rather than
 * colliding with it (two at once is what got the session revoked).
 * Results land in tg_channel_posts; the next scan run picks them up.
 *
 * POST { name, aliases[], scanId? } → dispatch (admin+)
 * GET                                → the latest coverage-scan run's status
 */

const REPO = () => process.env.GH_DISPATCH_REPO || 'andyholohive/kol-telegram-mcp';
const WORKFLOW = 'coverage-scan.yml';
const gh = (token: string) => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
});

export async function POST(request: Request) {
  const guard = await requireRole(request, ['admin', 'super_admin']);
  if (!guard.ok) return guard.response;
  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) return NextResponse.json({ error: 'GH_DISPATCH_TOKEN is not set, so HHP cannot start Telegram scans.' }, { status: 500 });

  const body = await request.json().catch(() => null);
  const aliases: string[] = Array.isArray(body?.aliases) ? body.aliases.map(String).slice(0, 12) : [];
  const query = pickQuery(aliases);
  if (!query) return NextResponse.json({ error: 'Add a spelling to search for, ideally the Korean one.' }, { status: 400 });
  const subjectId = typeof body?.scanId === 'string' && /^[0-9a-f-]{36}$/i.test(body.scanId) ? body.scanId : randomUUID();

  const res = await fetch(`https://api.github.com/repos/${REPO()}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: { ...gh(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs: { subject_type: 'project', subject_id: subjectId, query, days: '60', roster: true } }),
  }).catch((e) => e as Error);
  if (res instanceof Error) return NextResponse.json({ error: `GitHub unreachable: ${res.message}` }, { status: 502 });
  if (res.status !== 204) {
    const hint = res.status === 401 ? 'The GitHub token is invalid or expired.' : res.status === 403 ? 'The GitHub token lacks actions:write.' : `GitHub said ${res.status}.`;
    return NextResponse.json({ error: `Could not start the Telegram scan. ${hint}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, query, startedAt: new Date().toISOString() });
}

export async function GET(request: Request) {
  const guard = await requireRole(request, ['admin', 'super_admin']);
  if (!guard.ok) return guard.response;
  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) return NextResponse.json({ run: null });
  const res = await fetch(`https://api.github.com/repos/${REPO()}/actions/workflows/${WORKFLOW}/runs?per_page=1`, { headers: gh(token), cache: 'no-store' }).catch(() => null);
  if (!res?.ok) return NextResponse.json({ run: null });
  const d = await res.json();
  const r = d.workflow_runs?.[0];
  return NextResponse.json({
    run: r ? { status: r.status as string, conclusion: (r.conclusion as string) ?? null, createdAt: r.created_at as string, updatedAt: r.updated_at as string } : null,
  });
}
