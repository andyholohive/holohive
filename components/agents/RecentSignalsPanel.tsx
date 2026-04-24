'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ExternalLink, RefreshCw, Loader2, Trash2, Radar, Twitter,
  AlertTriangle, Activity, Download,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

const ACTION_TIER_STYLE: Record<string, { label: string; className: string }> = {
  REACH_OUT_NOW:       { label: 'REACH OUT NOW',      className: 'bg-red-100 text-red-700 border-red-200' },
  PRE_TOKEN_PRIORITY:  { label: 'PRE-TOKEN PRIORITY', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  RESEARCH:            { label: 'RESEARCH',           className: 'bg-blue-100 text-blue-700 border-blue-200' },
  WATCH:               { label: 'WATCH',              className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  NURTURE:             { label: 'NURTURE',            className: 'bg-gray-100 text-gray-700 border-gray-200' },
  SKIP:                { label: 'SKIP',               className: 'bg-gray-50 text-gray-400 border-gray-200 line-through' },
};

function formatSignalType(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const mos = Math.floor(days / 30);
  return `${mos}mo ago`;
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
        toast({ title: 'Failed to load', description: data.error || 'Unknown error', variant: 'destructive' });
        setSignals([]);
      } else {
        setSignals(data.signals || []);
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message ?? 'Failed to load', variant: 'destructive' });
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
      toast({ title: 'Error', description: err?.message ?? 'Delete failed', variant: 'destructive' });
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
        <p className="text-sm text-gray-600 max-w-2xl">
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
            <SelectTrigger id="window" className="w-40 h-9 mt-1">
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
            <SelectTrigger id="min-score" className="w-48 h-9 mt-1">
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
            <SelectTrigger id="group-by" className="w-40 h-9 mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="project">Project</SelectItem>
              <SelectItem value="poc">POC (X handle)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary counts */}
      {!loading && signals.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-gray-600">
          <span className="font-semibold text-gray-900">{signals.length}</span>
          <span>signals · {projectGroups.length} projects</span>
          <span className="text-gray-400">·</span>
          <span>
            {signals.filter(s => s.signal_type === 'poc_korea_mention').length} Korea mentions
          </span>
          <span className="text-gray-400">·</span>
          <span>
            {signals.filter(s => s.signal_type === 'poc_asia_mention').length} Asia mentions
          </span>
        </div>
      )}

      {/* List */}
      {loading ? (
        <Card>
          <CardContent className="p-4 space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </CardContent>
        </Card>
      ) : signals.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-4">
              <Activity className="h-6 w-6 text-gray-500" />
            </div>
            <p className="text-gray-900 font-medium">No signals in this window</p>
            <p className="text-gray-500 text-sm mt-1 max-w-md mx-auto">
              Run Deep Dive on some prospects in the Discovery tab to populate this feed.
              With 0 min score, expect signals the moment any POC's timeline lands
              a Korea / Asia finding.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {projectGroups.map(g => (
            <Card key={g.key} className="overflow-hidden">
              <CardContent className="p-3">
                {/* Group header — shape depends on groupMode */}
                <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-gray-100">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    {groupMode === 'project' ? (
                      <>
                        <span className="font-semibold text-gray-900 truncate">{g.project_name}</span>
                        {g.project_symbol && (
                          <span className="text-xs text-gray-500 font-mono">{g.project_symbol}</span>
                        )}
                        {g.action_tier && (
                          <span
                            className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border pointer-events-none ${ACTION_TIER_STYLE[g.action_tier]?.className || ''}`}
                          >
                            {ACTION_TIER_STYLE[g.action_tier]?.label || g.action_tier}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <a
                          href={g.poc_handle ? `https://x.com/${g.poc_handle}` : '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-gray-900 hover:text-[#1DA1F2] flex items-center gap-1"
                        >
                          <Twitter className="h-3.5 w-3.5" />
                          @{g.poc_handle || 'unknown'}
                        </a>
                        {g.poc_name && (
                          <span className="text-xs text-gray-600">· {g.poc_name}</span>
                        )}
                        {(() => {
                          const uniqueProjects = new Set(g.signals.map(s => s.prospect_id)).size;
                          return (
                            <span className="text-[10px] text-gray-500">
                              {uniqueProjects} project{uniqueProjects !== 1 ? 's' : ''}
                            </span>
                          );
                        })()}
                      </>
                    )}
                    <span className="text-[10px] text-gray-500">
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
                          'text-gray-600'
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
                                className="text-[10px] text-gray-600 hover:text-[#1DA1F2] flex items-center gap-0.5"
                                title={`X: @${s.poc_handle}`}
                              >
                                <Twitter className="h-2.5 w-2.5" />
                                @{s.poc_handle}
                              </a>
                            )}
                            {s.relevancy_weight && (
                              <span className="text-[10px] text-gray-500">w:{s.relevancy_weight}</span>
                            )}
                            <span className="text-[10px] text-gray-400">
                              · {timeAgo(s.detected_at)}
                            </span>
                            {groupMode === 'poc' && (
                              <span className="text-[10px] text-gray-600">
                                · <span className="font-medium">{s.project_name}</span>
                                {s.action_tier && (
                                  <span
                                    className={`ml-1 inline-flex items-center text-[9px] font-bold px-1 py-0.5 rounded border pointer-events-none ${ACTION_TIER_STYLE[s.action_tier]?.className || ''}`}
                                  >
                                    {ACTION_TIER_STYLE[s.action_tier]?.label || s.action_tier}
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                          <div className="text-gray-900 font-medium">{s.headline}</div>
                          {s.snippet && (
                            <p className="text-gray-600 mt-0.5 line-clamp-2">{s.snippet}</p>
                          )}
                        </div>
                        <div className="flex items-start gap-0.5 shrink-0">
                          {s.source_url && (
                            <a
                              href={s.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-400 hover:text-gray-700 p-0.5"
                              title="View source tweet"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteSignal(s.id, s.headline)}
                            disabled={isDeleting}
                            className="text-gray-400 hover:text-red-600 p-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
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
