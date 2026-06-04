'use client';

/**
 * SalesPipelineContext
 *
 * Shared data + actions for the sales-pipeline page
 * (`app/crm/sales-pipeline/page.tsx`) and the child components being
 * broken out of it under `components/crm/sales-pipeline/*`.
 *
 * 2026-06-02 — Introduced as Phase 1 of the structural refactor that's
 * lowering the page from ~9,000 lines toward <1,000. Same pattern as
 * `contexts/CampaignDetailContext.tsx` (which dropped
 * `app/campaigns/[id]/page.tsx` from 13,125 → 2,648).
 *
 * **Growth strategy**: the interface starts conservative and **grows
 * field-by-field as each component is extracted**. Don't enumerate
 * every piece of page state upfront — only what the extracted
 * components actually consume. The page itself remains the single
 * source of truth via `useState`; this provider just re-exposes that
 * state + the fetchers + the toast hook so the children don't need a
 * 50-prop interface each.
 *
 * Convention (mirrors CampaignDetailContext):
 *   - Anything the **page itself** is the source of truth for (form
 *     state, view-mode toggles, transient editing-cell focus) stays
 *     in the page and is NOT in the context.
 *   - Only state genuinely shared across the page + a child component
 *     belongs here.
 *
 * Adding a field: bump the interface, plumb it through the provider
 * value in `page.tsx`, then read it via `useSalesPipeline()` in the
 * child. TS will flag every missed wiring.
 */

import { createContext, useContext } from 'react';
import type { SalesPipelineOpportunity, SalesPipelineStage } from '@/lib/salesPipelineService';
import type { ForecastByPeriod, ForecastKpis, ActionPriority } from '@/lib/salesPipelineHelpers';

// ───────────────────────────────────────────────────────────────────
// Actions tab — the suggestion the `getNextAction` engine produces
// for each opportunity. Drives the per-row label, hint, urgency tint,
// and the "Set outcome" dropdown's primary + alternative options.
// ───────────────────────────────────────────────────────────────────
type ActionExecutionType = 'bump' | 'stage_change' | 'open_detail' | 'none';
type ActionAlternative = {
  label: string;
  actionType: ActionExecutionType;
  targetStage?: SalesPipelineStage;
  variant: 'default' | 'warn' | 'danger';
  quick?: boolean;
};
export type ActionDescriptor = {
  label: string;
  hint: string;
  priority: ActionPriority;
  actionType: ActionExecutionType;
  targetStage?: SalesPipelineStage;
  isActionable: boolean;
  sortScore: number;
  alternatives: ActionAlternative[];
};

// ───────────────────────────────────────────────────────────────────
// Alert cards filter — clicking one of the 5 attention-card tiles
// (Booking Needed / Overdue / Stale / At Risk / Meetings) sets this
// filter so the Overall-tab action list narrows to that subset.
// 'none' = no card active.
// ───────────────────────────────────────────────────────────────────
export type AlertCardFilter = 'none' | 'booking_needed' | 'overdue' | 'stale' | 'at_risk' | 'meetings';

/** Computed alert counts driving the 5 attention cards + Overall-tab
 *  action-list filtering. Always computed from ALL opportunities
 *  (unfiltered) so the header counts don't shift when tab filters
 *  change. See the `alertMetrics` useMemo in `page.tsx`. */
export type AlertMetrics = {
  bamfamViolations: number;
  overdueFollowups: number;
  staleDeals: number;
  dealsAtRisk: number;
  meetingsThisWeek: number;
  meetingsToday: number;
};

// ───────────────────────────────────────────────────────────────────
// SalesFunnelData / SalesFunnelWindow types removed 2026-06-03 with
// the Activity sub-view of the Today's Attention card. If the
// /api/analytics/sales-funnel endpoint is wanted again, recreate the
// type here and re-add the fetch to page.tsx.

/** Toast caller — kept loose to match the project's `useToast` hook. */
type ToastFn = (opts: {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
  duration?: number;
}) => void;

interface SalesPipelineContextType {
  // ─── Read-only data ────────────────────────────────────────────
  /** Full opportunity roster — single source of truth for kanban,
   *  table, metrics, alerts. Page owns the underlying useState; this
   *  is the read pointer for child components. */
  opportunities: SalesPipelineOpportunity[];

