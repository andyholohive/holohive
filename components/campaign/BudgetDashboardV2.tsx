'use client';

/**
 * BudgetDashboardV2 — Jdot's June 10 spec.
 *
 * Replaces the old overview graphs (low signal) with efficiency tiles that
 * answer "is the spend efficient and where should money move."
 *
 * Layout (top → bottom):
 *   1. Top row: Total Budget · Spent on Content · Spent on Activation ·
 *      Spent on Expenses (admin only) · Remaining
 *   2. Tile grid: CPM · CPE · Cost per piece · Budget burn vs pace ·
 *      Portfolio benchmark
 *   3. Phase 2 funnel placeholder
 *   4. Rollover Summary (renewal-aware, gated on Term records)
 *
 * Preserves the x/x content paid counter + budget table — unchanged.
 *
 * Filter invariant: All efficiency tiles read from
 * `type = content` only. Prize pool + internal stay out of the math.
 */

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, DollarSign, TrendingUp, Activity, Receipt, Wallet, Eye, Heart, FileText, Gauge, Trophy } from 'lucide-react';
import { KpiCard } from '@/components/ui/kpi-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { useCampaignDetail } from '@/contexts/CampaignDetailContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/dateFormat';

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n)}%`;
}

/** Per Andy 2026-06-25: secondary sections (efficiency tiles, portfolio
 *  benchmark, phase 2, rollover summary) collapse by default so the
 *  Budget tab opens to the spend strip only. CMs expand what they
 *  need. State is per-session — no localStorage persistence yet. */
type CollapsibleId = 'efficiency' | 'portfolio' | 'phase2' | 'rollover';

function SectionHeader({
  id,
  title,
  subtitle,
  expanded,
  onToggle,
}: {
  id: CollapsibleId;
  title: string;
  subtitle?: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = expanded ? ChevronDown : ChevronRight;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={`budget-section-${id}`}
      className="w-full flex items-center gap-2 px-1 py-1.5 text-left rounded hover:bg-cream-50 transition-colors"
    >
      <Icon className="h-4 w-4 text-ink-warm-400 flex-shrink-0" />
      <span className="text-sm font-semibold text-ink-warm-900">{title}</span>
      {subtitle && (
        <span className="text-xs text-ink-warm-500 truncate">· {subtitle}</span>
      )}
    </button>
  );
}

type TermRollover = {
  id: string;
  label: string;
  status: 'active' | 'ended';
  allocated: number;
  spent: number;
  /** Only populated when the term has ended; null for active terms. */
  rolledOver: number | null;
  rolloverPct: number | null;
};

export function BudgetDashboardV2({ clientCoveredThrough }: { clientCoveredThrough?: string | null } = {}) {
  const { campaign, payments } = useCampaignDetail();
  const { userProfile } = useAuth();
  const isAdminOrOwner = userProfile?.role === 'super_admin' || userProfile?.role === 'admin';

  // Collapsible state. Default = all closed except the top spend strip
  // (which sits above any collapsible).
  const [openSections, setOpenSections] = useState<Set<CollapsibleId>>(new Set());
  const toggleSection = (id: CollapsibleId) => setOpenSections((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  /** Type-segmented spend totals from payments. Per spec: every tile
   *  filters on Content only; Community Activation + Expenses stay out
   *  of efficiency math.
   *
   *  Schema mapping (payment_category is text, real values are 'kol' |
   *  'other'):
   *    - 'kol' or campaign_kol_id present → Content
   *    - 'other' with no campaign_kol_id → Expenses (internal)
   *    - Community Activation = 0 until a third payment_category lands
   *      (e.g. 'prize_pool'); this matches the spec's "Phase 2 placeholder"
   *      framing.
   */
  const totals = useMemo(() => {
    const list = (payments ?? []) as Array<{
      amount?: number;
      payment_category?: string | null;
      campaign_kol_id?: string | null;
    }>;
    let content = 0, activation = 0, internal = 0;
    for (const p of list) {
      const amount = Number(p.amount ?? 0);
      const cat = (p.payment_category ?? '').toString().toLowerCase();
      if (cat === 'prize_pool' || cat === 'activation') {
        activation += amount;
      } else if (cat === 'kol' || p.campaign_kol_id) {
        content += amount;
      } else {
        internal += amount;
      }
    }
    return { content, activation, internal };
  }, [payments]);

  // [2026-07-09] Total Budget = sum of the client's engagement-TERM amounts
  // (client_engagement_periods across the client's stints). A campaign maps
  // to a client engagement and each term carries its own contracted amount,
  // so the true budget is their sum (e.g. Fogo = 2 terms × 15k = 30k) — not
  // the single total_budget scalar or one region allocation.
  const budgetClientId = (campaign as any)?.client_id as string | undefined;
  // `undefined` = engagement fetch still in flight (render a skeleton so
  // Total Budget / Remaining never flash a fallback value then jump);
  // `null` = settled with no terms (fall back to allocations/total_budget);
  // number = the summed engagement-term total.
  const [engagementTermsTotal, setEngagementTermsTotal] = useState<number | null | undefined>(undefined);
  const engagementLoaded = engagementTermsTotal !== undefined;
  useEffect(() => {
    setEngagementTermsTotal(undefined);
    if (!budgetClientId) { setEngagementTermsTotal(null); return; }
    let cancelled = false;
    (async () => {
      const { data: stints } = await (supabase as any)
        .from('client_stints').select('id').eq('client_id', budgetClientId);
      const stintIds = ((stints ?? []) as Array<{ id: string }>).map(s => s.id);
      if (!stintIds.length) { if (!cancelled) setEngagementTermsTotal(null); return; }
      const { data: periods } = await (supabase as any)
        .from('client_engagement_periods').select('amount').in('stint_id', stintIds);
      const sum = ((periods ?? []) as Array<{ amount: number | string | null }>)
        .reduce((s, p) => s + Number(p.amount ?? 0), 0);
      if (!cancelled) setEngagementTermsTotal(sum);
    })();
    return () => { cancelled = true; };
  }, [budgetClientId]);

  const allocationsSum = (((campaign as any)?.budget_allocations ?? []) as Array<{ allocated_budget?: number | string | null }>)
    .reduce((s, a) => s + Number(a.allocated_budget ?? 0), 0);
  const totalBudget = (engagementTermsTotal && engagementTermsTotal > 0)
    ? engagementTermsTotal
    : (allocationsSum > 0 ? allocationsSum : Number((campaign as any)?.total_budget ?? 0));
  const remaining = totalBudget - totals.content - totals.activation - totals.internal;
  // Team/client view: fold Expenses into Remaining (hidden tile).
  const remainingForRole = isAdminOrOwner ? remaining : remaining + totals.internal;

  /** [2026-07-06 AUDIT-FIX] The efficiency tiles were dead since this
   *  component shipped: CampaignDetailContext's campaignKOLs never
   *  embeds `contents`, so the old loop over `row.contents` always saw
   *  zero rows and every tile rendered "—". Self-fetch the campaign's
   *  contents instead — the aggregation was global (flattened across
   *  roster rows), so a flat by-campaign fetch is equivalent. */
  const [contentRows, setContentRows] = useState<Array<{
    status: string | null;
    multipost_group_id: string | null;
    impressions: number | null;
    likes: number | null;
    comments: number | null;
    retweets: number | null;
  }>>([]);
  useEffect(() => {
    if (!campaign?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from('contents')
        .select('status, multipost_group_id, impressions, likes, comments, retweets')
        .eq('campaign_id', campaign.id);
      if (!cancelled) setContentRows(data ?? []);
    })();
    return () => { cancelled = true; };
  }, [campaign?.id]);


  /** Aggregate metrics from the campaign's content rows for CPM + CPE.
   *  Billable-deliverable counting: rows sharing a multipost_group_id
   *  collapse to 1 deliverable (per spec: Multipost=1, Complimentary=0). */
  const contentMetrics = useMemo(() => {
    let totalViews = 0, totalReactions = 0, totalReplies = 0, totalReposts = 0;
    const standaloneCount = { n: 0 };
    const multipostGroups = new Set<string>();
    for (const c of contentRows) {
      if (c?.status === 'deleted') continue;
      // Per TG Bot Content Submission Phase 2: pending_verification rows
      // are bot-approved but not yet team-verified. Excluding them from
      // CPM/CPE keeps cost-efficiency numbers from being skewed by
      // unverified posts.
      if (c?.status === 'pending_verification') continue;
      if (c?.multipost_group_id) multipostGroups.add(c.multipost_group_id);
      else standaloneCount.n++;
      totalViews += Number(c?.impressions ?? 0);
      totalReactions += Number(c?.likes ?? 0);
      totalReplies += Number(c?.comments ?? 0);
      totalReposts += Number(c?.retweets ?? 0);
    }
    const contentCount = standaloneCount.n + multipostGroups.size;
    const engagementSum = totalReactions + totalReplies + totalReposts;
    const cpm = totalViews > 0 ? (totals.content / totalViews) * 1000 : null;
    const cpe = engagementSum > 0 ? totals.content / engagementSum : null;
    const costPerPiece = contentCount > 0 ? totals.content / contentCount : null;
    return { totalViews, engagementSum, contentCount, cpm, cpe, costPerPiece };
  }, [contentRows, totals.content]);

  /** Burn vs pace. Per spec, burn calc can include all categories.
   *
   *  [2026-07-10] Term end is coverage-first (client covered_through ??
   *  campaign end_date) — same rule as the hero's "Week N of M" and the
   *  campaign card. Anchoring to end_date alone clamped elapsed to 100%
   *  once the campaign's own end date passed mid-engagement (Jdot:
   *  Venice showed "43% / 100%" at Week 9 of 13; should be ~70%). */
  const burn = useMemo(() => {
    if (!campaign?.start_date || !totalBudget) return null;
    const start = new Date(campaign.start_date as any);
    const termEndIso = clientCoveredThrough ?? (campaign as any).end_date ?? null;
    const end = termEndIso ? new Date(termEndIso) : null;
    if (!end) return null;
    const today = new Date();
    const totalDays = Math.max(1, (end.getTime() - start.getTime()) / 86400000);
    const elapsedDays = Math.max(0, Math.min(totalDays, (today.getTime() - start.getTime()) / 86400000));
    const pctElapsed = (elapsedDays / totalDays) * 100;
    const allSpent = totals.content + totals.activation + totals.internal;
    const pctSpent = (allSpent / totalBudget) * 100;
    return { pctSpent, pctElapsed, gap: pctSpent - pctElapsed };
  }, [campaign, clientCoveredThrough, totalBudget, totals]);

  // ── Rollover Summary, by term ─────────────────────────────────────
  // [2026-06-30] Per Andy: rows are TERMS (client_engagement_periods),
  // not stints. A stint represents a continuous engagement chunk
  // (effectively a different campaign era); within a stint each term
  // is one signed slice with its own amount + window. Rollover
  // crystallises term-by-term.
  //
  // For each term:
  //   allocated = period.amount
  //   spent     = sum of THIS campaign's payments inside the term's
  //               [start_date, end_date] window
  //   status    = end_date < today → ended; else active
  //   rolled    = allocated - spent (ended only)
  const clientId = (campaign as any)?.client_id as string | null;
  const [termRollover, setTermRollover] = useState<TermRollover[] | null>(null);
  useEffect(() => {
    if (!clientId) { setTermRollover([]); return; }
    let cancelled = false;
    (async () => {
      // Stints filter scopes terms to this client. We don't sum per
      // stint here — the rows are per-term and the term row itself
      // carries everything we need.
      const stintsRes = await (supabase as any)
        .from('client_stints')
        .select('id')
        .eq('client_id', clientId);
      if (cancelled) return;
      const stintIds = ((stintsRes.data ?? []) as Array<{ id: string }>).map(s => s.id);
      if (stintIds.length === 0) { setTermRollover([]); return; }
      const periodsRes = await (supabase as any)
        .from('client_engagement_periods')
        .select('id,stint_id,period_n,amount,start_date,end_date')
        .in('stint_id', stintIds)
        .order('start_date', { ascending: true });
      if (cancelled) return;
      const terms = (periodsRes.data ?? []) as Array<{
        id: string;
        stint_id: string;
        period_n: number | null;
        amount: number | null;
        start_date: string;
        end_date: string;
      }>;

      // Bucket this campaign's payments by term via payment_date in
      // the term's [start, end] window.
      const pmts = (payments ?? []) as Array<{ amount?: number; payment_date?: string | null }>;
      const todayIso = new Date().toISOString().slice(0, 10);
      const rows: TermRollover[] = terms.map((t) => {
        const start = new Date(t.start_date + 'T00:00:00');
        const end = new Date(t.end_date + 'T23:59:59');
        let spent = 0;
        for (const p of pmts) {
          if (!p.payment_date) continue;
          const d = new Date(p.payment_date + (p.payment_date.includes('T') ? '' : 'T12:00:00'));
          if (d >= start && d <= end) spent += Number(p.amount ?? 0);
        }
        const allocated = Number(t.amount ?? 0);
        const status: 'active' | 'ended' = t.end_date < todayIso ? 'ended' : 'active';
        const rolledOver = status === 'ended' ? allocated - spent : null;
        const rolloverPct =
          status === 'ended' && allocated > 0
            ? Math.round((rolledOver as number) / allocated * 100)
            : null;
        const termN = t.period_n ?? '?';
        const range = `${formatDate(t.start_date)} → ${formatDate(t.end_date)}`;
        return {
          id: t.id,
          label: `Term ${termN} · ${range}`,
          status,
          allocated,
          spent,
          rolledOver,
          rolloverPct,
        };
      });
      setTermRollover(rows);
    })();
    return () => { cancelled = true; };
  }, [clientId, payments]);

  if (!campaign) return null;

  return (
    <div className="space-y-6">
      {/* ── Top row: 5-cell spend breakdown ──
          Skeleton until the engagement-term fetch settles so Total Budget
          + Remaining render once at their real value (no fallback flash). */}
      {!engagementLoaded ? (
        <div className={`grid grid-cols-2 md:grid-cols-${isAdminOrOwner ? '5' : '4'} gap-3`}>
          {Array.from({ length: isAdminOrOwner ? 5 : 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
      <div className={`grid grid-cols-2 md:grid-cols-${isAdminOrOwner ? '5' : '4'} gap-3`}>
        <KpiCard
          icon={Wallet}
          label="Total Budget"
          value={fmtMoney(totalBudget)}
          sub="Sum of stint terms"
          accent="brand"
        />
        <KpiCard
          icon={Eye}
          label="Content Spend"
          value={fmtMoney(totals.content)}
          sub="KOL content payments"
          accent="sky"
        />
        <KpiCard
          icon={Activity}
          label="Activation"
          value={fmtMoney(totals.activation)}
          sub="Prize pools & activations"
          accent="purple"
        />
        {isAdminOrOwner && (
          <KpiCard
            icon={Receipt}
            label="Expenses"
            value={fmtMoney(totals.internal)}
            sub="Admin only"
            accent="amber"
          />
        )}
        <KpiCard
          icon={DollarSign}
          label="Remaining"
          value={fmtMoney(remainingForRole)}
          sub={isAdminOrOwner ? 'Total - all categories' : 'Folds Expenses'}
          accent={remainingForRole < 0 ? 'rose' : 'emerald'}
        />
      </div>
      )}

      {/* ── Efficiency metrics (collapsed by default) ────────────────
          CPM · CPE · Cost per content piece · Burn vs Pace. Grouped
          because they share a single mental model ("is the spend
          efficient?"). Expanding shows all four KPIs at once. */}
      <div>
        <SectionHeader
          id="efficiency"
          title="Efficiency Metrics"
          subtitle="CPM · CPE · Cost per piece · Burn vs Pace"
          expanded={openSections.has('efficiency')}
          onToggle={() => toggleSection('efficiency')}
        />
        {openSections.has('efficiency') && (
          <div id="budget-section-efficiency" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
            <KpiCard
              icon={Eye}
              label="CPM"
              value={contentMetrics.cpm !== null ? fmtMoney(contentMetrics.cpm) : '—'}
              sub={`per 1,000 views · ${contentMetrics.totalViews.toLocaleString()} views`}
              accent="sky"
            />
            <KpiCard
              icon={Heart}
              label="CPE"
              value={contentMetrics.cpe !== null ? `$${contentMetrics.cpe.toFixed(2)}` : '—'}
              sub={`per engagement · ${contentMetrics.engagementSum.toLocaleString()} eng`}
              accent="rose"
            />
            <KpiCard
              icon={FileText}
              label="Cost per content piece"
              value={contentMetrics.costPerPiece !== null ? fmtMoney(contentMetrics.costPerPiece) : '—'}
              sub={`blended · ${contentMetrics.contentCount} pieces`}
              accent="brand"
            />
            <KpiCard
              icon={Gauge}
              label="Burn vs Pace"
              value={burn ? `${fmtPct(burn.pctSpent)} / ${fmtPct(burn.pctElapsed)}` : '—'}
              sub={
                burn
                  ? burn.gap > 5 ? `Running hot (+${Math.round(burn.gap)}%)`
                  : burn.gap < -5 ? `Under (${Math.round(burn.gap)}%)`
                  : 'On pace'
                  : 'No timeline'
              }
              accent={burn && burn.gap > 5 ? 'rose' : burn && burn.gap < -5 ? 'amber' : 'emerald'}
            />
          </div>
        )}
      </div>

      {/* ── Portfolio Benchmark (collapsed by default) ──────────────── */}
      <div>
        <SectionHeader
          id="portfolio"
          title="Portfolio Benchmark"
          subtitle="Pending historical CPM/CPE backfill"
          expanded={openSections.has('portfolio')}
          onToggle={() => toggleSection('portfolio')}
        />
        {openSections.has('portfolio') && (
          <Card id="budget-section-portfolio" className="border-cream-200 border-dashed mt-2">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Trophy className="h-5 w-5 text-brand" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-ink-warm-900">Portfolio Benchmark</p>
                  <p className="text-xs text-ink-warm-500 italic">
                    Renders &quot;$X vs HH avg $Y, top quartile&quot; under CPM + CPE — pending historical CPM/CPE backfill across past campaigns.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Phase 2 funnel (collapsed by default) ──────────────────── */}
      <div>
        <SectionHeader
          id="phase2"
          title="Community Activation Spend Funnel"
          subtitle="Spend → Clicks → Sign-ups → Wallets → Volume"
          expanded={openSections.has('phase2')}
          onToggle={() => toggleSection('phase2')}
        />
        {openSections.has('phase2') && (
          <Card id="budget-section-phase2" className="border-cream-200 border-dashed mt-2">
            <CardContent className="p-4">
              <p className="text-xs text-ink-warm-500 italic mb-3">
                Pending activation data: Spend → Clicks → Sign-ups → Wallet connects → Volume
              </p>
              <div className="grid grid-cols-5 gap-1">
                {['Spend', 'Clicks', 'Sign-ups', 'Wallets', 'Volume'].map(label => (
                  <div key={label} className="bg-cream-100 rounded p-2 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-ink-warm-500">{label}</p>
                    <p className="text-xs text-ink-warm-400 font-mono">—</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Rollover Summary by term (collapsed by default) ──────────
          [2026-06-30] Per Andy: rows are TERMS (client_engagement_periods),
          not stints. A stint is the engagement-era container; each
          term inside a stint is one signed slice with its own
          allocation + window. Rollover crystallises term-by-term.
          Allocated = the term's amount.
          Spent     = this campaign's payments dated inside the term window.
          Rollover only computed for ended terms; active terms show "—". */}
      <div>
        <SectionHeader
          id="rollover"
          title="Rollover Summary"
          subtitle={termRollover && termRollover.length > 0 ? `${termRollover.length} term${termRollover.length === 1 ? '' : 's'}` : 'No terms'}
          expanded={openSections.has('rollover')}
          onToggle={() => toggleSection('rollover')}
        />
        {openSections.has('rollover') && (
          <Card id="budget-section-rollover" className="border-cream-200 mt-2">
            <CardContent className="p-4">
              <p className="text-[11px] text-ink-warm-500 italic mb-3">
                Per-term view of allocated vs spent vs rolled forward. Allocated = the term&apos;s amount. Spent = this campaign&apos;s payments inside the term window. Active terms show &quot;—&quot; for rollover until they close.
              </p>
              {termRollover === null ? (
                <p className="text-xs text-ink-warm-400 italic">Loading terms…</p>
              ) : termRollover.length === 0 ? (
                <p className="text-xs text-ink-warm-400 italic">No terms recorded for this client. Add one on the client&apos;s Engagement tab.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead className="border-b border-cream-100">
                      <tr className="text-left text-ink-warm-500">
                        <th className="py-1.5 pr-3 font-medium">Term</th>
                        <th className="py-1.5 pr-3 font-medium text-right">Allocated</th>
                        <th className="py-1.5 pr-3 font-medium text-right">Spent</th>
                        <th className="py-1.5 pr-3 font-medium text-right">Rolled over</th>
                        <th className="py-1.5 font-medium text-right">Rollover %</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {termRollover.map((row) => (
                        <tr key={row.id} className="border-b border-cream-50">
                          <td className="py-1.5 pr-3 font-sans">
                            {row.label}
                            {row.status === 'active' && (
                              <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider bg-brand-soft text-brand-deep">Active</span>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-right">{fmtMoney(row.allocated)}</td>
                          <td className="py-1.5 pr-3 text-right">{fmtMoney(row.spent)}</td>
                          <td className="py-1.5 pr-3 text-right text-ink-warm-400">
                            {row.rolledOver !== null ? fmtMoney(row.rolledOver) : '—'}
                          </td>
                          <td className="py-1.5 text-right text-ink-warm-400">
                            {row.rolloverPct !== null ? `${row.rolloverPct}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
