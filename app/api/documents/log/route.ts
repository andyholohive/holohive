import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { TelegramService } from '@/lib/telegramService';
import { verifyLogToken } from '@/lib/portalLogToken';

export const dynamic = 'force-dynamic';

/**
 * POST /api/documents/log — append a Document Portal access event (spec §5).
 *
 * The viewer's navigator.sendBeacon fires here on open, page-view flush, and
 * close. Reachable by BOTH the team preview (session cookie) and the client
 * portal viewer (unauthenticated, allow-listed in middleware) — the portal
 * carries no session, so the gate email is threaded through as viewer_email for
 * per-recipient attribution. Append-only; client_id/stint_id are derived from
 * the document so the caller can't spoof attribution scope.
 *
 * On an external (client) doc_opened / doc_closed we fire a best-effort Telegram
 * alert to the team chat at app_settings.document_portal_alert_chat_id (spec §7).
 * Telegram failures never block the log write.
 */
const EVENTS = new Set(['doc_opened', 'page_view', 'doc_closed', 'download']);

function isExternal(email: string | null | undefined): boolean {
  return !!email && !email.toLowerCase().endsWith('@holohive.io');
}

function fmtMs(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || !EVENTS.has(body.event_type) || !body.document_id) {
    return NextResponse.json({ error: 'invalid event' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'server configuration error' }, { status: 500 });
  }
  const admin = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: doc } = await (admin as any)
    .from('documents').select('id, client_id, stint_id, title').eq('id', body.document_id).maybeSingle();
  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Attribution is trusted ONLY from the signed log token minted by the gated
  // view-url route (audit H6). The raw body.viewer_email is never trusted — an
  // unauthenticated caller can't attribute an open to (or spam an alert about)
  // an email they don't hold a token for. No/invalid token → event still logged
  // for volume, but with no attributed email and no Telegram alert.
  const viewerEmail = verifyLogToken(body.log_token, doc.id);

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') || null;

  const { error } = await (admin as any).from('document_access_log').insert({
    event_type: body.event_type,
    document_id: doc.id,
    client_id: doc.client_id,
    stint_id: doc.stint_id,
    portal_user_id: body.portal_user_id ?? null,
    viewer_email: viewerEmail,
    version_id: body.version_id ?? null,
    page_no: Number.isFinite(body.page_no) ? Number(body.page_no) : null,
    dwell_ms: Number.isFinite(body.dwell_ms) ? Number(body.dwell_ms) : null,
    session_id: body.session_id ?? null,
    ip,
    user_agent: request.headers.get('user-agent'),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Best-effort team alert — only for external (client) opens/closes.
  if ((body.event_type === 'doc_opened' || body.event_type === 'doc_closed') && isExternal(viewerEmail)) {
    void fireAlert(admin, {
      eventType: body.event_type, docId: doc.id, docTitle: doc.title ?? 'a document',
      clientId: doc.client_id, viewerEmail: viewerEmail!, sessionId: body.session_id ?? null,
    }).catch(() => { /* never block on Telegram */ });
  }

  return NextResponse.json({ ok: true });
}

async function fireAlert(admin: any, a: {
  eventType: 'doc_opened' | 'doc_closed'; docId: string; docTitle: string;
  clientId: string; viewerEmail: string; sessionId: string | null;
}) {
  const [chatSetting, threadSetting] = await Promise.all([
    admin.from('app_settings').select('value').eq('key', 'document_portal_alert_chat_id').maybeSingle(),
    admin.from('app_settings').select('value').eq('key', 'document_portal_alert_chat_thread_id').maybeSingle(),
  ]);
  const chatId = (chatSetting.data as any)?.value;
  if (!chatId) return; // unconfigured → silently skip
  const threadId = (threadSetting.data as any)?.value ? Number((threadSetting.data as any).value) : undefined;

  const { data: client } = await admin.from('clients').select('name').eq('id', a.clientId).maybeSingle();
  const clientName = (client as any)?.name || 'A client';
  const who = `${escapeHtml(a.viewerEmail)} (${escapeHtml(clientName)})`;

  let message: string;
  if (a.eventType === 'doc_opened') {
    message = `📄 <b>Document opened</b>\n${who} opened <b>${escapeHtml(a.docTitle)}</b>`;
  } else {
    // Session summary: time focused + distinct pages read for this session.
    let summary = '';
    if (a.sessionId) {
      const { data: evs } = await admin
        .from('document_access_log')
        .select('event_type, page_no, dwell_ms')
        .eq('document_id', a.docId).eq('session_id', a.sessionId);
      const rows = (evs ?? []) as Array<{ event_type: string; page_no: number | null; dwell_ms: number | null }>;
      const focused = rows.reduce((s, e) => s + (e.event_type === 'page_view' ? (e.dwell_ms ?? 0) : 0), 0);
      const pages = new Set(rows.filter(e => e.event_type === 'page_view' && e.page_no != null).map(e => e.page_no)).size;
      if (focused > 0 || pages > 0) summary = `\n${fmtMs(focused)} focused · ${pages} page${pages === 1 ? '' : 's'} read`;
    }
    message = `✅ <b>Document session ended</b>\n${who} · <b>${escapeHtml(a.docTitle)}</b>${summary}`;
  }
  await TelegramService.sendToChat(String(chatId), message, 'HTML', threadId);
}
