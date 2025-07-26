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
import { Search, Plus, Megaphone, Building2, DollarSign, Calendar as CalendarIcon, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ClientService, ClientWithAccess } from "@/lib/clientService";
import { CampaignService, CampaignWithDetails } from "@/lib/campaignService";
import { useSearchParams, useRouter } from 'next/navigation';
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";

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
  const [availableClients, setAvailableClients] = useState<ClientWithAccess[]>([]);
  // In newCampaign state, add region, clientChoosingKols, multiActivation, intro_call, intro_call_date, budgetAllocations
  const [newCampaign, setNewCampaign] = useState({
    client_id: "",
    name: "",
    total_budget: "",
    status: "Planning" as const,
    start_date: "",
    end_date: "",
    description: "",
    region: "apac",
    clientChoosingKols: false,
    multiActivation: false,
    intro_call: false,
    intro_call_date: undefined as string | undefined,
    budgetAllocations: [] as { region: string; amount: string }[],
  });

  const router = useRouter();

  useEffect(() => {
    fetchCampaigns();
  }, [user?.id, userProfile?.role]);

  useEffect(() => {
    if (isNewCampaignOpen && user?.id && userProfile?.role) {
      fetchAvailableClients();
    }
  }, [isNewCampaignOpen, user?.id, userProfile?.role]);

  // Open dialog if add=1 is present
  useEffect(() => {
    if (addParam === '1' && userProfile?.role === 'admin') {
      setIsNewCampaignOpen(true);
      if (clientIdParam) {
        setNewCampaign((prev) => ({ ...prev, client_id: clientIdParam }));
      }
    }
  }, [addParam, clientIdParam, userProfile?.role]);

  const fetchAvailableClients = async () => {
    try {
      const clients = await ClientService.getClientsForUser(userProfile!.role as 'admin' | 'member' | 'client', user!.id);
      setAvailableClients(clients);
    } catch (err) {
      console.error("Error fetching clients:", err);
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaign.client_id || !newCampaign.name.trim() || !newCampaign.total_budget || !newCampaign.start_date || !newCampaign.end_date) return;
    try {
      setIsSubmittingCampaign(true);
      const campaign = await CampaignService.createCampaign({
        client_id: newCampaign.client_id,
        name: newCampaign.name.trim(),
        total_budget: parseFloat(newCampaign.total_budget),
        status: newCampaign.status,
        start_date: newCampaign.start_date,
        end_date: newCampaign.end_date,
        description: newCampaign.description.trim() || undefined,
        region: newCampaign.region,
        client_choosing_kols: newCampaign.clientChoosingKols,
        multi_activation: newCampaign.multiActivation,
        intro_call: newCampaign.intro_call,
        intro_call_date: newCampaign.intro_call_date || null,
      });
      setNewCampaign({
        client_id: "",
        name: "",
        total_budget: "",
        status: "Planning" as const,
        start_date: "",
        end_date: "",
        description: "",
        region: "apac",
        clientChoosingKols: false,
        multiActivation: false,
        intro_call: false,
        intro_call_date: undefined,
        budgetAllocations: [],
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
    <Card className="hover:shadow-md transition-shadow">
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
      <CardContent className="pt-4 border-t border-gray-100">
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
        <Skeleton className="h-8 w-full rounded" />
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
          {userProfile?.role === "admin" && (
            <Button className="hover:opacity-90" style={{ backgroundColor: "#3e8692", color: "white" }}>
              <Plus className="h-4 w-4 mr-2" />
              New Campaign
            </Button>
          )}
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
        <div className="grid gap-4">
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
        {userProfile?.role === "admin" && (
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
                    <Label htmlFor="client">Client</Label>
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
                  <div className="grid gap-2">
                    <Label htmlFor="campaign-name">Campaign Name</Label>
                    <Input
                      id="campaign-name"
                      value={newCampaign.name}
                      onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                      placeholder="Enter campaign name"
                      className="auth-input"
                      required
                    />
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
                      <Label htmlFor="start-date">Start Date</Label>
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
                    <Label htmlFor="description">Description (Optional)</Label>
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
                    <Label htmlFor="totalBudget">Budget</Label>
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
                    <Label>Budget Allocation</Label>
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
                    disabled={isSubmittingCampaign || !newCampaign.client_id || !newCampaign.name.trim() || !newCampaign.total_budget || !newCampaign.start_date || !newCampaign.end_date}
                    className="hover:opacity-90"
                    style={{ backgroundColor: "#3e8692", color: "white" }}
                  >
                    {isSubmittingCampaign ? "Creating..." : "Create Campaign"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
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
      <div className="grid gap-4">
        {filteredCampaigns.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-600">
              {searchTerm
                ? "No campaigns found matching your search."
                : "No campaigns found."}
            </p>
            {userProfile?.role === "admin" && !searchTerm && (
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
            <Card key={campaign.id} className="transition-shadow group">
              <CardHeader className="pb-4">
                <div className="mb-3">
                  <div className="flex items-center justify-between text-lg font-semibold text-gray-600 mb-2">
                    <div className="flex items-center">
                      <div className="bg-gray-100 p-1.5 rounded-lg mr-2">
                        <Megaphone className="h-5 w-5 text-gray-600" />
                      </div>
                      {campaign.name}
                    </div>
                  </div>
                  <Badge
                    variant={getStatusVariant(campaign.status)}
                    className="text-xs"
                    style={campaign.status === "Active" ? { backgroundColor: "#3e8692", color: "white", borderColor: "#3e8692" } : {}}
                  >
                    {campaign.status}
                  </Badge>
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
                    <span className="text-gray-600">{formatDate(campaign.start_date)} - {formatDate(campaign.end_date)}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
                  <span>Budget Utilized</span>
                  <span className="bg-gray-100 px-2 py-1 rounded-md text-gray-600 font-medium">
                    {CampaignService.calculateBudgetUtilization(campaign.total_budget, campaign.total_allocated || 0)}%
                  </span>
                </div>
                {campaign.budget_allocations && campaign.budget_allocations.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-600 mb-2">Regional Allocations:</p>
                    <div className="flex flex-wrap gap-1">
                      {campaign.budget_allocations.map((allocation) => (
                        <span
                          key={allocation.id}
                          className="text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-700"
                        >
                          {allocation.region}: {CampaignService.formatCurrency(allocation.allocated_budget)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => router.push(`/campaigns/${campaign.id}`)}
                >
                  View Campaign
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
} 