  // ─── Forecast view (collapsible "Forecast & Metrics" section) ──
  /** Post-proposal opportunities — the pool the forecast view shows. */
  forecastOpps: SalesPipelineOpportunity[];
  /** Bucketed by expected-close window (thisWeek / nextWeek /
   *  thisMonth / nextMonth / later / noDate). Pre-sorted within each
   *  bucket by oldest-proposal-first. */
  forecastByPeriod: ForecastByPeriod;
  /** KPI strip values shown above the period buckets. */
  forecastKpis: ForecastKpis;
  /** Team roster — used to render the "owner" footer on each forecast
   *  card. Same list as `activeUsers` minus the inactive filter (the
   *  forecast cards show historical-owner names even when that user
   *  is no longer active, so they don't render as "Unassigned"). */
  users: { id: string; name: string | null; email: string; is_active?: boolean | null }[];
  /** Open the activity slide-over for a given opp. Page-owned because
   *  the slide-over itself still lives at the page level. */
  openSlideOver: (opp: SalesPipelineOpportunity, guidance?: { label: string; hint: string }) => void;
  /** Open the create/edit opp dialog for a given opp. Page-owned. */
  openEditDialog: (opp: SalesPipelineOpportunity) => void;
  /** Move an opportunity to a new stage — invokes any prompts (orbit
   *  reason, closed-lost reason, closed-won client link, TG handle,
   *  bucket) the stage requires. Page-owned. */
  handleStageChange: (oppId: string, newStage: SalesPipelineStage, currentStage: string) => Promise<void>;
  // `renderProjectNameSuffix` removed 2026-06-03 — extracted to its
  // own component at components/crm/sales-pipeline/ProjectNameSuffix.tsx
  // so consumers import it directly instead of routing through context.

  // ─── Metrics view (the "Metrics" sub-tab next to Forecast) ─────
  /** Currently-selected user for the per-user scorecard. Empty
   *  string means "fall back to the logged-in user's id". */
  metricsUserId: string;
  setMetricsUserId: React.Dispatch<React.SetStateAction<string>>;
  /** Rolling window for the metrics view — 7 / 30 / 90 days. */
  metricsRangeDays: 7 | 30 | 90;
  setMetricsRangeDays: React.Dispatch<React.SetStateAction<7 | 30 | 90>>;
  /** Whether the underlying bookings fetch is in flight. Drives the
   *  small inline spinner next to the range selector. */
  metricsBookingsLoading: boolean;
  /** Active-only roster — same as `users` minus `is_active === false`
   *  rows. Used to populate the user-picker so test/deactivated
   *  accounts don't appear. */
  activeUsers: { id: string; name: string | null; email: string; is_active?: boolean | null }[];
  /** Per-user outreach metric computation. Pure-ish (depends on
   *  `metricsBookings` + `metricsActivities` already loaded on the
   *  page) — see `computeOutreachMetrics` callback in `page.tsx`. */
  computeOutreachMetrics: (userId: string, days: number) => {
    touch1s: number;
    replies: number;
    replyRate: number;
    qualified: number;
    qualificationRate: number;
    callsBooked: number;
    callsHeld: number;
    callsPending: number;
    noShows: number;
    showRate: number;
  };

  // ─── Activity Slide-Over (the right-side drawer for one opp) ──
  /** Setter for `slideOverOpp`. Page-owned but exposed so the
   *  slide-over's Close button can fire it. */
  setSlideOverOpp: React.Dispatch<React.SetStateAction<SalesPipelineOpportunity | null>>;
  /** Setter for slide-over view/edit mode. */
  setSlideOverMode: React.Dispatch<React.SetStateAction<'view' | 'edit'>>;
  /** Optional guidance shown above the slide-over body when an action
   *  button outside the slide-over opens it with a hint (e.g. "Why is
   *  this at-risk?"). Cleared on close. */
  actionGuidance: { label: string; hint: string } | null;
  setActionGuidance: React.Dispatch<React.SetStateAction<{ label: string; hint: string } | null>>;
  /** "Book-A-Meeting / Follow-up After Meeting" violation check — an
   *  opp is BAMFAM-violating when it's past a stage gate (warm+) but
   *  has no `next_meeting_at` set. Drives the badge + alert card. */
  isBAMFAM: (opp: SalesPipelineOpportunity) => boolean;
  /** Optimistic local patch helper — synchronously applies a partial
   *  update to the local opportunities array. The server write is the
   *  caller's responsibility (typically a `SalesPipelineService.update`
   *  immediately after). The page's implementation is wrapped in
   *  `useCallback` for stable identity, hence `void` not `Promise<void>`. */
  applyOppPatch: (oppId: string, patch: Partial<SalesPipelineOpportunity>) => void;
  /** Trigger the Stage History dialog for the current slide-over opp.
   *  Internally loads `crm_stage_history` for `slideOverOpp.id`. */
  openStageHistory: () => Promise<void>;

