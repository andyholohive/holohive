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
import { EmptyState } from '@/components/ui/empty-state';
import { formatDateTime, formatRelativeShort } from '@/lib/dateFormat';
import { Send, Activity, KeyRound, Database, AlertTriangle, CheckCircle2, Radio } from 'lucide-react';
// [2026-08-18] v7 "Telegram" row: the 13 bot routes move out of Admin Tools
// and sit with the chats they fire into. Rendering the existing page rather
// than reimplementing it — /admin/telegram-comm stays a working URL, it just
// is no longer the only way in, and Admin goes back to field options + tags.
import TelegramCommPage from '@/app/admin/telegram-comm/page';
import { RemindersManager } from '@/components/telegram/RemindersManager';
import { ChatsManager } from '@/components/telegram/ChatsManager';

type Feed = {
  key: string; label: string; via: string; rows: number;
  last_at: string | null; age_hours: number | null; status: 'fresh' | 'stale' | 'never';
};
type Run = {
  agent_name: string; total: number; failed: number;
  last_at: string | null; last_status: string | null;
  last_error: string | null; last_summary: string | null;
};
type Channel = {
  id: string; channel_tg_id: string; channel_username: string | null;
  channel_name: string | null; language: string | null; is_active: boolean;
  member_count: number | null; posts_30d: number | null;
  posts_total: number | null; last_post_at: string | null;
  channel_kind: string | null; is_hired: boolean | null;
  kind_source: string | null; forward_ratio: number | null;
};
type Command = {
  command: string; description: string | null; where: string; active: boolean;
};
type Budget = {
  account: string; calls_60m: number; calls_24h: number;
  flood_waits_24h: number; flood_seconds_24h: number;
  calls_per_channel: number | null;
  last_run_at: string | null; last_status: string | null;
};
type Account = {
  role: string; purpose: string; secret: string; proof: string;
  last_at: string | null; status: string;
};

// Channel taxonomy — Jdot's v7 answer #2. Four kinds plus unknown, with
// `hired` deliberately kept off the axis: a creator we pay and one we
// don't are the same kind of channel, and folding the commercial
// relationship in would make "Creator" mean two things depending on the
// month.
const KIND_LABEL: Record<string, string> = {
  creator: 'Creator', paid_desk: 'Paid desk', repost_bot: 'Repost bot',
  official: 'Official', unknown: 'Unclassified',
};
const KIND_TONE: Record<string, BadgeTone> = {
  creator: 'brand', paid_desk: 'purple', repost_bot: 'warning',
  official: 'info', unknown: 'neutral',
};

// The two access modes. Membership is the rule, not subject matter: a bot
// tab is somewhere the bot is a member and can write; a reader tab is a
// channel we read from outside and cannot post to. Overview sits above both
// because it answers "is any of this running" for the whole layer.
const GROUPS = [
  { id: 'overview', label: 'Overview', hint: 'is the layer running',
    tabs: [{ id: 'overview', label: 'Overview' }] },
  { id: 'bot', label: 'Bot', hint: 'chats we are inside',
    tabs: [
      { id: 'chats', label: 'Chats' },
      { id: 'topics', label: 'Topics' },
      { id: 'routes', label: 'Routes' },
      { id: 'commands', label: 'Commands' },
      { id: 'reminders', label: 'Reminders' },
    ] },
  { id: 'reader', label: 'Reader', hint: 'channels we read from outside',
    tabs: [
      { id: 'registry', label: 'Registry' },
      { id: 'runs', label: 'Runs' },
      { id: 'accounts', label: 'Accounts' },
    ] },
] as const;

const FEED_TONE: Record<string, BadgeTone> = { fresh: 'success', stale: 'danger', never: 'neutral' };
const FEED_LABEL: Record<string, string> = { fresh: 'Producing', stale: 'Stopped', never: 'Never run' };

