'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Plus, UserPlus, Minus, Search, Trash2, X, LayoutGrid, TableIcon, GripVertical, Loader2,
  Target, AlertTriangle, ArrowRight, MoreHorizontal, ChevronDown, ChevronRight, ChevronLeft, ChevronUp, HelpCircle,
  MessageSquare, Calendar, FileText, Zap, RotateCcw, Clock, Copy, Check, ChevronsUpDown,
  Building2, TrendingUp, DollarSign, Users, Hash, BarChart3, Activity, Send, ArrowUpDown, Paperclip, Eye, Image,
  Sparkles, Download, History,
} from 'lucide-react';
import { downloadCsv, todayStamp } from '@/lib/csvExport';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CRMService, CRMAffiliate, OpportunityStage } from '@/lib/crmService';
// DiscoveryTab + per-tab body components moved into SalesPipelineTabs
// on 2026-06-03 — page no longer renders any TabsContent directly, so
// these imports moved with the JSX.
// DnD helpers — extracted 2026-06-02 as Phase 1 of the structural
// split. Pure presentational wrappers over @dnd-kit/core primitives,
// no state dependencies.
import { DroppableColumn } from '@/components/crm/sales-pipeline/dnd/DroppableColumn';
import { SortableCard } from '@/components/crm/sales-pipeline/dnd/SortableCard';
import { SortableTableRow } from '@/components/crm/sales-pipeline/dnd/SortableTableRow';
// Header panels — extracted 2026-06-02. Consume the
// SalesPipelineContext for shared state instead of taking 5+ props.
// SalesFunnelStrip + AlertCardsStrip moved into ActionsTab on
// 2026-06-03 — no longer rendered at page level.
import { ForecastPanel } from '@/components/crm/sales-pipeline/panels/ForecastPanel';
import { MetricsPanel } from '@/components/crm/sales-pipeline/panels/MetricsPanel';
import { SalesDashboard } from '@/components/crm/sales-pipeline/SalesDashboard';
import { SalesPipelineHeaderActions } from '@/components/crm/sales-pipeline/HeaderActions';
import { SalesPipelineTabs } from '@/components/crm/sales-pipeline/SalesPipelineTabs';
// Phase 3 dialogs — extracted 2026-06-02. Visibility driven by their
// non-null prompt-state in SalesPipelineContext.
import { TgHandleDialog } from '@/components/crm/sales-pipeline/dialogs/TgHandleDialog';
import { OrbitDialog } from '@/components/crm/sales-pipeline/dialogs/OrbitDialog';
import { ClosedLostDialog } from '@/components/crm/sales-pipeline/dialogs/ClosedLostDialog';
import { ClosedWonDialog } from '@/components/crm/sales-pipeline/dialogs/ClosedWonDialog';
import { BucketDialog } from '@/components/crm/sales-pipeline/dialogs/BucketDialog';
import { StageHistoryDialog } from '@/components/crm/sales-pipeline/dialogs/StageHistoryDialog';
import { ActivityLogDialog } from '@/components/crm/sales-pipeline/dialogs/ActivityLogDialog';
import { CreateEditOpportunityDialog } from '@/components/crm/sales-pipeline/dialogs/CreateEditOpportunityDialog';
// Phase 2 tab bodies — extracted 2026-06-02.
import { CommandPalette } from '@/components/crm/sales-pipeline/CommandPalette';
// Phase 4 — kanban + table views for the Pipeline tab.
// The opportunity slide-over — biggest single Phase 3 extraction
// (~1,300 LOC). Portals to document.body internally.
import { OpportunitySlideOver } from '@/components/crm/sales-pipeline/slideovers/OpportunitySlideOver';
import { SalesPipelineProvider, type AlertCardFilter } from '@/contexts/SalesPipelineContext';
// Pure helpers moved out of page.tsx so the extracted panels (Forecast,
// Metrics, etc.) can share the same definitions as the forecastKpis
// memo here without prop-drilling. `ACTION_GUIDANCE` + `ActionPriority`
// were lifted here when the ActionsTab was extracted (2026-06-02) — the
// page's `handleActionExecute` + `getNextAction` consume them too.
import {
  STAGE_WIN_PROB,
  isOppAtRisk,
  ACTION_GUIDANCE,
  cleanPocHandle,
  type ActionPriority,
} from '@/lib/salesPipelineHelpers';
import { ClientService } from '@/lib/clientService';
import {
  SalesPipelineService,
  SalesPipelineOpportunity,
  CRMActivity,
  TimelineEntry,
  TimelineSource,
  SalesPipelineStage,
  Bucket,
  DmAccount,
  WarmSubState,
  OrbitReason,
  ActivityType,
  CreateSalesPipelineOpportunityData,
  CreateActivityData,
  PIPELINE_STAGES,
  PATH_A_STAGES,
  PATH_B_STAGES,
  ALL_V2_STAGES,
  STAGE_LABELS,
  STAGE_COLORS,
  BUCKET_COLORS,
  ORBIT_REASONS,
  PocPlatform,
  POC_PLATFORMS,
  SalesDmTemplate,
  CreateSalesDmTemplateData,
} from '@/lib/salesPipelineService';
import { UserService } from '@/lib/userService';
import { BookingService, Booking } from '@/lib/bookingService';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { formatDistanceToNow, format, endOfWeek, endOfMonth, addDays, addMonths, differenceInDays } from 'date-fns';

// ============================================
// Main Page
// ============================================
// DnD wrappers (DroppableColumn, SortableCard, SortableTableRow)
// extracted to `components/crm/sales-pipeline/dnd/*` on 2026-06-02
// as Phase 1 of the structural split.

/**
 * SP_CSV_COLUMNS — column config for the page's "Export CSV" action.
 * Hoisted from the inline arrays at 2026-06-03 — the same 12 columns
 * were duplicated in two places (the PageHeader overflow menu + the
 * CommandPalette `onExportCsv` callback). Now both spread the same
 * source.
 *
 * Typed as `any` accessor input because the runtime row shape mixes
 * `SalesPipelineOpportunity` (typed) with denormalized backend fields
 * (`owner.name`, etc.) that don't live on the v2 type.
 */
const SP_CSV_COLUMNS = [
  { header: 'Name', accessor: (r: any) => r.name },
  { header: 'Stage', accessor: (r: any) => r.stage || '' },
  { header: 'Bucket', accessor: (r: any) => r.bucket || '' },
  { header: 'Source', accessor: (r: any) => r.source || '' },
  { header: 'Owner', accessor: (r: any) => r.owner?.name || r.owner_id || '' },
  { header: 'POC Handle', accessor: (r: any) => r.poc_handle || '' },
  { header: 'POC Platform', accessor: (r: any) => r.poc_platform || '' },
  { header: 'Deal Value', accessor: (r: any) => r.deal_value ?? '' },
  { header: 'Currency', accessor: (r: any) => r.currency || '' },
  { header: 'Last Contacted', accessor: (r: any) => r.last_contacted_at ? new Date(r.last_contacted_at).toISOString().slice(0, 10) : '' },
  { header: 'Next Action', accessor: (r: any) => r.next_action_at ? new Date(r.next_action_at).toISOString().slice(0, 10) : '' },
  { header: 'Created', accessor: (r: any) => new Date(r.created_at).toISOString().slice(0, 10) },
];

