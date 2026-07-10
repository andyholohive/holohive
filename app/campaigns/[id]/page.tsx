"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getCampaignWeek, getTotalCampaignWeeks, getTotalCampaignWeeksFromCoverage } from "@/lib/campaignWeekHelpers";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
// import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { RequiredAsterisk } from "@/components/ui/required-asterisk";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar as CalendarIcon, Megaphone, Building2, DollarSign, ArrowLeft, CheckCircle, FileText, PauseCircle, BadgeCheck, Phone, Users, Trash2, Plus, Search, Flag, Globe, Loader, Calendar as CalendarIconImport, ChevronLeft, ChevronRight, ChevronDown, BarChart3, Table as TableIcon, Edit, CreditCard, CheckCircle2, XCircle, MapPin, Share2, Copy, ExternalLink, Image as ImageIcon, Video, File, Download, Eye, EyeOff, AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown, Activity, X, Heart, MessageSquare, Repeat2, Bookmark, FileQuestion, Tag, Zap } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CampaignService, CampaignWithDetails } from "@/lib/campaignService";
import {
  BRAND_HEX,
  BRAND_DARK_HEX,
  formatDateLocal,
  formatDateForInput,
  formatDisplayDate,
  displayRegion,
  parseDate,
  getRegionIcon,
  getPlatformIcon,
  getContentTypeColor,
  getCreatorTypeColor,
  getNewContentTypeColor,
  getPricingColor,
} from "@/lib/campaignHelpers";
import { CampaignDetailProvider } from "@/contexts/CampaignDetailContext";
import { AddKOLsDialog } from "@/components/campaign/AddKOLsDialog";
import { MultiSelect } from "@/components/campaign/MultiSelect";
import { RecordPaymentDialog, type RecordPaymentDialogHandle } from "@/components/campaign/RecordPaymentDialog";
import { KolDashboardOverview } from "@/components/campaign/KolDashboardOverview";
import { KolDashboardCardsView } from "@/components/campaign/KolDashboardCardsView";
import { KolDashboardTableView } from "@/components/campaign/KolDashboardTableView";
import { BudgetOverview } from "@/components/campaign/BudgetOverview";
import { BudgetDashboardV2 } from "@/components/campaign/BudgetDashboardV2";
import { BudgetTableView } from "@/components/campaign/BudgetTableView";
import { ContentDashboardOverview } from "@/components/campaign/ContentDashboardOverview";
import { ContentDashboardTableView } from "@/components/campaign/ContentDashboardTableView";
import { ContentSubmissionsBanner } from "@/components/campaign/ContentSubmissionsBanner";
import { MasterKolEditDialog } from "@/components/campaign/MasterKolEditDialog";
import { EditPaymentDialog } from "@/components/campaign/EditPaymentDialog";
import { ShareCampaignDialog } from "@/components/campaign/ShareCampaignDialog";
import { WarningsDialog } from "@/components/campaign/WarningsDialog";
import { EmailViewsDialog } from "@/components/campaign/EmailViewsDialog";
import { PaymentNotifyDialog } from "@/components/campaign/PaymentNotifyDialog";
import { PricingSuggestionDialog } from "@/components/campaign/PricingSuggestionDialog";
import {
  ApprovedAccessCard,
  BudgetEditForm,
  CampaignDetailViewLayout,
  EngagementEditForm,
  ResourcesCard,
} from "@/components/campaign/InformationTabComponents";
import { InformationEditMode } from "@/components/campaign/InformationEditMode";
import { Skeleton } from "@/components/ui/skeleton";
import { UserService } from "@/lib/userService";
import { KOLService, MasterKOL } from "@/lib/kolService";
import { CampaignKOLService, CampaignKOLWithDetails } from "@/lib/campaignKolService";
import SetPaymentTermsDialog from "@/components/campaign/SetPaymentTermsDialog";
import { ClientService } from "@/lib/clientService";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { FileUploadComponent } from '@/components/campaign/FileUploadComponent';
import { ReportTabContent } from '@/components/campaign/ReportTabContent';
import ShowcaseSettingsDialog from './_components/ShowcaseSettingsDialog';
import ContentTagDialog from './_components/ContentTagDialog';
import ActivationSettingsDialog from './_components/ActivationSettingsDialog';
import LineupsTab from '@/components/campaign/LineupsTab';
import { AddActivationDialog } from '@/components/campaign/AddActivationDialog';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/lib/dateFormat';

/**
 * Columns the user can sort the KOL Dashboard table by. Adding a new
 * sortable column = add it here + add a case in compareKolByColumn +
 * make the corresponding TableHead clickable.
 */
type KolSortKey =
  | 'name' | 'followers' | 'region' | 'platform' | 'creator_type'
  | 'content_type' | 'deliverables' | 'pricing' | 'hh_status' | 'budget_type'
  | 'budget' | 'paid' | 'date_added';

/**
 * KOL workflow stages, in journey order. The default sort on the KOL
 * Dashboard uses this so rows appear Curated → Contacted → Interested →
 * Onboarded → Concluded (natural pipeline order), not alphabetical
 * (which would surface Concluded ahead of Onboarded — nonsense).
 *
 * Mirrored in app/public/campaigns/[id]/page.tsx — keep both in sync.
 */
// `BRAND_HEX` + `BRAND_DARK_HEX` moved to `lib/campaignHelpers.tsx`.

const KOL_STATUS_ORDER = ['Curated', 'Contacted', 'Interested', 'Onboarded', 'Concluded'] as const;
const statusOrderIndex = (s: string | null | undefined): number => {
  if (!s) return KOL_STATUS_ORDER.length; // unknown → end
  const idx = KOL_STATUS_ORDER.indexOf(s as any);
  return idx === -1 ? KOL_STATUS_ORDER.length : idx;
};

/**
 * Per-column comparator. Strings → localeCompare, numbers → numeric,
 * arrays → join+localeCompare, missing → push to end of asc / top of desc.
 * Stable ordering for equal values is handled by the caller via
 * decorate-sort-undecorate.
 */
function compareKolByColumn(a: any, b: any, key: KolSortKey): number {
  const pull = (row: any) => {
    switch (key) {
      case 'name':         return row.master_kol?.name || '';
      case 'followers':    return row.master_kol?.followers ?? null;
      case 'region':       return row.master_kol?.region || '';
      case 'platform':     return (row.master_kol?.platform || []).join(', ');
      case 'creator_type': return (row.master_kol?.creator_type || []).join(', ');
      case 'content_type': return (row.master_kol?.content_type || []).join(', ');
      case 'deliverables': return (row.deliverables || row.master_kol?.deliverables || []).join(', ');
      case 'pricing':      return row.master_kol?.post_price ?? null;
      // Sort by workflow stage, not alphabetically. See KOL_STATUS_ORDER.
      case 'hh_status':    return statusOrderIndex(row.hh_status);
      case 'budget_type':  return row.budget_type || '';
      case 'budget':       return row.budget ?? null;
      case 'paid':         return row.paid ?? null;
      case 'date_added':   return row.created_at ? new Date(row.created_at).getTime() : null;
      default:             return '';
    }
  };
  const A = pull(a);
  const B = pull(b);
  // Nullish always sorts last (ascending) — flips automatically when dir=-1
  if (A === null || A === undefined || A === '') return 1;
  if (B === null || B === undefined || B === '') return -1;
  if (typeof A === 'number' && typeof B === 'number') return A - B;
  return String(A).localeCompare(String(B));
}


// [Campaign Live v1] Preset phases for the Current Phase dropdown on the
// campaign edit form. Backed by campaigns.current_phase (mig 078). Order
// reflects the typical KOL campaign lifecycle. Free-text values entered
// via SQL still render in the client portal — the dropdown just enforces
// consistency at the UI layer.
const CURRENT_PHASE_OPTIONS = [
  'Setup',
  'Seeding Phase',
  'Amplification Phase',
  'Activation Phase',
  'Reporting Phase',
] as const;

/**
 * v11 tone map for the campaign-level status pill rendered in the
 * editorial hero. Centralizes the four `campaigns.status` enum values
 * onto the shared `<StatusBadge>` palette so the hero and any future
 * surface that needs a campaign-status chip stay in lockstep.
 *
 * - Active → brand teal (the featured / operationally-important state)
 * - Planning → info sky (in-progress / setup)
 * - Paused → warning amber (needs attention)
 * - Completed → success emerald (good news)
 */
const CAMPAIGN_STATUS_TONES: Record<string, BadgeTone> = {
  Active: 'brand',
  Planning: 'info',
  Paused: 'warning',
  Completed: 'success',
};

