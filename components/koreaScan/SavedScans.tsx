'use client';

/**
 * Saved Korea Scans: the share bar for the scan on screen, and the list of
 * earlier runs with how often each link was opened. Every run is saved as a
 * frozen snapshot with a private link (korea_scans).
 */

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CardHeaderEditorial } from '@/components/ui/card-header-editorial';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Copy, Eye, History, Link2, Trash2 } from 'lucide-react';
import { formatDate, formatRelativeShort } from '@/lib/dateFormat';

export interface SavedScanRow {
  id: string;
  token: string;
  subject: string;
  preparedFor: string | null;
  opportunityId: string | null;
  opportunityName: string | null;
  createdAt: string;
  headline: { posts: number; channels: number; changePct: number | null } | null;
  opens: number;
  lastOpened: string | null;
}

export const shareUrl = (origin: string, token: string) => `${origin}/public/korea-scan/${token}`;

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** Link + copy + preview + revoke for the scan on screen. */
export function ShareBar({ token, id, origin, onRevoked }: { token: string; id: string; origin: string; onRevoked: () => void }) {
  const { toast } = useToast();
  const [confirm, setConfirm] = useState(false);
  const url = shareUrl(origin, token);
  async function revoke() {
    const res = await fetch(`/api/korea-scan/saved?id=${id}`, { method: 'DELETE' });
    if (!res.ok) { toast({ title: 'Could not revoke', variant: 'destructive' }); return; }
    toast({ title: 'Link revoked', description: 'Anyone opening it now sees a not-found page.' });
    onRevoked();
  }
  return (
    <Card className="border-gray-200">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <Link2 className="h-4 w-4 flex-shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">Saved. The link shows the slides you pick below.</p>
          <p className="truncate font-mono text-xs text-gray-500">{url}</p>
        </div>
        <Button variant="outline" size="sm" onClick={async () => toast({ title: (await copy(url)) ? 'Link copied' : 'Copy failed, select the link instead' })}>
          <Copy className="mr-2 h-4 w-4" />Copy link
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={`${url}?preview=1`} target="_blank" rel="noreferrer"><Eye className="mr-2 h-4 w-4" />See what they see</a>
        </Button>
        {confirm ? (
          <Button variant="destructive" size="sm" onClick={revoke}>Confirm revoke</Button>
        ) : (
          <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => setConfirm(true)}>
            <Trash2 className="mr-2 h-4 w-4" />Revoke
          </Button>
        )}
      </div>
      <p className="border-t border-gray-100 px-4 py-2.5 text-xs text-gray-500">
        The shared version hides the names of channels in our network. Opens are counted, except link previews and “See what they see”.
      </p>
    </Card>
  );
}

/** Earlier runs, newest first. */
export function SavedScansList({ rows, origin, onOpen, title = 'Saved scans' }: {
  rows: SavedScanRow[] | null; origin: string; onOpen: (id: string) => void; title?: string;
}) {
  const { toast } = useToast();
  return (
    <Card className="overflow-hidden border-gray-200">
      <CardHeaderEditorial icon={History} title={title} subtitle="Every run is kept with its own link, so a second scan later is a before-and-after." />
      {rows && rows.length === 0 ? (
        <EmptyState icon={History} title="No saved scans yet" description="Run a scan above and it will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
              {['Project', 'Opportunity', 'Run', 'Posts', 'Change', 'Opens', ''].map((h) => (
                <TableHead key={h} className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).map((r) => (
              <TableRow key={r.id} className="border-gray-100">
                <TableCell className="py-3">
                  <button type="button" className="font-medium text-gray-900 hover:text-brand" onClick={() => onOpen(r.id)}>{r.subject}</button>
                  {r.preparedFor && <span className="block text-xs text-gray-500">for {r.preparedFor}</span>}
                </TableCell>
                <TableCell className="py-3 text-sm text-gray-600">{r.opportunityName ?? '—'}</TableCell>
                <TableCell className="py-3 text-sm text-gray-600">{formatDate(r.createdAt)}</TableCell>
                <TableCell className="py-3 text-sm tabular-nums">{r.headline ? `${r.headline.posts} · ${r.headline.channels} ch` : '—'}</TableCell>
                <TableCell className="py-3 text-sm tabular-nums">
                  {r.headline?.changePct == null ? '—' : (
                    <StatusBadge tone={r.headline.changePct >= 0 ? 'success' : 'danger'} size="sm">
                      {r.headline.changePct > 0 ? '+' : r.headline.changePct < 0 ? '−' : ''}{Math.abs(r.headline.changePct)}%
                    </StatusBadge>
                  )}
                </TableCell>
                <TableCell className="py-3 text-sm">
                  {r.opens > 0 ? <span>{r.opens}<span className="ml-1 text-xs text-gray-500">last {formatRelativeShort(r.lastOpened!)}</span></span> : <span className="text-gray-400">Not opened</span>}
                </TableCell>
                <TableCell className="py-3 text-right">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="Copy link"
                    onClick={async () => toast({ title: (await copy(shareUrl(origin, r.token))) ? 'Link copied' : 'Copy failed' })}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
