'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
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

const EXCHANGE_BADGE: Record<string, string> = {
  upbit: 'bg-blue-100 text-blue-700',
  bithumb: 'bg-orange-100 text-orange-700',
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
      setMarkets(data.recent_markets || []);
      setDelisted(data.delisted_markets || []);
      setRuns(data.recent_runs || []);
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message ?? 'Failed to load', variant: 'destructive' });
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
      toast({ title: 'Error', description: err?.message ?? 'Run failed', variant: 'destructive' });
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
      toast({ title: 'Error', description: err?.message ?? 'Simulation failed', variant: 'destructive' });
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
        <p className="text-sm text-gray-600 max-w-2xl">
          Tracks every listed market on Upbit and Bithumb hourly. New listings fire
          Tier 1 <code className="bg-gray-100 px-1 rounded text-xs">korea_exchange_listing</code> signals;
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSimulateOpen(true)}
            disabled={simulating || running}
            className="h-9 text-violet-700 border-violet-200 hover:bg-violet-50"
            title="Safely simulate a new listing — removes a market from the DB, runs the scanner, verifies the signal fired, and restores everything"
          >
            <TestTube2 className="w-4 h-4 mr-1.5" />
            Simulate
          </Button>
          <Button
            size="sm"
            onClick={runNow}
            disabled={running || simulating}
            style={{ backgroundColor: 'var(--brand)', color: 'white' }}
            className="hover:opacity-90 h-9"
          >
            {running ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Play className="w-4 h-4 mr-1.5" />}
            {running ? 'Running...' : 'Run Now'}
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Markets Tracked</span>
            </div>
            {loading ? <Skeleton className="h-7 w-20" /> : (
              <>
                <div className="text-2xl font-bold text-gray-900">{stats?.total_markets ?? 0}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {stats?.upbit ?? 0} Upbit · {stats?.bithumb ?? 0} Bithumb
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">New Listings (7d)</span>
            </div>
            {loading ? <Skeleton className="h-7 w-20" /> : (
              <>
                <div className="text-2xl font-bold text-emerald-700">{stats?.new_last_7d ?? 0}</div>
                <div className="text-xs text-gray-500 mt-0.5">with signals fired</div>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="h-3.5 w-3.5 text-red-500" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Delistings (30d)</span>
            </div>
            {loading ? <Skeleton className="h-7 w-20" /> : (
              <>
                <div className="text-2xl font-bold text-red-700">{stats?.delisted_last_30d ?? 0}</div>
                <div className="text-xs text-gray-500 mt-0.5">disqualifier signals</div>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-3.5 w-3.5 text-[#3e8692]" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Last Scan</span>
            </div>
            {loading ? <Skeleton className="h-7 w-20" /> : runs[0] ? (
              <>
                <div className="text-2xl font-bold text-gray-900">
                  {formatDate(runs[0].started_at)}
                </div>
                <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                  {runs[0].status === 'completed' ? (
                    <CheckCircle className="h-3 w-3 text-emerald-600" />
                  ) : runs[0].status === 'running' ? (
                    <Loader2 className="h-3 w-3 animate-spin text-[#3e8692]" />
                  ) : (
                    <XCircle className="h-3 w-3 text-red-600" />
                  )}
                  {runs[0].duration_ms ? `${Math.round(runs[0].duration_ms / 1000)}s` : runs[0].status}
                </div>
              </>
            ) : (
              <div className="text-sm text-gray-400">No runs yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Markets filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'upbit', 'bithumb'] as const).map(f => (
          <button
            key={f}
            onClick={() => setExchangeFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              exchangeFilter === f
                ? 'text-white'
                : 'text-gray-600 hover:bg-gray-100 border border-transparent'
            }`}
            style={exchangeFilter === f ? { backgroundColor: 'var(--brand)' } : {}}
          >
            {f === 'all' ? 'All Exchanges' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Recent markets table */}
      {loading ? (
        <Card><CardContent className="p-4 space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent></Card>
      ) : filteredMarkets.length === 0 ? (
        <Card><CardContent className="text-center py-12 text-gray-500">
          No markets in this view.
        </CardContent></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead>Symbol</TableHead>
                <TableHead>Exchange</TableHead>
                <TableHead>Pair</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>First Seen</TableHead>
                <TableHead>Signal Fired</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMarkets.map((m, i) => (
                <TableRow key={`${m.exchange}-${m.market_pair}-${i}`} className="hover:bg-gray-50">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{m.symbol}</span>
                      {m.is_new && (
                        <Badge className="bg-emerald-100 text-emerald-700 pointer-events-none text-[10px]">NEW</Badge>
                      )}
                      {m.warning_flag && (
                        <Badge className="bg-amber-100 text-amber-700 pointer-events-none text-[10px]">⚠ Caution</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`${EXCHANGE_BADGE[m.exchange]} pointer-events-none text-[10px] uppercase`}>
                      {m.exchange}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600 font-mono">{m.market_pair}</TableCell>
                  <TableCell className="text-sm text-gray-600">
                    {m.korean_name || m.english_name || <span className="text-gray-400">—</span>}
                  </TableCell>
                  <TableCell className="text-xs text-gray-500">{formatDate(m.first_seen_at)}</TableCell>
                  <TableCell className="text-xs text-gray-500">
                    {m.listing_signal_fired_at ? formatDate(m.listing_signal_fired_at) : <span className="text-gray-400">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <a
                      href={exchangeMarketUrl(m.exchange, m.market_pair, m.symbol, m.quote_currency)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-gray-900 inline-flex"
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
            className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1.5"
          >
            {showDelisted ? '▼' : '▶'} Recent delistings ({delisted.length})
          </button>
          {showDelisted && (
            <Card className="mt-2">
              <Table>
                <TableHeader>
                  <TableRow className="bg-red-50">
                    <TableHead>Symbol</TableHead>
                    <TableHead>Exchange</TableHead>
                    <TableHead>Pair</TableHead>
                    <TableHead>Delisted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {delisted.map(d => (
                    <TableRow key={`${d.exchange}-${d.market_pair}`}>
                      <TableCell className="font-semibold">{d.symbol}</TableCell>
                      <TableCell>
                        <Badge className={`${EXCHANGE_BADGE[d.exchange]} pointer-events-none text-[10px] uppercase`}>
                          {d.exchange}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{d.market_pair}</TableCell>
                      <TableCell className="text-xs text-gray-500">{formatDate(d.delisted_at)}</TableCell>
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
            <h3 className="font-semibold text-sm text-gray-700 mb-2">Recent runs</h3>
            <div className="space-y-1.5">
              {runs.slice(0, 5).map(r => {
                const s = r.output_summary || {};
                return (
                  <div key={r.id} className="flex items-center gap-3 text-xs py-1 border-b border-gray-100 last:border-0">
                    {r.status === 'completed' ? (
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    ) : r.status === 'running' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#3e8692] shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                    )}
                    <span className="text-gray-500 shrink-0">{formatDate(r.started_at)}</span>
                    {r.duration_ms != null && (
                      <span className="text-gray-400 shrink-0">{Math.round(r.duration_ms / 1000)}s</span>
                    )}
                    {s.baseline_run && (
                      <Badge variant="outline" className="text-[10px] pointer-events-none">baseline</Badge>
                    )}
                    <span className="text-gray-600 truncate">
                      {s.live_markets_total ?? '—'} markets · {s.listing_signals_fired ?? 0} new · {s.delisting_signals_fired ?? 0} delisted
                      {s.prospect_matches ? ` · ${s.prospect_matches} matched` : ''}
                    </span>
                    {r.error_message && (
                      <span className="text-red-600 truncate" title={r.error_message}>
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

      {/* Simulate dialog */}
      <Dialog open={simulateOpen} onOpenChange={setSimulateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Simulate a new listing</DialogTitle>
            <DialogDescription>
              Temporarily removes a random market from the DB, triggers the scanner,
              and verifies a signal was fired correctly. Restores the market and
              deletes the synthetic signal when done. Takes ~30-60 seconds.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
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
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs space-y-1">
                <div className="font-semibold text-gray-700">Last simulation</div>
                {lastSimulation.run_error ? (
                  <div className="text-red-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {lastSimulation.run_error}
                  </div>
                ) : (
                  <>
                    <div>Target: <strong>{lastSimulation.target?.symbol}</strong> · {lastSimulation.target?.exchange} · {lastSimulation.target?.market_pair}</div>
                    {lastSimulation.signal_captured ? (
                      <>
                        <div className="text-emerald-700 font-medium flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Signal fired correctly</div>
                        <div className="text-gray-600">Headline: "{lastSimulation.signal_captured.headline}"</div>
                        <div className="text-gray-600">Weight: {lastSimulation.signal_captured.relevancy_weight}</div>
                        {lastSimulation.signal_captured.matched_prospect_id && (
                          <div className="text-gray-600">✓ Matched a prospect</div>
                        )}
                      </>
                    ) : (
                      <div className="text-amber-700 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> No signal captured — pipeline may have issues
                      </div>
                    )}
                    <div className="text-gray-500 pt-0.5">Cleanup: market restored · {lastSimulation.cleanup?.synthetic_signals_deleted ?? 0} synthetic signals deleted</div>
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSimulateOpen(false)} disabled={simulating}>
              Close
            </Button>
            <Button
              onClick={runSimulation}
              disabled={simulating}
              style={{ backgroundColor: 'var(--brand)', color: 'white' }}
              className="hover:opacity-90"
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