  // ─── Activity Timeline (inside the slide-over) ────────────────
  /** Timeline entries for the slide-over opp — merged manual
   *  activities + auto-stamped stage transitions + meeting events +
   *  Telegram messages. See the `TimelineEntry` type for shape. */
  activities: import('@/lib/salesPipelineService').TimelineEntry[];
  /** Setter exposed so the slide-over can optimistically prepend
   *  newly-added activities while the fetch is in flight. */
  setActivities: React.Dispatch<React.SetStateAction<import('@/lib/salesPipelineService').TimelineEntry[]>>;
  /** Working form state for "Add Activity" inside the slide-over.
   *  Different from `activityLogForm` (used by ActivityLogDialog) —
   *  this one is the inline-add row at the top of the timeline. */
  activityForm: import('@/lib/salesPipelineService').CreateActivityData;
  setActivityForm: React.Dispatch<React.SetStateAction<import('@/lib/salesPipelineService').CreateActivityData>>;
  activityMeetingDate: string | undefined;
  setActivityMeetingDate: React.Dispatch<React.SetStateAction<string | undefined>>;
  activityMeetingTime: string | undefined;
  setActivityMeetingTime: React.Dispatch<React.SetStateAction<string | undefined>>;
  isActivitySubmitting: boolean;
  /** File-upload state for activity attachments. The ref is exposed
   *  so the "Add file" button can trigger `<input>` click. */
  activityFile: File | null;
  setActivityFile: React.Dispatch<React.SetStateAction<File | null>>;
  activityFileRef: React.RefObject<HTMLInputElement>;
  /** Submit handler — writes the activity, advances milestones, and
   *  refreshes the timeline. */
  handleAddActivity: () => Promise<void>;
  /** Bump counter handlers — increment / decrement `bump_number`. */
  handleRecordBump: (oppId: string) => Promise<void>;
  handleReduceBump: (oppId: string) => Promise<void>;
  isBumping: boolean;

  // ─── Cross-tab navigation ─────────────────────────────────────
  /** Switch the main tab strip's selected tab. Used by the
   *  Overview tab's JumpCard + Pulse chip click-throughs and by
   *  legacy alert-card handlers that still call
   *  `setActiveTab('actions')` (the actions tab itself was merged
   *  into Overview; the union member is kept for back-compat). */
  setActiveTab: React.Dispatch<React.SetStateAction<'actions' | 'outreach' | 'pipeline' | 'orbit' | 'templates' | 'discovery'>>;

  // ─── Overview tab ─────────────────────────────────────────────
  /** Unified search at the top of the Overview tab — broadcasts into
   *  Outreach/Pipeline/Orbit's per-tab filters via an effect on the
   *  page so the user types once at the top and all three sections
   *  filter as one. */
  overallSearch: string;
  setOverallSearch: React.Dispatch<React.SetStateAction<string>>;
  /** [Orbit split, May 2026] Engaged-only count for the Overview
   *  Orbit section badge (distinct from `sortedEngagedOrbit` which
   *  is the pre-sorted post-filter list the OrbitTab renders). */
  engagedOrbitOpps: SalesPipelineOpportunity[];
  /** Same for cold-DM orbit count. */
  coldDmOrbitOpps: SalesPipelineOpportunity[];
  /** Nurture-stage opps — the only section in Overview that renders
   *  its own table inline (since the other 4 sections delegate to
   *  extracted tab components). */
  allNurtureOpps: SalesPipelineOpportunity[];

