'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { KpiCard } from '@/components/ui/kpi-card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Building2, Loader2, ExternalLink, RefreshCw, Play, TestTube2,
  CheckCircle, XCircle, Clock, AlertTriangle, Sparkles,
} from 'lucide-react';

interface Market {
  exchange: 'upbit' | 'bithumb';
  symbol: string;
  market_pair: string;
  quote_currency: string;
  korean_name: string | null;
  english_name: string | null;
  warning_flag: boolean;
  first_seen_at: string;
  listing_signal_fired_at: string | null;
  is_new: boolean;
}

interface DetectedListing {
  id: string;
  project_name: string;
  signal_type: 'korea_exchange_listing' | 'korea_exchange_delisting';
  exchange: string | null;
  market_pair: string | null;
  quote_currency: string | null;
  headline: string;
  snippet: string | null;
  source_url: string | null;
  relevancy_weight: number;
  detected_at: string;
  matched_prospect_id: string | null;
  agent_run_id: string | null;
}

interface DelistedMarket {
  exchange: string;
  symbol: string;
  market_pair: string;
  delisted_at: string;
}

interface AgentRun {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  output_summary: any;
  error_message: string | null;
}

interface Stats {
  total_markets: number;
  upbit: number;
  bithumb: number;
  new_last_7d: number;
  delisted_last_30d: number;
  total_scanner_signals: number;
}

