'use client';

/**
 * KoreaScanSection — Korea Scans attached to this opportunity, newest first,
 * with whether the prospect opened the link, plus a way to run a new one.
 * Admin + super-admin only (the scan API is admin-gated); renders nothing
 * for other roles.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Copy, ScanSearch } from 'lucide-react';
import { formatDate, formatRelativeShort } from '@/lib/dateFormat';
import { shareUrl, type SavedScanRow } from '@/components/koreaScan/SavedScans';

export function KoreaScanSection({ opp }: { opp: { id: string; name: string } }) {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin';
  const [rows, setRows] = useState<SavedScanRow[] | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let live = true;
    setRows(null);
    fetch(`/api/korea-scan/saved?opportunity=${opp.id}`).then((r) => r.json()).then((d) => { if (live) setRows(d.scans ?? []); }).catch(() => live && setRows([]));
    return () => { live = false; };
  }, [isAdmin, opp.id]);

  if (!isAdmin) return null;
  const runHref = `/mindshare/korea-scan?opportunity=${opp.id}&name=${encodeURIComponent(opp.name)}`;

  return (
    <div className="border-t pt-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-warm-500">Korea Scan</h4>
        <Button asChild variant="outline" size="sm" className="h-7">
          <Link href={runHref}><ScanSearch className="mr-1.5 h-3.5 w-3.5" />{rows?.length ? 'Run again' : 'Run a scan'}</Link>
        </Button>
      </div>
      {rows === null ? (
        <Skeleton className="h-12" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No scan yet. A scan shows how Korea covers this project against its field, with a private link to send them.</p>
      ) : (
        <ul className="space-y-2">
          {rows.slice(0, 5).map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-md border border-gray-100 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900">
                  {formatDate(r.createdAt)}
                  {r.headline && <span className="ml-2 font-normal text-gray-500">{r.headline.posts} posts · {r.headline.channels} channels</span>}
                </p>
                <p className="text-xs text-gray-500">
                  {r.opens > 0 ? `Opened ${r.opens}× · last ${formatRelativeShort(r.lastOpened!)}` : 'Not opened yet'}
                </p>
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="Copy link"
                onClick={async () => {
                  let ok = true;
                  try { await navigator.clipboard.writeText(shareUrl(window.location.origin, r.token)); } catch { ok = false; }
                  toast({ title: ok ? 'Link copied' : 'Copy failed' });
                }}>
                <Copy className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