  // ─── Pipeline kanban + table (Phase 4 extractions) ───────────
  /** DnD sensors — `useSensors(...)` output. Page-owned because the
   *  DndContext that wraps both kanban + table needs them. */
  sensors: ReturnType<typeof import('@dnd-kit/core').useSensors>;
  handleDragStart: (event: import('@dnd-kit/core').DragStartEvent) => void;
  handleDragEnd: (event: import('@dnd-kit/core').DragEndEvent) => Promise<void> | void;
  /** While dragging, this holds the source opp so the DragOverlay
   *  can render a floating card preview. */
  activeOpportunity: SalesPipelineOpportunity | null;
  /** Pipeline stages that should be visible columns. Computed from
   *  the pathFilter + the canonical PIPELINE_STAGES. */
  visiblePipelineStages: SalesPipelineStage[];
  /** Filter helper — returns the opps for a given pipeline stage
   *  (post-pathFilter + post-search). */
  getStageOpps: (stage: SalesPipelineStage) => SalesPipelineOpportunity[];
  /** Collapsible-column state — kanban (vertical strip) vs. table
   *  (whole section). Two separate sets so the user's preferences
   *  don't bleed between views. */
  collapsedKanbanStages: Set<string>;
  toggleKanbanCollapse: (stage: string) => void;
  collapsedStages: Set<string>;
  setCollapsedStages: React.Dispatch<React.SetStateAction<Set<string>>>;
  /** All orbit opps (across both engaged + cold-DM splits). Used by
   *  the kanban's orbit drop-zone badge. */
  allOrbitOpps: SalesPipelineOpportunity[];
  /** Search-and-pathFilter-filtered opportunity list — what the
   *  kanban / table actually render against. The closed-lost
   *  drop-zone badge counts from this. */
  filteredOpportunities: SalesPipelineOpportunity[];
  /** Inline-edit state for the table view. */
  editingCell: { id: string; field: string } | null;
  setEditingCell: React.Dispatch<React.SetStateAction<{ id: string; field: string } | null>>;
  editingValue: string;
  setEditingValue: React.Dispatch<React.SetStateAction<string>>;
  handleInlineEdit: (oppId: string, field: string, value: string) => Promise<void>;

  // ─── Outreach tab ─────────────────────────────────────────────
  /** Open the F&M Metrics sub-tab from anywhere. Does the right
   *  combination of sub-tab switch + panel-expand + localStorage
   *  persistence + smooth-scroll. Used by OutreachTab's "View team
   *  metrics →" link. Was previously two raw setters
   *  (`setTopSectionTab` + `setShowAnalytics`) exposed through
   *  context — 2026-06-03 collapse into one callback. */
  openMetricsView: () => void;
  /** Filter row state. `dm_account` = path filter, `bucket` =
   *  qualification level, `bumpRange` = bump-count bucket, `owner_id`
   *  = 'mine' (logged-in user) / undefined (all owners) / specific
   *  user id. Free-text search lives in the page-level `overallSearch`
   *  and is merged in at fetch time (was `searchTerm` here before
   *  2026-06-03 — redundant copy dropped). */
  outreachFilters: {
    dm_account?: import('@/lib/salesPipelineService').DmAccount;
    bucket?: import('@/lib/salesPipelineService').Bucket;
    bumpRange?: 'none' | '1-2' | '3+';
    owner_id?: string | 'mine';
  };
  setOutreachFilters: React.Dispatch<React.SetStateAction<{
    dm_account?: import('@/lib/salesPipelineService').DmAccount;
    bucket?: import('@/lib/salesPipelineService').Bucket;
    bumpRange?: 'none' | '1-2' | '3+';
    owner_id?: string | 'mine';
  }>>;
  outreachPage: number;
  setOutreachPage: React.Dispatch<React.SetStateAction<number>>;
  /** Server-reported row counts for the pagination header + the
   *  "All Owners" badge in the owner sub-tabs. */
  outreachTotal: number;
  outreachTotalPages: number;
  outreachAllTotal: number;
  outreachLoading: boolean;
  /** Current page of opportunity rows + the sorted view (sorted by
   *  project name to keep multi-POC projects together). */
  outreachOpps: SalesPipelineOpportunity[];
  sortedOutreach: SalesPipelineOpportunity[];
  outreachNameCounts: Map<string, number>;
  outreachStart: number;
  outreachEnd: number;
  /** Multi-select state. The bulk-action toolbar above the table
   *  renders when `selectedOutreach.length > 0`. */
  selectedOutreach: string[];
  setSelectedOutreach: React.Dispatch<React.SetStateAction<string[]>>;
  toggleOutreachSelect: (oppId: string) => void;
  selectAllOnPage: () => void;
  /** Bulk-action handlers and their in-flight flags. */
  handleBulkBump: () => Promise<void>;
  handleBulkMoveToWarm: () => Promise<void>;
  handleBulkDelete: () => Promise<void>;
  handleBulkReassignOwner: (newOwnerId: string | null, ownerLabel: string) => Promise<void>;
  isBulkBumping: boolean;
  isBulkMoving: boolean;
  isBulkReassigning: boolean;
  bulkOwnerOpen: boolean;
  setBulkOwnerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** The action engine. Same call used by ActionsTab to populate the
   *  "Set outcome" dropdown; the OutreachTab uses it for the inline
   *  "next move" hint inside each row. Returns a `null` priority
   *  bucket for terminal stages. */
  getNextAction: (opp: SalesPipelineOpportunity) => ActionDescriptor;

