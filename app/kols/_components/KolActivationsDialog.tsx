'use client';

/**
 * Per-KOL activation participation breakdown.
 *
 * Implements the "Tier 1" path from Section 4.3 of the HHP Campaign
 * Dashboard Spec — surfaces which activations a KOL participated in
 * without waiting for the KOL Database Overhaul spec's
 * `kol_deliverables` table.
 *
 * Reads from the `kol_activation_participation` view (derived from
 * activation_snapshots.entries_by_kol_json) joined with campaigns.
 * Always up-to-date with the latest snapshot — no sync code.
 *
 * Only counts entries where the microsite API provided `kol_id`
 * (UUID match). Label-only entries can't be joined — those need
 * a Tier 2 manual matching UI (deferred).
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, ExternalLink, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/dateFormat';

type ParticipationRow = {
  campaign_id: string;
  snapshot_id: string;
  activation_name: string | null;
  activation_type: string | null;
  activation_status: string | null;
  activation_start_date: string | null;
  activation_end_date: string | null;
  entries: number;
  synced_at: string;
  // Joined client-side from activation_snapshots — we need the snapshot
  // total to compute this KOL's share.
  snapshot_total_entries?: number;
  // Joined client-side from campaigns
  campaign_name?: string | null;
  campaign_slug?: string | null;
};

/** Short number format — 1247 → "1.2K", 145000 → "145K". */
function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString();
}

function fmtDate(s: string | null): string {
  if (!s) return '';
  try {
    return formatDate(s + 'T00:00:00');
  } catch { return s; }
}

function statusTone(status: string | null): string {
  switch ((status || '').toLowerCase()) {
    case 'active': return 'bg-emerald-100 text-emerald-700';
    case 'completed': return 'bg-sky-100 text-sky-700';
    case 'draft':
    case 'paused': return 'bg-amber-100 text-amber-700';
    default: return 'bg-cream-100 text-ink-warm-700';
  }
}

