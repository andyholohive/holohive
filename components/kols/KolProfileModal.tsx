"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ExternalLink, Pencil, Save, X, Calendar as CalendarIcon, RefreshCw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { MasterKOL, KOLService } from "@/lib/kolService";
// [May 2026 KOL overhaul follow-up] The Deliverables tab reads directly
// from the campaign-side `contents` table (the orphan kol_deliverables
// table's KolDeliverableService was deleted in the July 2026 audit).
import {
  KolCallLogService,
  CALL_TYPES,
  type KolCallLog,
  type CreateKolCallLogInput,
} from "@/lib/kolCallLogService";
import {
  KolChannelSnapshotService,
  type KolChannelSnapshot,
  type CreateKolChannelSnapshotInput,
} from "@/lib/kolChannelSnapshotService";
import { ScoreBreakdownTab } from "./ScoreBreakdownTab";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/dateFormat";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * KOL profile detail modal — Phase 2 of the May 2026 KOL overhaul.
 *
 * Houses two new sections that didn't have a home in the /kols list view:
 *   - Deliverables (kol_deliverables, mig 072) — per-brief tracking
 *   - Call Logs (kol_call_logs, mig 071) — per-call notes
 *
 * Plus an Overview tab that surfaces the static KOL profile (name,
 * link, region, etc.) without leaving the modal — useful when the
 * person logging a deliverable wants to confirm they're on the right
 * KOL.
 *
 * UX choices:
 *   - Tabs (not stacked sections) — keeps the modal manageable when
 *     a KOL has many deliverables.
 *   - Inline add forms — click "Add" → form expands at top of list.
 *     No second modal-on-modal.
 *   - Optimistic edits — list updates in state immediately, rolls
 *     back on server error. Standard pattern from /kols list.
 */
interface KolProfileModalProps {
  kol: MasterKOL | null;
  isOpen: boolean;
  onClose: () => void;
  /** Called when KOL data was edited (e.g. notes) so parent can refresh. */
  onKolChanged?: (updated: MasterKOL) => void;
  /** Bumped by the parent when snapshots/deliverables change so the
   *  parent can re-fetch the score. Optional callback. */
  onMetricsChanged?: () => void;
}

