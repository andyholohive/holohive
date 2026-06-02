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
import { ContentDashboardTableView } from "@/components/campaign/ContentDashboardTableView";
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
      toast({ title: "Error", description: "Failed to fetch report files.", variant: "destructive" });
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
  // `showDeleteDialog` removed 2026-06-02 — the single-content
  // delete dialog was unreachable after the row delete refactor.

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
                              {form?.intro_call_date ? formatDate(form?.intro_call_date) : "Select intro call date"}
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
                        <div className="text-base font-semibold text-ink-warm-900">{campaign?.intro_call_date ? formatDate(campaign?.intro_call_date) : '-'}</div>
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
              </div>
              <CardContent className="pt-0 px-0">
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