  // ─── Actions tab ──────────────────────────────────────────────
  /** Owner-scope filter for the Actions list. */
  actionFilter: 'all' | 'mine' | 'urgent';
  setActionFilter: React.Dispatch<React.SetStateAction<'all' | 'mine' | 'urgent'>>;
  /** Phase filter for the Actions list ("Outreach" / "Closing" /
   *  "Orbit" / "Waiting" / "All"). */
  actionPhaseFilter: 'all' | 'outreach' | 'closing' | 'orbit' | 'non_urgent';
  setActionPhaseFilter: React.Dispatch<React.SetStateAction<'all' | 'outreach' | 'closing' | 'orbit' | 'non_urgent'>>;
  /** Sort order — persisted to localStorage under the user id so each
   *  user keeps their preferred sort. */
  actionSort: 'priority' | 'stage' | 'temperature' | 'value' | 'name' | 'newest' | 'oldest' | 'timing';
  setActionSort: React.Dispatch<React.SetStateAction<'priority' | 'stage' | 'temperature' | 'value' | 'name' | 'newest' | 'oldest' | 'timing'>>;
  /** Free-text search applied across action labels + opp names. */
  actionsSearch: string;
  setActionsSearch: React.Dispatch<React.SetStateAction<string>>;
  /** Mutable debounce ref shared with the search input so the
   *  300ms throttle survives re-renders. */
  // `searchDebounceRef` removed 2026-06-03 — was the shared debounce
  // ref for per-tab search inputs (gone since the unified-search
  // migration). No consumer reads `.current` anywhere anymore.
  /** Computed action lists, in the shape the Actions tab consumes:
   *   - `allActionItems` is the unfiltered pool
   *   - `allOutreachCount` / `allClosingCount` / `allOrbitCount` /
   *     `allNonUrgentCount` are the phase tab badges
   *   - `displayedActions` is what renders in the table (post-search
   *     + post-phase filter + post-alert-card filter + sorted)
   *   - `actionsNameCounts` is the project-name grouping helper
   *     (multi-POC projects render with one project name + a "N POCs"
   *     count chip and connector rows). */
  allActionItems: Array<{ opp: SalesPipelineOpportunity; action: ActionDescriptor }>;
  allOutreachCount: number;
  allClosingCount: number;
  allOrbitCount: number;
  allNonUrgentCount: number;
  displayedActions: Array<{ opp: SalesPipelineOpportunity; action: ActionDescriptor }>;
  actionsNameCounts: Map<string, number>;
  /** Set of opp ids the active alert card is filtering on. `null` =
   *  no alert filter active. */
  alertCardOppIds: Set<string> | null;
  /** Spinner gate per-opp — only one outcome action can be in flight
   *  at a time. */
  executingAction: string | null;
  /** Execute the recommended action for an opp. Page-owned because it
   *  coordinates side-effects (stage transitions, activity log
   *  prompts, prompts for missing fields like TG handle). */
  handleActionExecute: (oppId: string, action: ActionDescriptor, opp: SalesPipelineOpportunity) => Promise<void>;
  /** Direct setter on the opportunities array — used by inline
   *  outcome-picker writes that don't need the full applyOppPatch
   *  optimistic-update path. */
  setOpportunities: React.Dispatch<React.SetStateAction<SalesPipelineOpportunity[]>>;

