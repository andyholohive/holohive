import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/requireSuperAdmin';
import { buildKoreaSummary } from '@/lib/koreaIntel/summary';
import { renderKoreaEmail, koreaEmailSubject } from '@/lib/koreaIntel/email';

export const dynamic = 'force-dynamic';

/**
 * GET  /api/korea-intel/[clientId]/email — the weekly Korea email as HTML, for
 *      the team's preview (admin+). Renders exactly what a client would get.
 * POST /api/korea-intel/[clientId]/email — send ONE test copy to { to }.
 *
 * Sending needs an email provider, and HHP has none yet. POST uses Resend's
 * REST API when RESEND_API_KEY and KOREA_EMAIL_FROM are set; otherwise it
 * answers 501 and says what's missing. There is deliberately no cron and no
 * client mailing list here — weekly client sends get switched on separately,
 * once a provider exists and someone has decided who receives them.
 */
async function load(clientId: string) {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const summary = await buildKoreaSummary(admin, clientId);
  const { data: c } = await (admin as any).from('clients').select('id, slug').eq('id', clientId).maybeSingle();
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://app.holohive.io';
  return { summary, portalUrl: `${base}/public/portal/${c?.slug || clientId}` };
}

export async function GET(request: Request, { params }: { params: { clientId: string } }) {
  const guard = await requireRole(request, ['admin', 'super_admin']);
  if (!guard.ok) return guard.response;
  const { summary, portalUrl } = await load(params.clientId);
  if (!summary) return NextResponse.json({ error: 'No Korea setup for this client' }, { status: 404 });
  return new NextResponse(renderKoreaEmail(summary, { portalUrl }), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'x-email-subject': encodeURIComponent(koreaEmailSubject(summary)) },
  });
}

export async function POST(request: Request, { params }: { params: { clientId: string } }) {
  const guard = await requireRole(request, ['admin', 'super_admin']);
  if (!guard.ok) return guard.response;
  const body = await request.json().catch(() => ({}));
  const to = typeof body.to === 'string' ? body.to.trim() : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });

  const key = process.env.RESEND_API_KEY;
  const from = process.env.KOREA_EMAIL_FROM;
  if (!key || !from) {
    return NextResponse.json({
      error: 'No email provider is set up. Add RESEND_API_KEY and KOREA_EMAIL_FROM (a verified sender) to send test emails.',
    }, { status: 501 });
  }

  const { summary, portalUrl } = await load(params.clientId);
  if (!summary) return NextResponse.json({ error: 'No Korea setup for this client' }, { status: 404 });
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: `[Test] ${koreaEmailSubject(summary)}`, html: renderKoreaEmail(summary, { portalUrl }) }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return NextResponse.json({ error: `The email provider refused the send (${res.status}). ${detail.slice(0, 200)}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, to });
}
