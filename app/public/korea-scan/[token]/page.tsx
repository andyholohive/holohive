import type { Metadata } from 'next';
import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { KoreaScanReport } from '@/components/koreaScan/KoreaScanReport';
import { redactForShare, type KoreaScan } from '@/lib/koreaScan/compute';
import { scanNarrative } from '@/lib/koreaScan/narrative';

export const dynamic = 'force-dynamic';

/**
 * /public/korea-scan/[token] — a saved Korea Scan, shared by sales with a
 * prospect (usually dropped in a Telegram DM or group).
 *
 * The unguessable token is the only key; revoking a scan (soft delete)
 * kills the link. Our network's channel names are stripped on the server
 * before anything reaches the browser. Server-rendered so Telegram's link
 * preview shows the scan's real verdict.
 */

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const load = cache(async (token: string) => {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const db = admin() as any;
  const { data } = await db.from('korea_scans').select('id, prepared_for, scan').eq('token', token).is('deleted_at', null).maybeSingle();
  return data ? { db, id: data.id as string, preparedFor: data.prepared_for as string | null, scan: redactForShare(data.scan as KoreaScan) } : null;
});

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const hit = await load(params.token);
  if (!hit) return { title: 'Korea scan', robots: { index: false, follow: false } };
  const t = scanNarrative(hit.scan);
  return {
    title: `${t.cover.title} · Holo Hive`,
    description: t.cover.verdict,
    robots: { index: false, follow: false },
    openGraph: { title: t.cover.title, description: t.cover.verdict, siteName: 'Holo Hive', type: 'article' },
  };
}

export default async function KoreaScanSharePage({ params, searchParams }: { params: { token: string }; searchParams: { preview?: string } }) {
  const hit = await load(params.token);
  if (!hit) notFound();

  // Count real opens: not link-preview bots, not our own previews.
  const ua = headers().get('user-agent') ?? '';
  if (searchParams.preview !== '1' && !/TelegramBot|bot|crawler|spider|preview/i.test(ua)) {
    await hit.db.from('korea_scan_views').insert({ scan_id: hit.id, user_agent: ua.slice(0, 300) }).then(() => null, () => null);
  }

  return (
    <div className="min-h-screen bg-[#F3F0E8] px-3 py-6 sm:px-6 sm:py-10">
      <KoreaScanReport s={hit.scan} preparedFor={hit.preparedFor} audience="shared" />
      <p className="mx-auto mt-6 max-w-[1100px] px-1 text-center text-xs text-[#6B6557]">
        Prepared by Holo Hive. Share internally as you like, not for publication.
      </p>
    </div>
  );
}