function titleCase(s: string | null): string {
  if (!s) return '';
  return s
    .replace(/[_-]/g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export default function KolActivationsDialog({
  open,
  onClose,
  kolId,
  kolName,
}: {
  open: boolean;
  onClose: () => void;
  kolId: string | null;
  kolName?: string;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ParticipationRow[]>([]);

  useEffect(() => {
    if (!open || !kolId) return;
    setLoading(true);
    (async () => {
      try {
        // 1. Pull this KOL's rows from the view.
        const { data: participation, error: pErr } = await (supabase as any)
          .from('kol_activation_participation')
          .select('*')
          .eq('kol_id', kolId)
          .order('synced_at', { ascending: false });
        if (pErr) throw pErr;

        const partRows = (participation || []) as ParticipationRow[];
        if (partRows.length === 0) {
          setRows([]);
          setLoading(false);
          return;
        }

        // 2. Pull the snapshot totals to compute share %. We use the
        //    summary_json.total_entries when present, else fall back
        //    to summing the entries_by_kol_json array.
        const snapshotIds = Array.from(new Set(partRows.map(r => r.snapshot_id)));
        const { data: snaps } = await (supabase as any)
          .from('activation_snapshots')
          .select('id, summary_json, entries_by_kol_json')
          .in('id', snapshotIds);

        const totalById = new Map<string, number>();
        for (const s of (snaps || []) as Array<{ id: string; summary_json: any; entries_by_kol_json: any }>) {
          const summaryTotal = s.summary_json?.total_entries;
          if (typeof summaryTotal === 'number') {
            totalById.set(s.id, summaryTotal);
            continue;
          }
          // Fallback: sum entries_by_kol_json
          if (Array.isArray(s.entries_by_kol_json)) {
            const sum = s.entries_by_kol_json.reduce(
              (acc: number, e: any) => acc + (e?.entries || 0),
              0,
            );
            totalById.set(s.id, sum);
          }
        }

        // 3. Pull campaign names + slugs for the "Open campaign" link.
        const campaignIds = Array.from(new Set(partRows.map(r => r.campaign_id)));
        const { data: campaigns } = await (supabase as any)
          .from('campaigns')
          .select('id, name, slug')
          .in('id', campaignIds);
        const campaignById = new Map<string, { name: string | null; slug: string | null }>();
        for (const c of (campaigns || []) as Array<{ id: string; name: string | null; slug: string | null }>) {
          campaignById.set(c.id, { name: c.name, slug: c.slug });
        }

        const enriched = partRows.map(r => ({
          ...r,
          snapshot_total_entries: totalById.get(r.snapshot_id),
          campaign_name: campaignById.get(r.campaign_id)?.name || null,
          campaign_slug: campaignById.get(r.campaign_id)?.slug || null,
        }));
        setRows(enriched);
      } catch (err: any) {
        toast({
          title: 'Failed to load activations',
          description: err?.message,
          variant: 'destructive',
        });
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, kolId, toast]);

  // Aggregates shown in the header strip
  const totals = useMemo(() => {
    const totalEntries = rows.reduce((s, r) => s + r.entries, 0);
    const activations = rows.length;
    const campaigns = new Set(rows.map(r => r.campaign_id)).size;
    return { totalEntries, activations, campaigns };
  }, [rows]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[760px] max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-brand" />
            Activations · {kolName || 'KOL'}
          </DialogTitle>
          <DialogDescription>
            Every activation this KOL has driven entries to. Pulled from the live activation snapshots.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-14 rounded-md" />
            <Skeleton className="h-20 rounded-md" />
            <Skeleton className="h-20 rounded-md" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-ink-warm-500">
            <Zap className="h-8 w-8 mx-auto mb-3 text-ink-warm-300" />
            <p className="font-medium text-ink-warm-700 mb-1">No activation participation recorded</p>
            <p className="text-xs text-ink-warm-500">
              Activation data shows up here once a campaign with a microsite syncs entry data including this KOL's UUID.
            </p>
          </div>
        ) : (
          <>
            {/* Aggregate strip */}
            <div className="grid grid-cols-3 gap-3 mb-2">
              <div className="border border-cream-200 rounded-md p-3 bg-cream-50/40">
                <p className="text-[10px] uppercase tracking-wider text-ink-warm-500">Total entries</p>
                <p className="text-xl font-bold text-ink-warm-900 tabular-nums">{fmt(totals.totalEntries)}</p>
              </div>
              <div className="border border-cream-200 rounded-md p-3 bg-cream-50/40">
                <p className="text-[10px] uppercase tracking-wider text-ink-warm-500">Activations</p>
                <p className="text-xl font-bold text-ink-warm-900 tabular-nums">{totals.activations}</p>
              </div>
              <div className="border border-cream-200 rounded-md p-3 bg-cream-50/40">
                <p className="text-[10px] uppercase tracking-wider text-ink-warm-500">Campaigns</p>
                <p className="text-xl font-bold text-ink-warm-900 tabular-nums">{totals.campaigns}</p>
              </div>
            </div>

            {/* Per-activation breakdown */}
            <div className="flex-1 overflow-y-auto min-h-0 space-y-2">
              {rows.map((r) => {
                const sharePct = r.snapshot_total_entries && r.snapshot_total_entries > 0
                  ? (r.entries / r.snapshot_total_entries) * 100
                  : 0;
                return (
                  <div
                    key={r.snapshot_id}
                    className="border border-cream-200 rounded-md p-3 hover:bg-cream-50/40"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="text-sm font-semibold text-ink-warm-900 truncate">
                            {r.activation_name || 'Unnamed activation'}
                          </p>
                          {r.activation_type && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand/10 text-brand font-medium">
                              {r.activation_type}
                            </span>
                          )}
                          {r.activation_status && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusTone(r.activation_status)}`}>
                              {titleCase(r.activation_status)}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-ink-warm-500">
                          {r.campaign_name && <span>{r.campaign_name}</span>}
                          {r.activation_start_date && r.activation_end_date && (
                            <>
                              {r.campaign_name && <span className="mx-1.5">·</span>}
                              {fmtDate(r.activation_start_date)} – {fmtDate(r.activation_end_date)}
                            </>
                          )}
                        </p>
                      </div>
                      {/* Open campaign link */}
                      {r.campaign_slug && (
                        <a
                          href={`/campaigns/${r.campaign_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-brand hover:text-brand/80"
                          title="Open campaign admin"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>

                    {/* Entries + share */}
                    <div className="flex items-center gap-3">
                      <div className="text-xs">
                        <span className="text-ink-warm-500">Entries: </span>
                        <span className="font-semibold text-ink-warm-900 tabular-nums">{fmt(r.entries)}</span>
                      </div>
                      {r.snapshot_total_entries && (
                        <>
                          <div className="text-xs text-ink-warm-500">·</div>
                          <div className="text-xs">
                            <span className="text-ink-warm-500">Share: </span>
                            <span className="font-semibold text-ink-warm-900 tabular-nums">{sharePct.toFixed(1)}%</span>
                          </div>
                          <div className="flex-1 h-1.5 rounded-full bg-cream-100 overflow-hidden">
                            <div
                              className="h-full bg-brand"
                              style={{ width: `${Math.max(2, Math.min(100, sharePct))}%` }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <DialogFooter className="border-t border-cream-100 pt-3 mt-0 shrink-0">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
