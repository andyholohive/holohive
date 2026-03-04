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
  Plus, Minus, Search, Trash2, X, LayoutGrid, TableIcon, GripVertical, Loader2,
  Target, AlertTriangle, ArrowRight, MoreHorizontal, ChevronDown, ChevronRight, ChevronLeft, ChevronUp,
  Phone, MessageSquare, Calendar, FileText, StickyNote, Zap, RotateCcw, Clock, Edit, Copy, Check, ChevronsUpDown,
  Building2, TrendingUp, DollarSign, Users, Hash, BarChart3, Activity, Send, ArrowUpDown
} from 'lucide-react';
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
import { formatDistanceToNow, format } from 'date-fns';

// ============================================
// DnD Components
// ============================================

function DroppableColumn({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${className} ${isOver ? 'ring-2 ring-blue-400 ring-offset-2' : ''}`}>
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

  // Data state
  const [loading, setLoading] = useState(true);
  const [opportunities, setOpportunities] = useState<SalesPipelineOpportunity[]>([]);
  const [affiliates, setAffiliates] = useState<CRMAffiliate[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [metrics, setMetrics] = useState({ totalCount: 0, bucketA: 0, bucketB: 0, bucketC: 0, activeValue: 0, bamfamViolations: 0 });

  // UI state
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'actions' | 'outreach' | 'pipeline' | 'orbit' | 'overview' | 'templates'>('actions');
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('table');
  const [pathFilter, setPathFilter] = useState<'all' | 'closer' | 'sdr'>('all');

  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeOpportunity, setActiveOpportunity] = useState<SalesPipelineOpportunity | null>(null);

  // Dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingOpp, setEditingOpp] = useState<SalesPipelineOpportunity | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<CreateSalesPipelineOpportunityData & { next_meeting_at?: string; next_meeting_type?: string }>({ name: '' });

  // Activity slide-over
  const [slideOverMode, setSlideOverMode] = useState<'view' | 'edit'>('view');
  const [slideOverOpp, setSlideOverOpp] = useState<SalesPipelineOpportunity | null>(null);
  const [activities, setActivities] = useState<CRMActivity[]>([]);
  const [activityForm, setActivityForm] = useState<CreateActivityData>({ opportunity_id: '', type: 'note', title: '' });
  const [activityMeetingDate, setActivityMeetingDate] = useState<string | undefined>(undefined);
  const [activityMeetingTime, setActivityMeetingTime] = useState<string | undefined>(undefined);
  const [isActivitySubmitting, setIsActivitySubmitting] = useState(false);

  // Bump loading
  const [isBumping, setIsBumping] = useState(false);

  // Orbit/Closed Lost reason prompts
  const [orbitPrompt, setOrbitPrompt] = useState<{ oppId: string; oppName: string; fromStage: string } | null>(null);
  const [orbitReasonValue, setOrbitReasonValue] = useState<OrbitReason>('no_response');
  const [closedLostPrompt, setClosedLostPrompt] = useState<{ oppId: string; oppName: string; fromStage: string } | null>(null);
  const [closedLostReasonValue, setClosedLostReasonValue] = useState('');

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
  const [isBulkMoving, setIsBulkMoving] = useState(false);
  const outreachSearchTimeout = useRef<NodeJS.Timeout | null>(null);
  const OUTREACH_PAGE_SIZE = 50;

  // Actions tab state
  const [actionFilter, setActionFilter] = useState<'all' | 'mine' | 'urgent'>('mine');
  const [actionPhaseFilter, setActionPhaseFilter] = useState<'all' | 'outreach' | 'closing' | 'orbit' | 'non_urgent'>('all');
  const [alertCardFilter, setAlertCardFilter] = useState<'none' | 'booking_needed' | 'overdue' | 'stale' | 'at_risk' | 'meetings'>('none');
  const [actionSort, setActionSort] = useState<'priority' | 'stage' | 'temperature' | 'value' | 'name' | 'newest' | 'oldest'>(() => {
    if (typeof window !== 'undefined' && user?.id) {
      return (localStorage.getItem(`action_sort_${user.id}`) as any) || 'priority';
    }
    return 'priority';
  });
  const [executingAction, setExecutingAction] = useState<string | null>(null);
  const [actionGuidance, setActionGuidance] = useState<{ label: string; hint: string } | null>(null);

  // Overview tab collapsed state
  const [overviewSections, setOverviewSections] = useState<{ outreach: boolean; pipeline: boolean; orbit: boolean }>({ outreach: false, pipeline: false, orbit: false });

  // Templates tab state
  const [templates, setTemplates] = useState<SalesDmTemplate[]>([]);
  const [templateStageFilter, setTemplateStageFilter] = useState<string>('all');
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SalesDmTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState<CreateSalesDmTemplateData>({ name: '', stage: 'cold_dm', sub_type: 'general', content: '' });
  const [isTemplateSubmitting, setIsTemplateSubmitting] = useState(false);

  // Activity log popup (shown after action execution)
  const [activityLogPrompt, setActivityLogPrompt] = useState<{
    oppId: string;
    oppName: string;
    type: ActivityType;
    title: string;
    showMeetingPicker?: boolean;
  } | null>(null);
  const [activityLogForm, setActivityLogForm] = useState<{
    title: string;
    description: string;
    outcome: string;
    next_step: string;
    next_step_date?: string;
    meeting_date?: string;
    meeting_time?: string;
  }>({ title: '', description: '', outcome: '', next_step: '' });
  const [isActivityLogSubmitting, setIsActivityLogSubmitting] = useState(false);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  // ============================================
  // Dashboard Metrics (computed from opportunities)
  // ============================================

  const dashboardMetrics = useMemo(() => {
    const all = opportunities;
    const pipelineActive = all.filter(o => PIPELINE_STAGES.includes(o.stage as SalesPipelineStage));
    const closedWon = all.filter(o => o.stage === 'v2_closed_won');
    const closedLost = all.filter(o => o.stage === 'v2_closed_lost');
    const inOrbit = all.filter(o => o.stage === 'orbit');

    // Stages past cold_dm = responded
    const pastColdDm = all.filter(o => o.stage !== 'cold_dm');
    const coldDmCount = outreachTotal > 0 ? outreachTotal : all.filter(o => o.stage === 'cold_dm').length;
    const totalDmsSent = all.length; // every opp started as a DM
    const responseRate = totalDmsSent > 0 ? (pastColdDm.length / totalDmsSent) * 100 : 0;

    // Meetings booked = in booked or any stage after it
    const bookedAndBeyond = ['booked', 'discovery_done', 'proposal_call', 'v2_contract', 'v2_closed_won'];
    const meetingsBooked = all.filter(o => bookedAndBeyond.includes(o.stage)).length;

    // Discovery calls = in discovery_done or later
    const discoveryAndBeyond = ['discovery_done', 'proposal_call', 'v2_contract', 'v2_closed_won'];
    const discoveryCalls = all.filter(o => discoveryAndBeyond.includes(o.stage)).length;

    // Close rate = won / (won + lost)
    const totalClosed = closedWon.length + closedLost.length;
    const closeRate = totalClosed > 0 ? (closedWon.length / totalClosed) * 100 : 0;

    // Avg deal size (closed won)
    const wonValues = closedWon.map(o => o.deal_value || 0).filter(v => v > 0);
    const avgDealSize = wonValues.length > 0 ? wonValues.reduce((a, b) => a + b, 0) / wonValues.length : 0;

    // Avg close time (days from created_at to closed_at for won deals)
    const closeTimes = closedWon
      .filter(o => o.created_at && o.closed_at)
      .map(o => (new Date(o.closed_at!).getTime() - new Date(o.created_at).getTime()) / (1000 * 60 * 60 * 24));
    const avgCloseTime = closeTimes.length > 0 ? closeTimes.reduce((a, b) => a + b, 0) / closeTimes.length : 0;

    // Qualified % = bucket A + B / total
    const qualifiedCount = all.filter(o => o.bucket === 'A' || o.bucket === 'B').length;
    const qualifiedPct = all.length > 0 ? (qualifiedCount / all.length) * 100 : 0;

    // Bucket A %
    const bucketAPct = all.length > 0 ? (all.filter(o => o.bucket === 'A').length / all.length) * 100 : 0;

    // Pipeline value (active)
    const pipelineValue = pipelineActive.reduce((sum, o) => sum + (o.deal_value || 0), 0);

    // Overdue follow-ups
    const now = new Date().toISOString();
    const overdueFollowups = pipelineActive.filter(o =>
      o.next_meeting_at && o.next_meeting_at < now
    ).length;

    // Proposals sent
    const proposalsSent = all.filter(o =>
      ['proposal_call', 'v2_contract', 'v2_closed_won'].includes(o.stage)
    ).length;

    // Alert metrics for manager cards
    const nowDate = new Date();
    const todayStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
    const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const meetingsThisWeek = pipelineActive.filter(o =>
      o.next_meeting_at && new Date(o.next_meeting_at) >= todayStart && new Date(o.next_meeting_at) < weekEnd
    ).length;
    const meetingsToday = pipelineActive.filter(o =>
      o.next_meeting_at && new Date(o.next_meeting_at) >= todayStart && new Date(o.next_meeting_at) < new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
    ).length;

    // Stale deals: active pipeline deals with no contact in 7+ days
    const staleDeals = pipelineActive.filter(o => {
      const lastDate = o.last_contacted_at || o.last_bump_date || o.created_at;
      if (!lastDate) return true;
      const daysSince = Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24));
      return daysSince >= 7;
    }).length;

    // Deals at risk: closing-stage deals (post-discovery) with temp < 40
    const dealsAtRisk = all.filter(o =>
      ['discovery_done', 'proposal_call', 'v2_contract'].includes(o.stage) && o.temperature_score < 40
    ).length;

    // Total revenue (closed won value)
    const totalRevenue = closedWon.reduce((sum, o) => sum + (o.deal_value || 0), 0);

    // Weighted pipeline = sum of (deal_value * stage_probability)
    const stageProbability: Record<string, number> = {
      cold_dm: 0.05, warm: 0.1, tg_intro: 0.15, booked: 0.25,
      discovery_done: 0.4, proposal_call: 0.7, v2_contract: 0.9,
    };
    const weightedPipeline = pipelineActive.reduce((sum, o) => sum + (o.deal_value || 0) * (stageProbability[o.stage] || 0.1), 0);

    // Bottleneck analysis
    const funnelStages: SalesPipelineStage[] = ['cold_dm', 'warm', 'tg_intro', 'booked', 'discovery_done', 'proposal_call', 'v2_contract', 'v2_closed_won'];
    const stageOrder: Record<string, number> = {};
    funnelStages.forEach((s, i) => { stageOrder[s] = i; });

    // Count how many opps ever reached each stage (current stage or beyond)
    const reachedStage = funnelStages.map(stage => {
      const idx = stageOrder[stage];
      // Opps currently at this stage or later (including orbit/lost which came from somewhere)
      return all.filter(o => {
        const oIdx = stageOrder[o.stage];
        if (oIdx !== undefined) return oIdx >= idx;
        // Orbit/lost — estimate their furthest stage from timestamps
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

    // Stage conversion rates (from one stage to the next)
    const stageConversions = funnelStages.slice(0, -1).map((stage, i) => {
      const from = reachedStage[i];
      const to = reachedStage[i + 1];
      const rate = from > 0 ? (to / from) * 100 : 0;
      const dropoff = from - to;
      return { stage, nextStage: funnelStages[i + 1], from, to, rate, dropoff };
    });

    // Avg days in current stage (for active pipeline deals)
    const avgDaysInStage = funnelStages.slice(0, -1).map(stage => {
      const oppsInStage = pipelineActive.filter(o => o.stage === stage);
      if (oppsInStage.length === 0) return { stage, avgDays: 0, count: 0 };
      const totalDays = oppsInStage.reduce((sum, o) => {
        const days = Math.floor((Date.now() - new Date(o.updated_at).getTime()) / (1000 * 60 * 60 * 24));
        return sum + days;
      }, 0);
      return { stage, avgDays: Math.round(totalDays / oppsInStage.length), count: oppsInStage.length };
    });

    // Identify the biggest bottleneck: stage with lowest conversion rate (min 3 opps entering)
    const significantConversions = stageConversions.filter(c => c.from >= 3);
    const worstConversion = significantConversions.length > 0
      ? significantConversions.reduce((worst, c) => c.rate < worst.rate ? c : worst)
      : null;

    // Identify the slowest stage: where deals sit the longest
    const significantStages = avgDaysInStage.filter(s => s.count >= 2);
    const slowestStage = significantStages.length > 0
      ? significantStages.reduce((slowest, s) => s.avgDays > slowest.avgDays ? s : slowest)
      : null;

    return {
      totalDmsSent,
      responseRate,
      meetingsBooked,
      discoveryCalls,
      closeRate,
      avgDealSize,
      avgCloseTime,
      qualifiedPct,
      bucketAPct,
      pipelineValue,
      activeDeals: pipelineActive.length,
      overdueFollowups,
      bamfamViolations: metrics.bamfamViolations,
      closedWon: closedWon.length,
      closedLost: closedLost.length,
      inOrbit: inOrbit.length,
      proposalsSent,
      coldDmCount,
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
  }, [opportunities, metrics.bamfamViolations, outreachTotal]);

  // ============================================
  // Data Fetching
  // ============================================

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
  const fetchOutreach = useCallback(async () => {
    setOutreachLoading(true);
    try {
      const resolvedFilters = {
        ...outreachFilters,
        owner_id: outreachFilters.owner_id === 'mine' ? (user?.id || undefined) : outreachFilters.owner_id,
      };
      const [result, allResult] = await Promise.all([
        SalesPipelineService.getColdDmsPaginated(outreachPage, OUTREACH_PAGE_SIZE, resolvedFilters),
        SalesPipelineService.getColdDmsPaginated(1, 1, {}),
      ]);
      setOutreachOpps(result.data);
      setOutreachTotal(result.count);
      setOutreachAllTotal(allResult.count);
    } catch (err) {
      console.error('Error fetching outreach:', err);
    } finally {
      setOutreachLoading(false);
    }
  }, [outreachPage, outreachFilters, user?.id]);

  useEffect(() => {
    if (activeTab === 'outreach') {
      fetchOutreach();
    }
  }, [activeTab, fetchOutreach]);

  // ============================================
  // Filtered Opportunities
  // ============================================

  const filteredOpportunities = opportunities.filter(opp => {
    if (searchTerm && !opp.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (pathFilter === 'closer' && opp.dm_account !== 'closer') return false;
    if (pathFilter === 'sdr' && opp.dm_account !== 'sdr') return false;
    return true;
  });

  const getStageOpps = (stage: SalesPipelineStage) =>
    filteredOpportunities.filter(o => o.stage === stage).sort((a, b) => a.position - b.position);

  const visiblePipelineStages = (pathFilter === 'closer' ? PATH_A_STAGES : PIPELINE_STAGES).filter(s => s !== 'cold_dm');

  const orbitOpps = filteredOpportunities.filter(o => o.stage === 'orbit');
  const orbitByReason = ORBIT_REASONS.map(r => ({
    ...r,
    opps: orbitOpps.filter(o => o.orbit_reason === r.value),
  }));

  // ============================================
  // CRUD Handlers
  // ============================================

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setIsSubmitting(true);
    try {
      await SalesPipelineService.create({ ...form, stage: form.stage || ('cold_dm' as OpportunityStage), temperature_score: form.temperature_score ?? 50 });
      setIsCreateOpen(false);
      setForm({ name: '' });
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Error creating opportunity');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingOpp || !form.name.trim()) return;
    setIsSubmitting(true);
    try {
      await SalesPipelineService.update(editingOpp.id, form);
      setSlideOverMode('view');
      setEditingOpp(null);
      setForm({ name: '' });
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Error updating opportunity');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this opportunity?')) return;
    try {
      await SalesPipelineService.delete(id);
      if (slideOverOpp?.id === id) setSlideOverOpp(null);
      await fetchData();
      if (activeTab === 'outreach') await fetchOutreach();
    } catch (err) {
      console.error('Error deleting:', err);
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
      await SalesPipelineService.update(oppId, updateData);
      await fetchData();
      if (activeTab === 'outreach') await fetchOutreach();
    } catch (err) {
      console.error('Error changing stage:', err);
    }
  };

  const confirmOrbit = async () => {
    if (!orbitPrompt) return;
    const { oppId, oppName } = orbitPrompt;
    const reasonLabel = ORBIT_REASONS.find(r => r.value === orbitReasonValue)?.label || orbitReasonValue;
    try {
      await SalesPipelineService.update(oppId, {
        stage: 'orbit' as OpportunityStage,
        orbit_reason: orbitReasonValue,
      });
      setOrbitPrompt(null);
      setOrbitReasonValue('no_response');
      await fetchData();
      // Open activity log popup
      openActivityLogPrompt(oppId, oppName, 'note', `Moved to orbit — ${reasonLabel}`);
    } catch (err) {
      console.error('Error moving to orbit:', err);
    }
  };

  const confirmTgHandle = async () => {
    if (!tgHandlePrompt || !tgHandleValue.trim()) return;
    const { oppId, oppName } = tgHandlePrompt;
    try {
      await SalesPipelineService.update(oppId, {
        stage: 'tg_intro' as OpportunityStage,
        tg_handle: tgHandleValue.trim(),
        last_contacted_at: new Date().toISOString(),
      } as any);
      setTgHandlePrompt(null);
      setTgHandleValue('');
      await fetchData();
      openActivityLogPrompt(oppId, oppName, 'message', `Got TG handle: ${tgHandleValue.trim()}`);
    } catch (err) {
      console.error('Error saving TG handle:', err);
    }
  };

  const confirmBucket = async () => {
    if (!bucketPrompt) return;
    const { oppId, oppName } = bucketPrompt;
    try {
      await SalesPipelineService.update(oppId, {
        stage: 'discovery_done' as OpportunityStage,
        bucket: bucketValue,
        last_contacted_at: new Date().toISOString(),
      } as any);
      setBucketPrompt(null);
      await fetchData();
      openActivityLogPrompt(oppId, oppName, 'meeting', 'Discovery call completed');
    } catch (err) {
      console.error('Error assigning bucket:', err);
    }
  };

  const confirmClosedLost = async () => {
    if (!closedLostPrompt) return;
    const { oppId, oppName } = closedLostPrompt;
    try {
      await SalesPipelineService.update(oppId, {
        stage: 'v2_closed_lost' as OpportunityStage,
        closed_lost_reason: closedLostReasonValue || undefined,
      });
      setClosedLostPrompt(null);
      setClosedLostReasonValue('');
      await fetchData();
      // Open activity log popup
      const reason = closedLostReasonValue ? `Closed lost — ${closedLostReasonValue}` : 'Closed lost';
      openActivityLogPrompt(oppId, oppName, 'note', reason);
    } catch (err) {
      console.error('Error closing lost:', err);
    }
  };

  const handleResurrect = async (opp: SalesPipelineOpportunity) => {
    try {
      await SalesPipelineService.update(opp.id, {
        stage: 'cold_dm' as OpportunityStage,
        orbit_reason: null,
      });
      await fetchData();
    } catch (err) {
      console.error('Error resurrecting:', err);
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
      await fetchData();
      if (activeTab === 'outreach') await fetchOutreach();
      if (slideOverOpp?.id === oppId) {
        await fetchActivities(oppId);
      }
    } catch (err) {
      console.error('Error recording bump:', err);
      await fetchData(); // revert on error
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
      await fetchData();
    } catch (err) {
      console.error('Error reducing bump:', err);
      await fetchData(); // revert on error
    } finally {
      setIsBumping(false);
    }
  };

  const handleAddActivity = async () => {
    if (!activityForm.title.trim() || !slideOverOpp) return;
    setIsActivitySubmitting(true);
    try {
      await SalesPipelineService.createActivity({
        ...activityForm,
        opportunity_id: slideOverOpp.id,
      });
      // If meeting type with a date set, update next_meeting_at
      if (activityForm.type === 'meeting' && activityMeetingDate) {
        const meetingDate = new Date(activityMeetingDate);
        if (activityMeetingTime) {
          const [h, m] = activityMeetingTime.split(':').map(Number);
          meetingDate.setHours(h, m, 0, 0);
        }
        await SalesPipelineService.update(slideOverOpp.id, { next_meeting_at: meetingDate.toISOString() });
        await fetchData();
      }
      setActivityForm({ opportunity_id: '', type: 'note', title: '' });
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
    try {
      const updates: any = {};
      if (field === 'deal_value') {
        updates.deal_value = value ? parseFloat(value) : null;
      } else if (field === 'temperature_score') {
        updates.temperature_score = parseInt(value) || 50;
      } else {
        updates[field] = value || null;
      }
      await SalesPipelineService.update(oppId, updates);
      await fetchData();
    } catch (err) {
      console.error('Error inline edit:', err);
    }
    setEditingCell(null);
  };

  const handleRecalculateAll = async () => {
    setIsRecalculating(true);
    try {
      await SalesPipelineService.recalcAllTemperatures();
      await fetchData();
      if (activeTab === 'outreach') await fetchOutreach();
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
          await SalesPipelineService.updatePositions(positions);
          await fetchData();
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
      referrer: opp.referrer || undefined,
      affiliate_id: opp.affiliate_id || undefined,
      deal_value: opp.deal_value || undefined,
      currency: opp.currency,
      next_meeting_at: opp.next_meeting_at || undefined,
      next_meeting_type: opp.next_meeting_type || undefined,
      notes: opp.notes || undefined,
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
        if (daysSinceUpdated > 90) {
          return { label: 'Resurrect', hint: '90+ days — re-engage or mark lost', priority: 'low', actionType: 'open_detail', isActionable: true, sortScore: 70, alternatives: [
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
      if (actionFilter === 'mine') return opp.owner_id === user?.id;
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

  const displayedActions = useMemo(() => {
    let items = actionPhaseFilter === 'outreach' ? outreachActions
      : actionPhaseFilter === 'closing' ? closingActions
      : actionPhaseFilter === 'orbit' ? orbitActions
      : actionPhaseFilter === 'non_urgent' ? nonUrgentItems
      : actionItems;

    // Apply alert card filter
    if (alertCardOppIds) {
      items = items.filter(({ opp }) => alertCardOppIds.has(opp.id));
    }

    if (actionSort === 'priority' && actionPhaseFilter !== 'non_urgent') return items;
    const stageIdx: Record<string, number> = {};
    [...PIPELINE_STAGES, 'orbit', 'nurture', 'v2_closed_lost'].forEach((s, i) => { stageIdx[s] = i; });

    return [...items].sort((a, b) => {
      switch (actionSort) {
        case 'stage': return (stageIdx[a.opp.stage] ?? 99) - (stageIdx[b.opp.stage] ?? 99);
        case 'temperature': return (b.opp.temperature_score || 0) - (a.opp.temperature_score || 0);
        case 'value': return (b.opp.deal_value || 0) - (a.opp.deal_value || 0);
        case 'name': return (a.opp.name || '').localeCompare(b.opp.name || '');
        case 'newest': return new Date(b.opp.created_at).getTime() - new Date(a.opp.created_at).getTime();
        case 'oldest': return new Date(a.opp.created_at).getTime() - new Date(b.opp.created_at).getTime();
        default: return 0;
      }
    });
  }, [actionPhaseFilter, outreachActions, closingActions, orbitActions, actionItems, nonUrgentItems, actionSort, alertCardOppIds]);

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

  const openActivityLogPrompt = (oppId: string, oppName: string, type: ActivityType, title: string, showMeetingPicker?: boolean) => {
    setActivityLogPrompt({ oppId, oppName, type, title, showMeetingPicker });
    setActivityLogForm({ title, description: '', outcome: '', next_step: '', meeting_date: undefined, meeting_time: undefined, next_step_date: undefined });
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
            openActivityLogPrompt(oppId, opp.name, mapping.type, mapping.title, mapping.showMeetingPicker);
          }
        }
      } else {
        // open_detail actions
        if (action.label === 'Book Next Meeting!' || action.label === 'Schedule Meeting') {
          openActivityLogPrompt(oppId, opp.name, 'meeting', 'Meeting scheduled', true);
        } else if (action.label === 'Log Meeting Outcome') {
          openActivityLogPrompt(oppId, opp.name, 'meeting', 'Meeting outcome', false);
        } else if (action.label === 'Send Proposal') {
          // Mark proposal as sent, then show activity log
          await SalesPipelineService.update(oppId, { proposal_sent_at: new Date().toISOString() } as any);
          openActivityLogPrompt(oppId, opp.name, 'proposal', 'Proposal sent');
          await fetchData();
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
      await SalesPipelineService.update(activityLogPrompt.oppId, activityUpdate);
      setActivityLogPrompt(null);
      setActivityLogForm({ title: '', description: '', outcome: '', next_step: '', meeting_date: undefined, meeting_time: undefined, next_step_date: undefined });
      await fetchData();
      if (activeTab === 'outreach') await fetchOutreach();
    } catch (err) {
      console.error('Error logging activity:', err);
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
        className={`group hover:shadow-md transition-all duration-200 border-l-4 ${colors.border} ${isDragging ? 'shadow-lg ring-2 ring-blue-400 opacity-90' : ''} ${bamfam ? 'bg-red-50/30' : ''}`}
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

                {/* Last contacted */}
                {opp.last_contacted_at && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 flex-shrink-0" />
                    <span>{formatDistanceToNow(new Date(opp.last_contacted_at), { addSuffix: true })}</span>
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
              <Badge variant="secondary" className="text-xs font-medium mt-1">{orbitOpps.length}</Badge>
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
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="w-[70px]">Bucket</TableHead>
                        <TableHead className="w-[70px]">Path</TableHead>
                        <TableHead className="w-[90px]">Temp</TableHead>
                        <TableHead className="w-[110px]">Value</TableHead>
                        <TableHead className="w-[100px]">Owner</TableHead>
                        <TableHead className="w-[100px]">TG Handle</TableHead>
                        {stage === 'cold_dm' && <TableHead className="w-[80px]">Bumps</TableHead>}
                        {stage === 'warm' && <TableHead className="w-[90px]">Type</TableHead>}
                        <TableHead className="w-[70px]">BAMFAM</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <SortableContext items={stageOpps.map(o => o.id)} strategy={verticalListSortingStrategy}>
                        {stageOpps.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={11} className="text-center text-sm text-gray-400 py-8">
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
                                    className="h-8 text-sm font-medium auth-input"
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
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                {opp.bucket && (
                                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${BUCKET_COLORS[opp.bucket].bg} ${BUCKET_COLORS[opp.bucket].text}`}>
                                    {opp.bucket}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {opp.dm_account === 'closer' ? 'C' : opp.dm_account === 'sdr' ? 'S' : 'O'}
                                </Badge>
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
                              <TableCell>
                                {editingCell?.id === opp.id && editingCell.field === 'deal_value' ? (
                                  <Input
                                    type="number"
                                    value={editingValue}
                                    onChange={e => setEditingValue(e.target.value)}
                                    onBlur={() => handleInlineEdit(opp.id, 'deal_value', editingValue)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleInlineEdit(opp.id, 'deal_value', editingValue); if (e.key === 'Escape') setEditingCell(null); }}
                                    className="h-8 text-sm text-right auth-input"
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
                              <TableCell>{getUserName(opp.owner_id)}</TableCell>
                              <TableCell className="text-gray-500">{opp.tg_handle || '—'}</TableCell>
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
                              <TableCell>
                                {isBAMFAM(opp) ? (
                                  <span className="text-red-600 flex items-center gap-1">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                  </span>
                                ) : (
                                  <span className="text-green-600 text-xs">OK</span>
                                )}
                              </TableCell>
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
      setSelectedOutreach([]);
      await fetchOutreach();
      await fetchData();
    } catch (err: any) {
      console.error('Error bulk bumping:', err);
      alert(err.message || 'Error bumping selected opportunities');
      setSelectedOutreach([]);
    } finally {
      setIsBulkBumping(false);
    }
  };

  const handleBulkMoveToWarm = async () => {
    if (selectedOutreach.length === 0 || isBulkMoving) return;
    setIsBulkMoving(true);
    try {
      await SalesPipelineService.bulkUpdateStage(selectedOutreach, 'warm');
      setSelectedOutreach([]);
      await fetchOutreach();
      await fetchData();
    } catch (err: any) {
      console.error('Error bulk moving to warm:', err);
      alert(err.message || 'Error moving selected opportunities to warm');
      setSelectedOutreach([]);
    } finally {
      setIsBulkMoving(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedOutreach.length === 0) return;
    if (!confirm(`Delete ${selectedOutreach.length} selected opportunities? This cannot be undone.`)) return;
    try {
      await SalesPipelineService.bulkDelete(selectedOutreach);
      setSelectedOutreach([]);
      await fetchOutreach();
      await fetchData();
    } catch (err: any) {
      console.error('Error bulk deleting:', err);
      alert(err.message || 'Error deleting selected opportunities');
      setSelectedOutreach([]);
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

  const renderOutreachTab = () => (
    <div className="pb-8">
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
            className="pl-9 h-9 text-sm auth-input"
          />
        </div>
        <Select
          value={outreachFilters.dm_account || 'all'}
          onValueChange={v => { setOutreachFilters(prev => ({ ...prev, dm_account: v === 'all' ? undefined : v as DmAccount })); setOutreachPage(1); setSelectedOutreach([]); }}
        >
          <SelectTrigger className="h-9 w-auto text-sm auth-input [&>span]:truncate-none [&>span]:line-clamp-none">
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
          <SelectTrigger className="h-9 w-auto text-sm auth-input [&>span]:truncate-none [&>span]:line-clamp-none">
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
          <SelectTrigger className="h-9 w-auto text-sm auth-input [&>span]:truncate-none [&>span]:line-clamp-none">
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

      {/* Bulk action toolbar */}
      {selectedOutreach.length > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-sky-50 border border-sky-200 rounded-lg">
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
                <TableHead>Name</TableHead>
                <TableHead className="w-[150px]">POC</TableHead>
                <TableHead className="w-[80px]">Bumps</TableHead>
                <TableHead className="w-[150px]">TG Handle</TableHead>
                <TableHead className="w-[80px]">Source</TableHead>
                <TableHead className="w-[100px]">Owner</TableHead>
                <TableHead className="w-[90px]">Created</TableHead>
                <TableHead className="w-[130px]">Last Bump</TableHead>
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
              ) : outreachOpps.map((opp, index) => {
                const isChecked = selectedOutreach.includes(opp.id);
                const rowNum = outreachStart + index;
                return (
                  <TableRow
                    key={opp.id}
                    className="group hover:bg-gray-50 cursor-pointer"
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
                    <TableCell>
                      <div className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 rounded px-2 py-1 -mx-2 -my-1">
                        <Building2 className="h-4 w-4 text-gray-400" />
                        <span className="font-medium">{opp.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {opp.poc_handle ? (
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{opp.poc_platform || 'other'}</Badge>
                          <span className="text-xs text-gray-600">{opp.poc_handle}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
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
                    <TableCell className="text-gray-500 whitespace-nowrap">{opp.tg_handle || '—'}</TableCell>
                    <TableCell className="text-gray-500 text-xs capitalize">{opp.source?.replace('_', ' ') || '—'}</TableCell>
                    <TableCell>{getUserName(opp.owner_id)}</TableCell>
                    <TableCell className="text-gray-500 text-xs">
                      {opp.created_at ? format(new Date(opp.created_at), 'MMM d') : '—'}
                    </TableCell>
                    <TableCell className="text-gray-500 text-xs" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <span>{opp.last_bump_date ? formatDistanceToNow(new Date(opp.last_bump_date), { addSuffix: true }) : '—'}</span>
                        <div className="relative group/bump inline-flex">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-sky-600 hover:text-sky-700 hover:bg-sky-50"
                            onClick={() => handleRecordBump(opp.id)}
                            disabled={isBumping}
                          >
                            <Zap className="h-3 w-3" />
                          </Button>
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 text-white text-[11px] rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover/bump:opacity-100 transition-opacity z-50" style={{ backgroundColor: '#3e8692' }}>
                            Record bump #{opp.bump_number + 1}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent" style={{ borderTopColor: '#3e8692' }} />
                          </div>
                        </div>
                      </div>
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

      // Orbit — show time in orbit
      if (opp.stage === 'orbit') {
        const d = daysAgo(opp.updated_at);
        if (d !== null) return { text: `${d}d in orbit`, color: d > 90 ? 'text-amber-500 font-medium' : 'text-gray-500' };
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
                Sort: {actionSort === 'priority' ? 'Priority' : actionSort === 'stage' ? 'Stage' : actionSort === 'temperature' ? 'Temp' : actionSort === 'value' ? 'Value' : actionSort === 'newest' ? 'Newest' : actionSort === 'oldest' ? 'Oldest' : 'Name'}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {([
                { key: 'priority' as const, label: 'Priority' },
                { key: 'stage' as const, label: 'Stage' },
                { key: 'temperature' as const, label: 'Temperature' },
                { key: 'value' as const, label: 'Deal Value' },
                { key: 'name' as const, label: 'Name (A-Z)' },
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
                  <TableCell colSpan={8} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <Zap className="h-8 w-8" />
                      <p className="text-sm font-medium">{emptyLabel}</p>
                      <p className="text-xs">All caught up — check back later</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : currentItems.map(({ opp, action }) => {
                const timing = getTimingInfo(opp);
                const stageColors = STAGE_COLORS[opp.stage as SalesPipelineStage] || STAGE_COLORS.cold_dm;
                return (
                  <TableRow
                    key={opp.id}
                    className={`group hover:bg-gray-50 cursor-pointer ${action.priority === 'urgent' ? 'bg-red-50/40' : ''}`}
                    onClick={() => openSlideOver(opp)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-gray-400" />
                        <span className="font-medium">{opp.name}</span>
                      </div>
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
                    <TableCell>{getUserName(opp.owner_id)}</TableCell>
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
      {orbitByReason.map(group => {
        const isCollapsed = collapsedStages.has(`orbit_${group.value}`);
        const groupValue = group.opps.reduce((s, o) => s + (o.deal_value || 0), 0);

        return (
          <div key={group.value} className="mb-6">
            {/* Group Header */}
            <div
              onClick={() => {
                const next = new Set(collapsedStages);
                const key = `orbit_${group.value}`;
                isCollapsed ? next.delete(key) : next.add(key);
                setCollapsedStages(next);
              }}
              className={`flex items-center justify-between px-4 py-3 bg-orange-50 ${isCollapsed ? 'rounded-lg' : 'rounded-t-lg'} border border-orange-200 ${isCollapsed ? '' : 'border-b-0'} cursor-pointer select-none transition-all`}
            >
              <div className="flex items-center gap-2">
                {isCollapsed ? <ChevronRight className="h-4 w-4 text-orange-700" /> : <ChevronDown className="h-4 w-4 text-orange-700" />}
                <h4 className="font-semibold text-orange-700">{group.label}</h4>
                <Badge variant="secondary" className="text-xs font-medium">{group.opps.length}</Badge>
              </div>
              {groupValue > 0 && (
                <span className="text-sm font-medium text-gray-600">
                  ${groupValue.toLocaleString()}
                </span>
              )}
            </div>

            {!isCollapsed && (
              <div className="bg-white rounded-b-lg border border-gray-200 border-t-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/50">
                      <TableHead>Name</TableHead>
                      <TableHead className="w-[70px]">Bucket</TableHead>
                      <TableHead className="w-[70px]">DM</TableHead>
                      <TableHead className="w-[90px]">Temp</TableHead>
                      <TableHead className="w-[110px]">Value</TableHead>
                      <TableHead className="w-[100px]">Owner</TableHead>
                      <TableHead className="w-[120px]">Time in Orbit</TableHead>
                      <TableHead className="w-[120px]">Last Contacted</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.opps.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-sm text-gray-400 py-8">
                          No opportunities
                        </TableCell>
                      </TableRow>
                    ) : group.opps.map(opp => (
                      <TableRow key={opp.id} className="group hover:bg-gray-50 cursor-pointer" onClick={() => openSlideOver(opp)}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-gray-400" />
                            <span className="font-medium">{opp.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {opp.bucket && (
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${BUCKET_COLORS[opp.bucket].bg} ${BUCKET_COLORS[opp.bucket].text}`}>
                              {opp.bucket}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {opp.dm_account === 'closer' ? 'C' : opp.dm_account === 'sdr' ? 'S' : 'O'}
                          </Badge>
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
                        <TableCell>
                          {opp.deal_value ? (
                            <span className="font-semibold text-emerald-600">${opp.deal_value.toLocaleString()}</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>{getUserName(opp.owner_id)}</TableCell>
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
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

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
      <div className="fixed inset-y-0 right-0 w-[480px] bg-white border-l shadow-xl z-[70] flex flex-col">
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
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEditDialog(opp)}>
                  <Edit className="h-4 w-4" />
                </Button>
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
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Company or contact name" className="auth-input" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Path</Label>
                    <Select value={form.dm_account || 'sdr'} onValueChange={v => setForm(f => ({ ...f, dm_account: v as DmAccount }))}>
                      <SelectTrigger className="auth-input"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="closer">Closer (Path A)</SelectItem>
                        <SelectItem value="sdr">SDR (Path B)</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Bucket</Label>
                    <Select value={form.bucket || ''} onValueChange={v => setForm(f => ({ ...f, bucket: v as Bucket }))}>
                      <SelectTrigger className="auth-input"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A">A - High Priority</SelectItem>
                        <SelectItem value="B">B - Medium</SelectItem>
                        <SelectItem value="C">C - Low Priority</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Temperature: {form.temperature_score || 50}</Label>
                  <input type="range" min="0" max="100" value={form.temperature_score || 50} onChange={e => setForm(f => ({ ...f, temperature_score: parseInt(e.target.value) }))} className="w-full accent-[#3e8692]" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">POC Platform</Label>
                    <Select value={form.poc_platform || ''} onValueChange={v => setForm(f => ({ ...f, poc_platform: v as PocPlatform }))}>
                      <SelectTrigger className="auth-input"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {POC_PLATFORMS.map(p => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">POC Handle / ID</Label>
                    <Input value={form.poc_handle || ''} onChange={e => setForm(f => ({ ...f, poc_handle: e.target.value }))} placeholder="@handle or ID" className="auth-input" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Source</Label>
                    <Select value={form.source || ''} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
                      <SelectTrigger className="auth-input"><SelectValue placeholder="Select..." /></SelectTrigger>
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
                    <Input value={form.tg_handle || ''} onChange={e => setForm(f => ({ ...f, tg_handle: e.target.value }))} placeholder="@handle" className="auth-input" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Owner</Label>
                    <Select value={form.owner_id || ''} onValueChange={v => setForm(f => ({ ...f, owner_id: v }))}>
                      <SelectTrigger className="auth-input"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {users.map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Referrer</Label>
                    <Input value={form.referrer || ''} onChange={e => setForm(f => ({ ...f, referrer: e.target.value }))} placeholder="Who referred?" className="auth-input" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Affiliate</Label>
                  <Select value={form.affiliate_id || ''} onValueChange={v => setForm(f => ({ ...f, affiliate_id: v }))}>
                    <SelectTrigger className="auth-input"><SelectValue placeholder="Select affiliate..." /></SelectTrigger>
                    <SelectContent>
                      {affiliates.map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Deal Value</Label>
                    <Input type="number" value={form.deal_value || ''} onChange={e => setForm(f => ({ ...f, deal_value: e.target.value ? parseFloat(e.target.value) : undefined }))} placeholder="0" className="auth-input" />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Currency</Label>
                    <Select value={form.currency || 'USD'} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                      <SelectTrigger className="auth-input"><SelectValue /></SelectTrigger>
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Meeting Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="auth-input justify-start text-left font-normal w-full"
                          style={{ borderColor: '#e5e7eb', backgroundColor: 'white', color: form.next_meeting_at ? '#111827' : '#9ca3af' }}
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {form.next_meeting_at ? format(new Date(form.next_meeting_at), 'MMM d, yyyy') : 'Select date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
                        <CalendarPicker
                          mode="single"
                          selected={form.next_meeting_at ? new Date(form.next_meeting_at) : undefined}
                          onSelect={date => {
                            if (date) {
                              const existing = form.next_meeting_at ? new Date(form.next_meeting_at) : new Date();
                              date.setHours(existing.getHours(), existing.getMinutes());
                              setForm(f => ({ ...f, next_meeting_at: date.toISOString() }));
                            } else {
                              setForm(f => ({ ...f, next_meeting_at: undefined }));
                            }
                          }}
                          initialFocus
                          classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                          modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Meeting Time</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="auth-input justify-start text-left font-normal w-full"
                          style={{ borderColor: '#e5e7eb', backgroundColor: 'white', color: form.next_meeting_at ? '#111827' : '#9ca3af' }}
                        >
                          <Clock className="mr-2 h-4 w-4" />
                          {form.next_meeting_at ? format(new Date(form.next_meeting_at), 'h:mm a') : 'Select time'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
                        <div className="flex gap-0 divide-x">
                          {/* Hour column */}
                          <ScrollArea className="h-[200px] w-[70px]">
                            <div className="p-1">
                              {Array.from({ length: 24 }, (_, h) => {
                                const label = `${h === 0 ? 12 : h > 12 ? h - 12 : h} ${h >= 12 ? 'PM' : 'AM'}`;
                                const isSelected = form.next_meeting_at && new Date(form.next_meeting_at).getHours() === h;
                                return (
                                  <Button
                                    key={h}
                                    variant="ghost"
                                    className={`w-full justify-center font-normal text-xs h-7 px-1 ${isSelected ? 'text-white hover:text-white' : ''}`}
                                    style={isSelected ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                                    onClick={() => {
                                      const d = form.next_meeting_at ? new Date(form.next_meeting_at) : new Date();
                                      d.setHours(h, d.getMinutes(), 0, 0);
                                      setForm(f => ({ ...f, next_meeting_at: d.toISOString() }));
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
                                const isSelected = form.next_meeting_at && new Date(form.next_meeting_at).getMinutes() === m;
                                return (
                                  <Button
                                    key={m}
                                    variant="ghost"
                                    className={`w-full justify-center font-normal text-xs h-7 px-1 ${isSelected ? 'text-white hover:text-white' : ''}`}
                                    style={isSelected ? { backgroundColor: '#3e8692', color: 'white' } : {}}
                                    onClick={() => {
                                      const d = form.next_meeting_at ? new Date(form.next_meeting_at) : new Date();
                                      d.setMinutes(m, 0, 0);
                                      setForm(f => ({ ...f, next_meeting_at: d.toISOString() }));
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
                <div className="grid gap-2">
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Meeting Type</Label>
                    <Select value={(form as any).next_meeting_type || ''} onValueChange={v => setForm(f => ({ ...f, next_meeting_type: v }))}>
                      <SelectTrigger className="auth-input"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="discovery">Discovery Call</SelectItem>
                        <SelectItem value="proposal">Proposal Call</SelectItem>
                        <SelectItem value="follow_up">Follow Up</SelectItem>
                        <SelectItem value="closing">Closing Call</SelectItem>
                      </SelectContent>
                    </Select>
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</Label>
                  <Textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional notes..." className="auth-input" rows={3} />
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
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
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
                </div>
                <div>
                  <span className="text-xs text-gray-500">POC</span>
                  {opp.poc_handle ? (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{opp.poc_platform || 'other'}</Badge>
                      <span className="font-medium">{opp.poc_handle}</span>
                    </div>
                  ) : (
                    <p className="font-medium mt-0.5 text-gray-400">—</p>
                  )}
                </div>
                <div>
                  <span className="text-xs text-gray-500">TG Handle</span>
                  <p className="font-medium mt-0.5">{opp.tg_handle || '—'}</p>
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
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{opp.notes}</p>
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
            <div className="flex gap-2 flex-wrap">
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
                <SelectTrigger className="auth-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_V2_STAGES.filter(s => s !== 'proposal_sent').map(s => (
                    <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Activity Timeline */}
            <div className="border-t pt-6">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Activity Timeline</h4>

              {/* Add activity form */}
              <div className="space-y-3 mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex gap-2">
                  <Select
                    value={activityForm.type}
                    onValueChange={v => setActivityForm(f => ({ ...f, type: v as ActivityType }))}
                  >
                    <SelectTrigger className="h-9 text-sm w-28 auth-input">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="note">Note</SelectItem>
                      <SelectItem value="call">Call</SelectItem>
                      <SelectItem value="message">Message</SelectItem>
                      <SelectItem value="meeting">Meeting</SelectItem>
                      <SelectItem value="proposal">Proposal</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Title..."
                    value={activityForm.title}
                    onChange={e => setActivityForm(f => ({ ...f, title: e.target.value }))}
                    className="h-9 text-sm flex-1 auth-input"
                  />
                </div>
                <Textarea
                  placeholder="Description (optional)"
                  value={activityForm.description || ''}
                  onChange={e => setActivityForm(f => ({ ...f, description: e.target.value }))}
                  className="text-sm min-h-[60px] auth-input"
                  rows={2}
                />
                <div className="flex gap-2">
                  <Input
                    placeholder="Outcome"
                    value={activityForm.outcome || ''}
                    onChange={e => setActivityForm(f => ({ ...f, outcome: e.target.value }))}
                    className="h-9 text-sm flex-1 auth-input"
                  />
                  <Input
                    placeholder="Next step"
                    value={activityForm.next_step || ''}
                    onChange={e => setActivityForm(f => ({ ...f, next_step: e.target.value }))}
                    className="h-9 text-sm flex-1 auth-input"
                  />
                </div>
                {/* Meeting Date/Time (only for meeting type) */}
                {activityForm.type === 'meeting' && (
                  <div className="flex gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="h-9 text-sm flex-1 auth-input justify-start font-normal"
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
                          className="h-9 text-sm flex-1 auth-input justify-start font-normal"
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
                        className="h-9 text-sm flex-1 auth-input justify-start font-normal"
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
                    <div className="flex-1 min-w-0 pb-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{act.title}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 capitalize">{act.type}</Badge>
                      </div>
                      {act.description && <p className="text-sm text-gray-600 mt-1">{act.description}</p>}
                      {act.outcome && (
                        <p className="text-sm text-gray-500 mt-1">
                          <span className="font-medium text-gray-700">Outcome:</span> {act.outcome}
                        </p>
                      )}
                      {act.next_step && (
                        <div className="flex items-center gap-1 mt-1 text-sm text-blue-600">
                          <ArrowRight className="h-3 w-3 flex-shrink-0" />
                          <span>{act.next_step}</span>
                          {act.next_step_date && (
                            <span className="text-gray-400 ml-1">
                              ({format(new Date(act.next_step_date), 'MMM d')})
                            </span>
                          )}
                        </div>
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
                  className="auth-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>POC Platform</Label>
                  <Select value={form.poc_platform || ''} onValueChange={v => setForm(f => ({ ...f, poc_platform: v as PocPlatform }))}>
                    <SelectTrigger className="auth-input"><SelectValue placeholder="Select..." /></SelectTrigger>
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
                    className="auth-input"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Owner</Label>
                <Select
                  value={form.owner_id || ''}
                  onValueChange={v => setForm(f => ({ ...f, owner_id: v }))}
                >
                  <SelectTrigger className="auth-input"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                    className="auth-input"
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
                        className="w-full justify-between font-normal auth-input"
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
                              <Plus className="h-4 w-4 text-[#3e8692]" />
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
                  className="auth-input"
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
                        <SelectTrigger className="auth-input"><SelectValue /></SelectTrigger>
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
                        <SelectTrigger className="auth-input"><SelectValue placeholder="Select..." /></SelectTrigger>
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
                      className="auth-input"
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
                        className="auth-input"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Currency</Label>
                      <Select
                        value={form.currency || 'USD'}
                        onValueChange={v => setForm(f => ({ ...f, currency: v }))}
                      >
                        <SelectTrigger className="auth-input"><SelectValue /></SelectTrigger>
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
                        className="w-full accent-[#3e8692]"
                      />
                    </div>
                  )}
                </div>
              </details>}
          </div>

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
      <Dialog open={!!activityLogPrompt} onOpenChange={open => { if (!open) { setActivityLogPrompt(null); setActivityLogForm({ title: '', description: '', outcome: '', next_step: '', meeting_date: undefined, meeting_time: undefined, next_step_date: undefined }); } }}>
        <DialogContent className="sm:max-w-md z-[80]">
          <DialogHeader>
            <DialogTitle>Log Activity — {activityLogPrompt?.oppName}</DialogTitle>
            <DialogDescription>Add context to this activity before saving.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Type badge (read-only) */}
            {typeInfo && (
              <div className="flex items-center gap-2">
                <Badge className={`${typeInfo.color} border-0 gap-1`}>
                  {typeInfo.icon}
                  {typeInfo.label}
                </Badge>
              </div>
            )}

            {/* Title (editable) */}
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Title</Label>
              <Input
                value={activityLogForm.title}
                onChange={e => setActivityLogForm(f => ({ ...f, title: e.target.value }))}
                className="auth-input"
                placeholder="Activity title..."
              />
            </div>

            {/* Meeting Date/Time pickers */}
            {activityLogPrompt?.showMeetingPicker && (
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Meeting Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="auth-input justify-start text-left font-normal w-full"
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
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Meeting Time</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="auth-input justify-start text-left font-normal w-full"
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

            {/* Description */}
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Description <span className="font-normal normal-case text-gray-400">(optional)</span></Label>
              <Textarea
                value={activityLogForm.description}
                onChange={e => setActivityLogForm(f => ({ ...f, description: e.target.value }))}
                className="auth-input min-h-[60px]"
                placeholder="Add context..."
                rows={2}
              />
            </div>

            {/* Outcome + Next Step */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Outcome <span className="font-normal normal-case text-gray-400">(optional)</span></Label>
                <Input
                  value={activityLogForm.outcome}
                  onChange={e => setActivityLogForm(f => ({ ...f, outcome: e.target.value }))}
                  className="auth-input"
                  placeholder="Result..."
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Next Step <span className="font-normal normal-case text-gray-400">(optional)</span></Label>
                <Input
                  value={activityLogForm.next_step}
                  onChange={e => setActivityLogForm(f => ({ ...f, next_step: e.target.value }))}
                  className="auth-input"
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
                    className="auth-input justify-start text-left font-normal w-full"
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
            <Button variant="outline" onClick={() => { setActivityLogPrompt(null); setActivityLogForm({ title: '', description: '', outcome: '', next_step: '', meeting_date: undefined, meeting_time: undefined, next_step_date: undefined }); }}>Cancel</Button>
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
        <DialogFooter>
          <Button variant="outline" onClick={() => setOrbitPrompt(null)}>Cancel</Button>
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
          className="auth-input"
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
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
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search opportunities..."
              className="pl-10 w-64 auth-input"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
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

      {/* Attention Cards — urgency items for managers (clickable) */}
      <div className="grid grid-cols-5 gap-3">
        {/* Booking Needed */}
        <Card
          className={`border-l-4 cursor-pointer transition-all hover:shadow-md ${alertCardFilter === 'booking_needed' ? 'ring-2 ring-red-400 shadow-md' : ''} ${dashboardMetrics.bamfamViolations > 0 ? 'border-l-red-500 bg-red-50' : 'border-l-gray-200 bg-white'}`}
          onClick={() => {
            if (alertCardFilter === 'booking_needed') { setAlertCardFilter('none'); return; }
            setAlertCardFilter('booking_needed'); setActiveTab('actions'); setActionFilter('all'); setActionPhaseFilter('all');
          }}
        >
          <CardContent className="pt-3 pb-3 px-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Calendar className={`h-3.5 w-3.5 ${dashboardMetrics.bamfamViolations > 0 ? 'text-red-500' : 'text-gray-400'}`} />
              <p className={`text-[11px] font-semibold uppercase tracking-wider ${dashboardMetrics.bamfamViolations > 0 ? 'text-red-500' : 'text-gray-400'}`}>Booking Needed</p>
            </div>
            <p className={`text-2xl font-bold leading-none ${dashboardMetrics.bamfamViolations > 0 ? 'text-red-700' : 'text-gray-900'}`}>{dashboardMetrics.bamfamViolations}</p>
            <p className="text-[11px] text-gray-400 mt-1">No future meeting set</p>
          </CardContent>
        </Card>

        {/* Overdue */}
        <Card
          className={`border-l-4 cursor-pointer transition-all hover:shadow-md ${alertCardFilter === 'overdue' ? 'ring-2 ring-orange-400 shadow-md' : ''} ${dashboardMetrics.overdueFollowups > 0 ? 'border-l-orange-500 bg-orange-50' : 'border-l-gray-200 bg-white'}`}
          onClick={() => {
            if (alertCardFilter === 'overdue') { setAlertCardFilter('none'); return; }
            setAlertCardFilter('overdue'); setActiveTab('actions'); setActionFilter('all'); setActionPhaseFilter('all');
          }}
        >
          <CardContent className="pt-3 pb-3 px-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className={`h-3.5 w-3.5 ${dashboardMetrics.overdueFollowups > 0 ? 'text-orange-500' : 'text-gray-400'}`} />
              <p className={`text-[11px] font-semibold uppercase tracking-wider ${dashboardMetrics.overdueFollowups > 0 ? 'text-orange-500' : 'text-gray-400'}`}>Overdue</p>
            </div>
            <p className={`text-2xl font-bold leading-none ${dashboardMetrics.overdueFollowups > 0 ? 'text-orange-700' : 'text-gray-900'}`}>{dashboardMetrics.overdueFollowups}</p>
            <p className="text-[11px] text-gray-400 mt-1">Past meeting date</p>
          </CardContent>
        </Card>

        {/* Stale */}
        <Card
          className={`border-l-4 cursor-pointer transition-all hover:shadow-md ${alertCardFilter === 'stale' ? 'ring-2 ring-amber-400 shadow-md' : ''} ${dashboardMetrics.staleDeals > 0 ? 'border-l-amber-500 bg-amber-50' : 'border-l-gray-200 bg-white'}`}
          onClick={() => {
            if (alertCardFilter === 'stale') { setAlertCardFilter('none'); return; }
            setAlertCardFilter('stale'); setActiveTab('actions'); setActionFilter('all'); setActionPhaseFilter('all');
          }}
        >
          <CardContent className="pt-3 pb-3 px-4">
            <div className="flex items-center gap-1.5 mb-1">
              <RotateCcw className={`h-3.5 w-3.5 ${dashboardMetrics.staleDeals > 0 ? 'text-amber-500' : 'text-gray-400'}`} />
              <p className={`text-[11px] font-semibold uppercase tracking-wider ${dashboardMetrics.staleDeals > 0 ? 'text-amber-600' : 'text-gray-400'}`}>Stale (7d+)</p>
            </div>
            <p className={`text-2xl font-bold leading-none ${dashboardMetrics.staleDeals > 0 ? 'text-amber-700' : 'text-gray-900'}`}>{dashboardMetrics.staleDeals}</p>
            <p className="text-[11px] text-gray-400 mt-1">No contact in 7+ days</p>
          </CardContent>
        </Card>

        {/* At Risk */}
        <Card
          className={`border-l-4 cursor-pointer transition-all hover:shadow-md ${alertCardFilter === 'at_risk' ? 'ring-2 ring-rose-400 shadow-md' : ''} ${dashboardMetrics.dealsAtRisk > 0 ? 'border-l-rose-500 bg-rose-50' : 'border-l-gray-200 bg-white'}`}
          onClick={() => {
            if (alertCardFilter === 'at_risk') { setAlertCardFilter('none'); return; }
            setAlertCardFilter('at_risk'); setActiveTab('actions'); setActionFilter('all'); setActionPhaseFilter('all');
          }}
        >
          <CardContent className="pt-3 pb-3 px-4">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className={`h-3.5 w-3.5 ${dashboardMetrics.dealsAtRisk > 0 ? 'text-rose-500' : 'text-gray-400'}`} />
              <p className={`text-[11px] font-semibold uppercase tracking-wider ${dashboardMetrics.dealsAtRisk > 0 ? 'text-rose-500' : 'text-gray-400'}`}>At Risk</p>
            </div>
            <p className={`text-2xl font-bold leading-none ${dashboardMetrics.dealsAtRisk > 0 ? 'text-rose-700' : 'text-gray-900'}`}>{dashboardMetrics.dealsAtRisk}</p>
            <p className="text-[11px] text-gray-400 mt-1">Closing deals, temp &lt; 40</p>
          </CardContent>
        </Card>

        {/* Meetings */}
        <Card
          className={`border-l-4 cursor-pointer transition-all hover:shadow-md ${alertCardFilter === 'meetings' ? 'ring-2 ring-blue-400 shadow-md' : ''} ${dashboardMetrics.meetingsToday > 0 ? 'border-l-blue-500 bg-blue-50' : 'border-l-gray-200 bg-white'}`}
          onClick={() => {
            if (alertCardFilter === 'meetings') { setAlertCardFilter('none'); return; }
            setAlertCardFilter('meetings'); setActiveTab('actions'); setActionFilter('all'); setActionPhaseFilter('all');
          }}
        >
          <CardContent className="pt-3 pb-3 px-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Calendar className={`h-3.5 w-3.5 ${dashboardMetrics.meetingsToday > 0 ? 'text-blue-500' : 'text-gray-400'}`} />
              <p className={`text-[11px] font-semibold uppercase tracking-wider ${dashboardMetrics.meetingsToday > 0 ? 'text-blue-500' : 'text-gray-400'}`}>Meetings</p>
            </div>
            <div className="flex items-baseline gap-1.5">
              <p className={`text-2xl font-bold leading-none ${dashboardMetrics.meetingsToday > 0 ? 'text-blue-700' : 'text-gray-900'}`}>
                {dashboardMetrics.meetingsToday > 0 ? dashboardMetrics.meetingsToday : dashboardMetrics.meetingsThisWeek}
              </p>
              {dashboardMetrics.meetingsToday > 0 && dashboardMetrics.meetingsThisWeek > dashboardMetrics.meetingsToday && (
                <p className="text-xs text-blue-400">+{dashboardMetrics.meetingsThisWeek - dashboardMetrics.meetingsToday} wk</p>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">{dashboardMetrics.meetingsToday > 0 ? 'Today' : 'This week'}</p>
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
            <BarChart3 className="h-4 w-4 text-[#3e8692]" />
            <span className="text-sm font-semibold text-gray-900">Sales Dashboard</span>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-gray-500 hover:text-[#3e8692] gap-1"
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
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'actions' | 'outreach' | 'pipeline' | 'orbit' | 'overview' | 'templates')}>
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
            </TabsTrigger>
            <TabsTrigger value="orbit" className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              Orbit
              {orbitOpps.length > 0 && (
                <Badge variant="secondary" className="ml-1">{orbitOpps.length}</Badge>
              )}
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
                <SelectTrigger className="h-9 w-40 text-sm auth-input">
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
          {viewMode === 'kanban' ? renderKanban() : renderTable()}
        </TabsContent>

        <TabsContent value="orbit" className="mt-0">
          {renderOrbitTab()}
        </TabsContent>

        <TabsContent value="overview" className="mt-0">
          <div className="space-y-4 pb-8">
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
                    {filteredOpportunities.filter(o => !['orbit', 'v2_closed_won', 'v2_closed_lost'].includes(o.stage)).length}
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
                  <Badge variant="secondary" className="text-xs font-medium">{orbitOpps.length}</Badge>
                </div>
                {overviewSections.orbit ? <ChevronUp className="h-4 w-4 text-amber-500" /> : <ChevronDown className="h-4 w-4 text-amber-500" />}
              </button>
              {overviewSections.orbit && (
                <div className="border-t border-gray-200">
                  {renderOrbitTab()}
                </div>
              )}
            </div>
          </div>
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

            const filteredTemplates = templateStageFilter === 'all'
              ? templates
              : templates.filter(t => t.stage === templateStageFilter);

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
                setTemplateForm({ name: '', stage: 'cold_dm', sub_type: 'general', content: '' });
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
                setTemplateForm({ name: '', stage: 'cold_dm', sub_type: 'general', content: '' });
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
              setTemplateForm({ name: t.name, stage: t.stage, sub_type: t.sub_type, content: t.content, variables: t.variables });
              setIsTemplateDialogOpen(true);
            };

            const openCreateDialog = () => {
              setEditingTemplate(null);
              setTemplateForm({ name: '', stage: 'cold_dm', sub_type: 'general', content: '' });
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
                            ? 'bg-[#3e8692] text-white'
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
                        <Card key={t.id} className="overflow-hidden">
                          <CardContent className="p-4 space-y-3">
                            <div className="flex items-start justify-between">
                              <h4 className="font-semibold text-sm text-gray-900 line-clamp-1">{t.name}</h4>
                              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
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
                            <div className="flex items-center gap-2">
                              <Badge className={`${stageColor.bg} ${stageColor.text} text-xs border-0`}>
                                {getStageLabelForTemplate(t.stage)}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {getSubTypeLabel(t.sub_type)}
                              </Badge>
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
                  if (!open) { setEditingTemplate(null); setTemplateForm({ name: '', stage: 'cold_dm', sub_type: 'general', content: '' }); }
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
                          className="auth-input"
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
                            <SelectTrigger className="auth-input"><SelectValue /></SelectTrigger>
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
                            <SelectTrigger className="auth-input"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {getSubTypeOptions(templateForm.stage).map(opt => (
                                <SelectItem key={opt} value={opt}>{getSubTypeLabel(opt)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label>Content</Label>
                        <Textarea
                          value={templateForm.content}
                          onChange={e => setTemplateForm(prev => ({ ...prev, content: e.target.value }))}
                          placeholder="Write your template here... Use [KOL_NAME], [PROJECT_NAME], etc. as placeholders."
                          rows={6}
                          className="auth-input"
                        />
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
              </div>
            );
          })()}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      {renderFormDialog()}
      {renderOrbitPrompt()}
      {renderClosedLostPrompt()}
      {renderTgHandlePrompt()}
      {renderBucketPrompt()}
      {renderActivityLogPrompt()}
    </div>
  );
}
