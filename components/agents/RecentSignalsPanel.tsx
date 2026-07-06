'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ExternalLink, RefreshCw, Loader2, Trash2, Radar, Twitter,
  Activity, Download,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatRelativeShort } from '@/lib/dateFormat';

/**
 * The daily-review surface for Grok Deep Dive signals. Shows every Grok
 * signal across all prospects in reverse-chronological order so you can
 * triage in one place instead of expanding 30 rows.
 *
 * Data flow:
 *   GET /api/prospects/signals/recent?days=7&min_score=0
 *   DELETE /api/prospects/signals/[id]  (soft delete, same as Discovery)
 */

interface RecentSignal {
  id: string;
  prospect_id: string;
  project_name: string;
  project_symbol: string | null;
  action_tier: string | null;
  prospect_status: string | null;
  signal_type: string;
  headline: string;
  snippet: string | null;
  source_url: string | null;
  source_name: string;
  relevancy_weight: number | null;
  detected_at: string;
  expires_at: string | null;
  korea_interest_score: number | null;
  poc_handle: string | null;
  poc_name: string | null;
  poc_role: string | null;
  finding_type: string | null;
  tweet_date: string | null;
}

// v11: action_tier rendered via StatusBadge. Tones picked to match the
// urgency hierarchy: REACH_OUT_NOW=danger (rose), PRE_TOKEN_PRIORITY=warning
// (amber), RESEARCH=info (sky), WATCH=brand (teal — "watchlist active"),
// NURTURE=neutral (grey), SKIP=slate (de-emphasized + strikethrough).
const ACTION_TIER_STYLE: Record<string, { label: string; tone: BadgeTone; strike?: boolean }> = {
  REACH_OUT_NOW:       { label: 'REACH OUT NOW',      tone: 'danger' },
  PRE_TOKEN_PRIORITY:  { label: 'PRE-TOKEN PRIORITY', tone: 'warning' },
  RESEARCH:            { label: 'RESEARCH',           tone: 'info' },
  WATCH:               { label: 'WATCH',              tone: 'brand' },
  NURTURE:             { label: 'NURTURE',            tone: 'neutral' },
  SKIP:                { label: 'SKIP',               tone: 'slate', strike: true },
};

