'use client';

/**
 * Client Portfolio — every live account in one read.
 *
 * [2026-09-11, Andy] For someone new to the company. The page is ordered so it
 * can be read straight down without prior context:
 *
 *   what the business is  →  how a campaign is built (the backbone)
 *   →  the portfolio in one table  →  what needs a decision
 *   →  each account, walked along that same backbone
 *
 * Every figure is computed live from the database rather than pasted, and the
 * page states what it leaves out instead of quietly dropping it.
 */

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { KpiCard } from '@/components/ui/kpi-card';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/dateFormat';
import { ClientDossier } from '@/components/portfolio/ClientDossier';
import { Backbone } from '@/components/portfolio/Backbone';
import { getPortfolio, rollUp, getClientHistory, getCreatorOverlap, type ClientDossier as Dossier, type MonthPoint, type CreatorReach } from '@/lib/portfolioService';
import { ClientHistoryChart } from '@/components/portfolio/ClientHistoryChart';
import { strategyFor } from '@/lib/portfolioStrategy';
import { ComplianceRail } from '@/components/portfolio/ComplianceRail';
import { CollapsibleSection, CollapsibleCard, setAllSections } from '@/components/portfolio/Collapsible';
import { Glossary } from '@/components/portfolio/Glossary';
import { RunwayPace } from '@/components/portfolio/RunwayPace';
import { CreatorOverlap } from '@/components/portfolio/CreatorOverlap';
import { NextMoves } from '@/components/portfolio/NextMoves';
import { ReadingPath } from '@/components/portfolio/ReadingPath';
import { Briefcase, DollarSign, Users, Send, Eye, Wallet, AlertTriangle, ChevronsUpDown, ChevronsDownUp, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { canViewPortfolio } from '@/lib/portfolioAccess';
import { Button } from '@/components/ui/button';

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

export default function PortfolioPage() {
  const { toast } = useToast();
  const { userProfile, loading: authLoading } = useAuth();
  const allowed = canViewPortfolio(userProfile);
  const [rows, setRows] = useState<Dossier[] | null>(null);
  const [history, setHistory] = useState<MonthPoint[]>([]);
  const [creators, setCreators] = useState<CreatorReach[]>([]);
  /** Which account is currently on screen, for the jump bar. */
  const [activeId, setActiveId] = useState<string | null>(null);
  /** Last account jumped to. The counter makes a repeat click re-fire. */
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const jumpTo = (id: string) => setFocus(f => ({ id, n: (f?.n ?? 0) + 1 }));

  useEffect(() => {
    // No fetch for a viewer who cannot see the page. Loading a client's whole
    // dossier set and then hiding it would put the data in the browser anyway.
    if (!allowed) return;
    let cancelled = false;
    (async () => {
      try {
        const [data, hist, overlap] = await Promise.all([
          getPortfolio(),
          // The chart and the roster view are context, not the point of the
          // page — if either fails the dossiers below should still render.
          getClientHistory().catch(() => [] as MonthPoint[]),
          getCreatorOverlap().catch(() => [] as CreatorReach[]),
        ]);
        if (!cancelled) { setRows(data); setHistory(hist); setCreators(overlap); }
      } catch (err: any) {
        if (!cancelled) {
          setRows([]);
          toast({ title: 'Could not load the portfolio', description: err?.message, variant: 'destructive' });
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  // Scroll-spy for the jump bar. The top quarter of the viewport is the
  // "you are here" band — anchoring on the middle would leave the bar naming
  // the previous account while its successor's header is already on screen.
  useEffect(() => {
    if (!rows || rows.length === 0) return;
    const els = rows
      .map(r => document.getElementById(`client-${r.id}`))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    const io = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActiveId(visible[0].target.id.replace('client-', ''));
      },
      { rootMargin: '-72px 0px -75% 0px', threshold: 0 },
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [rows]);

  const totals = useMemo(() => rollUp(rows ?? []), [rows]);

  /** Derived, not hand-written, so it cannot drift from the data above it. */
  const attention = useMemo(() => {
    const out: { tone: 'danger' | 'warning' | 'info'; title: string; detail: string }[] = [];
    for (const r of rows ?? []) {
      if (r.daysLeft !== null && r.daysLeft <= 0) {
        out.push({
          tone: 'danger',
          title: `${r.name} — term has ended`,
          detail: `Ran to ${r.stintEnd ? formatDate(r.stintEnd) : 'an unrecorded date'}; ${money(r.invoiced)} invoiced across ${r.terms} term${r.terms === 1 ? '' : 's'}. Renew, extend or close it out.`,
        });
      } else if (r.daysLeft !== null && r.daysLeft <= 21) {
        out.push({
          tone: 'warning',
          title: `${r.name} — ${r.daysLeft} day${r.daysLeft === 1 ? '' : 's'} left on the term`,
          detail: `${money(r.unspent)} of budget still unspent. At the current pace that is either a push or a refund.`,
        });
      }
      if (r.owed > 0) {
        out.push({
          tone: r.owed >= 2000 ? 'warning' : 'info',
          title: `${r.name} — ${money(r.owed)} owed to creators`,
          detail: `${r.owedRows} post${r.owedRows === 1 ? '' : 's'} logged and unpaid.`,
        });
      }
      if (r.posts > 0 && r.portalExternalVisits === 0) {
        out.push({
          tone: 'warning',
          title: `${r.name} has never opened their portal`,
          detail: `${r.posts} posts delivered and ${r.docOpens} document open${r.docOpens === 1 ? '' : 's'} by the client, but no external portal visit on record. The weekly reporting may be landing only in Telegram.`,
        });
      }
      // Commitments read out of the client's own documents. The checks around
      // this one all reason from the database, which cannot know that a contract
      // sets a content deadline or that an engagement never intended to post.
      for (const a of strategyFor(r.name)?.alerts ?? []) out.push(a);

      const late = r.weeks.filter(w => w.leadDays !== null && w.leadDays < 0);
      if (late.length > 0) {
        out.push({
          tone: 'info',
          title: `${r.name} — ${late.length} week${late.length === 1 ? '' : 's'} briefed after the week began`,
          detail: `Week${late.length === 1 ? '' : 's'} ${late.map(w => w.weekNumber).join(', ')} went up late, so the plan documented work that had already happened.`,
        });
      }
    }
    return out;
  }, [rows]);

  const header = (
    <PageHeader
      icon={Briefcase}
      kicker="Clients · Portfolio"
      kickerDot="brand"
      title="Client Portfolio"
      subtitle="Every live account — what we agreed, what we briefed, what shipped, and what they said back"
      actions={(
        <>
          <Button variant="outline" size="sm" onClick={() => setAllSections(false)}>
            <ChevronsDownUp className="h-4 w-4 mr-2" />Collapse all
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAllSections(true)}>
            <ChevronsUpDown className="h-4 w-4 mr-2" />Expand all
          </Button>
        </>
      )}
    />
  );

  // Auth has to settle first, or the page flashes "restricted" at Andy on every
  // load while the profile resolves.
  if (authLoading) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Skeleton className="h-52 rounded-lg" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <EmptyState
          icon={Lock}
          title="This page is private"
          description="The client portfolio is restricted to Andy. Everything in it is available elsewhere in HHP — Clients, Campaigns, Links and the client portals all carry the same records."
        />
      </div>
    );
  }

  if (rows === null) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Skeleton className="h-52 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}

      {/* ── where to start, for a first-time reader ───────────────── */}
      {rows.length > 0 && <ReadingPath rows={rows} />}

      {/* ── what the business is ──────────────────────────────────── */}
      {/* Scroll anchors wrap their target rather than sitting beside it. As
          empty siblings they were still flex children, so the page's gap
          applied on both sides of a zero-height element and every anchored
          block sat 48px from its neighbour where everything else sat 24px —
          which is the uneven spacing, not the cards themselves. */}
      <div id="rp-anchor-orientation" className="scroll-mt-24">
      <CollapsibleCard
        id="orientation"
        kicker="Start here"
        title="What this business actually does"
        description="Read this once if you are new to Holo Hive; collapse it afterwards."
      >
      <div className="p-5 flex flex-col gap-2.5">
        <p className="text-sm text-ink-warm-700 leading-relaxed max-w-[76ch]">
          Holo Hive helps crypto companies reach a Korean audience. Clients pay us to get their
          product talked about by Korean creators — people with followings on X and Telegram, known
          in the industry as <b>KOLs</b>. We find those creators, brief them, pay them, and report on
          what the coverage achieved.
        </p>
        <p className="text-sm text-ink-warm-700 leading-relaxed max-w-[76ch]">
          Money works in two parts. The client&apos;s <b>campaign budget</b> passes through us to the
          creators, and anything unspent is refunded — so it is not our income. Our <b>fee</b> is
          billed separately on top. Every &ldquo;to creators&rdquo; figure on this page is client money
          going out, never revenue.
        </p>
      </div>
      </CollapsibleCard>
      </div>

      {/* ── how the work is built, and what constrains it ─────────── */}
      {/* [2026-09-11, Andy] The compliance rail sits here rather than further
          down because it belongs with the backbone: one says how a campaign is
          assembled, the other says what may never go in it. Together they are
          the orientation a newcomer needs before any account makes sense. */}
      <div id="rp-anchor-backbone" className="scroll-mt-24"><Backbone /></div>
      <div id="rp-anchor-compliance" className="scroll-mt-24"><ComplianceRail /></div>
      <Glossary />

      {/* ── the portfolio in one strip ────────────────────────────── */}
      <div id="rp-anchor-book" className="scroll-mt-24">
      <CollapsibleSection
        id="book"
        label="The book of business"
        counter={`01 — ${totals.clients} live client${totals.clients === 1 ? '' : 's'}`}
        first
      >
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={Briefcase} label="Live clients" value={totals.clients} accent="brand" />
        <KpiCard icon={DollarSign} label="Invoiced" value={money(totals.invoiced)} sub="budget + fee" accent="sky" />
        <KpiCard icon={Users} label="To creators" value={money(totals.toCreators)}
          sub={totals.invoiced > 0 ? `${Math.round((totals.toCreators / totals.invoiced) * 100)}% of invoiced` : undefined} accent="purple" />
        <KpiCard icon={Wallet} label="Unspent" value={money(totals.unspent)} sub="refundable" accent={totals.unspent > 0 ? 'amber' : 'gray'} />
        <KpiCard icon={Send} label="Posts live" value={totals.posts} sub={`${totals.kols} creators`} accent="emerald" />
        <KpiCard icon={Eye} label="Views earned" value={compact(totals.views)} accent="gray" />
      </div>

      {history.length > 0 && <ClientHistoryChart points={history} />}
      {rows.length > 0 && <RunwayPace rows={rows} />}
      <CreatorOverlap creators={creators} clientCount={rows.length} />
      </CollapsibleSection>
      </div>

      {/* ── all five side by side ─────────────────────────────────── */}
      {rows.length > 0 && (
        <>
        <CollapsibleSection id="sidebyside" label="Side by side" counter="02 — every account on one row">
        <Card className="border-cream-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-cream-100 flex items-baseline justify-between gap-3 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">
              Every account at a glance
            </span>
            <span className="text-[11px] text-ink-warm-400">
              Largest first · click a name to jump to the full account
            </span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-cream-50 hover:bg-cream-50">
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Client</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Term ends</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Invoiced</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">To creators</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Unspent</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Creators</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Posts</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Views</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Reads what we send</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id} className="border-cream-100">
                    <TableCell className="py-3">
                      <a
                        href={`#client-${r.id}`}
                        onClick={() => jumpTo(r.id)}
                        className="font-medium text-ink-warm-900 hover:text-brand transition-colors focus-brand rounded"
                      >
                        {r.name}
                      </a>
                      {r.campaignName && (
                        <span className="block text-[11px] text-ink-warm-400">{r.campaignName}</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3 whitespace-nowrap">
                      {r.stintEnd ? (
                        <span className="flex flex-col">
                          <span className="tabular-nums text-[13px]">{formatDate(r.stintEnd)}</span>
                          {r.daysLeft !== null && r.daysLeft <= 21 && (
                            <span className={`text-[11px] ${r.daysLeft <= 0 ? 'text-rose-600' : 'text-amber-700'}`}>
                              {r.daysLeft <= 0 ? 'ended' : `${r.daysLeft} day${r.daysLeft === 1 ? '' : 's'}`}
                            </span>
                          )}
                        </span>
                      ) : <span className="text-ink-warm-300">—</span>}
                    </TableCell>
                    <TableCell className="py-3 tabular-nums font-medium">{money(r.invoiced)}</TableCell>
                    <TableCell className="py-3 tabular-nums text-ink-warm-500">
                      {money(r.toCreators)}
                      {r.owed > 0 && <span className="block text-[11px] text-amber-700">{money(r.owed)} owed</span>}
                    </TableCell>
                    <TableCell className="py-3 tabular-nums text-ink-warm-500">{money(r.unspent)}</TableCell>
                    <TableCell className="py-3 tabular-nums">{r.kols}</TableCell>
                    <TableCell className="py-3 tabular-nums">
                      {strategyFor(r.name)?.deliveryModel === 'private-council' ? (
                        <span className="flex flex-col">
                          <span className="text-ink-warm-300">—</span>
                          <span className="text-[11px] text-ink-warm-400">council</span>
                        </span>
                      ) : r.posts}
                    </TableCell>
                    <TableCell className="py-3 tabular-nums">{compact(r.views)}</TableCell>
                    <TableCell className="py-3">
                      <span className="flex flex-col gap-1 items-start">
                        <StatusBadge
                          tone={r.docMinutes >= 10 ? 'success' : r.docMinutes >= 3 ? 'warning' : 'danger'}
                          size="sm"
                        >
                          {r.docMinutes}m · {r.portalExternalVisits} portal
                        </StatusBadge>
                        <span className="text-[11px] text-ink-warm-400 tabular-nums">
                          #{r.rank.clientReadingMinutes} of {r.rank.of} on reading
                        </span>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
        </CollapsibleSection>
        </>
      )}

      {/* ── attention ─────────────────────────────────────────────── */}
      {attention.length > 0 && (
        <>
          <CollapsibleSection
            id="attention"
            label="Needs a decision"
            counter={`03 — ${attention.length} item${attention.length === 1 ? '' : 's'}`}
          >
          <Card className="border-cream-200 overflow-hidden">
            {attention.map((a, i) => (
              <div key={i} className="flex items-start gap-3.5 px-4 py-3.5 border-b border-cream-100 last:border-b-0">
                <span className={`w-[3px] self-stretch rounded-sm flex-shrink-0 ${
                  a.tone === 'danger' ? 'bg-rose-500' : a.tone === 'warning' ? 'bg-amber-500' : 'bg-brand'
                }`} />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm font-semibold text-ink-warm-900">{a.title}</span>
                  <span className="text-[13px] text-ink-warm-500 leading-relaxed">{a.detail}</span>
                </div>
              </div>
            ))}
          </Card>
          </CollapsibleSection>
        </>
      )}

      {/* ── what to do about all of it ────────────────────────────── */}
      {rows.length > 0 && (
        <CollapsibleSection id="moves" label="What to do from here" counter="04 — read off the data above">
          <NextMoves rows={rows} creators={creators} />
        </CollapsibleSection>
      )}

      {/* ── dossiers ──────────────────────────────────────────────── */}
      <CollapsibleSection id="accounts" label="The accounts" counter="05 — each one walks the same backbone">
      {rows.length === 0 ? (
        <EmptyState icon={Briefcase} title="No active clients"
          description="Clients appear here once they are marked active with an engagement." />
      ) : (
        <>
          {/* [2026-09-11, Andy] The accounts run to tens of thousands of pixels
              between them, so a reader who wants one client should not have to
              scroll past four others to reach it. The bar sticks under the app
              header and marks where you are. */}
          <div className="sticky top-0 z-20 -mx-1 px-1 py-2 bg-cream-50/95 backdrop-blur-sm border-b border-cream-200 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 mr-1">
              Jump to
            </span>
            {rows.map(d => (
              <a
                key={d.id}
                href={`#client-${d.id}`}
                onClick={() => jumpTo(d.id)}
                aria-current={activeId === d.id ? 'true' : undefined}
                className={`flex items-center gap-1.5 rounded-full border pl-1 pr-2.5 py-1 text-[12px] transition-colors focus-brand ${
                  activeId === d.id
                    ? 'border-brand bg-brand-light text-brand font-semibold'
                    : 'border-cream-200 bg-white text-ink-warm-900 hover:border-brand hover:text-brand'
                }`}
              >
                {d.logoUrl ? (
                  <img src={d.logoUrl} alt="" className="h-4 w-4 rounded-full object-cover bg-white ring-1 ring-cream-200" />
                ) : (
                  <span className="h-4 w-4 rounded-full bg-brand text-white grid place-items-center text-[8px] font-bold">
                    {d.name.charAt(0)}
                  </span>
                )}
                {d.name}
              </a>
            ))}
          </div>

          <div className="flex flex-col gap-6">
            {rows.map(d => <ClientDossier key={d.id} d={d} focus={focus} />)}
          </div>
        </>
      )}
      </CollapsibleSection>

      {/* ── provenance ────────────────────────────────────────────── */}
      <Card className="border-cream-200 bg-cream-50 p-4 flex flex-col gap-2">
        <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">
          <AlertTriangle className="h-3 w-3" />How to read this
        </span>
        <p className="text-[12.5px] text-ink-warm-700 leading-relaxed">
          <b>Live data.</b> Every figure is read from the database when the page loads, so nothing
          here can go stale.
        </p>
        <p className="text-[12.5px] text-ink-warm-700 leading-relaxed">
          <b>Fee revenue is not shown.</b> No fee has been recorded against any engagement term yet,
          so a margin column would read $0 everywhere and be mistaken for &ldquo;we earned nothing&rdquo;
          rather than &ldquo;nobody entered it&rdquo;. Add fees on the{' '}
          <StatusBadge tone="neutral" size="sm">Lifetime Value</StatusBadge> page and it becomes reportable.
        </p>
        <p className="text-[12.5px] text-ink-warm-700 leading-relaxed">
          <b>Excluded.</b> Campaigns flagged as internal tests. Chat shows only the five most recent
          text messages per client — older Telegram history is not retained here, so an account can
          look quiet when it is not.
        </p>
      </Card>
    </div>
  );
}
