'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  BarChart3, TrendingUp, Users, DollarSign, Sparkles, AlertTriangle,
  RefreshCw, Loader2, Activity, Target, ArrowRight, Zap, Bell, Building2,
  MessageSquare, Calendar, FileText, Phone, StickyNote, Send,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/**
 * /analytics — Team analytics dashboard.
 *
 * Single-screen morning briefing for the BD + ops team. Reads
 * everything from /api/analytics/dashboard (one round-trip).
 *
 * Sections:
 *   1. KPI strip — top-of-page summary numbers
 *   2. Pipeline distribution — by canonical pipeline + by stage
 *   3. Discovery funnel — Discovery → CRM conversion in window
 *   4. Owner workload — per-team-member open opps + stale + last activity
 *   5. Recent activity — last N CRM activities across the team
 *   6. Health alerts — quick callouts (stale CRM, unpaid, etc.)
 *
 * Window selector at top defaults to 7 days. Most metrics that don't
 * make sense over a window (e.g. total active pipeline) ignore it.
 */

interface DashboardData {
  generated_at: string;
  window_days: number;
  kpis: {
    pipeline_value: number;
    active_opportunities: number;
    total_opportunities: number;
    prospects_in_window: number;
    promoted_in_window: number;
    active_campaigns: number;
    campaign_budget_total: number;
    intelligence_cost: number;
    intelligence_runs: number;
    intelligence_failed: number;
  };
  stages: { stage: string; count: number; value: number }[];
  pipelines: { label: string; count: number; value: number }[];
  discovery_funnel: {
    discovered: number;
    reviewed: number;
    promoted: number;
    active_in_crm: number;
    won: number;
    tiers: Record<string, number>;
  };
  owners: {
    id: string;
    name: string;
    email: string | null;
    open_opps: number;
    stale_opps: number;
    pipeline_value: number;
    last_activity_at: string | null;
  }[];
  recent_activity: {
    id: string;
    type: string;
    title: string;
    opportunity_name: string | null;
    owner_name: string | null;
    created_at: string;
  }[];
  alerts: {
    stale_crm: number;
    unpaid_payments: number;
    unpaid_value: number;
    new_kols_no_gc: number;
    content_no_metrics: number;
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────

const fmtMoney = (n: number): string => {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
};

const fmtNum = (n: number): string => {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
};

const relTime = (iso: string | null): string => {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
};

const ACTIVITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  call: Phone,
  meeting: Calendar,
  message: MessageSquare,
  proposal: FileText,
  note: StickyNote,
  bump: Zap,
  email: Send,
};

// ─── Components ─────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = 'gray',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  accent?: 'gray' | 'brand' | 'emerald' | 'amber' | 'rose' | 'sky';
}) {
  const accents: Record<string, string> = {
    gray: 'bg-gray-50 text-gray-600',
    brand: 'bg-[#3e8692]/10 text-[#3e8692]',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
    sky: 'bg-sky-50 text-sky-700',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
        </div>
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${accents[accent]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function PipelineBar({ label, count, value, max }: { label: string; count: number; value: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-xs text-gray-500 tabular-nums">
          <span className="font-semibold text-gray-900">{fmtNum(count)}</span>
          {value > 0 && <span className="ml-2 text-gray-400">{fmtMoney(value)}</span>}
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full bg-[#3e8692] rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function FunnelStep({
  label,
  count,
  total,
  isFirst = false,
  isLast = false,
  color = 'sky',
}: {
  label: string;
  count: number;
  total: number;
  isFirst?: boolean;
  isLast?: boolean;
  color?: 'sky' | 'purple' | 'amber' | 'emerald';
}) {
  const colors: Record<string, string> = {
    sky: 'bg-sky-50 text-sky-700 border-sky-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className={`flex-1 rounded-lg border ${colors[color]} px-3 py-2.5 text-center`}>
        <div className="text-xs uppercase tracking-wider opacity-80">{label}</div>
        <div className="text-2xl font-bold tabular-nums mt-0.5">{fmtNum(count)}</div>
        {!isFirst && (
          <div className="text-[10px] opacity-70 mt-0.5">{pct}% of source</div>
        )}
      </div>
      {!isLast && <ArrowRight className="h-4 w-4 text-gray-300 shrink-0" />}
    </div>
  );
}

function AlertCard({
  icon: Icon,
  label,
  count,
  detail,
  href,
  variant = 'neutral',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  detail?: string;
  href?: string;
  variant?: 'neutral' | 'warn' | 'danger';
}) {
  const variants = {
    neutral: 'border-gray-200 bg-white hover:bg-gray-50',
    warn: 'border-amber-200 bg-amber-50 hover:bg-amber-100',
    danger: 'border-rose-200 bg-rose-50 hover:bg-rose-100',
  };
  const iconColors = {
    neutral: 'text-gray-500',
    warn: 'text-amber-600',
    danger: 'text-rose-600',
  };
  const content = (
    <div className={`rounded-xl border p-3 transition-colors ${variants[variant]}`}>
      <div className="flex items-start gap-2.5">
        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${iconColors[variant]}`} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-700">{label}</p>
          <p className="text-xl font-bold text-gray-900 mt-0.5 tabular-nums">{fmtNum(count)}</p>
          {detail && <p className="text-[11px] text-gray-500 mt-0.5">{detail}</p>}
        </div>
      </div>
    </div>
  );
  return href ? <a href={href} className="block">{content}</a> : content;
}

// ─── Page ───────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { toast } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [windowDays, setWindowDays] = useState<7 | 14 | 30 | 90>(7);

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch(`/api/analytics/dashboard?days=${windowDays}`);
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setData(json);
    } catch (err: any) {
      toast({ title: 'Failed to load dashboard', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowDays]);

  const maxPipelineCount = useMemo(() => {
    if (!data) return 0;
    return Math.max(...data.pipelines.map(p => p.count), 1);
  }, [data]);

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="h-9 bg-gray-100 rounded w-64 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-[#3e8692]" />
            Team Analytics
          </h2>
          <p className="text-gray-600 text-sm mt-0.5">
            Pipeline, Discovery, team workload, and health alerts at a glance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v) as 7 | 14 | 30 | 90)}>
            <SelectTrigger className="h-9 w-32 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => fetchData(true)}
            disabled={refreshing}
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={DollarSign}
          label="Active Pipeline"
          value={fmtMoney(data.kpis.pipeline_value)}
          sub={`${data.kpis.active_opportunities} active opps`}
          accent="brand"
        />
        <KpiCard
          icon={Sparkles}
          label={`Discovery (${windowDays}d)`}
          value={fmtNum(data.kpis.prospects_in_window)}
          sub={`${data.kpis.promoted_in_window} promoted`}
          accent="amber"
        />
        <KpiCard
          icon={Target}
          label="Active Campaigns"
          value={fmtNum(data.kpis.active_campaigns)}
          sub={`${fmtMoney(data.kpis.campaign_budget_total)} budget`}
          accent="emerald"
        />
        <KpiCard
          icon={TrendingUp}
          label={`Intelligence Cost (${windowDays}d)`}
          value={`$${data.kpis.intelligence_cost.toFixed(2)}`}
          sub={`${data.kpis.intelligence_runs} run${data.kpis.intelligence_runs === 1 ? '' : 's'}${data.kpis.intelligence_failed > 0 ? ` · ${data.kpis.intelligence_failed} failed` : ''}`}
          accent={data.kpis.intelligence_failed > 0 ? 'rose' : 'sky'}
        />
      </div>

      {/* Pipeline distribution */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Target className="h-4 w-4 text-[#3e8692]" />
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Pipeline Distribution</h3>
          <Badge variant="secondary" className="text-[10px]">{fmtNum(data.kpis.total_opportunities)} total</Badge>
        </div>
        <div className="space-y-3">
          {data.pipelines.map(p => (
            <PipelineBar key={p.label} label={p.label} count={p.count} value={p.value} max={maxPipelineCount} />
          ))}
        </div>
      </div>

      {/* Discovery funnel */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-600" />
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
              Discovery → CRM Funnel
            </h3>
            <Badge variant="secondary" className="text-[10px]">last {windowDays}d</Badge>
          </div>
          {/* Tier breakdown chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {Object.entries(data.discovery_funnel.tiers)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 4)
              .map(([tier, n]) => (
                <span
                  key={tier}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600"
                >
                  {tier}: <strong className="text-gray-900">{n}</strong>
                </span>
              ))}
          </div>
        </div>
        <div className="flex items-stretch gap-2">
          <FunnelStep label="Discovered" count={data.discovery_funnel.discovered} total={data.discovery_funnel.discovered} isFirst color="purple" />
          <FunnelStep label="Reviewed" count={data.discovery_funnel.reviewed} total={data.discovery_funnel.discovered} color="sky" />
          <FunnelStep label="Promoted" count={data.discovery_funnel.promoted} total={data.discovery_funnel.discovered} color="amber" />
          <FunnelStep label="Active in CRM" count={data.discovery_funnel.active_in_crm} total={data.discovery_funnel.discovered} color="emerald" />
          <FunnelStep label="Won" count={data.discovery_funnel.won} total={data.discovery_funnel.discovered} isLast color="emerald" />
        </div>
      </div>

      {/* Two-column: Owner workload + Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Owner workload */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-[#3e8692]" />
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Team Workload</h3>
          </div>
          {data.owners.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No owned opportunities.</p>
          ) : (
            <div className="space-y-2.5">
              {data.owners.slice(0, 8).map(o => (
                <div key={o.id} className="flex items-center justify-between gap-3 pb-2.5 border-b border-gray-100 last:border-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{o.name}</p>
                    <p className="text-[11px] text-gray-500">
                      Last activity: {relTime(o.last_activity_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900 tabular-nums">{o.open_opps}</p>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider">open</p>
                    </div>
                    {o.stale_opps > 0 && (
                      <div className="text-right">
                        <p className="text-sm font-semibold text-amber-600 tabular-nums">{o.stale_opps}</p>
                        <p className="text-[10px] text-amber-600 uppercase tracking-wider">stale</p>
                      </div>
                    )}
                    <div className="text-right min-w-[60px]">
                      <p className="text-sm font-semibold text-gray-900 tabular-nums">{fmtMoney(o.pipeline_value)}</p>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider">pipeline</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-[#3e8692]" />
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Recent Activity</h3>
            <Badge variant="secondary" className="text-[10px]">last {windowDays}d</Badge>
          </div>
          {data.recent_activity.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No activity in this window.</p>
          ) : (
            <div className="space-y-3">
              {data.recent_activity.slice(0, 12).map(a => {
                const Icon = ACTIVITY_ICONS[a.type] || StickyNote;
                return (
                  <div key={a.id} className="flex items-start gap-2.5">
                    <div className="h-7 w-7 rounded-md bg-gray-50 flex items-center justify-center shrink-0">
                      <Icon className="h-3.5 w-3.5 text-gray-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-900 leading-snug">
                        <span className="text-gray-500 capitalize">{a.type}</span>
                        {' on '}
                        <span className="font-medium">{a.opportunity_name || 'unknown'}</span>
                        {a.title && (
                          <>
                            <span className="text-gray-400">: </span>
                            <span className="text-gray-700">{a.title}</span>
                          </>
                        )}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {a.owner_name || 'Unknown'} · {relTime(a.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Health alerts */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="h-4 w-4 text-[#3e8692]" />
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Health Alerts</h3>
          <p className="text-[11px] text-gray-500 ml-1">Counts that probably need attention</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <AlertCard
            icon={AlertTriangle}
            label="Stale CRM (≥7d)"
            count={data.alerts.stale_crm}
            detail="Active opps, no recent contact"
            href="/crm/sales-pipeline"
            variant={data.alerts.stale_crm > 10 ? 'warn' : 'neutral'}
          />
          <AlertCard
            icon={DollarSign}
            label="Unpaid Payments"
            count={data.alerts.unpaid_payments}
            detail={`${fmtMoney(data.alerts.unpaid_value)} pending`}
            variant={data.alerts.unpaid_payments > 5 ? 'warn' : 'neutral'}
          />
          <AlertCard
            icon={Building2}
            label={`New KOLs no GC (${windowDays}d)`}
            count={data.alerts.new_kols_no_gc}
            detail="Group chat not connected"
            href="/kols"
            variant={data.alerts.new_kols_no_gc > 3 ? 'warn' : 'neutral'}
          />
          <AlertCard
            icon={FileText}
            label="Content Missing Metrics"
            count={data.alerts.content_no_metrics}
            detail="Published >7d ago"
            variant={data.alerts.content_no_metrics > 5 ? 'warn' : 'neutral'}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-[11px] text-gray-400 pt-2">
        Generated {relTime(data.generated_at)} · Window: last {data.window_days} day{data.window_days === 1 ? '' : 's'}
      </div>
    </div>
  );
}
