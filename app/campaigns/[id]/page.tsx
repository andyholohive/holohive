"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Calendar as CalendarIcon, Megaphone, Building2, DollarSign, ArrowLeft, CheckCircle, FileText, PauseCircle, BadgeCheck, Phone, Users, Trash2, Plus, Search, Flag, Globe, Loader, Calendar as CalendarIconImport, ChevronLeft, ChevronRight, ChevronDown, BarChart3, Table as TableIcon, Edit, CreditCard, CheckCircle2, XCircle, MapPin, Share2, Copy, ExternalLink, Image as ImageIcon, Video, File, Download, Eye, EyeOff, AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown, Activity, X, Heart, MessageSquare, Repeat2, Bookmark } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CampaignService, CampaignWithDetails } from "@/lib/campaignService";
import {
  BRAND_HEX,
  BRAND_DARK_HEX,
  formatDateLocal,
  formatDisplayDate,
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
import { BudgetTableView } from "@/components/campaign/BudgetTableView";
import { ContentDashboardOverview } from "@/components/campaign/ContentDashboardOverview";
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
      case 'pricing':      return row.master_kol?.pricing || '';
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

/**
 * Compact multiselect for use inside Dialogs. Popover + Checkbox list,
 * shows selected items as small badges on the trigger. Self-contained
 * so it can ship alongside the master KOL edit dialog without pulling
 * in the more complex portal-rendered MultiSelect from /kols.
 */
function DialogMultiSelect({
  selected,
  options,
  onChange,
  placeholder = 'Select...',
}: {
  selected: string[];
  options: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-auto min-h-9 py-1.5"
        >
          <div className="flex flex-wrap gap-1 items-center text-left flex-1 min-w-0">
            {selected.length === 0 ? (
              <span className="text-ink-warm-400">{placeholder}</span>
            ) : (
              selected.map((s) => (
                <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-cream-100 text-ink-warm-700">
                  {s}
                </span>
              ))
            )}
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="max-h-64 overflow-auto py-1">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-ink-warm-400">No options</div>
          ) : (
            options.map((opt) => {
              const isSelected = selected.includes(opt);
              return (
                <label
                  key={opt}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-cream-50 cursor-pointer text-sm"
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => {
                      onChange(
                        isSelected
                          ? selected.filter((s) => s !== opt)
                          : [...selected, opt],
                      );
                    }}
                  />
                  <span>{opt}</span>
                </label>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
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

const CampaignDetailsPage = () => {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  // Extend CampaignWithDetails inline for local use
  type CampaignDetails = CampaignWithDetails;
  const [campaign, setCampaign] = useState<CampaignDetails | null>(null);
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

  // Master KOL edit dialog (opened by clicking the edit pencil next to
  // a KOL name in the table view). Edits the underlying master_kols row,
  // not the campaign-specific overlay — same data shown on /kols.
  const [editingMasterKol, setEditingMasterKol] = useState<MasterKOL | null>(null);
  const [masterKolForm, setMasterKolForm] = useState<Partial<MasterKOL>>({});
  const [savingMasterKol, setSavingMasterKol] = useState(false);

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
  const [paymentViewMode, setPaymentViewMode] = useState<'table' | 'graph'>('table');

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

  const [newPaymentData, setNewPaymentData] = useState({
    campaign_kol_id: '',
    amount: 0,
    payment_date: '',
    payment_method: 'Fiat',
    content_id: 'none',
    transaction_id: '',
    notes: ''
  });

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

  useEffect(() => {
    UserService.getAllUsers().then(setAllUsers);
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
              const { data, error } = await supabase
                .from('contents')
                .select('*')
                .eq('campaign_id', campaign?.id);
              if (!error && data) {
                setContents(data);
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
            title: 'Error',
            description: 'Failed to paste value',
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
  }, [activeTab, kolViewMode, contentsViewMode, paymentViewMode]); // Re-check when switching tabs or view modes

  const fetchCampaignKOLs = async () => {
    if (!campaign) return;
    try {
      setLoadingKOLs(true);
      // Two queries in parallel: the active roster (filtered by
      // deleted_at IS NULL) for everywhere else, and the full set
      // (including soft-deleted rows) for the Budget tab's payment
      // name lookup. Fetching both here keeps the two views in
      // lockstep after any add/delete/status change.
      const [kols, allKols] = await Promise.all([
        CampaignKOLService.getCampaignKOLs(campaign.id),
        CampaignKOLService.getCampaignKOLsWithDeleted(campaign.id),
      ]);
      // If payments are loaded, map paid from sums; else set directly
      if (payments && payments.length > 0) {
        const sums = computePaymentSums(payments);
        setCampaignKOLs(kols.map(k => ({ ...k, paid: sums[k.id] || 0 })));
      } else {
      setCampaignKOLs(kols);
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
  const handleCancel = () => {
    setEditMode(false);
    setForm(campaign);
  };
  const handleChange = (field: keyof CampaignDetails, value: any) => {
    setForm((prev: CampaignDetails | null) => prev ? { ...prev, [field]: value } : prev);
  };

  // Report functions
  const fetchReportFiles = async () => {
    if (!id) return;
    setLoadingReportFiles(true);
    try {
      const { data, error } = await supabase
        .from('campaign_report_files')
        .select('*')
        .eq('campaign_id', campaign?.id)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setReportFiles(data || []);
    } catch (err) {
      console.error('Error fetching report files:', err);
      toast({ title: "Error", description: "Failed to fetch report files.", variant: "destructive" });
    } finally {
      setLoadingReportFiles(false);
    }
  };

  const fetchReportData = async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from('campaign_reports')
        .select('*')
        .eq('campaign_id', campaign?.id)
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
        title: 'Success',
        description: `File ${isPublic ? 'shown in' : 'hidden from'} public report`,
      });
    } catch (err: any) {
      console.error('Error updating file visibility:', err);
      toast({
        title: 'Error',
        description: 'Failed to update file visibility',
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

      toast({
        title: 'Success',
        description: 'File deleted successfully',
      });
    } catch (err: any) {
      console.error('Error deleting file:', err);
      toast({
        title: 'Error',
        description: 'Failed to delete file',
        variant: 'destructive',
      });
    }
  };

  const handleSaveCustomMessage = async () => {
    if (!id) return;
    try {
      // Check if report exists
      const { data: existingReport } = await supabase
        .from('campaign_reports')
        .select('id')
        .eq('campaign_id', campaign?.id)
        .single();

      if (existingReport) {
        // Update existing
        const { error } = await supabase
          .from('campaign_reports')
          .update({ custom_message: customMessage })
          .eq('campaign_id', campaign?.id);

        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from('campaign_reports')
          .insert({ campaign_id: campaign?.id, custom_message: customMessage });

        if (error) throw error;
      }

      toast({
        title: 'Success',
        description: 'Custom message saved',
      });
    } catch (err: any) {
      console.error('Error saving custom message:', err);
      toast({
        title: 'Error',
        description: 'Failed to save custom message',
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
        title: 'Success',
        description: `Public report ${enabled ? 'enabled' : 'disabled'}`,
      });
    } catch (err: any) {
      console.error('Error toggling public report:', err);
      toast({
        title: 'Error',
        description: err?.message || 'Failed to update public report setting',
        variant: 'destructive',
      });
    }
  };

  // Add local utility functions
  const formatDate = (dateString: string | undefined | null, fallback: string = "TBD") => {
    if (!dateString) return fallback;
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Active":
        return (
          <span className="inline-flex items-center gap-1"><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500"><CheckCircle className="h-3 w-3 text-white" strokeWidth={2} /></span>Active</span>
        );
      case "Planning":
        return (
          <span className="inline-flex items-center gap-1"><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-sky-500"><FileText className="h-3 w-3 text-white" strokeWidth={2} /></span>Planning</span>
        );
      case "Paused":
        return (
          <span className="inline-flex items-center gap-1"><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500"><PauseCircle className="h-3 w-3 text-white" strokeWidth={2} /></span>Paused</span>
        );
      case "Completed":
        return (
          <span className="inline-flex items-center gap-1"><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-600"><BadgeCheck className="h-3 w-3 text-white" strokeWidth={2} /></span>Completed</span>
        );
      default:
        return status;
    }
  };
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

  // Helper for parsing and formatting date strings for input/calendar
  const parseDate = (dateString: string | undefined | null) => {
    if (!dateString) return undefined;
    // Accepts YYYY-MM-DD or ISO string
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? undefined : d;
  };
  const formatDateForInput = (date: Date | undefined) => {
    if (!date) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  // Helper to display region as APAC, Global, or capitalized
  const displayRegion = (region: string | null | undefined) => {
    if (!region) return '-';
    if (region.toLowerCase() === 'apac') return 'APAC';
    if (region.toLowerCase() === 'global') return 'Global';
    return region.charAt(0).toUpperCase() + region.slice(1);
  };

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
      toast({ title: "Error", description: "Failed to fetch payments.", variant: "destructive" });
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
    setPaymentNotificationMessage(`$${opts.amount.toLocaleString()} has been deposited to ${opts.wallet}!\n\nThanks for being part of the Holo Hive network 🙌`);
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
        title: 'Error',
        description: error.message || 'Failed to send notification',
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
        title: 'Error',
        description: 'Failed to load email views',
        variant: 'destructive'
      });
    } finally {
      setLoadingEmailViews(false);
    }
  };

  const handleAddPayment = async () => {
    if (!campaign?.id || !newPaymentData.campaign_kol_id || newPaymentData.amount <= 0) {
      toast({ title: "Error", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('payments')
        .insert({
          campaign_id: campaign.id,
          campaign_kol_id: newPaymentData.campaign_kol_id,
          amount: newPaymentData.amount,
          payment_date: newPaymentData.payment_date,
          payment_method: newPaymentData.payment_method,
          content_id: newPaymentData.content_id === 'none' ? null : newPaymentData.content_id || null,
          transaction_id: newPaymentData.transaction_id || null,
          notes: newPaymentData.notes || null
        })
        .select()
        .single();

      if (error) throw error;

      setPayments(prev => [data, ...prev]);
      
      // Update the KOL's paid amount in the campaign_kols table
      const currentKol = campaignKOLs.find(kol => kol.id === newPaymentData.campaign_kol_id);
      const currentPaid = currentKol?.paid || 0;
      const newPaid = currentPaid + newPaymentData.amount;
      
      await supabase
        .from('campaign_kols')
        .update({ paid: newPaid })
        .eq('id', newPaymentData.campaign_kol_id);

      setCampaignKOLs(prev => prev.map(kol => 
        kol.id === newPaymentData.campaign_kol_id ? { ...kol, paid: newPaid } : kol
      ));

      setNewPaymentData({
        campaign_kol_id: '',
        amount: 0,
        payment_date: '',
        payment_method: 'Fiat',
        content_id: 'none',
        transaction_id: '',
        notes: ''
      });
      setIsAddingPayment(false);
      toast({ title: "Success", description: "Payment recorded successfully." });
    } catch (err) {
      console.error('Error adding payment:', err);
      toast({ title: "Error", description: "Failed to record payment.", variant: "destructive" });
    }
  };

  // `handleAddMultiKOLPayments` + `handleAddNonKOLPayment` moved into
  // <RecordPaymentDialog>. Both supabase inserts now live in that
  // component, which calls `fetchPayments` + `setCampaignKOLs`
  // (KOL-payment paid-total update) via the campaign-detail context.

  // `handleDeletePayment` moved into <BudgetTableView> on 2026-06-02.

  const handleEditPayment = (payment: any) => {
    setEditingPayment(payment);
    setNewPaymentData({
      campaign_kol_id: payment.campaign_kol_id,
      amount: payment.amount,
      payment_date: payment.payment_date,
      payment_method: payment.payment_method,
      content_id: payment.content_id || 'none',
      transaction_id: payment.transaction_id || '',
      notes: payment.notes || ''
    });
    setIsEditingPayment(true);
  };

  const handleUpdatePayment = async () => {
    if (!editingPayment) return;

    try {
      const oldAmount = editingPayment.amount;
      const newAmount = newPaymentData.amount;

      // Update the payment
      const { error } = await supabase
        .from('payments')
        .update({
          campaign_kol_id: newPaymentData.campaign_kol_id,
          amount: newAmount,
          payment_date: newPaymentData.payment_date,
          payment_method: newPaymentData.payment_method,
          content_id: (() => {
            // Handle array of content IDs
            if (Array.isArray(newPaymentData.content_id)) {
              return newPaymentData.content_id.length > 0 ? newPaymentData.content_id : null;
            }
            // Handle legacy single content_id
            return newPaymentData.content_id === 'none' ? null : (newPaymentData.content_id ? [newPaymentData.content_id] : null);
          })(),
          transaction_id: newPaymentData.transaction_id || null,
          notes: newPaymentData.notes || null
        })
        .eq('id', editingPayment.id);

      if (error) throw error;

      // Update the KOL's paid amount in the campaign_kols table
      const currentKol = campaignKOLs.find(kol => kol.id === newPaymentData.campaign_kol_id);
      const currentPaid = currentKol?.paid || 0;
      const newPaid = currentPaid - oldAmount + newAmount;
      
      await supabase
        .from('campaign_kols')
        .update({ paid: newPaid })
        .eq('id', newPaymentData.campaign_kol_id);

      // Update local state
      setCampaignKOLs(prev => prev.map(kol => 
        kol.id === newPaymentData.campaign_kol_id ? { ...kol, paid: newPaid } : kol
      ));

      setPayments(prev => prev.map(p => 
        p.id === editingPayment.id ? {
          ...p,
          campaign_kol_id: newPaymentData.campaign_kol_id,
          amount: newAmount,
          payment_date: newPaymentData.payment_date,
          payment_method: newPaymentData.payment_method,
          content_id: newPaymentData.content_id === 'none' ? null : newPaymentData.content_id,
          transaction_id: newPaymentData.transaction_id || null,
          notes: newPaymentData.notes || null
        } : p
      ));

      // Reset form
      setNewPaymentData({
        campaign_kol_id: '',
        amount: 0,
        payment_date: '',
        payment_method: 'Fiat',
        content_id: 'none',
        transaction_id: '',
        notes: ''
      });
      setIsEditingPayment(false);
      setEditingPayment(null);
      toast({ title: "Success", description: "Payment updated successfully." });
    } catch (err) {
      console.error('Error updating payment:', err);
      toast({ title: "Error", description: "Failed to update payment.", variant: "destructive" });
    }
  };


  // Add a getStatusColor helper:
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Curated': return 'bg-sky-100 text-sky-800';
      case 'Contacted': return 'bg-purple-100 text-purple-800';
      case 'Interested': return 'bg-amber-100 text-amber-800';
      case 'Onboarded': return 'bg-amber-100 text-amber-800';
      case 'Concluded': return 'bg-emerald-100 text-emerald-800';
      default: return 'bg-cream-100 text-ink-warm-700';
    }
  };

  // v11 tone map for `<StatusBadge>` — used by the KOL cards-view
  // chrome (and any new surface that wants the centralized palette
  // instead of the older hex-bg `getStatusColor` helper above).
  const KOL_STATUS_TONES: Record<string, BadgeTone> = {
    Curated:    'info',
    Contacted:  'purple',
    Interested: 'warning',
    Onboarded:  'warning',
    Concluded:  'success',
  };

  const getContentStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-sky-100 text-sky-800';
      case 'pending': return 'bg-amber-100 text-amber-800';
      case 'posted': return 'bg-emerald-100 text-emerald-800';
      default: return 'bg-cream-100 text-ink-warm-700';
    }
  };

  // `selectedKOLs`/`bulkStatus`/`showKOLDeleteDialog`/`kolsToDelete`
  // moved into <KolDashboardTableView> on 2026-06-02 (Table-view-only).
  // `quickAddContentKolId`/`quickAddContentCount` same.
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // `kolSearchTerm` + `filteredAvailableKOLs` removed 2026-06-02 — both
  // are now internal to <AddKOLsDialog>.
  const [isAddKOLsDialogOpen, setIsAddKOLsDialogOpen] = useState(false);
  // `isAddContentsDialogOpen` removed 2026-06-02 — the modal it
  // controlled was dead code (`<Dialog open={false}>`). The Add
  // Content button kicks off an inline-row creation flow instead.
  const [isShareCampaignOpen, setIsShareCampaignOpen] = useState(false);
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

  // ─── Master KOL edit dialog handlers ────────────────────────────────

  const openMasterKolEditDialog = (kol: MasterKOL) => {
    setEditingMasterKol(kol);
    setMasterKolForm({
      name: kol.name,
      link: kol.link,
      platform: kol.platform || [],
      followers: kol.followers,
      region: kol.region,
      community: kol.community ?? false,
      deliverables: kol.deliverables || [],
      creator_type: kol.creator_type || [],
      content_type: kol.content_type || [],
      niche: kol.niche || [],
      pricing: kol.pricing,
      // tier and rating fields removed (migration 071).
      in_house: kol.in_house,
      description: kol.description,
      wallet: kol.wallet,
    });
  };

  const handleSaveMasterKol = async () => {
    if (!editingMasterKol) return;
    if (!masterKolForm.name?.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    setSavingMasterKol(true);
    try {
      const updated = await KOLService.updateKOL({
        id: editingMasterKol.id,
        ...masterKolForm,
      } as any);
      // Mirror the change into local campaignKOLs so the table reflects
      // immediately without a full refetch.
      setCampaignKOLs(prev => prev.map(ck =>
        ck.master_kol.id === editingMasterKol.id
          ? { ...ck, master_kol: { ...ck.master_kol, ...updated } }
          : ck
      ));
      toast({ title: 'KOL updated', description: updated.name });
      setEditingMasterKol(null);
      setMasterKolForm({});
    } catch (err: any) {
      console.error('Error updating master KOL:', err);
      toast({ title: 'Save failed', description: err?.message || 'Failed to update KOL', variant: 'destructive' });
    } finally {
      setSavingMasterKol(false);
    }
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

  // Helper to get cell styling based on state
  const getCellClassName = (baseClass: string, table: string, rowId: string, field: string) => {
    if (isCellSelected(table, rowId, field)) {
      return `${baseClass} ring-2 ring-blue-500 bg-sky-50`;
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
  const [bulkContentStatus, setBulkContentStatus] = useState('');
  const [bulkContentPlatform, setBulkContentPlatform] = useState('');
  const [bulkContentType, setBulkContentType] = useState('');
  const [bulkContentActivationDate, setBulkContentActivationDate] = useState('');

  // 1. Add state for selection and bulk actions for contents
  const [selectedContents, setSelectedContents] = useState<string[]>([]);

  // Content filters state
  const [contentFilters, setContentFilters] = useState<{
    platform: string[];
    type: string[];
    status: string[];
    impressions_operator: string;
    impressions_value: string;
    likes_operator: string;
    likes_value: string;
    retweets_operator: string;
    retweets_value: string;
    comments_operator: string;
    comments_value: string;
    bookmarks_operator: string;
    bookmarks_value: string;
  }>({
    platform: [],
    type: [],
    status: [],
    impressions_operator: '',
    impressions_value: '',
    likes_operator: '',
    likes_value: '',
    retweets_operator: '',
    retweets_value: '',
    comments_operator: '',
    comments_value: '',
    bookmarks_operator: '',
    bookmarks_value: ''
  });

  // Content sorting state
  const [contentSort, setContentSort] = useState<{
    field: 'kol' | 'platform' | 'type' | 'status' | 'activation_date' | 'impressions' | 'likes' | 'retweets' | 'comments' | 'bookmarks' | 'created_at';
    direction: 'asc' | 'desc';
  }>({ field: 'activation_date', direction: 'desc' });

  // 2. Add filtering logic for search and status
  const filteredContents = contents.filter(content => {
    const kol = campaignKOLs.find(k => k.id === content.campaign_kols_id);
    const search = contentsSearchTerm.toLowerCase();

    // Platform filter
    if (contentFilters.platform.length > 0 && !contentFilters.platform.includes(content.platform || '')) {
      return false;
    }

    // Type filter
    if (contentFilters.type.length > 0 && !contentFilters.type.includes(content.type || '')) {
      return false;
    }

    // Status filter
    if (contentFilters.status.length > 0 && !contentFilters.status.includes(content.status || '')) {
      return false;
    }

    // Impressions filter
    if (contentFilters.impressions_operator && contentFilters.impressions_value) {
      const impressions = content.impressions || 0;
      const value = parseFloat(contentFilters.impressions_value);
      if (contentFilters.impressions_operator === '>' && !(impressions > value)) return false;
      if (contentFilters.impressions_operator === '<' && !(impressions < value)) return false;
      if (contentFilters.impressions_operator === '=' && !(impressions === value)) return false;
    }

    // Likes filter
    if (contentFilters.likes_operator && contentFilters.likes_value) {
      const likes = content.likes || 0;
      const value = parseFloat(contentFilters.likes_value);
      if (contentFilters.likes_operator === '>' && !(likes > value)) return false;
      if (contentFilters.likes_operator === '<' && !(likes < value)) return false;
      if (contentFilters.likes_operator === '=' && !(likes === value)) return false;
    }

    // Retweets filter
    if (contentFilters.retweets_operator && contentFilters.retweets_value) {
      const retweets = content.retweets || 0;
      const value = parseFloat(contentFilters.retweets_value);
      if (contentFilters.retweets_operator === '>' && !(retweets > value)) return false;
      if (contentFilters.retweets_operator === '<' && !(retweets < value)) return false;
      if (contentFilters.retweets_operator === '=' && !(retweets === value)) return false;
    }

    // Comments filter
    if (contentFilters.comments_operator && contentFilters.comments_value) {
      const comments = content.comments || 0;
      const value = parseFloat(contentFilters.comments_value);
      if (contentFilters.comments_operator === '>' && !(comments > value)) return false;
      if (contentFilters.comments_operator === '<' && !(comments < value)) return false;
      if (contentFilters.comments_operator === '=' && !(comments === value)) return false;
    }

    // Bookmarks filter
    if (contentFilters.bookmarks_operator && contentFilters.bookmarks_value) {
      const bookmarks = content.bookmarks || 0;
      const value = parseFloat(contentFilters.bookmarks_value);
      if (contentFilters.bookmarks_operator === '>' && !(bookmarks > value)) return false;
      if (contentFilters.bookmarks_operator === '<' && !(bookmarks < value)) return false;
      if (contentFilters.bookmarks_operator === '=' && !(bookmarks === value)) return false;
    }

    return (
      !search ||
      (kol?.master_kol?.name?.toLowerCase().includes(search)) ||
      (content.platform?.toLowerCase().includes(search)) ||
      (content.status?.toLowerCase().includes(search))
    );
  }).sort((a, b) => {
    const direction = contentSort.direction === 'asc' ? 1 : -1;

    switch (contentSort.field) {
      case 'kol': {
        const kolA = campaignKOLs.find(k => k.id === a.campaign_kols_id)?.master_kol?.name || '';
        const kolB = campaignKOLs.find(k => k.id === b.campaign_kols_id)?.master_kol?.name || '';
        return kolA.localeCompare(kolB) * direction;
      }
      case 'platform':
        return ((a.platform || '').localeCompare(b.platform || '')) * direction;
      case 'type':
        return ((a.type || '').localeCompare(b.type || '')) * direction;
      case 'status':
        return ((a.status || '').localeCompare(b.status || '')) * direction;
      case 'activation_date': {
        const dateA = a.activation_date ? new Date(a.activation_date).getTime() : 0;
        const dateB = b.activation_date ? new Date(b.activation_date).getTime() : 0;
        return (dateA - dateB) * direction;
      }
      case 'impressions':
        return ((a.impressions || 0) - (b.impressions || 0)) * direction;
      case 'likes':
        return ((a.likes || 0) - (b.likes || 0)) * direction;
      case 'retweets':
        return ((a.retweets || 0) - (b.retweets || 0)) * direction;
      case 'comments':
        return ((a.comments || 0) - (b.comments || 0)) * direction;
      case 'bookmarks':
        return ((a.bookmarks || 0) - (b.bookmarks || 0)) * direction;
      case 'created_at':
      default: {
        const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return (createdA - createdB) * direction;
      }
    }
  });

  // 3. Add bulk action handlers
  const handleSelectAllContents = () => {
    if (filteredContents.every(content => selectedContents.includes(content.id))) {
      setSelectedContents(prev => prev.filter(id => !filteredContents.some(c => c.id === id)));
    } else {
      setSelectedContents(prev => Array.from(new Set([...prev, ...filteredContents.map(c => c.id)])));
    }
  };
  const handleBulkDeleteContents = async () => {
    // Implement delete logic as needed
    setSelectedContents([]);
  };
  const handleBulkStatusChange = async () => {
    if (selectedContents.length === 0) return;

    // Build update object with only non-empty values
    const updateData: any = {};
    if (bulkContentStatus) updateData.status = bulkContentStatus;
    if (bulkContentPlatform) updateData.platform = bulkContentPlatform;
    if (bulkContentType) updateData.type = bulkContentType;
    if (bulkContentActivationDate) updateData.activation_date = bulkContentActivationDate;

    if (Object.keys(updateData).length === 0) {
      toast({
        title: 'No changes',
        description: 'Please select at least one field to update',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Update each selected content
      await Promise.all(selectedContents.map(contentId =>
        supabase.from('contents').update(updateData).eq('id', contentId)
      ));

      // Update local state
      setContents(prev => prev.map(content =>
        selectedContents.includes(content.id)
          ? { ...content, ...updateData }
          : content
      ));

      toast({
        title: 'Success',
        description: `Updated ${selectedContents.length} content item${selectedContents.length !== 1 ? 's' : ''}`,
      });

      // Reset selections and bulk values
      setSelectedContents([]);
      setBulkContentStatus('');
      setBulkContentPlatform('');
      setBulkContentType('');
      setBulkContentActivationDate('');
    } catch (error) {
      console.error('Error updating contents:', error);
      toast({
        title: 'Error',
        description: 'Failed to update contents',
        variant: 'destructive',
      });
    }
  };

  // 1. Add state for inline editing
  const [editingContentCell, setEditingContentCell] = useState<{ contentId: string, field: string } | null>(null);
  const [editingContentValue, setEditingContentValue] = useState<any>(null);

  // 2. Handle double-click to edit
  const handleContentCellDoubleClick = (contentId: string, field: string, value: any) => {
    setEditingContentCell({ contentId, field });
    setEditingContentValue(value);
  };

  // 3. Handle save
  const handleContentCellSave = async () => {
    if (!editingContentCell) return;
    const { contentId, field } = editingContentCell;
    const contentToUpdate = contents.find(c => c.id === contentId);
    if (!contentToUpdate) return;

    // Use handleContentCellSaveImmediate which already handles both new and existing rows
    await handleContentCellSaveImmediate(contentToUpdate, field, editingContentValue);
  };

  // 4. Handle cancel
  const handleContentCellCancel = () => {
    setEditingContentCell(null);
    setEditingContentValue(null);
  };

  // 5. Render editable cell
  // Helper function to move to the next editable cell when Tab is pressed
  const moveToNextContentCell = async (currentContent: any, currentField: string) => {
    // Define the order of editable fields (left to right in the table)
    const editableFields = [
      'campaign_kols_id', 'platform', 'type', 'status',
      'content_link', 'impressions', 'likes', 'retweets', 'comments', 'bookmarks'
    ];

    const currentFieldIndex = editableFields.indexOf(currentField);

    // If we're at the last field in the row, move to the first field of the next row
    if (currentFieldIndex === editableFields.length - 1) {
      const currentContentIndex = filteredContents.findIndex(c => c.id === currentContent.id);
      if (currentContentIndex < filteredContents.length - 1) {
        // Move to first field of next row
        const nextContent = filteredContents[currentContentIndex + 1];
        setEditingContentCell({ contentId: nextContent.id, field: editableFields[0] });
        setEditingContentValue(nextContent[editableFields[0]]);
      }
    } else {
      // Move to next field in the same row
      const nextField = editableFields[currentFieldIndex + 1];
      setEditingContentCell({ contentId: currentContent.id, field: nextField });
      setEditingContentValue(currentContent[nextField]);
    }
  };

  const renderEditableContentCell = (value: any, field: string, content: any) => {
    const isEditing = editingContentCell?.contentId === content.id && editingContentCell?.field === field;
    const textFields = ["content_link", "activation_date", "impressions", "likes", "retweets", "comments", "bookmarks", "notes"];
    const numberFields = ["impressions", "likes", "retweets", "comments", "bookmarks"];
    const selectFields = ["platform", "type", "status", "campaign_kols_id"];

    // Always-editable select fields with requested styling
    if (selectFields.includes(field)) {
        let options: string[] = [];
      let getColorClass = () => '';
      if (field === 'platform') {
        options = fieldOptions.platforms;
      } else if (field === 'type') {
        options = fieldOptions.deliverables;
        getColorClass = () => value ? getContentTypeColor(value) : 'bg-cream-100 text-ink-warm-700';
      } else if (field === 'status') {
        options = contentStatusOptions.map(o => o.value);
        getColorClass = () => value ? getContentStatusColor(value) : 'bg-cream-100 text-ink-warm-700';
      } else if (field === 'campaign_kols_id') {
        options = campaignKOLs.map(k => k.id);
      }
        return (
        <Select value={value || ''} onValueChange={async v => {
          setEditingContentCell({ contentId: content.id, field });
          setEditingContentValue(v);
          await handleContentCellSaveImmediate(content, field, v);
        }}>
          <SelectTrigger
            className={`border-none shadow-none bg-transparent w-auto h-auto px-2 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none ${['type','status'].includes(field) ? getColorClass() : ''}`}
            style={{ outline: 'none', boxShadow: 'none', minWidth: 90 }}
          >
            <SelectValue>
              {field === 'platform' && value ? (
                <span className="flex items-center gap-1">{getPlatformIcon(value)}</span>
              ) : field === 'type' && value ? (
                <span>{value}</span>
              ) : field === 'status' && value ? (
                <span>{contentStatusOptions.find(o => o.value === value)?.label || value}</span>
              ) : field === 'campaign_kols_id' && value ? (
                <span className="font-bold">{campaignKOLs.find(k => k.id === value)?.master_kol?.name || value}</span>
              ) : value || '-'}
            </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {options.map(option => (
                <SelectItem key={option} value={option}>
                  {field === 'platform' ? (
                    <span className="flex items-center gap-1">{getPlatformIcon(option)}</span>
                ) : field === 'type' ? (
                  <span>{option}</span>
                ) : field === 'status' ? (
                  <span>{contentStatusOptions.find(o => o.value === option)?.label || option}</span>
                  ) : field === 'campaign_kols_id' ? (
                  <span className="font-bold">{campaignKOLs.find(k => k.id === option)?.master_kol?.name || option}</span>
                  ) : option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
    }

    // Content Link: show as blue link, editable on double-click
    if (field === "content_link") {
      if (isEditing) {
        return (
          <Input
            value={editingContentValue ?? ''}
            onChange={e => setEditingContentValue(e.target.value)}
            onBlur={handleContentCellSave}
            onKeyDown={async (e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                await handleContentCellSave();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                handleContentCellCancel();
              }
              if (e.key === 'Tab') {
                e.preventDefault();
                await handleContentCellSave();
                await moveToNextContentCell(content, field);
              }
            }}
            className="w-full border-none shadow-none p-0 h-auto bg-transparent text-brand focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none"
            style={{ outline: 'none', boxShadow: 'none', userSelect: 'text' }}
            autoFocus
          />
        );
        }
        return (
          <div
            className="cursor-pointer w-full h-full flex items-center px-1 py-1"
          onDoubleClick={() => {
            setEditingContentCell({ contentId: content.id, field });
            setEditingContentValue(value);
          }}
            title="Double-click to edit"
          >
          {value ? (
            <a href={value} target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand-dark underline" onClick={e => e.stopPropagation()}>
              <span>{value}</span>
            </a>
          ) : '-'}
          </div>
        );
      }

    // Activation Date: always show as date picker
    if (field === "activation_date") {
      return (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={`focus-brand justify-start text-left font-normal h-9 w-full ${value ? 'text-ink-warm-900' : 'text-ink-warm-400'}`}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {value ? formatDisplayDate(value) : "Select activation date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-50" align="start">
            <CalendarComponent
              mode="single"
              selected={value ? new Date(value) : undefined}
              onSelect={date => handleContentCellSaveImmediate(content, field, date ? formatDateLocal(date) : '')}
              initialFocus
              classNames={{ day_selected: "text-white hover:text-white focus:text-white" }}
              modifiersStyles={{ selected: { backgroundColor: "#3e8692" } }}
            />
          </PopoverContent>
        </Popover>
      );
    }

    // For text/number fields: double-click to edit
    if (isEditing && (textFields.includes(field) || numberFields.includes(field))) {
      return (
        <Input
          type={numberFields.includes(field) ? 'number' : 'text'}
          value={editingContentValue ?? ''}
          onChange={e => setEditingContentValue(e.target.value)}
          onBlur={handleContentCellSave}
          onKeyDown={async (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              await handleContentCellSave();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              handleContentCellCancel();
            }
            if (e.key === 'Tab') {
              e.preventDefault();
              await handleContentCellSave();
              await moveToNextContentCell(content, field);
            }
          }}
          className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none"
          style={{ outline: 'none', boxShadow: 'none', userSelect: 'text' }}
          autoFocus
        />
      );
    }

    // Default display for text/number fields
    return (
      <div
        className="cursor-pointer w-full h-full flex items-center px-1 py-1"
        onDoubleClick={() => {
          if (textFields.includes(field) || numberFields.includes(field)) {
            setEditingContentCell({ contentId: content.id, field });
            setEditingContentValue(value);
          }
        }}
        title={textFields.includes(field) || numberFields.includes(field) ? "Double-click to edit" : undefined}
      >
        {numberFields.includes(field) && value ? Number(value).toLocaleString() : (value || '-')}
      </div>
    );
  };

  // 2. Add handleContentCellSaveImmediate for select fields
  const handleContentCellSaveImmediate = async (content: any, field: string, newValue: any) => {
    // Update local state
    setContents(prev => prev.map(c => c.id === content.id ? { ...c, [field]: newValue } : c));

    // If this is a new row, insert it immediately (even if empty fields exist)
    if (content.isNew) {
      const updatedContent = { ...content, [field]: newValue };

      // Insert into database immediately
      try {
        const payload = {
          campaign_id: campaign?.id,
          campaign_kols_id: updatedContent.campaign_kols_id || null,
          activation_date: updatedContent.activation_date || null,
          content_link: updatedContent.content_link || null,
          platform: updatedContent.platform || null,
          type: updatedContent.type || null,
          status: updatedContent.status || null,
          impressions: updatedContent.impressions ? Number(updatedContent.impressions) : null,
          likes: updatedContent.likes ? Number(updatedContent.likes) : null,
          retweets: updatedContent.retweets ? Number(updatedContent.retweets) : null,
          comments: updatedContent.comments ? Number(updatedContent.comments) : null,
          bookmarks: updatedContent.bookmarks ? Number(updatedContent.bookmarks) : null,
        };

        const { error, data } = await supabase.from('contents').insert(payload).select();

        if (error) {
          console.error('Error inserting content:', error);
          return;
        }

        // Replace the temporary row with the real one from the database
        if (data && data.length > 0) {
          const newContent = data[0];
          const kol = campaignKOLs.find(k => k.id === newContent.campaign_kols_id);
          const contentWithKol = {
            ...newContent,
            master_kol: kol?.master_kol,
            isNew: false
          };
          setContents(prev => prev.map(c => c.id === content.id ? contentWithKol : c));
        }
      } catch (err) {
        console.error('Error saving new content:', err);
      }
    } else {
      // Update existing content in database
      try {
        await supabase.from('contents').update({ [field]: newValue }).eq('id', content.id);
      } catch (err) {
        console.error('Error updating content:', err);
      }
    }

    // Auto-update campaign status to Active when content is posted
    if (field === 'status' && newValue?.toLowerCase() === 'posted' && campaign?.status === 'Planning') {
      try {
        await CampaignService.updateCampaign(campaign.id, { status: 'Active' });
        setCampaign(prev => prev ? { ...prev, status: 'Active' } : null);
      } catch (err) {
        console.error('Error auto-updating campaign status:', err);
      }
    }

    setEditingContentCell(null);
    setEditingContentValue(null);
  };

  // KOL inline editing functions moved into <KolDashboardTableView>
  // on 2026-06-02. `handleKolCellDoubleClick`, `handleKolCellSave`,
  // `handleKolCellCancel`, `handleKolCellSaveImmediate`,
  // `renderEditableKolCell` all live there now.

  // Add at the top of the component, after other useState declarations:
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  // `showBulkDeletePaymentsDialog` / `showPaymentDeleteDialog` /
  // `paymentToDelete` moved into <BudgetTableView>.
  const [contentToDelete, setContentToDelete] = useState<any | null>(null);

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
    return <div className="text-center py-8 text-rose-500">{error || "Campaign not found"}</div>;
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
      contents, setContents,
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
                  <span>Talent · Campaign</span>
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
                {/* Inline status pill + metrics row */}
                {campaign && (
                  <div className="flex items-center gap-2.5 mt-4 text-xs flex-wrap">
                    <span className={`inline-flex items-center gap-1.5 font-medium px-2 py-0.5 rounded-md ${
                      campaign.status === 'Active' ? 'bg-brand-soft text-brand-deep'
                      : campaign.status === 'Planning' ? 'bg-sky-50 text-sky-700'
                      : campaign.status === 'Paused' ? 'bg-amber-50 text-amber-700'
                      : campaign.status === 'Completed' ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-cream-100 text-ink-warm-700'
                    }`}>
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                        campaign.status === 'Active' ? 'bg-brand'
                        : campaign.status === 'Planning' ? 'bg-sky-500'
                        : campaign.status === 'Paused' ? 'bg-amber-500'
                        : campaign.status === 'Completed' ? 'bg-emerald-500'
                        : 'bg-ink-warm-400'
                      }`} aria-hidden />
                      {campaign.status}
                    </span>
                    {campaign.current_phase && (
                      <>
                        <span className="text-ink-warm-300">·</span>
                        <span className="text-ink-warm-700">{campaign.current_phase}</span>
                      </>
                    )}
                    {campaign.start_date && campaign.end_date && (() => {
                      const start = new Date(campaign.start_date + 'T00:00:00');
                      const end = new Date(campaign.end_date + 'T00:00:00');
                      const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
                      const elapsedDays = Math.max(0, Math.floor((Date.now() - start.getTime()) / 86_400_000));
                      const totalWeeks = Math.max(1, Math.ceil(totalDays / 7));
                      const currentWeek = Math.min(totalWeeks, Math.max(1, Math.ceil((elapsedDays + 1) / 7)));
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
                onClick={() => setIsShareCampaignOpen(true)}
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share Campaign
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
              Matches the mockup's "01 — …" counter format. */}
          <div className="section-head first flex items-center gap-3">
            <span className="dot bg-brand" aria-hidden />
            <span className="label">Workspace</span>
            <span className="flex-1" />
            <span className="counter">01 — Info · KOLs · Content · Budget</span>
          </div>

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
              <TabsTrigger
                value="information"
                className="relative px-3.5 py-2.5 text-sm font-medium text-ink-warm-500 hover:text-ink-warm-900 data-[state=active]:font-semibold data-[state=active]:text-brand-deep data-[state=active]:shadow-none data-[state=active]:bg-transparent rounded-none data-[state=active]:after:absolute data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-[2px] data-[state=active]:after:bg-brand data-[state=active]:after:rounded-t"
              >
                Information
              </TabsTrigger>
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
              {editMode && (
                <div className="mb-4 flex items-center justify-end gap-2">
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
                <CampaignDetailViewLayout
                  campaign={campaign}
                  setCampaign={setCampaign}
                  campaignKOLs={campaignKOLs}
                  payments={payments}
                  contents={contents}
                  allUsers={allUsers}
                  allocations={allocations}
                  editingCard={editingCard}
                  setEditingCard={setEditingCard}
                  onResourcesChange={async (next) => {
                    // Persist immediately — resources is a side-edit
                    // even in view mode; we don't want users to have
                    // to flip into Edit mode to add a Telegram link.
                    await handleSaveResources(next);
                  }}
                />
              )}

              {/* Existing form — only rendered in edit mode. */}
              {editMode && (
                <CardContent className="pt-6">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-8">
                                {/* [May 2026 audit] Recent Updates carousel
                                    hidden — feature had near-zero usage and
                                    cluttered the Info tab. State + handlers
                                    + the campaign_updates table all stay,
                                    so re-enable by flipping `false` below. */}
                                {false && !editMode && (
                  <div className="flex items-center justify-between col-span-2">
                    {/* Campaign Updates Carousel */}
                    <div className="flex-1 max-w-md">
                      <div className="text-sm font-medium text-ink-warm-700 mb-2">Recent Updates</div>
                      {loadingUpdates ? (
                        <div className="flex items-center gap-2">
                          {/* Left Arrow Skeleton */}
                          <Skeleton className="h-8 w-8 rounded-full" />
                          
                          {/* Update Card Skeleton */}
                          <div className="flex-1 bg-cream-50 border border-cream-200 rounded-lg p-3 min-h-[80px]">
                            <div className="space-y-2">
                              <Skeleton className="h-4 w-full" />
                              <Skeleton className="h-4 w-3/4" />
                              <Skeleton className="h-3 w-1/2" />
                            </div>
                          </div>
                          
                          {/* Right Arrow Skeleton */}
                          <Skeleton className="h-8 w-8 rounded-full" />
                        </div>
                      ) : campaignUpdates.length === 0 ? (
                        <div className="text-sm text-ink-warm-500 italic">No updates yet</div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            {/* Left Arrow */}
                            {campaignUpdates.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 bg-white hover:bg-cream-50 border border-cream-200 rounded-full flex-shrink-0"
                                onClick={prevUpdate}
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </Button>
                            )}
                            
                            {/* Update Card */}
                            <div className="flex-1 bg-cream-50 border border-cream-200 rounded-lg p-3 min-h-[80px] relative">
                              <div className="text-sm text-ink-warm-900 mb-1">
                                {campaignUpdates[currentUpdateIndex]?.update_text}
                              </div>
                              <div className="text-xs text-ink-warm-500">
                                {campaignUpdates[currentUpdateIndex] && new Date(campaignUpdates[currentUpdateIndex].created_at).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                              {/* Delete Button */}
                              <Dialog open={isDeleteUpdateDialogOpen} onOpenChange={setIsDeleteUpdateDialogOpen}>
                                <DialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="absolute bottom-2 right-2 h-6 w-6 p-0 text-ink-warm-400 hover:text-rose-500 hover:bg-rose-50"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-md">
                                  <DialogHeader>
                                    <DialogTitle>Confirm Delete</DialogTitle>
                                  </DialogHeader>
                                  <div className="text-sm text-ink-warm-700 mt-2 mb-2">
                                    Are you sure you want to delete this update?
                                  </div>
                                  <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
                                    <Button variant="outline" onClick={() => setIsDeleteUpdateDialogOpen(false)}>Cancel</Button>
                                    <Button 
                                      variant="destructive" 
                                      onClick={async () => {
                                        try {
                                          const updateToDelete = campaignUpdates[currentUpdateIndex];
                                          await supabase
                                            .from('campaign_updates')
                                            .delete()
                                            .eq('id', updateToDelete.id);
                                          
                                          toast({
                                            title: 'Update deleted',
                                            description: 'Campaign update deleted successfully.',
                                            duration: 3000,
                                          });
                                          
                                          // Refresh campaign updates
                                          fetchCampaignUpdates();
                                          setCurrentUpdateIndex(0);
                                          setIsDeleteUpdateDialogOpen(false);
                                        } catch (error) {
                                          console.error('Error deleting update:', error);
                                          toast({
                                            title: 'Error',
                                            description: 'Failed to delete update.',
                                            variant: 'destructive',
                                            duration: 3000,
                                          });
                                        }
                                      }}
                                    >
                                      Delete Update
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                            </div>
                            
                            {/* Right Arrow */}
                            {campaignUpdates.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 bg-white hover:bg-cream-50 border border-cream-200 rounded-full flex-shrink-0"
                                onClick={nextUpdate}
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          
                          {/* Dots Indicator */}
                          {campaignUpdates.length > 1 && (
                            <div className="flex justify-center mt-2 space-x-1">
                              {campaignUpdates.map((_, index) => (
                                <button
                                  key={index}
                                  className={`w-2 h-2 rounded-full transition-colors ${
                                    index === currentUpdateIndex 
                                      ? 'bg-brand' 
                                      : 'bg-cream-300 hover:bg-cream-300'
                                  }`}
                                  onClick={() => setCurrentUpdateIndex(index)}
                                />
                              ))}
                            </div>
                          )}
                          
                          {/* Update Counter */}
                          {campaignUpdates.length > 1 && (
                            <div className="text-xs text-ink-warm-500 text-center mt-1">
                              {currentUpdateIndex + 1} of {campaignUpdates.length}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {/* Add Update Button */}
                    <div className="flex-shrink-0">
                      <Dialog open={isAddUpdateDialogOpen} onOpenChange={setIsAddUpdateDialogOpen}>
                        <DialogTrigger asChild>
                          <Button variant="brand" size="sm">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Update
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                          <DialogHeader>
                            <DialogTitle>Add Campaign Update</DialogTitle>
                          </DialogHeader>
                          <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                              <Label htmlFor="update-text">Update</Label>
                              <Textarea
                                id="update-text"
                                placeholder="Enter the latest update for this campaign..."
                                value={updateText}
                                onChange={(e) => setUpdateText(e.target.value)}
                                className="focus-brand min-h-[120px]"
                                rows={4}
                              />
                            </div>
                          </div>
                          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
                            <Button variant="outline" onClick={() => {
                              setIsAddUpdateDialogOpen(false);
                              setUpdateText('');
                            }}>
                              Cancel
                            </Button>
                            <Button variant="brand" disabled={!updateText.trim() || isAddingUpdate} onClick={async () => {
                                if (!updateText.trim()) return;
                                
                                setIsAddingUpdate(true);
                                try {
                                  const { error } = await supabase
                                    .from('campaign_updates')
                                    .insert({
                                      // Non-null assertion: this code is in a
                                      // `false && ...` dead branch (Updates
                                      // section hidden per May 2026 audit).
                                      // TS still type-checks the JSX though.
                                      campaign_id: campaign!.id,
                                      update_text: updateText.trim()
                                    });
                                  
                                  if (error) {
                                    console.error('Error adding update:', error);
                                    toast({
                                      title: 'Error',
                                      description: 'Failed to add update.',
                                      variant: 'destructive',
                                      duration: 3000,
                                    });
                                    return;
                                  }
                                  
                                  toast({
                                    title: 'Update added',
                                    description: 'Campaign update added successfully.',
                                    duration: 3000,
                                  });
                                  
                                  setIsAddUpdateDialogOpen(false);
                                  setUpdateText('');
                                  // Refresh campaign updates
                                  fetchCampaignUpdates();
                                  setCurrentUpdateIndex(0);
                                } catch (err) {
                                  console.error('Unexpected error:', err);
                                  toast({
                                    title: 'Error',
                                    description: 'Failed to add update.',
                                    variant: 'destructive',
                                    duration: 3000,
                                  });
                                } finally {
                                  setIsAddingUpdate(false);
                                }
                              }}
                            >
                              {isAddingUpdate ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                              ) : (
                                'Add Update'
                              )}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                )}
                  {/* Campaign Name — only editable in edit mode; the
                      hero above shows it as the page title in view
                      mode so we don't duplicate. */}
                  {editMode && (
                    <div className="col-span-2 bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                      <Label htmlFor="campaign-name" className="text-[10px] mono uppercase tracking-[0.14em] text-ink-warm-500 mb-2 block">
                        Campaign Name <RequiredAsterisk />
                      </Label>
                      <Input
                        id="campaign-name"
                        value={form?.name || ""}
                        onChange={e => handleChange("name", e.target.value)}
                        className="focus-brand display-serif text-[19px] text-ink-warm-900 h-auto py-2"
                        placeholder="Enter campaign name"
                      />
                    </div>
                  )}
                  {/* Campaign Overview Section */}
                  <div className="bg-white p-6 rounded-[14px] border border-cream-200 shadow-card">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-9 h-9 rounded-md bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4" />
                      </div>
                      <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Campaign Overview</h3>
                    </div>
                    <div className="space-y-5">
                      {/* [May 2026 audit] Outline field hidden — Description
                          (the client-facing field below) covers the same
                          ground. Data + handler still wired so the save
                          payload preserves whatever was previously typed. */}
                      {false && (
                      <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em]">
                            Outline
                          </div>
                          <Badge variant="outline" className="text-[10px] text-ink-warm-500 border-cream-300">Internal</Badge>
                        </div>
                        {editMode ? (
                          <Textarea
                            value={form?.outline || ""}
                            onChange={e => handleChange("outline", e.target.value)}
                            className="focus-brand focus:ring-2 focus:ring-brand focus:border-brand"
                           
                            placeholder="Enter campaign outline..."
                            rows={3}
                          />
                        ) : (
                          <div className="text-sm text-ink-warm-700 leading-relaxed whitespace-pre-line">{campaign?.outline || <span className="text-ink-warm-400 italic">No outline provided</span>}</div>
                        )}
                      </div>
                      )}
                      <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em]">
                            Description
                          </div>
                          <Badge variant="outline" className="text-[10px] text-brand border-brand">Client-Facing</Badge>
                        </div>
                        {editMode ? (
                          <Textarea
                            value={form?.description || ""}
                            onChange={e => handleChange("description", e.target.value)}
                            className="focus-brand focus:ring-2 focus:ring-brand focus:border-brand"
                           
                            rows={3}
                          />
                        ) : (
                          <div className="text-sm text-ink-warm-700 leading-relaxed whitespace-pre-line">{campaign.description || <span className="text-ink-warm-400 italic">No description provided</span>}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Timeline Section */}
                  <div className="bg-white p-6 rounded-[14px] border border-cream-200 shadow-card">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-9 h-9 rounded-md bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center shrink-0">
                        <CalendarIcon className="h-4 w-4" />
                      </div>
                      <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Timeline</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">Start Date</div>
                        {editMode ? (
                      <Popover key="start-date-popover">
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={`focus-brand justify-start text-left font-normal h-9 ${form?.start_date ? 'text-ink-warm-900' : 'text-ink-warm-400'}`}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {form?.start_date ? formatDate(form.start_date) : "Select start date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-50" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={parseDate(form?.start_date)}
                            onSelect={date => handleChange("start_date", date ? formatDateForInput(date) : undefined)}
                            initialFocus
                            classNames={{ day_selected: "text-white hover:text-white focus:text-white" }}
                            modifiersStyles={{ selected: { backgroundColor: "#3e8692" } }}
                          />
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <div className="display-serif text-[17px] text-ink-warm-900 leading-tight">{formatDate(campaign?.start_date)}</div>
                    )}
                  </div>
                  <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                    <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">End Date</div>
                    {editMode ? (
                      <Popover key="end-date-popover">
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={`focus-brand justify-start text-left font-normal h-9 ${form?.end_date ? 'text-ink-warm-900' : 'text-ink-warm-400'}`}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {form?.end_date ? formatDate(form.end_date) : "Select end date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-50" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={parseDate(form?.end_date)}
                            onSelect={date => handleChange("end_date", date ? formatDateForInput(date) : undefined)}
                            disabled={date => form?.start_date ? date < parseDate(form.start_date)! : false}
                            initialFocus
                            classNames={{ day_selected: "text-white hover:text-white focus:text-white" }}
                            modifiersStyles={{ selected: { backgroundColor: "#3e8692" } }}
                          />
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <div className="display-serif text-[17px] text-ink-warm-900 leading-tight">{formatDate(campaign?.end_date)}</div>
                    )}
                  </div>
                  <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                    <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-brand" />
                      Region
                    </div>
                    {editMode ? (
                      <Select value={form?.region || ""} onValueChange={value => handleChange("region", value)}>
                        <SelectTrigger className="w-full focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand focus-brand">
                          <SelectValue />
                        </SelectTrigger>
                        {/* Region options match the view-mode
                            display-formatting rules (APAC / EMEA /
                            MENA / Global stay all-caps); aligned
                            across both modes so the user picks the
                            same label they read. */}
                        <SelectContent>
                          <SelectItem value="apac">APAC</SelectItem>
                          <SelectItem value="emea">EMEA</SelectItem>
                          <SelectItem value="mena">MENA</SelectItem>
                          <SelectItem value="global">Global</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="display-serif text-[17px] text-ink-warm-900 leading-tight">{displayRegion(campaign?.region)}</div>
                    )}
                  </div>
                  {/* [Phase edit relocation] Current Phase moved to the
                      Edit Portal popup on /clients (top of the Context
                      tab) so it lives next to the portal it controls.
                      The campaign list view still has the inline Phase
                      column for bulk visibility/editing. Block kept
                      under `false &&` so the data + handler logic is
                      preserved — flip to true to restore the field here. */}
                  {false && (
                  <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                    <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                      <Activity className="h-3.5 w-3.5 text-brand" />
                      Current Phase
                    </div>
                    {editMode ? (
                      <>
                        <Select
                          value={form?.current_phase ?? '__none__'}
                          onValueChange={value =>
                            handleChange('current_phase' as any, value === '__none__' ? null : value)
                          }
                        >
                          <SelectTrigger className="w-full focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand focus-brand">
                            <SelectValue placeholder="— None (hide badge)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— None (hide badge)</SelectItem>
                            {CURRENT_PHASE_OPTIONS.map(phase => (
                              <SelectItem key={phase} value={phase}>{phase}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-ink-warm-500 mt-1.5 leading-snug">
                          Shown in the client portal hero once onboarding completes.
                        </p>
                      </>
                    ) : campaign?.current_phase ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand/10 text-brand text-sm font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand" />
                        {campaign?.current_phase}
                      </span>
                    ) : (
                      <div className="text-sm text-ink-warm-400 italic">Not set</div>
                    )}
                  </div>
                  )}
                    </div>
                  </div>

                  {/* Client Information Section */}
                  <div className="bg-white p-6 rounded-[14px] border border-cream-200 shadow-card">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-9 h-9 rounded-md bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center shrink-0">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Client Information</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-3">Client</div>
                        {editMode ? (
                          <Select value={form?.client_id || ""} onValueChange={value => handleChange("client_id", value)}>
                            <SelectTrigger className="w-full focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand focus-brand">
                              <SelectValue placeholder="Select client" />
                            </SelectTrigger>
                            <SelectContent>
                              {allClients.map((client) => (
                                <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          (() => {
                            const clientName = campaign?.client_name || '-';
                            const clientEmail = campaign?.client_email || '';
                            const clientLogoUrl = campaign?.client_logo_url;
                            const initials = clientName !== '-' ? clientName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) : '?';
                            return (
                              <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10">
                                  {clientLogoUrl && <AvatarImage src={clientLogoUrl} alt={clientName} className="object-cover" />}
                                  <AvatarFallback className="bg-brand-soft text-brand-deep border border-brand-light font-semibold">
                                    {initials}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="font-semibold text-ink-warm-900">{clientName}</div>
                                  {clientEmail && <div className="text-xs text-ink-warm-500">{clientEmail}</div>}
                                </div>
                              </div>
                            );
                          })()
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Client Communication Section - Hidden */}
                  {false && <div className="bg-white p-6 rounded-[14px] border border-cream-200 shadow-card">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-9 h-9 rounded-md bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center shrink-0">
                        <Phone className="h-4 w-4" />
                      </div>
                      <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Client Communication</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">Intro Call</div>
                        {editMode ? (
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="intro_call"
                              checked={!!form?.intro_call}
                              onCheckedChange={checked => handleChange("intro_call", !!checked)}
                            />
                            <Label htmlFor="intro_call" className="text-sm">Intro call held?</Label>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {campaign?.intro_call ? (
                              <>
                                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                <span className="text-base font-semibold text-emerald-600">Completed</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-5 w-5 text-ink-warm-400" />
                                <span className="text-base font-medium text-ink-warm-400">Not Held</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      {!!(editMode ? form?.intro_call : campaign?.intro_call) && (
                        <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                          <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">Intro Call Date</div>
                          {editMode ? (
                        <Popover key="intro-call-popover">
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={`focus-brand justify-start text-left font-normal h-9 ${form?.intro_call_date ? 'text-ink-warm-900' : 'text-ink-warm-400'}`}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {form?.intro_call_date ? formatDate(form.intro_call_date) : "Select intro call date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-50" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={parseDate(form?.intro_call_date)}
                              onSelect={date => handleChange("intro_call_date", date ? formatDateForInput(date) : undefined)}
                              initialFocus
                              classNames={{ day_selected: "text-white hover:text-white focus:text-white" }}
                              modifiersStyles={{ selected: { backgroundColor: "#3e8692" } }}
                            />
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <div className="text-base font-semibold text-ink-warm-900">{campaign?.intro_call_date ? formatDate(campaign.intro_call_date) : '-'}</div>
                      )}
                        </div>
                      )}
                      <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">Proposal Sent</div>
                        {editMode ? (
                          <Checkbox id="proposal_sent" checked={!!form?.proposal_sent} onCheckedChange={checked => handleChange("proposal_sent", !!checked)} />
                        ) : (
                          <div className="flex items-center gap-2">
                            {campaign?.proposal_sent ? (
                              <>
                                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                <span className="text-base font-semibold text-emerald-600">Sent</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-5 w-5 text-ink-warm-400" />
                                <span className="text-base font-medium text-ink-warm-400">Not Sent</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">NDA Signed</div>
                        {editMode ? (
                          <Checkbox id="nda_signed" checked={!!form?.nda_signed} onCheckedChange={checked => handleChange("nda_signed", !!checked)} />
                        ) : (
                          <div className="flex items-center gap-2">
                            {campaign?.nda_signed ? (
                              <>
                                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                <span className="text-base font-semibold text-emerald-600">Signed</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-5 w-5 text-ink-warm-400" />
                                <span className="text-base font-medium text-ink-warm-400">Not Signed</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>}

                  {/* Team & Management Section */}
                  <div className="bg-white p-6 rounded-[14px] border border-cream-200 shadow-card">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-9 h-9 rounded-md bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center shrink-0">
                        <Users className="h-4 w-4" />
                      </div>
                      <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Team & Management</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-3">Manager</div>
                        {editMode ? (
                          <Select value={form?.manager || ""} onValueChange={value => handleChange("manager", value)}>
                            <SelectTrigger className="w-full focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand focus-brand">
                              <SelectValue placeholder="Select manager" />
                            </SelectTrigger>
                            <SelectContent>
                              {allUsers.map((user) => (
                                <SelectItem key={user.id} value={user.id}>{user.name || user.email}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          (() => {
                            const manager = allUsers.find(u => u.id === campaign.manager);
                            const managerName = manager?.name || manager?.email || '-';
                            const managerPhotoUrl = manager?.profile_photo_url;
                            const initials = managerName !== '-' ? managerName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) : '?';
                            return (
                              <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10">
                                  {managerPhotoUrl && <AvatarImage src={managerPhotoUrl} alt={managerName} className="object-cover" />}
                                  <AvatarFallback className="bg-brand-soft text-brand-deep border border-brand-light font-semibold">
                                    {initials}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="font-semibold text-ink-warm-900">{managerName}</div>
                                  {manager?.email && <div className="text-xs text-ink-warm-500">{manager.email}</div>}
                                </div>
                              </div>
                            );
                          })()
                        )}
                      </div>
                      {/* [May 2026 audit] Call Support hidden — flag was
                          rarely toggled and the value wasn't surfaced
                          anywhere downstream. Form state + save still
                          plumbed so existing data isn't lost. */}
                      {false && (
                      <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">Call Support</div>
                        {editMode ? (
                          <Checkbox id="call_support" checked={!!form?.call_support} onCheckedChange={checked => handleChange("call_support", !!checked)} />
                        ) : (
                          <div className="flex items-center gap-2">
                            {campaign?.call_support ? (
                              <>
                                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                <span className="text-base font-semibold text-emerald-600">Available</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-5 w-5 text-ink-warm-400" />
                                <span className="text-base font-medium text-ink-warm-400">Not Available</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      )}
                    </div>
                  </div>

                  {/* Campaign Settings Section */}
                  <div className="bg-white p-6 rounded-[14px] border border-cream-200 shadow-card">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-9 h-9 rounded-md bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center shrink-0">
                        <BadgeCheck className="h-4 w-4" />
                      </div>
                      <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Campaign Settings</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">Client Choosing KOLs</div>
                        {editMode ? (
                          <Checkbox id="client_choosing_kols" checked={!!form?.client_choosing_kols} onCheckedChange={checked => handleChange("client_choosing_kols", !!checked)} />
                        ) : (
                          <div className="flex items-center gap-2">
                            {campaign?.client_choosing_kols ? (
                              <>
                                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                <span className="text-base font-semibold text-emerald-600">Enabled</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-5 w-5 text-ink-warm-400" />
                                <span className="text-base font-medium text-ink-warm-400">Disabled</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">Multi-Activation</div>
                        {editMode ? (
                          <Checkbox id="multi_activation" checked={!!form?.multi_activation} onCheckedChange={checked => handleChange("multi_activation", !!checked)} />
                        ) : (
                          <div className="flex items-center gap-2">
                            {campaign?.multi_activation ? (
                              <>
                                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                <span className="text-base font-semibold text-emerald-600">Enabled</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-5 w-5 text-ink-warm-400" />
                                <span className="text-base font-medium text-ink-warm-400">Disabled</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Approved Access Section */}
                  <div className="bg-white p-6 rounded-[14px] border border-cream-200 shadow-card">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-9 h-9 rounded-md bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center shrink-0">
                        <Users className="h-4 w-4" />
                      </div>
                      <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Approved Access</h3>
                    </div>
                    <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                      <p className="text-sm text-ink-warm-700 mb-3">
                        {editMode
                          ? 'Add email addresses or domains that are allowed to access the public campaign view (in addition to the client email and same-domain emails).'
                          : 'Email addresses and domains allowed to access the public campaign view (in addition to the client email and same-domain emails).'}
                      </p>
                      {editMode && (
                        <div className="flex flex-col gap-2">
                          <Textarea
                            value={emailInput}
                            onChange={(e) => setEmailInput(e.target.value)}
                            placeholder={"Enter emails or domains (comma or newline separated)\ne.g. user@example.com, partner.com"}
                            className="focus-brand min-h-[80px]"
                          />
                          <Button
                            type="button"
                            onClick={() => {
                              const entries = emailInput
                                .split(/[\n,]+/)
                                .map(entry => entry.trim().toLowerCase())
                                .filter(entry => entry.length > 0);
                              const currentEmails = (form as any)?.approved_emails || [];
                              const newEmails = entries.filter(entry =>
                                entry.includes('@') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry) && !currentEmails.includes(entry)
                              );
                              if (newEmails.length > 0) {
                                handleChange('approved_emails' as any, [...currentEmails, ...newEmails]);
                                setEmailInput('');
                              }
                            }}
                            disabled={!emailInput.trim()}
                            variant="brand"
                            className="w-fit"
                          >
                            Add
                          </Button>
                        </div>
                      )}
                      {(() => {
                        const emails = (editMode ? (form as any)?.approved_emails : campaign?.approved_emails) || [];
                        return emails.length > 0 ? (
                          <div className={`flex flex-wrap gap-2 ${editMode ? 'mt-3' : ''}`}>
                            {emails.map((email: string, index: number) => (
                              <div
                                key={`email-${index}`}
                                className="inline-flex items-center gap-1 px-3 py-1 bg-cream-100 text-ink-warm-700 rounded-full text-sm"
                              >
                                {email}
                                {editMode && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const currentEmails = (form as any)?.approved_emails || [];
                                      handleChange('approved_emails' as any, currentEmails.filter((_: string, i: number) => i !== index));
                                    }}
                                    className="ml-1 text-ink-warm-500 hover:text-ink-warm-700"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          !editMode && (
                            <p className="text-sm text-ink-warm-400 italic">No approved emails or domains added yet.</p>
                          )
                        );
                      })()}
                    </div>
                  </div>

                  {/* Budget Section */}
                  <div className="bg-white p-6 rounded-[14px] border border-cream-200 shadow-card">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-9 h-9 rounded-md bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center shrink-0">
                        <DollarSign className="h-4 w-4" />
                      </div>
                      <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Budget</h3>
                    </div>
                    <div className="space-y-4">
                      {/* Budget Overview Card */}
                      <div className="bg-white p-5 rounded-lg border border-cream-200">
                        <div className="grid grid-cols-2 gap-6 mb-4">
                          <div>
                            <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">Total Budget</div>
                            {editMode ? (
                              <div className="relative w-full">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-warm-500 pointer-events-none">$</span>
                                <Input
                                  type="text"
                                  className="pl-6 w-full focus-brand focus:ring-2 focus:ring-brand focus:border-brand"
                                 
                                  value={form?.total_budget ? Number(form.total_budget).toLocaleString() : ""}
                                  onChange={e => {
                                    const value = e.target.value.replace(/,/g, '');
                                    if (value === '' || !isNaN(Number(value))) {
                                      handleChange("total_budget", value);
                                    }
                                  }}
                                />
                              </div>
                            ) : (
                              <div className="display-serif text-[28px] font-semibold text-ink-warm-900 tabular-nums leading-tight" style={{ letterSpacing: '-0.03em' }}>{CampaignService.formatCurrency(campaign.total_budget)}</div>
                            )}
                          </div>
                          <div>
                            <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">Allocated</div>
                            <div className="display-serif text-[28px] font-semibold text-brand tabular-nums leading-tight" style={{ letterSpacing: '-0.03em' }}>{CampaignService.formatCurrency(campaign.total_allocated || 0)}</div>
                          </div>
                        </div>
                        {/* Progress Bar */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-ink-warm-700">Budget Utilization</span>
                            <span className="text-sm font-bold text-ink-warm-900">{CampaignService.calculateBudgetUtilization(campaign.total_budget, campaign.total_allocated || 0)}%</span>
                          </div>
                          <div className="w-full bg-cream-200 rounded-full h-3 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-brand to-brand-dark transition-all duration-300 rounded-full"
                              style={{ width: `${Math.min(CampaignService.calculateBudgetUtilization(campaign.total_budget, campaign.total_allocated || 0), 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>

                      {/* Budget Type */}
                      <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-3">Budget Type</div>
                        {editMode ? (
                          <div className="flex gap-4">
                            {budgetTypeOptions.map(type => (
                              <div key={type} className="flex items-center gap-2">
                                <Checkbox
                                  id={`budget_type_${type}`}
                                  checked={form?.budget_type?.includes(type) || false}
                                  onCheckedChange={checked => {
                                    const current = form?.budget_type || [];
                                    if (checked) {
                                      handleChange("budget_type", [...current, type]);
                                    } else {
                                      handleChange("budget_type", current.filter(t => t !== type));
                                    }
                                  }}
                                />
                                <Label htmlFor={`budget_type_${type}`} className="text-sm capitalize">{type}</Label>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {(campaign?.budget_type || []).length > 0 ? (
                              (campaign?.budget_type || []).map((type: string) => (
                                <Badge key={type} variant="outline" className="capitalize text-brand border-brand">{type}</Badge>
                              ))
                            ) : (
                              <span className="text-ink-warm-400 italic">No budget types specified</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {editMode ? (
                      <div className="mt-4 bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-3">Regional Allocations</div>
                        <div className="flex flex-col gap-2">
                      {allocations.map((alloc, idx) => (
                        <div key={alloc.id || idx} className="flex items-center gap-2">
                          <Select value={alloc.region} onValueChange={value => {
                            const updated = [...allocations];
                            updated[idx].region = value;
                            setAllocations(updated);
                          }}>
                            <SelectTrigger className="w-32 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand focus-brand">
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
                              value={alloc.allocated_budget ? Number(String(alloc.allocated_budget).replace(/,/g, '')).toLocaleString('en-US') : ''}
                              onChange={e => {
                                // Remove all non-digit and non-comma characters, then remove commas
                                const raw = e.target.value.replace(/[^\d,]/g, '').replace(/,/g, '');
                                const updated = [...allocations];
                                updated[idx].allocated_budget = raw;
                                setAllocations(updated);
                              }}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-rose-500 hover:text-rose-700"
                            onClick={() => {
                              if (alloc.id) setDeletedAllocIds(ids => [...ids, alloc.id]);
                              setAllocations(allocations.filter((_, i) => i !== idx));
                            }}
                            aria-label="Remove allocation"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => setAllocations([...allocations, { region: '', allocated_budget: '' }])}
                      >Add Allocation</Button>
                        </div>
                      </div>
                    ) : (
                      Array.isArray(campaign.budget_allocations) && campaign.budget_allocations.length > 0 && (
                        <div className="mt-4 bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                          <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-3">Regional Allocations</div>
                          <div className="flex flex-wrap gap-2">
                            {campaign.budget_allocations.map((alloc: any) => (
                              <Badge key={alloc.id} variant="secondary" className="px-3 py-1.5 text-sm">
                                <MapPin className="h-3.5 w-3.5 mr-1.5 inline" />
                                {alloc.region === 'apac' ? 'APAC' : alloc.region === 'global' ? 'Global' : alloc.region}: {CampaignService.formatCurrency(alloc.allocated_budget)}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </div>

                {editMode && (
                  <div className="flex gap-2 mt-6 col-span-2">
                    <Button variant="brand" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
                    <Button variant="outline" onClick={handleCancel} disabled={saving}>Cancel</Button>
                  </div>
                )}
                    </div>
              </CardContent>
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
              <CardContent className="pt-0 px-0">
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
              </CardContent>
          </TabsContent>

          <TabsContent value="contents" className="mt-4">
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
                      The inline flow lives in the onClick below. */}
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
                          setEditingContentCell({ contentId: newId, field: 'campaign_kols_id' });
                        }}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Content
                      </Button>
              </div>
              <CardContent className="pt-0 px-0">
                {/* View toggle moved to the toolbar row above. */}
                {/* Overview View extracted to
                    `components/campaign/ContentDashboardOverview.tsx`
                    on 2026-06-02 (read-only KPIs + Avg ER + cumulative
                    impressions line chart). */}
                {contentsViewMode === 'overview' && <ContentDashboardOverview />}

                {/* Table Tab - Existing Contents Table */}
                {contentsViewMode === 'table' && (
                  <>
                <div className="flex items-center justify-between mb-2 gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-warm-400" />
                    <Input
                      placeholder="Search Contents by KOL, platform, or status..."
                      className="pl-10 focus-brand"
                      value={contentsSearchTerm}
                      onChange={e => setContentsSearchTerm(e.target.value)}
                    />
                  </div>
                  {/* Sort Menu */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-ink-warm-500">Sort by:</span>
                    <Select
                      value={contentSort.field}
                      onValueChange={(value: typeof contentSort.field) => setContentSort(prev => ({ ...prev, field: value }))}
                    >
                      <SelectTrigger className="w-[160px] h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="created_at">Date Added</SelectItem>
                        <SelectItem value="kol">KOL Name</SelectItem>
                        <SelectItem value="platform">Platform</SelectItem>
                        <SelectItem value="type">Type</SelectItem>
                        <SelectItem value="status">Status</SelectItem>
                        <SelectItem value="activation_date">Activation Date</SelectItem>
                        <SelectItem value="impressions">Impressions</SelectItem>
                        <SelectItem value="likes">Likes</SelectItem>
                        <SelectItem value="retweets">Retweets</SelectItem>
                        <SelectItem value="comments">Comments</SelectItem>
                        <SelectItem value="bookmarks">Bookmarks</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-2"
                      onClick={() => setContentSort(prev => ({ ...prev, direction: prev.direction === 'asc' ? 'desc' : 'asc' }))}
                    >
                      {contentSort.direction === 'asc' ? (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
                        </svg>
                      )}
                    </Button>
                  </div>
                </div>
                {selectedContents.length > 0 && (
                <div className="mb-6 mt-6">
                  <div className="bg-white border border-cream-200 rounded-[14px] p-6 shadow-card">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-cream-500 rounded-full"></div>
                        <span className="text-sm font-semibold text-ink-warm-700">{selectedContents.length} Content{selectedContents.length !== 1 ? 's' : ''} selected</span>
                      </div>
                      <div className="h-4 w-px bg-cream-300"></div>
                      <span className="text-xs text-ink-warm-700 font-medium">Bulk Edit Fields</span>
                    </div>
                    <div className="flex flex-wrap items-end gap-4">
                      <div className="flex flex-col items-end justify-end">
                        <div className="h-5"></div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-ink-warm-700 border-cream-300 hover:bg-cream-50"
                          onClick={handleSelectAllContents}
                        >
                          {filteredContents.length > 0 && filteredContents.every(content => selectedContents.includes(content.id)) ? 'Deselect All' : 'Select All'}
                        </Button>
                      </div>
                      <div className="min-w-[120px] flex flex-col items-end justify-end">
                        <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Platform</span>
                        <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
                          <Select value={bulkContentPlatform} onValueChange={v => setBulkContentPlatform(v)}>
                            <SelectTrigger
                              className="border-none shadow-none bg-transparent h-7 px-0 py-0 text-xs font-semibold text-black focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none [&>span]:text-xs [&>span]:font-semibold [&>span]:text-black"
                              style={{ outline: 'none', boxShadow: 'none' }}
                            >
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {fieldOptions.platforms.map(platform => (
                                <SelectItem key={platform} value={platform}>{platform}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="min-w-[120px] flex flex-col items-end justify-end">
                        <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Type</span>
                        <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
                          <Select value={bulkContentType} onValueChange={v => setBulkContentType(v)}>
                            <SelectTrigger
                              className="border-none shadow-none bg-transparent h-7 px-0 py-0 text-xs font-semibold text-black focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none [&>span]:text-xs [&>span]:font-semibold [&>span]:text-black"
                              style={{ outline: 'none', boxShadow: 'none' }}
                            >
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {fieldOptions.deliverables.map(type => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="min-w-[120px] flex flex-col items-end justify-end">
                        <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Status</span>
                        <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
                          <Select value={bulkContentStatus} onValueChange={v => setBulkContentStatus(v)}>
                            <SelectTrigger
                              className="border-none shadow-none bg-transparent h-7 px-0 py-0 text-xs font-semibold text-black focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none [&>span]:text-xs [&>span]:font-semibold [&>span]:text-black"
                              style={{ outline: 'none', boxShadow: 'none' }}
                            >
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {contentStatusOptions.map(option => (
                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="min-w-[140px] flex flex-col items-end justify-end">
                        <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Activation Date</span>
                        <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                className="h-7 px-0 py-0 text-xs font-semibold text-black hover:bg-transparent"
                              >
                                {bulkContentActivationDate ? formatDisplayDate(bulkContentActivationDate) : 'Select'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarComponent
                                mode="single"
                                selected={bulkContentActivationDate ? new Date(bulkContentActivationDate) : undefined}
                                onSelect={date => setBulkContentActivationDate(date ? formatDateLocal(date) : '')}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex flex-col items-end justify-end">
                          <div className="h-5"></div>
                          <Button
                            size="sm"
                            variant="brand" className="whitespace-nowrap"
                            disabled={selectedContents.length === 0 || (!bulkContentStatus && !bulkContentPlatform && !bulkContentType && !bulkContentActivationDate)}
                            onClick={handleBulkStatusChange}
                          >
                            Apply
                          </Button>
                        </div>
                        <div className="flex flex-col items-end justify-end">
                          <div className="h-5"></div>
                          <Button
                            size="sm"
                            variant="destructive" className="whitespace-nowrap"
                            disabled={selectedContents.length === 0}
                            onClick={() => setShowBulkDeleteDialog(true)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                      <div className="text-xs text-ink-warm-500 font-medium ml-auto whitespace-nowrap">
                        {selectedContents.length > 0 && `${selectedContents.length} item${selectedContents.length !== 1 ? 's' : ''} selected`}
                      </div>
                    </div>
                  </div>
                </div>
                )}
                {loadingContents ? (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 text-center whitespace-nowrap">#</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 text-left select-none">KOL</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">Platform</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">Type</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">Status</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">Activation Date</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">Content Link</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Impressions</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Impressions</div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Select
                                        value={contentFilters.impressions_operator}
                                        onValueChange={(value) => setContentFilters(prev => ({ ...prev, impressions_operator: value }))}
                                      >
                                        <SelectTrigger className="w-16 h-8 text-xs focus:ring-0 focus:ring-offset-0">
                                          <SelectValue placeholder="=" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value=">">{'>'}</SelectItem>
                                          <SelectItem value="<">{'<'}</SelectItem>
                                          <SelectItem value="=">=</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        type="number"
                                        placeholder="Value"
                                        value={contentFilters.impressions_value}
                                        onChange={(e) => setContentFilters(prev => ({ ...prev, impressions_value: e.target.value }))}
                                        className="h-8 text-xs focus-brand"
                                      />
                                    </div>
                                    {(contentFilters.impressions_operator || contentFilters.impressions_value) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, impressions_operator: '', impressions_value: '' }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {(contentFilters.impressions_operator && contentFilters.impressions_value) && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  1
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Likes</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Likes</div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Select
                                        value={contentFilters.likes_operator}
                                        onValueChange={(value) => setContentFilters(prev => ({ ...prev, likes_operator: value }))}
                                      >
                                        <SelectTrigger className="w-16 h-8 text-xs focus:ring-0 focus:ring-offset-0">
                                          <SelectValue placeholder="=" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value=">">{'>'}</SelectItem>
                                          <SelectItem value="<">{'<'}</SelectItem>
                                          <SelectItem value="=">=</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        type="number"
                                        placeholder="Value"
                                        value={contentFilters.likes_value}
                                        onChange={(e) => setContentFilters(prev => ({ ...prev, likes_value: e.target.value }))}
                                        className="h-8 text-xs focus-brand"
                                      />
                                    </div>
                                    {(contentFilters.likes_operator || contentFilters.likes_value) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, likes_operator: '', likes_value: '' }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {(contentFilters.likes_operator && contentFilters.likes_value) && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  1
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Retweets</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Retweets</div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Select
                                        value={contentFilters.retweets_operator}
                                        onValueChange={(value) => setContentFilters(prev => ({ ...prev, retweets_operator: value }))}
                                      >
                                        <SelectTrigger className="w-16 h-8 text-xs focus:ring-0 focus:ring-offset-0">
                                          <SelectValue placeholder="=" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value=">">{'>'}</SelectItem>
                                          <SelectItem value="<">{'<'}</SelectItem>
                                          <SelectItem value="=">=</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        type="number"
                                        placeholder="Value"
                                        value={contentFilters.retweets_value}
                                        onChange={(e) => setContentFilters(prev => ({ ...prev, retweets_value: e.target.value }))}
                                        className="h-8 text-xs focus-brand"
                                      />
                                    </div>
                                    {(contentFilters.retweets_operator || contentFilters.retweets_value) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, retweets_operator: '', retweets_value: '' }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {(contentFilters.retweets_operator && contentFilters.retweets_value) && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  1
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Comments</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Comments</div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Select
                                        value={contentFilters.comments_operator}
                                        onValueChange={(value) => setContentFilters(prev => ({ ...prev, comments_operator: value }))}
                                      >
                                        <SelectTrigger className="w-16 h-8 text-xs focus:ring-0 focus:ring-offset-0">
                                          <SelectValue placeholder="=" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value=">">{'>'}</SelectItem>
                                          <SelectItem value="<">{'<'}</SelectItem>
                                          <SelectItem value="=">=</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        type="number"
                                        placeholder="Value"
                                        value={contentFilters.comments_value}
                                        onChange={(e) => setContentFilters(prev => ({ ...prev, comments_value: e.target.value }))}
                                        className="h-8 text-xs focus-brand"
                                      />
                                    </div>
                                    {(contentFilters.comments_operator || contentFilters.comments_value) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, comments_operator: '', comments_value: '' }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {(contentFilters.comments_operator && contentFilters.comments_value) && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  1
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Bookmarks</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Bookmarks</div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Select
                                        value={contentFilters.bookmarks_operator}
                                        onValueChange={(value) => setContentFilters(prev => ({ ...prev, bookmarks_operator: value }))}
                                      >
                                        <SelectTrigger className="w-16 h-8 text-xs focus:ring-0 focus:ring-offset-0">
                                          <SelectValue placeholder="=" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value=">">{'>'}</SelectItem>
                                          <SelectItem value="<">{'<'}</SelectItem>
                                          <SelectItem value="=">=</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        type="number"
                                        placeholder="Value"
                                        value={contentFilters.bookmarks_value}
                                        onChange={(e) => setContentFilters(prev => ({ ...prev, bookmarks_value: e.target.value }))}
                                        className="h-8 text-xs focus-brand"
                                      />
                                    </div>
                                    {(contentFilters.bookmarks_operator || contentFilters.bookmarks_value) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, bookmarks_operator: '', bookmarks_value: '' }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {(contentFilters.bookmarks_operator && contentFilters.bookmarks_value) && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  1
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none" style={{ minWidth: '150px' }}>Notes</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 select-none">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...Array(5)].map((_, i) => (
                          <TableRow key={i}>
                            {[...Array(13)].map((_, j) => (
                              <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : contents.length === 0 ? (
                  <div className="text-center py-8 text-ink-warm-500">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-ink-warm-300" />
                    <p className="text-lg font-medium mb-2">No content created yet</p>
                    <p className="text-sm text-ink-warm-400">Content created for this campaign will appear here.</p>
                  </div>
                ) : (
                  <div ref={contentTableRef} className="border rounded-lg" style={{ overflow: 'auto', overflowX: 'auto', overflowY: 'auto' }}>
                    <Table className="min-w-full" style={{ tableLayout: 'auto', width: 'auto', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                      <TableHeader>
                        <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 text-center whitespace-nowrap group cursor-pointer hover:bg-cream-100 transition-colors px-4" style={{ minWidth: '60px', width: '60px' }} onClick={handleSelectAllContents}>
                            <span className="group-hover:hidden">#</span>
                            <Checkbox
                              className="hidden group-hover:inline-flex"
                              checked={filteredContents.length > 0 && filteredContents.every(content => selectedContents.includes(content.id))}
                            />
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 text-left select-none">KOL</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Platform</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Platform</div>
                                    {['X','Telegram','YouTube','Facebook','TikTok'].map((platform) => (
                                      <div
                                        key={platform}
                                        className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
                                        onClick={() => {
                                          const newPlatforms = contentFilters.platform.includes(platform)
                                            ? contentFilters.platform.filter(p => p !== platform)
                                            : [...contentFilters.platform, platform];
                                          setContentFilters(prev => ({ ...prev, platform: newPlatforms }));
                                        }}
                                      >
                                        <Checkbox checked={contentFilters.platform.includes(platform)} />
                                        <div className="flex items-center gap-1" title={platform}>
                                          {getPlatformIcon(platform)}
                                        </div>
                                      </div>
                                    ))}
                                    {contentFilters.platform.length > 0 && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full mt-2 text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, platform: [] }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {contentFilters.platform.length > 0 && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  {contentFilters.platform.length}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Type</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Type</div>
                                    {['Video','Thread','Post','Story','Reel','Short'].map((type) => (
                                      <div
                                        key={type}
                                        className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
                                        onClick={() => {
                                          const newTypes = contentFilters.type.includes(type)
                                            ? contentFilters.type.filter(t => t !== type)
                                            : [...contentFilters.type, type];
                                          setContentFilters(prev => ({ ...prev, type: newTypes }));
                                        }}
                                      >
                                        <Checkbox checked={contentFilters.type.includes(type)} />
                                        <span className="text-sm">{type}</span>
                                      </div>
                                    ))}
                                    {contentFilters.type.length > 0 && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full mt-2 text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, type: [] }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {contentFilters.type.length > 0 && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  {contentFilters.type.length}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Status</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Status</div>
                                    {contentStatusOptions.map((option) => (
                                      <div
                                        key={option.value}
                                        className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
                                        onClick={() => {
                                          const newStatuses = contentFilters.status.includes(option.value)
                                            ? contentFilters.status.filter(s => s !== option.value)
                                            : [...contentFilters.status, option.value];
                                          setContentFilters(prev => ({ ...prev, status: newStatuses }));
                                        }}
                                      >
                                        <Checkbox checked={contentFilters.status.includes(option.value)} />
                                        <span className="text-sm">{option.label}</span>
                                      </div>
                                    ))}
                                    {contentFilters.status.length > 0 && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full mt-2 text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, status: [] }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {contentFilters.status.length > 0 && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  {contentFilters.status.length}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">Activation Date</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">Content Link</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Impressions</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Impressions</div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Select
                                        value={contentFilters.impressions_operator}
                                        onValueChange={(value) => setContentFilters(prev => ({ ...prev, impressions_operator: value }))}
                                      >
                                        <SelectTrigger className="w-16 h-8 text-xs focus:ring-0 focus:ring-offset-0">
                                          <SelectValue placeholder="=" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value=">">{'>'}</SelectItem>
                                          <SelectItem value="<">{'<'}</SelectItem>
                                          <SelectItem value="=">=</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        type="number"
                                        placeholder="Value"
                                        value={contentFilters.impressions_value}
                                        onChange={(e) => setContentFilters(prev => ({ ...prev, impressions_value: e.target.value }))}
                                        className="h-8 text-xs focus-brand"
                                      />
                                    </div>
                                    {(contentFilters.impressions_operator || contentFilters.impressions_value) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, impressions_operator: '', impressions_value: '' }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {(contentFilters.impressions_operator && contentFilters.impressions_value) && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  1
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Likes</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Likes</div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Select
                                        value={contentFilters.likes_operator}
                                        onValueChange={(value) => setContentFilters(prev => ({ ...prev, likes_operator: value }))}
                                      >
                                        <SelectTrigger className="w-16 h-8 text-xs focus:ring-0 focus:ring-offset-0">
                                          <SelectValue placeholder="=" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value=">">{'>'}</SelectItem>
                                          <SelectItem value="<">{'<'}</SelectItem>
                                          <SelectItem value="=">=</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        type="number"
                                        placeholder="Value"
                                        value={contentFilters.likes_value}
                                        onChange={(e) => setContentFilters(prev => ({ ...prev, likes_value: e.target.value }))}
                                        className="h-8 text-xs focus-brand"
                                      />
                                    </div>
                                    {(contentFilters.likes_operator || contentFilters.likes_value) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, likes_operator: '', likes_value: '' }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {(contentFilters.likes_operator && contentFilters.likes_value) && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  1
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Retweets</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Retweets</div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Select
                                        value={contentFilters.retweets_operator}
                                        onValueChange={(value) => setContentFilters(prev => ({ ...prev, retweets_operator: value }))}
                                      >
                                        <SelectTrigger className="w-16 h-8 text-xs focus:ring-0 focus:ring-offset-0">
                                          <SelectValue placeholder="=" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value=">">{'>'}</SelectItem>
                                          <SelectItem value="<">{'<'}</SelectItem>
                                          <SelectItem value="=">=</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        type="number"
                                        placeholder="Value"
                                        value={contentFilters.retweets_value}
                                        onChange={(e) => setContentFilters(prev => ({ ...prev, retweets_value: e.target.value }))}
                                        className="h-8 text-xs focus-brand"
                                      />
                                    </div>
                                    {(contentFilters.retweets_operator || contentFilters.retweets_value) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, retweets_operator: '', retweets_value: '' }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {(contentFilters.retweets_operator && contentFilters.retweets_value) && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  1
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Comments</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Comments</div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Select
                                        value={contentFilters.comments_operator}
                                        onValueChange={(value) => setContentFilters(prev => ({ ...prev, comments_operator: value }))}
                                      >
                                        <SelectTrigger className="w-16 h-8 text-xs focus:ring-0 focus:ring-offset-0">
                                          <SelectValue placeholder="=" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value=">">{'>'}</SelectItem>
                                          <SelectItem value="<">{'<'}</SelectItem>
                                          <SelectItem value="=">=</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        type="number"
                                        placeholder="Value"
                                        value={contentFilters.comments_value}
                                        onChange={(e) => setContentFilters(prev => ({ ...prev, comments_value: e.target.value }))}
                                        className="h-8 text-xs focus-brand"
                                      />
                                    </div>
                                    {(contentFilters.comments_operator || contentFilters.comments_value) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, comments_operator: '', comments_value: '' }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {(contentFilters.comments_operator && contentFilters.comments_value) && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  1
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Bookmarks</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Bookmarks</div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Select
                                        value={contentFilters.bookmarks_operator}
                                        onValueChange={(value) => setContentFilters(prev => ({ ...prev, bookmarks_operator: value }))}
                                      >
                                        <SelectTrigger className="w-16 h-8 text-xs focus:ring-0 focus:ring-offset-0">
                                          <SelectValue placeholder="=" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value=">">{'>'}</SelectItem>
                                          <SelectItem value="<">{'<'}</SelectItem>
                                          <SelectItem value="=">=</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <Input
                                        type="number"
                                        placeholder="Value"
                                        value={contentFilters.bookmarks_value}
                                        onChange={(e) => setContentFilters(prev => ({ ...prev, bookmarks_value: e.target.value }))}
                                        className="h-8 text-xs focus-brand"
                                      />
                                    </div>
                                    {(contentFilters.bookmarks_operator || contentFilters.bookmarks_value) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setContentFilters(prev => ({ ...prev, bookmarks_operator: '', bookmarks_value: '' }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {(contentFilters.bookmarks_operator && contentFilters.bookmarks_value) && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  1
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none" style={{ minWidth: '150px' }}>Notes</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 select-none">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="bg-white">
                        {filteredContents.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={14} className="text-center py-12">
                              <div className="flex flex-col items-center justify-center text-ink-warm-500">
                                <FileText className="h-12 w-12 mb-4 text-ink-warm-300" />
                                <p className="text-lg font-medium mb-2">No content matches your filters</p>
                                <p className="text-sm text-ink-warm-400 mb-4">Try adjusting your filter criteria</p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setContentFilters({
                                      platform: [],
                                      type: [],
                                      status: [],
                                      impressions_operator: '',
                                      impressions_value: '',
                                      likes_operator: '',
                                      likes_value: '',
                                      retweets_operator: '',
                                      retweets_value: '',
                                      comments_operator: '',
                                      comments_value: '',
                                      bookmarks_operator: '',
                                      bookmarks_value: ''
                                    });
                                    setContentsSearchTerm('');
                                  }}
                                >
                                  Reset All Filters
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredContents.map((content, index) => {
                          const kol = campaignKOLs.find(k => k.id === content.campaign_kols_id);
                          return (
                            <TableRow key={content.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} hover:bg-cream-100 transition-colors border-b border-cream-200`}>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 px-4 py-2 overflow-hidden text-center text-ink-warm-700 group`} style={{ verticalAlign: 'middle', minWidth: '60px', width: '60px' }}>
                                <div className="flex items-center justify-center w-full h-full">
                                  {selectedContents.includes(content.id) ? (
                                    <Checkbox
                                      checked={true}
                                      onCheckedChange={checked => {
                                        setSelectedContents(prev => checked ? [...prev, content.id] : prev.filter(id => id !== content.id));
                                      }}
                                      className="mx-auto"
                                    />
                                  ) : (
                                    <>
                                      <span className="block group-hover:hidden w-full text-center">{index + 1}</span>
                                      <span className="hidden group-hover:flex w-full justify-center">
                                        <Checkbox
                                          checked={selectedContents.includes(content.id)}
                                          onCheckedChange={checked => {
                                            setSelectedContents(prev => checked ? [...prev, content.id] : prev.filter(id => id !== content.id));
                                          }}
                                          className="mx-auto"
                                        />
                                      </span>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden text-ink-warm-700 group`} style={{ verticalAlign: 'middle', fontWeight: 'bold', width: '20%' }}>
                                <div className="flex items-center w-full h-full">
                                  {renderEditableContentCell(content.campaign_kols_id, 'campaign_kols_id', content)}
                                </div>
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden`}>
                                {renderEditableContentCell(content.platform, 'platform', content)}
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden`}>
                                {renderEditableContentCell(content.type, 'type', content)}
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden`}>
                                {renderEditableContentCell(content.status, 'status', content)}
                              </TableCell>
                              <TableCell
                                className={getCellClassName(`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden cursor-pointer`, 'contents', content.id, 'activation_date')}
                                onClick={(e) => {
                                  // Don't select if clicking on input during edit
                                  if (editingContentCell?.contentId !== content.id || editingContentCell?.field !== 'activation_date') {
                                    handleCellSelect('contents', content.id, 'activation_date', content.activation_date);
                                  }
                                }}
                              >
                                {renderEditableContentCell(content.activation_date, 'activation_date', content)}
                              </TableCell>
                              <TableCell
                                className={getCellClassName(`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden cursor-pointer`, 'contents', content.id, 'content_link')}
                                onClick={(e) => {
                                  if (editingContentCell?.contentId !== content.id || editingContentCell?.field !== 'content_link') {
                                    handleCellSelect('contents', content.id, 'content_link', content.content_link);
                                  }
                                }}
                              >
                                {renderEditableContentCell(content.content_link, 'content_link', content)}
                              </TableCell>
                              <TableCell
                                className={getCellClassName(`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden cursor-pointer`, 'contents', content.id, 'impressions')}
                                onClick={(e) => {
                                  if (editingContentCell?.contentId !== content.id || editingContentCell?.field !== 'impressions') {
                                    handleCellSelect('contents', content.id, 'impressions', content.impressions);
                                  }
                                }}
                              >
                                {renderEditableContentCell(content.impressions, 'impressions', content)}
                              </TableCell>
                              <TableCell
                                className={getCellClassName(`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden cursor-pointer`, 'contents', content.id, 'likes')}
                                onClick={(e) => {
                                  if (editingContentCell?.contentId !== content.id || editingContentCell?.field !== 'likes') {
                                    handleCellSelect('contents', content.id, 'likes', content.likes);
                                  }
                                }}
                              >
                                {renderEditableContentCell(content.likes, 'likes', content)}
                              </TableCell>
                              <TableCell
                                className={getCellClassName(`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden cursor-pointer`, 'contents', content.id, 'retweets')}
                                onClick={(e) => {
                                  if (editingContentCell?.contentId !== content.id || editingContentCell?.field !== 'retweets') {
                                    handleCellSelect('contents', content.id, 'retweets', content.retweets);
                                  }
                                }}
                              >
                                {renderEditableContentCell(content.retweets, 'retweets', content)}
                              </TableCell>
                              <TableCell
                                className={getCellClassName(`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden cursor-pointer`, 'contents', content.id, 'comments')}
                                onClick={(e) => {
                                  if (editingContentCell?.contentId !== content.id || editingContentCell?.field !== 'comments') {
                                    handleCellSelect('contents', content.id, 'comments', content.comments);
                                  }
                                }}
                              >
                                {renderEditableContentCell(content.comments, 'comments', content)}
                              </TableCell>
                              <TableCell
                                className={getCellClassName(`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden cursor-pointer`, 'contents', content.id, 'bookmarks')}
                                onClick={(e) => {
                                  if (editingContentCell?.contentId !== content.id || editingContentCell?.field !== 'bookmarks') {
                                    handleCellSelect('contents', content.id, 'bookmarks', content.bookmarks);
                                  }
                                }}
                              >
                                {renderEditableContentCell(content.bookmarks, 'bookmarks', content)}
                              </TableCell>
                              <TableCell
                                className={getCellClassName(`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden cursor-pointer`, 'contents', content.id, 'notes')}
                                onClick={(e) => {
                                  if (editingContentCell?.contentId !== content.id || editingContentCell?.field !== 'notes') {
                                    handleCellSelect('contents', content.id, 'notes', content.notes);
                                  }
                                }}
                              >
                                {renderEditableContentCell(content.notes, 'notes', content)}
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} p-2 overflow-hidden`}>
                                <Button size="sm" variant="outline" onClick={() => { setContentToDelete(content); setShowDeleteDialog(true); }}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
                  </>
                )}
              </CardContent>
          </TabsContent>

          {/* Budget Tab */}
          <TabsContent value="payments" className="mt-4">
              {/* Toolbar row: view-mode toggle on the left, Export +
                  Record Payment on the right — merged onto one line. */}
              <div className="mb-3 flex flex-row items-center justify-between gap-2">
                  {/* View toggle — uses the Tabs primitive for
                      consistency with the main tab strip + other
                      v11 tabbed surfaces. */}
                  <Tabs value={paymentViewMode} onValueChange={(v) => setPaymentViewMode(v as 'table' | 'graph')}>
                    <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200">
                      <TabsTrigger value="graph" className="data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-brand text-sm">
                        <BarChart3 className="h-4 w-4 mr-1.5" />
                        Overview
                      </TabsTrigger>
                      <TabsTrigger value="table" className="data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-brand text-sm">
                        <TableIcon className="h-4 w-4 mr-1.5" />
                        Table
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <div className="flex items-center gap-2">
                  {/* Export CSV button lives inside the BudgetTableView
                      component since the 2026-06-02 cleanup — only
                      shows in Table view (Overview can't be exported). */}
                  {/* Record Payment trigger — dialog body lives in
                      `components/campaign/RecordPaymentDialog.tsx`
                      since the 2026-06-02 structural pass. The button
                      stays here so it remains part of the Budget tab
                      toolbar layout. */}
                  <Button variant="brand" size="sm" onClick={() => setIsAddingPayment(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Record Payment
                  </Button>
                  <RecordPaymentDialog ref={recordPaymentDialogRef} open={isAddingPayment} onOpenChange={setIsAddingPayment} />
                  </div>
              </div>
              <CardContent className="pt-0 px-0">
                {/* View toggle moved to the toolbar row above. */}

                {/* Table View — extracted to
                    `components/campaign/BudgetTableView.tsx` on
                    2026-06-02. Owns its own sort + filter + selection
                    + inline-edit + delete-dialog state. */}
                {paymentViewMode === 'table' && <BudgetTableView />}

                {/* Graph (Overview) View — extracted to
                    `components/campaign/BudgetOverview.tsx` on
                    2026-06-02. Read-only: 3-KPI hero + Regional
                    Budget Summary grid + 4 recharts panels. */}
                {paymentViewMode === 'graph' && <BudgetOverview />}
              </CardContent>
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
      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          {(() => {
            const linkedPayments = contentToDelete ? payments.filter(p => {
              const ids = Array.isArray(p.content_id) ? p.content_id : (p.content_id ? [p.content_id] : []);
              return ids.includes(contentToDelete.id);
            }) : [];
            return (
              <>
                <div className="text-sm text-ink-warm-700 mt-2 mb-2">Are you sure you want to delete this content?</div>
                {linkedPayments.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                    <p className="font-medium text-amber-800 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" />
                      {linkedPayments.length} linked payment{linkedPayments.length !== 1 ? 's' : ''} will also be deleted
                    </p>
                    <p className="text-amber-700 mt-1">
                      Total: ${linkedPayments.reduce((sum, p) => sum + (p.amount || 0), 0).toLocaleString()}
                    </p>
                  </div>
                )}
              </>
            );
          })()}
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              setShowDeleteDialog(false);
              if (!contentToDelete) return;
              const contentId = contentToDelete.id;
              const linkedPaymentIds = payments
                .filter(p => {
                  const ids = Array.isArray(p.content_id) ? p.content_id : (p.content_id ? [p.content_id] : []);
                  return ids.includes(contentId);
                })
                .map(p => p.id);
              const prevContents = [...contents];
              setContents(prev => prev.filter(c => c.id !== contentId));
              setPayments(prev => prev.filter(p => !linkedPaymentIds.includes(p.id)));
              try {
                if (linkedPaymentIds.length > 0) {
                  await Promise.all(linkedPaymentIds.map(id => supabase.from('payments').delete().eq('id', id)));
                }
                await supabase.from('contents').delete().eq('id', contentId);
                toast({
                  title: 'Content deleted',
                  description: linkedPaymentIds.length > 0
                    ? `Content and ${linkedPaymentIds.length} linked payment${linkedPaymentIds.length !== 1 ? 's' : ''} deleted.`
                    : 'Content deleted successfully.',
                  variant: 'destructive',
                  duration: 3000,
                });
              } catch (error) {
                setContents(prevContents);
                fetchPayments();
                toast({
                  title: 'Error',
                  description: 'Failed to delete content.',
                  variant: 'destructive',
                  duration: 3000,
                });
              }
              setContentToDelete(null);
            }}>Delete Content</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Payment Delete + Bulk Payment Delete dialogs moved into
          <BudgetTableView> on 2026-06-02. */}

      {/* KOL Delete confirmation dialog moved into
          <KolDashboardTableView> on 2026-06-02 since the bulk-delete
          flow is entirely Table-view-internal. */}

      <Dialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Bulk Delete</DialogTitle>
          </DialogHeader>
          {(() => {
            const linkedPayments = payments.filter(p => {
              const ids = Array.isArray(p.content_id) ? p.content_id : (p.content_id ? [p.content_id] : []);
              return ids.some((id: string) => selectedContents.includes(id));
            });
            return (
              <>
                <div className="text-sm text-ink-warm-700 mt-2 mb-2">Are you sure you want to delete {selectedContents.length} content item{selectedContents.length !== 1 ? 's' : ''}?</div>
                {linkedPayments.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                    <p className="font-medium text-amber-800 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" />
                      {linkedPayments.length} linked payment{linkedPayments.length !== 1 ? 's' : ''} will also be deleted
                    </p>
                    <p className="text-amber-700 mt-1">
                      Total: ${linkedPayments.reduce((sum, p) => sum + (p.amount || 0), 0).toLocaleString()}
                    </p>
                  </div>
                )}
              </>
            );
          })()}
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setShowBulkDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              setShowBulkDeleteDialog(false);
              const toDelete = selectedContents;
              const linkedPaymentIds = payments
                .filter(p => {
                  const ids = Array.isArray(p.content_id) ? p.content_id : (p.content_id ? [p.content_id] : []);
                  return ids.some((id: string) => toDelete.includes(id));
                })
                .map(p => p.id);
              const prevContents = [...contents];
              setContents(prev => prev.filter(c => !toDelete.includes(c.id)));
              setPayments(prev => prev.filter(p => !linkedPaymentIds.includes(p.id)));
              try {
                if (linkedPaymentIds.length > 0) {
                  await Promise.all(linkedPaymentIds.map(id => supabase.from('payments').delete().eq('id', id)));
                }
                await Promise.all(toDelete.map(contentId => supabase.from('contents').delete().eq('id', contentId)));
                toast({
                  title: 'Contents deleted',
                  description: linkedPaymentIds.length > 0
                    ? `${toDelete.length} content item${toDelete.length !== 1 ? 's' : ''} and ${linkedPaymentIds.length} linked payment${linkedPaymentIds.length !== 1 ? 's' : ''} deleted.`
                    : `${toDelete.length} content item${toDelete.length !== 1 ? 's' : ''} deleted successfully.`,
                  variant: 'destructive',
                  duration: 3000,
                });
              } catch (error) {
                setContents(prevContents);
                fetchPayments();
                toast({
                  title: 'Error',
                  description: 'Failed to delete some content items.',
                  variant: 'destructive',
                  duration: 3000,
                });
              }
              setSelectedContents([]);
            }}>Delete Content</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Payments dialog moved into <BudgetTableView>. */}

      {/* Edit Payment Dialog */}
      <Dialog open={isEditingPayment} onOpenChange={setIsEditingPayment}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Payment</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 flex-1 overflow-y-auto px-1">
            <div className="grid gap-2">
              <Label htmlFor="edit-kol">KOL</Label>
              <Select
                value={newPaymentData.campaign_kol_id}
                onValueChange={(value) => setNewPaymentData(prev => ({ ...prev, campaign_kol_id: value }))}
              >
                <SelectTrigger className="focus-brand">
                  <SelectValue placeholder="Select KOL" />
                </SelectTrigger>
                <SelectContent>
                  {campaignKOLs.map((kol) => (
                    <SelectItem key={kol.id} value={kol.id}>
                      {kol.master_kol?.name || 'Unknown KOL'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-amount">Amount (USD)</Label>
              <div className="relative w-full">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-warm-500 pointer-events-none">$</span>
                <Input
                  id="edit-amount"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9,]*"
                  className="focus-brand pl-6 w-full"
                  value={newPaymentData.amount ? Number(newPaymentData.amount).toLocaleString('en-US') : ''}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    setNewPaymentData(prev => ({ ...prev, amount: parseFloat(raw) || 0 }));
                  }}
                  placeholder="Enter amount"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Payment Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={`focus-brand justify-start text-left font-normal h-9 ${newPaymentData.payment_date ? 'text-ink-warm-900' : 'text-ink-warm-400'}`}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newPaymentData.payment_date ? formatDisplayDate(newPaymentData.payment_date) : "Select payment date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="!bg-white border shadow-md w-auto p-0 z-50" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={newPaymentData.payment_date ? new Date(newPaymentData.payment_date) : undefined}
                    onSelect={date => setNewPaymentData(prev => ({
                      ...prev,
                      payment_date: date ? formatDateLocal(date) : ''
                    }))}
                    initialFocus
                    classNames={{
                      day_selected: "text-white hover:text-white focus:text-white",
                    }}
                    modifiersStyles={{
                      selected: { backgroundColor: "#3e8692" }
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-payment-method">Payment Method</Label>
              <Select
                value={newPaymentData.payment_method}
                onValueChange={(value) => setNewPaymentData(prev => ({ ...prev, payment_method: value }))}
              >
                <SelectTrigger className="focus-brand">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Token">Token</SelectItem>
                  <SelectItem value="Fiat">Fiat</SelectItem>
                  <SelectItem value="WL">WL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-content">Content</Label>
              <MultiSelect
                options={contents
                  .filter(content => content.campaign_kols_id === newPaymentData.campaign_kol_id)
                  .map(content => content.id)}
                selected={Array.isArray(newPaymentData.content_id) ? newPaymentData.content_id : (newPaymentData.content_id && newPaymentData.content_id !== 'none' ? [newPaymentData.content_id] : [])}
                onSelectedChange={(selectedIds) => setNewPaymentData(prev => ({ ...prev, content_id: selectedIds as unknown as string }))}
                className="focus-brand"
                triggerContent={
                  <div>
                    {(() => {
                      const selectedIds = Array.isArray(newPaymentData.content_id) ? newPaymentData.content_id : (newPaymentData.content_id && newPaymentData.content_id !== 'none' ? [newPaymentData.content_id] : []);
                      if (selectedIds.length === 0) {
                        return <span className="text-ink-warm-400">Select content</span>;
                      }
                      const selectedContents = contents.filter(c => selectedIds.includes(c.id));
                      return (
                        <span className="text-sm">
                          {selectedContents.length} content{selectedContents.length !== 1 ? 's' : ''} selected
                        </span>
                      );
                    })()}
                  </div>
                }
                renderOption={(contentId) => {
                  const content = contents.find(c => c.id === contentId);
                  if (!content) return contentId;
                  return `${content.type || 'Content'} - ${content.platform || 'Unknown'}${content.activation_date ? ` (${formatDisplayDate(content.activation_date)})` : ''}`;
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-transaction-id">Transaction ID (Optional)</Label>
              <Input
                id="edit-transaction-id"
                value={newPaymentData.transaction_id}
                onChange={(e) => setNewPaymentData(prev => ({ ...prev, transaction_id: e.target.value }))}
                placeholder="Enter transaction ID"
                className="focus-brand"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-notes">Notes (Optional)</Label>
              <Textarea
                id="edit-notes"
                value={newPaymentData.notes}
                onChange={(e) => setNewPaymentData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Add any notes about this payment"
                rows={3}
                className="focus-brand"
              />
            </div>
          </div>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setIsEditingPayment(false)}>
              Cancel
            </Button>
            <Button variant="brand" onClick={handleUpdatePayment} disabled={!newPaymentData.campaign_kol_id || newPaymentData.amount <= 0}>
              Update Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Campaign Dialog */}
      <Dialog open={isShareCampaignOpen} onOpenChange={setIsShareCampaignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share Campaign: {campaign?.name}</DialogTitle>
            <DialogDescription>
              Share this campaign by copying the link below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Campaign Details</Label>
              <div className="bg-cream-50 rounded-lg p-3 text-sm">
                <div className="flex justify-between mb-2">
                  <span className="font-medium">Client:</span>
                  <span>{campaign?.client_name || 'Unknown'}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="font-medium">Budget:</span>
                  <span>{CampaignService.formatCurrency(campaign?.total_budget || 0)}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="font-medium">Dates:</span>
                  <span>{campaign ? new Date(campaign.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''} - {campaign?.end_date ? new Date(campaign.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Status:</span>
                  <span>{campaign?.status}</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="public-password">Password for Public View</Label>
              <div className="bg-sky-50 rounded-lg p-3 text-sm border border-sky-200">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-sky-900">Client Email:</span>
                  <span className="text-sm font-mono text-sky-700">{campaign?.client_email || 'N/A'}</span>
                </div>
                <p className="text-xs text-brand mt-2">Use the client's email address as the password to access the public campaign view</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="share-creator-type"
                  checked={campaign?.share_creator_type || false}
                  onCheckedChange={async (checked) => {
                    if (campaign?.id) {
                      try {
                        await CampaignService.updateCampaign(campaign.id, {
                          share_creator_type: checked as boolean
                        } as any);
                        setCampaign({ ...campaign, share_creator_type: checked as boolean });
                      } catch (error) {
                        console.error('Error updating campaign:', error);
                      }
                    }
                  }}
                />
                <Label htmlFor="share-creator-type" className="text-sm font-medium cursor-pointer">
                  Share Creator Type for KOLs
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="share-kol-notes"
                  checked={(campaign as any)?.share_kol_notes || false}
                  onCheckedChange={async (checked) => {
                    if (campaign?.id) {
                      try {
                        await CampaignService.updateCampaign(campaign.id, {
                          share_kol_notes: checked as boolean
                        } as any);
                        setCampaign({ ...campaign, share_kol_notes: checked as boolean } as any);
                      } catch (error) {
                        console.error('Error updating campaign:', error);
                      }
                    }
                  }}
                />
                <Label htmlFor="share-kol-notes" className="text-sm font-medium cursor-pointer">
                  Share KOL Notes
                </Label>
              </div>
              {/* Sibling to share_kol_notes — same idea, but for the
                  per-content-piece notes column on the Contents table
                  in the public view. Gated by campaigns.share_content_notes
                  (migration 065). */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="share-content-notes"
                  checked={(campaign as any)?.share_content_notes || false}
                  onCheckedChange={async (checked) => {
                    if (campaign?.id) {
                      try {
                        await CampaignService.updateCampaign(campaign.id, {
                          share_content_notes: checked as boolean,
                        } as any);
                        setCampaign({ ...campaign, share_content_notes: checked as boolean } as any);
                      } catch (error) {
                        console.error('Error updating campaign:', error);
                      }
                    }
                  }}
                />
                <Label htmlFor="share-content-notes" className="text-sm font-medium cursor-pointer">
                  Share Notes on Content Pieces
                </Label>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="share-campaign-link">Share Link</Label>
              <div className="flex gap-2">
                <Input
                  id="share-campaign-link"
                  value={`${typeof window !== 'undefined' ? window.location.origin : ''}/public/campaigns/${campaign?.id}`}
                  readOnly
                  className="flex-1 focus-brand"
                />
                <Button
                  variant="outline"
                  className="h-10"
                  onClick={() => {
                    if (typeof window !== 'undefined' && campaign?.id) {
                      navigator.clipboard.writeText(`${window.location.origin}/public/campaigns/${campaign.id}`);
                      toast({
                        title: 'Link Copied',
                        description: 'Campaign link has been copied to clipboard',
                      });
                    }
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="h-10"
                  onClick={() => {
                    if (typeof window !== 'undefined' && campaign?.id) {
                      window.open(`${window.location.origin}/public/campaigns/${campaign.id}`, '_blank');
                    }
                  }}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Warnings Dialog */}
      <Dialog open={isWarningsOpen} onOpenChange={setIsWarningsOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Campaign Validation Warnings ({missingFields.length})
            </DialogTitle>
            <DialogDescription>
              The following fields are missing or incomplete. Click on any item to navigate to the relevant tab.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-1 space-y-2 py-4">
            {missingFields.map((item, index) => (
              <button
                key={index}
                onClick={() => {
                  setActiveTab(item.tab);
                  setIsWarningsOpen(false);
                }}
                className="w-full text-left p-3 rounded-lg border border-cream-200 hover:border-amber-500 hover:bg-amber-50 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <div>
                      <p className="font-medium text-ink-warm-900 group-hover:text-amber-700">{item.label}</p>
                      <p className="text-sm text-ink-warm-500 capitalize">
                        {item.tab === 'information' ? 'Information' :
                         item.tab === 'kols' ? 'KOL Dashboard' :
                         item.tab === 'contents' ? 'Content Dashboard' :
                         item.tab === 'payments' ? 'Budget' :
                         item.tab}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-ink-warm-400 group-hover:text-amber-500" />
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Email Views Dialog */}
      <Dialog open={isEmailViewsDialogOpen} onOpenChange={setIsEmailViewsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Email Views: {campaign?.name}
            </DialogTitle>
            <DialogDescription>
              Emails that have accessed this campaign via the public link.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {loadingEmailViews ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand"></div>
              </div>
            ) : emailViews.length === 0 ? (
              <div className="text-center py-8 text-ink-warm-500">
                <Eye className="h-12 w-12 mx-auto mb-4 text-ink-warm-300" />
                <p>No email views recorded yet.</p>
                <p className="text-sm mt-2">Views will appear here when users access the campaign via the public link.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                <div className="text-sm text-ink-warm-500 mb-3">
                  {emailViews.length} view{emailViews.length !== 1 ? 's' : ''} recorded
                </div>
                {emailViews.map((view) => (
                  <div
                    key={view.id}
                    className="flex items-center justify-between p-3 bg-cream-50 rounded-lg hover:bg-cream-100 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-ink-warm-900 truncate">{view.email}</p>
                      <p className="text-xs text-ink-warm-500">
                        {new Date(view.viewed_at).toLocaleString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setIsEmailViewsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Notification Confirmation Dialog */}
      <Dialog open={paymentNotifyDialogOpen} onOpenChange={setPaymentNotifyDialogOpen}>
        <DialogContent className="max-w-md overflow-hidden">
          <DialogHeader>
            <DialogTitle>Send Payment Notification?</DialogTitle>
            <DialogDescription>
              Send a payment notification to {pendingPaymentNotification?.kolName}'s Telegram chat?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-cream-50 rounded-lg p-4 space-y-2 overflow-hidden">
              <div className="flex items-center justify-between">
                <p className="text-sm text-ink-warm-700">{isEditingPaymentMessage ? 'Edit message:' : 'Message preview:'}</p>
                {!isEditingPaymentMessage && (
                  <button
                    type="button"
                    onClick={() => setIsEditingPaymentMessage(true)}
                    className="text-sm text-brand hover:underline flex items-center gap-1"
                  >
                    <Edit className="h-3.5 w-3.5" />
                    Edit
                  </button>
                )}
              </div>
              {isEditingPaymentMessage ? (
                <Textarea
                  value={paymentNotificationMessage}
                  onChange={(e) => setPaymentNotificationMessage(e.target.value)}
                  className="focus-brand min-h-[100px] text-sm"
                  autoFocus
                />
              ) : (
                <p className="font-medium text-ink-warm-900 break-words whitespace-pre-line">
                  {paymentNotificationMessage}
                </p>
              )}
            </div>
            {pendingPaymentNotification?.chatTitle && (
              <p className="text-xs text-ink-warm-500 mt-2 break-words">
                Will be sent to: {pendingPaymentNotification.chatTitle}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0 border-t border-cream-100 pt-3 mt-0">
            <Button
              variant="outline"
              onClick={skipPaymentNotification}
              disabled={sendingPaymentNotification}
            >
              Skip
            </Button>
            {isEditingPaymentMessage && (
              <Button
                variant="outline"
                onClick={() => setIsEditingPaymentMessage(false)}
                disabled={sendingPaymentNotification}
              >
                Done Editing
              </Button>
            )}
            <Button variant="brand" onClick={sendPaymentNotification} disabled={sendingPaymentNotification || !paymentNotificationMessage.trim()}>
              {sendingPaymentNotification ? 'Sending...' : 'Send Notification'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pricing Suggestion Dialog */}
      <Dialog
        open={pricingSuggestionDialog?.open || false}
        onOpenChange={(open) => {
          if (!open) setPricingSuggestionDialog(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Use Latest Pricing?</DialogTitle>
            <DialogDescription>
              {pricingSuggestionDialog?.kolName}'s last payment was <strong>${pricingSuggestionDialog?.latestCost?.toLocaleString()}</strong>. Would you like to use this amount?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 border-t border-cream-100 pt-3 mt-0">
            <Button
              variant="outline"
              onClick={() => setPricingSuggestionDialog(null)}
            >
              No, Enter Manually
            </Button>
            <Button
              variant="brand"
              onClick={async () => {
                if (pricingSuggestionDialog) {
                  const { kolId, latestCost, paymentIndex, paymentIds, mode } = pricingSuggestionDialog;

                  if (mode === 'payment-dialog') {
                    // Push the accepted amount back into the Record
                    // Payment dialog's internal form via its imperative
                    // handle. The dialog owns `multiKOLPayments`.
                    recordPaymentDialogRef.current?.applyPricingSuggestion(kolId, paymentIndex, latestCost);
                  } else if (mode === 'content-created' && paymentIds && paymentIds.length > 0) {
                    // Update the payments in the database
                    try {
                      for (const paymentId of paymentIds) {
                        await supabase
                          .from('payments')
                          .update({ amount: latestCost })
                          .eq('id', paymentId);
                      }
                      // Also update the campaign_kol's paid amount
                      const kol = campaignKOLs.find(k => k.id === kolId);
                      if (kol) {
                        const currentPaid = kol.paid || 0;
                        const newPaid = currentPaid + (latestCost * paymentIds.length);
                        await supabase
                          .from('campaign_kols')
                          .update({ paid: newPaid })
                          .eq('id', kolId);
                        setCampaignKOLs(prev => prev.map(k =>
                          k.id === kolId ? { ...k, paid: newPaid } : k
                        ));
                      }
                      fetchPayments();
                      toast({
                        title: 'Success',
                        description: `Updated ${paymentIds.length} payment(s) to $${latestCost.toLocaleString()}`,
                      });
                    } catch (error) {
                      console.error('Error updating payments:', error);
                      toast({
                        title: 'Error',
                        description: 'Failed to update payment amounts',
                        variant: 'destructive'
                      });
                    }
                  }
                  setPricingSuggestionDialog(null);
                }
              }}
            >
              Yes, Use ${pricingSuggestionDialog?.latestCost?.toLocaleString()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Master KOL Edit Dialog — opened by the pencil next to a KOL
          name in the table view. Edits the underlying master_kols row,
          which is the same data shown on /kols. Mirrors the dialog
          layout used elsewhere in the app for consistency. */}
      <Dialog open={!!editingMasterKol} onOpenChange={(open) => { if (!open) { setEditingMasterKol(null); setMasterKolForm({}); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit KOL</DialogTitle>
            <DialogDescription>
              Update the master KOL info — changes apply everywhere this KOL is referenced.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-1 grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="mk-name">Name <RequiredAsterisk /></Label>
                <Input
                  id="mk-name"
                  value={masterKolForm.name || ''}
                  onChange={(e) => setMasterKolForm(f => ({ ...f, name: e.target.value }))}
                  className="focus-brand"
                />
              </div>

              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="mk-link">Profile Link</Label>
                <Input
                  id="mk-link"
                  value={masterKolForm.link || ''}
                  onChange={(e) => setMasterKolForm(f => ({ ...f, link: e.target.value || null }))}
                  placeholder="https://..."
                  className="focus-brand"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mk-followers">Followers</Label>
                <Input
                  id="mk-followers"
                  type="number"
                  value={masterKolForm.followers ?? ''}
                  onChange={(e) => setMasterKolForm(f => ({ ...f, followers: e.target.value ? Number(e.target.value) : null }))}
                  className="focus-brand"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mk-region">Region</Label>
                <Select
                  value={masterKolForm.region || ''}
                  onValueChange={(v) => setMasterKolForm(f => ({ ...f, region: v || null }))}
                >
                  <SelectTrigger id="mk-region" className="focus-brand">
                    <SelectValue placeholder="Select region" />
                  </SelectTrigger>
                  <SelectContent>
                    {(fieldOptions?.regions || []).map((r: string) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mk-pricing">Pricing</Label>
                <Select
                  value={masterKolForm.pricing || ''}
                  onValueChange={(v) => setMasterKolForm(f => ({ ...f, pricing: v || null }))}
                >
                  <SelectTrigger id="mk-pricing" className="focus-brand">
                    <SelectValue placeholder="Select pricing" />
                  </SelectTrigger>
                  <SelectContent>
                    {((fieldOptions as any)?.pricingTiers || []).map((p: string) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tier select removed — column dropped in migration 071.
                  Phase 3 will surface the auto-derived Score badge here. */}

              <div className="space-y-1.5 col-span-2">
                <Label>Platforms</Label>
                <DialogMultiSelect
                  selected={masterKolForm.platform || []}
                  options={fieldOptions?.platforms || []}
                  onChange={(next) => setMasterKolForm(f => ({ ...f, platform: next }))}
                  placeholder="Select platforms..."
                />
              </div>

              <div className="space-y-1.5 col-span-2">
                <Label>Niches</Label>
                <DialogMultiSelect
                  selected={masterKolForm.niche || []}
                  options={fieldOptions?.niches || []}
                  onChange={(next) => setMasterKolForm(f => ({ ...f, niche: next }))}
                  placeholder="Select niches..."
                />
              </div>

              <div className="space-y-1.5 col-span-2">
                <Label>Creator Type</Label>
                <DialogMultiSelect
                  selected={masterKolForm.creator_type || []}
                  options={fieldOptions?.creatorTypes || []}
                  onChange={(next) => setMasterKolForm(f => ({ ...f, creator_type: next }))}
                  placeholder="Select creator types..."
                />
              </div>

              <div className="space-y-1.5 col-span-2">
                <Label>Content Type</Label>
                <DialogMultiSelect
                  selected={masterKolForm.content_type || []}
                  options={fieldOptions?.contentTypes || []}
                  onChange={(next) => setMasterKolForm(f => ({ ...f, content_type: next }))}
                  placeholder="Select content types..."
                />
              </div>

              <div className="space-y-1.5 col-span-2">
                <Label>Deliverables</Label>
                <DialogMultiSelect
                  selected={masterKolForm.deliverables || []}
                  options={fieldOptions?.deliverables || []}
                  onChange={(next) => setMasterKolForm(f => ({ ...f, deliverables: next }))}
                  placeholder="Select deliverables..."
                />
              </div>

              {/* Rating input removed — column dropped in migration 071. */}

              <div className="space-y-1.5">
                <Label htmlFor="mk-in-house">In-House</Label>
                <Input
                  id="mk-in-house"
                  value={masterKolForm.in_house || ''}
                  onChange={(e) => setMasterKolForm(f => ({ ...f, in_house: e.target.value || null }))}
                  className="focus-brand"
                />
              </div>

              <div className="flex items-center gap-3 col-span-2 py-1">
                <Switch
                  checked={!!masterKolForm.community}
                  onCheckedChange={(v) => setMasterKolForm(f => ({ ...f, community: v }))}
                />
                <Label className="cursor-pointer">Community KOL</Label>
              </div>

              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="mk-wallet">Wallet</Label>
                <Input
                  id="mk-wallet"
                  value={masterKolForm.wallet || ''}
                  onChange={(e) => setMasterKolForm(f => ({ ...f, wallet: e.target.value || null }))}
                  className="focus-brand"
                />
              </div>

              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="mk-description">Description</Label>
                <Textarea
                  id="mk-description"
                  value={masterKolForm.description || ''}
                  onChange={(e) => setMasterKolForm(f => ({ ...f, description: e.target.value || null }))}
                  rows={3}
                  className="focus-brand"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => { setEditingMasterKol(null); setMasterKolForm({}); }}>
              Cancel
            </Button>
            <Button variant="brand" onClick={handleSaveMasterKol} disabled={savingMasterKol}>
              {savingMasterKol ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
    </CampaignDetailProvider>
  );
};

export default CampaignDetailsPage;

/* ──────────────────────────────────────────────────────────────────────
 * CampaignDetailViewLayout
 * ──────────────────────────────────────────────────────────────────────
 *
 * v11 view-mode layout for the Campaign Information tab. Mirrors the
 * holohive-ui-revamp.html PROPOSED detail-page treatment: a 3-column
 * grid (main col-span-2 + sidebar col-span-1) with:
 *
 *   Main column:
 *     - Engagement card     (Start / End / Type / Lead + progress bar)
 *     - Resources card      (colored icon tiles, editable)
 *
 *   Sidebar column:
 *     - Quick Stats card    (KOL count / Content / Budget / Days left)
 *     - Renewal action card (brand-tinted, shown when end_date < 60d)
 *     - Recent activity     (placeholder — wires up to events later)
 *
 * Edit mode keeps using the existing form layout (legacy). The two
 * paths share the underlying campaign object; view mode is read-mostly
 * except for Resources (which writes back immediately via
 * handleSaveResources so users don't have to flip into Edit mode just
 * to add a Telegram link).
 */
type ResourceIcon = 'telegram' | 'drive' | 'notion' | 'docs' | 'link';
type CampaignResource = { label: string; url: string; icon?: ResourceIcon };

// Icon tile palette per resource kind — matches the mockup's colored
// 36px squares (Telegram = sky, Drive = amber, Notion = emerald,
// Docs = rose, generic Link = cream).
const RESOURCE_ICON_TILES: Record<ResourceIcon, { bg: string; text: string; border: string }> = {
  telegram: { bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-100' },
  drive:    { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-100' },
  notion:   { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100' },
  docs:     { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-100' },
  link:     { bg: 'bg-cream-100',  text: 'text-ink-warm-700',border: 'border-cream-200' },
};

function CampaignDetailViewLayout({
  campaign,
  setCampaign,
  campaignKOLs,
  payments,
  contents,
  allUsers,
  allocations,
  editingCard,
  setEditingCard,
  onResourcesChange,
}: {
  campaign: CampaignWithDetails;
  setCampaign: (c: CampaignWithDetails) => void;
  campaignKOLs: any[];
  payments: any[];
  contents: any[];
  allUsers: any[];
  allocations: any[];
  editingCard: null | 'engagement' | 'budget' | 'approved';
  setEditingCard: (next: null | 'engagement' | 'budget' | 'approved') => void;
  onResourcesChange: (next: CampaignResource[]) => void;
}) {
  // Derived metrics — single source of truth for the sidebar Quick
  // Stats card and the Engagement card's progress bar.
  const startDate = campaign.start_date ? new Date(campaign.start_date + 'T00:00:00') : null;
  const endDate = campaign.end_date ? new Date(campaign.end_date + 'T00:00:00') : null;
  const totalDays = startDate && endDate ? Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86_400_000)) : 0;
  const elapsedDays = startDate ? Math.max(0, Math.floor((Date.now() - startDate.getTime()) / 86_400_000)) : 0;
  const progressPct = totalDays > 0 ? Math.min(100, Math.round((elapsedDays / totalDays) * 100)) : 0;
  const daysRemaining = endDate ? Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / 86_400_000)) : null;
  const totalWeeks = totalDays > 0 ? Math.max(1, Math.ceil(totalDays / 7)) : 0;
  const currentWeek = totalWeeks > 0 ? Math.min(totalWeeks, Math.max(1, Math.ceil((elapsedDays + 1) / 7))) : 0;

  const totalPaid = (payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
  const postedContentCount = (contents || []).filter((c: any) => c.status === 'posted' || c.status === 'published').length;
  const totalContentCount = (contents || []).length;

  const manager = allUsers.find((u) => u.id === campaign.manager);

  // Resources — pulled from campaign.resources (added 2026-06-XX as
  // a jsonb column). Defaults to empty so the page works even before
  // the Resources card has been populated.
  const resources: CampaignResource[] = ((campaign as any).resources || []) as CampaignResource[];

  // Renewal trigger — show the brand-tinted action card when the
  // engagement ends within 60 days AND the campaign is still active.
  const showRenewalCard = daysRemaining != null && daysRemaining <= 60 && daysRemaining > 0 && campaign.status === 'Active';

  // KV cell helper — keeps the mockup's 10px uppercase tracked-out
  // label + 14px font-medium value rhythm consistent across the
  // Engagement card.
  const KV = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-1.5">{label}</div>
      <div className="text-ink-warm-900 font-medium text-sm">{children}</div>
    </div>
  );

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    try {
      return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return iso;
    }
  };

  const formatCurrency = (n: number) => {
    if (!Number.isFinite(n)) return '$0';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
    return `$${n.toLocaleString()}`;
  };

  return (
    <div className="pt-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* ── Main column ──────────────────────────────────────────── */}
      <div className="lg:col-span-2 space-y-5">

        {/* Engagement card — consolidates Start / End / Type / Lead
            with a progress bar at the bottom showing Week X of Y.
            Per-card inline Edit affordance on the header. */}
        <div className="bg-white rounded-[14px] border border-cream-200 shadow-card p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Engagement</h3>
            {editingCard !== 'engagement' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingCard('engagement')}
                className="h-7 px-2 text-xs font-medium text-brand-deep hover:text-brand hover:bg-cream-50"
              >
                <Edit className="w-3 h-3 mr-1" />
                Edit
              </Button>
            )}
          </div>
          {editingCard === 'engagement' ? (
            <EngagementEditForm
              campaign={campaign}
              setCampaign={setCampaign}
              allUsers={allUsers}
              onDone={() => setEditingCard(null)}
            />
          ) : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              <KV label="Start date"><span className="mono tabular-nums">{formatDate(campaign.start_date)}</span></KV>
              <KV label="End date"><span className="mono tabular-nums">{formatDate(campaign.end_date)}</span></KV>
              <KV label="Region">
                {(() => {
                  // Mirrors the inline `displayRegion` helper used in
                  // edit mode — APAC/EMEA/MENA stay all-caps, Global
                  // title-case, others title-case.
                  const region = (campaign as any).region as string | null;
                  if (!region) return <span className="text-ink-warm-400 italic">Unset</span>;
                  const lower = region.toLowerCase();
                  if (lower === 'apac') return 'APAC';
                  if (lower === 'emea') return 'EMEA';
                  if (lower === 'mena') return 'MENA';
                  if (lower === 'global') return 'Global';
                  return region.charAt(0).toUpperCase() + region.slice(1).toLowerCase();
                })()}
              </KV>
              <KV label="Account lead">
                {manager ? (
                  <div className="flex items-center gap-2">
                    {/* Profile photo when available, falls back to a
                        brand-tinted initial tile (same chrome as /team
                        and /dashboard NameWithAvatar pattern). */}
                    {manager.profile_photo_url ? (
                      <div className="w-6 h-6 rounded-full overflow-hidden border border-cream-200 shrink-0 bg-white">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={manager.profile_photo_url}
                          alt={manager.name || manager.email || 'Account lead'}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center text-[10px] font-semibold shrink-0">
                        {(manager.name || manager.email || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="truncate">{manager.name || manager.email}</span>
                  </div>
                ) : (
                  <span className="text-ink-warm-400 italic">Unassigned</span>
                )}
              </KV>
            </div>
          )}
          {/* Progress bar + description — only in view mode (edit
              form handles dates + description with inputs). */}
          {editingCard !== 'engagement' && startDate && endDate && (
            <div className="mt-6 pt-5 border-t border-cream-200">
              <div className="flex items-baseline justify-between mb-2.5">
                <span className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em]">Campaign progress</span>
                <span className="text-xs text-ink-warm-900 mono tabular-nums font-medium">
                  Week <span className="font-semibold">{currentWeek}</span> of {totalWeeks}
                </span>
              </div>
              <div className="h-[3px] bg-cream-200 rounded-full overflow-hidden">
                <div className="h-full bg-brand rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-[10px] text-ink-warm-400 mono uppercase tracking-[0.1em]">{formatDate(campaign.start_date)}</span>
                <span className="text-[10px] text-ink-warm-400 mono uppercase tracking-[0.1em]">{formatDate(campaign.end_date)}</span>
              </div>
            </div>
          )}
          {editingCard !== 'engagement' && campaign.description && (
            <div className="mt-6 pt-5 border-t border-cream-200">
              <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">Description</div>
              <p className="text-sm text-ink-warm-700 leading-relaxed whitespace-pre-line">{campaign.description}</p>
            </div>
          )}
        </div>

        {/* Resources card — colored icon tile per resource, editable
            in place. Mockup pattern: 2-column grid of link rows with
            36px icon tile + label + truncated URL underneath. */}
        <ResourcesCard resources={resources} onChange={onResourcesChange} />

        {/* Budget + Approved Access — paired side-by-side in a 2-col
            sub-grid so the dense Approved Access chip list sits
            alongside the Budget summary instead of stacking below
            (mockup pattern: secondary cards side-by-side under the
            primary cards). Both cards still stack vertically on
            screens narrower than md. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Budget card — total + per-region allocations + progress
            bar showing how much has been paid out. Per-card Edit
            affordance links into the Budget tab where the full
            editor lives (we don't duplicate the allocation editor
            inline — it's complex and lives elsewhere). */}
        <div className="bg-white rounded-[14px] border border-cream-200 shadow-card p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Budget</h3>
            <div className="flex items-center gap-2">
              <span className="text-[11px] mono uppercase tracking-[0.14em] text-ink-warm-500">
                {campaign.total_budget > 0
                  ? `${Math.round((totalPaid / campaign.total_budget) * 100)}% paid`
                  : 'Not set'}
              </span>
              {editingCard === 'budget' ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingCard('budget')}
                  className="h-7 px-2 text-xs font-medium text-brand-deep hover:text-brand hover:bg-cream-50"
                >
                  <Edit className="w-3 h-3 mr-1" />
                  Edit
                </Button>
              )}
            </div>
          </div>
          {editingCard === 'budget' ? (
            <BudgetEditForm
              campaign={campaign}
              setCampaign={setCampaign}
              onDone={() => setEditingCard(null)}
            />
          ) : (
            <div className="grid grid-cols-3 gap-x-6 gap-y-5">
              <KV label="Total"><span className="mono tabular-nums">{formatCurrency(campaign.total_budget || 0)}</span></KV>
              <KV label="Paid"><span className="mono tabular-nums text-emerald-700">{formatCurrency(totalPaid)}</span></KV>
              <KV label="Remaining"><span className="mono tabular-nums">{formatCurrency(Math.max(0, (campaign.total_budget || 0) - totalPaid))}</span></KV>
            </div>
          )}
          {/* Paid progress bar — emerald to read as "good news" */}
          {campaign.total_budget > 0 && (
            <div className="mt-5 pt-5 border-t border-cream-200">
              <div className="h-[3px] bg-cream-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (totalPaid / campaign.total_budget) * 100)}%` }}
                />
              </div>
            </div>
          )}
          {/* Budget types + per-region allocations. Budget types
              are campaign-level (Token / Fiat / WL chips); region
              allocations are per-row with currency-formatted amounts.
              Tone palette by budget type:
                Token → brand-soft (default)
                Fiat → emerald (real money)
                WL → purple (whitelist allocation) */}
          {(((campaign as any).budget_type && (campaign as any).budget_type.length > 0) || (allocations && allocations.length > 0)) && (
            <div className="mt-5 pt-5 border-t border-cream-200 space-y-4">
              {(campaign as any).budget_type && (campaign as any).budget_type.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">Budget types</div>
                  <div className="flex flex-wrap gap-1.5">
                    {((campaign as any).budget_type as string[]).map((bt) => {
                      const lower = bt.toLowerCase();
                      const cls = lower === 'fiat'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                        : lower === 'wl' || lower === 'whitelist'
                          ? 'bg-purple-50 text-purple-700 border-purple-100'
                          : 'bg-brand-soft text-brand-deep border-brand-light';
                      return (
                        <span
                          key={bt}
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs border ${cls}`}
                        >
                          {bt}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              {allocations && allocations.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-3">By region</div>
                  <div className="space-y-2">
                    {allocations.map((alloc, idx) => {
                      // Same region-formatting rules as the Region
                      // cell above: APAC/EMEA/MENA all-caps, Global
                      // title-case, others title-case.
                      const r = (alloc.region || 'Unknown') as string;
                      const lower = r.toLowerCase();
                      const display = lower === 'apac' ? 'APAC'
                        : lower === 'emea' ? 'EMEA'
                        : lower === 'mena' ? 'MENA'
                        : lower === 'global' ? 'Global'
                        : r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
                      const amt = parseFloat(alloc.allocated_budget || '0') || 0;
                      const pct = (campaign.total_budget || 0) > 0
                        ? Math.round((amt / campaign.total_budget) * 100)
                        : null;
                      return (
                        <div key={idx} className="text-sm">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <Globe className="h-3.5 w-3.5 text-ink-warm-400 shrink-0" />
                              <span className="text-ink-warm-700 font-medium">{display}</span>
                              {pct != null && (
                                <span className="text-[10px] text-ink-warm-400 mono tabular-nums">{pct}%</span>
                              )}
                            </div>
                            <span className="mono tabular-nums text-ink-warm-900 font-medium">
                              {formatCurrency(amt)}
                            </span>
                          </div>
                          {/* Per-region progress bar — same brand
                              hue as the campaign progress bar above. */}
                          {pct != null && (
                            <div className="h-[2px] bg-cream-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-brand rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Approved Access card — emails + domains allowed to access
            the public campaign view (in addition to the client email
            and same-domain users). Inline Add affordances for both
            email and domain entries; per-chip Remove on hover. */}
        <ApprovedAccessCard
          campaign={campaign}
          setCampaign={setCampaign}
          isEditing={editingCard === 'approved'}
          onStartEdit={() => setEditingCard('approved')}
          onDone={() => setEditingCard(null)}
        />
        </div>
      </div>

      {/* ── Sidebar column ───────────────────────────────────────── */}
      <div className="space-y-5">

        {/* Quick stats — matches mockup's Live dot + KV list pattern */}
        <div className="bg-white rounded-[14px] border border-cream-200 shadow-card p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Quick stats</h3>
            <span className="flex items-center gap-1 text-[10px] text-emerald-700 font-semibold uppercase tracking-[0.2em]">
              <span className="dot-pulse bg-emerald-500" aria-hidden />
              Live
            </span>
          </div>
          <div className="space-y-3.5">
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-ink-warm-500">KOLs</span>
              <span className="text-lg text-ink-warm-900 mono tabular-nums font-medium" style={{ letterSpacing: '-0.025em' }}>
                {campaignKOLs.length}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-ink-warm-500">Content {totalContentCount > 0 && <span className="text-[10px] text-ink-warm-400 mono">live</span>}</span>
              <span className="text-lg text-ink-warm-900 mono tabular-nums font-medium" style={{ letterSpacing: '-0.025em' }}>
                {postedContentCount}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-ink-warm-500">Paid</span>
              <span className="text-lg text-ink-warm-900 mono tabular-nums font-medium" style={{ letterSpacing: '-0.025em' }}>
                {formatCurrency(totalPaid)}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-ink-warm-500">Total budget</span>
              <span className="text-lg text-ink-warm-900 mono tabular-nums font-medium" style={{ letterSpacing: '-0.025em' }}>
                {formatCurrency(campaign.total_budget || 0)}
              </span>
            </div>
            {daysRemaining != null && (
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-ink-warm-500">Days left</span>
                <span className={`flex items-center gap-1.5`}>
                  {daysRemaining <= 14 && <span className="dot bg-rose-500" aria-hidden />}
                  <span className={`text-lg mono tabular-nums font-medium ${daysRemaining <= 14 ? 'text-rose-700' : 'text-ink-warm-900'}`} style={{ letterSpacing: '-0.025em' }}>
                    {daysRemaining}
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Renewal action card — brand-tinted, shown when end < 60d */}
        {showRenewalCard && (
          <div className="crd-feature p-6">
            <div className="flex items-center gap-1.5 mb-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-brand-deep">
              <span className="dot bg-brand" aria-hidden />
              <span>Action needed</span>
            </div>
            <h3 className="display-serif text-[20px] leading-[1.1] text-ink-warm-900">
              Renewal in{' '}
              <span className="display-serif-italic text-brand">{daysRemaining} days.</span>
            </h3>
            <p className="text-[13px] leading-relaxed mt-3 mb-5 text-ink-warm-700">
              Engagement ends <span className="font-medium mono text-ink-warm-900">{formatDate(campaign.end_date)}</span>.
              Worth opening the renewal conversation now while momentum is high.
            </p>
            <Button variant="brand" size="sm" className="w-full">
              Schedule check-in
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        )}

        {/* Recent activity — placeholder for now; will wire to a
            campaign_events query in a follow-up. */}
        <div className="bg-white rounded-[14px] border border-cream-200 shadow-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Recent activity</h3>
            <span className="text-[10px] text-ink-warm-400 mono uppercase tracking-[0.2em]">Coming soon</span>
          </div>
          <p className="text-sm text-ink-warm-500 italic">
            Campaign event feed (KOL adds, content posts, payments) will surface here.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── ResourcesCard ────────────────────────────────────────────────────
   In-place editable list of campaign resources. Matches the mockup's
   2-column grid with colored icon tile + label + truncated URL. Add
   button opens a small inline form; each row gets hover-action icons
   for edit + delete. Changes persist immediately via onChange. */
function ResourcesCard({
  resources,
  onChange,
}: {
  resources: CampaignResource[];
  onChange: (next: CampaignResource[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  const [draftIcon, setDraftIcon] = useState<ResourceIcon>('link');

  const reset = () => {
    setAdding(false);
    setDraftLabel('');
    setDraftUrl('');
    setDraftIcon('link');
  };

  const handleAdd = () => {
    if (!draftLabel.trim() || !draftUrl.trim()) return;
    onChange([...resources, { label: draftLabel.trim(), url: draftUrl.trim(), icon: draftIcon }]);
    reset();
  };

  const handleRemove = (idx: number) => {
    onChange(resources.filter((_, i) => i !== idx));
  };

  // Strip protocol for compact display under the label.
  const displayUrl = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

  return (
    <div className="bg-white rounded-[14px] border border-cream-200 shadow-card p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-baseline gap-2.5">
          <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Resources</h3>
          <span className="text-[11px] text-ink-warm-400 mono tabular-nums">{resources.length}</span>
        </div>
        {!adding && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs font-medium text-brand-deep hover:text-brand hover:bg-cream-50"
            onClick={() => setAdding(true)}
          >
            <Plus className="w-3 h-3 mr-1" />
            Add
          </Button>
        )}
      </div>

      {adding && (
        <div className="mb-4 rounded-md border border-cream-200 bg-cream-50 p-3 space-y-2">
          <div className="grid grid-cols-[100px_1fr] gap-2">
            <Select value={draftIcon} onValueChange={(v) => setDraftIcon(v as ResourceIcon)}>
              <SelectTrigger className="h-9 text-sm focus-brand bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="telegram">Telegram</SelectItem>
                <SelectItem value="drive">Drive</SelectItem>
                <SelectItem value="notion">Notion</SelectItem>
                <SelectItem value="docs">Docs</SelectItem>
                <SelectItem value="link">Link</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Label (e.g. Telegram Group)"
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              className="h-9 text-sm focus-brand bg-white"
              autoFocus
            />
          </div>
          <Input
            placeholder="URL (https://...)"
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
            className="h-9 text-sm focus-brand bg-white"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={reset}>Cancel</Button>
            <Button variant="brand" size="sm" onClick={handleAdd} disabled={!draftLabel.trim() || !draftUrl.trim()}>
              Add resource
            </Button>
          </div>
        </div>
      )}

      {resources.length === 0 && !adding ? (
        <p className="text-sm text-ink-warm-500 italic">
          No resources yet. Pin commonly-referenced links (Telegram group, brand assets, GTM plan, etc.).
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
          {resources.map((r, idx) => {
            const tile = RESOURCE_ICON_TILES[r.icon || 'link'];
            return (
              <div key={idx} className="group flex items-center justify-between p-3 -mx-1.5 rounded-lg hover:bg-cream-50 transition">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 min-w-0 flex-1"
                >
                  <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 border ${tile.bg} ${tile.text} ${tile.border}`}>
                    {r.icon === 'telegram' && (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                    )}
                    {r.icon === 'drive' && (
                      <ImageIcon className="w-4 h-4" />
                    )}
                    {r.icon === 'notion' && (
                      <FileText className="w-4 h-4" />
                    )}
                    {r.icon === 'docs' && (
                      <File className="w-4 h-4" />
                    )}
                    {(!r.icon || r.icon === 'link') && (
                      <ExternalLink className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink-warm-900 truncate">{r.label}</div>
                    <div className="text-[11px] text-ink-warm-400 mono truncate">{displayUrl(r.url)}</div>
                  </div>
                </a>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0 ml-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 rounded-md text-ink-warm-500 hover:text-rose-600 hover:bg-rose-50"
                    onClick={() => handleRemove(idx)}
                    title="Remove resource"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                  <ExternalLink className="w-4 h-4 text-ink-warm-300 group-hover:text-brand transition shrink-0" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── ApprovedAccessCard ───────────────────────────────────────────────
   Read-only view of campaigns.approved_emails + approved_domains.
   Edit happens in the form body (edit mode) — this card is just a
   surface to confirm "who has access" at a glance from the view-mode
   layout. Mockup pattern: KV-style display with chip rows. */
function ApprovedAccessCard({
  campaign,
  setCampaign,
  isEditing,
  onStartEdit,
  onDone,
}: {
  campaign: CampaignWithDetails;
  setCampaign: (c: CampaignWithDetails) => void;
  isEditing: boolean;
  onStartEdit: () => void;
  onDone: () => void;
}) {
  const emails: string[] = ((campaign as any).approved_emails || []) as string[];
  const domains: string[] = ((campaign as any).approved_domains || []) as string[];
  const hasAny = emails.length > 0 || domains.length > 0;

  const [draftEmail, setDraftEmail] = useState('');
  const [draftDomain, setDraftDomain] = useState('');

  const persist = async (nextEmails: string[], nextDomains: string[]) => {
    const previous = { emails, domains };
    setCampaign({ ...campaign, approved_emails: nextEmails, approved_domains: nextDomains } as any);
    try {
      const { error } = await (supabase as any)
        .from('campaigns')
        .update({
          approved_emails: nextEmails.length > 0 ? nextEmails : null,
          approved_domains: nextDomains.length > 0 ? nextDomains : null,
        })
        .eq('id', campaign.id);
      if (error) throw error;
    } catch (err: any) {
      setCampaign({ ...campaign, approved_emails: previous.emails, approved_domains: previous.domains } as any);
      console.error('Failed to update approved access:', err);
    }
  };

  const addEmail = async () => {
    const e = draftEmail.trim().toLowerCase();
    if (!e || !e.includes('@') || emails.includes(e)) return;
    setDraftEmail('');
    await persist([...emails, e], domains);
  };
  const addDomain = async () => {
    const d = draftDomain.trim().toLowerCase().replace(/^@/, '');
    if (!d || domains.includes(d)) return;
    setDraftDomain('');
    await persist(emails, [...domains, d]);
  };
  const removeEmail = async (email: string) => {
    await persist(emails.filter((e) => e !== email), domains);
  };
  const removeDomain = async (domain: string) => {
    await persist(emails, domains.filter((d) => d !== domain));
  };

  return (
    <div className="bg-white rounded-[14px] border border-cream-200 shadow-card p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-baseline gap-2.5">
          <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Approved Access</h3>
          {hasAny && (
            <span className="text-[11px] text-ink-warm-400 mono tabular-nums">
              {emails.length + domains.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] mono uppercase tracking-[0.14em] text-ink-warm-500 hidden sm:inline">
            Public portal allowlist
          </span>
          {isEditing ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDone}
              className="h-7 px-2 text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
            >
              Done
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={onStartEdit}
              className="h-7 px-2 text-xs font-medium text-brand-deep hover:text-brand hover:bg-cream-50"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add
            </Button>
          )}
        </div>
      </div>
      {isEditing && (
        <div className="mb-4 rounded-md border border-cream-200 bg-cream-50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              placeholder="email@example.com"
              value={draftEmail}
              onChange={(e) => setDraftEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addEmail(); }}
              className="h-9 text-sm focus-brand bg-white"
            />
            <Button variant="outline" size="sm" className="h-9 text-xs shrink-0" onClick={addEmail} disabled={!draftEmail.trim()}>
              Add email
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="@example.com"
              value={draftDomain}
              onChange={(e) => setDraftDomain(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addDomain(); }}
              className="h-9 text-sm focus-brand bg-white"
            />
            <Button variant="outline" size="sm" className="h-9 text-xs shrink-0" onClick={addDomain} disabled={!draftDomain.trim()}>
              Add domain
            </Button>
          </div>
        </div>
      )}
      {!hasAny && !isEditing ? (
        <p className="text-sm text-ink-warm-500 italic">
          No additional emails or domains approved. Only the client email
          and same-domain addresses can access the public campaign view.
        </p>
      ) : (
        <div className="space-y-4">
          {emails.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5">
                <Eye className="h-3 w-3" />
                Emails <span className="text-ink-warm-400 mono tabular-nums">{emails.length}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {emails.map((email) => (
                  <span
                    key={email}
                    className="group inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-brand-soft text-brand-deep border border-brand-light mono"
                  >
                    {email}
                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => removeEmail(email)}
                        className="ml-1.5 text-brand-deep hover:text-rose-600"
                        title="Remove"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
          {domains.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5">
                <Globe className="h-3 w-3" />
                Domains <span className="text-ink-warm-400 mono tabular-nums">{domains.length}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {domains.map((domain) => (
                  <span
                    key={domain}
                    className="group inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-sky-50 text-sky-700 border border-sky-100 mono"
                  >
                    @{domain}
                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => removeDomain(domain)}
                        className="ml-1.5 text-sky-700 hover:text-rose-600"
                        title="Remove"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── EngagementEditForm ───────────────────────────────────────────────
   Inline form for editing the Engagement card's fields directly from
   the view-mode layout. Persists immediately on Save; no full-form
   round-trip required. */
function EngagementEditForm({
  campaign,
  setCampaign,
  allUsers,
  onDone,
}: {
  campaign: CampaignWithDetails;
  setCampaign: (c: CampaignWithDetails) => void;
  allUsers: any[];
  onDone: () => void;
}) {
  const [startDate, setStartDate] = useState<string>(campaign.start_date || '');
  const [endDate, setEndDate] = useState<string>(campaign.end_date || '');
  const [region, setRegion] = useState<string>((campaign as any).region || '');
  const [manager, setManager] = useState<string>(campaign.manager || '');
  const [description, setDescription] = useState<string>(campaign.description || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const previous = {
      start_date: campaign.start_date,
      end_date: campaign.end_date,
      region: (campaign as any).region,
      manager: campaign.manager,
      description: campaign.description,
    };
    const patch: any = {
      start_date: startDate || null,
      end_date: endDate || null,
      region: region || null,
      manager: manager || null,
      description: description || null,
    };
    // Optimistic
    setCampaign({ ...campaign, ...patch } as any);
    try {
      const { error } = await (supabase as any).from('campaigns').update(patch).eq('id', campaign.id);
      if (error) throw error;
      onDone();
    } catch (err: any) {
      setCampaign({ ...campaign, ...previous } as any);
      console.error('Failed to save engagement:', err);
    } finally {
      setSaving(false);
    }
  };

  // Local date helpers — mirror the page-level parseDate +
  // formatDateForInput so we don't have to thread them through props.
  // YYYY-MM-DD storage format; midday parse so a UTC-vs-local
  // off-by-one doesn't shift the displayed day.
  const parseDateLocal = (s: string): Date | undefined => {
    if (!s) return undefined;
    const d = new Date(s + 'T12:00:00');
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  const formatDateForStorage = (d: Date | undefined): string => {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const displayDate = (s: string) => {
    if (!s) return '';
    try {
      return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return s;
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        {/* Start date — Popover + Calendar (v11 DateField pattern,
            shared with the legacy edit-mode form so the user sees
            the same chrome regardless of how they enter edit mode). */}
        <div>
          <Label className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-1.5 block">Start date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="h-9 w-full justify-start text-left font-normal focus-brand text-sm"
                style={{ color: startDate ? '#111827' : '#9ca3af' }}
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {startDate ? displayDate(startDate) : 'Select start date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-50" align="start">
              <CalendarComponent
                mode="single"
                selected={parseDateLocal(startDate)}
                onSelect={(date) => setStartDate(formatDateForStorage(date))}
                initialFocus
                classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <Label className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-1.5 block">End date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="h-9 w-full justify-start text-left font-normal focus-brand text-sm"
                style={{ color: endDate ? '#111827' : '#9ca3af' }}
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {endDate ? displayDate(endDate) : 'Select end date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-50" align="start">
              <CalendarComponent
                mode="single"
                selected={parseDateLocal(endDate)}
                onSelect={(date) => setEndDate(formatDateForStorage(date))}
                initialFocus
                classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <Label className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-1.5 block">Region</Label>
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger className="h-9 text-sm focus-brand">
              <SelectValue placeholder="Select region…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="apac">APAC</SelectItem>
              <SelectItem value="emea">EMEA</SelectItem>
              <SelectItem value="mena">MENA</SelectItem>
              <SelectItem value="global">Global</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-1.5 block">Account lead</Label>
          <Select value={manager} onValueChange={setManager}>
            <SelectTrigger className="h-9 text-sm focus-brand">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {allUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="engagement-desc" className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-1.5 block">Description</Label>
        <Textarea
          id="engagement-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="focus-brand min-h-[80px] text-sm"
          placeholder="Campaign description…"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-cream-200">
        <Button variant="ghost" size="sm" onClick={onDone} disabled={saving}>Cancel</Button>
        <Button variant="brand" size="sm" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

/* ── BudgetEditForm ───────────────────────────────────────────────────
   Inline form for editing the campaign's total budget directly from
   the view-mode layout. Region allocations stay in the Budget tab —
   that editor is too complex to inline here. */
function BudgetEditForm({
  campaign,
  setCampaign,
  onDone,
}: {
  campaign: CampaignWithDetails;
  setCampaign: (c: CampaignWithDetails) => void;
  onDone: () => void;
}) {
  const [total, setTotal] = useState<string>(String(campaign.total_budget || 0));
  // Budget types — multi-select of Token / Fiat / WL. Stored as a
  // string[] in campaigns.budget_type; rendered in the view as the
  // chip row beside the per-region allocation list.
  const [budgetTypes, setBudgetTypes] = useState<string[]>(((campaign as any).budget_type as string[]) || []);
  const [saving, setSaving] = useState(false);

  const toggleBudgetType = (t: string) => {
    setBudgetTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  };

  const save = async () => {
    const parsed = parseFloat(total);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setSaving(true);
    const previous = {
      total_budget: campaign.total_budget,
      budget_type: (campaign as any).budget_type,
    };
    const next = {
      total_budget: parsed,
      budget_type: budgetTypes.length > 0 ? budgetTypes : null,
    };
    setCampaign({ ...campaign, ...next } as any);
    try {
      const { error } = await (supabase as any)
        .from('campaigns')
        .update(next)
        .eq('id', campaign.id);
      if (error) throw error;
      onDone();
    } catch (err: any) {
      setCampaign({ ...campaign, ...previous } as any);
      console.error('Failed to save budget:', err);
    } finally {
      setSaving(false);
    }
  };

  // Tone palette mirrors the view-mode chip row so the user sees
  // the same color encoding while picking ↔ as displayed.
  const TYPE_CLS: Record<string, string> = {
    Token: 'bg-brand-soft text-brand-deep border-brand-light',
    Fiat: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    WL: 'bg-purple-50 text-purple-700 border-purple-100',
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="budget-total" className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-1.5 block">Total budget (USD)</Label>
        <Input
          id="budget-total"
          type="number"
          min={0}
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          className="h-9 text-sm focus-brand"
        />
      </div>
      <div>
        <Label className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2 block">Budget types</Label>
        <div className="flex flex-wrap gap-1.5">
          {(['Token', 'Fiat', 'WL'] as const).map((t) => {
            const active = budgetTypes.includes(t);
            const activeCls = TYPE_CLS[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleBudgetType(t)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border transition-colors ${
                  active
                    ? activeCls
                    : 'bg-white text-ink-warm-500 border-cream-200 hover:bg-cream-50 hover:text-ink-warm-700'
                }`}
              >
                {active && <CheckCircle className="h-3 w-3" />}
                {t}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-ink-warm-500 mt-1.5">Toggle the types this campaign uses. WL = whitelist allocation.</p>
      </div>
      <p className="text-xs text-ink-warm-500">
        Per-region allocations stay in the <strong>Budget</strong> tab — that editor includes regions, budget types, and per-allocation breakdowns.
      </p>
      <div className="flex justify-end gap-2 pt-2 border-t border-cream-200">
        <Button variant="ghost" size="sm" onClick={onDone} disabled={saving}>Cancel</Button>
        <Button variant="brand" size="sm" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