export default function SalesPipelinePage() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Data state
  const [loading, setLoading] = useState(true);
  const [opportunities, setOpportunities] = useState<SalesPipelineOpportunity[]>([]);
  const [affiliates, setAffiliates] = useState<CRMAffiliate[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string | null; email: string; is_active?: boolean | null }[]>([]);

  // Filtered roster — excludes inactive (`is_active=false`) users so
  // pending/deactivated test accounts (e.g. "Andy Test", "bolt test")
  // don't clutter the per-owner tab bar, owner dropdowns, or
  // per-user metrics tables. `is_active === false` (not !==true) so
  // legacy users with null/undefined still appear by default.
  const activeUsers = useMemo(
    () => users.filter(u => u.is_active !== false),
    [users],
  );
  // Server-fetched roll-up. `totalCount` + `activeValue` were also
  // returned by the service but never read by any consumer — dropped
  // from the state shape 2026-06-03 (service still computes them as
  // long as they remain on the return type; trim those next pass).
  const [metrics, setMetrics] = useState({ bucketA: 0, bucketB: 0, bucketC: 0, bamfamViolations: 0 });

  // UI state
  // `searchTerm` was the predecessor of `overallSearch` — kept around
  // for months after the unified-search migration. Removed 2026-06-03.
  const [actionsSearch, setActionsSearch] = useState('');
  const [pipelineSearch, setPipelineSearch] = useState('');
  const [orbitSearch, setOrbitSearch] = useState('');
  // Active tab — Actions is the default landing surface (was
  // 'overview' / Overall until that tab was merged into Actions on
  // 2026-06-03).
  const [activeTab, setActiveTab] = useState<'actions' | 'outreach' | 'pipeline' | 'orbit' | 'templates' | 'discovery'>('actions');
  // Pipeline view-mode persisted to localStorage 2026-06-03 — was
  // re-defaulting to 'table' on every reload, which surprised kanban
  // users. SSR guard: localStorage only exists in the browser.
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>(() => {
    if (typeof window === 'undefined') return 'table';
    const stored = window.localStorage.getItem('sp:viewMode');
    return stored === 'kanban' || stored === 'table' ? stored : 'table';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('sp:viewMode', viewMode);
  }, [viewMode]);
  const [pathFilter, setPathFilter] = useState<'all' | 'closer' | 'sdr'>('all');
  // Overall-tab unified search — broadcasts into Outreach/Pipeline/Orbit
  // filters when the user types here, so one query scopes the whole Overall
  // view. Each tab's own search input still works independently.
  const [overallSearch, setOverallSearch] = useState('');

  // Metrics tab state — bookings are lazy-loaded the first time the
  // Metrics sub-section is opened (or the Outreach metrics strip mounts).
  // Range is rolling-90-day default which covers most analyst windows.
  const [metricsBookings, setMetricsBookings] = useState<Booking[]>([]);
  const [metricsBookingsLoading, setMetricsBookingsLoading] = useState(false);
  const [metricsRangeDays, setMetricsRangeDays] = useState<7 | 30 | 90>(30);
  const [metricsUserId, setMetricsUserId] = useState<string>('');

  // [Accuracy fix May 2026] Per user feedback: "My outreach last 30
  // days doesnt look accurate" + "data dashboard isnt accurate ... need
  // to figure out a better way to record it".
  //
  // The OLD computeOutreachMetrics inferred touch1s/replies from opp
  // row proxies — `bump_number >= 1 && created_at in window` for
  // touch1s, and `stage != cold_dm && (created_at OR updated_at) in
  // window` for replies. The updated_at proxy is the killer: ANY edit
  // (note, owner change, bucket change, etc.) bumps it, so every old
  // opp re-counted as a "reply this window" every time someone touched
  // its row. Reply counts were 5-10× inflated.
  //
  // crm_activities IS the source of truth (createActivity already
  // auto-stamps last_reply_at, last_team_message_at, proposal_sent_at,
  // discovery_call_at, etc.). We now fetch the activities once on the
  // same trigger as bookings and count events directly.
  //
  // Activity volume note: the funnel API uses limit=10000 against an
  // estimated ~3k outbound rows, so the same cap is safe here.
  const [metricsActivities, setMetricsActivities] = useState<Array<{ id: string; opportunity_id: string | null; type: string; direction: 'inbound' | 'outbound' | null; created_at: string; owner_id: string | null }>>([]);
  const [metricsActivitiesLoading, setMetricsActivitiesLoading] = useState(false);

  // Top sub-section tabs — Forecast + Metrics live in a separate Tabs
  // container above the main tab strip (between Weekly Activity Funnel
  // and Attention Cards). Independent of `activeTab` so users can keep
  // both views in mind without one resetting the other.
  const [topSectionTab, setTopSectionTab] = useState<'forecast' | 'metrics' | 'dashboard'>('forecast');

  // [Header compression, 2026-06-02] Single-toggle for the funnel +
  // attention cards in the header card. Default 'attention' because
  // that's the urgency signal reps come here to triage; managers
  // can toggle to 'activity' to scan the 7-day throughput funnel.
  // The previous design had both stacked vertically inside one
  // container, forcing both sets of numbers into the viewport.
  // `headerStrip` (Attention/Activity toggle) moved to ActionsTab
  // local state on 2026-06-03 when the card itself moved off the
  // page level. No remaining page-level consumer.

  // [Cmd+K palette, 2026-06-02] Open/close state for the
  // CommandPalette. Cmd+K (Mac) or Ctrl+K (PC/Linux) toggles. Esc
  // dismiss is built into the cmdk primitive. The keybinding mounts
  // once at the page level so it works no matter which tab the
  // user is on.
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen(open => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // [Sales-pipeline space optimization, May 2026] The Forecast/Metrics
  // block can be 400-1200px tall depending on proposal count and team
  // size. Defaults to collapsed so the operational tabs land above the
  // fold; a 1-line summary stays visible so users still see the
  // headline numbers without expanding. localStorage-persisted per
  // user so power users (sales managers) can pin it open once and
  // stay that way.
  const [showAnalytics, setShowAnalytics] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const v = window.localStorage.getItem('sp_showAnalytics');
    if (v === '1') setShowAnalytics(true);
  }, []);
  const toggleAnalytics = useCallback(() => {
    setShowAnalytics(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('sp_showAnalytics', next ? '1' : '0');
      }
      return next;
    });
  }, []);

  /**
   * Open the F&M Metrics sub-tab from anywhere — used by OutreachTab's
   * "View team metrics →" link. Sets the F&M sub-tab to 'metrics',
   * force-opens the F&M panel (persisting that to localStorage so the
   * choice survives a reload), and scrolls the panel into view.
   *
   * Lives here (not in OutreachTab) so the consumer doesn't need to
   * know the localStorage key, the DOM id, or the F&M sub-tab union.
   * Replaces the previous pattern of exposing raw `setTopSectionTab` +
   * `setShowAnalytics` setters through context.
   */
  const openMetricsView = useCallback(() => {
    setTopSectionTab('metrics');
    setShowAnalytics(true);
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem('sp_showAnalytics', '1'); } catch {}
    requestAnimationFrame(() => {
      const el = document.getElementById('sp-analytics-panel');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }, []);

  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeOpportunity, setActiveOpportunity] = useState<SalesPipelineOpportunity | null>(null);

  // Dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingOpp, setEditingOpp] = useState<SalesPipelineOpportunity | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<CreateSalesPipelineOpportunityData & { next_meeting_at?: string; next_meeting_type?: string }>({ name: '' });

  // Shared confirm dialog — replaces the native browser confirm() in
  // delete flows. AlertDialog is more accessible, themable, and matches
  // the rest of the CRM surface area. Set the state to {open: true, ...}
  // to open; onConfirm runs the destructive action.
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const [confirmRunning, setConfirmRunning] = useState(false);

  // Activity slide-over
  const [slideOverMode, setSlideOverMode] = useState<'view' | 'edit'>('view');
  const [slideOverOpp, setSlideOverOpp] = useState<SalesPipelineOpportunity | null>(null);
  // Stage history dialog — restores the timeline view that the old
  // /crm/pipeline page had. Loaded on demand via getStageHistory().
  const [stageHistoryOpen, setStageHistoryOpen] = useState(false);
  const [stageHistory, setStageHistory] = useState<Array<{
    id: string;
    from_stage: string | null;
    to_stage: string;
    changed_at: string;
    changed_by: string | null;
    notes: string | null;
  }>>([]);
  const [stageHistoryLoading, setStageHistoryLoading] = useState(false);
  const openStageHistory = async () => {
    if (!slideOverOpp) return;
    setStageHistoryOpen(true);
    setStageHistoryLoading(true);
    try {
      const rows = await CRMService.getStageHistory('opportunity', slideOverOpp.id);
      setStageHistory(rows as any);
    } catch (err) {
      console.error('Error loading stage history:', err);
      setStageHistory([]);
    } finally {
      setStageHistoryLoading(false);
    }
  };
  // [Activity Timeline auto-stamp, May 2026] Switched from manual-only
  // CRMActivity[] to the unified TimelineEntry[] which merges manual
  // activities + stage transitions + meeting events + Telegram messages
  // into one chronological feed. Render layer below branches per
  // source for icon/styling; everything else is unchanged.
  const [activities, setActivities] = useState<TimelineEntry[]>([]);
  const [activityForm, setActivityForm] = useState<CreateActivityData>({ opportunity_id: '', type: 'note', title: '' });
  const [activityMeetingDate, setActivityMeetingDate] = useState<string | undefined>(undefined);
  const [activityMeetingTime, setActivityMeetingTime] = useState<string | undefined>(undefined);
  const [isActivitySubmitting, setIsActivitySubmitting] = useState(false);
  const [activityFile, setActivityFile] = useState<File | null>(null);
  const activityFileRef = useRef<HTMLInputElement>(null);

  // Bump loading
  const [isBumping, setIsBumping] = useState(false);

  // Booking link team member selection (keyed by context)
  const [bookingUserId, setBookingUserId] = useState<Record<string, string>>({});

  // Orbit/Closed Lost reason prompts
  const [orbitPrompt, setOrbitPrompt] = useState<{ oppId: string; oppName: string; fromStage: string } | null>(null);
  const [orbitReasonValue, setOrbitReasonValue] = useState<OrbitReason>('no_response');
  const [orbitFollowupDays, setOrbitFollowupDays] = useState<number>(90);
  const [closedLostPrompt, setClosedLostPrompt] = useState<{ oppId: string; oppName: string; fromStage: string } | null>(null);
  const [closedLostReasonValue, setClosedLostReasonValue] = useState('');

  // Closed Won prompt
  const [closedWonPrompt, setClosedWonPrompt] = useState<{ oppId: string; oppName: string; dealValue: number; source: string } | null>(null);
  const [closedWonMode, setClosedWonMode] = useState<'new' | 'existing'>('new');
  const [closedWonEmail, setClosedWonEmail] = useState('');
  const [closedWonName, setClosedWonName] = useState('');
  const [closedWonClientId, setClosedWonClientId] = useState('');
  const [closedWonClients, setClosedWonClients] = useState<{ id: string; name: string; email: string }[]>([]);
  const [closedWonClientSearch, setClosedWonClientSearch] = useState('');
  const [closedWonClientPopoverOpen, setClosedWonClientPopoverOpen] = useState(false);

  // TG handle prompt
  const [tgHandlePrompt, setTgHandlePrompt] = useState<{ oppId: string; oppName: string } | null>(null);
  const [tgHandleValue, setTgHandleValue] = useState('');

  // Bucket assignment prompt (after discovery call)
  const [bucketPrompt, setBucketPrompt] = useState<{ oppId: string; oppName: string } | null>(null);
  const [bucketValue, setBucketValue] = useState<Bucket>('B');

  // Affiliate popover
  const [affiliatePopoverOpen, setAffiliatePopoverOpen] = useState(false);
  const [affiliateSearch, setAffiliateSearch] = useState('');

  // Table state
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());
  const [collapsedKanbanStages, setCollapsedKanbanStages] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editingValue, setEditingValue] = useState('');

  // Recalc state stays here because handleRecalculateAll touches
  // multiple page-local fetch fns; SalesDashboard owns its own
  // collapse + period-filter state (extracted 2026-06-03).
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Outreach state
  const [outreachOpps, setOutreachOpps] = useState<SalesPipelineOpportunity[]>([]);
  const [outreachTotal, setOutreachTotal] = useState(0);
  const [outreachPage, setOutreachPage] = useState(1);
  const [outreachLoading, setOutreachLoading] = useState(false);
  // 2026-06-03: dropped `searchTerm` from this shape — the unified
  // page-level `overallSearch` is now the single source of truth for
  // the Outreach search term. OutreachTab reads it directly via
  // context; the broadcast write that kept these in lockstep is gone.
  const [outreachFilters, setOutreachFilters] = useState<{
    dm_account?: DmAccount;
    bucket?: Bucket;
    bumpRange?: 'none' | '1-2' | '3+';
    owner_id?: string | 'mine';
  }>({ owner_id: 'mine' });
  const [outreachAllTotal, setOutreachAllTotal] = useState(0);
  const [selectedOutreach, setSelectedOutreach] = useState<string[]>([]);
  const [isBulkBumping, setIsBulkBumping] = useState(false);
  const [isBulkReassigning, setIsBulkReassigning] = useState(false);
  const [bulkOwnerOpen, setBulkOwnerOpen] = useState(false);
  const [isBulkMoving, setIsBulkMoving] = useState(false);
  // Orbit-tab multi-select — mirrors selectedOutreach. Bulk handlers below.
  const [selectedOrbit, setSelectedOrbit] = useState<string[]>([]);
  const [isOrbitBulkMoving, setIsOrbitBulkMoving] = useState(false);
  // outreachSearchTimeout + searchDebounceRef removed 2026-06-03 —
  // they powered per-tab search inputs that were dropped in the
  // unified-search migration. No live consumer of either.
  const OUTREACH_PAGE_SIZE = 50;

  // Actions tab state
  const [actionFilter, setActionFilter] = useState<'all' | 'mine' | 'urgent'>('mine');
  const [actionPhaseFilter, setActionPhaseFilter] = useState<'all' | 'outreach' | 'closing' | 'orbit' | 'non_urgent'>('all');
  const [alertCardFilter, setAlertCardFilter] = useState<'none' | 'booking_needed' | 'overdue' | 'stale' | 'at_risk' | 'meetings'>('none');
  const [actionSort, setActionSort] = useState<'priority' | 'stage' | 'temperature' | 'value' | 'name' | 'newest' | 'oldest' | 'timing'>(() => {
    if (typeof window !== 'undefined' && user?.id) {
      return (localStorage.getItem(`action_sort_${user.id}`) as any) || 'priority';
    }
    return 'priority';
  });
  const [executingAction, setExecutingAction] = useState<string | null>(null);
  const [actionGuidance, setActionGuidance] = useState<{ label: string; hint: string } | null>(null);

  // Overview tab collapsed state
  // [Actions consolidation, May 2026] Added 'actions' as the topmost
  // section in the Overall tab — defaults to OPEN since action items
  // are the most time-sensitive content on the page. Other sections
  // remain default-closed to keep first-paint compact.
  // [Tab merge May 2026] Outreach defaults OPEN now that the standalone
  // Outreach tab has been removed — landing on Overall should show the
  // primary work surfaces (Actions + Outreach) immediately. Pipeline,
  // Orbit, Nurture stay default-closed to keep first-paint compact.
  // `overviewSections` was per-section collapse state for the old
  // sandwich Overall layout (Actions / Outreach / Pipeline / Orbit /
  // Nurture as expandable sections). The 2026-06-03 OverviewTab
  // redesign dropped that layout for a thin digest (stats strip +
  // queue), so the state had no consumer left. Removed along with the
  // fetch-trigger reads that referenced its `outreach` flag.

  // Templates tab state
  const [templates, setTemplates] = useState<SalesDmTemplate[]>([]);
  const [templateStageFilter, setTemplateStageFilter] = useState<string>('all');
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SalesDmTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState<CreateSalesDmTemplateData>({ name: '', stage: 'cold_dm', sub_type: 'general', content: '' });
  const [isTemplateSubmitting, setIsTemplateSubmitting] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<SalesDmTemplate | null>(null);
  const [templateTagFilter, setTemplateTagFilter] = useState<string>('all');

  // Activity log popup (shown after action execution)
  const [activityLogPrompt, setActivityLogPrompt] = useState<{
    oppId: string;
    oppName: string;
    type: ActivityType;
    title: string;
    showMeetingPicker?: boolean;
    ownerId?: string;
  } | null>(null);
  const [activityLogForm, setActivityLogForm] = useState<{
    title: string;
    description: string;
    outcome: string;
    next_step: string;
    next_step_date?: string;
    meeting_date?: string;
    meeting_time?: string;
    co_owner_ids?: string[];
  }>({ title: '', description: '', outcome: '', next_step: '' });
  const [isActivityLogSubmitting, setIsActivityLogSubmitting] = useState(false);
  const [templatePopoverOpen, setTemplatePopoverOpen] = useState(false);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  // ============================================
  // Dashboard Metrics (computed from opportunities)
  // ============================================

  // Single-pass alert metrics — always from ALL opportunities (unfiltered)
  const alertMetrics = useMemo(() => {
    const nowMs = Date.now();
    const nowIso = new Date().toISOString();
    const nowDate = new Date();
    const todayStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const pipelineSet = new Set(PIPELINE_STAGES as string[]);

    let overdueFollowups = 0, staleDeals = 0, dealsAtRisk = 0, meetingsThisWeek = 0, meetingsToday = 0;
    const closingStages = new Set(['discovery_done', 'proposal_call', 'v2_contract']);

    for (const o of opportunities) {
      const isPipeline = pipelineSet.has(o.stage);
      if (isPipeline && o.next_meeting_at) {
        if (o.next_meeting_at < nowIso) overdueFollowups++;
        const mt = new Date(o.next_meeting_at);
        if (mt >= todayStart && mt < weekEnd) meetingsThisWeek++;
        if (mt >= todayStart && mt < tomorrowStart) meetingsToday++;
      }
      if (isPipeline) {
        const lastDate = o.last_contacted_at || o.last_bump_date || o.created_at;
        if (!lastDate || Math.floor((nowMs - new Date(lastDate).getTime()) / 86400000) >= 7) staleDeals++;
      }
      if (closingStages.has(o.stage) && o.temperature_score < 40) dealsAtRisk++;
    }

    return { bamfamViolations: metrics.bamfamViolations, overdueFollowups, staleDeals, dealsAtRisk, meetingsThisWeek, meetingsToday };
  }, [opportunities, metrics.bamfamViolations]);


  // ============================================
  // Data Fetching
  // ============================================

  // ─── Per-resource fetchers ────────────────────────────────────────
  // Split out from a monolithic fetchData on 2026-05-06 (audit). Was:
  // 24 mutation handlers each refetched all 6 resources (~1000+ opps,
  // affiliates, users, metrics, outreach count, templates) after every
  // single-cell edit / drag / bump. Now mutations refetch only what
  // could have changed, and most use optimistic local updates. The
  // non-opp resources (affiliates, users, templates) almost never
  // change during a session — refetching them on every keystroke was
  // pure waste.
  //
  // fetchData() is kept as the all-in-one for initial mount and when
  // the operator explicitly wants a fresh slate.

  const fetchOpportunities = useCallback(async () => {
    try {
      const opps = await SalesPipelineService.getAll();
      setOpportunities(opps);
    } catch (err) {
      console.error('Error fetching opportunities:', err);
    }
  }, []);

  const fetchMetrics = useCallback(async () => {
    try {
      const met = await SalesPipelineService.getMetrics();
      setMetrics(met);
    } catch (err) {
      console.error('Error fetching metrics:', err);
    }
  }, []);

  const fetchAffiliates = useCallback(async () => {
    try {
      const affs = await CRMService.getAllAffiliates();
      setAffiliates(affs);
    } catch (err) {
      console.error('Error fetching affiliates:', err);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const tmpls = await SalesPipelineService.getTemplates();
      setTemplates(tmpls);
    } catch (err) {
      console.error('Error fetching templates:', err);
    }
  }, []);

  const fetchOutreachCount = useCallback(async () => {
    try {
      const outreachCount = await SalesPipelineService.getColdDmsPaginated(1, 1, {});
      setOutreachAllTotal(outreachCount.count);
    } catch (err) {
      console.error('Error fetching outreach count:', err);
    }
  }, []);

  // [Orbit split, May 2026] Fetch the set of opp IDs that ever moved
  // past cold_dm. Cheap (one indexed table scan) and only refreshed
  // alongside opportunities, so it's a once-per-page-load cost.
  const fetchPreviouslyEngagedIds = useCallback(async () => {
    try {
      const ids = await SalesPipelineService.getPreviouslyEngagedIds();
      setPreviouslyEngagedIds(ids);
    } catch (err) {
      console.error('Error fetching previously-engaged ids:', err);
      // Leave the set as null so the UI keeps its fallback behavior
      // rather than mis-categorizing every opp as cold-DM orbit.
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [opps, affs, usrs, met, outreachCount, tmpls, engagedIds] = await Promise.all([
        SalesPipelineService.getAll(),
        CRMService.getAllAffiliates(),
        UserService.getActiveUsers(),
        SalesPipelineService.getMetrics(),
        SalesPipelineService.getColdDmsPaginated(1, 1, {}),
        SalesPipelineService.getTemplates(),
        SalesPipelineService.getPreviouslyEngagedIds(),
      ]);
      setOpportunities(opps);
      setAffiliates(affs);
      setUsers(usrs);
      setMetrics(met);
      setOutreachAllTotal(outreachCount.count);
      setTemplates(tmpls);
      setPreviouslyEngagedIds(engagedIds);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Optimistic update helpers ────────────────────────────────────
  // Local state mutations that the UI sees immediately, without
  // waiting for a refetch. Pair each with a server mutation; if the
  // server call fails, call fetchOpportunities() to revert. The point
  // is to avoid the 1000-row refetch on the happy path.

  const applyOppPatch = useCallback((oppId: string, patch: Partial<SalesPipelineOpportunity>) => {
    setOpportunities(prev => prev.map(o =>
      o.id === oppId ? { ...o, ...patch, updated_at: new Date().toISOString() } : o
    ));
  }, []);

  const removeOpp = useCallback((oppId: string) => {
    setOpportunities(prev => prev.filter(o => o.id !== oppId));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Persist action sort preference per user
  useEffect(() => {
    if (typeof window !== 'undefined' && user?.id) {
      localStorage.setItem(`action_sort_${user.id}`, actionSort);
    }
  }, [actionSort, user?.id]);

  const fetchActivities = async (oppId: string) => {
    try {
      // [Activity Timeline auto-stamp] Pull the unified feed (manual +
      // stage history + bookings + Telegram). Pass the opp so the
      // service can scope Telegram messages by gc (group chat id).
      const opp = opportunities.find(o => o.id === oppId);
      const acts = await SalesPipelineService.getUnifiedTimeline(oppId, opp ? { gc: opp.gc } : undefined);
      setActivities(acts);
    } catch (err) {
      console.error('Error fetching activities:', err);
    }
  };

  // Outreach data fetching
  //
  // Decoupled from the all-total count fetch on 2026-05-06 (audit #2):
  // previously `fetchOutreach` ran TWO queries — the filtered/paginated
  // result + an unfiltered count for the "X of Y" display. The unfiltered
  // count was being refetched on every page change + every filter change
  // even though it only changes when opps are created/deleted or moved
  // in/out of cold_dm. That's roughly half the queries this function
  // generates, all wasted on tab navigation. Now only the filtered query
  // runs here; the all-total is refetched explicitly by mutation handlers
  // via `fetchOutreachCount()`.
  const fetchOutreach = useCallback(async () => {
    setOutreachLoading(true);
    try {
      // `searchTerm` is no longer stored on `outreachFilters` — pulled
      // from the page-level unified search at fetch time.
      const resolvedFilters = {
        ...outreachFilters,
        owner_id: outreachFilters.owner_id === 'mine' ? (user?.id || undefined) : outreachFilters.owner_id,
        searchTerm: overallSearch || undefined,
      };
      const result = await SalesPipelineService.getColdDmsPaginated(outreachPage, OUTREACH_PAGE_SIZE, resolvedFilters);
      setOutreachOpps(result.data);
      setOutreachTotal(result.count);
    } catch (err) {
      console.error('Error fetching outreach:', err);
    } finally {
      setOutreachLoading(false);
    }
  }, [outreachPage, outreachFilters, overallSearch, user?.id]);

  useEffect(() => {
    // 2026-06-03: Outreach was re-added as its own tab + the Overall
    // collapsible Outreach section is gone, so the only reason to
    // fetch is when the user lands on the Outreach tab itself.
    if (activeTab === 'outreach') {
      fetchOutreach();
    }
  }, [activeTab, fetchOutreach]);

  // Unified search — broadcasts the single page-level input into
  // every per-tab filter. Was previously a "broadcast from Overall"
  // effect that only fired while the Overall tab was active; per-tab
  // search inputs lived alongside it. 2026-06-03: pulled the search
  // up to the page header, dropped the per-tab inputs, and added
  // Actions to the broadcast (was missing). User mental model: there
  // is ONE search bar; everything filters from it.
  useEffect(() => {
    const term = overallSearch;
    setPipelineSearch(term);
    setOrbitSearch(term);
    setActionsSearch(term);
    // Outreach: reset to page 1 when the term changes. The actual
    // filter is read directly from `overallSearch` in OutreachTab —
    // the redundant copy on `outreachFilters.searchTerm` was dropped
    // 2026-06-03.
    setOutreachPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overallSearch]);

  // ============================================
  // Filtered Opportunities
  // ============================================

  const matchesSearch = (opp: SalesPipelineOpportunity, term: string) => {
    if (!term) return true;
    const t = term.toLowerCase();
    return opp.name.toLowerCase().includes(t) || (opp.poc_handle?.toLowerCase().includes(t) ?? false);
  };

  const filteredOpportunities = useMemo(() => opportunities.filter(opp => {
    if (!matchesSearch(opp, pipelineSearch)) return false;
    if (pathFilter === 'closer' && opp.dm_account !== 'closer') return false;
    if (pathFilter === 'sdr' && opp.dm_account !== 'sdr') return false;
    return true;
  }), [opportunities, pipelineSearch, pathFilter]);

  const oppsByStage = useMemo(() => {
    const map = new Map<SalesPipelineStage, SalesPipelineOpportunity[]>();
    for (const o of filteredOpportunities) {
      const stage = o.stage as SalesPipelineStage;
      if (!map.has(stage)) map.set(stage, []);
      map.get(stage)!.push(o);
    }
    map.forEach(arr => arr.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
    return map;
  }, [filteredOpportunities]);

  const getStageOpps = (stage: SalesPipelineStage) => oppsByStage.get(stage) || [];

  const visiblePipelineStages = (pathFilter === 'closer' ? PATH_A_STAGES : PIPELINE_STAGES).filter(s => s !== 'cold_dm');

  const allOrbitOpps = useMemo(() => opportunities.filter(o => o.stage === 'orbit'), [opportunities]);

  // [Orbit split, May 2026] Per user feedback: cold-DM orbit (never
  // responded) and engaged orbit (responded at some point, paused
  // later) have very different follow-up profiles and shouldn't be
  // counted together. We use crm_stage_history (already written by
  // SalesPipelineService.update on every stage change) as the source
  // of truth for "did this opp ever leave cold_dm?".
  //
  // As a backup for rows missing history (legacy), we OR-in explicit
  // engagement signals: last_reply_at / qualified_at /
  // discovery_call_at / proposal_sent_at / calendly_booked_date.
  //
  // Returns null until the engaged-ids fetch resolves — UI shows the
  // single combined view in the meantime rather than guessing wrong.
  const [previouslyEngagedIds, setPreviouslyEngagedIds] = useState<Set<string> | null>(null);
  const isPreviouslyEngaged = useCallback((opp: SalesPipelineOpportunity): boolean => {
    if (previouslyEngagedIds?.has(opp.id)) return true;
    return !!(opp.last_reply_at || opp.qualified_at || opp.discovery_call_at || opp.proposal_sent_at || opp.calendly_booked_date);
  }, [previouslyEngagedIds]);
  const coldDmOrbitOpps = useMemo(
    () => allOrbitOpps.filter(o => !isPreviouslyEngaged(o)),
    [allOrbitOpps, isPreviouslyEngaged],
  );
  const engagedOrbitOpps = useMemo(
    () => allOrbitOpps.filter(o => isPreviouslyEngaged(o)),
    [allOrbitOpps, isPreviouslyEngaged],
  );
  // Nurture opportunities — surfaced in the Overview tab. Without this they
  // were essentially invisible (hidden everywhere except 2 of 5 Action sub-tabs),
  // so a deal set to nurture would silently drop out of the daily view.
  const allNurtureOpps = useMemo(() => opportunities.filter(o => o.stage === 'nurture'), [opportunities]);
  const orbitOpps = useMemo(() => orbitSearch ? allOrbitOpps.filter(o => matchesSearch(o, orbitSearch)) : allOrbitOpps, [allOrbitOpps, orbitSearch]);
  // Orbit grouping — flat 2026-05-14. The previous per-reason split
  // caused two problems:
  //   1. Opps created directly at stage=orbit (no reason picked yet)
  //      had orbit_reason=null and matched none of the reason buckets,
  //      so they silently disappeared from the UI.
  //   2. The team consistently said the per-reason categorization
  //      wasn't useful as a layout dimension — they just want to see
  //      all orbit opps and the reason as a tag.
  // Now we show one flat table sorted by name (so same-project POCs
  // cluster) with a "Reason" badge column on each row. orbit_reason
  // still gets set via the orbit prompt on stage transitions — we
  // just don't use it to partition the view anymore.
  const sortedOrbit = useMemo(
    () => [...orbitOpps].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [orbitOpps],
  );
  const orbitNameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    sortedOrbit.forEach(o => counts.set(o.name || '', (counts.get(o.name || '') || 0) + 1));
    return counts;
  }, [sortedOrbit]);
  const orbitTotalValue = useMemo(
    () => orbitOpps.reduce((s, o) => s + (o.deal_value || 0), 0),
    [orbitOpps],
  );

  // [Orbit split, May 2026] Split + sorted versions for the two-bucket
  // render. Search box (orbitSearch) applies to BOTH so the user can
  // narrow across both sections at once — sortedColdDmOrbit and
  // sortedEngagedOrbit are derived from the SAME search-filtered set.
  const filteredColdDmOrbit = useMemo(
    () => orbitSearch ? coldDmOrbitOpps.filter(o => matchesSearch(o, orbitSearch)) : coldDmOrbitOpps,
    [coldDmOrbitOpps, orbitSearch],
  );
  const filteredEngagedOrbit = useMemo(
    () => orbitSearch ? engagedOrbitOpps.filter(o => matchesSearch(o, orbitSearch)) : engagedOrbitOpps,
    [engagedOrbitOpps, orbitSearch],
  );
  const sortedColdDmOrbit = useMemo(
    () => [...filteredColdDmOrbit].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [filteredColdDmOrbit],
  );
  const sortedEngagedOrbit = useMemo(
    () => [...filteredEngagedOrbit].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [filteredEngagedOrbit],
  );
  const coldDmOrbitTotalValue = useMemo(
    () => filteredColdDmOrbit.reduce((s, o) => s + (o.deal_value || 0), 0),
    [filteredColdDmOrbit],
  );
  const engagedOrbitTotalValue = useMemo(
    () => filteredEngagedOrbit.reduce((s, o) => s + (o.deal_value || 0), 0),
    [filteredEngagedOrbit],
  );

  // Memoized outreach grouping — sort by name and count POCs per project
  const { sortedOutreach, outreachNameCounts } = useMemo(() => {
    const sorted = [...outreachOpps].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const counts = new Map<string, number>();
    sorted.forEach(o => counts.set(o.name || '', (counts.get(o.name || '') || 0) + 1));
    return { sortedOutreach: sorted, outreachNameCounts: counts };
  }, [outreachOpps]);

  // ─── Forecast tab data ──────────────────────────────────────────────
  // Post-proposal stages we want visibility into. Excludes closed_won
  // (no need to chase) and closed_lost (already gone). proposal_call
  // and v2_contract belong here too — once a proposal is out, we want
  // to see it through to close.
  const POST_PROPOSAL_STAGES: SalesPipelineStage[] = useMemo(
    () => ['proposal_sent', 'proposal_call', 'v2_contract'],
    [],
  );

  // STAGE_WIN_PROB and isOppAtRisk moved to `lib/salesPipelineHelpers.ts`
  // on 2026-06-02 so the extracted ForecastPanel + future MetricsPanel
  // share the same definitions as the forecastKpis memo below.
  const forecastOpps = useMemo(
    () => opportunities.filter(o => POST_PROPOSAL_STAGES.includes(o.stage as SalesPipelineStage)),
    [opportunities, POST_PROPOSAL_STAGES],
  );

  // Group by expected close period. Bucket boundaries match Calendly /
  // Salesforce conventions. "No Date" sits last because that's the
  // problematic bucket — deals nobody has dated yet.
  const forecastByPeriod = useMemo(() => {
    const today = new Date();
    const thisSunday = endOfWeek(today, { weekStartsOn: 1 });
    const nextSunday = addDays(thisSunday, 7);
    const eom = endOfMonth(today);
    const eom2 = endOfMonth(addMonths(today, 1));

    const groups = {
      thisWeek:  [] as SalesPipelineOpportunity[],
      nextWeek:  [] as SalesPipelineOpportunity[],
      thisMonth: [] as SalesPipelineOpportunity[],
      nextMonth: [] as SalesPipelineOpportunity[],
      later:     [] as SalesPipelineOpportunity[],
      noDate:    [] as SalesPipelineOpportunity[],
    };

    for (const o of forecastOpps) {
      if (!o.expected_close_date) { groups.noDate.push(o); continue; }
      const d = new Date(o.expected_close_date + 'T00:00:00');
      if      (d <= thisSunday) groups.thisWeek.push(o);
      else if (d <= nextSunday) groups.nextWeek.push(o);
      else if (d <= eom)        groups.thisMonth.push(o);
      else if (d <= eom2)       groups.nextMonth.push(o);
      else                      groups.later.push(o);
    }

    // Sort each bucket by oldest proposal first — those need attention sooner.
    const sortByProposalAge = (a: SalesPipelineOpportunity, b: SalesPipelineOpportunity) => {
      const aT = a.proposal_sent_at ? new Date(a.proposal_sent_at).getTime() : 0;
      const bT = b.proposal_sent_at ? new Date(b.proposal_sent_at).getTime() : 0;
      return aT - bT;
    };
    Object.values(groups).forEach(arr => arr.sort(sortByProposalAge));
    return groups;
  }, [forecastOpps]);

  // ─── Outreach metrics computation ───────────────────────────────────
  // Per-user metrics over a rolling window. Used by both the Outreach-tab
  // metrics strip (current user, last 30d) and the Metrics tab (any user,
  // any window, plus team-total comparison).

  /**
   * Compute metrics for a single user over a date range.
   * Touch 1s   = opps owned by user that have had ≥1 outbound message
   *              (bump_number ≥ 1) and were created in window.
   *              NOTE: stage filter removed 2026-05-14. Previously this
   *              only counted opps still in cold_dm, which meant the
   *              moment a prospect replied (and moved to warm) they
   *              dropped out of the denominator → reply rate jumped up
   *              artificially. Replies are by definition a subset of
   *              touch 1s, so they belong in the denominator.
   * Replies   = opps owned by user that are in any stage past cold_dm
   *             (proxy for "got a reply"), created in window.
   * Qualified = opps owned by user with ≥3 of 5 qual_* checks, updated in window.
   * Calls     = bookings owned by user (booking_page.user_id), confirmed,
   *             meeting_date in window.
   */
  const computeOutreachMetrics = useCallback((userId: string, days: number) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffMs = cutoff.getTime();

    const userOpps = opportunities.filter(o => o.owner_id === userId);
    const inWindow = (iso: string | null | undefined) =>
      !!iso && new Date(iso).getTime() >= cutoffMs;

    // [Accuracy fix May 2026] touch1s + replies now come from
    // crm_activities events (the source of truth) instead of opp row
    // proxies. The old proxy version inflated replies 5-10× because
    // updated_at flips on every minor edit.

    // touch1s = distinct opps where THIS USER's first-ever outbound
    // touch (message or bump) landed inside the window. First-touch
    // semantics match the funnel API's definition so the per-user
    // numbers reconcile with the team-level view.
    const userOutbound = metricsActivities
      .filter(a => a.owner_id === userId && a.direction === 'outbound' && (a.type === 'message' || a.type === 'bump') && a.opportunity_id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const userFirstTouchPerOpp = new Map<string, string>();
    for (const a of userOutbound) {
      if (!userFirstTouchPerOpp.has(a.opportunity_id!)) {
        userFirstTouchPerOpp.set(a.opportunity_id!, a.created_at);
      }
    }
    let touch1s = 0;
    for (const ts of Array.from(userFirstTouchPerOpp.values())) {
      if (ts >= cutoff.toISOString()) touch1s++;
    }

    // replies = distinct opps with an inbound message attributed to
    // THIS USER inside the window. owner_id on the activity = whoever
    // logged it (which is the right semantic for per-user attribution;
    // if the opp's owner was reassigned later, the reply still credits
    // whoever was actually working it at reply-time).
    const replies = new Set(
      metricsActivities
        .filter(a => a.owner_id === userId && a.direction === 'inbound' && a.type === 'message' && a.opportunity_id && a.created_at >= cutoff.toISOString())
        .map(a => a.opportunity_id)
    ).size;

    // qualified — keep the 3+ qual-flag threshold but anchor the
    // window check to qualified_at (auto-stamped by CRMService when
    // an opp first reaches a deal-qualified stage) instead of
    // updated_at. Legacy rows where qualified_at is null but the opp
    // already has 3+ flags + was CREATED in window still count, so
    // we don't lose pre-stamping history entirely.
    const qualified = userOpps.filter(o => {
      const checks = [o.qual_budget, o.qual_dm, o.qual_timeline, o.qual_scope, o.qual_fit].filter(Boolean).length;
      if (checks < 3) return false;
      const qa = (o as any).qualified_at as string | null | undefined;
      if (qa) return inWindow(qa);
      // Fallback for legacy rows with no qualified_at stamp:
      return inWindow(o.created_at);
    }).length;

    const userBookings = metricsBookings.filter(b =>
      b.booking_page?.user_id === userId &&
      b.status === 'confirmed' &&
      new Date(b.meeting_date).getTime() >= cutoffMs
    );
    const callsBooked = userBookings.length;
    const callsHeld = userBookings.filter(b => b.attendance_status === 'held').length;
    const noShows = userBookings.filter(b => b.attendance_status === 'no_show').length;
    const callsPending = userBookings.filter(b =>
      b.attendance_status === null && new Date(b.meeting_date) < new Date()
    ).length;

    const replyRate = touch1s > 0 ? replies / touch1s : 0;
    const qualificationRate = replies > 0 ? qualified / replies : 0;
    const showRate = callsBooked > 0 ? callsHeld / (callsBooked - callsPending || callsBooked) : 0;

    return {
      touch1s, replies, replyRate,
      qualified, qualificationRate,
      callsBooked, callsHeld, noShows, callsPending, showRate,
    };
  }, [opportunities, metricsBookings, metricsActivities]);

  // Load bookings + activities the first time:
  //   - the user lands on Overall with the Outreach section open
  //     (the "My outreach · last 30 days" strip lives inside
  //      renderOutreachTab, which is rendered there), OR
  //   - the top sub-section is on Metrics (for the team scorecard).
  // Pull 90 days of bookings + all-time activities (capped at 10k rows
  // — matches the funnel API's heuristic) so both range toggles work
  // without a refetch.
  useEffect(() => {
    // Metrics data feeds the F&M Metrics sub-tab AND the Outreach
    // tab's "My outreach · last 30 days" strip. Fetch when either is
    // in view. The old Overall.outreach-section branch was dropped
    // with the 2026-06-03 redesign.
    const wantsMetrics = topSectionTab === 'metrics' || activeTab === 'outreach';
    if (!wantsMetrics) return;

    if (metricsBookings.length === 0 && !metricsBookingsLoading) {
      setMetricsBookingsLoading(true);
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 90);
      BookingService.getBookingsForMetrics(from.toISOString(), to.toISOString())
        .then(rows => setMetricsBookings(rows))
        .catch(err => console.error('Error loading metrics bookings:', err))
        .finally(() => setMetricsBookingsLoading(false));
    }

    if (metricsActivities.length === 0 && !metricsActivitiesLoading) {
      setMetricsActivitiesLoading(true);
      // Two parallel pulls:
      //   - outbound: ALL-time so we can compute the per-user first-
      //     touch per opp (matches funnel API semantic). Capped at 10k.
      //   - inbound:  last 90 days only — replies older than 90d don't
      //     show up in any current range option, so pulling more would
      //     waste bandwidth. Capped at 5k.
      Promise.all([
        SalesPipelineService.getActivitiesForMetrics('outbound'),
        SalesPipelineService.getActivitiesForMetrics('inbound', 90),
      ])
        .then(([outbound, inbound]) => {
          setMetricsActivities([...outbound, ...inbound]);
        })
        .catch(err => console.error('Error loading metrics activities:', err))
        .finally(() => setMetricsActivitiesLoading(false));
    }

    if (!metricsUserId && user?.id) setMetricsUserId(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, topSectionTab]);

  /**
   * forecastKpis — KPI roll-up powering THREE consumer surfaces (all
   * showing the same numbers, which is intentional — these are the
   * standup commit numbers):
   *
   *   1. OverviewTab's one-line stats strip (Pipeline / Weighted /
   *      This month / At risk)
   *   2. Forecast & Metrics collapsed-state inline summary (same
   *      four numbers, repeated)
   *   3. ForecastPanel's KPI strip inside the expanded F&M section
   *
   * Scope: **post-proposal opps only** (`forecastOpps` = stages where
   * a proposal has been sent). Conservative weighting via
   * `STAGE_WIN_PROB`. See `dashboardMetrics` above for the broader
   * "all pipeline stages" view — that one uses `STAGE_WIN_PROB_BROAD`
   * and produces aspirational rather than commit numbers.
   */
  const forecastKpis = useMemo(() => {
    const totalValue = forecastOpps.reduce((s, o) => s + (o.deal_value || 0), 0);
    const atRisk = forecastOpps.filter(isOppAtRisk);
    const atRiskValue = atRisk.reduce((s, o) => s + (o.deal_value || 0), 0);
    const thisMonthValue = [...forecastByPeriod.thisWeek, ...forecastByPeriod.nextWeek, ...forecastByPeriod.thisMonth]
      .reduce((s, o) => s + (o.deal_value || 0), 0);
    // Weighted forecast = sum(deal_value × win_probability) across all
    // post-proposal opps. Quick gut check on how much of the pipeline
    // is realistically going to close.
    const weighted = forecastOpps.reduce(
      (s, o) => s + (o.deal_value || 0) * (STAGE_WIN_PROB[o.stage] || 0.2),
      0,
    );
    return { totalValue, atRiskCount: atRisk.length, atRiskValue, thisMonthValue, weighted };
    // STAGE_WIN_PROB is now a module-level const (lib/salesPipelineHelpers.ts)
    // so it's stable across renders — no need to list it as a dep.
  }, [forecastOpps, forecastByPeriod]);

  // ============================================
  // CRUD Handlers
  // ============================================

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setIsSubmitting(true);
    try {
      // Capture the created row so we can optimistically append before
      // the background refetch resolves. Without this the user sees a
      // stale view for ~300-800ms (getAll paginates 1k+ rows), which
      // reads as "the opp didn't get created" → manual page refresh.
      const created = await SalesPipelineService.create({
        ...form,
        stage: form.stage || ('cold_dm' as OpportunityStage),
        temperature_score: form.temperature_score ?? 50,
      });
      setIsCreateOpen(false);
      setForm({ name: '' });

      // Optimistic append into the global opportunities slice — covers
      // Pipeline / Orbit / Overview which all derive from it.
      if (created?.id) {
        setOpportunities(prev => {
          // Guard against double-insert from a fast refetch landing first.
          if (prev.some(o => o.id === created.id)) return prev;
          return [created as SalesPipelineOpportunity, ...prev];
        });
      }

      // Outreach has its own paginated state (outreachOpps) separate from
      // the global opportunities list — refetch it explicitly so a newly-
      // created cold_dm opp shows up in the Outreach tab too.
      if ((created?.stage || form.stage || 'cold_dm') === 'cold_dm') {
        void fetchOutreach();
        void fetchOutreachCount();
      }

      // Background reconciliation — pulls server-side computed fields
      // (composite_score etc.) and overwrites the optimistic row.
      void fetchOpportunities();
      void fetchMetrics();
    } catch (err: any) {
      toast({ title: 'Couldn’t create opportunity', description: err?.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingOpp || !form.name.trim()) return;
    setIsSubmitting(true);
    try {
      await SalesPipelineService.update(editingOpp.id, form);
      const oppId = editingOpp.id;
      setSlideOverMode('view');
      setEditingOpp(null);
      setForm({ name: '' });
      // Optimistic: form already represents desired state.
      applyOppPatch(oppId, form as Partial<SalesPipelineOpportunity>);
      void fetchMetrics();
    } catch (err: any) {
      toast({ title: 'Couldn’t update opportunity', description: err?.message, variant: 'destructive' });
      void fetchOpportunities(); // revert
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyBookingLink = async (userId: string, oppId: string) => {
    try {
      const bp = await BookingService.getBookingPageByUserId(userId);
      if (bp?.slug) {
        const url = `https://app.holohive.io/public/book/${bp.slug}?opp=${oppId}`;
        navigator.clipboard.writeText(url);
        toast({ title: 'Booking link copied', description: url });
      } else {
        toast({ title: 'No booking page', description: 'This team member does not have a booking page set up.', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Booking link failed', description: err instanceof Error ? err.message : 'Failed to get booking link', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDialog({
      open: true,
      title: 'Delete opportunity?',
      description: 'This permanently removes the opportunity and all its activity history. This cannot be undone.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await SalesPipelineService.delete(id);
          if (slideOverOpp?.id === id) setSlideOverOpp(null);
          removeOpp(id);
          void fetchMetrics();
          if (activeTab === 'outreach') { void fetchOutreach(); void fetchOutreachCount(); }
        } catch (err: any) {
          console.error('Error deleting:', err);
          toast({ title: 'Couldn’t delete opportunity', description: err?.message, variant: 'destructive' });
          void fetchOpportunities(); // revert
        }
      },
    });
  };

  // Auto-log an inbound "Replied" activity when a cold-outreach opp
  // moves from cold_dm into warm. The premise: outbound DM → no reply
  // = stays in cold_dm. They move to warm precisely because they
  // replied. SalesPipelineService.createActivity already auto-stamps
  // last_reply_at + last_contacted_at on inbound messages, so we just
  // need to write the activity row — no separate milestone update
  // here. Scoped to source='cold_outreach' so we don't mis-log
  // warm-ups from inbound/referral/event sources where the warming
  // isn't a reply event.
  const autoLogColdOutreachReply = async (opp: SalesPipelineOpportunity) => {
    if (opp.source !== 'cold_outreach') return;
    try {
      await SalesPipelineService.createActivity({
        opportunity_id: opp.id,
        type: 'message',
        direction: 'inbound',
        title: 'Replied',
        description: 'Auto-logged when moved from Cold DM to Warm.',
      });
      // Optimistic local patch so the funnel + last-reply timestamps
      // update immediately without a refetch.
      applyOppPatch(opp.id, {
        last_reply_at: new Date().toISOString(),
        last_contacted_at: new Date().toISOString(),
      } as Partial<SalesPipelineOpportunity>);
    } catch (err) {
      console.error('Error auto-logging reply on cold→warm:', err);
    }
  };

  const handleStageChange = async (oppId: string, newStage: SalesPipelineStage, currentStage: string) => {
    const oppName = opportunities.find(o => o.id === oppId)?.name || '';
    if (newStage === 'orbit') {
      setOrbitPrompt({ oppId, oppName, fromStage: currentStage });
      return;
    }
    if (newStage === 'v2_closed_lost') {
      setClosedLostPrompt({ oppId, oppName, fromStage: currentStage });
      return;
    }
    if (newStage === 'v2_closed_won') {
      const opp = opportunities.find(o => o.id === oppId);
      try {
        const clients = await ClientService.getAllClients();
        setClosedWonClients(clients.map(c => ({ id: c.id, name: c.name, email: c.email || '' })));
      } catch (err) {
        console.error('Error fetching clients:', err);
        setClosedWonClients([]);
      }
      setClosedWonName(oppName);
      setClosedWonEmail('');
      setClosedWonClientId('');
      setClosedWonClientSearch('');
      setClosedWonMode('new');
      setClosedWonPrompt({
        oppId,
        oppName,
        dealValue: (opp as any)?.deal_value || 0,
        source: (opp as any)?.source || '',
      });
      return;
    }
    if (newStage === 'tg_intro') {
      setTgHandlePrompt({ oppId, oppName });
      setTgHandleValue('');
      return;
    }
    if (newStage === 'discovery_done') {
      setBucketPrompt({ oppId, oppName });
      setBucketValue('B');
      return;
    }
    try {
      const updateData: any = { stage: newStage as OpportunityStage };
      // Mark last_contacted_at so the past-meeting check knows the outcome was handled
      updateData.last_contacted_at = new Date().toISOString();
      // Note: co-owners are now assigned in the activity log popup when booking a meeting
      await SalesPipelineService.update(oppId, updateData);
      applyOppPatch(oppId, updateData);
      // Cold-outreach replied — auto-log the inbound activity so the
      // funnel + activity timeline reflect the reply without anyone
      // having to remember to log it manually.
      if (currentStage === 'cold_dm' && newStage === 'warm') {
        const opp = opportunities.find(o => o.id === oppId);
        if (opp) await autoLogColdOutreachReply(opp);
      }
      void fetchMetrics();
      // [Orbit split, May 2026] Any transition out of cold_dm flips an
      // opp into the "engaged" bucket — refresh the engaged-ids set so
      // the orbit split is correct after the next orbit move without
      // requiring a page reload. (The orbit / closed_lost paths return
      // early above and never hit this code path, so newStage here is
      // already guaranteed to be one of the engaged stages.)
      if (currentStage === 'cold_dm' && newStage !== 'cold_dm') {
        void fetchPreviouslyEngagedIds();
      }
      if (activeTab === 'outreach') { void fetchOutreach(); void fetchOutreachCount(); }
    } catch (err) {
      console.error('Error changing stage:', err);
      void fetchOpportunities(); // revert
    }
  };

  const confirmOrbit = async () => {
    if (!orbitPrompt) return;
    const { oppId, oppName } = orbitPrompt;
    const reasonLabel = ORBIT_REASONS.find(r => r.value === orbitReasonValue)?.label || orbitReasonValue;
    const patch = {
      stage: 'orbit' as OpportunityStage,
      orbit_reason: orbitReasonValue,
      orbit_followup_days: orbitFollowupDays,
    };
    try {
      await SalesPipelineService.update(oppId, patch);
      setOrbitPrompt(null);
      setOrbitReasonValue('no_response');
      setOrbitFollowupDays(90);
      applyOppPatch(oppId, patch as Partial<SalesPipelineOpportunity>);
      void fetchMetrics();
      // Open activity log popup
      openActivityLogPrompt(oppId, oppName, 'note', `Moved to orbit — ${reasonLabel}`);
    } catch (err) {
      console.error('Error moving to orbit:', err);
      void fetchOpportunities(); // revert
    }
  };

  const confirmTgHandle = async () => {
    if (!tgHandlePrompt || !tgHandleValue.trim()) return;
    const { oppId, oppName } = tgHandlePrompt;
    const patch = {
      stage: 'tg_intro' as OpportunityStage,
      tg_handle: tgHandleValue.trim(),
      last_contacted_at: new Date().toISOString(),
    };
    try {
      await SalesPipelineService.update(oppId, patch as any);
      setTgHandlePrompt(null);
      setTgHandleValue('');
      applyOppPatch(oppId, patch as Partial<SalesPipelineOpportunity>);
      void fetchMetrics();
      openActivityLogPrompt(oppId, oppName, 'message', `Got TG handle: ${patch.tg_handle}`);
    } catch (err) {
      console.error('Error saving TG handle:', err);
      void fetchOpportunities();
    }
  };

  const confirmBucket = async () => {
    if (!bucketPrompt) return;
    const { oppId, oppName } = bucketPrompt;
    const patch = {
      stage: 'discovery_done' as OpportunityStage,
      bucket: bucketValue,
      last_contacted_at: new Date().toISOString(),
    };
    try {
      await SalesPipelineService.update(oppId, patch as any);
      setBucketPrompt(null);
      applyOppPatch(oppId, patch as Partial<SalesPipelineOpportunity>);
      void fetchMetrics();
      openActivityLogPrompt(oppId, oppName, 'meeting', 'Discovery call completed');
    } catch (err) {
      console.error('Error assigning bucket:', err);
      void fetchOpportunities();
    }
  };

  const confirmClosedLost = async () => {
    if (!closedLostPrompt) return;
    const { oppId, oppName } = closedLostPrompt;
    const patch = {
      stage: 'v2_closed_lost' as OpportunityStage,
      closed_lost_reason: closedLostReasonValue || undefined,
    };
    try {
      await SalesPipelineService.update(oppId, patch);
      setClosedLostPrompt(null);
      setClosedLostReasonValue('');
      applyOppPatch(oppId, patch as Partial<SalesPipelineOpportunity>);
      void fetchMetrics();
      // Open activity log popup
      const reason = closedLostReasonValue ? `Closed lost — ${closedLostReasonValue}` : 'Closed lost';
      openActivityLogPrompt(oppId, oppName, 'note', reason);
    } catch (err) {
      console.error('Error closing lost:', err);
      void fetchOpportunities();
    }
  };

  const confirmClosedWon = async () => {
    if (!closedWonPrompt) return;
    const { oppId, oppName } = closedWonPrompt;
    try {
      let clientId: string;
      if (closedWonMode === 'new') {
        if (!closedWonName.trim()) return;
        const client = await ClientService.createClient(closedWonName.trim(), closedWonEmail.trim() || '');
        clientId = client.id;
      } else {
        if (!closedWonClientId) return;
        clientId = closedWonClientId;
      }
      const patch = {
        stage: 'v2_closed_won' as OpportunityStage,
        client_id: clientId,
      };
      await SalesPipelineService.update(oppId, patch);
      setClosedWonPrompt(null);
      applyOppPatch(oppId, patch as Partial<SalesPipelineOpportunity>);
      void fetchMetrics();
      openActivityLogPrompt(oppId, oppName, 'note', 'Deal closed won');
    } catch (err) {
      console.error('Error closing won:', err);
      void fetchOpportunities();
    }
  };

  const skipClosedWon = async () => {
    if (!closedWonPrompt) return;
    const { oppId, oppName } = closedWonPrompt;
    const patch = { stage: 'v2_closed_won' as OpportunityStage };
    try {
      await SalesPipelineService.update(oppId, patch);
      setClosedWonPrompt(null);
      applyOppPatch(oppId, patch as Partial<SalesPipelineOpportunity>);
      void fetchMetrics();
      openActivityLogPrompt(oppId, oppName, 'note', 'Deal closed won');
    } catch (err) {
      console.error('Error closing won:', err);
      void fetchOpportunities();
    }
  };

  const handleResurrect = async (opp: SalesPipelineOpportunity) => {
    const patch = {
      stage: 'cold_dm' as OpportunityStage,
      orbit_reason: null,
    };
    try {
      await SalesPipelineService.update(opp.id, patch);
      applyOppPatch(opp.id, patch as Partial<SalesPipelineOpportunity>);
      void fetchMetrics();
    } catch (err) {
      console.error('Error resurrecting:', err);
      void fetchOpportunities();
    }
  };

  const handleRecordBump = async (oppId: string) => {
    if (isBumping) return;
    setIsBumping(true);
    // Optimistic update — immediately reflect in UI
    setOpportunities(prev => prev.map(o =>
      o.id === oppId ? { ...o, bump_number: o.bump_number + 1, last_bump_date: new Date().toISOString() } : o
    ));
    try {
      await SalesPipelineService.recordBump(oppId);
      // No fetchOpportunities — the optimistic patch above is the
      // canonical state. recordBump triggers temperature recalc on the
      // server, but the UI doesn't show temperature on the bump button
      // so we don't need a fresh server read.
      if (activeTab === 'outreach') { void fetchOutreach(); void fetchOutreachCount(); }
      if (slideOverOpp?.id === oppId) {
        void fetchActivities(oppId);
      }
    } catch (err) {
      console.error('Error recording bump:', err);
      void fetchOpportunities(); // revert on error
    } finally {
      setIsBumping(false);
    }
  };

  const handleReduceBump = async (oppId: string) => {
    if (isBumping) return;
    setIsBumping(true);
    // Optimistic update
    setOpportunities(prev => prev.map(o =>
      o.id === oppId ? { ...o, bump_number: Math.max(o.bump_number - 1, 0) } : o
    ));
    try {
      await SalesPipelineService.reduceBump(oppId);
      // No refetch — same reasoning as handleRecordBump.
    } catch (err) {
      console.error('Error reducing bump:', err);
      void fetchOpportunities(); // revert on error
    } finally {
      setIsBumping(false);
    }
  };

  const handleAddActivity = async () => {
    if (!activityForm.title.trim() || !slideOverOpp) return;
    setIsActivitySubmitting(true);
    try {
      let attachmentUrl: string | undefined;
      let attachmentName: string | undefined;
      if (activityFile) {
        const fileExt = activityFile.name.split('.').pop();
        const filePath = `${slideOverOpp.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('crm-attachments')
          .upload(filePath, activityFile, { cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('crm-attachments').getPublicUrl(filePath);
        attachmentUrl = publicUrl;
        attachmentName = activityFile.name;
      }
      await SalesPipelineService.createActivity({
        ...activityForm,
        opportunity_id: slideOverOpp.id,
        attachment_url: attachmentUrl,
        attachment_name: attachmentName,
      });
      // If meeting type with a date set, update next_meeting_at
      if (activityForm.type === 'meeting' && activityMeetingDate) {
        const meetingDate = new Date(activityMeetingDate);
        if (activityMeetingTime) {
          const [h, m] = activityMeetingTime.split(':').map(Number);
          meetingDate.setHours(h, m, 0, 0);
        }
        const nextMeetingIso = meetingDate.toISOString();
        await SalesPipelineService.update(slideOverOpp.id, { next_meeting_at: nextMeetingIso });
        applyOppPatch(slideOverOpp.id, { next_meeting_at: nextMeetingIso } as Partial<SalesPipelineOpportunity>);
        // Metrics include bamfamViolations which depends on next_meeting_at.
        void fetchMetrics();
      }
      setActivityForm({ opportunity_id: '', type: 'note', title: '' });
      setActivityFile(null);
      if (activityFileRef.current) activityFileRef.current.value = '';
      setActivityMeetingDate(undefined);
      setActivityMeetingTime(undefined);
      await fetchActivities(slideOverOpp.id);
    } catch (err) {
      console.error('Error adding activity:', err);
    } finally {
      setIsActivitySubmitting(false);
    }
  };

  const handleInlineEdit = async (oppId: string, field: string, value: string) => {
    const updates: any = {};
    if (field === 'deal_value') {
      updates.deal_value = value ? parseFloat(value) : null;
    } else if (field === 'temperature_score') {
      updates.temperature_score = parseInt(value) || 50;
    } else {
      updates[field] = value || null;
    }
    // Optimistic — type-cell edits are the most-frequent operation on
    // this page; refetching all 1000 opps after each one was crippling
    // perceived responsiveness. Patch local state, send the write,
    // background-refresh metrics. If the write fails, revert.
    applyOppPatch(oppId, updates);
    setEditingCell(null);
    try {
      await SalesPipelineService.update(oppId, updates);
      void fetchMetrics();
    } catch (err) {
      console.error('Error inline edit:', err);
      void fetchOpportunities(); // revert
    }
  };

  const handleRecalculateAll = async () => {
    setIsRecalculating(true);
    try {
      await SalesPipelineService.recalcAllTemperatures();
      // Mass mutation — every opp's temperature_score may have moved,
      // so we DO need to refetch the full list. But not affiliates /
      // users / templates.
      await fetchOpportunities();
      void fetchMetrics();
      if (activeTab === 'outreach') { void fetchOutreach(); void fetchOutreachCount(); }
    } catch (err) {
      console.error('Error recalculating temperatures:', err);
    } finally {
      setIsRecalculating(false);
    }
  };

  // ============================================
  // DnD Handlers
  // ============================================

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string;
    setActiveId(id);
    setActiveOpportunity(opportunities.find(o => o.id === id) || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveOpportunity(null);

    if (!over) return;

    const oppId = active.id as string;
    const overId = over.id as string;
    const opp = opportunities.find(o => o.id === oppId);
    if (!opp) return;

    // Check if dropped on a stage column
    const isStageColumn = ALL_V2_STAGES.includes(overId as SalesPipelineStage);

    if (isStageColumn) {
      const newStage = overId as SalesPipelineStage;
      if (opp.stage !== newStage) {
        await handleStageChange(oppId, newStage, opp.stage);
      }
    } else {
      // Dropped on another card — reorder within same stage
      const targetOpp = opportunities.find(o => o.id === overId);
      if (targetOpp && targetOpp.stage === opp.stage) {
        const stageOpps = getStageOpps(opp.stage as SalesPipelineStage);
        const oldIndex = stageOpps.findIndex(o => o.id === oppId);
        const newIndex = stageOpps.findIndex(o => o.id === overId);
        if (oldIndex !== -1 && newIndex !== -1) {
          const reordered = arrayMove(stageOpps, oldIndex, newIndex);
          const positions = reordered.map((o, i) => ({ id: o.id, position: i }));
          // Optimistic position update — the kanban orders by position
          // so this gives instant visual feedback. Send the write in
          // the background; revert on failure.
          const positionMap = new Map(positions.map(p => [p.id, p.position]));
          setOpportunities(prev => prev.map(o =>
            positionMap.has(o.id) ? { ...o, position: positionMap.get(o.id)! } : o,
          ));
          try {
            await SalesPipelineService.updatePositions(positions);
            // No metrics refetch — position changes don't affect any
            // pipeline aggregate (count by stage, value, etc.).
          } catch (err) {
            console.error('Error updating positions:', err);
            void fetchOpportunities(); // revert
          }
        }
      } else if (targetOpp && targetOpp.stage !== opp.stage) {
        // Dropped on card in different stage
        await handleStageChange(oppId, targetOpp.stage as SalesPipelineStage, opp.stage);
      }
    }
  };

  // ============================================
  // Open slide-over
  // ============================================

  const openSlideOver = (opp: SalesPipelineOpportunity, guidance?: { label: string; hint: string }) => {
    setSlideOverOpp(opp);
    setSlideOverMode('view');
    setActionGuidance(guidance || null);
    fetchActivities(opp.id);
    setActivityForm({ opportunity_id: opp.id, type: 'note', title: '', description: '', outcome: '', next_step: '', next_step_date: undefined });
    setActivityMeetingDate(undefined);
    setActivityMeetingTime(undefined);
  };

  const populateForm = (opp: SalesPipelineOpportunity) => {
    setForm({
      name: opp.name,
      dm_account: opp.dm_account,
      bucket: opp.bucket || undefined,
      temperature_score: opp.temperature_score,
      source: opp.source || undefined,
      tg_handle: opp.tg_handle || undefined,
      poc_platform: opp.poc_platform || undefined,
      poc_handle: opp.poc_handle || undefined,
      owner_id: opp.owner_id || undefined,
      co_owner_ids: opp.co_owner_ids || [],
      referrer: opp.referrer || undefined,
      affiliate_id: opp.affiliate_id || undefined,
      deal_value: opp.deal_value || undefined,
      currency: opp.currency,
      next_meeting_at: opp.next_meeting_at || undefined,
      next_meeting_type: opp.next_meeting_type || undefined,
      notes: opp.notes || undefined,
      orbit_followup_days: opp.orbit_followup_days || 90,
    });
  };

  const openEditDialog = (opp: SalesPipelineOpportunity) => {
    populateForm(opp);
    if (slideOverOpp?.id === opp.id) {
      // Editing from slide-over — switch to edit mode inline
      setEditingOpp(opp);
      setSlideOverMode('edit');
    } else {
      // Editing from table/kanban — open dialog
      setEditingOpp(opp);
    }
  };

  const toggleKanbanCollapse = (stage: string) => {
    setCollapsedKanbanStages(prev => {
      const next = new Set(prev);
      next.has(stage) ? next.delete(stage) : next.add(stage);
      return next;
    });
  };

  // ============================================
  // BAMFAM check
  // ============================================

  const isBAMFAM = (opp: SalesPipelineOpportunity) => {
    const postDiscovery: SalesPipelineStage[] = ['discovery_done', 'proposal_call', 'v2_contract'];
    if (!postDiscovery.includes(opp.stage as SalesPipelineStage)) return false;
    if (!opp.next_meeting_at) return true;
    return new Date(opp.next_meeting_at) < new Date();
  };

  // ============================================
  // Actions Tab: getNextAction helper
  // ============================================

  // ActionPriority + ACTION_GUIDANCE moved to lib/salesPipelineHelpers.ts
  // on 2026-06-02 — imported at the top of this file. Local declaration
  // below is intentionally removed; if reverting, restore the
  // 'urgent' | 'high' | 'medium' | 'low' | 'wait' union.
  type ActionExecutionType = 'bump' | 'stage_change' | 'open_detail' | 'none';

  type ActionAlternative = { label: string; actionType: ActionExecutionType; targetStage?: SalesPipelineStage; variant: 'default' | 'warn' | 'danger'; quick?: boolean };

  const getNextAction = (opp: SalesPipelineOpportunity): {
    label: string;
    hint: string;
    priority: ActionPriority;
    actionType: ActionExecutionType;
    targetStage?: SalesPipelineStage;
    isActionable: boolean;
    sortScore: number;
    alternatives: ActionAlternative[];
  } => {
    const postDiscovery: SalesPipelineStage[] = ['discovery_done', 'proposal_call', 'v2_contract'];
    const terminalStages = ['v2_closed_won', 'v2_closed_lost'];

    // Past meeting check — if there's a meeting in the past and deal is still active, prompt to log outcome
    // Skip if the opp was already updated after the meeting (rep likely already took action)
    // Skip proposal_call when proposal not sent — let the switch case handle Send Proposal flow
    const skipGlobalChecks = opp.stage === 'proposal_call' && !opp.proposal_sent_at;
    if (!skipGlobalChecks && !terminalStages.includes(opp.stage) && opp.stage !== 'orbit' && opp.next_meeting_at) {
      const meetingTime = new Date(opp.next_meeting_at);
      const now = new Date();
      const hoursSinceMeeting = (now.getTime() - meetingTime.getTime()) / (1000 * 60 * 60);
      const lastContactAfterMeeting = opp.last_contacted_at && new Date(opp.last_contacted_at) > meetingTime;
      // Meeting was in the past (within 7 days), not yet logged
      if (hoursSinceMeeting > 0 && hoursSinceMeeting <= 168 && !lastContactAfterMeeting) {
        // For booked stage, the existing "Discovery Done" action handles this
        if (opp.stage !== 'booked') {
          return { label: 'Log Meeting Outcome', hint: `Meeting was ${hoursSinceMeeting < 24 ? 'today' : `${Math.floor(hoursSinceMeeting / 24)}d ago`} — record what happened`, priority: 'urgent', actionType: 'open_detail', isActionable: true, sortScore: 0, alternatives: [
            { label: 'Reschedule', actionType: 'open_detail', variant: 'default' },
            { label: 'No Show', actionType: 'open_detail', variant: 'warn' },
          ]};
        }
      }
    }

    // BAMFAM violation — any post-discovery stage with no future meeting
    // Skip proposal_call when proposal not sent — handled by switch case
    if (!skipGlobalChecks && postDiscovery.includes(opp.stage as SalesPipelineStage)) {
      const hasFutureMeeting = opp.next_meeting_at && new Date(opp.next_meeting_at) > new Date();
      if (!hasFutureMeeting) {
        // Fix #4: discovery_done without proposal — show Send Proposal as primary, BAMFAM as hint
        if (opp.stage === 'discovery_done' && !opp.proposal_sent_at) {
          return { label: 'Book Proposal Call', hint: 'Schedule a proposal call. Also book a follow-up meeting (BAMFAM).', priority: 'urgent', actionType: 'stage_change', targetStage: 'proposal_call', isActionable: true, sortScore: 1, alternatives: [
            { label: 'Book Meeting', actionType: 'open_detail', variant: 'default' },
            { label: 'Lost', actionType: 'stage_change', targetStage: 'v2_closed_lost', variant: 'danger' },
          ]};
        }
        return { label: 'Book Next Meeting!', hint: 'No future meeting set — DM to schedule', priority: 'urgent', actionType: 'open_detail', isActionable: true, sortScore: 1, alternatives: [
          { label: 'Orbit', actionType: 'stage_change', targetStage: 'orbit', variant: 'warn' },
          { label: 'Lost', actionType: 'stage_change', targetStage: 'v2_closed_lost', variant: 'danger' },
        ]};
      }
    }

    switch (opp.stage) {
      // Fix #2: v2_contract — "Chase Signature" as primary (open_detail), "Signed!" as quick alt
      case 'v2_contract':
        return { label: 'Chase Signature', hint: 'Follow up on the contract — get it signed', priority: 'urgent', actionType: 'bump', isActionable: true, sortScore: 2, alternatives: [
          { label: 'Signed!', actionType: 'stage_change', targetStage: 'v2_closed_won', variant: 'default', quick: true },
          { label: 'Schedule Call', actionType: 'open_detail', variant: 'default' },
          { label: 'Lost', actionType: 'stage_change', targetStage: 'v2_closed_lost', variant: 'danger' },
        ]};

      case 'proposal_call': {
        // After meeting is logged and proposal sent → move to contract
        if (opp.proposal_sent_at) {
          return { label: 'To Contract', hint: 'Proposal sent — move to contract stage', priority: 'urgent', actionType: 'stage_change', targetStage: 'v2_contract', isActionable: true, sortScore: 3, alternatives: [
            { label: 'Follow Up', actionType: 'open_detail', variant: 'default' },
            { label: 'Orbit', actionType: 'stage_change', targetStage: 'orbit', variant: 'warn' },
            { label: 'Lost', actionType: 'stage_change', targetStage: 'v2_closed_lost', variant: 'danger' },
          ]};
        }
        // Meeting logged (last_contacted_at recent) but proposal not sent yet
        return { label: 'Send Proposal', hint: 'Draft & send the pricing proposal', priority: 'high', actionType: 'open_detail', isActionable: true, sortScore: 5, alternatives: [
          { label: 'To Contract', actionType: 'stage_change', targetStage: 'v2_contract', variant: 'default', quick: true },
          { label: 'Orbit', actionType: 'stage_change', targetStage: 'orbit', variant: 'warn' },
          { label: 'Lost', actionType: 'stage_change', targetStage: 'v2_closed_lost', variant: 'danger' },
        ]};
      }

      case 'cold_dm': {
        if (opp.bump_number >= 4) {
          return { label: 'Review → Orbit', hint: '4 bumps sent, no reply — shelve or orbit', priority: 'medium', actionType: 'stage_change', targetStage: 'orbit', isActionable: true, sortScore: 50, alternatives: [
            { label: 'Replied!', actionType: 'stage_change', targetStage: 'warm', variant: 'default', quick: true },
            { label: 'Keep Bumping', actionType: 'open_detail', variant: 'default' },
          ]};
        }
        const bumpAlts: ActionAlternative[] = [
          { label: 'Replied!', actionType: 'stage_change', targetStage: 'warm', variant: 'default', quick: true },
          { label: 'Orbit', actionType: 'stage_change', targetStage: 'orbit', variant: 'warn' },
        ];
        // Fix #6: bump_number=0 but has last_bump_date (was reduced) — show "Bump" not "Send First DM"
        if (opp.bump_number === 0 && !opp.last_bump_date) {
          return { label: 'Send First DM', hint: 'Send intro DM on IG/X', priority: 'high', actionType: 'bump', isActionable: true, sortScore: 10, alternatives: bumpAlts };
        }
        if (opp.last_bump_date) {
          const daysSince = Math.floor((Date.now() - new Date(opp.last_bump_date).getTime()) / (1000 * 60 * 60 * 24));
          if (daysSince >= 3) {
            return { label: `Bump #${opp.bump_number + 1}`, hint: `Last bump ${daysSince}d ago — send follow-up DM`, priority: 'high', actionType: 'bump', isActionable: true, sortScore: 11, alternatives: bumpAlts };
          }
          const daysLeft = 3 - daysSince;
          return { label: `Wait ${daysLeft}d`, hint: 'Too soon to bump again — mark as replied if they responded', priority: 'wait', actionType: 'none', isActionable: true, sortScore: 100, alternatives: [
            { label: 'Replied!', actionType: 'stage_change', targetStage: 'warm', variant: 'default', quick: true },
            { label: 'Orbit', actionType: 'stage_change', targetStage: 'orbit', variant: 'warn' },
          ] };
        }
        return { label: `Bump #${opp.bump_number + 1}`, hint: 'Send follow-up DM', priority: 'high', actionType: 'bump', isActionable: true, sortScore: 11, alternatives: bumpAlts };
      }

      // Fix #3: warm/interested — open detail to enter TG handle first, "Got TG!" is quick alt after
      case 'warm':
        if (opp.warm_sub_state === 'interested') {
          return { label: 'Get TG Handle', hint: 'They replied — ask for Telegram, then enter it in Edit', priority: 'high', actionType: 'bump', isActionable: true, sortScore: 15, alternatives: [
            { label: 'Got TG!', actionType: 'stage_change', targetStage: 'tg_intro', variant: 'default', quick: true },
            { label: 'Orbit', actionType: 'stage_change', targetStage: 'orbit', variant: 'warn' },
          ]};
        }
        return { label: 'Follow Up', hint: 'No reply yet — send another message on DM', priority: 'high', actionType: 'bump', isActionable: true, sortScore: 20, alternatives: [
          { label: 'Interested', actionType: 'open_detail', variant: 'default', quick: true },
          { label: 'Got TG!', actionType: 'stage_change', targetStage: 'tg_intro', variant: 'default' },
          { label: 'Orbit', actionType: 'stage_change', targetStage: 'orbit', variant: 'warn' },
        ]};

      case 'tg_intro': {
        const lastDate = opp.last_contacted_at || opp.last_bump_date || opp.created_at;
        const daysSinceContact = lastDate ? Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)) : 999;
        if (daysSinceContact >= 7) {
          return { label: 'Re-engage or Orbit', hint: `${daysSinceContact}d since last contact — nudge them on TG or shelve`, priority: 'urgent', actionType: 'open_detail', isActionable: true, sortScore: 5, alternatives: [
            { label: 'Booked!', actionType: 'stage_change', targetStage: 'booked', variant: 'default', quick: true },
            { label: 'Orbit', actionType: 'stage_change', targetStage: 'orbit', variant: 'warn' },
          ]};
        }
        return { label: 'Booked!', hint: 'Send Calendly link on TG to schedule', priority: 'high', actionType: 'stage_change', targetStage: 'booked', isActionable: true, sortScore: 18, alternatives: [
          { label: 'Follow Up', actionType: 'open_detail', variant: 'default' },
          { label: 'Orbit', actionType: 'stage_change', targetStage: 'orbit', variant: 'warn' },
        ]};
      }

      // Fix #1: booked with meeting — check if meeting is future vs past
      case 'booked': {
        if (!opp.next_meeting_at) {
          return { label: 'Schedule Meeting', hint: 'Set the meeting date & time', priority: 'high', actionType: 'open_detail', isActionable: true, sortScore: 16, alternatives: [
            { label: 'Orbit', actionType: 'stage_change', targetStage: 'orbit', variant: 'warn' },
          ]};
        }
        const meetingInFuture = new Date(opp.next_meeting_at) > new Date();
        if (meetingInFuture) {
          return { label: 'Prep for Meeting', hint: 'Review notes & prep talking points before the call', priority: 'low', actionType: 'open_detail', isActionable: true, sortScore: 60, alternatives: [
            { label: 'Reschedule', actionType: 'open_detail', variant: 'default' },
            { label: 'Orbit', actionType: 'stage_change', targetStage: 'orbit', variant: 'warn' },
          ]};
        }
        // Meeting is in the past — call should have happened
        const hoursSinceBookedMeeting = (Date.now() - new Date(opp.next_meeting_at).getTime()) / (1000 * 60 * 60);
        const bookedPriority: ActionPriority = hoursSinceBookedMeeting <= 24 ? 'urgent' : hoursSinceBookedMeeting <= 72 ? 'high' : 'urgent';
        const bookedHint = hoursSinceBookedMeeting <= 24
          ? 'Meeting just happened — mark discovery complete'
          : hoursSinceBookedMeeting <= 72
            ? `Meeting was ${Math.floor(hoursSinceBookedMeeting / 24)}d ago — log outcome now`
            : `Meeting was ${Math.floor(hoursSinceBookedMeeting / 24)}d ago — overdue! Log outcome immediately`;
        const bookedScore = hoursSinceBookedMeeting <= 24 ? 2 : hoursSinceBookedMeeting <= 72 ? 8 : 1;
        return { label: 'Discovery Done', hint: bookedHint, priority: bookedPriority, actionType: 'stage_change', targetStage: 'discovery_done', isActionable: true, sortScore: bookedScore, alternatives: [
          { label: 'Reschedule', actionType: 'open_detail', variant: 'default' },
          { label: 'No Show', actionType: 'open_detail', variant: 'warn' },
        ]};
      }

      case 'discovery_done':
        return { label: 'Book Proposal Call', hint: 'Schedule a call to present the proposal', priority: 'high', actionType: 'stage_change', targetStage: 'proposal_call', isActionable: true, sortScore: 14, alternatives: [
          { label: 'Need More Info', actionType: 'open_detail', variant: 'default' },
          { label: 'To Contract', actionType: 'stage_change', targetStage: 'v2_contract', variant: 'default' },
          { label: 'Lost', actionType: 'stage_change', targetStage: 'v2_closed_lost', variant: 'danger' },
        ]};

      case 'orbit': {
        const daysSinceUpdated = Math.floor((Date.now() - new Date(opp.updated_at).getTime()) / (1000 * 60 * 60 * 24));
        const followupThreshold = opp.orbit_followup_days || 90;
        if (daysSinceUpdated > followupThreshold) {
          return { label: 'Resurrect', hint: `${followupThreshold}+ days — re-engage or mark lost`, priority: 'low', actionType: 'open_detail', isActionable: true, sortScore: 70, alternatives: [
            { label: 'Back to Warm', actionType: 'stage_change', targetStage: 'warm', variant: 'default', quick: true },
            { label: 'Book Meeting', actionType: 'stage_change', targetStage: 'booked', variant: 'default' },
            { label: 'Lost', actionType: 'stage_change', targetStage: 'v2_closed_lost', variant: 'danger' },
          ]};
        }
        return { label: 'In Orbit', hint: '', priority: 'wait', actionType: 'none', isActionable: false, sortScore: 100, alternatives: [] };
      }

      case 'nurture': {
        const daysSinceNurtureContact = (() => {
          const d = opp.last_contacted_at || opp.updated_at;
          return d ? Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24)) : 999;
        })();
        if (daysSinceNurtureContact >= 30) {
          return { label: 'Check In', hint: `${daysSinceNurtureContact}d since last contact — send a periodic check-in`, priority: 'medium', actionType: 'open_detail', isActionable: true, sortScore: 65, alternatives: [
            { label: 'Back to Warm', actionType: 'stage_change', targetStage: 'warm', variant: 'default', quick: true },
            { label: 'Lost', actionType: 'stage_change', targetStage: 'v2_closed_lost', variant: 'danger' },
          ]};
        }
        return { label: 'Nurturing', hint: 'Recently contacted — check back later', priority: 'wait', actionType: 'none', isActionable: false, sortScore: 100, alternatives: [] };
      }

      default:
        return { label: '—', hint: '', priority: 'wait', actionType: 'none', isActionable: false, sortScore: 100, alternatives: [] };
    }
  };

  // ============================================
  // Actions Tab: Derived action items
  // ============================================

  const PRE_DISCOVERY_STAGES = ['cold_dm', 'warm', 'tg_intro', 'booked'];
  const POST_DISCOVERY_STAGES = ['discovery_done', 'proposal_call', 'v2_contract'];

  const allActionItems = useMemo(() => {
    const terminalStages = ['v2_closed_won', 'v2_closed_lost'];
    return opportunities
      .filter(opp => !terminalStages.includes(opp.stage))
      .map(opp => ({ opp, action: getNextAction(opp) }))
      .filter(({ action }) => action.isActionable)
      .sort((a, b) => {
        if (a.action.sortScore !== b.action.sortScore) return a.action.sortScore - b.action.sortScore;
        return (b.opp.temperature_score || 0) - (a.opp.temperature_score || 0);
      });
  }, [opportunities]);

  const actionItems = useMemo(() => {
    return allActionItems.filter(({ opp, action }) => {
      if (actionFilter === 'mine') return opp.owner_id === user?.id || (opp.co_owner_ids || []).includes(user?.id || '');
      if (actionFilter === 'urgent') return action.priority === 'urgent';
      return true;
    });
  }, [allActionItems, actionFilter, user?.id]);

  const outreachActions = useMemo(() => actionItems.filter(({ opp }) => PRE_DISCOVERY_STAGES.includes(opp.stage)), [actionItems]);
  const closingActions = useMemo(() => actionItems.filter(({ opp }) => POST_DISCOVERY_STAGES.includes(opp.stage)), [actionItems]);
  const orbitActions = useMemo(() => actionItems.filter(({ opp }) => opp.stage === 'orbit'), [actionItems]);
  const allOutreachCount = useMemo(() => allActionItems.filter(({ opp }) => PRE_DISCOVERY_STAGES.includes(opp.stage)).length, [allActionItems]);
  const allClosingCount = useMemo(() => allActionItems.filter(({ opp }) => POST_DISCOVERY_STAGES.includes(opp.stage)).length, [allActionItems]);
  const allOrbitCount = useMemo(() => allActionItems.filter(({ opp }) => opp.stage === 'orbit').length, [allActionItems]);

  // Non-urgent: all non-terminal opps that are NOT actionable (waiting state) — shows their next step
  const nonUrgentItems = useMemo(() => {
    const terminalStages = ['v2_closed_won', 'v2_closed_lost'];
    return opportunities
      .filter(opp => !terminalStages.includes(opp.stage))
      .map(opp => ({ opp, action: getNextAction(opp) }))
      .filter(({ action }) => !action.isActionable)
      .sort((a, b) => (a.opp.name || '').localeCompare(b.opp.name || ''));
  }, [opportunities]);
  const allNonUrgentCount = nonUrgentItems.length;

  // Alert card filter: compute matching opportunity IDs
  const alertCardOppIds = useMemo(() => {
    if (alertCardFilter === 'none') return null;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const POST_DISC = ['discovery_done', 'proposal_call', 'v2_contract'];
    const pipelineActive = opportunities.filter(o => PIPELINE_STAGES.includes(o.stage as SalesPipelineStage));

    switch (alertCardFilter) {
      case 'booking_needed':
        return new Set(pipelineActive.filter(o =>
          POST_DISC.includes(o.stage) && (!o.next_meeting_at || new Date(o.next_meeting_at) < now)
        ).map(o => o.id));
      case 'overdue':
        return new Set(pipelineActive.filter(o =>
          o.next_meeting_at && o.next_meeting_at < now.toISOString()
        ).map(o => o.id));
      case 'stale':
        return new Set(pipelineActive.filter(o => {
          const lastDate = o.last_contacted_at || o.last_bump_date || o.created_at;
          if (!lastDate) return true;
          const daysSince = Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24));
          return daysSince >= 7;
        }).map(o => o.id));
      case 'at_risk':
        return new Set(opportunities.filter(o =>
          POST_DISC.includes(o.stage) && o.temperature_score < 40
        ).map(o => o.id));
      case 'meetings':
        return new Set(pipelineActive.filter(o =>
          o.next_meeting_at && new Date(o.next_meeting_at) >= todayStart && new Date(o.next_meeting_at) < weekEnd
        ).map(o => o.id));
      default:
        return null;
    }
  }, [alertCardFilter, opportunities]);

  const { displayedActions, actionsNameCounts } = useMemo(() => {
    let items = actionPhaseFilter === 'outreach' ? outreachActions
      : actionPhaseFilter === 'closing' ? closingActions
      : actionPhaseFilter === 'orbit' ? orbitActions
      : actionPhaseFilter === 'non_urgent' ? nonUrgentItems
      : actionItems;

    // Apply alert card filter
    if (alertCardOppIds) {
      items = items.filter(({ opp }) => alertCardOppIds.has(opp.id));
    }

    // Apply actions search
    if (actionsSearch) {
      const term = actionsSearch.toLowerCase();
      items = items.filter(({ opp }) =>
        opp.name.toLowerCase().includes(term) ||
        opp.poc_handle?.toLowerCase().includes(term)
      );
    }

    // Apply primary sort
    let sorted: typeof items;
    if (actionSort === 'priority' && actionPhaseFilter !== 'non_urgent') {
      sorted = items;
    } else {
      const stageIdx: Record<string, number> = {};
      [...PIPELINE_STAGES, 'orbit', 'nurture', 'v2_closed_lost'].forEach((s, i) => { stageIdx[s] = i; });

      sorted = [...items].sort((a, b) => {
        switch (actionSort) {
          case 'stage': return (stageIdx[a.opp.stage] ?? 99) - (stageIdx[b.opp.stage] ?? 99);
          case 'temperature': return (b.opp.temperature_score || 0) - (a.opp.temperature_score || 0);
          case 'value': return (b.opp.deal_value || 0) - (a.opp.deal_value || 0);
          case 'name': return (a.opp.name || '').localeCompare(b.opp.name || '');
          case 'newest': return new Date(b.opp.created_at).getTime() - new Date(a.opp.created_at).getTime();
          case 'oldest': return new Date(a.opp.created_at).getTime() - new Date(b.opp.created_at).getTime();
          case 'timing': {
            const aDate = a.opp.last_bump_date || a.opp.last_contacted_at || a.opp.created_at;
            const bDate = b.opp.last_bump_date || b.opp.last_contacted_at || b.opp.created_at;
            return new Date(aDate).getTime() - new Date(bDate).getTime();
          }
          default: return 0;
        }
      });
    }

    // ── Cluster same-project rows together (mirrors Outreach tab UX) ──
    // We preserve the user's primary sort but pull all rows with the same
    // project name adjacent, anchored at the position of the FIRST
    // occurrence of that name. So "sort by priority" still puts the most
    // urgent project on top, but its other POCs ride along right below
    // it instead of being scattered. JS Array.sort is stable since
    // ES2019 so within-group order is preserved.
    const firstIdxByName = new Map<string, number>();
    sorted.forEach((item, i) => {
      const n = item.opp.name || '';
      if (!firstIdxByName.has(n)) firstIdxByName.set(n, i);
    });
    const clustered = [...sorted].sort((a, b) => {
      const ai = firstIdxByName.get(a.opp.name || '') ?? 0;
      const bi = firstIdxByName.get(b.opp.name || '') ?? 0;
      return ai - bi;
    });

    const counts = new Map<string, number>();
    clustered.forEach(item => {
      const n = item.opp.name || '';
      counts.set(n, (counts.get(n) || 0) + 1);
    });

    return { displayedActions: clustered, actionsNameCounts: counts };
  }, [actionPhaseFilter, outreachActions, closingActions, orbitActions, actionItems, nonUrgentItems, actionSort, alertCardOppIds, actionsSearch]);

  // ============================================
  // Actions Tab: Execute handler
  // ============================================

  // ACTION_GUIDANCE moved to lib/salesPipelineHelpers.ts on 2026-06-02.
  // Imported at the top of this file. Both the page (handleActionExecute
  // below) and the extracted ActionsTab consume the same map.

  const openActivityLogPrompt = (oppId: string, oppName: string, type: ActivityType, title: string, showMeetingPicker?: boolean, ownerId?: string) => {
    setActivityLogPrompt({ oppId, oppName, type, title, showMeetingPicker, ownerId });
    // For message type, pre-fill description from matching template
    let defaultDescription = '';
    if (type === 'message') {
      const opp = opportunities.find(o => o.id === oppId);
      if (opp) {
        const stageTemplates = templates.filter(t => t.is_active && t.stage === opp.stage);
        if (stageTemplates.length > 0) {
          defaultDescription = stageTemplates[0].content;
        }
      }
    }
    // Pre-populate co-owners when booking a meeting (showMeetingPicker = true)
    let defaultCoOwners: string[] | undefined;
    if (showMeetingPicker) {
      const JDOT_ID = '3dcaa757-1f34-4945-8a7e-3853177864a5';
      const opp = opportunities.find(o => o.id === oppId);
      const existing = opp?.co_owner_ids || [];
      // Add Jdot as default co-owner if not already present and not the owner
      if (opp?.owner_id !== JDOT_ID && !existing.includes(JDOT_ID)) {
        defaultCoOwners = [...existing, JDOT_ID];
      } else {
        defaultCoOwners = [...existing];
      }
    }
    setActivityLogForm({ title, description: defaultDescription, outcome: '', next_step: '', meeting_date: undefined, meeting_time: undefined, next_step_date: undefined, co_owner_ids: defaultCoOwners });
  };

  const handleActionExecute = async (oppId: string, action: ReturnType<typeof getNextAction>, opp: SalesPipelineOpportunity) => {
    setExecutingAction(oppId);
    try {
      if (action.actionType === 'bump') {
        await handleRecordBump(oppId);
        // Show activity log popup after bump
        const bumpTitle = action.label === 'Send First DM' ? 'First DM sent' : `${action.label} sent`;
        openActivityLogPrompt(oppId, opp.name, 'message', bumpTitle);
      } else if (action.actionType === 'stage_change' && action.targetStage) {
        await handleStageChange(oppId, action.targetStage, opp.stage);
        // Skip activity log for stages that have their own prompts (orbit, closed_lost, tg_intro, discovery_done)
        const stagesWithOwnPrompts = ['orbit', 'v2_closed_lost', 'tg_intro', 'discovery_done'];
        if (!stagesWithOwnPrompts.includes(action.targetStage)) {
          const stageActivityMap: Record<string, { type: ActivityType; title: string; showMeetingPicker?: boolean }> = {
            'warm': { type: 'message', title: 'KOL replied' },
            'booked': { type: 'meeting', title: 'Meeting booked', showMeetingPicker: true },
            'proposal_call': { type: 'call', title: 'Proposal call set', showMeetingPicker: true },
            'v2_contract': { type: 'call', title: 'Moving to contract' },
            'v2_closed_won': { type: 'note', title: 'Deal closed won!' },
          };
          const mapping = stageActivityMap[action.targetStage];
          if (mapping) {
            openActivityLogPrompt(oppId, opp.name, mapping.type, mapping.title, mapping.showMeetingPicker, opp.owner_id || undefined);
          }
        }
      } else {
        // open_detail actions
        if (action.label === 'Book Next Meeting!' || action.label === 'Schedule Meeting') {
          openActivityLogPrompt(oppId, opp.name, 'meeting', 'Meeting scheduled', true, opp.owner_id || undefined);
        } else if (action.label === 'Log Meeting Outcome') {
          openActivityLogPrompt(oppId, opp.name, 'meeting', 'Meeting outcome', false);
        } else if (action.label === 'Send Proposal') {
          // Mark proposal as sent, then show activity log
          const sentAt = new Date().toISOString();
          await SalesPipelineService.update(oppId, { proposal_sent_at: sentAt } as any);
          applyOppPatch(oppId, { proposal_sent_at: sentAt } as Partial<SalesPipelineOpportunity>);
          openActivityLogPrompt(oppId, opp.name, 'proposal', 'Proposal sent');
          void fetchMetrics();
        } else {
          const guidance = ACTION_GUIDANCE[action.label];
          openSlideOver(opp, guidance);
        }
      }
    } finally {
      setExecutingAction(null);
    }
  };

  const confirmActivityLog = async () => {
    if (!activityLogPrompt) return;
    setIsActivityLogSubmitting(true);
    try {
      // Create the activity
      await SalesPipelineService.createActivity({
        opportunity_id: activityLogPrompt.oppId,
        type: activityLogPrompt.type,
        title: activityLogForm.title || activityLogPrompt.title,
        description: activityLogForm.description || undefined,
        outcome: activityLogForm.outcome || undefined,
        next_step: activityLogForm.next_step || undefined,
        next_step_date: activityLogForm.next_step_date || undefined,
      });
      // Always update last_contacted_at so past-meeting checks know the outcome was handled
      const activityUpdate: any = { last_contacted_at: new Date().toISOString() };
      // If meeting picker was shown and a date was set, also update next_meeting_at
      if (activityLogPrompt.showMeetingPicker && activityLogForm.meeting_date) {
        const meetingDate = new Date(activityLogForm.meeting_date);
        if (activityLogForm.meeting_time) {
          const [h, m] = activityLogForm.meeting_time.split(':').map(Number);
          meetingDate.setHours(h, m, 0, 0);
        }
        activityUpdate.next_meeting_at = meetingDate.toISOString();
      }
      // Update co-owners if changed
      if (activityLogPrompt.showMeetingPicker && activityLogForm.co_owner_ids) {
        activityUpdate.co_owner_ids = activityLogForm.co_owner_ids;
      }
      const oppId = activityLogPrompt.oppId;
      await SalesPipelineService.update(oppId, activityUpdate);
      setActivityLogPrompt(null);
      setActivityLogForm({ title: '', description: '', outcome: '', next_step: '', meeting_date: undefined, meeting_time: undefined, next_step_date: undefined, co_owner_ids: undefined });
      applyOppPatch(oppId, activityUpdate);
      void fetchMetrics();
      if (activeTab === 'outreach') { void fetchOutreach(); void fetchOutreachCount(); }
    } catch (err) {
      console.error('Error logging activity:', err);
      void fetchOpportunities();
    } finally {
      setIsActivityLogSubmitting(false);
    }
  };

  // ============================================
  // Helpers
  // ============================================

  const getUserName = (userId: string | null) => {
    if (!userId) return '—';
    const u = users.find(u => u.id === userId);
    return u?.name || u?.email || '—';
  };

  // Cell renderers (`renderOwnerCell`, `renderPocCell`,
  // `renderProjectNameSuffix`) + `cleanPocHandle` + `linkifyText` +
  // `activityIcon` + `getCoOwnerNames` all moved out 2026-06-03:
  //
  //   - <OwnerCell /> + <PocCell /> + <ProjectNameSuffix /> are
  //     standalone components in components/crm/sales-pipeline/cells/
  //     and components/crm/sales-pipeline/ProjectNameSuffix.tsx
  //   - cleanPocHandle hoisted to lib/salesPipelineHelpers.ts
  //   - linkifyText + activityIcon were unused here (slide-over has
  //     its own local copies)

  const outreachTotalPages = Math.ceil(outreachTotal / OUTREACH_PAGE_SIZE);
  const outreachStart = (outreachPage - 1) * OUTREACH_PAGE_SIZE + 1;
  const outreachEnd = Math.min(outreachPage * OUTREACH_PAGE_SIZE, outreachTotal);

  // `handleOutreachSearch` removed 2026-06-03 — was the debounced
  // setter for the per-tab Outreach search input, which got dropped
  // in the unified-search migration. `overallSearch` now drives
  // outreachFilters.searchTerm via the broadcast effect above.

  const handleBulkBump = async () => {
    if (selectedOutreach.length === 0 || isBulkBumping) return;
    setIsBulkBumping(true);
    try {
      await SalesPipelineService.bulkRecordBump(selectedOutreach);
      // Bulk operation — every selected opp's bump_number changed
      // server-side. Cheaper to refetch the opps list once than to
      // try and patch N rows individually + reconcile temperatures.
      // Drop the affiliate/users/templates fetch though.
      const selected = new Set(selectedOutreach);
      setSelectedOutreach([]);
      void fetchOutreach();
      await fetchOpportunities();
      void fetchMetrics();
      void selected; // satisfy linter on unused
    } catch (err: any) {
      console.error('Error bulk bumping:', err);
      toast({ title: 'Bulk bump failed', description: err?.message, variant: 'destructive' });
      setSelectedOutreach([]);
    } finally {
      setIsBulkBumping(false);
    }
  };

  const handleBulkMoveToWarm = async () => {
    if (selectedOutreach.length === 0 || isBulkMoving) return;
    setIsBulkMoving(true);
    try {
      // Snapshot which selected opps are cold-outreach + currently in
      // cold_dm BEFORE the bulk update, so we can auto-log the inbound
      // reply for each of them after. Same logic as the single-row
      // handleStageChange path — keep them consistent.
      const candidatesForReplyLog = opportunities.filter(o =>
        selectedOutreach.includes(o.id) && o.stage === 'cold_dm' && o.source === 'cold_outreach',
      );
      await SalesPipelineService.bulkUpdateStage(selectedOutreach, 'warm');
      // Optimistic: patch all selected to warm; server is authoritative
      // but the local state update is enough for the kanban to update.
      const selected = new Set(selectedOutreach);
      setOpportunities(prev => prev.map(o =>
        selected.has(o.id) ? { ...o, stage: 'warm' as OpportunityStage, updated_at: new Date().toISOString() } : o,
      ));
      setSelectedOutreach([]);
      // Fire-and-forget the reply-log writes. Parallelised so the bulk
      // action doesn't slow down for the count of opps. Each one
      // individually wraps its own try/catch via autoLogColdOutreachReply.
      void Promise.all(candidatesForReplyLog.map(opp => autoLogColdOutreachReply(opp)));
      void fetchOutreach();
      void fetchOutreachCount();
      void fetchMetrics();
    } catch (err: any) {
      console.error('Error bulk moving to warm:', err);
      toast({ title: 'Couldn’t move to warm', description: err?.message, variant: 'destructive' });
      setSelectedOutreach([]);
      void fetchOpportunities(); // revert
    } finally {
      setIsBulkMoving(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedOutreach.length === 0) return;
    const count = selectedOutreach.length;
    setConfirmDialog({
      open: true,
      title: `Delete ${count} opportunit${count === 1 ? 'y' : 'ies'}?`,
      description: 'These opportunities and all their activity history will be permanently removed.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await SalesPipelineService.bulkDelete(selectedOutreach);
          const selected = new Set(selectedOutreach);
          setOpportunities(prev => prev.filter(o => !selected.has(o.id)));
          setSelectedOutreach([]);
          void fetchOutreach();
          void fetchOutreachCount();
          void fetchMetrics();
        } catch (err: any) {
          console.error('Error bulk deleting:', err);
          toast({ title: 'Bulk delete failed', description: err?.message, variant: 'destructive' });
          setSelectedOutreach([]);
          void fetchOpportunities();
        }
      },
    });
  };

  // Reassign owner_id on every selected outreach opportunity. Comes
  // up when rebalancing the SDR pool (someone leaves, new SDR ramps
  // up, etc.) — without this you'd have to open each opp individually.
  const handleBulkReassignOwner = async (newOwnerId: string | null, ownerLabel: string) => {
    if (selectedOutreach.length === 0 || isBulkReassigning) return;
    setIsBulkReassigning(true);
    try {
      const ids = [...selectedOutreach];
      await SalesPipelineService.bulkUpdateOwner(ids, newOwnerId);
      // Optimistic local patch — server is authoritative but the table
      // re-render is what the user is waiting for.
      setOpportunities(prev => prev.map(o =>
        ids.includes(o.id) ? { ...o, owner_id: newOwnerId, updated_at: new Date().toISOString() } : o,
      ));
      setSelectedOutreach([]);
      setBulkOwnerOpen(false);
      toast({
        title: 'Owner reassigned',
        description: `${ids.length} opportunit${ids.length === 1 ? 'y' : 'ies'} → ${ownerLabel}`,
      });
      void fetchOutreach();
      void fetchMetrics();
    } catch (err: any) {
      console.error('Error in bulk owner reassign:', err);
      toast({ title: 'Reassign failed', description: err?.message, variant: 'destructive' });
      void fetchOpportunities();
    } finally {
      setIsBulkReassigning(false);
    }
  };

  const toggleOutreachSelect = (id: string) => {
    setSelectedOutreach(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllOnPage = () => {
    setSelectedOutreach(outreachOpps.map(o => o.id));
  };

  // ─── Orbit multi-select handlers ────────────────────────────────────
  // Mirror the Outreach pattern: toggle/select-all + bulk actions for
  // Move-to-Cold-DM (resurrect), Move-to-Pipeline (warm), and Delete.

  const toggleOrbitSelect = (id: string) => {
    setSelectedOrbit(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllOrbitVisible = () => {
    setSelectedOrbit(orbitOpps.map(o => o.id));
  };

  const handleOrbitBulkMove = async (targetStage: 'cold_dm' | 'warm') => {
    if (selectedOrbit.length === 0 || isOrbitBulkMoving) return;
    setIsOrbitBulkMoving(true);
    const ids = selectedOrbit;
    try {
      // Move stage. For cold_dm we also need to clear orbit_reason —
      // bulkUpdateStage doesn't touch other columns, so do this in two
      // passes: bulk stage update + per-id orbit_reason clear.
      await SalesPipelineService.bulkUpdateStage(ids, targetStage);
      if (targetStage === 'cold_dm') {
        await Promise.all(ids.map(id =>
          SalesPipelineService.update(id, { orbit_reason: null })
        ));
      }
      setOpportunities(prev => prev.map(o =>
        ids.includes(o.id)
          ? { ...o, stage: targetStage, orbit_reason: targetStage === 'cold_dm' ? null : o.orbit_reason }
          : o
      ));
      setSelectedOrbit([]);
      void fetchMetrics();
    } catch (err) {
      console.error('Error in orbit bulk move:', err);
      void fetchOpportunities();
    } finally {
      setIsOrbitBulkMoving(false);
    }
  };

  const handleOrbitBulkDelete = async () => {
    if (selectedOrbit.length === 0) return;
    const count = selectedOrbit.length;
    const ids = selectedOrbit;
    setConfirmDialog({
      open: true,
      title: `Delete ${count} opportunit${count === 1 ? 'y' : 'ies'}?`,
      description: 'These opportunities and all their activity history will be permanently removed.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await SalesPipelineService.bulkDelete(ids);
          setOpportunities(prev => prev.filter(o => !ids.includes(o.id)));
          setSelectedOrbit([]);
          void fetchMetrics();
        } catch (err: any) {
          console.error('Error in orbit bulk delete:', err);
          toast({ title: 'Bulk delete failed', description: err?.message, variant: 'destructive' });
          void fetchOpportunities();
        }
      },
    });
  };

  // hideSearch=true is passed when this same render fn is embedded
  // inside the Overall tab — there, the unified search bar at the top
  // already drives the outreach filter (via the overallSearch
  // useEffect), so a second search input here would be a duplicate.
  // The standalone Outreach tab doesn't have the unified search, so
  // it keeps its own search bar (default).

  // ============================================
  // RENDER: Actions Tab
  // ============================================


  // ============================================
  // RENDER: Orbit Tab
  // ============================================


  // ============================================
  // RENDER: Forecast Tab
  // ============================================
  // Extracted to components/crm/sales-pipeline/panels/ForecastPanel.tsx
  // on 2026-06-02 as Phase 1 of the structural split. Post-proposal
  // visibility — every deal that's been proposed but not yet closed,
  // grouped by expected close date with at-risk auto-flag. KPIs at the
  // top give a quick "where's my pipeline at?" answer.



  // ============================================
  // RENDER: Activity Slide-Over
  // ============================================


  // ============================================
  // RENDER: Create / Edit Dialog
  // ============================================


  // ============================================
  // RENDER: Activity Log Prompt
  // ============================================


  // ============================================
  // RENDER: Orbit Reason Prompt
  // ============================================

  // renderOrbitPrompt + renderClosedLostPrompt extracted to
  // components/crm/sales-pipeline/dialogs/{OrbitDialog,ClosedLostDialog}.tsx
  // on 2026-06-02 as part of Phase 3.


  // renderTgHandlePrompt extracted to
  // components/crm/sales-pipeline/dialogs/TgHandleDialog.tsx
  // on 2026-06-02 as the first dialog in Phase 3 of the structural
  // split. Consumes tgHandle* + confirmTgHandle from
  // SalesPipelineContext — see the provider value below.

  // renderBucketPrompt extracted to
  // components/crm/sales-pipeline/dialogs/BucketDialog.tsx
  // on 2026-06-02 as part of Phase 3.

  // ============================================
  // RENDER: Loading
  // ============================================

  // Side-effect the AlertCardsStrip fires when a card is *activated*
  // (not toggled off): jump to the Actions tab with filters cleared
  // so the filtered subset is visible immediately. Kept in the page
  // so the strip stays unaware of activeTab/actionFilter — those are
  // CRM-page concerns, not alert-strip concerns.
  //
  // **MUST sit above the `if (loading) return ...` early-return below**
  // — hooks have to run in the same order every render. Placing this
  // useCallback after the loading branch caused
  // "Rendered more hooks than during the previous render" the first
  // time `loading` flipped to `false`.
  const handleAlertCardActivate = useCallback((_filter: AlertCardFilter) => {
    setActiveTab('actions');
    setActionFilter('all');
    setActionPhaseFilter('all');
  }, []);

  if (loading) {
    // **Structural skeleton, not "Loading…".** Mirrors the loaded
    // shape (PageHeader → unified search → F&M collapsed bar → tab
    // strip → Actions tab body) so the page doesn't lurch when data
    // arrives. Updated 2026-06-03 to match the post-merge layout:
    // Today's Attention card is now inside the Actions tab body (not
    // at page level), and Actions is the default tab.
    return (
      <div className="space-y-6">
        <PageHeader
          icon={Target}
          title="Sales"
          subtitle="Track and manage your active sales opportunities"
          kicker="Sales / CRM · Sales"
          kickerDot="violet"
          actions={(
            <>
              <Skeleton className="h-9 w-28 rounded-md hidden md:block" />
              <Skeleton className="h-9 w-9 rounded-md" />
              <Skeleton className="h-9 w-40 rounded-md" />
            </>
          )}
        />

        {/* Unified search bar */}
        <Skeleton className="h-9 w-full max-w-md rounded-md" />

        {/* Forecast & Metrics — collapsed by default, 1-line header */}
        <div className="bg-white rounded-xl border border-cream-200">
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="flex items-center gap-2 flex-1">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-3 w-44" />
            </div>
            <Skeleton className="h-4 w-4 rounded" />
          </div>
        </div>

        {/* Main tab strip — 6 tabs (Overall merged into Actions on
            2026-06-03), default Actions active. Widths approximate
            the loaded tabs (Actions/Outreach/Pipeline/Orbit/Discovery/
            Templates) so the first paint doesn't shift when text
            renders. */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="inline-flex bg-cream-100 p-1 rounded-md border border-cream-200 gap-1">
            {['w-24', 'w-24', 'w-24', 'w-20', 'w-24', 'w-24'].map((w, i) => (
              <Skeleton key={i} className={`h-7 ${w} rounded`} />
            ))}
          </div>
          <div className="h-7" />
        </div>

        {/* Actions tab body — Today's Attention card on top, then
            Owner/Phase filter row, then the action queue table. */}
        <div className="space-y-4">
          {/* Today's Attention card */}
          <div className="bg-white rounded-xl border border-cream-200 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-cream-100">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-40" />
              </div>
              <Skeleton className="h-8 w-44 rounded-md" />
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))}
              </div>
            </div>
          </div>

          {/* Owner + Phase filter row */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Skeleton className="h-8 w-72 rounded-md" />
            <Skeleton className="h-8 w-96 rounded-md" />
          </div>

          {/* Action queue table */}
          <div className="bg-white border border-cream-200 rounded-lg overflow-hidden">
            <div className="bg-cream-50/80 border-b border-cream-200 px-4 py-2.5 flex items-center gap-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-3 w-16" />
              ))}
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 border-b border-cream-100 last:border-0"
              >
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 flex-1 max-w-[200px]" />
                <Skeleton className="h-5 w-24 rounded-md" />
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-8" />
                <Skeleton className="h-7 w-28 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }


  // ============================================
  // MAIN RENDER
  // ============================================

  // SalesPipelineProvider value — read-only data + setters that the
  // extracted child components consume via useSalesPipeline(). Grows
  // field-by-field as more components are extracted. The page itself
  // remains the source of truth via the useState calls above.
  const salesPipelineCtx = {
    opportunities,
    // Forecast view — wired for ForecastPanel.
    forecastOpps,
    forecastByPeriod,
    forecastKpis,
    users,
    openSlideOver,
    openEditDialog,
    handleStageChange,
    // Metrics view — wired for MetricsPanel.
    activeUsers,
    metricsUserId,
    setMetricsUserId,
    metricsRangeDays,
    setMetricsRangeDays,
    metricsBookingsLoading,
    computeOutreachMetrics,
    // TG handle prompt — wired for TgHandleDialog.
    tgHandlePrompt,
    setTgHandlePrompt,
    tgHandleValue,
    setTgHandleValue,
    confirmTgHandle,
    // Orbit reason prompt — wired for OrbitDialog.
    orbitPrompt,
    setOrbitPrompt,
    orbitReasonValue,
    setOrbitReasonValue,
    orbitFollowupDays,
    setOrbitFollowupDays,
    confirmOrbit,
    // Closed-lost reason prompt — wired for ClosedLostDialog.
    closedLostPrompt,
    setClosedLostPrompt,
    closedLostReasonValue,
    setClosedLostReasonValue,
    confirmClosedLost,
    // Closed-won client-link prompt — wired for ClosedWonDialog.
    closedWonPrompt,
    setClosedWonPrompt,
    closedWonMode,
    setClosedWonMode,
    closedWonEmail,
    setClosedWonEmail,
    closedWonName,
    setClosedWonName,
    closedWonClientId,
    setClosedWonClientId,
    closedWonClients,
    closedWonClientSearch,
    setClosedWonClientSearch,
    closedWonClientPopoverOpen,
    setClosedWonClientPopoverOpen,
    confirmClosedWon,
    skipClosedWon,
    // Bucket assignment prompt — wired for BucketDialog.
    bucketPrompt,
    setBucketPrompt,
    bucketValue,
    setBucketValue,
    confirmBucket,
    // Stage History dialog — wired for StageHistoryDialog.
    stageHistoryOpen,
    setStageHistoryOpen,
    stageHistory,
    stageHistoryLoading,
    slideOverOpp,
    getUserName,
    // Slide-over — wired for OpportunitySlideOver.
    setSlideOverOpp,
    setSlideOverMode,
    actionGuidance,
    setActionGuidance,
    isBAMFAM,
    applyOppPatch,
    openStageHistory,
    handleDelete,
    activities,
    setActivities,
    activityForm,
    setActivityForm,
    activityMeetingDate,
    setActivityMeetingDate,
    activityMeetingTime,
    setActivityMeetingTime,
    isActivitySubmitting,
    activityFile,
    setActivityFile,
    activityFileRef,
    handleAddActivity,
    handleRecordBump,
    handleReduceBump,
    isBumping,
    // Activity Log dialog — wired for ActivityLogDialog.
    activityLogPrompt,
    setActivityLogPrompt,
    activityLogForm,
    setActivityLogForm,
    isActivityLogSubmitting,
    templatePopoverOpen,
    setTemplatePopoverOpen,
    templates,
    bookingUserId,
    setBookingUserId,
    confirmActivityLog,
    copyBookingLink,
    // Cross-tab navigation — wired for OverviewTab's JumpCards
    // + Pulse chips that route the user to dedicated tabs.
    setActiveTab,
    // Overview tab — wired for OverviewTab.
    overallSearch,
    setOverallSearch,
    engagedOrbitOpps,
    coldDmOrbitOpps,
    allNurtureOpps,
    // Kanban + Table views — wired for PipelineKanban + PipelineTable.
    sensors,
    handleDragStart,
    handleDragEnd,
    activeOpportunity,
    visiblePipelineStages,
    getStageOpps,
    collapsedKanbanStages,
    toggleKanbanCollapse,
    collapsedStages,
    setCollapsedStages,
    allOrbitOpps,
    filteredOpportunities,
    editingCell,
    setEditingCell,
    editingValue,
    setEditingValue,
    handleInlineEdit,
    // Outreach tab — wired for OutreachTab.
    openMetricsView,
    outreachFilters,
    setOutreachFilters,
    outreachPage,
    setOutreachPage,
    outreachTotal,
    outreachTotalPages,
    outreachAllTotal,
    outreachLoading,
    outreachOpps,
    sortedOutreach,
    outreachNameCounts,
    outreachStart,
    outreachEnd,
    selectedOutreach,
    setSelectedOutreach,
    toggleOutreachSelect,
    selectAllOnPage,
    handleBulkBump,
    handleBulkMoveToWarm,
    handleBulkDelete,
    handleBulkReassignOwner,
    isBulkBumping,
    isBulkMoving,
    isBulkReassigning,
    bulkOwnerOpen,
    setBulkOwnerOpen,
    getNextAction,
    // Actions tab — wired for ActionsTab.
    actionFilter,
    setActionFilter,
    actionPhaseFilter,
    setActionPhaseFilter,
    actionSort,
    setActionSort,
    actionsSearch,
    setActionsSearch,
    allActionItems,
    allOutreachCount,
    allClosingCount,
    allOrbitCount,
    allNonUrgentCount,
    displayedActions,
    actionsNameCounts,
    alertCardOppIds,
    executingAction,
    handleActionExecute,
    setOpportunities,
    // Orbit tab — wired for OrbitTab.
    selectedOrbit,
    setSelectedOrbit,
    selectAllOrbitVisible,
    toggleOrbitSelect,
    isOrbitBulkMoving,
    handleOrbitBulkMove,
    handleOrbitBulkDelete,
    sortedEngagedOrbit,
    engagedOrbitTotalValue,
    sortedColdDmOrbit,
    coldDmOrbitTotalValue,
    handleResurrect,
    // Templates tab — wired for TemplatesTab.
    setTemplates,
    templateStageFilter,
    setTemplateStageFilter,
    templateTagFilter,
    setTemplateTagFilter,
    isTemplateDialogOpen,
    setIsTemplateDialogOpen,
    editingTemplate,
    setEditingTemplate,
    templateForm,
    setTemplateForm,
    isTemplateSubmitting,
    setIsTemplateSubmitting,
    previewTemplate,
    setPreviewTemplate,
    // Create / Edit Opportunity dialog — wired for CreateEditOpportunityDialog.
    isCreateOpen,
    setIsCreateOpen,
    editingOpp,
    setEditingOpp,
    slideOverMode,
    form,
    setForm,
    handleCreate,
    handleUpdate,
    isSubmitting,
    affiliates,
    setAffiliates,
    affiliatePopoverOpen,
    setAffiliatePopoverOpen,
    affiliateSearch,
    setAffiliateSearch,
    // Alert cards strip.
    alertMetrics,
    alertCardFilter,
    setAlertCardFilter,
    onAlertCardActivate: handleAlertCardActivate,
    toast,
  };

  return (
    <SalesPipelineProvider value={salesPipelineCtx}>
    <div className="space-y-6">
      {/* Activity Slide-Over — rendered via portal to document.body
          from inside the component. Visibility is driven by
          slideOverOpp !== null in context. */}
      <OpportunitySlideOver />

      <PageHeader
        icon={Target}
        title="Sales"
        subtitle="Track and manage your active sales opportunities"
        kicker="Sales / CRM · Sales"
        kickerDot="violet"
        actions={(
          <SalesPipelineHeaderActions
            onOpenPalette={() => setPaletteOpen(true)}
            onExportCsv={() => downloadCsv(filteredOpportunities, SP_CSV_COLUMNS, `sales-pipeline-${todayStamp()}`)}
            exportCount={filteredOpportunities.length}
            onNewOpportunity={() => { setForm({ name: '', owner_id: user?.id || undefined }); setIsCreateOpen(true); }}
          />
        )}
      />

      {/* Unified search moved below Forecast & Metrics on 2026-06-03
          so it sits adjacent to the main tab strip it scopes (rather
          than above the analytics card, which is a different concern).
          Was previously at the top of the page, between PageHeader and
          F&M. See the input + Clear button further down in the JSX. */}

      {/* Today's Attention card moved into the Actions tab on
          2026-06-03 — it's a cohort filter for the action queue, so
          it lives spatially next to the queue rather than floating
          above the tab strip. See ActionsTab.tsx for the JSX. */}

      {/* [Sales-pipeline space optimization, May 2026] Forecast +
          Metrics is now collapsible — the full Tabs view is 400-1200px
          tall and was always-visible above the operational tabs, so
          users scrolled past it on every visit. The summary strip
          surfaces the four most-asked numbers (pipeline value,
          weighted forecast, this-month value, at-risk count) so
          managers still see headline data without expanding. State
          persists in localStorage so sales-focused users can pin it
          open once. */}
      <div className="bg-white rounded-xl border border-cream-200">
        <button
          type="button"
          onClick={toggleAnalytics}
          className="w-full flex items-center justify-between gap-3 px-5 py-3 hover:bg-cream-50 transition-colors text-left"
          aria-expanded={showAnalytics}
          aria-controls="sp-analytics-panel"
        >
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <BarChart3 className="h-4 w-4 text-brand flex-shrink-0" />
            <span className="text-sm font-semibold text-ink-warm-900 uppercase tracking-wider flex-shrink-0">
              Forecast & Metrics
            </span>
            {/* Inline summary strip removed 2026-06-03 — it duplicated
                the OverviewTab's stats strip (same 4 numbers: Pipeline /
                Weighted / This month / At risk). Users land on Overall
                by default and see those numbers there; this header now
                stays a clean title + chevron. */}
          </div>
          <ChevronDown
            className={`h-4 w-4 text-ink-warm-400 flex-shrink-0 transition-transform ${showAnalytics ? 'rotate-180' : ''}`}
          />
        </button>
        {showAnalytics && (
          <div id="sp-analytics-panel" className="border-t border-cream-100">
            <Tabs value={topSectionTab} onValueChange={v => setTopSectionTab(v as 'forecast' | 'metrics' | 'dashboard')}>
              {/* Sub-tab strip — same shape as the main tab strip
                  below (cream-100 container, white active tile,
                  per-tab semantic color). Was `bg-brand-light` chrome
                  on every active state — visually different rhythm
                  than the main tabs. Unified 2026-06-03. */}
              <div className="px-5 pt-3 pb-3 border-b border-cream-100">
                <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200">
                  <TabsTrigger
                    value="forecast"
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-emerald-700"
                  >
                    <TrendingUp className="h-4 w-4" />
                    Forecast
                    {/* Show only the actionable signal — the at-risk
                        count — when present. The total forecast-opp
                        count was the volume signal but stacking both
                        next to "Forecast" was too noisy. The total
                        still shows in the panel's own KPI header. */}
                    {forecastKpis.atRiskCount > 0 ? (
                      <span
                        className="ml-1 inline-flex items-center px-1.5 py-0 rounded text-[10px] bg-rose-100 text-rose-700 tabular-nums"
                        title={`${forecastKpis.atRiskCount} at-risk · ${forecastOpps.length} total in forecast`}
                      >
                        {forecastKpis.atRiskCount} at-risk
                      </span>
                    ) : forecastOpps.length > 0 ? (
                      <span className="ml-1 text-[11px] text-ink-warm-400 tabular-nums">
                        {forecastOpps.length}
                      </span>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger
                    value="metrics"
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-sky-700"
                  >
                    <BarChart3 className="h-4 w-4" />
                    Metrics
                  </TabsTrigger>
                  <TabsTrigger
                    value="dashboard"
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-brand"
                  >
                    <BarChart3 className="h-4 w-4" />
                    Dashboard
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="forecast" className="mt-0 p-5 pt-4">
                <ForecastPanel />
              </TabsContent>
              <TabsContent value="metrics" className="mt-0 p-5 pt-4">
                <MetricsPanel />
              </TabsContent>
              <TabsContent value="dashboard" className="mt-0 p-5 pt-4">
                <SalesDashboard
                  onRecalculate={handleRecalculateAll}
                  isRecalculating={isRecalculating}
                  metrics={metrics}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      {/* Unified search — sits BELOW the Forecast & Metrics card so
          it's adjacent to the main tab strip it scopes (was above
          F&M before 2026-06-03; moved by request because the
          analytics card is a different concern than tab-level
          filtering). Single input drives every tab (Outreach /
          Pipeline / Orbit / Actions simultaneously). The ⌘K palette
          is the cross-tab quick-jump alternative. */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-warm-400 pointer-events-none" />
        <Input
          value={overallSearch}
          onChange={(e) => setOverallSearch(e.target.value)}
          placeholder="Search across all tabs..."
          className="pl-9 focus-brand"
        />
        {overallSearch && (
          <button
            type="button"
            onClick={() => setOverallSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded text-ink-warm-400 hover:bg-cream-100"
            title="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Sales Dashboard merged into Forecast & Metrics above as a
          third sub-tab on 2026-06-03 — was a standalone collapsible
          here, which produced three analytics sections showing
          overlapping numbers. */}

      {/* Main tabs + per-tab controls extracted to SalesPipelineTabs
          on 2026-06-03 — was ~210 LOC of TabsList + 7 TabsContent
          inline. Page keeps `activeTab` / `viewMode` / `pathFilter` so
          its fetch effects + recalc handler still key off them. */}
      <SalesPipelineTabs
        activeTab={activeTab}
        onActiveTabChange={setActiveTab}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        pathFilter={pathFilter}
        onPathFilterChange={setPathFilter}
        onDiscoveryPromoted={() => { void fetchOpportunities(); void fetchMetrics(); }}
      />
      {/* Dialogs */}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onNewOpportunity={() => { setForm({ name: '', owner_id: user?.id || undefined }); setIsCreateOpen(true); }}
        onExportCsv={() => downloadCsv(filteredOpportunities, SP_CSV_COLUMNS, `sales-pipeline-${todayStamp()}`)}
      />
      <CreateEditOpportunityDialog />
      <OrbitDialog />
      <ClosedLostDialog />
      <ClosedWonDialog />
      <TgHandleDialog />
      <BucketDialog />
      <StageHistoryDialog />
      <ActivityLogDialog />

      {/* Shared destructive-confirm dialog. Replaces the half-dozen
          window.confirm() calls that used to live in delete handlers.
          The action runs with confirmRunning=true so the button shows
          a spinner and can't be double-clicked. */}
      <AlertDialog
        open={!!confirmDialog?.open}
        onOpenChange={(open) => { if (!open) setConfirmDialog(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmRunning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmRunning}
              className="bg-rose-600 hover:bg-rose-700 text-white"
              onClick={async (e) => {
                e.preventDefault();
                if (!confirmDialog) return;
                setConfirmRunning(true);
                try {
                  await confirmDialog.onConfirm();
                  setConfirmDialog(null);
                } finally {
                  setConfirmRunning(false);
                }
              }}
            >
              {confirmRunning ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Working…</>
              ) : (confirmDialog?.confirmLabel || 'Confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </SalesPipelineProvider>
  );
}
