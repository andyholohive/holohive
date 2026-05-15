"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ExternalLink, Pencil, Save, X } from "lucide-react";
import { MasterKOL, KOLService } from "@/lib/kolService";
import {
  KolDeliverableService,
  type KolDeliverable,
  type CreateKolDeliverableInput,
} from "@/lib/kolDeliverableService";
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
import { tierForScore, type KolScoreResult } from "@/lib/kolScoringEngine";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

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
  /** Pre-computed score from the parent's roster-wide normalization.
   *  Optional — if absent the Overview tab shows a placeholder. */
  score?: KolScoreResult | null;
  /** Bumped by the parent when snapshots/deliverables change so the
   *  parent can re-run computeRosterScores. Optional callback. */
  onMetricsChanged?: () => void;
}

export function KolProfileModal({
  kol,
  isOpen,
  onClose,
  onKolChanged,
  score,
  onMetricsChanged,
}: KolProfileModalProps) {
  if (!kol) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{kol.name}</span>
            {kol.link && (
              <a
                href={kol.link}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:text-blue-800"
                title="Open KOL link"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="mt-2">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="deliverables">Deliverables</TabsTrigger>
            <TabsTrigger value="snapshots">Snapshots</TabsTrigger>
            <TabsTrigger value="calls">Call Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <OverviewTab kol={kol} onKolChanged={onKolChanged} score={score} />
          </TabsContent>

          <TabsContent value="deliverables" className="mt-4">
            <DeliverablesTab kolId={kol.id} onMetricsChanged={onMetricsChanged} />
          </TabsContent>

          <TabsContent value="snapshots" className="mt-4">
            <SnapshotsTab kolId={kol.id} onMetricsChanged={onMetricsChanged} />
          </TabsContent>

          <TabsContent value="calls" className="mt-4">
            <CallLogsTab kolId={kol.id} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────── Overview tab ─────────────────────────── */

function OverviewTab({
  kol,
  onKolChanged,
  score,
}: {
  kol: MasterKOL;
  onKolChanged?: (updated: MasterKOL) => void;
  score?: KolScoreResult | null;
}) {
  const [notes, setNotes] = useState(kol.description || "");
  const [savingNotes, setSavingNotes] = useState(false);
  const { toast } = useToast();

  const saveNotes = async () => {
    if (notes === (kol.description || "")) return;
    setSavingNotes(true);
    try {
      const updated = await KOLService.updateKOL({ id: kol.id, description: notes });
      onKolChanged?.(updated);
      toast({ title: "Notes saved" });
    } catch (err) {
      toast({ title: "Failed to save notes", variant: "destructive" });
      console.error(err);
    } finally {
      setSavingNotes(false);
    }
  };

  return (
    <div className="space-y-4 text-sm">
      {/* Compact KOL summary — read-only here; editing happens in the
          /kols list inline. The point of this section is "is this the
          right KOL?", not "edit everything". */}
      <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-md">
        <Field label="Region" value={kol.region || "—"} />
        <Field label="Followers" value={kol.followers ? KOLService.formatFollowers(kol.followers) : "—"} />
        <Field label="Platform" value={(kol.platform || []).join(", ") || "—"} />
        <Field label="In-House" value={kol.in_house || "—"} />
        <Field
          label="Community Founder"
          value={
            kol.community
              ? kol.community_link
                ? <a href={kol.community_link} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Yes (link)</a>
                : "Yes"
              : "No"
          }
        />
        <Field label="Group Chat" value={kol.group_chat ? "Yes" : "No"} />
        <Field label="Pricing" value={kol.pricing || "—"} />
        <Field
          label="Score"
          value={
            score?.score != null ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="font-semibold">{score.score}</span>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${tierForScore(score.score).classes}`}>
                  {tierForScore(score.score).label}
                </span>
              </span>
            ) : (
              <span className="text-gray-400" title={score?.reason || undefined}>
                {score?.reason ? "Insufficient data" : "—"}
              </span>
            )
          }
        />
      </div>

      {/* Per-dimension breakdown — only when a score exists. Helps the
          team understand WHY a KOL scored a given number. */}
      {score?.score != null && score.dimensions && (
        <div className="grid grid-cols-5 gap-2 p-3 bg-white border border-gray-200 rounded-md">
          <DimensionBar label="Engagement" value={score.dimensions.engagement_quality} />
          <DimensionBar label="Reach" value={score.dimensions.reach_efficiency} />
          <DimensionBar label="Channel" value={score.dimensions.channel_health} />
          <DimensionBar label="Growth" value={score.dimensions.growth_trajectory} />
          <DimensionBar label="Activation" value={score.dimensions.activation_impact} />
        </div>
      )}

      {/* Notes field — editable here. The /kols list also exposes this
          as the "Notes" column, but inline-editing a textarea in a
          table cell is cramped; the modal is a better home. */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-700">Notes</label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Free-form notes about this KOL…"
          className="min-h-[100px] focus-brand"
        />
        {savingNotes && <p className="text-xs text-gray-500">Saving…</p>}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="text-xs">
      <div className="text-gray-500 font-semibold uppercase tracking-wide">{label}</div>
      <div className="mt-0.5 text-gray-900">{value}</div>
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
      <div className="text-[10px] text-gray-500 uppercase">{label}</div>
      <div className="text-xs text-gray-300">—</div>
    </div>
  );
  const color =
    value >= 70 ? "bg-emerald-500" :
    value >= 50 ? "bg-blue-500" :
    value >= 30 ? "bg-yellow-500" :
    "bg-red-500";
  return (
    <div className="text-center">
      <div className="text-[10px] text-gray-500 uppercase truncate" title={label}>{label}</div>
      <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${value}%` }} />
      </div>
      <div className="text-[10px] text-gray-700 mt-0.5">{value}</div>
    </div>
  );
}

/* ─────────────────────────── Deliverables tab ─────────────────────────── */

interface CampaignOption {
  id: string;
  name: string;
}

function DeliverablesTab({ kolId, onMetricsChanged }: { kolId: string; onMetricsChanged?: () => void }) {
  const [list, setList] = useState<KolDeliverable[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await KolDeliverableService.getForKol(kolId);
        if (!cancelled) setList(rows);
      } catch {
        if (!cancelled) toast({ title: "Failed to load deliverables", variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [kolId, toast]);

  // Pull non-archived campaigns once for the dropdown. Lightweight —
  // typical org has <200 active campaigns so no pagination needed.
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("campaigns")
        .select("id, name")
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      setCampaigns((data || []) as CampaignOption[]);
    })();
  }, []);

  const handleAdded = (row: KolDeliverable) => {
    setList((prev) => [row, ...prev]);
    setShowAddForm(false);
    toast({ title: "Deliverable logged" });
    onMetricsChanged?.();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this deliverable?")) return;
    const previous = list;
    setList((prev) => prev.filter((d) => d.id !== id));
    try {
      await KolDeliverableService.delete(id);
      onMetricsChanged?.();
    } catch {
      setList(previous);
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          {list.length} deliverable{list.length === 1 ? "" : "s"} logged.
          {list.length < 3 && (
            <span className="ml-1 text-amber-600">
              Score requires 3+ entries (Phase 3).
            </span>
          )}
        </p>
        {!showAddForm && (
          <Button size="sm" variant="outline" onClick={() => setShowAddForm(true)}>
            <Plus className="h-3 w-3 mr-1" /> Add Deliverable
          </Button>
        )}
      </div>

      {showAddForm && (
        <DeliverableForm
          kolId={kolId}
          campaigns={campaigns}
          onCancel={() => setShowAddForm(false)}
          onSaved={handleAdded}
        />
      )}

      {loading ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-xs text-gray-500 italic p-4 bg-gray-50 rounded-md text-center">
          No deliverables logged yet. Click "Add Deliverable" after a KOL posts.
        </p>
      ) : (
        <div className="space-y-2">
          {list.map((d) => (
            <DeliverableRow key={d.id} d={d} onDelete={() => handleDelete(d.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DeliverableRow({ d, onDelete }: { d: KolDeliverable; onDelete: () => void }) {
  return (
    <div className="border border-gray-200 rounded-md p-3 bg-white">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">#{d.brief_number} {d.brief_topic}</span>
            {d.campaign && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                {d.campaign.name}
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-gray-600">
            <a href={d.post_link} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate block max-w-md">
              {d.post_link}
            </a>
          </div>
          <div className="mt-2 grid grid-cols-5 gap-2 text-xs">
            <Stat label="24h Views" value={d.views_24h} />
            <Stat label="48h Views" value={d.views_48h} />
            <Stat label="Forwards" value={d.forwards} />
            <Stat label="Reactions" value={d.reactions} />
            <Stat label="Activations" value={d.activation_participants} />
          </div>
          {d.notes && <p className="mt-2 text-xs text-gray-600 italic">"{d.notes}"</p>}
        </div>
        <Button size="sm" variant="ghost" onClick={onDelete} title="Delete">
          <Trash2 className="h-3 w-3 text-red-500" />
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-gray-500 uppercase">{label}</div>
      <div className="text-xs font-semibold">{value != null ? value.toLocaleString() : "—"}</div>
    </div>
  );
}

function DeliverableForm({
  kolId,
  campaigns,
  onCancel,
  onSaved,
}: {
  kolId: string;
  campaigns: CampaignOption[];
  onCancel: () => void;
  onSaved: (row: KolDeliverable) => void;
}) {
  const [campaignId, setCampaignId] = useState("");
  const [briefNumber, setBriefNumber] = useState<number>(1);
  const [briefTopic, setBriefTopic] = useState("");
  const [postLink, setPostLink] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [dateBriefSent, setDateBriefSent] = useState(today);
  const [datePosted, setDatePosted] = useState(today);
  const [views24h, setViews24h] = useState<string>("");
  const [views48h, setViews48h] = useState<string>("");
  const [forwards, setForwards] = useState<string>("");
  const [reactions, setReactions] = useState<string>("");
  const [activations, setActivations] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Auto-suggest the next brief number when the campaign changes.
  useEffect(() => {
    if (!campaignId) return;
    KolDeliverableService.nextBriefNumber(kolId, campaignId)
      .then(setBriefNumber)
      .catch(() => setBriefNumber(1));
  }, [kolId, campaignId]);

  const numOrNull = (s: string): number | null => {
    if (!s.trim()) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignId) {
      toast({ title: "Campaign required", variant: "destructive" });
      return;
    }
    if (!briefTopic.trim() || !postLink.trim()) {
      toast({ title: "Topic and post link are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const input: CreateKolDeliverableInput = {
      kol_id: kolId,
      campaign_id: campaignId,
      brief_number: briefNumber,
      brief_topic: briefTopic.trim(),
      post_link: postLink.trim(),
      date_brief_sent: new Date(dateBriefSent).toISOString(),
      date_posted: new Date(datePosted).toISOString(),
      views_24h: numOrNull(views24h),
      views_48h: numOrNull(views48h),
      forwards: numOrNull(forwards),
      reactions: numOrNull(reactions),
      activation_participants: numOrNull(activations),
      notes: notes.trim() || null,
    };
    try {
      const row = await KolDeliverableService.create(input);
      onSaved(row);
    } catch {
      toast({ title: "Failed to save deliverable", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border border-gray-200 rounded-md p-3 bg-gray-50 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Campaign *">
          <Select value={campaignId} onValueChange={setCampaignId}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select campaign…" /></SelectTrigger>
            <SelectContent>
              {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Brief #">
          <Input type="number" min={1} value={briefNumber} onChange={(e) => setBriefNumber(Number(e.target.value) || 1)} className="h-8 text-xs" />
        </FormField>
        <FormField label="Brief Topic *">
          <Input value={briefTopic} onChange={(e) => setBriefTopic(e.target.value)} className="h-8 text-xs" placeholder="e.g. Valiant Onboarding" />
        </FormField>
        <FormField label="Post Link *">
          <Input value={postLink} onChange={(e) => setPostLink(e.target.value)} className="h-8 text-xs" placeholder="https://…" />
        </FormField>
        <FormField label="Date Brief Sent">
          <Input type="date" value={dateBriefSent} onChange={(e) => setDateBriefSent(e.target.value)} className="h-8 text-xs" />
        </FormField>
        <FormField label="Date Posted">
          <Input type="date" value={datePosted} onChange={(e) => setDatePosted(e.target.value)} className="h-8 text-xs" />
        </FormField>
      </div>
      <div className="grid grid-cols-5 gap-2">
        <FormField label="24h Views"><Input type="number" value={views24h} onChange={(e) => setViews24h(e.target.value)} className="h-8 text-xs" /></FormField>
        <FormField label="48h Views"><Input type="number" value={views48h} onChange={(e) => setViews48h(e.target.value)} className="h-8 text-xs" /></FormField>
        <FormField label="Forwards"><Input type="number" value={forwards} onChange={(e) => setForwards(e.target.value)} className="h-8 text-xs" /></FormField>
        <FormField label="Reactions"><Input type="number" value={reactions} onChange={(e) => setReactions(e.target.value)} className="h-8 text-xs" /></FormField>
        <FormField label="Activations"><Input type="number" value={activations} onChange={(e) => setActivations(e.target.value)} className="h-8 text-xs" /></FormField>
      </div>
      <FormField label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[50px] text-xs" placeholder="Anything unusual?" />
      </FormField>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

/* ─────────────────────────── Snapshots tab ─────────────────────────── */

function SnapshotsTab({ kolId, onMetricsChanged }: { kolId: string; onMetricsChanged?: () => void }) {
  const [list, setList] = useState<KolChannelSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const { toast } = useToast();

  const refresh = async () => {
    try {
      const rows = await KolChannelSnapshotService.getForKol(kolId);
      setList(rows);
    } catch {
      toast({ title: "Failed to load snapshots", variant: "destructive" });
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

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this snapshot?")) return;
    const previous = list;
    setList((prev) => prev.filter((s) => s.id !== id));
    try {
      await KolChannelSnapshotService.delete(id);
      onMetricsChanged?.();
    } catch {
      setList(previous);
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
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
        <p className="text-xs text-gray-500">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-xs text-gray-500 italic p-4 bg-gray-50 rounded-md text-center">
          No snapshots yet. Log a monthly snapshot to feed the Channel Health and Growth Trajectory score dimensions.
        </p>
      ) : (
        <div className="space-y-2">
          {list.map((s) => (
            <SnapshotRow key={s.id} s={s} onDelete={() => handleDelete(s.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function SnapshotRow({ s, onDelete }: { s: KolChannelSnapshot; onDelete: () => void }) {
  // Snapshot dates are stored as YYYY-MM-DD (always 1st of month per
  // spec). Display as "Mon YYYY" since the day is meaningless.
  const monthLabel = (() => {
    const d = new Date(s.snapshot_date + "T00:00:00");
    return isNaN(d.getTime()) ? s.snapshot_date : d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  })();
  return (
    <div className="border border-gray-200 rounded-md p-3 bg-white">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{monthLabel}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
              {s.follower_count.toLocaleString()} followers
            </span>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
            <Stat label="Avg Views" value={s.avg_views_per_post} />
            <Stat label="Avg Forwards" value={s.avg_forwards_per_post} />
            <Stat label="Avg Reactions" value={s.avg_reactions_per_post} />
            <Stat label="Posts/Wk" value={s.posting_frequency != null ? Number(s.posting_frequency) : null} />
          </div>
          {s.notes && <p className="mt-2 text-xs text-gray-600 italic">"{s.notes}"</p>}
        </div>
        <Button size="sm" variant="ghost" onClick={onDelete} title="Delete">
          <Trash2 className="h-3 w-3 text-red-500" />
        </Button>
      </div>
    </div>
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
  const [avgForwards, setAvgForwards] = useState<string>("");
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
      avg_forwards_per_post: numOrNull(avgForwards),
      avg_reactions_per_post: numOrNull(avgReactions),
      posting_frequency: numOrNull(postingFreq),
      notes: notes.trim() || null,
    };
    try {
      const row = await KolChannelSnapshotService.upsert(input);
      onSaved(row);
    } catch {
      toast({ title: "Failed to save snapshot", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border border-gray-200 rounded-md p-3 bg-gray-50 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Snapshot Month *">
          <Input type="date" value={snapshotDate} onChange={(e) => setSnapshotDate(e.target.value)} className="h-8 text-xs" />
        </FormField>
        <FormField label="Follower Count *">
          <Input type="number" min={0} value={followerCount} onChange={(e) => setFollowerCount(e.target.value)} className="h-8 text-xs" placeholder="e.g. 12500" />
        </FormField>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <FormField label="Avg Views"><Input type="number" value={avgViews} onChange={(e) => setAvgViews(e.target.value)} className="h-8 text-xs" /></FormField>
        <FormField label="Avg Forwards"><Input type="number" value={avgForwards} onChange={(e) => setAvgForwards(e.target.value)} className="h-8 text-xs" /></FormField>
        <FormField label="Avg Reactions"><Input type="number" value={avgReactions} onChange={(e) => setAvgReactions(e.target.value)} className="h-8 text-xs" /></FormField>
        <FormField label="Posts/Week"><Input type="number" step="0.1" value={postingFreq} onChange={(e) => setPostingFreq(e.target.value)} className="h-8 text-xs" /></FormField>
      </div>
      <FormField label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[50px] text-xs" placeholder="e.g. KOL took a 2-week break, posting frequency dipped" />
      </FormField>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      </div>
      <p className="text-[10px] text-gray-500 mt-1">
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
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await KolCallLogService.getForKol(kolId);
        if (!cancelled) setList(rows);
      } catch {
        if (!cancelled) toast({ title: "Failed to load call logs", variant: "destructive" });
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

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this call log?")) return;
    const previous = list;
    setList((prev) => prev.filter((c) => c.id !== id));
    try {
      await KolCallLogService.delete(id);
    } catch {
      setList(previous);
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{list.length} call log{list.length === 1 ? "" : "s"}.</p>
        {!showAddForm && (
          <Button size="sm" variant="outline" onClick={() => setShowAddForm(true)}>
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
        <p className="text-xs text-gray-500">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-xs text-gray-500 italic p-4 bg-gray-50 rounded-md text-center">
          No call logs yet. Add one after your next call with this KOL.
        </p>
      ) : (
        <div className="space-y-2">
          {list.map((c) => (
            <CallLogRow key={c.id} c={c} onDelete={() => handleDelete(c.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function CallLogRow({ c, onDelete }: { c: KolCallLog; onDelete: () => void }) {
  return (
    <div className="border border-gray-200 rounded-md p-3 bg-white">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{new Date(c.call_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
            {c.call_type && <span className="text-xs px-1.5 py-0.5 rounded bg-purple-50 text-purple-700">{c.call_type}</span>}
            {c.project && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{c.project}</span>}
          </div>
          <div className="mt-2 space-y-1.5 text-xs">
            {c.notes && <Section label="Notes" body={c.notes} />}
            {c.market_intel && <Section label="Market Intel" body={c.market_intel} />}
            {c.recommended_angle && <Section label="Recommended Angle" body={c.recommended_angle} />}
            {c.feedback_on_hh && <Section label="Feedback on HH" body={c.feedback_on_hh} />}
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={onDelete} title="Delete">
          <Trash2 className="h-3 w-3 text-red-500" />
        </Button>
      </div>
    </div>
  );
}

function Section({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <span className="text-[10px] font-semibold text-gray-500 uppercase">{label}: </span>
      <span className="text-gray-700">{body}</span>
    </div>
  );
}

function CallLogForm({
  kolId,
  onCancel,
  onSaved,
}: {
  kolId: string;
  onCancel: () => void;
  onSaved: (row: KolCallLog) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [callDate, setCallDate] = useState(today);
  const [callType, setCallType] = useState<string>("");
  const [project, setProject] = useState("");
  const [notes, setNotes] = useState("");
  const [marketIntel, setMarketIntel] = useState("");
  const [recommendedAngle, setRecommendedAngle] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
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
    try {
      const row = await KolCallLogService.create(input);
      onSaved(row);
    } catch {
      toast({ title: "Failed to save call log", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border border-gray-200 rounded-md p-3 bg-gray-50 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <FormField label="Date *">
          <Input type="date" value={callDate} onChange={(e) => setCallDate(e.target.value)} className="h-8 text-xs" />
        </FormField>
        <FormField label="Call Type">
          <Select value={callType} onValueChange={setCallType}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {CALL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Project">
          <Input value={project} onChange={(e) => setProject(e.target.value)} className="h-8 text-xs" placeholder="e.g. Valiant" />
        </FormField>
      </div>
      <FormField label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[50px] text-xs" placeholder="General debrief…" />
      </FormField>
      <FormField label="Market Intel">
        <Textarea value={marketIntel} onChange={(e) => setMarketIntel(e.target.value)} className="min-h-[50px] text-xs" placeholder="Narratives/trends the KOL flagged…" />
      </FormField>
      <FormField label="Recommended Angle">
        <Textarea value={recommendedAngle} onChange={(e) => setRecommendedAngle(e.target.value)} className="min-h-[50px] text-xs" placeholder="Content approach they suggested…" />
      </FormField>
      <FormField label="Feedback on HH">
        <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} className="min-h-[50px] text-xs" placeholder="What they liked/disliked about working with us…" />
      </FormField>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}
