'use client';

import React, { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft, ExternalLink, RefreshCw, Loader2, Twitter, Send, Globe,
  Radar, CheckCircle, XCircle, AlertTriangle, Clock, DollarSign,
  Activity,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/**
 * Full-page view of a single discovery prospect — all the data we have,
 * with a scan-run timeline that the expanded table row doesn't show.
 *
 * Route: /intelligence/discovery/[id]
 */

interface DetailResponse {
  prospect: any;
  signals: any[];
  runs: any[];
}

const ACTION_TIER_STYLE: Record<string, { label: string; className: string }> = {
  REACH_OUT_NOW:       { label: 'REACH OUT NOW',      className: 'bg-red-100 text-red-700 border-red-200' },
  PRE_TOKEN_PRIORITY:  { label: 'PRE-TOKEN PRIORITY', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  RESEARCH:            { label: 'RESEARCH',           className: 'bg-blue-100 text-blue-700 border-blue-200' },
  WATCH:               { label: 'WATCH',              className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  NURTURE:             { label: 'NURTURE',            className: 'bg-gray-100 text-gray-700 border-gray-200' },
  SKIP:                { label: 'SKIP',               className: 'bg-gray-50 text-gray-400 border-gray-200 line-through' },
};

const RUN_TYPE_LABEL: Record<string, string> = {
  grok_deep_dive: 'Deep Dive (Grok)',
  grok_poc_enrichment: 'Find POCs (Grok)',
  poc_enrichment: 'Find POCs (Claude)',
  discovery_scan: 'Discovery scan',
};

function formatSignalType(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatMoney(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
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

function twitterUrl(handle?: string): string | null {
  if (!handle) return null;
  if (handle.startsWith('http')) return handle;
  const clean = handle.replace(/^@/, '').trim();
  if (!clean) return null;
  return `https://x.com/${clean}`;
}
function telegramUrl(handle?: string): string | null {
  if (!handle) return null;
  if (handle.startsWith('http')) return handle;
  const clean = handle.replace(/^@/, '').trim();
  if (!clean) return null;
  return `https://t.me/${clean}`;
}

export default function ProspectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/prospects/discovery/${id}`);
      const d = await res.json();
      if (!res.ok || d.error) {
        toast({ title: 'Failed to load', description: d.error || 'Unknown error', variant: 'destructive' });
        setData(null);
      } else {
        setData(d);
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message ?? 'Failed to load', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-900 font-medium">Prospect not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go back
        </Button>
      </div>
    );
  }

  const p = data.prospect;
  const signals = data.signals || [];
  const runs = data.runs || [];
  const grokSignals = signals.filter((s: any) => s.source_name === 'grok_x_deep_scan');
  const claudeSignals = signals.filter((s: any) => s.source_name === 'discovery_claude');
  const maxKoreaScore = Math.max(0, ...grokSignals.map((s: any) => Number(s.metadata?.korea_interest_score) || 0));
  const totalRunCost = runs.reduce((sum: number, r: any) => sum + (Number(r.output_summary?.cost_usd) || 0), 0);

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/intelligence')}
            className="h-9 shrink-0"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-bold text-gray-900 truncate">{p.name}</h2>
              {p.symbol && <span className="text-sm text-gray-500 font-mono">{p.symbol}</span>}
              {p.discovery_action_tier && (
                <span
                  className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border pointer-events-none ${ACTION_TIER_STYLE[p.discovery_action_tier]?.className || ''}`}
                >
                  {ACTION_TIER_STYLE[p.discovery_action_tier]?.label || p.discovery_action_tier}
                </span>
              )}
              {maxKoreaScore >= 70 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 border border-violet-200 pointer-events-none">
                  <Radar className="h-2.5 w-2.5" />
                  GROK-HOT {maxKoreaScore}
                </span>
              )}
            </div>
            <p className="text-gray-600 text-sm mt-0.5">
              {p.category || 'Uncategorized'} · Status: <span className="font-medium">{p.status.replace('_', ' ')}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={fetchDetail} disabled={loading} className="h-9">
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Score</div>
            <div className="text-2xl font-bold text-gray-900 tabular-nums">
              {p.prospect_score?.total ?? '—'}
              <span className="text-sm text-gray-400 font-normal">/100</span>
            </div>
            {p.prospect_score && (
              <div className="text-[10px] text-gray-500 mt-0.5">
                {p.prospect_score.icp_fit} + {p.prospect_score.signal_strength} + {p.prospect_score.timing}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Funding</div>
            <div className="text-2xl font-bold text-gray-900">
              {formatMoney(p.funding?.amount_usd)}
            </div>
            {p.funding?.round && (
              <div className="text-[10px] text-gray-500 mt-0.5">{p.funding.round}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Triggers</div>
            <div className="text-2xl font-bold text-gray-900 tabular-nums">{signals.length}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              {grokSignals.length} Grok · {claudeSignals.length} Claude
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Scan history</div>
            <div className="text-2xl font-bold text-gray-900 tabular-nums">
              ${totalRunCost.toFixed(2)}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              {runs.length} run{runs.length !== 1 ? 's' : ''} recorded
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Links row */}
      {(p.website_url || p.twitter_url || p.telegram_url || p.source_url) && (
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-4 flex-wrap text-sm">
              {p.website_url && (
                <a href={p.website_url} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-gray-900 flex items-center gap-1">
                  <Globe className="h-3.5 w-3.5" /> Website
                </a>
              )}
              {p.twitter_url && (
                <a href={p.twitter_url} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-[#1DA1F2] flex items-center gap-1">
                  <Twitter className="h-3.5 w-3.5" /> Project X
                </a>
              )}
              {p.telegram_url && (
                <a href={p.telegram_url} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-[#229ED9] flex items-center gap-1">
                  <Send className="h-3.5 w-3.5" /> Community TG
                </a>
              )}
              {p.source_url && (
                <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-gray-900 flex items-center gap-1 ml-auto text-xs">
                  <ExternalLink className="h-3 w-3" /> View on DropsTab
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fit reasoning + ICP checks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold text-gray-800 mb-2 text-sm">Why they're a fit</h3>
            {p.fit_reasoning ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{p.fit_reasoning}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">No reasoning recorded yet.</p>
            )}
            {p.disqualification_reason && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded p-2 text-xs">
                <div className="font-semibold text-red-700 mb-0.5">Disqualified</div>
                <div className="text-red-700">{p.disqualification_reason}</div>
              </div>
            )}
            {p.consideration_reason && !p.disqualification_reason && (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded p-2 text-xs">
                <div className="font-semibold text-amber-700 mb-0.5">Why consider</div>
                <div className="text-amber-700">{p.consideration_reason}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold text-gray-800 mb-2 text-sm">ICP checklist</h3>
            {p.icp_checks ? (
              <div className="space-y-1.5">
                {Object.entries(p.icp_checks).map(([key, raw]) => {
                  const check = raw as { pass: boolean; evidence: string };
                  const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                  return (
                    <div key={key} className="flex items-start gap-2 text-xs">
                      {check.pass ? (
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium ${check.pass ? 'text-gray-900' : 'text-red-700'}`}>{label}</div>
                        <div className="text-gray-600 text-[11px]">{check.evidence}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No ICP checks recorded.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* POCs */}
      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold text-gray-800 mb-2 text-sm">
            Outreach POCs ({(p.outreach_contacts || []).length})
          </h3>
          {!p.outreach_contacts || p.outreach_contacts.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No POCs found yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {p.outreach_contacts.map((c: any, i: number) => (
                <div
                  key={i}
                  className={`border rounded-lg p-2.5 text-xs ${
                    c.is_grok_sourced ? 'bg-amber-50 border-amber-200' : 'bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{c.name}</span>
                    {c.confidence && (
                      <span className={`text-[9px] font-semibold px-1 py-0.5 rounded pointer-events-none ${
                        c.confidence === 'high' ? 'bg-emerald-100 text-emerald-700' :
                        c.confidence === 'medium' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {c.confidence}
                      </span>
                    )}
                    {c.is_grok_sourced && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 pointer-events-none">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        UNVERIFIED
                      </span>
                    )}
                  </div>
                  <div className="text-gray-500 text-[11px] mt-0.5">{c.role}</div>
                  {c.notes && <p className="text-gray-600 text-[11px] mt-1">{c.notes}</p>}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {twitterUrl(c.twitter_handle) && (
                      <a href={twitterUrl(c.twitter_handle)!} target="_blank" rel="noopener noreferrer" className="text-[11px] text-gray-600 hover:text-[#1DA1F2] flex items-center gap-1">
                        <Twitter className="h-3 w-3" />
                        {c.twitter_handle?.replace(/^https?:\/\/[^/]+\//, '@').replace(/^@@/, '@')}
                      </a>
                    )}
                    {telegramUrl(c.telegram_handle) ? (
                      <a href={telegramUrl(c.telegram_handle)!} target="_blank" rel="noopener noreferrer" className="text-[11px] text-gray-600 hover:text-[#229ED9] flex items-center gap-1">
                        <Send className="h-3 w-3" />
                        {c.telegram_handle?.replace(/^https?:\/\/[^/]+\//, '@').replace(/^@@/, '@')}
                      </a>
                    ) : (
                      <span className="text-[10px] text-amber-600 italic">No TG</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-gray-500 mt-2 italic">
            To add / verify / deep-dive individual POCs, go back to the Discovery tab and use the row's action buttons.
          </p>
        </CardContent>
      </Card>

      {/* Scan-run timeline */}
      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold text-gray-800 mb-3 text-sm flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-gray-500" />
            Scan history ({runs.length})
          </h3>
          {runs.length === 0 ? (
            <p className="text-sm text-gray-500 italic">
              No recorded runs for this prospect yet. Older runs may not appear —
              attribution only started when input_params was populated.
            </p>
          ) : (
            <div className="space-y-2">
              {runs.map((r: any) => (
                <div key={r.id} className="border rounded-lg p-2.5 text-xs flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className={`text-[10px] pointer-events-none ${
                          r.run_type === 'grok_deep_dive' ? 'bg-violet-50 text-violet-700 border-violet-200' :
                          r.run_type?.includes('grok') ? 'bg-violet-50/50 text-violet-600 border-violet-100' :
                          ''
                        }`}
                      >
                        {RUN_TYPE_LABEL[r.run_type] || r.run_type}
                      </Badge>
                      <span className={`text-[10px] font-semibold ${
                        r.status === 'completed' ? 'text-emerald-700' :
                        r.status === 'failed' ? 'text-red-700' :
                        'text-gray-600'
                      }`}>
                        {r.status}
                      </span>
                      <span className="text-[10px] text-gray-500">· {timeAgo(r.started_at)}</span>
                    </div>
                    {r.output_summary && (
                      <div className="text-[11px] text-gray-600 mt-1 flex items-center gap-3 flex-wrap">
                        {typeof r.output_summary.pocs_scanned === 'number' && (
                          <span>{r.output_summary.pocs_scanned} POCs scanned</span>
                        )}
                        {typeof r.output_summary.signals_added === 'number' && (
                          <span>{r.output_summary.signals_added} signals added</span>
                        )}
                        {typeof r.output_summary.enriched === 'number' && (
                          <span>{r.output_summary.enriched} POCs enriched</span>
                        )}
                        {r.duration_ms && <span>· {Math.round(r.duration_ms / 1000)}s</span>}
                      </div>
                    )}
                    {r.error_message && (
                      <p className="text-[11px] text-red-600 mt-1">Error: {r.error_message}</p>
                    )}
                  </div>
                  {typeof r.output_summary?.cost_usd === 'number' && (
                    <div className="text-xs font-semibold text-gray-700 tabular-nums shrink-0">
                      ${r.output_summary.cost_usd.toFixed(2)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Signals */}
      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold text-gray-800 mb-3 text-sm flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-gray-500" />
            Triggers ({signals.length})
          </h3>
          {signals.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No active triggers for this prospect.</p>
          ) : (
            <div className="space-y-2">
              {signals.map((s: any) => (
                <div
                  key={s.id}
                  className={`border rounded-lg p-2.5 text-xs ${
                    s.source_name === 'grok_x_deep_scan' ? 'bg-violet-50/40 border-violet-200' : 'bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px] pointer-events-none">
                          {formatSignalType(s.signal_type)}
                        </Badge>
                        {s.source_name === 'grok_x_deep_scan' && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 pointer-events-none">
                            <Radar className="h-2.5 w-2.5" />
                            GROK
                          </span>
                        )}
                        {s.relevancy_weight && (
                          <span className="text-[10px] text-gray-500">w:{s.relevancy_weight}</span>
                        )}
                        <span className="text-[10px] text-gray-400">· {timeAgo(s.detected_at)}</span>
                      </div>
                      <div className="font-medium text-gray-900 mt-1">{s.headline}</div>
                      {s.snippet && <p className="text-gray-600 mt-0.5">{s.snippet}</p>}
                    </div>
                    {s.source_url && (
                      <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-700 shrink-0 p-0.5">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