  // ─── Orbit tab ────────────────────────────────────────────────
  /** Multi-select state for the Orbit tab's bulk-action toolbar.
   *  Shared across both the Engaged + Cold-DM orbit sections so the
   *  user can multi-select across sections. */
  selectedOrbit: string[];
  setSelectedOrbit: React.Dispatch<React.SetStateAction<string[]>>;
  selectAllOrbitVisible: () => void;
  /** Toggle one opp's checkbox. */
  toggleOrbitSelect: (oppId: string) => void;
  isOrbitBulkMoving: boolean;
  handleOrbitBulkMove: (targetStage: 'cold_dm' | 'warm') => Promise<void>;
  handleOrbitBulkDelete: () => Promise<void>;
  /** [Orbit split, May 2026] Two-section view — Engaged orbit (had a
   *  response or qualification at some point) renders first because
   *  it deserves more attention; Cold-DM orbit (never responded) is
   *  a low-touch revisit pool below. Both are sorted by project name
   *  + bump_number to keep multi-POC projects grouped. */
  sortedEngagedOrbit: SalesPipelineOpportunity[];
  engagedOrbitTotalValue: number;
  sortedColdDmOrbit: SalesPipelineOpportunity[];
  coldDmOrbitTotalValue: number;
  /** Move an orbit-stage opp back into active flow (default target:
   *  warm). Page-owned because it also clears `orbit_reason`. */
  handleResurrect: (opp: SalesPipelineOpportunity) => Promise<void>;

  // `renderPocCell` / `renderOwnerCell` removed 2026-06-03 — see
  // <PocCell /> and <OwnerCell /> in components/crm/sales-pipeline/cells/.

  // ─── Templates tab (Templates + its 2 nested dialogs) ─────────
  setTemplates: React.Dispatch<React.SetStateAction<import('@/lib/salesPipelineService').SalesDmTemplate[]>>;
  templateStageFilter: string;
  setTemplateStageFilter: React.Dispatch<React.SetStateAction<string>>;
  templateTagFilter: string;
  setTemplateTagFilter: React.Dispatch<React.SetStateAction<string>>;
  /** Open state for the Create / Edit template dialog. */
  isTemplateDialogOpen: boolean;
  setIsTemplateDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** When non-null, the dialog is in Edit mode for this template. */
  editingTemplate: import('@/lib/salesPipelineService').SalesDmTemplate | null;
  setEditingTemplate: React.Dispatch<React.SetStateAction<import('@/lib/salesPipelineService').SalesDmTemplate | null>>;
  templateForm: import('@/lib/salesPipelineService').CreateSalesDmTemplateData;
  setTemplateForm: React.Dispatch<React.SetStateAction<import('@/lib/salesPipelineService').CreateSalesDmTemplateData>>;
  isTemplateSubmitting: boolean;
  setIsTemplateSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
  /** When non-null, the Preview dialog renders for this template. */
  previewTemplate: import('@/lib/salesPipelineService').SalesDmTemplate | null;
  setPreviewTemplate: React.Dispatch<React.SetStateAction<import('@/lib/salesPipelineService').SalesDmTemplate | null>>;

  // ─── Create / Edit Opportunity dialog ──────────────────────────
  /** Open the Create flow. */
  isCreateOpen: boolean;
  setIsCreateOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** When non-null AND `slideOverMode !== 'edit'`, the dialog renders
   *  in Edit mode for this opp. */
  editingOpp: SalesPipelineOpportunity | null;
  setEditingOpp: React.Dispatch<React.SetStateAction<SalesPipelineOpportunity | null>>;
  /** `'view' | 'edit'` — when the slide-over is in 'edit' mode the
   *  Form Dialog stays closed because the same form renders inside
   *  the slide-over instead. */
  slideOverMode: 'view' | 'edit';
  /** The working form state. Reused by the slide-over's edit panel. */
  form: import('@/lib/salesPipelineService').CreateSalesPipelineOpportunityData & {
    next_meeting_at?: string;
    next_meeting_type?: string;
  };
  setForm: React.Dispatch<React.SetStateAction<import('@/lib/salesPipelineService').CreateSalesPipelineOpportunityData & {
    next_meeting_at?: string;
    next_meeting_type?: string;
  }>>;
  handleCreate: () => Promise<void>;
  handleUpdate: () => Promise<void>;
  /** Delete an opportunity by id. Confirms via the shared
   *  AlertDialog at the bottom of the page. */
  handleDelete: (id: string) => Promise<void>;
  isSubmitting: boolean;
  /** Affiliate list — owned by the page; the dialog can append to it
   *  via `setAffiliates` after an inline-create. */
  affiliates: import('@/lib/crmService').CRMAffiliate[];
  setAffiliates: React.Dispatch<React.SetStateAction<import('@/lib/crmService').CRMAffiliate[]>>;
  /** Inline-create / select Popover state for the Affiliate field. */
  affiliatePopoverOpen: boolean;
  setAffiliatePopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  affiliateSearch: string;
  setAffiliateSearch: React.Dispatch<React.SetStateAction<string>>;

