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

import { useMemo } from 'react';
import { DollarSign, TrendingUp, Activity, Receipt, Wallet, Eye, Heart, FileText, Gauge, Trophy } from 'lucide-react';
import { KpiCard } from '@/components/ui/kpi-card';
import { Card, CardContent } from '@/components/ui/card';
import { useCampaignDetail } from '@/contexts/CampaignDetailContext';
import { useAuth } from '@/contexts/AuthContext';

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n)}%`;
}

export function BudgetDashboardV2() {
  const { campaign, campaignKOLs, payments } = useCampaignDetail();
  const { userProfile } = useAuth();
  const isAdminOrOwner = userProfile?.role === 'super_admin' || userProfile?.role === 'admin';

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

      {/* ── Efficiency tile grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
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

      {/* ── Portfolio benchmark · placeholder until backfill exists ── */}
      <Card className="border-cream-200 border-dashed">
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

      {/* ── Phase 2 funnel placeholder ── */}
      <Card className="border-cream-200 border-dashed">
        <CardContent className="p-4">
          <p className="text-sm font-semibold text-ink-warm-900 mb-2">Phase 2 · Spend Funnel</p>
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

      {/* ── Rollover Summary · gated on Term records ── */}
      <Card className="border-cream-200">
        <CardContent className="p-4">
          <p className="text-sm font-semibold text-ink-warm-900 mb-2">Rollover Summary</p>
          <p className="text-[11px] text-ink-warm-500 italic mb-3">
            Per-segment view of allocated vs spent vs rolled forward at most recent renewal. Mid-term shows Remaining; rollover only computed at term close.
          </p>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead className="border-b border-cream-100">
                <tr className="text-left text-ink-warm-500">
                  <th className="py-1.5 pr-3 font-medium">Segment</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Allocated</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Spent</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Rolled over</th>
                  <th className="py-1.5 font-medium text-right">Rollover %</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {[
                  ['Content', null, totals.content, null, null],
                  ['Activation', null, totals.activation, null, null],
                  ['Expenses', null, totals.internal, null, null],
                  ['Total', totalBudget, totals.content + totals.activation + totals.internal, null, null],
                ].map(([label, alloc, spent, rolled, pct]) => (
                  <tr key={label as string} className="border-b border-cream-50">
                    <td className="py-1.5 pr-3 font-sans">{label as string}</td>
                    <td className="py-1.5 pr-3 text-right">{alloc !== null ? fmtMoney(alloc as number) : '—'}</td>
                    <td className="py-1.5 pr-3 text-right">{fmtMoney(spent as number)}</td>
                    <td className="py-1.5 pr-3 text-right text-ink-warm-400">{rolled !== null ? fmtMoney(rolled as number) : '—'}</td>
                    <td className="py-1.5 text-right text-ink-warm-400">{pct !== null ? `${pct}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
