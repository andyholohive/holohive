import type { Metadata } from 'next';
import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { RenewalDeck } from '@/components/clients/RenewalDeck';
import { cleanRenewalSlides, type RenewalSnapshot } from '@/lib/renewalPack';

export const dynamic = 'force-dynamic';

/**
 * /public/renewal/[token] — a client's renewal pack, shared by the team
 * (usually in the client's Telegram group). Same model as Korea Scan links:
 * the unguessable token is the only key, revoking (soft delete) kills the
 * link, and real opens are counted. The snapshot was made client-safe when
 * the pack was created (lib/renewalPack.ts); this page only renders it.
 */

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const load = cache(async (token: string) => {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const db = admin() as any;
  const { data } = await db.from('client_renewal_packs').select('id, prepared_for, note, slides, snapshot').eq('token', token).is('deleted_at', null).maybeSingle();
  if (!data) return null;
  const snapshot = data.snapshot as RenewalSnapshot;
  return { db, id: data.id as string, preparedFor: data.prepared_for as string | null, note: data.note as string | null, snapshot, slides: cleanRenewalSlides(data.slides, snapshot) };
});

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const hit = await load(params.token);
  if (!hit) return { title: 'Renewal review', robots: { index: false, follow: false } };
  const t = hit.snapshot.totals;
  const title = `${hit.snapshot.client.name} in Korea · Holo Hive`;
  const description = t ? `${t.reads.toLocaleString('en-US')} reads across ${t.posts} posts from ${t.creators} Korean creators.` : 'Renewal review';
  return { title, description, robots: { index: false, follow: false }, openGraph: { title, description, siteName: 'Holo Hive', type: 'article' } };
}

export default async function RenewalPackPage({ params, searchParams }: { params: { token: string }; searchParams: { preview?: string } }) {
  const hit = await load(params.token);
  if (!hit) notFound();

  // Count real opens: not link-preview bots, not our own previews.
  const ua = headers().get('user-agent') ?? '';
  if (searchParams.preview !== '1' && !/TelegramBot|bot|crawler|spider|preview/i.test(ua)) {
    await hit.db.from('client_renewal_pack_views').insert({ pack_id: hit.id, user_agent: ua.slice(0, 300) }).then(() => null, () => null);
  }

  return (
    <div className="min-h-screen bg-cream-50 px-3 py-6 sm:px-6 sm:py-10">
      <RenewalDeck s={hit.snapshot} slides={hit.slides} preparedFor={hit.preparedFor} note={hit.note} />
    </div>
  );
}