  // ─── Activity Log dialog ───────────────────────────────────────
  /** Open when the user clicks a Log Activity quick-action button.
   *  Carries the opp identity + the activity type seed + an optional
   *  showMeetingPicker flag (for activity types that imply scheduling
   *  a follow-up) + the ownerId so the booking-link picker can
   *  default to the right team member. */
  activityLogPrompt: {
    oppId: string;
    oppName: string;
    type: import('@/lib/salesPipelineService').ActivityType;
    title: string;
    showMeetingPicker?: boolean;
    ownerId?: string;
  } | null;
  setActivityLogPrompt: React.Dispatch<React.SetStateAction<{
    oppId: string;
    oppName: string;
    type: import('@/lib/salesPipelineService').ActivityType;
    title: string;
    showMeetingPicker?: boolean;
    ownerId?: string;
  } | null>>;
  /** Working form state inside the Log Activity dialog. */
  activityLogForm: {
    title: string;
    description: string;
    outcome: string;
    next_step: string;
    next_step_date?: string;
    meeting_date?: string;
    meeting_time?: string;
    co_owner_ids?: string[];
  };
  setActivityLogForm: React.Dispatch<React.SetStateAction<{
    title: string;
    description: string;
    outcome: string;
    next_step: string;
    next_step_date?: string;
    meeting_date?: string;
    meeting_time?: string;
    co_owner_ids?: string[];
  }>>;
  /** Spinner flag for the Confirm button. */
  isActivityLogSubmitting: boolean;
  /** Template-picker popover open state — local to the Log Activity
   *  dialog body (the Templates tab has its own state). */
  templatePopoverOpen: boolean;
  setTemplatePopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** Available DM templates for the picker — same list the Templates
   *  tab manages. */
  templates: import('@/lib/salesPipelineService').SalesDmTemplate[];
  /** Selected booking-link team-member id, keyed by interaction
   *  context (e.g. `activity-${oppId}` here). Shared with the slide-over
   *  + table booking-link Send Booking column. */
  bookingUserId: Record<string, string>;
  setBookingUserId: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  /** Submit handler — writes the activity, advances any auto-stamped
   *  milestone fields, runs side-effects (TG handle prompt, bucket
   *  prompt, etc.) and closes the dialog. */
  confirmActivityLog: () => Promise<void>;
  /** Copy a Calendly booking link for `oppId` keyed to the chosen
   *  `userId` into the user's clipboard. */
  copyBookingLink: (userId: string, oppId: string) => void;

  // ─── Stage History dialog ──────────────────────────────────────
  stageHistoryOpen: boolean;
  setStageHistoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  stageHistory: Array<{
    id: string;
    from_stage: string | null;
    to_stage: string;
    changed_at: string;
    changed_by: string | null;
    notes: string | null;
  }>;
  stageHistoryLoading: boolean;
  /** The opp the slide-over (and therefore the Stage History dialog
   *  trigger) is currently focused on. `null` = slide-over closed. */
  slideOverOpp: SalesPipelineOpportunity | null;
  /** Resolve a user id to display name → email fallback → '—'. Used
   *  by StageHistoryDialog + other components that show "changed by"
   *  attribution. */
  getUserName: (userId: string | null) => string;

  // ─── Orbit reason prompt dialog ────────────────────────────────
  /** Open when an opp is moved to the Orbit stage. `null` = closed. */
  orbitPrompt: { oppId: string; oppName: string; fromStage: string } | null;
  setOrbitPrompt: React.Dispatch<React.SetStateAction<{ oppId: string; oppName: string; fromStage: string } | null>>;
  /** Selected reason from `ORBIT_REASONS`. */
  orbitReasonValue: import('@/lib/salesPipelineService').OrbitReason;
  setOrbitReasonValue: React.Dispatch<React.SetStateAction<import('@/lib/salesPipelineService').OrbitReason>>;
  /** Follow-up window in days (default 90). */
  orbitFollowupDays: number;
  setOrbitFollowupDays: React.Dispatch<React.SetStateAction<number>>;
  confirmOrbit: () => Promise<void>;

