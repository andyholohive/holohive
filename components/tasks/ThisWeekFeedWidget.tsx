'use client';

/**
 * "This Week" Done-toggle widget for the HQ Tasks page.
 *
 * Per Jdot's Post-Onboarding Phase 2 Q4 answer (2026-06-11): "widget is
 * good." Surfaces every pending `this_week_feed` item across the current
 * user's accessible clients so a CM working in HQ can flip items Done
 * without context-switching to /clients → modal → Weekly Update tab.
 *
 * Source of truth stays on the Weekly Update tab — this is a quick-access
 * mirror. Every flip persists to client_weekly_updates.this_week_feed AND
 * writes a row to client_weekly_update_audit so the accountability story
 * holds regardless of which surface was used.
 *
 * Visual treatment matches the v11 Card pattern used elsewhere on the
 * HQ page (cream border, SectionHeader-style kicker). Hides entirely
 * when there's nothing pending — no dead chrome on quiet weeks.
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, ListChecks, Loader2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────

type FeedItem = {
  id: string;
  text: string;
  date: string | null;
  status: 'pending' | 'done';
  done_at?: string | null;
  done_by?: string | null;
};

type WeeklyRow = {
  id: string;
  client_id: string;
  week_of: string;
  this_week_feed: FeedItem[];
  client: {
    id: string;
    name: string;
  } | null;
};

type PendingEntry = {
  weeklyUpdateId: string;
  clientId: string;
  clientName: string;
  weekOf: string;
  item: FeedItem;
};

// ─── Helpers ──────────────────────────────────────────────────────

/** Monday of the current week, ISO YYYY-MM-DD (UTC-anchored). */
function mondayOfThisWeek(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sun
  const delta = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// ─── Component ────────────────────────────────────────────────────

export function ThisWeekFeedWidget({
  currentUserId,
  currentUserName,
}: {
  currentUserId: string | null;
  currentUserName: string | null;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<WeeklyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const weekOf = useMemo(() => mondayOfThisWeek(), []);

  // ─── Fetch ──────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Pull the current week's rows for every client. Filtering for
        // "has pending items" is cheap enough in JS and avoids fighting
        // Postgres JSONB containment from PostgREST.
        const { data, error } = await (supabase as any)
          .from('client_weekly_updates')
          .select(`
            id,
            client_id,
            week_of,
            this_week_feed,
            client:clients!client_weekly_updates_client_id_fkey(id, name)
          `)
          .eq('week_of', weekOf);
        if (error) throw error;
        if (cancelled) return;
        const normalized: WeeklyRow[] = (data || []).map((r: any) => ({
          id: r.id,
          client_id: r.client_id,
          week_of: r.week_of,
          this_week_feed: Array.isArray(r.this_week_feed) ? r.this_week_feed : [],
          client: r.client || null,
        }));
        setRows(normalized);
      } catch (err: any) {
        if (!cancelled) {
          console.error('[ThisWeekFeedWidget] fetch failed:', err);
          toast({
            title: 'Failed to load weekly feeds',
            description: err?.message,
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOf]);

  // ─── Derive flat pending list ───────────────────────────────────

  const pending: PendingEntry[] = useMemo(() => {
    const out: PendingEntry[] = [];
    for (const row of rows) {
      if (!row.client) continue;
      for (const item of row.this_week_feed) {
        if (item.status === 'pending' && item.text.trim()) {
          out.push({
            weeklyUpdateId: row.id,
            clientId: row.client_id,
            clientName: row.client.name,
            weekOf: row.week_of,
            item,
          });
        }
      }
    }
    // Stable ordering — by client name then by date string (nulls last).
    out.sort((a, b) => {
      const byClient = a.clientName.localeCompare(b.clientName);
      if (byClient !== 0) return byClient;
      const ad = a.item.date || '￿';
      const bd = b.item.date || '￿';
      return ad.localeCompare(bd);
    });
    return out;
  }, [rows]);

  // ─── Flip a single item Done ────────────────────────────────────

  async function handleMarkDone(entry: PendingEntry) {
    setBusyItemId(entry.item.id);
    const before = rows.find(r => r.id === entry.weeklyUpdateId)?.this_week_feed ?? [];
    const next = before.map(it => it.id === entry.item.id
      ? { ...it, status: 'done' as const, done_at: new Date().toISOString(), done_by: currentUserId ?? null }
      : it
    );

    // Optimistic UI — drop the row from the widget immediately. We'll
    // restore the previous state if the persist fails.
    setRows(prev => prev.map(r => r.id === entry.weeklyUpdateId
      ? { ...r, this_week_feed: next }
      : r
    ));

    try {
      const { error: upErr } = await (supabase as any)
        .from('client_weekly_updates')
        .update({ this_week_feed: next, updated_at: new Date().toISOString() })
        .eq('id', entry.weeklyUpdateId);
      if (upErr) throw upErr;

      // Audit-log the flip — same edit_kind ('this_week_feed') and shape
      // the Weekly Update tab's saveWeeklyV2 emits, so the History
      // popover on the tab surfaces the toggle made from here too.
      (supabase as any)
        .from('client_weekly_update_audit')
        .insert({
          weekly_update_id: entry.weeklyUpdateId,
          edit_kind: 'this_week_feed',
          before_json: before,
          after_json: next,
          edited_by: currentUserId,
          edited_by_name: currentUserName,
        })
        .then((res: any) => {
          if (res?.error) console.error('[ThisWeekFeedWidget] audit insert failed:', res.error);
        });

      // [2026-06-11] Phase 4 — Post-Onboarding spec: a Zone B item
      // flipping to done auto-creates a Delivery Log "Pending Review"
      // draft. CM reviews at the top of /clients/[id]/delivery-log,
      // fills in who/method/location, then confirms. Idempotent:
      // checks for an existing draft by source_ref so re-flipping
      // (done → pending → done) doesn't dup the row, and any in-
      // progress CM edits survive the round-trip.
      try {
        const { data: existingDraft } = await (supabase as any)
          .from('client_delivery_log')
          .select('id')
          .eq('client_id', entry.clientId)
          .eq('source', 'weekly_update_feed')
          .eq('source_ref', entry.item.id)
          .maybeSingle();

        const loggedAt = entry.item.date || new Date().toISOString().slice(0, 10);

        if (existingDraft?.id) {
          // Touch updated_at — moves the draft to the top of the
          // Pending Review list without overwriting CM edits.
          await (supabase as any)
            .from('client_delivery_log')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', existingDraft.id);
        } else {
          await (supabase as any)
            .from('client_delivery_log')
            .insert({
              client_id: entry.clientId,
              // Zone B items are client-facing by definition.
              work_type: 'Client-Facing',
              action: entry.item.text,
              logged_at: loggedAt,
              pending_review: true,
              source: 'weekly_update_feed',
              source_ref: entry.item.id,
              created_by: currentUserId,
              // sort_order is NOT NULL — sentinel low value; the
              // Pending Review section renders separately anyway.
              sort_order: 0,
            });
        }
      } catch (draftErr: any) {
        // Don't fail the Done toggle — the feed flip already landed.
        // Surface as a toast so the CM knows to add the entry manually.
        console.error('[ThisWeekFeedWidget] delivery draft failed:', draftErr);
        toast({
          title: 'Marked done · draft not created',
          description: draftErr?.message || 'Add to delivery log manually.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Marked done · draft created',
        description: `${entry.clientName}: review in Delivery Log`,
      });
    } catch (err: any) {
      // Rollback optimistic update
      setRows(prev => prev.map(r => r.id === entry.weeklyUpdateId
        ? { ...r, this_week_feed: before }
        : r
      ));
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setBusyItemId(null);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────

  // Hide entirely when there's nothing to show. No dead chrome on
  // quiet weeks — keeps the HQ page focused on its primary content.
  if (!loading && pending.length === 0) return null;

  return (
    <div className="border border-cream-200 rounded-lg bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-cream-200 flex items-center gap-2">
        <ListChecks className="h-3.5 w-3.5 text-brand" />
        <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-ink-warm-700">
          This Week — Client Updates
        </p>
        <span className="text-[10px] text-ink-warm-500 ml-auto tabular-nums">
          {loading ? '…' : `${pending.length} pending`}
        </span>
      </div>
      {loading ? (
        <div className="p-3 space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded" />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-cream-100">
          {pending.map(entry => (
            <li key={`${entry.weeklyUpdateId}:${entry.item.id}`} className="px-4 py-2.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge tone="brand" size="sm">{entry.clientName}</StatusBadge>
                  {entry.item.date && (
                    <span className="text-[10px] text-ink-warm-500 tabular-nums">
                      {new Date(entry.item.date + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  )}
                </div>
                <p className="text-sm text-ink-warm-900 mt-0.5 truncate">{entry.item.text}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 shrink-0 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 focus-brand"
                onClick={() => handleMarkDone(entry)}
                disabled={busyItemId === entry.item.id}
                title="Mark this Zone B feed item done"
              >
                {busyItemId === entry.item.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    Done
                  </>
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
