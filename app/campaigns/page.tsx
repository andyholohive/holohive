"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Plus, Megaphone, Building2, DollarSign, Calendar as CalendarIcon, Trash2, Share2, Copy, ExternalLink, Archive, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ClientService, ClientWithAccess } from "@/lib/clientService";
import { CampaignService, CampaignWithDetails } from "@/lib/campaignService";
import { CampaignTemplateService, CampaignTemplateWithDetails } from "@/lib/campaignTemplateService";
import { useSearchParams, useRouter } from 'next/navigation';
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { CampaignKOLService } from "@/lib/campaignKolService";
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

      // Fetch content counts for each campaign
      const counts: { [campaignId: string]: { total: number; posted: number } } = {};
      await Promise.all(
        fetchedCampaigns.map(async (campaign) => {
          try {
            const { data, error } = await supabase
              .from('contents')
              .select('status')
              .eq('campaign_id', campaign.id);

            if (!error && data) {
              const total = data.length;
              const posted = data.filter(content =>
                content.status?.toLowerCase() === 'posted' ||
                content.status?.toLowerCase() === 'published' ||
                content.status?.toLowerCase() === 'live'
              ).length;
              counts[campaign.id] = { total, posted };
            }
          } catch (err) {
            console.error(`Error fetching content counts for campaign ${campaign.id}:`, err);
          }
        })
      );
      setContentCounts(counts);
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
    return matchesClient && matchesSearch;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
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

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "Active": return "default";
      case "Planning": return "secondary";
      case "Paused": return "destructive";
      case "Completed": return "outline";
      default: return "secondary";
    }
  };

  const CampaignCardSkeleton = () => (
    <Card className="transition-shadow h-full flex flex-col">
      <CardHeader className="pb-4">
        <div className="mb-3">
          <div className="flex items-center justify-between text-lg font-semibold text-gray-600 mb-2">
            <div className="flex items-center">
              <Skeleton className="h-8 w-8 rounded-lg mr-2" />
              <Skeleton className="h-5 w-48" />
            </div>
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <div className="space-y-2">
          <div className="flex items-center text-sm text-gray-600">
            <Skeleton className="h-4 w-4 mr-2" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex items-center text-sm text-gray-600">
            <Skeleton className="h-4 w-4 mr-2" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex items-center text-sm text-gray-600">
            <Skeleton className="h-4 w-4 mr-2" />
            <Skeleton className="h-4 w-36" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4 border-t border-gray-100 flex flex-col flex-1">
        <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-12 rounded-md" />
        </div>
        <div className="mb-3">
          <Skeleton className="h-3 w-32 mb-2" />
          <div className="flex flex-wrap gap-1">
            <Skeleton className="h-5 w-20 rounded-md" />
            <Skeleton className="h-5 w-24 rounded-md" />
            <Skeleton className="h-5 w-18 rounded-md" />
          </div>
        </div>
        <Skeleton className="h-8 w-full rounded mt-auto" />
        <Skeleton className="h-8 w-full rounded mt-2" />
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Campaigns</h2>
            <p className="text-gray-600">Track and manage your marketing campaigns</p>
          </div>
          <Button
            className="hover:opacity-90"
            style={{ backgroundColor: "#3e8692", color: "white" }}
            onClick={() => setIsNewCampaignOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Campaign
          </Button>
        </div>
        <div className="flex items-center space-x-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search campaigns by name or client..."
              className="pl-10 auth-input"
              disabled
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <CampaignCardSkeleton key={index} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Campaigns</h2>
            <p className="text-gray-600">Track and manage your marketing campaigns</p>
          </div>
        </div>
        <div className="text-center py-8">
          <p className="text-red-600">{error}</p>
          <Button
            onClick={fetchCampaigns}
            className="mt-4 hover:opacity-90"
            style={{ backgroundColor: "#3e8692", color: "white" }}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Campaigns</h2>
          <p className="text-gray-600">Track and manage your marketing campaigns</p>
        </div>
        <Dialog open={isNewCampaignOpen} onOpenChange={setIsNewCampaignOpen}>
          <DialogTrigger asChild>
            <Button className="hover:opacity-90" style={{ backgroundColor: "#3e8692", color: "white" }}>
              <Plus className="h-4 w-4 mr-2" />
              New Campaign
            </Button>
          </DialogTrigger>
                            <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-hidden">
              <DialogHeader>
                <DialogTitle>Create New Campaign</DialogTitle>
                <DialogDescription>
                  Set up a new marketing campaign for your client.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateCampaign}>
                <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto px-3 pb-6">
                  <div className="grid gap-2">
                    <Label htmlFor="client">Client <span className="text-red-500">*</span></Label>
                    <Select value={newCampaign.client_id} onValueChange={(value) => setNewCampaign({ ...newCampaign, client_id: value })}>
                      <SelectTrigger className="auth-input">
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
                      <SelectTrigger className="auth-input">
                        <SelectValue placeholder={isLoadingTemplates ? "Loading templates..." : "Select a template to pre-fill form"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No template</SelectItem>
                        {availableTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            <div className="flex flex-col">
                              <span className="font-medium">{template.name}</span>
                              <span className="text-xs text-gray-500">
                                ${template.total_budget.toLocaleString()} • {template.region} • {template.usage_count || 0} uses
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedTemplate && selectedTemplate !== "none" && (
                      <div className="text-xs text-gray-600 mt-1">
                        Template applied! You can modify any fields below.
                      </div>
                    )}
                  </div> */}
                  <div className="grid gap-2">
                    <Label htmlFor="campaign-name">Campaign Name <span className="text-red-500">*</span></Label>
                    <Input
                      id="campaign-name"
                      value={newCampaign.name}
                      onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                      placeholder="Enter campaign name"
                      className="auth-input"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="manager">Campaign Manager</Label>
                    <Select value={newCampaign.manager} onValueChange={(value) => setNewCampaign({ ...newCampaign, manager: value })}>
                      <SelectTrigger className="auth-input">
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
                        <SelectTrigger className="auth-input">
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
                      <Label htmlFor="start-date">Start Date <span className="text-red-500">*</span></Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="auth-input justify-start text-left font-normal focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692]"
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
                            className="auth-input justify-start text-left font-normal focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692]"
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
                      className="auth-input"
                      rows={3}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="region">Region</Label>
                    <Select value={newCampaign.region} onValueChange={(value) => setNewCampaign({ ...newCampaign, region: value })}>
                      <SelectTrigger className="auth-input">
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
                      <SelectTrigger className="auth-input">
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
                          <div className="text-xs text-gray-500 px-1 py-2">No KOLs in this list.</div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex justify-between items-center pb-2 border-b">
                              <span className="text-sm font-medium text-gray-700">
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
                                    <div className="font-medium text-gray-900">{k.name}</div>
                                    <div className="text-xs text-gray-600">
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
                            className="auth-input justify-start text-left font-normal focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692]"
                            style={{
                              borderColor: '#e5e7eb',
                              backgroundColor: 'white',
                              color: newCampaign.intro_call_date ? '#111827' : '#9ca3af'
                            }}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {newCampaign.intro_call_date ? new Date(newCampaign.intro_call_date).toLocaleDateString() : 'Select intro call date'}
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
                    <Label htmlFor="totalBudget">Total Budget <span className="text-red-500">*</span></Label>
                    <div className="relative w-full">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">$</span>
                      <Input
                        id="totalBudget"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9,]*"
                        className="auth-input pl-6 w-full"
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
                    <div className="bg-gray-50 border rounded p-3 text-sm text-gray-700 space-y-2">
                      {newCampaign.budgetAllocations.length === 0 && (
                        <div className="text-gray-400 text-sm">No allocations yet.</div>
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
                              <SelectTrigger className="w-32 auth-input">
                                <SelectValue placeholder="Select region" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="apac">APAC</SelectItem>
                                <SelectItem value="global">Global</SelectItem>
                              </SelectContent>
                            </Select>
                            <div className="relative w-28">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">$</span>
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9,]*"
                                className="auth-input pl-6 w-full"
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
                              className="text-red-500 hover:text-red-700"
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
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsNewCampaignOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmittingCampaign || !newCampaign.client_id || !newCampaign.name.trim() || !newCampaign.total_budget || !newCampaign.start_date}
                    className="hover:opacity-90"
                    style={{ backgroundColor: "#3e8692", color: "white" }}
                  >
                    {isSubmittingCampaign ? "Creating..." : "Create Campaign"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
      </div>
      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search campaigns by name or client..."
            className="pl-10 auth-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCampaigns.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-600">
              {searchTerm
                ? "No campaigns found matching your search."
                : "No campaigns found."}
            </p>
            {(userProfile?.role === "super_admin" || userProfile?.role === "admin") && !searchTerm && (
              <Button
                className="mt-4 hover:opacity-90"
                style={{ backgroundColor: "#3e8692", color: "white" }}
                onClick={() => setIsNewCampaignOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Campaign
              </Button>
            )}
          </div>
        ) : (
          filteredCampaigns.map((campaign) => (
            <Card key={campaign.id} className="transition-shadow group h-full flex flex-col">
              <CardHeader className="pb-4">
                <div className="mb-3">
                  <div className="flex items-center justify-between text-lg font-semibold text-gray-600 mb-2">
                    <div className="flex items-center">
                      <div className="bg-gray-100 p-1.5 rounded-lg mr-2">
                        <Megaphone className="h-5 w-5 text-gray-600" />
                      </div>
                      {campaign.name}
                    </div>
                    <Badge
                      variant={getStatusVariant(campaign.status)}
                      className="text-xs"
                      style={campaign.status === "Active" ? { backgroundColor: "#3e8692", color: "white", borderColor: "#3e8692" } : {}}
                    >
                      {campaign.status}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center text-sm text-gray-600">
                    <Building2 className="h-4 w-4 mr-2 text-gray-600" />
                    <span className="text-gray-600">{campaign.client_name}</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <DollarSign className="h-4 w-4 mr-2 text-gray-600" />
                    <span className="text-gray-600">{CampaignService.formatCurrency(campaign.total_budget)}</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <CalendarIcon className="h-4 w-4 mr-2 text-gray-600" />
                    <span className="text-gray-600">{formatDate(campaign.start_date)}{campaign.end_date ? ` - ${formatDate(campaign.end_date)}` : ' - TBD'}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4 border-t border-gray-100 flex flex-col flex-1">
                <div className="mb-3">
                  <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                    <span>Campaign Progress</span>
                    <span className="bg-gray-100 px-2 py-1 rounded-md text-gray-600 font-medium">
                      {(() => {
                        const counts = contentCounts[campaign.id];
                        if (!counts || counts.total === 0) return '0%';
                        const percentage = Math.round((counts.posted / counts.total) * 100);
                        return `${percentage}%`;
                      })()}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {(() => {
                      const counts = contentCounts[campaign.id];
                      if (!counts || counts.total === 0) return 'No content yet';
                      return `${counts.posted} of ${counts.total} content posted`;
                    })()}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-auto"
                  onClick={() => {
                    console.log('Campaign clicked:', campaign.id, campaign);
                    if (!campaign.id) {
                      console.error('Campaign ID is missing!', campaign);
                      return;
                    }
                    // Use slug for shorter URL if available
                    router.push(`/campaigns/${campaign.slug || campaign.id}`);
                  }}
                >
                  View Campaign
                </Button>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleShareCampaign(campaign)}
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    Share
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                    onClick={() => handleArchiveCampaign(campaign)}
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    Archive
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
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
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
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
                  <span>{sharingCampaign ? new Date(sharingCampaign.start_date).toLocaleDateString() : ''}{sharingCampaign?.end_date ? ` - ${new Date(sharingCampaign.end_date).toLocaleDateString()}` : ' - TBD'}</span>
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
                <p className="text-xs text-blue-600 mt-2">Use the client's email address as the password to access the public campaign view</p>
              </div>
            </div>
            <div className="space-y-2">
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="share-campaign-link">Share Link</Label>
              <div className="flex gap-2">
                <Input
                  id="share-campaign-link"
                  value={`${typeof window !== 'undefined' ? window.location.origin : ''}/public/campaigns/${sharingCampaign?.slug || sharingCampaign?.id}`}
                  readOnly
                  className="flex-1 auth-input"
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
          <DialogFooter>
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
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-5 w-5" />
              Archive Campaign
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to archive <span className="font-semibold">{archivingCampaign?.name}</span>?
              The campaign will be moved to the archive and can be restored later.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800">
              <p>This will:</p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Hide the campaign from the main campaigns list</li>
                <li>Keep all campaign data intact</li>
                <li>Allow restoration from the Archive page</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsArchiveDialogOpen(false)} disabled={isArchiving}>
              Cancel
            </Button>
            <Button
              onClick={confirmArchiveCampaign}
              disabled={isArchiving}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {isArchiving ? "Archiving..." : "Archive Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 