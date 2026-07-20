import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/intelligence/coverage/dispatch
 *
 * Fires the coverage-scan.yml workflow in kol-telegram-mcp for a
 * subject + query. The workflow scans the roster channels (+ any
 * extras), POSTs each result to /api/mcp/channel-posts, and the
 * Intelligence tab then generates the contract from the stored posts.
 *
 * Same GitHub-dispatch plumbing as /api/kols/[id]/refresh-tg — reuses
 * GH_DISPATCH_TOKEN / GH_DISPATCH_REPO. Latency dispatch→posts-in-DB is
 * a few minutes (runner boot + polite per-channel pacing over the
 * roster), so the UI should poll the GET contract endpoint rather than
 * block.
 *
 * Body: { subject_type, subject_id, query, days?, channels?, roster? }
 */
const SUBJECT_TYPES = ['pipeline', 'client', 'project'];

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });

  const { subject_type: subjectType, subject_id: subjectId, query } = body;
  if (!SUBJECT_TYPES.includes(subjectType) || !subjectId) {
    return NextResponse.json({ error: 'subject_type + subject_id required' }, { status: 400 });
  }
  if (!query || typeof query !== 'string' || !query.trim()) {
    return NextResponse.json({ error: 'query is required (project name / ticker)' }, { status: 400 });
  }

  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) {
    return NextResponse.json({
      error: 'GH_DISPATCH_TOKEN not configured',
      hint: 'Add a GitHub PAT with actions:write on the kol-telegram-mcp repo to Vercel env vars.',
    }, { status: 500 });
  }
  const repo = process.env.GH_DISPATCH_REPO || 'andyholohive/kol-telegram-mcp';
  const workflow = 'coverage-scan.yml';

  const inputs: Record<string, string | boolean> = {
    subject_type: subjectType,
    subject_id: subjectId,
    query: query.trim(),
    days: String(Number(body.days) || 30),
    roster: body.roster !== false, // default true
  };
  if (typeof body.channels === 'string' && body.channels.trim()) {
    inputs.channels = body.channels.trim();
  }

  const ghUrl = `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`;
  let ghResp: Response;
  try {
    ghResp = await fetch(ghUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs }),
    });
  } catch (fetchErr: any) {
    console.error('[coverage/dispatch] fetch to GitHub failed:', fetchErr);
    return NextResponse.json({ error: 'GitHub API unreachable', detail: fetchErr?.message ?? String(fetchErr) }, { status: 502 });
  }

  if (ghResp.status !== 204) {
    const text = await ghResp.text();
    console.error('[coverage/dispatch] GitHub dispatch non-204:', ghResp.status, text.slice(0, 500));
    const hint =
      ghResp.status === 401 ? 'GH_DISPATCH_TOKEN is invalid or expired.'
      : ghResp.status === 403 ? 'GH_DISPATCH_TOKEN lacks actions:write or SSO authorization.'
      : ghResp.status === 404 ? `Workflow not found at ${repo}/${workflow}.`
      : undefined;
    return NextResponse.json({ error: 'GitHub dispatch failed', gh_status: ghResp.status, detail: text.slice(0, 500), ...(hint ? { hint } : {}) }, { status: 502 });
  }

  return NextResponse.json({ ok: true, queued: true, workflow, query: query.trim() });
}