export function KolProfileModal({
  kol,
  isOpen,
  onClose,
  onKolChanged,
  onMetricsChanged,
}: KolProfileModalProps) {
  if (!kol) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      {/* flex-col so the header + TabsList stay pinned and only the
          per-tab body scrolls. Matches the inner-scroll pattern used
          by the /clients dialogs — scrollbar sits inset between the
          dialog edges instead of at the outer rounded corner. */}
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{kol.name}</span>
            {kol.link && (
              <a
                href={kol.link}
                target="_blank"
                rel="noreferrer"
                className="text-brand hover:text-brand-dark"
                title="Open KOL link"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            {/* Rescan button — fires the GH-Actions Telethon scan for
                this KOL. Only meaningful when `link` is a t.me URL
                (the scanner reads `link`, not the numeric telegram_id).
                ~30-90s end-to-end; toast tells the user the score will
                refresh soon. */}
            {kol.link && /t\.me\//i.test(kol.link) && (
              <RescanButton kolId={kol.id} onMetricsChanged={onMetricsChanged} />
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="mt-2 flex-1 flex flex-col min-h-0">
          {/* v11 tab chrome — cream-100 base + warm hairline + the
              active-state shadow-card so the lift matches /clients,
              /team, and the parent /kols toolbar. */}
          <TabsList className="grid w-full grid-cols-5 bg-cream-100 p-1 h-auto border border-cream-200 shrink-0">
            <TabsTrigger value="overview" className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card text-sm">Overview</TabsTrigger>
            <TabsTrigger value="score" className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card text-sm">Score</TabsTrigger>
            <TabsTrigger value="deliverables" className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card text-sm">Deliverables</TabsTrigger>
            <TabsTrigger value="snapshots" className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card text-sm">Snapshots</TabsTrigger>
            <TabsTrigger value="calls" className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card text-sm">Call Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 flex-1 overflow-y-auto px-1">
            <OverviewTab kol={kol} onKolChanged={onKolChanged} />
          </TabsContent>

          <TabsContent value="score" className="mt-4 flex-1 overflow-y-auto px-1">
            <ScoreBreakdownTab kolId={kol.id} />
          </TabsContent>

          <TabsContent value="deliverables" className="mt-4 flex-1 overflow-y-auto px-1">
            <DeliverablesTab kolId={kol.id} onMetricsChanged={onMetricsChanged} />
          </TabsContent>

          <TabsContent value="snapshots" className="mt-4 flex-1 overflow-y-auto px-1">
            <SnapshotsTab kolId={kol.id} onMetricsChanged={onMetricsChanged} />
          </TabsContent>

          <TabsContent value="calls" className="mt-4 flex-1 overflow-y-auto px-1">
            <CallLogsTab kolId={kol.id} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────── Rescan button ────────────────────────── */

function RescanButton({
  kolId,
  onMetricsChanged,
}: {
  kolId: string;
  onMetricsChanged?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/kols/${kolId}/rescan`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        toast({
          title: "Rescan failed",
          description: data.error || `HTTP ${res.status}`,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Scan queued",
        description: "Score will refresh in about a minute.",
      });
      // Best-effort: nudge the parent to re-fetch after a delay so the
      // new snapshot lands in the list. The user can also reopen the
      // modal to see it sooner.
      if (onMetricsChanged) {
        setTimeout(() => onMetricsChanged(), 90_000);
      }
    } catch (err: any) {
      toast({
        title: "Rescan failed",
        description: err?.message || String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      title="Re-scan this KOL's TG channel"
      className="text-brand hover:text-brand-dark disabled:opacity-50"
    >
      <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
    </button>
  );
}

/* ─────────────────────────── Shared helpers ─────────────────────────── */

/**
 * Title-case a status string. DB stores statuses as lowercase tokens
 * (`'published'`, `'scheduled'`, `'in_progress'`); displaying them raw
 * looks unfinished. This converts to "Published", "Scheduled",
 * "In Progress" without forcing all-caps that would crowd the badge.
 */
const titleCase = (s: string | null | undefined): string => {
  if (!s) return '';
  return s
    .split(/[\s_-]+/)
    .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
};

/**
 * Structural skeleton mirroring the shape of a content/snapshot/call
 * log row — small chrome header (title + 1-2 chips), 3-5 mini-stats,
 * and an optional notes line. Used across the three loading-data
 * tabs so the loading shell matches the loaded row at a glance.
 */
function RowSkeleton({ stats = 5, notes = true }: { stats?: number; notes?: boolean }) {
  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-12 rounded" />
            <Skeleton className="h-4 w-16 rounded" />
          </div>
          <div className={`mt-2 grid gap-2 grid-cols-${stats}`} style={{ gridTemplateColumns: `repeat(${stats}, minmax(0, 1fr))` }}>
            {Array.from({ length: stats }).map((_, i) => (
              <div key={i} className="text-center space-y-1">
                <Skeleton className="h-2 w-12 mx-auto" />
                <Skeleton className="h-3 w-10 mx-auto" />
              </div>
            ))}
          </div>
          {notes && <Skeleton className="mt-2 h-3 w-3/4" />}
        </div>
        <Skeleton className="h-6 w-6 rounded shrink-0" />
      </div>
    </Card>
  );
}

/* ─────────────────────────── Overview tab ─────────────────────────── */

function OverviewTab({
  kol,
  onKolChanged,
}: {
  kol: MasterKOL;
  onKolChanged?: (updated: MasterKOL) => void;
}) {
  const [notes, setNotes] = useState(kol.notes || "");
  const [savingNotes, setSavingNotes] = useState(false);
  // Latest snapshot — fetched here so the team can see channel health
  // (followers / avg views / ER% / posts-per-week) without flipping to
  // the Snapshots tab. Same row that scoring reads from.
  const [latestSnapshot, setLatestSnapshot] = useState<KolChannelSnapshot | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await KolChannelSnapshotService.getForKol(kol.id);
        if (!cancelled) setLatestSnapshot(rows[0] ?? null);
      } catch (err) {
        console.warn('[OverviewTab] latest snapshot fetch failed', err);
      }
    })();
    return () => { cancelled = true; };
  }, [kol.id]);

  const saveNotes = async () => {
    if (notes === (kol.notes || "")) return;
    setSavingNotes(true);
    try {
      const updated = await KOLService.updateKOL({ id: kol.id, notes });
      onKolChanged?.(updated);
      toast({ title: "Notes saved" });
    } catch (err) {
      toast({ title: "Failed to save notes", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
      console.error(err);
    } finally {
      setSavingNotes(false);
    }
  };

  // Niche + Creator are rendered as chips inside Profile Insights;
  // narrative fields render whether or not they're populated so the
  // team can see what data the AI scan will fill in.
  const niche = kol.niche_tags || [];
  const creator = kol.creator_types || [];

  return (
    <div className="space-y-4 text-sm">
      {/* Profile picture (KOL-AVATAR.4). Falls back to a gray "No pic"
          square when the KOL doesn't have one synced yet. Refresh happens
          from the edit dialog, not here. */}
      {kol.profile_picture_url && (
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-full overflow-hidden bg-cream-100 border border-cream-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={kol.profile_picture_url}
              alt={kol.name}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}
      {/* Compact KOL summary — read-only here; editing happens in the
          /kols list inline. The point of this section is "is this the
          right KOL?", not "edit everything". */}
      <Card className="grid grid-cols-2 gap-3 p-3 bg-cream-50">
        <Field label="Region" value={kol.region || "—"} />
        <Field label="Followers" value={kol.followers ? KOLService.formatFollowers(kol.followers) : "—"} />
        <Field label="Platform" value={(kol.platform || []).join(", ") || "—"} />
        <Field label="In-House" value={kol.in_house || "—"} />
        <Field
          label="Community Founder"
          value={
            kol.community_founder
              ? kol.community_link
                ? <a href={kol.community_link} target="_blank" rel="noreferrer" className="text-brand hover:underline">Yes (link)</a>
                : "Yes"
              : "No"
          }
        />
        <Field label="Group Chat" value={kol.group_chat ? "Yes" : "No"} />
        <Field
          label="Post Price"
          value={kol.post_price != null ? `$${Number(kol.post_price).toLocaleString('en-US')}` : "—"}
        />
        <Field
          label="Share Price"
          value={kol.share_price != null ? `$${Number(kol.share_price).toLocaleString('en-US')}` : "—"}
        />
        {kol.pricing_notes ? <Field label="Pricing Notes" value={kol.pricing_notes} /> : null}
      </Card>
      {/* Score field + per-dim breakdown moved to the dedicated Score
          tab per Jdot Q8 (modal-with-tabs). Single source of truth — no
          stale-prop-vs-fresh-fetch drift between Overview and Score. */}

      {/* Profile Insights — AI-inferred niche / creator type / style /
          audience / brief angle from the Telegram MCP scan (Doc 2 Q7a).
          Always rendered so the team can find the slots; narrative fields
          show an empty-state placeholder until the AI scan populates
          them (triggered from Score tab → Refresh from TG). */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-ink-warm-700">Profile Insights</div>
        <Card className="p-3 space-y-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-warm-500 mr-1">Niche</span>
              {niche.length > 0
                ? niche.map(tag => (
                    <StatusBadge key={tag} tone="brand" size="sm" bordered>{tag}</StatusBadge>
                  ))
                : <span className="text-xs text-ink-warm-400 italic">Not yet inferred</span>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-warm-500 mr-1">Creator</span>
              {creator.length > 0
                ? creator.map(tag => (
                    <StatusBadge key={tag} tone="purple" size="sm" bordered>{tag}</StatusBadge>
                  ))
                : <span className="text-xs text-ink-warm-400 italic">Not yet inferred</span>}
            </div>
          </div>
          <ProfileBlock
            label="Style"
            body={kol.style_summary || null}
            placeholder="Posting style summary will appear after the AI scan."
          />
          <ProfileBlock
            label="Audience"
            body={kol.audience_summary || null}
            placeholder="Audience description will appear after the AI scan."
          />
          <ProfileBlock
            label="Brief Angle"
            body={kol.brief_angle_hint || null}
            placeholder="Activation hook will appear after the AI scan."
          />
          {!kol.style_summary && !kol.audience_summary && !kol.brief_angle_hint && (
            <p className="text-[11px] text-ink-warm-500 italic pt-1 border-t border-cream-100">
              Run an AI scan from the <span className="font-semibold">Score</span> tab → "Refresh from TG" to populate.
            </p>
          )}
        </Card>
      </div>

      {/* Latest Channel Snapshot — surfaces the most recent scan's
          full headline metrics so the team doesn't need to flip to the
          Snapshots tab for at-a-glance channel health. Snapshots tab
          remains the time-series + chart + edit/delete surface. */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <div className="text-xs font-semibold text-ink-warm-700">Latest Channel Snapshot</div>
          {latestSnapshot && (
            <div className="text-[10px] text-ink-warm-500">
              Scanned {formatDate(new Date(latestSnapshot.snapshot_date + 'T00:00:00'))}
            </div>
          )}
        </div>
        {latestSnapshot ? (
          <>
            <Card className="p-3 grid grid-cols-2 md:grid-cols-4 gap-3">
              <SnapshotStat
                label="Followers"
                value={latestSnapshot.follower_count?.toLocaleString() ?? '—'}
              />
              <SnapshotStat
                label="MoM Growth"
                value={
                  latestSnapshot.follower_growth_pct != null
                    ? `${Number(latestSnapshot.follower_growth_pct) > 0 ? '↑' : Number(latestSnapshot.follower_growth_pct) < 0 ? '↓' : '·'} ${Math.abs(Number(latestSnapshot.follower_growth_pct)).toFixed(1)}%`
                    : '—'
                }
              />
              <SnapshotStat
                label="Avg Views"
                value={
                  latestSnapshot.avg_views_per_post != null
                    ? Number(latestSnapshot.avg_views_per_post).toLocaleString()
                    : '—'
                }
              />
              <SnapshotStat
                label="Avg Reactions"
                value={
                  latestSnapshot.avg_reactions_per_post != null
                    ? Number(latestSnapshot.avg_reactions_per_post).toLocaleString()
                    : '—'
                }
              />
              <SnapshotStat
                label="Avg Replies"
                value={
                  latestSnapshot.avg_replies_per_post != null
                    ? Number(latestSnapshot.avg_replies_per_post).toFixed(1)
                    : '—'
                }
              />
              <SnapshotStat
                label="Posts/Wk"
                value={
                  latestSnapshot.posting_frequency != null
                    ? Number(latestSnapshot.posting_frequency).toFixed(1)
                    : '—'
                }
              />
              <SnapshotStat
                label="ER %"
                value={
                  latestSnapshot.engagement_rate != null
                    ? `${(Number(latestSnapshot.engagement_rate) * 100).toFixed(2)}%`
                    : '—'
                }
              />
              <SnapshotStat
                label="Organic Posts"
                value={
                  latestSnapshot.organic_posts_analyzed != null
                    ? Number(latestSnapshot.organic_posts_analyzed).toLocaleString()
                    : '—'
                }
              />
            </Card>
            {latestSnapshot.low_organic_volume_flag && (
              <p className="text-[11px] text-amber-600">
                ⚠ Low organic post volume ({latestSnapshot.organic_posts_analyzed ?? 0} posts analyzed) — engagement numbers may be noisy.
              </p>
            )}
          </>
        ) : (
          <Card className="p-3 text-xs text-ink-warm-400 italic text-center">
            No snapshots yet. Run an AI scan from the Score tab to create one.
          </Card>
        )}
      </div>

      {/* Notes field — editable here. The /kols list also exposes this
          as the "Notes" column, but inline-editing a textarea in a
          table cell is cramped; the modal is a better home. */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-ink-warm-700">Notes</label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Free-form notes about this KOL…"
          className="min-h-[100px] focus-brand"
        />
        {savingNotes && <p className="text-xs text-ink-warm-500">Saving…</p>}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="text-xs">
      <div className="text-ink-warm-500 font-semibold uppercase tracking-wide">{label}</div>
      <div className="mt-0.5 text-ink-warm-900">{value}</div>
    </div>
  );
}

function ProfileBlock({ label, body, placeholder }: { label: string; body: string | null; placeholder?: string }) {
  return (
    <div className="text-xs">
      <div className="text-[10px] text-ink-warm-500 font-semibold uppercase tracking-wide">{label}</div>
      {body ? (
        <div className="mt-0.5 text-ink-warm-900 whitespace-pre-wrap leading-relaxed">{body}</div>
      ) : (
        <div className="mt-0.5 text-ink-warm-400 italic">{placeholder ?? '—'}</div>
      )}
    </div>
  );
}

function SnapshotStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-ink-warm-500 font-semibold uppercase tracking-wide">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-ink-warm-900 tabular-nums">{value}</div>
    </div>
  );
}

/**
 * Single dimension bar in the score breakdown — shows the dimension
 * name + a 0-100 progress bar + the numeric score. Color-codes by
 * value for at-a-glance reading (red <30, yellow 30-50, blue 50-70,
 * green 70+).
 */
function DimensionBar({ label, value }: { label: string; value: number | null }) {
  if (value == null) return (
    <div className="text-center">
      <div className="text-[10px] text-ink-warm-500 uppercase">{label}</div>
      <div className="text-xs text-ink-warm-300">—</div>
    </div>
  );
  const color =
    value >= 70 ? "bg-emerald-500" :
    value >= 50 ? "bg-blue-500" :
    value >= 30 ? "bg-yellow-500" :
    "bg-rose-500";
  return (
    <div className="text-center">
      <div className="text-[10px] text-ink-warm-500 uppercase truncate" title={label}>{label}</div>
      <div className="mt-1 h-1 bg-cream-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${value}%` }} />
      </div>
      <div className="text-[10px] text-ink-warm-700 mt-0.5">{value}</div>
    </div>
  );
}

/* ─────────────────────────── Deliverables tab ─────────────────────────── */

/**
 * [May 2026 KOL overhaul follow-up] The Deliverables tab now pulls
 * from `contents` (the campaign-side deliverables table) via the
 * campaign_kols join, instead of the orphan kol_deliverables table.
 * Rationale:
 *   - contents is where deliverables actually get logged today (271+
 *     real rows) via the campaign workflow. kol_deliverables had ~1
 *     row total — effectively dead.
 *   - One source of truth per concept; eliminates drift between
 *     "what the campaign says we delivered" vs "what the KOL profile
 *     says we delivered."
 *
 * UX is read-mostly: engagement metrics and notes are inline-editable
 * here (those are the KOL-centric updates), but adding new rows or
 * changing campaign assignment happens on the campaign detail page.
 * A "View in campaign" link surfaces on every row.
 *
 * Per the user's exclusion list, we deliberately don't surface
 * post_link, brief_number, brief_topic, date_brief_sent, date_posted,
 * views_48h, or reactions even though some of those have rough
 * equivalents in contents. The display sticks to:
 *   - Campaign (joined), Type, Status, Platform
 *   - Impressions (views_24h proxy), Retweets (forwards proxy)
 *   - Likes, Comments, Bookmarks (contents-native bonus metrics)
 *   - Notes
 */
interface ContentDeliverableRow {
  id: string;
  campaign_id: string;
  type: string | null;
  status: string | null;
  platform: string | null;
  impressions: number | null;
  retweets: number | null;
  likes: number | null;
  comments: number | null;
  bookmarks: number | null;
  notes: string | null;
  updated_at: string | null;
  campaign: { id: string; name: string } | null;
}

function DeliverablesTab({ kolId, onMetricsChanged }: { kolId: string; onMetricsChanged?: () => void }) {
  const [list, setList] = useState<ContentDeliverableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Join chain: master_kols.id → campaign_kols.master_kol_id
        //   → campaign_kols.id = contents.campaign_kols_id
        // We use !inner on campaign_kols so contents rows whose
        // campaign_kol isn't this KOL get filtered out.
        const { data, error } = await (supabase as any)
          .from('contents')
          .select(`
            id, campaign_id, type, status, platform,
            impressions, retweets, likes, comments, bookmarks, notes,
            updated_at,
            campaign:campaigns(id, name),
            campaign_kol:campaign_kols!inner(id, master_kol_id)
          `)
          .eq('campaign_kol.master_kol_id', kolId)
          .order('updated_at', { ascending: false });
        if (error) throw error;
        if (!cancelled) setList((data || []) as ContentDeliverableRow[]);
      } catch (err) {
        console.error('[KolProfileModal] failed to load contents:', err);
        if (!cancelled) toast({ title: 'Failed to load deliverables', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [kolId, toast]);

  // Optimistic update — applied to local state on save; toast on
  // server error and roll back. Matches the pattern used elsewhere in
  // the modal.
  const handleRowSaved = (updated: ContentDeliverableRow) => {
    setList((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    onMetricsChanged?.();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-warm-500">
          {list.length} deliverable{list.length === 1 ? '' : 's'} across all campaigns.
        </p>
        <p className="text-[11px] text-ink-warm-400">
          To add a deliverable, open the campaign and use its Contents tab.
        </p>
      </div>

      {loading ? (
        // Structural skeleton — 3 rows of the same shape as a real
        // deliverable row. Replaces the old "Loading…" text so the
        // tab doesn't visibly shift when data arrives.
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <RowSkeleton key={i} stats={5} notes />
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="text-xs text-ink-warm-500 italic p-4 bg-cream-50 rounded-md text-center">
          No deliverables yet. They'll appear here once content is added to a campaign the KOL is on.
        </p>
      ) : (
        <div className="space-y-2">
          {list.map((d) => (
            <ContentDeliverableRowView key={d.id} row={d} onSaved={handleRowSaved} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Single contents row, displayed read-only by default with a Pencil
 * button that flips into an inline edit form for the engagement
 * metrics + notes only. Other fields (campaign/type/status/platform)
 * are managed from the campaign detail page — a "View in campaign"
 * link surfaces in the corner.
 */
function ContentDeliverableRowView({
  row,
  onSaved,
}: {
  row: ContentDeliverableRow;
  onSaved: (updated: ContentDeliverableRow) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [impressions, setImpressions] = useState<string>(row.impressions?.toString() ?? '');
  const [retweets, setRetweets] = useState<string>(row.retweets?.toString() ?? '');
  const [likes, setLikes] = useState<string>(row.likes?.toString() ?? '');
  const [comments, setComments] = useState<string>(row.comments?.toString() ?? '');
  const [bookmarks, setBookmarks] = useState<string>(row.bookmarks?.toString() ?? '');
  const [notes, setNotes] = useState<string>(row.notes ?? '');
  const { toast } = useToast();

  const numOrNull = (s: string): number | null => {
    if (!s.trim()) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const handleSave = async () => {
    setSaving(true);
    const patch = {
      impressions: numOrNull(impressions) ?? 0,
      retweets: numOrNull(retweets) ?? 0,
      likes: numOrNull(likes) ?? 0,
      comments: numOrNull(comments) ?? 0,
      bookmarks: numOrNull(bookmarks) ?? 0,
      notes: notes.trim() || null,
    };
    try {
      const { data, error } = await (supabase as any)
        .from('contents')
        .update(patch)
        .eq('id', row.id)
        .select(`
          id, campaign_id, type, status, platform,
          impressions, retweets, likes, comments, bookmarks, notes,
          updated_at,
          campaign:campaigns(id, name),
          campaign_kol:campaign_kols!inner(id, master_kol_id)
        `)
        .single();
      if (error) throw error;
      onSaved(data as ContentDeliverableRow);
      setEditing(false);
      toast({ title: 'Saved' });
    } catch (err) {
      console.error('[KolProfileModal] save content patch failed:', err);
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset form state to original row
    setImpressions(row.impressions?.toString() ?? '');
    setRetweets(row.retweets?.toString() ?? '');
    setLikes(row.likes?.toString() ?? '');
    setComments(row.comments?.toString() ?? '');
    setBookmarks(row.bookmarks?.toString() ?? '');
    setNotes(row.notes ?? '');
    setEditing(false);
  };

  // Map free-text status to a centralized StatusBadge tone so the
  // pill draws from the same 9-tone palette used everywhere else
  // (instead of one-off color classes). Falls back to neutral.
  const statusTone: BadgeTone = (() => {
    const s = (row.status || '').toLowerCase();
    if (s === 'published' || s === 'completed' || s === 'posted') return 'success';
    if (s === 'scheduled' || s === 'planned') return 'info';
    if (s === 'cancelled' || s === 'rejected') return 'danger';
    return 'neutral';
  })();

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {row.campaign && (
              <Link
                href={`/campaigns/${row.campaign.id}`}
                className="text-sm font-semibold text-ink-warm-900 hover:text-brand inline-flex items-center gap-1"
                title="Open campaign"
              >
                {row.campaign.name}
                <ExternalLink className="h-3 w-3 text-ink-warm-400" />
              </Link>
            )}
            {row.type && (
              <StatusBadge tone="purple" size="sm" bordered>
                {titleCase(row.type)}
              </StatusBadge>
            )}
            {row.platform && (
              <StatusBadge tone="neutral" size="sm" bordered>
                <span className="uppercase tracking-wide">{row.platform}</span>
              </StatusBadge>
            )}
            {row.status && (
              <StatusBadge tone={statusTone} size="sm" bordered withDot>
                {titleCase(row.status)}
              </StatusBadge>
            )}
          </div>

          {/* Engagement metrics — read mode shows the Stat grid;
              edit mode swaps to number inputs. Includes the spec
              fields we kept (impressions ≈ views_24h, retweets ≈
              forwards) plus contents-native bonus metrics. */}
          {!editing ? (
            <div className="mt-2 grid grid-cols-5 gap-2 text-xs">
              <Stat label="Views" value={row.impressions} />
              <Stat label="Shares" value={row.retweets} />
              <Stat label="Reactions" value={row.likes} />
              <Stat label="Replies" value={row.comments} />
              <Stat label="Saves" value={row.bookmarks} />
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-5 gap-2">
              <NumField label="Views" value={impressions} onChange={setImpressions} />
              <NumField label="Shares" value={retweets} onChange={setRetweets} />
              <NumField label="Reactions" value={likes} onChange={setLikes} />
              <NumField label="Replies" value={comments} onChange={setComments} />
              <NumField label="Saves" value={bookmarks} onChange={setBookmarks} />
            </div>
          )}

          {!editing && row.notes && (
            <p className="mt-2 text-xs text-ink-warm-700 italic">&quot;{row.notes}&quot;</p>
          )}
          {editing && (
            <div className="mt-2">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="min-h-[50px] text-xs focus-brand"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {!editing ? (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} title="Edit metrics & notes">
              <Pencil className="h-3 w-3 text-ink-warm-500" />
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={handleCancel} disabled={saving} title="Cancel">
                <X className="h-3 w-3 text-ink-warm-500" />
              </Button>
              <Button size="sm" variant="ghost" onClick={handleSave} disabled={saving} title="Save">
                <Save className="h-3 w-3 text-emerald-600" />
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] text-ink-warm-500 uppercase text-center">{label}</div>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 text-xs text-center focus-brand"
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-ink-warm-500 uppercase">{label}</div>
      <div className="text-xs font-semibold">{value != null ? value.toLocaleString() : "—"}</div>
    </div>
  );
}

// [May 2026 KOL overhaul follow-up] The old DeliverableForm (which
// wrote to kol_deliverables) was removed in favor of editing
// existing contents rows inline. New deliverables are now created
// from the campaign detail page's Contents tab — that's the single
// source of truth.

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold text-ink-warm-700 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

/* ─────────────────────────── Snapshots tab ─────────────────────────── */

function SnapshotsTab({ kolId, onMetricsChanged }: { kolId: string; onMetricsChanged?: () => void }) {
  const [list, setList] = useState<KolChannelSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  // v11 destructive-Dialog state — replaces the native confirm() that
  // previously gated the snapshot delete (2026-06-05). Holds the full
  // snapshot row so the Dialog title can show the month label.
  const [deleteSnapshotPending, setDeleteSnapshotPending] = useState<KolChannelSnapshot | null>(null);
  const [deletingSnapshot, setDeletingSnapshot] = useState(false);
  const { toast } = useToast();

  const refresh = async () => {
    try {
      const rows = await KolChannelSnapshotService.getForKol(kolId);
      setList(rows);
    } catch (err) {
      toast({ title: "Failed to load snapshots", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kolId]);

  const handleAdded = async (row: KolChannelSnapshot) => {
    // Re-fetch instead of prepending — UPSERT can replace an existing
    // row at the same (kol, month), and we want to reflect that
    // correctly without doing the dedupe ourselves.
    setShowAddForm(false);
    toast({ title: "Snapshot saved" });
    await refresh();
    onMetricsChanged?.();
  };

  // Stage the snapshot for the v11 confirm Dialog; the actual delete
  // fires from confirmDeleteSnapshot below.
  const handleDelete = (snapshot: KolChannelSnapshot) => {
    setDeleteSnapshotPending(snapshot);
  };

  const confirmDeleteSnapshot = async () => {
    if (!deleteSnapshotPending) return;
    const id = deleteSnapshotPending.id;
    const previous = list;
    setDeletingSnapshot(true);
    setList((prev) => prev.filter((s) => s.id !== id));
    try {
      await KolChannelSnapshotService.delete(id);
      onMetricsChanged?.();
      setDeleteSnapshotPending(null);
    } catch (err) {
      setList(previous);
      toast({ title: "Failed to delete snapshot", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setDeletingSnapshot(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-warm-500">
          {list.length} monthly snapshot{list.length === 1 ? "" : "s"} logged.
          {list.length < 2 && (
            <span className="ml-1 text-amber-600">
              Growth Trajectory needs ≥2 to compute.
            </span>
          )}
        </p>
        {!showAddForm && (
          <Button size="sm" variant="outline" onClick={() => setShowAddForm(true)}>
            <Plus className="h-3 w-3 mr-1" /> Add Snapshot
          </Button>
        )}
      </div>

      {showAddForm && (
        <SnapshotForm
          kolId={kolId}
          onCancel={() => setShowAddForm(false)}
          onSaved={handleAdded}
        />
      )}

      {loading ? (
        // Snapshot rows have 4 mini-stats (Views/Reactions/Posts/ER)
        // so the skeleton uses stats=4 to match the loaded shape.
        <div className="space-y-2">
          <Skeleton className="h-44 rounded-lg" />
          {Array.from({ length: 3 }).map((_, i) => (
            <RowSkeleton key={i} stats={4} notes={false} />
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="text-xs text-ink-warm-500 italic p-4 bg-cream-50 rounded-md text-center">
          No snapshots yet. Log a monthly snapshot to feed the Channel Health and Growth Trajectory score dimensions.
        </p>
      ) : (
        <div className="space-y-3">
          <SnapshotTrendChart rows={list} />
          <div className="space-y-2">
            {list.map((s) => (
              <SnapshotRow key={s.id} s={s} onDelete={() => handleDelete(s)} />
            ))}
          </div>
        </div>
      )}

      {/* Delete-snapshot confirm — v11 destructive Dialog replacing
          the native confirm() that previously gated `handleDelete`.
          Nested inside the parent KolProfileModal Dialog; depth-aware
          overlay in `components/ui/dialog.tsx` handles the stacked
          backdrop. 2026-06-05. */}
      <Dialog open={!!deleteSnapshotPending} onOpenChange={(open) => { if (!open && !deletingSnapshot) setDeleteSnapshotPending(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Trash2 className="h-4 w-4 text-rose-500" />
              Delete Snapshot?
            </DialogTitle>
            <DialogDescription className="text-sm text-ink-warm-700 pt-2">
              This follower-count snapshot will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setDeleteSnapshotPending(null)} disabled={deletingSnapshot}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteSnapshot} disabled={deletingSnapshot}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              {deletingSnapshot ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Time-series chart for the Snapshots tab. Renders three lines —
 * followers / avg views / ER % — sharing the X axis (month) but using
 * separate Y axes so the very different magnitudes are all readable.
 * Hides itself when there's only one snapshot (a chart of one point is
 * just a dot).
 */
function SnapshotTrendChart({ rows }: { rows: KolChannelSnapshot[] }) {
  // recharts wants data oldest-first along the X axis; the service
  // returns newest-first, so reverse + flatten the fields we plot.
  const data = [...rows]
    .reverse()
    .map(r => ({
      month: (() => {
        const d = new Date(r.snapshot_date + 'T00:00:00');
        return isNaN(d.getTime())
          ? r.snapshot_date
          // Monthly chart axis — "Jun '26" style; mm/dd/yyyy would be
          // misleading on a month-granularity series (CLAUDE.md carve-out).
          // lint-conventions: disable-next-line no-raw-toLocaleDateString
          : d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      })(),
      followers: r.follower_count ?? null,
      avgViews: r.avg_views_per_post != null ? Number(r.avg_views_per_post) : null,
      erPct: r.engagement_rate != null ? Number((Number(r.engagement_rate) * 100).toFixed(2)) : null,
    }));

  if (data.length < 2) return null;

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-ink-warm-700">Channel Trend</div>
        <div className="flex items-center gap-3 text-[10px] text-ink-warm-500">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3e8692' }} />Followers
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#8b5cf6' }} />Avg Views
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#f59e0b' }} />ER %
          </span>
        </div>
      </div>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#6b7280' }} />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10, fill: '#6b7280' }}
              tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: '#6b7280' }}
              tickFormatter={(v) => `${v}%`}
            />
            <ChartTooltip
              formatter={(value: any, name: any) => {
                if (name === 'ER %') return [`${value}%`, name];
                if (typeof value === 'number') return [value.toLocaleString(), name];
                return [value, name];
              }}
              labelStyle={{ fontSize: 11 }}
              contentStyle={{ fontSize: 11 }}
            />
            <Line yAxisId="left" type="monotone" dataKey="followers" name="Followers" stroke="#3e8692" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Line yAxisId="left" type="monotone" dataKey="avgViews" name="Avg Views" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Line yAxisId="right" type="monotone" dataKey="erPct" name="ER %" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function SnapshotRow({ s, onDelete }: { s: KolChannelSnapshot; onDelete: () => void }) {
  // Snapshot dates are stored as YYYY-MM-DD (always 1st of month per
  // spec). Display as "Mon YYYY" since the day is meaningless.
  const monthLabel = (() => {
    const d = new Date(s.snapshot_date + "T00:00:00");
    return isNaN(d.getTime()) ? s.snapshot_date : formatDate(d);
  })();

  // Computed columns from mig 075. Show alongside the raw stats so
  // the team can see the derived metrics that feed Score without
  // dropping to SQL. NULL on first snapshots (growth needs a prior)
  // and on follower-count-only auto-pulls (ER needs avg_views).
  const growthPct = s.follower_growth_pct != null ? Number(s.follower_growth_pct) : null;
  const engagementRate = s.engagement_rate != null ? Number(s.engagement_rate) : null;

  // MoM growth tone — picked once so the badge below + any aria
  // hints stay in sync. neutral covers exact-zero (no movement).
  const growthTone: BadgeTone = growthPct == null
    ? 'neutral'
    : growthPct > 0 ? 'success' : growthPct < 0 ? 'danger' : 'neutral';

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-ink-warm-900">{monthLabel}</span>
            <StatusBadge tone="neutral" size="sm" bordered>
              {s.follower_count.toLocaleString()} followers
            </StatusBadge>
            {/* MoM growth as a StatusBadge — tone encodes direction
                (success up / danger down / neutral flat) so the
                trend reads at a glance without parsing the number. */}
            {growthPct != null && (
              <StatusBadge tone={growthTone} size="sm" bordered>
                <span title="Month-over-month follower growth">
                  {growthPct > 0 ? '↑' : growthPct < 0 ? '↓' : '·'} {Math.abs(growthPct).toFixed(1)}%
                </span>
              </StatusBadge>
            )}
            {/* Doc 2 §4 — surface low-organic-volume so the team knows
                this row's engagement numbers are noisy and shouldn't
                drive a confident scoring decision on their own. */}
            {s.low_organic_volume_flag && (
              <StatusBadge tone="warning" size="sm" bordered>
                <span title={`Only ${s.organic_posts_analyzed ?? 0} organic posts in sample`}>
                  Low organic volume
                </span>
              </StatusBadge>
            )}
          </div>
          {/* [May 2026 KOL overhaul follow-up] avg_forwards_per_post
              intentionally dropped per the user's exclusion list. The
              column still exists in kol_channel_snapshots for
              compatibility but isn't surfaced or written from the UI. */}
          <div className="mt-2 grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
            <Stat label="Avg Views" value={s.avg_views_per_post} />
            <Stat label="Avg Reactions" value={s.avg_reactions_per_post} />
            <Stat label="Avg Replies" value={s.avg_replies_per_post} />
            <Stat label="Posts/Wk" value={s.posting_frequency != null ? Number(s.posting_frequency) : null} />
            {/* Engagement rate (avg_views / followers) — formatted as
                a percentage with 2 decimals for sub-1% precision
                (typical TG channel ER is 0.05-3%). */}
            <Stat
              label="ER %"
              value={engagementRate != null ? Number((engagementRate * 100).toFixed(2)) : null}
            />
            <Stat label="Organic Posts" value={s.organic_posts_analyzed} />
          </div>
          {s.notes && <p className="mt-2 text-xs text-ink-warm-700 italic">"{s.notes}"</p>}
        </div>
        <Button size="sm" variant="ghost" onClick={onDelete} title="Delete">
          <Trash2 className="h-3 w-3 text-rose-500" />
        </Button>
      </div>
    </Card>
  );
}

function SnapshotForm({
  kolId,
  onCancel,
  onSaved,
}: {
  kolId: string;
  onCancel: () => void;
  onSaved: (row: KolChannelSnapshot) => void;
}) {
  // Default to the first of the current month — matches the spec's
  // "snapshot_date = first of month" convention.
  const firstOfMonth = (() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  })();
  const [snapshotDate, setSnapshotDate] = useState(firstOfMonth);
  const [followerCount, setFollowerCount] = useState<string>("");
  const [avgViews, setAvgViews] = useState<string>("");
  // [May 2026 KOL overhaul follow-up] avgForwards field removed per
  // user's exclusion list. avg_forwards_per_post column kept in the
  // table for compat but no longer set from the UI.
  const [avgReactions, setAvgReactions] = useState<string>("");
  const [postingFreq, setPostingFreq] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const numOrNull = (s: string): number | null => {
    if (!s.trim()) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const followers = numOrNull(followerCount);
    if (followers == null || followers < 0) {
      toast({ title: "Follower count is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const input: CreateKolChannelSnapshotInput = {
      kol_id: kolId,
      snapshot_date: snapshotDate,
      follower_count: followers,
      avg_views_per_post: numOrNull(avgViews),
      avg_reactions_per_post: numOrNull(avgReactions),
      posting_frequency: numOrNull(postingFreq),
      notes: notes.trim() || null,
    };
    try {
      const row = await KolChannelSnapshotService.upsert(input);
      onSaved(row);
    } catch (err) {
      toast({ title: "Failed to save snapshot", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-[14px] border border-cream-200 p-3 bg-cream-50 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Snapshot Month *">
          {/* TODO: migrate to DateField pattern (Popover + Calendar).
              lint-conventions: disable-next-line no-input-type-date */}
          <Input type="date" value={snapshotDate} onChange={(e) => setSnapshotDate(e.target.value)} className="h-8 text-xs focus-brand" />
        </FormField>
        <FormField label="Follower Count *">
          <Input type="number" min={0} value={followerCount} onChange={(e) => setFollowerCount(e.target.value)} className="h-8 text-xs focus-brand" placeholder="e.g. 12500" />
        </FormField>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <FormField label="Avg Views"><Input type="number" value={avgViews} onChange={(e) => setAvgViews(e.target.value)} className="h-8 text-xs focus-brand" /></FormField>
        <FormField label="Avg Reactions"><Input type="number" value={avgReactions} onChange={(e) => setAvgReactions(e.target.value)} className="h-8 text-xs focus-brand" /></FormField>
        <FormField label="Posts/Week"><Input type="number" step="0.1" value={postingFreq} onChange={(e) => setPostingFreq(e.target.value)} className="h-8 text-xs focus-brand" /></FormField>
      </div>
      <FormField label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[50px] text-xs focus-brand" placeholder="e.g. KOL took a 2-week break, posting frequency dipped" />
      </FormField>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      </div>
      <p className="text-[10px] text-ink-warm-500 mt-1">
        Tip: Saving the same month twice updates the existing entry (no duplicates).
      </p>
    </form>
  );
}

/* ─────────────────────────── Call Logs tab ─────────────────────────── */

function CallLogsTab({ kolId }: { kolId: string }) {
  const [list, setList] = useState<KolCallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  // [2026-07-03] Inline edit — one row editable at a time. `null` = no edit.
  const [editingId, setEditingId] = useState<string | null>(null);
  // v11 destructive-Dialog state — replaces the native confirm() that
  // previously gated the call-log delete (2026-06-05). Holds the full
  // log row so the Dialog can include the call date if we want it later.
  const [deleteCallLogPending, setDeleteCallLogPending] = useState<KolCallLog | null>(null);
  const [deletingCallLog, setDeletingCallLog] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await KolCallLogService.getForKol(kolId);
        if (!cancelled) setList(rows);
      } catch (err) {
        if (!cancelled) toast({ title: "Failed to load call logs", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [kolId, toast]);

  const handleAdded = (row: KolCallLog) => {
    setList((prev) => [row, ...prev]);
    setShowAddForm(false);
    toast({ title: "Call log added" });
  };

  const handleUpdated = (row: KolCallLog) => {
    setList((prev) => prev.map((c) => (c.id === row.id ? row : c)));
    setEditingId(null);
    toast({ title: "Call log updated" });
  };

  // Stage the call log for the v11 confirm Dialog; the actual delete
  // fires from confirmDeleteCallLog below.
  const handleDelete = (log: KolCallLog) => {
    setDeleteCallLogPending(log);
  };

  const confirmDeleteCallLog = async () => {
    if (!deleteCallLogPending) return;
    const id = deleteCallLogPending.id;
    const previous = list;
    setDeletingCallLog(true);
    setList((prev) => prev.filter((c) => c.id !== id));
    try {
      await KolCallLogService.delete(id);
      setDeleteCallLogPending(null);
    } catch (err) {
      setList(previous);
      toast({ title: "Failed to delete call log", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setDeletingCallLog(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-warm-500">{list.length} call log{list.length === 1 ? "" : "s"}.</p>
        {!showAddForm && !editingId && (
          <Button size="sm" variant="brand" onClick={() => setShowAddForm(true)}>
            <Plus className="h-3 w-3 mr-1" /> Add Call Log
          </Button>
        )}
      </div>

      {showAddForm && (
        <CallLogForm
          kolId={kolId}
          onCancel={() => setShowAddForm(false)}
          onSaved={handleAdded}
        />
      )}

      {loading ? (
        // Call logs are mostly notes — skeleton uses stats=0 and a
        // small notes line via the helper to imply the prose body.
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <RowSkeleton key={i} stats={1} notes />
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="text-xs text-ink-warm-500 italic p-4 bg-cream-50 rounded-md text-center">
          No call logs yet. Add one after your next call with this KOL.
        </p>
      ) : (
        <div className="space-y-2">
          {list.map((c) => (
            editingId === c.id ? (
              <CallLogForm
                key={c.id}
                kolId={kolId}
                initial={c}
                onCancel={() => setEditingId(null)}
                onSaved={handleUpdated}
              />
            ) : (
              <CallLogRow
                key={c.id}
                c={c}
                onEdit={() => { setEditingId(c.id); setShowAddForm(false); }}
                onDelete={() => handleDelete(c)}
              />
            )
          ))}
        </div>
      )}

      {/* Delete-call-log confirm — v11 destructive Dialog replacing
          the native confirm() that previously gated `handleDelete`.
          Own pending state (separate from Snapshots) to avoid
          mix-ups. 2026-06-05. */}
      <Dialog open={!!deleteCallLogPending} onOpenChange={(open) => { if (!open && !deletingCallLog) setDeleteCallLogPending(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Trash2 className="h-4 w-4 text-rose-500" />
              Delete Call Log?
            </DialogTitle>
            <DialogDescription className="text-sm text-ink-warm-700 pt-2">
              This call log will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setDeleteCallLogPending(null)} disabled={deletingCallLog}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteCallLog} disabled={deletingCallLog}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              {deletingCallLog ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CallLogRow({ c, onEdit, onDelete }: { c: KolCallLog; onEdit: () => void; onDelete: () => void }) {
  return (
    <Card className="p-3 border-l-2 border-l-brand transition-colors hover:bg-brand-light/20">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-ink-warm-900">{formatDate(c.call_date)}</span>
            {c.call_type && (
              <StatusBadge tone="brand" size="sm" bordered>
                {titleCase(c.call_type)}
              </StatusBadge>
            )}
            {c.project && (
              <StatusBadge tone="neutral" size="sm" bordered>
                {c.project}
              </StatusBadge>
            )}
          </div>
          <div className="mt-2 space-y-1.5 text-xs">
            {c.notes && <Section label="Notes" body={c.notes} />}
            {c.market_intel && <Section label="Market Intel" body={c.market_intel} />}
            {c.recommended_angle && <Section label="Recommended Angle" body={c.recommended_angle} />}
            {c.feedback_on_hh && <Section label="Feedback on HH" body={c.feedback_on_hh} />}
          </div>
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          <Button size="sm" variant="ghost" onClick={onEdit} title="Edit" className="h-7 w-7 p-0">
            <Pencil className="h-3 w-3 text-brand" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} title="Delete" className="h-7 w-7 p-0">
            <Trash2 className="h-3 w-3 text-rose-500" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Section({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <span className="text-[10px] font-semibold text-ink-warm-500 uppercase">{label}: </span>
      <span className="text-ink-warm-700">{body}</span>
    </div>
  );
}

function CallLogForm({
  kolId,
  initial,
  onCancel,
  onSaved,
}: {
  kolId: string;
  initial?: KolCallLog | null;
  onCancel: () => void;
  onSaved: (row: KolCallLog) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const isEdit = !!initial;
  const [callDate, setCallDate] = useState(initial?.call_date ?? today);
  const [callType, setCallType] = useState<string>(initial?.call_type ?? "");
  const [project, setProject] = useState(initial?.project ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [marketIntel, setMarketIntel] = useState(initial?.market_intel ?? "");
  const [recommendedAngle, setRecommendedAngle] = useState(initial?.recommended_angle ?? "");
  const [feedback, setFeedback] = useState(initial?.feedback_on_hh ?? "");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let row: KolCallLog;
      if (isEdit && initial) {
        row = await KolCallLogService.update(initial.id, {
          call_date: callDate,
          call_type: callType || null,
          project: project.trim() || null,
          notes: notes.trim() || null,
          market_intel: marketIntel.trim() || null,
          recommended_angle: recommendedAngle.trim() || null,
          feedback_on_hh: feedback.trim() || null,
        });
      } else {
        const input: CreateKolCallLogInput = {
          kol_id: kolId,
          call_date: callDate,
          call_type: callType || null,
          project: project.trim() || null,
          notes: notes.trim() || null,
          market_intel: marketIntel.trim() || null,
          recommended_angle: recommendedAngle.trim() || null,
          feedback_on_hh: feedback.trim() || null,
        };
        row = await KolCallLogService.create(input);
      }
      onSaved(row);
    } catch (err) {
      toast({ title: `Failed to ${isEdit ? 'update' : 'save'} call log`, description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-[14px] border-l-2 border-l-brand border border-cream-200 p-3 bg-cream-50 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <FormField label="Date *">
          {/* [2026-06-16] Canonical Popover + Calendar pattern per
              CLAUDE.md (replaces the previous <Input type="date">). */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-8 w-full justify-start font-normal text-xs focus-brand"
              >
                <CalendarIcon className="mr-2 h-3 w-3" />
                {callDate ? formatDate(callDate + 'T00:00:00') : 'Select date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
              <Calendar
                mode="single"
                selected={callDate ? new Date(callDate + 'T00:00:00') : undefined}
                onSelect={(d) => {
                  if (d) {
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    setCallDate(`${y}-${m}-${day}`);
                  }
                }}
                classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
              />
            </PopoverContent>
          </Popover>
        </FormField>
        <FormField label="Call Type">
          <Select value={callType} onValueChange={setCallType}>
            <SelectTrigger className="h-8 text-xs focus-brand"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {CALL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Project">
          <Input value={project} onChange={(e) => setProject(e.target.value)} className="h-8 text-xs focus-brand" placeholder="e.g. Valiant" />
        </FormField>
      </div>
      <FormField label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[50px] text-xs focus-brand" placeholder="General debrief…" />
      </FormField>
      <FormField label="Market Intel">
        <Textarea value={marketIntel} onChange={(e) => setMarketIntel(e.target.value)} className="min-h-[50px] text-xs focus-brand" placeholder="Narratives/trends the KOL flagged…" />
      </FormField>
      <FormField label="Recommended Angle">
        <Textarea value={recommendedAngle} onChange={(e) => setRecommendedAngle(e.target.value)} className="min-h-[50px] text-xs focus-brand" placeholder="Content approach they suggested…" />
      </FormField>
      <FormField label="Feedback on HH">
        <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} className="min-h-[50px] text-xs focus-brand" placeholder="What they liked/disliked about working with us…" />
      </FormField>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" size="sm" variant="brand" disabled={saving}>{saving ? (isEdit ? "Updating…" : "Saving…") : (isEdit ? "Update" : "Save")}</Button>
      </div>
    </form>
  );
}
