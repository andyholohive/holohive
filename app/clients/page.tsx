'use client';

import { useState, useEffect, useRef } from 'react';
import mammoth from 'mammoth';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { ClientService, ClientWithAccess } from '@/lib/clientService';
import { FormService, FormWithStats } from '@/lib/formService';
import MeetingActionItems from '@/components/clients/MeetingActionItems';
import { UserService } from '@/lib/userService';
import { supabase } from '@/lib/supabase';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, Edit, Building2, Mail, MapPin, Calendar as CalendarIcon, Trash2, CheckCircle, CheckCircle2, FileText, PauseCircle, BadgeCheck, Link as LinkIcon, ExternalLink, Copy, Share2, Upload, X, Image as ImageIcon, Pencil, StickyNote, Briefcase, ClipboardList, Activity, MessageSquare, Globe, Eye, EyeOff, ChevronDown, ChevronUp, Lock, Circle, ListTodo, MoreHorizontal, Bell, Settings, Info, Users, Star, Save, History } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import Link from 'next/link';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { useRouter, useSearchParams } from 'next/navigation';
import { KOLService } from '@/lib/kolService';
import { CampaignService } from '@/lib/campaignService';
import { CRMService, CRMOpportunity } from '@/lib/crmService';
import { formatDate, formatDateTime, formatRelativeShort } from '@/lib/dateFormat';
import { CallNotesTab } from '@/components/clients/CallNotesTab';
import dynamic from 'next/dynamic';

const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });
import 'react-quill/dist/quill.snow.css';

/**
 * Format a Date as YYYY-MM-DD using LOCAL components (not UTC).
 *
 * The previous pattern (`d.toISOString().split('T')[0]`) silently shifted
 * dates back one day in any positive-UTC timezone — e.g. KST (UTC+9):
 *   new Date(2026, 5, 8) // June 8 local midnight (Seoul)
 *     .toISOString()      // → "2026-06-07T15:00:00.000Z" (still June 7 UTC)
 *     .split('T')[0]      // → "2026-06-07"  ← BUG: saved as June 7
 *
 * For calendar-picked dates we want "the day the user clicked", which is a
 * local Y-M-D, so we read the local components directly.
 */
const formatLocalYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// ─── Weekly Update audit-log helpers ───────────────────────────────
// Power the History popover in the Weekly Update tab. The audit table
// stores raw before/after JSON; these helpers turn that into a humane
// "Bolt added a row to the execution plan" sentence, plus a colored
// tone for the status chip so the popover scans quickly.

type WeeklyAuditKind =
  | 'strategic_notes'
  | 'execution_plan'
  | 'this_week_feed'
  | 'top_post_override'
  | 'submitted';

const WEEKLY_AUDIT_KIND_LABELS: Record<WeeklyAuditKind, string> = {
  strategic_notes:   'Strategic Notes',
  execution_plan:    'Execution Plan',
  this_week_feed:    'This Week Feed',
  top_post_override: 'Top Post',
  submitted:         'Submitted',
};

const WEEKLY_AUDIT_KIND_TONES: Record<WeeklyAuditKind, BadgeTone> = {
  strategic_notes:   'warning',   // amber, matches the Stage-1 section
  execution_plan:    'warning',   // yellow, matches Zone A
  this_week_feed:    'success',   // green, matches Zone B
  top_post_override: 'info',      // sky, matches Zone C
  submitted:         'brand',     // teal — the locking transition
};

function weeklyAuditKindLabel(k: WeeklyAuditKind): string {
  return WEEKLY_AUDIT_KIND_LABELS[k] ?? k;
}

function weeklyAuditKindTone(k: WeeklyAuditKind): BadgeTone {
  return WEEKLY_AUDIT_KIND_TONES[k] ?? 'neutral';
}

/**
 * Turn a raw audit row's before/after into a humane summary like
 * "added 2 rows" or "edited 3 fields". The popover renders this under
 * the chip + actor line so users see what changed without expanding
 * a JSON diff. Best-effort — falls back to "edited" for shapes we
 * can't introspect.
 */
function summarizeWeeklyAudit(r: {
  edit_kind: WeeklyAuditKind;
  before_json: any;
  after_json: any;
}): string {
  const { edit_kind, before_json, after_json } = r;

  if (edit_kind === 'strategic_notes') {
    const before = typeof before_json === 'string' ? before_json : (before_json?.strategic_notes ?? '');
    const after  = typeof after_json  === 'string' ? after_json  : (after_json?.strategic_notes  ?? '');
    if (!before && after) return `Wrote new strategic notes (${after.length} chars).`;
    if (before && !after) return 'Cleared strategic notes.';
    return `Edited strategic notes (${before.length} → ${after.length} chars).`;
  }

  if (edit_kind === 'execution_plan') {
    const beforeArr = Array.isArray(before_json) ? before_json : [];
    const afterArr  = Array.isArray(after_json)  ? after_json  : [];
    const diff = afterArr.length - beforeArr.length;
    if (diff > 0) return `Added ${diff} task row${diff === 1 ? '' : 's'} (now ${afterArr.length} total).`;
    if (diff < 0) return `Removed ${-diff} task row${-diff === 1 ? '' : 's'} (now ${afterArr.length} total).`;
    return `Edited ${afterArr.length} task row${afterArr.length === 1 ? '' : 's'} in place.`;
  }

  if (edit_kind === 'this_week_feed') {
    const beforeArr = Array.isArray(before_json) ? before_json : [];
    const afterArr  = Array.isArray(after_json)  ? after_json  : [];
    const diff = afterArr.length - beforeArr.length;
    const beforeDone = beforeArr.filter((i: any) => i?.status === 'done').length;
    const afterDone  = afterArr.filter((i: any)  => i?.status === 'done').length;
    if (diff > 0) return `Added ${diff} feed item${diff === 1 ? '' : 's'} (now ${afterArr.length} total).`;
    if (diff < 0) return `Removed ${-diff} feed item${-diff === 1 ? '' : 's'} (now ${afterArr.length} total).`;
    if (afterDone > beforeDone) return `Marked ${afterDone - beforeDone} item${afterDone - beforeDone === 1 ? '' : 's'} done.`;
    if (afterDone < beforeDone) return `Reopened ${beforeDone - afterDone} item${beforeDone - afterDone === 1 ? '' : 's'}.`;
    return `Edited ${afterArr.length} feed item${afterArr.length === 1 ? '' : 's'} in place.`;
  }

  if (edit_kind === 'top_post_override') {
    if (!after_json && before_json) return 'Cleared top-post override (back to auto-selected).';
    if (after_json && !before_json) return 'Set a top-post override.';
    return 'Changed the top-post override.';
  }

  if (edit_kind === 'submitted') {
    const created = (after_json as any)?.tasksCreated;
    if (typeof created === 'number') {
      return `Submitted execution plan — created ${created} HQ task${created === 1 ? '' : 's'}.`;
    }
    return 'Submitted execution plan.';
  }

  return 'Edited.';
}

/**
 * Snap a Date to the Monday of its ISO week (Mon = start of week).
 * Used as the canonical `week_of` value for client_weekly_updates rows
 * so two CMs editing "this week's update" land on the same row even if
 * they open the modal on different weekdays.
 */
const getMondayOf = (d: Date): Date => {
  const out = new Date(d);
  // JS getDay(): Sun=0, Mon=1, …, Sat=6. We want Mon=0, Sun=6 offset.
  const dow = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - dow);
  out.setHours(0, 0, 0, 0);
  return out;
};

/**
 * Tiny RFC-4122-shaped uuid for client-side stable React keys on rows
 * the user adds before the row is persisted (Zone A / Zone B). Not
 * cryptographically secure — we never use these as auth tokens, just
 * as identity markers for rows in JSONB arrays. crypto.randomUUID is
 * available in modern browsers; fallback for older Safari uses
 * Math.random which is plenty for this use case.
 */
const localId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as any).randomUUID();
  }
  return 'r-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
};

