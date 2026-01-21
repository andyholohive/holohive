'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { ClientService, ClientWithAccess } from '@/lib/clientService';
import { UserService } from '@/lib/userService';
import { supabase } from '@/lib/supabase';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, Edit, Building2, Mail, MapPin, Calendar as CalendarIcon, Trash2, CheckCircle, FileText, PauseCircle, BadgeCheck, Link as LinkIcon, ExternalLink, Copy, Share2, Upload, X, Image as ImageIcon } from 'lucide-react';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { useRouter, useSearchParams } from 'next/navigation';
import { KOLService } from '@/lib/kolService';
import { CampaignService } from '@/lib/campaignService';
import { CRMService, CRMOpportunity } from '@/lib/crmService';

type CampaignStatus = 'Planning' | 'Active' | 'Paused' | 'Completed';
type ClientWithStatus = ClientWithAccess & {
  campaignsByStatus?: Record<CampaignStatus, number>;
};

export default function ClientsPage() {
  const { user, userProfile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const partnerIdParam = searchParams.get('partnerId');
  const [clients, setClients] = useState<ClientWithAccess[]>([]);
  const [clientsWithStatus, setClientsWithStatus] = useState<ClientWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isNewClientOpen, setIsNewClientOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientWithAccess | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<ClientWithAccess | null>(null);
  const [isStartClientOpen, setIsStartClientOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allClients, setAllClients] = useState<ClientWithAccess[]>([]);
  const [allPartners, setAllPartners] = useState<any[]>([]);
  const [filteredPartnerName, setFilteredPartnerName] = useState<string | null>(null);
  const [linkedAccounts, setLinkedAccounts] = useState<Record<string, CRMOpportunity[]>>({});
  const [isSharePortalOpen, setIsSharePortalOpen] = useState(false);
  const [clientToShare, setClientToShare] = useState<ClientWithAccess | null>(null);
  // New client form state
  const [newClient, setNewClient] = useState({
    name: '',
    email: '',
    location: '',
    is_active: true,
    source: 'Inbound',
    onboarding_call_held: false,
    onboarding_call_date: undefined as Date | undefined,
    is_whitelisted: false,
    whitelist_partner_id: null as string | null,
    logo_url: null as string | null,
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  // Start client form state
  const [startClientForm, setStartClientForm] = useState({
    companyName: '',
    isRenewingClient: false,
    selectedExistingClient: '',
    email: '',
    location: '',
    source: 'Inbound',
    campaignName: '',
    campaignManager: '',
    startDate: undefined as Date | undefined,
    endDate: undefined as Date | undefined,
    region: 'apac',
    clientChoosingKols: false,
    multiActivation: false,
    totalBudget: '',
    callHeld: false,
    callDate: undefined as Date | undefined,
    proposalSent: false,
    ndaSigned: false,
    budgetType: [] as string[],
    callSupport: false,
    supportingMembers: [] as string[],
    budgetAllocations: [] as { region: string; amount: string }[],
    intro_call: false,
    intro_call_date: undefined as Date | undefined,
  });
  const [startClientStep, setStartClientStep] = useState(0);
  // Update the step order so onboarding comes before campaign details
  const startClientSections = [
    'Client Details',
    'Onboarding',
    'Campaign Details',
    'Contracting Status',
    'Support & Follow-Up'
  ];
  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };
  const isStepValid = () => {
    if (startClientStep === 0) {
      if (startClientForm.isRenewingClient) {
        return !!startClientForm.selectedExistingClient;
      } else {
        return (
          !!startClientForm.companyName.trim() &&
          !!startClientForm.email.trim() &&
          isValidEmail(startClientForm.email) &&
          !!startClientForm.source
        );
      }
    }
    if (startClientStep === 1) {
      // Onboarding step: only require call date if callHeld is checked
      if (startClientForm.callHeld) {
        return !!startClientForm.callDate;
      }
      return true;
    }
    if (startClientStep === 2) {
      // Campaign Details step: require all campaign fields except end date
      return (
        !!startClientForm.campaignName.trim() &&
        !!startClientForm.campaignManager &&
        !!startClientForm.startDate &&
        !!startClientForm.region &&
        !!startClientForm.totalBudget
      );
    }
    return true;
  };

  const openSharePortal = (client: ClientWithAccess) => {
    setClientToShare(client);
    setIsSharePortalOpen(true);
  };

  const copyPortalLink = () => {
    if (!clientToShare) return;
    const portalUrl = `${window.location.origin}/public/portal/${clientToShare.slug || clientToShare.id}`;
    navigator.clipboard.writeText(portalUrl);
    toast({
      title: 'Link Copied',
      description: 'Portal link has been copied to clipboard',
    });
  };

  const [isStartClientSubmitting, setIsStartClientSubmitting] = useState(false);
  const [startClientError, setStartClientError] = useState<string | null>(null);
  useEffect(() => {
    fetchClients();
    if (userProfile?.role === 'admin' || userProfile?.role === 'super_admin') {
      UserService.getAllUsers().then(setAllUsers);
    }
    fetchPartners();
  }, [user?.id, userProfile?.role]);

  // Handle partner filtering
  useEffect(() => {
    if (partnerIdParam) {
      const partner = allPartners.find(p => p.id === partnerIdParam);
      setFilteredPartnerName(partner?.name || null);
    } else {
      setFilteredPartnerName(null);
    }
  }, [partnerIdParam, allPartners]);
  const fetchPartners = async () => {
    try {
      const { data, error } = await supabase
        .from('partners')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setAllPartners(data || []);
    } catch (err) {
      console.error('Error fetching partners:', err);
    }
  };

  const fetchClients = async () => {
    if (!user?.id || !userProfile?.role) return;
    try {
      setLoading(true);
      setError(null);
      const fetchedClients = await ClientService.getClientsForUser(
        userProfile.role as 'admin' | 'member' | 'client',
        user.id
      );

      setClients(fetchedClients);
      // Fetch campaigns for all clients and compute status breakdown
      const clientIds = fetchedClients.map(c => c.id);
      const allCampaigns: any[] = await CampaignService.getCampaignsByClientIds(clientIds);
      const statusMap: Record<string, Record<CampaignStatus, number>> = {};
      for (const client of fetchedClients) {
        statusMap[client.id] = { Planning: 0, Active: 0, Paused: 0, Completed: 0 };
      }
      for (const campaign of allCampaigns) {
        if (statusMap[campaign.client_id]) {
          statusMap[campaign.client_id][campaign.status as CampaignStatus]++;
        }
      }
      setClientsWithStatus(
        fetchedClients.map(client => ({
          ...client,
          campaignsByStatus: statusMap[client.id],
        }))
      );

      // Fetch linked accounts (opportunities with client_id)
      const allOpportunities = await CRMService.getAllOpportunities();
      const accountsMap: Record<string, CRMOpportunity[]> = {};
      for (const opp of allOpportunities) {
        if (opp.client_id) {
          if (!accountsMap[opp.client_id]) {
            accountsMap[opp.client_id] = [];
          }
          accountsMap[opp.client_id].push(opp);
        }
      }
      setLinkedAccounts(accountsMap);
    } catch (err) {
      setError('Failed to load clients');
    } finally {
      setLoading(false);
    }
  };
  const filteredClients = clientsWithStatus.filter(client => {
    const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (client.location && client.location.toLowerCase().includes(searchTerm.toLowerCase()));
    
    let matchesPartner = true;
    if (partnerIdParam) {
      matchesPartner = client.is_whitelisted === true && client.whitelist_partner_id === partnerIdParam;
    }
    
    return matchesSearch && matchesPartner;
  });
  const handleEditClient = (client: ClientWithAccess) => {
    setEditingClient(client);
    setNewClient({
      name: client.name,
      email: client.email,
      location: client.location || '',
      is_active: client.is_active,
      source: client.source || 'Inbound',
      onboarding_call_held: client.onboarding_call_held || false,
      onboarding_call_date: client.onboarding_call_date ? new Date(client.onboarding_call_date) : undefined,
      is_whitelisted: client.is_whitelisted || false,
      whitelist_partner_id: client.whitelist_partner_id,
      logo_url: (client as any).logo_url || null,
    });
    setLogoPreview((client as any).logo_url || null);
    setLogoFile(null);
    setIsEditMode(true);
    setIsNewClientOpen(true);
  };
  const handleCloseClientModal = () => {
    setIsNewClientOpen(false);
    setIsEditMode(false);
    setEditingClient(null);
    setLogoFile(null);
    setLogoPreview(null);
    setNewClient({
      name: '',
      email: '',
      location: '',
      is_active: true,
      source: 'Inbound',
      onboarding_call_held: false,
      onboarding_call_date: undefined,
      is_whitelisted: false,
      whitelist_partner_id: null,
      logo_url: null,
    });
  };
  const handleDeleteClient = (client: ClientWithAccess) => {
    setClientToDelete(client);
    setIsDeleteDialogOpen(true);
  };
  const confirmDeleteClient = async () => {
    if (!clientToDelete) return;

    try {
      // Soft delete - set archived_at timestamp
      const { error } = await supabase
        .from('clients')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', clientToDelete.id);

      if (error) throw error;
      await fetchClients();
    } catch (err) {
      console.error('Error archiving client:', err);
      setError('Failed to archive client');
    } finally {
      setIsDeleteDialogOpen(false);
      setClientToDelete(null);
    }
  };
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: 'Invalid file type',
          description: 'Please upload an image file (PNG, JPG, etc.)',
          variant: 'destructive',
        });
        return;
      }
      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: 'Please upload an image smaller than 2MB',
          variant: 'destructive',
        });
        return;
      }
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const uploadLogo = async (clientId: string): Promise<string | null> => {
    if (!logoFile) return newClient.logo_url;

    try {
      setUploadingLogo(true);
      const fileExt = logoFile.name.split('.').pop();
      const fileName = `${clientId}/logo-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('client-logos')
        .upload(fileName, logoFile, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('client-logos')
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast({
        title: 'Upload failed',
        description: 'Failed to upload logo. Please try again.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setUploadingLogo(false);
    }
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    setNewClient({ ...newClient, logo_url: null });
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClient.name.trim() || !newClient.email.trim()) return;
    try {
      setIsSubmitting(true);
      if (isEditMode && editingClient) {
        // Upload logo first if there's a new file
        let logoUrl = newClient.logo_url;
        if (logoFile) {
          logoUrl = await uploadLogo(editingClient.id);
        }

        await ClientService.updateClient(editingClient.id, {
          name: newClient.name.trim(),
          email: newClient.email.trim(),
          location: newClient.location.trim() || undefined,
          is_active: newClient.is_active,
          is_whitelisted: newClient.is_whitelisted,
          whitelist_partner_id: newClient.whitelist_partner_id,
          logo_url: logoUrl,
        });
      } else {
        const client = await ClientService.createClient(
          newClient.name.trim(),
          newClient.email.trim(),
          newClient.location.trim() || undefined,
          newClient.source,
          newClient.onboarding_call_held,
          newClient.onboarding_call_date ? newClient.onboarding_call_date.toISOString().split('T')[0] : null,
          newClient.is_whitelisted,
          newClient.whitelist_partner_id
        );

        // Upload logo after client is created
        if (logoFile && client) {
          const logoUrl = await uploadLogo(client.id);
          if (logoUrl) {
            await ClientService.updateClient(client.id, { logo_url: logoUrl });
          }
        }
      }
      handleCloseClientModal();
      await fetchClients();
    } catch (err) {
      // Optionally add a toast notification here
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleStartClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsStartClientSubmitting(true);
    setStartClientError(null);
    try {
      let clientId = '';
      if (startClientForm.isRenewingClient) {
        clientId = startClientForm.selectedExistingClient;
      } else {
        const client = await ClientService.createClient(
          startClientForm.companyName.trim(),
          startClientForm.email.trim(),
          startClientForm.location.trim() || undefined
        );
        clientId = client.id;
      }
      const accessUserIds = [
        startClientForm.campaignManager,
        ...startClientForm.supportingMembers.filter(id => id && id !== startClientForm.campaignManager),
      ];
      await Promise.all(accessUserIds.map((userId) =>
        userId ? ClientService.grantClientAccess(clientId, userId) : Promise.resolve()
      ));
      const campaign = await CampaignService.createCampaign({
        client_id: clientId,
        name: startClientForm.campaignName.trim(),
        total_budget: parseFloat(startClientForm.totalBudget),
        status: 'Planning',
        start_date: startClientForm.startDate?.toISOString().split('T')[0] || '',
        end_date: startClientForm.endDate?.toISOString().split('T')[0] || '',
        description: undefined,
        intro_call: startClientForm.intro_call,
        intro_call_date: startClientForm.intro_call_date ? startClientForm.intro_call_date.toISOString().split('T')[0] : null,
        manager: startClientForm.campaignManager || null,
        call_support: startClientForm.callSupport,
        client_choosing_kols: startClientForm.clientChoosingKols,
        multi_activation: startClientForm.multiActivation,
        proposal_sent: startClientForm.proposalSent,
        nda_signed: startClientForm.ndaSigned,
        budget_type: startClientForm.budgetType,
        region: startClientForm.region,
      });
      await Promise.all(
        (startClientForm.budgetAllocations || [])
          .filter(a => a.region && a.amount)
          .map((alloc) =>
            CampaignService.addBudgetAllocation(campaign.id, alloc.region, parseFloat(alloc.amount))
          )
      );
      setIsStartClientOpen(false);
      setStartClientStep(0);
      setStartClientForm({
        companyName: '',
        isRenewingClient: false,
        selectedExistingClient: '',
        email: '',
        location: '',
        source: 'Inbound',
        campaignName: '',
        campaignManager: '',
        startDate: undefined,
        endDate: undefined,
        region: 'apac',
        clientChoosingKols: false,
        multiActivation: false,
        totalBudget: '',
        callHeld: false,
        callDate: undefined,
        proposalSent: false,
        ndaSigned: false,
        budgetType: [],
        callSupport: false,
        supportingMembers: [],
        budgetAllocations: [],
        intro_call: false,
        intro_call_date: undefined,
      });
      await fetchClients();
    } catch (err: any) {
      setStartClientError(err?.message || 'Failed to start client onboarding.');
    } finally {
      setIsStartClientSubmitting(false);
    }
  };
  const ClientCardSkeleton = () => (
    <Card className="transition-shadow">
      <CardHeader className="pb-4">
        <div className="mb-3">
          <div className="flex items-center justify-between text-lg font-semibold text-gray-600 mb-2">
            <div className="flex items-center">
            <Skeleton className="h-8 w-8 rounded-lg mr-2" />
            <Skeleton className="h-5 w-40" />
            </div>
            <Skeleton className="h-6 w-6 rounded" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <div className="space-y-2">
          <div className="flex items-center text-sm text-gray-600">
            <Skeleton className="h-4 w-4 mr-2" />
            <Skeleton className="h-4 w-36" />
          </div>
          <div className="flex items-center text-sm text-gray-600 min-h-[20px]">
            <Skeleton className="h-4 w-4 mr-2" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex flex-col gap-1 mb-3">
          {['Active', 'Planning', 'Paused', 'Completed'].map((status) => (
            <div key={status} className="flex items-center justify-between text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-7 w-7 rounded-md" />
            </div>
          ))}
        </div>
        <div className="flex gap-2">
        <Skeleton className="h-8 w-full rounded" />
          <Skeleton className="h-8 w-full rounded" />
        </div>
      </CardContent>
    </Card>
  );
  const regionOptions = KOLService.getFieldOptions().regions;
  if (loading) {
    return (
      <ProtectedRoute>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Clients</h2>
              <p className="text-gray-600">Manage your client relationships</p>
            </div>
            {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && (
              <div className="flex space-x-3">
                <Button className="hover:opacity-90" style={{ backgroundColor: '#3e8692', color: 'white' }} disabled>
                  <Plus className="h-4 w-4 mr-2" />
                  Start Client
                </Button>
                <Button variant="outline" className="hover:bg-gray-50" disabled>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Client
                </Button>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input placeholder="Search clients by name, email, or location..." className="pl-10 auth-input" disabled />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <ClientCardSkeleton key={index} />
            ))}
          </div>
        </div>
      </ProtectedRoute>
    );
  }
  if (error) {
    return (
      <ProtectedRoute>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Clients</h2>
              <p className="text-gray-600">Manage your client relationships</p>
            </div>
          </div>
          <div className="text-center py-8">
            <p className="text-red-600">{error}</p>
            <Button onClick={fetchClients} className="mt-4 hover:opacity-90" style={{ backgroundColor: '#3e8692', color: 'white' }}>
              Retry
            </Button>
          </div>
        </div>
      </ProtectedRoute>
    );
  }
  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {filteredPartnerName ? `Clients - ${filteredPartnerName}` : 'Clients'}
            </h2>
            <p className="text-gray-600">Manage your client relationships</p>
            {filteredPartnerName && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => router.push('/clients')}
                className="text-sm mt-2"
              >
                Clear Filter
              </Button>
            )}
          </div>
          {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && (
            <div className="flex space-x-3">
              <Dialog open={isStartClientOpen} onOpenChange={setIsStartClientOpen}>
                <DialogTrigger asChild>
                  <Button className="hover:opacity-90" style={{ backgroundColor: '#3e8692', color: 'white' }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Start Client
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-hidden">
                  <DialogHeader>
                    <DialogTitle>Start Client Onboarding</DialogTitle>
                    <DialogDescription>
                      Complete client onboarding and campaign setup in one workflow.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-6 max-h-[60vh] overflow-y-auto px-3 pb-6">
                    {/* Step Indicator */}
                    <div className="flex items-center justify-center mb-4 gap-2">
                      {startClientSections.map((label, idx) => (
                        <div key={label} className={`px-3 py-1 rounded-full text-xs font-medium ${idx === startClientStep ? 'bg-[#3e8692] text-white' : 'bg-gray-200 text-gray-600'}`}>{label}</div>
                      ))}
                    </div>
                    {/* Section rendering */}
                    {startClientStep === 0 && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Section 1: Client Details</h3>
                        <div className="grid gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="companyName">
                              Company Name {!startClientForm.isRenewingClient && <span className="text-red-500">*</span>}
                            </Label>
                            <Input
                              id="companyName"
                              value={startClientForm.companyName}
                              onChange={(e) => setStartClientForm({ ...startClientForm, companyName: e.target.value })}
                              placeholder="Enter company name"
                              className="auth-input"
                              disabled={startClientForm.isRenewingClient}
                            />
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="renewingClient"
                              checked={startClientForm.isRenewingClient}
                              onCheckedChange={(checked) => {
                                setStartClientForm({
                                  ...startClientForm,
                                  isRenewingClient: checked as boolean,
                                  companyName: checked ? '' : startClientForm.companyName,
                                  email: checked ? '' : startClientForm.email,
                                  location: checked ? '' : startClientForm.location,
                                  source: checked ? 'Renewal' : startClientForm.source
                                });
                              }}
                            />
                            <Label htmlFor="renewingClient" className="text-sm">Renewing Client</Label>
                          </div>
                          {startClientForm.isRenewingClient && (
                            <div className="grid gap-2">
                              <Label htmlFor="existingClient">
                                Select Existing Client <span className="text-red-500">*</span>
                              </Label>
                              <Select value={startClientForm.selectedExistingClient} onValueChange={(value) => {
                                const selectedClient = clients.find(c => c.id === value);
                                if (selectedClient) {
                                  setStartClientForm({
                                    ...startClientForm,
                                    selectedExistingClient: value,
                                    companyName: selectedClient.name,
                                    email: selectedClient.email,
                                    location: selectedClient.location || '',
                                    source: 'Renewal'
                                  });
                                }
                              }}>
                                <SelectTrigger className="auth-input">
                                  <SelectValue placeholder="Select existing client" />
                                </SelectTrigger>
                                <SelectContent>
                                  {clients.map((client) => (
                                    <SelectItem key={client.id} value={client.id}>
                                      {client.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          <div className="grid gap-2">
                            <Label htmlFor="email">
                              Email {!startClientForm.isRenewingClient && <span className="text-red-500">*</span>}
                            </Label>
                            <Input
                              id="email"
                              type="email"
                              value={startClientForm.email}
                              onChange={(e) => setStartClientForm({ ...startClientForm, email: e.target.value })}
                              placeholder="Enter email address"
                              className="auth-input"
                              disabled={startClientForm.isRenewingClient}
                            />
                            {/* Email format error message */}
                            {startClientForm.email && !isValidEmail(startClientForm.email) && (
                              <span className="text-xs text-red-600">Please enter a valid email address.</span>
                            )}
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="location">Location</Label>
                            <Input
                              id="location"
                              value={startClientForm.location}
                              onChange={(e) => setStartClientForm({ ...startClientForm, location: e.target.value })}
                              placeholder="Enter location"
                              className="auth-input"
                              disabled={startClientForm.isRenewingClient}
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="source">
                              Source {!startClientForm.isRenewingClient && <span className="text-red-500">*</span>}
                            </Label>
                            <Select value={startClientForm.source} onValueChange={(value) => setStartClientForm({ ...startClientForm, source: value })} disabled={startClientForm.isRenewingClient}>
                              <SelectTrigger className="auth-input" disabled={startClientForm.isRenewingClient}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Inbound">Inbound</SelectItem>
                                <SelectItem value="Outbound">Outbound</SelectItem>
                                <SelectItem value="Referral">Referral</SelectItem>
                                <SelectItem value="Renewal">Renewal</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    )}
                    {startClientStep === 1 && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Section 2: Onboarding</h3>
                        <div className="grid gap-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="callHeld"
                              checked={startClientForm.callHeld}
                              onCheckedChange={(checked) => setStartClientForm({
                                ...startClientForm,
                                callHeld: checked as boolean,
                                callDate: checked ? startClientForm.callDate : undefined
                              })}
                            />
                            <Label htmlFor="callHeld" className="text-sm">Call Held?</Label>
                          </div>
                          {startClientForm.callHeld && (
                            <div className="grid gap-2">
                              <Label htmlFor="callDate">
                                Call Date <span className="text-red-500">*</span>
                              </Label>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    className="auth-input justify-start text-left font-normal focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692]"
                                    style={{
                                      borderColor: '#e5e7eb',
                                      backgroundColor: 'white',
                                      color: startClientForm.callDate ? '#111827' : '#9ca3af'
                                    }}
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {startClientForm.callDate ? startClientForm.callDate.toLocaleDateString() : 'Select call date'}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={startClientForm.callDate}
                                    onSelect={(date) => setStartClientForm({ ...startClientForm, callDate: date || undefined })}
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
                        </div>
                      </div>
                    )}
                    {startClientStep === 2 && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Section 3: Campaign Details</h3>
                        <div className="grid gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="campaignName">
                              Campaign Name <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              id="campaignName"
                              value={startClientForm.campaignName}
                              onChange={(e) => setStartClientForm({ ...startClientForm, campaignName: e.target.value })}
                              placeholder="Enter campaign name"
                              className="auth-input"
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="campaignManager">
                              Campaign Manager <span className="text-red-500">*</span>
                            </Label>
                            <Select value={startClientForm.campaignManager} onValueChange={(value) => setStartClientForm({ ...startClientForm, campaignManager: value })}>
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
                              <Label htmlFor="startDate">
                                Start Date <span className="text-red-500">*</span>
                              </Label>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    className="auth-input justify-start text-left font-normal focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692]"
                                    style={{
                                      borderColor: '#e5e7eb',
                                      backgroundColor: 'white',
                                      color: startClientForm.startDate ? '#111827' : '#9ca3af'
                                    }}
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {startClientForm.startDate ? startClientForm.startDate.toLocaleDateString() : 'Select start date'}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={startClientForm.startDate}
                                    onSelect={(date) => setStartClientForm({ ...startClientForm, startDate: date || undefined })}
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
                            <div className="grid gap-2">
                              <Label htmlFor="endDate">End Date</Label>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    className="auth-input justify-start text-left font-normal focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692]"
                                    style={{
                                      borderColor: '#e5e7eb',
                                      backgroundColor: 'white',
                                      color: startClientForm.endDate ? '#111827' : '#9ca3af'
                                    }}
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {startClientForm.endDate ? startClientForm.endDate.toLocaleDateString() : 'Select end date'}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={startClientForm.endDate}
                                    onSelect={(date) => setStartClientForm({ ...startClientForm, endDate: date || undefined })}
                                    disabled={(date) => startClientForm.startDate ? date < startClientForm.startDate : false}
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
                          </div>
                          {/* Moved from old Section 5: Campaign Details 2 */}
                          <div className="grid gap-2">
                            <Label htmlFor="region">
                              Region <span className="text-red-500">*</span>
                            </Label>
                            <Select value={startClientForm.region} onValueChange={(value) => {
                              setStartClientForm({
                                ...startClientForm,
                                region: value,
                                clientChoosingKols: value === 'global'
                              });
                            }}>
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
                              checked={startClientForm.clientChoosingKols}
                              onCheckedChange={(checked) => setStartClientForm({ ...startClientForm, clientChoosingKols: checked as boolean })}
                            />
                            <Label htmlFor="clientChoosingKols" className="text-sm">Is Client Choosing the KOLs?</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="multiActivation"
                              checked={startClientForm.multiActivation}
                              onCheckedChange={(checked) => setStartClientForm({ ...startClientForm, multiActivation: checked as boolean })}
                            />
                            <Label htmlFor="multiActivation" className="text-sm">Multi-Activation Campaign</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="intro_call"
                              checked={startClientForm.intro_call}
                              onCheckedChange={(checked) => setStartClientForm({ ...startClientForm, intro_call: checked as boolean })}
                            />
                            <Label htmlFor="intro_call" className="text-sm">Intro call held?</Label>
                          </div>
                          {startClientForm.intro_call && (
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
                                      color: startClientForm.intro_call_date ? '#111827' : '#9ca3af'
                                    }}
                                  >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {startClientForm.intro_call_date ? startClientForm.intro_call_date.toLocaleDateString() : 'Select intro call date'}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={startClientForm.intro_call_date}
                                    onSelect={(date) => setStartClientForm({ ...startClientForm, intro_call_date: date || undefined })}
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
                          <div className="grid gap-2">
                            <Label htmlFor="totalBudget">
                              Budget <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              id="totalBudget"
                              type="number"
                              value={startClientForm.totalBudget}
                              onChange={(e) => {
                                const budget = e.target.value;
                                setStartClientForm({
                                  ...startClientForm,
                                  totalBudget: budget,
                                  callSupport: budget ? parseInt(budget) >= 10000 : false
                                });
                              }}
                              placeholder="Enter total budget"
                              className="auth-input"
                            />
                          </div>
                         {/* Campaign Budget Allocation Section */}
                         <div className="grid gap-2">
                           <Label>Budget Allocation</Label>
                           <div className="bg-gray-50 border rounded p-3 text-sm text-gray-700 space-y-2">
                             {startClientForm.budgetAllocations.length === 0 && (
                               <div className="text-gray-400 text-sm">No allocations yet.</div>
                             )}
                             {startClientForm.budgetAllocations.map((alloc, idx) => {
                               // Format the amount with commas for display
                               const formattedAmount = alloc.amount
                                 ? Number(alloc.amount.replace(/,/g, '')).toLocaleString('en-US')
                                 : '';
                               return (
                                 <div key={idx} className="flex items-center gap-2">
                                   <Select
                                     value={alloc.region}
                                     onValueChange={value => {
                                       const newAllocs = [...startClientForm.budgetAllocations];
                                       newAllocs[idx].region = value;
                                       setStartClientForm({ ...startClientForm, budgetAllocations: newAllocs });
                                     }}
                                   >
                                     <SelectTrigger className="w-32 auth-input">
                                       <SelectValue placeholder="Select region" />
                                     </SelectTrigger>
                                     <SelectContent>
                                       {regionOptions.map(region => (
                                         <SelectItem key={region} value={region}>{region}</SelectItem>
                                       ))}
                                     </SelectContent>
                                   </Select>
                                   <div className="relative w-28">
                                     <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">$</span>
                                     <Input
                                       type="text"
                                       inputMode="numeric"
                                       pattern="[0-9,]*"
                                       className="auth-input pl-6 w-full"
                                       placeholder="Amount"
                                       value={formattedAmount}
                                       onChange={e => {
                                         // Remove all non-digit and non-comma characters, then remove commas
                                         const raw = e.target.value.replace(/[^\d,]/g, '').replace(/,/g, '');
                                         const newAllocs = [...startClientForm.budgetAllocations];
                                         newAllocs[idx].amount = raw;
                                         setStartClientForm({ ...startClientForm, budgetAllocations: newAllocs });
                                       }}
                                     />
                                   </div>
                                   <Button
                                     type="button"
                                     variant="ghost"
                                     size="icon"
                                     className="text-red-500 hover:text-red-700"
                                     onClick={() => {
                                       setStartClientForm({
                                         ...startClientForm,
                                         budgetAllocations: startClientForm.budgetAllocations.filter((_, i) => i !== idx)
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
                               onClick={() => setStartClientForm({
                                 ...startClientForm,
                                 budgetAllocations: [
                                   ...startClientForm.budgetAllocations,
                                   { region: '', amount: '' }
                                 ]
                               })}
                             >Add Allocation</Button>
                           </div>
                         </div>
                         {/* Budget Type */}
                         <div className="grid gap-2">
                           <Label>Budget Type</Label>
                           <div className="flex space-x-4">
                             {['Token', 'Fiat', 'WL'].map((type) => (
                               <div key={type} className="flex items-center space-x-2">
                                 <Checkbox
                                   id={type}
                                   checked={startClientForm.budgetType.includes(type)}
                                   onCheckedChange={(checked) => {
                                     if (checked) {
                                       setStartClientForm({
                                         ...startClientForm,
                                         budgetType: [...startClientForm.budgetType, type]
                                       });
                                     } else {
                                       setStartClientForm({
                                         ...startClientForm,
                                         budgetType: startClientForm.budgetType.filter(t => t !== type)
                                       });
                                     }
                                   }}
                                 />
                                 <Label htmlFor={type} className="text-sm capitalize">{type}</Label>
                               </div>
                             ))}
                           </div>
                         </div>
                        </div>
                      </div>
                    )}
                    {startClientStep === 3 && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Section 4: Contracting Status</h3>
                        <div className="grid gap-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="proposalSent"
                              checked={startClientForm.proposalSent}
                              onCheckedChange={(checked) => setStartClientForm({ ...startClientForm, proposalSent: checked as boolean })}
                            />
                            <Label htmlFor="proposalSent" className="text-sm">Proposal sent?</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="ndaSigned"
                              checked={startClientForm.ndaSigned}
                              onCheckedChange={(checked) => setStartClientForm({ ...startClientForm, ndaSigned: checked as boolean })}
                            />
                            <Label htmlFor="ndaSigned" className="text-sm">NDA signed?</Label>
                          </div>
                        </div>
                      </div>
                    )}
                    {startClientStep === 4 && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Section 5: Support & Follow-Up</h3>
                        <div className="grid gap-4">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="callSupport"
                              checked={startClientForm.callSupport}
                              onCheckedChange={(checked) => setStartClientForm({ ...startClientForm, callSupport: checked as boolean })}
                            />
                            <Label htmlFor="callSupport" className="text-sm">Offering Call Support</Label>
                          </div>
                          <div className="grid gap-2">
                            <Label>Supporting Members</Label>
                            <div className="space-y-2 max-h-32 overflow-y-auto">
                              {allUsers.filter(user => user.role !== 'client' && user.id !== startClientForm.campaignManager).map((user) => (
                                <div key={user.id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`member-${user.id}`}
                                    checked={startClientForm.supportingMembers.includes(user.id)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setStartClientForm({
                                          ...startClientForm,
                                          supportingMembers: [...startClientForm.supportingMembers, user.id]
                                        });
                                      } else {
                                        setStartClientForm({
                                          ...startClientForm,
                                          supportingMembers: startClientForm.supportingMembers.filter(id => id !== user.id)
                                        });
                                      }
                                    }}
                                  />
                                  <Label htmlFor={`member-${user.id}`} className="text-sm">{user.name || user.email}</Label>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsStartClientOpen(false)}>
                        Cancel
                      </Button>
                      <div className="flex gap-2">
                        {startClientStep > 0 && (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setStartClientStep(startClientStep - 1)}
                          >
                            Previous
                          </Button>
                        )}
                        {startClientStep < startClientSections.length - 1 ? (
                          <Button
                            type="button"
                            className="hover:opacity-90"
                            style={{ backgroundColor: '#3e8692', color: 'white' }}
                            onClick={() => {
                              if (isStepValid()) {
                                setStartClientStep(startClientStep + 1);
                              }
                            }}
                            disabled={!isStepValid() || isStartClientSubmitting}
                          >
                            Next
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            className="hover:opacity-90"
                            style={{ backgroundColor: '#3e8692', color: 'white' }}
                            onClick={handleStartClientSubmit}
                            disabled={!isStepValid() || isStartClientSubmitting}
                          >
                            {isStartClientSubmitting ? 'Starting...' : 'Start Client'}
                          </Button>
                        )}
                      </div>
                    </DialogFooter>
                  {startClientError && (
                    <div className="text-red-600 text-sm mt-2">{startClientError}</div>
                  )}
                </DialogContent>
              </Dialog>
              <Dialog open={isNewClientOpen} onOpenChange={(open) => {
                if (!open) {
                  handleCloseClientModal();
                } else {
                  setIsNewClientOpen(true);
                }
              }}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="hover:bg-gray-50">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Client
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px] max-h-[80vh] overflow-hidden">
                  <DialogHeader>
                    <DialogTitle>{isEditMode ? 'Edit Client' : 'Add New Client'}</DialogTitle>
                    <DialogDescription>
                      {isEditMode ? 'Update the client information below.' : 'Create a new client to manage campaigns for.'}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateClient}>
                    <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto px-3 pb-6">
                      <div className="grid gap-2">
                        <Label htmlFor="name">Company Name</Label>
                        <Input id="name" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} placeholder="Enter company name" className="auth-input" required />
                      </div>
                      <div className="grid gap-2">
                        <Label>Company Logo</Label>
                        <div className="flex items-center gap-4">
                          {logoPreview ? (
                            <div className="relative">
                              <img
                                src={logoPreview}
                                alt="Logo preview"
                                className="h-16 w-16 object-contain rounded-lg border border-gray-200"
                              />
                              <button
                                type="button"
                                onClick={removeLogo}
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="h-16 w-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center">
                              <ImageIcon className="h-6 w-6 text-gray-400" />
                            </div>
                          )}
                          <div className="flex-1">
                            <input
                              type="file"
                              id="logo-upload"
                              accept="image/*"
                              onChange={handleLogoChange}
                              className="hidden"
                            />
                            <label
                              htmlFor="logo-upload"
                              className="inline-flex items-center px-3 py-2 text-sm border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50"
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              {logoPreview ? 'Change Logo' : 'Upload Logo'}
                            </label>
                            <p className="text-xs text-gray-500 mt-1">PNG, JPG up to 2MB</p>
                          </div>
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} placeholder="Enter email address" className="auth-input" required />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="location">Location</Label>
                        <Input id="location" value={newClient.location} onChange={(e) => setNewClient({ ...newClient, location: e.target.value })} placeholder="Enter location (optional)" className="auth-input" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="source">Source</Label>
                        <Select value={newClient.source} onValueChange={(value) => setNewClient({ ...newClient, source: value })}>
                          <SelectTrigger className="auth-input">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Inbound">Inbound</SelectItem>
                            <SelectItem value="Outbound">Outbound</SelectItem>
                            <SelectItem value="Referral">Referral</SelectItem>
                            <SelectItem value="Renewal">Renewal</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="onboarding_call_held"
                          checked={newClient.onboarding_call_held}
                          onCheckedChange={(checked) => setNewClient({ ...newClient, onboarding_call_held: checked as boolean, onboarding_call_date: checked ? newClient.onboarding_call_date : undefined })}
                        />
                        <Label htmlFor="onboarding_call_held" className="text-sm">Onboarding Call Held?</Label>
                      </div>
                      {newClient.onboarding_call_held && (
                        <div className="grid gap-2">
                          <Label htmlFor="onboarding_call_date">Onboarding Call Date</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className="auth-input justify-start text-left font-normal focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692]"
                                style={{
                                  borderColor: '#e5e7eb',
                                  backgroundColor: 'white',
                                  color: newClient.onboarding_call_date ? '#111827' : '#9ca3af'
                                }}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {newClient.onboarding_call_date ? newClient.onboarding_call_date.toLocaleDateString() : 'Select onboarding call date'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={newClient.onboarding_call_date}
                                onSelect={(date) => setNewClient({ ...newClient, onboarding_call_date: date || undefined })}
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
                      <div className="grid gap-2">
                        <Label htmlFor="client-status">Status</Label>
                        <Select value={newClient.is_active ? 'active' : 'inactive'} onValueChange={(value) => setNewClient({ ...newClient, is_active: value === 'active' })}>
                          <SelectTrigger className="auth-input">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Whitelist Status</Label>
                        <div className="flex items-center space-x-4">
                          <Checkbox
                            id="is_whitelisted"
                            checked={newClient.is_whitelisted}
                            onCheckedChange={(checked) => setNewClient({ ...newClient, is_whitelisted: !!checked })}
                          />
                          <Label htmlFor="is_whitelisted" className="text-sm">Whitelist this client</Label>
                        </div>
                        {newClient.is_whitelisted && (
                          <div className="grid gap-2 mt-2">
                            <Label htmlFor="whitelist_partner">Whitelist for Partner</Label>
                            <Select 
                              value={newClient.whitelist_partner_id || ""} 
                              onValueChange={(value) => setNewClient({ ...newClient, whitelist_partner_id: value || null })}
                            >
                              <SelectTrigger className="auth-input">
                                <SelectValue placeholder="Select partner" />
                              </SelectTrigger>
                              <SelectContent>
                                {allPartners.map((partner) => (
                                  <SelectItem key={partner.id} value={partner.id}>
                                    {partner.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={handleCloseClientModal}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isSubmitting || !newClient.name.trim() || !newClient.email.trim()} className="hover:opacity-90" style={{ backgroundColor: '#3e8692', color: 'white' }}>
                        {isSubmitting ? (isEditMode ? 'Saving...' : 'Creating...') : (isEditMode ? 'Save Client' : 'Create Client')}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>
        <div className="flex items-center space-x-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Search clients by name, email, or location..." className="pl-10 auth-input" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClients.length === 0 ? (
            <div className="col-span-full text-center py-8">
              <p className="text-gray-600">
                {searchTerm || filteredPartnerName 
                  ? 'No clients found matching your search.' 
                  : 'No clients found.'
                }
              </p>
              {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && !searchTerm && !filteredPartnerName && (
                <Button className="mt-4 hover:opacity-90" style={{ backgroundColor: '#3e8692', color: 'white' }} onClick={() => { setIsEditMode(false); setIsNewClientOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Client
                </Button>
              )}
            </div>
          ) : (
            filteredClients.map((client) => {
              const clientWithStatus = client as ClientWithStatus;
              return (
                <Card key={client.id} className="transition-shadow group">
                  <CardHeader className="pb-4">
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-lg font-semibold text-gray-600 mb-2">
                        <div className="flex items-center gap-2">
                          {(client as any).logo_url ? (
                            <img
                              src={(client as any).logo_url}
                              alt={client.name}
                              className="h-8 w-8 object-contain rounded-lg"
                            />
                          ) : (
                            <div className="bg-gray-100 p-1.5 rounded-lg">
                              <Building2 className="h-5 w-5 text-gray-600" />
                            </div>
                          )}
                          <span>{client.name}</span>
                          {linkedAccounts[client.id] && linkedAccounts[client.id].length > 0 && (
                            linkedAccounts[client.id].map((account) => (
                              <Badge
                                key={account.id}
                                variant="outline"
                                className="text-xs cursor-pointer hover:bg-gray-100"
                                onClick={() => router.push('/crm/pipeline?tab=accounts')}
                              >
                                <LinkIcon className="h-3 w-3 mr-1" />
                                <span className="font-semibold">{account.name}</span>
                              </Badge>
                            ))
                          )}
                        </div>
                        {(userProfile?.role === 'admin' || userProfile?.role === 'super_admin') && (
                          <div className="flex items-center space-x-1">
                            <Button variant="ghost" size="sm" onClick={() => openSharePortal(client)} className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-gray-100 w-auto px-2" title="Share portal">
                              <Share2 className="h-4 w-4 text-gray-600" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleEditClient(client)} className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-gray-100 w-auto px-2" title="Edit client">
                              <Edit className="h-4 w-4 text-gray-600" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteClient(client)} className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-50 w-auto px-2" title="Delete client">
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Badge variant={client.is_active ? 'default' : 'secondary'} className="text-xs" style={client.is_active ? { backgroundColor: '#3e8692', color: 'white', borderColor: '#3e8692' } : {}}>
                          {client.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        {client.is_whitelisted && (
                          <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 hover:bg-green-100 hover:text-green-800 cursor-default pointer-events-none">
                            <Building2 className="h-3 w-3 mr-1" />
                            {client.whitelist_partner_name || 'Unknown Partner'}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center text-sm text-gray-600">
                        <Mail className="h-4 w-4 mr-2 text-gray-600" />
                        <span className="text-gray-600">{client.email}</span>
                      </div>
                      <div className="flex items-center text-sm text-gray-600 min-h-[20px]">
                        {client.location ? (
                          <>
                            <MapPin className="h-4 w-4 mr-2 text-gray-600" />
                            <span className="text-gray-600">{client.location}</span>
                          </>
                        ) : (
                          <div className="h-[20px]" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
                      <span className="font-bold text-base">Campaigns by Status</span>
                    </div>
                    <div className="flex flex-col gap-1 mb-3">
                      {['Active', 'Planning', 'Paused', 'Completed'].map((status) => {
                        const statusIcon = {
                          Active: (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500">
                              <CheckCircle className="h-3 w-3 text-white" strokeWidth={2} />
                            </span>
                          ),
                          Planning: (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500">
                              <FileText className="h-3 w-3 text-white" strokeWidth={2} />
                            </span>
                          ),
                          Paused: (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-500">
                              <PauseCircle className="h-3 w-3 text-white" strokeWidth={2} />
                            </span>
                          ),
                          Completed: (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-600">
                              <BadgeCheck className="h-3 w-3 text-white" strokeWidth={2} />
                            </span>
                          ),
                        }[status];
                        return (
                          <div key={status} className="flex items-center justify-between text-sm text-gray-600">
                            <span className="flex items-center gap-2">
                              {statusIcon}
                              <span>{status}</span>
                            </span>
                            <span className="bg-gray-100 rounded-md text-gray-600 font-medium w-7 h-7 flex items-center justify-center">
                              {clientWithStatus.campaignsByStatus?.[status as CampaignStatus] || 0}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {(client.campaign_count || 0) > 0 ? (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="w-full" onClick={() => router.push(`/campaigns?clientId=${client.id}`)}>
                          View Campaigns
                        </Button>
                        <Button variant="outline" size="sm" className="w-full" onClick={() => router.push(`/campaigns?add=1&clientId=${client.id}`)}>
                          Add Campaign
                        </Button>
                      </div>
                    ) : (
                      <Button variant="outline" size="sm" className="w-full" onClick={() => router.push(`/campaigns?add=1&clientId=${client.id}`)}>
                        Add Campaign
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Archive Confirmation Dialog */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Archive Client</DialogTitle>
              <DialogDescription>
                Are you sure you want to archive <span className="font-semibold">{clientToDelete?.name}</span>? The client and its data will be moved to the Archive and can be restored later.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDeleteClient}
              >
                Archive Client
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Share Portal Dialog */}
        <Dialog open={isSharePortalOpen} onOpenChange={setIsSharePortalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Share Portal: {clientToShare?.name}</DialogTitle>
              <DialogDescription>
                Share this client portal by copying the link below.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="share-portal-link">Portal Link</Label>
                <div className="flex gap-2">
                  <Input
                    id="share-portal-link"
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/public/portal/${clientToShare?.slug || clientToShare?.id}`}
                    readOnly
                    className="flex-1 auth-input"
                  />
                  <Button
                    variant="outline"
                    className="h-10"
                    onClick={copyPortalLink}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10"
                    onClick={() => {
                      if (typeof window !== 'undefined' && clientToShare) {
                        window.open(`${window.location.origin}/public/portal/${clientToShare.slug || clientToShare.id}`, '_blank');
                      }
                    }}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-sm text-gray-500">
                Clients can access this portal using their registered email address ({clientToShare?.email}).
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  );
} 