const CampaignDetailsPage = () => {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  // Current logged-in user — needed to attribute Lineup Manager
  // actions (proposed_by / confirmed_by / actor on the audit log).
  const { userProfile } = useAuth();
  // Extend CampaignWithDetails inline for local use
  type CampaignDetails = CampaignWithDetails;
  const [campaign, setCampaign] = useState<CampaignDetails | null>(null);
  // [Stint-scoped Week N of M] Client's max covered_through — used by
  // the hero pill to show weeks-until-engagement-end instead of just
  // weeks-until-campaign-end. Falls back to campaign.end_date when the
  // client has no stint coverage yet.
  const [clientCoveredThrough, setClientCoveredThrough] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allClients, setAllClients] = useState<any[]>([]);
  const regionOptions = KOLService.getFieldOptions().regions;

  // Campaign KOLs state
  const [campaignKOLs, setCampaignKOLs] = useState<any[]>([]);
  const [availableKOLs, setAvailableKOLs] = useState<any[]>([]);
  const [loadingKOLs, setLoadingKOLs] = useState(false);

  // Lookup for the Budget tab's payment table — `Map<campaign_kol_id,
  // { name, removed }>`. Includes soft-deleted KOLs so historical
  // payments still show the KOL's name (with a "(removed)" suffix)
  // instead of "Unknown KOL". Refreshed whenever the active roster
  // is refreshed (delete, add, status change) so the budget table
  // updates in lockstep with the KOL Dashboard.
  const [paymentKolNameLookup, setPaymentKolNameLookup] = useState<Map<string, { name: string; removed: boolean }>>(new Map());
  const [searchTerm, setSearchTerm] = useState('');
  const [kolFilters, setKolFilters] = useState({
    platform: [] as string[],
    region: [] as string[],
    creator_type: [] as string[],
    content_type: [] as string[],
    hh_status: [] as string[],
    budget_type: [] as string[],
    followers_operator: '' as string,
    followers_value: '' as string,
    budget_operator: '' as string,
    budget_value: '' as string,
    paid_operator: '' as string,
    paid_value: '' as string
  });
  // `isAddingKOLs` / `newKOLData` removed 2026-06-02 — they're now
  // internal to <AddKOLsDialog>. Only `isAddKOLsDialogOpen` lives at
  // the page level (passed in as the `open` prop).
  // `editingKolCell` / `editingKolValue` also removed 2026-06-02 —
  // moved into <KolDashboardTableView>.

  const [editMode, setEditMode] = useState(false);
  // Per-card inline edit mode for the view-mode layout — replaces
  // the page-level "Edit" button with smaller per-card affordances.
  // null = nothing being edited; otherwise the slug of the card
  // that's open for inline edits (engagement | budget | approved).
  // Resources has its own internal add/edit flow (see ResourcesCard).
  const [editingCard, setEditingCard] = useState<null | 'engagement' | 'budget' | 'approved'>(null);
  const [form, setForm] = useState<CampaignDetails | null>(null);
  const [saving, setSaving] = useState(false);
  // KOL Dashboard is the default landing tab — that's what users open
  // a campaign to look at. "information" was the legacy default but
  // less useful as a starting point for day-to-day work.
  const [activeTab, setActiveTab] = useState("kols");
  // Deep-link support: opening with ?tab=lineups (e.g. from the
  // Lineup Manager bot notification's review link) lands directly
  // on the Lineups tab. Runs once on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    if (tabParam && ['information', 'kols', 'contents', 'lineups', 'payments'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, []);

  // Master KOL edit dialog (opened by clicking the edit pencil next to
  // a KOL name in the table view). Edits the underlying master_kols row,
  // not the campaign-specific overlay — same data shown on /kols.
  const [editingMasterKol, setEditingMasterKol] = useState<MasterKOL | null>(null);
  // `masterKolForm`/`savingMasterKol` moved into <MasterKolEditDialog>.

  // `kolSort`, `editingCell`, `editingValue` moved into
  // <KolDashboardTableView> on 2026-06-02.
  // Track allocation edits
  const [allocations, setAllocations] = useState<any[]>([]);
  const [deletedAllocIds, setDeletedAllocIds] = useState<string[]>([]);

  // Track cell selection for copy/paste
  const [selectedCell, setSelectedCell] = useState<{ table: string; rowId: string; field: string; value: any } | null>(null);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [copiedCell, setCopiedCell] = useState<{ table: string; rowId: string; field: string } | null>(null);

  // Sticky scrollbar state
  const [stickyScrollbar, setStickyScrollbar] = useState<{
    visible: boolean;
    width: number;
    scrollWidth: number;
    scrollLeft: number;
    tableId: string;
    opacity: number;
  } | null>(null);
  const kolTableRef = useRef<HTMLDivElement>(null);
  const contentTableRef = useRef<HTMLDivElement>(null);
  const paymentTableRef = useRef<HTMLDivElement>(null);
  const kolScrollableRef = useRef<HTMLElement | null>(null);
  const contentScrollableRef = useRef<HTMLElement | null>(null);
  const paymentScrollableRef = useRef<HTMLElement | null>(null);
  
  // KOLs view toggle state
  const [kolViewMode, setKolViewMode] = useState<'overview' | 'table' | 'graph'>('overview');

  // KOL visibility tab state (active vs hidden)
  const [kolVisibilityTab, setKolVisibilityTab] = useState<'active' | 'hidden'>('active');

  // Payments view toggle state
  // paymentViewMode removed 2026-06-16 — Budget tab no longer has the
  // Overview/Table toggle; Overview renders above the table permanently.

  // Information tab toggle state
  const [informationViewMode, setInformationViewMode] = useState<'overview' | 'metrics'>('overview');

  // Contents tab toggle state
  const [contentsViewMode, setContentsViewMode] = useState<'overview' | 'table'>('overview');

  // Content-list state hoisted here (used to be declared at line ~2573,
  // after the places that call it). `getPaymentStatus` below reads
  // `contents` to decide if a payment is overdue, and `overdueCount`
  // at the top of the component calls getPaymentStatus during render.
  // If `contents` is declared below that call site, the render crashes
  // with a TDZ ReferenceError on any campaign where payments have
  // content_ids linked. Keep this state up here.
  const [contents, setContents] = useState<any[]>([]);
  const [loadingContents, setLoadingContents] = useState(false);

  // Payments state
  const [payments, setPayments] = useState<any[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [isAddingPayment, setIsAddingPayment] = useState(false);
  // Imperative handle to the extracted RecordPaymentDialog so the
  // page-level pricing-suggestion sub-dialog can push an accepted
  // amount back into the dialog's internal form state (the dialog
  // owns `multiKOLPayments`; the page can't reach it directly).
  const recordPaymentDialogRef = useRef<RecordPaymentDialogHandle>(null);
  const [isEditingPayment, setIsEditingPayment] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  // `selectedPayments` / `bulkPaymentMethod` / `paymentsSearchTerm`
  // moved into <BudgetTableView> on 2026-06-02.

  // Report state
  const [reportFiles, setReportFiles] = useState<any[]>([]);
  const [loadingReportFiles, setLoadingReportFiles] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  const [shareReportPublicly, setShareReportPublicly] = useState(false);

  // `newPaymentData` moved into <EditPaymentDialog>.

  // `selectedKOLsForPayment`, `multiKOLPayments`, `paymentType`,
  // `nonKOLPayment` moved into <RecordPaymentDialog> on 2026-06-02.
  // The dialog owns its own form state internally; the page only
  // owns `isAddingPayment` (the open/close flag).

  // `paymentFilters` / `editingPaymentCell` / `editingPaymentValue`
  // moved into <BudgetTableView> on 2026-06-02.

  // Email views state
  const [isEmailViewsDialogOpen, setIsEmailViewsDialogOpen] = useState(false);
  // viewed_at is nullable in the DB; mark it here so the setter below
  // doesn't need a cast. See lists/page.tsx for the parallel pattern.
  const [emailViews, setEmailViews] = useState<Array<{
    id: string;
    email: string;
    viewed_at: string | null;
    user_agent: string | null;
  }>>([]);
  const [loadingEmailViews, setLoadingEmailViews] = useState(false);

  // Approved emails state
  const [emailInput, setEmailInput] = useState('');

  // Payment notification state
  const [kolTelegramChats, setKolTelegramChats] = useState<Record<string, { chat_id: string; title: string | null }>>({});
  const [paymentNotifyDialogOpen, setPaymentNotifyDialogOpen] = useState(false);
  const [pendingPaymentNotification, setPendingPaymentNotification] = useState<{
    kolId: string;
    kolName: string;
    paymentIndex: number;
    amount: number;
    wallet: string;
    chatId: string;
    chatTitle: string | null;
    date: Date;
  } | null>(null);
  const [sendingPaymentNotification, setSendingPaymentNotification] = useState(false);
  const [paymentNotificationMessage, setPaymentNotificationMessage] = useState('');
  const [isEditingPaymentMessage, setIsEditingPaymentMessage] = useState(false);

  // Latest pricing suggestion state
  const [latestCostMap, setLatestCostMap] = useState<Map<string, number>>(new Map());
  const [pricingSuggestionDialog, setPricingSuggestionDialog] = useState<{
    open: boolean;
    kolId: string;
    kolName: string;
    masterKolId: string;
    latestCost: number;
    paymentIndex: number;
    // For content-created payments, we track payment IDs instead of index
    paymentIds?: string[];
    mode: 'payment-dialog' | 'content-created';
  } | null>(null);

  // Payment terms dialog state — fires when a KOL is onboarded but has no agreed_rate yet
  const [paymentTermsDialog, setPaymentTermsDialog] = useState<{
    open: boolean;
    campaignKolId: string;
    masterKolId: string | null | undefined;
    kolName: string;
    latestPaymentAmount?: number | null;
    masterStandardRate?: number | null;
    currentAgreedRate?: number | null;
  } | null>(null);

  // Queue of KOLs waiting to have payment terms set (used for bulk onboarding).
  // After the current dialog closes, the next item in the queue opens.
  const [paymentTermsQueue, setPaymentTermsQueue] = useState<string[]>([]);

  // Column resize state for KOLs table
  // Remove columnWidths, isResizing, resizingColumn
  // Remove all style={{ width: ... }}, minWidth, maxWidth from TableHead and TableCell
  // Set tableLayout to 'auto' or remove it from <Table>

  // Styling functions for KOL table display
  // Pure helpers — `getRegionIcon`, `getPlatformIcon`,
  // `getContentTypeColor`, `getCreatorTypeColor`, `getNewContentTypeColor`,
  // `getPricingColor` — moved to `lib/campaignHelpers.tsx` as part of
  // the 2026-06-02 structural pass so the dialogs / tab components
  // being extracted under `components/campaign/*` can share them
  // without prop-drilling through the page component.

  const budgetTypeOptions = ["Token", "Fiat", "WL"];

  const nextUpdate = () => {
    setCurrentUpdateIndex((prev) =>
      prev === campaignUpdates.length - 1 ? 0 : prev + 1
    );
  };

  const prevUpdate = () => {
    setCurrentUpdateIndex((prev) =>
      prev === 0 ? campaignUpdates.length - 1 : prev - 1
    );
  };

  useEffect(() => {
    const fetchCampaign = async () => {
      try {
        setLoading(true);
        // Support both UUID and slug in URL
        const fetchedCampaign = await CampaignService.getCampaignByIdOrSlug(id);
        setCampaign(fetchedCampaign);
        if (fetchedCampaign) {
          setShareReportPublicly(fetchedCampaign.share_report_publicly || false);
        }
      } catch (err) {
        setError("Failed to fetch campaign details");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchCampaign();
  }, [id]);

  // [Stint-scoped Week N of M] Fetch max covered_through for this campaign's
  // client so the hero pill's "of M" reflects engagement end, not campaign end.
  useEffect(() => {
    if (!campaign?.client_id) return;
    (async () => {
      const { data } = await (supabase as any)
        .from('client_coverage')
        .select('covered_through')
        .eq('client_id', campaign.client_id);
      const max = ((data as Array<{ covered_through: string | null }> | null) ?? [])
        .map(r => r.covered_through)
        .filter((d): d is string => !!d)
        .sort()
        .pop() ?? null;
      setClientCoveredThrough(max);
    })();
  }, [campaign?.client_id]);

  useEffect(() => {
    UserService.getActiveUsers().then(setAllUsers);
    ClientService.getAllClients().then(setAllClients);
  }, []);

  useEffect(() => {
    if (activeTab === 'report') {
      fetchReportFiles();
      fetchReportData();
    }
  }, [activeTab, id]);

  // Fetch campaign KOLs when campaign changes
  useEffect(() => {
    if (campaign) {
      fetchCampaignKOLs();
      fetchAvailableKOLs();
      fetchCampaignUpdates();
      fetchPayments();
      fetchKolTelegramChats();
      fetchLatestCosts();
    }
  }, [campaign]);

  // Handle keyboard events for copy/paste
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Check if Ctrl+C or Cmd+C (copy)
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedCell) {
        e.preventDefault();
        try {
          const textToCopy = String(selectedCell.value || '');
          await navigator.clipboard.writeText(textToCopy);
          setCopiedValue(textToCopy);
          setCopiedCell({ table: selectedCell.table, rowId: selectedCell.rowId, field: selectedCell.field });
          toast({
            title: 'Copied',
            description: `Copied: ${textToCopy.substring(0, 50)}${textToCopy.length > 50 ? '...' : ''}`,
            duration: 1500,
          });
        } catch (err) {
          console.error('Failed to copy:', err);
        }
      }

      // Check if Ctrl+V or Cmd+V (paste)
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && selectedCell && copiedValue !== null) {
        e.preventDefault();
        try {
          const text = copiedValue;
          // Handle paste based on table type
          if (selectedCell.table === 'kols') {
            const kol = campaignKOLs.find(k => k.id === selectedCell.rowId);
            if (kol) {
              // Determine which table and field to update
              const masterKolFields = ['name', 'followers'];
              const campaignKolFieldMapping: { [key: string]: string } = {
                'budget': 'allocated_budget',
                'wallet': 'wallet',
                'notes': 'notes'
              };

              // Skip read-only fields
              if (selectedCell.field === 'paid') {
                toast({
                  title: 'Cannot paste',
                  description: 'This field is read-only',
                  variant: 'destructive',
                  duration: 1500,
                });
                return;
              }

              if (masterKolFields.includes(selectedCell.field)) {
                // Update master_kols table
                const updateField = selectedCell.field;
                const updateValue = selectedCell.field === 'followers' ? parseInt(text) || 0 : text;

                await supabase
                  .from('master_kols')
                  .update({ [updateField]: updateValue })
                  .eq('id', kol.master_kol.id);
              } else if (campaignKolFieldMapping[selectedCell.field]) {
                // Update campaign_kols table
                const dbField = campaignKolFieldMapping[selectedCell.field];
                const updateValue = selectedCell.field === 'budget' ? parseFloat(text) || null : text;

                await supabase
                  .from('campaign_kols')
                  .update({ [dbField]: updateValue })
                  .eq('id', selectedCell.rowId);
              }

              // Refresh data
              fetchCampaignKOLs();

              // Clear copied cell styling after paste
              setCopiedCell(null);

              toast({
                title: 'Pasted',
                description: 'Cell value updated',
                duration: 1500,
              });
            }
          } else if (selectedCell.table === 'contents') {
            const content = contents.find(c => c.id === selectedCell.rowId);
            if (content) {
              // Determine the appropriate value type
              const numberFields = ['impressions', 'likes', 'retweets', 'comments', 'bookmarks'];
              let updateValue: any = text;

              if (numberFields.includes(selectedCell.field)) {
                updateValue = parseInt(text) || null;
              } else if (selectedCell.field === 'activation_date') {
                // Validate date format
                updateValue = text;
              }

              await supabase
                .from('contents')
                .update({ [selectedCell.field]: updateValue })
                .eq('id', selectedCell.rowId);

              // Refresh contents
              if (campaign?.id) {
                const { data, error } = await supabase
                  .from('contents')
                  .select('*')
                  .eq('campaign_id', campaign.id);
                if (!error && data) {
                  setContents(data);
                }
              }

              // Clear copied cell styling after paste
              setCopiedCell(null);

              toast({
                title: 'Pasted',
                description: 'Cell value updated',
                duration: 1500,
              });
            }
          } else if (selectedCell.table === 'payments') {
            const payment = payments.find(p => p.id === selectedCell.rowId);
            if (payment) {
              // Skip read-only KOL name field
              if (selectedCell.field === 'kol_name') {
                toast({
                  title: 'Cannot paste',
                  description: 'KOL name is read-only',
                  variant: 'destructive',
                  duration: 1500,
                });
                return;
              }

              // Determine the appropriate value type
              let updateValue: any = text;
              if (selectedCell.field === 'amount') {
                updateValue = parseFloat(text) || 0;
              } else if (selectedCell.field === 'payment_date') {
                // Validate date format
                updateValue = text;
              }

              await supabase
                .from('payments')
                .update({ [selectedCell.field]: updateValue })
                .eq('id', selectedCell.rowId);

              fetchPayments();

              // Clear copied cell styling after paste
              setCopiedCell(null);

              toast({
                title: 'Pasted',
                description: 'Cell value updated',
                duration: 1500,
              });
            }
          }
        } catch (err) {
          console.error('Failed to paste:', err);
          toast({
            title: 'Paste failed',
            description: err instanceof Error ? err.message : 'Failed to paste value',
            variant: 'destructive',
          });
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedCell, copiedValue]);

  // Handle horizontal scroll with Shift+Wheel and update sticky scrollbar
  useEffect(() => {
    const handleWheel = (e: WheelEvent, tableRef: React.RefObject<HTMLDivElement>) => {
      if (e.shiftKey && tableRef.current) {
        e.preventDefault();
        tableRef.current.scrollLeft += e.deltaY;
      }
    };

    // Function to find the actual scrollable element
    const findScrollableElement = (container: HTMLElement): HTMLElement | null => {
      if (container.scrollWidth > container.clientWidth) {
        return container;
      }

      const allElements = container.querySelectorAll('*');
      for (const el of Array.from(allElements)) {
        const htmlEl = el as HTMLElement;
        if (htmlEl.scrollWidth > htmlEl.clientWidth) {
          return htmlEl;
        }
      }

      return null;
    };

    const updateStickyScrollbar = () => {
      const tables = [
        { ref: kolTableRef, scrollableRef: kolScrollableRef, id: 'kols' },
        { ref: contentTableRef, scrollableRef: contentScrollableRef, id: 'contents' },
        { ref: paymentTableRef, scrollableRef: paymentScrollableRef, id: 'payments' }
      ];

      let foundVisibleTable = false;

      for (const table of tables) {
        if (!table.ref.current) continue;

        const container = table.ref.current;
        const scrollableElement = findScrollableElement(container);

        if (scrollableElement) {
          table.scrollableRef.current = scrollableElement;

          const rect = container.getBoundingClientRect();
          const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;

          if (isInViewport) {
            // Calculate opacity based on distance to bottom of page
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const windowHeight = window.innerHeight;
            const documentHeight = document.documentElement.scrollHeight;
            const distanceFromBottom = documentHeight - (scrollTop + windowHeight);

            // Check if page has scrollable content
            const hasVerticalScroll = documentHeight > windowHeight + 10; // 10px threshold

            const fadeThreshold = 100;
            let opacity = 1; // Default to fully visible

            // Only fade if page actually has vertical scrolling
            if (hasVerticalScroll) {
              if (distanceFromBottom < fadeThreshold && distanceFromBottom > 0) {
                // Between 0 and threshold - proportional fade
                opacity = distanceFromBottom / fadeThreshold;
              } else if (distanceFromBottom <= 0) {
                // At or past the bottom - fully faded
                opacity = 0;
              }
            }

            setStickyScrollbar({
              visible: true,
              width: scrollableElement.clientWidth,
              scrollWidth: scrollableElement.scrollWidth,
              scrollLeft: scrollableElement.scrollLeft,
              tableId: table.id,
              opacity: opacity
            });
            foundVisibleTable = true;
            break;
          }
        }
      }

      if (!foundVisibleTable) {
        setStickyScrollbar(null);
      }
    };

    const kolWheel = (e: WheelEvent) => handleWheel(e, kolTableRef);
    const contentWheel = (e: WheelEvent) => handleWheel(e, contentTableRef);
    const paymentWheel = (e: WheelEvent) => handleWheel(e, paymentTableRef);

    // Function to attach listeners when elements exist
    const attachListeners = () => {
      const kolEl = kolTableRef.current;
      const contentEl = contentTableRef.current;
      const paymentEl = paymentTableRef.current;

      if (kolEl && !kolEl.hasAttribute('data-scroll-listeners')) {
        kolEl.addEventListener('wheel', kolWheel, { passive: false });
        kolEl.addEventListener('scroll', updateStickyScrollbar);
        kolEl.setAttribute('data-scroll-listeners', 'true');
        console.log('[Sticky Scrollbar] Attached listeners to kols table');
      }
      if (contentEl && !contentEl.hasAttribute('data-scroll-listeners')) {
        contentEl.addEventListener('wheel', contentWheel, { passive: false });
        contentEl.addEventListener('scroll', updateStickyScrollbar);
        contentEl.setAttribute('data-scroll-listeners', 'true');
        console.log('[Sticky Scrollbar] Attached listeners to contents table');
      }
      if (paymentEl && !paymentEl.hasAttribute('data-scroll-listeners')) {
        paymentEl.addEventListener('wheel', paymentWheel, { passive: false });
        paymentEl.addEventListener('scroll', updateStickyScrollbar);
        paymentEl.setAttribute('data-scroll-listeners', 'true');
        console.log('[Sticky Scrollbar] Attached listeners to payments table');
      }
    };

    // Attach listeners immediately and on each check
    attachListeners();

    window.addEventListener('scroll', updateStickyScrollbar);
    window.addEventListener('resize', updateStickyScrollbar);

    // Combined check function
    const checkAndAttach = () => {
      attachListeners();
      updateStickyScrollbar();
    };

    // Initial check with multiple attempts to catch when tables render
    const timer1 = setTimeout(checkAndAttach, 100);
    const timer2 = setTimeout(checkAndAttach, 500);
    const timer3 = setTimeout(checkAndAttach, 1000);

    // Periodic check to ensure we catch tables when they load
    const interval = setInterval(checkAndAttach, 2000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearInterval(interval);

      // Clean up listeners
      const kolEl = kolTableRef.current;
      const contentEl = contentTableRef.current;
      const paymentEl = paymentTableRef.current;

      kolEl?.removeEventListener('wheel', kolWheel);
      contentEl?.removeEventListener('wheel', contentWheel);
      paymentEl?.removeEventListener('wheel', paymentWheel);
      kolEl?.removeEventListener('scroll', updateStickyScrollbar);
      contentEl?.removeEventListener('scroll', updateStickyScrollbar);
      paymentEl?.removeEventListener('scroll', updateStickyScrollbar);

      window.removeEventListener('scroll', updateStickyScrollbar);
      window.removeEventListener('resize', updateStickyScrollbar);
    };
  }, [activeTab, kolViewMode, contentsViewMode]); // Re-check when switching tabs or view modes

  const fetchCampaignKOLs = async () => {
    if (!campaign) return;
    try {
      setLoadingKOLs(true);
      // Two queries in parallel: the active roster (filtered by
      // deleted_at IS NULL) for everywhere else, and the full set
      // (including soft-deleted rows) for the Budget tab's payment
      // name lookup. Fetching both here keeps the two views in
      // lockstep after any add/delete/status change.
      const [kols, allKols, activationRows] = await Promise.all([
        CampaignKOLService.getCampaignKOLs(campaign.id),
        CampaignKOLService.getCampaignKOLsWithDeleted(campaign.id),
        // [2026-06-16] HHP Campaign Dashboard § 2 GAP — activation-recency
        // status from the campaign_kol_activation_status view (latest
        // confirmed / completed lineup per KOL). Joined client-side so
        // the rest of the campaign_kols fetch shape stays unchanged.
        (supabase as any)
          .from('campaign_kol_activation_status')
          .select('campaign_kol_id, active_week_number, last_active_week_number')
          .eq('campaign_id', campaign.id),
      ]);
      // Build the activation lookup so we can stamp each KOL row with
      // its recency state. Map shape: campaign_kol_id → {active, last}.
      const activationByCkId = new Map<string, { active: number | null; last: number | null }>();
      for (const row of (activationRows?.data ?? []) as any[]) {
        activationByCkId.set(row.campaign_kol_id, {
          active: row.active_week_number ?? null,
          last: row.last_active_week_number ?? null,
        });
      }
      const decorate = (k: any) => {
        const a = activationByCkId.get(k.id) ?? { active: null, last: null };
        return { ...k, activation_active_week: a.active, activation_last_week: a.last };
      };
      // If payments are loaded, map paid from sums; else set directly
      if (payments && payments.length > 0) {
        const sums = computePaymentSums(payments);
        setCampaignKOLs(kols.map(k => decorate({ ...k, paid: sums[k.id] || 0 })));
      } else {
        setCampaignKOLs(kols.map(decorate));
      }
      // Build the payment-name lookup. Each campaign_kol id maps to
      // { name, removed } so the Budget table can render
      // "Alice" or "Alice (removed)" as appropriate.
      const lookup = new Map<string, { name: string; removed: boolean }>();
      for (const k of allKols as any[]) {
        const name = k.master_kol?.name || 'Unknown KOL';
        const removed = !!k.deleted_at;
        lookup.set(k.id, { name, removed });
      }
      setPaymentKolNameLookup(lookup);
    } catch (error) {
      console.error('Error fetching campaign KOLs:', error);
    } finally {
      setLoadingKOLs(false);
    }
  };

  const fetchAvailableKOLs = async () => {
    if (!campaign) return;
    try {
      const kols = await CampaignKOLService.getAvailableKOLs(campaign.id);
      setAvailableKOLs(kols);
    } catch (error) {
      console.error('Error fetching available KOLs:', error);
    }
  };

  // Fetch latest costs for all KOLs (most recent payment amount per master_kol_id)
  const fetchLatestCosts = async () => {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('amount, payment_date, campaign_kol:campaign_kols!inner(master_kol_id)')
        .order('payment_date', { ascending: false });

      if (!error && data) {
        const map = new Map<string, number>();
        for (const row of data) {
          const masterKolId = (row.campaign_kol as any)?.master_kol_id;
          if (masterKolId && !map.has(masterKolId)) {
            map.set(masterKolId, row.amount);
          }
        }
        setLatestCostMap(map);
      }
    } catch (err) {
      console.error('Error fetching latest costs:', err);
    }
  };

  const fetchCampaignUpdates = async () => {
    if (!campaign) return;
    try {
      setLoadingUpdates(true);
      const { data, error } = await supabase
        .from('campaign_updates')
        .select('*')
        .eq('campaign_id', campaign.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setCampaignUpdates(data || []);
    } catch (error) {
      console.error('Error fetching campaign updates:', error);
      setCampaignUpdates([]);
    } finally {
      setLoadingUpdates(false);
    }
  };

  // `handleAddKOLs` moved into <AddKOLsDialog> on 2026-06-02 — the
  // dialog calls `fetchCampaignKOLs` / `fetchAvailableKOLs` via the
  // campaign-detail context after a successful insert.

  // Open the payment terms dialog for a specific campaign_kol.
  // Reads the latest KOL state from the current campaignKOLs list.
  const openPaymentTermsForKol = (kolId: string, list?: CampaignKOLWithDetails[]) => {
    const source = list || campaignKOLs;
    const kol = source.find(k => k.id === kolId);
    if (!kol) return false;
    if ((kol.agreed_rate ?? null) !== null) return false; // already set
    const masterKolId = kol.master_kol?.id ?? null;
    const latest = masterKolId ? latestCostMap.get(masterKolId) ?? null : null;
    setPaymentTermsDialog({
      open: true,
      campaignKolId: kol.id,
      masterKolId,
      kolName: kol.master_kol?.name || 'this KOL',
      latestPaymentAmount: latest,
      masterStandardRate: kol.master_kol?.standard_rate ?? null,
      currentAgreedRate: kol.agreed_rate ?? null,
    });
    return true;
  };

  // `handleUpdateKOLStatus`, `handleDeleteKOL`, `handleToggleKOLHidden`
  // moved into <KolDashboardTableView> on 2026-06-02.

  // MultiSelect component
  // `MultiSelect` moved to `components/campaign/MultiSelect.tsx`.

  const filteredKOLs = campaignKOLs.filter(kol => {
    // Hidden/Active filter based on visibility tab
    const matchesVisibility = kolVisibilityTab === 'active' ? !kol.hidden : kol.hidden === true;

    // Search term filter
    const matchesSearch = !searchTerm || (
      kol.master_kol.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      kol.hh_status.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (kol.notes && kol.notes.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // Platform filter
    const matchesPlatform = kolFilters.platform.length === 0 ||
      (kol.master_kol.platform && kolFilters.platform.some(p => kol.master_kol.platform.includes(p)));

    // Region filter
    const matchesRegion = kolFilters.region.length === 0 ||
      (kol.master_kol.region && kolFilters.region.includes(kol.master_kol.region));

    // Creator Type filter
    const matchesCreatorType = kolFilters.creator_type.length === 0 ||
      (kol.master_kol.creator_type && kolFilters.creator_type.some(ct => kol.master_kol.creator_type.includes(ct)));

    // Content Type filter
    const matchesContentType = kolFilters.content_type.length === 0 ||
      (kol.master_kol.content_type && kolFilters.content_type.some(ct => kol.master_kol.content_type.includes(ct)));

    // HH Status filter
    const matchesStatus = kolFilters.hh_status.length === 0 ||
      (kol.hh_status && kolFilters.hh_status.includes(kol.hh_status));

    // Budget Type filter
    const matchesBudgetType = kolFilters.budget_type.length === 0 ||
      (kol.budget_type && kolFilters.budget_type.includes(kol.budget_type));

    // Followers filter
    const matchesFollowers = !kolFilters.followers_operator || !kolFilters.followers_value || (() => {
      const followers = kol.master_kol.followers || 0;
      const value = parseFloat(kolFilters.followers_value);
      if (isNaN(value)) return true;
      switch (kolFilters.followers_operator) {
        case '>': return followers > value;
        case '<': return followers < value;
        case '=': return followers === value;
        default: return true;
      }
    })();

    // Budget filter
    const matchesBudget = !kolFilters.budget_operator || !kolFilters.budget_value || (() => {
      const budget = kol.allocated_budget || 0;
      const value = parseFloat(kolFilters.budget_value);
      if (isNaN(value)) return true;
      switch (kolFilters.budget_operator) {
        case '>': return budget > value;
        case '<': return budget < value;
        case '=': return budget === value;
        default: return true;
      }
    })();

    // Paid filter
    const matchesPaid = !kolFilters.paid_operator || !kolFilters.paid_value || (() => {
      const paid = kol.paid || 0;
      const value = parseFloat(kolFilters.paid_value);
      if (isNaN(value)) return true;
      switch (kolFilters.paid_operator) {
        case '>': return paid > value;
        case '<': return paid < value;
        case '=': return paid === value;
        default: return true;
      }
    })();

    return matchesVisibility && matchesSearch && matchesPlatform && matchesRegion && matchesCreatorType && matchesContentType &&
           matchesStatus && matchesBudgetType && matchesFollowers && matchesBudget && matchesPaid;
  });

  // ─── Sortable columns for the KOL Dashboard table view ──────────────
  // Click a column header to sort; click again to flip direction. Falls
  // back to original (created/insertion) order when no sort is active.
  // `sortedKOLs` derivation moved into <KolDashboardTableView> on
  // 2026-06-02. The page only passes `filteredKOLs` to the component
  // and lets it own its own sort state internally.
  useEffect(() => {
    if (campaign?.budget_allocations) {
      setAllocations(campaign.budget_allocations.map(a => ({ ...a })));
      setDeletedAllocIds([]);
    }
  }, [campaign, editMode]);

  useEffect(() => {
    if (campaign) setForm(campaign);
  }, [campaign]);

  const handleEdit = () => setEditMode(true);

  // Inline campaign rename — the Overview/Information tab (which holds the
  // full edit form) is hidden, so this pencil next to the title is the
  // visible rename path. Non-guest only. [2026-07-09]
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameIsTest, setRenameIsTest] = useState(false);
  const [renameSaving, setRenameSaving] = useState(false);
  const handleRenameSave = async () => {
    if (!campaign) return;
    const next = renameValue.trim();
    const nextIsTest = renameIsTest;
    const nameChanged = !!next && next !== campaign.name;
    const testChanged = nextIsTest !== !!(campaign as any).is_test;
    if (!nameChanged && !testChanged) { setRenameOpen(false); return; }
    setRenameSaving(true);
    try {
      const updates: { name?: string; is_test?: boolean } = {};
      if (nameChanged) updates.name = next;
      if (testChanged) updates.is_test = nextIsTest;
      await CampaignService.updateCampaign(campaign.id, updates);
      setCampaign({ ...campaign, ...(nameChanged ? { name: next } : {}), is_test: nextIsTest } as any);
      toast({ title: 'Campaign updated' });
      setRenameOpen(false);
    } catch (err: any) {
      toast({ title: 'Update failed', description: err?.message, variant: 'destructive' });
    } finally {
      setRenameSaving(false);
    }
  };

  const handleCancel = () => {
    setEditMode(false);
    setForm(campaign);
  };
  const handleChange = (field: keyof CampaignDetails, value: any) => {
    setForm((prev: CampaignDetails | null) => prev ? { ...prev, [field]: value } : prev);
  };

  // Report functions
  const fetchReportFiles = async () => {
    if (!id || !campaign?.id) return;
    setLoadingReportFiles(true);
    try {
      const { data, error } = await supabase
        .from('campaign_report_files')
        .select('*')
        .eq('campaign_id', campaign.id)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setReportFiles(data || []);
    } catch (err) {
      console.error('Error fetching report files:', err);
      toast({ title: 'Load failed', description: err instanceof Error ? err.message : 'Failed to fetch report files', variant: 'destructive' });
    } finally {
      setLoadingReportFiles(false);
    }
  };

  const fetchReportData = async () => {
    if (!id || !campaign?.id) return;
    try {
      const { data, error } = await supabase
        .from('campaign_reports')
        .select('*')
        .eq('campaign_id', campaign.id)
        .single();

      if (data) {
        setCustomMessage(data.custom_message || '');
      }
    } catch (err) {
      console.error('Error fetching report data:', err);
    }
  };

  const handleToggleFilePublic = async (fileId: string, isPublic: boolean) => {
    try {
      const { error } = await supabase
        .from('campaign_report_files')
        .update({ is_public: isPublic })
        .eq('id', fileId);

      if (error) throw error;

      setReportFiles(prev =>
        prev.map(file => file.id === fileId ? { ...file, is_public: isPublic } : file)
      );

      toast({
        title: isPublic ? 'File made public' : 'File hidden',
        description: `File ${isPublic ? 'shown in' : 'hidden from'} public report.`,
      });
    } catch (err: any) {
      console.error('Error updating file visibility:', err);
      toast({
        title: 'Update failed',
        description: err?.message ?? 'Failed to update file visibility',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteFile = async (fileId: string, fileUrl: string) => {
    try {
      // Delete from storage
      const fileName = fileUrl.split('/').pop();
      if (fileName) {
        await supabase.storage
          .from('campaign-report-files')
          .remove([`${id}/${fileName}`]);
      }

      // Delete from database
      const { error } = await supabase
        .from('campaign_report_files')
        .delete()
        .eq('id', fileId);

      if (error) throw error;

      setReportFiles(prev => prev.filter(file => file.id !== fileId));

      toast({ title: 'File deleted' });
    } catch (err: any) {
      console.error('Error deleting file:', err);
      toast({
        title: 'Delete failed',
        description: err?.message ?? 'Failed to delete file',
        variant: 'destructive',
      });
    }
  };

  const handleSaveCustomMessage = async () => {
    if (!id || !campaign?.id) return;
    try {
      // Check if report exists
      const { data: existingReport } = await supabase
        .from('campaign_reports')
        .select('id')
        .eq('campaign_id', campaign.id)
        .single();

      if (existingReport) {
        // Update existing
        const { error } = await supabase
          .from('campaign_reports')
          .update({ custom_message: customMessage })
          .eq('campaign_id', campaign.id);

        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from('campaign_reports')
          .insert({ campaign_id: campaign.id, custom_message: customMessage });

        if (error) throw error;
      }

      toast({ title: 'Custom message saved' });
    } catch (err: any) {
      console.error('Error saving custom message:', err);
      toast({
        title: 'Save failed',
        description: err?.message ?? 'Failed to save custom message',
        variant: 'destructive',
      });
    }
  };

  const handleTogglePublicReport = async (enabled: boolean) => {
    if (!campaign?.id) return;
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .update({ share_report_publicly: enabled })
        .eq('id', campaign.id)
        .select('id, share_report_publicly')
        .single();

      if (error) {
        console.error('Supabase error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        throw error;
      }

      setShareReportPublicly(enabled);
      if (campaign) {
        setCampaign({ ...campaign, share_report_publicly: enabled });
      }

      toast({
        title: enabled ? 'Public report enabled' : 'Public report disabled',
      });
    } catch (err: any) {
      console.error('Error toggling public report:', err);
      toast({
        title: 'Update failed',
        description: err?.message ?? 'Failed to update public report setting',
        variant: 'destructive',
      });
    }
  };

  // `formatDate` now imported from `@/lib/campaignHelpers` (aliased
  // from `formatDateLong` to keep the existing 8 callsites working
  // unchanged).
  //
  // `getStatusBadge` removed 2026-06-05 — it returned a circle-icon
  // span for the campaign Status Select, but nothing on the page
  // actually called it. The hero status pill uses `<StatusBadge>`
  // with `CAMPAIGN_STATUS_TONES` (top of file). The edit-mode status
  // Select just renders plain "Planning / Active / Paused / Completed"
  // labels; no helper needed.
  /**
   * Persist a resources array immediately — used by the view-mode
   * Resources card so users can add/edit/remove resource links
   * without flipping into Edit mode. Optimistic: update local
   * campaign state first, then write to Supabase; rollback on error.
   */
  const handleSaveResources = async (next: Array<{label: string; url: string; icon?: string}>) => {
    if (!campaign) return;
    const previous = (campaign as any).resources || [];
    setCampaign({ ...campaign, resources: next } as any);
    try {
      const { error } = await (supabase as any)
        .from('campaigns')
        .update({ resources: next })
        .eq('id', campaign.id);
      if (error) throw error;
      toast({ title: 'Resources saved', duration: 1500 });
    } catch (err: any) {
      setCampaign({ ...campaign, resources: previous } as any);
      toast({ title: 'Failed to save resources', description: err?.message, variant: 'destructive' });
    }
  };

  const handleSave = async () => {
    if (!form || !campaign) return;
    setSaving(true);
    try {
      await CampaignService.updateCampaign(campaign.id, {
        name: form.name,
        total_budget: form.total_budget,
        status: form.status,
        start_date: form.start_date,
        end_date: form.end_date,
        description: form.description,
        region: form.region,
        intro_call: form.intro_call,
        intro_call_date: form.intro_call_date,
        manager: form.manager,
        call_support: form.call_support,
        client_choosing_kols: form.client_choosing_kols,
        multi_activation: form.multi_activation,
        proposal_sent: form.proposal_sent,
        nda_signed: form.nda_signed,
        budget_type: form.budget_type,
        outline: form.outline,
        approved_emails: (form as any).approved_emails?.length > 0 ? (form as any).approved_emails : null,
        approved_domains: (form as any).approved_domains?.length > 0 ? (form as any).approved_domains : null,
        // [Campaign Live v1] Phase label shown in the client portal's
        // "Active Campaign" hero. NULL hides the badge.
        current_phase: form.current_phase,
      });
      // Handle allocations
      // Delete marked allocations
      await Promise.all(deletedAllocIds.map(id => CampaignService.deleteBudgetAllocation(id)));
      // Add or update allocations
      await Promise.all(allocations.map(async alloc => {
        if (!alloc.region || !alloc.allocated_budget) return;
        if (alloc.id) {
          await CampaignService.updateBudgetAllocation(alloc.id, {
            region: alloc.region,
            allocated_budget: parseFloat(alloc.allocated_budget)
          });
        } else {
          await CampaignService.addBudgetAllocation(campaign.id, alloc.region, parseFloat(alloc.allocated_budget));
        }
      }));
      // Refetch campaign
      const updated = await CampaignService.getCampaignById(campaign.id);
      setCampaign(updated);
      setEditMode(false);
    } catch (e) {
      alert("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  // `parseDate`, `formatDateForInput`, `displayRegion` now imported
  // from `@/lib/campaignHelpers` (same implementations).

  // Remove columnWidths, isResizing, resizingColumn
  // Remove all style={{ width: ... }}, minWidth, maxWidth from TableHead and TableCell
  // Set tableLayout to 'auto' or remove it from <Table>

  // `editingNotesId`/`editingNotes`/`editingBudgetId`/`editingBudget`
  // moved into <KolDashboardTableView> on 2026-06-02.
  // Wallet edit state + handlers (`editingWalletId`, `editingWallet`,
  // `walletOpenedAtRef`, `walletInputRef`, `handleWalletChange`,
  // `handleWalletSave`) moved into <BudgetTableView> on 2026-06-02.
  // `editingPaidId`/`editingPaid` also removed (Budget-table-only).

  const handleUpdateKOLBudgetType = async (kolId: string, budgetType: string) => {
    try {
      await CampaignKOLService.updateCampaignKOL(kolId, { budget_type: budgetType as 'Token' | 'Fiat' | 'WL' | null });
      setCampaignKOLs(prev => prev.map(kol => kol.id === kolId ? { ...kol, budget_type: budgetType as 'Token' | 'Fiat' | 'WL' | null } : kol));
    } catch (err) {
      console.error('Error updating budget type:', err);
    }
  };

  const handleUpdateKOLPaid = async (kolId: string, paidUsd: number | null) => {
    try {
      await CampaignKOLService.updateCampaignKOL(kolId, { paid: paidUsd });
      setCampaignKOLs(prev => prev.map(kol => kol.id === kolId ? { ...kol, paid: paidUsd } : kol));
    } catch (err) {
      console.error('Error updating paid amount:', err);
    }
  };

  // Helper: compute sums per campaign_kol_id
  const computePaymentSums = (items: any[]) => {
    const sums: Record<string, number> = {};
    for (const p of items || []) {
      const key = p.campaign_kol_id;
      const amt = Number(p.amount) || 0;
      sums[key] = (sums[key] || 0) + amt;
    }
    return sums;
  };

  // Payment functions
  const fetchPayments = async () => {
    if (!campaign?.id) return;
    setLoadingPayments(true);
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('campaign_id', campaign.id)
        .order('payment_date', { ascending: false });
      
      if (error) throw error;
      const list = data || [];
      setPayments(list);
      // Recompute paid amounts on KOLs from payments
      const sums = computePaymentSums(list);
      setCampaignKOLs(prev => prev.map(k => ({ ...k, paid: sums[k.id] || 0 })));
    } catch (err) {
      console.error('Error fetching payments:', err);
      toast({ title: 'Load failed', description: err instanceof Error ? err.message : 'Failed to fetch payments', variant: 'destructive' });
    } finally {
      setLoadingPayments(false);
    }
  };

  // Fetch telegram chats linked to KOLs
  const fetchKolTelegramChats = async () => {
    try {
      const { data, error } = await supabase
        .from('telegram_chats')
        .select('chat_id, title, master_kol_id')
        .not('master_kol_id', 'is', null);

      if (error) throw error;

      const chatsMap: Record<string, { chat_id: string; title: string | null }> = {};
      data?.forEach(chat => {
        if (chat.master_kol_id) {
          chatsMap[chat.master_kol_id] = {
            chat_id: chat.chat_id,
            title: chat.title
          };
        }
      });
      setKolTelegramChats(chatsMap);
    } catch (err) {
      console.error('Error fetching KOL telegram chats:', err);
    }
  };

  // `handlePaymentDateSelect` moved into <RecordPaymentDialog>.
  // The dialog reads `kolTelegramChats` from context and fires
  // the confirmation sub-dialog via `triggerPaymentNotification`
  // (below) when the KOL has a linked TG chat + wallet + amount.

  // ── Trigger the Payment Notification confirmation sub-dialog.
  //    Exposed via context so the (extracted) RecordPaymentDialog
  //    can fire this side-effect without owning the notification
  //    sub-dialog state itself. Mirrors the inline logic that used
  //    to live at the bottom of `handlePaymentDateSelect`.
  const triggerPaymentNotification = (opts: {
    kolId: string;
    kolName: string;
    paymentIndex: number;
    amount: number;
    wallet: string;
    chatId: string;
    chatTitle: string | null;
    date: Date;
  }) => {
    setPendingPaymentNotification(opts);
    // [2026-06-05] Message format updated per Andy:
    //   1) prepend `[Client Name] - Post (DD MMM YYYY)` header line
    //   2) drop the `!` after the wallet
    //   3) "Thanks for" → "Thank you for"
    // Date formatted in the canonical mm/dd/yyyy shape (e.g. "06/05/2026");
    // falls back to "Date TBD" if the picker handed us an invalid date.
    const clientName = campaign?.client_name?.trim() || 'Holo Hive';
    const dateStr = opts.date && !isNaN(opts.date.getTime())
      ? formatDate(opts.date)
      : 'Date TBD';
    setPaymentNotificationMessage(
      `${clientName} - Post (${dateStr})\n\n` +
      `$${opts.amount.toLocaleString()} has been deposited to ${opts.wallet}\n\n` +
      `Thank you for being part of the Holo Hive network 🙌`
    );
    setIsEditingPaymentMessage(false);
    setPaymentNotifyDialogOpen(true);
  };

  // Send payment notification to telegram
  const sendPaymentNotification = async () => {
    if (!pendingPaymentNotification) return;

    const { chatId } = pendingPaymentNotification;

    // Send the notification
    setSendingPaymentNotification(true);
    try {
      const message = paymentNotificationMessage;

      const response = await fetch('/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId,
          message
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send notification');
      }

      toast({
        title: 'Notification sent',
        description: 'Payment notification sent to Telegram chat',
      });
    } catch (error: any) {
      console.error('Error sending payment notification:', error);
      toast({
        title: 'Send failed',
        description: error?.message ?? 'Failed to send notification',
        variant: 'destructive',
      });
    } finally {
      setSendingPaymentNotification(false);
      setPaymentNotifyDialogOpen(false);
      setPendingPaymentNotification(null);
    }
  };

  // Skip notification - date is already set, just close dialog
  const skipPaymentNotification = () => {
    setPaymentNotifyDialogOpen(false);
    setPendingPaymentNotification(null);
  };

  // Fetch email views for this campaign
  const handleShowEmailViews = async () => {
    if (!campaign?.id) return;
    setIsEmailViewsDialogOpen(true);
    setLoadingEmailViews(true);
    try {
      const { data, error } = await supabase
        .from('campaign_email_views')
        .select('id, email, viewed_at, user_agent')
        .eq('campaign_id', campaign.id)
        .order('viewed_at', { ascending: false });

      if (error) throw error;
      setEmailViews(data || []);
    } catch (err) {
      console.error('Error fetching email views:', err);
      toast({
        title: 'Load failed',
        description: err instanceof Error ? err.message : 'Failed to load email views',
        variant: 'destructive'
      });
    } finally {
      setLoadingEmailViews(false);
    }
  };

  // `handleAddMultiKOLPayments` + `handleAddNonKOLPayment` moved into
  // <RecordPaymentDialog>. Both supabase inserts now live in that
  // component, which calls `fetchPayments` + `setCampaignKOLs`
  // (KOL-payment paid-total update) via the campaign-detail context.

  // `handleDeletePayment` moved into <BudgetTableView> on 2026-06-02.

  // Just opens the dialog with the payment data — the dialog now
  // owns its own form state and seeds from the payment prop.
  const handleEditPayment = (payment: any) => {
    setEditingPayment(payment);
    setIsEditingPayment(true);
  };

  // `handleUpdatePayment` moved into <EditPaymentDialog> on 2026-06-02.


  // Status-color helpers (`getStatusColor`, `KOL_STATUS_TONES`,
  // `getContentStatusColor`) removed 2026-06-05 — none were referenced
  // anywhere on the outer page. The KOL Dashboard table and Content
  // Dashboard each own their own tone maps internal to the extracted
  // components (KolDashboardTableView, ContentDashboardTableView). The
  // centralized `<StatusBadge>` palette in `@/components/ui/status-badge`
  // is the single source of truth.

  // `selectedKOLs`/`bulkStatus`/`showKOLDeleteDialog`/`kolsToDelete`
  // moved into <KolDashboardTableView> on 2026-06-02 (Table-view-only).
  // `quickAddContentKolId`/`quickAddContentCount` same.
  // `showDeleteDialog` removed 2026-06-02 — the single-content
  // delete dialog was unreachable after the row delete refactor.

  // `kolSearchTerm` + `filteredAvailableKOLs` removed 2026-06-02 — both
  // are now internal to <AddKOLsDialog>.
  const [isAddKOLsDialogOpen, setIsAddKOLsDialogOpen] = useState(false);
  // `isAddContentsDialogOpen` removed 2026-06-02 — the modal it
  // controlled was dead code (`<Dialog open={false}>`). The Add
  // Content button kicks off an inline-row creation flow instead.
  const [isShareCampaignOpen, setIsShareCampaignOpen] = useState(false);
  // Section 9 — Showcase Settings dialog. Standalone in
  // _components/ShowcaseSettingsDialog so this page doesn't grow.
  const [isShowcaseOpen, setIsShowcaseOpen] = useState(false);
  const [isAddActivationOpen, setIsAddActivationOpen] = useState(false);
  // Section 7.5 — Content tag assignment dialog. Standalone for the
  // same reason; the content table view is already large.
  const [isContentTagOpen, setIsContentTagOpen] = useState(false);
  // Section 4 / 11.1 — Activation Settings: API URL + sync + manual
  // snapshot. Standalone like the others.
  const [isActivationOpen, setIsActivationOpen] = useState(false);
  const [isWarningsOpen, setIsWarningsOpen] = useState(false);
  const { toast } = useToast();

  // Campaign updates state
  const [isAddUpdateDialogOpen, setIsAddUpdateDialogOpen] = useState(false);
  const [updateText, setUpdateText] = useState('');
  const [isAddingUpdate, setIsAddingUpdate] = useState(false);
  const [campaignUpdates, setCampaignUpdates] = useState<any[]>([]);
  const [loadingUpdates, setLoadingUpdates] = useState(false);
  const [currentUpdateIndex, setCurrentUpdateIndex] = useState(0);
  const [isDeleteUpdateDialogOpen, setIsDeleteUpdateDialogOpen] = useState(false);

  // `addContentData` removed 2026-06-02 — was only consumed by the
  // dead `<Dialog open={false}>` content block.

  const contentStatusOptions = [
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'pending', label: 'Pending' },
    { value: 'posted', label: 'Posted' }
  ];
  const fieldOptions = KOLService.getFieldOptions();

  // `toggleKolSort` / `kolSortIndicator` moved into
  // <KolDashboardTableView> on 2026-06-02.

  // ─── Master KOL edit dialog trigger ────────────────────────────
  // Form state + save handler live in <MasterKolEditDialog> since
  // 2026-06-02. The page just sets `editingMasterKol`, the dialog
  // populates its own form on the kol-prop change.
  const openMasterKolEditDialog = (kol: MasterKOL) => {
    setEditingMasterKol(kol);
  };

  // `formatDateLocal` + `formatDisplayDate` moved to `lib/campaignHelpers.tsx`.

  // Helper to check if a cell is selected
  const isCellSelected = (table: string, rowId: string, field: string) => {
    return selectedCell?.table === table && selectedCell?.rowId === rowId && selectedCell?.field === field;
  };

  // Helper to check if a cell is the copied cell
  const isCellCopied = (table: string, rowId: string, field: string) => {
    return copiedCell?.table === table && copiedCell?.rowId === rowId && copiedCell?.field === field;
  };

  // Helper to get cell styling based on state.
  // v11: selection uses the brand ring + soft brand wash (was
  // `ring-blue-500 bg-sky-50`); copied stays emerald to differentiate.
  const getCellClassName = (baseClass: string, table: string, rowId: string, field: string) => {
    if (isCellSelected(table, rowId, field)) {
      return `${baseClass} ring-2 ring-brand bg-brand-soft`;
    } else if (isCellCopied(table, rowId, field)) {
      return `${baseClass} ring-2 ring-dashed ring-emerald-500 bg-emerald-50`;
    }
    return baseClass;
  };

  // Helper to handle cell selection
  const handleCellSelect = (table: string, rowId: string, field: string, value: any) => {
    setSelectedCell({ table, rowId, field, value });
  };

  // `isAddingContent` removed 2026-06-02 — same dead-modal cleanup.
  // Note: contents / loadingContents state is declared near the top of
  // the component alongside contentsViewMode. Don't redeclare here.

  // 2. Fetch contents for campaign when campaign changes
  const fetchContents = async () => {
    if (!campaign?.id) return;
    setLoadingContents(true);
    try {
      const { data, error } = await supabase
        .from('contents')
        .select('*')
        .eq('campaign_id', campaign?.id);
      if (error) throw error;
      setContents(data || []);
    } catch (err) {
      setContents([]);
      console.error('Error fetching contents:', err);
    } finally {
      setLoadingContents(false);
    }
  };

  useEffect(() => {
    if (campaign?.id) {
      fetchContents();
    }
  }, [campaign?.id]); // When campaign is loaded

  const [contentsSearchTerm, setContentsSearchTerm] = useState('');


  // KOL inline editing functions moved into <KolDashboardTableView>
  // on 2026-06-02. `handleKolCellDoubleClick`, `handleKolCellSave`,
  // `handleKolCellCancel`, `handleKolCellSaveImmediate`,
  // `renderEditableKolCell` all live there now.

  // `showBulkDeleteDialog` / `contentToDelete` moved into
  // <ContentDashboardTableView> on 2026-06-02.
  // `showBulkDeletePaymentsDialog` / `showPaymentDeleteDialog` /
  // `paymentToDelete` moved into <BudgetTableView>.

  // Validation function to check for missing fields
  const getMissingFields = () => {
    const missing: Array<{tab: string, field: string, label: string}> = [];

    // Information tab validations
    if (!campaign?.name || campaign.name.trim() === '') {
      missing.push({tab: 'information', field: 'name', label: 'Campaign Name'});
    }
    if (!campaign?.status) {
      missing.push({tab: 'information', field: 'status', label: 'Status'});
    }
    if (!campaign?.start_date) {
      missing.push({tab: 'information', field: 'start_date', label: 'Start Date'});
    }
    // end_date is optional - campaigns can run indefinitely
    if (!campaign?.client_id) {
      missing.push({tab: 'information', field: 'client_id', label: 'Client'});
    }
    if (!campaign?.region) {
      missing.push({tab: 'information', field: 'region', label: 'Region'});
    }
    // total_budget is optional - campaigns can have flexible/undefined budgets

    // KOL Dashboard validations
    if (!campaignKOLs || campaignKOLs.length === 0) {
      missing.push({tab: 'kols', field: 'kols', label: 'At least one KOL'});
    } else {
      // Budget allocations are optional for KOLs

      // Check if any KOLs are missing status
      const kolsWithoutStatus = campaignKOLs.filter(kol => !kol.hh_status);
      if (kolsWithoutStatus.length > 0) {
        missing.push({tab: 'kols', field: 'status', label: `Status for ${kolsWithoutStatus.length} KOL(s)`});
      }
    }

    // Content Dashboard validations
    if (!contents || contents.length === 0) {
      missing.push({tab: 'contents', field: 'contents', label: 'At least one content piece'});
    } else {
      // Check for contents missing activation dates
      const contentsWithoutDate = contents.filter(c => !c.activation_date);
      if (contentsWithoutDate.length > 0) {
        missing.push({tab: 'contents', field: 'activation_date', label: `Activation date for ${contentsWithoutDate.length} content(s)`});
      }

      // Check for contents missing platform
      const contentsWithoutPlatform = contents.filter(c => !c.platform);
      if (contentsWithoutPlatform.length > 0) {
        missing.push({tab: 'contents', field: 'platform', label: `Platform for ${contentsWithoutPlatform.length} content(s)`});
      }
    }

    // Budget/Payments validations
    const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalAllocated = campaignKOLs.reduce((sum, kol) => sum + (kol.allocated_budget || 0), 0);
    if (totalPaid < totalAllocated) {
      missing.push({tab: 'payments', field: 'payments', label: `Remaining payments (${CampaignService.formatCurrency(totalAllocated - totalPaid)} unpaid)`});
    }

    return missing;
  };

  const missingFields = getMissingFields();
  const hasWarnings = missingFields.length > 0;

  if (loading) {
    // Skeleton mirrors the live page structure so the title +
    // tab strip + Information-tab 3-column layout don't shift
    // when data lands. Updated 2026-06-02 to drop the legacy
    // `min-h-[calc(100vh-64px)] bg-cream-50` wrapper (the live
    // page no longer has it; the sidebar layout provides the
    // background) and to match the actual CampaignDetailViewLayout
    // 3-col grid that the Information tab renders.
    return (
      <div className="space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-3 w-20" />
          <span className="text-ink-warm-300">/</span>
          <Skeleton className="h-3 w-40" />
        </div>

        {/* Editorial hero — brand-gradient logo tile + kicker dot
            + serif title + status pill row + right-aligned action
            cluster. Shapes match the live hero exactly so the title
            doesn't reflow when data arrives. */}
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex items-start gap-5 max-w-3xl min-w-0 flex-1">
            <Skeleton className="w-14 h-14 rounded-xl shrink-0" />
            <div className="min-w-0 flex-1 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-500/40" />
                <Skeleton className="h-3 w-44" />
              </div>
              <Skeleton className="h-8 w-72" />
              <div className="flex items-center gap-2.5 mt-3">
                <Skeleton className="h-5 w-16 rounded-md" />
                <span className="text-ink-warm-300">·</span>
                <Skeleton className="h-3 w-28" />
                <span className="text-ink-warm-300">·</span>
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Skeleton className="h-9 w-36 rounded-md" />
            <Skeleton className="h-9 w-20 rounded-md" />
          </div>
        </div>

        {/* SectionHeader — "WORKSPACE" sticker */}
        <div className="section-head first flex items-center gap-3">
          <span className="dot bg-brand/30" aria-hidden />
          <Skeleton className="h-3 w-20" />
          <span className="flex-1 h-px bg-cream-200" aria-hidden />
          <Skeleton className="h-3 w-48" />
        </div>

        {/* TabsList — underline pattern with 4 tabs (Information,
            KOL Dashboard, Content Dashboard, Budget). Report is
            hidden per 2026-06-XX product decision. The first tab
            gets a brand underline since it's the default. */}
        <div className="w-full border-b border-cream-200 flex gap-1">
          <div className="px-3.5 py-2.5 border-b-2 border-brand">
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="px-3.5 py-2.5">
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="px-3.5 py-2.5">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="px-3.5 py-2.5">
            <Skeleton className="h-4 w-16" />
          </div>
        </div>

        {/* Information tab — 3-column layout from
            CampaignDetailViewLayout (`pt-6 grid grid-cols-1
            lg:grid-cols-3 gap-5`). Left 2 cols = Engagement card
            (8-cell KV grid) + a Budget / Approved Access row.
            Right col = Resources + Renewal + Recent Activity stack. */}
        <div className="pt-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left column: Engagement + Budget + Approved Access. */}
          <div className="lg:col-span-2 space-y-5">
            {/* Engagement card */}
            <div className="bg-white border border-cream-200 shadow-card rounded-[14px] p-6">
              <div className="flex items-center justify-between mb-5">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-7 w-16 rounded-md" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i}>
                    <Skeleton className="h-2.5 w-20 mb-2" />
                    <Skeleton className="h-5 w-32" />
                  </div>
                ))}
              </div>
              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <Skeleton className="h-2.5 w-24" />
                  <Skeleton className="h-2.5 w-10" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            </div>

            {/* Budget + Approved Access row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white border border-cream-200 shadow-card rounded-[14px] p-6"
                >
                  <div className="flex items-center justify-between mb-5">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-7 w-12 rounded-md" />
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Skeleton className="h-2.5 w-20 mb-2" />
                      <Skeleton className="h-7 w-28" />
                    </div>
                    <div>
                      <Skeleton className="h-2.5 w-20 mb-2" />
                      <Skeleton className="h-5 w-32" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right column: Resources + Renewal + Recent Activity. */}
          <div className="space-y-5">
            {/* Resources card */}
            <div className="bg-white border border-cream-200 shadow-card rounded-[14px] p-6">
              <div className="flex items-center justify-between mb-4">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-7 w-7 rounded-md" />
              </div>
              <div className="space-y-2.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <Skeleton className="h-7 w-7 rounded-md" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-3 w-32" />
                      <Skeleton className="h-2.5 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity card */}
            <div className="bg-white border border-cream-200 shadow-card rounded-[14px] p-6">
              <Skeleton className="h-5 w-32 mb-4" />
              <div className="space-y-3.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <Skeleton className="h-2 w-2 rounded-full mt-1.5 shrink-0" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-2.5 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !campaign) {
    // v11 error state — mirrors the loaded hero's breadcrumb +
    // editorial header chrome so the not-found surface doesn't
    // collapse to a bare rose line of text. Matches the pattern
    // shipped on /intelligence/discovery/[id] (Card-wrapped
    // EmptyState with a back affordance). Replaces the previous
    // `<div className="text-center py-8 text-rose-500">…` one-liner.
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.push('/campaigns')}
          className="text-ink-warm-500 hover:text-brand font-medium inline-flex items-center gap-1.5 transition text-xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Campaigns
        </button>
        <div className="flex items-start gap-5">
          <div
            className="w-14 h-14 rounded-xl text-white flex items-center justify-center text-xl font-semibold shrink-0 bg-gradient-to-br from-brand to-brand-dark shadow-btn-brand"
            aria-hidden
          >
            <Megaphone className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-ink-warm-500">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand shrink-0" aria-hidden />
              <span>Clients · Campaign</span>
            </div>
            <h1 className="display-serif text-[32px] text-ink-warm-900 leading-[1.1] tracking-tight">
              Campaign{' '}
              <span className="display-serif-italic text-brand">Not Found.</span>
            </h1>
          </div>
        </div>
        <Card className="border-cream-200">
          <EmptyState
            icon={FileQuestion}
            title="Campaign Not Found"
            description={error || "It may have been deleted, or the link is wrong. Head back to Campaigns to pick another."}
          >
            <Button variant="outline" onClick={() => router.push('/campaigns')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Campaigns
            </Button>
          </EmptyState>
        </Card>
      </div>
    );
  }

  return (
    // Outer `min-h-[calc(100vh-64px)] w-full bg-cream-50` wrapper
    // dropped 2026-06-XX — the sidebar layout already provides cream
    // background + full-height surface, so the inset wrapper created
    // a "page within a page" tint that diverged from the mockup.
    //
    // CampaignDetailProvider exposes campaign + KOLs + contents +
    // payments + fetchers + toast to the child components extracted
    // under components/campaign/* (AddKOLsDialog, AddContentDialog,
    // RecordPaymentDialog as of 2026-06-02; tab bodies later).
    // Underlying useState lives on this page; the provider just
    // re-exposes it so dialogs don't need 20-prop interfaces.
    <CampaignDetailProvider value={{
      campaignId: id,
      campaign, setCampaign,
      campaignKOLs, setCampaignKOLs,
      contents, setContents, loadingContents,
      payments, setPayments, loadingPayments,
      availableKOLs,
      latestCostMap,
      paymentKolNameLookup,
      kolTelegramChats,
      fetchCampaignKOLs,
      fetchAvailableKOLs,
      fetchPayments,
      setPricingSuggestionDialog,
      triggerPaymentNotification,
      openPaymentTermsForKol,
      setPaymentTermsQueue,
      openMasterKolEditDialog,
      handleEditPayment,
      setActiveTab,
      setContentsSearchTerm,
      fetchContents,
      isCellSelected,
      getCellClassName,
      handleCellSelect,
      toast,
    }}>
    <div className="space-y-4">
          {/* v11 page header — matches the revamp mockup's detail
              hero pattern exactly: breadcrumb-style back link above,
              left-aligned 56px brand-gradient logo tile, kicker with
              sky dot + chapter labels + mono client identifier,
              `display-serif text-[32px]` title with optional italic
              span on the second half, inline status pill row below
              with `·` separators for week + KOL count metrics, and
              right-aligned action cluster (btn-cream Edit + btn-brand
              View). */}
          <div className="flex items-center gap-1.5 text-xs">
            <button
              onClick={() => router.back()}
              className="text-ink-warm-500 hover:text-brand font-medium inline-flex items-center gap-1.5 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Campaigns
            </button>
            <span className="text-ink-warm-300">/</span>
            <span className="text-ink-warm-700 font-medium uppercase text-[10px] tracking-[0.2em] truncate">
              {campaign?.name ?? '…'}
            </span>
          </div>

          {/* Editorial hero */}
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="flex items-start gap-5 max-w-3xl min-w-0 flex-1">
              {/* Brand-gradient logo tile — matches the mockup's hero
                  initials block. Uses client logo when available,
                  else first letter of the campaign name on a
                  brand-gradient background. */}
              {campaign?.client_logo_url ? (
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-white border border-cream-200 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={campaign.client_logo_url}
                    alt={campaign.client_name || 'Client'}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div
                  className="w-14 h-14 rounded-xl text-white flex items-center justify-center text-xl font-semibold shrink-0 bg-gradient-to-br from-brand to-brand-dark shadow-btn-brand"
                  aria-hidden
                >
                  {(campaign?.name || campaign?.client_name || 'C').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                {/* Kicker — sky dot + chapter labels + mono identifier */}
                <div className="flex items-center gap-2 mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-ink-warm-500 flex-wrap">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" aria-hidden />
                  <span>Clients · Campaign</span>
                  {campaign?.client_name && (
                    <span className="text-ink-warm-300 normal-case mono tracking-normal text-[11px] truncate">
                      {campaign.client_name}
                    </span>
                  )}
                </div>
                {/* display-serif title — matches the mockup's
                    italic-span treatment: first word renders as
                    regular serif, everything after as
                    display-serif-italic text-brand. Adds a period
                    after the last word so the title reads as a
                    declarative sentence ("Venice Korea Expansion.").
                    Falls back to plain serif when there's only one
                    word in the name. */}
                <div className="flex items-start gap-1.5">
                  {campaign && (() => {
                    const words = campaign.name.trim().split(/\s+/);
                    if (words.length <= 1) {
                      return (
                        <h1 className="display-serif text-[32px] text-ink-warm-900 leading-[1.1] tracking-tight">
                          {campaign.name}.
                        </h1>
                      );
                    }
                    const first = words[0];
                    const rest = words.slice(1).join(' ');
                    return (
                      <h1 className="display-serif text-[32px] text-ink-warm-900 leading-[1.1] tracking-tight">
                        {first}{' '}
                        <span className="display-serif-italic text-brand">{rest}.</span>
                      </h1>
                    );
                  })()}
                  {/* Inline rename — visible entry point since the Overview
                      tab (with the full edit form) is hidden. Non-guest only. */}
                  {campaign && (userProfile as any)?.role && (userProfile as any).role !== 'guest' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 mt-1 text-ink-warm-400 hover:text-brand shrink-0"
                      title="Edit campaign"
                      onClick={() => { setRenameValue(campaign.name); setRenameIsTest(!!(campaign as any).is_test); setRenameOpen(true); }}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                {campaign && (
                  <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Edit campaign</DialogTitle>
                        <DialogDescription>
                          Update the campaign name and flags.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3 py-1">
                        <div className="space-y-1.5">
                          <Label htmlFor="campaign-rename">Name <RequiredAsterisk /></Label>
                          <Input
                            id="campaign-rename"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRenameSave(); } }}
                            placeholder="Campaign name"
                            className="h-9 focus-brand"
                            autoFocus
                          />
                        </div>
                        <div className="flex items-start gap-2">
                          <Checkbox
                            id="campaign-is-test"
                            checked={renameIsTest}
                            onCheckedChange={(checked) => setRenameIsTest(checked as boolean)}
                            className="mt-0.5"
                          />
                          <Label htmlFor="campaign-is-test" className="text-sm font-normal leading-snug">
                            Test campaign
                            <span className="block text-xs text-ink-warm-400">Hidden from Campaign Overview + its KOLs excluded from KOL data.</span>
                          </Label>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
                        <Button variant="brand" onClick={handleRenameSave} disabled={renameSaving || !renameValue.trim()}>
                          {renameSaving ? 'Saving…' : 'Save'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
                {/* Inline status pill + metrics row.
                    Uses centralized `<StatusBadge>` with a tone map
                    (CAMPAIGN_STATUS_TONES near the top of this file)
                    so the palette stays in lockstep with the rest of
                    the app. `withDot` gives the colored dot prefix
                    that the v11 mockup uses for hero status. */}
                {campaign && (
                  <div className="flex items-center gap-2.5 mt-4 text-xs flex-wrap">
                    <StatusBadge
                      tone={CAMPAIGN_STATUS_TONES[campaign.status] ?? 'neutral'}
                      withDot
                    >
                      {campaign.status}
                    </StatusBadge>
                    {/* [2026-07-09] Campaign phase hidden per Andy — everywhere
                        internal + public. Gated off (not deleted) for restore. */}
                    {false && campaign?.current_phase && (
                      <>
                        <span className="text-ink-warm-300">·</span>
                        <span className="text-ink-warm-700">{campaign?.current_phase}</span>
                      </>
                    )}
                    {campaign.start_date && (campaign.end_date || clientCoveredThrough) && (() => {
                      // Week 1 anchored to the first Monday on/after start_date
                      // per lib/campaignWeekHelpers.ts — single source of truth
                      // across hero, public portal, dashboard, Lineup Manager.
                      // [Stint-scoped M — 2026-07-02] Total weeks prefers the
                      // client's covered_through (engagement end) over the
                      // campaign's own end_date. F1.1 goal: campaign end derives
                      // from stint coverage, not stored per-campaign.
                      const week = getCampaignWeek(campaign.start_date);
                      const totalWeeks = getTotalCampaignWeeksFromCoverage(
                        campaign.start_date,
                        clientCoveredThrough,
                        campaign.end_date,
                      );
                      const currentWeek = week ? Math.min(totalWeeks, week.weekNumber) : 1;
                      return (
                        <>
                          <span className="text-ink-warm-300">·</span>
                          <span className="text-ink-warm-700">
                            Week <span className="mono tabular-nums font-medium text-ink-warm-900">{currentWeek}</span>
                            {' of '}
                            <span className="mono tabular-nums">{totalWeeks}</span>
                          </span>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {hasWarnings && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsWarningsOpen(true)}
                  className="border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                >
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  {missingFields.length} Warning{missingFields.length !== 1 ? 's' : ''}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddActivationOpen(true)}
                title="Mid-stint scope addition: extra deliverables + budget delta"
              >
                <Zap className="h-4 w-4 mr-2" />
                Add Activation
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsShareCampaignOpen(true)}
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share Campaign
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsShowcaseOpen(true)}
                title="Generate a sales-safe public link with masking"
              >
                <Eye className="h-4 w-4 mr-2" />
                Showcase
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsContentTagOpen(true)}
                title="Apply tags to content rows"
              >
                <Tag className="h-4 w-4 mr-2" />
                Tag Content
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsActivationOpen(true)}
                title="Configure the activation portal API or edit the snapshot manually"
              >
                <Activity className="h-4 w-4 mr-2" />
                Activation
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleShowEmailViews}
                title="View emails that accessed this campaign"
              >
                <Eye className="h-4 w-4 mr-2" />
                Views
              </Button>
            </div>
          </div>

          {/* Section-head — chapter divider between hero and tabs.
              Uses the shared <SectionHeader> primitive so the v11
              chapter pattern stays consistent with /dashboard,
              /clients, /intelligence/discovery/[id], etc. */}
          <SectionHeader
            label="Workspace"
            dot="brand"
            counter="01 — Info · KOLs · Content · Budget"
            first
          />

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            {/* v11 underline tabs — matches the mockup's detail-page
                tab pattern exactly: border-bottom rail across the
                whole strip, inactive triggers are text-only ink-warm-500,
                active trigger goes brand-deep with a 2px brand
                underline accent (via after:* utilities) that sits
                flush with the border-bottom rail. Same pattern is
                used in the mockup's Workspace tabs (Context /
                Action Board / Weekly Update / Delivery Log / Activity). */}
            <TabsList className="w-full justify-start gap-0.5 bg-transparent p-0 h-auto rounded-none border-b border-cream-200">
              {/* [2026-07-02] Internal Overview tab hidden per Andy — the
                  KOL Dashboard tab is now the entry point. Keeping the
                  TabsContent below so an old bookmark with ?tab=information
                  still renders instead of crashing, but the trigger is
                  gated so day-to-day navigation ignores it. */}
              {false && (
              <TabsTrigger
                value="information"
                className="relative px-3.5 py-2.5 text-sm font-medium text-ink-warm-500 hover:text-ink-warm-900 data-[state=active]:font-semibold data-[state=active]:text-brand-deep data-[state=active]:shadow-none data-[state=active]:bg-transparent rounded-none data-[state=active]:after:absolute data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-[2px] data-[state=active]:after:bg-brand data-[state=active]:after:rounded-t"
              >
                Overview
              </TabsTrigger>
              )}
              <TabsTrigger
                value="kols"
                className="relative px-3.5 py-2.5 text-sm font-medium text-ink-warm-500 hover:text-ink-warm-900 data-[state=active]:font-semibold data-[state=active]:text-brand-deep data-[state=active]:shadow-none data-[state=active]:bg-transparent rounded-none data-[state=active]:after:absolute data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-[2px] data-[state=active]:after:bg-brand data-[state=active]:after:rounded-t flex items-center gap-1.5"
              >
                KOL Dashboard
                {campaignKOLs.length > 0 && (
                  <span className="text-[10px] mono tabular-nums text-ink-warm-500">{campaignKOLs.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="contents"
                className="relative px-3.5 py-2.5 text-sm font-medium text-ink-warm-500 hover:text-ink-warm-900 data-[state=active]:font-semibold data-[state=active]:text-brand-deep data-[state=active]:shadow-none data-[state=active]:bg-transparent rounded-none data-[state=active]:after:absolute data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-[2px] data-[state=active]:after:bg-brand data-[state=active]:after:rounded-t"
              >
                Content Dashboard
              </TabsTrigger>
              {/* HHP Lineup Manager Spec § 4 — Lineups tab. Per-week
                  KOL selection + approval flow. Sits between Content
                  Dashboard (results) and Budget (money). */}
              <TabsTrigger
                value="lineups"
                className="relative px-3.5 py-2.5 text-sm font-medium text-ink-warm-500 hover:text-ink-warm-900 data-[state=active]:font-semibold data-[state=active]:text-brand-deep data-[state=active]:shadow-none data-[state=active]:bg-transparent rounded-none data-[state=active]:after:absolute data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-[2px] data-[state=active]:after:bg-brand data-[state=active]:after:rounded-t"
              >
                Lineups
              </TabsTrigger>
              <TabsTrigger
                value="payments"
                className="relative px-3.5 py-2.5 text-sm font-medium text-ink-warm-500 hover:text-ink-warm-900 data-[state=active]:font-semibold data-[state=active]:text-brand-deep data-[state=active]:shadow-none data-[state=active]:bg-transparent rounded-none data-[state=active]:after:absolute data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-[2px] data-[state=active]:after:bg-brand data-[state=active]:after:rounded-t"
              >
                Budget
              </TabsTrigger>
              {/* Report tab hidden 2026-06-XX per product decision —
                  the surface wasn't getting use and the Report tab's
                  ReportTabContent component is still wired below for
                  easy restore (un-hide this trigger). */}
              {false && (
              <TabsTrigger
                value="report"
                className="relative px-3.5 py-2.5 text-sm font-medium text-ink-warm-500 hover:text-ink-warm-900 data-[state=active]:font-semibold data-[state=active]:text-brand-deep data-[state=active]:shadow-none data-[state=active]:bg-transparent rounded-none data-[state=active]:after:absolute data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-[2px] data-[state=active]:after:bg-brand data-[state=active]:after:rounded-t"
              >
                Report
              </TabsTrigger>
              )}
            </TabsList>
            
            <TabsContent value="information" className="mt-4">
              {/* Outer Card wrapper dropped — with underline tabs the
                  content sits directly under the tab strip (mockup
                  pattern). Inner sections (Campaign Overview /
                  Timeline / Client / Team) already have their own
                  card chrome. */}
              {/* CardHeader simplified — logo + name + status removed
                  because the editorial hero above shows all three.
                  In view mode just an Edit affordance; in edit mode
                  the Name input + Status select live in the form
                  body for direct editing. */}
              {/* Tab body header removed 2026-06-XX — the tab strip
                  above already labels the section. Action affordances
                  (More options / Status select in edit mode) moved
                  into a small inline toolbar at the bottom-right of
                  the content (or per-card for view mode). Cuts ~70px
                  of header weight from every tab. */}
              {/* [2026-07-08] View-mode Edit affordance restored per Andy.
                  When the Overview was made read-only (2026-06-29) the trigger
                  for edit mode was dropped, leaving no way to rename a campaign
                  or change its dates/status/etc. Gated to all signed-in users
                  except guests. Clicking flips into the InformationEditMode
                  form (Campaign Name + fields + Save/Cancel). */}
              {!editMode && (userProfile as any)?.role && (userProfile as any).role !== 'guest' && (
                <div className="mb-3 flex items-center justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-ink-warm-600 hover:text-brand"
                    onClick={handleEdit}
                  >
                    <Edit className="h-3.5 w-3.5 mr-1.5" />
                    Edit
                  </Button>
                </div>
              )}
              {editMode && (
                <div className="mb-3 flex items-center justify-end gap-2">
                  <span className="text-[10px] mono uppercase tracking-[0.14em] text-amber-700">Editing</span>
                  <Select
                    value={form?.status || ""}
                    onValueChange={(value) => {
                      if (value === "Completed" && hasWarnings) {
                        toast({
                          title: "Cannot Mark as Completed",
                          description: `There are ${missingFields.length} missing field(s). Please review warnings before marking as completed.`,
                          variant: "destructive",
                        });
                        setIsWarningsOpen(true);
                        return;
                      }
                      handleChange("status", value);
                    }}
                  >
                    <SelectTrigger className="w-40 h-9 focus-brand text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Planning">Planning</SelectItem>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Paused">Paused</SelectItem>
                      <SelectItem value="Completed">
                        <div className="flex items-center gap-2">
                          Completed
                          {hasWarnings && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* ── View-mode layout ────────────────────────────────────
                  Matches the holohive-ui-revamp.html mockup's
                  detail-page Context tab: 3-column grid with main
                  column (Engagement + Resources) + sidebar
                  (Quick Stats + Renewal action + Recent activity).
                  Only renders when not editing — the existing form
                  below takes over for edit mode (one source of truth
                  for the form fields). */}
              {!editMode && campaign && (
                /* [2026-06-29] Overview is now read-only per Andy — no
                   onEditClick, no onResourcesChange. Edits move to the
                   full Edit Campaign dialog + other tabs. */
                <CampaignDetailViewLayout
                  campaign={campaign}
                  campaignKOLs={campaignKOLs}
                  payments={payments}
                  contents={contents}
                  allUsers={allUsers}
                />
              )}

              {/* Edit-mode form extracted to
                  `components/campaign/InformationEditMode.tsx` on
                  2026-06-02. The page hands down all the form +
                  allocation + dropdown state as props. */}
              {editMode && campaign && (
                <InformationEditMode
                  form={form}
                  handleChange={handleChange}
                  campaign={campaign}
                  allocations={allocations}
                  setAllocations={setAllocations}
                  deletedAllocIds={deletedAllocIds}
                  setDeletedAllocIds={setDeletedAllocIds}
                  campaignKOLs={campaignKOLs}
                  allUsers={allUsers}
                  allClients={allClients}
                  fieldOptions={fieldOptions}
                  budgetTypeOptions={budgetTypeOptions}
                  isAddUpdateDialogOpen={isAddUpdateDialogOpen}
                  setIsAddUpdateDialogOpen={setIsAddUpdateDialogOpen}
                  updateText={updateText}
                  setUpdateText={setUpdateText}
                  isAddingUpdate={isAddingUpdate}
                  handleAddUpdate={() => {}}
                  campaignUpdates={campaignUpdates}
                  currentUpdateIndex={currentUpdateIndex}
                  prevUpdate={prevUpdate}
                  nextUpdate={nextUpdate}
                  loadingUpdates={loadingUpdates}
                  isDeleteUpdateDialogOpen={isDeleteUpdateDialogOpen}
                  setIsDeleteUpdateDialogOpen={setIsDeleteUpdateDialogOpen}
                  handleDeleteUpdate={() => {}}
                  setCurrentUpdateIndex={setCurrentUpdateIndex}
                  setIsAddingUpdate={setIsAddingUpdate}
                  fetchCampaignUpdates={fetchCampaignUpdates}
                  emailInput={emailInput}
                  setEmailInput={setEmailInput}
                  handleSave={handleSave}
                  handleCancel={handleCancel}
                  saving={saving}
                />
              )}
          </TabsContent>

          <TabsContent value="kols" className="mt-4">
              {/* Toolbar row: view-mode toggle on the left, Add
                  affordance on the right — merged onto one line
                  to cut vertical chrome. */}
              <div className="mb-3 flex flex-row items-center justify-between gap-2">
                  {/* View toggle — uses the proper Tabs primitive
                      (same as the main page tab strip and every
                      other v11 tabbed surface) so keyboard nav +
                      ARIA + state management are consistent. */}
                  <Tabs value={kolViewMode} onValueChange={(v) => setKolViewMode(v as 'overview' | 'table' | 'graph')}>
                    <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200">
                      <TabsTrigger value="overview" className="data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-brand text-sm">
                        <BarChart3 className="h-4 w-4 mr-1.5" />
                        Overview
                      </TabsTrigger>
                      <TabsTrigger value="table" className="data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-brand text-sm">
                        <TableIcon className="h-4 w-4 mr-1.5" />
                        Table
                      </TabsTrigger>
                      <TabsTrigger value="graph" className="data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-brand text-sm">
                        <CreditCard className="h-4 w-4 mr-1.5" />
                        Cards
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  {/* Add KOLs trigger — the dialog body itself lives in
                      `components/campaign/AddKOLsDialog.tsx` since the
                      2026-06-02 structural pass. The button stays here
                      so it remains part of the toolbar layout. */}
                  <Button variant="brand" size="sm" onClick={() => setIsAddKOLsDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add KOLs
                  </Button>
                  <AddKOLsDialog open={isAddKOLsDialogOpen} onOpenChange={setIsAddKOLsDialogOpen} />
              </div>
              {/* Tab body — was `<CardContent className="pt-0 px-0">`
                  back when each tab sat inside a Card. The outer Card
                  was removed during the v11 underline-tabs migration
                  but the CardContent left behind was a structural
                  leftover (CardContent has no semantic meaning without
                  a parent Card). Converted to a plain wrapper div
                  2026-06-05 — same visual result, clearer intent. */}
              <div>
                {/* View toggle moved to the toolbar row above. */}
                {/* Overview view extracted to
                    `components/campaign/KolDashboardOverview.tsx` on
                    2026-06-02 (read-only, reads campaignKOLs from
                    context, no setters needed). */}
                {kolViewMode === 'overview' && <KolDashboardOverview />}

                {/* Table View — extracted to
                    `components/campaign/KolDashboardTableView.tsx` on
                    2026-06-02. Final big sub-piece of the KOL Dashboard
                    tab body. Owns its own sort + selection + inline-edit
                    + bulk-actions state; reads `filteredKOLs` from the
                    page (which derives from `searchTerm` + `kolFilters` +
                    `kolVisibilityTab`, all still page-owned so the
                    Cards view above sees the same filtered list). */}
                {kolViewMode === 'table' && (
                  <KolDashboardTableView
                    filteredKOLs={filteredKOLs}
                    loadingKOLs={loadingKOLs}
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    kolVisibilityTab={kolVisibilityTab}
                    setKolVisibilityTab={setKolVisibilityTab}
                    kolFilters={kolFilters}
                    setKolFilters={setKolFilters}
                  />
                )}

                {/* Cards View — extracted to
                    `components/campaign/KolDashboardCardsView.tsx`
                    on 2026-06-02. Filter state stays on the page
                    because the Table view (above) uses the same
                    `kolFilters` slice; passed as props. */}
                {kolViewMode === 'graph' && (
                  <KolDashboardCardsView
                    filteredKOLs={filteredKOLs}
                    kolFilters={kolFilters}
                    setKolFilters={setKolFilters}
                  />
                )}
              </div>
          </TabsContent>

          <TabsContent value="contents" className="mt-4">
              {/* [2026-06-12] Per Andy: KOL /submit pending review banner.
                  Lives at the top of the Content Dashboard. Auto-hides
                  when nothing pending. Web fallback for TG-bot approval. */}
              {campaign?.id && (
                <ContentSubmissionsBanner
                  campaignId={campaign.id}
                  onReviewed={fetchContents}
                />
              )}

              {/* Toolbar row: view-mode toggle on the left, Add
                  Content on the right — merged onto one line. */}
              <div className="mb-3 flex flex-row items-center justify-between gap-2">
                  {/* View toggle — uses the Tabs primitive for
                      consistency with the main tab strip + other
                      v11 tabbed surfaces. */}
                  <Tabs value={contentsViewMode} onValueChange={(v) => setContentsViewMode(v as 'overview' | 'table')}>
                    <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200">
                      <TabsTrigger value="overview" className="data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-brand text-sm">
                        <BarChart3 className="h-4 w-4 mr-1.5" />
                        Overview
                      </TabsTrigger>
                      <TabsTrigger value="table" className="data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-brand text-sm">
                        <TableIcon className="h-4 w-4 mr-1.5" />
                        Table
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  {/* Add Content — kicks off an inline-row creation
                      flow on the Content table, not a modal. The button
                      used to be wrapped in `<Dialog open={false}>` +
                      `<DialogTrigger asChild>` with ~340 lines of
                      unreachable modal markup beneath; both were removed
                      on 2026-06-02 since the modal was never rendered.
                      The inline flow lives in the onClick below.
                      ─────────────────────────────────────────────────
                      [2026-06-05] HIDDEN per Andy. Content rows are
                      surfaced from the campaign_kols + posted-content
                      pipeline rather than added manually here. To
                      revive: flip the `false && (...)` gate. The
                      onClick + state plumbing is preserved so the
                      revive is one-line. */}
                      {false && (
                      <Button variant="brand" size="sm" onClick={async (e) => {
                          e.preventDefault();
                          const newId = `new-${Date.now()}`;
                          const newContent: any = {
                            id: newId,
                            campaign_id: campaign?.id,
                            campaign_kols_id: '',
                            activation_date: '',
                            content_link: '',
                            platform: '',
                            type: '',
                            status: '',
                            impressions: null,
                            likes: null,
                            retweets: null,
                            comments: null,
                            bookmarks: null,
                            master_kol: { name: '', link: '' },
                            isNew: true
                          };
                          setContents((prev: any[]) => [newContent, ...prev]);
                          // The new row will surface at the top of the
                          // Content Dashboard Table view; the user
                          // clicks the first cell to begin editing.
                          // (The inline-edit handler used to fire here
                          // moved into <ContentDashboardTableView> on
                          // 2026-06-02.)
                        }}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Content
                      </Button>
                      )}
              </div>
              {/* See KOL tab above for the CardContent → div rationale. */}
              <div>
                {/* View toggle moved to the toolbar row above. */}
                {/* Overview View extracted to
                    `components/campaign/ContentDashboardOverview.tsx`
                    on 2026-06-02 (read-only KPIs + Avg ER + cumulative
                    impressions line chart). */}
                {contentsViewMode === 'overview' && <ContentDashboardOverview />}

                {/* Table view extracted to
                    `components/campaign/ContentDashboardTableView.tsx`
                    on 2026-06-02. Owns its own sort + filter +
                    selection + inline-edit + bulk-actions state. */}
                {contentsViewMode === 'table' && <ContentDashboardTableView />}
              </div>
          </TabsContent>

          {/* HHP Lineup Manager Spec § 4 — Lineups tab. Self-contained
              component to keep this page lean. */}
          <TabsContent value="lineups" className="mt-4">
            {campaign && (
              <LineupsTab
                campaignId={campaign.id}
                campaignStartDate={campaign.start_date as any}
                campaignEndDate={campaign.end_date as any}
                campaignCoveredThrough={clientCoveredThrough}
                campaignName={campaign.name}
                currentUserId={(userProfile as any)?.id ?? null}
                currentUserName={(userProfile as any)?.name ?? (userProfile as any)?.email ?? 'User'}
              />
            )}
          </TabsContent>

          {/* Budget Tab */}
          <TabsContent value="payments" className="mt-4">
              {/* Toolbar row: Record Payment on the right. The
                  Overview/Table tab toggle was removed 2026-06-16 per
                  Jdot's Budget Dashboard spec — Overview now renders
                  ABOVE the table as a permanent section, no toggle. */}
              <div className="mb-3 flex flex-row items-center justify-end gap-2">
                  <Button variant="brand" size="sm" onClick={() => setIsAddingPayment(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Record Payment
                  </Button>
                  <RecordPaymentDialog ref={recordPaymentDialogRef} open={isAddingPayment} onOpenChange={setIsAddingPayment} />
              </div>
              <div className="space-y-6">
                {/* Overview panel (BudgetDashboardV2) — renders above
                    the budget table per Jdot's spec. Owns: 5-tile spend
                    breakdown row, CPM/CPE/Cost-per-piece/Burn tiles,
                    portfolio benchmark, Phase 2 funnel placeholder,
                    rollover summary. */}
                <BudgetDashboardV2 />

                {/* Existing payment table — preserved as-is per spec
                    "PRESERVE · x/x content paid tracker" feature. */}
                <BudgetTableView />
              </div>
          </TabsContent>

          {/* Report Tab */}
          <TabsContent value="report" className="mt-4">
            <ReportTabContent
              campaignId={id}
              reportFiles={reportFiles}
              loadingReportFiles={loadingReportFiles}
              customMessage={customMessage}
              shareReportPublicly={shareReportPublicly}
              contents={contents}
              campaignKOLs={campaignKOLs}
              onCustomMessageChange={setCustomMessage}
              onSaveCustomMessage={handleSaveCustomMessage}
              onToggleFilePublic={handleToggleFilePublic}
              onDeleteFile={handleDeleteFile}
              onTogglePublicReport={handleTogglePublicReport}
              onUploadSuccess={fetchReportFiles}
            />
          </TabsContent>

        </Tabs>

      {/* Sticky Horizontal Scrollbar */}
      {stickyScrollbar && (
        <div
          className="fixed bottom-4 bg-white border border-cream-200 shadow-lg z-40 flex items-center rounded-lg transition-opacity duration-300"
          style={{
            height: '32px',
            opacity: stickyScrollbar.opacity,
            left: '50%',
            transform: 'translateX(-50%)',
            width: `${stickyScrollbar.width}px`
          }}
        >
          <div
            className="overflow-x-scroll hover:overflow-x-scroll rounded-lg"
            style={{
              width: '100%',
              height: '100%',
              scrollbarWidth: 'thin',
              scrollbarColor: `${BRAND_HEX} #f3f4f6`
            }}
            onScroll={(e) => {
              const scrollLeft = e.currentTarget.scrollLeft;
              const scrollableRef =
                stickyScrollbar.tableId === 'kols' ? kolScrollableRef :
                stickyScrollbar.tableId === 'contents' ? contentScrollableRef :
                paymentScrollableRef;

              if (scrollableRef.current) {
                scrollableRef.current.scrollLeft = scrollLeft;
              }
            }}
            ref={(el) => {
              if (el && stickyScrollbar) {
                el.scrollLeft = stickyScrollbar.scrollLeft;
              }
            }}
          >
            <div style={{ width: `${stickyScrollbar.scrollWidth}px`, height: '1px' }}></div>
          </div>
        </div>
      )}
      
      {/* Payment Delete + Bulk Payment Delete dialogs moved into
          <BudgetTableView> on 2026-06-02. */}

      {/* KOL Delete confirmation dialog moved into
          <KolDashboardTableView> on 2026-06-02 since the bulk-delete
          flow is entirely Table-view-internal. */}

      {/* Bulk Content Delete dialog moved into
          <ContentDashboardTableView> on 2026-06-02. */}

      {/* Bulk Delete Payments dialog moved into <BudgetTableView>. */}

      {/* Edit Payment Dialog moved into
          `components/campaign/EditPaymentDialog.tsx` on 2026-06-02. */}
      <EditPaymentDialog
        open={isEditingPayment}
        onOpenChange={(open) => {
          setIsEditingPayment(open);
          if (!open) setEditingPayment(null);
        }}
        payment={editingPayment}
      />

      {/* Share Campaign Dialog moved into
          `components/campaign/ShareCampaignDialog.tsx` on 2026-06-02. */}
      <ShareCampaignDialog open={isShareCampaignOpen} onOpenChange={setIsShareCampaignOpen} />
      {campaign && (
        <AddActivationDialog
          open={isAddActivationOpen}
          onOpenChange={setIsAddActivationOpen}
          campaignId={campaign.id}
          campaignName={campaign.name}
        />
      )}
      {campaign && (
        <ShowcaseSettingsDialog
          open={isShowcaseOpen}
          onClose={() => setIsShowcaseOpen(false)}
          campaignId={campaign.id}
          campaignSlug={(campaign as any).slug || null}
        />
      )}
      {campaign && (
        <ContentTagDialog
          open={isContentTagOpen}
          onClose={() => setIsContentTagOpen(false)}
          campaignId={campaign.id}
        />
      )}
      {campaign && (
        <ActivationSettingsDialog
          open={isActivationOpen}
          onClose={() => setIsActivationOpen(false)}
          campaignId={campaign.id}
        />
      )}

      {/* Warnings / Email Views / Payment Notify / Pricing Suggestion
          dialogs all moved into separate files under
          `components/campaign/*` on 2026-06-02. */}
      <WarningsDialog
        open={isWarningsOpen}
        onOpenChange={setIsWarningsOpen}
        missingFields={missingFields}
      />
      <EmailViewsDialog
        open={isEmailViewsDialogOpen}
        onOpenChange={setIsEmailViewsDialogOpen}
        emailViews={emailViews}
        loading={loadingEmailViews}
      />
      <PaymentNotifyDialog
        open={paymentNotifyDialogOpen}
        onOpenChange={setPaymentNotifyDialogOpen}
        kolName={pendingPaymentNotification?.kolName}
        chatTitle={pendingPaymentNotification?.chatTitle}
        message={paymentNotificationMessage}
        onMessageChange={setPaymentNotificationMessage}
        sending={sendingPaymentNotification}
        onSend={sendPaymentNotification}
        onSkip={skipPaymentNotification}
      />
      <PricingSuggestionDialog
        state={pricingSuggestionDialog}
        onClose={() => setPricingSuggestionDialog(null)}
        recordPaymentDialogRef={recordPaymentDialogRef}
      />

      {/* Payment terms dialog — fires when a KOL is newly onboarded without an agreed rate */}
      {paymentTermsDialog && (
        <SetPaymentTermsDialog
          open={paymentTermsDialog.open}
          onOpenChange={(open) => {
            if (!open) {
              setPaymentTermsDialog(null);
              // Advance queue if there are more KOLs waiting
              if (paymentTermsQueue.length > 0) {
                const [next, ...rest] = paymentTermsQueue;
                setPaymentTermsQueue(rest);
                // Defer so the dialog unmounts before remounting
                setTimeout(() => openPaymentTermsForKol(next), 50);
              }
            }
          }}
          campaignKolId={paymentTermsDialog.campaignKolId}
          masterKolId={paymentTermsDialog.masterKolId}
          kolName={paymentTermsDialog.kolName}
          latestPaymentAmount={paymentTermsDialog.latestPaymentAmount}
          masterStandardRate={paymentTermsDialog.masterStandardRate}
          currentAgreedRate={paymentTermsDialog.currentAgreedRate}
          onSaved={(rate, updatedMaster) => {
            // Reflect the new rate in local state so subsequent content adds
            // use it without requiring a refetch.
            setCampaignKOLs(prev => prev.map(k => {
              if (k.id !== paymentTermsDialog.campaignKolId) return k;
              return {
                ...k,
                agreed_rate: rate,
                master_kol: updatedMaster && k.master_kol
                  ? { ...k.master_kol, standard_rate: rate }
                  : k.master_kol,
              };
            }));
          }}
        />
      )}

      {/* Master KOL Edit Dialog moved into
          `components/campaign/MasterKolEditDialog.tsx` on
          2026-06-02. Page only owns `editingMasterKol` (which doubles
          as the open/null flag); the dialog owns form state +
          save handler internally. */}
      <MasterKolEditDialog
        kol={editingMasterKol}
        onClose={() => setEditingMasterKol(null)}
      />

    </div>
    </CampaignDetailProvider>
  );
};

export default CampaignDetailsPage;