function formatSignalType(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function timeAgo(iso: string | null | undefined): string {
  return iso ? formatRelativeShort(iso) : '';
}

type GroupMode = 'project' | 'poc';

export default function RecentSignalsPanel() {
  const { toast } = useToast();
  const [signals, setSignals] = useState<RecentSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<1 | 7 | 30 | 90>(7);
  const [minScore, setMinScore] = useState<0 | 40 | 70>(0);
  const [groupMode, setGroupMode] = useState<GroupMode>('project');
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  /** Client-side CSV export of the currently-filtered signals. Browsers
   *  handle the download via URL.createObjectURL — no server roundtrip. */
  const exportToCsv = () => {
    if (signals.length === 0) {
      toast({ title: 'Nothing to export', description: 'No signals in the current view.' });
      return;
    }
    const cols = [
      'detected_at', 'project_name', 'project_symbol', 'action_tier',
      'signal_type', 'finding_type', 'poc_handle', 'poc_name', 'poc_role',
      'korea_interest_score', 'relevancy_weight', 'tweet_date',
      'headline', 'snippet', 'source_url',
    ];
    const escape = (v: unknown): string => {
      if (v == null) return '';
      const s = String(v);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [cols.join(',')];
    for (const s of signals) {
      lines.push(cols.map(c => escape((s as any)[c])).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `grok-signals-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: 'Exported', description: `${signals.length} signals downloaded as CSV.` });
  };

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/prospects/signals/recent?days=${days}&min_score=${minScore}&limit=200`);
      const data = await res.json();
      if (!res.ok || data.error) {
        toast({ title: 'Load failed', description: data.error || 'Unknown error', variant: 'destructive' });
        setSignals([]);
      } else {
        setSignals(data.signals || []);
      }
    } catch (err: any) {
      toast({ title: 'Load failed', description: err?.message ?? 'Failed to load', variant: 'destructive' });
      setSignals([]);
    } finally {
      setLoading(false);
    }
  }, [days, minScore, toast]);

  useEffect(() => { fetchSignals(); }, [fetchSignals]);

  const deleteSignal = async (signalId: string, headline: string) => {
    const ok = window.confirm(`Delete this signal?\n\n"${headline}"`);
    if (!ok) return;
    setDeletingIds(prev => { const n = new Set(prev); n.add(signalId); return n; });
    try {
      const res = await fetch(`/api/prospects/signals/${signalId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast({ title: 'Delete failed', description: data.error || 'Unknown error', variant: 'destructive' });
        return;
      }
      toast({ title: 'Signal deleted', description: 'Marked inactive.' });
      // Optimistic UI: remove from list immediately
      setSignals(prev => prev.filter(s => s.id !== signalId));
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err?.message ?? 'Delete failed', variant: 'destructive' });
    } finally {
      setDeletingIds(prev => { const n = new Set(prev); n.delete(signalId); return n; });
    }
  };

  // Build both group structures — 'project' groups all signals per project,
  // 'poc' groups per @handle across projects. Either way we show a header
  // card with the group's identity and list the signals inside, sorted
  // most-recent-first within each group.
  type Group = {
    key: string;                       // groupMode: prospect_id or poc_handle
    project_name: string | null;       // null when grouping by POC with signals on multiple projects
    project_symbol: string | null;
    action_tier: string | null;
    prospect_id: string;
    poc_handle: string | null;
    poc_name: string | null;
    signals: RecentSignal[];
  };
  const groups: Record<string, Group> = {};
  for (const s of signals) {
    const key = groupMode === 'project'
      ? s.prospect_id
      : (s.poc_handle || 'unknown');
    if (!groups[key]) {
      groups[key] = {
        key,
        // For project grouping, the project name is stable; for POC grouping,
        // we may see the same POC across multiple projects — use the first
        // one seen (most recent) and show others as sub-context per signal.
        project_name: groupMode === 'project' ? s.project_name : null,
        project_symbol: groupMode === 'project' ? s.project_symbol : null,
        action_tier: groupMode === 'project' ? s.action_tier : null,
        prospect_id: s.prospect_id,
        poc_handle: s.poc_handle,
        poc_name: s.poc_name,
        signals: [],
      };
    }
    groups[key].signals.push(s);
  }
  // Sort groups by most recent signal within each group.
  const orderedGroups = Object.values(groups).sort((a, b) => {
    const aT = new Date(a.signals[0]?.detected_at || 0).getTime();
    const bT = new Date(b.signals[0]?.detected_at || 0).getTime();
    return bT - aT;
  });
  const projectGroups = orderedGroups; // back-compat name used in JSX below

  return (
    <div className="space-y-4 pb-8">
      {/* Description + controls */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-sm text-ink-warm-700 max-w-2xl">
          All Grok Deep Dive signals across every prospect, newest first. The one-stop
          surface for daily triage — read the tweet, open the prospect if actionable,
          or delete the signal if it's noise.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={exportToCsv}
            disabled={loading || signals.length === 0}
            className="h-9"
            title="Download the filtered list as CSV"
          >
            <Download className="w-4 h-4 mr-1.5" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchSignals}
            disabled={loading}
            className="h-9"
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <Label htmlFor="window" className="text-xs">Window</Label>
          <Select value={String(days)} onValueChange={v => setDays(Number(v) as 1 | 7 | 30 | 90)}>
            <SelectTrigger id="window" className="w-40 h-9 mt-1 focus-brand">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24 hours</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="min-score" className="text-xs">Min Korea interest score</Label>
          <Select value={String(minScore)} onValueChange={v => setMinScore(Number(v) as 0 | 40 | 70)}>
            <SelectTrigger id="min-score" className="w-48 h-9 mt-1 focus-brand">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Any score</SelectItem>
              <SelectItem value="40">≥ 40 (warm / borderline)</SelectItem>
              <SelectItem value="70">≥ 70 (Grok-hot only)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="group-by" className="text-xs">Group by</Label>
          <Select value={groupMode} onValueChange={v => setGroupMode(v as GroupMode)}>
            <SelectTrigger id="group-by" className="w-40 h-9 mt-1 focus-brand">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="project">Project</SelectItem>
              <SelectItem value="poc">POC (X handle)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary counts — render a thin skeleton row on initial
          load so the spot between filters and the list doesn't go
          empty (matches the always-rendered KPI row in Discovery /
          KR Exchanges, just compressed since Signals doesn't carry
          full KpiCards). 2026-06-03. */}
      {loading ? (
        <div className="flex items-center gap-3">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-32" />
        </div>
      ) : signals.length > 0 ? (
        <div className="flex items-center gap-4 text-xs text-ink-warm-700">
          <span className="font-semibold text-ink-warm-900">{signals.length}</span>
          <span>signals · {projectGroups.length} projects</span>
          <span className="text-ink-warm-400">·</span>
          <span>
            {signals.filter(s => s.signal_type === 'poc_korea_mention').length} Korea mentions
          </span>
          <span className="text-ink-warm-400">·</span>
          <span>
            {signals.filter(s => s.signal_type === 'poc_asia_mention').length} Asia mentions
          </span>
        </div>
      ) : null}

      {/* List */}
      {loading ? (
        // Structural skeleton — mirrors the group-card shape so the
        // layout doesn't shift when data arrives. Each block represents
        // one group: header (badge + project name + meta) + 2 signal
        // rows. Five blocks matches a typical 7-day Korea/Asia signal
        // batch.
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-cream-100">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-14 rounded-full" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                  <Skeleton className="h-3 w-24" />
                </div>
                <div className="space-y-1.5">
                  <Skeleton className="h-12 w-full rounded" />
                  <Skeleton className="h-12 w-full rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : signals.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No signals in this window"
          description="Run Deep Dive on some prospects in the Discovery tab to populate this feed. With 0 min score, expect signals the moment any POC's timeline lands a Korea / Asia finding."
        />
      ) : (
        <div className="space-y-3">
          {projectGroups.map(g => (
            <Card key={g.key} className="overflow-hidden">
              <CardContent className="p-3">
                {/* Group header — shape depends on groupMode */}
                <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-cream-100">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    {groupMode === 'project' ? (
                      <>
                        <span className="font-semibold text-ink-warm-900 truncate">{g.project_name}</span>
                        {g.project_symbol && (
                          <span className="text-xs text-ink-warm-500 font-mono">{g.project_symbol}</span>
                        )}
                        {g.action_tier && ACTION_TIER_STYLE[g.action_tier] && (
                          <StatusBadge
                            tone={ACTION_TIER_STYLE[g.action_tier].tone}
                            size="sm"
                            className={ACTION_TIER_STYLE[g.action_tier].strike ? 'line-through' : ''}
                          >
                            {ACTION_TIER_STYLE[g.action_tier].label}
                          </StatusBadge>
                        )}
                      </>
                    ) : (
                      <>
                        <a
                          href={g.poc_handle ? `https://x.com/${g.poc_handle}` : '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-ink-warm-900 hover:text-[#1DA1F2] flex items-center gap-1"
                        >
                          <Twitter className="h-3.5 w-3.5" />
                          @{g.poc_handle || 'unknown'}
                        </a>
                        {g.poc_name && (
                          <span className="text-xs text-ink-warm-700">· {g.poc_name}</span>
                        )}
                        {(() => {
                          const uniqueProjects = new Set(g.signals.map(s => s.prospect_id)).size;
                          return (
                            <span className="text-[10px] text-ink-warm-500">
                              {uniqueProjects} project{uniqueProjects !== 1 ? 's' : ''}
                            </span>
                          );
                        })()}
                      </>
                    )}
                    <span className="text-[10px] text-ink-warm-500">
                      {g.signals.length} signal{g.signals.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {/* Max Korea score across this group's signals */}
                  {(() => {
                    const maxScore = Math.max(
                      ...g.signals.map(s => s.korea_interest_score ?? 0),
                    );
                    if (!Number.isFinite(maxScore) || maxScore <= 0) return null;
                    return (
                      <span
                        className={`text-xs font-semibold tabular-nums ${
                          maxScore >= 70 ? 'text-emerald-700' :
                          maxScore >= 40 ? 'text-amber-700' :
                          'text-ink-warm-700'
                        }`}
                      >
                        Korea score: {maxScore}
                      </span>
                    );
                  })()}
                </div>

                {/* Signals within this project */}
                <div className="space-y-1.5">
                  {g.signals.map(s => {
                    const isDeleting = deletingIds.has(s.id);
                    return (
                      <div
                        key={s.id}
                        className={`flex items-start gap-2 text-xs py-1.5 px-2 rounded border border-violet-200 bg-violet-50/30 transition-opacity ${
                          isDeleting ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <Badge variant="outline" className="text-[10px] pointer-events-none">
                              {formatSignalType(s.signal_type)}
                            </Badge>
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 pointer-events-none">
                              <Radar className="h-2.5 w-2.5" />
                              GROK
                            </span>
                            {s.poc_handle && (
                              <a
                                href={`https://x.com/${s.poc_handle}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-ink-warm-700 hover:text-[#1DA1F2] flex items-center gap-0.5"
                                title={`X: @${s.poc_handle}`}
                              >
                                <Twitter className="h-2.5 w-2.5" />
                                @{s.poc_handle}
                              </a>
                            )}
                            {s.relevancy_weight && (
                              <span className="text-[10px] text-ink-warm-500">w:{s.relevancy_weight}</span>
                            )}
                            <span className="text-[10px] text-ink-warm-400">
                              · {timeAgo(s.detected_at)}
                            </span>
                            {groupMode === 'poc' && (
                              <span className="text-[10px] text-ink-warm-700">
                                · <span className="font-medium">{s.project_name}</span>
                                {s.action_tier && ACTION_TIER_STYLE[s.action_tier] && (
                                  <StatusBadge
                                    tone={ACTION_TIER_STYLE[s.action_tier].tone}
                                    size="sm"
                                    className={`ml-1 ${ACTION_TIER_STYLE[s.action_tier].strike ? 'line-through' : ''}`}
                                  >
                                    {ACTION_TIER_STYLE[s.action_tier].label}
                                  </StatusBadge>
                                )}
                              </span>
                            )}
                          </div>
                          <div className="text-ink-warm-900 font-medium">{s.headline}</div>
                          {s.snippet && (
                            <p className="text-ink-warm-700 mt-0.5 line-clamp-2">{s.snippet}</p>
                          )}
                        </div>
                        <div className="flex items-start gap-0.5 shrink-0">
                          {s.source_url && (
                            <a
                              href={s.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-ink-warm-400 hover:text-ink-warm-700 p-0.5"
                              title="View source tweet"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteSignal(s.id, s.headline)}
                            disabled={isDeleting}
                            className="text-ink-warm-400 hover:text-rose-600 p-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete signal"
                            aria-label="Delete signal"
                          >
                            {isDeleting
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
