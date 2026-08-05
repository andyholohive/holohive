'use client';

/**
 * Per-document share links — team management dialog (2026-08-05).
 *
 * Mints, copies and revokes the direct URLs we send clients. Kept out of
 * ActiveClientsDocuments (already ~600 lines) so the table file stays about
 * the table.
 *
 * The reassurance line is deliberate and repeated in the UI: a share link
 * still runs the client's email gate, so forwarding it doesn't leak the
 * document. Without saying that, the natural assumption is "secret URL", and
 * people then treat these links as more dangerous than they are — or worse,
 * as safe to make public.
 */

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Link2, Copy, Ban, RotateCcw, CalendarIcon, ShieldCheck } from 'lucide-react';
import { formatDate, formatDateTime } from '@/lib/dateFormat';

export interface ShareLink {
  id: string;
  token: string;
  label: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_accessed_at: string | null;
  access_count: number;
}

/** End-of-day so "expires 12/15" means the whole of the 15th, not 00:00. */
function endOfLocalDayIso(day: Date): string {
  const d = new Date(day);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function shareUrl(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/public/documents/${token}`;
}

export default function ShareLinkDialog({
  documentId,
  documentTitle,
  open,
  onOpenChange,
}: {
  documentId: string | null;
  documentTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/share-links`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      setLinks(res.ok ? (json.links ?? []) : []);
    } catch {
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (open) { setLabel(''); setExpiresAt(null); void load(); }
  }, [open, load]);

  const create = async () => {
    if (!documentId) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/share-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim() || null, expires_at: expiresAt }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: 'Couldn’t create link', description: json.error ?? 'Unknown error', variant: 'destructive' });
        return;
      }
      // Copy immediately — you made a link because you're about to send it.
      try { await navigator.clipboard.writeText(shareUrl(json.link.token)); } catch { /* clipboard blocked */ }
      toast({ title: 'Link created and copied' });
      setLabel(''); setExpiresAt(null);
      await load();
    } finally {
      setCreating(false);
    }
  };

  const setRevoked = async (link: ShareLink, revoked: boolean) => {
    const res = await fetch(`/api/documents/share-links/${link.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revoked }),
    });
    if (res.ok) {
      toast({ title: revoked ? 'Link revoked' : 'Link restored' });
      await load();
    } else {
      toast({ title: 'Update failed', variant: 'destructive' });
    }
  };

  const copy = async (link: ShareLink) => {
    try {
      await navigator.clipboard.writeText(shareUrl(link.token));
      toast({ title: 'Link copied' });
    } catch {
      toast({ title: 'Couldn’t copy', description: 'Copy it from the field instead.', variant: 'destructive' });
    }
  };

  const isExpired = (l: ShareLink) => !!l.expires_at && new Date(l.expires_at).getTime() < Date.now();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!bg-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />Share links
          </DialogTitle>
          <DialogDescription className="truncate">{documentTitle}</DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand" />
          <p className="text-xs leading-relaxed text-gray-600">
            Anyone with this link still has to pass the client’s email gate to open it, so
            forwarding it doesn’t expose the document. Revoking a link kills that URL only —
            the document’s Shared setting is untouched.
          </p>
        </div>

        {/* ── Create ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
            <Label htmlFor="link-label">Label (optional)</Label>
            <Input
              id="link-label"
              placeholder="e.g. Sent to Minji"
              className="h-9 focus-brand"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Expires (optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-9 w-[160px] justify-start font-normal focus-brand">
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {expiresAt ? formatDate(expiresAt) : 'No expiry'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
                <Calendar
                  mode="single"
                  selected={expiresAt ? new Date(expiresAt) : undefined}
                  onSelect={(day) => { if (day) setExpiresAt(endOfLocalDayIso(day)); }}
                  classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                  modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                />
                {expiresAt && (
                  <div className="border-t p-2">
                    <Button variant="ghost" size="sm" className="w-full text-xs text-rose-600 hover:bg-rose-50" onClick={() => setExpiresAt(null)}>
                      Clear expiry
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
          <Button variant="brand" onClick={create} disabled={creating || !documentId}>
            <Link2 className="mr-2 h-4 w-4" />{creating ? 'Creating…' : 'Create link'}
          </Button>
        </div>

        {/* ── Existing ───────────────────────────────────────────────── */}
        <div className="max-h-[42vh] overflow-y-auto">
          {loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : links.length === 0 ? (
            <EmptyState icon={Link2} title="No links yet" description="Create one to send this document directly." />
          ) : (
            <div className="flex flex-col gap-2">
              {links.map((l) => {
                const dead = !!l.revoked_at || isExpired(l);
                return (
                  <div key={l.id} className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{l.label || 'Untitled link'}</span>
                      {l.revoked_at
                        ? <StatusBadge tone="danger" size="sm">Revoked</StatusBadge>
                        : isExpired(l)
                          ? <StatusBadge tone="warning" size="sm">Expired</StatusBadge>
                          : <StatusBadge tone="success" size="sm">Live</StatusBadge>}
                      <span className="ml-auto text-xs text-gray-500 tabular-nums">
                        {l.access_count} open{l.access_count === 1 ? '' : 's'}
                        {l.last_accessed_at && ` · last ${formatDateTime(l.last_accessed_at)}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={shareUrl(l.token)}
                        className={`h-8 font-mono text-xs ${dead ? 'text-gray-400 line-through' : ''}`}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <Button variant="outline" size="sm" className="h-8 flex-shrink-0" onClick={() => copy(l)} disabled={dead}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      {l.revoked_at ? (
                        <Button variant="outline" size="sm" className="h-8 flex-shrink-0" onClick={() => setRevoked(l, false)}>
                          <RotateCcw className="mr-1 h-3.5 w-3.5" />Restore
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 flex-shrink-0 border-rose-300 text-rose-600 hover:bg-rose-50"
                          onClick={() => setRevoked(l, true)}
                        >
                          <Ban className="mr-1 h-3.5 w-3.5" />Revoke
                        </Button>
                      )}
                    </div>

                    <p className="text-xs text-gray-400">
                      Created {formatDate(l.created_at)}
                      {l.expires_at && ` · expires ${formatDate(l.expires_at)}`}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
