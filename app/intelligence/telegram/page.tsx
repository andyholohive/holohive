'use client';

/**
 * Telegram · Overview / Runs / Accounts (v7 panels).
 *
 * One page, three tabs, one question: is the Telegram layer actually
 * running? Every failure it has had was silent — a green cron writing
 * nothing, a revoked session, channels registered but mute — so every
 * panel here leads with freshness rather than configuration. "Enabled"
 * has never been the useful fact.
 */

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { KpiCard } from '@/components/ui/kpi-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime, formatRelativeShort } from '@/lib/dateFormat';
import { Send, Activity, KeyRound, Database, AlertTriangle, CheckCircle2 } from 'lucide-react';
// [2026-08-18] v7 "Telegram" row: the 13 bot routes move out of Admin Tools
// and sit with the chats they fire into. Rendering the existing page rather
// than reimplementing it — /admin/telegram-comm stays a working URL, it just
// is no longer the only way in, and Admin goes back to field options + tags.
import TelegramCommPage from '@/app/admin/telegram-comm/page';

type Feed = {
  key: string; label: string; via: string; rows: number;
  last_at: string | null; age_hours: number | null; status: 'fresh' | 'stale' | 'never';
};
type Run = {
  agent_name: string; total: number; failed: number;
  last_at: string | null; last_status: string | null;
  last_error: string | null; last_summary: string | null;
};
type Account = {
  role: string; purpose: string; secret: string; proof: string;
  last_at: string | null; status: string;
};

const FEED_TONE: Record<string, BadgeTone> = { fresh: 'success', stale: 'danger', never: 'neutral' };
const FEED_LABEL: Record<string, string> = { fresh: 'Producing', stale: 'Stopped', never: 'Never run' };

export default function TelegramOpsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ feeds: Feed[]; runs: Run[]; accounts: Account[] } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/intelligence/telegram-ops')
      .then(r => r.json())
      .then(j => { if (alive) { setData(j); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const header = (
    <PageHeader
      icon={Send}
      title="Telegram"
      subtitle="Readers, sessions and the bot routes — one place for everything Telegram"
    />
  );

  if (loading) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  const feeds = data?.feeds ?? [];
  const runs = data?.runs ?? [];
  const accounts = data?.accounts ?? [];
  const stopped = feeds.filter(f => f.status === 'stale');
  const failingJobs = runs.filter(r => r.last_status === 'failed');

  return (
    <div className="space-y-6">
      {header}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KpiCard icon={Database} label="Readers producing" value={`${feeds.filter(f => f.status === 'fresh').length}/${feeds.length}`}
          sub={stopped.length ? `${stopped.length} stopped` : 'all fresh'} accent={stopped.length ? 'rose' : 'emerald'} />
        <KpiCard icon={Activity} label="Jobs (7d)" value={runs.length} sub={`${failingJobs.length} failing`} accent={failingJobs.length ? 'amber' : 'gray'} />
        <KpiCard icon={KeyRound} label="Sessions" value={accounts.filter(a => a.status === 'fresh').length + '/' + accounts.length}
          sub="proven by recent output" accent="brand" />
        <KpiCard icon={Database} label="Corpus rows" value={(feeds.find(f => f.key === 'corpus')?.rows ?? 0).toLocaleString('en-US')} sub="tg_channel_posts" accent="sky" />
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="routes">Routes</TabsTrigger>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card className="border-cream-200 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Reader</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Rows</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Last produced</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Runs via</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feeds.map(f => (
                    <TableRow key={f.key} className="border-gray-100">
                      <TableCell className="py-3 font-medium">{f.label}</TableCell>
                      <TableCell className="py-3 tabular-nums">{f.rows.toLocaleString('en-US')}</TableCell>
                      <TableCell className="py-3">
                        {f.last_at
                          ? <span title={formatDateTime(f.last_at)} className={f.status === 'stale' ? 'text-rose-600' : ''}>{formatRelativeShort(f.last_at)}</span>
                          : <span className="text-ink-warm-400">—</span>}
                      </TableCell>
                      <TableCell className="py-3 text-xs text-ink-warm-500">{f.via}</TableCell>
                      <TableCell className="py-3">
                        <StatusBadge tone={FEED_TONE[f.status]} size="sm">{FEED_LABEL[f.status]}</StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
          <p className="text-xs text-ink-warm-400 mt-3">
            A reader reads &ldquo;Stopped&rdquo; when it has produced nothing for longer than its own cadence allows.
            That is the shape every past Telegram failure took — the job stayed green and the rows stopped arriving.
          </p>
        </TabsContent>

        {/* Routes — every bot destination, configured beside the chats it
            posts into rather than three clicks away under Admin. */}
        <TabsContent value="routes" className="mt-4">
          <TelegramCommPage />
        </TabsContent>

        <TabsContent value="runs" className="mt-4">
          <Card className="border-cream-200 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Job</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Last run</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Runs (7d)</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Failed</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Last outcome</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map(r => (
                    <TableRow key={r.agent_name} className="border-gray-100">
                      <TableCell className="py-3 font-mono text-xs">{r.agent_name}</TableCell>
                      <TableCell className="py-3">
                        {r.last_at ? <span title={formatDateTime(r.last_at)}>{formatRelativeShort(r.last_at)}</span> : '—'}
                      </TableCell>
                      <TableCell className="py-3 tabular-nums">{r.total}</TableCell>
                      <TableCell className="py-3 tabular-nums">
                        {r.failed > 0 ? <span className="text-rose-600 font-medium">{r.failed}</span> : <span className="text-ink-warm-400">0</span>}
                      </TableCell>
                      <TableCell className="py-3 max-w-md">
                        <div className="flex items-start gap-2">
                          {r.last_status === 'failed'
                            ? <AlertTriangle className="h-3.5 w-3.5 text-rose-500 mt-0.5 flex-shrink-0" />
                            : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />}
                          <span className="text-xs text-ink-warm-600 break-words">
                            {r.last_error || r.last_summary || r.last_status || '—'}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="accounts" className="mt-4 space-y-3">
          {accounts.map(a => (
            <Card key={a.secret} className="border-cream-200 p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-brand" />
                    <span className="font-semibold">{a.role}</span>
                    <StatusBadge tone={a.status === 'fresh' ? 'success' : a.status === 'stale' ? 'danger' : 'neutral'} size="sm">
                      {a.status === 'fresh' ? 'Working' : a.status === 'stale' ? 'Not producing' : 'Never used'}
                    </StatusBadge>
                  </div>
                  <p className="text-sm text-ink-warm-600 mt-1.5 max-w-xl">{a.purpose}</p>
                  <p className="text-xs text-ink-warm-400 mt-1">
                    Secret <code className="font-mono">{a.secret}</code> · GitHub Actions
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-warm-400">{a.proof}</div>
                  <div className="text-sm tabular-nums mt-0.5">
                    {a.last_at ? formatRelativeShort(a.last_at) : '—'}
                  </div>
                </div>
              </div>
            </Card>
          ))}
          <p className="text-xs text-ink-warm-400">
            Session strings live in GitHub Actions secrets and cannot be read from here, so status is inferred from
            whether the work that depends on each account is still producing. That is deliberate: a panel that reported
            &ldquo;configured&rdquo; would have shown green through the five-day outage in August.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
