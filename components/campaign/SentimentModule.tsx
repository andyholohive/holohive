'use client';

/**
 * SentimentModule — TG Comment Sentiment, campaign overview "perception
 * row" (spec v3 §Campaign Overview Placement). Renders:
 *   headline sentiment (raw + reaction-weighted side by side), the
 *   positive/negative/FUD distribution bar, question volume with spike
 *   flag, weekly trend, and the expandable verbatim quote bank (bucketed,
 *   reaction-ordered, each quote linking back to the TG message).
 *
 * Internal view — client-facing curation happens later at packaging time.
 * Renders nothing until the pipeline has scored comments for this
 * campaign. A mindshare module slots in beside this when that ships.
 */

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, MessageSquareText, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/dateFormat';

type Quote = {
  text: string; enGloss: string | null; lang: string | null; author: string;
  reactions: number; sentAt: string; theme: string | null; link: string | null;
};
type Rollup = {
  hasData: boolean;
  volume?: { total: number; noise: number; hype: number; substantive: number };
  sentiment?: { positive: number; negative: number; fud: number; positivePctRaw: number | null; positivePctWeighted: number | null };
  questions?: { count: number; spike: boolean };
  fud?: { count: number; sharePct: number; spike: boolean };
  trend?: { week: string; positivePct: number | null; questions: number }[];
  quoteBank?: { topPraise: Quote[]; topCriticism: Quote[]; questions: Quote[]; fudConcern: Quote[] };
};

export function SentimentModule({ campaignId }: { campaignId: string }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Rollup | null>(null);
  const [bankOpen, setBankOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/sentiment`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch { /* leave null */ } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [campaignId]);

  if (loading) return <Skeleton className="h-24 rounded-lg" />;
  if (!data?.hasData || !data.sentiment || !data.volume) return null;

  const { sentiment: s, volume: v, questions: q, fud, trend = [], quoteBank } = data;
  const scored = s.positive + s.negative + s.fud;
  const pct = (n: number) => (scored > 0 ? Math.round((n / scored) * 100) : 0);

  const BUCKETS: { key: keyof NonNullable<Rollup['quoteBank']>; label: string; tone: 'success' | 'warning' | 'info' | 'danger' }[] = [
    { key: 'topPraise', label: 'Top praise', tone: 'success' },
    { key: 'topCriticism', label: 'Top criticism', tone: 'warning' },
    { key: 'questions', label: 'Questions / confusion', tone: 'info' },
    { key: 'fudConcern', label: 'FUD / concern', tone: 'danger' },
  ];

  return (
    <Card className="border-cream-200">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <MessageSquareText className="h-4 w-4 text-brand" />
          <span className="text-sm font-semibold text-ink-warm-900">Audience Sentiment</span>
          <span className="text-[11px] text-ink-warm-500">TG comments · substantive only</span>
          {fud?.spike && <StatusBadge tone="danger" size="sm">FUD spike · {fud.sharePct}%</StatusBadge>}
          {q?.spike && <StatusBadge tone="warning" size="sm">Question wall · narrative not landing?</StatusBadge>}
        </div>

        <div className="flex items-baseline gap-4 flex-wrap">
          <div>
            <span className="text-2xl font-bold tabular-nums text-ink-warm-900">{s.positivePctRaw ?? '—'}%</span>
            <span className="text-xs text-ink-warm-500 ml-1.5">positive (raw)</span>
          </div>
          <div>
            <span className="text-lg font-semibold tabular-nums text-ink-warm-700">{s.positivePctWeighted ?? '—'}%</span>
            <span className="text-xs text-ink-warm-500 ml-1.5">reaction-weighted</span>
          </div>
          <div className="text-xs text-ink-warm-500">
            {v.total.toLocaleString()} comments · {v.noise} noise · {v.hype} hype · {v.substantive} substantive · {q?.count ?? 0} questions
          </div>
        </div>

        {scored > 0 && (
          <div className="h-2 rounded-full overflow-hidden flex bg-cream-100" title={`+${pct(s.positive)}% · −${pct(s.negative)}% · FUD ${pct(s.fud)}%`}>
            <div className="bg-emerald-500" style={{ width: `${pct(s.positive)}%` }} />
            <div className="bg-amber-400" style={{ width: `${pct(s.negative)}%` }} />
            <div className="bg-rose-500" style={{ width: `${pct(s.fud)}%` }} />
          </div>
        )}

        {trend.length > 1 && (
          <div className="flex items-end gap-1.5">
            {trend.map(t => (
              <div key={t.week} className="flex flex-col items-center gap-0.5" title={`wk of ${formatDate(t.week)} · ${t.positivePct ?? '—'}% positive · ${t.questions} questions`}>
                <div className="w-6 bg-emerald-200 rounded-sm" style={{ height: `${Math.max(4, ((t.positivePct ?? 0) / 100) * 36)}px` }} />
                <span className="text-[9px] text-ink-warm-400">{t.week.slice(5)}</span>
              </div>
            ))}
            <span className="text-[11px] text-ink-warm-500 ml-1">positive share by week</span>
          </div>
        )}

        {quoteBank && (
          <div>
            <button type="button" onClick={() => setBankOpen(o => !o)} aria-expanded={bankOpen}
              className="flex items-center gap-1 text-xs font-medium text-ink-warm-700 hover:text-brand transition-colors">
              {bankOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Verbatim quote bank
            </button>
            {bankOpen && (
              <div className="mt-2 space-y-3">
                {BUCKETS.map(b => {
                  const quotes = quoteBank[b.key] || [];
                  if (quotes.length === 0) return null;
                  return (
                    <div key={b.key} className="space-y-1.5">
                      <StatusBadge tone={b.tone} size="sm">{b.label} · {quotes.length}</StatusBadge>
                      {quotes.map((qt, i) => (
                        <div key={i} className="text-xs border-l-2 border-cream-200 pl-2.5 py-0.5">
                          {/* Verbatim, never paraphrased (spec Track 2). */}
                          <p className="text-ink-warm-900 whitespace-pre-wrap">{qt.text}</p>
                          {qt.enGloss && <p className="text-ink-warm-500 italic mt-0.5">{qt.enGloss}</p>}
                          <p className="text-[11px] text-ink-warm-400 mt-0.5">
                            {qt.author} · {qt.reactions > 0 ? `${qt.reactions} reactions · ` : ''}{formatDate(qt.sentAt)}
                            {qt.theme ? <> · {qt.theme}</> : null}
                            {qt.link && (
                              <a href={qt.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 ml-1.5 text-brand hover:underline">
                                thread <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            )}
                          </p>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
