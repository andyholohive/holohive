'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Plus, UserPlus, Minus, Search, Trash2, X, LayoutGrid, TableIcon, GripVertical, Loader2,
  Target, AlertTriangle, ArrowRight, MoreHorizontal, ChevronDown, ChevronRight, ChevronLeft, ChevronUp,
  Phone, MessageSquare, Calendar, FileText, StickyNote, Zap, RotateCcw, Clock, Edit, Copy, Check, ChevronsUpDown,
  Building2, TrendingUp, DollarSign, Users, Hash, BarChart3, Activity, Send, ArrowUpDown, Paperclip, Eye, Image,
  Sparkles, Twitter, Download, History,
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
  useDroppable,
} from '@dnd-kit/core';
import {
  useSortable,
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CRMService, CRMAffiliate, OpportunityStage } from '@/lib/crmService';
import DiscoveryTab from '@/components/sales/DiscoveryTab';
import { ClientService } from '@/lib/clientService';
import {
  SalesPipelineService,
  SalesPipelineOpportunity,
  CRMActivity,
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
// DnD Components
// ============================================

function DroppableColumn({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  // Drop-target highlight: brand teal (was ring-blue-400 before
  // 2026-05-06). Brand color is the right semantic here — drag-drop is
  // an active app interaction, not a category indicator.
  return (
    <div ref={setNodeRef} className={`${className} ${isOver ? 'ring-2 ring-brand ring-offset-2' : ''}`}>
      {children}
    </div>
  );
}

function SortableCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

function SortableTableRow({ id, children, className, onClick }: { id: string; children: React.ReactNode; className?: string; onClick?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 1 : 0,
  };
  return (
    <TableRow ref={setNodeRef} style={style} className={`${className || ''} ${isDragging ? 'bg-blue-50 shadow-lg' : ''}`} onClick={onClick}>
      <TableCell className="w-10">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 rounded"
          onClick={e => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4 text-gray-400" />
        </div>
      </TableCell>
      {children}
    </TableRow>
  );
}

// ============================================
// Main Page
// ============================================

export default function SalesPipelinePage() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Data state
  const [loading, setLoading] = useState(true);
  const [opportunities, setOpportunities] = useState<SalesPipelineOpportunity[]>([]);
  const [affiliates, setAffiliates] = useState<CRMAffiliate[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [metrics, setMetrics] = useState({ totalCount: 0, bucketA: 0, bucketB: 0, bucketC: 0, activeValue: 0, bamfamViolations: 0 });

  // Weekly Activity Funnel (header) — canonical 5-stage outbound funnel.
  // Backed by migration 044's `direction` column on crm_activities +
  // auto-stamped milestones (proposal_sent_at, etc.) from createActivity.
  // Counts distinct opportunities per stage — one prospect DM'd 5x = 1.
  type SalesFunnelData = {
    window_days: number;
    outreach: number;
    replies: number;
    calls_booked: number;
    calls_taken: number;
    proposals_sent: number;
  };
  const [salesFunnel, setSalesFunnel] = useState<SalesFunnelData | null>(null);
  const [salesFunnelWindow, setSalesFunnelWindow] = useState<7 | 14 | 30>(7);
  useEffect(() => {
    fetch(`/api/analytics/sales-funnel?days=${salesFunnelWindow}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && typeof d.outreach === 'number') setSalesFunnel(d); })
      .catch(() => {});
  }, [salesFunnelWindow]);

  // UI state
  const [searchTerm, setSearchTerm] = useState('');
  const [actionsSearch, setActionsSearch] = useState('');
  const [pipelineSearch, setPipelineSearch] = useState('');
  const [orbitSearch, setOrbitSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'actions' | 'outreach' | 'pipeline' | 'orbit' | 'overview' | 'templates' | 'discovery'>('actions');
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('table');
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

  // Top sub-section tabs — Forecast + Metrics live in a separate Tabs
  // container above the main tab strip (between Weekly Activity Funnel
  // and Attention Cards). Independent of `activeTab` so users can keep
  // both views in mind without one resetting the other.
  const [topSectionTab, setTopSectionTab] = useState<'forecast' | 'metrics'>('forecast');

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
  const [activities, setActivities] = useState<CRMActivity[]>([]);
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

  // Dashboard
  const [showDashboard, setShowDashboard] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Outreach state
  const [outreachOpps, setOutreachOpps] = useState<SalesPipelineOpportunity[]>([]);
  const [outreachTotal, setOutreachTotal] = useState(0);
  const [outreachPage, setOutreachPage] = useState(1);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [outreachFilters, setOutreachFilters] = useState<{
    dm_account?: DmAccount;
    bucket?: Bucket;
    bumpRange?: 'none' | '1-2' | '3+';
    searchTerm: string;
    owner_id?: string | 'mine';
  }>({ searchTerm: '', owner_id: 'mine' });
  const [outreachAllTotal, setOutreachAllTotal] = useState(0);
  const [selectedOutreach, setSelectedOutreach] = useState<string[]>([]);
  const [isBulkBumping, setIsBulkBumping] = useState(false);
  const [isBulkReassigning, setIsBulkReassigning] = useState(false);
  const [bulkOwnerOpen, setBulkOwnerOpen] = useState(false);
  const [isBulkMoving, setIsBulkMoving] = useState(false);
  // Orbit-tab multi-select — mirrors selectedOutreach. Bulk handlers below.
  const [selectedOrbit, setSelectedOrbit] = useState<string[]>([]);
  const [isOrbitBulkMoving, setIsOrbitBulkMoving] = useState(false);
  const outreachSearchTimeout = useRef<NodeJS.Timeout | null>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
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
  const [overviewSections, setOverviewSections] = useState<{ outreach: boolean; pipeline: boolean; orbit: boolean; nurture: boolean }>({ outreach: false, pipeline: false, orbit: false, nurture: false });

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

  // Dashboard time period filter
  const [dashboardPeriod, setDashboardPeriod] = useState<'today' | '7d' | '30d' | 'all' | 'custom'>('all');
  const [dashboardCustomFrom, setDashboardCustomFrom] = useState('');
  const [dashboardCustomTo, setDashboardCustomTo] = useState('');

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

  const dashboardMetrics = useMemo(() => {
    // Filter opportunities by selected time period
    let all = opportunities;
    if (dashboardPeriod !== 'all') {
      const now = new Date();
      let fromDate: Date | null = null;
      let toDate: Date | null = null;
      if (dashboardPeriod === 'today') {
        fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (dashboardPeriod === '7d') {
        fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (dashboardPeriod === '30d') {
        fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (dashboardPeriod === 'custom') {
        if (dashboardCustomFrom) fromDate = new Date(dashboardCustomFrom);
        if (dashboardCustomTo) {
          toDate = new Date(dashboardCustomTo);
          toDate.setHours(23, 59, 59, 999);
        }
      }
      all = opportunities.filter(o => {
        if (!o.created_at) return false;
        const created = new Date(o.created_at);
        if (fromDate && created < fromDate) return false;
        if (toDate && created > toDate) return false;
        return true;
      });
    }

    // Single pass to bucket opportunities by stage and accumulate metrics
    const pipelineSet = new Set(PIPELINE_STAGES as string[]);
    const bookedSet = new Set(['booked', 'discovery_done', 'proposal_call', 'v2_contract', 'v2_closed_won']);
    const discoverySet = new Set(['discovery_done', 'proposal_call', 'v2_contract', 'v2_closed_won']);
    const proposalSet = new Set(['proposal_call', 'v2_contract', 'v2_closed_won']);
    const closingSet = new Set(['discovery_done', 'proposal_call', 'v2_contract']);
    const stageProbability: Record<string, number> = {
      cold_dm: 0.05, warm: 0.1, tg_intro: 0.15, booked: 0.25,
      discovery_done: 0.4, proposal_call: 0.7, v2_contract: 0.9,
    };

    let coldDmCount = 0, pastColdDm = 0, meetingsBooked = 0, discoveryCalls = 0, proposalsSent = 0;
    let closedWonCount = 0, closedLostCount = 0, orbitCount = 0;
    let pipelineValue = 0, weightedPipeline = 0;
    let wonValueSum = 0, wonValueCount = 0, closeTimeSum = 0, closeTimeCount = 0;
    let qualifiedCount = 0, bucketACount = 0;
    let overdueFollowups = 0, staleDeals = 0, dealsAtRisk = 0;
    let meetingsThisWeek = 0, meetingsToday = 0;
    const closedWonOpps: typeof all = [];
    const pipelineActiveOpps: typeof all = [];

    const nowMs = Date.now();
    const nowIso = new Date().toISOString();
    const nowDate = new Date();
    const todayStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    for (const o of all) {
      const stage = o.stage;
      const isPipeline = pipelineSet.has(stage);

      // Stage buckets
      if (stage === 'cold_dm') coldDmCount++;
      else pastColdDm++;
      if (bookedSet.has(stage)) meetingsBooked++;
      if (discoverySet.has(stage)) discoveryCalls++;
      if (proposalSet.has(stage)) proposalsSent++;
      if (stage === 'v2_closed_won') { closedWonCount++; closedWonOpps.push(o); }
      if (stage === 'v2_closed_lost') closedLostCount++;
      if (stage === 'orbit') orbitCount++;

      // Pipeline active metrics
      if (isPipeline) {
        pipelineActiveOpps.push(o);
        pipelineValue += o.deal_value || 0;
        weightedPipeline += (o.deal_value || 0) * (stageProbability[stage] || 0.1);
        if (o.next_meeting_at) {
          if (o.next_meeting_at < nowIso) overdueFollowups++;
          const mt = new Date(o.next_meeting_at);
          if (mt >= todayStart && mt < weekEnd) meetingsThisWeek++;
          if (mt >= todayStart && mt < tomorrowStart) meetingsToday++;
        }
        const lastDate = o.last_contacted_at || o.last_bump_date || o.created_at;
        if (!lastDate || Math.floor((nowMs - new Date(lastDate).getTime()) / 86400000) >= 7) staleDeals++;
      }

      // Deals at risk
      if (closingSet.has(stage) && o.temperature_score < 40) dealsAtRisk++;

      // Bucket counts
      if (o.bucket === 'A' || o.bucket === 'B') qualifiedCount++;
      if (o.bucket === 'A') bucketACount++;

      // Won deal value + close time
      if (stage === 'v2_closed_won') {
        const val = o.deal_value || 0;
        if (val > 0) { wonValueSum += val; wonValueCount++; }
        if (o.created_at && o.closed_at) {
          closeTimeSum += (new Date(o.closed_at).getTime() - new Date(o.created_at).getTime()) / 86400000;
          closeTimeCount++;
        }
      }
    }

    const totalDmsSent = all.length;
    const totalClosed = closedWonCount + closedLostCount;
    const totalRevenue = closedWonOpps.reduce((sum, o) => sum + (o.deal_value || 0), 0);

    // Bottleneck analysis (kept as multi-pass — runs on period-filtered data which is smaller)
    const funnelStages: SalesPipelineStage[] = ['cold_dm', 'warm', 'tg_intro', 'booked', 'discovery_done', 'proposal_call', 'v2_contract', 'v2_closed_won'];
    const stageOrder: Record<string, number> = {};
    funnelStages.forEach((s, i) => { stageOrder[s] = i; });

    const reachedStage = funnelStages.map(stage => {
      const idx = stageOrder[stage];
      return all.filter(o => {
        const oIdx = stageOrder[o.stage];
        if (oIdx !== undefined) return oIdx >= idx;
        if (o.stage === 'orbit' || o.stage === 'v2_closed_lost') {
          if (o.proposal_sent_at && idx <= stageOrder['proposal_call']) return true;
          if (o.discovery_call_at && idx <= stageOrder['discovery_done']) return true;
          if (o.calendly_booked_date && idx <= stageOrder['booked']) return true;
          if (o.tg_handle && idx <= stageOrder['tg_intro']) return true;
          if ((o.last_contacted_at || o.last_bump_date) && idx <= stageOrder['warm']) return true;
          return idx <= stageOrder['cold_dm'];
        }
        return false;
      }).length;
    });

    const stageConversions = funnelStages.slice(0, -1).map((stage, i) => {
      const from = reachedStage[i];
      const to = reachedStage[i + 1];
      return { stage, nextStage: funnelStages[i + 1], from, to, rate: from > 0 ? (to / from) * 100 : 0, dropoff: from - to };
    });

    const avgDaysInStage = funnelStages.slice(0, -1).map(stage => {
      const oppsInStage = pipelineActiveOpps.filter(o => o.stage === stage);
      if (oppsInStage.length === 0) return { stage, avgDays: 0, count: 0 };
      const totalDays = oppsInStage.reduce((sum, o) => sum + Math.floor((nowMs - new Date(o.updated_at).getTime()) / 86400000), 0);
      return { stage, avgDays: Math.round(totalDays / oppsInStage.length), count: oppsInStage.length };
    });

    const significantConversions = stageConversions.filter(c => c.from >= 3);
    const worstConversion = significantConversions.length > 0 ? significantConversions.reduce((w, c) => c.rate < w.rate ? c : w) : null;
    const significantStages = avgDaysInStage.filter(s => s.count >= 2);
    const slowestStage = significantStages.length > 0 ? significantStages.reduce((s, c) => c.avgDays > s.avgDays ? c : s) : null;

    return {
      totalDmsSent,
      responseRate: totalDmsSent > 0 ? (pastColdDm / totalDmsSent) * 100 : 0,
      meetingsBooked,
      discoveryCalls,
      closeRate: totalClosed > 0 ? (closedWonCount / totalClosed) * 100 : 0,
      avgDealSize: wonValueCount > 0 ? wonValueSum / wonValueCount : 0,
      avgCloseTime: closeTimeCount > 0 ? closeTimeSum / closeTimeCount : 0,
      qualifiedPct: all.length > 0 ? (qualifiedCount / all.length) * 100 : 0,
      bucketAPct: all.length > 0 ? (bucketACount / all.length) * 100 : 0,
      pipelineValue,
      activeDeals: pipelineActiveOpps.length,
      overdueFollowups,
      bamfamViolations: metrics.bamfamViolations,
      closedWon: closedWonCount,
      closedLost: closedLostCount,
      inOrbit: orbitCount,
      proposalsSent,
      coldDmCount: outreachTotal > 0 ? outreachTotal : coldDmCount,
      meetingsThisWeek,
      meetingsToday,
      staleDeals,
      dealsAtRisk,
      totalRevenue,
      weightedPipeline,
      stageConversions,
      avgDaysInStage,
      worstConversion,
      slowestStage,
    };
  }, [opportunities, metrics.bamfamViolations, outreachTotal, dashboardPeriod, dashboardCustomFrom, dashboardCustomTo]);

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

  const fetchData = useCallback(async () => {
    try {
      const [opps, affs, usrs, met, outreachCount, tmpls] = await Promise.all([
        SalesPipelineService.getAll(),
        CRMService.getAllAffiliates(),
        UserService.getAllUsers(),
        SalesPipelineService.getMetrics(),
        SalesPipelineService.getColdDmsPaginated(1, 1, {}),
        SalesPipelineService.getTemplates(),
      ]);
      setOpportunities(opps);
      setAffiliates(affs);
      setUsers(usrs);
      setMetrics(met);
      setOutreachAllTotal(outreachCount.count);
      setTemplates(tmpls);
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
      const acts = await SalesPipelineService.getActivities(oppId);
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
      const resolvedFilters = {
        ...outreachFilters,
        owner_id: outreachFilters.owner_id === 'mine' ? (user?.id || undefined) : outreachFilters.owner_id,
      };
      const result = await SalesPipelineService.getColdDmsPaginated(outreachPage, OUTREACH_PAGE_SIZE, resolvedFilters);
      setOutreachOpps(result.data);
      setOutreachTotal(result.count);
    } catch (err) {
      console.error('Error fetching outreach:', err);
    } finally {
      setOutreachLoading(false);
    }
  }, [outreachPage, outreachFilters, user?.id]);

  useEffect(() => {
    if (activeTab === 'outreach' || (activeTab === 'overview' && overviewSections.outreach)) {
      fetchOutreach();
    }
  }, [activeTab, fetchOutreach, overviewSections.outreach]);

  // Broadcast Overall search → all three subsection filters. The Overall
  // search input ONLY renders on the overview tab, so this effect only
  // fires when the user is actively typing there — and importantly, it
  // does NOT fire on tab switches (which would otherwise clobber per-tab
  // searches with the empty initial value). User mental model: typing in
  // Overall pushes that query down to each section; per-tab searches keep
  // working independently when the user is on a specific tab.
  useEffect(() => {
    const term = overallSearch;
    setPipelineSearch(term);
    setOrbitSearch(term);
    setOutreachFilters(prev => prev.searchTerm === term ? prev : { ...prev, searchTerm: term });
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

  // Stage win-probability heuristic for weighted forecast. Conservative
  // numbers — easy to tune later if your team starts tracking actuals.
  const STAGE_WIN_PROB: Record<string, number> = useMemo(() => ({
    proposal_sent: 0.20,
    proposal_call: 0.40,
    v2_contract: 0.70,
  }), []);

  const forecastOpps = useMemo(
    () => opportunities.filter(o => POST_PROPOSAL_STAGES.includes(o.stage as SalesPipelineStage)),
    [opportunities, POST_PROPOSAL_STAGES],
  );

  // At-risk = proposal sent 14+ days ago AND no activity (updated_at)
  // in the last 7 days. updated_at is a reasonable proxy for "last
  // touched" without joining activities. Tune thresholds if needed.
  const isOppAtRisk = (opp: SalesPipelineOpportunity): boolean => {
    if (!opp.proposal_sent_at) return false;
    const proposalAgeDays = differenceInDays(new Date(), new Date(opp.proposal_sent_at));
    if (proposalAgeDays < 14) return false;
    if (!opp.updated_at) return true;
    const inactivityDays = differenceInDays(new Date(), new Date(opp.updated_at));
    return inactivityDays > 7;
  };

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
   * Touch 1s   = cold_dm opps owned by user, bump_number ≥ 1, created in window.
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

    const touch1s = userOpps.filter(o =>
      o.stage === 'cold_dm' && o.bump_number >= 1 && inWindow(o.created_at)
    ).length;

    // "Got a reply" proxy: opp moved past cold_dm and was either created
    // in window (new fast-converters) or had its stage change in window
    // (using updated_at as proxy for stage change).
    const replies = userOpps.filter(o =>
      o.stage !== 'cold_dm' && (inWindow(o.created_at) || inWindow(o.updated_at))
    ).length;

    const qualified = userOpps.filter(o => {
      const checks = [o.qual_budget, o.qual_dm, o.qual_timeline, o.qual_scope, o.qual_fit].filter(Boolean).length;
      return checks >= 3 && (inWindow(o.created_at) || inWindow(o.updated_at));
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
  }, [opportunities, metricsBookings]);

  // Load bookings the first time:
  //   - the user lands on the Outreach tab (for the per-user strip), OR
  //   - the top sub-section is on Metrics (for the team scorecard).
  // Pull 90 days once — covers all three range options without refetching.
  useEffect(() => {
    const wantsBookings = activeTab === 'outreach' || topSectionTab === 'metrics';
    if (!wantsBookings) return;
    if (metricsBookings.length > 0 || metricsBookingsLoading) return;
    setMetricsBookingsLoading(true);
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 90);
    BookingService.getBookingsForMetrics(from.toISOString(), to.toISOString())
      .then(rows => setMetricsBookings(rows))
      .catch(err => console.error('Error loading metrics bookings:', err))
      .finally(() => setMetricsBookingsLoading(false));
    if (!metricsUserId && user?.id) setMetricsUserId(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, topSectionTab]);

  // KPI roll-up at top of Forecast tab.
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
  }, [forecastOpps, forecastByPeriod, STAGE_WIN_PROB]);

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
    } catch {
      toast({ title: 'Error', description: 'Failed to get booking link.', variant: 'destructive' });
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

  type ActionPriority = 'urgent' | 'high' | 'medium' | 'low' | 'wait';
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

  const ACTION_GUIDANCE: Record<string, { label: string; hint: string }> = {
    'Book Next Meeting!': { label: 'Book Next Meeting', hint: 'Click the pencil icon (Edit) → set the Next Meeting date field. No deal should exist without a future meeting (BAMFAM).' },
    'Book Meeting': { label: 'Book Meeting', hint: 'Click the pencil icon (Edit) → set the Next Meeting date field to stay BAMFAM-compliant.' },
    'Get TG Handle': { label: 'Get TG Handle', hint: 'DM them asking for their Telegram handle, then click Edit → fill in the TG Handle field. Once entered, click "Got TG!" to advance.' },
    'Follow Up': { label: 'Follow Up', hint: 'Send a follow-up DM. After messaging, log it as an activity below so the team knows.' },
    'Schedule Meeting': { label: 'Schedule Meeting', hint: 'Send Calendly or propose a time. Click the pencil icon (Edit) → set the Next Meeting date field once confirmed.' },
    'Prep for Meeting': { label: 'Prep for Meeting', hint: 'Review their notes, bucket, and past activity below. Update Notes with talking points before the call.' },
    'Follow Up Proposal': { label: 'Follow Up Proposal', hint: 'Message them to check if they reviewed the proposal. Log their response as an activity below.' },
    'Send Proposal': { label: 'Send Proposal', hint: 'Draft & send the pricing proposal based on discovery call notes. This will mark the proposal as sent.' },
    'Need More Info': { label: 'Need More Info', hint: 'They need more details before a proposal. Add notes on what they need, then follow up.' },
    'Resurrect': { label: 'Resurrect Check', hint: 'It\'s been 90+ days. Review their notes — DM to re-engage, or move to Lost if no longer viable.' },
    'Chase Signature': { label: 'Chase Signature', hint: 'Follow up on the contract. Once they sign, use the "Signed!" button to close the deal.' },
    'Schedule Call': { label: 'Schedule Call', hint: 'Book a call to discuss the contract. Click Edit → set the Next Meeting date field.' },
    'Log Meeting Outcome': { label: 'Log Meeting Outcome', hint: 'A meeting just happened — add an activity below with the outcome, key takeaways, and next steps. Update the Next Meeting date if another was scheduled.' },
    'Reschedule': { label: 'Reschedule Meeting', hint: 'Meeting needs rescheduling. Click the pencil icon (Edit) → update the Next Meeting date field.' },
    'No Show': { label: 'No Show', hint: 'They didn\'t show up. Log a "No Show" activity below and decide whether to reschedule or orbit.' },
    'Keep Bumping': { label: 'Keep Bumping', hint: 'Override the orbit suggestion — review notes and continue follow-up DMs.' },
    'Re-engage or Orbit': { label: 'Re-engage', hint: 'It\'s been 7+ days with no progress on TG. Send them a nudge — if still no reply, consider orbiting.' },
    'Update Stage': { label: 'Fix Stage', hint: 'Proposal was already sent but this deal is still in Discovery Done. Move it to the correct stage.' },
    'Check In': { label: 'Nurture Check-In', hint: 'It\'s been 30+ days. Send a light touch — share content, ask how things are going, or see if timing is better now.' },
  };

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

  const getCoOwnerNames = (coOwnerIds: string[] | undefined | null) => {
    if (!coOwnerIds || coOwnerIds.length === 0) return null;
    return coOwnerIds.map(id => {
      const u = users.find(u => u.id === id);
      return u?.name || u?.email || '—';
    });
  };

  const renderOwnerCell = (opp: SalesPipelineOpportunity) => {
    const ownerName = getUserName(opp.owner_id);
    const coNames = getCoOwnerNames(opp.co_owner_ids);
    return (
      <div>
        <span>{ownerName}</span>
        {coNames && coNames.length > 0 && (
          <span className="text-[10px] text-gray-400 block">+{coNames.join(', ')}</span>
        )}
      </div>
    );
  };

  const cleanPocHandle = (handle: string): string => {
    // Strip common URL prefixes to show just the handle
    return handle
      .replace(/^https?:\/\/(www\.)?(x\.com|twitter\.com|instagram\.com|linkedin\.com\/in|t\.me|discord\.gg|discord\.com\/users)\/?/i, '@')
      .replace(/^https?:\/\/(www\.)?[^/]+\/?/i, '')
      .replace(/\/+$/, '');
  };

  /**
   * Render a project name with an inline Twitter/X link icon when a
   * twitter_handle is set. When missing, shows a "+" pill (visible on
   * row hover) that opens the edit dialog so the user can fill it in.
   *
   * Used in every table renderer (Outreach, Pipeline, Orbit, Nurture)
   * for visual consistency. The clickable area is just the icon — the
   * project name itself keeps whatever click behavior the row defines
   * (row-click for slide-over, name-click for inline edit, etc).
   */
  const renderProjectNameSuffix = (twitterHandle: string | null | undefined, onAddTwitter?: () => void) => {
    if (twitterHandle) {
      const handle = twitterHandle.replace(/^@/, '').replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//, '').replace(/\/$/, '');
      return (
        <a
          href={`https://x.com/${handle}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex-shrink-0 inline-flex items-center justify-center h-4 w-4 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
          title={`Open @${handle} on X`}
        >
          <Twitter className="h-3 w-3" />
        </a>
      );
    }
    if (onAddTwitter) {
      return (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAddTwitter(); }}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 inline-flex items-center justify-center h-4 w-4 rounded text-gray-400 hover:text-brand hover:bg-brand-light transition-all"
          title="Add Twitter/X handle"
        >
          <Plus className="h-3 w-3" />
        </button>
      );
    }
    return null;
  };

  /**
   * Render the POC cell — platform badge + handle. When platform is
   * 'twitter' the handle becomes a clickable link to x.com that opens
   * in a new tab. For other platforms the handle stays as plain text
   * (we don't have URL builders for IG/LinkedIn/Telegram handles).
   */
  const renderPocCell = (opp: SalesPipelineOpportunity, maxWidthClass = 'max-w-[120px]') => {
    if (!opp.poc_handle) return <span className="text-gray-400 text-xs">—</span>;
    const cleanHandle = cleanPocHandle(opp.poc_handle);
    const isTwitter = opp.poc_platform === 'twitter';
    const xHandle = cleanHandle.replace(/^@/, '');
    return (
      <div className="flex items-center gap-1.5 overflow-hidden">
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize shrink-0">
          {opp.poc_platform || 'other'}
        </Badge>
        {isTwitter && xHandle ? (
          <a
            href={`https://x.com/${xHandle}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`text-xs text-blue-600 hover:underline truncate ${maxWidthClass}`}
            title={cleanHandle}
          >
            {cleanHandle}
          </a>
        ) : (
          <span className={`text-xs text-gray-600 truncate ${maxWidthClass}`}>
            {cleanHandle}
          </span>
        )}
      </div>
    );
  };

  const linkifyText = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    if (parts.length === 1) return text;
    return parts.map((part, i) =>
      urlRegex.test(part) ? (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline break-all" onClick={e => e.stopPropagation()}>{part}</a>
      ) : part
    );
  };

  const activityIcon = (type: ActivityType) => {
    switch (type) {
      case 'call': return <Phone className="h-3.5 w-3.5" />;
      case 'message': return <MessageSquare className="h-3.5 w-3.5" />;
      case 'meeting': return <Calendar className="h-3.5 w-3.5" />;
      case 'proposal': return <FileText className="h-3.5 w-3.5" />;
      case 'note': return <StickyNote className="h-3.5 w-3.5" />;
      case 'bump': return <Zap className="h-3.5 w-3.5" />;
    }
  };

  // ============================================
  // RENDER: Opportunity Card (Kanban)
  // ============================================

  const renderCard = (opp: SalesPipelineOpportunity, isDragging: boolean = false) => {
    const colors = STAGE_COLORS[opp.stage as SalesPipelineStage] || STAGE_COLORS.cold_dm;
    const bamfam = isBAMFAM(opp);

    return (
      <Card
        className={`group hover:shadow-md transition-all duration-200 border-l-4 ${colors.border} ${isDragging ? 'shadow-lg ring-2 ring-brand opacity-90' : ''} ${bamfam ? 'bg-red-50/30' : ''}`}
        onClick={() => openSlideOver(opp)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {/* Name with drag handle */}
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-gray-300 flex-shrink-0 cursor-grab active:cursor-grabbing" />
                <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <p className="font-medium text-gray-900 truncate">{opp.name}</p>
              </div>

              {/* Deal Value */}
              {opp.deal_value && (
                <p className="text-lg font-semibold text-emerald-600 mt-2">
                  ${opp.deal_value.toLocaleString()}
                </p>
              )}

              {/* Badges */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {opp.bucket && (
                  <Badge className={`text-xs ${BUCKET_COLORS[opp.bucket].bg} ${BUCKET_COLORS[opp.bucket].text} border-0`}>
                    Bucket {opp.bucket}
                  </Badge>
                )}
                {opp.dm_account === 'closer' && (
                  <Badge variant="outline" className="text-xs bg-white border-blue-300 text-blue-600">Closer</Badge>
                )}
                {opp.dm_account === 'sdr' && (
                  <Badge variant="outline" className="text-xs bg-white border-green-300 text-green-600">SDR</Badge>
                )}
                {opp.source && (
                  <Badge variant="outline" className="text-xs bg-white capitalize">
                    {opp.source.replace('_', ' ')}
                  </Badge>
                )}
              </div>

              {/* Details */}
              <div className="mt-3 space-y-1.5 text-xs text-gray-500">
                {/* Bump progress (cold_dm only) */}
                {opp.stage === 'cold_dm' && (
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-3 w-3 flex-shrink-0 text-sky-500" />
                    <span>Bump {opp.bump_number}/4</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className={`w-1.5 h-1.5 rounded-full ${i <= opp.bump_number ? 'bg-sky-500' : 'bg-gray-200'}`} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Warm sub-state */}
                {opp.stage === 'warm' && opp.warm_sub_state && (
                  <div className="flex items-center gap-1.5">
                    <MessageSquare className="h-3 w-3 flex-shrink-0" />
                    <span className={opp.warm_sub_state === 'interested' ? 'text-green-600 font-medium' : 'text-gray-500'}>
                      {opp.warm_sub_state === 'interested' ? 'Interested' : 'Silent'}
                    </span>
                  </div>
                )}

                {/* Temperature bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${opp.temperature_score >= 70 ? 'bg-green-500' : opp.temperature_score >= 40 ? 'bg-amber-500' : 'bg-red-400'}`}
                      style={{ width: `${opp.temperature_score}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400">{opp.temperature_score}</span>
                </div>

                {/* BAMFAM warning */}
                {bamfam && (
                  <div className="flex items-center gap-1.5 text-red-600">
                    <AlertTriangle className="h-3 w-3" />
                    <span className="font-medium">BAMFAM</span>
                  </div>
                )}

                {/* Last bumped */}
                {(opp.last_bump_date || opp.last_contacted_at) && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 flex-shrink-0" />
                    <span>
                      {opp.last_bump_date
                        ? `Bumped ${formatDistanceToNow(new Date(opp.last_bump_date), { addSuffix: true })}`
                        : `Contacted ${formatDistanceToNow(new Date(opp.last_contacted_at!), { addSuffix: true })}`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {!isDragging && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 z-[80]">
                  <DropdownMenuItem onClick={e => { e.stopPropagation(); openEditDialog(opp); }}>
                    <Edit className="h-4 w-4 mr-2" /> Edit
                  </DropdownMenuItem>
                  {opp.stage === 'cold_dm' && (
                    <DropdownMenuItem onClick={e => { e.stopPropagation(); handleRecordBump(opp.id); }}>
                      <Zap className="h-4 w-4 mr-2" /> Record Bump
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={e => { e.stopPropagation(); handleStageChange(opp.id, 'orbit', opp.stage); }} className="text-orange-600">
                    <RotateCcw className="h-4 w-4 mr-2" /> Move to Orbit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={e => { e.stopPropagation(); handleDelete(opp.id); }} className="text-red-600">
                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  // ============================================
  // RENDER: Kanban View
  // ============================================

  const renderKanban = () => (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 h-full">
        {visiblePipelineStages.map(stage => {
          const stageOpps = getStageOpps(stage);
          const colors = STAGE_COLORS[stage];
          const isCollapsed = collapsedKanbanStages.has(stage);
          const stageValue = stageOpps.reduce((sum, o) => sum + (o.deal_value || 0), 0);

          return (
            <div
              key={stage}
              className={`${isCollapsed ? 'w-12' : 'flex-1 min-w-[280px] max-w-[320px]'} flex flex-col h-full transition-all duration-200`}
            >
              {/* Column Header */}
              <div
                className={`${isCollapsed ? 'rounded-lg' : 'rounded-t-lg'} px-4 py-3 ${colors.bg} border ${colors.border} ${isCollapsed ? '' : 'border-b-0'} flex-shrink-0 cursor-pointer select-none`}
                onClick={() => toggleKanbanCollapse(stage)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isCollapsed ? (
                      <ChevronRight className={`w-4 h-4 ${colors.text}`} />
                    ) : (
                      <ChevronDown className={`w-4 h-4 ${colors.text}`} />
                    )}
                    {!isCollapsed && (
                      <>
                        <h4 className={`font-semibold ${colors.text}`}>{STAGE_LABELS[stage]}</h4>
                        <Badge variant="secondary" className="text-xs font-medium">{stageOpps.length}</Badge>
                      </>
                    )}
                  </div>
                </div>
                {!isCollapsed && stageValue > 0 && (
                  <p className="text-sm font-medium text-gray-600 mt-1">
                    ${stageValue.toLocaleString()}
                  </p>
                )}
                {isCollapsed && (
                  <div className="mt-2 flex flex-col items-center gap-1">
                    <span className={`font-semibold ${colors.text}`} style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
                      {STAGE_LABELS[stage]}
                    </span>
                    <Badge variant="secondary" className="text-xs font-medium mt-1">{stageOpps.length}</Badge>
                  </div>
                )}
              </div>

              {/* Column Content - Droppable Area */}
              {!isCollapsed && (
                <DroppableColumn id={stage} className={`flex-1 bg-gray-50/50 border border-gray-200 border-t-0 rounded-b-lg p-3 space-y-3 overflow-y-auto transition-colors`}>
                  <SortableContext items={stageOpps.map(o => o.id)} strategy={verticalListSortingStrategy}>
                    {stageOpps.length === 0 ? (
                      <div className="flex items-center justify-center h-24 text-sm text-gray-400">
                        No opportunities
                      </div>
                    ) : (
                      stageOpps.map(opp => (
                        <SortableCard key={opp.id} id={opp.id}>
                          {renderCard(opp)}
                        </SortableCard>
                      ))
                    )}
                  </SortableContext>
                </DroppableColumn>
              )}
            </div>
          );
        })}

        {/* Orbit drop zone */}
        <div className="w-12 flex flex-col h-full transition-all duration-200">
          <DroppableColumn id="orbit" className="rounded-lg px-4 py-3 bg-orange-50 border border-orange-200 flex-shrink-0 cursor-pointer select-none">
            <div className="flex flex-col items-center gap-1">
              <RotateCcw className="w-4 h-4 text-orange-700" />
              <span className="font-semibold text-orange-700 mt-2" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
                Orbit
              </span>
              <Badge variant="secondary" className="text-xs font-medium mt-1">{allOrbitOpps.length}</Badge>
            </div>
          </DroppableColumn>
        </div>

        {/* Closed Lost drop zone */}
        <div className="w-12 flex flex-col h-full transition-all duration-200">
          <DroppableColumn id="v2_closed_lost" className="rounded-lg px-4 py-3 bg-red-50 border border-red-200 flex-shrink-0 cursor-pointer select-none">
            <div className="flex flex-col items-center gap-1">
              <X className="w-4 h-4 text-red-700" />
              <span className="font-semibold text-red-700 mt-2" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
                Lost
              </span>
              <Badge variant="secondary" className="text-xs font-medium mt-1">
                {filteredOpportunities.filter(o => o.stage === 'v2_closed_lost').length}
              </Badge>
            </div>
          </DroppableColumn>
        </div>
      </div>

      <DragOverlay>
        {activeOpportunity ? (
          <div className="w-[280px]">
            {renderCard(activeOpportunity, true)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );

  // ============================================
  // RENDER: Table View
  // ============================================

  const renderTable = () => (
    <div className="pb-8">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {visiblePipelineStages.map(stage => {
          const stageOpps = getStageOpps(stage);
          const colors = STAGE_COLORS[stage];
          const isCollapsed = collapsedStages.has(stage);
          const stageValue = stageOpps.reduce((s, o) => s + (o.deal_value || 0), 0);

          return (
            <div key={stage} className="mb-6">
              {/* Stage Header */}
              <div
                onClick={() => {
                  const next = new Set(collapsedStages);
                  isCollapsed ? next.delete(stage) : next.add(stage);
                  setCollapsedStages(next);
                }}
                className={`flex items-center justify-between px-4 py-3 ${colors.bg} ${isCollapsed ? 'rounded-lg' : 'rounded-t-lg'} border ${colors.border} ${isCollapsed ? '' : 'border-b-0'} cursor-pointer select-none transition-all`}
              >
                <div className="flex items-center gap-2">
                  {isCollapsed ? <ChevronRight className={`h-4 w-4 ${colors.text}`} /> : <ChevronDown className={`h-4 w-4 ${colors.text}`} />}
                  <h4 className={`font-semibold ${colors.text}`}>{STAGE_LABELS[stage]}</h4>
                  <Badge variant="secondary" className="text-xs font-medium">{stageOpps.length}</Badge>
                </div>
                {stageValue > 0 && (
                  <span className="text-sm font-medium text-gray-600">
                    ${stageValue.toLocaleString()}
                  </span>
                )}
              </div>

              {!isCollapsed && (
                <div className="bg-white rounded-b-lg border border-gray-200 border-t-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/50">
                        {/* Path / Temp / BAMFAM columns removed 2026-05-13
                            (manager wanted a cleaner pipeline table).
                            Underlying fields still live on the opportunity
                            row — BAMFAM warnings remain in the slide-over
                            and Actions tab; temperature still drives the
                            sort options. Just not surfaced as columns. */}
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="w-[180px]">POC</TableHead>
                        <TableHead className="w-[70px]">Bucket</TableHead>
                        <TableHead className="w-[110px]">Value</TableHead>
                        <TableHead className="w-[100px]">Owner</TableHead>
                        <TableHead className="w-[100px]">TG Handle</TableHead>
                        {/* Source surfaced across every stage 2026-05-14 —
                            previously only the Outreach (cold_dm) table
                            showed it. Useful in Warm/Pipeline/Closed too
                            so it's clear where each deal originated. */}
                        <TableHead className="w-[100px]">Source</TableHead>
                        {stage === 'cold_dm' && <TableHead className="w-[80px]">Bumps</TableHead>}
                        {stage === 'warm' && <TableHead className="w-[90px]">Type</TableHead>}
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <SortableContext items={stageOpps.map(o => o.id)} strategy={verticalListSortingStrategy}>
                        {stageOpps.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={10} className="text-center text-sm text-gray-400 py-8">
                              No opportunities in this stage
                            </TableCell>
                          </TableRow>
                        ) : stageOpps.map(opp => (
                          <SortableTableRow
                            key={opp.id}
                            id={opp.id}
                            className="group hover:bg-gray-50 cursor-pointer"
                            onClick={() => openSlideOver(opp)}
                          >
                              <TableCell>
                                {editingCell?.id === opp.id && editingCell.field === 'name' ? (
                                  <Input
                                    value={editingValue}
                                    onChange={e => setEditingValue(e.target.value)}
                                    onBlur={() => handleInlineEdit(opp.id, 'name', editingValue)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleInlineEdit(opp.id, 'name', editingValue); if (e.key === 'Escape') setEditingCell(null); }}
                                    className="h-8 text-sm font-medium focus-brand"
                                    autoFocus
                                    onClick={e => e.stopPropagation()}
                                  />
                                ) : (
                                  <div
                                    onClick={e => { e.stopPropagation(); setEditingCell({ id: opp.id, field: 'name' }); setEditingValue(opp.name); }}
                                    className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 rounded px-2 py-1 -mx-2 -my-1"
                                  >
                                    <Building2 className="h-4 w-4 text-gray-400" />
                                    <span className="font-medium">{opp.name}</span>
                                    {renderProjectNameSuffix(opp.twitter_handle, () => openEditDialog(opp))}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap max-w-[180px] overflow-hidden">
                                {renderPocCell(opp, 'max-w-[120px]')}
                              </TableCell>
                              <TableCell>
                                {opp.bucket && (
                                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${BUCKET_COLORS[opp.bucket].bg} ${BUCKET_COLORS[opp.bucket].text}`}>
                                    {opp.bucket}
                                  </span>
                                )}
                              </TableCell>
                              {/* Path (dm_account) + Temp (temperature_score) columns
                                  removed from the pipeline table 2026-05-13. */}
                              <TableCell>
                                {editingCell?.id === opp.id && editingCell.field === 'deal_value' ? (
                                  <Input
                                    type="number"
                                    value={editingValue}
                                    onChange={e => setEditingValue(e.target.value)}
                                    onBlur={() => handleInlineEdit(opp.id, 'deal_value', editingValue)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleInlineEdit(opp.id, 'deal_value', editingValue); if (e.key === 'Escape') setEditingCell(null); }}
                                    className="h-8 text-sm text-right focus-brand"
                                    autoFocus
                                    onClick={e => e.stopPropagation()}
                                  />
                                ) : (
                                  <div
                                    onClick={e => { e.stopPropagation(); setEditingCell({ id: opp.id, field: 'deal_value' }); setEditingValue(String(opp.deal_value || '')); }}
                                    className="cursor-pointer hover:bg-gray-100 rounded px-2 py-1 -mx-2 -my-1 min-h-[28px] flex items-center"
                                  >
                                    {opp.deal_value ? (
                                      <span className="font-semibold text-emerald-600">${opp.deal_value.toLocaleString()}</span>
                                    ) : (
                                      <span className="text-gray-400">-</span>
                                    )}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>{renderOwnerCell(opp)}</TableCell>
                              <TableCell className="text-gray-500">{opp.tg_handle || '—'}</TableCell>
                              <TableCell className="text-gray-500 text-xs capitalize">{opp.source?.replace('_', ' ') || '—'}</TableCell>
                              {stage === 'cold_dm' && (
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <span className="text-sm">{opp.bump_number}/4</span>
                                    <div className="flex gap-0.5">
                                      {[1, 2, 3, 4].map(i => (
                                        <div key={i} className={`w-1.5 h-1.5 rounded-full ${i <= opp.bump_number ? 'bg-sky-500' : 'bg-gray-200'}`} />
                                      ))}
                                    </div>
                                  </div>
                                </TableCell>
                              )}
                              {stage === 'warm' && (
                                <TableCell>
                                  {opp.warm_sub_state ? (
                                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${opp.warm_sub_state === 'interested' ? 'border-green-300 text-green-600 bg-green-50' : 'border-gray-300 text-gray-500 bg-gray-50'}`}>
                                      {opp.warm_sub_state === 'interested' ? 'Interested' : 'Silent'}
                                    </Badge>
                                  ) : (
                                    <span className="text-gray-400 text-xs">—</span>
                                  )}
                                </TableCell>
                              )}
                              {/* BAMFAM column removed from the pipeline table
                                  2026-05-13. The flag is still computed via
                                  isBAMFAM() and surfaced in the slide-over
                                  + Actions tab. */}
                              <TableCell>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48 z-[80]">
                                    <DropdownMenuItem onClick={e => { e.stopPropagation(); openEditDialog(opp); }}>
                                      <Edit className="h-4 w-4 mr-2" /> Edit
                                    </DropdownMenuItem>
                                    {opp.stage === 'cold_dm' && (
                                      <DropdownMenuItem onClick={e => { e.stopPropagation(); handleRecordBump(opp.id); }}>
                                        <Zap className="h-4 w-4 mr-2" /> Record Bump
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={e => { e.stopPropagation(); handleStageChange(opp.id, 'orbit', opp.stage); }} className="text-orange-600">
                                      <RotateCcw className="h-4 w-4 mr-2" /> Move to Orbit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={e => { e.stopPropagation(); handleDelete(opp.id); }} className="text-red-600">
                                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                          </SortableTableRow>
                        ))}
                      </SortableContext>
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          );
        })}
        <DragOverlay>
          {activeOpportunity ? (
            <div className="bg-white border border-gray-300 shadow-lg rounded px-4 py-2 flex items-center gap-3">
              <GripVertical className="h-4 w-4 text-gray-400" />
              <Building2 className="h-4 w-4 text-gray-400" />
              <span className="font-medium">{activeOpportunity.name}</span>
              <Badge className={`text-xs ${STAGE_COLORS[activeOpportunity.stage as SalesPipelineStage]?.bg || ''} ${STAGE_COLORS[activeOpportunity.stage as SalesPipelineStage]?.text || ''}`}>
                {STAGE_LABELS[activeOpportunity.stage as SalesPipelineStage] || activeOpportunity.stage}
              </Badge>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );

  // ============================================
  // RENDER: Outreach Tab
  // ============================================

  const outreachTotalPages = Math.ceil(outreachTotal / OUTREACH_PAGE_SIZE);
  const outreachStart = (outreachPage - 1) * OUTREACH_PAGE_SIZE + 1;
  const outreachEnd = Math.min(outreachPage * OUTREACH_PAGE_SIZE, outreachTotal);

  const handleOutreachSearch = (value: string) => {
    if (outreachSearchTimeout.current) clearTimeout(outreachSearchTimeout.current);
    outreachSearchTimeout.current = setTimeout(() => {
      setOutreachFilters(prev => ({ ...prev, searchTerm: value }));
      setOutreachPage(1);
      setSelectedOutreach([]);
    }, 400);
  };

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

  const renderOutreachTab = () => (
    <div className="pb-8">
      {/* Personal metrics strip — shows the current user's last-30-day
          outreach scorecard above their work surface. Self-feedback loop
          while they're actually working. Manager-style aggregate view
          lives on the Metrics tab. */}
      {user?.id && (() => {
        const personal = computeOutreachMetrics(user.id, 30);
        const items = [
          { label: 'Touch 1s', value: personal.touch1s },
          { label: 'Replies', value: personal.replies },
          { label: 'Reply %', value: `${(personal.replyRate * 100).toFixed(0)}%`, tone: personal.replyRate >= 0.2 ? 'good' as const : 'neutral' as const },
          { label: 'Qualified', value: personal.qualified },
          { label: 'Booked', value: personal.callsBooked },
          { label: 'Held', value: personal.callsHeld, tone: 'good' as const },
          { label: 'No-show', value: personal.noShows, tone: personal.noShows > 0 ? 'bad' as const : 'neutral' as const },
        ];
        return (
          <div className="mb-4 bg-gradient-to-r from-sky-50 to-white border border-sky-100 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-sky-700 uppercase tracking-wide">My outreach · last 30 days</span>
              <button
                onClick={() => {
                  setTopSectionTab('metrics');
                  // Scroll to the top sub-section so the user actually
                  // sees the Metrics view they just switched to.
                  if (typeof window !== 'undefined') {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
                className="text-xs text-sky-700 hover:underline"
              >
                View team metrics →
              </button>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {items.map(it => (
                <div key={it.label} className="text-center">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider">{it.label}</div>
                  <div className={`text-lg font-bold tabular-nums ${
                    it.tone === 'good' ? 'text-emerald-700' :
                    it.tone === 'bad' ? 'text-rose-600' :
                    'text-gray-900'
                  }`}>{it.value}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Owner sub-tabs */}
      <div className="flex items-center gap-1 mb-4">
        <button
          onClick={() => { setOutreachFilters(prev => ({ ...prev, owner_id: 'mine' })); setOutreachPage(1); setSelectedOutreach([]); }}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            outreachFilters.owner_id === 'mine'
              ? 'bg-sky-100 text-sky-700 border border-sky-200'
              : 'text-gray-600 hover:bg-gray-100 border border-transparent'
          }`}
        >
          My Outreach
        </button>
        <button
          onClick={() => { setOutreachFilters(prev => ({ ...prev, owner_id: undefined })); setOutreachPage(1); setSelectedOutreach([]); }}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            !outreachFilters.owner_id
              ? 'bg-sky-100 text-sky-700 border border-sky-200'
              : 'text-gray-600 hover:bg-gray-100 border border-transparent'
          }`}
        >
          All Owners
          <span className="ml-1.5 text-[10px] font-semibold opacity-70">{outreachAllTotal}</span>
        </button>
        {users.filter(u => u.id !== user?.id).map(u => (
          <button
            key={u.id}
            onClick={() => { setOutreachFilters(prev => ({ ...prev, owner_id: u.id })); setOutreachPage(1); setSelectedOutreach([]); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              outreachFilters.owner_id === u.id
                ? 'bg-sky-100 text-sky-700 border border-sky-200'
                : 'text-gray-600 hover:bg-gray-100 border border-transparent'
            }`}
          >
            {u.name || u.email}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search cold DMs..."
            defaultValue={outreachFilters.searchTerm}
            onChange={e => handleOutreachSearch(e.target.value)}
            className="pl-9 h-9 text-sm focus-brand"
          />
        </div>
        <Select
          value={outreachFilters.dm_account || 'all'}
          onValueChange={v => { setOutreachFilters(prev => ({ ...prev, dm_account: v === 'all' ? undefined : v as DmAccount })); setOutreachPage(1); setSelectedOutreach([]); }}
        >
          <SelectTrigger className="h-9 w-auto text-sm focus-brand [&>span]:truncate-none [&>span]:line-clamp-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Paths</SelectItem>
            <SelectItem value="closer">Closer</SelectItem>
            <SelectItem value="sdr">SDR</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={outreachFilters.bucket || 'all'}
          onValueChange={v => { setOutreachFilters(prev => ({ ...prev, bucket: v === 'all' ? undefined : v as Bucket })); setOutreachPage(1); setSelectedOutreach([]); }}
        >
          <SelectTrigger className="h-9 w-auto text-sm focus-brand [&>span]:truncate-none [&>span]:line-clamp-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Buckets</SelectItem>
            <SelectItem value="A">Bucket A</SelectItem>
            <SelectItem value="B">Bucket B</SelectItem>
            <SelectItem value="C">Bucket C</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={outreachFilters.bumpRange || 'all'}
          onValueChange={v => { setOutreachFilters(prev => ({ ...prev, bumpRange: v === 'all' ? undefined : v as 'none' | '1-2' | '3+' })); setOutreachPage(1); setSelectedOutreach([]); }}
        >
          <SelectTrigger className="h-9 w-auto text-sm focus-brand [&>span]:truncate-none [&>span]:line-clamp-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Bump Status</SelectItem>
            <SelectItem value="none">No Bumps</SelectItem>
            <SelectItem value="1-2">1-2 Bumps</SelectItem>
            <SelectItem value="3+">3+ Bumps</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action toolbar — sticky so it stays visible while scrolling.
          `top-0` pins it to the viewport (or the nearest scrolling ancestor);
          z-30 keeps it above the table header but below dialogs/dropdowns. */}
      {selectedOutreach.length > 0 && (
        <div className="sticky top-0 z-30 flex items-center gap-3 mb-3 px-4 py-2.5 bg-sky-50 border border-sky-200 rounded-lg shadow-sm">
          <span className="text-sm font-medium text-sky-800">{selectedOutreach.length} selected</span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectAllOnPage}>
            Select All on Page
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSelectedOutreach([])}>
            Deselect All
          </Button>
          <div className="flex-1" />
          <Button
            size="sm"
            className="h-7 text-xs bg-sky-600 hover:bg-sky-700 text-white"
            onClick={handleBulkBump}
            disabled={isBulkBumping}
          >
            {isBulkBumping ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
            Bump All
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
            onClick={handleBulkMoveToWarm}
            disabled={isBulkMoving}
          >
            {isBulkMoving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ArrowRight className="h-3 w-3 mr-1" />}
            Move to Warm
          </Button>
          {/* Bulk owner reassign — searchable list of teammates with TG ids
              first (more useful), then everyone else. "Unassigned" clears
              the owner. */}
          <Popover open={bulkOwnerOpen} onOpenChange={setBulkOwnerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={isBulkReassigning}
              >
                {isBulkReassigning
                  ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  : <Users className="h-3 w-3 mr-1" />}
                Reassign
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="end">
              <Command>
                <CommandInput placeholder="Reassign to..." />
                <CommandList>
                  <CommandEmpty>No matches.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="__unassigned__"
                      onSelect={() => handleBulkReassignOwner(null, 'Unassigned')}
                    >
                      <span className="text-gray-500 italic">Unassigned</span>
                    </CommandItem>
                    {users.map(u => (
                      <CommandItem
                        key={u.id}
                        value={`${u.name || ''} ${u.email}`}
                        onSelect={() => handleBulkReassignOwner(u.id, u.name || u.email)}
                      >
                        <div className="flex flex-col">
                          <span>{u.name || u.email}</span>
                          {u.name && <span className="text-[10px] text-gray-400">{u.email}</span>}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
            onClick={handleBulkDelete}
          >
            <Trash2 className="h-3 w-3 mr-1" /> Delete
          </Button>
        </div>
      )}

      {/* Stage Header — matching pipeline table section headers */}
      <div className={`flex items-center justify-between px-4 py-3 bg-sky-50 rounded-t-lg border border-sky-200 border-b-0`}>
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-sky-700" />
          <h4 className="font-semibold text-sky-700">Cold DM</h4>
          <Badge variant="secondary" className="text-xs font-medium">{outreachTotal}</Badge>
        </div>
        {outreachTotalPages > 1 && (
          <span className="text-sm text-gray-500">
            Page {outreachPage} of {outreachTotalPages}
          </span>
        )}
      </div>

      {/* Table */}
      {outreachLoading ? (
        <div className="bg-white rounded-b-lg border border-gray-200 border-t-0 p-4 space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-b-lg border border-gray-200 border-t-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/50">
                <TableHead className="w-10"></TableHead>
                <TableHead className="min-w-[160px]">Name</TableHead>
                <TableHead className="w-[200px] max-w-[200px]">POC</TableHead>
                <TableHead className="w-[150px]">TG Handle</TableHead>
                <TableHead className="w-[80px]">Source</TableHead>
                <TableHead className="w-[100px]">Owner</TableHead>
                <TableHead className="w-[90px]">Created</TableHead>
                {/* Combined "Last engaged · next move" — merges the old
                    Bumps + Last Bump columns and adds the action hint
                    from getNextAction so users have engagement history
                    AND the recommended next move in one place. */}
                <TableHead className="w-[260px]">Last engaged · next move</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outreachOpps.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-sm text-gray-400 py-8">
                    No opportunities in this stage
                  </TableCell>
                </TableRow>
              ) : sortedOutreach.map((opp, index) => {
                const isChecked = selectedOutreach.includes(opp.id);
                const rowNum = outreachStart + index;
                const prevName = index > 0 ? sortedOutreach[index - 1].name : null;
                const isFirstInGroup = opp.name !== prevName;
                const groupCount = outreachNameCounts.get(opp.name || '') || 1;
                const nextName = index < sortedOutreach.length - 1 ? sortedOutreach[index + 1].name : null;
                const isLastInGroup = opp.name !== nextName;
                return (
                  <TableRow
                    key={opp.id}
                    className={`group hover:bg-gray-50 cursor-pointer ${!isFirstInGroup ? 'border-t-0' : ''} ${isLastInGroup && groupCount > 1 ? 'border-b-2 border-b-gray-200' : ''}`}
                    onClick={() => openSlideOver(opp)}
                  >
                    <TableCell className="text-gray-500 text-sm w-10" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center">
                        {isChecked ? (
                          <Checkbox
                            checked={true}
                            onCheckedChange={() => toggleOutreachSelect(opp.id)}
                          />
                        ) : (
                          <>
                            <span className="block group-hover:hidden text-xs">{rowNum}</span>
                            <span className="hidden group-hover:flex">
                              <Checkbox
                                checked={false}
                                onCheckedChange={() => toggleOutreachSelect(opp.id)}
                              />
                            </span>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className={`${!isFirstInGroup ? 'pt-0' : ''}`}>
                      {isFirstInGroup ? (
                        <div className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-100 rounded px-2 py-1 -mx-2 -my-1 whitespace-nowrap overflow-hidden">
                          <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                          <span className="font-medium truncate">{opp.name}</span>
                          {renderProjectNameSuffix(opp.twitter_handle, () => openEditDialog(opp))}
                          {groupCount > 1 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium shrink-0 whitespace-nowrap">{groupCount} POCs</span>
                          )}
                          {/* Sits inline right next to the Twitter +
                              from renderProjectNameSuffix instead of
                              floating at the far-right of the cell —
                              the two affordances ("add twitter handle"
                              and "add another POC") are related, so
                              grouping them reduces eye travel. Removed
                              the ml-auto that previously pushed this
                              all the way right. */}
                          <button
                            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 hover:text-brand"
                            title="Add another POC for this project"
                            onClick={e => {
                              e.stopPropagation();
                              setForm({
                                name: opp.name,
                                stage: 'cold_dm' as OpportunityStage,
                                dm_account: opp.dm_account,
                                bucket: opp.bucket || undefined,
                                source: opp.source || undefined,
                                owner_id: opp.owner_id || undefined,
                                co_owner_ids: opp.co_owner_ids || undefined,
                                referrer: opp.referrer || undefined,
                                affiliate_id: opp.affiliate_id || undefined,
                              });
                              setIsCreateOpen(true);
                            }}
                          >
                            {/* UserPlus instead of Plus so the icon matches
                                the semantics — this adds another contact to
                                an existing project. The Twitter button next
                                to it uses Plus (it adds an attribute, not
                                another row). */}
                            <UserPlus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="pl-8 text-gray-300 text-xs">└</div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap max-w-[200px] overflow-hidden">
                      {renderPocCell(opp, 'max-w-[150px]')}
                    </TableCell>
                    {/* Old Bumps cell removed 2026-05-14 — merged into the
                        new "Last engaged · next move" cell at the right. */}
                    <TableCell className="text-gray-500 whitespace-nowrap">{opp.tg_handle || '—'}</TableCell>
                    <TableCell className="text-gray-500 text-xs capitalize">{opp.source?.replace('_', ' ') || '—'}</TableCell>
                    <TableCell>{renderOwnerCell(opp)}</TableCell>
                    <TableCell className="text-gray-500 text-xs">
                      {opp.created_at ? format(new Date(opp.created_at), 'MMM d') : '—'}
                    </TableCell>
                    {/* Combined "Last engaged · next move" cell.
                        Top row: bump dots + count, last-engagement timestamp,
                                 and the Zap button to record another bump.
                        Bottom row: the recommended next move from
                                 getNextAction (same logic the Actions tab
                                 uses), color-coded by priority.
                        Stops click propagation so the inline buttons don't
                        bubble into openSlideOver. */}
                    <TableCell className="text-xs" onClick={e => e.stopPropagation()}>
                      {(() => {
                        const action = getNextAction(opp);
                        const lastEngaged = opp.last_bump_date || opp.last_contacted_at;
                        const lastEngagedLabel = lastEngaged
                          ? formatDistanceToNow(new Date(lastEngaged), { addSuffix: true })
                          : 'Not engaged yet';
                        // Days-since-last for amber-warning at 3+ days.
                        const daysSinceLast = lastEngaged
                          ? Math.floor((Date.now() - new Date(lastEngaged).getTime()) / 86_400_000)
                          : null;
                        const stale = daysSinceLast !== null && daysSinceLast >= 3;
                        const priorityColor =
                          action.priority === 'urgent' ? 'text-red-600'
                          : action.priority === 'high' ? 'text-amber-600'
                          : action.priority === 'medium' ? 'text-sky-700'
                          : 'text-gray-500';
                        return (
                          <div className="flex flex-col gap-0.5 min-w-0">
                            {/* Top row */}
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <span className="text-gray-700 tabular-nums">{opp.bump_number}/4</span>
                              <div className="flex gap-0.5">
                                {[1, 2, 3, 4].map(i => (
                                  <div key={i} className={`w-1.5 h-1.5 rounded-full ${i <= opp.bump_number ? 'bg-sky-500' : 'bg-gray-200'}`} />
                                ))}
                              </div>
                              <span className={`text-[11px] ${stale ? 'text-amber-600 font-medium' : 'text-gray-500'}`}>
                                · {lastEngagedLabel}
                              </span>
                              <div className="relative group/bump inline-flex ml-auto">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1.5 text-sky-600 hover:text-sky-700 hover:bg-sky-50"
                                  onClick={() => handleRecordBump(opp.id)}
                                  disabled={isBumping}
                                >
                                  <Zap className="h-3 w-3" />
                                </Button>
                                <div className="absolute bottom-full right-0 mb-1.5 px-2.5 py-1 text-white text-[11px] rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover/bump:opacity-100 transition-opacity z-50" style={{ backgroundColor: '#3e8692' }}>
                                  Record bump #{opp.bump_number + 1}
                                </div>
                              </div>
                            </div>
                            {/* Next-move hint (from Actions tab logic) */}
                            <div className={`text-[11px] leading-tight ${priorityColor}`}>
                              <span className="font-medium">{action.label}</span>
                              {action.hint && <span className="text-gray-500"> · {action.hint}</span>}
                            </div>
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 z-[80]">
                          <DropdownMenuItem onClick={e => { e.stopPropagation(); handleRecordBump(opp.id); }}>
                            <Zap className="h-4 w-4 mr-2" /> Record Bump
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={e => { e.stopPropagation(); handleStageChange(opp.id, 'warm', opp.stage); }}>
                            <ArrowRight className="h-4 w-4 mr-2" /> Move to Warm
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={e => { e.stopPropagation(); openEditDialog(opp); }}>
                            <Edit className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={e => { e.stopPropagation(); handleDelete(opp.id); }} className="text-red-600">
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {outreachTotalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-1">
          <div className="text-sm text-gray-600">
            Showing {outreachStart}-{outreachEnd} of {outreachTotal}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setOutreachPage(p => Math.max(1, p - 1)); setSelectedOutreach([]); }}
              disabled={outreachPage === 1}
              className="flex items-center gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, outreachTotalPages) }, (_, i) => {
                let pageNum: number;
                if (outreachTotalPages <= 5) {
                  pageNum = i + 1;
                } else if (outreachPage <= 3) {
                  pageNum = i + 1;
                } else if (outreachPage >= outreachTotalPages - 2) {
                  pageNum = outreachTotalPages - 4 + i;
                } else {
                  pageNum = outreachPage - 2 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={outreachPage === pageNum ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => { setOutreachPage(pageNum); setSelectedOutreach([]); }}
                    className={`w-8 h-8 p-0 ${outreachPage === pageNum ? 'hover:opacity-90' : ''}`}
                    style={outreachPage === pageNum ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setOutreachPage(p => Math.min(outreachTotalPages, p + 1)); setSelectedOutreach([]); }}
              disabled={outreachPage === outreachTotalPages}
              className="flex items-center gap-1"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  // ============================================
  // RENDER: Actions Tab
  // ============================================

  const renderActionsTab = () => {
    const getPriorityIcon = (priority: ActionPriority) => {
      switch (priority) {
        case 'urgent': return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />;
        case 'high': return <Zap className="h-3.5 w-3.5 text-amber-500" />;
        case 'medium': return <Clock className="h-3.5 w-3.5 text-blue-500" />;
        case 'low': return <Clock className="h-3.5 w-3.5 text-gray-400" />;
        default: return null;
      }
    };

    const getButtonVariant = (priority: ActionPriority): 'destructive' | 'default' | 'outline' => {
      if (priority === 'urgent') return 'destructive';
      if (priority === 'high') return 'default';
      return 'outline';
    };

    const getTimingInfo = (opp: SalesPipelineOpportunity): { text: string; color: string } => {
      const daysAgo = (date: string | null) => {
        if (!date) return null;
        return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
      };
      const daysUntil = (date: string | null) => {
        if (!date) return null;
        return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      };

      // Cold DM — show last bump timing
      if (opp.stage === 'cold_dm') {
        if (opp.bump_number === 0) return { text: 'Not bumped', color: 'text-gray-500' };
        const d = daysAgo(opp.last_bump_date);
        if (d === null) return { text: `${opp.bump_number}/4 bumps`, color: 'text-gray-500' };
        return {
          text: `Bumped ${d}d ago`,
          color: d >= 3 ? 'text-amber-500 font-medium' : 'text-gray-500',
        };
      }

      // Stages with next_meeting — show meeting timing
      if (opp.next_meeting_at) {
        const d = daysUntil(opp.next_meeting_at);
        if (d !== null) {
          if (d < 0) return { text: `Meeting ${Math.abs(d)}d ago`, color: 'text-red-500 font-medium' };
          if (d === 0) return { text: 'Meeting today', color: 'text-blue-600 font-medium' };
          return { text: `Meeting in ${d}d`, color: d <= 2 ? 'text-blue-600 font-medium' : 'text-gray-500' };
        }
      }

      // Proposal sent — show how long ago
      if (opp.stage === 'proposal_call' || (opp.stage === 'discovery_done' && opp.proposal_sent_at)) {
        const d = daysAgo(opp.proposal_sent_at);
        if (d !== null) return {
          text: `Sent ${d}d ago`,
          color: d >= 5 ? 'text-amber-500 font-medium' : 'text-gray-500',
        };
      }

      // Orbit — show days remaining until follow-up is due
      if (opp.stage === 'orbit') {
        const d = daysAgo(opp.updated_at);
        if (d !== null) {
          const threshold = opp.orbit_followup_days || 90;
          const remaining = threshold - d;
          if (remaining <= 0) return { text: `Overdue ${Math.abs(remaining)}d`, color: 'text-amber-500 font-medium' };
          return { text: `${remaining}d left`, color: remaining <= 7 ? 'text-amber-500' : 'text-gray-500' };
        }
      }

      // Default — days since last contact
      const lastDate = opp.last_contacted_at || opp.last_bump_date || opp.created_at;
      const d = daysAgo(lastDate);
      if (d === null) return { text: '—', color: 'text-gray-400' };
      return {
        text: `${d}d silent`,
        color: d >= 7 ? 'text-red-500 font-medium' : d >= 3 ? 'text-amber-500' : 'text-gray-500',
      };
    };

    const currentItems = displayedActions;
    const emptyLabel = alertCardFilter !== 'none' ? 'No matching opportunities found' :
      actionPhaseFilter === 'outreach' ? 'No outreach actions needed' :
      actionPhaseFilter === 'closing' ? 'No closing actions needed' :
      actionPhaseFilter === 'orbit' ? 'No orbit actions needed' :
      actionPhaseFilter === 'non_urgent' ? 'No opportunities in waiting state' :
      'No actions needed right now';

    return (
      <div className="pb-8">
        {/* Top row: Owner filter + Phase tabs */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1">
            {([
              { key: 'all' as const, label: 'All Actions' },
              { key: 'mine' as const, label: 'My Actions' },
              { key: 'urgent' as const, label: 'Urgent Only' },
            ]).map(f => (
              <button
                key={f.key}
                onClick={() => { setActionFilter(f.key); setAlertCardFilter('none'); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  actionFilter === f.key
                    ? 'bg-sky-100 text-sky-700 border border-sky-200'
                    : 'text-gray-600 hover:bg-gray-100 border border-transparent'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {([
              { key: 'all' as const, label: 'All', count: allActionItems.length },
              { key: 'outreach' as const, label: 'Outreach', count: allOutreachCount },
              { key: 'closing' as const, label: 'Closing', count: allClosingCount },
              { key: 'orbit' as const, label: 'Orbit', count: allOrbitCount },
              { key: 'non_urgent' as const, label: 'Waiting', count: allNonUrgentCount },
            ]).map(p => (
              <button
                key={p.key}
                onClick={() => { setActionPhaseFilter(p.key); setAlertCardFilter('none'); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  actionPhaseFilter === p.key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p.key === 'outreach' && <Send className="h-3.5 w-3.5" />}
                {p.key === 'closing' && <Target className="h-3.5 w-3.5" />}
                {p.key === 'orbit' && <RotateCcw className="h-3.5 w-3.5" />}
                {p.key === 'all' && <Zap className="h-3.5 w-3.5" />}
                {p.key === 'non_urgent' && <Clock className="h-3.5 w-3.5" />}
                {p.label}
                <span className={`ml-0.5 text-[10px] px-1.5 py-0 rounded-full ${
                  actionPhaseFilter === p.key ? 'bg-gray-100 text-gray-700' : 'bg-transparent text-gray-400'
                }`}>{p.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Search bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search actions..."
            defaultValue={actionsSearch}
            onChange={e => {
              const v = e.target.value;
              if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
              searchDebounceRef.current = setTimeout(() => setActionsSearch(v), 300);
            }}
            className="pl-9 h-9 text-sm focus-brand max-w-xs"
          />
        </div>

        {/* Alert Card Filter Banner */}
        {alertCardFilter !== 'none' && (
          <div className={`flex items-center justify-between px-4 py-2.5 rounded-lg mb-3 ${
            alertCardFilter === 'booking_needed' ? 'bg-red-50 border border-red-200' :
            alertCardFilter === 'overdue' ? 'bg-orange-50 border border-orange-200' :
            alertCardFilter === 'stale' ? 'bg-amber-50 border border-amber-200' :
            alertCardFilter === 'at_risk' ? 'bg-rose-50 border border-rose-200' :
            'bg-blue-50 border border-blue-200'
          }`}>
            <div className="flex items-center gap-2">
              {alertCardFilter === 'booking_needed' && <Calendar className="h-4 w-4 text-red-500" />}
              {alertCardFilter === 'overdue' && <Clock className="h-4 w-4 text-orange-500" />}
              {alertCardFilter === 'stale' && <RotateCcw className="h-4 w-4 text-amber-500" />}
              {alertCardFilter === 'at_risk' && <TrendingUp className="h-4 w-4 text-rose-500" />}
              {alertCardFilter === 'meetings' && <Calendar className="h-4 w-4 text-blue-500" />}
              <span className={`text-sm font-medium ${
                alertCardFilter === 'booking_needed' ? 'text-red-700' :
                alertCardFilter === 'overdue' ? 'text-orange-700' :
                alertCardFilter === 'stale' ? 'text-amber-700' :
                alertCardFilter === 'at_risk' ? 'text-rose-700' :
                'text-blue-700'
              }`}>
                Showing: {
                  alertCardFilter === 'booking_needed' ? 'Booking Needed' :
                  alertCardFilter === 'overdue' ? 'Overdue Follow-ups' :
                  alertCardFilter === 'stale' ? 'Stale Deals (7d+)' :
                  alertCardFilter === 'at_risk' ? 'At Risk Deals' :
                  'Upcoming Meetings'
                }
              </span>
              <Badge variant="secondary" className="text-xs">{alertCardOppIds?.size ?? 0}</Badge>
            </div>
            <button
              onClick={() => setAlertCardFilter('none')}
              className={`p-1 rounded-md transition-colors ${
                alertCardFilter === 'booking_needed' ? 'hover:bg-red-100 text-red-400' :
                alertCardFilter === 'overdue' ? 'hover:bg-orange-100 text-orange-400' :
                alertCardFilter === 'stale' ? 'hover:bg-amber-100 text-amber-400' :
                alertCardFilter === 'at_risk' ? 'hover:bg-rose-100 text-rose-400' :
                'hover:bg-blue-100 text-blue-400'
              }`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Section Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-violet-50 rounded-t-lg border border-violet-200 border-b-0">
          <div className="flex items-center gap-2">
            {actionPhaseFilter === 'outreach' ? <Send className="h-4 w-4 text-violet-700" /> : actionPhaseFilter === 'closing' ? <Target className="h-4 w-4 text-violet-700" /> : actionPhaseFilter === 'orbit' ? <RotateCcw className="h-4 w-4 text-violet-700" /> : actionPhaseFilter === 'non_urgent' ? <Clock className="h-4 w-4 text-violet-700" /> : <Zap className="h-4 w-4 text-violet-700" />}
            <h4 className="font-semibold text-violet-700">
              {actionPhaseFilter === 'outreach' ? 'Outreach Actions' : actionPhaseFilter === 'closing' ? 'Closing Actions' : actionPhaseFilter === 'orbit' ? 'Orbit Actions' : actionPhaseFilter === 'non_urgent' ? 'Waiting — Next Steps' : 'All Action Items'}
            </h4>
            <Badge variant="secondary" className="text-xs font-medium">{actionPhaseFilter === 'non_urgent' ? allNonUrgentCount : allActionItems.length}</Badge>
            {actionPhaseFilter === 'outreach' && (
              <span className="text-[11px] text-violet-500 ml-1">Cold DM, Warm, TG Intro, Booked</span>
            )}
            {actionPhaseFilter === 'closing' && (
              <span className="text-[11px] text-violet-500 ml-1">Discovery Done, Proposal, Contract</span>
            )}
            {actionPhaseFilter === 'orbit' && (
              <span className="text-[11px] text-violet-500 ml-1">Deals in orbit — resurrect or close</span>
            )}
            {actionPhaseFilter === 'non_urgent' && (
              <span className="text-[11px] text-violet-500 ml-1">Opportunities in waiting/cooling period</span>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-violet-600 hover:bg-violet-100 rounded-md transition-colors">
                <ArrowUpDown className="h-3.5 w-3.5" />
                Sort: {actionSort === 'priority' ? 'Priority' : actionSort === 'stage' ? 'Stage' : actionSort === 'temperature' ? 'Temp' : actionSort === 'value' ? 'Value' : actionSort === 'newest' ? 'Newest' : actionSort === 'oldest' ? 'Oldest' : actionSort === 'timing' ? 'Timing' : 'Name'}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {([
                { key: 'priority' as const, label: 'Priority' },
                { key: 'stage' as const, label: 'Stage' },
                { key: 'temperature' as const, label: 'Temperature' },
                { key: 'value' as const, label: 'Deal Value' },
                { key: 'name' as const, label: 'Name (A-Z)' },
                { key: 'timing' as const, label: 'Last Bumped' },
                { key: 'newest' as const, label: 'Newest First' },
                { key: 'oldest' as const, label: 'Oldest First' },
              ]).map(s => (
                <DropdownMenuItem
                  key={s.key}
                  onClick={() => setActionSort(s.key)}
                  className={actionSort === s.key ? 'bg-violet-50 text-violet-700 font-medium' : ''}
                >
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Table */}
        <div className="bg-white rounded-b-lg border border-gray-200 border-t-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/50">
                <TableHead>Name</TableHead>
                <TableHead className="w-[160px]">POC</TableHead>
                <TableHead className="w-[140px]">Stage</TableHead>
                <TableHead className="w-[70px]">Bucket</TableHead>
                <TableHead className="w-[260px]">Next Action</TableHead>
                <TableHead className="w-[120px]">Timing</TableHead>
                <TableHead className="w-[90px]">Temp</TableHead>
                <TableHead className="w-[100px]">Owner</TableHead>
                <TableHead className="w-[150px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <Zap className="h-8 w-8" />
                      <p className="text-sm font-medium">{emptyLabel}</p>
                      <p className="text-xs">All caught up — check back later</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : currentItems.map(({ opp, action }, index) => {
                const timing = getTimingInfo(opp);
                const stageColors = STAGE_COLORS[opp.stage as SalesPipelineStage] || STAGE_COLORS.cold_dm;
                // Project-name grouping (mirrors Outreach tab):
                //   - Show project name + Building icon only on the first
                //     row of each same-name run.
                //   - Drop the top border on continuation rows so the group
                //     reads as one block; add a thicker bottom border on the
                //     last row of a multi-row group to visually separate.
                const prevName = index > 0 ? currentItems[index - 1].opp.name : null;
                const nextName = index < currentItems.length - 1 ? currentItems[index + 1].opp.name : null;
                const isFirstInGroup = opp.name !== prevName;
                const isLastInGroup = opp.name !== nextName;
                const groupCount = actionsNameCounts.get(opp.name || '') || 1;
                return (
                  <TableRow
                    key={opp.id}
                    className={`group hover:bg-gray-50 cursor-pointer ${action.priority === 'urgent' ? 'bg-red-50/40' : ''} ${!isFirstInGroup ? 'border-t-0' : ''} ${isLastInGroup && groupCount > 1 ? 'border-b-2 border-b-gray-200' : ''}`}
                    onClick={() => openSlideOver(opp)}
                  >
                    <TableCell className={!isFirstInGroup ? 'pt-0' : ''}>
                      {isFirstInGroup ? (
                        <div className="flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
                          <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                          <span className="font-medium truncate">{opp.name}</span>
                          {groupCount > 1 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium shrink-0 whitespace-nowrap">
                              {groupCount} POCs
                            </span>
                          )}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {opp.poc_handle ? (
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize flex-shrink-0">{opp.poc_platform || 'other'}</Badge>
                          <span className="text-xs text-gray-600 truncate max-w-[90px]">{cleanPocHandle(opp.poc_handle)}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${stageColors.bg} ${stageColors.text} ${stageColors.border}`}>
                        {STAGE_LABELS[opp.stage as SalesPipelineStage] || opp.stage}
                      </span>
                    </TableCell>
                    <TableCell>
                      {opp.bucket && (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${BUCKET_COLORS[opp.bucket].bg} ${BUCKET_COLORS[opp.bucket].text}`}>
                          {opp.bucket}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="flex items-center gap-1.5">
                          {getPriorityIcon(action.priority)}
                          <span className={`text-sm font-medium ${
                            action.priority === 'urgent' ? 'text-red-700' :
                            action.priority === 'high' ? 'text-amber-700' :
                            'text-gray-600'
                          }`}>
                            {action.label}
                          </span>
                        </div>
                        {action.hint && (
                          <p className="text-[11px] text-gray-400 mt-0.5 ml-5">{action.hint}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs ${timing.color}`}>{timing.text}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${opp.temperature_score >= 70 ? 'bg-green-500' : opp.temperature_score >= 40 ? 'bg-amber-500' : 'bg-red-400'}`}
                            style={{ width: `${opp.temperature_score}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400">{opp.temperature_score}</span>
                      </div>
                    </TableCell>
                    <TableCell>{renderOwnerCell(opp)}</TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      {(() => {
                        const quickAlt = action.alternatives.find(a => a.quick);
                        const dropdownAlts = action.alternatives.filter(a => !a.quick);
                        return (
                          <div className="flex items-center gap-1">
                            <Button
                              variant={getButtonVariant(action.priority)}
                              size="sm"
                              className="h-7 text-xs"
                              disabled={executingAction === opp.id}
                              onClick={() => handleActionExecute(opp.id, action, opp)}
                              style={action.priority === 'high' ? { backgroundColor: '#3e8692', color: 'white' } : undefined}
                            >
                              {executingAction === opp.id ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : null}
                              {action.label}
                            </Button>
                            {quickAlt && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                onClick={async () => {
                                  if (quickAlt.label === 'Interested') {
                                    await SalesPipelineService.update(opp.id, { warm_sub_state: 'interested' });
                                    setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, warm_sub_state: 'interested' } : o));
                                  } else if (quickAlt.actionType === 'stage_change' && quickAlt.targetStage) {
                                    handleStageChange(opp.id, quickAlt.targetStage, opp.stage);
                                  } else {
                                    openSlideOver(opp, ACTION_GUIDANCE[quickAlt.label]);
                                  }
                                }}
                              >
                                {quickAlt.label}
                              </Button>
                            )}
                            {dropdownAlts.length > 0 && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44 z-[80]">
                                  {dropdownAlts.map(alt => (
                                    <DropdownMenuItem
                                      key={alt.label}
                                      className={alt.variant === 'danger' ? 'text-red-600' : alt.variant === 'warn' ? 'text-orange-600' : ''}
                                      onClick={() => {
                                        if (alt.actionType === 'stage_change' && alt.targetStage) {
                                          handleStageChange(opp.id, alt.targetStage, opp.stage);
                                        } else {
                                          openSlideOver(opp, ACTION_GUIDANCE[alt.label]);
                                        }
                                      }}
                                    >
                                      {alt.variant === 'danger' ? <X className="h-3.5 w-3.5 mr-2" /> :
                                       alt.variant === 'warn' ? <RotateCcw className="h-3.5 w-3.5 mr-2" /> :
                                       <ArrowRight className="h-3.5 w-3.5 mr-2" />}
                                      {alt.label}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  // ============================================
  // RENDER: Orbit Tab
  // ============================================

  const renderOrbitTab = () => (
    <div className="pb-8">
      {/* Sticky bulk action toolbar — mirrors the Outreach toolbar so users
          have the same multi-select UX in Orbit. Only renders when at least
          one row is selected. */}
      {selectedOrbit.length > 0 && (
        <div className="sticky top-0 z-30 flex items-center gap-3 mb-3 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-lg shadow-sm">
          <span className="text-sm font-medium text-orange-800">{selectedOrbit.length} selected</span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectAllOrbitVisible}>
            Select All Visible
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSelectedOrbit([])}>
            Deselect All
          </Button>
          <div className="flex-1" />
          <Button
            size="sm"
            className="h-7 text-xs bg-sky-600 hover:bg-sky-700 text-white"
            onClick={() => handleOrbitBulkMove('cold_dm')}
            disabled={isOrbitBulkMoving}
          >
            {isOrbitBulkMoving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RotateCcw className="h-3 w-3 mr-1" />}
            Move to Cold DM
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => handleOrbitBulkMove('warm')}
            disabled={isOrbitBulkMoving}
          >
            {isOrbitBulkMoving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ArrowRight className="h-3 w-3 mr-1" />}
            Move to Pipeline (Warm)
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
            onClick={handleOrbitBulkDelete}
          >
            <Trash2 className="h-3 w-3 mr-1" /> Delete
          </Button>
        </div>
      )}
      {/* Flat orbit view — one table for every orbit opp regardless of
          reason. Reason is shown as a badge column on each row instead
          of being used as the layout dimension (the per-reason split
          used to drop opps with no reason — see comment on sortedOrbit
          above). The orange header band keeps the visual identity of
          the section without partitioning the rows. */}
      <div className="mb-6">
        <div className="flex items-center justify-between px-4 py-3 bg-orange-50 rounded-t-lg border border-orange-200 border-b-0">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-orange-700" />
            <h4 className="font-semibold text-orange-700">Orbit</h4>
            <Badge variant="secondary" className="text-xs font-medium">{sortedOrbit.length}</Badge>
          </div>
          {orbitTotalValue > 0 && (
            <span className="text-sm font-medium text-gray-600">
              ${orbitTotalValue.toLocaleString()}
            </span>
          )}
        </div>
        <div className="bg-white rounded-b-lg border border-gray-200 border-t-0">
          {sortedOrbit.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-10">
              No opportunities in orbit.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/50">
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[180px]">POC</TableHead>
                  <TableHead className="w-[70px]">Bucket</TableHead>
                  <TableHead className="w-[110px]">Value</TableHead>
                  <TableHead className="w-[100px]">Owner</TableHead>
                  <TableHead className="w-[100px]">Source</TableHead>
                  {/* Reason tag — replaces the old per-reason table
                      grouping. Always shown so unclassified orbit opps
                      still surface (with "—"). */}
                  <TableHead className="w-[140px]">Reason</TableHead>
                  {/* Next check-in surfaces the Orbit Tracking section's
                      next_action_at on the table so users can scan
                      "what's due today/this week" without opening each
                      slide-over. Overdue dates render in red. */}
                  <TableHead className="w-[120px]">Next check-in</TableHead>
                  <TableHead className="w-[120px]">Time in Orbit</TableHead>
                  <TableHead className="w-[120px]">Last Contacted</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                    {sortedOrbit.map((opp, index) => {
                      const isChecked = selectedOrbit.includes(opp.id);
                      // Project-name grouping — mirrors the Outreach pattern.
                      // First row in a same-named cluster shows the project
                      // header + POC count + add-POC button; subsequent rows
                      // hide the name cell so the visual hierarchy is
                      // "project → POCs under it" instead of repeated names.
                      const prevName = index > 0 ? sortedOrbit[index - 1].name : null;
                      const nextName = index < sortedOrbit.length - 1 ? sortedOrbit[index + 1].name : null;
                      const isFirstInGroup = opp.name !== prevName;
                      const isLastInGroup = opp.name !== nextName;
                      const groupCount = orbitNameCounts.get(opp.name || '') || 1;
                      return (
                      <TableRow
                        key={opp.id}
                        className={`group hover:bg-gray-50 cursor-pointer ${!isFirstInGroup ? 'border-t-0' : ''} ${isLastInGroup && groupCount > 1 ? 'border-b-2 border-b-gray-200' : ''}`}
                        onClick={() => openSlideOver(opp)}
                      >
                        <TableCell className="w-10" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center">
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => toggleOrbitSelect(opp.id)}
                            />
                          </div>
                        </TableCell>
                        <TableCell className={!isFirstInGroup ? 'pt-0' : ''}>
                          {isFirstInGroup ? (
                            <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden">
                              <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                              <span className="font-medium truncate">{opp.name}</span>
                              {renderProjectNameSuffix(opp.twitter_handle, () => openEditDialog(opp))}
                              {groupCount > 1 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium shrink-0 whitespace-nowrap">{groupCount} POCs</span>
                              )}
                              {/* Add-another-POC button on hover — same
                                  affordance the Outreach table has. Pre-
                                  fills the create form with the same
                                  project context. */}
                              <button
                                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 hover:text-brand"
                                title="Add another POC for this project"
                                onClick={e => {
                                  e.stopPropagation();
                                  setForm({
                                    name: opp.name,
                                    stage: 'orbit' as OpportunityStage,
                                    dm_account: opp.dm_account,
                                    bucket: opp.bucket || undefined,
                                    source: opp.source || undefined,
                                    owner_id: opp.owner_id || undefined,
                                    co_owner_ids: opp.co_owner_ids || undefined,
                                    referrer: opp.referrer || undefined,
                                    affiliate_id: opp.affiliate_id || undefined,
                                  });
                                  setIsCreateOpen(true);
                                }}
                              >
                                <UserPlus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="pl-8 text-gray-300 text-xs">└</div>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap max-w-[180px] overflow-hidden">
                          {renderPocCell(opp, 'max-w-[120px]')}
                        </TableCell>
                        <TableCell>
                          {opp.bucket && (
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${BUCKET_COLORS[opp.bucket].bg} ${BUCKET_COLORS[opp.bucket].text}`}>
                              {opp.bucket}
                            </span>
                          )}
                        </TableCell>
                        {/* DM (dm_account) + Temp cells removed 2026-05-13
                            to match the trimmed orbit header. */}
                        <TableCell>
                          {opp.deal_value ? (
                            <span className="font-semibold text-emerald-600">${opp.deal_value.toLocaleString()}</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>{renderOwnerCell(opp)}</TableCell>
                        <TableCell className="text-gray-500 text-xs capitalize">{opp.source?.replace('_', ' ') || '—'}</TableCell>
                        {/* Reason tag — surfaces orbit_reason even for opps
                            that didn't have it set (those used to vanish
                            entirely from the per-reason layout). */}
                        <TableCell>
                          {opp.orbit_reason ? (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-orange-50 text-orange-700 border border-orange-200">
                              {ORBIT_REASONS.find(r => r.value === opp.orbit_reason)?.label || opp.orbit_reason}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            if (!opp.next_action_at) return <span className="text-gray-400 text-xs">—</span>;
                            const checkin = new Date(opp.next_action_at + 'T00:00:00');
                            const today = new Date(); today.setHours(0, 0, 0, 0);
                            const overdue = checkin < today;
                            const isToday = checkin.getTime() === today.getTime();
                            return (
                              <span className={`text-xs ${overdue ? 'text-red-600 font-medium' : isToday ? 'text-amber-600 font-medium' : 'text-gray-700'}`}>
                                {format(checkin, 'MMM d')}
                                {overdue && ' · overdue'}
                                {isToday && ' · today'}
                              </span>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-gray-500">{opp.updated_at ? formatDistanceToNow(new Date(opp.updated_at)) : '—'}</TableCell>
                        <TableCell className="text-gray-500">{opp.last_contacted_at ? formatDistanceToNow(new Date(opp.last_contacted_at), { addSuffix: true }) : '—'}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 z-[80]">
                              <DropdownMenuItem onClick={e => { e.stopPropagation(); openEditDialog(opp); }}>
                                <Edit className="h-4 w-4 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={e => { e.stopPropagation(); handleResurrect(opp); }} className="text-blue-600">
                                <ArrowRight className="h-4 w-4 mr-2" /> Resurrect
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={e => { e.stopPropagation(); handleDelete(opp.id); }} className="text-red-600">
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </div>
  );

  // ============================================
  // RENDER: Forecast Tab
  // ============================================
  // Post-proposal visibility — every deal that's been proposed but not
  // yet closed, grouped by expected close date with at-risk auto-flag.
  // KPIs at the top give a quick "where's my pipeline at?" answer.

  const renderForecastTab = () => {
    const periods: Array<{ key: keyof typeof forecastByPeriod; label: string; tone: string; description: string }> = [
      { key: 'thisWeek',  label: 'This Week',  tone: 'bg-emerald-50 border-emerald-200 text-emerald-700', description: 'Closing this week' },
      { key: 'nextWeek',  label: 'Next Week',  tone: 'bg-emerald-50 border-emerald-200 text-emerald-700', description: 'Closing next week' },
      { key: 'thisMonth', label: 'This Month', tone: 'bg-sky-50 border-sky-200 text-sky-700', description: 'Closing this month' },
      { key: 'nextMonth', label: 'Next Month', tone: 'bg-sky-50 border-sky-200 text-sky-700', description: 'Closing next month' },
      { key: 'later',     label: 'Later',      tone: 'bg-gray-50 border-gray-200 text-gray-700', description: '60+ days out' },
      { key: 'noDate',    label: 'No Date Set', tone: 'bg-amber-50 border-amber-200 text-amber-700', description: 'Set an expected close date' },
    ];

    return (
      <div className="pb-8 space-y-6">
        {/* KPI strip — high-level pipeline health */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Pipeline value</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">${forecastKpis.totalValue.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">{forecastOpps.length} active deal{forecastOpps.length === 1 ? '' : 's'}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Weighted forecast</div>
            <div className="text-2xl font-bold text-emerald-700 mt-1">${Math.round(forecastKpis.weighted).toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">Stage-weighted probability</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">This month</div>
            <div className="text-2xl font-bold text-sky-700 mt-1">${forecastKpis.thisMonthValue.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">Expected to close</div>
          </div>
          <div className={`border rounded-lg p-4 ${forecastKpis.atRiskCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
            <div className={`text-xs uppercase tracking-wide ${forecastKpis.atRiskCount > 0 ? 'text-red-700' : 'text-gray-500'}`}>At risk</div>
            <div className={`text-2xl font-bold mt-1 ${forecastKpis.atRiskCount > 0 ? 'text-red-700' : 'text-gray-400'}`}>
              {forecastKpis.atRiskCount}
            </div>
            <div className="text-xs text-gray-500 mt-1">${forecastKpis.atRiskValue.toLocaleString()} stalled</div>
          </div>
        </div>

        {/* Empty state */}
        {forecastOpps.length === 0 && (
          <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
            <TrendingUp className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No proposals out yet. Move a deal to <span className="font-medium">Proposal Sent</span> to see it here.</p>
          </div>
        )}

        {/* Period buckets */}
        {periods.map(period => {
          const opps = forecastByPeriod[period.key];
          if (opps.length === 0) return null;
          const periodValue = opps.reduce((s, o) => s + (o.deal_value || 0), 0);
          const periodAtRisk = opps.filter(isOppAtRisk).length;

          return (
            <div key={period.key} className="space-y-2">
              <div className={`flex items-center justify-between px-4 py-2.5 rounded-lg border ${period.tone}`}>
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold">{period.label}</h4>
                  <span className="text-xs opacity-70">· {period.description}</span>
                  <Badge variant="secondary" className="text-xs">{opps.length}</Badge>
                  {periodAtRisk > 0 && (
                    <Badge variant="secondary" className="text-xs bg-red-100 text-red-700 hover:bg-red-100">
                      {periodAtRisk} at-risk
                    </Badge>
                  )}
                </div>
                {periodValue > 0 && (
                  <span className="text-sm font-medium">${periodValue.toLocaleString()}</span>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {opps.map(opp => {
                  const atRisk = isOppAtRisk(opp);
                  const proposalAge = opp.proposal_sent_at
                    ? differenceInDays(new Date(), new Date(opp.proposal_sent_at))
                    : null;
                  const ageBadgeClass = proposalAge === null
                    ? 'bg-gray-100 text-gray-500'
                    : proposalAge < 7
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : proposalAge < 21
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-red-50 text-red-700 border border-red-200';
                  const stageColor = STAGE_COLORS[opp.stage as SalesPipelineStage] || STAGE_COLORS.cold_dm;
                  const owner = users.find(u => u.id === opp.owner_id);
                  const winProb = STAGE_WIN_PROB[opp.stage] || 0;

                  return (
                    <div
                      key={opp.id}
                      onClick={() => openSlideOver(opp)}
                      className={`group bg-white border rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow ${atRisk ? 'border-red-300 bg-red-50/30' : 'border-gray-200'}`}
                    >
                      {/* Header row: name + at-risk flag */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
                          <span className="font-semibold truncate">{opp.name}</span>
                          {renderProjectNameSuffix(opp.twitter_handle, () => openEditDialog(opp))}
                        </div>
                        {atRisk && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700 shrink-0">
                            <AlertTriangle className="h-3 w-3" /> At risk
                          </span>
                        )}
                      </div>

                      {/* Stage + value + win-prob row */}
                      <div className="flex items-center gap-2 mb-3 text-xs">
                        <Badge className={`${stageColor.bg} ${stageColor.text} pointer-events-none`}>
                          {STAGE_LABELS[opp.stage as SalesPipelineStage] || opp.stage}
                        </Badge>
                        {opp.deal_value ? (
                          <span className="font-semibold text-emerald-700">${opp.deal_value.toLocaleString()}</span>
                        ) : (
                          <span className="text-gray-400">No value set</span>
                        )}
                        {winProb > 0 && (
                          <span className="text-gray-400">· {Math.round(winProb * 100)}% win</span>
                        )}
                      </div>

                      {/* Days-since-proposal + last activity */}
                      <div className="flex items-center gap-3 text-xs mb-2">
                        <span className={`px-1.5 py-0.5 rounded font-medium ${ageBadgeClass}`}>
                          {proposalAge === null ? 'Date unknown' : `${proposalAge}d since proposal`}
                        </span>
                        {opp.updated_at && (
                          <span className="text-gray-500">
                            Last touched {formatDistanceToNow(new Date(opp.updated_at), { addSuffix: true })}
                          </span>
                        )}
                      </div>

                      {/* Decision maker + next action */}
                      <div className="space-y-1 text-xs">
                        {opp.decision_maker_name && (
                          <div className="text-gray-600">
                            <span className="text-gray-400">DM:</span> <span className="font-medium">{opp.decision_maker_name}</span>
                            {opp.decision_maker_role && <span className="text-gray-400"> · {opp.decision_maker_role}</span>}
                          </div>
                        )}
                        {opp.next_action_at && (
                          <div className="text-gray-600">
                            <span className="text-gray-400">Next:</span>{' '}
                            <span className="font-medium">{format(new Date(opp.next_action_at + 'T00:00:00'), 'MMM d')}</span>
                            {opp.next_action_notes && <span className="text-gray-500"> — {opp.next_action_notes}</span>}
                          </div>
                        )}
                        {!opp.decision_maker_name && !opp.next_action_at && (
                          <div className="text-gray-400 italic">No DM or next action set</div>
                        )}
                      </div>

                      {/* Footer: owner + actions */}
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
                        <span className="text-xs text-gray-500">{owner?.name || 'Unassigned'}</span>
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          {opp.proposal_doc_url && (
                            <a
                              href={opp.proposal_doc_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-brand hover:underline"
                              title="Open proposal"
                            >
                              <FileText className="h-3.5 w-3.5 inline" />
                            </a>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 z-[80]">
                              <DropdownMenuItem onClick={() => openEditDialog(opp)}>
                                <Edit className="h-4 w-4 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleStageChange(opp.id, 'v2_closed_won', opp.stage)}
                                className="text-emerald-700"
                              >
                                <Check className="h-4 w-4 mr-2" /> Mark Closed Won
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleStageChange(opp.id, 'v2_closed_lost', opp.stage)}
                                className="text-red-600"
                              >
                                <X className="h-4 w-4 mr-2" /> Mark Closed Lost
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStageChange(opp.id, 'nurture', opp.stage)}>
                                <Clock className="h-4 w-4 mr-2" /> Move to Nurture
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  /**
   * Compact metric card used by the Metrics tab + Outreach strip.
   * `tone` lets us color-code green/red without changing layout.
   */
  const MetricCard = ({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: 'good' | 'bad' | 'neutral' }) => {
    const valueClass =
      tone === 'good' ? 'text-emerald-700' :
      tone === 'bad' ? 'text-rose-600' :
      'text-gray-900';
    return (
      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
        <div className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</div>
        <div className={`text-2xl font-bold mt-0.5 tabular-nums ${valueClass}`}>{value}</div>
        {hint && <div className="text-[11px] text-gray-500 mt-0.5">{hint}</div>}
      </div>
    );
  };

  // ============================================
  // RENDER: Metrics Tab
  // ============================================
  // Per-user outreach scorecard + team comparison. Works for any user
  // the manager picks, defaults to the logged-in user.

  const renderMetricsTab = () => {
    const selectedId = metricsUserId || user?.id || '';
    const selectedUser = users.find(u => u.id === selectedId);
    const m = computeOutreachMetrics(selectedId, metricsRangeDays);

    // Team comparison — every user with at least one opp owned in window
    const teamRows = users
      .map(u => ({ user: u, metrics: computeOutreachMetrics(u.id, metricsRangeDays) }))
      .filter(r => r.metrics.touch1s > 0 || r.metrics.callsBooked > 0)
      .sort((a, b) => b.metrics.touch1s - a.metrics.touch1s);

    return (
      <div className="pb-8 space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <Select value={selectedId} onValueChange={setMetricsUserId}>
            <SelectTrigger className="h-9 w-56 text-sm focus-brand">
              <SelectValue placeholder="Select user" />
            </SelectTrigger>
            <SelectContent>
              {users.map(u => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(metricsRangeDays)} onValueChange={v => setMetricsRangeDays(Number(v) as 7 | 30 | 90)}>
            <SelectTrigger className="h-9 w-40 text-sm focus-brand">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          {metricsBookingsLoading && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading bookings...
            </span>
          )}
        </div>

        {/* Per-user scorecard */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{selectedUser?.name || 'Select a user'}</h3>
              <p className="text-xs text-gray-500">Last {metricsRangeDays} days</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Touch 1s sent" value={m.touch1s} hint="First DM sent in window" />
            <MetricCard label="Replies received" value={m.replies} hint="Moved past cold_dm" />
            <MetricCard label="Reply rate" value={`${(m.replyRate * 100).toFixed(1)}%`} tone={m.replyRate >= 0.2 ? 'good' : 'neutral'} />
            <MetricCard label="Qualified" value={m.qualified} hint={`${(m.qualificationRate * 100).toFixed(0)}% of replies · 5-for-5 ≥ 3/5`} />
            <MetricCard label="Calls booked" value={m.callsBooked} />
            <MetricCard label="Calls held" value={m.callsHeld} tone="good" />
            <MetricCard label="No-shows" value={m.noShows} hint={`${(((m.noShows) / (m.callsBooked || 1)) * 100).toFixed(0)}% of bookings`} tone={m.noShows > 0 ? 'bad' : 'neutral'} />
            <MetricCard label="Show rate" value={`${(m.showRate * 100).toFixed(0)}%`} hint={m.callsPending > 0 ? `${m.callsPending} pending` : undefined} tone={m.showRate >= 0.7 ? 'good' : 'neutral'} />
          </div>
        </div>

        {/* Team comparison */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-900">Team comparison</h4>
            <span className="text-xs text-gray-500">{teamRows.length} active rep{teamRows.length === 1 ? '' : 's'}</span>
          </div>
          {teamRows.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">
              No outreach activity in the last {metricsRangeDays} days.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/50">
                  <TableHead>Rep</TableHead>
                  <TableHead className="text-right">Touch 1s</TableHead>
                  <TableHead className="text-right">Replies</TableHead>
                  <TableHead className="text-right">Reply %</TableHead>
                  <TableHead className="text-right">Qualified</TableHead>
                  <TableHead className="text-right">Booked</TableHead>
                  <TableHead className="text-right">Held</TableHead>
                  <TableHead className="text-right">No-show</TableHead>
                  <TableHead className="text-right">Show %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamRows.map(({ user: u, metrics }) => (
                  <TableRow key={u.id} className="hover:bg-gray-50">
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{metrics.touch1s}</TableCell>
                    <TableCell className="text-right tabular-nums">{metrics.replies}</TableCell>
                    <TableCell className="text-right tabular-nums">{(metrics.replyRate * 100).toFixed(1)}%</TableCell>
                    <TableCell className="text-right tabular-nums">{metrics.qualified}</TableCell>
                    <TableCell className="text-right tabular-nums">{metrics.callsBooked}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-700">{metrics.callsHeld}</TableCell>
                    <TableCell className="text-right tabular-nums text-rose-600">{metrics.noShows}</TableCell>
                    <TableCell className="text-right tabular-nums">{(metrics.showRate * 100).toFixed(0)}%</TableCell>
                  </TableRow>
                ))}
                {/* Team totals */}
                <TableRow className="bg-gray-50 font-semibold">
                  <TableCell>TEAM TOTAL</TableCell>
                  <TableCell className="text-right tabular-nums">{teamRows.reduce((s, r) => s + r.metrics.touch1s, 0)}</TableCell>
                  <TableCell className="text-right tabular-nums">{teamRows.reduce((s, r) => s + r.metrics.replies, 0)}</TableCell>
                  <TableCell className="text-right tabular-nums">—</TableCell>
                  <TableCell className="text-right tabular-nums">{teamRows.reduce((s, r) => s + r.metrics.qualified, 0)}</TableCell>
                  <TableCell className="text-right tabular-nums">{teamRows.reduce((s, r) => s + r.metrics.callsBooked, 0)}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-700">{teamRows.reduce((s, r) => s + r.metrics.callsHeld, 0)}</TableCell>
                  <TableCell className="text-right tabular-nums text-rose-600">{teamRows.reduce((s, r) => s + r.metrics.noShows, 0)}</TableCell>
                  <TableCell className="text-right tabular-nums">—</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </div>

        {/* Methodology disclosure — managers always ask "what counts as a reply?" */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-600 space-y-1">
          <p><strong>How metrics are computed:</strong></p>
          <p>· <strong>Touch 1s sent</strong> — opportunities owned by the rep in <code>cold_dm</code> with <code>bump_number ≥ 1</code> created in the window.</p>
          <p>· <strong>Replies</strong> — proxy: opps that moved past <code>cold_dm</code> (created or last-updated in window). Improve by logging inbound activities explicitly.</p>
          <p>· <strong>Qualified</strong> — opps with at least 3 of 5 BANT+ qualification checks marked, set on the opportunity slide-over.</p>
          <p>· <strong>Calls booked / held / no-shows</strong> — bookings where the booking page is owned by the rep. Mark held / no-show on /crm/meetings after each call.</p>
        </div>
      </div>
    );
  };

  // ============================================
  // RENDER: Activity Slide-Over
  // ============================================

  const renderSlideOver = () => {
    if (!slideOverOpp || typeof document === 'undefined') return null;
    const opp = opportunities.find(o => o.id === slideOverOpp.id) || slideOverOpp;
    const bamfam = isBAMFAM(opp);
    const stageColors = STAGE_COLORS[opp.stage as SalesPipelineStage] || STAGE_COLORS.cold_dm;

    return createPortal(
      <>
      {/* Backdrop */}
      {!orbitPrompt && !closedLostPrompt && !activityLogPrompt && (
        <div className="fixed inset-0 bg-black/20 z-[60]" onClick={() => {
          if (slideOverMode === 'edit') {
            if (!confirm('You have unsaved changes. Close anyway?')) return;
            setSlideOverMode('view');
            setEditingOpp(null);
            setForm({ name: '' });
          }
          setSlideOverOpp(null);
          setActionGuidance(null);
        }} />
      )}
      <div className="fixed inset-y-0 right-0 w-[480px] max-w-[calc(100vw-2rem)] bg-white border-l shadow-xl z-[70] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-gray-400 flex-shrink-0" />
                <h3 className="font-semibold text-lg text-gray-900 truncate">
                  {slideOverMode === 'edit' ? 'Edit Opportunity' : opp.name}
                </h3>
              </div>
              {slideOverMode === 'view' && (
                <>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge className={`text-xs ${stageColors.bg} ${stageColors.text} border ${stageColors.border}`}>
                      {STAGE_LABELS[opp.stage as SalesPipelineStage] || opp.stage}
                    </Badge>
                    {opp.bucket && (
                      <Badge className={`text-xs ${BUCKET_COLORS[opp.bucket].bg} ${BUCKET_COLORS[opp.bucket].text} border-0`}>
                        Bucket {opp.bucket}
                      </Badge>
                    )}
                    {opp.dm_account && (
                      <Badge variant="outline" className={`text-xs ${opp.dm_account === 'closer' ? 'border-blue-300 text-blue-600' : 'border-green-300 text-green-600'}`}>
                        {opp.dm_account === 'closer' ? 'Closer' : opp.dm_account === 'sdr' ? 'SDR' : 'Other'}
                      </Badge>
                    )}
                  </div>
                  {opp.deal_value && (
                    <p className="text-xl font-bold text-emerald-600 mt-2">${opp.deal_value.toLocaleString()} <span className="text-sm font-normal text-gray-400">{opp.currency}</span></p>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {slideOverMode === 'view' ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={openStageHistory}
                    title="Stage history"
                  >
                    <History className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEditDialog(opp)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => { setSlideOverMode('view'); setEditingOpp(null); setForm({ name: '' }); }}>
                  Cancel
                </Button>
              )}
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setSlideOverOpp(null); setSlideOverMode('view'); setEditingOpp(null); setForm({ name: '' }); setActionGuidance(null); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Edit mode */}
        {slideOverMode === 'edit' && (
          <ScrollArea className="flex-1">
            <form onSubmit={e => { e.preventDefault(); handleUpdate(); }} className="p-6">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Name *</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Company or contact name" className="focus-brand" />
                </div>
                {/* Path (dm_account) field removed 2026-05-13 — kept the
                    DB column intact (existing rows still have a value),
                    but it's no longer surfaced in the slide-over edit
                    form. Bucket takes the left slot; new Twitter Handle
                    input on the right. Temperature slider also removed —
                    the score auto-updates from activity, so manual
                    override was rarely used. */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Bucket</Label>
                    <Select value={form.bucket || ''} onValueChange={v => setForm(f => ({ ...f, bucket: v as Bucket }))}>
                      <SelectTrigger className="focus-brand"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A">A - High Priority</SelectItem>
                        <SelectItem value="B">B - Medium</SelectItem>
                        <SelectItem value="C">C - Low Priority</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Project Twitter</Label>
                    <Input
                      value={form.twitter_handle || ''}
                      onChange={e => setForm(f => ({ ...f, twitter_handle: e.target.value }))}
                      placeholder="@handle or https://x.com/handle"
                      className="focus-brand"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">POC Platform</Label>
                    <Select value={form.poc_platform || ''} onValueChange={v => setForm(f => ({ ...f, poc_platform: v as PocPlatform }))}>
                      <SelectTrigger className="focus-brand"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {POC_PLATFORMS.map(p => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">POC Handle / ID</Label>
                    <Input value={form.poc_handle || ''} onChange={e => setForm(f => ({ ...f, poc_handle: e.target.value }))} placeholder="@handle or ID" className="focus-brand" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Source</Label>
                    <Select value={form.source || ''} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
                      <SelectTrigger className="focus-brand"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="referral">Referral</SelectItem>
                        <SelectItem value="inbound">Inbound</SelectItem>
                        <SelectItem value="event">Event</SelectItem>
                        <SelectItem value="cold_outreach">Cold Outreach</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">TG Handle</Label>
                    <Input value={form.tg_handle || ''} onChange={e => setForm(f => ({ ...f, tg_handle: e.target.value }))} placeholder="@handle" className="focus-brand" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Owner</Label>
                    <Select value={form.owner_id || ''} onValueChange={v => setForm(f => ({ ...f, owner_id: v }))}>
                      <SelectTrigger className="focus-brand"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {users.map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Referrer</Label>
                    <Input value={form.referrer || ''} onChange={e => setForm(f => ({ ...f, referrer: e.target.value }))} placeholder="Who referred?" className="focus-brand" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Co-Owners</Label>
                  <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 border rounded-md bg-white">
                    {(form.co_owner_ids || []).map(id => {
                      const u = users.find(u => u.id === id);
                      return (
                        <span key={id} className="inline-flex items-center gap-1 bg-brand/10 text-brand text-xs px-2 py-0.5 rounded-full">
                          {u?.name || u?.email || id}
                          <button type="button" onClick={() => setForm(f => ({ ...f, co_owner_ids: (f.co_owner_ids || []).filter(i => i !== id) }))} className="hover:text-red-500 ml-0.5">&times;</button>
                        </span>
                      );
                    })}
                    <Select value="" onValueChange={v => { if (v && !(form.co_owner_ids || []).includes(v) && v !== form.owner_id) setForm(f => ({ ...f, co_owner_ids: [...(f.co_owner_ids || []), v] })); }}>
                      <SelectTrigger className="border-none shadow-none bg-transparent h-6 w-auto px-1 text-xs text-gray-400 focus:ring-0"><SelectValue placeholder="+ Add" /></SelectTrigger>
                      <SelectContent>
                        {users.filter(u => u.id !== form.owner_id && !(form.co_owner_ids || []).includes(u.id)).map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Affiliate</Label>
                  <Select value={form.affiliate_id || ''} onValueChange={v => setForm(f => ({ ...f, affiliate_id: v }))}>
                    <SelectTrigger className="focus-brand"><SelectValue placeholder="Select affiliate..." /></SelectTrigger>
                    <SelectContent>
                      {affiliates.map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Deal Value / Currency / Meeting Date / Time / Type
                    moved 2026-05-14 out of this Edit form and into the
                    slide-over view's "Deal" card. Those fields shift
                    often during a deal — inline-edit in the view is
                    faster than opening this modal each time. The Edit
                    form is now identity-focused (name, POC, source,
                    owner, affiliate, etc.). */}
                {editingOpp?.stage === 'orbit' && (
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Orbit Follow-up Days</Label>
                    <Input type="number" min={1} value={form.orbit_followup_days || 90} onChange={e => setForm(f => ({ ...f, orbit_followup_days: Math.max(1, parseInt(e.target.value) || 90) }))} className="focus-brand" />
                  </div>
                )}
                <div className="grid gap-2">
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</Label>
                  <Textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional notes..." className="focus-brand" rows={3} />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => { setSlideOverMode('view'); setEditingOpp(null); setForm({ name: '' }); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting || !form.name.trim()} className="hover:opacity-90" style={{ backgroundColor: '#3e8692', color: 'white' }}>
                  {isSubmitting ? 'Saving...' : 'Update'}
                </Button>
              </div>
            </form>
          </ScrollArea>
        )}

        {/* View mode */}
        {slideOverMode === 'view' && bamfam && (
          <div className="px-6 py-2.5 bg-red-50 border-b border-red-200 flex items-center gap-2 text-red-700 text-sm">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span className="font-medium">BAMFAM: No upcoming meeting scheduled</span>
          </div>
        )}

        {slideOverMode === 'view' && actionGuidance && (
          <div className="px-6 py-3 border-b border-sky-200" style={{ backgroundColor: '#f0f9fa' }}>
            <div className="flex items-start gap-2">
              <Zap className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: '#3e8692' }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: '#3e8692' }}>{actionGuidance.label}</p>
                <p className="text-xs text-gray-600 mt-0.5">{actionGuidance.hint}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 ml-auto flex-shrink-0 text-gray-400 hover:text-gray-600"
                onClick={() => setActionGuidance(null)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {slideOverMode === 'view' && (
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            {/* Details Card */}
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Details</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm min-w-0">
                <div className="min-w-0">
                  <span className="text-xs text-gray-500">Temperature</span>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${opp.temperature_score >= 70 ? 'bg-green-500' : opp.temperature_score >= 40 ? 'bg-amber-500' : 'bg-red-400'}`}
                        style={{ width: `${opp.temperature_score}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium">{opp.temperature_score}%</span>
                  </div>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Owner</span>
                  <p className="font-medium mt-0.5">{getUserName(opp.owner_id)}</p>
                  {opp.co_owner_ids && opp.co_owner_ids.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {opp.co_owner_ids.map(id => (
                        <span key={id} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{getUserName(id)}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <span className="text-xs text-gray-500">POC</span>
                  {opp.poc_handle ? (
                    <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize flex-shrink-0">{opp.poc_platform || 'other'}</Badge>
                      <span className="font-medium truncate">{cleanPocHandle(opp.poc_handle)}</span>
                    </div>
                  ) : (
                    <p className="font-medium mt-0.5 text-gray-400">—</p>
                  )}
                </div>
                <div className="min-w-0">
                  <span className="text-xs text-gray-500">TG Handle</span>
                  <p className="font-medium mt-0.5 truncate">{opp.tg_handle || '—'}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Source</span>
                  <p className="font-medium mt-0.5 capitalize">{opp.source?.replace('_', ' ') || '—'}</p>
                </div>
                {opp.next_meeting_at && (
                  <div>
                    <span className="text-xs text-gray-500">Next Meeting</span>
                    <p className="font-medium mt-0.5">{format(new Date(opp.next_meeting_at), 'MMM d, yyyy h:mm a')}</p>
                  </div>
                )}
                {opp.referrer && (
                  <div>
                    <span className="text-xs text-gray-500">Referrer</span>
                    <p className="font-medium mt-0.5">{opp.referrer}</p>
                  </div>
                )}
                {opp.last_contacted_at && (
                  <div>
                    <span className="text-xs text-gray-500">Last Contacted</span>
                    <p className="font-medium mt-0.5">{formatDistanceToNow(new Date(opp.last_contacted_at), { addSuffix: true })}</p>
                  </div>
                )}
                <div>
                  <span className="text-xs text-gray-500">Affiliate</span>
                  {opp.affiliate ? (
                    <div className="mt-0.5">
                      <Badge className="text-xs" style={{ backgroundColor: '#3e8692', color: 'white' }}>{opp.affiliate.name}</Badge>
                    </div>
                  ) : (
                    <p className="font-medium mt-0.5 text-gray-400">—</p>
                  )}
                </div>
              </div>
            </div>

            {/* Notes */}
            {opp.notes && (
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes</h4>
                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words" style={{ overflowWrap: 'anywhere' }}>{opp.notes}</p>
              </div>
            )}

            {/* Bump Counter (cold_dm only) */}
            {opp.stage === 'cold_dm' && (
              <div className="bg-sky-50 rounded-lg border border-sky-200 p-4">
                <h4 className="text-xs font-semibold text-sky-700 uppercase tracking-wider mb-3">Bump Progress</h4>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className={`w-3 h-3 rounded-full border-2 ${i <= opp.bump_number ? 'bg-sky-500 border-sky-500' : 'bg-white border-sky-300'}`} />
                      ))}
                    </div>
                    <span className="text-sm font-medium text-sky-800">{opp.bump_number} / 4 bumps</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0 border-sky-300 text-sky-700 hover:bg-sky-100"
                      onClick={() => handleReduceBump(opp.id)}
                      disabled={opp.bump_number <= 0 || isBumping}
                    >
                      {isBumping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Minus className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 border-sky-300 text-sky-700 hover:bg-sky-100 text-xs font-medium"
                      onClick={() => handleRecordBump(opp.id)}
                      disabled={isBumping}
                    >
                      {isBumping ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />} Bump
                    </Button>
                  </div>
                </div>
                {opp.last_bump_date && (
                  <p className="text-xs text-sky-600 mt-2">Last bump: {formatDistanceToNow(new Date(opp.last_bump_date), { addSuffix: true })}</p>
                )}
              </div>
            )}

            {/* Quick Actions */}
            <div className="flex gap-2 flex-wrap min-w-0">
              <div className="flex items-center gap-1 flex-wrap">
                <Select
                  value={bookingUserId[`slide-${opp.id}`] || opp.owner_id || ''}
                  onValueChange={v => setBookingUserId(prev => ({ ...prev, [`slide-${opp.id}`]: v }))}
                >
                  <SelectTrigger className="h-8 text-xs w-[120px] border-brand/30">
                    <SelectValue placeholder="Team member" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline" size="sm" className="text-xs text-brand border-brand/30 hover:bg-brand/5"
                  onClick={() => copyBookingLink(bookingUserId[`slide-${opp.id}`] || opp.owner_id || '', opp.id)}
                >
                  <Calendar className="h-3.5 w-3.5 mr-1" /> Copy Booking Link
                </Button>
              </div>
              <Button
                variant="outline" size="sm" className="text-xs text-orange-600 border-orange-300 hover:bg-orange-50"
                onClick={() => handleStageChange(opp.id, 'orbit', opp.stage)}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Move to Orbit
              </Button>
              <Button
                variant="outline" size="sm" className="text-xs text-red-600 border-red-300 hover:bg-red-50"
                onClick={() => handleDelete(opp.id)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
            </div>

            {/* Stage Move */}
            <div className="grid gap-2">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Move to Stage</Label>
              <Select
                value={opp.stage}
                onValueChange={(v) => handleStageChange(opp.id, v as SalesPipelineStage, opp.stage)}
              >
                <SelectTrigger className="focus-brand">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_V2_STAGES.filter(s => s !== 'proposal_sent').map(s => (
                    <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 5-for-5 Qualification — BANT+ checkboxes. ≥3/5 counts as a
                qualified conversation in the Outreach metrics dashboard. */}
            {(() => {
              const quals = [
                { key: 'qual_budget',   label: 'Budget',         hint: 'Confirmed or directional' },
                { key: 'qual_dm',       label: 'Decision Maker', hint: 'Identified + engaged' },
                { key: 'qual_timeline', label: 'Timeline',       hint: 'Within ~90 days' },
                { key: 'qual_scope',    label: 'Scope',          hint: 'Knows what they want' },
                { key: 'qual_fit',      label: 'Fit',            hint: 'Right vertical/region/size' },
              ] as const;
              const checkedCount = quals.filter(q => (opp as any)[q.key]).length;
              const isQualified = checkedCount >= 3;
              return (
                <div className="border-t pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      5-for-5 Qualification
                    </h4>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isQualified ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                      {checkedCount}/5 {isQualified ? '· Qualified' : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {quals.map(q => {
                      const checked = !!(opp as any)[q.key];
                      return (
                        <label
                          key={q.key}
                          className={`flex items-start gap-2 p-2.5 rounded-md border cursor-pointer transition-colors ${checked ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={async (next) => {
                              const patch = { [q.key]: !!next };
                              applyOppPatch(opp.id, patch as Partial<SalesPipelineOpportunity>);
                              try {
                                await SalesPipelineService.update(opp.id, patch as any);
                              } catch (err) {
                                console.error('Error updating qual flag:', err);
                                applyOppPatch(opp.id, { [q.key]: checked } as Partial<SalesPipelineOpportunity>);
                              }
                            }}
                            className="mt-0.5"
                          />
                          <div className="min-w-0">
                            <div className={`text-sm font-medium ${checked ? 'text-emerald-800' : 'text-gray-700'}`}>{q.label}</div>
                            <div className="text-[11px] text-gray-500">{q.hint}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Deal — high-traffic state fields (value, next meeting,
                meeting type) that used to live in the Edit form. Moved
                here 2026-05-14 so users can update them inline without
                opening the modal — these fields shift often as a deal
                moves, while the Edit form is for identity (name, POC,
                source, owner). Mirrors the inline-edit pattern used by
                Post-Proposal Tracking below. */}
            <div className="border-t pt-6">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Deal</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <Label className="text-xs text-gray-500">Deal value</Label>
                  <Input
                    type="number"
                    value={opp.deal_value ?? ''}
                    placeholder="0"
                    onBlur={async (e) => {
                      const raw = e.target.value.trim();
                      const v = raw === '' ? null : parseFloat(raw);
                      if (v === opp.deal_value) return;
                      if (v !== null && Number.isNaN(v)) return;
                      applyOppPatch(opp.id, { deal_value: v } as Partial<SalesPipelineOpportunity>);
                      try { await SalesPipelineService.update(opp.id, { deal_value: v } as any); }
                      catch (err) { console.error(err); }
                    }}
                    className="h-7 text-sm focus-brand"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Currency</Label>
                  <Select
                    value={opp.currency || 'USD'}
                    onValueChange={async (v) => {
                      if (v === (opp.currency || 'USD')) return;
                      applyOppPatch(opp.id, { currency: v } as Partial<SalesPipelineOpportunity>);
                      try { await SalesPipelineService.update(opp.id, { currency: v } as any); }
                      catch (err) { console.error(err); }
                    }}
                  >
                    <SelectTrigger className="h-7 text-sm focus-brand"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="USDT">USDT</SelectItem>
                      <SelectItem value="USDC">USDC</SelectItem>
                      <SelectItem value="ETH">ETH</SelectItem>
                      <SelectItem value="BTC">BTC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Next meeting</Label>
                  {/* Date + time scroll picker, copied from the (now-
                      removed) Edit form variant. Keeps next_meeting_at
                      as ISO string and persists onSelect. */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="focus-brand justify-start text-left font-normal w-full h-7 text-sm"
                        style={{ borderColor: '#e5e7eb', backgroundColor: 'white', color: opp.next_meeting_at ? '#111827' : '#9ca3af' }}
                      >
                        <Calendar className="mr-2 h-3.5 w-3.5" />
                        {opp.next_meeting_at
                          ? format(new Date(opp.next_meeting_at), 'MMM d, yyyy')
                          : 'Select date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
                      <CalendarPicker
                        mode="single"
                        selected={opp.next_meeting_at ? new Date(opp.next_meeting_at) : undefined}
                        onSelect={async (date) => {
                          let iso: string | null = null;
                          if (date) {
                            // Preserve existing time if a meeting was already set.
                            const existing = opp.next_meeting_at ? new Date(opp.next_meeting_at) : new Date();
                            date.setHours(existing.getHours(), existing.getMinutes(), 0, 0);
                            iso = date.toISOString();
                          }
                          applyOppPatch(opp.id, { next_meeting_at: iso } as Partial<SalesPipelineOpportunity>);
                          try { await SalesPipelineService.update(opp.id, { next_meeting_at: iso } as any); }
                          catch (err) { console.error(err); }
                        }}
                        initialFocus
                        classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                        modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Meeting time</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="focus-brand justify-start text-left font-normal w-full h-7 text-sm"
                        style={{ borderColor: '#e5e7eb', backgroundColor: 'white', color: opp.next_meeting_at ? '#111827' : '#9ca3af' }}
                        disabled={!opp.next_meeting_at}
                      >
                        <Clock className="mr-2 h-3.5 w-3.5" />
                        {opp.next_meeting_at ? format(new Date(opp.next_meeting_at), 'h:mm a') : '—'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
                      <div className="flex gap-0 divide-x">
                        {/* Hour column */}
                        <ScrollArea className="h-[200px] w-[70px]">
                          <div className="p-1">
                            {Array.from({ length: 24 }, (_, h) => {
                              const label = `${h === 0 ? 12 : h > 12 ? h - 12 : h} ${h >= 12 ? 'PM' : 'AM'}`;
                              const isSelected = opp.next_meeting_at && new Date(opp.next_meeting_at).getHours() === h;
                              return (
                                <Button
                                  key={h}
                                  variant="ghost"
                                  className={`w-full justify-center font-normal text-xs h-7 px-1 ${isSelected ? 'text-white hover:text-white' : ''}`}
                                  style={isSelected ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                                  onClick={async () => {
                                    const d = opp.next_meeting_at ? new Date(opp.next_meeting_at) : new Date();
                                    d.setHours(h, d.getMinutes(), 0, 0);
                                    const iso = d.toISOString();
                                    applyOppPatch(opp.id, { next_meeting_at: iso } as Partial<SalesPipelineOpportunity>);
                                    try { await SalesPipelineService.update(opp.id, { next_meeting_at: iso } as any); }
                                    catch (err) { console.error(err); }
                                  }}
                                >
                                  {label}
                                </Button>
                              );
                            })}
                          </div>
                        </ScrollArea>
                        {/* Minute column */}
                        <ScrollArea className="h-[200px] w-[50px]">
                          <div className="p-1">
                            {Array.from({ length: 60 }, (_, m) => {
                              const isSelected = opp.next_meeting_at && new Date(opp.next_meeting_at).getMinutes() === m;
                              return (
                                <Button
                                  key={m}
                                  variant="ghost"
                                  className={`w-full justify-center font-normal text-xs h-7 px-1 ${isSelected ? 'text-white hover:text-white' : ''}`}
                                  style={isSelected ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                                  onClick={async () => {
                                    const d = opp.next_meeting_at ? new Date(opp.next_meeting_at) : new Date();
                                    d.setMinutes(m, 0, 0);
                                    const iso = d.toISOString();
                                    applyOppPatch(opp.id, { next_meeting_at: iso } as Partial<SalesPipelineOpportunity>);
                                    try { await SalesPipelineService.update(opp.id, { next_meeting_at: iso } as any); }
                                    catch (err) { console.error(err); }
                                  }}
                                >
                                  {String(m).padStart(2, '0')}
                                </Button>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-gray-500">Meeting type</Label>
                  <Select
                    value={(opp as any).next_meeting_type || ''}
                    onValueChange={async (v) => {
                      const nextVal = v || null;
                      if (nextVal === ((opp as any).next_meeting_type || null)) return;
                      applyOppPatch(opp.id, { next_meeting_type: nextVal } as Partial<SalesPipelineOpportunity>);
                      try { await SalesPipelineService.update(opp.id, { next_meeting_type: nextVal } as any); }
                      catch (err) { console.error(err); }
                    }}
                  >
                    <SelectTrigger className="h-7 text-sm focus-brand"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="discovery">Discovery Call</SelectItem>
                      <SelectItem value="proposal">Proposal Call</SelectItem>
                      <SelectItem value="follow_up">Follow Up</SelectItem>
                      <SelectItem value="closing">Closing Call</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Orbit Tracking — shown when stage='orbit'. Mirrors the
                Post-Proposal Tracking pattern but framed for keeping
                tabs on a deal we're not actively pursuing. The
                next-check-in fields reuse next_action_at +
                next_action_notes (an opp can't be both orbit AND
                post-proposal, so the columns can serve double duty
                without conflict). */}
            {opp.stage === 'orbit' && (() => {
              const checkinDate = opp.next_action_at ? new Date(opp.next_action_at + 'T00:00:00') : null;
              const today = new Date(); today.setHours(0, 0, 0, 0);
              const isOverdue = !!checkinDate && checkinDate < today;
              const isToday = !!checkinDate && checkinDate.getTime() === today.getTime();
              return (
                <div className="border-t pt-6">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <RotateCcw className="h-3.5 w-3.5 text-orange-600" />
                    Orbit Tracking
                  </h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <Label className="text-xs text-gray-500">Next check-in</Label>
                      {/* Reuses next_action_at — same DATE column as Post-
                          Proposal's "Next action date". Stage exclusivity
                          means the two contexts never share a row. */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="focus-brand justify-start text-left font-normal w-full h-7 text-sm"
                            style={{
                              borderColor: isOverdue ? '#fecaca' : '#e5e7eb',
                              backgroundColor: isOverdue ? '#fef2f2' : 'white',
                              color: opp.next_action_at ? (isOverdue ? '#b91c1c' : '#111827') : '#9ca3af',
                            }}
                          >
                            <Calendar className="mr-2 h-3.5 w-3.5" />
                            {opp.next_action_at
                              ? `${format(checkinDate!, 'MMM d, yyyy')}${isOverdue ? ' · overdue' : isToday ? ' · today' : ''}`
                              : 'Select date'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
                          <CalendarPicker
                            mode="single"
                            selected={checkinDate || undefined}
                            onSelect={async (date) => {
                              const v = date
                                ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                                : null;
                              applyOppPatch(opp.id, { next_action_at: v } as Partial<SalesPipelineOpportunity>);
                              try { await SalesPipelineService.update(opp.id, { next_action_at: v } as any); }
                              catch (err) { console.error(err); }
                            }}
                            initialFocus
                            classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                            modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Reason</Label>
                      <Select
                        value={opp.orbit_reason || ''}
                        onValueChange={async (v) => {
                          const nextVal = v || null;
                          if (nextVal === (opp.orbit_reason || null)) return;
                          applyOppPatch(opp.id, { orbit_reason: nextVal } as Partial<SalesPipelineOpportunity>);
                          try { await SalesPipelineService.update(opp.id, { orbit_reason: nextVal } as any); }
                          catch (err) { console.error(err); }
                        }}
                      >
                        <SelectTrigger className="h-7 text-sm focus-brand"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {ORBIT_REASONS.map(r => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Time in orbit</Label>
                      <p className="font-medium mt-1.5 text-sm">
                        {opp.bucket_changed_at || opp.updated_at
                          ? formatDistanceToNow(new Date(opp.bucket_changed_at || opp.updated_at))
                          : <span className="text-gray-400">—</span>}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Last contacted</Label>
                      <p className="font-medium mt-1.5 text-sm">
                        {opp.last_contacted_at
                          ? formatDistanceToNow(new Date(opp.last_contacted_at), { addSuffix: true })
                          : <span className="text-gray-400">—</span>}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs text-gray-500">What to watch for</Label>
                      {/* Reuses next_action_notes. Free-form so users can
                          drop signals like "Korea announcement", "Series
                          A", "exchange listing", or full context paragraphs. */}
                      <Textarea
                        value={opp.next_action_notes || ''}
                        placeholder="e.g. Watching for Korea expansion announcement, Series A raise, or exchange listing — message them when any of these hit."
                        onBlur={async (e) => {
                          const v = e.target.value.trim() || null;
                          if (v === opp.next_action_notes) return;
                          applyOppPatch(opp.id, { next_action_notes: v } as Partial<SalesPipelineOpportunity>);
                          try { await SalesPipelineService.update(opp.id, { next_action_notes: v } as any); }
                          catch (err) { console.error(err); }
                        }}
                        rows={2}
                        className="text-sm focus-brand"
                      />
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Post-Proposal Tracking — only shown when proposal_sent_at
                is set OR the deal is in a post-proposal stage. Inline-
                editable so users can update without going into edit mode. */}
            {(opp.proposal_sent_at || ['proposal_sent', 'proposal_call', 'v2_contract'].includes(opp.stage)) && (
              <div className="border-t pt-6">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Post-Proposal Tracking</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <Label className="text-xs text-gray-500">Proposal sent</Label>
                    <p className="font-medium mt-0.5">
                      {opp.proposal_sent_at ? (
                        <>
                          {format(new Date(opp.proposal_sent_at), 'MMM d, yyyy')}
                          <span className="text-xs text-gray-400 ml-1">
                            ({differenceInDays(new Date(), new Date(opp.proposal_sent_at))}d ago)
                          </span>
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Expected close</Label>
                    {/* Swapped from native <input type="date"> to the
                        Popover + CalendarPicker pattern used by the rest
                        of the slide-over (e.g. Meeting Date above) so the
                        UI is consistent. Stored value remains YYYY-MM-DD
                        because expected_close_date is a DATE column. */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="focus-brand justify-start text-left font-normal w-full h-7 text-sm"
                          style={{ borderColor: '#e5e7eb', backgroundColor: 'white', color: opp.expected_close_date ? '#111827' : '#9ca3af' }}
                        >
                          <Calendar className="mr-2 h-3.5 w-3.5" />
                          {opp.expected_close_date
                            ? format(new Date(opp.expected_close_date + 'T00:00:00'), 'MMM d, yyyy')
                            : 'Select date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
                        <CalendarPicker
                          mode="single"
                          selected={opp.expected_close_date ? new Date(opp.expected_close_date + 'T00:00:00') : undefined}
                          onSelect={async (date) => {
                            // Convert back to YYYY-MM-DD (DATE column, not timestamp).
                            const v = date
                              ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                              : null;
                            applyOppPatch(opp.id, { expected_close_date: v } as Partial<SalesPipelineOpportunity>);
                            try { await SalesPipelineService.update(opp.id, { expected_close_date: v } as any); }
                            catch (err) { console.error(err); }
                          }}
                          initialFocus
                          classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                          modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Decision maker</Label>
                    <Input
                      value={opp.decision_maker_name || ''}
                      placeholder="Name"
                      onBlur={async (e) => {
                        const v = e.target.value.trim() || null;
                        if (v === opp.decision_maker_name) return;
                        applyOppPatch(opp.id, { decision_maker_name: v } as Partial<SalesPipelineOpportunity>);
                        try { await SalesPipelineService.update(opp.id, { decision_maker_name: v } as any); }
                        catch (err) { console.error(err); }
                      }}
                      className="h-7 text-sm focus-brand"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">DM role</Label>
                    <Input
                      value={opp.decision_maker_role || ''}
                      placeholder="e.g. Head of Marketing"
                      onBlur={async (e) => {
                        const v = e.target.value.trim() || null;
                        if (v === opp.decision_maker_role) return;
                        applyOppPatch(opp.id, { decision_maker_role: v } as Partial<SalesPipelineOpportunity>);
                        try { await SalesPipelineService.update(opp.id, { decision_maker_role: v } as any); }
                        catch (err) { console.error(err); }
                      }}
                      className="h-7 text-sm focus-brand"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Next action date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="focus-brand justify-start text-left font-normal w-full h-7 text-sm"
                          style={{ borderColor: '#e5e7eb', backgroundColor: 'white', color: opp.next_action_at ? '#111827' : '#9ca3af' }}
                        >
                          <Calendar className="mr-2 h-3.5 w-3.5" />
                          {opp.next_action_at
                            ? format(new Date(opp.next_action_at + 'T00:00:00'), 'MMM d, yyyy')
                            : 'Select date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
                        <CalendarPicker
                          mode="single"
                          selected={opp.next_action_at ? new Date(opp.next_action_at + 'T00:00:00') : undefined}
                          onSelect={async (date) => {
                            const v = date
                              ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                              : null;
                            applyOppPatch(opp.id, { next_action_at: v } as Partial<SalesPipelineOpportunity>);
                            try { await SalesPipelineService.update(opp.id, { next_action_at: v } as any); }
                            catch (err) { console.error(err); }
                          }}
                          initialFocus
                          classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                          modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Proposal doc URL</Label>
                    <Input
                      value={opp.proposal_doc_url || ''}
                      placeholder="https://..."
                      onBlur={async (e) => {
                        const v = e.target.value.trim() || null;
                        if (v === opp.proposal_doc_url) return;
                        applyOppPatch(opp.id, { proposal_doc_url: v } as Partial<SalesPipelineOpportunity>);
                        try { await SalesPipelineService.update(opp.id, { proposal_doc_url: v } as any); }
                        catch (err) { console.error(err); }
                      }}
                      className="h-7 text-sm focus-brand"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs text-gray-500">Next action / notes</Label>
                    <Textarea
                      value={opp.next_action_notes || ''}
                      placeholder="What are we waiting on? What's the next step?"
                      onBlur={async (e) => {
                        const v = e.target.value.trim() || null;
                        if (v === opp.next_action_notes) return;
                        applyOppPatch(opp.id, { next_action_notes: v } as Partial<SalesPipelineOpportunity>);
                        try { await SalesPipelineService.update(opp.id, { next_action_notes: v } as any); }
                        catch (err) { console.error(err); }
                      }}
                      rows={2}
                      className="text-sm focus-brand"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Activity Timeline */}
            <div className="border-t pt-6">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Activity Timeline</h4>

              {/* Add activity form */}
              <div className="space-y-3 mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-1 mb-1">
                  {([
                    { key: 'note' as const, label: 'Note', icon: <StickyNote className="h-3.5 w-3.5" />, color: 'bg-gray-100 text-gray-700 border-gray-200' },
                    { key: 'message' as const, label: 'Message', icon: <MessageSquare className="h-3.5 w-3.5" />, color: 'bg-sky-100 text-sky-700 border-sky-200' },
                    { key: 'meeting' as const, label: 'Meeting', icon: <Calendar className="h-3.5 w-3.5" />, color: 'bg-purple-100 text-purple-700 border-purple-200' },
                    { key: 'proposal' as const, label: 'Proposal', icon: <FileText className="h-3.5 w-3.5" />, color: 'bg-amber-100 text-amber-700 border-amber-200' },
                  ]).map(t => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setActivityForm(f => ({ ...f, type: t.key }))}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                        activityForm.type === t.key ? t.color : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {t.icon}
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Direction toggle — only meaningful for messages.
                    Defaults to outbound. Setting to inbound stamps
                    last_reply_at on the opportunity (so the funnel
                    can count replies). Hidden for note/meeting/proposal
                    since those are always team-side actions. */}
                {activityForm.type === 'message' && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500">Direction:</span>
                    {([
                      { v: 'outbound' as const, label: 'Outbound (we sent)', cls: 'bg-sky-100 text-sky-700 border-sky-200' },
                      { v: 'inbound' as const,  label: 'Inbound (reply)',    cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
                    ]).map(opt => {
                      const current = activityForm.direction ?? 'outbound';
                      const active = current === opt.v;
                      return (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => setActivityForm(f => ({ ...f, direction: opt.v }))}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-colors ${
                            active ? opt.cls : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex gap-2">
                  <Input
                    placeholder="Title..."
                    value={activityForm.title}
                    onChange={e => setActivityForm(f => ({ ...f, title: e.target.value }))}
                    className="h-9 text-sm flex-1 focus-brand"
                  />
                </div>
                <Textarea
                  placeholder="Description (optional)"
                  value={activityForm.description || ''}
                  onChange={e => setActivityForm(f => ({ ...f, description: e.target.value }))}
                  className="text-sm min-h-[60px] focus-brand"
                  rows={2}
                />
                <div className="flex gap-2">
                  <Input
                    placeholder="Outcome"
                    value={activityForm.outcome || ''}
                    onChange={e => setActivityForm(f => ({ ...f, outcome: e.target.value }))}
                    className="h-9 text-sm flex-1 focus-brand"
                  />
                  <Input
                    placeholder="Next step"
                    value={activityForm.next_step || ''}
                    onChange={e => setActivityForm(f => ({ ...f, next_step: e.target.value }))}
                    className="h-9 text-sm flex-1 focus-brand"
                  />
                </div>
                {/* Meeting Date/Time (only for meeting type) */}
                {activityForm.type === 'meeting' && (
                  <div className="flex gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="h-9 text-sm flex-1 focus-brand justify-start font-normal"
                          style={{ borderColor: '#e5e7eb', backgroundColor: 'white', color: activityMeetingDate ? '#111827' : '#9ca3af' }}
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {activityMeetingDate ? format(new Date(activityMeetingDate), 'MMM d, yyyy') : 'Meeting date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
                        <CalendarPicker
                          mode="single"
                          selected={activityMeetingDate ? new Date(activityMeetingDate) : undefined}
                          onSelect={date => setActivityMeetingDate(date ? date.toISOString() : undefined)}
                          initialFocus
                          classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                          modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                        />
                      </PopoverContent>
                    </Popover>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="h-9 text-sm flex-1 focus-brand justify-start font-normal"
                          style={{ borderColor: '#e5e7eb', backgroundColor: 'white', color: activityMeetingTime ? '#111827' : '#9ca3af' }}
                        >
                          <Clock className="mr-2 h-4 w-4" />
                          {activityMeetingTime
                            ? (() => { const [h, m] = activityMeetingTime.split(':').map(Number); return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; })()
                            : 'Time'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
                        <div className="flex gap-0 divide-x">
                          <ScrollArea className="h-[200px] w-[70px]">
                            <div className="p-1">
                              {Array.from({ length: 24 }, (_, h) => {
                                const label = `${h === 0 ? 12 : h > 12 ? h - 12 : h} ${h >= 12 ? 'PM' : 'AM'}`;
                                const isSelected = activityMeetingTime && parseInt(activityMeetingTime.split(':')[0]) === h;
                                return (
                                  <Button
                                    key={h}
                                    variant="ghost"
                                    className={`w-full justify-center font-normal text-xs h-7 px-1 ${isSelected ? 'text-white hover:text-white' : ''}`}
                                    style={isSelected ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                                    onClick={() => {
                                      const currentMin = activityMeetingTime ? activityMeetingTime.split(':')[1] : '00';
                                      setActivityMeetingTime(`${String(h).padStart(2, '0')}:${currentMin}`);
                                    }}
                                  >
                                    {label}
                                  </Button>
                                );
                              })}
                            </div>
                          </ScrollArea>
                          <ScrollArea className="h-[200px] w-[50px]">
                            <div className="p-1">
                              {Array.from({ length: 60 }, (_, m) => {
                                const isSelected = activityMeetingTime && parseInt(activityMeetingTime.split(':')[1]) === m;
                                return (
                                  <Button
                                    key={m}
                                    variant="ghost"
                                    className={`w-full justify-center font-normal text-xs h-7 px-1 ${isSelected ? 'text-white hover:text-white' : ''}`}
                                    style={isSelected ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                                    onClick={() => {
                                      const currentHour = activityMeetingTime ? activityMeetingTime.split(':')[0] : '09';
                                      setActivityMeetingTime(`${currentHour}:${String(m).padStart(2, '0')}`);
                                    }}
                                  >
                                    {String(m).padStart(2, '0')}
                                  </Button>
                                );
                              })}
                            </div>
                          </ScrollArea>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
                <div className="flex gap-2 items-center">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-9 text-sm flex-1 focus-brand justify-start font-normal"
                        style={{
                          borderColor: '#e5e7eb',
                          backgroundColor: 'white',
                          color: activityForm.next_step_date ? '#111827' : '#9ca3af'
                        }}
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {activityForm.next_step_date
                          ? new Date(activityForm.next_step_date).toLocaleDateString()
                          : 'Next step date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarPicker
                        mode="single"
                        selected={activityForm.next_step_date ? new Date(activityForm.next_step_date) : undefined}
                        onSelect={(date) => setActivityForm(f => ({ ...f, next_step_date: date ? date.toISOString() : undefined }))}
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
                  <Button
                    size="sm"
                    className="h-9 text-sm hover:opacity-90"
                    style={{ backgroundColor: '#3e8692', color: 'white' }}
                    onClick={handleAddActivity}
                    disabled={isActivitySubmitting || !activityForm.title.trim()}
                  >
                    {isActivitySubmitting ? '...' : 'Add'}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={activityFileRef}
                    className="hidden"
                    onChange={e => setActivityFile(e.target.files?.[0] || null)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs text-gray-500"
                    onClick={() => activityFileRef.current?.click()}
                  >
                    <Paperclip className="h-3.5 w-3.5 mr-1" />
                    {activityFile ? 'Change file' : 'Attach file'}
                  </Button>
                  {activityFile && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-white border rounded-md px-2 py-1">
                      <Paperclip className="h-3 w-3 text-gray-400" />
                      <span className="truncate max-w-[180px]">{activityFile.name}</span>
                      <button type="button" onClick={() => { setActivityFile(null); if (activityFileRef.current) activityFileRef.current.value = ''; }} className="text-gray-400 hover:text-gray-600">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Activity list */}
              <div className="space-y-4">
                {activities.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">No activities yet</p>
                ) : activities.map(act => (
                  <div key={act.id} className="flex gap-3">
                    <div className="mt-0.5 flex flex-col items-center">
                      <div className="p-2 rounded-full bg-gray-100 text-gray-500">
                        {activityIcon(act.type)}
                      </div>
                      <div className="w-px flex-1 bg-gray-200 mt-2" />
                    </div>
                    <div className="flex-1 min-w-0 pb-4 overflow-hidden">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900 break-words">{linkifyText(act.title)}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 capitalize flex-shrink-0">{act.type}</Badge>
                      </div>
                      {act.description && <p className="text-sm text-gray-600 mt-1 break-words overflow-wrap-anywhere" style={{ overflowWrap: 'anywhere' }}>{linkifyText(act.description)}</p>}
                      {act.outcome && (
                        <p className="text-sm text-gray-500 mt-1 break-words" style={{ overflowWrap: 'anywhere' }}>
                          <span className="font-medium text-gray-700">Outcome:</span> {linkifyText(act.outcome)}
                        </p>
                      )}
                      {act.next_step && (
                        <div className="flex items-start gap-1 mt-1 text-sm text-blue-600">
                          <ArrowRight className="h-3 w-3 flex-shrink-0 mt-0.5" />
                          <span className="break-words" style={{ overflowWrap: 'anywhere' }}>{linkifyText(act.next_step)}</span>
                          {act.next_step_date && (
                            <span className="text-gray-400 ml-1">
                              ({format(new Date(act.next_step_date), 'MMM d')})
                            </span>
                          )}
                        </div>
                      )}
                      {act.attachment_url && (
                        <a
                          href={act.attachment_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-1.5 text-xs text-brand hover:underline"
                          onClick={e => e.stopPropagation()}
                        >
                          <Paperclip className="h-3 w-3" />
                          {act.attachment_name || 'Attachment'}
                        </a>
                      )}
                      <span className="text-xs text-gray-400 mt-1.5 block">
                        {formatDistanceToNow(new Date(act.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
        )}
      </div>

      {/* Stage History dialog — restored from the legacy /crm/pipeline.
          Sourced from crm_stage_history; recordStageHistory() in
          crmService writes to it on every updateOpportunity stage change.
          Z-index above the slide-over (z-[80] > z-[70]) so it floats
          on top when triggered. */}
      <Dialog open={stageHistoryOpen} onOpenChange={setStageHistoryOpen}>
        <DialogContent className="max-w-lg z-[80]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4 text-brand" />
              Stage History
            </DialogTitle>
            <DialogDescription>
              Timeline for <span className="font-medium">{slideOverOpp?.name}</span>
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[420px]">
            <div className="space-y-4 py-2">
              {stageHistoryLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : stageHistory.length === 0 ? (
                <p className="text-center text-sm text-gray-500 py-6">No history recorded yet.</p>
              ) : (
                <div className="relative">
                  <div className="absolute left-4 top-1 bottom-1 w-0.5 bg-gray-200" />
                  {stageHistory.map(entry => (
                    <div key={entry.id} className="relative pl-10 pb-4">
                      <div className="absolute left-2.5 top-1.5 w-3 h-3 bg-white border-2 border-gray-400 rounded-full" />
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {entry.from_stage ? (
                            <>
                              <Badge variant="outline" className="text-[10px]">
                                {STAGE_LABELS[entry.from_stage as SalesPipelineStage] || entry.from_stage}
                              </Badge>
                              <ArrowRight className="h-3 w-3 text-gray-400" />
                              <Badge className="text-[10px]" style={{ backgroundColor: '#3e8692', color: 'white' }}>
                                {STAGE_LABELS[entry.to_stage as SalesPipelineStage] || entry.to_stage}
                              </Badge>
                            </>
                          ) : (
                            <Badge className="text-[10px]" style={{ backgroundColor: '#3e8692', color: 'white' }}>
                              Created as {STAGE_LABELS[entry.to_stage as SalesPipelineStage] || entry.to_stage}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          {format(new Date(entry.changed_at), 'MMM d, yyyy h:mm a')}
                          {entry.changed_by && (
                            <>· <span className="text-gray-600">{getUserName(entry.changed_by)}</span></>
                          )}
                        </p>
                        {entry.notes && (
                          <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{entry.notes}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStageHistoryOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>,
      document.body
    );
  };

  // ============================================
  // RENDER: Create / Edit Dialog
  // ============================================

  const renderFormDialog = () => {
    const isEdit = !!editingOpp;
    // Only open as dialog for create, or edit when NOT in slide-over edit mode
    const isOpen = isCreateOpen || (!!editingOpp && slideOverMode !== 'edit');

    return (
      <Dialog open={isOpen} onOpenChange={open => {
        if (!open) { setIsCreateOpen(false); setEditingOpp(null); setForm({ name: '' }); }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit Opportunity' : 'New Opportunity'}</DialogTitle>
            <DialogDescription>
              {isEdit ? 'Update opportunity details.' : 'Add a new opportunity to the sales pipeline.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); isEdit ? handleUpdate() : handleCreate(); }}>
            <div className="grid gap-4 py-4">
              {/* Basic Info */}
              <div className="grid gap-2">
                <Label>Name *</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Company or contact name"
                  className="focus-brand"
                />
              </div>

              {!isEdit && (
                <div className="grid gap-2">
                  <Label>Stage</Label>
                  <Select value={form.stage || 'cold_dm'} onValueChange={v => setForm(f => ({ ...f, stage: v as SalesPipelineStage }))}>
                    <SelectTrigger className="focus-brand"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ALL_V2_STAGES.filter(s => s !== 'proposal_sent').map(s => (
                        <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>POC Platform</Label>
                  <Select value={form.poc_platform || ''} onValueChange={v => setForm(f => ({ ...f, poc_platform: v as PocPlatform }))}>
                    <SelectTrigger className="focus-brand"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {POC_PLATFORMS.map(p => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>POC Handle / ID</Label>
                  <Input
                    value={form.poc_handle || ''}
                    onChange={e => setForm(f => ({ ...f, poc_handle: e.target.value }))}
                    placeholder="@handle or ID"
                    className="focus-brand"
                  />
                </div>
              </div>

              {/* Project Twitter — the project-level X/Twitter URL or
                  handle. Populated here so the Twitter "+" affordance
                  on the row hover (renderProjectNameSuffix) becomes a
                  resolved link. */}
              <div className="grid gap-2">
                <Label>Project Twitter</Label>
                <Input
                  value={form.twitter_handle || ''}
                  onChange={e => setForm(f => ({ ...f, twitter_handle: e.target.value }))}
                  placeholder="@handle or https://x.com/handle"
                  className="focus-brand"
                />
              </div>
              <div className="grid gap-2">
                <Label>Owner</Label>
                <Select
                  value={form.owner_id || ''}
                  onValueChange={v => setForm(f => ({ ...f, owner_id: v }))}
                >
                  <SelectTrigger className="focus-brand"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Co-Owners</Label>
                <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 border rounded-md bg-white">
                  {(form.co_owner_ids || []).map(id => {
                    const u = users.find(u => u.id === id);
                    return (
                      <span key={id} className="inline-flex items-center gap-1 bg-brand/10 text-brand text-xs px-2 py-0.5 rounded-full">
                        {u?.name || u?.email || id}
                        <button type="button" onClick={() => setForm(f => ({ ...f, co_owner_ids: (f.co_owner_ids || []).filter(i => i !== id) }))} className="hover:text-red-500 ml-0.5">&times;</button>
                      </span>
                    );
                  })}
                  <Select value="" onValueChange={v => { if (v && !(form.co_owner_ids || []).includes(v) && v !== form.owner_id) setForm(f => ({ ...f, co_owner_ids: [...(f.co_owner_ids || []), v] })); }}>
                    <SelectTrigger className="border-none shadow-none bg-transparent h-6 w-auto px-1 text-xs text-gray-400 focus:ring-0"><SelectValue placeholder="+ Add" /></SelectTrigger>
                    <SelectContent>
                      {users.filter(u => u.id !== form.owner_id && !(form.co_owner_ids || []).includes(u.id)).map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Source</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'cold_outreach', label: 'Cold Outreach' },
                    { value: 'referral', label: 'Referral' },
                    { value: 'inbound', label: 'Inbound' },
                    { value: 'event', label: 'Event' },
                    { value: 'twitter', label: 'Twitter' },
                    { value: 'linkedin', label: 'LinkedIn' },
                    { value: 'telegram', label: 'Telegram' },
                    { value: 'website', label: 'Website' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, source: f.source === opt.value ? undefined : opt.value }))}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                        form.source === opt.value
                          ? 'text-white border-transparent'
                          : 'text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                      style={form.source === opt.value ? { backgroundColor: '#3e8692' } : {}}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {form.source === 'referral' && (
                <div className="grid gap-2">
                  <Label>Referrer</Label>
                  <Input
                    value={form.referrer || ''}
                    onChange={e => setForm(f => ({ ...f, referrer: e.target.value }))}
                    placeholder="Who referred?"
                    className="focus-brand"
                  />
                </div>
              )}

              {form.source !== 'cold_outreach' && (
                <div className="grid gap-2">
                  <Label>Affiliate</Label>
                  <Popover open={affiliatePopoverOpen} onOpenChange={setAffiliatePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between font-normal focus-brand"
                      >
                        {form.affiliate_id
                          ? affiliates.find(a => a.id === form.affiliate_id)?.name || 'Select affiliate...'
                          : 'Select affiliate...'}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[350px] p-0">
                      <Command>
                        <CommandInput
                          placeholder="Search or type new affiliate..."
                          value={affiliateSearch}
                          onValueChange={setAffiliateSearch}
                        />
                        <CommandList>
                          <CommandEmpty>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                              onClick={async () => {
                                if (!affiliateSearch.trim()) return;
                                try {
                                  const created = await CRMService.createAffiliate({
                                    name: affiliateSearch.trim(),
                                    owner_id: user?.id,
                                  });
                                  setAffiliates(prev => [...prev, created]);
                                  setForm(f => ({ ...f, affiliate_id: created.id }));
                                  setAffiliateSearch('');
                                  setAffiliatePopoverOpen(false);
                                } catch (err) {
                                  console.error('Error creating affiliate:', err);
                                }
                              }}
                            >
                              <Plus className="h-4 w-4 text-brand" />
                              <span>Add "<strong>{affiliateSearch}</strong>" as new affiliate</span>
                            </button>
                          </CommandEmpty>
                          <CommandGroup>
                            {affiliates.map(a => (
                              <CommandItem
                                key={a.id}
                                value={a.name}
                                onSelect={() => {
                                  setForm(f => ({ ...f, affiliate_id: f.affiliate_id === a.id ? undefined : a.id }));
                                  setAffiliateSearch('');
                                  setAffiliatePopoverOpen(false);
                                }}
                              >
                                <Check className={`mr-2 h-4 w-4 ${form.affiliate_id === a.id ? 'opacity-100' : 'opacity-0'}`} />
                                {a.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              <div className="grid gap-2">
                <Label>Notes</Label>
                <Textarea
                  value={form.notes || ''}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Additional notes..."
                  className="focus-brand"
                  rows={3}
                />
              </div>

              {/* Details Section — hidden for now */}
              {isEdit && <details className="group hidden">
                <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-700 select-none">
                  <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                  Details
                </summary>
                <div className="grid gap-4 mt-3 pl-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Path</Label>
                      <Select
                        value={form.dm_account || 'sdr'}
                        onValueChange={v => setForm(f => ({ ...f, dm_account: v as DmAccount }))}
                      >
                        <SelectTrigger className="focus-brand"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="closer">Closer (Path A)</SelectItem>
                          <SelectItem value="sdr">SDR (Path B)</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Bucket</Label>
                      <Select
                        value={form.bucket || ''}
                        onValueChange={v => setForm(f => ({ ...f, bucket: v as Bucket }))}
                      >
                        <SelectTrigger className="focus-brand"><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A">A - High Priority</SelectItem>
                          <SelectItem value="B">B - Medium</SelectItem>
                          <SelectItem value="C">C - Low Priority</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>TG Handle</Label>
                    <Input
                      value={form.tg_handle || ''}
                      onChange={e => setForm(f => ({ ...f, tg_handle: e.target.value }))}
                      placeholder="@handle"
                      className="focus-brand"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Deal Value</Label>
                      <Input
                        type="number"
                        value={form.deal_value || ''}
                        onChange={e => setForm(f => ({ ...f, deal_value: e.target.value ? parseFloat(e.target.value) : undefined }))}
                        placeholder="0"
                        className="focus-brand"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Currency</Label>
                      <Select
                        value={form.currency || 'USD'}
                        onValueChange={v => setForm(f => ({ ...f, currency: v }))}
                      >
                        <SelectTrigger className="focus-brand"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="USDT">USDT</SelectItem>
                          <SelectItem value="USDC">USDC</SelectItem>
                          <SelectItem value="ETH">ETH</SelectItem>
                          <SelectItem value="BTC">BTC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {isEdit && (
                    <div className="grid gap-2">
                      <Label>Temperature Score: {form.temperature_score || 50} (Manual Override)</Label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={form.temperature_score || 50}
                        onChange={e => setForm(f => ({ ...f, temperature_score: parseInt(e.target.value) }))}
                        className="w-full accent-brand"
                      />
                    </div>
                  )}
                </div>
              </details>}
          </div>

            {/* Copy Booking Link - only in edit mode */}
            {isEdit && editingOpp && (
              <div className="border-t pt-3 mb-1">
                <div className="flex items-center gap-2">
                  <Select
                    value={bookingUserId[`edit-${editingOpp.id}`] || editingOpp.owner_id || ''}
                    onValueChange={v => setBookingUserId(prev => ({ ...prev, [`edit-${editingOpp.id}`]: v }))}
                  >
                    <SelectTrigger className="h-8 text-sm flex-1">
                      <SelectValue placeholder="Team member" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-sm whitespace-nowrap"
                    onClick={() => copyBookingLink(bookingUserId[`edit-${editingOpp.id}`] || editingOpp.owner_id || '', editingOpp.id)}
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Copy Booking Link
                  </Button>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setIsCreateOpen(false); setEditingOpp(null); setForm({ name: '' }); }}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !form.name.trim()}
                className="hover:opacity-90"
                style={{ backgroundColor: '#3e8692', color: 'white' }}
              >
                {isSubmitting ? 'Saving...' : isEdit ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  };

  // ============================================
  // RENDER: Activity Log Prompt
  // ============================================

  const renderActivityLogPrompt = () => {
    const ACTIVITY_TYPE_LABELS: Record<ActivityType, { label: string; icon: React.ReactNode; color: string }> = {
      call: { label: 'Call', icon: <Phone className="h-3.5 w-3.5" />, color: 'bg-blue-100 text-blue-700' },
      message: { label: 'Message', icon: <MessageSquare className="h-3.5 w-3.5" />, color: 'bg-sky-100 text-sky-700' },
      meeting: { label: 'Meeting', icon: <Calendar className="h-3.5 w-3.5" />, color: 'bg-purple-100 text-purple-700' },
      proposal: { label: 'Proposal', icon: <FileText className="h-3.5 w-3.5" />, color: 'bg-amber-100 text-amber-700' },
      note: { label: 'Note', icon: <StickyNote className="h-3.5 w-3.5" />, color: 'bg-gray-100 text-gray-700' },
      bump: { label: 'Bump', icon: <Zap className="h-3.5 w-3.5" />, color: 'bg-orange-100 text-orange-700' },
    };

    const typeInfo = activityLogPrompt ? ACTIVITY_TYPE_LABELS[activityLogPrompt.type] : null;
    const meetingDateObj = activityLogForm.meeting_date ? new Date(activityLogForm.meeting_date) : undefined;

    // Apply meeting_time to meetingDateObj for display
    const getMeetingDateTime = () => {
      if (!meetingDateObj) return undefined;
      const d = new Date(meetingDateObj);
      if (activityLogForm.meeting_time) {
        const [h, m] = activityLogForm.meeting_time.split(':').map(Number);
        d.setHours(h, m, 0, 0);
      }
      return d;
    };

    return (
      <Dialog open={!!activityLogPrompt} onOpenChange={open => { if (!open) { setActivityLogPrompt(null); setActivityLogForm({ title: '', description: '', outcome: '', next_step: '', meeting_date: undefined, meeting_time: undefined, next_step_date: undefined, co_owner_ids: undefined }); } }}>
        <DialogContent className="sm:max-w-md z-[80] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Log Activity — {activityLogPrompt?.oppName}</DialogTitle>
            <DialogDescription>Add context to this activity before saving.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 px-1 -mx-1">
            {/* Type selector */}
            <div className="flex flex-wrap items-center gap-1">
              {([
                { key: 'note' as ActivityType, label: 'Note', icon: <StickyNote className="h-3.5 w-3.5" />, color: 'bg-gray-100 text-gray-700 border-gray-300' },
                { key: 'message' as ActivityType, label: 'Message', icon: <MessageSquare className="h-3.5 w-3.5" />, color: 'bg-sky-100 text-sky-700 border-sky-300' },
                { key: 'meeting' as ActivityType, label: 'Meeting', icon: <Calendar className="h-3.5 w-3.5" />, color: 'bg-purple-100 text-purple-700 border-purple-300' },
                { key: 'proposal' as ActivityType, label: 'Proposal', icon: <FileText className="h-3.5 w-3.5" />, color: 'bg-amber-100 text-amber-700 border-amber-300' },
                { key: 'bump' as ActivityType, label: 'Bump', icon: <Zap className="h-3.5 w-3.5" />, color: 'bg-orange-100 text-orange-700 border-orange-300' },
              ]).map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActivityLogPrompt(prev => prev ? { ...prev, type: t.key } : prev)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                    activityLogPrompt?.type === t.key ? t.color : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>

            {/* Template picker for message/bump type */}
            {(activityLogPrompt?.type === 'message' || activityLogPrompt?.type === 'bump') && (() => {
              const opp = opportunities.find(o => o.id === activityLogPrompt.oppId);
              const oppStage = opp?.stage || '';
              const stageTemplates = templates.filter(t => t.is_active && (t.stage === oppStage || (activityLogPrompt.type === 'bump' && t.stage === 'bump')));
              const otherTemplates = templates.filter(t => t.is_active && t.stage !== oppStage && !(activityLogPrompt.type === 'bump' && t.stage === 'bump'));
              return (
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">DM Template <span className="font-normal normal-case text-gray-400">(optional)</span></Label>
                  <Popover open={templatePopoverOpen} onOpenChange={setTemplatePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="focus-brand justify-between font-normal text-sm h-10">
                        Pick a template...
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[90]" align="start">
                      <Command>
                        <CommandInput placeholder="Search templates..." />
                        <CommandList>
                          <CommandEmpty>No templates found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem onSelect={() => { setActivityLogForm(f => ({ ...f, description: '' })); setTemplatePopoverOpen(false); }}>
                              No template
                            </CommandItem>
                          </CommandGroup>
                          {stageTemplates.length > 0 && (
                            <CommandGroup heading={`Current Stage — ${oppStage.replace(/_/g, ' ')}`}>
                              {stageTemplates.map(t => (
                                <CommandItem key={t.id} onSelect={() => { setActivityLogForm(f => ({ ...f, description: t.content })); setTemplatePopoverOpen(false); }}>
                                  <div className="flex items-center gap-2 w-full">
                                    <span>{t.name}</span>
                                    {(t.tags || []).length > 0 && (
                                      <span className="text-[10px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">{(t.tags || []).join(', ')}</span>
                                    )}
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                          {otherTemplates.length > 0 && (
                            <CommandGroup heading="Other Stages">
                              {otherTemplates.map(t => (
                                <CommandItem key={t.id} onSelect={() => { setActivityLogForm(f => ({ ...f, description: t.content })); setTemplatePopoverOpen(false); }}>
                                  <div className="flex items-center gap-2 w-full">
                                    <span>{t.name}</span>
                                    <span className="text-gray-400 text-xs">({t.stage.replace(/_/g, ' ')})</span>
                                    {(t.tags || []).length > 0 && (
                                      <span className="text-[10px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">{(t.tags || []).join(', ')}</span>
                                    )}
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              );
            })()}

            {/* Title (editable) */}
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Title</Label>
              <Input
                value={activityLogForm.title}
                onChange={e => setActivityLogForm(f => ({ ...f, title: e.target.value }))}
                className="focus-brand"
                placeholder="Activity title..."
              />
            </div>

            {/* Copy Booking Link — send to prospect so they self-book */}
            {activityLogPrompt?.showMeetingPicker && (
              <div className="p-3 bg-brand/5 border border-brand/20 rounded-lg">
                <p className="text-xs text-gray-600 mb-2">Send a booking link so they can pick a time themselves:</p>
                <div className="flex items-center gap-2">
                  <Select
                    value={bookingUserId[`activity-${activityLogPrompt.oppId}`] || activityLogPrompt.ownerId || ''}
                    onValueChange={v => setBookingUserId(prev => ({ ...prev, [`activity-${activityLogPrompt.oppId}`]: v }))}
                  >
                    <SelectTrigger className="h-8 text-sm flex-1 border-brand/30">
                      <SelectValue placeholder="Team member" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-sm whitespace-nowrap border-brand/30 text-brand hover:bg-brand/10"
                    onClick={() => copyBookingLink(bookingUserId[`activity-${activityLogPrompt.oppId}`] || activityLogPrompt.ownerId || '', activityLogPrompt.oppId)}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Booking Link
                  </Button>
                </div>
              </div>
            )}

            {/* Meeting Date/Time pickers */}
            {activityLogPrompt?.showMeetingPicker && (
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Meeting Date <span className="font-normal normal-case text-gray-400">(optional)</span></Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="focus-brand justify-start text-left font-normal w-full"
                        style={{ borderColor: '#e5e7eb', backgroundColor: 'white', color: activityLogForm.meeting_date ? '#111827' : '#9ca3af' }}
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {meetingDateObj ? format(meetingDateObj, 'MMM d, yyyy') : 'Select date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[90]" align="start">
                      <CalendarPicker
                        mode="single"
                        selected={meetingDateObj}
                        onSelect={date => {
                          setActivityLogForm(f => ({ ...f, meeting_date: date ? date.toISOString() : undefined }));
                        }}
                        initialFocus
                        classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                        modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Meeting Time <span className="font-normal normal-case text-gray-400">(optional)</span></Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="focus-brand justify-start text-left font-normal w-full"
                        style={{ borderColor: '#e5e7eb', backgroundColor: 'white', color: activityLogForm.meeting_time ? '#111827' : '#9ca3af' }}
                      >
                        <Clock className="mr-2 h-4 w-4" />
                        {activityLogForm.meeting_time
                          ? (() => { const [h, m] = activityLogForm.meeting_time!.split(':').map(Number); return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; })()
                          : 'Select time'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[90]" align="start">
                      <div className="flex gap-0 divide-x">
                        <ScrollArea className="h-[200px] w-[70px]">
                          <div className="p-1">
                            {Array.from({ length: 24 }, (_, h) => {
                              const label = `${h === 0 ? 12 : h > 12 ? h - 12 : h} ${h >= 12 ? 'PM' : 'AM'}`;
                              const isSelected = activityLogForm.meeting_time && parseInt(activityLogForm.meeting_time.split(':')[0]) === h;
                              return (
                                <Button
                                  key={h}
                                  variant="ghost"
                                  className={`w-full justify-center font-normal text-xs h-7 px-1 ${isSelected ? 'text-white hover:text-white' : ''}`}
                                  style={isSelected ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                                  onClick={() => {
                                    const currentMin = activityLogForm.meeting_time ? activityLogForm.meeting_time.split(':')[1] : '00';
                                    setActivityLogForm(f => ({ ...f, meeting_time: `${String(h).padStart(2, '0')}:${currentMin}` }));
                                  }}
                                >
                                  {label}
                                </Button>
                              );
                            })}
                          </div>
                        </ScrollArea>
                        <ScrollArea className="h-[200px] w-[50px]">
                          <div className="p-1">
                            {Array.from({ length: 60 }, (_, m) => {
                              const isSelected = activityLogForm.meeting_time && parseInt(activityLogForm.meeting_time.split(':')[1]) === m;
                              return (
                                <Button
                                  key={m}
                                  variant="ghost"
                                  className={`w-full justify-center font-normal text-xs h-7 px-1 ${isSelected ? 'text-white hover:text-white' : ''}`}
                                  style={isSelected ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                                  onClick={() => {
                                    const currentHour = activityLogForm.meeting_time ? activityLogForm.meeting_time.split(':')[0] : '09';
                                    setActivityLogForm(f => ({ ...f, meeting_time: `${currentHour}:${String(m).padStart(2, '0')}` }));
                                  }}
                                >
                                  {String(m).padStart(2, '0')}
                                </Button>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}

            {/* Co-Owners — shown when booking a meeting */}
            {activityLogPrompt?.showMeetingPicker && (
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Co-Owners for this Meeting</Label>
                <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 border rounded-md bg-white">
                  {(activityLogForm.co_owner_ids || []).map(id => {
                    const u = users.find(u => u.id === id);
                    return (
                      <span key={id} className="inline-flex items-center gap-1 bg-brand/10 text-brand text-xs px-2 py-0.5 rounded-full">
                        {u?.name || u?.email || id}
                        <button type="button" onClick={() => setActivityLogForm(f => ({ ...f, co_owner_ids: (f.co_owner_ids || []).filter(i => i !== id) }))} className="hover:text-red-500 ml-0.5">&times;</button>
                      </span>
                    );
                  })}
                  <Select value="" onValueChange={v => {
                    if (v && !(activityLogForm.co_owner_ids || []).includes(v)) {
                      setActivityLogForm(f => ({ ...f, co_owner_ids: [...(f.co_owner_ids || []), v] }));
                    }
                  }}>
                    <SelectTrigger className="border-none shadow-none bg-transparent h-6 w-auto px-1 text-xs text-gray-400 focus:ring-0"><SelectValue placeholder="+ Add" /></SelectTrigger>
                    <SelectContent>
                      {users.filter(u => !(activityLogForm.co_owner_ids || []).includes(u.id)).map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Description */}
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{activityLogPrompt?.type === 'message' ? 'Message' : 'Description'} <span className="font-normal normal-case text-gray-400">(optional)</span></Label>
                {activityLogPrompt?.type === 'message' && activityLogForm.description && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-gray-500 hover:text-brand"
                    onClick={() => {
                      navigator.clipboard.writeText(activityLogForm.description);
                      toast({ title: 'Copied to clipboard' });
                    }}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                )}
              </div>
              <Textarea
                value={activityLogForm.description}
                onChange={e => setActivityLogForm(f => ({ ...f, description: e.target.value }))}
                className="focus-brand min-h-[60px]"
                placeholder={activityLogPrompt?.type === 'message' ? 'DM content...' : 'Add context...'}
                rows={activityLogPrompt?.type === 'message' ? 4 : 2}
              />
            </div>

            {/* Outcome + Next Step */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Outcome <span className="font-normal normal-case text-gray-400">(optional)</span></Label>
                <Input
                  value={activityLogForm.outcome}
                  onChange={e => setActivityLogForm(f => ({ ...f, outcome: e.target.value }))}
                  className="focus-brand"
                  placeholder="Result..."
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Next Step <span className="font-normal normal-case text-gray-400">(optional)</span></Label>
                <Input
                  value={activityLogForm.next_step}
                  onChange={e => setActivityLogForm(f => ({ ...f, next_step: e.target.value }))}
                  className="focus-brand"
                  placeholder="What's next..."
                />
              </div>
            </div>

            {/* Next Step Date */}
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Next Step Date <span className="font-normal normal-case text-gray-400">(optional)</span></Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="focus-brand justify-start text-left font-normal w-full"
                    style={{ borderColor: '#e5e7eb', backgroundColor: 'white', color: activityLogForm.next_step_date ? '#111827' : '#9ca3af' }}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {activityLogForm.next_step_date
                      ? new Date(activityLogForm.next_step_date).toLocaleDateString()
                      : 'Select date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[90]" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={activityLogForm.next_step_date ? new Date(activityLogForm.next_step_date) : undefined}
                    onSelect={date => setActivityLogForm(f => ({ ...f, next_step_date: date ? date.toISOString() : undefined }))}
                    initialFocus
                    classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                    modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActivityLogPrompt(null); setActivityLogForm({ title: '', description: '', outcome: '', next_step: '', meeting_date: undefined, meeting_time: undefined, next_step_date: undefined, co_owner_ids: undefined }); }}>Cancel</Button>
            <Button
              onClick={confirmActivityLog}
              disabled={isActivityLogSubmitting}
              style={{ backgroundColor: '#3e8692', color: 'white' }}
              className="hover:opacity-90"
            >
              {isActivityLogSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Log Activity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  // ============================================
  // RENDER: Orbit Reason Prompt
  // ============================================

  const renderOrbitPrompt = () => (
    <Dialog open={!!orbitPrompt} onOpenChange={open => { if (!open) setOrbitPrompt(null); }}>
      <DialogContent className="sm:max-w-sm z-[80]">
        <DialogHeader>
          <DialogTitle>Move to Orbit</DialogTitle>
          <DialogDescription>Select the reason for moving this opportunity to orbit.</DialogDescription>
        </DialogHeader>
        <Select value={orbitReasonValue} onValueChange={v => setOrbitReasonValue(v as OrbitReason)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ORBIT_REASONS.map(r => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div>
          <label className="text-sm font-medium mb-1 block">Follow up in X days</label>
          <Input
            type="number"
            min={1}
            value={orbitFollowupDays}
            onChange={e => setOrbitFollowupDays(Math.max(1, parseInt(e.target.value) || 90))}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setOrbitPrompt(null); setOrbitFollowupDays(90); }}>Cancel</Button>
          <Button onClick={confirmOrbit} style={{ backgroundColor: '#3e8692' }}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const renderClosedLostPrompt = () => (
    <Dialog open={!!closedLostPrompt} onOpenChange={open => { if (!open) setClosedLostPrompt(null); }}>
      <DialogContent className="sm:max-w-sm z-[80]">
        <DialogHeader>
          <DialogTitle>Close as Lost</DialogTitle>
          <DialogDescription>Optionally add a reason for closing this opportunity.</DialogDescription>
        </DialogHeader>
        <Input
          value={closedLostReasonValue}
          onChange={e => setClosedLostReasonValue(e.target.value)}
          placeholder="Reason (optional)"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setClosedLostPrompt(null)}>Cancel</Button>
          <Button onClick={confirmClosedLost} variant="destructive">Close Lost</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const renderClosedWonPrompt = () => {
    const filteredClients = closedWonClients.filter(c =>
      c.name.toLowerCase().includes(closedWonClientSearch.toLowerCase()) ||
      c.email.toLowerCase().includes(closedWonClientSearch.toLowerCase())
    );
    const selectedClient = closedWonClients.find(c => c.id === closedWonClientId);
    const canConfirm = closedWonMode === 'new' ? closedWonName.trim() !== '' : closedWonClientId !== '';

    return (
      <Dialog open={!!closedWonPrompt} onOpenChange={open => { if (!open) setClosedWonPrompt(null); }}>
        <DialogContent className="sm:max-w-sm z-[80]">
          <DialogHeader>
            <DialogTitle>Deal Won!</DialogTitle>
            <DialogDescription>Link {closedWonPrompt?.oppName} to a client, or skip.</DialogDescription>
          </DialogHeader>
          <Select value={closedWonMode} onValueChange={v => setClosedWonMode(v as 'new' | 'existing')}>
            <SelectTrigger className="focus-brand"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="new">Create New Client</SelectItem>
              <SelectItem value="existing">Link Existing Client</SelectItem>
            </SelectContent>
          </Select>
          {closedWonMode === 'new' ? (
            <div className="space-y-2">
              <div>
                <Label className="text-sm font-medium">Client Name</Label>
                <Input
                  value={closedWonName}
                  onChange={e => setClosedWonName(e.target.value)}
                  placeholder="Company or contact name"
                  autoFocus
                  className="focus-brand"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Email</Label>
                <Input
                  value={closedWonEmail}
                  onChange={e => setClosedWonEmail(e.target.value)}
                  placeholder="client@example.com (optional)"
                  type="email"
                  className="focus-brand"
                />
              </div>
            </div>
          ) : (
            <Popover open={closedWonClientPopoverOpen} onOpenChange={setClosedWonClientPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between focus-brand">
                  {selectedClient ? selectedClient.name : 'Select a client...'}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0 z-[90]" align="start">
                <Command>
                  <CommandInput
                    placeholder="Search clients..."
                    value={closedWonClientSearch}
                    onValueChange={setClosedWonClientSearch}
                  />
                  <CommandList>
                    <CommandEmpty>No clients found.</CommandEmpty>
                    <CommandGroup>
                      {filteredClients.map(client => (
                        <CommandItem
                          key={client.id}
                          value={client.name}
                          onSelect={() => {
                            setClosedWonClientId(client.id);
                            setClosedWonClientPopoverOpen(false);
                          }}
                        >
                          <Check className={`mr-2 h-4 w-4 ${closedWonClientId === client.id ? 'opacity-100' : 'opacity-0'}`} />
                          <div>
                            <div className="font-medium">{client.name}</div>
                            {client.email && <div className="text-xs text-gray-500">{client.email}</div>}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={skipClosedWon}>Skip</Button>
            <Button onClick={confirmClosedWon} disabled={!canConfirm} style={{ backgroundColor: '#3e8692' }}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  const renderTgHandlePrompt = () => (
    <Dialog open={!!tgHandlePrompt} onOpenChange={open => { if (!open) setTgHandlePrompt(null); }}>
      <DialogContent className="sm:max-w-sm z-[80]">
        <DialogHeader>
          <DialogTitle>Enter TG Handle</DialogTitle>
          <DialogDescription>Enter the Telegram handle for {tgHandlePrompt?.oppName}.</DialogDescription>
        </DialogHeader>
        <Input
          value={tgHandleValue}
          onChange={e => setTgHandleValue(e.target.value)}
          placeholder="@handle"
          autoFocus
          className="focus-brand"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setTgHandlePrompt(null)}>Cancel</Button>
          <Button onClick={confirmTgHandle} disabled={!tgHandleValue.trim()} style={{ backgroundColor: '#3e8692' }} className="text-white hover:opacity-90">Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const renderBucketPrompt = () => (
    <Dialog open={!!bucketPrompt} onOpenChange={open => { if (!open) setBucketPrompt(null); }}>
      <DialogContent className="sm:max-w-sm z-[80]">
        <DialogHeader>
          <DialogTitle>Assign Bucket</DialogTitle>
          <DialogDescription>How qualified is {bucketPrompt?.oppName} after the discovery call?</DialogDescription>
        </DialogHeader>
        <div className="flex gap-3">
          {(['A', 'B', 'C'] as Bucket[]).map(b => (
            <button
              key={b}
              onClick={() => setBucketValue(b)}
              className={`flex-1 py-3 rounded-lg text-center font-semibold text-lg border-2 transition-all ${
                bucketValue === b
                  ? b === 'A' ? 'border-green-500 bg-green-50 text-green-700'
                    : b === 'B' ? 'border-amber-500 bg-amber-50 text-amber-700'
                    : 'border-gray-400 bg-gray-50 text-gray-600'
                  : 'border-gray-200 text-gray-400 hover:border-gray-300'
              }`}
            >
              {b}
              <div className="text-[10px] font-normal mt-0.5">
                {b === 'A' ? 'Hot' : b === 'B' ? 'Warm' : 'Low'}
              </div>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setBucketPrompt(null)}>Cancel</Button>
          <Button onClick={confirmBucket} style={{ backgroundColor: '#3e8692' }} className="text-white hover:opacity-90">Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // ============================================
  // RENDER: Loading
  // ============================================

  if (loading) {
    return (
      <div className="flex flex-col h-full gap-6">
        {/* Header — real title/subtitle render immediately so the user
            sees page context; only the data sections below skeleton. */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Sales Pipeline</h2>
            <p className="text-gray-600">Playbook-driven sales pipeline</p>
          </div>
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-64 rounded-md" />
            <Skeleton className="h-10 w-36 rounded-md" />
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>

        {/* Tabs and Content */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-10 w-56 rounded-md" />
            <Skeleton className="h-10 w-40 rounded-md" />
          </div>
          <div className="space-y-6 overflow-auto flex-1">
            {[...Array(3)].map((_, i) => (
              <div key={i}>
                <Skeleton className="h-12 w-full rounded-t-lg" />
                <div className="bg-white rounded-b-lg border border-gray-200 border-t-0 p-4 space-y-3">
                  <Skeleton className="h-10 w-full" />
                  {[...Array(2)].map((_, j) => (
                    <Skeleton key={j} className="h-14 w-full" />
                  ))}
                </div>
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

  return (
    <div className="space-y-6">
      {/* Activity Slide-Over (rendered via portal to document.body) */}
      {renderSlideOver()}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Sales Pipeline</h2>
          <p className="text-gray-600">Playbook-driven sales pipeline</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            title="Export current filtered view as CSV"
            onClick={() => downloadCsv(filteredOpportunities, [
              { header: 'Name', accessor: r => r.name },
              { header: 'Stage', accessor: r => r.stage || '' },
              { header: 'Bucket', accessor: r => (r as any).bucket || '' },
              { header: 'Source', accessor: r => (r as any).source || '' },
              { header: 'Owner', accessor: r => (r as any).owner?.name || (r as any).owner_id || '' },
              { header: 'POC Handle', accessor: r => (r as any).poc_handle || '' },
              { header: 'POC Platform', accessor: r => (r as any).poc_platform || '' },
              { header: 'Deal Value', accessor: r => (r as any).deal_value ?? '' },
              { header: 'Currency', accessor: r => (r as any).currency || '' },
              { header: 'Last Contacted', accessor: r => (r as any).last_contacted_at ? new Date((r as any).last_contacted_at).toISOString().slice(0, 10) : '' },
              { header: 'Next Action', accessor: r => (r as any).next_action_at ? new Date((r as any).next_action_at).toISOString().slice(0, 10) : '' },
              { header: 'Created', accessor: r => new Date(r.created_at).toISOString().slice(0, 10) },
            ], `sales-pipeline-${todayStamp()}`)}
            disabled={filteredOpportunities.length === 0}
          >
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button
            onClick={() => { setForm({ name: '', owner_id: user?.id || undefined }); setIsCreateOpen(true); }}
            className="hover:opacity-90"
            style={{ backgroundColor: '#3e8692', color: 'white' }}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Opportunity
          </Button>
        </div>
      </div>

      {/* Weekly Activity Funnel — canonical 5-stage outbound funnel.
          Outreach → Replies → Calls Booked → Calls Taken → Proposals.
          Counts DISTINCT opportunities per stage (one prospect DM'd 5x
          = 1 outreach). Backed by:
            - migration 044 (direction column on crm_activities)
            - auto-stamped milestones (proposal_sent_at) from createActivity
            - meeting next_step_date split for booked vs taken
          Each step shows the conversion % vs Outreach so the funnel
          shape is visually obvious. */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-brand" />
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
              Weekly Activity Funnel
            </h3>
            <Badge variant="secondary" className="text-[10px]">
              last {salesFunnelWindow}d
            </Badge>
          </div>
          <Select
            value={String(salesFunnelWindow)}
            onValueChange={(v) => setSalesFunnelWindow(Number(v) as 7 | 14 | 30)}
          >
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {!salesFunnel ? (
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        ) : (
          (() => {
            // Use Outreach as the funnel-top denominator. ÷0 guard via ||1.
            const top = salesFunnel.outreach || 1;
            type Step = {
              label: string;
              count: number;
              colorClass: string;
              hint: string;
            };
            const steps: Step[] = [
              { label: 'Outreach',     count: salesFunnel.outreach,       colorClass: 'bg-sky-50 text-sky-700 border-sky-200',           hint: 'Distinct opps we sent an outbound message or bump to' },
              { label: 'Replies',      count: salesFunnel.replies,        colorClass: 'bg-purple-50 text-purple-700 border-purple-200',  hint: 'Distinct opps that wrote back (inbound message)' },
              { label: 'Calls Booked', count: salesFunnel.calls_booked,   colorClass: 'bg-amber-50 text-amber-700 border-amber-200',     hint: 'Meetings logged with a future date' },
              { label: 'Calls Taken',  count: salesFunnel.calls_taken,    colorClass: 'bg-orange-50 text-orange-700 border-orange-200',  hint: 'Meetings logged without a future date (= happened)' },
              { label: 'Proposals',    count: salesFunnel.proposals_sent, colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-200', hint: 'Opportunities with proposal_sent_at in window' },
            ];
            return (
              <div className="flex items-stretch gap-2">
                {steps.map((step, i) => {
                  const pct = i === 0 ? 100 : Math.round((step.count / top) * 100);
                  return (
                    <div key={step.label} className="flex items-center gap-2 flex-1 min-w-0">
                      <div
                        className={`flex-1 rounded-lg border px-3 py-2.5 text-center min-w-0 ${step.colorClass}`}
                        title={step.hint}
                      >
                        <div className="text-[10px] uppercase tracking-wider opacity-80 truncate">
                          {step.label}
                        </div>
                        <div className="text-2xl font-bold tabular-nums mt-0.5 leading-none">
                          {step.count}
                        </div>
                        {i === 0 ? (
                          <div className="text-[10px] opacity-70 mt-1">distinct opps</div>
                        ) : salesFunnel.outreach > 0 ? (
                          <div className="text-[10px] opacity-70 mt-1">{pct}% of outreach</div>
                        ) : null}
                      </div>
                      {i < steps.length - 1 && (
                        <ArrowRight className="h-4 w-4 text-gray-300 shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()
        )}
      </div>

      {/* Forecast + Metrics — separate sub-section so the manager-style
          analytics live above the operational tabs. Independent state
          (topSectionTab) keeps it from resetting when the user switches
          main tabs below. */}
      <div className="bg-white rounded-xl border border-gray-200">
        <Tabs value={topSectionTab} onValueChange={v => setTopSectionTab(v as 'forecast' | 'metrics')}>
          <div className="flex items-center justify-between px-5 pt-4 border-b border-gray-100">
            <TabsList className="bg-transparent p-0 h-auto gap-1">
              <TabsTrigger
                value="forecast"
                className="flex items-center gap-2 data-[state=active]:bg-brand-light data-[state=active]:text-brand data-[state=active]:shadow-none rounded-md px-3 py-1.5 text-sm"
              >
                <TrendingUp className="h-4 w-4" />
                Forecast
                {forecastOpps.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px]">{forecastOpps.length}</Badge>
                )}
                {forecastKpis.atRiskCount > 0 && (
                  <Badge variant="secondary" className="ml-1 bg-red-100 text-red-700 hover:bg-red-100 text-[10px]" title={`${forecastKpis.atRiskCount} at-risk`}>
                    {forecastKpis.atRiskCount} at-risk
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="metrics"
                className="flex items-center gap-2 data-[state=active]:bg-brand-light data-[state=active]:text-brand data-[state=active]:shadow-none rounded-md px-3 py-1.5 text-sm"
              >
                <BarChart3 className="h-4 w-4" />
                Metrics
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="forecast" className="mt-0 p-5 pt-4">
            {renderForecastTab()}
          </TabsContent>
          <TabsContent value="metrics" className="mt-0 p-5 pt-4">
            {renderMetricsTab()}
          </TabsContent>
        </Tabs>
      </div>

      {/* Attention Cards — urgency items for managers (clickable, always unfiltered) */}
      <div className="grid grid-cols-5 gap-3">
        {/* Booking Needed */}
        <Card
          className={`border-l-4 cursor-pointer transition-all hover:shadow-md ${alertCardFilter === 'booking_needed' ? 'ring-2 ring-red-400 shadow-md' : ''} ${alertMetrics.bamfamViolations > 0 ? 'border-l-red-500 bg-red-50' : 'border-l-gray-200 bg-white'}`}
          onClick={() => {
            if (alertCardFilter === 'booking_needed') { setAlertCardFilter('none'); return; }
            setAlertCardFilter('booking_needed'); setActiveTab('actions'); setActionFilter('all'); setActionPhaseFilter('all');
          }}
        >
          <CardContent className="pt-3 pb-3 px-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Calendar className={`h-3.5 w-3.5 ${alertMetrics.bamfamViolations > 0 ? 'text-red-500' : 'text-gray-400'}`} />
              <p className={`text-[11px] font-semibold uppercase tracking-wider ${alertMetrics.bamfamViolations > 0 ? 'text-red-500' : 'text-gray-400'}`}>Booking Needed</p>
            </div>
            <p className={`text-2xl font-bold leading-none ${alertMetrics.bamfamViolations > 0 ? 'text-red-700' : 'text-gray-900'}`}>{alertMetrics.bamfamViolations}</p>
            <p className="text-[11px] text-gray-400 mt-1">No future meeting set</p>
          </CardContent>
        </Card>

        {/* Overdue */}
        <Card
          className={`border-l-4 cursor-pointer transition-all hover:shadow-md ${alertCardFilter === 'overdue' ? 'ring-2 ring-orange-400 shadow-md' : ''} ${alertMetrics.overdueFollowups > 0 ? 'border-l-orange-500 bg-orange-50' : 'border-l-gray-200 bg-white'}`}
          onClick={() => {
            if (alertCardFilter === 'overdue') { setAlertCardFilter('none'); return; }
            setAlertCardFilter('overdue'); setActiveTab('actions'); setActionFilter('all'); setActionPhaseFilter('all');
          }}
        >
          <CardContent className="pt-3 pb-3 px-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className={`h-3.5 w-3.5 ${alertMetrics.overdueFollowups > 0 ? 'text-orange-500' : 'text-gray-400'}`} />
              <p className={`text-[11px] font-semibold uppercase tracking-wider ${alertMetrics.overdueFollowups > 0 ? 'text-orange-500' : 'text-gray-400'}`}>Overdue</p>
            </div>
            <p className={`text-2xl font-bold leading-none ${alertMetrics.overdueFollowups > 0 ? 'text-orange-700' : 'text-gray-900'}`}>{alertMetrics.overdueFollowups}</p>
            <p className="text-[11px] text-gray-400 mt-1">Past meeting date</p>
          </CardContent>
        </Card>

        {/* Stale */}
        <Card
          className={`border-l-4 cursor-pointer transition-all hover:shadow-md ${alertCardFilter === 'stale' ? 'ring-2 ring-amber-400 shadow-md' : ''} ${alertMetrics.staleDeals > 0 ? 'border-l-amber-500 bg-amber-50' : 'border-l-gray-200 bg-white'}`}
          onClick={() => {
            if (alertCardFilter === 'stale') { setAlertCardFilter('none'); return; }
            setAlertCardFilter('stale'); setActiveTab('actions'); setActionFilter('all'); setActionPhaseFilter('all');
          }}
        >
          <CardContent className="pt-3 pb-3 px-4">
            <div className="flex items-center gap-1.5 mb-1">
              <RotateCcw className={`h-3.5 w-3.5 ${alertMetrics.staleDeals > 0 ? 'text-amber-500' : 'text-gray-400'}`} />
              <p className={`text-[11px] font-semibold uppercase tracking-wider ${alertMetrics.staleDeals > 0 ? 'text-amber-600' : 'text-gray-400'}`}>Stale (7d+)</p>
            </div>
            <p className={`text-2xl font-bold leading-none ${alertMetrics.staleDeals > 0 ? 'text-amber-700' : 'text-gray-900'}`}>{alertMetrics.staleDeals}</p>
            <p className="text-[11px] text-gray-400 mt-1">No contact in 7+ days</p>
          </CardContent>
        </Card>

        {/* At Risk */}
        <Card
          className={`border-l-4 cursor-pointer transition-all hover:shadow-md ${alertCardFilter === 'at_risk' ? 'ring-2 ring-rose-400 shadow-md' : ''} ${alertMetrics.dealsAtRisk > 0 ? 'border-l-rose-500 bg-rose-50' : 'border-l-gray-200 bg-white'}`}
          onClick={() => {
            if (alertCardFilter === 'at_risk') { setAlertCardFilter('none'); return; }
            setAlertCardFilter('at_risk'); setActiveTab('actions'); setActionFilter('all'); setActionPhaseFilter('all');
          }}
        >
          <CardContent className="pt-3 pb-3 px-4">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className={`h-3.5 w-3.5 ${alertMetrics.dealsAtRisk > 0 ? 'text-rose-500' : 'text-gray-400'}`} />
              <p className={`text-[11px] font-semibold uppercase tracking-wider ${alertMetrics.dealsAtRisk > 0 ? 'text-rose-500' : 'text-gray-400'}`}>At Risk</p>
            </div>
            <p className={`text-2xl font-bold leading-none ${alertMetrics.dealsAtRisk > 0 ? 'text-rose-700' : 'text-gray-900'}`}>{alertMetrics.dealsAtRisk}</p>
            <p className="text-[11px] text-gray-400 mt-1">Closing deals, temp &lt; 40</p>
          </CardContent>
        </Card>

        {/* Meetings */}
        <Card
          className={`border-l-4 cursor-pointer transition-all hover:shadow-md ${alertCardFilter === 'meetings' ? 'ring-2 ring-blue-400 shadow-md' : ''} ${alertMetrics.meetingsToday > 0 ? 'border-l-blue-500 bg-blue-50' : 'border-l-gray-200 bg-white'}`}
          onClick={() => {
            if (alertCardFilter === 'meetings') { setAlertCardFilter('none'); return; }
            setAlertCardFilter('meetings'); setActiveTab('actions'); setActionFilter('all'); setActionPhaseFilter('all');
          }}
        >
          <CardContent className="pt-3 pb-3 px-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Calendar className={`h-3.5 w-3.5 ${alertMetrics.meetingsToday > 0 ? 'text-blue-500' : 'text-gray-400'}`} />
              <p className={`text-[11px] font-semibold uppercase tracking-wider ${alertMetrics.meetingsToday > 0 ? 'text-blue-500' : 'text-gray-400'}`}>Meetings</p>
            </div>
            <div className="flex items-baseline gap-1.5">
              <p className={`text-2xl font-bold leading-none ${alertMetrics.meetingsToday > 0 ? 'text-blue-700' : 'text-gray-900'}`}>
                {alertMetrics.meetingsToday > 0 ? alertMetrics.meetingsToday : alertMetrics.meetingsThisWeek}
              </p>
              {alertMetrics.meetingsToday > 0 && alertMetrics.meetingsThisWeek > alertMetrics.meetingsToday && (
                <p className="text-xs text-blue-400">+{alertMetrics.meetingsThisWeek - alertMetrics.meetingsToday} wk</p>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">{alertMetrics.meetingsToday > 0 ? 'Today' : 'This week'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Sales Dashboard */}
      <Card className="border-gray-200">
        <div
          className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => setShowDashboard(!showDashboard)}
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-brand" />
            <span className="text-sm font-semibold text-gray-900">Sales Dashboard</span>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-gray-500 hover:text-brand gap-1"
                    disabled={isRecalculating}
                    onClick={(e) => { e.stopPropagation(); handleRecalculateAll(); }}
                  >
                    <RotateCcw className={`h-3 w-3 ${isRecalculating ? 'animate-spin' : ''}`} />
                    {isRecalculating ? 'Recalculating...' : 'Recalc Scores'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start" className="max-w-xs text-xs space-y-1 p-3">
                  <p className="font-semibold">Auto-calculates temperature (0–100)</p>
                  <p>• Base: Bucket A=40, B=25, C=10, none=20</p>
                  <p>• Recency: +30 minus days since last contact</p>
                  <p>• Engagement: +4 per activity (max +20)</p>
                  <p>• Meeting booked: +15</p>
                  <p>• Stage: warm +5, booked/tg_intro +10, discovery+ +15</p>
                  <p>• Warm interested: +10</p>
                  <p>• Stale cold DM (&gt;30d): −15</p>
                  <p>• Bump exhaustion (3+): −10</p>
                  <p>• Warm silent: −5</p>
                  <p>• Orbit → 5, Closed Lost → 0</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {showDashboard ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
        {/* Time Period Filter */}
        {showDashboard && <div className="flex items-center gap-2 flex-wrap px-5 pb-2" onClick={e => e.stopPropagation()}>
          <span className="text-xs font-medium text-gray-500 mr-1">Period:</span>
          {([
            { key: 'all', label: 'All Time' },
            { key: 'today', label: 'Today' },
            { key: '7d', label: '7 Days' },
            { key: '30d', label: '30 Days' },
            { key: 'custom', label: 'Custom' },
          ] as const).map(opt => (
            <button
              key={opt.key}
              onClick={() => setDashboardPeriod(opt.key)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                dashboardPeriod === opt.key
                  ? 'bg-brand text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
          {dashboardPeriod === 'custom' && (
            <div className="flex items-center gap-1.5 ml-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-7 px-2.5 text-xs justify-start font-normal gap-1.5"
                    style={{ borderColor: '#e5e7eb', backgroundColor: 'white', color: dashboardCustomFrom ? '#111827' : '#9ca3af' }}
                  >
                    <Calendar className="h-3 w-3" />
                    {dashboardCustomFrom ? format(new Date(dashboardCustomFrom + 'T00:00:00'), 'MMM d, yyyy') : 'From'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={dashboardCustomFrom ? new Date(dashboardCustomFrom + 'T00:00:00') : undefined}
                    onSelect={date => setDashboardCustomFrom(date ? format(date, 'yyyy-MM-dd') : '')}
                    initialFocus
                    classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                    modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                  />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-gray-400">to</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-7 px-2.5 text-xs justify-start font-normal gap-1.5"
                    style={{ borderColor: '#e5e7eb', backgroundColor: 'white', color: dashboardCustomTo ? '#111827' : '#9ca3af' }}
                  >
                    <Calendar className="h-3 w-3" />
                    {dashboardCustomTo ? format(new Date(dashboardCustomTo + 'T00:00:00'), 'MMM d, yyyy') : 'To'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={dashboardCustomTo ? new Date(dashboardCustomTo + 'T00:00:00') : undefined}
                    onSelect={date => setDashboardCustomTo(date ? format(date, 'yyyy-MM-dd') : '')}
                    initialFocus
                    classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                    modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>}
        {showDashboard && (
          <CardContent className="pt-0 pb-6 px-5 space-y-6">

            {/* Row 1: Pipeline Health — headline numbers */}
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Pipeline Health</p>
              <div className="grid grid-cols-6 gap-3">
                {[
                  { label: 'Pipeline Value', value: `$${dashboardMetrics.pipelineValue >= 1000 ? `${(dashboardMetrics.pipelineValue / 1000).toFixed(1)}K` : dashboardMetrics.pipelineValue.toLocaleString()}`, accent: 'border-l-emerald-400', color: 'text-emerald-700' },
                  { label: 'Weighted', value: `$${dashboardMetrics.weightedPipeline >= 1000 ? `${(dashboardMetrics.weightedPipeline / 1000).toFixed(1)}K` : dashboardMetrics.weightedPipeline.toFixed(0)}`, accent: 'border-l-teal-400', color: 'text-teal-700' },
                  { label: 'Active Deals', value: `${dashboardMetrics.activeDeals}`, accent: 'border-l-blue-400', color: 'text-blue-700' },
                  { label: 'Revenue (Won)', value: `$${dashboardMetrics.totalRevenue >= 1000 ? `${(dashboardMetrics.totalRevenue / 1000).toFixed(1)}K` : dashboardMetrics.totalRevenue.toLocaleString()}`, accent: 'border-l-purple-400', color: 'text-purple-700' },
                  { label: 'Deals Won', value: `${dashboardMetrics.closedWon}`, accent: 'border-l-gray-300', color: 'text-gray-700' },
                  { label: 'In Orbit', value: `${dashboardMetrics.inOrbit}`, accent: 'border-l-gray-300', color: 'text-gray-700' },
                ].map(item => (
                  <div key={item.label} className={`border-l-[3px] ${item.accent} bg-white rounded-r-lg px-3 py-2.5`}>
                    <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                    <p className="text-[11px] text-gray-500">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100" />

            {/* Row 2: Conversion Funnel + Key Rates side by side */}
            <div className="grid grid-cols-2 gap-6">
              {/* Funnel */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Conversion Funnel</p>
                <div className="flex items-end gap-1.5">
                  {[
                    { label: 'DMs', value: dashboardMetrics.totalDmsSent, color: 'bg-sky-400' },
                    { label: 'Replied', value: dashboardMetrics.totalDmsSent - dashboardMetrics.coldDmCount, color: 'bg-sky-500' },
                    { label: 'Meetings', value: dashboardMetrics.meetingsBooked, color: 'bg-blue-500' },
                    { label: 'Discovery', value: dashboardMetrics.discoveryCalls, color: 'bg-indigo-500' },
                    { label: 'Proposals', value: dashboardMetrics.proposalsSent, color: 'bg-violet-500' },
                    { label: 'Won', value: dashboardMetrics.closedWon, color: 'bg-emerald-500' },
                    { label: 'Lost', value: dashboardMetrics.closedLost, color: 'bg-gray-300' },
                  ].map((step, i) => {
                    const pct = dashboardMetrics.totalDmsSent > 0 ? (step.value / dashboardMetrics.totalDmsSent) * 100 : 0;
                    return (
                      <div key={step.label} className="flex-1 text-center">
                        <p className="text-sm font-bold text-gray-800 mb-1">{step.value}</p>
                        <div className="h-20 rounded-md flex items-end justify-center overflow-hidden bg-gray-50">
                          <div className={`w-full rounded-t-sm ${step.color}`} style={{ height: `${Math.max(pct, 5)}%` }} />
                        </div>
                        <p className="text-[10px] text-gray-500 mt-1.5 leading-tight">{step.label}</p>
                        {i > 0 && i < 6 && pct > 0 && (
                          <p className="text-[9px] text-gray-400">{pct.toFixed(0)}%</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Key Rates */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Key Rates</p>
                <div className="grid grid-cols-3 gap-x-4 gap-y-3">
                  {[
                    { label: 'Response Rate', value: `${dashboardMetrics.responseRate.toFixed(1)}%` },
                    { label: 'Close Rate', value: `${dashboardMetrics.closeRate.toFixed(0)}%` },
                    { label: 'Avg Deal Size', value: `$${dashboardMetrics.avgDealSize > 0 ? (dashboardMetrics.avgDealSize >= 1000 ? `${(dashboardMetrics.avgDealSize / 1000).toFixed(1)}K` : dashboardMetrics.avgDealSize.toFixed(0)) : '0'}` },
                    { label: 'Avg Close Time', value: dashboardMetrics.avgCloseTime > 0 ? `${dashboardMetrics.avgCloseTime.toFixed(0)}d` : '—' },
                    { label: 'Qualified (A+B)', value: `${dashboardMetrics.qualifiedPct.toFixed(0)}%` },
                    { label: 'Bucket A %', value: `${dashboardMetrics.bucketAPct.toFixed(0)}%` },
                  ].map(item => (
                    <div key={item.label} className="flex items-baseline justify-between py-1.5 border-b border-gray-100 last:border-b-0">
                      <p className="text-[11px] text-gray-500">{item.label}</p>
                      <p className="text-sm font-bold text-gray-800">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100" />

            {/* Row 3: Bottleneck Analysis */}
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Bottleneck Analysis</p>

              {/* Summary callouts */}
              {(dashboardMetrics.worstConversion || dashboardMetrics.slowestStage) && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {dashboardMetrics.worstConversion && (
                    <div className="border-l-[3px] border-l-red-400 bg-red-50/60 rounded-r-lg px-3 py-2.5">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                        <p className="text-[11px] font-semibold text-red-600">Biggest Drop-off</p>
                      </div>
                      <p className="text-sm font-bold text-gray-800">
                        {STAGE_LABELS[dashboardMetrics.worstConversion.stage as SalesPipelineStage]} → {STAGE_LABELS[dashboardMetrics.worstConversion.nextStage as SalesPipelineStage]}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {dashboardMetrics.worstConversion.rate.toFixed(0)}% convert — {dashboardMetrics.worstConversion.dropoff} lost
                      </p>
                    </div>
                  )}
                  {dashboardMetrics.slowestStage && (
                    <div className="border-l-[3px] border-l-amber-400 bg-amber-50/60 rounded-r-lg px-3 py-2.5">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Clock className="h-3.5 w-3.5 text-amber-400" />
                        <p className="text-[11px] font-semibold text-amber-600">Slowest Stage</p>
                      </div>
                      <p className="text-sm font-bold text-gray-800">
                        {STAGE_LABELS[dashboardMetrics.slowestStage.stage as SalesPipelineStage]}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Avg {dashboardMetrics.slowestStage.avgDays}d — {dashboardMetrics.slowestStage.count} deals sitting here
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Stage conversion table */}
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50/80">
                      <th className="text-left py-2 px-3 font-medium text-gray-400 uppercase tracking-wider text-[10px]">Stage</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-400 uppercase tracking-wider text-[10px]">In</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-400 uppercase tracking-wider text-[10px]">Out</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-400 uppercase tracking-wider text-[10px]">Conv.</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-400 uppercase tracking-wider text-[10px]">Drop</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-400 uppercase tracking-wider text-[10px]">Avg Days</th>
                      <th className="py-2 px-3 w-[100px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardMetrics.stageConversions.map((conv, i) => {
                      const timeData = dashboardMetrics.avgDaysInStage[i];
                      const isWorst = dashboardMetrics.worstConversion?.stage === conv.stage;
                      const isSlowest = dashboardMetrics.slowestStage?.stage === conv.stage;
                      const barWidth = Math.max(conv.rate, 3);
                      const barColor = conv.rate >= 60 ? 'bg-emerald-400' : conv.rate >= 30 ? 'bg-amber-400' : 'bg-red-400';
                      return (
                        <tr key={conv.stage} className={`border-t border-gray-100 ${isWorst ? 'bg-red-50/40' : isSlowest ? 'bg-amber-50/30' : ''}`}>
                          <td className="py-1.5 px-3 font-medium text-gray-700">
                            <div className="flex items-center gap-1.5">
                              {STAGE_LABELS[conv.stage as SalesPipelineStage]}
                              {isWorst && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400" />}
                              {isSlowest && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />}
                            </div>
                          </td>
                          <td className="py-1.5 px-3 text-center text-gray-500">{conv.from}</td>
                          <td className="py-1.5 px-3 text-center text-gray-500">{conv.to}</td>
                          <td className="py-1.5 px-3 text-center">
                            <span className={`font-semibold ${conv.rate >= 60 ? 'text-emerald-600' : conv.rate >= 30 ? 'text-amber-600' : 'text-red-500'}`}>
                              {conv.from > 0 ? `${conv.rate.toFixed(0)}%` : '—'}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 text-center">
                            {conv.dropoff > 0 ? (
                              <span className="text-red-400 font-medium">-{conv.dropoff}</span>
                            ) : (
                              <span className="text-gray-300">0</span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-center">
                            {timeData.count > 0 ? (
                              <span className={`font-medium ${timeData.avgDays >= 14 ? 'text-red-500' : timeData.avgDays >= 7 ? 'text-amber-500' : 'text-gray-500'}`}>
                                {timeData.avgDays}d
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="py-1.5 px-3">
                            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barWidth}%` }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100" />

            {/* Row 4: Bucket Breakdown */}
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Bucket Breakdown</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Bucket A', sub: 'High-value, high-intent', value: metrics.bucketA, accent: 'border-l-emerald-400', color: 'text-emerald-700' },
                  { label: 'Bucket B', sub: 'Standard follow-up', value: metrics.bucketB, accent: 'border-l-amber-400', color: 'text-amber-700' },
                  { label: 'Bucket C', sub: 'Lower priority', value: metrics.bucketC, accent: 'border-l-gray-300', color: 'text-gray-600' },
                ].map(item => (
                  <div key={item.label} className={`border-l-[3px] ${item.accent} bg-white rounded-r-lg px-3 py-2.5 flex items-center justify-between`}>
                    <div>
                      <p className="text-xs font-medium text-gray-700">{item.label}</p>
                      <p className="text-[10px] text-gray-400">{item.sub}</p>
                    </div>
                    <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Tabs + Controls */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'actions' | 'outreach' | 'pipeline' | 'orbit' | 'overview' | 'templates' | 'discovery')}>
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <TabsList>
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4" />
              Overall
              <Badge variant="secondary" className="ml-1">
                {opportunities.filter(o => !['v2_closed_won', 'v2_closed_lost'].includes(o.stage)).length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="actions" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Actions
              {allActionItems.length > 0 && (
                <Badge variant="secondary" className="ml-1">{allActionItems.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="outreach" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Outreach
              {outreachAllTotal > 0 && (
                <Badge variant="secondary" className="ml-1">{outreachAllTotal}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="pipeline" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Pipeline
              {(() => {
                const pipelineCount = opportunities.filter(o =>
                  PIPELINE_STAGES.includes(o.stage as SalesPipelineStage) && o.stage !== 'cold_dm'
                ).length;
                return pipelineCount > 0 ? <Badge variant="secondary" className="ml-1">{pipelineCount}</Badge> : null;
              })()}
            </TabsTrigger>
            <TabsTrigger value="orbit" className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              Orbit
              {orbitOpps.length > 0 && (
                <Badge variant="secondary" className="ml-1">{allOrbitOpps.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="discovery" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Discovery
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Templates
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-3">
            {/* Path filter */}
            {activeTab === 'pipeline' && (
              <Select value={pathFilter} onValueChange={v => setPathFilter(v as 'all' | 'closer' | 'sdr')}>
                <SelectTrigger className="h-9 w-40 text-sm focus-brand">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Paths</SelectItem>
                  <SelectItem value="closer">Path A (Closer)</SelectItem>
                  <SelectItem value="sdr">Path B (SDR)</SelectItem>
                </SelectContent>
              </Select>
            )}

            {/* View toggle */}
            {activeTab === 'pipeline' && (
              <div className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
                <div
                  onClick={() => setViewMode('table')}
                  className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer ${viewMode === 'table' ? 'bg-background text-foreground shadow-sm' : ''}`}
                >
                  <TableIcon className="h-4 w-4 mr-2" />
                  Table
                </div>
                <div
                  onClick={() => setViewMode('kanban')}
                  className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer ${viewMode === 'kanban' ? 'bg-background text-foreground shadow-sm' : ''}`}
                >
                  <LayoutGrid className="h-4 w-4 mr-2" />
                  Kanban
                </div>
              </div>
            )}
          </div>
        </div>

        <TabsContent value="actions" className="mt-0">
          {renderActionsTab()}
        </TabsContent>

        <TabsContent value="outreach" className="mt-0">
          {renderOutreachTab()}
        </TabsContent>

        <TabsContent value="pipeline" className="mt-0">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search pipeline..."
              defaultValue={pipelineSearch}
              onChange={e => {
                const v = e.target.value;
                if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                searchDebounceRef.current = setTimeout(() => setPipelineSearch(v), 300);
              }}
              className="pl-9 h-9 text-sm focus-brand max-w-xs"
            />
          </div>
          {viewMode === 'kanban' ? renderKanban() : renderTable()}
        </TabsContent>

        <TabsContent value="orbit" className="mt-0">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search orbit..."
              defaultValue={orbitSearch}
              onChange={e => {
                const v = e.target.value;
                if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                searchDebounceRef.current = setTimeout(() => setOrbitSearch(v), 300);
              }}
              className="pl-9 h-9 text-sm focus-brand max-w-xs"
            />
          </div>
          {renderOrbitTab()}
        </TabsContent>

        <TabsContent value="overview" className="mt-0">
          <div className="space-y-4 pb-8">
            {/* Unified-search header removed 2026-05-13. The page was
                rendering two stacked search bars when an Overall section
                was expanded — one global broadcaster here and one per-
                section search inside renderOutreachTab / renderTable /
                renderOrbitTab. Per-section search is the more useful
                default (each panel filters independently), so we hide
                this top bar. The overallSearch state + broadcast
                useEffect are intentionally left in place so individual
                section searches still drive their own filters without
                a state-shape change; if we want the global search back
                later, just un-hide this block. */}

            {/* Outreach Section */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setOverviewSections(prev => ({ ...prev, outreach: !prev.outreach }))}
                className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 hover:bg-blue-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-blue-700" />
                  <h4 className="font-semibold text-blue-700">Outreach</h4>
                  <Badge variant="secondary" className="text-xs font-medium">{outreachAllTotal}</Badge>
                </div>
                {overviewSections.outreach ? <ChevronUp className="h-4 w-4 text-blue-500" /> : <ChevronDown className="h-4 w-4 text-blue-500" />}
              </button>
              {overviewSections.outreach && (
                <div className="border-t border-gray-200">
                  {renderOutreachTab()}
                </div>
              )}
            </div>

            {/* Pipeline Section */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setOverviewSections(prev => ({ ...prev, pipeline: !prev.pipeline }))}
                className="w-full flex items-center justify-between px-4 py-3 bg-emerald-50 hover:bg-emerald-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-emerald-700" />
                  <h4 className="font-semibold text-emerald-700">Pipeline</h4>
                  <Badge variant="secondary" className="text-xs font-medium">
                    {opportunities.filter(o => PIPELINE_STAGES.includes(o.stage as SalesPipelineStage) && o.stage !== 'cold_dm').length}
                  </Badge>
                </div>
                {overviewSections.pipeline ? <ChevronUp className="h-4 w-4 text-emerald-500" /> : <ChevronDown className="h-4 w-4 text-emerald-500" />}
              </button>
              {overviewSections.pipeline && (
                <div className="border-t border-gray-200">
                  {renderTable()}
                </div>
              )}
            </div>

            {/* Orbit Section */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setOverviewSections(prev => ({ ...prev, orbit: !prev.orbit }))}
                className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 hover:bg-amber-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-amber-700" />
                  <h4 className="font-semibold text-amber-700">Orbit</h4>
                  <Badge variant="secondary" className="text-xs font-medium">{allOrbitOpps.length}</Badge>
                </div>
                {overviewSections.orbit ? <ChevronUp className="h-4 w-4 text-amber-500" /> : <ChevronDown className="h-4 w-4 text-amber-500" />}
              </button>
              {overviewSections.orbit && (
                <div className="border-t border-gray-200">
                  {renderOrbitTab()}
                </div>
              )}
            </div>

            {/* Nurture Section — without this, nurture-stage opportunities
                are invisible everywhere except 2 of the Actions sub-tabs.
                This gives them a dedicated spot on Overview alongside Orbit
                so a deal set to nurture doesn't silently drop out of view. */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setOverviewSections(prev => ({ ...prev, nurture: !prev.nurture }))}
                className="w-full flex items-center justify-between px-4 py-3 bg-lime-50 hover:bg-lime-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-lime-700" />
                  <h4 className="font-semibold text-lime-700">Nurture</h4>
                  <Badge variant="secondary" className="text-xs font-medium">{allNurtureOpps.length}</Badge>
                  <span className="text-[11px] text-lime-600 ml-1">Long-cycle deals — periodic check-ins</span>
                </div>
                {overviewSections.nurture ? <ChevronUp className="h-4 w-4 text-lime-500" /> : <ChevronDown className="h-4 w-4 text-lime-500" />}
              </button>
              {overviewSections.nurture && (
                <div className="border-t border-gray-200">
                  {allNurtureOpps.length === 0 ? (
                    <div className="text-center text-sm text-gray-400 py-8">
                      No opportunities in nurture stage.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50/50">
                          <TableHead>Name</TableHead>
                          <TableHead className="w-[180px]">POC</TableHead>
                          <TableHead className="w-[140px]">Last Contact</TableHead>
                          <TableHead className="w-[100px]">Owner</TableHead>
                          <TableHead className="w-[120px]">Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allNurtureOpps
                          .slice()
                          .sort((a, b) => {
                            // Most-stale first — same logic as crm_followups_due
                            // (oldest last_contacted_at OR null bubbles to top)
                            const aT = a.last_contacted_at ? new Date(a.last_contacted_at).getTime() : 0;
                            const bT = b.last_contacted_at ? new Date(b.last_contacted_at).getTime() : 0;
                            return aT - bT;
                          })
                          .map((opp) => (
                            <TableRow
                              key={opp.id}
                              className="group hover:bg-gray-50 cursor-pointer"
                              onClick={() => openSlideOver(opp)}
                            >
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-4 w-4 text-gray-400" />
                                  <span className="font-medium">{opp.name}</span>
                                  {renderProjectNameSuffix(opp.twitter_handle, () => openEditDialog(opp))}
                                </div>
                              </TableCell>
                              <TableCell>
                                {renderPocCell(opp, 'max-w-[120px]')}
                              </TableCell>
                              <TableCell>
                                <span className="text-xs text-gray-600">
                                  {opp.last_contacted_at
                                    ? formatDistanceToNow(new Date(opp.last_contacted_at), { addSuffix: true })
                                    : <span className="text-gray-300">never</span>}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span className="text-xs text-gray-600">
                                  {users.find(u => u.id === opp.owner_id)?.name || '—'}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span className="text-xs text-gray-500">
                                  {opp.created_at
                                    ? formatDistanceToNow(new Date(opp.created_at), { addSuffix: true })
                                    : '—'}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="discovery" className="mt-0">
          {/* onPromoted: a Discovery prospect was just turned into a CRM
              opportunity server-side. We need fresh opps + metrics; the
              other 4 resources (affiliates/users/templates/outreachCount)
              don't change so we skip them. */}
          <DiscoveryTab onPromoted={() => { void fetchOpportunities(); void fetchMetrics(); }} />
        </TabsContent>

        <TabsContent value="templates" className="mt-0">
          {(() => {
            const TEMPLATE_STAGES = [
              { value: 'all', label: 'All' },
              { value: 'cold_dm', label: 'Cold DM' },
              { value: 'warm', label: 'Warm' },
              { value: 'tg_intro', label: 'TG Intro' },
              { value: 'booked', label: 'Booked' },
              { value: 'discovery_done', label: 'Discovery Done' },
              { value: 'proposal_call', label: 'Proposal Call' },
              { value: 'v2_contract', label: 'Contract' },
              { value: 'bump', label: 'Bumps' },
            ];

            const allTags = Array.from(new Set(templates.flatMap(t => t.tags || [])));

            const filteredTemplates = templates.filter(t => {
              if (templateStageFilter !== 'all' && t.stage !== templateStageFilter) return false;
              if (templateTagFilter !== 'all' && !(t.tags || []).includes(templateTagFilter)) return false;
              return true;
            });

            const getSubTypeLabel = (subType: string) => {
              const labels: Record<string, string> = {
                general: 'General',
                initial: 'Initial',
                bump_1: 'Bump 1',
                bump_2: 'Bump 2',
                bump_3: 'Bump 3',
                follow_up: 'Follow-up',
              };
              return labels[subType] || subType;
            };

            const getStageLabelForTemplate = (stage: string) => {
              if (stage === 'bump') return 'Bump';
              return (STAGE_LABELS as Record<string, string>)[stage] || stage;
            };

            const getStageColorForTemplate = (stage: string) => {
              if (stage === 'bump') return { bg: 'bg-pink-50', text: 'text-pink-700' };
              const colors = (STAGE_COLORS as Record<string, { bg: string; text: string }>)[stage];
              return colors || { bg: 'bg-gray-50', text: 'text-gray-700' };
            };

            const handleCopy = async (content: string) => {
              await navigator.clipboard.writeText(content);
            };

            const handleCreateTemplate = async () => {
              setIsTemplateSubmitting(true);
              try {
                const created = await SalesPipelineService.createTemplate(templateForm);
                setTemplates(prev => [...prev, created]);
                setIsTemplateDialogOpen(false);
                setTemplateForm({ name: '', stage: 'cold_dm', sub_type: 'general', content: '', tags: [], attachments: [] });
              } catch (err) {
                console.error('Error creating template:', err);
              } finally {
                setIsTemplateSubmitting(false);
              }
            };

            const handleUpdateTemplate = async () => {
              if (!editingTemplate) return;
              setIsTemplateSubmitting(true);
              try {
                const updated = await SalesPipelineService.updateTemplate(editingTemplate.id, templateForm);
                setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t));
                setEditingTemplate(null);
                setIsTemplateDialogOpen(false);
                setTemplateForm({ name: '', stage: 'cold_dm', sub_type: 'general', content: '', tags: [], attachments: [] });
              } catch (err) {
                console.error('Error updating template:', err);
              } finally {
                setIsTemplateSubmitting(false);
              }
            };

            const handleDeleteTemplate = async (id: string) => {
              try {
                await SalesPipelineService.deleteTemplate(id);
                setTemplates(prev => prev.filter(t => t.id !== id));
              } catch (err) {
                console.error('Error deleting template:', err);
              }
            };

            const openEditDialog = (t: SalesDmTemplate) => {
              setEditingTemplate(t);
              setTemplateForm({ name: t.name, stage: t.stage, sub_type: t.sub_type, content: t.content, variables: t.variables, tags: t.tags || [], attachments: t.attachments || [] });
              setIsTemplateDialogOpen(true);
            };

            const openCreateDialog = () => {
              setEditingTemplate(null);
              setTemplateForm({ name: '', stage: 'cold_dm', sub_type: 'general', content: '', tags: [], attachments: [] });
              setIsTemplateDialogOpen(true);
            };

            const getSubTypeOptions = (stage: string) => {
              if (stage === 'bump') return ['bump_1', 'bump_2', 'bump_3'];
              return ['general', 'initial', 'follow_up'];
            };

            return (
              <div className="space-y-4">
                {/* Stage filter pills + New button */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    {TEMPLATE_STAGES.map(s => (
                      <button
                        key={s.value}
                        onClick={() => setTemplateStageFilter(s.value)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                          templateStageFilter === s.value
                            ? 'bg-brand text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <Button size="sm" onClick={openCreateDialog} style={{ backgroundColor: '#3e8692' }} className="text-white hover:opacity-90">
                    <Plus className="h-4 w-4 mr-1" />
                    New Template
                  </Button>
                </div>

                {/* Tag filter pills */}
                {allTags.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500 font-medium">Tags:</span>
                    <button
                      onClick={() => setTemplateTagFilter('all')}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        templateTagFilter === 'all'
                          ? 'bg-brand text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      All
                    </button>
                    {allTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => setTemplateTagFilter(tag)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          templateTagFilter === tag
                            ? 'bg-brand text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}

                {/* Template cards grid */}
                {filteredTemplates.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No templates found{templateStageFilter !== 'all' ? ' for this stage' : ''}.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredTemplates.map(t => {
                      const stageColor = getStageColorForTemplate(t.stage);
                      return (
                        <Card key={t.id} className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow" onClick={() => setPreviewTemplate(t)}>
                          <CardContent className="p-4 space-y-3">
                            <div className="flex items-start justify-between">
                              <h4 className="font-semibold text-sm text-gray-900 line-clamp-1">{t.name}</h4>
                              <div className="flex items-center gap-1 ml-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => setPreviewTemplate(t)}
                                  title="Preview"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => handleCopy(t.content)}
                                  title="Copy to clipboard"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => openEditDialog(t)}
                                  title="Edit"
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                                  onClick={() => handleDeleteTemplate(t.id)}
                                  title="Delete"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className={`${stageColor.bg} ${stageColor.text} text-xs border-0`}>
                                {getStageLabelForTemplate(t.stage)}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {getSubTypeLabel(t.sub_type)}
                              </Badge>
                              {(t.tags || []).map(tag => (
                                <Badge key={tag} className="text-[10px] bg-teal-50 text-teal-700 border-0">
                                  {tag}
                                </Badge>
                              ))}
                              {(t.attachments || []).length > 0 && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
                                  <Image className="h-3 w-3" />
                                  {t.attachments.length}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 line-clamp-4 whitespace-pre-wrap">{t.content}</p>
                            {t.variables && t.variables.length > 0 && (
                              <div className="flex items-center gap-1 flex-wrap">
                                {t.variables.map(v => (
                                  <span key={v} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-mono">
                                    [{v}]
                                  </span>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}

                {/* Create/Edit Template Dialog */}
                <Dialog open={isTemplateDialogOpen} onOpenChange={(open) => {
                  setIsTemplateDialogOpen(open);
                  if (!open) { setEditingTemplate(null); setTemplateForm({ name: '', stage: 'cold_dm', sub_type: 'general', content: '', tags: [], attachments: [] }); }
                }}>
                  <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>{editingTemplate ? 'Edit Template' : 'New Template'}</DialogTitle>
                      <DialogDescription>
                        {editingTemplate ? 'Update this sales DM template.' : 'Create a new stage-specific DM template.'}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Name</Label>
                        <Input
                          value={templateForm.name}
                          onChange={e => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="e.g., Cold DM — Initial Outreach"
                          className="focus-brand"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Stage</Label>
                          <Select
                            value={templateForm.stage}
                            onValueChange={v => setTemplateForm(prev => ({
                              ...prev,
                              stage: v,
                              sub_type: v === 'bump' ? 'bump_1' : 'general',
                            }))}
                          >
                            <SelectTrigger className="focus-brand"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cold_dm">Cold DM</SelectItem>
                              <SelectItem value="warm">Warm</SelectItem>
                              <SelectItem value="tg_intro">TG Intro</SelectItem>
                              <SelectItem value="booked">Booked</SelectItem>
                              <SelectItem value="discovery_done">Discovery Done</SelectItem>
                              <SelectItem value="proposal_call">Proposal Call</SelectItem>
                              <SelectItem value="v2_contract">Contract</SelectItem>
                              <SelectItem value="bump">Bump</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Sub-type</Label>
                          <Select
                            value={templateForm.sub_type || 'general'}
                            onValueChange={v => setTemplateForm(prev => ({ ...prev, sub_type: v }))}
                          >
                            <SelectTrigger className="focus-brand"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {getSubTypeOptions(templateForm.stage).map(opt => (
                                <SelectItem key={opt} value={opt}>{getSubTypeLabel(opt)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label>Tags</Label>
                        <div className="space-y-2">
                          {(templateForm.tags || []).length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {(templateForm.tags || []).map(tag => (
                                <Badge key={tag} className="text-xs bg-teal-50 text-teal-700 border-0 gap-1">
                                  {tag}
                                  <button
                                    type="button"
                                    onClick={() => setTemplateForm(prev => ({ ...prev, tags: (prev.tags || []).filter(t => t !== tag) }))}
                                    className="hover:text-red-500"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          )}
                          <Input
                            placeholder="Type a tag and press Enter (e.g., Token Launch, DeFi)"
                            className="focus-brand"
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const val = (e.target as HTMLInputElement).value.trim();
                                if (val && !(templateForm.tags || []).includes(val)) {
                                  setTemplateForm(prev => ({ ...prev, tags: [...(prev.tags || []), val] }));
                                  (e.target as HTMLInputElement).value = '';
                                }
                              }
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Content</Label>
                        <Textarea
                          value={templateForm.content}
                          onChange={e => setTemplateForm(prev => ({ ...prev, content: e.target.value }))}
                          placeholder="Write your template here... Use [KOL_NAME], [PROJECT_NAME], etc. as placeholders."
                          rows={6}
                          className="focus-brand"
                        />
                      </div>
                      <div>
                        <Label>Attachments</Label>
                        <div className="space-y-2">
                          {(templateForm.attachments || []).length > 0 && (
                            <div className="flex items-center gap-2 flex-wrap">
                              {(templateForm.attachments || []).map((att, idx) => (
                                <div key={idx} className="relative group">
                                  <img src={att.url} alt={att.name} className="h-16 w-16 object-cover rounded border" />
                                  <button
                                    type="button"
                                    onClick={() => setTemplateForm(prev => ({ ...prev, attachments: (prev.attachments || []).filter((_, i) => i !== idx) }))}
                                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                  <p className="text-[9px] text-gray-500 truncate w-16 text-center mt-0.5">{att.name}</p>
                                </div>
                              ))}
                            </div>
                          )}
                          <Input
                            type="file"
                            accept="image/*"
                            className="focus-brand"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              try {
                                const fileExt = file.name.split('.').pop();
                                const filePath = `templates/${Date.now()}.${fileExt}`;
                                const { error: uploadError } = await supabase.storage
                                  .from('crm-attachments')
                                  .upload(filePath, file, { cacheControl: '3600', upsert: false });
                                if (uploadError) throw uploadError;
                                const { data: { publicUrl } } = supabase.storage.from('crm-attachments').getPublicUrl(filePath);
                                setTemplateForm(prev => ({
                                  ...prev,
                                  attachments: [...(prev.attachments || []), { url: publicUrl, name: file.name }],
                                }));
                              } catch (err) {
                                console.error('Error uploading attachment:', err);
                              }
                              e.target.value = '';
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsTemplateDialogOpen(false)}>Cancel</Button>
                      <Button
                        onClick={editingTemplate ? handleUpdateTemplate : handleCreateTemplate}
                        disabled={isTemplateSubmitting || !templateForm.name || !templateForm.content}
                        style={{ backgroundColor: '#3e8692' }}
                        className="text-white hover:opacity-90"
                      >
                        {isTemplateSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {editingTemplate ? 'Save Changes' : 'Create Template'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Preview Template Dialog */}
                <Dialog open={!!previewTemplate} onOpenChange={(open) => { if (!open) setPreviewTemplate(null); }}>
                  <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
                    <DialogHeader>
                      <DialogTitle>{previewTemplate?.name}</DialogTitle>
                      <DialogDescription>Template preview</DialogDescription>
                    </DialogHeader>
                    {previewTemplate && (
                      <div className="space-y-4 overflow-y-auto flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={`${getStageColorForTemplate(previewTemplate.stage).bg} ${getStageColorForTemplate(previewTemplate.stage).text} text-xs border-0`}>
                            {getStageLabelForTemplate(previewTemplate.stage)}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {getSubTypeLabel(previewTemplate.sub_type)}
                          </Badge>
                          {(previewTemplate.tags || []).map(tag => (
                            <Badge key={tag} className="text-[10px] bg-teal-50 text-teal-700 border-0">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap">
                          {previewTemplate.content}
                        </div>
                        {previewTemplate.variables && previewTemplate.variables.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs text-gray-500 font-medium">Variables:</span>
                            {previewTemplate.variables.map(v => (
                              <span key={v} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-mono">
                                [{v}]
                              </span>
                            ))}
                          </div>
                        )}
                        {(previewTemplate.attachments || []).length > 0 && (
                          <div className="space-y-2">
                            <span className="text-xs text-gray-500 font-medium">Attachments:</span>
                            <div className="grid grid-cols-2 gap-2">
                              {previewTemplate.attachments.map((att, idx) => (
                                <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer" className="block">
                                  <img src={att.url} alt={att.name} className="w-full rounded border hover:opacity-90 transition-opacity" />
                                  <p className="text-[10px] text-gray-500 mt-1 truncate">{att.name}</p>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (previewTemplate) {
                            navigator.clipboard.writeText(previewTemplate.content);
                            toast({ title: 'Copied to clipboard' });
                          }
                        }}
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </Button>
                      <Button variant="outline" onClick={() => setPreviewTemplate(null)}>Close</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            );
          })()}
        </TabsContent>

      </Tabs>

      {/* Dialogs */}
      {renderFormDialog()}
      {renderOrbitPrompt()}
      {renderClosedLostPrompt()}
      {renderClosedWonPrompt()}
      {renderTgHandlePrompt()}
      {renderBucketPrompt()}
      {renderActivityLogPrompt()}

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
              className="bg-red-600 hover:bg-red-700 text-white"
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
  );
}
