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

type StintRollover = {
  id: string;
  label: string;
  status: 'active' | 'ended';
  allocated: number;
  spent: number;
  /** Only populated when the stint has ended; null for active stints. */
  rolledOver: number | null;
  rolloverPct: number | null;
};

export function BudgetDashboardV2() {
  const { campaign, campaignKOLs, payments } = useCampaignDetail();
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

  const totalBudget = Number((campaign as any)?.total_budget ?? 0);
  const remaining = totalBudget - totals.content - totals.activation - totals.internal;
  // Team/client view: fold Expenses into Remaining (hidden tile).
  const remainingForRole = isAdminOrOwner ? remaining : remaining + totals.internal;

  /** Aggregate metrics from campaign_kols content rows for CPM + CPE.
   *  Billable-deliverable counting: rows sharing a multipost_group_id
   *  collapse to 1 deliverable (per spec: Multipost=1, Complimentary=0). */
  const contentMetrics = useMemo(() => {
    const ck = (campaignKOLs ?? []) as Array<any>;
    let totalViews = 0, totalReactions = 0, totalReplies = 0, totalReposts = 0;
    const standaloneCount = { n: 0 };
    const multipostGroups = new Set<string>();
    for (const row of ck) {
      const contents = row?.contents ?? [];
      for (const c of contents) {
        if (c?.status === 'deleted') continue;
        // Per TG Bot Content Submission Phase 2: pending_verification rows
        // are bot-approved but not yet team-verified. Excluding them from
        // CPM/CPE keeps cost-efficiency numbers from being skewed by
        // unverified posts.
        if (c?.status === 'pending_verification') continue;
        if (c?.multipost_group_id) multipostGroups.add(c.multipost_group_id);
        else standaloneCount.n++;
        totalViews += Number(c?.impressions ?? c?.views ?? 0);
        totalReactions += Number(c?.likes ?? c?.reactions ?? 0);
        totalReplies += Number(c?.comments ?? c?.replies ?? 0);
        totalReposts += Number(c?.retweets ?? c?.reposts ?? c?.forwards ?? 0);
      }
    }
    const contentCount = standaloneCount.n + multipostGroups.size;
    const engagementSum = totalReactions + totalReplies + totalReposts;
    const cpm = totalViews > 0 ? (totals.content / totalViews) * 1000 : null;
    const cpe = engagementSum > 0 ? totals.content / engagementSum : null;
    const costPerPiece = contentCount > 0 ? totals.content / contentCount : null;
    return { totalViews, engagementSum, contentCount, cpm, cpe, costPerPiece };
  }, [campaignKOLs, totals.content]);

  /** Burn vs pace. Per spec, burn calc can include all categories. */
  const burn = useMemo(() => {
    if (!campaign?.start_date || !totalBudget) return null;
    const start = new Date(campaign.start_date as any);
    const end = (campaign as any).end_date ? new Date((campaign as any).end_date) : null;
    if (!end) return null;
    const today = new Date();
    const totalDays = Math.max(1, (end.getTime() - start.getTime()) / 86400000);
    const elapsedDays = Math.max(0, Math.min(totalDays, (today.getTime() - start.getTime()) / 86400000));
    const pctElapsed = (elapsedDays / totalDays) * 100;
    const allSpent = totals.content + totals.activation + totals.internal;
    const pctSpent = (allSpent / totalBudget) * 100;
    return { pctSpent, pctElapsed, gap: pctSpent - pctElapsed };
  }, [campaign, totalBudget, totals]);

  // ── Rollover Summary, by stint ────────────────────────────────────
  // [2026-06-25] Per Andy: rows are stints, not segments. For each
  // stint we sum `client_engagement_periods.amount` as the allocated
  // budget and match the campaign's payments by `payment_date` falling
  // inside the stint window (start_date → end_date inclusive). Ended
  // stints get a "rolled over" column = allocated − spent; active stints
  // show "—" since rollover only crystallises at term close.
  const clientId = (campaign as any)?.client_id as string | null;
  const [stintRollover, setStintRollover] = useState<StintRollover[] | null>(null);
  useEffect(() => {
    if (!clientId) { setStintRollover([]); return; }
    let cancelled = false;
    (async () => {
      const [stintsRes, periodsRes] = await Promise.all([
        (supabase as any)
          .from('client_stints')
          .select('id,start_date,end_date,status')
          .eq('client_id', clientId)
          .order('start_date', { ascending: true }),
        (supabase as any)
          .from('client_engagement_periods')
          .select('stint_id,amount,start_date,end_date')
          .order('start_date', { ascending: true }),
      ]);
      if (cancelled) return;
      const stints = (stintsRes.data ?? []) as Array<{
        id: string;
        start_date: string;
        end_date: string | null;
        status: string;
      }>;
      const periods = (periodsRes.data ?? []) as Array<{
        stint_id: string;
        amount: number | null;
      }>;
      const allocByStint = new Map<string, number>();
      for (const p of periods) {
        const v = Number(p.amount ?? 0);
        allocByStint.set(p.stint_id, (allocByStint.get(p.stint_id) ?? 0) + v);
      }
      // Bucket this campaign's payments by stint via payment_date.
      const pmts = (payments ?? []) as Array<{ amount?: number; payment_date?: string | null }>;
      const spentByStint = new Map<string, number>();
      for (const stint of stints) {
        const start = new Date(stint.start_date + 'T00:00:00');
        const end = stint.end_date
          ? new Date(stint.end_date + 'T23:59:59')
          : new Date('9999-12-31T00:00:00');
        let total = 0;
        for (const p of pmts) {
          if (!p.payment_date) continue;
          const d = new Date(p.payment_date + (p.payment_date.includes('T') ? '' : 'T12:00:00'));
          if (d >= start && d <= end) total += Number(p.amount ?? 0);
        }
        spentByStint.set(stint.id, total);
      }
      const rows: StintRollover[] = stints.map((s, idx) => {
        const allocated = allocByStint.get(s.id) ?? 0;
        const spent = spentByStint.get(s.id) ?? 0;
        const status: 'active' | 'ended' = s.status === 'ended' ? 'ended' : 'active';
        const rolledOver = status === 'ended' ? allocated - spent : null;
        const rolloverPct =
          status === 'ended' && allocated > 0
            ? Math.round((rolledOver as number) / allocated * 100)
            : null;
        const range = `${formatDate(s.start_date)} → ${s.end_date ? formatDate(s.end_date) : 'Ongoing'}`;
        return {
          id: s.id,
          label: `Stint ${idx + 1} · ${range}`,
          status,
          allocated,
          spent,
          rolledOver,
          rolloverPct,
        };
      });
      setStintRollover(rows);
    })();
    return () => { cancelled = true; };
  }, [clientId, payments]);

  if (!campaign) return null;

  return (
    <div className="space-y-6">
      {/* ── Top row: 5-cell spend breakdown ── */}
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
          title="Phase 2 · Spend Funnel"
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

      {/* ── Rollover Summary by stint (collapsed by default) ─────────
          [2026-06-25] Per Andy: rows are stints, not segments. Allocated
          = sum of the stint's client_engagement_periods.amount.
          Spent   = this campaign's payments with payment_date inside
                    the stint window.
          Rollover only computed for ended stints (active = "—" since
          rollover crystallises at term close). */}
      <div>
        <SectionHeader
          id="rollover"
          title="Rollover Summary"
          subtitle={stintRollover && stintRollover.length > 0 ? `${stintRollover.length} stint${stintRollover.length === 1 ? '' : 's'}` : 'No stints'}
          expanded={openSections.has('rollover')}
          onToggle={() => toggleSection('rollover')}
        />
        {openSections.has('rollover') && (
          <Card id="budget-section-rollover" className="border-cream-200 mt-2">
            <CardContent className="p-4">
              <p className="text-[11px] text-ink-warm-500 italic mb-3">
                Per-stint view of allocated vs spent vs rolled forward. Allocated = sum of the stint&apos;s periods. Spent = this campaign&apos;s payments inside the stint window. Active stints show &quot;—&quot; for rollover until term close.
              </p>
              {stintRollover === null ? (
                <p className="text-xs text-ink-warm-400 italic">Loading stints…</p>
              ) : stintRollover.length === 0 ? (
                <p className="text-xs text-ink-warm-400 italic">No stints recorded for this client. Add one on the client&apos;s Engagement tab.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead className="border-b border-cream-100">
                      <tr className="text-left text-ink-warm-500">
                        <th className="py-1.5 pr-3 font-medium">Stint</th>
                        <th className="py-1.5 pr-3 font-medium text-right">Allocated</th>
                        <th className="py-1.5 pr-3 font-medium text-right">Spent</th>
                        <th className="py-1.5 pr-3 font-medium text-right">Rolled over</th>
                        <th className="py-1.5 font-medium text-right">Rollover %</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {stintRollover.map((row) => (
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