type MeetingNote = {
  id: string;
  client_id: string;
  title: string;
  content: string | null;
  meeting_date: string;
  attendees: string | null;
  action_items: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ClientContext = {
  id: string;
  client_id: string;
  engagement_type: string | null;
  scope: string | null;
  start_date: string | null;
  milestones: string | null;
  client_contacts: string | null;
  holohive_contacts: string | null;
  created_at: string;
  updated_at: string;
};

type DecisionLogEntry = {
  id: string;
  client_id: string;
  decision_date: string;
  summary: string;
  created_by: string | null;
  created_at: string;
};

type WeeklyUpdate = {
  id: string;
  client_id: string;
  week_of: string;
  current_focus: string;
  active_initiatives: string | null;
  next_checkin: string | null;
  open_questions: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // v2 columns — Phase 2 of the Post-Onboarding Campaign View spec.
  // Nullable for backward-compat with rows saved before the migration.
  strategic_notes?: string | null;
  strategic_notes_updated_at?: string | null;
  strategic_notes_by?: string | null;
  execution_plan?: ExecutionPlanRow[] | null;
  execution_plan_submitted_at?: string | null;
  execution_plan_submitted_by?: string | null;
  this_week_feed?: ThisWeekFeedItem[] | null;
  top_post_override?: { content_id: string } | null;
};

/** Zone A — internal-only task row. On submit, batch-creates HQ tasks. */
type ExecutionPlanRow = {
  id: string;             // client-side uuid for stable React keys
  description: string;
  assignee_id: string | null;
  due_date: string | null;        // YYYY-MM-DD (local)
  deliverable_type: DeliverableType | null;
};

/** Zone B — client-facing item rendered on the portal's "This Week" card. */
type ThisWeekFeedItem = {
  id: string;
  text: string;
  date: string | null;            // YYYY-MM-DD (local)
  status: 'pending' | 'done';
  done_at?: string | null;
  done_by?: string | null;
};

type DeliverableType = 'brief' | 'report' | 'translation' | 'content_review' | 'client_update' | 'other';

const DELIVERABLE_TYPE_LABELS: Record<DeliverableType, string> = {
  brief: 'Brief',
  report: 'Report',
  translation: 'Translation',
  content_review: 'Content Review',
  client_update: 'Client Update',
  other: 'Other',
};

type ActionItem = {
  id: string;
  client_id: string;
  text: string;
  court: 'yours' | 'ours';
  phase: 'kickoff' | 'discovery' | 'tracker';
  is_done: boolean;
  is_hidden: boolean;
  display_order: number;
  attachment_url: string | null;
  attachment_label: string | null;
  milestone_id: string | null;
  created_at: string;
  updated_at: string;
};

type Milestone = {
  id: string;
  client_id: string;
  name: string;
  subtitle: string | null;
  status: 'complete' | 'active' | 'upcoming';
  status_message: string | null;
  is_visible: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

type CampaignStatus = 'Planning' | 'Active' | 'Paused' | 'Completed';
type ClientWithStatus = ClientWithAccess & {
  campaignsByStatus?: Record<CampaignStatus, number>;
};

/**
 * Compact relative time label for the "Last visit" line on each
 * client card. ISO timestamp in → "3 days ago" / "Today" / "5 mins
 * ago" / "Sep 12" out. Caps at "Today" for sub-day diffs because the
 * card has a hover tooltip showing the exact timestamp anyway —
 * minute/hour precision in the card itself is just noise.
 */
function relativeTimeFromNow(iso: string): string {
  return formatRelativeShort(iso) || '—';
}

export default function ClientsPage() {
  const { user, userProfile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const partnerIdParam = searchParams.get('partnerId');
  const [clients, setClients] = useState<ClientWithAccess[]>([]);
  const [clientsWithStatus, setClientsWithStatus] = useState<ClientWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [isNewClientOpen, setIsNewClientOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientWithAccess | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<ClientWithAccess | null>(null);
  const [isStartClientOpen, setIsStartClientOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allClients, setAllClients] = useState<ClientWithAccess[]>([]);
  const [allPartners, setAllPartners] = useState<any[]>([]);
  const [filteredPartnerName, setFilteredPartnerName] = useState<string | null>(null);
  const [linkedAccounts, setLinkedAccounts] = useState<Record<string, CRMOpportunity[]>>({});
  const [isSharePortalOpen, setIsSharePortalOpen] = useState(false);
  const [clientToShare, setClientToShare] = useState<ClientWithAccess | null>(null);
  const [shareForms, setShareForms] = useState<FormWithStats[]>([]);
  const [shareExtraForms, setShareExtraForms] = useState<string[]>([]);
  const [shareAddFormOpen, setShareAddFormOpen] = useState(false);
  // Meeting notes state
  const [clientMeetingNotes, setClientMeetingNotes] = useState<Record<string, MeetingNote[]>>({});
  const [meetingNotesModalClient, setMeetingNotesModalClient] = useState<ClientWithAccess | null>(null);
  const [meetingNoteForm, setMeetingNoteForm] = useState<{ title: string; content: string; meeting_date: Date | undefined; attendees: string; action_items: string }>({ title: '', content: '', meeting_date: undefined, attendees: '', action_items: '' });
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [isNoteFormOpen, setIsNoteFormOpen] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [isParsingDoc, setIsParsingDoc] = useState(false);
  const docUploadRef = useRef<HTMLInputElement>(null);
  // Client context state
  const [clientContexts, setClientContexts] = useState<Record<string, ClientContext>>({});
  const [contextModalClient, setContextModalClient] = useState<ClientWithAccess | null>(null);
  const [contextForm, setContextForm] = useState<{ engagement_type: string; scope: string; start_date: Date | undefined; milestones: string; client_contacts: string; holohive_contacts: string; telegram_url: string; telegram_chat_id: string; shared_drive_url: string; gtm_sync_url: string; kol_content_brief_url: string; onboarding_phase: string }>({ engagement_type: '', scope: '', start_date: undefined, milestones: '', client_contacts: '', holohive_contacts: '', telegram_url: '', telegram_chat_id: '', shared_drive_url: '', gtm_sync_url: '', kol_content_brief_url: '', onboarding_phase: '' });
  // [Phase edit in popup] The latest in-window campaign for the client
  // whose Context popup is currently open. Fetched lazily when the
  // popup opens — picker logic mirrors the client portal hero
  // (nearest end_date wins; fall back to most recently started).
  // Shown at the top of the Context tab with an editable phase dropdown.
  type LatestCampaign = { id: string; name: string; start_date: string | null; end_date: string | null; current_phase: string | null };
  const [latestCampaign, setLatestCampaign] = useState<LatestCampaign | null>(null);
  const [savingPhase, setSavingPhase] = useState(false);
  // Mirror of CURRENT_PHASE_OPTIONS in app/campaigns/[id]/page.tsx +
  // app/campaigns/page.tsx (3rd duplicate). If you change one, change all.
  const CURRENT_PHASE_OPTIONS = [
    'Setup',
    'Seeding Phase',
    'Amplification Phase',
    'Activation Phase',
    'Reporting Phase',
  ] as const;
  // Decision log state
  const [clientDecisionLogs, setClientDecisionLogs] = useState<Record<string, DecisionLogEntry[]>>({});
  const [decisionForm, setDecisionForm] = useState<{ decision_date: Date | undefined; summary: string }>({ decision_date: undefined, summary: '' });
  const [editingDecisionId, setEditingDecisionId] = useState<string | null>(null);
  const [isDecisionFormOpen, setIsDecisionFormOpen] = useState(false);
  const [deletingDecisionId, setDeletingDecisionId] = useState<string | null>(null);
  const [meetingNotesTab, setMeetingNotesTab] = useState<string>('notes');
  // [2026-06-08] Legacy weekly-updates state removed. The Weekly Update
  // tab in the Client Context modal (Phase 2 of the Post-Onboarding
  // Campaign View v2 spec) is now the single way to edit weekly data.
  // It loads / saves the same client_weekly_updates rows directly via
  // weeklyV2Row + loadWeeklyV2Row / saveWeeklyV2.
  // ─── Weekly Update v2 — Phase 2 spec ──────────────────────────────
  // State scoped to the new "Weekly Update" tab inside the Client
  // Context modal. Operates on ONE week at a time (selected via
  // `weeklyV2Week`); the underlying row is the
  // client_weekly_updates row matching (client_id, week_of). The
  // form persists changes to the v2 columns added in the migration —
  // strategic_notes, execution_plan, this_week_feed, top_post_override.
  // [2026-06-08] The legacy weekly modal was removed; this tab is now
  // the only entry point. Old columns (current_focus, active_initiatives,
  // next_checkin, open_questions) still exist on rows saved before the
  // tab shipped; the portal falls back to them when this_week_feed is
  // empty, and a one-shot migration backfills them when convenient.
  const [weeklyV2Week, setWeeklyV2Week] = useState<Date>(() => getMondayOf(new Date()));
  const [weeklyV2Row, setWeeklyV2Row] = useState<WeeklyUpdate | null>(null);
  const [weeklyV2Loading, setWeeklyV2Loading] = useState(false);
  // Local-only edits before they're committed to DB. We keep these
  // separate so the UI feels snappy (typing into the strategic notes
  // textarea, toggling Zone B status) without waiting for a round-
  // trip. Auto-saved on blur / next-tick via the helpers below.
  const [weeklyV2StrategicNotes, setWeeklyV2StrategicNotes] = useState<string>('');
  const [weeklyV2ExecPlan, setWeeklyV2ExecPlan] = useState<ExecutionPlanRow[]>([]);
  const [weeklyV2ThisWeekFeed, setWeeklyV2ThisWeekFeed] = useState<ThisWeekFeedItem[]>([]);
  // Inline save indicator — flashes briefly after a successful save so
  // the user knows their change landed even though there's no explicit
  // Save button on most fields. Cleared by a debounced timeout.
  const [weeklyV2SaveStatus, setWeeklyV2SaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // Zone C — Top Post override picker. Modal-style picker over the
  // client's posted content. Candidate list is fetched lazily on
  // open. Engagement is the same metric the portal's auto-pick uses
  // so the CM can quickly see "why did it auto-pick THIS one" and
  // override if needed.
  // Expand-to-all toggle for the Zone C inline list. Default false so
  // CMs see the auto top-3; opening the toggle reveals up to 30 (the
  // fetch cap) for the rare case where the right post sits further down.
  const [topPostShowAll, setTopPostShowAll] = useState(false);
  const [topPostCandidates, setTopPostCandidates] = useState<Array<{
    id: string; kol_name: string; platform: string | null; content_link: string | null;
    impressions: number; likes: number; comments: number; retweets: number; engagements: number;
    notes: string | null;
  }>>([]);
  const [topPostCandidatesLoading, setTopPostCandidatesLoading] = useState(false);
  // Strategic-notes history — the spec calls for a "by-week" view so
  // Bolt can scroll back through Jdot's prior weeks of guidance
  // without having to flip the week picker. Lazy-fetched on disclose.
  const [strategicHistoryOpen, setStrategicHistoryOpen] = useState(false);
  const [strategicHistoryRows, setStrategicHistoryRows] = useState<Array<{ id: string; week_of: string; strategic_notes: string; strategic_notes_updated_at: string | null }>>([]);
  const [strategicHistoryLoading, setStrategicHistoryLoading] = useState(false);
  // [2026-06-11] Weekly update audit-log viewer state. Powers the
  // History popover next to the week selector — reverse-chrono list
  // of who/what/when for every save on the active weekly update row.
  // Lazy-loaded; refetched each time the popover opens.
  const [weeklyAuditOpen, setWeeklyAuditOpen] = useState(false);
  const [weeklyAuditRows, setWeeklyAuditRows] = useState<Array<{
    id: string;
    weekly_update_id: string;
    edit_kind: 'strategic_notes' | 'execution_plan' | 'this_week_feed' | 'top_post_override' | 'submitted';
    before_json: any;
    after_json: any;
    edited_by: string | null;
    edited_by_name: string | null;
    edited_at: string;
  }>>([]);
  const [weeklyAuditLoading, setWeeklyAuditLoading] = useState(false);
  // Mindshare config state
  const [clientMindshareEnabled, setClientMindshareEnabled] = useState<Record<string, boolean>>({});
  // Action items & milestones state
  const [clientActionItems, setClientActionItems] = useState<Record<string, ActionItem[]>>({});
  // [HQ Tasks ↔ Action Board link, May 2026] Per-action-item count of
  // linked HQ tasks. Powers the badge on each Action Board row that
  // shows "3 HQ tasks" → click jumps to /tasks?client=X&actionItem=Y.
  // Keyed by client_action_items.id, value = count.
  const [actionItemTaskCounts, setActionItemTaskCounts] = useState<Record<string, number>>({});
  const [clientMilestones, setClientMilestones] = useState<Record<string, Milestone[]>>({});
  const [actionItemForm, setActionItemForm] = useState<{ text: string; court: 'yours' | 'ours'; attachment_url: string; attachment_label: string }>({ text: '', court: 'yours', attachment_url: '', attachment_label: '' });
  const [editingActionItemId, setEditingActionItemId] = useState<string | null>(null);
  const [isActionItemFormOpen, setIsActionItemFormOpen] = useState(false);
  const [deletingActionItemId, setDeletingActionItemId] = useState<string | null>(null);
  const [contextModalTab, setContextModalTab] = useState<string>('context');
  const [activeMilestoneId, setActiveMilestoneId] = useState<string | null>(null);
  const [milestoneForm, setMilestoneForm] = useState<{ name: string; subtitle: string; status_message: string }>({ name: '', subtitle: '', status_message: '' });
  const [isMilestoneFormOpen, setIsMilestoneFormOpen] = useState(false);
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null);
  const [milestoneTemplates, setMilestoneTemplates] = useState<{ id: string; name: string; description: string | null; milestones: any[]; is_default: boolean }[]>([]);
  const [showTemplatePickerFor, setShowTemplatePickerFor] = useState<string | null>(null);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  // [2026-06-08] clientApprovedDomains / contextDomainInput removed —
  // Approved Domains now lives only on the Edit Client dialog
  // (newClient.approved_domains + domainInput).
  // Portal access tracking state. portalAccessSummary is a per-client
  // count of visits in the last 30d (used to drive the badge on the
  // "Visits" tile); the modal lazy-loads the full list on open.
  const [portalAccessSummary, setPortalAccessSummary] = useState<
    Record<string, { count_30d: number; last_at: string | null }>
  >({});
  // HQ task counts per client — open (non-complete) tasks where
  // tasks.client_id matches. Drives the "📋 N HQ tasks" badge on each
  // card and links into /tasks?client=<id>. Loaded alongside the rest
  // in fetchClients() to avoid a second round-trip per render.
  const [hqTaskCounts, setHqTaskCounts] = useState<Record<string, number>>({});
  const [accessLogModalClient, setAccessLogModalClient] = useState<ClientWithAccess | null>(null);
  const [accessLogRows, setAccessLogRows] = useState<
    Array<{ id: string; email: string; authorized_via: string; accessed_at: string; user_agent: string | null; ip_address: string | null }>
  >([]);
  const [accessLogLoading, setAccessLogLoading] = useState(false);
  // [2026-06-08] Audience filter for the portal-visits modal. Defaults
  // to 'external' so it matches the per-card "Visit log" badge (which
  // already excludes @holohive.io / @holohive.agency). User can flip
  // to 'all' to see the full audit log, or 'internal' to QA team
  // traffic specifically.
  const [accessLogAudience, setAccessLogAudience] = useState<'external' | 'internal' | 'all'>('external');
  // New client form state
  const [newClient, setNewClient] = useState({
    name: '',
    email: '',
    location: '',
    is_active: true,
    source: 'Inbound',
    onboarding_call_held: false,
    onboarding_call_date: undefined as Date | undefined,
    is_whitelisted: false,
    whitelist_partner_id: null as string | null,
    logo_url: null as string | null,
    approved_domains: [] as string[],
    // Dashboard v2: specialized engagement models (Impossible, Robonet, …)
    // EXCLUDED from priority dashboard rollups so they don't skew KPIs.
    is_ad_hoc: false,
    // [2026-06-08] Moved here from the Client Context popup — start date
    // is a core engagement attribute (renewal math, dashboard tone), so
    // it belongs on the same form as Status / Whitelist. Stored on the
    // `client_context` row, not on `clients`, so the save path upserts
    // client_context after the clients update completes.
    start_date: undefined as Date | undefined,
  });
  const [domainInput, setDomainInput] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  // Start client form state
  const [startClientForm, setStartClientForm] = useState({
    companyName: '',
    isRenewingClient: false,
    selectedExistingClient: '',
    email: '',
    location: '',
    source: 'Inbound',
    campaignName: '',
    campaignManager: '',
    startDate: undefined as Date | undefined,
    endDate: undefined as Date | undefined,
    region: 'apac',
    clientChoosingKols: false,
    multiActivation: false,
    totalBudget: '',
    callHeld: false,
    callDate: undefined as Date | undefined,
    proposalSent: false,
    ndaSigned: false,
    budgetType: [] as string[],
    callSupport: false,
    supportingMembers: [] as string[],
    budgetAllocations: [] as { region: string; amount: string }[],
    intro_call: false,
    intro_call_date: undefined as Date | undefined,
  });
  const [startClientStep, setStartClientStep] = useState(0);
  // Update the step order so onboarding comes before campaign details
  const startClientSections = [
    'Client Details',
    'Onboarding',
    'Campaign Details',
    'Contracting Status',
    'Support & Follow-Up'
  ];
  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };
  const isStepValid = () => {
    if (startClientStep === 0) {
      if (startClientForm.isRenewingClient) {
        return !!startClientForm.selectedExistingClient;
      } else {
        return (
          !!startClientForm.companyName.trim() &&
          !!startClientForm.email.trim() &&
          isValidEmail(startClientForm.email) &&
          !!startClientForm.source
        );
      }
    }
    if (startClientStep === 1) {
      // Onboarding step: only require call date if callHeld is checked
      if (startClientForm.callHeld) {
        return !!startClientForm.callDate;
      }
      return true;
    }
    if (startClientStep === 2) {
      // Campaign Details step: require all campaign fields except end date
      return (
        !!startClientForm.campaignName.trim() &&
        !!startClientForm.campaignManager &&
        !!startClientForm.startDate &&
        !!startClientForm.region &&
        !!startClientForm.totalBudget
      );
    }
    return true;
  };

  const openSharePortal = async (client: ClientWithAccess) => {
    setClientToShare(client);
    setShareExtraForms([]);
    setShareAddFormOpen(false);
    setIsSharePortalOpen(true);
    try {
      const forms = await FormService.getAllForms();
      setShareForms(forms.filter(f => f.status === 'published'));
    } catch (err) {
      console.error('Error fetching forms:', err);
    }
  };

  // Lazy-load the full access log for a client when the admin opens
  // the Visits modal. We don't want to fetch this for every client on
  // the initial /clients load — the page already does 11 parallel
  // queries — so it stays modal-scoped.
  const openAccessLogModal = async (client: ClientWithAccess) => {
    setAccessLogModalClient(client);
    setAccessLogRows([]);
    setAccessLogLoading(true);
    setAccessLogAudience('external'); // matches the on-card badge
    try {
      const { data, error } = await (supabase as any)
        .from('portal_access_log')
        .select('id, email, authorized_via, accessed_at, user_agent, ip_address')
        .eq('client_id', client.id)
        .order('accessed_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setAccessLogRows((data || []) as any);
    } catch (err) {
      console.error('Error loading portal access log:', err);
      toast({ title: 'Load failed', description: err instanceof Error ? err.message : 'Failed to load access log', variant: 'destructive' });
    } finally {
      setAccessLogLoading(false);
    }
  };

  const copyPortalLink = () => {
    if (!clientToShare) return;
    const portalUrl = `${window.location.origin}/public/portal/${clientToShare.slug || clientToShare.id}`;
    navigator.clipboard.writeText(portalUrl);
    toast({
      title: 'Link copied',
      description: 'Portal link copied to clipboard.',
    });
  };

  const ONBOARDING_FORM_SLUG = 'holo-hive-onboarding';

  const getFormUrl = (formSlugOrId: string) => {
    if (!clientToShare) return '';
    return `${typeof window !== 'undefined' ? window.location.origin : ''}/public/forms/${formSlugOrId}?client=${clientToShare.id}`;
  };

  const copyFormLink = (formSlugOrId: string, formName: string) => {
    const url = getFormUrl(formSlugOrId);
    if (!url) return;
    navigator.clipboard.writeText(url);
    toast({
      title: 'Link copied',
      description: `${formName} link copied to clipboard.`,
    });
  };

  const [isStartClientSubmitting, setIsStartClientSubmitting] = useState(false);
  const [startClientError, setStartClientError] = useState<string | null>(null);
  useEffect(() => {
    fetchClients();
    if (userProfile?.role === 'admin' || userProfile?.role === 'super_admin') {
      UserService.getActiveUsers().then(setAllUsers);
    }
    fetchPartners();
  }, [user?.id, userProfile?.role]);

  // Handle partner filtering
  useEffect(() => {
    if (partnerIdParam) {
      const partner = allPartners.find(p => p.id === partnerIdParam);
      setFilteredPartnerName(partner?.name || null);
    } else {
      setFilteredPartnerName(null);
    }
  }, [partnerIdParam, allPartners]);
  const fetchPartners = async () => {
    try {
      const { data, error } = await supabase
        .from('partners')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setAllPartners(data || []);
    } catch (err) {
      console.error('Error fetching partners:', err);
    }
  };

  const fetchClients = async () => {
    if (!user?.id || !userProfile?.role) return;
    try {
      setLoading(true);
      setError(null);

      // Step 1 — must complete first because every parallel query
      // below either uses the client list or builds a per-client map
      // keyed by client_id (we don't NEED clientIds upfront for the
      // raw selects, but campaigns is filtered by client_id and the
      // status-map seed loop requires the fetched client objects).
      const fetchedClients = await ClientService.getClientsForUser(
        userProfile.role as 'admin' | 'member' | 'client',
        user.id
      );
      setClients(fetchedClients);
      const clientIds = fetchedClients.map(c => c.id);

      // Step 2 — fan out everything else in parallel. Was 10 sequential
      // round-trips (~5-8s on slow connections); now one round-trip
      // window. Promise.all rejects if any fails — wrap in try so a
      // single 4xx from a stale row doesn't blank the whole page.
      // Pull the last 30 days of portal access log alongside the rest.
      // Cheap because of the (client_id, accessed_at DESC) index, and
      // it lets us render an "N visits / 7d" badge on every card
      // without an extra round-trip when the page mounts.
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [
        allCampaigns,
        allOpportunities,
        notesRes,
        ctxRes,
        decRes,
        actionRes,
        milestoneRes,
        templateRes,
        mindshareRes,
        portalAccessRes,
        hqTasksRes,
      ] = await Promise.all([
        CampaignService.getCampaignsByClientIds(clientIds) as Promise<any[]>,
        CRMService.getAllOpportunities(),
        supabase.from('client_meeting_notes').select('*').order('meeting_date', { ascending: false }),
        supabase.from('client_context').select('*'),
        supabase.from('client_decision_log').select('*').order('decision_date', { ascending: false }),
        // Legacy `client_weekly_updates` bulk-fetch dropped 2026-06-08
        // along with the legacy modal. The Weekly Update tab fetches
        // its row scoped to (client, week) on tab-open instead, which
        // avoids loading every weekly row for every client at page load.
        supabase.from('client_action_items').select('*').order('display_order', { ascending: true }),
        supabase.from('client_milestones').select('*').order('display_order', { ascending: true }),
        supabase.from('milestone_templates').select('*').order('is_default', { ascending: false }).order('name'),
        supabase.from('client_mindshare_config').select('client_id, is_enabled'),
        // [2026-06-08] Internal-team visits filtered out per Andy.
        // The team logs into client portals all day to QA / preview,
        // which inflated "last visited" and the 30-day count to the
        // point where the indicator no longer told you anything
        // about whether THE CLIENT is engaging.
        //
        // Exclusion is by email-domain match: anything ending in
        // `@holohive.io` (everyone today: andy/jdot/quazo/jaymz/bolt)
        // or `@holohive.agency` (the portal subdomain, kept as a
        // defensive match in case a team member ever signs up there).
        // Null / empty emails fall through — those are presumably
        // real visitors whose email wasn't captured for whatever
        // reason, safer to count them than to hide them.
        (supabase as any).from('portal_access_log')
          .select('client_id, accessed_at')
          .gte('accessed_at', thirtyDaysAgo)
          .not('email', 'ilike', '%@holohive.io')
          .not('email', 'ilike', '%@holohive.agency')
          .order('accessed_at', { ascending: false }),
        // Open HQ tasks per client. We pull just client_id + status
        // because we only need the count — no display fields. The
        // !=complete filter mirrors how /tasks page hides done items
        // by default. parent_task_id check excludes deliverable
        // subtasks (they roll up under their parent in /tasks).
        supabase.from('tasks')
          .select('client_id')
          .neq('status', 'complete')
          .is('parent_task_id', null)
          .not('client_id', 'is', null),
      ]);

      // Build the campaigns-by-status map per client
      const statusMap: Record<string, Record<CampaignStatus, number>> = {};
      for (const client of fetchedClients) {
        statusMap[client.id] = { Planning: 0, Active: 0, Paused: 0, Completed: 0 };
      }
      for (const campaign of allCampaigns) {
        if (statusMap[campaign.client_id]) {
          statusMap[campaign.client_id][campaign.status as CampaignStatus]++;
        }
      }
      setClientsWithStatus(
        fetchedClients.map(client => ({
          ...client,
          campaignsByStatus: statusMap[client.id],
        }))
      );

      // Linked accounts (opportunities with client_id)
      const accountsMap: Record<string, CRMOpportunity[]> = {};
      for (const opp of allOpportunities) {
        if (opp.client_id) {
          if (!accountsMap[opp.client_id]) accountsMap[opp.client_id] = [];
          accountsMap[opp.client_id].push(opp);
        }
      }
      setLinkedAccounts(accountsMap);

      // Meeting notes — [TS cleanup] cast DB row → service type at the
      // boundary; manual interfaces are narrower than the generated
      // schema (DB allows nulls on more fields).
      const notesMap: Record<string, MeetingNote[]> = {};
      for (const note of (notesRes.data || []) as unknown as MeetingNote[]) {
        if (!notesMap[note.client_id]) notesMap[note.client_id] = [];
        notesMap[note.client_id].push(note);
      }
      setClientMeetingNotes(notesMap);

      // Client contexts
      const ctxMap: Record<string, ClientContext> = {};
      for (const ctx of (ctxRes.data || []) as unknown as ClientContext[]) ctxMap[ctx.client_id] = ctx;
      setClientContexts(ctxMap);

      // Decision logs
      const decMap: Record<string, DecisionLogEntry[]> = {};
      for (const d of (decRes.data || []) as unknown as DecisionLogEntry[]) {
        if (!decMap[d.client_id]) decMap[d.client_id] = [];
        decMap[d.client_id].push(d);
      }
      setClientDecisionLogs(decMap);

      // Action items
      const actionMap: Record<string, ActionItem[]> = {};
      for (const item of (actionRes.data || [])) {
        if (!actionMap[item.client_id]) actionMap[item.client_id] = [];
        actionMap[item.client_id].push(item as ActionItem);
      }
      setClientActionItems(actionMap);

      // [HQ Tasks ↔ Action Board link] Bulk-count HQ tasks linked to
      // every action item we just loaded. One query, indexed by the
      // FK we added in the tasks_link_to_client_action_items
      // migration. Cheap because tasks.client_action_item_id is
      // sparse (most tasks have it null).
      const allItemIds = (actionRes.data || []).map((i: any) => i.id);
      if (allItemIds.length > 0) {
        const { data: linkedTasks } = await (supabase as any)
          .from('tasks')
          .select('client_action_item_id')
          .in('client_action_item_id', allItemIds);
        const counts: Record<string, number> = {};
        for (const t of (linkedTasks || []) as any[]) {
          if (t.client_action_item_id) {
            counts[t.client_action_item_id] = (counts[t.client_action_item_id] || 0) + 1;
          }
        }
        setActionItemTaskCounts(counts);
      } else {
        setActionItemTaskCounts({});
      }

      // Milestones
      const msMap: Record<string, Milestone[]> = {};
      for (const ms of (milestoneRes.data || [])) {
        if (!msMap[ms.client_id]) msMap[ms.client_id] = [];
        msMap[ms.client_id].push(ms as Milestone);
      }
      setClientMilestones(msMap);

      // Milestone templates
      // Cast: see other setMilestoneTemplates site for context.
      setMilestoneTemplates((templateRes.data || []) as Array<{ id: string; name: string; description: string | null; milestones: any[]; is_default: boolean }>);

      // Mindshare configs — is_enabled comes back as boolean | null from
      // the DB; coerce to boolean for the local state.
      const msEnabled: Record<string, boolean> = {};
      for (const mc of (mindshareRes.data || [])) {
        msEnabled[mc.client_id] = mc.is_enabled === true;
      }
      setClientMindshareEnabled(msEnabled);

      // Portal access summary — count + most-recent timestamp per
      // client. Rows are already sorted desc, so first encounter is
      // the latest visit. Cast through unknown because portal_access_log
      // is too new to be in the generated database.types — the runtime
      // shape is exactly what we select above.
      const accessSummary: Record<string, { count_30d: number; last_at: string | null }> = {};
      for (const row of ((portalAccessRes.data || []) as unknown as Array<{ client_id: string; accessed_at: string }>)) {
        const bucket = accessSummary[row.client_id] || (accessSummary[row.client_id] = { count_30d: 0, last_at: null });
        bucket.count_30d++;
        if (!bucket.last_at) bucket.last_at = row.accessed_at;
      }
      setPortalAccessSummary(accessSummary);

      // HQ task counts per client. One pass over the rows we just
      // fetched — no further round-trips. Clients with zero open
      // tasks just don't appear in the map (badge falls back to 0).
      const taskCounts: Record<string, number> = {};
      for (const t of ((hqTasksRes.data || []) as Array<{ client_id: string | null }>)) {
        if (!t.client_id) continue;
        taskCounts[t.client_id] = (taskCounts[t.client_id] || 0) + 1;
      }
      setHqTaskCounts(taskCounts);
    } catch (err) {
      setError('Failed to load clients');
    } finally {
      setLoading(false);
    }
  };
  const refreshMeetingNotes = async () => {
    const { data } = await supabase
      .from('client_meeting_notes')
      .select('*')
      .order('meeting_date', { ascending: false });
    const notesMap: Record<string, MeetingNote[]> = {};
    for (const note of (data || []) as unknown as MeetingNote[]) {
      if (!notesMap[note.client_id]) notesMap[note.client_id] = [];
      notesMap[note.client_id].push(note);
    }
    setClientMeetingNotes(notesMap);
  };

  // Fetch client contexts
  const refreshClientContexts = async () => {
    const { data } = await supabase.from('client_context').select('*');
    const map: Record<string, ClientContext> = {};
    for (const ctx of (data || []) as unknown as ClientContext[]) map[ctx.client_id] = ctx;
    setClientContexts(map);
  };

  // Fetch decision logs
  const refreshDecisionLogs = async () => {
    const { data } = await supabase.from('client_decision_log').select('*').order('decision_date', { ascending: false });
    const map: Record<string, DecisionLogEntry[]> = {};
    for (const d of (data || []) as unknown as DecisionLogEntry[]) {
      if (!map[d.client_id]) map[d.client_id] = [];
      map[d.client_id].push(d);
    }
    setClientDecisionLogs(map);
  };

  // Action items & milestones
  const refreshActionItems = async () => {
    const { data } = await supabase.from('client_action_items').select('*').order('display_order', { ascending: true });
    const map: Record<string, ActionItem[]> = {};
    for (const item of (data || [])) {
      if (!map[item.client_id]) map[item.client_id] = [];
      map[item.client_id].push(item as ActionItem);
    }
    setClientActionItems(map);
  };

  const refreshMilestones = async () => {
    const { data } = await supabase.from('client_milestones').select('*').order('display_order', { ascending: true });
    const map: Record<string, Milestone[]> = {};
    for (const ms of (data || [])) {
      if (!map[ms.client_id]) map[ms.client_id] = [];
      map[ms.client_id].push(ms as Milestone);
    }
    setClientMilestones(map);
  };

  const DEFAULT_MILESTONES: { name: string; subtitle: string; status: 'complete' | 'active' | 'upcoming'; items: { text: string; court: 'yours' | 'ours' }[] }[] = [
    { name: 'Kickoff & Setup', subtitle: 'Onboarding form completed — workspace initialized', status: 'active', items: [
      { text: 'Provide additional assets & documentation (branding, decks, briefs)', court: 'yours' },
      { text: 'Confirm workspace access', court: 'yours' },
      { text: 'Onboarding portal link shared', court: 'ours' },
      { text: 'Client workspace initialized', court: 'ours' },
      { text: 'Onboarding form accessible and ready to receive project assets', court: 'ours' },
    ]},
    { name: 'Project & Ecosystem Review', subtitle: 'Deep dive underway', status: 'upcoming', items: [
      { text: 'Set up weekly sync meeting', court: 'yours' },
      { text: 'Project, product & resource review in progress', court: 'ours' },
      { text: 'Ecosystem & positioning analysis underway', court: 'ours' },
      { text: 'Narrative & market positioning review', court: 'ours' },
      { text: 'KOL outreach brief preparation starting', court: 'ours' },
    ]},
    { name: 'Outreach Brief Delivery', subtitle: 'Awaiting your review before KOL circulation', status: 'upcoming', items: [
      { text: 'Review KOL outreach brief', court: 'yours' },
      { text: 'Share feedback to unblock KOL circulation', court: 'yours' },
      { text: 'Initial outreach brief prepared', court: 'ours' },
      { text: 'APAC translation underway', court: 'ours' },
      { text: 'KOL shortlist being compiled', court: 'ours' },
    ]},
    { name: 'KOL Shortlist & Tracker Launch', subtitle: 'Campaign tracker goes live', status: 'upcoming', items: [
      { text: 'Review & confirm KOL shortlist', court: 'yours' },
      { text: 'KOL shortlist locked', court: 'ours' },
      { text: 'Campaign tracker live with selections & activity log', court: 'ours' },
      { text: 'Incentive budget documentation prepared (if requested)', court: 'ours' },
    ]},
    { name: 'Content Brief & Execution Breakdown', subtitle: 'Phased content brief finalized', status: 'upcoming', items: [
      { text: 'Review & approve finalized content brief', court: 'yours' },
      { text: 'Initial KOL content brief finalized with campaign phase breakdown', court: 'ours' },
      { text: 'KOL onboarding in progress', court: 'ours' },
      { text: 'Translation of first brief underway', court: 'ours' },
      { text: 'Korea GTM plan being developed', court: 'ours' },
    ]},
    { name: 'Korea GTM Plan Delivery', subtitle: 'Regional strategy confirmed', status: 'upcoming', items: [
      { text: 'Review Korea GTM plan', court: 'yours' },
      { text: 'Korea GTM plan in final review', court: 'ours' },
      { text: 'Regional positioning & activation sequence confirmed', court: 'ours' },
      { text: 'All week 1 deliverables being wrapped up', court: 'ours' },
    ]},
    { name: 'Content Goes Live', subtitle: 'Campaign activation underway', status: 'upcoming', items: [
      { text: 'Track content via campaign tracker', court: 'yours' },
      { text: 'All week 1 deliverables confirmed complete', court: 'ours' },
      { text: 'Campaign activation underway — content being posted by KOLs', court: 'ours' },
      { text: 'Full visibility confirmed before moving into week 2', court: 'ours' },
    ]},
  ];

  const seedMilestones = async (clientId: string) => {
    const existing = clientMilestones[clientId];
    if (existing && existing.length > 0) return;
    // Auto-seed with default template
    const defaultTemplate = milestoneTemplates.find(t => t.is_default);
    if (defaultTemplate) {
      await applyTemplate(clientId, defaultTemplate.milestones);
    } else {
      await applyTemplate(clientId, DEFAULT_MILESTONES.map(ms => ({ name: ms.name, subtitle: ms.subtitle, items: ms.items })));
    }
  };

  const applyTemplate = async (clientId: string, templateMilestones: { name: string; subtitle: string; items: { text: string; court: string }[] }[]) => {
    try {
      // Clear existing milestones and their action items
      const existingMs = clientMilestones[clientId] || [];
      for (const ms of existingMs) {
        await supabase.from('client_action_items').delete().eq('milestone_id', ms.id);
      }
      if (existingMs.length > 0) {
        await supabase.from('client_milestones').delete().eq('client_id', clientId);
      }

      for (let i = 0; i < templateMilestones.length; i++) {
        const ms = templateMilestones[i];
        const { data: inserted } = await supabase.from('client_milestones').insert({
          client_id: clientId,
          name: ms.name,
          subtitle: ms.subtitle,
          status: i === 0 ? 'active' : 'upcoming',
          display_order: i,
        }).select().single();
        if (inserted && ms.items) {
          const rows = ms.items.map((item, j) => ({
            client_id: clientId,
            text: item.text,
            court: item.court,
            phase: 'kickoff' as const,
            milestone_id: inserted.id,
            display_order: j,
          }));
          await supabase.from('client_action_items').insert(rows);
        }
      }
      await refreshMilestones();
      await refreshActionItems();
    } catch (err) {
      console.error('Error applying template:', err);
    }
  };

  const saveAsTemplate = async (clientId: string, name: string) => {
    const ms = clientMilestones[clientId] || [];
    const allItems = clientActionItems[clientId] || [];
    const templateData = ms.map(m => ({
      name: m.name,
      subtitle: m.subtitle,
      items: allItems
        .filter(i => i.milestone_id === m.id)
        .sort((a, b) => a.display_order - b.display_order)
        .map(i => ({ text: i.text, court: i.court })),
    }));
    const { error } = await supabase.from('milestone_templates').insert({
      name,
      milestones: templateData,
      created_by: userProfile?.id || null,
    });
    if (!error) {
      const { data } = await supabase.from('milestone_templates').select('*').order('is_default', { ascending: false }).order('name');
      // Cast: DB nullable fields vs the inline interface narrowing
      // is_default to boolean. See archive/page.tsx for long-term fix.
      setMilestoneTemplates((data || []) as Array<{ id: string; name: string; description: string | null; milestones: any[]; is_default: boolean }>);
    }
    return !error;
  };

  const handleActionItemSubmit = async () => {
    if (!contextModalClient || !actionItemForm.text.trim() || !activeMilestoneId) return;
    try {
      const attachUrl = actionItemForm.attachment_url.trim() || null;
      const attachLabel = actionItemForm.attachment_label.trim() || null;
      if (editingActionItemId) {
        await supabase.from('client_action_items').update({
          text: actionItemForm.text.trim(),
          court: actionItemForm.court,
          attachment_url: attachUrl,
          attachment_label: attachLabel,
          updated_at: new Date().toISOString(),
        }).eq('id', editingActionItemId);
      } else {
        const items = clientActionItems[contextModalClient.id] || [];
        const msItems = items.filter(i => i.milestone_id === activeMilestoneId && i.court === actionItemForm.court);
        const maxOrder = msItems.length > 0 ? Math.max(...msItems.map(i => i.display_order)) + 1 : 0;
        await supabase.from('client_action_items').insert({
          client_id: contextModalClient.id,
          text: actionItemForm.text.trim(),
          court: actionItemForm.court,
          phase: 'kickoff',
          milestone_id: activeMilestoneId,
          display_order: maxOrder,
          attachment_url: attachUrl,
          attachment_label: attachLabel,
        });
        // [Portal notification cleanup] Notify the client when a new
        // task lands in their court. court='mine' = HH's task → silent
        // (internal). court='yours' = client's to-do → fire so they
        // see it in the bell. Bulk inserts from milestone templates
        // (see line ~775) intentionally skip this — those are setup-
        // time operations, not incremental adds.
        if (actionItemForm.court === 'yours') {
          await logActivity(
            contextModalClient.id,
            'task_added',
            'New task for you',
            actionItemForm.text.trim(),
            undefined,
            'client_task_added',
          );
        }
      }
      await refreshActionItems();
      setIsActionItemFormOpen(false);
      setEditingActionItemId(null);
      setActionItemForm({ text: '', court: 'yours', attachment_url: '', attachment_label: '' });
    } catch (err) {
      console.error('Error saving action item:', err);
    }
  };

  const handleMilestoneSubmit = async () => {
    if (!contextModalClient || !milestoneForm.name.trim()) return;
    try {
      if (editingMilestoneId) {
        await supabase.from('client_milestones').update({
          name: milestoneForm.name.trim(),
          subtitle: milestoneForm.subtitle.trim() || null,
          status_message: milestoneForm.status_message.trim() || null,
        }).eq('id', editingMilestoneId);
      } else {
        const existing = clientMilestones[contextModalClient.id] || [];
        const maxOrder = existing.length > 0 ? Math.max(...existing.map(m => m.display_order)) + 1 : 0;
        await supabase.from('client_milestones').insert({
          client_id: contextModalClient.id,
          name: milestoneForm.name.trim(),
          subtitle: milestoneForm.subtitle.trim() || null,
          status_message: milestoneForm.status_message.trim() || null,
          display_order: maxOrder,
        });
      }
      await refreshMilestones();
      setIsMilestoneFormOpen(false);
      setEditingMilestoneId(null);
      setMilestoneForm({ name: '', subtitle: '', status_message: '' });
    } catch (err) {
      console.error('Error saving milestone:', err);
    }
  };

  /**
   * Log an event to the client's activity feed.
   *
   * HHP Onboarding Overhaul Spec § 8.5 — every call MUST pass an
   * `activityCategory` so the portal feed filter can decide whether
   * to surface it. Allowed values per the schema CHECK constraint:
   *
   *   Client-visible (appears on portal):
   *     • milestone_completed
   *     • milestone_activated
   *     • campaign_status_changed
   *     • resource_updated
   *     • client_task_added
   *
   *   Internal-only (hidden from portal, kept for admin audit):
   *     • milestone_setup
   *
   * If category is omitted, the column defaults to 'milestone_setup'
   * — safe-by-default (hidden) until someone explicitly categorizes.
   *
   * The legacy `activityType` argument is preserved for backward
   * compat. New callers should rely on `activityCategory` as the
   * source of truth for portal visibility.
   */
  const logActivity = async (
    clientId: string,
    activityType: string,
    title: string,
    description?: string,
    metadata?: Record<string, any>,
    activityCategory?:
      | 'milestone_completed' | 'milestone_activated'
      | 'campaign_status_changed' | 'resource_updated'
      | 'client_task_added' | 'milestone_setup',
  ) => {
    try {
      // [2026-06-11] Draft mode suppression removed. The bell that this
      // mode existed to silence was deleted in the same pass — see
      // /lib/notificationService.ts removal + Sidebar.tsx comment.
      // activity_category still gets recorded so the future "This Week"
      // snapshot can filter setup churn (milestone_setup) out of the
      // client-facing card. No real-time stream means no need for a
      // separate draft-mode flag.
      await supabase.from('client_activity_log').insert({
        client_id: clientId,
        activity_type: activityType,
        activity_category: activityCategory ?? 'milestone_setup',
        title,
        description: description || null,
        metadata: metadata || {},
        created_by: userProfile?.id || null,
        created_by_name: userProfile?.name || userProfile?.email || null,
      } as any);
    } catch (err) {
      console.error('Error logging activity:', err);
    }
  };

  const setMilestoneStatus = async (id: string, status: 'complete' | 'active' | 'upcoming') => {
    const ms = Object.values(clientMilestones).flat().find(m => m.id === id);
    await supabase.from('client_milestones').update({ status }).eq('id', id);
    await refreshMilestones();
    // [Portal notification cleanup] Only fire a client notification
    // for completions. Toggling active/upcoming was creating noise
    // during onboarding — admins flip statuses many times while
    // setting up a client, and each one was reaching the bell. Per
    // user ask: only milestone completions, new client tasks, and
    // resource updates should notify.
    if (ms && status === 'complete') {
      await logActivity(ms.client_id, 'milestone_status', 'Milestone completed', ms.name, undefined, 'milestone_completed');
    } else if (ms && status === 'active') {
      // Per Onboarding Overhaul § 8.5 audit (2026-06-11) — activated
      // events are useful client-visible signal ("your next milestone
      // is now in progress"), distinct from setup churn. Hidden
      // before this pass; surfacing them now.
      await logActivity(ms.client_id, 'milestone_status', 'Milestone activated', ms.name, undefined, 'milestone_activated');
    } else if (ms && status === 'upcoming') {
      // Backtrack — admin marked a previously-active milestone as
      // upcoming. Always setup churn (the Altura 2026-05-20 incident).
      // Logged for audit but hidden from portal feed.
      await logActivity(ms.client_id, 'milestone_status', 'Milestone set to upcoming', ms.name, undefined, 'milestone_setup');
    }
  };

  const toggleMindshare = async (clientId: string) => {
    const current = clientMindshareEnabled[clientId] ?? false;
    const { data: existing } = await supabase.from('client_mindshare_config').select('id').eq('client_id', clientId).single();
    if (existing) {
      await supabase.from('client_mindshare_config').update({ is_enabled: !current }).eq('client_id', clientId);
    } else {
      await supabase.from('client_mindshare_config').insert({ client_id: clientId, is_enabled: true });
    }
    setClientMindshareEnabled(prev => ({ ...prev, [clientId]: !current }));
  };

  const toggleMilestoneVisibility = async (id: string, isVisible: boolean) => {
    await supabase.from('client_milestones').update({ is_visible: !isVisible }).eq('id', id);
    await refreshMilestones();
  };

  const deleteMilestone = async (id: string) => {
    await supabase.from('client_action_items').update({ milestone_id: null }).eq('milestone_id', id);
    await supabase.from('client_milestones').delete().eq('id', id);
    await refreshMilestones();
    await refreshActionItems();
  };

  const toggleActionItemDone = async (item: ActionItem) => {
    const newDone = !item.is_done;
    await supabase.from('client_action_items').update({ is_done: newDone, updated_at: new Date().toISOString() }).eq('id', item.id);
    await refreshActionItems();

    // Auto-update milestone status based on action item completion
    if (item.milestone_id) {
      const { data: msItems } = await supabase
        .from('client_action_items')
        .select('id, is_done')
        .eq('milestone_id', item.milestone_id);

      if (msItems && msItems.length > 0) {
        const allDone = msItems.every(i => i.id === item.id ? newDone : i.is_done);
        const currentMs = Object.values(clientMilestones).flat().find(m => m.id === item.milestone_id);
        if (allDone && currentMs?.status !== 'complete') {
          await supabase.from('client_milestones').update({ status: 'complete' }).eq('id', item.milestone_id);
          await refreshMilestones();
          await logActivity(item.client_id, 'milestone_status', 'Milestone completed', currentMs?.name || '', undefined, 'milestone_completed');
        } else if (!allDone && currentMs?.status === 'complete') {
          await supabase.from('client_milestones').update({ status: 'active' }).eq('id', item.milestone_id);
          await refreshMilestones();
        }
      }
    }
  };

  const toggleActionItemHidden = async (item: ActionItem) => {
    await supabase.from('client_action_items').update({ is_hidden: !item.is_hidden, updated_at: new Date().toISOString() }).eq('id', item.id);
    await refreshActionItems();
  };

  /**
   * [2026-06-16] Onboarding Overhaul § 5 Action Board auto-derive.
   * Creates an HQ task linked to this action item so completion in
   * /tasks propagates back via the propagate_task_to_milestone trigger.
   * Only fires for court='ours' items (HH-side work); client-side items
   * stay on the Action Board checklist.
   */
  const createTaskFromActionItem = async (item: ActionItem) => {
    const { error } = await (supabase as any).from('tasks').insert({
      task_name: item.text,
      client_id: item.client_id,
      client_action_item_id: item.id,
      task_type: 'one_time',
      status: 'not_started',
      assigned_to: userProfile?.id || null,
      assigned_to_name: userProfile?.name || null,
      created_by: userProfile?.id || null,
      created_by_name: userProfile?.name || null,
    });
    if (error) {
      toast({ title: 'Failed to create task', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'HQ task created', description: `Linked to "${item.text}"` });
    // Optimistically bump the count so the row flips to "1 HQ task" link.
    setActionItemTaskCounts(prev => ({ ...prev, [item.id]: (prev[item.id] || 0) + 1 }));
  };

  const deleteActionItem = async (id: string) => {
    await supabase.from('client_action_items').delete().eq('id', id);
    await refreshActionItems();
    setDeletingActionItemId(null);
  };

  const addMeetingNote = async (clientId: string, note: { title: string; content: string; meeting_date: string; attendees: string; action_items: string }) => {
    const { error } = await supabase.from('client_meeting_notes').insert({
      client_id: clientId,
      title: note.title,
      content: note.content || null,
      meeting_date: note.meeting_date,
      attendees: note.attendees || null,
      action_items: note.action_items || null,
      created_by: user?.id,
    });
    if (error) throw error;
    await refreshMeetingNotes();
  };

  const updateMeetingNote = async (noteId: string, note: { title: string; content: string; meeting_date: string; attendees: string; action_items: string }) => {
    const { error } = await supabase.from('client_meeting_notes').update({
      title: note.title,
      content: note.content || null,
      meeting_date: note.meeting_date,
      attendees: note.attendees || null,
      action_items: note.action_items || null,
      updated_at: new Date().toISOString(),
    }).eq('id', noteId);
    if (error) throw error;
    await refreshMeetingNotes();
  };

  const deleteMeetingNote = async (noteId: string) => {
    const { error } = await supabase.from('client_meeting_notes').delete().eq('id', noteId);
    if (error) throw error;
    await refreshMeetingNotes();
    setDeletingNoteId(null);
  };

  const openNoteForm = (note?: MeetingNote) => {
    if (note) {
      setEditingNoteId(note.id);
      setMeetingNoteForm({ title: note.title, content: note.content || '', meeting_date: new Date(note.meeting_date + 'T00:00:00'), attendees: note.attendees || '', action_items: note.action_items || '' });
    } else {
      setEditingNoteId(null);
      setMeetingNoteForm({ title: '', content: '', meeting_date: undefined, attendees: '', action_items: '' });
    }
    setIsNoteFormOpen(true);
  };

  // Parse Gemini meeting notes .docx
  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-uploaded
    e.target.value = '';

    if (!file.name.endsWith('.docx')) {
      toast({ title: 'Invalid file', description: 'Please upload a .docx file (Gemini meeting notes export).', variant: 'destructive' });
      return;
    }

    setIsParsingDoc(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text = result.value;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

      // Parse Gemini meeting notes format
      let title = '';
      let meetingDate: Date | undefined;
      let attendees = '';
      let content = '';
      let actionItems = '';

      // Line 1: Date (e.g. "Feb 10, 2026")
      // Line 2: Title
      // Line starting with "Invited": attendees
      // After "Summary" or "Details": content
      // After "Suggested next steps": action items

      let section = 'header'; // header | summary | details | actions | footer
      let lineIndex = 0;

      for (const line of lines) {
        // Skip footer lines from Gemini
        if (line.startsWith('You should review Gemini') || line.startsWith('Please provide feedback')) continue;
        if (line.startsWith('Get tips and learn how Gemini')) continue;

        if (lineIndex === 0) {
          // First line is the date
          const parsed = new Date(line);
          if (!isNaN(parsed.getTime())) {
            meetingDate = parsed;
          }
          lineIndex++;
          continue;
        }

        if (lineIndex === 1) {
          title = line;
          lineIndex++;
          continue;
        }

        if (line.startsWith('Invited ')) {
          attendees = line.replace('Invited ', '').trim();
          lineIndex++;
          continue;
        }

        if (line.startsWith('Attachments ')) {
          lineIndex++;
          continue;
        }

        if (line === 'Summary') {
          section = 'summary';
          lineIndex++;
          continue;
        }

        if (line === 'Details') {
          section = 'details';
          lineIndex++;
          continue;
        }

        if (line === 'Suggested next steps') {
          section = 'actions';
          lineIndex++;
          continue;
        }

        if (section === 'summary' || section === 'details') {
          content += (content ? '\n\n' : '') + line;
        } else if (section === 'actions') {
          actionItems += (actionItems ? '\n' : '') + line;
        }

        lineIndex++;
      }

      // Convert content and action items to basic HTML for ReactQuill
      const toHtml = (text: string) => text.split('\n').map(p => p.trim() ? `<p>${p.trim()}</p>` : '').join('');

      setMeetingNoteForm({
        title,
        meeting_date: meetingDate,
        attendees,
        content: toHtml(content),
        action_items: toHtml(actionItems),
      });
      setIsNoteFormOpen(true);
      setEditingNoteId(null);

      toast({ title: 'Document parsed', description: 'Meeting note fields have been filled from the document.' });
    } catch (err) {
      console.error('Error parsing .docx:', err);
      toast({ title: 'Parse error', description: 'Failed to parse the document. Make sure it is a Gemini meeting notes .docx export.', variant: 'destructive' });
    } finally {
      setIsParsingDoc(false);
    }
  };

  const handleNoteFormSubmit = async () => {
    if (!meetingNotesModalClient || !meetingNoteForm.title.trim() || !meetingNoteForm.meeting_date) return;
    const payload = {
      title: meetingNoteForm.title.trim(),
      content: meetingNoteForm.content.trim(),
      meeting_date: formatLocalYMD(meetingNoteForm.meeting_date),
      attendees: meetingNoteForm.attendees.trim(),
      action_items: meetingNoteForm.action_items.trim(),
    };
    try {
      if (editingNoteId) {
        await updateMeetingNote(editingNoteId, payload);
      } else {
        await addMeetingNote(meetingNotesModalClient.id, payload);
      }
      setIsNoteFormOpen(false);
      setEditingNoteId(null);
      setMeetingNoteForm({ title: '', content: '', meeting_date: undefined, attendees: '', action_items: '' });
    } catch (err) {
      console.error('Error saving meeting note:', err);
    }
  };

  // Helper to get linked CRM account for a client
  const getLinkedCRMAccount = (clientId: string) => {
    const accounts = linkedAccounts[clientId];
    // Get the first account-stage opportunity (account_active, account_at_risk, account_churned)
    return accounts?.find(a => a.stage.startsWith('account_')) || accounts?.[0] || null;
  };

  // Scope options mapping (consistent with pipeline page)
  const scopeLabels: Record<string, string> = {
    'fundraising': 'Fundraising',
    'advisory': 'Advisory',
    'kol_activation': 'KOL Activation',
    'gtm': 'GTM',
    'bd_partnerships': 'BD/Partnerships',
    'apac': 'APAC',
  };

  // Format CRM scope for display (uses same labels as pipeline page)
  const formatCRMScope = (scope: string | null) => {
    if (!scope) return '';
    return scope.split(',').map(s => scopeLabels[s.trim()] || s.trim()).join(', ');
  };

  // Context CRUD
  const openContextModal = (client: ClientWithAccess, initialTab: string = 'context') => {
    const ctx = clientContexts[client.id];
    const crmAccount = getLinkedCRMAccount(client.id);

    // If CRM account exists, use its scope and closed_at/qualified_at for start_date
    const crmScope = crmAccount?.scope ? formatCRMScope(crmAccount.scope) : '';
    const crmStartDate = crmAccount?.closed_at || crmAccount?.qualified_at || crmAccount?.created_at;

    setContextModalClient(client);
    setContextModalTab(initialTab);
    // Action Board / Weekly Update do their own lazy loads on mount
    // via the Tabs onValueChange handler — fire equivalent loaders
    // here so deep-linking from the client card works on first paint.
    if (initialTab === 'actionboard') {
      seedMilestones(client.id);
    } else if (initialTab === 'weekly-update') {
      loadWeeklyV2Row(client.id, weeklyV2Week);
      // Zone C inline candidates — load alongside the v2 row so the
      // top-3 list is ready when the tab paints (no extra click).
      fetchTopPostCandidates(client.id);
    }
    setContextForm({
      engagement_type: ctx?.engagement_type || '',
      scope: crmAccount ? crmScope : (ctx?.scope || ''),
      start_date: crmAccount && crmStartDate
        ? new Date(crmStartDate)
        : (ctx?.start_date ? new Date(ctx.start_date + 'T00:00:00') : undefined),
      milestones: ctx?.milestones || '',
      client_contacts: ctx?.client_contacts || '',
      holohive_contacts: ctx?.holohive_contacts || '',
      telegram_url: (ctx as any)?.telegram_url || '',
      telegram_chat_id: (ctx as any)?.telegram_chat_id || '',
      shared_drive_url: (ctx as any)?.shared_drive_url || '',
      gtm_sync_url: (ctx as any)?.gtm_sync_url || '',
      kol_content_brief_url: (ctx as any)?.kol_content_brief_url || '',
      onboarding_phase: (ctx as any)?.onboarding_phase || '',
    });

    // [Phase edit in popup] Find the latest active campaign for this
    // client so the phase dropdown at the top of the Context tab has
    // something to edit. Matches the portal hero's picker:
    //   1. Prefer campaigns where today is in [start, end]
    //   2. Among those, nearest end_date wins
    //   3. Fall back to the most recently started non-archived campaign
    setLatestCampaign(null);
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from('campaigns')
          .select('id, name, start_date, end_date, current_phase, archived_at')
          .eq('client_id', client.id)
          .is('archived_at', null)
          .order('start_date', { ascending: false });
        const rows: LatestCampaign[] = (data || []).map((r: any) => ({
          id: r.id,
          name: r.name,
          start_date: r.start_date,
          end_date: r.end_date,
          current_phase: r.current_phase || null,
        }));
        if (rows.length === 0) {
          setLatestCampaign(null);
          return;
        }
        const today = new Date().toISOString().slice(0, 10);
        const inWindow = rows.filter(r => r.start_date && r.end_date && r.start_date <= today && r.end_date >= today);
        if (inWindow.length > 0) {
          const winner = [...inWindow].sort((a, b) => (a.end_date! < b.end_date! ? -1 : 1))[0];
          setLatestCampaign(winner);
        } else {
          // rows already sorted DESC by start_date
          setLatestCampaign(rows[0]);
        }
      } catch (err) {
        console.error('Failed to fetch latest campaign for phase dropdown:', err);
        setLatestCampaign(null);
      }
    })();
  };

  // [Phase edit in popup] Save the campaign's phase from the popup's
  // dropdown. Optimistic local update so the dropdown reflects the new
  // value immediately. Mirrors the same UPDATE that the campaign edit
  // page does — uses CampaignService.updateCampaign so the field
  // validation + side effects stay consistent.
  const handleLatestCampaignPhaseChange = async (newPhase: string | null) => {
    if (!latestCampaign) return;
    const prevPhase = latestCampaign.current_phase;
    setLatestCampaign({ ...latestCampaign, current_phase: newPhase });
    setSavingPhase(true);
    try {
      const { error } = await (supabase as any)
        .from('campaigns')
        .update({ current_phase: newPhase })
        .eq('id', latestCampaign.id);
      if (error) throw error;
      toast({ title: 'Phase updated', description: `${latestCampaign.name} → ${newPhase || 'None'}` });
    } catch (err: any) {
      console.error('Failed to update phase:', err);
      setLatestCampaign({ ...latestCampaign, current_phase: prevPhase });
      toast({ title: 'Phase update failed', description: err?.message ?? 'Failed to update phase', variant: 'destructive' });
    } finally {
      setSavingPhase(false);
    }
  };

  const handleContextSubmit = async () => {
    if (!contextModalClient) return;
    const existing = clientContexts[contextModalClient.id];
    const payload = {
      client_id: contextModalClient.id,
      engagement_type: contextForm.engagement_type || null,
      scope: contextForm.scope || null,
      start_date: contextForm.start_date ? formatLocalYMD(contextForm.start_date) : null,
      milestones: contextForm.milestones || null,
      client_contacts: contextForm.client_contacts || null,
      holohive_contacts: contextForm.holohive_contacts || null,
      telegram_url: contextForm.telegram_url || null,
      telegram_chat_id: contextForm.telegram_chat_id?.trim() || null,
      shared_drive_url: contextForm.shared_drive_url || null,
      gtm_sync_url: contextForm.gtm_sync_url || null,
      kol_content_brief_url: contextForm.kol_content_brief_url || null,
      onboarding_phase: contextForm.onboarding_phase || null,
      updated_at: new Date().toISOString(),
    };
    try {
      if (existing) {
        await supabase.from('client_context').update(payload).eq('id', existing.id);
      } else {
        await supabase.from('client_context').insert(payload);
      }
      await refreshClientContexts();
      // [2026-06-08] approved_domains save removed — that column is now
      // edited only via the Edit Client dialog.
      // Log resource changes
      const oldCtx = existing as any;
      const changes: string[] = [];
      if ((payload.telegram_url || '') !== (oldCtx?.telegram_url || '')) changes.push('Telegram group');
      if ((payload.telegram_chat_id || '') !== (oldCtx?.telegram_chat_id || '')) changes.push('Telegram chat ID');
      if ((payload.shared_drive_url || '') !== (oldCtx?.shared_drive_url || '')) changes.push('Shared drive');
      if ((payload.gtm_sync_url || '') !== (oldCtx?.gtm_sync_url || '')) changes.push('GTM Overview');
      if ((payload.kol_content_brief_url || '') !== (oldCtx?.kol_content_brief_url || '')) changes.push('KOL Content Brief');
      if (changes.length > 0) {
        await logActivity(contextModalClient.id, 'resource_updated', 'Resources updated', changes.join(', '), undefined, 'resource_updated');
      }
      setContextModalClient(null);
    } catch (err) {
      console.error('Error saving context:', err);
    }
  };

  // Decision log CRUD
  const handleDecisionSubmit = async () => {
    if (!meetingNotesModalClient || !decisionForm.summary.trim() || !decisionForm.decision_date) return;
    const decDateStr = formatLocalYMD(decisionForm.decision_date);
    try {
      if (editingDecisionId) {
        await supabase.from('client_decision_log').update({
          decision_date: decDateStr,
          summary: decisionForm.summary.trim(),
        }).eq('id', editingDecisionId);
      } else {
        await supabase.from('client_decision_log').insert({
          client_id: meetingNotesModalClient.id,
          decision_date: decDateStr,
          summary: decisionForm.summary.trim(),
          created_by: user?.id,
        });
      }
      await refreshDecisionLogs();
      setIsDecisionFormOpen(false);
      setEditingDecisionId(null);
      setDecisionForm({ decision_date: undefined, summary: '' });
    } catch (err) {
      console.error('Error saving decision:', err);
    }
  };

  const deleteDecision = async (id: string) => {
    await supabase.from('client_decision_log').delete().eq('id', id);
    await refreshDecisionLogs();
    setDeletingDecisionId(null);
  };

  // [2026-06-08] Legacy weekly handlers (openWeeklyModal, openWeeklyForm,
  // handleWeeklySubmit, deleteWeeklyUpdate) removed. The Weekly Update
  // v2 tab below is the single source of truth for editing
  // client_weekly_updates rows.

  // ─── Weekly Update v2 — load / autosave / submit ──────────────────
  //
  // Lifecycle:
  //   1. User opens the Context modal → switches to Weekly Update tab
  //      → loadWeeklyV2Row() runs for (client, current week).
  //   2. As the user edits, local state is updated immediately for
  //      snappy UX. Auto-save fires on blur for textareas / on change
  //      for structured rows (debounced where appropriate).
  //   3. On Execution Plan "Submit & create tasks", we batch-create
  //      HQ tasks then stamp execution_plan_submitted_at to lock the
  //      plan for the week.
  //
  // Why we operate on ONE row at a time:
  //   The (client_id, week_of) tuple is the canonical key. Two CMs
  //   editing the same week land on the same row; week_of is snapped
  //   to Monday so weekday-of-open doesn't matter.

  const loadWeeklyV2Row = async (clientId: string, week: Date) => {
    setWeeklyV2Loading(true);
    setWeeklyV2SaveStatus('idle');
    try {
      const weekStr = formatLocalYMD(week);
      const { data, error } = await (supabase as any)
        .from('client_weekly_updates')
        .select('*')
        .eq('client_id', clientId)
        .eq('week_of', weekStr)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
      const row: WeeklyUpdate | null = data || null;
      setWeeklyV2Row(row);
      setWeeklyV2StrategicNotes(row?.strategic_notes || '');
      setWeeklyV2ExecPlan(Array.isArray(row?.execution_plan) ? (row!.execution_plan as ExecutionPlanRow[]) : []);
      setWeeklyV2ThisWeekFeed(Array.isArray(row?.this_week_feed) ? (row!.this_week_feed as ThisWeekFeedItem[]) : []);
    } catch (err) {
      console.error('Failed to load weekly update v2 row:', err);
      toast({ title: 'Failed to load weekly update', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setWeeklyV2Loading(false);
    }
  };

  /**
   * Upsert a partial set of v2 fields onto the (client_id, week_of)
   * row, creating it if it doesn't exist yet. Returns the resulting
   * row so callers can keep their `weeklyV2Row` reference fresh
   * (especially to track the new `id` after first insert).
   *
   * Patch shape mirrors the DB columns — pass only the keys you want
   * to change.
   */
  const saveWeeklyV2 = async (
    clientId: string,
    week: Date,
    patch: Partial<{
      strategic_notes: string | null;
      execution_plan: ExecutionPlanRow[] | null;
      execution_plan_submitted_at: string | null;
      execution_plan_submitted_by: string | null;
      this_week_feed: ThisWeekFeedItem[] | null;
      top_post_override: { content_id: string } | null;
    }>,
  ): Promise<WeeklyUpdate | null> => {
    setWeeklyV2SaveStatus('saving');
    try {
      const weekStr = formatLocalYMD(week);
      const existing = weeklyV2Row;
      // Stamp metadata when the strategic_notes value is part of the
      // patch — the spec asks for a "who/when" trail so Bolt knows
      // when Jdot last touched the notes.
      const enrichedPatch: Record<string, any> = { ...patch, updated_at: new Date().toISOString() };
      if ('strategic_notes' in patch) {
        enrichedPatch.strategic_notes_updated_at = new Date().toISOString();
        enrichedPatch.strategic_notes_by = user?.id || null;
      }
      // [2026-06-11] Q5 audit-log capture. Snapshot the fields about to
      // change BEFORE we write so we can record before/after in
      // client_weekly_update_audit. Phase-2 spec § Q5 allows mid-week
      // text/date edits; this is how we stay accountable without
      // tight-locking the form.
      const auditBefore: Record<string, any> = {};
      if (existing) {
        for (const key of Object.keys(patch) as Array<keyof typeof patch>) {
          auditBefore[key as string] = (existing as any)[key] ?? null;
        }
      }
      let row: WeeklyUpdate | null = null;
      if (existing) {
        const { data, error } = await (supabase as any)
          .from('client_weekly_updates')
          .update(enrichedPatch)
          .eq('id', existing.id)
          .select('*')
          .single();
        if (error) throw error;
        row = data;
      } else {
        // First-time write for this week — minimal NOT-NULL fields so
        // the insert succeeds. current_focus is NOT NULL in the legacy
        // schema; we seed an empty placeholder. Old modal continues
        // to overwrite this when used.
        const insertPayload: Record<string, any> = {
          client_id: clientId,
          week_of: weekStr,
          current_focus: '',
          created_by: user?.id || null,
          ...enrichedPatch,
        };
        const { data, error } = await (supabase as any)
          .from('client_weekly_updates')
          .insert(insertPayload)
          .select('*')
          .single();
        if (error) throw error;
        row = data;
      }
      setWeeklyV2Row(row);
      setWeeklyV2SaveStatus('saved');
      // [2026-06-11] Q5 audit-log write. One row per logical edit_kind.
      // The audit table's CHECK constraint allows only 5 kinds:
      // strategic_notes, execution_plan, this_week_feed, top_post_override,
      // submitted. Map raw patch keys onto that vocabulary and dedupe
      // (Zone A's submit lock writes 3 keys — execution_plan +
      // execution_plan_submitted_at + execution_plan_submitted_by —
      // which collapse to one 'submitted' audit row). Fire-and-forget;
      // audit failures must never block the user-facing save.
      if (row?.id) {
        const KIND_MAP: Record<string, 'strategic_notes' | 'execution_plan' | 'this_week_feed' | 'top_post_override' | 'submitted'> = {
          strategic_notes:                'strategic_notes',
          execution_plan:                 'execution_plan',
          this_week_feed:                 'this_week_feed',
          top_post_override:              'top_post_override',
          execution_plan_submitted_at:    'submitted',
          execution_plan_submitted_by:    'submitted',
        };
        const kindsSeen = new Set<string>();
        const auditRows: any[] = [];
        for (const key of Object.keys(patch)) {
          const kind = KIND_MAP[key];
          if (!kind || kindsSeen.has(kind)) continue;
          kindsSeen.add(kind);
          auditRows.push({
            weekly_update_id: row.id,
            edit_kind: kind,
            before_json: auditBefore[key] ?? null,
            after_json: (patch as any)[key] ?? null,
            edited_by: user?.id || null,
            edited_by_name: userProfile?.name || user?.email || null,
          });
        }
        if (auditRows.length > 0) {
          (supabase as any)
            .from('client_weekly_update_audit')
            .insert(auditRows)
            .then((res: any) => {
              if (res?.error) console.error('[weeklyV2.audit] insert failed:', res.error);
            });
        }
      }
      // Clear the "Saved" pill after 1.5s so it doesn't linger.
      window.setTimeout(() => {
        setWeeklyV2SaveStatus(prev => prev === 'saved' ? 'idle' : prev);
      }, 1500);
      return row;
    } catch (err) {
      console.error('Failed to save weekly update v2:', err);
      setWeeklyV2SaveStatus('error');
      toast({ title: 'Save failed', description: (err as Error).message, variant: 'destructive' });
      return null;
    }
  };

  /**
   * Zone A submit — batch-create HQ tasks from the execution plan,
   * then stamp execution_plan_submitted_at to lock the rows for the
   * week. Each row becomes one task in the `tasks` table with:
   *   - title = description
   *   - assigned_to = assignee_id
   *   - client_id = current client
   *   - due_date = row.due_date
   *   - deliverable_type = row.deliverable_type
   *
   * Skips rows with no description or no assignee — they're treated
   * as incomplete drafts.
   */
  const submitExecutionPlan = async (clientId: string) => {
    const ready = weeklyV2ExecPlan.filter(r => r.description.trim() && r.assignee_id);
    if (ready.length === 0) {
      toast({ title: 'Nothing to submit', description: 'Fill in description + assignee for at least one row.', variant: 'destructive' });
      return;
    }
    setWeeklyV2SaveStatus('saving');
    try {
      // Persist the latest exec_plan state first so what we batch-
      // create matches what's saved. Avoids a race where the user
      // edits a row and clicks submit before autosave lands.
      await saveWeeklyV2(clientId, weeklyV2Week, { execution_plan: weeklyV2ExecPlan });
      // Look up team-member names so we can populate assigned_to_name
      // (the tasks schema stores both id and name — joined data leaks
      // are fine, but querying by name is faster for the /tasks page).
      const memberNameById = new Map<string, string>();
      for (const u of allUsers as any[]) {
        if (u.id) memberNameById.set(u.id, u.name || u.email || 'Unknown');
      }
      const inserts = ready.map(r => ({
        task_name: r.description.trim(),
        assigned_to: r.assignee_id,
        assigned_to_name: r.assignee_id ? memberNameById.get(r.assignee_id) || null : null,
        client_id: clientId,
        due_date: r.due_date,
        // Spec: "Type = 'Client Delivery'". The /tasks page has
        // 'Client Delivery' as an explicit task_type value (L100).
        // deliverable_type carries the row-level sub-type (brief /
        // report / translation / content_review / client_update).
        task_type: 'Client Delivery',
        deliverable_type: r.deliverable_type,
        frequency: 'one-time',
        priority: 'medium',
        status: 'to_do',
        created_by: user?.id || null,
        created_by_name: userProfile?.name || userProfile?.email || null,
        // Tag the source so /tasks views can group "Created from
        // Weekly Update" if useful later. Free-text column is fine.
        source: 'weekly_update',
      }));
      const { error } = await (supabase as any).from('tasks').insert(inserts);
      if (error) throw error;
      await saveWeeklyV2(clientId, weeklyV2Week, {
        execution_plan_submitted_at: new Date().toISOString(),
        execution_plan_submitted_by: user?.id || null,
      });
      // Spec: "The 'X HQ tasks' count on the client card updates
      // automatically." Refresh the per-client HQ task counts so the
      // card behind the modal reflects the new tasks immediately.
      try {
        const { data: hqRows } = await (supabase as any)
          .from('tasks')
          .select('client_id')
          .neq('status', 'complete')
          .is('parent_task_id', null)
          .not('client_id', 'is', null);
        const counts: Record<string, number> = {};
        for (const t of (hqRows || []) as Array<{ client_id: string | null }>) {
          if (!t.client_id) continue;
          counts[t.client_id] = (counts[t.client_id] || 0) + 1;
        }
        setHqTaskCounts(counts);
      } catch (refreshErr) {
        // Non-fatal: if the refresh fails the count is stale until
        // next fetchClients(). Don't surface to the user — the task
        // creation succeeded.
        console.error('Failed to refresh hq task counts after Zone A submit:', refreshErr);
      }
      toast({ title: 'Execution plan submitted', description: `Created ${inserts.length} HQ task${inserts.length === 1 ? '' : 's'}.` });
    } catch (err) {
      console.error('Execution plan submit failed:', err);
      setWeeklyV2SaveStatus('error');
      toast({ title: 'Submit failed', description: (err as Error).message, variant: 'destructive' });
    }
  };

  // Helper for Zone B status toggle — flips an item's pending/done
  // status, stamps done_at/done_by, and auto-saves. Mutates a copy
  // so React state replacement triggers a re-render.
  //
  // SIDE EFFECT (Phase 3): when an item flips pending → done we also
  // upsert a Delivery Log draft with pending_review = true. The draft
  // pre-fills:
  //   - action      = item.text (the client-facing item)
  //   - log_date    = item.date or today (local YMD)
  //   - audience    = 'client'                  (default per spec)
  //   - pending_review = true
  //   - source      = 'weekly_update_feed'
  //   - source_ref  = item.id   (dedupes re-toggles — see findExistingDraft)
  //
  // When the same item flips done → pending we DON'T delete the draft.
  // The CM may have already started filling Who/How/Where on it; we
  // let them explicitly Dismiss in the Delivery Logs view if they
  // want it gone. The draft just stays parked; the next done-flip
  // looks it up by source_ref and re-uses the same row.
  const toggleThisWeekItemStatus = async (clientId: string, itemId: string) => {
    const previousItem = weeklyV2ThisWeekFeed.find(it => it.id === itemId);
    const updated = weeklyV2ThisWeekFeed.map(it => {
      if (it.id !== itemId) return it;
      const nextStatus: 'pending' | 'done' = it.status === 'done' ? 'pending' : 'done';
      return {
        ...it,
        status: nextStatus,
        done_at: nextStatus === 'done' ? new Date().toISOString() : null,
        done_by: nextStatus === 'done' ? (user?.id || null) : null,
      };
    });
    setWeeklyV2ThisWeekFeed(updated);
    await saveWeeklyV2(clientId, weeklyV2Week, { this_week_feed: updated });

    // Only create / refresh the draft when the flip was pending → done.
    const flippedItem = updated.find(it => it.id === itemId);
    if (flippedItem && flippedItem.status === 'done' && previousItem?.status !== 'done') {
      try {
        await createOrRefreshDeliveryDraft(clientId, flippedItem);
      } catch (err) {
        // Don't fail the toggle — the v2 feed save already succeeded.
        // Surface the failure as a toast so the CM knows the draft
        // wasn't created and can add it manually.
        console.error('Failed to create delivery log draft:', err);
        toast({
          title: 'Draft not created',
          description: (err as Error).message,
          variant: 'destructive',
        });
      }
    }
  };

  /**
   * Zone C — Top Post override picker.
   *
   * Fetches all posted content for the client's campaigns, sorted by
   * total engagement (likes + retweets + comments + bookmarks +
   * impressions/100 as a tiebreaker). Returns the top ~30 — Andy
   * shouldn't need to scroll further than that to find the post
   * they want to pin.
   */
  const fetchTopPostCandidates = async (clientId: string) => {
    setTopPostCandidatesLoading(true);
    try {
      // Two-step fetch: first the client's campaign IDs, then posted
      // content filtered by campaign_id IN (...). Mirrors the portal's
      // fetchTopPost pattern. The previous embedded `campaigns!inner`
      // filter (`.eq('campaigns.client_id', clientId)`) returned 0 rows
      // in practice even when 22 posted rows existed — PostgREST
      // embedded filters on hop-2 relations are unreliable here.
      const { data: campaignRows, error: campErr } = await (supabase as any)
        .from('campaigns')
        .select('id')
        .eq('client_id', clientId);
      if (campErr) throw campErr;
      const campaignIds = (campaignRows || []).map((c: any) => c.id);
      if (campaignIds.length === 0) {
        setTopPostCandidates([]);
        return;
      }
      const { data, error } = await (supabase as any)
        .from('contents')
        .select(`
          id, platform, content_link, impressions, likes, comments, retweets, bookmarks, notes, activation_date,
          campaign_kols!inner ( master_kols!inner ( name ) )
        `)
        .in('campaign_id', campaignIds)
        .eq('status', 'posted')
        .order('activation_date', { ascending: false })
        .limit(60);
      if (error) throw error;
      const rows = ((data || []) as any[]).map(r => ({
        id: r.id,
        kol_name: r.campaign_kols?.master_kols?.name || 'Unknown KOL',
        platform: r.platform,
        content_link: r.content_link,
        impressions: r.impressions || 0,
        likes: r.likes || 0,
        comments: r.comments || 0,
        retweets: r.retweets || 0,
        engagements: (r.likes || 0) + (r.retweets || 0) + (r.comments || 0) + (r.bookmarks || 0),
        notes: r.notes,
      }));
      rows.sort((a, b) => (b.engagements - a.engagements) || (b.impressions - a.impressions));
      setTopPostCandidates(rows.slice(0, 30));
    } catch (err) {
      console.error('Failed to fetch top post candidates:', err);
      toast({ title: 'Failed to load posts', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setTopPostCandidatesLoading(false);
    }
  };

  const pinTopPost = async (clientId: string, contentId: string) => {
    // Toggle behavior: if this content is already pinned, treat the
    // click as an unpin (back to auto-pick). Lets the inline top-3
    // list act as both the picker and the clear control.
    const isAlreadyPinned = weeklyV2Row?.top_post_override?.content_id === contentId;
    await saveWeeklyV2(clientId, weeklyV2Week, {
      top_post_override: isAlreadyPinned ? null : { content_id: contentId },
    });
  };

  const clearTopPostOverride = async (clientId: string) => {
    await saveWeeklyV2(clientId, weeklyV2Week, { top_post_override: null });
  };

  /** Fetch the last ~8 weeks of strategic notes for the current
   *  client. Older weeks may exist in the DB but the user almost
   *  never needs more than 2 months of context. */
  const fetchStrategicHistory = async (clientId: string) => {
    setStrategicHistoryLoading(true);
    try {
      const currentWeekStr = formatLocalYMD(weeklyV2Week);
      const { data, error } = await (supabase as any)
        .from('client_weekly_updates')
        .select('id, week_of, strategic_notes, strategic_notes_updated_at')
        .eq('client_id', clientId)
        .neq('week_of', currentWeekStr) // skip the row the form is editing
        .not('strategic_notes', 'is', null)
        .order('week_of', { ascending: false })
        .limit(8);
      if (error) throw error;
      const rows = ((data || []) as Array<{ id: string; week_of: string; strategic_notes: string | null; strategic_notes_updated_at: string | null }>)
        // Filter empty strings — `not is null` accepts empty TEXT.
        .filter(r => (r.strategic_notes || '').trim().length > 0) as Array<{ id: string; week_of: string; strategic_notes: string; strategic_notes_updated_at: string | null }>;
      setStrategicHistoryRows(rows);
    } catch (err) {
      console.error('Failed to fetch strategic notes history:', err);
    } finally {
      setStrategicHistoryLoading(false);
    }
  };

  /**
   * [2026-06-11] Fetch the audit log for the currently loaded weekly
   * update row. Q5 spec — every edit logs to client_weekly_update_audit;
   * this popover surfaces "Bolt edited this_week_feed at Tue 3:42pm" so
   * the team stays accountable without tight-locking the form.
   * Limited to the latest 100 entries — a weekly update accumulates
   * ~5-20 audit rows in a normal week.
   */
  const fetchWeeklyAuditLog = async (weeklyUpdateId: string) => {
    setWeeklyAuditLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('client_weekly_update_audit')
        .select('*')
        .eq('weekly_update_id', weeklyUpdateId)
        .order('edited_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setWeeklyAuditRows((data || []) as any);
    } catch (err) {
      console.error('Failed to fetch weekly audit log:', err);
      setWeeklyAuditRows([]);
    } finally {
      setWeeklyAuditLoading(false);
    }
  };

  /**
   * Phase 3 — Delivery Log draft creation.
   *
   * Idempotent: looks up an existing draft by source_ref = item.id
   * before inserting. This keeps re-toggling (done → pending → done)
   * from creating duplicate rows, and lets the CM's in-progress edits
   * on the draft survive the round-trip.
   */
  const createOrRefreshDeliveryDraft = async (clientId: string, item: ThisWeekFeedItem) => {
    // Check for an existing draft for this exact Zone B item.
    const { data: existing } = await (supabase as any)
      .from('client_delivery_log')
      .select('id')
      .eq('client_id', clientId)
      .eq('source', 'weekly_update_feed')
      .eq('source_ref', item.id)
      .maybeSingle();

    const loggedAt = item.date || formatLocalYMD(new Date());

    if (existing?.id) {
      // Touch updated_at so the draft moves to the top of the
      // pending-review list, but don't overwrite any CM edits.
      await (supabase as any)
        .from('client_delivery_log')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      return;
    }

    await (supabase as any)
      .from('client_delivery_log')
      .insert({
        client_id: clientId,
        // Zone B items are client-facing by definition (they're the
        // bullet list the client sees on their portal). Default the
        // work_type accordingly; the CM can flip to Internal during
        // review if it turns out to be misclassified.
        work_type: 'Client-Facing',
        action: item.text,
        logged_at: loggedAt,
        pending_review: true,
        source: 'weekly_update_feed',
        source_ref: item.id,
        created_by: user?.id || null,
        // sort_order is NOT NULL — use a sentinel high value so drafts
        // don't compete for position with real entries; the Pending
        // Review section renders them in a separate block anyway.
        sort_order: 0,
      });
  };

  const filteredClients = clientsWithStatus.filter(client => {
    const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (client.location && client.location.toLowerCase().includes(searchTerm.toLowerCase()));

    let matchesPartner = true;
    if (partnerIdParam) {
      matchesPartner = client.is_whitelisted === true && client.whitelist_partner_id === partnerIdParam;
    }

    // Ad-hoc is a cross-cutting flag (an ad-hoc client can be either
    // active or inactive) — when the user picks the Ad-hoc tab we show
    // every is_ad_hoc client regardless of active state, matching the
    // mental model of "show me the ad-hoc bucket."
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'active' && client.is_active) ||
      (statusFilter === 'inactive' && !client.is_active) ||
      (statusFilter === 'adhoc' && !!(client as any).is_ad_hoc);

    return matchesSearch && matchesPartner && matchesStatus;
  });

  // Count clients by status. Partner-filter scope respected throughout
  // so the tab counts stay consistent with the filtered grid.
  const inPartnerScope = (c: ClientWithStatus) => partnerIdParam
    ? c.is_whitelisted && c.whitelist_partner_id === partnerIdParam
    : true;
  const statusCounts = {
    all:      clientsWithStatus.filter(c => inPartnerScope(c)).length,
    active:   clientsWithStatus.filter(c => c.is_active && inPartnerScope(c)).length,
    inactive: clientsWithStatus.filter(c => !c.is_active && inPartnerScope(c)).length,
    adhoc:    clientsWithStatus.filter(c => !!(c as any).is_ad_hoc && inPartnerScope(c)).length,
  };
  const handleEditClient = (client: ClientWithAccess) => {
    setEditingClient(client);
    // Pull start_date from client_context (the table that actually stores
    // it). Parse with the noon-local trick to avoid a YYYY-MM-DD string
    // landing in UTC and then drifting in toLocaleDateString.
    const ctx = clientContexts[client.id];
    const ctxStartDate = ctx?.start_date ? new Date(ctx.start_date + 'T00:00:00') : undefined;
    setNewClient({
      name: client.name,
      email: client.email,
      location: client.location || '',
      is_active: client.is_active,
      source: client.source || 'Inbound',
      onboarding_call_held: client.onboarding_call_held || false,
      onboarding_call_date: client.onboarding_call_date ? new Date(client.onboarding_call_date) : undefined,
      is_whitelisted: client.is_whitelisted || false,
      whitelist_partner_id: client.whitelist_partner_id,
      logo_url: (client as any).logo_url || null,
      approved_domains: (client as any).approved_domains || [],
      is_ad_hoc: (client as any).is_ad_hoc || false,
      start_date: ctxStartDate,
    });
    setDomainInput('');
    setLogoPreview((client as any).logo_url || null);
    setLogoFile(null);
    setIsEditMode(true);
    setIsNewClientOpen(true);
  };
  const handleCloseClientModal = () => {
    setIsNewClientOpen(false);
    setIsEditMode(false);
    setEditingClient(null);
    setLogoFile(null);
    setLogoPreview(null);
    setNewClient({
      name: '',
      email: '',
      location: '',
      is_active: true,
      source: 'Inbound',
      onboarding_call_held: false,
      onboarding_call_date: undefined,
      is_whitelisted: false,
      whitelist_partner_id: null,
      logo_url: null,
      approved_domains: [],
      is_ad_hoc: false,
      start_date: undefined,
    });
    setDomainInput('');
  };
  const handleDeleteClient = (client: ClientWithAccess) => {
    setClientToDelete(client);
    setIsDeleteDialogOpen(true);
  };
  const confirmDeleteClient = async () => {
    if (!clientToDelete) return;

    try {
      // Soft delete - set archived_at timestamp
      const { error } = await supabase
        .from('clients')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', clientToDelete.id);

      if (error) throw error;
      await fetchClients();
    } catch (err) {
      console.error('Error archiving client:', err);
      setError('Failed to archive client');
    } finally {
      setIsDeleteDialogOpen(false);
      setClientToDelete(null);
    }
  };
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: 'Invalid file type',
          description: 'Please upload an image file (PNG, JPG, etc.)',
          variant: 'destructive',
        });
        return;
      }
      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: 'Please upload an image smaller than 2MB',
          variant: 'destructive',
        });
        return;
      }
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const uploadLogo = async (clientId: string): Promise<string | null> => {
    if (!logoFile) return newClient.logo_url;

    try {
      setUploadingLogo(true);
      const fileExt = logoFile.name.split('.').pop();
      const fileName = `${clientId}/logo-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('client-logos')
        .upload(fileName, logoFile, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('client-logos')
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast({
        title: 'Upload failed',
        description: 'Failed to upload logo. Please try again.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setUploadingLogo(false);
    }
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    setNewClient({ ...newClient, logo_url: null });
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClient.name.trim() || !newClient.email.trim()) return;
    try {
      setIsSubmitting(true);
      // [2026-06-08] start_date lives on `client_context`, not `clients`,
      // so the save path upserts that row separately after the clients
      // row is created / updated. formatLocalYMD avoids the toISOString
      // off-by-one bug in UTC+X timezones.
      const startDateStr = newClient.start_date ? formatLocalYMD(newClient.start_date) : null;
      let savedClientId: string | null = null;
      if (isEditMode && editingClient) {
        // Upload logo first if there's a new file
        let logoUrl = newClient.logo_url;
        if (logoFile) {
          logoUrl = await uploadLogo(editingClient.id);
        }

        await ClientService.updateClient(editingClient.id, {
          name: newClient.name.trim(),
          email: newClient.email.trim(),
          location: newClient.location.trim() || undefined,
          is_active: newClient.is_active,
          is_whitelisted: newClient.is_whitelisted,
          whitelist_partner_id: newClient.whitelist_partner_id,
          logo_url: logoUrl,
          approved_domains: newClient.approved_domains.length > 0 ? newClient.approved_domains : null,
          is_ad_hoc: newClient.is_ad_hoc,
        } as any);
        savedClientId = editingClient.id;
      } else {
        const client = await ClientService.createClient(
          newClient.name.trim(),
          newClient.email.trim(),
          newClient.location.trim() || undefined,
          newClient.source,
          newClient.onboarding_call_held,
          newClient.onboarding_call_date ? formatLocalYMD(newClient.onboarding_call_date) : null,
          newClient.is_whitelisted,
          newClient.whitelist_partner_id
        );

        // Save approved_domains + is_ad_hoc after client is created
        if (client) {
          const extras: Record<string, any> = {};
          if (newClient.approved_domains.length > 0) extras.approved_domains = newClient.approved_domains;
          if (newClient.is_ad_hoc) extras.is_ad_hoc = true;
          if (Object.keys(extras).length > 0) {
            await ClientService.updateClient(client.id, extras as any);
          }
        }

        // Upload logo after client is created
        if (logoFile && client) {
          const logoUrl = await uploadLogo(client.id);
          if (logoUrl) {
            await ClientService.updateClient(client.id, { logo_url: logoUrl });
          }
        }

        // Auto-seed action board milestones for new client
        if (client) {
          await seedMilestones(client.id);
        }
        savedClientId = client?.id || null;
      }

      // Upsert start_date onto client_context. Only writes if the user
      // actually set/cleared it — if a CRM-linked client had it auto-
      // populated from the pipeline, we still respect the user's manual
      // override here (single source of truth = the form).
      if (savedClientId) {
        const existingCtx = clientContexts[savedClientId];
        if (existingCtx) {
          await supabase
            .from('client_context')
            .update({ start_date: startDateStr, updated_at: new Date().toISOString() })
            .eq('id', existingCtx.id);
        } else if (startDateStr) {
          // Only create a context row if there's a value to save —
          // avoids an empty row for clients without a start date.
          await supabase
            .from('client_context')
            .insert({ client_id: savedClientId, start_date: startDateStr, updated_at: new Date().toISOString() });
        }
        await refreshClientContexts();
      }

      handleCloseClientModal();
      await fetchClients();
    } catch (err) {
      // Optionally add a toast notification here
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleStartClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsStartClientSubmitting(true);
    setStartClientError(null);
    try {
      let clientId = '';
      if (startClientForm.isRenewingClient) {
        clientId = startClientForm.selectedExistingClient;
      } else {
        const client = await ClientService.createClient(
          startClientForm.companyName.trim(),
          startClientForm.email.trim(),
          startClientForm.location.trim() || undefined
        );
        clientId = client.id;
      }
      const accessUserIds = [
        startClientForm.campaignManager,
        ...startClientForm.supportingMembers.filter(id => id && id !== startClientForm.campaignManager),
      ];
      await Promise.all(accessUserIds.map((userId) =>
        userId ? ClientService.grantClientAccess(clientId, userId) : Promise.resolve()
      ));
      const campaign = await CampaignService.createCampaign({
        client_id: clientId,
        name: startClientForm.campaignName.trim(),
        total_budget: parseFloat(startClientForm.totalBudget),
        status: 'Planning',
        start_date: startClientForm.startDate ? formatLocalYMD(startClientForm.startDate) : '',
        end_date: startClientForm.endDate ? formatLocalYMD(startClientForm.endDate) : '',
        description: undefined,
        intro_call: startClientForm.intro_call,
        intro_call_date: startClientForm.intro_call_date ? formatLocalYMD(startClientForm.intro_call_date) : null,
        manager: startClientForm.campaignManager || null,
        call_support: startClientForm.callSupport,
        client_choosing_kols: startClientForm.clientChoosingKols,
        multi_activation: startClientForm.multiActivation,
        proposal_sent: startClientForm.proposalSent,
        nda_signed: startClientForm.ndaSigned,
        budget_type: startClientForm.budgetType,
        region: startClientForm.region,
      });
      await Promise.all(
        (startClientForm.budgetAllocations || [])
          .filter(a => a.region && a.amount)
          .map((alloc) =>
            CampaignService.addBudgetAllocation(campaign.id, alloc.region, parseFloat(alloc.amount))
          )
      );
      setIsStartClientOpen(false);
      setStartClientStep(0);
      setStartClientForm({
        companyName: '',
        isRenewingClient: false,
        selectedExistingClient: '',
        email: '',
        location: '',
        source: 'Inbound',
        campaignName: '',
        campaignManager: '',
        startDate: undefined,
        endDate: undefined,
        region: 'apac',
        clientChoosingKols: false,
        multiActivation: false,
        totalBudget: '',
        callHeld: false,
        callDate: undefined,
        proposalSent: false,
        ndaSigned: false,
        budgetType: [],
        callSupport: false,
        supportingMembers: [],
        budgetAllocations: [],
        intro_call: false,
        intro_call_date: undefined,
      });
      await fetchClients();
    } catch (err: any) {
      setStartClientError(err?.message || 'Failed to start client onboarding.');
    } finally {
      setIsStartClientSubmitting(false);
    }
  };
  // ClientCardSkeleton — structural skeleton mirroring the loaded
  // card so the layout doesn't shift when data arrives. Every block
  // here maps 1:1 to a real element in the loaded card below:
  //   • logo tile (40px square)        • client name (text-base)
  //   • hover-action cluster (3 × 28px squares, opacity-60)
  //   • status badge row               • location row
  //   • onboarding progress bar        • HQ-tasks chip
  //   • View + Add Campaign buttons    • Portal row (Open/Edit/Visits)
  const ClientCardSkeleton = () => (
    <Card className="crd-hover flex flex-col h-full">
      <CardHeader className="pb-2">
        <div>
          {/* Logo + name + hover-action cluster (low opacity) */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <Skeleton className="h-10 w-10 rounded-md flex-shrink-0" />
              <Skeleton className="h-5 w-32" />
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0 opacity-60">
              <Skeleton className="h-7 w-7 rounded-md" />
              <Skeleton className="h-7 w-7 rounded-md" />
              <Skeleton className="h-7 w-7 rounded-md" />
            </div>
          </div>
          {/* Status badge row — no empty location placeholder below,
              matches the loaded card's conditional location row. */}
          <div className="flex gap-2 flex-wrap">
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-3 border-t border-cream-100 flex flex-col flex-1">
        {/* Onboarding progress block (or Week-N) + HQ tasks chip */}
        <div className="space-y-3 mb-3">
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-8" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        </div>
        {/* Campaign buttons row */}
        <div className="flex gap-2 flex-wrap">
          <Skeleton className="h-8 flex-1 min-w-[120px] rounded-md" />
          <Skeleton className="h-8 flex-1 min-w-[120px] rounded-md" />
        </div>
        {/* Portal row (Open / Edit / Visits) */}
        <div className="mt-auto pt-3 border-t border-cream-100">
          <div className="flex items-center gap-2 flex-wrap">
            <Skeleton className="h-8 flex-1 min-w-[110px] rounded-md" />
            <Skeleton className="h-8 flex-1 min-w-[110px] rounded-md" />
            <Skeleton className="h-8 flex-1 min-w-[110px] rounded-md" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  const quillModules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'indent': '-1'}, { 'indent': '+1' }],
      ['link'],
      ['clean']
    ],
  };
  const regionOptions = KOLService.getFieldOptions().regions;
  if (loading) {
    return (
      <ProtectedRoute>
        <div className="space-y-6">
          {/* [Design system, May 2026] Loading header uses PageHeader
              for layout-parity with the loaded state below — when data
              arrives, only the action buttons change from disabled to
              enabled; the title/subtitle/spacing stay identical. */}
          <PageHeader
            title="Clients"
            subtitle="Manage your client relationships"
            kicker="People · Engagements"
            kickerDot="sky"
            actions={(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') ? (
              <>
                {/* "Start Client" hidden 2026-06-02 — Add Client is now the
                    primary CTA. State + Dialog left intact below for easy
                    restore if/when the onboarding flow ships. */}
                <Button variant="outline" disabled>
                  <Settings className="h-4 w-4 mr-2" />
                  Templates
                </Button>
                <Button variant="brand" disabled>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Client
                </Button>
              </>
            ) : undefined}
          />

          {/* ── Engagements skeleton ─────────────────────────────────
              Mirrors the loaded layout exactly so nothing shifts when
              data arrives: SectionHeader (label dot + counter) →
              filter toolbar (tabs left + search right) → cards grid. */}
          <div className="space-y-4">
            {/* SectionHeader skeleton — small dot + label width + counter.
                `.first` suppresses the top border so this matches the
                Engagements SectionHeader in the loaded state. */}
            <div className="section-head first flex items-center gap-3">
              <span className="dot bg-brand/30" aria-hidden />
              <Skeleton className="h-3 w-24" />
              <span className="flex-1 h-px bg-cream-200" aria-hidden />
              <Skeleton className="h-3 w-32" />
            </div>

            {/* Filter toolbar skeleton — tabs on the left, search on the right */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-1 p-1 rounded-md bg-cream-100 border border-cream-200">
                <Skeleton className="h-8 w-14 rounded" />
                <Skeleton className="h-8 w-20 rounded" />
                <Skeleton className="h-8 w-20 rounded" />
                <Skeleton className="h-8 w-20 rounded" />
              </div>
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-warm-400" />
                <Input placeholder="Search clients by name, email, or location..." className="pl-10 focus-brand" disabled />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <ClientCardSkeleton key={index} />
              ))}
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }
  if (error) {
    return (
      <ProtectedRoute>
        <div className="space-y-6">
          <PageHeader title="Clients" subtitle="Manage your client relationships" kicker="People · Engagements" kickerDot="sky" />
          <div className="text-center py-8">
            <p className="text-rose-600">{error}</p>
            <Button variant="brand" onClick={fetchClients} className="mt-4">
              Retry
            </Button>
          </div>
        </div>
      </ProtectedRoute>
    );
  }
  return (
    <ProtectedRoute>
      <div className="space-y-6">
        {/* [Design system, May 2026] Loaded-state header migrated to
            PageHeader so the loading + loaded states share one source
            of truth for the page title block. The 800-line action
            Dialog tree (Start Client / Templates / Add Client) lives
            in PageHeader's actions slot — PageHeader internally wraps
            it in `flex items-center gap-2 flex-wrap`, matching the
            original hand-rolled wrapper. */}
        <PageHeader
          title={filteredPartnerName ? `Clients · ${filteredPartnerName}` : 'Clients'}
          subtitle="Manage your client relationships"
          kicker={filteredPartnerName ? `People · Partner · ${filteredPartnerName}` : 'People · Engagements'}
          kickerDot="sky"
          actions={(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') ? (
            <>
              {/* "Start Client" trigger hidden 2026-06-02 — Add Client is
                  the primary CTA. Dialog tree below still wired to
                  `isStartClientOpen` so the flow can be re-surfaced by
                  re-enabling the DialogTrigger. */}
              <Dialog open={isStartClientOpen} onOpenChange={setIsStartClientOpen}>
                {false && (
                <DialogTrigger asChild>
                  <Button variant="brand">
                    <Plus className="h-4 w-4 mr-2" />
                    Start Client
                  </Button>
                </DialogTrigger>
                )}
                {/* Flex-col Dialog so the body grows to fill space and
                    DialogFooter stays pinned at the bottom regardless of
                    viewport height. Previously DialogContent was 80vh +
                    inner body 60vh — on short screens the 20vh footer
                    gap collapsed and the action buttons clipped off. */}
                <DialogContent className="sm:max-w-[800px] max-h-[85vh] flex flex-col">
                  <DialogHeader>
                    <DialogTitle>Start Client Onboarding</DialogTitle>
                    <DialogDescription>
                      Complete client onboarding and campaign setup in one workflow.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-6 flex-1 overflow-y-auto px-1">
                    {/* Step Indicator */}
                    <div className="flex items-center justify-center mb-4 gap-2">
                      {startClientSections.map((label, idx) => (
                        <div key={label} className={`px-3 py-1 rounded-full text-xs font-medium ${idx === startClientStep ? 'bg-brand text-white' : 'bg-cream-200 text-ink-warm-700'}`}>{label}</div>
                      ))}
                    </div>
                    {/* Section rendering */}
                    {startClientStep === 0 && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-ink-warm-900 border-b pb-2">Section 1: Client Details</h3>
                        <div className="grid gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="companyName">
                              Company Name {!startClientForm.isRenewingClient && <span className="text-rose-500">*</span>}
                            </Label>
                            <Input
                              id="companyName"
                              value={startClientForm.companyName}
                              onChange={(e) => setStartClientForm({ ...startClientForm, companyName: e.target.value })}
                              placeholder="Enter company name"
                              className="focus-brand"
                              disabled={startClientForm.isRenewingClient}
                            />
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="renewingClient"
                              checked={startClientForm.isRenewingClient}
                              onCheckedChange={(checked) => {
                                setStartClientForm({
                                  ...startClientForm,
                                  isRenewingClient: checked as boolean,
                                  companyName: checked ? '' : startClientForm.companyName,
                                  email: checked ? '' : startClientForm.email,
                                  location: checked ? '' : startClientForm.location,
                                  source: checked ? 'Renewal' : startClientForm.source
                                });
                              }}
                            />
                            <Label htmlFor="renewingClient" className="text-sm">Renewing Client</Label>
                          </div>
                          {startClientForm.isRenewingClient && (
                            <div className="grid gap-2">
                              <Label htmlFor="existingClient">
                                Select Existing Client <span className="text-rose-500">*</span>
                              </Label>
                              <Select value={startClientForm.selectedExistingClient} onValueChange={(value) => {
                                const selectedClient = clients.find(c => c.id === value);
                                if (selectedClient) {
                                  setStartClientForm({
                                    ...startClientForm,
                                    selectedExistingClient: value,
                                    companyName: selectedClient.name,
                                    email: selectedClient.email,
                                    location: selectedClient.location || '',
                                    source: 'Renewal'
                                  });
                                }
                              }}>
                                <SelectTrigger className="focus-brand">
                                  <SelectValue placeholder="Select existing client" />
                                </SelectTrigger>
                                <SelectContent>
                                  {clients.map((client) => (
                                    <SelectItem key={client.id} value={client.id}>
                                      {client.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          <div className="grid gap-2">
                            <Label htmlFor="email">
                              Email {!startClientForm.isRenewingClient && <span className="text-rose-500">*</span>}
                            </Label>
                            <Input
                              id="email"
                              type="email"
                              value={startClientForm.email}
                              onChange={(e) => setStartClientForm({ ...startClientForm, email: e.target.value })}
                              placeholder="Enter email address"
                              className="focus-brand"
                              disabled={startClientForm.isRenewingClient}
                            />
                            {/* Email format error message */}
                            {startClientForm.email && !isValidEmail(startClientForm.email) && (
                              <span className="text-xs text-rose-600">Please enter a valid email address.</span>
                            )}
                          </div>
                          {/* Location field hidden per May 2026 audit —
                              see the matching hide in the Add/Edit
                              Client dialog. State plumbing kept intact. */}
                          {/* Source field hidden per May 2026 audit —
                              wizard's isStepValid still passes because
                              startClientForm.source defaults to
                              'Inbound'. Renewal flow still flips the
                              value to 'Renewal' via the checkbox above. */}
                        </div>
                      </div>
                    )}
                    {startClientStep === 1 && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-ink-warm-900 border-b pb-2">Section 2: Onboarding</h3>
                        <div className="grid gap-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="callHeld"
                              checked={startClientForm.callHeld}
                              onCheckedChange={(checked) => setStartClientForm({
                                ...startClientForm,
                                callHeld: checked as boolean,
                                callDate: checked ? startClientForm.callDate : undefined
                              })}
                            />
                            <Label htmlFor="callHeld" className="text-sm">Call Held?</Label>
                          </div>
                          {startClientForm.callHeld && (
                            <div className="grid gap-2">
                              <Label htmlFor="callDate">
                                Call Date <span className="text-rose-500">*</span>
                              </Label>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    className="focus-brand justify-start text-left font-normal focus:ring-2 focus:ring-brand focus:border-brand"
                                    style={{
                                      borderColor: '#e5e7eb',
                                      backgroundColor: 'white',
                                      color: startClientForm.callDate ? '#111827' : '#9ca3af'
                                    }}
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {startClientForm.callDate ? formatDate(startClientForm.callDate) : 'Select call date'}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={startClientForm.callDate}
                                    onSelect={(date) => setStartClientForm({ ...startClientForm, callDate: date || undefined })}
                                    initialFocus
                                    classNames={{
                                      day_selected: 'text-white hover:text-white focus:text-white',
                                    }}
                                    modifiersStyles={{
                                      selected: { backgroundColor: '#3e8692' }
                                    }}
                                  />
                                </PopoverContent>
                              </Popover>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {startClientStep === 2 && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-ink-warm-900 border-b pb-2">Section 3: Campaign Details</h3>
                        <div className="grid gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="campaignName">
                              Campaign Name <span className="text-rose-500">*</span>
                            </Label>
                            <Input
                              id="campaignName"
                              value={startClientForm.campaignName}
                              onChange={(e) => setStartClientForm({ ...startClientForm, campaignName: e.target.value })}
                              placeholder="Enter campaign name"
                              className="focus-brand"
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="campaignManager">
                              Campaign Manager <span className="text-rose-500">*</span>
                            </Label>
                            <Select value={startClientForm.campaignManager} onValueChange={(value) => setStartClientForm({ ...startClientForm, campaignManager: value })}>
                              <SelectTrigger className="focus-brand">
                                <SelectValue placeholder="Select campaign manager" />
                              </SelectTrigger>
                              <SelectContent>
                                {allUsers.map((user) => (
                                  <SelectItem key={user.id} value={user.id}>
                                    {user.name || user.email}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                              <Label htmlFor="startDate">
                                Start Date <span className="text-rose-500">*</span>
                              </Label>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    className="focus-brand justify-start text-left font-normal focus:ring-2 focus:ring-brand focus:border-brand"
                                    style={{
                                      borderColor: '#e5e7eb',
                                      backgroundColor: 'white',
                                      color: startClientForm.startDate ? '#111827' : '#9ca3af'
                                    }}
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {startClientForm.startDate ? formatDate(startClientForm.startDate) : 'Select start date'}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={startClientForm.startDate}
                                    onSelect={(date) => setStartClientForm({ ...startClientForm, startDate: date || undefined })}
                                    initialFocus
                                    classNames={{
                                      day_selected: 'text-white hover:text-white focus:text-white',
                                    }}
                                    modifiersStyles={{
                                      selected: { backgroundColor: '#3e8692' }
                                    }}
                                  />
                                </PopoverContent>
                              </Popover>
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor="endDate">End Date</Label>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    className="focus-brand justify-start text-left font-normal focus:ring-2 focus:ring-brand focus:border-brand"
                                    style={{
                                      borderColor: '#e5e7eb',
                                      backgroundColor: 'white',
                                      color: startClientForm.endDate ? '#111827' : '#9ca3af'
                                    }}
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {startClientForm.endDate ? formatDate(startClientForm.endDate) : 'Select end date'}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={startClientForm.endDate}
                                    onSelect={(date) => setStartClientForm({ ...startClientForm, endDate: date || undefined })}
                                    disabled={(date) => startClientForm.startDate ? date < startClientForm.startDate : false}
                                    initialFocus
                                    classNames={{
                                      day_selected: 'text-white hover:text-white focus:text-white',
                                    }}
                                    modifiersStyles={{
                                      selected: { backgroundColor: '#3e8692' }
                                    }}
                                  />
                                </PopoverContent>
                              </Popover>
                            </div>
                          </div>
                          {/* Moved from old Section 5: Campaign Details 2 */}
                          <div className="grid gap-2">
                            <Label htmlFor="region">
                              Region <span className="text-rose-500">*</span>
                            </Label>
                            <Select value={startClientForm.region} onValueChange={(value) => {
                              setStartClientForm({
                                ...startClientForm,
                                region: value,
                                clientChoosingKols: value === 'global'
                              });
                            }}>
                              <SelectTrigger className="focus-brand">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="apac">APAC</SelectItem>
                                <SelectItem value="global">Global</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="clientChoosingKols"
                              checked={startClientForm.clientChoosingKols}
                              onCheckedChange={(checked) => setStartClientForm({ ...startClientForm, clientChoosingKols: checked as boolean })}
                            />
                            <Label htmlFor="clientChoosingKols" className="text-sm">Is Client Choosing the KOLs?</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="multiActivation"
                              checked={startClientForm.multiActivation}
                              onCheckedChange={(checked) => setStartClientForm({ ...startClientForm, multiActivation: checked as boolean })}
                            />
                            <Label htmlFor="multiActivation" className="text-sm">Multi-Activation Campaign</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="intro_call"
                              checked={startClientForm.intro_call}
                              onCheckedChange={(checked) => setStartClientForm({ ...startClientForm, intro_call: checked as boolean })}
                            />
                            <Label htmlFor="intro_call" className="text-sm">Intro call held?</Label>
                          </div>
                          {startClientForm.intro_call && (
                            <div className="grid gap-2">
                              <Label htmlFor="intro_call_date">Intro Call Date</Label>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    className="focus-brand justify-start text-left font-normal focus:ring-2 focus:ring-brand focus:border-brand"
                                    style={{
                                      borderColor: '#e5e7eb',
                                      backgroundColor: 'white',
                                      color: startClientForm.intro_call_date ? '#111827' : '#9ca3af'
                                    }}
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {startClientForm.intro_call_date ? formatDate(startClientForm.intro_call_date) : 'Select intro call date'}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={startClientForm.intro_call_date}
                                    onSelect={(date) => setStartClientForm({ ...startClientForm, intro_call_date: date || undefined })}
                                    initialFocus
                                    classNames={{
                                      day_selected: 'text-white hover:text-white focus:text-white',
                                    }}
                                    modifiersStyles={{
                                      selected: { backgroundColor: '#3e8692' }
                                    }}
                                  />
                                </PopoverContent>
                              </Popover>
                            </div>
                          )}
                          <div className="grid gap-2">
                            <Label htmlFor="totalBudget">
                              Budget <span className="text-rose-500">*</span>
                            </Label>
                            <Input
                              id="totalBudget"
                              type="number"
                              value={startClientForm.totalBudget}
                              onChange={(e) => {
                                const budget = e.target.value;
                                setStartClientForm({
                                  ...startClientForm,
                                  totalBudget: budget,
                                  callSupport: budget ? parseInt(budget) >= 10000 : false
                                });
                              }}
                              placeholder="Enter total budget"
                              className="focus-brand"
                            />
                          </div>
                         {/* Campaign Budget Allocation Section */}
                         <div className="grid gap-2">
                           <Label>Budget Allocation</Label>
                           <div className="bg-cream-50 border rounded p-3 text-sm text-ink-warm-700 space-y-2">
                             {startClientForm.budgetAllocations.length === 0 && (
                               <div className="text-ink-warm-400 text-sm">No allocations yet.</div>
                             )}
                             {startClientForm.budgetAllocations.map((alloc, idx) => {
                               // Format the amount with commas for display
                               const formattedAmount = alloc.amount
                                 ? Number(alloc.amount.replace(/,/g, '')).toLocaleString('en-US')
                                 : '';
                               return (
                                 <div key={idx} className="flex items-center gap-2">
                                   <Select
                                     value={alloc.region}
                                     onValueChange={value => {
                                       const newAllocs = [...startClientForm.budgetAllocations];
                                       newAllocs[idx].region = value;
                                       setStartClientForm({ ...startClientForm, budgetAllocations: newAllocs });
                                     }}
                                   >
                                     <SelectTrigger className="w-32 focus-brand">
                                       <SelectValue placeholder="Select region" />
                                     </SelectTrigger>
                                     <SelectContent>
                                       {regionOptions.map(region => (
                                         <SelectItem key={region} value={region}>{region}</SelectItem>
                                       ))}
                                     </SelectContent>
                                   </Select>
                                   <div className="relative w-28">
                                     <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-warm-500 pointer-events-none">$</span>
                                     <Input
                                       type="text"
                                       inputMode="numeric"
                                       pattern="[0-9,]*"
                                       className="focus-brand pl-6 w-full"
                                       placeholder="Amount"
                                       value={formattedAmount}
                                       onChange={e => {
                                         // Remove all non-digit and non-comma characters, then remove commas
                                         const raw = e.target.value.replace(/[^\d,]/g, '').replace(/,/g, '');
                                         const newAllocs = [...startClientForm.budgetAllocations];
                                         newAllocs[idx].amount = raw;
                                         setStartClientForm({ ...startClientForm, budgetAllocations: newAllocs });
                                       }}
                                     />
                                   </div>
                                   <Button
                                     type="button"
                                     variant="ghost"
                                     size="icon"
                                     className="text-rose-500 hover:text-rose-700"
                                     onClick={() => {
                                       setStartClientForm({
                                         ...startClientForm,
                                         budgetAllocations: startClientForm.budgetAllocations.filter((_, i) => i !== idx)
                                       });
                                     }}
                                     aria-label="Remove allocation"
                                   >
                                     <Trash2 className="w-4 h-4" />
                                   </Button>
                                 </div>
                               );
                             })}
                             <Button
                               type="button"
                               variant="outline"
                               size="sm"
                               className="mt-2"
                               onClick={() => setStartClientForm({
                                 ...startClientForm,
                                 budgetAllocations: [
                                   ...startClientForm.budgetAllocations,
                                   { region: '', amount: '' }
                                 ]
                               })}
                             >Add Allocation</Button>
                           </div>
                         </div>
                         {/* Budget Type */}
                         <div className="grid gap-2">
                           <Label>Budget Type</Label>
                           <div className="flex space-x-4">
                             {['Token', 'Fiat', 'WL'].map((type) => (
                               <div key={type} className="flex items-center space-x-2">
                                 <Checkbox
                                   id={type}
                                   checked={startClientForm.budgetType.includes(type)}
                                   onCheckedChange={(checked) => {
                                     if (checked) {
                                       setStartClientForm({
                                         ...startClientForm,
                                         budgetType: [...startClientForm.budgetType, type]
                                       });
                                     } else {
                                       setStartClientForm({
                                         ...startClientForm,
                                         budgetType: startClientForm.budgetType.filter(t => t !== type)
                                       });
                                     }
                                   }}
                                 />
                                 <Label htmlFor={type} className="text-sm capitalize">{type}</Label>
                               </div>
                             ))}
                           </div>
                         </div>
                        </div>
                      </div>
                    )}
                    {startClientStep === 3 && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-ink-warm-900 border-b pb-2">Section 4: Contracting Status</h3>
                        <div className="grid gap-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="proposalSent"
                              checked={startClientForm.proposalSent}
                              onCheckedChange={(checked) => setStartClientForm({ ...startClientForm, proposalSent: checked as boolean })}
                            />
                            <Label htmlFor="proposalSent" className="text-sm">Proposal sent?</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="ndaSigned"
                              checked={startClientForm.ndaSigned}
                              onCheckedChange={(checked) => setStartClientForm({ ...startClientForm, ndaSigned: checked as boolean })}
                            />
                            <Label htmlFor="ndaSigned" className="text-sm">NDA signed?</Label>
                          </div>
                        </div>
                      </div>
                    )}
                    {startClientStep === 4 && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-ink-warm-900 border-b pb-2">Section 5: Support & Follow-Up</h3>
                        <div className="grid gap-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="callSupport"
                              checked={startClientForm.callSupport}
                              onCheckedChange={(checked) => setStartClientForm({ ...startClientForm, callSupport: checked as boolean })}
                            />
                            <Label htmlFor="callSupport" className="text-sm">Offering Call Support</Label>
                          </div>
                          <div className="grid gap-2">
                            <Label>Supporting Members</Label>
                            <div className="space-y-2 max-h-32 overflow-y-auto">
                              {allUsers.filter(user => user.role !== 'client' && user.id !== startClientForm.campaignManager).map((user) => (
                                <div key={user.id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`member-${user.id}`}
                                    checked={startClientForm.supportingMembers.includes(user.id)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setStartClientForm({
                                          ...startClientForm,
                                          supportingMembers: [...startClientForm.supportingMembers, user.id]
                                        });
                                      } else {
                                        setStartClientForm({
                                          ...startClientForm,
                                          supportingMembers: startClientForm.supportingMembers.filter(id => id !== user.id)
                                        });
                                      }
                                    }}
                                  />
                                  <Label htmlFor={`member-${user.id}`} className="text-sm">{user.name || user.email}</Label>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                    <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
                      <Button type="button" variant="outline" onClick={() => setIsStartClientOpen(false)}>
                        Cancel
                      </Button>
                      <div className="flex gap-2">
                        {startClientStep > 0 && (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setStartClientStep(startClientStep - 1)}
                          >
                            Previous
                          </Button>
                        )}
                        {startClientStep < startClientSections.length - 1 ? (
                          <Button variant="brand" type="button" onClick={() => {
                              if (isStepValid()) {
                                setStartClientStep(startClientStep + 1);
                              }
                            }}
                            disabled={!isStepValid() || isStartClientSubmitting}
                          >
                            Next
                          </Button>
                        ) : (
                          <Button variant="brand" type="button" onClick={handleStartClientSubmit} disabled={!isStepValid() || isStartClientSubmitting}>
                            {isStartClientSubmitting ? 'Starting...' : 'Start Client'}
                          </Button>
                        )}
                      </div>
                    </DialogFooter>
                  {startClientError && (
                    <div className="text-rose-600 text-sm mt-2">{startClientError}</div>
                  )}
                </DialogContent>
              </Dialog>
              {/* [Templates admin v1] Quick link to the milestone templates
                  management page. Placed inline with the other top-bar
                  actions so admins can hop straight to template CRUD
                  without going through a client's Action Board. */}
              <Link href="/clients/templates">
                <Button variant="outline" className="hover:bg-cream-50">
                  <Settings className="h-4 w-4 mr-2" />
                  Templates
                </Button>
              </Link>
              <Dialog open={isNewClientOpen} onOpenChange={(open) => {
                if (!open) {
                  handleCloseClientModal();
                } else {
                  setIsNewClientOpen(true);
                }
              }}>
                <DialogTrigger asChild>
                  <Button variant="brand">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Client
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[640px] max-h-[85vh] flex flex-col">
                  <DialogHeader>
                    <DialogTitle>{isEditMode ? 'Edit Client' : 'Add New Client'}</DialogTitle>
                    <DialogDescription>
                      {isEditMode ? 'Update the client information below.' : 'Create a new client to manage campaigns for.'}
                    </DialogDescription>
                  </DialogHeader>
                  {/* Form itself flex-col flex-1 so the body grid grows
                      and the DialogFooter (also inside <form> for submit
                      semantics) stays pinned at the bottom. */}
                  <form onSubmit={handleCreateClient} className="flex flex-col flex-1 min-h-0">
                    <div className="grid gap-4 py-4 flex-1 overflow-y-auto px-1">
                      <div className="grid gap-2">
                        <Label htmlFor="name">Company Name</Label>
                        <Input id="name" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} placeholder="Enter company name" className="focus-brand" required />
                      </div>
                      <div className="grid gap-2">
                        <Label>Company Logo</Label>
                        <div className="flex items-center gap-4">
                          {logoPreview ? (
                            <div className="relative">
                              <img
                                src={logoPreview}
                                alt="Logo preview"
                                className="h-16 w-16 object-contain rounded-lg border border-cream-200"
                              />
                              <button
                                type="button"
                                onClick={removeLogo}
                                className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 hover:bg-rose-600"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="h-16 w-16 rounded-lg border-2 border-dashed border-cream-300 flex items-center justify-center">
                              <ImageIcon className="h-6 w-6 text-ink-warm-400" />
                            </div>
                          )}
                          <div className="flex-1">
                            <input
                              type="file"
                              id="logo-upload"
                              accept="image/*"
                              onChange={handleLogoChange}
                              className="hidden"
                            />
                            <label
                              htmlFor="logo-upload"
                              className="inline-flex items-center px-3 py-2 text-sm border border-cream-300 rounded-md cursor-pointer hover:bg-cream-50"
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              {logoPreview ? 'Change Logo' : 'Upload Logo'}
                            </label>
                            <p className="text-xs text-ink-warm-500 mt-1">PNG, JPG up to 2MB</p>
                          </div>
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} placeholder="Enter email address" className="focus-brand" required />
                      </div>
                      {/* Location field hidden per May 2026 audit — was
                          inconsistently filled across the team and the
                          on-card display was already removed in the
                          earlier card cleanup. Data + state plumbing
                          remains so existing values aren't destroyed
                          and the input can be restored if needed. */}
                      {/* Source field hidden per May 2026 audit — same
                          reasoning as Location. State defaults to
                          'Inbound' so saves don't break. Restore by
                          uncommenting this block. */}
                      <div className="grid gap-2">
                        <Label htmlFor="client-status">Status</Label>
                        <Select value={newClient.is_active ? 'active' : 'inactive'} onValueChange={(value) => setNewClient({ ...newClient, is_active: value === 'active' })}>
                          <SelectTrigger className="focus-brand">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {/* [2026-06-08] Start Date moved here from the
                          Client Context popup — engagement start is a
                          core attribute (renewal math, dashboard tone)
                          and belongs next to Status. Saves to
                          client_context, not clients, via the upsert in
                          handleCreateClient. */}
                      <div className="grid gap-2">
                        <Label>Engagement Start Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="focus-brand justify-start text-left font-normal"
                              style={{ borderColor: '#e5e7eb', backgroundColor: 'white', color: newClient.start_date ? '#111827' : '#9ca3af' }}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {newClient.start_date
                                ? formatDate(newClient.start_date)
                                : 'Select start date'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
                            <Calendar
                              mode="single"
                              selected={newClient.start_date}
                              onSelect={(date) => setNewClient({ ...newClient, start_date: date || undefined })}
                              initialFocus
                              classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                              modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                            />
                          </PopoverContent>
                        </Popover>
                        {newClient.start_date && (
                          <button
                            type="button"
                            onClick={() => setNewClient({ ...newClient, start_date: undefined })}
                            className="text-xs text-ink-warm-500 hover:text-rose-600 transition-colors w-fit"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <div className="grid gap-2">
                        <Label>Engagement Model</Label>
                        <div className="flex items-center space-x-3">
                          <Checkbox
                            id="is_ad_hoc"
                            checked={newClient.is_ad_hoc}
                            onCheckedChange={(checked) => setNewClient({ ...newClient, is_ad_hoc: !!checked })}
                          />
                          <Label htmlFor="is_ad_hoc" className="text-sm leading-tight">
                            Ad-hoc engagement
                            <span className="block text-xs text-ink-500 mt-0.5">Excludes this client from priority-dashboard rollups (KPIs, renewal alerts).</span>
                          </Label>
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label>Whitelist Status</Label>
                        <div className="flex items-center space-x-4">
                          <Checkbox
                            id="is_whitelisted"
                            checked={newClient.is_whitelisted}
                            onCheckedChange={(checked) => setNewClient({ ...newClient, is_whitelisted: !!checked })}
                          />
                          <Label htmlFor="is_whitelisted" className="text-sm">Whitelist this client</Label>
                        </div>
                        {newClient.is_whitelisted && (
                          <div className="grid gap-2 mt-2">
                            <Label htmlFor="whitelist_partner">Whitelist for Partner</Label>
                            <Select 
                              value={newClient.whitelist_partner_id || ""} 
                              onValueChange={(value) => setNewClient({ ...newClient, whitelist_partner_id: value || null })}
                            >
                              <SelectTrigger className="focus-brand">
                                <SelectValue placeholder="Select partner" />
                              </SelectTrigger>
                              <SelectContent>
                                {allPartners.map((partner) => (
                                  <SelectItem key={partner.id} value={partner.id}>
                                    {partner.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                      <div className="grid gap-2">
                        <Label>Approved Domains</Label>
                        <p className="text-xs text-ink-warm-500">Anyone with an email at these domains can access this client's campaigns.</p>
                        <div className="flex gap-2">
                          <Textarea
                            value={domainInput}
                            onChange={(e) => setDomainInput(e.target.value)}
                            placeholder={"Enter domains (comma or newline separated)\ne.g. partner.com, agency.com"}
                            className="focus-brand min-h-[60px] flex-1"
                          />
                        </div>
                        <Button type="button" variant="brand" onClick={() => { const entries = domainInput .split(/[\n,]+/) .map(entry => entry.trim().toLowerCase().replace(/^@/, '')) .filter(entry => entry.length> 0 && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(entry)); const current = newClient.approved_domains; const newDomains = entries.filter(d => !current.includes(d)); if (newDomains.length> 0) { setNewClient({ ...newClient, approved_domains: [...current, ...newDomains] }); setDomainInput(''); } }} disabled={!domainInput.trim()} className="w-fit">
                          Add Domains
                        </Button>
                        {newClient.approved_domains.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {newClient.approved_domains.map((domain, index) => (
                              // Approved-domain chip — brand-soft tile +
                              // brand-deep text to match the v11 palette.
                              // Was bg-blue-50/text-blue-800 (outside the
                              // 9-tone palette).
                              <div
                                key={index}
                                className="inline-flex items-center gap-1 px-3 py-1 bg-brand-soft text-brand-deep border border-brand-light rounded-full text-sm"
                              >
                                <Globe className="h-3.5 w-3.5" />
                                @{domain}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setNewClient({
                                      ...newClient,
                                      approved_domains: newClient.approved_domains.filter((_, i) => i !== index),
                                    });
                                  }}
                                  className="ml-1 text-brand hover:text-brand-dark"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
                      <Button type="button" variant="outline" onClick={handleCloseClientModal}>
                        Cancel
                      </Button>
                      <Button variant="brand" type="submit" disabled={isSubmitting || !newClient.name.trim() || !newClient.email.trim()}>
                        {isSubmitting ? (isEditMode ? 'Saving...' : 'Creating...') : (isEditMode ? 'Save Client' : 'Create Client')}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          ) : undefined}
        >
          {filteredPartnerName && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/clients')}
              className="text-sm mt-2"
            >
              Clear Filter
            </Button>
          )}
        </PageHeader>

        {/* ── Engagements ──────────────────────────────────────────────
            Filters (search + status tabs) live under the same section
            header as the cards — they're scoped to this list, not a
            standalone "filter" surface. */}
        <div className="space-y-4">
          <SectionHeader
            label="Engagements"
            dot="brand"
            counter={`${filteredClients.length} of ${statusCounts.all} client${statusCounts.all === 1 ? '' : 's'}${statusFilter !== 'all' ? ` · ${statusFilter}` : ''}`}
            first
          />

          {/* Filter toolbar — status tabs on the left, search input to
              their right. The tabs are the primary filter (most users
              just want "Active"); search is the refine-within affordance. */}
          <div className="flex items-center gap-3 flex-wrap">
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200">
                <TabsTrigger
                  value="all"
                  className="data-[state=active]:bg-white data-[state=active]:text-ink-warm-900 data-[state=active]:shadow-card px-4 py-2"
                >
                  All
                  <span className="ml-2 text-xs bg-cream-200 data-[state=active]:bg-cream-100 px-2 py-0.5 rounded-full pointer-events-none">{statusCounts.all}</span>
                </TabsTrigger>
                <TabsTrigger
                  value="active"
                  className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card px-4 py-2"
                >
                  Active
                  <span className="ml-2 text-xs bg-brand-light text-brand px-2 py-0.5 rounded-full pointer-events-none">{statusCounts.active}</span>
                </TabsTrigger>
                {/* Ad-hoc — cross-cutting bucket of clients flagged
                    `is_ad_hoc` (specialized / one-off engagements that
                    sit outside the standard active/inactive rollup,
                    e.g. Impossible, Robonet). Purple accent matches the
                    Ad-hoc StatusBadge tone used on the dashboard so the
                    color always reads as "this is the ad-hoc bucket."
                    [2026-06-08] Moved next to Active per Andy — Ad-hoc
                    is a peer engagement type that's checked alongside
                    Active in day-to-day use, not a deactivated bucket. */}
                <TabsTrigger
                  value="adhoc"
                  className="data-[state=active]:bg-white data-[state=active]:text-purple-700 data-[state=active]:shadow-card px-4 py-2"
                >
                  Ad-hoc
                  <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full pointer-events-none">{statusCounts.adhoc}</span>
                </TabsTrigger>
                <TabsTrigger
                  value="inactive"
                  className="data-[state=active]:bg-white data-[state=active]:text-ink-warm-700 data-[state=active]:shadow-card px-4 py-2"
                >
                  Inactive
                  <span className="ml-2 text-xs bg-cream-200 text-ink-warm-700 px-2 py-0.5 rounded-full pointer-events-none">{statusCounts.inactive}</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-warm-400" />
              <Input placeholder="Search clients by name, email, or location..." className="pl-10 focus-brand" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClients.length === 0 ? (
            <div className="col-span-full">
              <EmptyState
                icon={Users}
                title={searchTerm || filteredPartnerName || statusFilter !== 'all'
                  ? 'No clients found matching your filters.'
                  : 'No clients yet.'}
                description={searchTerm || filteredPartnerName || statusFilter !== 'all'
                  ? 'Try widening your search or clearing filters.'
                  : 'Add your first client to get started.'}
              >
                {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && !searchTerm && !filteredPartnerName && statusFilter === 'all' && (
                  <Button variant="brand" onClick={() => { setIsEditMode(false); setIsNewClientOpen(true); }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Client
                  </Button>
                )}
              </EmptyState>
            </div>
          ) : (
            filteredClients.map((client) => {
              const clientWithStatus = client as ClientWithStatus;
              return (
                <Card key={client.id} className="crd-hover group flex flex-col h-full">
                  <CardHeader className="pb-2">
                    <div>
                      {/* [Responsive cleanup, May 2026] flex-wrap + min-w-0
                          so a long client name or many linked accounts
                          push the hover-action buttons to a new line
                          instead of off the card. Action buttons
                          flex-shrink-0 so they never compress. */}
                      <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                        <div className="flex items-center gap-2.5 min-w-0 flex-wrap flex-1">
                          {(client as any).logo_url ? (
                            <div className="w-10 h-10 rounded-md overflow-hidden bg-white border border-cream-200 flex-shrink-0">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={(client as any).logo_url}
                                alt={client.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-md bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center flex-shrink-0">
                              <Building2 className="h-5 w-5" />
                            </div>
                          )}
                          <span className="text-base font-semibold text-ink-warm-900 tracking-tight truncate min-w-0">{client.name}</span>
                          {linkedAccounts[client.id] && linkedAccounts[client.id].length > 0 && (
                            linkedAccounts[client.id].map((account) => (
                              <Badge
                                key={account.id}
                                variant="outline"
                                className="text-xs cursor-pointer hover:bg-cream-100 max-w-full"
                                onClick={() => router.push('/crm/sales-pipeline?tab=accounts')}
                              >
                                <LinkIcon className="h-3 w-3 mr-1 flex-shrink-0" />
                                <span className="font-semibold truncate">{account.name}</span>
                              </Badge>
                            ))
                          )}
                        </div>
                        {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && (
                          // Hover-action cluster: low-opacity icons that
                          // sharpen on card hover. Square 28px tiles per
                          // CLAUDE.md inline icon convention; cream tile
                          // on hover for the neutral pair, rose tile for
                          // destructive. opacity-60 keeps them legible
                          // without dominating the card at rest.
                          <div className="flex items-center gap-0.5 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity duration-200">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); openSharePortal(client); }}
                              className="h-7 w-7 p-0 rounded-md text-ink-warm-500 hover:text-ink-warm-900 hover:bg-cream-100"
                              title="Share portal"
                            >
                              <Share2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleEditClient(client); }}
                              className="h-7 w-7 p-0 rounded-md text-ink-warm-500 hover:text-ink-warm-900 hover:bg-cream-100"
                              title="Edit client"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleDeleteClient(client); }}
                              className="h-7 w-7 p-0 rounded-md text-ink-warm-500 hover:text-rose-600 hover:bg-rose-50"
                              title="Delete client"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                      {/* [Responsive cleanup] flex-wrap so the partner
                          badge (can be long) drops to a new line on
                          narrow cards. max-w-full + truncate on each
                          badge keeps a single very-long partner name
                          inside the card. */}
                      <div className="flex gap-2 flex-wrap">
                        <StatusBadge tone={client.is_active ? 'brand' : 'neutral'} bordered withDot className="flex-shrink-0">
                          {client.is_active ? 'Active' : 'Inactive'}
                        </StatusBadge>
                        {client.is_whitelisted && (
                          <StatusBadge tone="success" bordered withDot className="cursor-default pointer-events-none max-w-full">
                            <Building2 className="h-3 w-3 mr-1 flex-shrink-0" />
                            <span className="truncate">{client.whitelist_partner_name || 'Unknown Partner'}</span>
                          </StatusBadge>
                        )}
                      </div>
                    </div>
                    {/* Email row hidden per May 2026 client-card cleanup
                        (still accessible in Edit Portal modal / search).
                        Location row also conditional now — when a client
                        has no location, the row collapses entirely instead
                        of reserving an empty 20px placeholder, so the
                        gap below the status badges stays tight. Card
                        heights still align across the grid because the
                        portal row uses `mt-auto`. */}
                    {client.location && (
                      <div className="mt-2 flex items-center text-sm text-ink-warm-700">
                        <MapPin className="h-4 w-4 mr-2 text-ink-warm-700" />
                        <span className="text-ink-warm-700">{client.location}</span>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="pt-3 border-t border-cream-100 flex flex-col flex-1">
                    {/* Per May 2026 user feedback: replace the campaign-
                        status breakdown with onboarding progress + signals
                        the team actually scans for at a glance.
                          • Pre-onboarding: progress bar + active milestone
                          • Post-onboarding (M1 complete): "Week X"
                          • Pending client tasks badge (court='yours' && !done)
                          • HQ tasks count → links into /tasks?client=<id>
                          • Last portal visit relative time */}
                    {(() => {
                      const milestones = (clientMilestones[client.id] || []).slice().sort((a, b) => a.display_order - b.display_order);
                      const m1Complete = milestones.length > 0 && milestones[0].status === 'complete';
                      const ctx = clientContexts[client.id];
                      const total = milestones.length;
                      const completed = milestones.filter(m => m.status === 'complete').length;
                      const active = milestones.find(m => m.status === 'active');
                      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

                      // Week-N derivation. ISO week starts on Monday but for
                      // an engagement timeline, "Week 1" is the calendar
                      // week of the start date, regardless of weekday — so
                      // ceil(days/7), min 1.
                      const weekN = (() => {
                        if (!ctx?.start_date) return null;
                        const start = new Date(ctx.start_date + 'T00:00:00');
                        const days = Math.floor((Date.now() - start.getTime()) / (24 * 60 * 60 * 1000));
                        return Math.max(1, Math.ceil((days + 1) / 7));
                      })();

                      const pendingClientTaskItems = (clientActionItems[client.id] || []).filter(
                        i => i.court === 'yours' && !i.is_done && !i.is_hidden,
                      );
                      const pendingClientTasks = pendingClientTaskItems.length;
                      const openHqTasks = hqTaskCounts[client.id] || 0;
                      const lastVisit = portalAccessSummary[client.id]?.last_at;
                      const lastVisitLabel = lastVisit ? relativeTimeFromNow(lastVisit) : 'Never visited';

                      return (
                        <div className="space-y-3 mb-3">
                          {/* Onboarding progress OR Week-N */}
                          {!m1Complete ? (
                            total > 0 ? (
                              <div>
                                <div className="flex items-baseline justify-between text-sm mb-1.5">
                                  <span className="font-semibold text-ink-warm-700">
                                    Milestone {Math.min(completed + 1, total)} of {total}
                                    {active && <span className="text-ink-warm-500 font-normal"> — {active.name}</span>}
                                  </span>
                                  <span className="text-xs text-ink-warm-500">{pct}%</span>
                                </div>
                                <div className="w-full h-2 bg-cream-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-brand transition-all duration-300"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="text-sm text-ink-warm-400 italic">No milestones seeded yet.</div>
                            )
                          ) : (
                            <div className="flex items-baseline justify-between text-sm">
                              <span className="font-semibold text-ink-warm-700">
                                {weekN != null ? `Week ${weekN}` : 'Engagement live'}
                              </span>
                              {/* Date range. Start date prefers the client_context
                                  value (what the team sees in the modal), falling
                                  back to clients.engagement_start_date. End date
                                  reads clients.engagement_end_date; if null, the
                                  engagement is open-ended → "ongoing". Per Andy
                                  2026-06-19. */}
                              {(() => {
                                const startRaw = ctx?.start_date || (client as any).engagement_start_date;
                                if (!startRaw) return null;
                                const start = formatDate(new Date(startRaw + 'T00:00:00'));
                                const endRaw = (client as any).engagement_end_date as string | null | undefined;
                                const end = endRaw ? formatDate(new Date(endRaw + 'T00:00:00')) : 'ongoing';
                                return (
                                  <span className="text-xs text-ink-warm-500 tabular-nums">
                                    {start} – {end}
                                  </span>
                                );
                              })()}
                            </div>
                          )}

                          {/* Activity row.
                              HHP Onboarding Overhaul Spec § 5 changes 2 + 3:
                                • Pending client tasks badge — "what's stuck"
                                  on the client's side at a glance
                                • Last portal visit — surfaces stale
                                  engagements that hide in plain sight
                              Both were temporarily hidden 2026-06-02 but
                              restored by the Onboarding Overhaul spec
                              which specifically calls them out as the
                              info the team scans for. */}
                          <div className="flex items-center gap-2 flex-wrap text-xs">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); router.push(`/tasks?client=${client.id}`); }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-cream-100 text-ink-warm-700 hover:bg-cream-200 transition-colors font-medium"
                              title={openHqTasks > 0 ? `${openHqTasks} open HQ task${openHqTasks === 1 ? '' : 's'} — click to view` : 'No open HQ tasks — click to view all'}
                            >
                              <ListTodo className="h-3 w-3" />
                              {openHqTasks} HQ task{openHqTasks === 1 ? '' : 's'}
                            </button>
                            {/* "N on client" pill hidden per Andy 2026-06-19.
                                Client-court action items remain visible in
                                the Action Board tab inside the Context modal;
                                the card-row pill was redundant signal that
                                cluttered the activity strip. */}
                            {/* Last-visit eye-icon date dropped per Andy
                                2026-06-19 — duplicated the footer
                                "Last visited: …" line which also carries
                                the 30-day count and is the canonical
                                stale-portal signal. */}
                          </div>
                        </div>
                      );
                    })()}
                    {/* Per Andy 2026-06-19: campaign-row simplified to
                        View Campaigns + View Portal. Add Campaign dropped
                        (rarely used from the client card; campaign-create
                        still reachable from /campaigns). When the client
                        has no campaigns yet, the View Campaigns button
                        is hidden and View Portal takes the full row. */}
                    <div className="flex gap-2 flex-wrap">
                      {(client.campaign_count || 0) > 0 && (
                        <Button variant="outline" size="sm" className="flex-1 min-w-[120px]" onClick={() => router.push(`/campaigns?clientId=${client.id}`)}>
                          View Campaigns
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className={(client.campaign_count || 0) > 0 ? "flex-1 min-w-[120px]" : "w-full"}
                        onClick={() => router.push(`/public/portal/${client.id}`)}
                      >
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                        <span className="truncate">View Portal</span>
                      </Button>
                    </div>
                    {/* Client Portal row — three flat buttons (no kebab).
                        Updates + Notes were hidden per the May 22, 2026
                        audit because the features had ~zero usage
                        (5 update rows total across 2 clients, 1 note
                        row total, both untouched for 3-4 months). Data
                        + handlers + modals remain intact so the
                        features can be restored by adding the buttons
                        back if the team adopts the workflow.

                        mt-auto pushes this entire row to the bottom of
                        the card so the divider + buttons align across
                        the row regardless of how much content sits
                        above (campaign count, badges, milestone bar
                        all vary per client). */}
                    {/* [Responsive cleanup, May 2026] The 3-button row
                        (Open / Edit / Visits) was overflowing the card
                        at the lg breakpoint (3-column grid → cards
                        ~320px). Fixes:
                        - flex-wrap so buttons drop to a second row
                          instead of pushing off the card
                        - min-w-[110px] floor so each button keeps a
                          tappable size when it does wrap
                        - inner spans get truncate + min-w-0 so even a
                          single button label can't overflow
                        - px-2 (was default) shaves horizontal padding
                          so all three usually still fit at lg */}
                    <div className="mt-auto pt-3 border-t border-cream-100">
                      {/* [2026-06-08] External-visit meta line sits ABOVE
                          the button row (not inside the Visits column) so
                          all three buttons share a single baseline — the
                          previous in-column placement pushed the Visits
                          button below Open / Edit. Always rendered with
                          fixed height so cards line up vertically across
                          the grid regardless of visit state. */}
                      {(() => {
                        const lastVisitAt = portalAccessSummary[client.id]?.last_at;
                        const lastVisitRel = lastVisitAt ? relativeTimeFromNow(lastVisitAt) : null;
                        const visits30d = portalAccessSummary[client.id]?.count_30d || 0;
                        return (
                          <div className="mb-2 flex items-center justify-between gap-2 text-[10px] leading-none tracking-wide uppercase">
                            <span className="text-ink-warm-400 truncate">
                              <span className="text-ink-warm-500">Last visited:</span>{' '}
                              <span className={lastVisitAt ? 'text-ink-warm-700 font-semibold normal-case tracking-normal' : 'text-ink-warm-400 normal-case tracking-normal'}>
                                {lastVisitAt ? lastVisitRel : '—'}
                              </span>
                            </span>
                            <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-brand/10 text-brand font-semibold normal-case tracking-normal">
                              <Eye className="h-3 w-3" />
                              <span>{visits30d} <span className="font-normal opacity-70">/ 30d</span></span>
                            </span>
                          </div>
                        );
                      })()}
                      {/* Per Andy 2026-06-19: Edit Portal split into 3
                          deep-link buttons (Context / Action Board /
                          Weekly Update) that open the modal pre-selected
                          to that tab. Visit log stays. The little
                          green "Set up" dot now sits on the Context
                          button since that's the one that surfaces the
                          form whose presence the dot signals. */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 min-w-[110px] px-2"
                          onClick={() => openContextModal(client, 'context')}
                          title="Open the Context tab"
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                          <span className="truncate">Context</span>
                          {clientContexts[client.id] && (
                            <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" title="Set up" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 min-w-[110px] px-2"
                          onClick={() => openContextModal(client, 'actionboard')}
                          title="Open the Action Board tab"
                        >
                          <span className="truncate">Action Board</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 min-w-[110px] px-2"
                          onClick={() => openContextModal(client, 'weekly-update')}
                          title="Open the Weekly Update tab"
                        >
                          <span className="truncate">Weekly Update</span>
                        </Button>
                        {(() => {
                          const lastVisitAt = portalAccessSummary[client.id]?.last_at;
                          const lastVisitRel = lastVisitAt ? relativeTimeFromNow(lastVisitAt) : null;
                          const visits30d = portalAccessSummary[client.id]?.count_30d || 0;
                          return (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 min-w-[110px] px-2"
                              onClick={() => openAccessLogModal(client)}
                              title={
                                lastVisitAt
                                  ? `Last external visit ${lastVisitRel} · ${visits30d} in last 30 days`
                                  : 'No external visits in the last 30 days · click for full log (incl. internal)'
                              }
                            >
                              <Eye className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                              <span className="truncate">Visit log</span>
                            </Button>
                          );
                        })()}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
          </div>
        </div>

        {/* Archive Confirmation Dialog */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Archive Client</DialogTitle>
              <DialogDescription>
                Are you sure you want to archive <span className="font-semibold">{clientToDelete?.name}</span>? The client and its data will be moved to the Archive and can be restored later.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDeleteClient}
              >
                Archive Client
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Zone C top-post picker Dialog removed 2026-06-19 — the picker
            now renders inline inside the Weekly Update tab's Zone C
            block. See `topPostCandidates` rendering in that section. */}

        {/* Access Log Dialog — read-only audit of who has visited the
            public portal. Sourced from portal_access_log; admin-only
            via RLS (see migration 064). Cap at 200 most-recent rows
            for UI snappiness; we can add pagination if anyone scrolls
            to the bottom. */}
        <Dialog open={!!accessLogModalClient} onOpenChange={(open) => { if (!open) setAccessLogModalClient(null); }}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-brand" />
                Portal visits — {accessLogModalClient?.name}
              </DialogTitle>
              <DialogDescription>
                Who has accessed this client&apos;s public portal, when, and which allowlist rule let them in.
              </DialogDescription>
            </DialogHeader>
            {/* [2026-06-08] Audience filter — defaults to External so the
                modal matches the on-card "Visit log" badge (which always
                excludes @holohive.io / @holohive.agency). User can flip
                to Internal to QA team traffic or All to see the full
                audit log. Counts live next to each label so it's clear
                what the split is at a glance. */}
            {(() => {
              const isInternal = (email: string | null | undefined) => {
                if (!email) return false;
                const lower = email.toLowerCase();
                return lower.endsWith('@holohive.io') || lower.endsWith('@holohive.agency');
              };
              const externalCount = accessLogRows.filter(r => !isInternal(r.email)).length;
              const internalCount = accessLogRows.filter(r => isInternal(r.email)).length;
              const visibleRows = accessLogRows.filter(r => {
                if (accessLogAudience === 'all') return true;
                if (accessLogAudience === 'external') return !isInternal(r.email);
                return isInternal(r.email);
              });
              return (
                <>
                  {!accessLogLoading && accessLogRows.length > 0 && (
                    // Audience selector — uses the same Tabs primitive
                    // as every other in-popup selector in this page
                    // (Meeting Notes / Decision Log at L3597, the
                    // Context / Action Board switch at L3861, etc.)
                    // so dialog chrome stays consistent.
                    <Tabs value={accessLogAudience} onValueChange={(v) => setAccessLogAudience(v as 'external' | 'internal' | 'all')}>
                      <TabsList className="bg-cream-100 p-1 mb-3 shrink-0 w-fit">
                        <TabsTrigger value="external" className="data-[state=active]:bg-white px-4 py-2 text-sm font-medium">
                          External
                          <span className="ml-1.5 text-xs bg-cream-200 text-ink-warm-700 px-1.5 py-0.5 rounded-full pointer-events-none">{externalCount}</span>
                        </TabsTrigger>
                        <TabsTrigger value="internal" className="data-[state=active]:bg-white px-4 py-2 text-sm font-medium">
                          Internal
                          <span className="ml-1.5 text-xs bg-cream-200 text-ink-warm-700 px-1.5 py-0.5 rounded-full pointer-events-none">{internalCount}</span>
                        </TabsTrigger>
                        <TabsTrigger value="all" className="data-[state=active]:bg-white px-4 py-2 text-sm font-medium">
                          All
                          <span className="ml-1.5 text-xs bg-cream-200 text-ink-warm-700 px-1.5 py-0.5 rounded-full pointer-events-none">{accessLogRows.length}</span>
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  )}
                  <div className="flex-1 overflow-y-auto px-1">
                    {accessLogLoading ? (
                      <div className="space-y-2 py-4">
                        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                      </div>
                    ) : accessLogRows.length === 0 ? (
                      <div className="py-8 text-center text-sm text-ink-warm-500">
                        No portal visits recorded yet.
                        <p className="text-xs text-ink-warm-400 mt-1">
                          Share the portal link via the <Share2 className="inline h-3 w-3" /> icon to start tracking.
                        </p>
                      </div>
                    ) : visibleRows.length === 0 ? (
                      <div className="py-8 text-center text-sm text-ink-warm-500">
                        No {accessLogAudience} visits.
                        <p className="text-xs text-ink-warm-400 mt-1">
                          Try a different audience above.
                        </p>
                      </div>
                    ) : (
                      <div className="border rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-cream-50 hover:bg-cream-50">
                              <TableHead className="h-9 px-3 py-2 text-xs font-medium uppercase tracking-wider text-ink-warm-500">When</TableHead>
                              <TableHead className="h-9 px-3 py-2 text-xs font-medium uppercase tracking-wider text-ink-warm-500">Email</TableHead>
                              <TableHead className="h-9 px-3 py-2 text-xs font-medium uppercase tracking-wider text-ink-warm-500">Via</TableHead>
                              <TableHead className="h-9 px-3 py-2 text-xs font-medium uppercase tracking-wider text-ink-warm-500">IP</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {visibleRows.map(row => {
                              // Pretty labels for the authorization-rule enum.
                              // 'cache' = returning visitor on a still-valid
                              // 24h localStorage token, distinct from a fresh
                              // login.
                              const viaLabel =
                                row.authorized_via === 'exact' ? 'Primary email'
                                : row.authorized_via === 'approved_email' ? 'Approved email'
                                : row.authorized_via === 'same_domain' ? 'Same domain'
                                : row.authorized_via === 'approved_domain' ? 'Approved domain'
                                : row.authorized_via === 'cache' ? 'Returning'
                                : row.authorized_via;
                              const viaTone: BadgeTone =
                                row.authorized_via === 'exact' ? 'success'
                                : row.authorized_via === 'cache' ? 'neutral'
                                : 'info';
                              const rowIsInternal = isInternal(row.email);
                              return (
                                <TableRow key={row.id} className="border-cream-100">
                                  <TableCell className="px-3 py-2 text-xs text-ink-warm-700 whitespace-nowrap">
                                    {new Date(row.accessed_at).toLocaleString()}
                                  </TableCell>
                                  <TableCell className="px-3 py-2 text-xs text-ink-warm-900">
                                    <span className="inline-flex items-center gap-1.5">
                                      <span>{row.email}</span>
                                      {rowIsInternal && (
                                        // Tiny internal-team marker so admins can
                                        // scan the All view without reading every
                                        // domain. Slate to read as "ops/admin"
                                        // per the StatusBadge palette.
                                        <StatusBadge tone="slate" size="sm" bordered>Internal</StatusBadge>
                                      )}
                                    </span>
                                  </TableCell>
                                  <TableCell className="px-3 py-2">
                                    <StatusBadge tone={viaTone} size="sm" bordered withDot>{viaLabel}</StatusBadge>
                                  </TableCell>
                                  <TableCell className="px-3 py-2 text-xs text-ink-warm-400 font-mono">
                                    {row.ip_address || '—'}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
            <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
              <Button variant="outline" onClick={() => setAccessLogModalClient(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Share Portal Dialog */}
        <Dialog open={isSharePortalOpen} onOpenChange={setIsSharePortalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Share Links: {clientToShare?.name}</DialogTitle>
              <DialogDescription>
                Share portal and form links with this client.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Portal Link</Label>
                <div className="flex gap-2">
                  <Input
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/public/portal/${clientToShare?.slug || clientToShare?.id}`}
                    readOnly
                    className="flex-1 focus-brand"
                  />
                  <Button variant="outline" className="h-10" onClick={copyPortalLink}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" className="h-10" onClick={() => {
                    if (typeof window !== 'undefined' && clientToShare) {
                      window.open(`${window.location.origin}/public/portal/${clientToShare.slug || clientToShare.id}`, '_blank');
                    }
                  }}>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Onboarding Form</Label>
                <div className="flex gap-2">
                  <Input
                    value={getFormUrl(ONBOARDING_FORM_SLUG)}
                    readOnly
                    className="flex-1 focus-brand"
                  />
                  <Button variant="outline" className="h-10" onClick={() => copyFormLink(ONBOARDING_FORM_SLUG, 'Onboarding form')}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" className="h-10" onClick={() => {
                    const url = getFormUrl(ONBOARDING_FORM_SLUG);
                    if (url) window.open(url, '_blank');
                  }}>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {shareExtraForms.map(formSlugOrId => {
                const form = shareForms.find(f => (f.slug || f.id) === formSlugOrId);
                if (!form) return null;
                return (
                  <div key={formSlugOrId} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>{form.name}</Label>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-ink-warm-400 hover:text-rose-500" onClick={() => setShareExtraForms(prev => prev.filter(s => s !== formSlugOrId))}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Input value={getFormUrl(formSlugOrId)} readOnly className="flex-1 focus-brand" />
                      <Button variant="outline" className="h-10" onClick={() => copyFormLink(formSlugOrId, form.name)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" className="h-10" onClick={() => {
                        const url = getFormUrl(formSlugOrId);
                        if (url) window.open(url, '_blank');
                      }}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              {(() => {
                const availableForms = shareForms.filter(f => (f.slug || f.id) !== ONBOARDING_FORM_SLUG && !shareExtraForms.includes(f.slug || f.id));
                if (availableForms.length === 0) return null;
                return shareAddFormOpen ? (
                  <div className="space-y-2">
                    <Label>Add Form</Label>
                    <Select onValueChange={v => { setShareExtraForms(prev => [...prev, v]); setShareAddFormOpen(false); }}>
                      <SelectTrigger className="focus-brand">
                        <SelectValue placeholder="Select a form..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableForms.map(f => (
                          <SelectItem key={f.id} value={f.slug || f.id}>{f.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setShareAddFormOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Add Form
                  </Button>
                );
              })()}
              <p className="text-sm text-ink-warm-500">
                Clients can access the portal using their registered email address ({clientToShare?.email}).
              </p>
            </div>
          </DialogContent>
        </Dialog>
        {/* Meeting Notes Modal */}
        <Dialog open={!!meetingNotesModalClient} onOpenChange={(open) => { if (!open) { setMeetingNotesModalClient(null); setIsNoteFormOpen(false); setEditingNoteId(null); setDeletingNoteId(null); setIsDecisionFormOpen(false); setEditingDecisionId(null); setDeletingDecisionId(null); } }}>
          <DialogContent className="sm:max-w-[800px] max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Notes & Decisions — {meetingNotesModalClient?.name}</DialogTitle>
              <DialogDescription>Manage meeting notes and decision log for this client.</DialogDescription>
            </DialogHeader>
            {/* Tabs grow to fill the flex column so each TabsContent's
                own overflow-y-auto becomes the single scroll surface,
                instead of stacking against a fixed 55vh cap. */}
            <Tabs value={meetingNotesTab} onValueChange={setMeetingNotesTab} className="flex-1 flex flex-col min-h-0">
              <TabsList className="bg-cream-100 p-1 mb-3 shrink-0 w-fit">
                <TabsTrigger value="notes" className="data-[state=active]:bg-white px-4 py-2 text-sm font-medium">Meeting Notes</TabsTrigger>
                <TabsTrigger value="decisions" className="data-[state=active]:bg-white px-4 py-2 text-sm font-medium">Decision Log</TabsTrigger>
              </TabsList>
              <TabsContent value="decisions" className="space-y-4 flex-1 overflow-y-auto px-1 pb-4">
                {!isDecisionFormOpen && (
                  <Button variant="brand" size="sm" onClick={() => { setIsDecisionFormOpen(true); setEditingDecisionId(null); setDecisionForm({ decision_date: new Date(), summary: '' }); }}>
                    <Plus className="h-4 w-4 mr-1" /> Add Decision
                  </Button>
                )}
                {isDecisionFormOpen && (
                  <div className="border rounded-lg p-4 space-y-3 bg-cream-50">
                    <div className="grid gap-2">
                      <Label>Date <span className="text-rose-500">*</span></Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="focus-brand justify-start text-left font-normal" style={{ borderColor: '#e5e7eb', backgroundColor: 'white', color: decisionForm.decision_date ? '#111827' : '#9ca3af' }}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {decisionForm.decision_date ? formatDate(decisionForm.decision_date) : 'Select date'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={decisionForm.decision_date} onSelect={(date) => setDecisionForm({ ...decisionForm, decision_date: date || undefined })} initialFocus classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }} modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }} />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="grid gap-2">
                      <Label>Decision Summary <span className="text-rose-500">*</span></Label>
                      <Input value={decisionForm.summary} onChange={(e) => setDecisionForm({ ...decisionForm, summary: e.target.value })} placeholder="1-2 line decision summary" className="focus-brand" />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="brand" size="sm" onClick={handleDecisionSubmit} disabled={!decisionForm.summary.trim() || !decisionForm.decision_date}>
                        {editingDecisionId ? 'Save' : 'Add'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setIsDecisionFormOpen(false); setEditingDecisionId(null); }}>Cancel</Button>
                    </div>
                  </div>
                )}
                {meetingNotesModalClient && (clientDecisionLogs[meetingNotesModalClient.id] || []).map((dec) => (
                  <div key={dec.id} className="border rounded-lg p-3 bg-white">
                    {deletingDecisionId === dec.id ? (
                      <div className="space-y-2">
                        <p className="text-sm text-ink-warm-700">Delete this decision?</p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="destructive" onClick={() => deleteDecision(dec.id)}>Delete</Button>
                          <Button size="sm" variant="outline" onClick={() => setDeletingDecisionId(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs text-ink-warm-400">{formatDate(new Date(dec.decision_date + 'T00:00:00'))}</p>
                          <p className="text-sm text-ink-warm-700 mt-1">{dec.summary}</p>
                        </div>
                        <div className="flex gap-1">
                          <Button type="button" variant="ghost" size="sm" className="hover:bg-cream-100 w-auto px-2" onClick={() => { setEditingDecisionId(dec.id); setDecisionForm({ decision_date: new Date(dec.decision_date + 'T00:00:00'), summary: dec.summary }); setIsDecisionFormOpen(true); }}><Edit className="h-4 w-4 text-ink-warm-700" /></Button>
                          <Button type="button" variant="ghost" size="sm" className="hover:bg-rose-50 w-auto px-2" onClick={() => setDeletingDecisionId(dec.id)}><Trash2 className="h-4 w-4 text-rose-600" /></Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {meetingNotesModalClient && (!clientDecisionLogs[meetingNotesModalClient.id] || clientDecisionLogs[meetingNotesModalClient.id].length === 0) && !isDecisionFormOpen && (
                  <p className="text-sm text-ink-warm-500 text-center py-4">No decisions logged yet.</p>
                )}
              </TabsContent>
              <TabsContent value="notes" className="space-y-4 flex-1 overflow-y-auto px-1 pb-4">
              {!isNoteFormOpen && (
                <div className="flex items-center gap-2">
                  <Button variant="brand" size="sm" onClick={() => openNoteForm()}>
                    <Plus className="h-4 w-4 mr-1" /> Add Note
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => docUploadRef.current?.click()}
                    disabled={isParsingDoc}
                  >
                    {isParsingDoc ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-ink-warm-700 mr-1" />
                    ) : (
                      <Upload className="h-4 w-4 mr-1" />
                    )}
                    Upload .docx
                  </Button>
                  <span className="text-xs text-ink-warm-400">Gemini meeting notes only</span>
                </div>
              )}
              <input
                ref={docUploadRef}
                type="file"
                accept=".docx"
                className="hidden"
                onChange={handleDocUpload}
              />
              {isNoteFormOpen && (
                <div className="border rounded-lg p-4 space-y-3 bg-cream-50">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ink-warm-700">{editingNoteId ? 'Edit Note' : 'New Note'}</span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => docUploadRef.current?.click()}
                        disabled={isParsingDoc}
                      >
                        {isParsingDoc ? (
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-ink-warm-700 mr-1" />
                        ) : (
                          <Upload className="h-3 w-3 mr-1" />
                        )}
                        Upload .docx
                      </Button>
                      <span className="text-[10px] text-ink-warm-400">Gemini notes only</span>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Title <span className="text-rose-500">*</span></Label>
                    <Input value={meetingNoteForm.title} onChange={(e) => setMeetingNoteForm({ ...meetingNoteForm, title: e.target.value })} placeholder="Meeting title" className="focus-brand" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Meeting Date <span className="text-rose-500">*</span></Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="focus-brand justify-start text-left font-normal" style={{ borderColor: '#e5e7eb', backgroundColor: 'white', color: meetingNoteForm.meeting_date ? '#111827' : '#9ca3af' }}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {meetingNoteForm.meeting_date ? formatDate(meetingNoteForm.meeting_date) : 'Select date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={meetingNoteForm.meeting_date} onSelect={(date) => setMeetingNoteForm({ ...meetingNoteForm, meeting_date: date || undefined })} initialFocus classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }} modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }} />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="grid gap-2">
                    <Label>Attendees</Label>
                    <Input value={meetingNoteForm.attendees} onChange={(e) => setMeetingNoteForm({ ...meetingNoteForm, attendees: e.target.value })} placeholder="e.g. John, Sarah, Mike" className="focus-brand" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Content</Label>
                    <div className="meeting-note-editor-wrapper">
                      <style jsx global>{`
                        .meeting-note-editor-wrapper {
                          height: 200px;
                          min-height: 150px;
                          max-height: 50vh;
                          overflow-y: auto;
                          border: 1px solid #e5e7eb;
                          border-radius: 0.375rem;
                          resize: vertical;
                        }
                        .meeting-note-editor-wrapper .ql-toolbar {
                          position: sticky;
                          top: 0;
                          z-index: 10;
                          background: white;
                          border-top: none;
                          border-left: none;
                          border-right: none;
                        }
                        .meeting-note-editor-wrapper .ql-container {
                          border: none;
                          min-height: 120px;
                        }
                      `}</style>
                      <ReactQuill
                        theme="snow"
                        value={meetingNoteForm.content}
                        onChange={(value) => setMeetingNoteForm({ ...meetingNoteForm, content: value })}
                        modules={quillModules}
                        placeholder="Meeting notes content..."
                        className="bg-white"
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Action Items <span className="text-xs text-ink-warm-500 font-normal">(freeform notes)</span></Label>
                    <div className="meeting-note-editor-wrapper">
                      <ReactQuill
                        theme="snow"
                        value={meetingNoteForm.action_items}
                        onChange={(value) => setMeetingNoteForm({ ...meetingNoteForm, action_items: value })}
                        modules={quillModules}
                        placeholder="Action items with owner + ETA..."
                        className="bg-white"
                      />
                    </div>
                  </div>
                  {/* Structured action items — only shown when editing an
                      existing meeting note (needs a meeting_note_id to
                      attach to). HH-side items auto-create HQ tasks via
                      /api/meeting-action-items. */}
                  {editingNoteId && (
                    <MeetingActionItems
                      meetingNoteId={editingNoteId}
                      teamMembers={allUsers
                        .filter((u: any) => u.role && u.role !== 'client' && u.role !== 'guest')
                        .map((u: any) => ({ id: u.id, name: u.name }))}
                    />
                  )}
                  <div className="flex gap-2">
                    <Button variant="brand" size="sm" onClick={handleNoteFormSubmit} disabled={!meetingNoteForm.title.trim() || !meetingNoteForm.meeting_date}>
                      {editingNoteId ? 'Save' : 'Add'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setIsNoteFormOpen(false); setEditingNoteId(null); }}>Cancel</Button>
                  </div>
                </div>
              )}
              {meetingNotesModalClient && (clientMeetingNotes[meetingNotesModalClient.id] || []).filter((note) => editingNoteId !== note.id).map((note) => (
                <div key={note.id} className="border rounded-lg p-3 bg-white">
                  {deletingNoteId === note.id ? (
                    <div className="space-y-2">
                      <p className="text-sm text-ink-warm-700">Delete "{note.title}"?</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="destructive" onClick={() => deleteMeetingNote(note.id)}>Delete</Button>
                        <Button size="sm" variant="outline" onClick={() => setDeletingNoteId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-sm">{note.title}</p>
                          <p className="text-xs text-ink-warm-500">{formatDate(new Date(note.meeting_date + 'T00:00:00'))}</p>
                        </div>
                        <div className="flex gap-1">
                          <Button type="button" variant="ghost" size="sm" className="hover:bg-cream-100 w-auto px-2" onClick={() => openNoteForm(note)} title="Edit note"><Edit className="h-4 w-4 text-ink-warm-700" /></Button>
                          <Button type="button" variant="ghost" size="sm" className="hover:bg-rose-50 w-auto px-2" onClick={() => setDeletingNoteId(note.id)} title="Delete note"><Trash2 className="h-4 w-4 text-rose-600" /></Button>
                        </div>
                      </div>
                      {note.attendees && <p className="text-xs text-ink-warm-500 mt-1"><span className="font-medium">Attendees:</span> {note.attendees}</p>}
                      {note.content && <div className="ql-snow mt-2"><div className="ql-editor !p-0 !text-sm !text-ink-warm-700" dangerouslySetInnerHTML={{ __html: note.content }} /></div>}
                      {note.action_items && (
                        <div className="mt-2 pt-2 border-t border-cream-100">
                          <p className="text-xs font-medium text-ink-warm-500 mb-1">Action Items:</p>
                          <div className="ql-snow"><div className="ql-editor !p-0 !text-xs !text-ink-warm-700" dangerouslySetInnerHTML={{ __html: note.action_items }} /></div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
              {meetingNotesModalClient && (!clientMeetingNotes[meetingNotesModalClient.id] || clientMeetingNotes[meetingNotesModalClient.id].length === 0) && !isNoteFormOpen && (
                <p className="text-sm text-ink-warm-500 text-center py-4">No meeting notes yet.</p>
              )}
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>

        {/* Client Context Modal */}
        <Dialog open={!!contextModalClient} onOpenChange={(open) => { if (!open) { setContextModalClient(null); setIsActionItemFormOpen(false); setEditingActionItemId(null); setDeletingActionItemId(null); } }}>
          <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                <span>Client Context — {contextModalClient?.name}</span>
                {/* [2026-06-11] Draft mode chip removed alongside the
                    bell teardown. Without notifications, there's no
                    real-time stream to suppress; the activity_category
                    filter on client_activity_log already excludes
                    setup churn from the future "This Week" snapshot. */}
              </DialogTitle>
              <DialogDescription>
                Manage engagement context and action board for this client.
              </DialogDescription>
            </DialogHeader>
            <Tabs value={contextModalTab} onValueChange={(v) => {
              setContextModalTab(v);
              if (v === 'actionboard' && contextModalClient) {
                seedMilestones(contextModalClient.id);
              }
              if (v === 'weekly-update' && contextModalClient) {
                // Lazy-load the v2 row only when the tab is opened so
                // we don't pay the round-trip for every Context modal
                // open. Each tab switch reloads the row in case
                // another team member edited it in the meantime.
                loadWeeklyV2Row(contextModalClient.id, weeklyV2Week);
                // Zone C inline candidates — keep these in sync with
                // the v2 row reload so freshly-posted content shows up
                // without an extra refresh.
                fetchTopPostCandidates(contextModalClient.id);
              }
            }} className="flex-1 flex flex-col min-h-0">
              {/* Popup tab chrome aligned with the other in-popup tab
                  strips in this page (Meeting Notes / Decision Log
                  + Portal Visits audience filter): bg-cream-100
                  outer, mb-3 shrink-0, white active tile, sm font
                  medium so all dialog selectors read the same. */}
              <TabsList className="bg-cream-100 p-1 mb-3 shrink-0 w-fit">
                <TabsTrigger value="context" className="data-[state=active]:bg-white px-4 py-2 text-sm font-medium">Context</TabsTrigger>
                <TabsTrigger value="actionboard" className="data-[state=active]:bg-white px-4 py-2 text-sm font-medium">Action Board</TabsTrigger>
                {/* [2026-06-08] 3rd tab — Weekly Update per Phase 2 of
                    the Post-Onboarding Campaign View spec. Three-zone
                    form inside: Strategic Direction (internal),
                    Execution Plan (Zone A — batch-creates HQ tasks),
                    This Week Feed (Zone B — drives portal). */}
                <TabsTrigger value="weekly-update" className="data-[state=active]:bg-white px-4 py-2 text-sm font-medium">Weekly Update</TabsTrigger>
                {/* [2026-06-15] 4th tab — Call Notes per HHP Team Dashboard
                    Spec § 4.3. Stored on client_context.call_notes JSONB;
                    dashboard reads from same column. HH-side action items
                    auto-create HQ tasks on save. */}
                <TabsTrigger value="call-notes" className="data-[state=active]:bg-white px-4 py-2 text-sm font-medium">Call Notes</TabsTrigger>
              </TabsList>
              {/* Each tab is its own flex-col so the body scrolls and
                  the action row stays pinned below it. Previously the
                  DialogFooter sat INSIDE the scroll wrapper, so the
                  Save button scrolled with the form body — easy to
                  miss on a long form. */}
              <TabsContent value="context" className="flex-1 flex flex-col min-h-0 mt-0">
                <div className="space-y-4 flex-1 overflow-y-auto px-1 pb-4">
                  {/* [Phase edit in popup] Active Campaign banner —
                      shows the latest in-window campaign name + a
                      phase dropdown that maps 1:1 to the teal pill
                      the client sees in the portal hero. Renders only
                      when a campaign exists; hidden gracefully for
                      clients with no campaigns yet. */}
                  {latestCampaign && (
                    <div className="bg-brand/5 border border-brand/20 rounded-lg p-3 flex items-center gap-3">
                      <div className="p-1.5 bg-gradient-to-br from-brand to-[#2d6570] rounded-md shadow-sm flex-shrink-0">
                        <Activity className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-brand uppercase tracking-wider">Active Campaign</p>
                        <p className="text-sm font-semibold text-ink-warm-900 truncate" title={latestCampaign.name}>
                          {latestCampaign.name}
                        </p>
                      </div>
                      <Select
                        value={latestCampaign.current_phase ?? '__none__'}
                        onValueChange={(v) => handleLatestCampaignPhaseChange(v === '__none__' ? null : v)}
                        disabled={savingPhase}
                      >
                        <SelectTrigger className="w-[170px] h-8 focus-brand flex-shrink-0">
                          <SelectValue placeholder="— Not set" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Not set</SelectItem>
                          {CURRENT_PHASE_OPTIONS.map(p => (
                            <SelectItem key={p} value={p}>{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Hidden per May 2026 audit — both fields were
                      captured but barely used:
                        - engagement_type: only rendered as a small pill
                          on the portal header. No filtering, analytics,
                          or workflow used it. UI hidden + portal
                          rendering removed in the same commit.
                        - onboarding_phase: fully dead — written but
                          never read. Portal computed its own phase
                          from milestone state, ignoring this field.
                      DB columns kept so existing data isn't lost; can
                      restore the Selects + portal pill if/when a real
                      use case shows up. */}
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <Label>Scope</Label>
                      {contextModalClient && getLinkedCRMAccount(contextModalClient.id) && (
                        <span className="text-xs text-brand font-medium">From Pipeline</span>
                      )}
                    </div>
                    {contextModalClient && getLinkedCRMAccount(contextModalClient.id) ? (
                      <div className="flex h-auto min-h-[80px] w-full rounded-md border border-cream-200 bg-cream-50 px-3 py-2 text-sm text-ink-warm-700">{contextForm.scope || '—'}</div>
                    ) : (
                      <Textarea value={contextForm.scope} onChange={(e) => setContextForm({ ...contextForm, scope: e.target.value })} placeholder="Project description, regions, etc." className="focus-brand" rows={3} />
                    )}
                  </div>
                  {/* [2026-06-08] Start Date moved out of this popup
                      to the Edit Client popup — engagement start is a
                      core attribute that belongs alongside Status, not
                      buried in the context tab. The contextForm still
                      carries start_date in its payload (round-tripped
                      from the existing row) so this save doesn't blow
                      away the value; edits happen in the Edit Client
                      dialog. */}
                  {/* Free-text "Milestones" field removed per May 2026
                      feedback — redundant with the structured milestones
                      managed under the Action Board tab. The contextForm
                      still carries the field so the saved value isn't
                      destroyed; it's just no longer editable here. */}
                  {/* Client Contacts field hidden per May 2026 audit —
                      field is also hidden in the portal. DB column kept
                      so existing data isn't destroyed; can restore the
                      input + portal rendering trivially if it's wanted
                      back later. */}
                  <div className="grid gap-2">
                    <Label>Holo Hive Contacts</Label>
                    {/* Picker of team members instead of free text.
                        Storage stays as comma-separated names (no schema
                        change). Unmatched manual entries get dropped
                        on save — acceptable migration cost since the
                        user explicitly wants the picker model. */}
                    {(() => {
                      // Approved team members only — filter out:
                      //   - clients (handled via the per-client portal),
                      //   - inactive users (guests, invited-but-never-joined,
                      //     deactivated members).
                      // The is_active flag is the canonical "approved" gate.
                      const teamMembers = allUsers.filter((u: any) =>
                        u.role !== 'client' && u.is_active !== false
                      );
                      const currentNames = (contextForm.holohive_contacts || '')
                        .split(',').map(s => s.trim()).filter(Boolean);
                      const currentNamesLower = new Set(currentNames.map(n => n.toLowerCase()));
                      const selectedUsers = teamMembers.filter((u: any) =>
                        currentNamesLower.has((u.name || u.email || '').toLowerCase())
                      );
                      const triggerLabel = selectedUsers.length > 0
                        ? selectedUsers.map((u: any) => u.name || u.email).join(', ')
                        : 'Select team members…';
                      return (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="focus-brand justify-between font-normal h-auto min-h-9 py-2 text-left"
                              style={{ borderColor: '#e5e7eb', backgroundColor: 'white', color: selectedUsers.length > 0 ? '#111827' : '#9ca3af' }}
                            >
                              <span className="truncate">{triggerLabel}</span>
                              <ChevronDown className="h-4 w-4 text-ink-warm-400 flex-shrink-0 ml-2" />
                            </Button>
                          </PopoverTrigger>
                          {/* Scroll on the PopoverContent itself — putting
                              max-h + overflow on an inner div can fail
                              when Radix's wrapper sizing collapses
                              parent constraints. */}
                          <PopoverContent className="w-72 p-2 max-h-72 overflow-y-auto" align="start">
                            <div className="space-y-0.5">
                              {teamMembers.length === 0 && (
                                <p className="text-xs text-ink-warm-400 italic px-2 py-2">No active team members found.</p>
                              )}
                              {teamMembers.map((u: any) => {
                                const name = u.name || u.email;
                                const checked = currentNamesLower.has(name.toLowerCase());
                                return (
                                  <label
                                    key={u.id}
                                    className="flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-cream-100 cursor-pointer"
                                  >
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(c) => {
                                        // Rebuild the comma-separated string from
                                        // the picker's selection. We DON'T preserve
                                        // unmatched manual entries — the user is
                                        // explicitly opting into the structured
                                        // picker model.
                                        const nextSet = new Set(
                                          teamMembers
                                            .filter((m: any) => {
                                              const mName = m.name || m.email;
                                              const isThis = m.id === u.id;
                                              return isThis ? !!c : currentNamesLower.has(mName.toLowerCase());
                                            })
                                            .map((m: any) => m.name || m.email)
                                        );
                                        setContextForm({
                                          ...contextForm,
                                          holohive_contacts: Array.from(nextSet).join(', '),
                                        });
                                      }}
                                    />
                                    <span className="flex-1 min-w-0 truncate">{name}</span>
                                    {u.email && u.name && (
                                      <span className="text-[10px] text-ink-warm-400 truncate">{u.email}</span>
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          </PopoverContent>
                        </Popover>
                      );
                    })()}
                  </div>
                  <div className="border-t pt-4 mt-2">
                    <p className="text-sm font-semibold text-ink-warm-700 mb-3">Resource Links (shown in client portal)</p>
                    <div className="grid gap-3">
                      <div className="grid gap-1">
                        <Label className="text-xs">Telegram Group URL</Label>
                        <Input value={contextForm.telegram_url} onChange={(e) => setContextForm({ ...contextForm, telegram_url: e.target.value })} placeholder="https://t.me/..." className="focus-brand" />
                      </div>
                      {/* [2026-06-11] Telegram chat ID — sits with the
                          group URL because they're paired. The URL is
                          what humans share; the chat ID is what the bot
                          needs to actually post to the group (e.g.
                          push call note summaries from /dashboard).
                          Accepts a numeric chat_id (-1001234567...) or
                          a @username. Bot must already be a member of
                          the group before sends will land. */}
                      <div className="grid gap-1">
                        <Label className="text-xs">Telegram Chat ID (for bot sends)</Label>
                        <Input
                          value={contextForm.telegram_chat_id}
                          onChange={(e) => setContextForm({ ...contextForm, telegram_chat_id: e.target.value })}
                          placeholder="-1001234567890 or @publicgroup"
                          className="focus-brand font-mono text-sm"
                        />
                        <p className="text-[11px] text-ink-warm-500 mt-0.5">
                          Required for "Send to client TG" on dashboard call notes. Bot must be a member of the group.
                        </p>
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs">Brand Assets URL</Label>
                        <Input value={contextForm.shared_drive_url} onChange={(e) => setContextForm({ ...contextForm, shared_drive_url: e.target.value })} placeholder="https://drive.google.com/..." className="focus-brand" />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs">GTM Overview URL</Label>
                        <Input value={contextForm.gtm_sync_url} onChange={(e) => setContextForm({ ...contextForm, gtm_sync_url: e.target.value })} placeholder="https://..." className="focus-brand" />
                      </div>
                      {/* [2026-06-08] KOL Content Brief URL — 4th resource
                          link per the Post-Onboarding Campaign View spec
                          v2 (Phase 1 / Resources card). Stored on
                          client_context.kol_content_brief_url. Portal
                          renders it as the 4th card next to TG / Brand
                          Assets / GTM. */}
                      <div className="grid gap-1">
                        <Label className="text-xs">KOL Content Brief URL</Label>
                        <Input value={contextForm.kol_content_brief_url} onChange={(e) => setContextForm({ ...contextForm, kol_content_brief_url: e.target.value })} placeholder="https://docs.google.com/..." className="focus-brand" />
                      </div>
                    </div>
                  </div>
                  {/* [2026-06-08] Approved Domains was removed from this
                      popup — it now lives only in the Edit Client dialog,
                      which is the right home for clients-table identity
                      / access attributes. The Mindshare toggle stayed
                      because it's a true portal feature flag, but the
                      cream-50 "Portal Access & Features" wrapper was
                      collapsed since a single toggle in a decorated box
                      reads as visual filler. */}
                  <div className="flex items-center justify-between border-t border-cream-200 pt-3">
                    <div>
                      <p className="text-sm font-medium text-ink-warm-900">Korean Mindshare Tracker</p>
                      <p className="text-xs text-ink-warm-500">Show mindshare analytics on the client portal</p>
                    </div>
                    <Switch
                      checked={contextModalClient ? (clientMindshareEnabled[contextModalClient.id] ?? false) : false}
                      onCheckedChange={() => contextModalClient && toggleMindshare(contextModalClient.id)}
                    />
                  </div>
                </div>
                <DialogFooter className="border-t border-cream-100 pt-3 mt-0 shrink-0">
                  <Button variant="outline" onClick={() => setContextModalClient(null)}>Cancel</Button>
                  <Button variant="brand" onClick={handleContextSubmit}>Save Context</Button>
                </DialogFooter>
              </TabsContent>
              <TabsContent value="actionboard" className="flex-1 flex flex-col min-h-0 mt-0">
                {(() => {
                  const milestones = contextModalClient ? (clientMilestones[contextModalClient.id] || []) : [];
                  const allItems = contextModalClient ? (clientActionItems[contextModalClient.id] || []) : [];
                  const completedCount = milestones.filter(m => m.status === 'complete').length;

                  const renderActionItem = (item: ActionItem) => (
                    <div key={item.id} className={`p-2 rounded-lg ${item.is_hidden ? 'opacity-40' : ''} ${item.is_done ? 'bg-cream-50' : 'bg-white'} border`}>
                      {deletingActionItemId === item.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-ink-warm-700">Delete this item?</span>
                          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => deleteActionItem(item.id)}>Delete</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDeletingActionItemId(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <Checkbox checked={item.is_done} onCheckedChange={() => toggleActionItemDone(item)} />
                            <span className={`flex-1 text-sm ${item.is_done ? 'line-through text-ink-warm-400' : 'text-ink-warm-700'}`}>{item.text}</span>
                            {/* [HQ Tasks ↔ Action Board link, May 2026]
                                Linked HQ task count + click-through. Only
                                renders when at least one HQ task points at
                                this action item. Goes to the filtered HQ
                                Tasks view (?client=X&actionItem=Y) so the
                                admin can see exactly what internal work
                                covers this client-facing item. */}
                            {(actionItemTaskCounts[item.id] || 0) > 0 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/tasks?client=${item.client_id}&actionItem=${item.id}`);
                                }}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100 transition-colors"
                                title="View linked HQ tasks"
                              >
                                <ListTodo className="h-3 w-3" />
                                {actionItemTaskCounts[item.id]} HQ task{actionItemTaskCounts[item.id] === 1 ? '' : 's'}
                              </button>
                            )}
                            {/* Onboarding § 5 Action Board auto-derive — only
                                show for HH-side items with no task yet. The
                                propagate_task_to_milestone trigger flips the
                                action item + milestone when this task closes. */}
                            {item.court === 'ours' && !actionItemTaskCounts[item.id] && (
                              <button
                                type="button"
                                onClick={() => createTaskFromActionItem(item)}
                                className="inline-flex items-center gap-1 px-2 h-6 rounded-full text-[10px] font-medium border border-cream-200 text-ink-warm-500 hover:bg-brand-light hover:text-brand transition-colors whitespace-nowrap flex-shrink-0"
                                title="Create HQ task — completing it flips this item + rolls up the milestone"
                              >
                                <Plus className="h-3 w-3" />
                                Create HQ task
                              </button>
                            )}
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-cream-100" onClick={() => toggleActionItemHidden(item)}>
                              {item.is_hidden ? <EyeOff className="h-3.5 w-3.5 text-ink-warm-400" /> : <Eye className="h-3.5 w-3.5 text-ink-warm-400" />}
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-cream-100" onClick={() => {
                              setEditingActionItemId(item.id);
                              setActionItemForm({ text: item.text, court: item.court, attachment_url: item.attachment_url || '', attachment_label: item.attachment_label || '' });
                              setActiveMilestoneId(item.milestone_id);
                              setIsActionItemFormOpen(true);
                            }}>
                              <Pencil className="h-3.5 w-3.5 text-ink-warm-400" />
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-rose-50" onClick={() => setDeletingActionItemId(item.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                            </Button>
                          </div>
                          {item.attachment_url && (
                            <div className="ml-8 mt-1">
                              <a href={item.attachment_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand hover:underline">
                                <LinkIcon className="h-3 w-3" />
                                {item.attachment_label || 'View attachment'}
                              </a>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );

                  return (
                    <div className="flex-1 overflow-y-auto space-y-3 px-1 pb-2">
                      {/* Progress summary */}
                      <div className="flex items-center justify-between text-sm text-ink-warm-500 mb-1">
                        <span>{completedCount} of {milestones.length} milestones complete</span>
                        <div className="flex items-center gap-1.5">
                          {/* Apply template */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="outline" className="text-xs h-7">
                                <FileText className="h-3 w-3 mr-1" /> Templates
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              {milestoneTemplates.map(t => (
                                <DropdownMenuItem key={t.id} onClick={() => {
                                  if (contextModalClient) {
                                    applyTemplate(contextModalClient.id, t.milestones);
                                  }
                                }}>
                                  <span className="truncate">{t.name}</span>
                                  {t.is_default && <span className="ml-auto text-[10px] text-ink-warm-400">default</span>}
                                </DropdownMenuItem>
                              ))}
                              {milestoneTemplates.length > 0 && <DropdownMenuSeparator />}
                              <DropdownMenuItem onClick={() => setSaveTemplateOpen(true)}>
                                <Plus className="h-3.5 w-3.5 mr-2" /> Save current as template
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {/* [Templates admin v1] Link to the dedicated
                                  management page for full CRUD. Opens in
                                  a new tab so the Context popup stays open. */}
                              <DropdownMenuItem
                                onClick={() => window.open('/clients/templates', '_blank')}
                                className="text-ink-warm-500"
                              >
                                <Settings className="h-3.5 w-3.5 mr-2" /> Manage templates…
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setIsMilestoneFormOpen(true); setEditingMilestoneId(null); setMilestoneForm({ name: '', subtitle: '', status_message: '' }); }}>
                            <Plus className="h-3 w-3 mr-1" /> Add Milestone
                          </Button>
                        </div>
                      </div>

                      {/* Save as template form — brand-soft tile matches
                          the approved-domain chips and the rest of the v11
                          "active accent" pattern. Was bg-blue-50. */}
                      {saveTemplateOpen && (
                        <div className="rounded-[14px] border border-brand-light p-3 space-y-2 bg-brand-soft">
                          <p className="text-xs font-medium text-brand-deep">Save current milestones as a reusable template</p>
                          <Input value={saveTemplateName} onChange={(e) => setSaveTemplateName(e.target.value)} placeholder="Template name..." className="focus-brand bg-white" autoFocus />
                          <div className="flex items-center gap-2">
                            <Button variant="brand" size="sm" disabled={!saveTemplateName.trim()} onClick={async () => {
                              if (contextModalClient) {
                                const ok = await saveAsTemplate(contextModalClient.id, saveTemplateName.trim());
                                if (ok) {
                                  setSaveTemplateOpen(false);
                                  setSaveTemplateName('');
                                }
                              }
                            }}>Save</Button>
                            <Button size="sm" variant="outline" onClick={() => { setSaveTemplateOpen(false); setSaveTemplateName(''); }}>Cancel</Button>
                          </div>
                        </div>
                      )}

                      {/* Progress bar */}
                      {milestones.length > 0 && (
                        <div className="h-1.5 bg-cream-100 rounded-full overflow-hidden">
                          <div className="h-full bg-brand rounded-full transition-all duration-300" style={{ width: `${(completedCount / milestones.length) * 100}%` }} />
                        </div>
                      )}

                      {/* Milestone form — v11 chrome (rounded-[14px] +
                          cream hairline) to match the Card primitive
                          radius and the rest of the modal's surface
                          rhythm. */}
                      {isMilestoneFormOpen && (
                        <div className="rounded-[14px] border border-cream-200 p-3 space-y-2 bg-cream-50">
                          <Input value={milestoneForm.name} onChange={(e) => setMilestoneForm({ ...milestoneForm, name: e.target.value })} placeholder="Milestone name" className="focus-brand" autoFocus />
                          <Input value={milestoneForm.subtitle} onChange={(e) => setMilestoneForm({ ...milestoneForm, subtitle: e.target.value })} placeholder="Subtitle (optional)" className="focus-brand" />
                          <Input value={milestoneForm.status_message} onChange={(e) => setMilestoneForm({ ...milestoneForm, status_message: e.target.value })} placeholder="Status message for client (optional)" className="focus-brand" />
                          <div className="flex items-center gap-2">
                            <Button variant="brand" size="sm" onClick={handleMilestoneSubmit} disabled={!milestoneForm.name.trim()}>
                              {editingMilestoneId ? 'Save' : 'Add'}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setIsMilestoneFormOpen(false); setEditingMilestoneId(null); }}>Cancel</Button>
                          </div>
                        </div>
                      )}

                      {/* Milestone cards */}
                      {milestones.map((ms) => {
                        const msItems = allItems.filter(i => i.milestone_id === ms.id);
                        const yoursItems = msItems.filter(i => i.court === 'yours').sort((a, b) => a.display_order - b.display_order);
                        const oursItems = msItems.filter(i => i.court === 'ours').sort((a, b) => a.display_order - b.display_order);
                        const isExpanded = activeMilestoneId === ms.id;
                        const statusColor = ms.status === 'complete' ? 'border-emerald-200 bg-emerald-50/30' : ms.status === 'active' ? 'border-brand bg-brand/5' : 'border-cream-200 bg-cream-50/50';
                        const StatusIcon = ms.status === 'complete' ? CheckCircle : ms.status === 'active' ? Circle : Lock;
                        const statusIconColor = ms.status === 'complete' ? 'text-emerald-500' : ms.status === 'active' ? 'text-brand' : 'text-ink-warm-300';
                        const statusBadge: { label: string; tone: BadgeTone } = ms.status === 'complete'
                          ? { label: 'Complete', tone: 'success' }
                          : ms.status === 'active'
                            ? { label: 'Active', tone: 'brand' }
                            : { label: 'Upcoming', tone: 'neutral' };

                        return (
                          <div key={ms.id} className={`border rounded-lg overflow-hidden ${statusColor} ${!ms.is_visible ? 'opacity-50' : ''}`}>
                            {/* Milestone header */}
                            <div
                              className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                              onClick={() => setActiveMilestoneId(isExpanded ? null : ms.id)}
                            >
                              <StatusIcon className={`h-5 w-5 flex-shrink-0 ${statusIconColor}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className={`text-sm font-semibold ${ms.status === 'upcoming' ? 'text-ink-warm-400' : 'text-ink-warm-900'}`}>{ms.name}</p>
                                  {!ms.is_visible && <EyeOff className="h-3 w-3 text-ink-warm-400" />}
                                </div>
                                {ms.subtitle && <p className={`text-xs ${ms.status === 'upcoming' ? 'text-ink-warm-300' : 'text-ink-warm-500'}`}>{ms.subtitle}</p>}
                              </div>
                              <StatusBadge tone={statusBadge.tone} size="sm" bordered withDot={statusBadge.tone === 'danger' ? 'pulse' : true}>{statusBadge.label}</StatusBadge>
                              {isExpanded ? <ChevronUp className="h-4 w-4 text-ink-warm-400" /> : <ChevronDown className="h-4 w-4 text-ink-warm-400" />}
                            </div>

                            {/* Expanded content */}
                            {isExpanded && (
                              <div className="px-3 pb-3 space-y-3 border-t border-cream-100">
                                {/* Status controls */}
                                <div className="flex items-center gap-1.5 pt-2">
                                  <span className="text-[10px] text-ink-warm-500 mr-1">Status:</span>
                                  {(['complete', 'active', 'upcoming'] as const).map(s => (
                                    <Button
                                      key={s}
                                      size="sm"
                                      variant={ms.status === s ? 'brand' : 'outline'}
                                      className="h-6 text-[10px] px-2"
                                      onClick={() => setMilestoneStatus(ms.id, s)}
                                    >
                                      {s.charAt(0).toUpperCase() + s.slice(1)}
                                    </Button>
                                  ))}
                                  <div className="ml-auto flex gap-1">
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title={ms.is_visible ? 'Hide from portal' : 'Show on portal'} onClick={() => toggleMilestoneVisibility(ms.id, ms.is_visible)}>
                                      {ms.is_visible ? <Eye className="h-3 w-3 text-ink-warm-400" /> : <EyeOff className="h-3 w-3 text-ink-warm-400" />}
                                    </Button>
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => {
                                      setEditingMilestoneId(ms.id);
                                      setMilestoneForm({ name: ms.name, subtitle: ms.subtitle || '', status_message: ms.status_message || '' });
                                      setIsMilestoneFormOpen(true);
                                    }}>
                                      <Pencil className="h-3 w-3 text-ink-warm-400" />
                                    </Button>
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-rose-50" onClick={() => deleteMilestone(ms.id)}>
                                      <Trash2 className="h-3 w-3 text-rose-400" />
                                    </Button>
                                  </div>
                                </div>

                                {/* Status message */}
                                {ms.status_message && (
                                  <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                                    <p className="text-xs text-amber-800">{ms.status_message}</p>
                                  </div>
                                )}

                                {/* Action items by court */}
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <p className="text-[10px] font-semibold text-brand uppercase tracking-wider mb-1.5">Holo Hive</p>
                                    <div className="space-y-1">{oursItems.map(renderActionItem)}</div>
                                    {oursItems.length === 0 && <p className="text-xs text-ink-warm-400 py-1">No items</p>}
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-semibold text-orange-600 uppercase tracking-wider mb-1.5">Your Tasks</p>
                                    <div className="space-y-1">{yoursItems.map(renderActionItem)}</div>
                                    {yoursItems.length === 0 && <p className="text-xs text-ink-warm-400 py-1">No items</p>}
                                  </div>
                                </div>

                                {/* Add Item */}
                                {isActionItemFormOpen && activeMilestoneId === ms.id ? (
                                  <div className="border rounded-lg p-3 space-y-2 bg-white">
                                    <Input value={actionItemForm.text} onChange={(e) => setActionItemForm({ ...actionItemForm, text: e.target.value })} placeholder="Action item text" className="focus-brand" autoFocus />
                                    <div className="grid grid-cols-2 gap-2">
                                      <Input value={actionItemForm.attachment_url} onChange={(e) => setActionItemForm({ ...actionItemForm, attachment_url: e.target.value })} placeholder="Link URL (optional)" className="focus-brand" />
                                      <Input value={actionItemForm.attachment_label} onChange={(e) => setActionItemForm({ ...actionItemForm, attachment_label: e.target.value })} placeholder="Link label (optional)" className="focus-brand" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Select value={actionItemForm.court} onValueChange={(v: 'yours' | 'ours') => setActionItemForm({ ...actionItemForm, court: v })}>
                                        <SelectTrigger className="focus-brand w-[160px]"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="yours">Your Tasks</SelectItem>
                                          <SelectItem value="ours">Holo Hive</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Button variant="brand" size="sm" onClick={handleActionItemSubmit} disabled={!actionItemForm.text.trim()}>
                                        {editingActionItemId ? 'Save' : 'Add'}
                                      </Button>
                                      <Button size="sm" variant="outline" onClick={() => { setIsActionItemFormOpen(false); setEditingActionItemId(null); setActionItemForm({ text: '', court: 'yours', attachment_url: '', attachment_label: '' }); }}>Cancel</Button>
                                    </div>
                                  </div>
                                ) : (
                                  <Button size="sm" variant="outline" className="text-xs" onClick={() => { setActiveMilestoneId(ms.id); setIsActionItemFormOpen(true); setEditingActionItemId(null); setActionItemForm({ text: '', court: 'yours', attachment_url: '', attachment_label: '' }); }}>
                                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {milestones.length === 0 && !isMilestoneFormOpen && (
                        <p className="text-sm text-ink-warm-400 text-center py-4">No milestones yet. They will be auto-created when you first open this tab.</p>
                      )}
                    </div>
                  );
                })()}
              </TabsContent>
              {/* ─── Weekly Update (v2) Tab ──────────────────────────
                  Phase 2 of the Post-Onboarding Campaign View spec.
                  Three sequential sections:
                    1. Strategic Direction (Jdot's notes — internal)
                    2. Zone A: Execution Plan (internal, batch-creates
                       HQ tasks on submit, locks after submit)
                    3. Zone B: This Week Feed (client-facing, drives
                       portal "This Week" card with pending/done dots)
                  Zone C (Top Post override) currently shows the
                  auto-selected post read-only — the picker UI to
                  override is queued for a follow-up. */}
              <TabsContent value="weekly-update" className="flex-1 flex flex-col min-h-0 mt-0">
                <div className="space-y-4 flex-1 overflow-y-auto px-1 pb-4">
                  {/* Week selector + save status */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-ink-warm-500 uppercase tracking-wider">Week of</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="focus-brand font-normal h-8">
                            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                            {formatDate(weeklyV2Week)}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
                          <Calendar
                            mode="single"
                            selected={weeklyV2Week}
                            onSelect={(date) => {
                              if (!date) return;
                              const monday = getMondayOf(date);
                              setWeeklyV2Week(monday);
                              if (contextModalClient) loadWeeklyV2Row(contextModalClient.id, monday);
                            }}
                            classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                            modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                          />
                        </PopoverContent>
                      </Popover>
                      {/* Quick-jump buttons for the most common cases —
                          Andy mentioned "current week is 95% of opens." */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-ink-warm-500 hover:text-brand"
                        onClick={() => {
                          const monday = getMondayOf(new Date());
                          setWeeklyV2Week(monday);
                          if (contextModalClient) loadWeeklyV2Row(contextModalClient.id, monday);
                        }}
                      >
                        This week
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                      {/* Save-status pill — flashes briefly after each
                          autosave so the user knows their change landed. */}
                      {weeklyV2SaveStatus === 'saving' && (
                        <span className="text-xs text-ink-warm-500">Saving…</span>
                      )}
                      {weeklyV2SaveStatus === 'saved' && (
                        <span className="text-xs text-emerald-600">Saved</span>
                      )}
                      {weeklyV2SaveStatus === 'error' && (
                        <span className="text-xs text-rose-600">Save failed</span>
                      )}
                      {/* [2026-06-11] Q5 audit-log viewer. Same pattern as
                          Lineup Manager's AuditLogButton — popover anchored
                          to the action row, lazy-fetches on open. Hidden
                          when the weekly update row doesn't exist yet
                          (nothing to audit until first save). */}
                      {weeklyV2Row?.id && (
                        <Popover
                          open={weeklyAuditOpen}
                          onOpenChange={(open) => {
                            setWeeklyAuditOpen(open);
                            if (open && weeklyV2Row?.id) {
                              fetchWeeklyAuditLog(weeklyV2Row.id);
                            }
                          }}
                        >
                          <PopoverTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 focus-brand" title="View edit history">
                              <History className="h-3.5 w-3.5 mr-1" />
                              History
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[420px] p-0 z-[80]" align="end">
                            <div className="p-3 border-b border-cream-100">
                              <p className="text-sm font-semibold text-ink-warm-900">Edit history</p>
                              <p className="text-[11px] text-ink-warm-500">Reverse chronological. Latest 100 edits.</p>
                            </div>
                            <div className="max-h-[400px] overflow-y-auto">
                              {weeklyAuditLoading ? (
                                <div className="p-4 space-y-2">
                                  {Array.from({ length: 3 }).map((_, i) => (
                                    <Skeleton key={i} className="h-10 rounded" />
                                  ))}
                                </div>
                              ) : weeklyAuditRows.length === 0 ? (
                                <p className="p-6 text-center text-xs text-ink-warm-500 italic">
                                  No edits logged yet.
                                </p>
                              ) : (
                                <ul className="divide-y divide-cream-100">
                                  {weeklyAuditRows.map(r => (
                                    <li key={r.id} className="px-3 py-2">
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <StatusBadge tone={weeklyAuditKindTone(r.edit_kind)} size="sm">
                                            {weeklyAuditKindLabel(r.edit_kind)}
                                          </StatusBadge>
                                          <span className="text-xs text-ink-warm-700 truncate">
                                            {r.edited_by_name || 'Unknown'}
                                          </span>
                                        </div>
                                        <span className="text-[10px] text-ink-warm-500 tabular-nums shrink-0">
                                          {formatDateTime(new Date(r.edited_at))}
                                        </span>
                                      </div>
                                      <p className="text-[11px] text-ink-warm-500 mt-0.5">
                                        {summarizeWeeklyAudit(r)}
                                      </p>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  </div>

                  {weeklyV2Loading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-24 rounded-lg" />
                      <Skeleton className="h-40 rounded-lg" />
                      <Skeleton className="h-32 rounded-lg" />
                    </div>
                  ) : (
                    <>
                      {/* ─── Section 1: Strategic Direction ─────────
                          Amber background per spec — "distinct
                          background (light amber/yellow)". Auto-saves
                          on blur. Last-touched metadata shows below
                          so Bolt knows when Jdot last edited it. */}
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold text-amber-900 uppercase tracking-wider">Strategic Direction</p>
                            <p className="text-xs text-amber-700/80">Internal only · Jdot's guidance for this week</p>
                          </div>
                          {weeklyV2Row?.strategic_notes_updated_at && (
                            <span className="text-[10px] text-amber-700/70 font-mono">
                              edited {formatDateTime(new Date(weeklyV2Row.strategic_notes_updated_at))}
                            </span>
                          )}
                        </div>
                        <Textarea
                          value={weeklyV2StrategicNotes}
                          onChange={(e) => setWeeklyV2StrategicNotes(e.target.value)}
                          onBlur={() => {
                            if (!contextModalClient) return;
                            // Skip the save if nothing changed — avoids
                            // pointless writes when the user just
                            // tabs through.
                            if ((weeklyV2Row?.strategic_notes || '') === weeklyV2StrategicNotes) return;
                            saveWeeklyV2(contextModalClient.id, weeklyV2Week, { strategic_notes: weeklyV2StrategicNotes });
                          }}
                          placeholder={"Strategic guidance for the week. e.g.\n• Read EWL gc for this week's activation context\n• Biweekly campaign report with the same format"}
                          className="focus-brand bg-white border-amber-200 min-h-[80px]"
                          rows={4}
                        />
                        {/* Previous-weeks history — disclose-to-view so
                            the current-week form isn't cluttered. Lazy
                            fetches on first open. Read-only quotes of
                            the last ~8 weeks of Jdot's notes; clicking
                            "Open" jumps the week picker to that week. */}
                        <button
                          type="button"
                          onClick={() => {
                            const next = !strategicHistoryOpen;
                            setStrategicHistoryOpen(next);
                            if (next && contextModalClient && strategicHistoryRows.length === 0) {
                              fetchStrategicHistory(contextModalClient.id);
                            }
                          }}
                          className="text-[11px] text-amber-800/80 hover:text-amber-900 underline-offset-2 hover:underline mt-1 inline-flex items-center gap-1"
                        >
                          <ChevronDown className={`h-3 w-3 transition-transform ${strategicHistoryOpen ? 'rotate-180' : ''}`} />
                          {strategicHistoryOpen ? 'Hide previous notes' : 'View previous notes'}
                        </button>
                        {strategicHistoryOpen && (
                          <div className="space-y-2 pt-2 border-t border-amber-200">
                            {strategicHistoryLoading ? (
                              <div className="space-y-2">
                                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
                              </div>
                            ) : strategicHistoryRows.length === 0 ? (
                              <p className="text-[11px] text-amber-800/70 italic">No prior strategic notes for this client yet.</p>
                            ) : (
                              strategicHistoryRows.map(row => (
                                <div key={row.id} className="bg-white border border-amber-200 rounded-md p-2">
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-900">
                                      Week of {formatDate(new Date(row.week_of + 'T00:00:00'))}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const wk = new Date(row.week_of + 'T00:00:00');
                                        setWeeklyV2Week(wk);
                                        if (contextModalClient) loadWeeklyV2Row(contextModalClient.id, wk);
                                        setStrategicHistoryOpen(false);
                                      }}
                                      className="text-[10px] text-brand hover:text-brand-dark"
                                    >
                                      Open
                                    </button>
                                  </div>
                                  <p className="text-[11px] text-ink-warm-700 whitespace-pre-wrap line-clamp-4">{row.strategic_notes}</p>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>

                      {/* ─── Section 2: Zone A — Execution Plan ─────
                          Yellow background per spec. Structured rows
                          (description + assignee + due date +
                          deliverable type). On submit, each row
                          becomes an HQ task. Locked after submit (rows
                          render read-only). */}
                      {(() => {
                        const isLocked = !!weeklyV2Row?.execution_plan_submitted_at;
                        // Approved team members for assignee dropdown
                        // (excludes clients + inactive users — same
                        // gate as elsewhere in the page).
                        const teamMembers = allUsers.filter((u: any) => u.role !== 'client' && u.is_active !== false);
                        return (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs font-semibold text-yellow-900 uppercase tracking-wider">Zone A · Execution Plan</p>
                                <p className="text-xs text-yellow-800/80">
                                  Internal only · Each row creates an HQ task on submit
                                </p>
                              </div>
                              {isLocked && (
                                <StatusBadge tone="success" size="sm" bordered withDot>Submitted</StatusBadge>
                              )}
                            </div>

                            {weeklyV2ExecPlan.length === 0 && !isLocked && (
                              <p className="text-xs text-yellow-800/70 italic">No tasks yet. Add a row to start.</p>
                            )}

                            <div className="space-y-2">
                              {weeklyV2ExecPlan.map((row, idx) => (
                                <div key={row.id} className="grid grid-cols-12 gap-2 items-start bg-white border border-yellow-200 rounded-md p-2">
                                  {/* Type column hidden per Andy 2026-06-19 —
                                      deliverable_type stays null on new rows
                                      and is no longer surfaced in Zone A. */}
                                  <Input
                                    value={row.description}
                                    onChange={(e) => {
                                      const next = [...weeklyV2ExecPlan];
                                      next[idx] = { ...row, description: e.target.value };
                                      setWeeklyV2ExecPlan(next);
                                    }}
                                    onBlur={() => contextModalClient && saveWeeklyV2(contextModalClient.id, weeklyV2Week, { execution_plan: weeklyV2ExecPlan })}
                                    placeholder="Task description"
                                    className="focus-brand col-span-6 h-8"
                                    disabled={isLocked}
                                  />
                                  <Select
                                    value={row.assignee_id || ''}
                                    onValueChange={(v) => {
                                      const next = [...weeklyV2ExecPlan];
                                      next[idx] = { ...row, assignee_id: v || null };
                                      setWeeklyV2ExecPlan(next);
                                      if (contextModalClient) saveWeeklyV2(contextModalClient.id, weeklyV2Week, { execution_plan: next });
                                    }}
                                    disabled={isLocked}
                                  >
                                    <SelectTrigger className="focus-brand col-span-3 h-8 text-xs">
                                      <SelectValue placeholder="Assignee" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {teamMembers.map((u: any) => (
                                        <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button variant="outline" size="sm" className="focus-brand col-span-2 h-8 px-2 font-normal text-xs justify-start" disabled={isLocked}>
                                        <CalendarIcon className="mr-1 h-3 w-3" />
                                        {row.due_date
                                          ? formatDate(new Date(row.due_date + 'T00:00:00'))
                                          : 'Due'}
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
                                      <Calendar
                                        mode="single"
                                        selected={row.due_date ? new Date(row.due_date + 'T00:00:00') : undefined}
                                        onSelect={(date) => {
                                          const next = [...weeklyV2ExecPlan];
                                          next[idx] = { ...row, due_date: date ? formatLocalYMD(date) : null };
                                          setWeeklyV2ExecPlan(next);
                                          if (contextModalClient) saveWeeklyV2(contextModalClient.id, weeklyV2Week, { execution_plan: next });
                                        }}
                                        classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                                        modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                                      />
                                    </PopoverContent>
                                  </Popover>
                                  {!isLocked && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="col-span-1 h-8 w-8 p-0 text-ink-warm-400 hover:text-rose-600"
                                      onClick={() => {
                                        const next = weeklyV2ExecPlan.filter(r => r.id !== row.id);
                                        setWeeklyV2ExecPlan(next);
                                        if (contextModalClient) saveWeeklyV2(contextModalClient.id, weeklyV2Week, { execution_plan: next });
                                      }}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </div>

                            {!isLocked && (
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs h-8 border-yellow-300 text-yellow-900 hover:bg-yellow-100"
                                  onClick={() => {
                                    setWeeklyV2ExecPlan([
                                      ...weeklyV2ExecPlan,
                                      { id: localId(), description: '', assignee_id: null, due_date: null, deliverable_type: null },
                                    ]);
                                  }}
                                >
                                  <Plus className="h-3.5 w-3.5 mr-1" /> Add task
                                </Button>
                                <Button
                                  size="sm"
                                  variant="brand"
                                  className="text-xs h-8"
                                  onClick={() => contextModalClient && submitExecutionPlan(contextModalClient.id)}
                                  disabled={weeklyV2ExecPlan.length === 0}
                                >
                                  Submit & create HQ tasks
                                </Button>
                              </div>
                            )}

                            {isLocked && weeklyV2Row?.execution_plan_submitted_at && (
                              <p className="text-[11px] text-yellow-800/80 italic">
                                Locked · {formatDateTime(new Date(weeklyV2Row.execution_plan_submitted_at))}. Add new tasks via HQ.
                              </p>
                            )}
                          </div>
                        );
                      })()}

                      {/* ─── Section 3: Zone B — This Week Feed ─────
                          Green per spec. Client-facing items that the
                          portal renders. Status toggle (pending/done)
                          updates the portal in real-time. */}
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
                        <div>
                          <p className="text-xs font-semibold text-emerald-900 uppercase tracking-wider">Zone B · This Week (client-facing)</p>
                          <p className="text-xs text-emerald-800/80">
                            Drives the portal's "This Week" card · Toggle status as work completes
                          </p>
                        </div>

                        {weeklyV2ThisWeekFeed.length === 0 && (
                          <p className="text-xs text-emerald-800/70 italic">No items yet. Add 3–5 client-friendly bullets.</p>
                        )}

                        <div className="space-y-2">
                          {weeklyV2ThisWeekFeed.map((item, idx) => (
                            <div key={item.id} className="grid grid-cols-12 gap-2 items-center bg-white border border-emerald-200 rounded-md p-2">
                              {/* Status dot + click-to-toggle */}
                              <button
                                type="button"
                                className="col-span-1 flex items-center justify-center h-7"
                                onClick={() => contextModalClient && toggleThisWeekItemStatus(contextModalClient.id, item.id)}
                                title={item.status === 'done' ? 'Mark pending' : 'Mark done'}
                              >
                                <span className={`h-2.5 w-2.5 rounded-full ${item.status === 'done' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                              </button>
                              <Input
                                value={item.text}
                                onChange={(e) => {
                                  const next = [...weeklyV2ThisWeekFeed];
                                  next[idx] = { ...item, text: e.target.value };
                                  setWeeklyV2ThisWeekFeed(next);
                                }}
                                onBlur={() => contextModalClient && saveWeeklyV2(contextModalClient.id, weeklyV2Week, { this_week_feed: weeklyV2ThisWeekFeed })}
                                placeholder="Client-friendly item (e.g. Content Brief 2 shipping to creators)"
                                className="focus-brand col-span-8 h-8 text-sm"
                              />
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="outline" size="sm" className="focus-brand col-span-2 h-8 px-2 font-normal text-xs justify-start">
                                    <CalendarIcon className="mr-1 h-3 w-3" />
                                    {item.date
                                      ? formatDate(new Date(item.date + 'T00:00:00'))
                                      : 'Date'}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={item.date ? new Date(item.date + 'T00:00:00') : undefined}
                                    onSelect={(date) => {
                                      const next = [...weeklyV2ThisWeekFeed];
                                      next[idx] = { ...item, date: date ? formatLocalYMD(date) : null };
                                      setWeeklyV2ThisWeekFeed(next);
                                      if (contextModalClient) saveWeeklyV2(contextModalClient.id, weeklyV2Week, { this_week_feed: next });
                                    }}
                                    classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                                    modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                                  />
                                </PopoverContent>
                              </Popover>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="col-span-1 h-8 w-8 p-0 text-ink-warm-400 hover:text-rose-600"
                                onClick={() => {
                                  const next = weeklyV2ThisWeekFeed.filter(it => it.id !== item.id);
                                  setWeeklyV2ThisWeekFeed(next);
                                  if (contextModalClient) saveWeeklyV2(contextModalClient.id, weeklyV2Week, { this_week_feed: next });
                                }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-8 border-emerald-300 text-emerald-900 hover:bg-emerald-100"
                          onClick={() => {
                            const today = formatLocalYMD(new Date());
                            setWeeklyV2ThisWeekFeed([
                              ...weeklyV2ThisWeekFeed,
                              { id: localId(), text: '', date: today, status: 'pending' },
                            ]);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add item
                        </Button>
                      </div>

                      {/* ─── Section 4: Zone C — Top Post Review ────
                          Per Andy 2026-06-19: render the top-3 candidate
                          posts inline (was a separate Dialog popup before)
                          so the CM can scan engagement + pin without a
                          context switch. Each row is click-to-pin /
                          click-again-to-unpin; the portal still reads a
                          single content_id off top_post_override so the
                          pinned row wins. "Show more" expands to ~30
                          candidates for the edge case where the auto top-3
                          aren't representative. */}
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div>
                            <p className="text-xs font-semibold text-emerald-900 uppercase tracking-wider">Zone C · Top Post (client-facing)</p>
                            <p className="text-xs text-emerald-800/80">
                              {weeklyV2Row?.top_post_override
                                ? 'Pinned post overrides the auto-pick on the portal. Click again to unpin.'
                                : 'Top 3 by engagement. Click any row to pin it as this week’s feature.'}
                            </p>
                          </div>
                          {topPostShowAll && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs h-8 text-emerald-900 hover:bg-emerald-100"
                              onClick={() => setTopPostShowAll(false)}
                            >
                              Show top 3
                            </Button>
                          )}
                        </div>

                        {topPostCandidatesLoading ? (
                          <div className="space-y-2">
                            {Array.from({ length: 3 }).map((_, i) => (
                              <Skeleton key={i} className="h-16 w-full rounded-md" />
                            ))}
                          </div>
                        ) : topPostCandidates.length === 0 ? (
                          <div className="bg-white border border-emerald-200 rounded-md p-4 text-center text-xs text-emerald-800/70">
                            No posted content yet this week for this client.
                          </div>
                        ) : (() => {
                          // Pinned row floats to the top regardless of
                          // engagement rank, so the CM sees their override
                          // even if it sits at position 14 by raw engagement.
                          const pinnedId = weeklyV2Row?.top_post_override?.content_id || null;
                          const baseSlice = topPostShowAll
                            ? topPostCandidates
                            : topPostCandidates.slice(0, 3);
                          const pinnedRow = pinnedId
                            ? topPostCandidates.find(c => c.id === pinnedId)
                            : null;
                          const rows = pinnedRow && !baseSlice.some(c => c.id === pinnedId)
                            ? [pinnedRow, ...baseSlice]
                            : baseSlice;
                          return (
                            <div className="space-y-2">
                              {rows.map((c, idx) => {
                                const isPinned = pinnedId === c.id;
                                return (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => contextModalClient && pinTopPost(contextModalClient.id, c.id)}
                                    className={`w-full text-left p-3 rounded-md border transition-colors ${
                                      isPinned
                                        ? 'bg-amber-50 border-amber-300'
                                        : 'bg-white border-emerald-200 hover:bg-emerald-50'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                          <span className="text-xs font-semibold text-ink-warm-900">{c.kol_name}</span>
                                          {c.platform && (
                                            <span className="text-[10px] uppercase tracking-wider text-ink-warm-500">{c.platform}</span>
                                          )}
                                          {idx === 0 && !isPinned && !pinnedId && (
                                            <StatusBadge tone="brand" size="sm" bordered>Auto-pick</StatusBadge>
                                          )}
                                          {isPinned && (
                                            <StatusBadge tone="warning" size="sm" bordered withDot>Pinned</StatusBadge>
                                          )}
                                        </div>
                                        {c.notes && (
                                          <p className="text-xs text-ink-warm-700 line-clamp-2 italic">{c.notes}</p>
                                        )}
                                        <div className="flex items-center gap-3 mt-1 text-[11px] text-ink-warm-500 font-mono">
                                          <span>{c.impressions.toLocaleString()} views</span>
                                          <span>{c.likes.toLocaleString()} likes</span>
                                          <span>{c.retweets.toLocaleString()} RT</span>
                                          <span>{c.comments.toLocaleString()} cmt</span>
                                        </div>
                                      </div>
                                      {c.content_link && (
                                        <a
                                          href={c.content_link}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          className="text-xs text-brand hover:text-brand-dark shrink-0"
                                          title="Open post"
                                        >
                                          <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                              {!topPostShowAll && topPostCandidates.length > 3 && (
                                <button
                                  type="button"
                                  onClick={() => setTopPostShowAll(true)}
                                  className="w-full text-xs text-emerald-900 hover:bg-emerald-100 rounded-md py-1.5 transition-colors"
                                >
                                  Show {Math.min(topPostCandidates.length - 3, 27)} more candidates
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </>
                  )}
                </div>
              </TabsContent>

              {/* [2026-06-15] Call Notes — HHP Team Dashboard Spec § 4.3.
                  Notes live on client_context.call_notes JSONB so the
                  dashboard reads from the same source. CallNotesTab
                  handles its own state + persistence; we just give it
                  the client_id + current user. */}
              <TabsContent value="call-notes" className="flex-1 flex flex-col min-h-0 mt-0">
                <div className="flex-1 overflow-y-auto px-1 pb-4">
                  {contextModalClient && (
                    <CallNotesTab
                      clientId={contextModalClient.id}
                      currentUserId={user?.id ?? null}
                    />
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>

      </div>
    </ProtectedRoute>
  );
} 
