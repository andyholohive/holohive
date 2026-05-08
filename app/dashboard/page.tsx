'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCw, Loader2, Compass, AlertTriangle, ArrowRight, CheckCircle2,
  Users, Target, MessageCircleQuestion, Settings, Circle, Clock,
} from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { EmptyState } from '@/components/ui/empty-state';
import { KpiCard } from '@/components/ui/kpi-card';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';

/**
 * /dashboard — Priority Dashboard
 *
 * Company operating view: weekly KPIs, objectives, per-person time
 * allocation, client health, initiative health, cross-team coordination.
 * Backed by dashboard_snapshots (LLM-synthesized, refreshed weekly
 * Monday morning) + dashboard_self_reports (per-team-member check-ins
 * filled via /dashboard/check-in).
 *
 * Session 1 state (today): page renders the snapshot if it exists,
 * empty state otherwise. Stub refresh creates a placeholder. Session 2
 * will land the real LLM analyzer; the page renderer below already
 * handles the full payload schema so no UI changes will be needed.
 */

// Schema mirrors what the analyzer (Session 2) will produce.
type SnapshotPayload = {
  kpis?: {
    active_clients?: number;
    pipeline_count?: number;
    qualified_leads_per_week?: number;
    qualified_leads_target?: number;
    [key: string]: number | undefined;
  };
  objectives?: Array<{
    category?: string;
    title: string;
    description?: string;
    owners?: string[]; // user_ids
  }>;
  time_allocation?: Record<string, {
    role?: string;
    items: Array<{ name: string; pct: number }>;
    callout?: string;
  }>;
  client_health?: Array<{
    client: string;
    phase?: string;
    lead?: string;
    this_week?: string;
  }>;
  initiative_health?: Array<{
    name: string;
    status: string;
    owners?: string[];
  }>;
  coordination?: Array<{
    type: 'conflict' | 'handoff' | 'overlap';
    text: string;
    people?: string[];
  }>;
  _stub?: boolean;
  _stub_note?: string;
};

type SnapshotResponse = {
  week_of: string;
  snapshot: {
    id: string;
    week_of: string;
    generated_at: string;
    generation_method: 'cron' | 'manual';
    payload: SnapshotPayload;
    source_summary?: {
      stub?: boolean;
      self_reports_count?: number;
      chats_analyzed?: number;
      messages_analyzed?: number;
      truncated_messages?: number;
      team_members?: number;
      clients?: number;
      pipeline_opps?: number;
    };
    cost_usd?: number;
  } | null;
  is_fallback: boolean;
  self_reports: Array<{
    id: string;
    user_id: string;
    primary_focus: string[] | null;
    blockers: string | null;
    next_week: string | null;
    notes: string | null;
    responded_at: string | null;
    prompted_at?: string | null;
  }>;
  team_members: Array<{ id: string; name: string | null; email: string }>;
  available_weeks: string[];
};

