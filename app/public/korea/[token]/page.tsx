import type { Metadata } from 'next';
import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { buildKoreaSummary } from '@/lib/koreaIntel/summary';
import { KoreaBrief } from '@/components/portal/korea/KoreaBrief';

export const dynamic = 'force-dynamic';

/**
 * /public/korea/[token] — a client's weekly Korea brief.
 *
 * Opened from the "Read this week's Korea brief" button under the weekly
 * report in the client's Telegram group. The unguessable per-client token
 * stands in for the portal's email gate (a Telegram tap can't carry an
 * email); rotating kr_signal_clients.brief_token revokes every old link.
 *
 * Server-rendered so Telegram's link preview shows the week's real headline.
 */

function admin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolve(token: string) {
  // Tokens are 64 hex chars; reject anything else before touching the DB.
  if (!/^[a-f0-9]{32,64}$/.test(token)) return null;
  const db = admin();
  const { data: kc } = await (db as any).from('kr_signal_clients')
    .select('id, client_id, content_log_source').eq('brief_token', token).maybeSingle();
  if (!kc) return null;
  const clientId: string | null = kc.client_id
    || (typeof kc.content_log_source === 'string' && kc.content_log_source.startsWith('hhp:') ? kc.content_log_source.slice(4) : null);
  if (!clientId) return null;
  return { db, krClientId: kc.id as string, clientId };
}

// generateMetadata and the page both need the summary; build it once per request.
const load = cache(async (token: string) => {
  const r = await resolve(token);
  if (!r) return null;
  const s = await buildKoreaSummary(r.db, r.clientId);
  return s ? { r, s } : null;
});

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const hit = await load(params.token);
  if (!hit) return { title: 'Korea brief', robots: { index: false, follow: false } };
  const { s } = hit;
  const title = `${s.client.name} · Korea this week`;
  return {
    title,
    description: s.verdict.headline,
    robots: { index: false, follow: false },
    // Matches the brief's night background, so the in-app browser bar blends in.
    themeColor: '#05090D',
    // Telegram's preview card: the headline, and the one thing to do.
    openGraph: { title: s.verdict.headline, description: `To do: ${s.action.text}`, siteName: 'Holo Hive', type: 'article' },
  };
}

export default async function KoreaBriefPage({ params, searchParams }: { params: { token: string }; searchParams: { preview?: string } }) {
  const hit = await load(params.token);
  if (!hit) notFound();
  const { r, s } = hit;

  // Count real reads, not Telegram fetching the link preview.
  const ua = headers().get('user-agent') ?? '';
  // ?preview=1 comes from the team's review card and Korea Signal page, so our
  // own checks don't read as the client opening it.
  if (searchParams.preview !== '1' && !/TelegramBot|bot|crawler|spider|preview/i.test(ua)) {
    await (r.db as any).from('korea_brief_views')
      .insert({ kr_client_id: r.krClientId, week_start: s.week?.start ?? null, user_agent: ua.slice(0, 300) })
      .then(() => null, () => null);
  }

  const { data: c } = await (r.db as any).from('clients').select('slug, logo_url').eq('id', r.clientId).maybeSingle();
  const portalUrl = `/public/portal/${c?.slug || r.clientId}`;

  return <KoreaBrief s={s} portalUrl={portalUrl} clientLogoUrl={c?.logo_url ?? null} />;
}
