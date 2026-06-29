/**
 * GitHub Actions dispatch helper.
 *
 * Fires `workflow_dispatch` events against the kol-telegram-mcp repo
 * so HHP can trigger the Telethon scanner without keeping a session
 * file on Vercel (which IP-rotates and would get the session flagged).
 *
 * Used by:
 *   - POST /api/kols/[id]/rescan        — on-demand single-KOL scan
 *   - New-KOL hook in /kols add-row     — auto-scan a freshly added KOL
 *
 * Env (set on Vercel):
 *   GH_DISPATCH_PAT   — fine-grained PAT with Actions: read+write on the repo
 *   GH_DISPATCH_REPO  — "owner/name", e.g. "andyholohive/kol-telegram-mcp"
 */

const WORKFLOW_FILE_SINGLE = 'scan-one.yml';

export interface DispatchResult {
  ok: boolean;
  status?: number;
  error?: string;
}

function normalizeHandle(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  // Accept @handle, handle, or https://t.me/handle and emit @handle.
  const stripped = trimmed
    .replace(/^https?:\/\/(?:www\.)?t\.me\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '');
  return stripped ? `@${stripped}` : '';
}

/**
 * Dispatch the single-KOL scan workflow with the given handle.
 * Returns ok=false (without throwing) on any failure so callers can
 * surface a non-blocking toast rather than crash the user action.
 */
export async function triggerKolScan(rawHandle: string): Promise<DispatchResult> {
  const handle = normalizeHandle(rawHandle);
  if (!handle) {
    return { ok: false, error: 'Empty TG handle' };
  }

  const repo = process.env.GH_DISPATCH_REPO;
  const pat = process.env.GH_DISPATCH_PAT;
  if (!repo || !pat) {
    return { ok: false, error: 'GH_DISPATCH_REPO / GH_DISPATCH_PAT not set' };
  }

  const url = `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE_SINGLE}/dispatches`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${pat}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs: { handle } }),
    });
    if (res.status !== 204) {
      const text = await res.text().catch(() => '');
      return { ok: false, status: res.status, error: text || `GitHub returned ${res.status}` };
    }
    return { ok: true, status: 204 };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}
