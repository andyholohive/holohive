'use client';

/**
 * Wallet Analytics page — campaign-participant intelligence.
 *
 * Imported from the May 2026 Data Bank xlsx as 1,197 wallets across
 * four campaign events (DataHaven Event 1 / 2, Fogo Entries, Fogo
 * TraderCard). Source-of-truth lives in the wallet_analytics table.
 *
 * What this view answers:
 *   - How many wallets has our campaign portfolio touched?
 *   - How many come back for a 2nd or 3rd event? (= retention)
 *   - Which campaigns have the most audience overlap with each other?
 *   - For a given campaign — who participated, on what chain?
 *
 * The seven enrichment columns (net_worth_usd, wallet_tier, defi_active,
 * etc.) are NULL today. The UI surfaces them as columns with "—"
 * placeholders so the moment a future cron lands DeBank/Helius data,
 * they light up automatically with zero UI changes.
 */

import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Wallet, Users, Activity, Repeat, Search, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────

interface EventStat {
  name: string;
  total: number;
  evm: number;
  solana: number;
}

interface Summary {
  total: number;
  chain: { evm: number; solana: number };
  retention: { single_event: number; two_events: number; three_plus_events: number };
  retention_pct: { single_event: number; two_events: number; three_plus_events: number };
  events_by_reach: EventStat[];
  overlap: Record<string, Record<string, number>>;
  cross_event_pct: number;
}

interface WalletItem {
  id: string;
  wallet_address: string;
  chain: string;
  num_events: number;
  event_labels: string;
  net_worth_usd: number | null;
  wallet_tier: string | null;
  defi_active: boolean | null;
  nft_holder: boolean | null;
  enriched_at: string | null;
}

interface ListResponse {
  items: WalletItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ─── Page ───────────────────────────────────────────────────────────

export default function WalletsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/wallets/summary');
        if (!r.ok) throw new Error(`Summary fetch failed (${r.status})`);
        const data = await r.json();
        if (!cancelled) setSummary(data);
      } catch (err) {
        console.error('[wallets] summary fetch:', err);
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Wallet}
        title="Wallet Analytics"
        subtitle="Cross-campaign wallet participation, retention, and audience overlap."
      />

      {/* KPI strip — four headline numbers. */}
      {summaryLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard icon={Wallet} label="Total wallets" value={summary.total.toLocaleString()} sub="Across all campaigns" />
          <KpiCard
            icon={Repeat}
            label="Cross-campaign retention"
            value={`${summary.cross_event_pct.toFixed(1)}%`}
            sub={`${summary.retention.two_events + summary.retention.three_plus_events} wallets in 2+ events`}
            tone={summary.cross_event_pct >= 10 ? 'good' : 'neutral'}
          />
          <KpiCard icon={Activity} label="EVM / Solana" value={`${summary.chain.evm.toLocaleString()} / ${summary.chain.solana.toLocaleString()}`} sub="Chain split" />
          <KpiCard
            icon={Users}
            label="Power users (3+ events)"
            value={summary.retention.three_plus_events.toLocaleString()}
            sub={`${summary.retention_pct.three_plus_events.toFixed(1)}% of total`}
            tone="good"
          />
        </div>
      ) : (
        <EmptyState icon={Wallet} title="Couldn't load summary" description="Check console for fetch error." />
      )}

      {/* Tabs: Overview / By campaign / Wallets list */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="by_campaign">By Campaign</TabsTrigger>
          <TabsTrigger value="wallets">Wallets</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-6">
          {summary && (
            <>
              <RetentionFunnel summary={summary} />
              <OverlapMatrix summary={summary} />
            </>
          )}
        </TabsContent>

        <TabsContent value="by_campaign" className="mt-4">
          {summary && <ByCampaign summary={summary} />}
        </TabsContent>

        <TabsContent value="wallets" className="mt-4">
          <WalletsTable summary={summary} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, sub, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone?: 'good' | 'warn' | 'neutral';
}) {
  const accent = tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : 'text-gray-900';
  return (
    <Card className="border border-gray-200 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-3.5 w-3.5 text-gray-400" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${accent}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </Card>
  );
}

/**
 * Retention funnel — three stacked bars showing what % of wallets
 * participated in 1, 2, or 3+ events. The drop-off from 1 → 2 is
 * the most actionable number on the page (it's your re-engagement
 * rate per campaign).
 */