export default function TelegramOpsPage() {
  // ?tab= is honoured because /crm/telegram redirects here with it — an old
  // TG Chats bookmark should land on Chats, not on Overview.
  const [tab, setTab] = useState('overview');
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get('tab');
    if (want && GROUPS.some(g => g.tabs.some(t => t.id === want))) setTab(want);
  }, []);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ feeds: Feed[]; runs: Run[]; accounts: Account[]; commands?: Command[]; budget?: Budget[] } | null>(null);
  // The registry — v7 § Telegram puts it on this page, not under
  // Mindshare, because "which channels do we watch and is each producing"
  // is the same question the Overview tab asks one level up. Its own
  // fetch so a slow RPC doesn't hold the rest of the page.
  const [channels, setChannels] = useState<Channel[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/intelligence/telegram-ops')
      .then(r => r.json())
      .then(j => { if (alive) { setData(j); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    fetch('/api/mindshare/channels')
      .then(r => r.json())
      .then(j => { if (alive) setChannels(j.channels ?? []); })
      .catch(() => { if (alive) setChannels([]); });
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
  const activeGroup = GROUPS.find(g => g.tabs.some(t => t.id === tab)) ?? GROUPS[0];
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

      {/* Nine tabs, grouped by access mode — Jdot 2026-08-19: "group by
          access mode, which is the split that actually explains Telegram to
          anyone new". Bot is what we are inside and can post to; Reader is
          what we read from the outside and cannot. He weighed a 3/3/3 split
          by activity (monitor / configure / data) and rejected it: it
          balances better but mixes bot chats with read channels, and that
          distinction is the one people need to hold. */}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-wrap items-center gap-2">
          {GROUPS.map(g => (
            <button
              key={g.id}
              type="button"
              onClick={() => setTab(g.tabs[0].id)}
              className={`h-8 rounded-md px-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
                g.id === activeGroup.id
                  ? 'bg-brand text-white'
                  : 'bg-cream-100 text-ink-warm-500 border border-cream-200 hover:text-brand'
              }`}
            >
              {g.label}
            </button>
          ))}
          <span className="text-xs text-ink-warm-400">{activeGroup.hint}</span>
        </div>

        <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200 mt-2 flex-wrap">
          {activeGroup.tabs.map(t => (
            <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>
          ))}
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

        {/* Scheduled routes. Routes (above) fire on an event; these fire
            on a clock. Same bot, same chats, same "which chat does this
            go to" question — so they live one tab apart rather than
            behind their own sidebar entry. */}
        <TabsContent value="reminders" className="mt-4">
          <RemindersManager embedded />
        </TabsContent>

        {/* Chats and Topics, moved off /crm/telegram. Eight chat filters
            keep their own strip inside this tab — they are views of one
            list, not eight destinations. */}
        <TabsContent value="chats" className="mt-4">
          <ChatsManager view="chats" />
        </TabsContent>

        <TabsContent value="topics" className="mt-4">
          <ChatsManager view="topics" />
        </TabsContent>

        {/* Commands — v7 § "Slash commands: over chats, never over the
            registry". The bot acts on chats and tasks, never on the channel
            list, so nothing here can change what Registry shows.
            [2026-08-19] This is the editable command surface from
            /crm/telegram, not the read-only table that used to sit here —
            folding the two pages had to keep the one that can edit. */}
        <TabsContent value="commands" className="mt-4">
          <ChatsManager view="commands" />
        </TabsContent>

        <TabsContent value="registry" className="mt-4">
          {channels === null ? (
            <Skeleton className="h-64 rounded-lg" />
          ) : channels.length === 0 ? (
            <Card className="border-cream-200">
              <EmptyState
                icon={Radio}
                title="No channels registered"
                description="The mindshare crawl reads from this list — nothing is being watched yet."
              />
            </Card>
          ) : (
            <>
              {/* The taxonomy distribution, above the table because the only
                  number here that asks for a decision is how many rows are
                  still unclassified — that is the hand-classification queue,
                  and it never shrinks if nobody can see its size. */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {(['creator', 'paid_desk', 'repost_bot', 'official', 'unknown'] as const).map(k => {
                  const n = channels.filter(c => c.is_active && (c.channel_kind || 'unknown') === k).length;
                  if (!n && k !== 'unknown') return null;
                  return (
                    <StatusBadge key={k} tone={KIND_TONE[k]} size="sm">
                      {KIND_LABEL[k]} · {n}
                    </StatusBadge>
                  );
                })}
                <span className="text-xs text-ink-warm-500">
                  {channels.filter(c => c.is_active && c.is_hired).length} hired
                </span>
              </div>

              <Card className="border-cream-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                        <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Channel</TableHead>
                        <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Kind</TableHead>
                        <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Members</TableHead>
                        <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Posts (30d)</TableHead>
                        <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Last post</TableHead>
                        <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...channels]
                        .sort((a, b) => {
                          const at = a.last_post_at ? Date.parse(a.last_post_at) : 0;
                          const bt = b.last_post_at ? Date.parse(b.last_post_at) : 0;
                          return at - bt; // oldest / never first
                        })
                        .map(c => {
                          const ageMs = c.last_post_at ? Date.now() - Date.parse(c.last_post_at) : null;
                          const silent = ageMs === null || ageMs > 7 * 86_400_000;
                          return (
                            <TableRow key={c.id} className="border-gray-100">
                              <TableCell className="py-3">
                                <span className="font-medium text-ink-warm-900">{c.channel_name || c.channel_username || c.channel_tg_id}</span>
                                {c.channel_username && (
                                  <span className="block text-[11px] text-ink-warm-400">@{c.channel_username}</span>
                                )}
                              </TableCell>
                              <TableCell className="py-3">
                                <div className="flex items-center gap-1.5">
                                  <StatusBadge tone={KIND_TONE[c.channel_kind || 'unknown'] ?? 'neutral'} size="sm">
                                    {KIND_LABEL[c.channel_kind || 'unknown'] ?? 'Unclassified'}
                                  </StatusBadge>
                                  {c.is_hired && <StatusBadge tone="success" size="sm">Hired</StatusBadge>}
                                </div>
                                {/* Forward ratio is the evidence behind a Repost bot
                                    call, so it shows on that row rather than in a
                                    separate column nobody would read. */}
                                {c.channel_kind === 'repost_bot' && c.forward_ratio != null && (
                                  <span className="block text-[11px] text-ink-warm-400">
                                    {Math.round(c.forward_ratio * 100)}% forwarded
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="py-3 tabular-nums text-ink-warm-600">
                                {c.member_count != null ? c.member_count.toLocaleString('en-US') : <span className="text-ink-warm-400">—</span>}
                              </TableCell>
                              <TableCell className="py-3 tabular-nums">{(c.posts_30d ?? 0).toLocaleString('en-US')}</TableCell>
                              <TableCell className="py-3">
                                {c.last_post_at
                                  ? <span title={formatDateTime(c.last_post_at)} className={silent ? 'text-rose-600' : ''}>{formatRelativeShort(c.last_post_at)}</span>
                                  : <span className="text-ink-warm-400">never</span>}
                              </TableCell>
                              <TableCell className="py-3">
                                {!c.is_active
                                  ? <StatusBadge tone="neutral" size="sm">Inactive</StatusBadge>
                                  : silent
                                    ? <StatusBadge tone="warning" size="sm">Silent</StatusBadge>
                                    : <StatusBadge tone="success" size="sm">Producing</StatusBadge>}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </div>
              </Card>
              <p className="text-xs text-ink-warm-400 mt-3">
                Silent, not unreachable — nothing has run a reachability check, so this
                says the channel has produced nothing in 7 days without claiming why.
                A handle change, a switch to private, and a genuinely quiet channel all
                look identical from here.
              </p>
            </>
          )}
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
          {/* Request budget [2026-08-18]. Jdot: "request budget, not money…
              calls_24h can't answer that alone since throttling fires on a
              much shorter window." So 60m leads and 24h is context. Time
              parked in FloodWait is shown because it is the honest cost —
              a run that "succeeded" after 900s of waiting has spent the
              account, and a call count alone hides that entirely. */}
          <Card className="border-cream-200 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Account</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Calls (60m)</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Calls (24h)</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Flood waits</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Cost / channel</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.budget ?? []).map(b => (
                    <TableRow key={b.account} className="border-gray-100">
                      <TableCell className="py-3 font-medium capitalize">{b.account}</TableCell>
                      <TableCell className="py-3 tabular-nums font-semibold">{b.calls_60m.toLocaleString('en-US')}</TableCell>
                      <TableCell className="py-3 tabular-nums text-ink-warm-600">{b.calls_24h.toLocaleString('en-US')}</TableCell>
                      <TableCell className="py-3">
                        {b.flood_waits_24h > 0 ? (
                          <span className="text-rose-600 tabular-nums">
                            {b.flood_waits_24h} · {Math.round(b.flood_seconds_24h / 60)}m parked
                          </span>
                        ) : (
                          <span className="text-ink-warm-400">none</span>
                        )}
                      </TableCell>
                      <TableCell className="py-3 tabular-nums text-ink-warm-600">
                        {b.calls_per_channel != null
                          ? `~${b.calls_per_channel}`
                          : <span className="text-ink-warm-300">no history</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
          <p className="text-xs text-ink-warm-400">
            Cost per channel is measured from this account&apos;s own runs, not estimated — so a
            fan-out over 147 channels can be priced in requests before it fires. Empty until
            the first run lands: the ledger starts today and nothing is backfilled.
          </p>

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
