"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, Plus, Megaphone, Building2, DollarSign, Calendar as CalendarIcon, Trash2, Share2, Copy, ExternalLink, Archive, AlertTriangle, LayoutGrid, List, ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { ClientService, ClientWithAccess } from "@/lib/clientService";
import { CampaignService, CampaignWithDetails } from "@/lib/campaignService";
import { CampaignTemplateService, CampaignTemplateWithDetails } from "@/lib/campaignTemplateService";
import { useSearchParams, useRouter } from 'next/navigation';
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { CampaignKOLService } from "@/lib/campaignKolService";

// [Campaign Live v1] Preset phases for the inline Phase dropdown on the
// campaigns list. Mirrors the const in app/campaigns/[id]/page.tsx — kept
// duplicated for now to avoid a third file just for one tiny constant.
// If you change one, change both.
const CURRENT_PHASE_OPTIONS = [
  'Setup',
  'Seeding Phase',
  'Amplification Phase',
  'Activation Phase',
  'Reporting Phase',
] as const;
import { UserService } from '@/lib/userService';

export default function CampaignsPage() {
  const { user, userProfile } = useAuth();
  const searchParams = useSearchParams();
  const clientIdParam = searchParams.get('clientId');
  const addParam = searchParams.get('add');
  const [campaigns, setCampaigns] = useState<CampaignWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("Active");
  const [viewMode, setViewMode] = useState<"card" | "table">("card");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;
  const [isNewCampaignOpen, setIsNewCampaignOpen] = useState(false);
  const [isSubmittingCampaign, setIsSubmittingCampaign] = useState(false);
  const [isShareCampaignOpen, setIsShareCampaignOpen] = useState(false);
  const [sharingCampaign, setSharingCampaign] = useState<CampaignWithDetails | null>(null);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [archivingCampaign, setArchivingCampaign] = useState<CampaignWithDetails | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [availableClients, setAvailableClients] = useState<ClientWithAccess[]>([]);
  const [availableTemplates, setAvailableTemplates] = useState<CampaignTemplateWithDetails[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("none");
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [availableLists, setAvailableLists] = useState<{ id: string; name: string }[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [listKOLs, setListKOLs] = useState<{ master_kol_id: string; name: string; followers: number | null; region: string | null; platform: string[] | null }[]>([]);
  const [selectedKolIds, setSelectedKolIds] = useState<Set<string>>(new Set());
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [contentCounts, setContentCounts] = useState<{ [campaignId: string]: { total: number; posted: number } }>({});
  const [paidContentCounts, setPaidContentCounts] = useState<{ [campaignId: string]: number }>({});
  // In newCampaign state, add region, clientChoosingKols, multiActivation, intro_call, intro_call_date, budgetAllocations
  const [newCampaign, setNewCampaign] = useState({
    client_id: "",
    name: "",
    total_budget: "",
    status: "Planning" as "Planning" | "Active" | "Paused" | "Completed",
    start_date: "",
    end_date: "",
    description: "",
    region: "apac",
    clientChoosingKols: false,
    multiActivation: false,
    intro_call: false,
    intro_call_date: undefined as string | undefined,
    budgetAllocations: [] as { region: string; amount: string }[],
    manager: "",
  });

  const router = useRouter();

  useEffect(() => {
    fetchCampaigns();
  }, [user?.id, userProfile?.role]);

  useEffect(() => {
    if (isNewCampaignOpen && user?.id && userProfile?.role) {
      fetchAvailableClients();
      fetchAvailableTemplates();
      fetchAvailableLists();
      UserService.getAllUsers().then(setAllUsers);
      // Set default manager to current user every time dialog opens
      setNewCampaign(prev => ({ ...prev, manager: user.id }));
    } else if (!isNewCampaignOpen) {
      // Reset manager when dialog closes
      setNewCampaign(prev => ({ ...prev, manager: user?.id || "" }));
    }
  }, [isNewCampaignOpen, user?.id, userProfile?.role]);

  // Open dialog if add=1 is present
  useEffect(() => {
    if (addParam === '1' && userProfile) {
      setIsNewCampaignOpen(true);
      if (clientIdParam) {
        setNewCampaign((prev) => ({ ...prev, client_id: clientIdParam }));
      }
    }
  }, [addParam, clientIdParam, userProfile]);

  const fetchAvailableClients = async () => {
    try {
      const clients = await ClientService.getClientsForUser(userProfile!.role as 'admin' | 'member' | 'client', user!.id);
      setAvailableClients(clients);
    } catch (err) {
      console.error("Error fetching clients:", err);
    }
  };

  const fetchAvailableTemplates = async () => {
    try {
      setIsLoadingTemplates(true);
      const templates = await CampaignTemplateService.getTemplatesForUser(
        userProfile!.role as 'admin' | 'member' | 'client',
        user!.id
      );
      setAvailableTemplates(templates);
    } catch (err) {
      console.error("Error fetching templates:", err);
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  const fetchAvailableLists = async () => {
    try {
      const { data, error } = await supabase
        .from('lists')
        .select('id, name')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAvailableLists((data || []) as { id: string; name: string }[]);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error fetching lists:', err);
    }
  };

  const fetchListKOLs = async (listId: string) => {
    setListKOLs([]);
    setSelectedKolIds(new Set());
    if (!listId) return;
    try {
      const { data, error } = await supabase
        .from('list_kols')
        .select('master_kol:master_kols(id, name, followers, region, platform)')
        .eq('list_id', listId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const mapped = (data || []).map((row: any) => ({
        master_kol_id: row.master_kol.id as string,
        name: row.master_kol.name as string,
        followers: row.master_kol.followers as number | null,
        region: row.master_kol.region as string | null,
        platform: row.master_kol.platform as string[] | null,
      }));
      setListKOLs(mapped);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error fetching list KOLs:', err);
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaign.client_id || !newCampaign.name.trim() || !newCampaign.total_budget || !newCampaign.start_date) return;
    try {
      setIsSubmittingCampaign(true);

      // Get team member emails for approved_emails
      const teamEmails = allUsers
        .map(u => u.email)
        .filter((email): email is string => !!email && email.trim() !== '');

      const campaign = await CampaignService.createCampaign({
        client_id: newCampaign.client_id,
        name: newCampaign.name.trim(),
        total_budget: parseFloat(newCampaign.total_budget),
        status: newCampaign.status,
        start_date: newCampaign.start_date,
        end_date: newCampaign.end_date || undefined,
        description: newCampaign.description.trim() || undefined,
        region: newCampaign.region,
        client_choosing_kols: newCampaign.clientChoosingKols,
        multi_activation: newCampaign.multiActivation,
        intro_call: newCampaign.intro_call,
        intro_call_date: newCampaign.intro_call_date || null,
        manager: newCampaign.manager || null,
        approved_emails: teamEmails.length > 0 ? teamEmails : undefined,
      });
      setNewCampaign({
        client_id: "",
        name: "",
        total_budget: "",
        status: "Planning" as "Planning" | "Active" | "Paused" | "Completed",
        start_date: "",
        end_date: "",
        description: "",
        region: "apac",
        clientChoosingKols: false,
        multiActivation: false,
        intro_call: false,
        intro_call_date: undefined,
        budgetAllocations: [],
        manager: user?.id || "",
      });
      setIsNewCampaignOpen(false);
      await fetchCampaigns();
      // After creating the campaign, add budget allocations
      await Promise.all(
        (newCampaign.budgetAllocations || [])
          .filter(a => a.region && a.amount)
          .map((alloc) =>
            CampaignService.addBudgetAllocation(campaign.id, alloc.region, parseFloat(alloc.amount))
          )
      );
      if (selectedKolIds.size > 0) {
        const ids = Array.from(selectedKolIds);
        // Add KOLs to the campaign (payment records are created when content is added)
        await Promise.all(ids.map((masterKolId) =>
          CampaignKOLService.addCampaignKOL(campaign.id, masterKolId, 'Curated')
        ));
      }
    } catch (err) {
      console.error("Error creating campaign:", err);
    } finally {
      setIsSubmittingCampaign(false);
    }
  };

  const fetchCampaigns = async () => {
    if (!user?.id || !userProfile?.role) return;
    try {
      setLoading(true);
      setError(null);
      const fetchedCampaigns = await CampaignService.getCampaignsForUser(
        userProfile.role as 'admin' | 'member' | 'client',
        user.id
      );
      setCampaigns(fetchedCampaigns);

      // Fetch content counts and fully-paid content counts for each campaign
      const counts: { [campaignId: string]: { total: number; posted: number } } = {};
      const paidCounts: { [campaignId: string]: number } = {};
      await Promise.all(
        fetchedCampaigns.map(async (campaign) => {
          try {
            const [contentsRes, paymentsRes] = await Promise.all([
              supabase.from('contents').select('id, status, campaign_kols_id').eq('campaign_id', campaign.id),
              supabase.from('payments').select('content_id, amount, payment_date, campaign_kol_id').eq('campaign_id', campaign.id),
            ]);

            if (!contentsRes.error && contentsRes.data) {
              const total = contentsRes.data.length;
              const posted = contentsRes.data.filter(content =>
                content.status?.toLowerCase() === 'posted' ||
                content.status?.toLowerCase() === 'published' ||
                content.status?.toLowerCase() === 'live'
              ).length;
              counts[campaign.id] = { total, posted };

              // Content is paid if it is linked to a payment with a
              // payment_date set. Amount is intentionally NOT checked:
              // $0 USD payments are legitimate (token deals, WL access,
              // comped posts) — they represent a completed transaction,
              // just with no fiat changing hands.
              const payments = paymentsRes.data || [];
              const paidContentIds = new Set<string>();

              payments.forEach(p => {
                if (p.payment_date && p.content_id) {
                  // content_id can be a single id or JSON array
                  const ids = Array.isArray(p.content_id) ? p.content_id : [p.content_id];
                  ids.forEach((id: string) => { if (id && id !== 'none') paidContentIds.add(id); });
                }
              });

              const fullyPaidContentCount = contentsRes.data.filter(c =>
                paidContentIds.has(c.id)
              ).length;
              paidCounts[campaign.id] = fullyPaidContentCount;
            }
          } catch (err) {
            console.error(`Error fetching counts for campaign ${campaign.id}:`, err);
          }
        })
      );
      setContentCounts(counts);
      setPaidContentCounts(paidCounts);
    } catch (err) {
      console.error("Error fetching campaigns:", err);
      setError("Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  };

  // Filter campaigns by clientId if present and add is NOT present
  const filteredCampaigns = campaigns.filter(campaign => {
    const matchesClient = clientIdParam && addParam !== '1' ? campaign.client_id === clientIdParam : true;
    const matchesSearch = campaign.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      campaign.client_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || campaign.status === statusFilter;
    return matchesClient && matchesSearch && matchesStatus;
  });

  // Apply the same client-scope filter the tab badges use, so the
  // hover preview lists exactly what's counted by the badge next to it.
  const scopedCampaigns = campaigns.filter(c =>
    clientIdParam && addParam !== '1' ? c.client_id === clientIdParam : true
  );

  // Build (status -> [campaign names]) once. Used both for the badge
  // counts AND for the hover tooltips that preview which campaigns
  // are in each status. Sorted alphabetically for predictable display.
  const campaignsByStatus: Record<'all' | 'Planning' | 'Active' | 'Paused' | 'Completed', string[]> = {
    all:       scopedCampaigns.map(c => c.name).sort((a, b) => a.localeCompare(b)),
    Planning:  scopedCampaigns.filter(c => c.status === 'Planning').map(c => c.name).sort((a, b) => a.localeCompare(b)),
    Active:    scopedCampaigns.filter(c => c.status === 'Active').map(c => c.name).sort((a, b) => a.localeCompare(b)),
    Paused:    scopedCampaigns.filter(c => c.status === 'Paused').map(c => c.name).sort((a, b) => a.localeCompare(b)),
    Completed: scopedCampaigns.filter(c => c.status === 'Completed').map(c => c.name).sort((a, b) => a.localeCompare(b)),
  };

  // Count campaigns by status for tab badges (derived from the names map)
  const statusCounts = {
    all:       campaignsByStatus.all.length,
    Planning:  campaignsByStatus.Planning.length,
    Active:    campaignsByStatus.Active.length,
    Paused:    campaignsByStatus.Paused.length,
    Completed: campaignsByStatus.Completed.length,
  };

  // Pagination
  const totalPages = Math.ceil(filteredCampaigns.length / itemsPerPage);
  const paginatedCampaigns = filteredCampaigns.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, clientIdParam]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDateForInput = (date: Date | undefined) => {
    if (!date) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const parseDateFromInput = (dateString: string) => {
    if (!dateString) return undefined;
    const [year, month, day] = dateString.split("-");
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  };

  const applyTemplate = (templateId: string) => {
    const template = availableTemplates.find(t => t.id === templateId);
    if (!template) return;

    setNewCampaign({
      ...newCampaign,
      total_budget: template.total_budget.toString(),
      status: (template.status as "Planning" | "Active" | "Paused" | "Completed") || "Planning",
      region: template.region || "apac",
      clientChoosingKols: template.client_choosing_kols || false,
      multiActivation: template.multi_activation || false,
      intro_call: template.intro_call || false,
      intro_call_date: template.intro_call_date || undefined,
      budgetAllocations: template.budget_allocations?.map(alloc => ({
        region: alloc.region,
        amount: alloc.allocated_budget.toString()
      })) || []
    });
  };

  const handleShareCampaign = (campaign: CampaignWithDetails) => {
    setSharingCampaign(campaign);
    setIsShareCampaignOpen(true);
  };

  // [Campaign Live v1] Inline phase update from the list view. Optimistic:
  // patch local state immediately, roll back on error. Used by the Phase
  // dropdown in the Table view's row. Same column the campaign detail
  // form writes to.
  const handleUpdateCurrentPhase = async (campaignId: string, nextPhase: string | null) => {
    const previous = campaigns;
    setCampaigns(prev => prev.map(c =>
      c.id === campaignId ? { ...c, current_phase: nextPhase } as CampaignWithDetails : c
    ));
    try {
      await CampaignService.updateCampaign(campaignId, { current_phase: nextPhase });
    } catch (err) {
      console.error('Failed to update phase:', err);
      setCampaigns(previous);
      alert('Failed to update phase. Try again or use the campaign detail page.');
    }
  };

  const handleArchiveCampaign = (campaign: CampaignWithDetails) => {
    setArchivingCampaign(campaign);
    setIsArchiveDialogOpen(true);
  };

  const confirmArchiveCampaign = async () => {
    if (!archivingCampaign) return;
    setIsArchiving(true);
    try {
      await CampaignService.archiveCampaign(archivingCampaign.id);
      await fetchCampaigns();
      setIsArchiveDialogOpen(false);
      setArchivingCampaign(null);
    } catch (err) {
      console.error('Error archiving campaign:', err);
      setError('Failed to archive campaign');
    } finally {
      setIsArchiving(false);
    }
  };

  // Centralized BadgeTone mapping for campaign status pills — draws
  // from the same StatusBadge palette as the rest of the app. Replaces
  // the previous Badge variants + inline `style={{ backgroundColor:
  // '#3e8692' }}` hack on the Active state.
  const CAMPAIGN_STATUS_TONES: Record<string, BadgeTone> = {
    Active: 'brand',
    Planning: 'info',
    Paused: 'warning',
    Completed: 'neutral',
  };
  const getStatusTone = (status: string): BadgeTone =>
    CAMPAIGN_STATUS_TONES[status] ?? 'neutral';

  // Structural skeleton mirroring the new v11 campaign card 1:1.
  // 40px logo tile + name + 2-icon hover cluster, status badge row,
  // 3 KV info rows (Client / Budget / Dates), progress section with
  // 2px bar + sub-text, pinned View Campaign button at bottom.
  const CampaignCardSkeleton = () => (
    <Card className="crd-hover h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <Skeleton className="h-10 w-10 rounded-md flex-shrink-0" />
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0 opacity-60">
            <Skeleton className="h-7 w-7 rounded-md" />
            <Skeleton className="h-7 w-7 rounded-md" />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center">
            <Skeleton className="h-3.5 w-3.5 mr-2 rounded-sm" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="flex items-center">
            <Skeleton className="h-3.5 w-3.5 mr-2 rounded-sm" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="flex items-center">
            <Skeleton className="h-3.5 w-3.5 mr-2 rounded-sm" />
            <Skeleton className="h-4 w-36" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-3 border-t border-cream-100 flex flex-col flex-1">
        <div className="mb-3">
          <div className="flex items-baseline justify-between mb-1.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-8" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
          <div className="mt-2 space-y-0.5">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <Skeleton className="h-8 w-full rounded-md mt-auto" />
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Campaigns"
          subtitle="Track and manage your marketing campaigns"
          kicker="Talent · Campaigns"
          kickerDot="amber"
          actions={
            <Button variant="brand" onClick={() => setIsNewCampaignOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Campaign
            </Button>
          }
        />
        {/* ── Campaigns skeleton ──────────────────────────────────
            Mirrors the loaded layout: SectionHeader + toolbar
            (tabs left, search middle, view-mode toggle right) +
            card grid. */}
        <div className="space-y-4">
          <div className="section-head first flex items-center gap-3">
            <span className="dot bg-brand/30" aria-hidden />
            <Skeleton className="h-3 w-24" />
            <span className="flex-1 h-px bg-cream-200" aria-hidden />
            <Skeleton className="h-3 w-32" />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1 p-1 rounded-md bg-cream-100 border border-cream-200">
              <Skeleton className="h-8 w-14 rounded" />
              <Skeleton className="h-8 w-24 rounded" />
              <Skeleton className="h-8 w-20 rounded" />
              <Skeleton className="h-8 w-20 rounded" />
              <Skeleton className="h-8 w-28 rounded" />
            </div>
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-warm-400" />
              <Input placeholder="Search campaigns by name or client..." className="pl-10 focus-brand" disabled />
            </div>
            <div className="ml-auto flex gap-1 p-1 rounded-md bg-cream-100 border border-cream-200">
              <Skeleton className="h-8 w-10 rounded" />
              <Skeleton className="h-8 w-10 rounded" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <CampaignCardSkeleton key={index} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Campaigns" subtitle="Track and manage your marketing campaigns" kicker="Talent · Campaigns" kickerDot="amber" />
        <div className="text-center py-8">
          <p className="text-rose-600">{error}</p>
          <Button onClick={fetchCampaigns} variant="brand" className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        subtitle="Track and manage your marketing campaigns"
        kicker="Talent · Campaigns"
        kickerDot="amber"
        actions={
          <Dialog open={isNewCampaignOpen} onOpenChange={setIsNewCampaignOpen}>
            <DialogTrigger asChild>
              <Button variant="brand">
                <Plus className="h-4 w-4 mr-2" />
                New Campaign
              </Button>
            </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Create New Campaign</DialogTitle>
                <DialogDescription>
                  Set up a new marketing campaign for your client.
                </DialogDescription>
              </DialogHeader>
              {/* flex-col flex-1 min-h-0 so the flex chain from
                  DialogContent reaches the inner body div's flex-1. */}
              <form onSubmit={handleCreateCampaign} className="flex flex-col flex-1 min-h-0">
                <div className="grid gap-4 py-4 flex-1 overflow-y-auto px-1">
                  <div className="grid gap-2">
                    <Label htmlFor="client">Client <span className="text-rose-500">*</span></Label>
                    <Select value={newCampaign.client_id} onValueChange={(value) => setNewCampaign({ ...newCampaign, client_id: value })}>
                      <SelectTrigger className="focus-brand">
                        <SelectValue placeholder="Select a client" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableClients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Campaign Template section hidden for now */}
                  {/* <div className="grid gap-2">
                    <Label htmlFor="template">Campaign Template (Optional)</Label>
                    <Select 
                      value={selectedTemplate} 
                      onValueChange={(value) => {
                        setSelectedTemplate(value);
                        if (value && value !== "none") {
                          applyTemplate(value);
                        }
                      }}
                    >
                      <SelectTrigger className="focus-brand">
                        <SelectValue placeholder={isLoadingTemplates ? "Loading templates..." : "Select a template to pre-fill form"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No template</SelectItem>
                        {availableTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            <div className="flex flex-col">
                              <span className="font-medium">{template.name}</span>
                              <span className="text-xs text-ink-warm-500">
                                ${template.total_budget.toLocaleString()} • {template.region} • {template.usage_count || 0} uses
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedTemplate && selectedTemplate !== "none" && (
                      <div className="text-xs text-ink-warm-700 mt-1">
                        Template applied! You can modify any fields below.
                      </div>
                    )}
                  </div> */}
                  <div className="grid gap-2">
                    <Label htmlFor="campaign-name">Campaign Name <span className="text-rose-500">*</span></Label>
                    <Input
                      id="campaign-name"
                      value={newCampaign.name}
                      onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                      placeholder="Enter campaign name"
                      className="focus-brand"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="manager">Campaign Manager</Label>
                    <Select value={newCampaign.manager} onValueChange={(value) => setNewCampaign({ ...newCampaign, manager: value })}>
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
                      <Label htmlFor="status">Status</Label>
                      <Select value={newCampaign.status} onValueChange={(value: any) => setNewCampaign({ ...newCampaign, status: value })}>
                        <SelectTrigger className="focus-brand">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Planning">Planning</SelectItem>
                          <SelectItem value="Active">Active</SelectItem>
                          <SelectItem value="Paused">Paused</SelectItem>
                          <SelectItem value="Completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="start-date">Start Date <span className="text-rose-500">*</span></Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="focus-brand justify-start text-left font-normal focus:ring-2 focus:ring-brand focus:border-brand"
                            style={{
                              borderColor: "#e5e7eb",
                              backgroundColor: "white",
                              color: newCampaign.start_date ? "#111827" : "#9ca3af"
                            }}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {newCampaign.start_date ? formatDate(newCampaign.start_date) : "Select start date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={parseDateFromInput(newCampaign.start_date)}
                            onSelect={(date) => setNewCampaign({ ...newCampaign, start_date: formatDateForInput(date) })}
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
                      <Label htmlFor="end-date">End Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="focus-brand justify-start text-left font-normal focus:ring-2 focus:ring-brand focus:border-brand"
                            style={{
                              borderColor: "#e5e7eb",
                              backgroundColor: "white",
                              color: newCampaign.end_date ? "#111827" : "#9ca3af"
                            }}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {newCampaign.end_date ? formatDate(newCampaign.end_date) : "Select end date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={parseDateFromInput(newCampaign.end_date)}
                            onSelect={(date) => setNewCampaign({ ...newCampaign, end_date: formatDateForInput(date) })}
                            disabled={(date) =>
                              newCampaign.start_date ? date < parseDateFromInput(newCampaign.start_date)! : false
                            }
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
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description">Description (Optional) - Client Facing</Label>
                    <Textarea
                      id="description"
                      value={newCampaign.description}
                      onChange={(e) => setNewCampaign({ ...newCampaign, description: e.target.value })}
                      placeholder="Enter campaign description"
                      className="focus-brand"
                      rows={3}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="region">Region</Label>
                    <Select value={newCampaign.region} onValueChange={(value) => setNewCampaign({ ...newCampaign, region: value })}>
                      <SelectTrigger className="focus-brand">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="apac">APAC</SelectItem>
                        <SelectItem value="global">Global</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="load-from-list">Load KOLs from Existing List (Optional)</Label>
                    <Select 
                      value={selectedListId} 
                      onValueChange={(value) => { 
                        setSelectedListId(value); 
                        fetchListKOLs(value);
                      }}
                    >
                      <SelectTrigger className="focus-brand">
                        <SelectValue placeholder="Select a list" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableLists.map((l) => (
                          <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedListId && (
                      <div className="border rounded-md p-2 max-h-56 overflow-y-auto">
                        {listKOLs.length === 0 ? (
                          <div className="text-xs text-ink-warm-500 px-1 py-2">No KOLs in this list.</div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex justify-between items-center pb-2 border-b">
                              <span className="text-sm font-medium text-ink-warm-700">
                                {selectedKolIds.size} of {listKOLs.length} selected
                              </span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const allSelected = selectedKolIds.size === listKOLs.length;
                                  if (allSelected) {
                                    setSelectedKolIds(new Set());
                                  } else {
                                    setSelectedKolIds(new Set(listKOLs.map(k => k.master_kol_id)));
                                  }
                                }}
                                className="h-7 px-2 text-xs"
                              >
                                {selectedKolIds.size === listKOLs.length ? 'Deselect All' : 'Select All'}
                              </Button>
                            </div>
                            {listKOLs.map((k) => {
                              const checked = selectedKolIds.has(k.master_kol_id);
                              return (
                                <label key={k.master_kol_id} className="flex items-start gap-2 text-sm">
                                  <Checkbox 
                                    checked={checked}
                                    onCheckedChange={(val) => {
                                      setSelectedKolIds(prev => {
                                        const next = new Set(prev);
                                        if (val) next.add(k.master_kol_id); else next.delete(k.master_kol_id);
                                        return next;
                                      });
                                    }}
                                  />
                                  <div className="flex-1">
                                    <div className="font-medium text-ink-warm-900">{k.name}</div>
                                    <div className="text-xs text-ink-warm-700">
                                      {k.followers ? `${k.followers.toLocaleString()} followers` : '-'}
                                      {k.region ? ` • ${k.region}` : ''}
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="clientChoosingKols"
                      checked={newCampaign.clientChoosingKols}
                      onCheckedChange={(checked) => setNewCampaign({ ...newCampaign, clientChoosingKols: checked as boolean })}
                    />
                    <Label htmlFor="clientChoosingKols" className="text-sm">Is Client Choosing the KOLs?</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="multiActivation"
                      checked={newCampaign.multiActivation}
                      onCheckedChange={(checked) => setNewCampaign({ ...newCampaign, multiActivation: checked as boolean })}
                    />
                    <Label htmlFor="multiActivation" className="text-sm">Multi-Activation Campaign</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="intro_call"
                      checked={newCampaign.intro_call}
                      onCheckedChange={(checked) => setNewCampaign({ ...newCampaign, intro_call: checked as boolean })}
                    />
                    <Label htmlFor="intro_call" className="text-sm">Intro call held?</Label>
                  </div>
                  {newCampaign.intro_call && (
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
                              color: newCampaign.intro_call_date ? '#111827' : '#9ca3af'
                            }}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {newCampaign.intro_call_date ? new Date(newCampaign.intro_call_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Select intro call date'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={newCampaign.intro_call_date ? new Date(newCampaign.intro_call_date) : undefined}
                            onSelect={(date) => setNewCampaign({ ...newCampaign, intro_call_date: date ? date.toISOString().split('T')[0] : undefined })}
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
                  {/* Move Budget and Budget Allocation fields here, at the end */}
                  <div className="grid gap-2 mt-2">
                    <Label htmlFor="totalBudget">Total Budget <span className="text-rose-500">*</span></Label>
                    <div className="relative w-full">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-warm-500 pointer-events-none">$</span>
                      <Input
                        id="totalBudget"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9,]*"
                        className="focus-brand pl-6 w-full"
                        value={newCampaign.total_budget ? Number(newCampaign.total_budget.replace(/,/g, '')).toLocaleString('en-US') : ''}
                        onChange={e => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          setNewCampaign({ ...newCampaign, total_budget: raw });
                        }}
                        placeholder="Enter total budget"
                        required
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Regional Budget Allocation</Label>
                    <div className="bg-cream-50 border rounded p-3 text-sm text-ink-warm-700 space-y-2">
                      {newCampaign.budgetAllocations.length === 0 && (
                        <div className="text-ink-warm-400 text-sm">No allocations yet.</div>
                      )}
                      {newCampaign.budgetAllocations.map((alloc, idx) => {
                        const formattedAmount = alloc.amount
                          ? Number(alloc.amount.replace(/,/g, '')).toLocaleString('en-US')
                          : '';
                        return (
                          <div key={idx} className="flex items-center gap-2">
                            <Select
                              value={alloc.region}
                              onValueChange={value => {
                                const newAllocs = [...newCampaign.budgetAllocations];
                                newAllocs[idx].region = value;
                                setNewCampaign({ ...newCampaign, budgetAllocations: newAllocs });
                              }}
                            >
                              <SelectTrigger className="w-32 focus-brand">
                                <SelectValue placeholder="Select region" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="apac">APAC</SelectItem>
                                <SelectItem value="global">Global</SelectItem>
                              </SelectContent>
                            </Select>
                            <div className="relative w-28">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-warm-500 pointer-events-none">$</span>
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9,]*"
                                className="focus-brand pl-6 w-full"
                                value={formattedAmount}
                                onChange={e => {
                                  const raw = e.target.value.replace(/[^0-9]/g, '');
                                  const newAllocs = [...newCampaign.budgetAllocations];
                                  newAllocs[idx].amount = raw;
                                  setNewCampaign({ ...newCampaign, budgetAllocations: newAllocs });
                                }}
                                placeholder="Amount"
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-rose-500 hover:text-rose-700"
                              onClick={() => {
                                setNewCampaign({
                                  ...newCampaign,
                                  budgetAllocations: newCampaign.budgetAllocations.filter((_, i) => i !== idx)
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
                        onClick={() => setNewCampaign({
                          ...newCampaign,
                          budgetAllocations: [
                            ...newCampaign.budgetAllocations,
                            { region: '', amount: '' }
                          ]
                        })}
                      >Add Allocation</Button>
                    </div>
                  </div>
                </div>
                <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
                  <Button type="button" variant="outline" onClick={() => setIsNewCampaignOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="brand" type="submit" disabled={isSubmittingCampaign || !newCampaign.client_id || !newCampaign.name.trim() || !newCampaign.total_budget || !newCampaign.start_date}>
                    {isSubmittingCampaign ? "Creating..." : "Create Campaign"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      {/* ── Campaigns ─────────────────────────────────────────────────
          Single SectionHeader + toolbar (tabs left, search middle,
          view-mode toggle right). Matches the /clients & /lists
          chrome pattern. */}
      <div className="space-y-4">
        <SectionHeader
          label="Campaigns"
          dot="amber"
          counter={`${filteredCampaigns.length} of ${statusCounts.all} campaign${statusCounts.all === 1 ? '' : 's'}${statusFilter !== 'all' ? ` · ${statusFilter.toLowerCase()}` : ''}`}
          first
        />

        <div className="flex items-center gap-3 flex-wrap">
          {/* Each tab shows a hover tooltip with the campaign names
              in that status — handy for the manager to scan what's
              where without clicking through. Tone palette aligned to
              v11: Planning sky (info), Active brand, Paused amber
              (warning), Completed emerald (success). */}
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200 flex-wrap">
              <TooltipProvider delayDuration={250}>
                {/* We can't use Tailwind's `data-[state=active]:...`
                    here because <TooltipTrigger asChild> overwrites
                    Radix Tabs' data-state attribute with Tooltip's
                    own. Derive active styling from the controlled
                    statusFilter state instead. */}
                {([
                  { value: 'all',       label: 'All',       activeText: 'text-ink-warm-900', countBg: 'bg-cream-200 text-ink-warm-700' },
                  { value: 'Planning',  label: 'Planning',  activeText: 'text-sky-700',      countBg: 'bg-sky-100 text-sky-700' },
                  { value: 'Active',    label: 'Active',    activeText: 'text-brand',        countBg: 'bg-brand-light text-brand' },
                  { value: 'Paused',    label: 'Paused',    activeText: 'text-amber-700',    countBg: 'bg-amber-100 text-amber-800' },
                  { value: 'Completed', label: 'Completed', activeText: 'text-emerald-700',  countBg: 'bg-emerald-100 text-emerald-800' },
                ] as const).map((t) => {
                  const names = campaignsByStatus[t.value as keyof typeof campaignsByStatus];
                  const isActive = statusFilter === t.value;
                  return (
                    <Tooltip key={t.value}>
                      <TooltipTrigger asChild>
                        <TabsTrigger
                          value={t.value}
                          className={`px-4 py-2 transition-colors ${
                            isActive
                              ? `bg-white shadow-card ${t.activeText}`
                              : 'text-ink-warm-700 hover:bg-cream-50'
                          }`}
                        >
                          {t.label}
                          <span className={`ml-2 text-xs px-2 py-0.5 rounded-full pointer-events-none ${t.countBg}`}>{names.length}</span>
                        </TabsTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" align="start" className="max-w-xs p-0">
                        {names.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-ink-warm-500 italic">No campaigns</div>
                        ) : (
                          <div className="py-1.5 max-h-72 overflow-y-auto">
                            <div className="px-3 py-1 text-[10px] mono font-semibold text-ink-warm-400 uppercase tracking-[0.14em] border-b border-cream-100">
                              {names.length} {t.label.toLowerCase()} campaign{names.length === 1 ? '' : 's'}
                            </div>
                            <ul className="text-xs">
                              {/* Cap at 50 to keep the popover sane —
                                  anyone with 50+ campaigns in a single
                                  status should be filtering, not scanning. */}
                              {names.slice(0, 50).map((n) => (
                                <li key={n} className="px-3 py-1 truncate">{n}</li>
                              ))}
                              {names.length > 50 && (
                                <li className="px-3 py-1 text-ink-warm-400 italic">…and {names.length - 50} more</li>
                              )}
                            </ul>
                          </div>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </TooltipProvider>
            </TabsList>
          </Tabs>

          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-warm-400" />
            <Input
              placeholder="Search campaigns by name or client..."
              className="pl-10 focus-brand"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* View-mode toggle — v11 chrome (cream-100 base + cream-200
              border + shadow-card on active segment). */}
          <div className="ml-auto flex bg-cream-100 p-1 rounded-md border border-cream-200">
            <Button
              variant="ghost"
              size="sm"
              className={`h-8 px-3 ${viewMode === 'card' ? 'bg-white shadow-card text-brand' : 'text-ink-warm-500 hover:bg-cream-200 hover:text-ink-warm-700'}`}
              onClick={() => setViewMode('card')}
              title="Card view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-8 px-3 ${viewMode === 'table' ? 'bg-white shadow-card text-brand' : 'text-ink-warm-500 hover:bg-cream-200 hover:text-ink-warm-700'}`}
              onClick={() => setViewMode('table')}
              title="Table view"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      {filteredCampaigns.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title={searchTerm || statusFilter !== "all"
            ? "No campaigns match your filters."
            : "No campaigns yet."}
        >
          {(userProfile?.role === "super_admin" || userProfile?.role === "admin") && !searchTerm && statusFilter === "all" && (
            <Button variant="brand" onClick={() => setIsNewCampaignOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Campaign
            </Button>
          )}
        </EmptyState>
      ) : viewMode === "card" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginatedCampaigns.map((campaign) => {
            const counts = contentCounts[campaign.id];
            const pct = counts && counts.total > 0 ? Math.round((counts.posted / counts.total) * 100) : 0;
            return (
              // v11 campaign card — same shape as /clients, /lists cards.
              // Logo tile (client logo if set, else brand-soft Megaphone)
              // + name + hover-action cluster (Share/Archive). Status
              // badge below. Progress section in CardContent. View
              // Campaign pinned via mt-auto.
              <Card key={campaign.id} className="crd-hover group flex flex-col h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {campaign.client_logo_url ? (
                        <div className="w-10 h-10 rounded-md overflow-hidden bg-white border border-cream-200 flex-shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={campaign.client_logo_url}
                            alt={campaign.client_name || 'Client'}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-md bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center flex-shrink-0">
                          <Megaphone className="h-5 w-5" />
                        </div>
                      )}
                      <span className="text-base font-semibold text-ink-warm-900 tracking-tight truncate min-w-0">{campaign.name}</span>
                    </div>
                    {/* Hover-action cluster — Share + Archive */}
                    <div className="flex items-center gap-0.5 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity duration-200">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleShareCampaign(campaign); }}
                        className="h-7 w-7 p-0 rounded-md text-ink-warm-500 hover:text-ink-warm-900 hover:bg-cream-100"
                        title="Share campaign"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleArchiveCampaign(campaign); }}
                        className="h-7 w-7 p-0 rounded-md text-ink-warm-500 hover:text-amber-700 hover:bg-amber-50"
                        title="Archive campaign"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {/* Status badge row */}
                  <div className="flex gap-2 flex-wrap">
                    <StatusBadge tone={getStatusTone(campaign.status)} size="sm" bordered withDot={campaign.status === 'Active' ? 'pulse' : true}>
                      {campaign.status}
                    </StatusBadge>
                  </div>
                  {/* KV info rows — Client, Budget, Dates */}
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center text-sm text-ink-warm-700">
                      <Building2 className="h-3.5 w-3.5 mr-2 text-ink-warm-400 flex-shrink-0" />
                      <span className="truncate">{campaign.client_name}</span>
                    </div>
                    <div className="flex items-center text-sm text-ink-warm-700">
                      <DollarSign className="h-3.5 w-3.5 mr-2 text-ink-warm-400 flex-shrink-0" />
                      <span className="tabular-nums">{CampaignService.formatCurrency(campaign.total_budget)}</span>
                    </div>
                    <div className="flex items-center text-sm text-ink-warm-700">
                      <CalendarIcon className="h-3.5 w-3.5 mr-2 text-ink-warm-400 flex-shrink-0" />
                      <span className="tabular-nums">{formatDate(campaign.start_date)}{campaign.end_date ? ` – ${formatDate(campaign.end_date)}` : ' – TBD'}</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-3 border-t border-cream-100 flex flex-col flex-1">
                  {/* Progress section — label + percentage + 2px brand
                      bar. Matches the onboarding-progress pattern on
                      the /clients card. */}
                  <div className="mb-3">
                    <div className="flex items-baseline justify-between text-sm mb-1.5">
                      <span className="font-semibold text-ink-warm-700">Progress</span>
                      <span className="text-xs text-ink-warm-500 tabular-nums">{pct}%</span>
                    </div>
                    <div className="w-full h-2 bg-cream-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-2 space-y-0.5 text-xs text-ink-warm-500">
                      <div>
                        {counts && counts.total > 0
                          ? <><span className="tabular-nums">{counts.posted}</span> of <span className="tabular-nums">{counts.total}</span> content posted</>
                          : 'No content yet'}
                      </div>
                      {counts && counts.total > 0 && (
                        <div>
                          <span className="tabular-nums">{paidContentCounts[campaign.id] || 0}</span> of <span className="tabular-nums">{counts.total}</span> content paid
                        </div>
                      )}
                    </div>
                  </div>
                  {/* View Campaign — primary action, pinned at bottom */}
                  <div className="mt-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        if (!campaign.id) {
                          console.error('Campaign ID is missing!', campaign);
                          return;
                        }
                        router.push(`/campaigns/${campaign.slug || campaign.id}`);
                      }}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      View Campaign
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        /* Table View — v11 Card chrome + dashboard header typography. */
        <Card className="border-cream-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Campaign</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Client</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Status</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Budget</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Dates</TableHead>
                {/* [Campaign Live v1] Inline phase setter — same data
                    the campaign detail form writes to
                    (campaigns.current_phase). See portal page. */}
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Phase</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Progress</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedCampaigns.map((campaign) => {
                const counts = contentCounts[campaign.id];
                const progress = counts && counts.total > 0 ? Math.round((counts.posted / counts.total) * 100) : 0;
                return (
                  <TableRow
                    key={campaign.id}
                    className="border-cream-100 row-accent cursor-pointer"
                    onClick={() => router.push(`/campaigns/${campaign.slug || campaign.id}`)}
                  >
                    <TableCell className="py-3.5 px-5">
                      <div className="flex items-center gap-2.5">
                        {campaign.client_logo_url ? (
                          <div className="w-7 h-7 rounded-md overflow-hidden bg-white border border-cream-200 flex-shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={campaign.client_logo_url}
                              alt={campaign.client_name || 'Client'}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-md bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center flex-shrink-0">
                            <Megaphone className="h-4 w-4" />
                          </div>
                        )}
                        <span className="font-medium text-ink-warm-900 truncate">{campaign.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 px-5 text-ink-warm-700 truncate">{campaign.client_name}</TableCell>
                    <TableCell className="py-3.5 px-5">
                      <StatusBadge tone={getStatusTone(campaign.status)} size="sm" bordered withDot={campaign.status === 'Active' ? 'pulse' : true}>
                        {campaign.status}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="py-3.5 px-5 text-right text-ink-warm-700 tabular-nums">{CampaignService.formatCurrency(campaign.total_budget)}</TableCell>
                    <TableCell className="py-3.5 px-5 text-ink-warm-700 text-sm tabular-nums">
                      {formatDate(campaign.start_date)}
                      {campaign.end_date ? ` – ${formatDate(campaign.end_date)}` : ''}
                    </TableCell>
                    {/* [Campaign Live v1] Inline Phase cell.
                        stopPropagation prevents the row's onClick from
                        firing when the user opens the dropdown. */}
                    <TableCell className="py-3.5 px-5" onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={campaign.current_phase ?? '__none__'}
                        onValueChange={(v) =>
                          handleUpdateCurrentPhase(campaign.id, v === '__none__' ? null : v)
                        }
                      >
                        <SelectTrigger className="h-8 w-[170px] text-xs focus-brand">
                          <SelectValue placeholder="— Not set" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Not set</SelectItem>
                          {CURRENT_PHASE_OPTIONS.map(phase => (
                            <SelectItem key={phase} value={phase}>{phase}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="py-3.5 px-5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-cream-100 rounded-full h-2 w-20 overflow-hidden">
                          <div
                            className="h-2 bg-brand rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-ink-warm-700 w-8 tabular-nums">{progress}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 rounded-md text-ink-warm-500 hover:text-ink-warm-900 hover:bg-cream-100"
                          onClick={() => handleShareCampaign(campaign)}
                          title="Share campaign"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 rounded-md text-ink-warm-500 hover:text-amber-700 hover:bg-amber-50"
                          onClick={() => handleArchiveCampaign(campaign)}
                          title="Archive campaign"
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Pagination */}
      {filteredCampaigns.length > itemsPerPage && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-sm text-ink-warm-700">
            Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredCampaigns.length)} of {filteredCampaigns.length} campaigns
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm text-ink-warm-700">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
      </div>

      {/* Share Campaign Dialog */}
      <Dialog open={isShareCampaignOpen} onOpenChange={setIsShareCampaignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share Campaign: {sharingCampaign?.name}</DialogTitle>
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
                  <span>{sharingCampaign?.client_name || 'Unknown'}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="font-medium">Budget:</span>
                  <span>{CampaignService.formatCurrency(sharingCampaign?.total_budget || 0)}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="font-medium">Dates:</span>
                  <span>{sharingCampaign ? new Date(sharingCampaign.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}{sharingCampaign?.end_date ? ` - ${new Date(sharingCampaign.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ' - TBD'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Status:</span>
                  <span>{sharingCampaign?.status}</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="public-password">Password for Public View</Label>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-blue-900">Client Email:</span>
                  <span className="text-sm font-mono text-blue-700">{sharingCampaign?.client_email || 'N/A'}</span>
                </div>
                <p className="text-xs text-brand mt-2">Use the client's email address as the password to access the public campaign view</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="share-creator-type"
                  checked={sharingCampaign?.share_creator_type || false}
                  onCheckedChange={async (checked) => {
                    if (sharingCampaign?.id) {
                      try {
                        await CampaignService.updateCampaign(sharingCampaign.id, {
                          share_creator_type: checked as boolean
                        } as any);
                        setSharingCampaign({ ...sharingCampaign, share_creator_type: checked as boolean });
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
              {/* Per-content-piece notes — gated by campaigns.share_content_notes.
                  Adds a Notes column to the Contents table on the public view.
                  Off by default so editor commentary stays internal unless
                  explicitly opted in (migration 065). */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="share-content-notes"
                  checked={(sharingCampaign as any)?.share_content_notes || false}
                  onCheckedChange={async (checked) => {
                    if (sharingCampaign?.id) {
                      try {
                        await CampaignService.updateCampaign(sharingCampaign.id, {
                          share_content_notes: checked as boolean,
                        } as any);
                        setSharingCampaign({ ...sharingCampaign, share_content_notes: checked as boolean } as any);
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
                  value={`${typeof window !== 'undefined' ? window.location.origin : ''}/public/campaigns/${sharingCampaign?.slug || sharingCampaign?.id}`}
                  readOnly
                  className="flex-1 focus-brand"
                />
                <Button
                  variant="outline"
                  className="h-10"
                  onClick={() => {
                    if (typeof window !== 'undefined' && sharingCampaign?.id) {
                      navigator.clipboard.writeText(`${window.location.origin}/public/campaigns/${sharingCampaign.slug || sharingCampaign.id}`);
                    }
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="h-10"
                  onClick={() => {
                    if (typeof window !== 'undefined' && sharingCampaign?.id) {
                      window.open(`${window.location.origin}/public/campaigns/${sharingCampaign.slug || sharingCampaign.id}`, '_blank');
                    }
                  }}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setIsShareCampaignOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Campaign Confirmation Dialog */}
      <Dialog open={isArchiveDialogOpen} onOpenChange={setIsArchiveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
              Archive Campaign
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to archive <span className="font-semibold">{archivingCampaign?.name}</span>?
              The campaign will be moved to the archive and can be restored later.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {/* Cream callout tile + AlertTriangle for the warning
                cue — matches the /team Telegram popover pattern. The
                amber icon carries the "needs attention" semantic
                without painting the whole tile in a non-v11 hue. */}
            <div className="rounded-md bg-cream-50 border border-cream-200 p-3 text-sm text-ink-warm-700 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-ink-warm-900 font-medium">This will:</p>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Hide the campaign from the main campaigns list</li>
                  <li>Keep all campaign data intact</li>
                  <li>Allow restoration from the Archive page</li>
                </ul>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setIsArchiveDialogOpen(false)} disabled={isArchiving}>
              Cancel
            </Button>
            <Button
              variant="brand"
              onClick={confirmArchiveCampaign}
              disabled={isArchiving}
              className="bg-amber-600 hover:bg-amber-700 text-white shadow-none"
            >
              {isArchiving ? "Archiving..." : "Archive Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 