function RetentionFunnel({ summary }: { summary: Summary }) {
  const max = summary.retention.single_event || 1;
  const bars = [
    { label: '1 event', count: summary.retention.single_event, pct: summary.retention_pct.single_event, color: 'bg-sky-200', text: 'text-sky-900' },
    { label: '2 events', count: summary.retention.two_events, pct: summary.retention_pct.two_events, color: 'bg-emerald-300', text: 'text-emerald-900' },
    { label: '3+ events', count: summary.retention.three_plus_events, pct: summary.retention_pct.three_plus_events, color: 'bg-emerald-500', text: 'text-white' },
  ];
  return (
    <Card className="border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Retention funnel</h3>
          <p className="text-xs text-gray-500">How many wallets came back for more than one campaign.</p>
        </div>
      </div>
      <div className="space-y-2">
        {bars.map(b => {
          const width = (b.count / max) * 100;
          return (
            <div key={b.label} className="flex items-center gap-3">
              <div className="w-20 text-xs text-gray-600 flex-shrink-0">{b.label}</div>
              <div className="flex-1 h-7 bg-gray-50 rounded overflow-hidden relative">
                <div
                  className={`h-full ${b.color} flex items-center px-2 text-xs font-medium ${b.text} transition-all`}
                  style={{ width: `${width}%`, minWidth: '60px' }}
                >
                  {b.count.toLocaleString()}
                </div>
              </div>
              <div className="w-14 text-right text-xs tabular-nums text-gray-600 flex-shrink-0">{b.pct.toFixed(1)}%</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/**
 * Overlap matrix — symmetric N×N grid. Diagonal cells (event ∩ same
 * event) show the event's own total reach. Off-diagonal cells show
 * how many wallets appeared in BOTH events. The cell color scales
 * with the overlap count to make hotspots scannable.
 */
function OverlapMatrix({ summary }: { summary: Summary }) {
  const events = summary.events_by_reach.map(e => e.name);
  // Find the max OFF-DIAGONAL value for color scaling — diagonal
  // (self-overlap = total reach) is much larger and would crush the
  // gradient if we included it.
  const offDiagMax = useMemo(() => {
    let m = 0;
    for (const a of events) for (const b of events) {
      if (a !== b) m = Math.max(m, summary.overlap[a]?.[b] || 0);
    }
    return m || 1;
  }, [events, summary.overlap]);

  return (
    <Card className="border border-gray-200 shadow-sm p-5 overflow-x-auto">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Campaign overlap</h3>
        <p className="text-xs text-gray-500">Wallets appearing in both row and column campaigns. Diagonal shows each campaign&apos;s own reach.</p>
      </div>
      <table className="min-w-[600px] text-xs">
        <thead>
          <tr>
            <th className="text-left p-2 font-semibold text-gray-500"></th>
            {events.map(e => (
              <th key={e} className="p-2 text-center font-semibold text-gray-700 max-w-[120px]">
                <div className="truncate" title={e}>{e}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.map(rowEvt => (
            <tr key={rowEvt}>
              <td className="p-2 font-semibold text-gray-700 whitespace-nowrap">{rowEvt}</td>
              {events.map(colEvt => {
                const val = summary.overlap[rowEvt]?.[colEvt] || 0;
                const isDiag = rowEvt === colEvt;
                // Intensity scaled against off-diagonal max. Diagonal
                // cells render in a distinct gray-blue so the eye
                // doesn't confuse "this event's reach" with "overlap".
                const intensity = isDiag ? 0 : Math.min(1, val / offDiagMax);
                const bg = isDiag
                  ? 'bg-gray-100 text-gray-700'
                  : intensity === 0
                    ? 'bg-white text-gray-300'
                    : `text-gray-900`;
                const inlineBg = isDiag || intensity === 0 ? undefined : {
                  // Brand teal at variable opacity. CSS opacity on the
                  // background-color via rgba.
                  backgroundColor: `rgba(62, 134, 146, ${0.10 + intensity * 0.55})`,
                };
                return (
                  <td
                    key={colEvt}
                    className={`p-2 text-center tabular-nums border border-gray-100 ${bg}`}
                    style={inlineBg}
                    title={isDiag
                      ? `${rowEvt}: ${val} total wallets`
                      : `${val} wallet${val === 1 ? '' : 's'} in both "${rowEvt}" and "${colEvt}"`
                    }
                  >
                    {val.toLocaleString()}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/**
 * Per-campaign breakdown — for each event, show its reach + chain
 * split + retention story ("X of these wallets are now in a 2+ event
 * cohort"). Lighter-touch than the matrix; lives in its own tab so
 * the Overview page stays focused on the cross-event story.
 */
function ByCampaign({ summary }: { summary: Summary }) {
  return (
    <div className="space-y-3">
      {summary.events_by_reach.map(e => {
        const evmPct = e.total > 0 ? (100 * e.evm / e.total) : 0;
        return (
          <Card key={e.name} className="border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h4 className="font-semibold text-gray-900">{e.name}</h4>
              <Badge variant="outline" className="text-xs">{e.total.toLocaleString()} wallets</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-gray-50 rounded p-3">
                <p className="text-gray-500 mb-1">EVM</p>
                <p className="text-lg font-bold tabular-nums">{e.evm.toLocaleString()}</p>
                <p className="text-gray-500 mt-0.5">{evmPct.toFixed(1)}%</p>
              </div>
              <div className="bg-gray-50 rounded p-3">
                <p className="text-gray-500 mb-1">Solana</p>
                <p className="text-lg font-bold tabular-nums">{e.solana.toLocaleString()}</p>
                <p className="text-gray-500 mt-0.5">{(100 - evmPct).toFixed(1)}%</p>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/**
 * Wallets tab — paginated, filterable list. Surfaces the enrichment
 * columns (net worth, tier, DeFi, NFT) so when Tier 2 enrichment
 * lands, the values show up automatically. Until then those columns
 * render "—".
 */
function WalletsTable({ summary }: { summary: Summary | null }) {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [chain, setChain] = useState<string>('all');
  const [event, setEvent] = useState<string>('all');
  const [minEvents, setMinEvents] = useState<string>('0');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      page_size: '50',
    });
    if (chain !== 'all') params.set('chain', chain);
    if (event !== 'all') params.set('event', event);
    if (minEvents !== '0') params.set('min_events', minEvents);
    if (search.trim()) params.set('search', search.trim().toLowerCase());
    fetch(`/api/wallets/list?${params.toString()}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) setData(d); })
      .catch(err => console.error('[wallets] list fetch:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page, chain, event, minEvents, search]);

  // Reset to page 1 whenever filters change (otherwise users land
  // on page 12 of an empty result set).
  useEffect(() => { setPage(1); }, [chain, event, minEvents, search]);

  const events = summary?.events_by_reach.map(e => e.name) || [];

  return (
    <Card className="border border-gray-200 shadow-sm">
      {/* Filter bar */}
      <div className="p-4 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            placeholder="Search address (prefix)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm focus-brand"
          />
        </div>
        <Select value={chain} onValueChange={setChain}>
          <SelectTrigger className="h-9 w-32 text-sm focus-brand"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All chains</SelectItem>
            <SelectItem value="evm">EVM</SelectItem>
            <SelectItem value="solana">Solana</SelectItem>
          </SelectContent>
        </Select>
        <Select value={event} onValueChange={setEvent}>
          <SelectTrigger className="h-9 w-48 text-sm focus-brand"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {events.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={minEvents} onValueChange={setMinEvents}>
          <SelectTrigger className="h-9 w-40 text-sm focus-brand"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Any # events</SelectItem>
            <SelectItem value="2">2+ events</SelectItem>
            <SelectItem value="3">3+ events</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow className="bg-gray-50/60">
              <TableHead>Wallet address</TableHead>
              <TableHead className="w-[90px]">Chain</TableHead>
              <TableHead className="w-[80px] text-right">Events</TableHead>
              <TableHead>Event labels</TableHead>
              <TableHead className="w-[110px] text-right">Net worth</TableHead>
              <TableHead className="w-[80px]">Tier</TableHead>
              <TableHead className="w-[70px] text-center">DeFi</TableHead>
              <TableHead className="w-[70px] text-center">NFT</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}><Skeleton className="h-6 w-full" /></TableCell>
                </TableRow>
              ))
            ) : !data || data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12">
                  <EmptyState
                    icon={Wallet}
                    title="No wallets match these filters"
                    description="Try clearing filters or broadening the search."
                    className="py-0"
                  />
                </TableCell>
              </TableRow>
            ) : data.items.map(w => (
              <TableRow key={w.id} className="hover:bg-gray-50/60">
                <TableCell className="font-mono text-xs">
                  <a
                    href={w.chain === 'evm'
                      ? `https://debank.com/profile/${w.wallet_address.toLowerCase()}`
                      : `https://solscan.io/account/${w.wallet_address}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-700 hover:text-brand inline-flex items-center gap-1"
                    title="Open on DeBank / Solscan"
                  >
                    <span className="truncate max-w-[260px]">{w.wallet_address}</span>
                    <ExternalLink className="h-3 w-3 text-gray-400 flex-shrink-0" />
                  </a>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] uppercase ${
                    w.chain === 'evm' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-purple-50 text-purple-700 border-purple-200'
                  }`}>{w.chain}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{w.num_events}</TableCell>
                <TableCell className="text-xs text-gray-600 truncate max-w-[280px]" title={w.event_labels}>
                  {w.event_labels}
                </TableCell>
                <TableCell className="text-right tabular-nums text-gray-600">
                  {w.net_worth_usd != null ? `$${w.net_worth_usd.toLocaleString()}` : <span className="text-gray-300">—</span>}
                </TableCell>
                <TableCell>
                  {w.wallet_tier ? (
                    <Badge variant="outline" className="text-[10px] capitalize">{w.wallet_tier}</Badge>
                  ) : <span className="text-gray-300">—</span>}
                </TableCell>
                <TableCell className="text-center">
                  {w.defi_active == null ? <span className="text-gray-300">—</span> : w.defi_active ? '✓' : '✕'}
                </TableCell>
                <TableCell className="text-center">
                  {w.nft_holder == null ? <span className="text-gray-300">—</span> : w.nft_holder ? '✓' : '✕'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {data && data.total_pages > 1 && (
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
          <span>
            Showing {((data.page - 1) * data.page_size) + 1}–{Math.min(data.page * data.page_size, data.total)} of {data.total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page <= 1 || loading}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2 tabular-nums">Page {data.page} of {data.total_pages}</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page >= data.total_pages || loading}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