// Returns Monday-of-this-week in YYYY-MM-DD (UTC). Used by the page
// to detect whether the user is viewing the current week or browsing
// history — refresh behavior differs.
function currentMondayUTC(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

// Format a YYYY-MM-DD as "Mon May 5" for display in the week selector.
function fmtWeekLabel(weekOf: string): string {
  const d = new Date(weekOf + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const COORD_TONE: Record<string, BadgeTone> = {
  conflict: 'danger',
  handoff:  'warning',
  overlap:  'info',
};

const OBJECTIVE_CATEGORY_TONE: Record<string, BadgeTone> = {
  Korea:    'success',
  Pipeline: 'info',
  Internal: 'warning',
  Client:   'brand',
};

function relTime(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

export default function DashboardPage() {
  const { toast } = useToast();
  const [data, setData] = useState<SnapshotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Which week the user is currently viewing. Defaults to "current"
  // (resolves to current Monday at fetch time). When the user picks
  // a historical week from the selector, we re-fetch with that value.
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);

  const fetchSnapshot = async (weekOf?: string | null) => {
    try {
      const url = weekOf ? `/api/dashboard/snapshot?week_of=${weekOf}` : '/api/dashboard/snapshot';
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
    } catch (err: any) {
      toast({ title: 'Failed to load dashboard', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSnapshot(selectedWeek); }, [selectedWeek]);

  // The current week — used to gate the Refresh button (refresh always
  // targets the current week; viewing historical weeks should not be
  // overwritten by a click on Refresh).
  const currentWeek = currentMondayUTC();
  const viewingCurrent = !selectedWeek || selectedWeek === currentWeek;

  const handleRefresh = async () => {
    if (!viewingCurrent) {
      toast({ title: 'Refresh only works for the current week', description: 'Switch to the current week to regenerate.', variant: 'destructive' });
      return;
    }
    setRefreshing(true);
    try {
      const res = await fetch('/api/dashboard/refresh', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
      toast({ title: 'Refreshed', description: 'Snapshot regenerated.' });
      // Re-fetch whatever week is currently selected (which by the
      // guard above is the current week).
      await fetchSnapshot(selectedWeek);
    } catch (err: any) {
      toast({ title: 'Refresh failed', description: err?.message, variant: 'destructive' });
    } finally {
      setRefreshing(false);
    }
  };

  // Map user_id → display name for renderers that show owner/people lists.
  const userMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of data?.team_members ?? []) m.set(u.id, u.name || u.email);
    return m;
  }, [data?.team_members]);

  // Per-section filter: focus on one team member. Filters time_allocation,
  // objectives (by owners), initiatives (by owners), coordination (by people).
  // null = show everyone.
  const [focusUserId, setFocusUserId] = useState<string | null>(null);

  const checkedInCount = data?.self_reports.filter(r => r.responded_at).length ?? 0;
  const teamSize = data?.team_members.length ?? 0;

  const payload = data?.snapshot?.payload;
  const isStub = payload?._stub === true;

  return (
    <div className="space-y-6">
      {/* Header — always renders immediately. */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Compass className="h-6 w-6 text-brand" />
            Priority Dashboard
          </h2>
          <p className="text-gray-600 text-sm mt-0.5">
            Weekly view of where the team is spending time, what's moving, and what needs attention.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Week selector — only renders when there's history to browse.
              Selecting a historical week disables Refresh (refresh always
              targets the current week). */}
          {data && data.available_weeks.length > 0 && (
            <Select
              value={selectedWeek ?? currentWeek}
              onValueChange={(v) => setSelectedWeek(v)}
            >
              <SelectTrigger className="h-9 w-44 text-xs focus-brand">
                <Clock className="h-3.5 w-3.5 mr-1.5 text-gray-500" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* Always offer the current week even if no snapshot
                    exists for it yet (so user can navigate back to "now"). */}
                {!data.available_weeks.includes(currentWeek) && (
                  <SelectItem value={currentWeek}>
                    {fmtWeekLabel(currentWeek)} (this week — no snapshot)
                  </SelectItem>
                )}
                {data.available_weeks.map(w => (
                  <SelectItem key={w} value={w}>
                    {fmtWeekLabel(w)}{w === currentWeek ? ' (this week)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button asChild variant="outline" size="sm" className="h-9">
            <Link href="/dashboard/check-in">
              <MessageCircleQuestion className="h-4 w-4 mr-1.5" />
              My check-in
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-9 px-2" title="Tag chats that feed the analyzer">
            <Link href="/dashboard/settings">
              <Settings className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={handleRefresh}
            disabled={refreshing || !viewingCurrent}
            title={viewingCurrent ? 'Regenerate this week\'s snapshot' : 'Refresh only works for the current week'}
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Snapshot meta strip — when was this generated, who checked in,
          and what data the analyzer had to work with. The source-summary
          counts let the team trust (or distrust) the snapshot at a glance. */}
      {data?.snapshot && (
        <div className="flex items-center gap-4 flex-wrap text-xs text-gray-500">
          <span>
            Snapshot for week of <span className="font-semibold text-gray-700">{data.snapshot.week_of}</span>
          </span>
          <span>·</span>
          <span>Generated {relTime(data.snapshot.generated_at)} ({data.snapshot.generation_method})</span>
          <span>·</span>
          <span>
            Check-ins: <span className="font-semibold text-gray-700">{checkedInCount}</span> / {teamSize}
          </span>
          {data.snapshot.source_summary?.messages_analyzed != null && (
            <>
              <span>·</span>
              <span>
                {data.snapshot.source_summary.messages_analyzed} msgs from {data.snapshot.source_summary.chats_analyzed ?? 0} chats
                {(data.snapshot.source_summary.truncated_messages ?? 0) > 0 && (
                  <span className="text-amber-600"> ({data.snapshot.source_summary.truncated_messages} truncated)</span>
                )}
              </span>
            </>
          )}
          {data.snapshot.cost_usd != null && data.snapshot.cost_usd > 0 && (
            <>
              <span>·</span>
              <span>${data.snapshot.cost_usd.toFixed(3)}</span>
            </>
          )}
          {data.is_fallback && (
            <Badge variant="secondary" className="text-[10px]">showing previous week</Badge>
          )}
          {isStub && (
            <Badge variant="secondary" className="bg-amber-50 text-amber-700 text-[10px]">
              stub data
            </Badge>
          )}
        </div>
      )}

      {/* Check-in roster — always renders when we have team members so
          the team can see at a glance who's submitted vs. waiting.
          Renders compactly so it doesn't dominate the page. */}
      {data && data.team_members.length > 0 && (
        <CheckInRoster
          teamMembers={data.team_members}
          selfReports={data.self_reports}
        />
      )}

      {/* Per-team-member focus filter. Only renders when there's a
          loaded snapshot — filtering an empty page is meaningless.
          Applies to objectives / time_allocation / initiatives /
          coordination. Client Health is per-client so it ignores this. */}
      {data?.snapshot && (data.team_members.length > 0) && (
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span>Focus on:</span>
          <Select
            value={focusUserId ?? '__all__'}
            onValueChange={(v) => setFocusUserId(v === '__all__' ? null : v)}
          >
            <SelectTrigger className="h-8 w-48 text-xs focus-brand">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Everyone</SelectItem>
              {data.team_members.map(u => (
                <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {focusUserId && (
            <button
              type="button"
              className="text-[11px] text-brand hover:underline ml-1"
              onClick={() => setFocusUserId(null)}
            >
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* Content. */}
      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-64" />
          <Skeleton className="h-48" />
        </div>
      ) : !data?.snapshot ? (
        <EmptyState
          icon={Compass}
          title="No dashboard snapshot yet."
          description="Click Refresh to generate the first snapshot, or wait for Monday morning's automatic refresh."
        >
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            className="hover:opacity-90"
            style={{ backgroundColor: '#3e8692', color: 'white' }}
          >
            {refreshing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Generate first snapshot
          </Button>
        </EmptyState>
      ) : (
        <>
          {/* KPI strip */}
          {payload?.kpis && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <KpiCard
                icon={Users}
                label="Active Clients"
                value={payload.kpis.active_clients ?? 0}
                accent="brand"
              />
              <KpiCard
                icon={Target}
                label="Pipeline"
                value={payload.kpis.pipeline_count ?? 0}
                accent="sky"
              />
              <KpiCard
                icon={CheckCircle2}
                label="Qualified Leads / wk"
                value={payload.kpis.qualified_leads_per_week ?? 0}
                sub={payload.kpis.qualified_leads_target ? `Target: ${payload.kpis.qualified_leads_target}` : undefined}
                accent="emerald"
              />
            </div>
          )}

          {/* This week's company objectives — filtered by focusUserId
              when set (only show objectives the focused user owns). */}
          {(() => {
            const objectives = (payload?.objectives ?? []).filter(o =>
              !focusUserId || (o.owners ?? []).includes(focusUserId)
            );
            if (objectives.length === 0) return null;
            return (
            <Section title="This Week's Company Objectives" icon={Target}>
              <div className="space-y-2">
                {objectives.map((obj, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="flex items-start gap-3 flex-wrap">
                      {obj.category && (
                        <StatusBadge tone={OBJECTIVE_CATEGORY_TONE[obj.category] ?? 'neutral'} size="sm">
                          {obj.category}
                        </StatusBadge>
                      )}
                      <div className="flex-1 min-w-[200px]">
                        <h4 className="text-sm font-semibold text-gray-900">{obj.title}</h4>
                        {obj.owners && obj.owners.length > 0 && (
                          <OwnerAvatars ids={obj.owners} userMap={userMap} className="mt-1.5" />
                        )}
                        {obj.description && (
                          <p className="text-xs text-gray-500 mt-2">{obj.description}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
            );
          })()}

          {/* Where everyone's time is going — filtered to one user when
              focusUserId is set. */}
          {(() => {
            const allocs = Object.entries(payload?.time_allocation ?? {})
              .filter(([userId]) => !focusUserId || userId === focusUserId);
            if (allocs.length === 0) return null;
            return (
            <Section title={focusUserId ? `${userMap.get(focusUserId) || 'User'}'s Time` : "Where Everyone's Time is Going This Week"} icon={Users}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {allocs.map(([userId, alloc]) => (
                  <div key={userId} className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Avatar name={userMap.get(userId) || userId} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{userMap.get(userId) || 'Unknown'}</p>
                        {alloc.role && <p className="text-[10px] text-gray-500 truncate">{alloc.role}</p>}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {alloc.items.map((item, i) => (
                        <AllocBar key={i} label={item.name} pct={item.pct} />
                      ))}
                    </div>
                    {alloc.callout && (
                      <div className="mt-3 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                        {alloc.callout}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
            );
          })()}

          {/* Coordination — filtered to items involving focusUserId. */}
          {(() => {
            const coords = (payload?.coordination ?? []).filter(c =>
              !focusUserId || (c.people ?? []).includes(focusUserId)
            );
            if (coords.length === 0) return null;
            return (
            <Section title="Coordination: Where Work Intersects" icon={ArrowRight}>
              <div className="space-y-2">
                {coords.map((c, i) => (
                  <div
                    key={i}
                    className={`rounded-lg border px-3 py-3 flex items-start gap-3 ${
                      c.type === 'conflict' ? 'border-rose-200 bg-rose-50/30' :
                      c.type === 'handoff'  ? 'border-amber-200 bg-amber-50/30' :
                      'border-sky-200 bg-sky-50/30'
                    }`}
                  >
                    <StatusBadge tone={COORD_TONE[c.type] ?? 'neutral'} size="sm">
                      {c.type[0].toUpperCase() + c.type.slice(1)}
                    </StatusBadge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">{c.text}</p>
                    </div>
                    {c.people && c.people.length > 0 && (
                      <OwnerAvatars ids={c.people} userMap={userMap} />
                    )}
                  </div>
                ))}
              </div>
            </Section>
            );
          })()}

          {/* Client Health */}
          {(payload?.client_health?.length ?? 0) > 0 && (
            <Section title="Client Health" icon={Users}>
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/80 text-xs text-gray-500 uppercase tracking-wider">
                      <th className="text-left py-2 px-4 font-semibold">Client</th>
                      <th className="text-left py-2 px-4 font-semibold">Phase</th>
                      <th className="text-left py-2 px-4 font-semibold">Lead</th>
                      <th className="text-left py-2 px-4 font-semibold">This week</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload!.client_health!.map((c, i) => (
                      <tr key={i} className="border-b border-gray-100 last:border-0">
                        <td className="py-3 px-4 font-medium text-gray-900">{c.client}</td>
                        <td className="py-3 px-4">{c.phase ? <Badge variant="secondary" className="text-xs">{c.phase}</Badge> : '—'}</td>
                        <td className="py-3 px-4 text-gray-700">{c.lead || '—'}</td>
                        <td className="py-3 px-4 text-gray-600 max-w-md">{c.this_week || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Initiative Health — filtered to items where focusUserId is
              listed as an owner. Schema allows owners to be either
              user_ids or display names, so we match against both forms. */}
          {(() => {
            const focusName = focusUserId ? userMap.get(focusUserId) : null;
            const inits = (payload?.initiative_health ?? []).filter(init => {
              if (!focusUserId) return true;
              const owners = init.owners ?? [];
              return owners.includes(focusUserId) || (focusName ? owners.includes(focusName) : false);
            });
            if (inits.length === 0) return null;
            return (
            <Section title="Initiative Health" icon={CheckCircle2}>
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {inits.map((init, i) => (
                      <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                        <td className="py-3 px-4 font-medium text-gray-900">{init.name}</td>
                        <td className="py-3 px-4 w-32 text-right">
                          <Badge variant="secondary" className={`text-xs ${initiativeStatusClass(init.status)}`}>
                            {init.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 w-40 text-right text-xs text-gray-500">
                          {init.owners && init.owners.length > 0 ? init.owners.map(id => userMap.get(id) || id).join(' + ') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
            );
          })()}

          {/* Empty body warning when payload is just the stub. */}
          {isStub && Object.keys(payload?.time_allocation ?? {}).length === 0 && (
            <EmptyState
              icon={AlertTriangle}
              title="Snapshot exists but the analyzer hasn't filled in the rich content yet."
              description="Session 2 wires up the LLM. Until then, only the basic KPIs above are populated."
            />
          )}
        </>
      )}
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────

function Section({
  title, icon: Icon, children,
}: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return (
    <div className="h-7 w-7 rounded-full bg-brand-light text-brand text-xs font-semibold flex items-center justify-center shrink-0">
      {initials}
    </div>
  );
}

function OwnerAvatars({ ids, userMap, className }: { ids: string[]; userMap: Map<string, string>; className?: string }) {
  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      {ids.map(id => (
        <span
          key={id}
          className="h-5 w-5 rounded-full bg-brand-light text-brand text-[9px] font-semibold flex items-center justify-center"
          title={userMap.get(id) || id}
        >
          {(userMap.get(id) || id).slice(0, 2).toUpperCase()}
        </span>
      ))}
    </div>
  );
}

function AllocBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="text-gray-700 truncate flex-1 max-w-[100px]">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-brand rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-gray-500 tabular-nums w-8 text-right">{pct}%</span>
    </div>
  );
}

/**
 * CheckInRoster — small visual roster showing each team member's
 * check-in status for the displayed week:
 *   ✓ green   = responded
 *   ○ amber   = prompted via Sunday DM but no response yet
 *   ○ gray    = no DM prompt (telegram_id missing or first time)
 *
 * Helps the manager see who hasn't filled out their check-in without
 * digging through the self_reports table.
 */
function CheckInRoster({
  teamMembers,
  selfReports,
}: {
  teamMembers: Array<{ id: string; name: string | null; email: string }>;
  selfReports: Array<{ user_id: string; responded_at: string | null; prompted_at?: string | null }>;
}) {
  const reportByUser = new Map(selfReports.map(r => [r.user_id, r]));
  const responded = teamMembers.filter(u => reportByUser.get(u.id)?.responded_at).length;
  const total = teamMembers.length;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
          Weekly check-ins
        </h3>
        <span className="text-[11px] text-gray-500 tabular-nums">
          <span className="font-semibold text-gray-800">{responded}</span> of {total} submitted
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {teamMembers.map(u => {
          const r = reportByUser.get(u.id);
          const status: 'responded' | 'prompted' | 'none' = r?.responded_at
            ? 'responded'
            : r?.prompted_at
              ? 'prompted'
              : 'none';
          const initials = (u.name || u.email).split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
          const displayName = u.name || u.email;
          return (
            <div
              key={u.id}
              title={
                status === 'responded' ? `${displayName} — submitted ${r!.responded_at ? new Date(r!.responded_at).toLocaleString() : ''}` :
                status === 'prompted'  ? `${displayName} — DM sent ${r!.prompted_at ? new Date(r!.prompted_at).toLocaleString() : ''}, awaiting response` :
                `${displayName} — not yet prompted (no telegram_id?)`
              }
              className={`relative inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full border text-[10px] ${
                status === 'responded' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                status === 'prompted'  ? 'bg-amber-50 border-amber-200 text-amber-800' :
                'bg-gray-50 border-gray-200 text-gray-500'
              }`}
            >
              <span className={`h-4 w-4 rounded-full text-[8px] font-semibold flex items-center justify-center ${
                status === 'responded' ? 'bg-emerald-200 text-emerald-900' :
                status === 'prompted'  ? 'bg-amber-200 text-amber-900' :
                'bg-gray-200 text-gray-700'
              }`}>
                {initials}
              </span>
              <span className="font-medium">{displayName}</span>
              {status === 'responded' && <CheckCircle2 className="h-3 w-3" />}
              {status === 'prompted' && <Circle className="h-3 w-3" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function initiativeStatusClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('blocked')) return 'bg-rose-100 text-rose-700';
  if (s.includes('stale')) return 'bg-amber-100 text-amber-700';
  if (s.includes('active') || s.includes('on track')) return 'bg-sky-100 text-sky-700';
  if (s.includes('done') || s.includes('complete')) return 'bg-emerald-100 text-emerald-700';
  return 'bg-gray-100 text-gray-700';
}