  // ─── Closed-lost reason prompt dialog ──────────────────────────
  closedLostPrompt: { oppId: string; oppName: string; fromStage: string } | null;
  setClosedLostPrompt: React.Dispatch<React.SetStateAction<{ oppId: string; oppName: string; fromStage: string } | null>>;
  closedLostReasonValue: string;
  setClosedLostReasonValue: React.Dispatch<React.SetStateAction<string>>;
  confirmClosedLost: () => Promise<void>;

  // ─── Closed-won client-link prompt dialog ──────────────────────
  closedWonPrompt: { oppId: string; oppName: string; dealValue: number; source: string } | null;
  setClosedWonPrompt: React.Dispatch<React.SetStateAction<{ oppId: string; oppName: string; dealValue: number; source: string } | null>>;
  closedWonMode: 'new' | 'existing';
  setClosedWonMode: React.Dispatch<React.SetStateAction<'new' | 'existing'>>;
  closedWonEmail: string;
  setClosedWonEmail: React.Dispatch<React.SetStateAction<string>>;
  closedWonName: string;
  setClosedWonName: React.Dispatch<React.SetStateAction<string>>;
  closedWonClientId: string;
  setClosedWonClientId: React.Dispatch<React.SetStateAction<string>>;
  closedWonClients: { id: string; name: string; email: string }[];
  closedWonClientSearch: string;
  setClosedWonClientSearch: React.Dispatch<React.SetStateAction<string>>;
  closedWonClientPopoverOpen: boolean;
  setClosedWonClientPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  confirmClosedWon: () => Promise<void>;
  skipClosedWon: () => Promise<void>;

  // ─── Bucket assignment prompt dialog ───────────────────────────
  bucketPrompt: { oppId: string; oppName: string } | null;
  setBucketPrompt: React.Dispatch<React.SetStateAction<{ oppId: string; oppName: string } | null>>;
  bucketValue: import('@/lib/salesPipelineService').Bucket;
  setBucketValue: React.Dispatch<React.SetStateAction<import('@/lib/salesPipelineService').Bucket>>;
  confirmBucket: () => Promise<void>;

  // ─── TG handle prompt dialog ───────────────────────────────────
  /** Open when the user moves an opp to a stage that requires a
   *  Telegram handle (e.g. tg_intro). `null` = dialog closed. */
  tgHandlePrompt: { oppId: string; oppName: string } | null;
  setTgHandlePrompt: React.Dispatch<React.SetStateAction<{ oppId: string; oppName: string } | null>>;
  /** Controlled input value for the handle field. */
  tgHandleValue: string;
  setTgHandleValue: React.Dispatch<React.SetStateAction<string>>;
  /** Submit handler — writes the handle, advances the stage, and
   *  closes the prompt. Page-owned because it touches the same
   *  `applyOppPatch` path as inline edits. */
  confirmTgHandle: () => Promise<void>;

  // ─── Alert Cards strip (paired with funnel under the same shell) ─
  /** Computed metrics for the 5 attention-card tiles. */
  alertMetrics: AlertMetrics;
  /** Currently-selected alert card filter. Drives the Overall-tab
   *  action-list scope when set to anything other than 'none'. */
  alertCardFilter: AlertCardFilter;
  setAlertCardFilter: React.Dispatch<React.SetStateAction<AlertCardFilter>>;
  /** Side-effect the page wires for "card was activated (not toggled
   *  off)" — switches the main tab strip to Overall, opens the
   *  Actions section, and resets the action filters. Keeps that
   *  cross-section orchestration in the page so the strip only knows
   *  about its own filter. */
  onAlertCardActivate: (filter: AlertCardFilter) => void;

  // ─── Notifications ─────────────────────────────────────────────
  toast: ToastFn;
}

const SalesPipelineContext = createContext<SalesPipelineContextType | null>(null);

export function useSalesPipeline(): SalesPipelineContextType {
  const ctx = useContext(SalesPipelineContext);
  if (!ctx) {
    throw new Error('useSalesPipeline must be used inside <SalesPipelineProvider>');
  }
  return ctx;
}

export const SalesPipelineProvider = SalesPipelineContext.Provider;