// v11: exchange tones mapped to StatusBadge palette. Sky/info reads as
// the "neutral information" exchange; warning/amber reads as the
// "watch-out" exchange. (These are just visual labels — there's no
// real safety meaning, just two distinguishable tones.)
const EXCHANGE_TONE: Record<string, BadgeTone> = {
  upbit: 'info',
  bithumb: 'warning',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.round(diff / 86_400_000)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function exchangeMarketUrl(exchange: string, market_pair: string, symbol: string, quote: string): string {
  if (exchange === 'upbit') {
    return `https://upbit.com/exchange?code=CRIX.UPBIT.${market_pair}`;
  }
  return `https://www.bithumb.com/react/trade/order/${symbol}_${quote}`;
}

export default function ExchangeListingsPanel() {
  const { toast } = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [detected, setDetected] = useState<DetectedListing[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [delisted, setDelisted] = useState<DelistedMarket[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const [exchangeFilter, setExchangeFilter] = useState<'all' | 'upbit' | 'bithumb'>('all');
  const [showDelisted, setShowDelisted] = useState(false);

  const [simulateOpen, setSimulateOpen] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [lastSimulation, setLastSimulation] = useState<any>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/korean-exchanges', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setStats(data.stats);
      setDetected(data.detected_listings || []);
      setMarkets(data.recent_markets || []);
      setDelisted(data.delisted_markets || []);
      setRuns(data.recent_runs || []);
    } catch (err: any) {
      toast({ title: 'Load failed', description: err?.message ?? 'Failed to load', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await fetch('/api/korean-exchanges/run', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast({ title: 'Run failed', description: data.error ?? 'Unknown error', variant: 'destructive' });
      } else {
        toast({
          title: 'Run complete',
          description: `Markets: ${data.live_markets_total} · New listings: ${data.listing_signals_fired ?? 0} · Delistings: ${data.delisting_signals_fired ?? 0} · ${Math.round((data.duration_ms || 0) / 1000)}s`,
        });
      }
      fetchData();
    } catch (err: any) {
      toast({ title: 'Run failed', description: err?.message ?? 'Run failed', variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  const runSimulation = async () => {
    setSimulating(true);
    setLastSimulation(null);
    try {
      const res = await fetch('/api/korean-exchanges/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      setLastSimulation(data);
      if (!data.success) {
        toast({
          title: 'Simulation ran but signal check failed',
          description: data.run_error ?? 'See details in dialog',
          variant: 'destructive',
        });
      } else if (data.signal_captured) {
        toast({
          title: 'Simulation succeeded',
          description: `Pipeline fired a signal for ${data.target.symbol} · cleaned up`,
        });
      } else {
        toast({
          title: 'Simulation ran but no signal captured',
          description: 'The cron may not have processed the simulated removal as expected — check the details',
          variant: 'destructive',
        });
      }
      fetchData();
    } catch (err: any) {
      toast({ title: 'Simulation failed', description: err?.message ?? 'Simulation failed', variant: 'destructive' });
    } finally {
      setSimulating(false);
    }
  };

  const filteredMarkets = exchangeFilter === 'all'
    ? markets
    : markets.filter(m => m.exchange === exchangeFilter);

  return (
    <div className="pb-8 space-y-4">
      {/* Description + actions */}
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-ink-warm-700 max-w-2xl">
          Tracks every listed market on Upbit and Bithumb hourly. New listings fire
          Tier 1 <code className="bg-cream-100 px-1 rounded text-xs">korea_exchange_listing</code> signals;
          delistings fire disqualifier signals. Signals appear in the Korea Signals tab.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="h-9"
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {/* Simulate — colored outline dropped 2026-06-03 (was
              `text-violet-700 border-violet-200`); icon tint carries
              the "test mode" semantic. */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSimulateOpen(true)}
            disabled={simulating || running}
            className="h-9"
            title="Safely simulate a new listing — removes a market from the DB, runs the scanner, verifies the signal fired, and restores everything"
          >
            <TestTube2 className="w-4 h-4 mr-1.5 text-violet-500" />
            Simulate
          </Button>
          <Button
            variant="brand"
            size="sm"
            onClick={runNow}
            disabled={running || simulating}
            className="h-9"
          >
            {running ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Play className="w-4 h-4 mr-1.5" />}
            {running ? 'Running...' : 'Run Now'}
          </Button>
        </div>
      </div>

      {/* Stat cards — KpiCard (project convention). Was rolling its
          own Card + CardContent variant with `hover:shadow-md` that
          falsely implied clickability.

          On initial mount (loading + no stats fetched yet) we render
          KPI skeletons instead of em-dash tiles — matches the
          DiscoveryPanel pattern so the two tabs feel like the same
          surface. On refresh, prior values stay visible (no flicker).
          2026-06-03. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {loading && !stats ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard
              icon={Building2}
              label="Markets Tracked"
              value={stats?.total_markets ?? 0}
              sub={`${stats?.upbit ?? 0} Upbit · ${stats?.bithumb ?? 0} Bithumb`}
              accent="gray"
            />
            <KpiCard
              icon={Sparkles}
              label="New Listings (7d)"
              value={stats?.new_last_7d ?? 0}
              sub="with signals fired"
              accent="emerald"
            />
            <KpiCard
              icon={XCircle}
              label="Delistings (30d)"
              value={stats?.delisted_last_30d ?? 0}
              sub="disqualifier signals"
              accent="rose"
            />
            <KpiCard
              icon={Clock}
              label="Last Scan"
              value={runs[0] ? formatDate(runs[0].started_at) : 'Never'}
              sub={runs[0]
                ? `${runs[0].duration_ms ? `${Math.round(runs[0].duration_ms / 1000)}s` : runs[0].status}`
                : 'no runs yet'
              }
              accent="brand"
            />
          </>
        )}
      </div>

      {/* Detected by scanner — the actual "what's new from scans" view */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-sm text-ink-warm-900 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                Detected by scanner
              </h3>
              <p className="text-xs text-ink-warm-500 mt-0.5">
                Listings (and delistings) the scanner actually fired signals on — not baseline inventory.
              </p>
            </div>
            <Badge variant="outline" className="pointer-events-none">
              {detected.length} {detected.length === 1 ? 'signal' : 'signals'}
            </Badge>
          </div>

          {loading ? (
            // Structural skeleton — matches the v11 table-row shape
            // (`py-3.5 px-5`) so the layout doesn't jump when the
            // signals land. 5 rows matches the Discovery + main
            // markets table skeleton density for cross-tab parity.
            <div className="space-y-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-3 px-5 border-b border-cream-100 last:border-0">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-10" />
                  <Skeleton className="h-4 w-14" />
                </div>
              ))}
            </div>
          ) : detected.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No new listings detected yet"
              description="The scanner runs hourly. When Upbit or Bithumb lists a token not already in our tracker, a signal will appear here. Use Simulate above to test the pipeline without waiting for a real listing."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                  {['Project', 'Event', 'Headline', 'Weight', 'Detected', 'Matched'].map(h => (
                    <TableHead key={h} className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">{h}</TableHead>
                  ))}
                  <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detected.map(d => {
                  const isListing = d.signal_type === 'korea_exchange_listing';
                  return (
                    <TableRow key={d.id} className="border-cream-100 row-accent">
                      <TableCell className="py-3.5 px-5 font-medium">{d.project_name}</TableCell>
                      <TableCell>
                        <StatusBadge tone={isListing ? 'success' : 'danger'} size="sm" className="uppercase">
                          {isListing ? 'Listed' : 'Delisted'}
                        </StatusBadge>
                        {d.exchange && (
                          <StatusBadge tone={EXCHANGE_TONE[d.exchange] || 'neutral'} size="sm" className="ml-1 uppercase">
                            {d.exchange}
                          </StatusBadge>
                        )}
                      </TableCell>
                      <TableCell className="py-3.5 px-5 text-sm text-ink-warm-700 max-w-[300px] truncate" title={d.headline}>
                        {d.headline}
                      </TableCell>
                      <TableCell className="py-3.5 px-5 tabular-nums">
                        <span className={`text-xs font-semibold ${
                          isListing ? 'text-emerald-700' : 'text-rose-700'
                        }`}>
                          {isListing ? '+' : ''}{d.relevancy_weight}
                        </span>
                      </TableCell>
                      <TableCell className="py-3.5 px-5 text-xs text-ink-warm-500">
                        {formatDate(d.detected_at)}
                      </TableCell>
                      <TableCell className="py-3.5 px-5">
                        {d.matched_prospect_id ? (
                          <StatusBadge tone="brand" size="sm">✓ prospect</StatusBadge>
                        ) : (
                          <span className="text-xs text-ink-warm-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-3.5 px-5 text-right">
                        {d.source_url ? (
                          <a
                            href={d.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-ink-warm-400 hover:text-ink-warm-900 inline-flex"
                            title="Open on exchange"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        ) : (
                          <span className="text-xs text-ink-warm-400">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Inventory: all tracked markets (filterable) */}
      <div>
        <div className="flex items-center justify-between mb-2 mt-2">
          <h3 className="font-semibold text-sm text-ink-warm-900">All tracked markets</h3>
          <span className="text-xs text-ink-warm-500">Showing newest 50 · baseline + detected</span>
        </div>
      </div>

      {/* Markets filter — v11 segmented control (cream-100 base + active
          white tile with shadow-card + brand text). */}
      <div className="inline-flex bg-cream-100 p-1 rounded-md border border-cream-200 w-fit">
        {(['all', 'upbit', 'bithumb'] as const).map(f => (
          <button
            key={f}
            type="button"
            onClick={() => setExchangeFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              exchangeFilter === f
                ? 'bg-white shadow-card text-brand'
                : 'text-ink-warm-500 hover:bg-cream-200 hover:text-ink-warm-700'
            }`}
          >
            {f === 'all' ? 'All Exchanges' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Recent markets table */}
      {loading ? (
        // Structural skeleton — 5 rows in v11 table-row dimensions.
        <Card className="overflow-hidden">
          <div className="border-b border-cream-200 bg-cream-50/80 py-2.5 px-5 flex items-center gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className={`h-3 ${i === 0 ? 'w-16' : i === 3 ? 'flex-1' : 'w-20'}`} />
            ))}
          </div>
          <div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3.5 px-5 border-b border-cream-100 last:border-0">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        </Card>
      ) : filteredMarkets.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No markets in this view"
          description="Try a different exchange filter, or wait for the hourly scanner to populate the inventory."
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                {['Symbol', 'Exchange', 'Pair', 'Name', 'First Seen', 'Signal Fired'].map(h => (
                  <TableHead key={h} className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">{h}</TableHead>
                ))}
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMarkets.map((m, i) => (
                <TableRow key={`${m.exchange}-${m.market_pair}-${i}`} className="border-cream-100 row-accent">
                  <TableCell className="py-3.5 px-5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink-warm-900">{m.symbol}</span>
                      {m.is_new && <StatusBadge tone="success" size="sm">NEW</StatusBadge>}
                      {m.warning_flag && <StatusBadge tone="warning" size="sm">⚠ Caution</StatusBadge>}
                    </div>
                  </TableCell>
                  <TableCell className="py-3.5 px-5">
                    <StatusBadge tone={EXCHANGE_TONE[m.exchange] || 'neutral'} size="sm" className="uppercase">
                      {m.exchange}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="py-3.5 px-5 text-sm text-ink-warm-700 font-mono">{m.market_pair}</TableCell>
                  <TableCell className="py-3.5 px-5 text-sm text-ink-warm-700">
                    {m.korean_name || m.english_name || <span className="text-ink-warm-400">—</span>}
                  </TableCell>
                  <TableCell className="py-3.5 px-5 text-xs text-ink-warm-500">{formatDate(m.first_seen_at)}</TableCell>
                  <TableCell className="py-3.5 px-5 text-xs text-ink-warm-500">
                    {m.listing_signal_fired_at ? formatDate(m.listing_signal_fired_at) : <span className="text-ink-warm-400">—</span>}
                  </TableCell>
                  <TableCell className="py-3.5 px-5 text-right">
                    <a
                      href={exchangeMarketUrl(m.exchange, m.market_pair, m.symbol, m.quote_currency)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-ink-warm-400 hover:text-ink-warm-900 inline-flex"
                      title={`View ${m.symbol} on ${m.exchange}`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Delisted section (collapsed by default) */}
      {delisted.length > 0 && (
        <div>
          <button
            onClick={() => setShowDelisted(v => !v)}
            className="text-sm text-ink-warm-700 hover:text-ink-warm-900 flex items-center gap-1.5"
          >
            {showDelisted ? '▼' : '▶'} Recent delistings ({delisted.length})
          </button>
          {showDelisted && (
            <Card className="mt-2 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-rose-50/80 hover:bg-rose-50/80 border-b border-rose-200">
                    {['Symbol', 'Exchange', 'Pair', 'Delisted'].map(h => (
                      <TableHead key={h} className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-600">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {delisted.map(d => (
                    <TableRow key={`${d.exchange}-${d.market_pair}`} className="border-cream-100">
                      <TableCell className="py-3.5 px-5 font-semibold">{d.symbol}</TableCell>
                      <TableCell className="py-3.5 px-5">
                        <StatusBadge tone={EXCHANGE_TONE[d.exchange] || 'neutral'} size="sm" className="uppercase">
                          {d.exchange}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="py-3.5 px-5 font-mono text-sm">{d.market_pair}</TableCell>
                      <TableCell className="py-3.5 px-5 text-xs text-ink-warm-500">{formatDate(d.delisted_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {/* Recent runs */}
      {runs.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold text-sm text-ink-warm-700 mb-2">Recent runs</h3>
            <div className="space-y-1.5">
              {runs.slice(0, 5).map(r => {
                const s = r.output_summary || {};
                return (
                  <div key={r.id} className="flex items-center gap-3 text-xs py-1 border-b border-cream-100 last:border-0">
                    {r.status === 'completed' ? (
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    ) : r.status === 'running' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-brand shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                    )}
                    <span className="text-ink-warm-500 shrink-0">{formatDate(r.started_at)}</span>
                    {r.duration_ms != null && (
                      <span className="text-ink-warm-400 shrink-0">{Math.round(r.duration_ms / 1000)}s</span>
                    )}
                    {s.baseline_run && (
                      <Badge variant="outline" className="text-[10px] pointer-events-none">baseline</Badge>
                    )}
                    <span className="text-ink-warm-700 truncate">
                      {s.live_markets_total ?? '—'} markets · {s.listing_signals_fired ?? 0} new · {s.delisting_signals_fired ?? 0} delisted
                      {s.prospect_matches ? ` · ${s.prospect_matches} matched` : ''}
                    </span>
                    {r.error_message && (
                      <span className="text-rose-600 truncate" title={r.error_message}>
                        {r.error_message.slice(0, 60)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Simulate dialog — v11 pattern: max-h-[85vh] + flex-col, inner
          scroll surface with flex-1 + overflow-y-auto, footer pinned
          with border-t. */}
      <Dialog open={simulateOpen} onOpenChange={setSimulateOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Simulate a new listing</DialogTitle>
            <DialogDescription>
              Temporarily removes a random market from the DB, triggers the scanner,
              and verifies a signal was fired correctly. Restores the market and
              deletes the synthetic signal when done. Takes ~30-60 seconds.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-1 space-y-2 py-2">
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs text-violet-800 space-y-1">
              <p className="font-semibold flex items-center gap-1"><TestTube2 className="h-3.5 w-3.5" /> What this does</p>
              <ol className="list-decimal ml-4 space-y-0.5">
                <li>Picks one active market (random recent Upbit KRW pair)</li>
                <li>Deletes its row from the tracker DB</li>
                <li>Runs the scanner — it sees the market as "new" and fires a signal</li>
                <li>Captures the signal for display</li>
                <li>Restores the market row + deletes the synthetic signal</li>
              </ol>
              <p className="pt-1">Your real Korea Signals feed stays clean.</p>
            </div>

            {lastSimulation && (
              <div className="rounded-lg border border-cream-200 bg-cream-50 p-3 text-xs space-y-1">
                <div className="font-semibold text-ink-warm-700">Last simulation</div>
                {lastSimulation.run_error ? (
                  <div className="text-rose-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {lastSimulation.run_error}
                  </div>
                ) : (
                  <>
                    <div>Target: <strong>{lastSimulation.target?.symbol}</strong> · {lastSimulation.target?.exchange} · {lastSimulation.target?.market_pair}</div>
                    {lastSimulation.signal_captured ? (
                      <>
                        <div className="text-emerald-700 font-medium flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Signal fired correctly</div>
                        <div className="text-ink-warm-700">Headline: "{lastSimulation.signal_captured.headline}"</div>
                        <div className="text-ink-warm-700">Weight: {lastSimulation.signal_captured.relevancy_weight}</div>
                        {lastSimulation.signal_captured.matched_prospect_id && (
                          <div className="text-ink-warm-700">✓ Matched a prospect</div>
                        )}
                      </>
                    ) : (
                      <div className="text-amber-700 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> No signal captured — pipeline may have issues
                      </div>
                    )}
                    <div className="text-ink-warm-500 pt-0.5">Cleanup: market restored · {lastSimulation.cleanup?.synthetic_signals_deleted ?? 0} synthetic signals deleted</div>
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setSimulateOpen(false)} disabled={simulating}>
              Close
            </Button>
            <Button
              variant="brand"
              onClick={runSimulation}
              disabled={simulating}
            >
              {simulating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {simulating ? 'Simulating...' : 'Run Simulation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
