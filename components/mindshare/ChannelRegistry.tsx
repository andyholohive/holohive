'use client';

/**
 * TG · Channels — the registry behind every mindshare and coverage number.
 *
 * Lives in its own file rather than inside app/mindshare/page.tsx, which is
 * already ~2,500 lines.
 *
 * The column that matters is Last post. A channel sits in the registry as
 * active whether or not it is still producing — handles change, channels go
 * private, the crawler quietly stops resolving one — and nothing downstream
 * announces it. The totals are simply lower than they should be. "Registered
 * but silent" is the state this table exists to make visible.
 */

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate, formatRelativeShort } from '@/lib/dateFormat';
import { Radio, Search, AlertTriangle } from 'lucide-react';

type Channel = {
  id: string;
  channel_tg_id: string;
  channel_username: string | null;
  channel_name: string | null;
  language: string | null;
  is_active: boolean;
  member_count: number | null;
  posts_30d: number;
  posts_total: number;
  last_post_at: string | null;
};

const SILENT_DAYS = 14;

function isSilent(c: Channel) {
  if (!c.is_active) return false;
  if (!c.last_post_at) return true;
  return Date.now() - Date.parse(c.last_post_at) > SILENT_DAYS * 86400_000;
}

export function ChannelRegistry() {
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [summary, setSummary] = useState<{ total: number; active: number; producing: number; silent: number } | null>(null);
  const [q, setQ] = useState('');
  const [silentOnly, setSilentOnly] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/mindshare/channels')
      .then(r => r.json())
      .then(j => {
        if (!alive) return;
        setChannels(j.channels ?? []);
        setSummary(j.summary ?? null);
        setLoading(false);
      })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) return <Skeleton className="h-64 rounded-lg" />;

  const term = q.trim().toLowerCase();
  const rows = channels
    .filter(c => !silentOnly || isSilent(c))
    .filter(c => !term
      || (c.channel_name ?? '').toLowerCase().includes(term)
      || (c.channel_username ?? '').toLowerCase().includes(term));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-warm-400" />
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search channels"
            className="h-9 pl-8 w-56 focus-brand"
          />
        </div>
        <button
          type="button"
          onClick={() => setSilentOnly(v => !v)}
          className={`h-9 rounded-md border px-3 text-xs font-medium transition-colors ${
            silentOnly
              ? 'border-amber-300 bg-amber-50 text-amber-800'
              : 'border-cream-200 text-ink-warm-500 hover:bg-cream-50'
          }`}
        >
          <AlertTriangle className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
          Silent {SILENT_DAYS}d+{summary ? ` (${summary.silent})` : ''}
        </button>
        {summary && (
          <div className="ml-auto text-xs text-ink-warm-500">
            {summary.producing} of {summary.total} produced a post in the last 30 days
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Radio}
          title={silentOnly ? 'No silent channels' : 'No channels match'}
          description={silentOnly
            ? `Every active channel has posted within ${SILENT_DAYS} days.`
            : 'Try a different search term.'}
        />
      ) : (
        <Card className="border-cream-200 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Channel</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Posts (30d)</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Total</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Last post</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Members</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(c => {
                  const silent = isSilent(c);
                  return (
                    <TableRow key={c.id} className="border-gray-100">
                      <TableCell className="py-3">
                        <div className="font-medium">{c.channel_name || c.channel_username || c.channel_tg_id}</div>
                        {c.channel_username && (
                          <a
                            href={`https://t.me/${c.channel_username}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-ink-warm-400 hover:text-brand transition-colors"
                          >
                            @{c.channel_username}
                          </a>
                        )}
                      </TableCell>
                      <TableCell className="py-3 tabular-nums">{c.posts_30d}</TableCell>
                      <TableCell className="py-3 tabular-nums text-ink-warm-500">{c.posts_total}</TableCell>
                      <TableCell className="py-3">
                        {c.last_post_at ? (
                          <span className={silent ? 'text-amber-700' : ''} title={formatDate(c.last_post_at)}>
                            {formatRelativeShort(c.last_post_at)}
                          </span>
                        ) : (
                          <span className="text-ink-warm-400">never</span>
                        )}
                      </TableCell>
                      <TableCell className="py-3 tabular-nums text-ink-warm-500">
                        {c.member_count?.toLocaleString('en-US') ?? '—'}
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
      )}
    </div>
  );
}
