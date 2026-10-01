'use client';

/**
 * One tab per active client: can they get this week's Korea brief, the
 * message in their Telegram group, and the brief it opens.
 *
 * Intended home: app/mindshare/korea-brief/page.tsx (team-only). Feed it
 * one entry per active client — buildKoreaSummary + loadBriefFacts +
 * assessBriefReadiness on the server, see BriefClientEntry.
 */

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KoreaBrief } from '@/components/portal/korea/KoreaBrief';
import type { KoreaSummary } from '@/lib/koreaIntel/summary';
import type { BriefReadiness } from '@/lib/koreaIntel/briefReadiness';
import { buildBriefTelegramMessage } from '@/lib/koreaIntel/telegramBrief';
import { BriefPhoneFrame } from './BriefPhoneFrame';
import { BriefReadinessCard } from './BriefReadinessCard';
import { BriefTelegramPreview, type TelegramPreviewContent } from './BriefTelegramPreview';

export interface BriefClientEntry {
  clientId: string;
  name: string;
  /** mm/dd/yyyy */
  termEnds: string;
  chatTitle: string;
  summary: KoreaSummary | null;
  readiness: BriefReadiness;
  /** This week's long report as plain text, when one was generated. */
  currentReportText: string | null;
  briefUrl: string | null;
  portalUrl: string | null;
  opens30d: number;
}

const DOT: Record<BriefReadiness['level'], string> = { ready: 'bg-emerald-500', partial: 'bg-amber-500', blocked: 'bg-rose-500' };

export function BriefClientTabs({ clients }: { clients: BriefClientEntry[] }) {
  if (!clients.length) return null;
  const count = (l: BriefReadiness['level']) => clients.filter((c) => c.readiness.level === l).length;
  const by = (s: string) => clients.filter((c) => c.readiness.short === s).length;
  const rollup = [
    `${count('ready')} of ${clients.length} can get a brief this week`,
    by('Blocked') && `${by('Blocked')} blocked`,
    by('Not set up') && `${by('Not set up')} not set up`,
    by('Switched off') && `${by('Switched off')} switched off`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="space-y-3">
      <p className="text-[15px] text-ink-warm-900">{rollup}.</p>
      <Tabs defaultValue={clients[0].clientId} className="space-y-4">
        <div className="max-w-full overflow-x-auto">
          <TabsList className="h-auto border border-cream-200 bg-cream-100 p-1">
            {clients.map((c) => (
              <TabsTrigger key={c.clientId} value={c.clientId}
                className="gap-2 px-3.5 py-2 text-sm text-ink-warm-700 data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card">
                <i className={`h-2 w-2 rounded-full ${DOT[c.readiness.level]}`} aria-hidden />
                {c.name}
                <span className="text-xs font-medium text-ink-warm-500">{c.readiness.short}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {clients.map((c) => (
          <TabsContent key={c.clientId} value={c.clientId} className="mt-0">
            <ClientPanel c={c} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ClientPanel({ c }: { c: BriefClientEntry }) {
  const [version, setVersion] = useState<'short' | 'long'>('short');
  const s = c.summary;
  const blocked = c.readiness.short === 'Blocked';
  const off = c.readiness.short === 'Switched off';

  const content: TelegramPreviewContent = !s
    ? { kind: 'none', title: 'No message this week', body: `${c.name} has no Korea Signal setup, so the bot has nothing to post.` }
    : version === 'long' && c.currentReportText
      ? { kind: 'long', text: c.currentReportText, withButton: !!c.briefUrl }
      : { kind: 'short', message: buildBriefTelegramMessage(s, c.briefUrl) };
  const notice = blocked
    ? { title: 'This won’t arrive yet', body: `The bot isn’t in ${c.name}’s group. Once it’s added, this is the message:` }
    : off && s ? { title: 'Nothing posts automatically', body: `Korea Signal is switched off for ${c.name}. Turned on, this is what would appear:` }
    : null;

  const meta = [
    `Term ends ${c.termEnds}`,
    s ? (s.client.listed ? 'listed in Korea' : 'not listed in Korea yet') : 'Korea status unknown',
    `brief opens: ${c.opens30d} in 30 days`,
  ].join(' · ');

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
      <div className="xl:sticky xl:top-4">
        <BriefReadinessCard clientName={c.name} meta={meta} readiness={c.readiness} />
      </div>
      <div className="grid gap-6 md:grid-cols-2 md:gap-4">
        <div className="grid gap-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[13px] font-semibold text-ink-warm-900">In their Telegram group</p>
            {c.currentReportText && s && (
              <div className="inline-flex gap-0.5 rounded-lg border border-cream-200 bg-cream-100 p-[3px]" role="group" aria-label="Which message">
                {(['short', 'long'] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={version === v} onClick={() => setVersion(v)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium focus-brand ${version === v ? 'bg-white text-brand shadow-card' : 'text-ink-warm-700'}`}>
                    {v === 'short' ? 'Proposed short' : 'Today’s long report'}
                  </button>
                ))}
              </div>
            )}
          </div>
          <BriefPhoneFrame label={`${c.name} Telegram group`}>
            <BriefTelegramPreview chatTitle={c.chatTitle} content={content} notice={notice} />
          </BriefPhoneFrame>
        </div>
        <div className="grid gap-2.5">
          <p className="text-[13px] font-semibold text-ink-warm-900">The brief it opens</p>
          <BriefPhoneFrame label={`${c.name} Korea brief`}>
            {s ? <KoreaBrief s={s} portalUrl={c.portalUrl} /> : <NoBrief name={c.name} />}
          </BriefPhoneFrame>
        </div>
      </div>
    </div>
  );
}

function NoBrief({ name }: { name: string }) {
  return (
    <div className="grid min-h-screen place-content-center gap-2 bg-cream-50 p-6 text-center">
      <p className="text-[15px] font-semibold text-ink-warm-900">No brief yet</p>
      <p className="mx-auto max-w-[30ch] text-[13px] text-ink-warm-700">
        {name} needs a Korea Signal setup (ticker, CoinGecko id, venues) before a brief can be built.
      </p>
    </div>
  );
}
