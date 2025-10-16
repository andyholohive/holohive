"use client";
import { useEffect, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar as CalendarIcon, Megaphone, Building2, DollarSign, ArrowLeft, CheckCircle, FileText, PauseCircle, BadgeCheck, Phone, Users, Trash2, Plus, Search, Flag, Globe, Loader, Calendar as CalendarIconImport, ChevronLeft, ChevronRight, ChevronDown, BarChart3, Table as TableIcon, Edit, CreditCard, CheckCircle2, XCircle, MapPin } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CampaignService, CampaignWithDetails } from "@/lib/campaignService";
import { Skeleton } from "@/components/ui/skeleton";
import { UserService } from "@/lib/userService";
import { KOLService } from "@/lib/kolService";
import { CampaignKOLService, CampaignKOLWithDetails } from "@/lib/campaignKolService";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';

const CampaignDetailsPage = () => {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  // Extend CampaignWithDetails inline for local use
  type CampaignDetails = CampaignWithDetails;
  const [campaign, setCampaign] = useState<CampaignDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const regionOptions = KOLService.getFieldOptions().regions;

  // Campaign KOLs state
  const [campaignKOLs, setCampaignKOLs] = useState<any[]>([]);
  const [availableKOLs, setAvailableKOLs] = useState<any[]>([]);
  const [loadingKOLs, setLoadingKOLs] = useState(false);
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
  const [isAddingKOLs, setIsAddingKOLs] = useState(false);
  const [newKOLData, setNewKOLData] = useState({
    selectedKOLs: [] as string[],
    hh_status: 'Curated' as const,
    notes: ''
  });

  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<CampaignDetails | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("information");
  // Track allocation edits
  const [allocations, setAllocations] = useState<any[]>([]);
  const [deletedAllocIds, setDeletedAllocIds] = useState<string[]>([]);
  
  // KOLs view toggle state
  const [kolViewMode, setKolViewMode] = useState<'overview' | 'table' | 'graph'>('overview');
  
  // Payments view toggle state
  const [paymentViewMode, setPaymentViewMode] = useState<'table' | 'graph'>('table');

  // Information tab toggle state
  const [informationViewMode, setInformationViewMode] = useState<'overview' | 'metrics'>('overview');

  // Contents tab toggle state
  const [contentsViewMode, setContentsViewMode] = useState<'overview' | 'table'>('overview');

  // Payments state
  const [payments, setPayments] = useState<any[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [isAddingPayment, setIsAddingPayment] = useState(false);
  const [isEditingPayment, setIsEditingPayment] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [selectedPayments, setSelectedPayments] = useState<string[]>([]);
  const [bulkPaymentMethod, setBulkPaymentMethod] = useState('');
  const [paymentsSearchTerm, setPaymentsSearchTerm] = useState('');
  const [newPaymentData, setNewPaymentData] = useState({
    campaign_kol_id: '',
    amount: 0,
    payment_date: '',
    payment_method: 'Token',
    content_id: 'none',
    transaction_id: '',
    notes: ''
  });

  // Column resize state for KOLs table
  // Remove columnWidths, isResizing, resizingColumn
  // Remove all style={{ width: ... }}, minWidth, maxWidth from TableHead and TableCell
  // Set tableLayout to 'auto' or remove it from <Table>

  // Styling functions for KOL table display
  const getRegionIcon = (region: string) => {
    const regionMap: { [key: string]: { flag: string; icon: any } } = {
      'Vietnam': { flag: '🇻🇳', icon: Flag },
      'Turkey': { flag: '🇹🇷', icon: Flag },
      'SEA': { flag: '🌏', icon: Globe },
      'Philippines': { flag: '🇵🇭', icon: Flag },
      'Korea': { flag: '🇰🇷', icon: Flag },
      'Global': { flag: '🌍', icon: Globe },
      'China': { flag: '🇨🇳', icon: Flag },
      'Brazil': { flag: '🇧🇷', icon: Flag }
    };
    return regionMap[region] || { flag: '🏳️', icon: Flag };
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'X':
        return <span className="font-bold text-black text-sm">𝕏</span>;
      case 'Telegram':
        return (
          <svg className="h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.13-.31-1.09-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
          </svg>
        );
      case 'YouTube':
        return (
          <svg className="h-4 w-4 text-red-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
        );
      case 'Facebook':
        return (
          <svg className="h-4 w-4 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
        );
      case 'TikTok':
        return (
          <svg className="h-4 w-4 text-black" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
          </svg>
        );
      default:
        return null;
    }
  };

  const getContentTypeColor = (type: string) => {
    const colorMap: { [key: string]: string } = {
      'Post': 'bg-blue-100 text-blue-800',
      'Video': 'bg-red-100 text-red-800',
      'Article': 'bg-green-100 text-green-800',
      'AMA': 'bg-purple-100 text-purple-800',
      'Ambassadorship': 'bg-orange-100 text-orange-800',
      'Alpha': 'bg-yellow-100 text-yellow-800'
    };
    return colorMap[type] || 'bg-gray-100 text-gray-800';
  };

  const getCreatorTypeColor = (creatorType: string) => {
    const colorMap: { [key: string]: string } = {
      'Native (Meme/Culture)': 'bg-purple-100 text-purple-800',
      'Drama-Forward': 'bg-red-100 text-red-800',
      'Skeptic': 'bg-orange-100 text-orange-800',
      'Educator': 'bg-blue-100 text-blue-800',
      'Bridge Builder': 'bg-green-100 text-green-800',
      'Visionary': 'bg-indigo-100 text-indigo-800',
      'Onboarder': 'bg-teal-100 text-teal-800',
      'General': 'bg-gray-100 text-gray-800',
      'Gaming': 'bg-pink-100 text-pink-800',
      'Crypto': 'bg-yellow-100 text-yellow-800',
      'Memecoin': 'bg-orange-100 text-orange-800',
      'NFT': 'bg-purple-100 text-purple-800',
      'Trading': 'bg-green-100 text-green-800',
      'AI': 'bg-blue-100 text-blue-800',
      'Research': 'bg-indigo-100 text-indigo-800',
      'Airdrop': 'bg-teal-100 text-teal-800',
      'Art': 'bg-pink-100 text-pink-800'
    };
    return colorMap[creatorType] || 'bg-gray-100 text-gray-800';
  };

  const getNewContentTypeColor = (contentType: string) => {
    const colorMap: { [key: string]: string } = {
      'Meme': 'bg-yellow-100 text-yellow-800',
      'News': 'bg-blue-100 text-blue-800',
      'Trading': 'bg-green-100 text-green-800',
      'Deep Dive': 'bg-purple-100 text-purple-800',
      'Meme/Cultural Narrative': 'bg-pink-100 text-pink-800',
      'Drama Queen': 'bg-red-100 text-red-800',
      'Sceptics': 'bg-orange-100 text-orange-800',
      'Technical Educator': 'bg-indigo-100 text-indigo-800',
      'Bridge Builders': 'bg-teal-100 text-teal-800',
      'Visionaries': 'bg-cyan-100 text-cyan-800'
    };
    return colorMap[contentType] || 'bg-gray-100 text-gray-800';
  };

  const getPricingColor = (pricing: string) => {
    const colorMap: { [key: string]: string } = {
      '<$200': 'bg-green-100 text-green-800',
      '$200-500': 'bg-yellow-100 text-yellow-800',
      '$500-1K': 'bg-orange-100 text-orange-800',
      '$1K-2K': 'bg-red-100 text-red-800',
      '$2K-3K': 'bg-purple-100 text-purple-800',
      '>$3K': 'bg-pink-100 text-pink-800'
    };
    return colorMap[pricing] || 'bg-blue-100 text-blue-800';
  };

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
        const fetchedCampaign = await CampaignService.getCampaignById(id);
        setCampaign(fetchedCampaign);
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
  }, []);

  // Fetch campaign KOLs when campaign changes
  useEffect(() => {
    if (campaign) {
      fetchCampaignKOLs();
      fetchAvailableKOLs();
      fetchCampaignUpdates();
      fetchPayments();
    }
  }, [campaign]);

  const fetchCampaignKOLs = async () => {
    if (!campaign) return;
    try {
      setLoadingKOLs(true);
      const kols = await CampaignKOLService.getCampaignKOLs(campaign.id);
      // If payments are loaded, map paid from sums; else set directly
      if (payments && payments.length > 0) {
        const sums = computePaymentSums(payments);
        setCampaignKOLs(kols.map(k => ({ ...k, paid: sums[k.id] || 0 })));
      } else {
      setCampaignKOLs(kols);
      }
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

  const handleAddKOLs = async () => {
    if (!campaign || newKOLData.selectedKOLs.length === 0) return;
    setIsAddingKOLs(true);
    try {
      // Add all selected KOLs to the campaign
      await Promise.all(
        newKOLData.selectedKOLs.map(kolId =>
          CampaignKOLService.addCampaignKOL(
            campaign.id,
            kolId,
            newKOLData.hh_status,
            newKOLData.notes
          )
        )
      );
      setNewKOLData({ selectedKOLs: [], hh_status: 'Curated', notes: '' });
      setIsAddKOLsDialogOpen(false);
      fetchCampaignKOLs();
      fetchAvailableKOLs();
    } catch (error) {
      console.error('Error adding KOLs:', error);
    } finally {
      setIsAddingKOLs(false);
    }
  };

  const handleUpdateKOLStatus = async (kolId: string, status: 'Curated' | 'Interested' | 'Onboarded' | 'Concluded') => {
    try {
      await CampaignKOLService.updateCampaignKOL(kolId, { hh_status: status });
      setCampaignKOLs(prev => prev.map(kol => kol.id === kolId ? { ...kol, hh_status: status } : kol));
    } catch (error) {
      console.error('Error updating KOL status:', error);
    }
  };

  const handleDeleteKOL = async (kolId: string) => {
    try {
      await CampaignKOLService.deleteCampaignKOL(kolId);
      fetchCampaignKOLs();
      fetchAvailableKOLs();
    } catch (error) {
      console.error('Error deleting KOL:', error);
    }
  };

  // MultiSelect component
  const MultiSelect = ({
    options,
    selected,
    onSelectedChange,
    placeholder = "Select options...",
    renderOption = (option: string) => option,
    className = "",
    triggerContent = null
  }: {
    options: string[];
    selected: string[];
    onSelectedChange: (selected: string[]) => void;
    placeholder?: string;
    renderOption?: (option: string) => React.ReactNode;
    className?: string;
    triggerContent?: React.ReactNode;
  }) => {
    const [open, setOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const safeOptions = Array.isArray(options) ? options : [];
    const safeSelected = Array.isArray(selected) ? selected : [];

    const filteredOptions = safeOptions.filter(option =>
      option.toLowerCase().includes(searchTerm.toLowerCase())
    );

    try {
      return (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            {triggerContent ? (
              <div className={`cursor-pointer w-full ${className}`}>
                {triggerContent}
              </div>
            ) : (
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className={`h-auto border-none shadow-none p-1 bg-transparent hover:bg-transparent text-xs font-medium inline-flex items-center ${className}`}
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </Button>
            )}
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0" align="start">
            <div className="flex items-center border-b px-3 py-2">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border-0 p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
            <div className="max-h-[300px] overflow-auto">
              {filteredOptions.length === 0 ? (
                <div className="p-2 text-sm text-muted-foreground">No options found.</div>
              ) : (
                filteredOptions.map((option) => (
                  <div
                    key={option}
                    className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                    onClick={() => {
                      try {
                        const newSelected = safeSelected.includes(option)
                          ? safeSelected.filter(item => item !== option)
                          : [...safeSelected, option];
                        onSelectedChange(newSelected);
                      } catch (error) {
                        console.error('Error in onSelect:', error);
                      }
                    }}
                  >
                    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                      {safeSelected.includes(option) && (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m5 12 5 5L20 7" />
                        </svg>
                      )}
                    </span>
                    <div className="flex items-center space-x-2">
                      {renderOption(option)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      );
    } catch (error) {
      console.error('MultiSelect render error:', error);
      return <div className="text-red-500">Error rendering multiselect</div>;
    }
  };

  const filteredKOLs = campaignKOLs.filter(kol => {
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

    return matchesSearch && matchesPlatform && matchesRegion && matchesCreatorType && matchesContentType &&
           matchesStatus && matchesBudgetType && matchesFollowers && matchesBudget && matchesPaid;
  });
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
  // Add local utility functions
  const formatDate = (dateString: string | undefined | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString();
  };
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Active":
        return (
          <span className="inline-flex items-center gap-1"><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500"><CheckCircle className="h-3 w-3 text-white" strokeWidth={2} /></span>Active</span>
        );
      case "Planning":
        return (
          <span className="inline-flex items-center gap-1"><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500"><FileText className="h-3 w-3 text-white" strokeWidth={2} /></span>Planning</span>
        );
      case "Paused":
        return (
          <span className="inline-flex items-center gap-1"><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-500"><PauseCircle className="h-3 w-3 text-white" strokeWidth={2} /></span>Paused</span>
        );
      case "Completed":
        return (
          <span className="inline-flex items-center gap-1"><span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-600"><BadgeCheck className="h-3 w-3 text-white" strokeWidth={2} /></span>Completed</span>
        );
      default:
        return status;
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

  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<{ [key: string]: string }>({});
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editingBudget, setEditingBudget] = useState<{ [key: string]: string }>({});
  const [editingWalletId, setEditingWalletId] = useState<string | null>(null);
  const [editingWallet, setEditingWallet] = useState<{ [key: string]: string }>({});
  const [editingPaidId, setEditingPaidId] = useState<string | null>(null);
  const [editingPaid, setEditingPaid] = useState<{ [key: string]: string | number | null }>({});

  const handleNotesChange = (kolId: string, value: string) => {
    setEditingNotes(prev => ({ ...prev, [kolId]: value }));
  };

  const handleBudgetChange = (kolId: string, value: string) => {
    setEditingBudget(prev => ({ ...prev, [kolId]: value }));
  };

  const handleWalletChange = (kolId: string, value: string) => {
    setEditingWallet(prev => ({ ...prev, [kolId]: value }));
  };

  const handleNotesSave = async (kolId: string) => {
    const notes = editingNotes[kolId];
    try {
      await CampaignKOLService.updateCampaignKOL(kolId, { notes });
      setCampaignKOLs(prev => prev.map(kol => kol.id === kolId ? { ...kol, notes } : kol));
      setEditingNotesId(null);
    } catch (err) {
      console.error('Error updating notes:', err);
    }
  };

  const handleBudgetSave = async (kolId: string) => {
    const budget = editingBudget[kolId];
    try {
      await CampaignKOLService.updateCampaignKOL(kolId, { allocated_budget: budget ? parseFloat(budget) : null });
      setCampaignKOLs(prev => prev.map(kol => kol.id === kolId ? { ...kol, allocated_budget: budget ? parseFloat(budget) : null } : kol));
      setEditingBudgetId(null);
    } catch (err) {
      console.error('Error updating budget:', err);
    }
  };

  const handleWalletSave = async (kolId: string) => {
    const wallet = editingWallet[kolId];
    try {
      await CampaignKOLService.updateCampaignKOL(kolId, { wallet });
      setCampaignKOLs(prev => prev.map(kol => kol.id === kolId ? { ...kol, wallet } : kol));
      setEditingWalletId(null);
    } catch (err) {
      console.error('Error updating wallet:', err);
    }
  };

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
    if (!id) return;
    setLoadingPayments(true);
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('campaign_id', id)
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

  const handleAddPayment = async () => {
    if (!id || !newPaymentData.campaign_kol_id || newPaymentData.amount <= 0) {
      toast({ title: "Error", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('payments')
        .insert({
          campaign_id: id,
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
        payment_method: 'Token',
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

  const handleDeletePayment = async (paymentId: string) => {
    try {
      const paymentToDelete = payments.find(p => p.id === paymentId);
      if (!paymentToDelete) return;

      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', paymentId);

      if (error) throw error;

      // Update the KOL's paid amount in the campaign_kols table
      const currentKol = campaignKOLs.find(kol => kol.id === paymentToDelete.campaign_kol_id);
      const currentPaid = currentKol?.paid || 0;
      const newPaid = Math.max(0, currentPaid - paymentToDelete.amount);
      
      await supabase
        .from('campaign_kols')
        .update({ paid: newPaid })
        .eq('id', paymentToDelete.campaign_kol_id);

      setCampaignKOLs(prev => prev.map(kol => 
        kol.id === paymentToDelete.campaign_kol_id ? { ...kol, paid: newPaid } : kol
      ));

      setPayments(prev => prev.filter(p => p.id !== paymentId));
      toast({ title: "Success", description: "Payment deleted successfully." });
    } catch (err) {
      console.error('Error deleting payment:', err);
      toast({ title: "Error", description: "Failed to delete payment.", variant: "destructive" });
    }
  };

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
          content_id: newPaymentData.content_id === 'none' ? null : newPaymentData.content_id,
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
        payment_method: 'Token',
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

  // Bulk payment functions
  const handleSelectAllPayments = () => {
    const filteredPayments = payments.filter(payment => {
      const kol = campaignKOLs.find(k => k.id === payment.campaign_kol_id);
      const search = paymentsSearchTerm.toLowerCase();
      return (
        !search ||
        (kol?.master_kol?.name?.toLowerCase().includes(search)) ||
        (payment.payment_method?.toLowerCase().includes(search)) ||
        (payment.notes?.toLowerCase().includes(search))
      );
    });
    
    if (filteredPayments.every(payment => selectedPayments.includes(payment.id))) {
      setSelectedPayments(prev => prev.filter(id => !filteredPayments.some(p => p.id === id)));
    } else {
      setSelectedPayments(prev => Array.from(new Set([...prev, ...filteredPayments.map(p => p.id)])));
    }
  };

  const handleBulkPaymentMethodChange = async () => {
    if (selectedPayments.length === 0 || !bulkPaymentMethod) return;
    
    try {
      // Update all selected payments with the new payment method
      await Promise.all(selectedPayments.map(paymentId => 
        supabase.from('payments').update({ payment_method: bulkPaymentMethod }).eq('id', paymentId)
      ));

      // Update local state
      setPayments(prev => prev.map(payment => 
        selectedPayments.includes(payment.id) ? { ...payment, payment_method: bulkPaymentMethod } : payment
      ));

      setSelectedPayments([]);
      setBulkPaymentMethod('');
      toast({ title: "Success", description: "Payment methods updated successfully." });
    } catch (err) {
      console.error('Error updating payment methods:', err);
      toast({ title: "Error", description: "Failed to update payment methods.", variant: "destructive" });
    }
  };

  const handleBulkDeletePayments = async () => {
    if (selectedPayments.length === 0) return;
    
    try {
      // Delete all selected payments
      await Promise.all(selectedPayments.map(paymentId => handleDeletePayment(paymentId)));
      
      setSelectedPayments([]);
      toast({ title: "Success", description: `${selectedPayments.length} payment(s) deleted successfully.` });
    } catch (err) {
      console.error('Error deleting payments:', err);
      toast({ title: "Error", description: "Failed to delete some payments.", variant: "destructive" });
    }
  };

  // Add a getStatusColor helper:
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Curated': return 'bg-blue-100 text-blue-800';
      case 'Interested': return 'bg-yellow-100 text-yellow-800';
      case 'Onboarded': return 'bg-green-100 text-green-800';
      case 'Concluded': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const [selectedKOLs, setSelectedKOLs] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<CampaignKOLWithDetails['hh_status'] | "">("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showKOLDeleteDialog, setShowKOLDeleteDialog] = useState(false);
  const [kolsToDelete, setKolsToDelete] = useState<string[]>([]);

  const [kolSearchTerm, setKolSearchTerm] = useState('');
  const filteredAvailableKOLs = availableKOLs.filter((kol: any) =>
    kol.name.toLowerCase().includes(kolSearchTerm.toLowerCase()) ||
    (kol.region && kol.region.toLowerCase().includes(kolSearchTerm.toLowerCase())) ||
    (Array.isArray(kol.platform) && kol.platform.some((p: string) => p.toLowerCase().includes(kolSearchTerm.toLowerCase())))
  );

  const [isAddKOLsDialogOpen, setIsAddKOLsDialogOpen] = useState(false);
  const [isAddContentsDialogOpen, setIsAddContentsDialogOpen] = useState(false);
  const { toast } = useToast();

  // Campaign updates state
  const [isAddUpdateDialogOpen, setIsAddUpdateDialogOpen] = useState(false);
  const [updateText, setUpdateText] = useState('');
  const [isAddingUpdate, setIsAddingUpdate] = useState(false);
  const [campaignUpdates, setCampaignUpdates] = useState<any[]>([]);
  const [loadingUpdates, setLoadingUpdates] = useState(false);
  const [currentUpdateIndex, setCurrentUpdateIndex] = useState(0);
  const [isDeleteUpdateDialogOpen, setIsDeleteUpdateDialogOpen] = useState(false);

  // 1. Add state for Add Content form
  const [addContentData, setAddContentData] = useState({
    campaign_kols_id: '',
    activation_date: '',
    content_link: '',
    platform: '',
    type: '',
    status: '',
    impressions: '',
    likes: '',
    retweets: '',
    comments: '',
    bookmarks: '',
  });

  const contentStatusOptions = [
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'pending', label: 'Pending' },
    { value: 'posted', label: 'Posted' }
  ];
  const fieldOptions = KOLService.getFieldOptions();

  // Helper for local YYYY-MM-DD formatting
  function formatDateLocal(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  const [isAddingContent, setIsAddingContent] = useState(false);

  // 1. Add state for contents and loading
  const [contents, setContents] = useState<any[]>([]);
  const [loadingContents, setLoadingContents] = useState(false);

  // 2. Fetch contents for campaign when campaign changes
  useEffect(() => {
    const fetchContents = async () => {
      if (!id) return;
      setLoadingContents(true);
      try {
        const { data, error } = await supabase
          .from('contents')
          .select('*')
          .eq('campaign_id', id);
        if (error) throw error;
        setContents(data || []);
      } catch (err) {
        setContents([]);
        console.error('Error fetching contents:', err);
      } finally {
        setLoadingContents(false);
      }
    };
    fetchContents();
  }, [id]); // When campaign changes

  const [contentsSearchTerm, setContentsSearchTerm] = useState('');
  const [bulkContentStatus, setBulkContentStatus] = useState('');

  // 1. Add state for selection and bulk actions for contents
  const [selectedContents, setSelectedContents] = useState<string[]>([]);

  // Content filters state
  const [contentFilters, setContentFilters] = useState<{
    platform: string[];
    type: string[];
    status: string[];
  }>({
    platform: [],
    type: [],
    status: []
  });

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

    return (
      (!search ||
        (kol?.master_kol?.name?.toLowerCase().includes(search)) ||
        (content.platform?.toLowerCase().includes(search)) ||
        (content.status?.toLowerCase().includes(search))
      ) &&
      (!bulkContentStatus || content.status === bulkContentStatus)
    );
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
    // Implement bulk status update logic as needed
    setSelectedContents([]);
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
  const renderEditableContentCell = (value: any, field: string, content: any) => {
    const isEditing = editingContentCell?.contentId === content.id && editingContentCell?.field === field;
    const textFields = ["content_link", "activation_date", "impressions", "likes", "retweets", "comments", "bookmarks"];
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
        getColorClass = () => value ? getContentTypeColor(value) : 'bg-gray-100 text-gray-800';
      } else if (field === 'status') {
        options = contentStatusOptions.map(o => o.value);
        getColorClass = () => value ? getStatusColor(value) : 'bg-gray-100 text-gray-800';
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
            onKeyDown={e => {
              if (e.key === 'Enter') handleContentCellSave();
              if (e.key === 'Escape') handleContentCellCancel();
            }}
            className="w-full border-none shadow-none p-0 h-auto bg-transparent text-blue-600 focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none"
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
            <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline" onClick={e => e.stopPropagation()}>
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
              className="auth-input justify-start text-left font-normal focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692] w-full"
              style={{ borderColor: "#e5e7eb", backgroundColor: "white", color: value ? "#111827" : "#9ca3af" }}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {value ? value : "Select activation date"}
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
          onKeyDown={e => {
            if (e.key === 'Enter') handleContentCellSave();
            if (e.key === 'Escape') handleContentCellCancel();
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
        {value || '-'}
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
          campaign_id: id,
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

    setEditingContentCell(null);
    setEditingContentValue(null);
  };

  // Add at the top of the component, after other useState declarations:
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [contentToDelete, setContentToDelete] = useState<any | null>(null);
  const [showPaymentDeleteDialog, setShowPaymentDeleteDialog] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<any | null>(null);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] w-full bg-gray-50">
        <div className="w-full px-4">
          <div className="space-y-4">
            <div>
              <Skeleton className="h-8 w-32 mb-2" />
            </div>
            
            <div className="w-full bg-white border border-gray-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-4">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <Skeleton className="h-8 w-64" />
              </div>
              
              <div className="grid grid-cols-2 gap-6 text-sm">
                <div className="space-y-4">
                  <div>
                    <Skeleton className="h-4 w-20 mb-2" />
                    <Skeleton className="h-6 w-32" />
                  </div>
                  <div>
                    <Skeleton className="h-4 w-20 mb-2" />
                    <Skeleton className="h-6 w-32" />
                  </div>
                  <div>
                    <Skeleton className="h-4 w-20 mb-2" />
                    <Skeleton className="h-6 w-24" />
                  </div>
                  <div>
                    <Skeleton className="h-4 w-20 mb-2" />
                    <Skeleton className="h-6 w-20" />
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <Skeleton className="h-4 w-20 mb-2" />
                    <Skeleton className="h-6 w-32" />
                  </div>
                  <div>
                    <Skeleton className="h-4 w-20 mb-2" />
                    <Skeleton className="h-6 w-24" />
                  </div>
                  <div>
                    <Skeleton className="h-4 w-20 mb-2" />
                    <Skeleton className="h-6 w-20" />
                  </div>
                  <div>
                    <Skeleton className="h-4 w-20 mb-2" />
                    <Skeleton className="h-6 w-24" />
                  </div>
                </div>
              </div>
              
              <div className="mt-6">
                <Skeleton className="h-4 w-32 mb-2" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-6 w-16" />
                </div>
              </div>
              
              <div className="mt-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-20 w-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !campaign) {
    return <div className="text-center py-8 text-red-500">{error || "Campaign not found"}</div>;
  }

  return (
    <div className="min-h-[calc(100vh-64px)] w-full bg-gray-50">
      <div className="w-full">
        <div className="space-y-4">
          <div>
            <Button
              variant="ghost"
              className="py-2 px-3 rounded-md text-gray-600 hover:text-[#3e8692] transition-colors mb-1 text-sm"
              onClick={() => router.back()}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />Back to Campaigns
            </Button>
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="information">Information</TabsTrigger>
              <TabsTrigger value="kols">KOLs</TabsTrigger>
              <TabsTrigger value="contents">Contents</TabsTrigger>
                  <TabsTrigger value="payments">Payments</TabsTrigger>
            </TabsList>
            
            <TabsContent value="information" className="mt-4">
              <div className="w-full bg-white border border-gray-200 shadow-sm p-6">
              <CardHeader className="pb-6 border-b border-gray-100 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-gray-100 p-2 rounded-lg"><Megaphone className="h-6 w-6 text-gray-600" /></div>
                  {editMode ? (
                      <Input
                        className="text-2xl font-bold text-gray-900 auth-input focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692]"
                        style={{ borderColor: '#e5e7eb' }}
                        value={form?.name || ""}
                        onChange={e => handleChange("name", e.target.value)}
                      />
                  ) : (
                    <h2 className="text-2xl font-bold text-gray-900">{campaign.name}</h2>
                  )}
                  {editMode ? (
                    <Select value={form?.status || ""} onValueChange={value => handleChange("status", value)}>
                      <SelectTrigger className="w-40 focus:outline-none focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692] auth-input">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Planning">Planning</SelectItem>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Paused">Paused</SelectItem>
                        <SelectItem value="Completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="font-bold">{getStatusBadge(campaign.status)}</div>
                  )}
                </div>
                {!editMode && (
                  <Button variant="outline" size="sm" onClick={handleEdit}>Edit</Button>
                )}
              </CardHeader>
                <CardContent className="pt-6">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-8">
                                {!editMode && (
                  <div className="flex items-center justify-between col-span-2">
                    {/* Campaign Updates Carousel */}
                    <div className="flex-1 max-w-md">
                      <div className="text-sm font-medium text-gray-700 mb-2">Recent Updates</div>
                      {loadingUpdates ? (
                        <div className="flex items-center gap-2">
                          {/* Left Arrow Skeleton */}
                          <div className="h-8 w-8 bg-gray-200 rounded-full animate-pulse"></div>
                          
                          {/* Update Card Skeleton */}
                          <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-3 min-h-[80px]">
                            <div className="space-y-2">
                              <Skeleton className="h-4 w-full" />
                              <Skeleton className="h-4 w-3/4" />
                              <Skeleton className="h-3 w-1/2" />
                            </div>
                          </div>
                          
                          {/* Right Arrow Skeleton */}
                          <div className="h-8 w-8 bg-gray-200 rounded-full animate-pulse"></div>
                        </div>
                      ) : campaignUpdates.length === 0 ? (
                        <div className="text-sm text-gray-500 italic">No updates yet</div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            {/* Left Arrow */}
                            {campaignUpdates.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 bg-white hover:bg-gray-50 border border-gray-200 rounded-full flex-shrink-0"
                                onClick={prevUpdate}
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </Button>
                            )}
                            
                            {/* Update Card */}
                            <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-3 min-h-[80px] relative">
                              <div className="text-sm text-gray-900 mb-1">
                                {campaignUpdates[currentUpdateIndex]?.update_text}
                              </div>
                              <div className="text-xs text-gray-500">
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
                                    className="absolute bottom-2 right-2 h-6 w-6 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-md">
                                  <DialogHeader>
                                    <DialogTitle>Confirm Delete</DialogTitle>
                                  </DialogHeader>
                                  <div className="text-sm text-gray-600 mt-2 mb-2">
                                    Are you sure you want to delete this update?
                                  </div>
                                  <DialogFooter>
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
                                className="h-8 w-8 p-0 bg-white hover:bg-gray-50 border border-gray-200 rounded-full flex-shrink-0"
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
                                      ? 'bg-[#3e8692]' 
                                      : 'bg-gray-300 hover:bg-gray-400'
                                  }`}
                                  onClick={() => setCurrentUpdateIndex(index)}
                                />
                              ))}
                            </div>
                          )}
                          
                          {/* Update Counter */}
                          {campaignUpdates.length > 1 && (
                            <div className="text-xs text-gray-500 text-center mt-1">
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
                          <Button size="sm" style={{ backgroundColor: '#3e8692', color: 'white' }} className="hover:opacity-90">
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
                                className="auth-input min-h-[120px]"
                                rows={4}
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => {
                              setIsAddUpdateDialogOpen(false);
                              setUpdateText('');
                            }}>
                              Cancel
                            </Button>
                            <Button
                              style={{ backgroundColor: '#3e8692', color: 'white' }}
                              disabled={!updateText.trim() || isAddingUpdate}
                              onClick={async () => {
                                if (!updateText.trim()) return;
                                
                                setIsAddingUpdate(true);
                                try {
                                  const { error } = await supabase
                                    .from('campaign_updates')
                                    .insert({
                                      campaign_id: campaign.id,
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
                  {/* Campaign Overview Section */}
                  <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="bg-[#3e8692] p-2.5 rounded-lg">
                        <FileText className="h-5 w-5 text-white" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">Campaign Overview</h3>
                    </div>
                    <div className="space-y-5">
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                            Outline
                          </div>
                          <Badge variant="outline" className="text-[10px] text-gray-500 border-gray-300">Internal</Badge>
                        </div>
                        {editMode ? (
                          <Textarea
                            value={form?.outline || ""}
                            onChange={e => handleChange("outline", e.target.value)}
                            className="auth-input focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692]"
                            style={{ borderColor: '#e5e7eb' }}
                            placeholder="Enter campaign outline..."
                            rows={3}
                          />
                        ) : (
                          <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{campaign.outline || <span className="text-gray-400 italic">No outline provided</span>}</div>
                        )}
                      </div>
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                            Description
                          </div>
                          <Badge variant="outline" className="text-[10px] text-[#3e8692] border-[#3e8692]">Client-Facing</Badge>
                        </div>
                        {editMode ? (
                          <Textarea
                            value={form?.description || ""}
                            onChange={e => handleChange("description", e.target.value)}
                            className="auth-input focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692]"
                            style={{ borderColor: '#e5e7eb' }}
                            rows={3}
                          />
                        ) : (
                          <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{campaign.description || <span className="text-gray-400 italic">No description provided</span>}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Timeline Section */}
                  <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="bg-[#3e8692] p-2.5 rounded-lg">
                        <CalendarIcon className="h-5 w-5 text-white" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">Timeline</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Start Date</div>
                        {editMode ? (
                      <Popover key="start-date-popover">
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="auth-input justify-start text-left font-normal focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692]"
                            style={{ borderColor: "#e5e7eb", backgroundColor: "white", color: form?.start_date ? "#111827" : "#9ca3af" }}
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
                      <div className="text-lg font-semibold text-gray-900">{formatDate(campaign?.start_date)}</div>
                    )}
                  </div>
                  <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">End Date</div>
                    {editMode ? (
                      <Popover key="end-date-popover">
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="auth-input justify-start text-left font-normal focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692]"
                            style={{ borderColor: "#e5e7eb", backgroundColor: "white", color: form?.end_date ? "#111827" : "#9ca3af" }}
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
                      <div className="text-lg font-semibold text-gray-900">{formatDate(campaign?.end_date)}</div>
                    )}
                  </div>
                  <div className="col-span-2 bg-white p-4 rounded-lg border border-gray-200">
                    <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-[#3e8692]" />
                      Region
                    </div>
                    {editMode ? (
                      <Select value={form?.region || ""} onValueChange={value => handleChange("region", value)}>
                        <SelectTrigger className="w-full focus:outline-none focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692] auth-input">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="apac">APAC</SelectItem>
                          <SelectItem value="global">Global</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="text-lg font-semibold text-gray-900">{displayRegion(campaign?.region)}</div>
                    )}
                  </div>
                    </div>
                  </div>

                  {/* Client Communication Section */}
                  <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="bg-[#3e8692] p-2.5 rounded-lg">
                        <Phone className="h-5 w-5 text-white" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">Client Communication</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Intro Call</div>
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
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                                <span className="text-base font-semibold text-green-600">Completed</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-5 w-5 text-gray-400" />
                                <span className="text-base font-medium text-gray-400">Not Held</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      {!!(editMode ? form?.intro_call : campaign?.intro_call) && (
                        <div className="bg-white p-4 rounded-lg border border-gray-200">
                          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Intro Call Date</div>
                          {editMode ? (
                        <Popover key="intro-call-popover">
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="auth-input justify-start text-left font-normal focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692]"
                              style={{ borderColor: "#e5e7eb", backgroundColor: "white", color: form?.intro_call_date ? "#111827" : "#9ca3af" }}
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
                        <div className="text-base font-semibold text-gray-900">{campaign?.intro_call_date ? formatDate(campaign.intro_call_date) : '-'}</div>
                      )}
                        </div>
                      )}
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Proposal Sent</div>
                        {editMode ? (
                          <Checkbox id="proposal_sent" checked={!!form?.proposal_sent} onCheckedChange={checked => handleChange("proposal_sent", !!checked)} />
                        ) : (
                          <div className="flex items-center gap-2">
                            {campaign?.proposal_sent ? (
                              <>
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                                <span className="text-base font-semibold text-green-600">Sent</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-5 w-5 text-gray-400" />
                                <span className="text-base font-medium text-gray-400">Not Sent</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">NDA Signed</div>
                        {editMode ? (
                          <Checkbox id="nda_signed" checked={!!form?.nda_signed} onCheckedChange={checked => handleChange("nda_signed", !!checked)} />
                        ) : (
                          <div className="flex items-center gap-2">
                            {campaign?.nda_signed ? (
                              <>
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                                <span className="text-base font-semibold text-green-600">Signed</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-5 w-5 text-gray-400" />
                                <span className="text-base font-medium text-gray-400">Not Signed</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Team & Management Section */}
                  <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="bg-[#3e8692] p-2.5 rounded-lg">
                        <Users className="h-5 w-5 text-white" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">Team & Management</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">Manager</div>
                        {editMode ? (
                          <Select value={form?.manager || ""} onValueChange={value => handleChange("manager", value)}>
                            <SelectTrigger className="w-full focus:outline-none focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692] auth-input">
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
                            const initials = managerName !== '-' ? managerName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';
                            return (
                              <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10 border-2 border-[#3e8692]">
                                  <AvatarFallback className="bg-[#3e8692] text-white font-semibold">
                                    {initials}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="font-semibold text-gray-900">{managerName}</div>
                                  {manager?.email && <div className="text-xs text-gray-500">{manager.email}</div>}
                                </div>
                              </div>
                            );
                          })()
                        )}
                      </div>
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Call Support</div>
                        {editMode ? (
                          <Checkbox id="call_support" checked={!!form?.call_support} onCheckedChange={checked => handleChange("call_support", !!checked)} />
                        ) : (
                          <div className="flex items-center gap-2">
                            {campaign?.call_support ? (
                              <>
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                                <span className="text-base font-semibold text-green-600">Available</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-5 w-5 text-gray-400" />
                                <span className="text-base font-medium text-gray-400">Not Available</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Campaign Settings Section */}
                  <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="bg-[#3e8692] p-2.5 rounded-lg">
                        <BadgeCheck className="h-5 w-5 text-white" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">Campaign Settings</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Client Choosing KOLs</div>
                        {editMode ? (
                          <Checkbox id="client_choosing_kols" checked={!!form?.client_choosing_kols} onCheckedChange={checked => handleChange("client_choosing_kols", !!checked)} />
                        ) : (
                          <div className="flex items-center gap-2">
                            {campaign?.client_choosing_kols ? (
                              <>
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                                <span className="text-base font-semibold text-green-600">Enabled</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-5 w-5 text-gray-400" />
                                <span className="text-base font-medium text-gray-400">Disabled</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Multi-Activation</div>
                        {editMode ? (
                          <Checkbox id="multi_activation" checked={!!form?.multi_activation} onCheckedChange={checked => handleChange("multi_activation", !!checked)} />
                        ) : (
                          <div className="flex items-center gap-2">
                            {campaign?.multi_activation ? (
                              <>
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                                <span className="text-base font-semibold text-green-600">Enabled</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-5 w-5 text-gray-400" />
                                <span className="text-base font-medium text-gray-400">Disabled</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Budget Section */}
                  <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="bg-[#3e8692] p-2.5 rounded-lg">
                        <DollarSign className="h-5 w-5 text-white" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">Budget</h3>
                    </div>
                    <div className="space-y-4">
                      {/* Budget Overview Card */}
                      <div className="bg-white p-5 rounded-lg border border-gray-200">
                        <div className="grid grid-cols-2 gap-6 mb-4">
                          <div>
                            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Total Budget</div>
                            {editMode ? (
                              <div className="relative w-full">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">$</span>
                                <Input
                                  type="number"
                                  className="pl-6 w-full auth-input focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692]"
                                  style={{ borderColor: '#e5e7eb' }}
                                  value={form?.total_budget || ""}
                                  onChange={e => handleChange("total_budget", e.target.value)}
                                />
                              </div>
                            ) : (
                              <div className="text-2xl font-bold text-gray-900">{CampaignService.formatCurrency(campaign.total_budget)}</div>
                            )}
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Allocated</div>
                            <div className="text-2xl font-bold text-[#3e8692]">{CampaignService.formatCurrency(campaign.total_allocated || 0)}</div>
                          </div>
                        </div>
                        {/* Progress Bar */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-gray-700">Budget Utilization</span>
                            <span className="text-sm font-bold text-gray-900">{CampaignService.calculateBudgetUtilization(campaign.total_budget, campaign.total_allocated || 0)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-[#3e8692] to-[#2d6470] transition-all duration-300 rounded-full"
                              style={{ width: `${Math.min(CampaignService.calculateBudgetUtilization(campaign.total_budget, campaign.total_allocated || 0), 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>

                      {/* Budget Type */}
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">Budget Type</div>
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
                                <Badge key={type} variant="outline" className="capitalize text-[#3e8692] border-[#3e8692]">{type}</Badge>
                              ))
                            ) : (
                              <span className="text-gray-400 italic">No budget types specified</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {editMode ? (
                      <div className="mt-4 bg-white p-4 rounded-lg border border-gray-200">
                        <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">Regional Allocations</div>
                        <div className="flex flex-col gap-2">
                      {allocations.map((alloc, idx) => (
                        <div key={alloc.id || idx} className="flex items-center gap-2">
                          <Select value={alloc.region} onValueChange={value => {
                            const updated = [...allocations];
                            updated[idx].region = value;
                            setAllocations(updated);
                          }}>
                            <SelectTrigger className="w-32 focus:outline-none focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692] auth-input">
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
                            className="text-red-500 hover:text-red-700"
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
                        <div className="mt-4 bg-white p-4 rounded-lg border border-gray-200">
                          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">Regional Allocations</div>
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
                    <Button variant="default" style={{ backgroundColor: '#3e8692', color: 'white' }} onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
                    <Button variant="outline" onClick={handleCancel} disabled={saving}>Cancel</Button>
                  </div>
                )}
                    </div>
              </CardContent>
            </div>
          </TabsContent>

          <TabsContent value="kols" className="mt-4">
            <div className="w-full bg-white border border-gray-200 shadow-sm p-6">
              <CardHeader className="pb-6 border-b border-gray-100 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-gray-100 p-2 rounded-lg">
                    <Users className="h-6 w-6 text-gray-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900">Campaign KOLs</h2>
                </div>
                <div className="flex items-center gap-3">
                  
                  <Dialog open={isAddKOLsDialogOpen} onOpenChange={setIsAddKOLsDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" style={{ backgroundColor: '#3e8692', color: 'white' }} className="hover:opacity-90">
                        <Plus className="h-4 w-4 mr-2" />
                        Add KOLs
                      </Button>
                    </DialogTrigger>
                  <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-hidden">
                     <DialogHeader>
                       <DialogTitle>Add KOLs to Campaign</DialogTitle>
                     </DialogHeader>
                     <div className="grid gap-4 py-4 max-h-[75vh] overflow-y-auto px-3 pb-6">
                       <div className="grid gap-2">
                         <Label>Select KOLs ({newKOLData.selectedKOLs.length} selected)</Label>
                         <div className="flex items-center max-w-sm w-full mb-2">
                           <Input
                             placeholder="Search KOLs by name, region, or platform..."
                             className="auth-input"
                             value={kolSearchTerm}
                             onChange={e => setKolSearchTerm(e.target.value)}
                           />
                         </div>
                         <Button
                           size="sm"
                           variant="outline"
                           className="mb-2 w-fit"
                           onClick={() => {
                             const allIds = filteredAvailableKOLs.map(kol => kol.id);
                             if (allIds.every(id => newKOLData.selectedKOLs.includes(id))) {
                               // Deselect all
                               setNewKOLData(prev => ({ ...prev, selectedKOLs: prev.selectedKOLs.filter(id => !allIds.includes(id)) }));
                             } else {
                               // Select all
                               setNewKOLData(prev => ({ ...prev, selectedKOLs: Array.from(new Set([...prev.selectedKOLs, ...allIds])) }));
                             }
                           }}
                         >
                           {filteredAvailableKOLs.length > 0 && filteredAvailableKOLs.every(kol => newKOLData.selectedKOLs.includes(kol.id)) ? 'Deselect All' : 'Select All'}
                         </Button>
                         <div className="border rounded-lg overflow-hidden mt-2">
                           <Table>
                             <TableHeader>
                               <TableRow className="bg-gray-50">
                                 <TableHead className="w-12">Select</TableHead>
                                 <TableHead>Name</TableHead>
                                 <TableHead>Followers</TableHead>
                                 <TableHead>Region</TableHead>
                                 <TableHead>Platform</TableHead>
                                 <TableHead>Creator Type</TableHead>
                                 <TableHead className="whitespace-nowrap">Content Type</TableHead>
                                 <TableHead>Deliverables</TableHead>
                                 <TableHead className="whitespace-nowrap">Pricing</TableHead>
                               </TableRow>
                             </TableHeader>
                             <TableBody>
                               {filteredAvailableKOLs.length === 0 ? (
                                 <TableRow>
                                   <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                                     No KOLs found.
                                   </TableCell>
                                 </TableRow>
                               ) : (
                                 filteredAvailableKOLs.map((kol) => (
                                   <TableRow key={kol.id}>
                                     <TableCell>
                                       <Checkbox
                                         checked={newKOLData.selectedKOLs.includes(kol.id)}
                                         onCheckedChange={(checked) => {
                                           if (checked) {
                                             setNewKOLData(prev => ({
                                               ...prev,
                                               selectedKOLs: [...prev.selectedKOLs, kol.id]
                                             }));
                                           } else {
                                             setNewKOLData(prev => ({
                                               ...prev,
                                               selectedKOLs: prev.selectedKOLs.filter(id => id !== kol.id)
                                             }));
                                           }
                                         }}
                                       />
                                     </TableCell>
                                     <TableCell>
                                       <div>
                                         <div className="font-medium">{kol.name}</div>
                                         {kol.link && (
                                           <a 
                                             href={kol.link || ''} 
                                             target="_blank" 
                                             rel="noopener noreferrer"
                                             className="text-sm text-blue-600 hover:text-blue-800"
                                           >
                                             View Profile
                                           </a>
                                         )}
                                       </div>
                                     </TableCell>
                                     <TableCell>
                                       {kol.followers ? KOLService.formatFollowers(kol.followers) : '-'}
                                     </TableCell>
                                     <TableCell>
                                       {kol.region ? (
                                         <div className="flex items-center space-x-1">
                                           <span>{getRegionIcon(kol.region).flag}</span>
                                           <span>{kol.region}</span>
                                         </div>
                                       ) : '-'}
                                     </TableCell>
                                     <TableCell>
                                       {Array.isArray(kol.platform) ? (
                                         <div className="flex gap-1">
                                           {kol.platform.map((platform: string, index: number) => (
                                             <div key={index} className="flex items-center justify-center h-5 w-5" title={platform}>
                                               {getPlatformIcon(platform)}
                                             </div>
                                           ))}
                                         </div>
                                       ) : '-'}
                                     </TableCell>
                                     <TableCell>
                                       {Array.isArray(kol.creator_type) ? (
                                         <div className="flex flex-wrap gap-1">
                                           {kol.creator_type.map((type: string, index: number) => (
                                             <span key={index} className={`px-2 py-1 rounded-md text-xs font-medium ${getCreatorTypeColor(type)}`}>
                                               {type}
                                             </span>
                                           ))}
                                         </div>
                                       ) : '-'}
                                     </TableCell>
                                     <TableCell>
                                       {Array.isArray(kol.content_type) ? (
                                         <div className="flex flex-wrap gap-1">
                                           {kol.content_type.map((type: string, index: number) => (
                                             <span key={index} className={`px-2 py-1 rounded-md text-xs font-medium ${getContentTypeColor(type)}`}>
                                               {type}
                                             </span>
                                           ))}
                                         </div>
                                       ) : '-'}
                                     </TableCell>
                                     <TableCell>
                                       {Array.isArray(kol.deliverables) ? (
                                         <div className="flex flex-wrap gap-1">
                                           {kol.deliverables.map((deliverable: string, index: number) => (
                                             <span key={index} className={`px-2 py-1 rounded-md text-xs font-medium ${getNewContentTypeColor(deliverable)}`}>
                                               {deliverable}
                                             </span>
                                           ))}
                                         </div>
                                       ) : '-'}
                                     </TableCell>
                                     <TableCell>
                                       {kol.pricing ? (
                                         <span className={`px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap ${getPricingColor(kol.pricing)}`}>
                                           {kol.pricing}
                                         </span>
                                       ) : '-'}
                                     </TableCell>
                                   </TableRow>
                                 ))
                               )}
                             </TableBody>
                           </Table>
                         </div>
                       </div>
                       <div className="grid gap-2 w-64">
                         <Label htmlFor="status-select">Default Status</Label>
                         <Select
                           value={newKOLData.hh_status}
                           onValueChange={(value) => setNewKOLData(prev => ({ ...prev, hh_status: value as any }))}
                         >
                           <SelectTrigger className="auth-input">
                             <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                             {CampaignKOLService.getHHStatusOptions().map((status) => (
                               <SelectItem key={status} value={status || ''}>{status}</SelectItem>
                             ))}
                           </SelectContent>
                         </Select>
                       </div>
                       <div className="grid gap-2 max-w-md">
                         <Label htmlFor="notes">Default Notes</Label>
                         <Textarea
                           id="notes"
                           placeholder="Add notes for selected KOLs..."
                           value={newKOLData.notes}
                           onChange={(e) => setNewKOLData(prev => ({ ...prev, notes: e.target.value }))}
                           className="auth-input"
                         />
                       </div>
                     </div>
                     <DialogFooter>
                       <Button variant="outline" onClick={() => setIsAddKOLsDialogOpen(false)}>
                         Cancel
                       </Button>
                       <Button
                         onClick={handleAddKOLs}
                         disabled={newKOLData.selectedKOLs.length === 0 || isAddingKOLs}
                         style={{ backgroundColor: '#3e8692', color: 'white' }}
                       >
                         {isAddingKOLs ? (
                           <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                         ) : (
                           <>Add {newKOLData.selectedKOLs.length} KOL{newKOLData.selectedKOLs.length !== 1 ? 's' : ''}</>
                         )}
                       </Button>
                     </DialogFooter>
                   </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {/* View Toggle */}
                <div className="mb-4">
                  <div className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
                    <div
                      onClick={() => setKolViewMode('overview')}
                      className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer ${kolViewMode === 'overview' ? 'bg-background text-foreground shadow-sm' : ''}`}
                    >
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Overview
                    </div>
                    <div
                      onClick={() => setKolViewMode('table')}
                      className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer ${kolViewMode === 'table' ? 'bg-background text-foreground shadow-sm' : ''}`}
                    >
                      <TableIcon className="h-4 w-4 mr-2" />
                      Table
                    </div>
                    <div
                      onClick={() => setKolViewMode('graph')}
                      className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer ${kolViewMode === 'graph' ? 'bg-background text-foreground shadow-sm' : ''}`}
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      Cards
                    </div>
                  </div>
                </div>
                {/* Overview View */}
                {kolViewMode === 'overview' && (
                  <div className="space-y-6">
                    {/* Overview Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      {/* Total KOLs in Campaign */}
                      <Card className="hover:shadow-lg transition-shadow duration-200">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="bg-gradient-to-br from-[#3e8692] to-[#2d6470] p-3 rounded-lg">
                              <Users className="h-6 w-6 text-white" />
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-gray-900">
                            {campaignKOLs.length}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">Total KOLs in Campaign</p>
                        </CardContent>
                      </Card>

                      {/* Average Followers per KOL */}
                      <Card className="hover:shadow-lg transition-shadow duration-200">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="bg-gradient-to-br from-[#3e8692] to-[#2d6470] p-3 rounded-lg">
                              <BarChart3 className="h-6 w-6 text-white" />
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-gray-900">
                            {(() => {
                              if (campaignKOLs.length > 0) {
                                const totalFollowers = campaignKOLs.reduce((sum, kol) => sum + (kol.master_kol.followers || 0), 0);
                                const average = Math.round(totalFollowers / campaignKOLs.length);
                                console.log('Average followers calculation:', {
                                  totalKOLs: campaignKOLs.length,
                                  totalFollowers,
                                  average,
                                  formatted: KOLService.formatFollowers(average),
                                  sampleData: campaignKOLs.slice(0, 3).map(kol => ({
                                    name: kol.master_kol.name,
                                    followers: kol.master_kol.followers
                                  }))
                                });
                                return KOLService.formatFollowers(average);
                              }
                              return '0';
                            })()}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">Average Followers per KOL</p>
                        </CardContent>
                      </Card>

                      {/* Distribution of KOLs by Platform */}
                      <Card className="hover:shadow-lg transition-shadow duration-200">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="bg-gradient-to-br from-[#3e8692] to-[#2d6470] p-3 rounded-lg">
                              <Globe className="h-6 w-6 text-white" />
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-gray-900">
                            {(() => {
                              const platforms = new Set();
                              campaignKOLs.forEach(kol => {
                                if (kol.master_kol.platform) {
                                  kol.master_kol.platform.forEach((p: string) => platforms.add(p));
                                }
                              });
                              return platforms.size;
                            })()}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">Unique Platform</p>
                        </CardContent>
                      </Card>

                      {/* KOLs by Region */}
                      <Card className="hover:shadow-lg transition-shadow duration-200">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="bg-gradient-to-br from-[#3e8692] to-[#2d6470] p-3 rounded-lg">
                              <Flag className="h-6 w-6 text-white" />
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-gray-900">
                            {(() => {
                              const regions = new Set();
                              campaignKOLs.forEach(kol => {
                                if (kol.master_kol.region) {
                                  regions.add(kol.master_kol.region);
                                }
                              });
                              return regions.size;
                            })()}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">Regions Represented</p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Charts Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Platform Distribution Chart */}
                      <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <h3 className="text-xl font-bold text-gray-900">Distribution of KOLs by Platform</h3>
                            <p className="text-sm text-gray-500 mt-1">Breakdown of KOLs by social platform</p>
                          </div>
                        </div>
                        <div className="h-96">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                              data={(() => {
                                const platformCounts: { [key: string]: number } = {};
                                campaignKOLs.forEach(kol => {
                                  if (kol.master_kol.platform) {
                                    kol.master_kol.platform.forEach((platform: string) => {
                                      platformCounts[platform] = (platformCounts[platform] || 0) + 1;
                                    });
                                  }
                                });
                                return Object.entries(platformCounts).map(([platform, count]) => ({
                                  platform,
                                  count
                                }));
                              })()}
                              margin={{ top: 30, right: 40, left: 40, bottom: 30 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                              <XAxis 
                                dataKey="platform" 
                                axisLine={false}
                                tickLine={false}
                                tick={({ x, y, payload }) => (
                                  <g transform={`translate(${x},${y})`}>
                                    {payload.value === 'X' ? (
                                      <text x={0} y={0} dy={16} textAnchor="middle" fill="#000000" fontSize={14} fontWeight="bold">
                                        𝕏
                                      </text>
                                    ) : payload.value === 'Telegram' ? (
                                      <g>
                                        <svg x={-8} y={0} width={16} height={16} viewBox="0 0 24 24" fill="#0088cc">
                                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.13-.31-1.09-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
                                        </svg>
                                      </g>
                                    ) : (
                                      <text x={0} y={0} dy={16} textAnchor="middle" fill="#64748b" fontSize={12}>
                                        {payload.value}
                                      </text>
                                    )}
                                  </g>
                                )}
                              />
                              <YAxis 
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 12, fill: '#64748b' }}
                              />
                              <Tooltip 
                                contentStyle={{
                                  backgroundColor: 'white',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '12px',
                                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                  fontSize: '14px'
                                }}
                                formatter={(value: number) => [value, 'Count']}
                                labelFormatter={(label: string) => `Platform: ${label}`}
                              />
                              <Bar 
                                dataKey="count" 
                                radius={[8, 8, 0, 0]}
                              >
                                {(() => {
                                  const platformCounts: { [key: string]: number } = {};
                                  campaignKOLs.forEach(kol => {
                                    if (kol.master_kol.platform) {
                                      kol.master_kol.platform.forEach((platform: string) => {
                                        platformCounts[platform] = (platformCounts[platform] || 0) + 1;
                                      });
                                    }
                                  });
                                  return Object.entries(platformCounts).map(([platform, count], index) => {
                                    let color = '#3e8692'; // Default teal
                                    if (platform === 'X') color = '#000000'; // Black for X
                                    else if (platform === 'Telegram') color = '#0088cc'; // Telegram blue
                                    
                                    return (
                                      <Cell key={`cell-${platform}`} fill={color} />
                                    );
                                  });
                                })()}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Region Distribution Chart */}
                      <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <h3 className="text-xl font-bold text-gray-900">KOLs by Region</h3>
                            <p className="text-sm text-gray-500 mt-1">Geographic distribution of KOLs</p>
                          </div>
                        </div>
                        <div className="h-96">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                              data={(() => {
                                const regionCounts: { [key: string]: number } = {};
                                campaignKOLs.forEach(kol => {
                                  if (kol.master_kol.region) {
                                    regionCounts[kol.master_kol.region] = (regionCounts[kol.master_kol.region] || 0) + 1;
                                  }
                                });
                                return Object.entries(regionCounts).map(([region, count]) => ({
                                  region,
                                  count
                                }));
                              })()}
                              margin={{ top: 30, right: 40, left: 40, bottom: 30 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                              <XAxis 
                                dataKey="region" 
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }}
                              />
                              <YAxis 
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 12, fill: '#64748b' }}
                              />
                              <Tooltip 
                                contentStyle={{
                                  backgroundColor: 'white',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '12px',
                                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                  fontSize: '14px'
                                }}
                                formatter={(value: number) => [value, 'Count']}
                                labelFormatter={(label: string) => `Region: ${label}`}
                              />
                              <Bar 
                                dataKey="count" 
                                radius={[8, 8, 0, 0]}
                              >
                                {(() => {
                                  const regionCounts: { [key: string]: number } = {};
                                  campaignKOLs.forEach(kol => {
                                    if (kol.master_kol.region) {
                                      regionCounts[kol.master_kol.region] = (regionCounts[kol.master_kol.region] || 0) + 1;
                                    }
                                  });
                                  return Object.entries(regionCounts).map(([region, count], index) => {
                                    let color = '#3e8692'; // Default teal
                                    if (region === 'China') color = '#de2910'; // Chinese red
                                    else if (region === 'Korea') color = '#cd2e3a'; // Korean red
                                    else if (region === 'Vietnam') color = '#da251d'; // Vietnamese red
                                    else if (region === 'Turkey') color = '#e30a17'; // Turkish red
                                    else if (region === 'Philippines') color = '#0038a8'; // Philippine blue
                                    else if (region === 'Brazil') color = '#009c3b'; // Brazilian green
                                    else if (region === 'Global') color = '#1e40af'; // Global blue
                                    else if (region === 'SEA') color = '#059669'; // Southeast Asia green
                                    
                                    return (
                                      <Cell key={`cell-${region}`} fill={color} />
                                    );
                                  });
                                })()}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Table View */}
                {kolViewMode === 'table' && (
                  <>
                <div className="flex items-center justify-between mb-2">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search KOLs by name, region, or status..."
                      className="pl-10 auth-input"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                <div className="mb-6 mt-6">
                  <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                      <span className="text-sm font-semibold text-gray-700">{selectedKOLs.length} KOL{selectedKOLs.length !== 1 ? 's' : ''} selected</span>
                    </div>
                    <div className="h-4 w-px bg-gray-300"></div>
                    <span className="text-xs text-gray-600 font-medium">Bulk Edit Fields</span>
                  </div>
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="flex flex-col items-end justify-end">
                      <div className="h-5"></div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-gray-600 border-gray-300 hover:bg-gray-50"
                        onClick={() => {
                          const allIds = filteredKOLs.map(kol => kol.id);
                          if (allIds.every(id => selectedKOLs.includes(id))) {
                            setSelectedKOLs(prev => prev.filter(id => !allIds.includes(id)));
                          } else {
                            setSelectedKOLs(prev => Array.from(new Set([...prev, ...allIds])));
                          }
                        }}
                      >
                        {filteredKOLs.length > 0 && filteredKOLs.every(kol => selectedKOLs.includes(kol.id)) ? 'Deselect All' : 'Select All'}
                      </Button>
                    </div>
                    <div className="min-w-[120px] flex flex-col items-end justify-end">
                      <span className="text-xs text-gray-600 font-semibold mb-1 self-start">Status</span>
                      <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
                        <Select value={bulkStatus || ''} onValueChange={(value: string) => setBulkStatus(value as CampaignKOLWithDetails['hh_status'] | "") }>
                          <SelectTrigger
                            className="border-none shadow-none bg-transparent h-7 px-0 py-0 text-xs font-semibold text-black focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none [&>span]:text-xs [&>span]:font-semibold [&>span]:text-black"
                            style={{ outline: 'none', boxShadow: 'none' }}
                          >
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {CampaignKOLService.getHHStatusOptions().map((status) => (
                              <SelectItem key={status} value={status || ''}>{status}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex flex-col items-end justify-end">
                        <div className="h-5"></div>
                        <Button
                          size="sm"
                          className="bg-[#3e8692] hover:bg-[#2d6b75] text-white border-0 shadow-sm whitespace-nowrap"
                          disabled={selectedKOLs.length === 0 || !bulkStatus}
                          onClick={async () => {
                            if (!bulkStatus || selectedKOLs.length === 0) return;
                            setCampaignKOLs(prev => prev.map(kol => selectedKOLs.includes(kol.id) ? { ...kol, hh_status: bulkStatus } : kol));
                            await Promise.all(selectedKOLs.map(kolId => CampaignKOLService.updateCampaignKOL(kolId, { hh_status: bulkStatus })));
                            setBulkStatus("");
                          }}
                        >
                          Apply
                        </Button>
                      </div>
                      <div className="flex flex-col items-end justify-end">
                        <div className="h-5"></div>
                        <Button
                          size="sm"
                          className="bg-red-600 hover:bg-red-700 text-white border-0 shadow-sm whitespace-nowrap"
                          disabled={selectedKOLs.length === 0}
                          onClick={() => {
                            setKolsToDelete(selectedKOLs);
                            setShowKOLDeleteDialog(true);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 font-medium ml-auto whitespace-nowrap">
                      {selectedKOLs.length > 0 && `${selectedKOLs.length} item${selectedKOLs.length !== 1 ? 's' : ''} selected`}
                    </div>
                  </div>
                  </div>
                </div>

                {loadingKOLs ? (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead>KOL</TableHead>
                          <TableHead>Followers</TableHead>
                          <TableHead>Region</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Notes</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...Array(5)].map((_, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <div className="space-y-2">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-3 w-24" />
                              </div>
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-4 w-16" />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                <Skeleton className="h-4 w-4 rounded" />
                                <Skeleton className="h-4 w-20" />
                              </div>
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-8 w-24 rounded-md" />
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-4 w-32" />
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-8 w-8 rounded" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : campaignKOLs.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p className="text-lg font-medium mb-2">No KOLs assigned yet</p>
                    <p className="text-sm text-gray-400">Add KOLs to this campaign to get started.</p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-auto" style={{ position: 'relative' }}>
                    <Table className="min-w-full" style={{
                      tableLayout: 'auto',
                      width: 'auto',
                      borderCollapse: 'collapse',
                      whiteSpace: 'nowrap'
                    }} suppressHydrationWarning>
                      <TableHeader>
                        <TableRow className="bg-gray-50 border-b border-gray-200">
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 text-center whitespace-nowrap">#</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 text-left select-none">KOL</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">
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
                                    <div className="text-xs font-semibold text-gray-600 mb-2">Filter Platform</div>
                                    {['X','Telegram','YouTube','Facebook','TikTok'].map((platform) => (
                                      <div
                                        key={platform}
                                        className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-gray-100 cursor-pointer"
                                        onClick={() => {
                                          const newPlatforms = kolFilters.platform.includes(platform)
                                            ? kolFilters.platform.filter(p => p !== platform)
                                            : [...kolFilters.platform, platform];
                                          setKolFilters(prev => ({ ...prev, platform: newPlatforms }));
                                        }}
                                      >
                                        <Checkbox checked={kolFilters.platform.includes(platform)} />
                                        <div className="flex items-center gap-1" title={platform}>
                                          {getPlatformIcon(platform)}
                                        </div>
                                      </div>
                                    ))}
                                    {kolFilters.platform.length > 0 && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full mt-2 text-xs"
                                        onClick={() => setKolFilters(prev => ({ ...prev, platform: [] }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {kolFilters.platform.length > 0 && (
                                <span className="ml-1 bg-[#3e8692] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  {kolFilters.platform.length}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Followers</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-gray-600 mb-2">Filter Followers</div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Select
                                        value={kolFilters.followers_operator}
                                        onValueChange={(value) => setKolFilters(prev => ({ ...prev, followers_operator: value }))}
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
                                        value={kolFilters.followers_value}
                                        onChange={(e) => setKolFilters(prev => ({ ...prev, followers_value: e.target.value }))}
                                        className="h-8 text-xs auth-input"
                                      />
                                    </div>
                                    {(kolFilters.followers_operator || kolFilters.followers_value) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setKolFilters(prev => ({ ...prev, followers_operator: '', followers_value: '' }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {(kolFilters.followers_operator && kolFilters.followers_value) && (
                                <span className="ml-1 bg-[#3e8692] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  1
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Region</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-gray-600 mb-2">Filter Region</div>
                                    {['Vietnam','Turkey','SEA','Philippines','Korea','Global','China','Brazil'].map((region) => (
                                      <div
                                        key={region}
                                        className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-gray-100 cursor-pointer"
                                        onClick={() => {
                                          const newRegions = kolFilters.region.includes(region)
                                            ? kolFilters.region.filter(r => r !== region)
                                            : [...kolFilters.region, region];
                                          setKolFilters(prev => ({ ...prev, region: newRegions }));
                                        }}
                                      >
                                        <Checkbox checked={kolFilters.region.includes(region)} />
                                        <div className="flex items-center gap-2">
                                          <span>{getRegionIcon(region).flag}</span>
                                          <span className="text-sm">{region}</span>
                                        </div>
                                      </div>
                                    ))}
                                    {kolFilters.region.length > 0 && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full mt-2 text-xs"
                                        onClick={() => setKolFilters(prev => ({ ...prev, region: [] }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {kolFilters.region.length > 0 && (
                                <span className="ml-1 bg-[#3e8692] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  {kolFilters.region.length}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">
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
                                    <div className="text-xs font-semibold text-gray-600 mb-2">Filter Status</div>
                                    {['Curated','Interested','Onboarded','Concluded'].map((status) => (
                                      <div
                                        key={status}
                                        className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-gray-100 cursor-pointer"
                                        onClick={() => {
                                          const newStatuses = kolFilters.hh_status.includes(status)
                                            ? kolFilters.hh_status.filter(s => s !== status)
                                            : [...kolFilters.hh_status, status];
                                          setKolFilters(prev => ({ ...prev, hh_status: newStatuses }));
                                        }}
                                      >
                                        <Checkbox checked={kolFilters.hh_status.includes(status)} />
                                        <span className={`px-2 py-1 rounded-md text-xs font-medium ${getStatusColor(status as any)}`}>
                                          {status}
                                        </span>
                                      </div>
                                    ))}
                                    {kolFilters.hh_status.length > 0 && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full mt-2 text-xs"
                                        onClick={() => setKolFilters(prev => ({ ...prev, hh_status: [] }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {kolFilters.hh_status.length > 0 && (
                                <span className="ml-1 bg-[#3e8692] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  {kolFilters.hh_status.length}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Budget</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-gray-600 mb-2">Filter Budget</div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Select
                                        value={kolFilters.budget_operator}
                                        onValueChange={(value) => setKolFilters(prev => ({ ...prev, budget_operator: value }))}
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
                                        value={kolFilters.budget_value}
                                        onChange={(e) => setKolFilters(prev => ({ ...prev, budget_value: e.target.value }))}
                                        className="h-8 text-xs auth-input"
                                      />
                                    </div>
                                    {(kolFilters.budget_operator || kolFilters.budget_value) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setKolFilters(prev => ({ ...prev, budget_operator: '', budget_value: '' }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {(kolFilters.budget_operator && kolFilters.budget_value) && (
                                <span className="ml-1 bg-[#3e8692] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  1
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Budget Type</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-gray-600 mb-2">Filter Budget Type</div>
                                    {['Token','Fiat','WL'].map((budgetType) => (
                                      <div
                                        key={budgetType}
                                        className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-gray-100 cursor-pointer"
                                        onClick={() => {
                                          const newBudgetTypes = kolFilters.budget_type.includes(budgetType)
                                            ? kolFilters.budget_type.filter(bt => bt !== budgetType)
                                            : [...kolFilters.budget_type, budgetType];
                                          setKolFilters(prev => ({ ...prev, budget_type: newBudgetTypes }));
                                        }}
                                      >
                                        <Checkbox checked={kolFilters.budget_type.includes(budgetType)} />
                                        <span className="text-sm">{budgetType}</span>
                                      </div>
                                    ))}
                                    {kolFilters.budget_type.length > 0 && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full mt-2 text-xs"
                                        onClick={() => setKolFilters(prev => ({ ...prev, budget_type: [] }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {kolFilters.budget_type.length > 0 && (
                                <span className="ml-1 bg-[#3e8692] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  {kolFilters.budget_type.length}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Paid</span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-gray-600 mb-2">Filter Paid (USD)</div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Select
                                        value={kolFilters.paid_operator}
                                        onValueChange={(value) => setKolFilters(prev => ({ ...prev, paid_operator: value }))}
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
                                        value={kolFilters.paid_value}
                                        onChange={(e) => setKolFilters(prev => ({ ...prev, paid_value: e.target.value }))}
                                        className="h-8 text-xs auth-input"
                                      />
                                    </div>
                                    {(kolFilters.paid_operator || kolFilters.paid_value) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setKolFilters(prev => ({ ...prev, paid_operator: '', paid_value: '' }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {(kolFilters.paid_operator && kolFilters.paid_value) && (
                                <span className="ml-1 bg-[#3e8692] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  1
                                </span>
                              )}
                            </div>
                          </TableHead>
                              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Wallet</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Notes</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Content</TableHead>
                          <TableHead className="relative bg-gray-50 select-none">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="bg-white">
                        {filteredKOLs.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={13} className="text-center py-12">
                              <div className="flex flex-col items-center justify-center text-gray-500">
                                <Users className="h-12 w-12 mb-4 text-gray-300" />
                                <p className="text-lg font-medium mb-2">No KOLs match your filters</p>
                                <p className="text-sm text-gray-400 mb-4">Try adjusting your filter criteria</p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setKolFilters({
                                      platform: [],
                                      region: [],
                                      creator_type: [],
                                      content_type: [],
                                      hh_status: [],
                                      budget_type: [],
                                      followers_operator: '',
                                      followers_value: '',
                                      budget_operator: '',
                                      budget_value: '',
                                      paid_operator: '',
                                      paid_value: ''
                                    });
                                  }}
                                >
                                  Reset All Filters
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredKOLs.map((campaignKOL, index) => {
                          return (
                            <TableRow key={campaignKOL.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors border-b border-gray-200`}>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden text-center text-gray-600 group`} style={{ verticalAlign: 'middle' }}>
                                <div className="flex items-center justify-center w-full h-full">
                                  {selectedKOLs.includes(campaignKOL.id) ? (
                                    <Checkbox
                                      checked={true}
                                      onCheckedChange={(checked) => {
                                        setSelectedKOLs(prev => checked ? [...prev, campaignKOL.id] : prev.filter(id => id !== campaignKOL.id));
                                      }}
                                      className="mx-auto"
                                    />
                                  ) : (
                                    <>
                                      <span className="block group-hover:hidden w-full text-center">{index + 1}</span>
                                      <span className="hidden group-hover:flex w-full justify-center">
                                        <Checkbox
                                          checked={selectedKOLs.includes(campaignKOL.id)}
                                          onCheckedChange={(checked) => {
                                            setSelectedKOLs(prev => checked ? [...prev, campaignKOL.id] : prev.filter(id => id !== campaignKOL.id));
                                          }}
                                          className="mx-auto"
                                        />
                                      </span>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden text-gray-600 group`} style={{ verticalAlign: 'middle', fontWeight: 'bold', width: '20%' }}>
                                <div className="flex items-center w-full h-full">
                                  <div className="truncate font-bold">{campaignKOL.master_kol.name}</div>
                                  {campaignKOL.master_kol.link && (
                                    <a 
                                      href={campaignKOL.master_kol.link} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-sm ml-2 underline hover:no-underline font-normal"
                                      style={{ color: 'inherit' }}
                                    >
                                      View Profile
                                    </a>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                <div className="flex gap-1 items-center">
                                  {(campaignKOL.master_kol.platform || []).map((platform: string) => (
                                    <span key={platform} className="flex items-center justify-center h-5 w-5" title={platform}>
                                      {getPlatformIcon(platform)}
                                    </span>
                                  ))}
                                </div>
                              </TableCell>
                                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                  {campaignKOL.master_kol.followers ? KOLService.formatFollowers(campaignKOL.master_kol.followers) : '-'}
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                    {campaignKOL.master_kol.region ? (
                                      <div className="flex items-center space-x-1">
                                        <span>{getRegionIcon(campaignKOL.master_kol.region).flag}</span>
                                        <span>{campaignKOL.master_kol.region}</span>
                                </div>
                                    ) : '-'}
                              </TableCell>
                                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                <Select 
                                  value={campaignKOL.hh_status} 
                                  onValueChange={(value) => handleUpdateKOLStatus(campaignKOL.id, value as any)}
                                >
                                  <SelectTrigger 
                                    className={`border-none shadow-none bg-transparent w-auto h-auto px-2 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none ${getStatusColor(campaignKOL.hh_status)}`}
                                    style={{ outline: 'none', boxShadow: 'none', minWidth: 90 }}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {CampaignKOLService.getHHStatusOptions().map((status) => (
                                          <SelectItem key={status} value={status || ''}>{status}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                    {editingBudgetId === campaignKOL.id ? (
                                      <Input
                                        type="number"
                                        value={editingBudget[campaignKOL.id] ?? campaignKOL.allocated_budget ?? ''}
                                        onChange={e => handleBudgetChange(campaignKOL.id, e.target.value)}
                                        onBlur={() => handleBudgetSave(campaignKOL.id)}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleBudgetSave(campaignKOL.id); }}}
                                        className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none min-h-[32px]"
                                        style={{ outline: 'none', boxShadow: 'none', userSelect: 'text' }}
                                        autoFocus
                                      />
                                    ) : (
                                      <div className="truncate min-h-[32px] cursor-pointer flex items-center px-1 py-1" style={{ minHeight: 32 }} title={campaignKOL.allocated_budget} onClick={() => { setEditingBudgetId(campaignKOL.id); setEditingBudget((prev) => ({ ...prev, [campaignKOL.id]: campaignKOL.allocated_budget ?? '' })); }}>
                                        {campaignKOL.allocated_budget ? `$${Number(campaignKOL.allocated_budget).toLocaleString('en-US')}` : <span className="text-gray-400 italic">Click to add</span>}
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                    <Select 
                                      value={campaignKOL.budget_type || ''} 
                                      onValueChange={(value) => handleUpdateKOLBudgetType(campaignKOL.id, value)}
                                    >
                                      <SelectTrigger 
                                        className="border-none shadow-none bg-transparent w-auto h-auto px-2 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none"
                                        style={{ outline: 'none', boxShadow: 'none', minWidth: 90 }}
                                      >
                                        <SelectValue placeholder="Select type" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="Token">Token</SelectItem>
                                        <SelectItem value="Fiat">Fiat</SelectItem>
                                        <SelectItem value="WL">WL</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                    <div className="truncate min-h-[32px] flex items-center px-1 py-1" style={{ minHeight: 32 }} title={campaignKOL.paid?.toString()}>
                                      {campaignKOL.paid != null ? `$${campaignKOL.paid.toLocaleString()}` : <span className="text-gray-400 italic">No payments</span>}
                                    </div>
                                  </TableCell>
                                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 align-middle overflow-hidden`} style={{ width: '20%' }}>
                                    {editingWalletId === campaignKOL.id ? (
                                      <Input
                                        value={editingWallet[campaignKOL.id] ?? campaignKOL.wallet ?? ''}
                                        onChange={e => handleWalletChange(campaignKOL.id, e.target.value)}
                                        onBlur={() => handleWalletSave(campaignKOL.id)}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleWalletSave(campaignKOL.id); }}}
                                        className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none min-h-[32px]"
                                        style={{ outline: 'none', boxShadow: 'none', userSelect: 'text' }}
                                        autoFocus
                                      />
                                    ) : (
                                      <div className="truncate min-h-[32px] cursor-pointer flex items-center px-1 py-1" style={{ minHeight: 32 }} title={campaignKOL.wallet} onClick={() => { setEditingWalletId(campaignKOL.id); setEditingWallet((prev) => ({ ...prev, [campaignKOL.id]: campaignKOL.wallet ?? '' })); }}>
                                        {campaignKOL.wallet || <span className="text-gray-400 italic">Click to add</span>}
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 align-middle overflow-hidden`} style={{ width: '20%' }}>
                                {editingNotesId === campaignKOL.id ? (
                                  <Input
                                    value={editingNotes[campaignKOL.id] ?? campaignKOL.notes ?? ''}
                                    onChange={e => handleNotesChange(campaignKOL.id, e.target.value)}
                                    onBlur={() => handleNotesSave(campaignKOL.id)}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleNotesSave(campaignKOL.id); }}}
                                    className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none min-h-[32px]"
                                    style={{ outline: 'none', boxShadow: 'none', userSelect: 'text' }}
                                    autoFocus
                                  />
                                ) : (
                                      <div className="truncate min-h-[32px] cursor-pointer flex items-center px-1 py-1" style={{ minHeight: 32 }} title={campaignKOL.notes || ''} onClick={() => { setEditingNotesId(campaignKOL.id); setEditingNotes((prev) => ({ ...prev, [campaignKOL.id]: campaignKOL.notes ?? '' })); }}>
                                    {campaignKOL.notes || <span className="text-gray-400 italic">Click to add notes</span>}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden text-center`}>
                                <div className="font-medium text-gray-900">
                                  {contents.filter(content => content.campaign_kols_id === campaignKOL.id).length}
                                </div>
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} p-2 overflow-hidden`}>
                                <div className="flex space-x-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      const kolName = campaignKOL.master_kol?.name || '';
                                      setActiveTab('contents');
                                      setTimeout(() => {
                                        setContentsSearchTerm(kolName);
                                      }, 100);
                                    }}
                                    title="View Content"
                                  >
                                    <FileText className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setKolsToDelete([campaignKOL.id]);
                                          setShowKOLDeleteDialog(true);
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
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

                {/* Cards View */}
                {kolViewMode === 'graph' && (
                  <>
                    {/* Filters Section */}
                    <div className="mb-4">
                      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                        <div className="flex flex-wrap items-end gap-2">
                          {/* Platform Filter */}
                          <div className="min-w-[120px] flex flex-col items-end justify-end">
                            <span className="text-xs text-gray-600 font-semibold mb-1 self-start">Platform</span>
                            <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
                              <MultiSelect
                                options={['X','Telegram','YouTube','Facebook','TikTok']}
                                selected={kolFilters.platform}
                                onSelectedChange={(platform) => setKolFilters(prev => ({ ...prev, platform }))}
                                className="w-full"
                                triggerContent={
                                  <div className="w-full flex items-center h-7 min-h-[28px]">
                                    {kolFilters.platform.length > 0 ? (
                                      <>
                                        {kolFilters.platform.map(item => (
                                          <span key={item} className="px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800 flex items-center">
                                            {getPlatformIcon(item)}
                                          </span>
                                        ))}
                                      </>
                                    ) : (
                                      <span className="flex items-center text-xs font-semibold text-black">Select</span>
                                    )}
                                    <svg className="h-3 w-3 ml-1 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </div>
                                }
                              />
                            </div>
                          </div>
                          {/* Region Filter */}
                          <div className="min-w-[100px] flex flex-col items-end justify-end">
                            <span className="text-xs text-gray-600 font-semibold mb-1 self-start">Region</span>
                            <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
                              <MultiSelect
                                options={['Vietnam','Turkey','SEA','Philippines','Korea','Global','China','Brazil']}
                                selected={kolFilters.region}
                                onSelectedChange={(region) => setKolFilters(prev => ({ ...prev, region }))}
                                className="w-full"
                                renderOption={(option: string) => (
                                  <div className="flex items-center space-x-2">
                                    <span>{getRegionIcon(option).flag}</span>
                                    <span>{option}</span>
                                  </div>
                                )}
                                triggerContent={
                                  <div className="w-full flex items-center h-7 min-h-[28px]">
                                    {kolFilters.region.length > 0 ? (
                                      <>
                                        {kolFilters.region.map(item => (
                                          <span key={item} className="text-xs font-semibold text-black flex items-center gap-1 mr-2">
                                            <span>{getRegionIcon(item).flag}</span>
                                            <span>{item}</span>
                                          </span>
                                        ))}
                                      </>
                                    ) : (
                                      <span className="flex items-center text-xs font-semibold text-black">Select</span>
                                    )}
                                    <svg className="h-3 w-3 ml-1 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </div>
                                }
                              />
                            </div>
                          </div>
                          {/* Creator Type Filter */}
                          <div className="min-w-[120px] flex flex-col items-end justify-end">
                            <span className="text-xs text-gray-600 font-semibold mb-1 self-start">Creator Type</span>
                            <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
                              <MultiSelect
                                options={['Micro Influencer','KOL','Celebrity']}
                                selected={kolFilters.creator_type}
                                onSelectedChange={(creator_type) => setKolFilters(prev => ({ ...prev, creator_type }))}
                                className="w-full"
                                triggerContent={
                                  <div className="w-full flex items-center h-7 min-h-[28px]">
                                    {kolFilters.creator_type.length > 0 ? (
                                      <>
                                        {kolFilters.creator_type.map(item => (
                                          <span key={item} className={`px-2 py-1 rounded-md text-xs font-medium flex-shrink-0 ${getCreatorTypeColor(item)} mr-1`}>{item}</span>
                                        ))}
                                      </>
                                    ) : (
                                      <span className="flex items-center text-xs font-semibold text-black">Select</span>
                                    )}
                                    <svg className="h-3 w-3 ml-1 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </div>
                                }
                              />
                            </div>
                          </div>
                          {/* Content Type Filter */}
                          <div className="min-w-[120px] flex flex-col items-end justify-end">
                            <span className="text-xs text-gray-600 font-semibold mb-1 self-start">Content Type</span>
                            <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
                              <MultiSelect
                                options={['Meme','News','Trading','Deep Dive','Meme/Cultural Narrative','Drama Queen','Sceptics','Technical Educator','Bridge Builders','Visionaries']}
                                selected={kolFilters.content_type}
                                onSelectedChange={(content_type) => setKolFilters(prev => ({ ...prev, content_type }))}
                                className="w-full"
                                triggerContent={
                                  <div className="w-full flex items-center h-7 min-h-[28px]">
                                    {kolFilters.content_type.length > 0 ? (
                                      <>
                                        {kolFilters.content_type.map(item => (
                                          <span key={item} className={`px-2 py-1 rounded-md text-xs font-medium flex-shrink-0 ${getContentTypeColor(item)} mr-1`}>{item}</span>
                                        ))}
                                      </>
                                    ) : (
                                      <span className="flex items-center text-xs font-semibold text-black">Select</span>
                                    )}
                                    <svg className="h-3 w-3 ml-1 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </div>
                                }
                              />
                            </div>
                          </div>
                          {/* Status Filter */}
                          <div className="min-w-[100px] flex flex-col items-end justify-end">
                            <span className="text-xs text-gray-600 font-semibold mb-1 self-start">Status</span>
                            <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
                              <MultiSelect
                                options={['Curated','Interested','Onboarded','Concluded']}
                                selected={kolFilters.hh_status}
                                onSelectedChange={(hh_status) => setKolFilters(prev => ({ ...prev, hh_status }))}
                                className="w-full"
                                triggerContent={
                                  <div className="w-full flex items-center h-7 min-h-[28px]">
                                    {kolFilters.hh_status.length > 0 ? (
                                      <>
                                        {kolFilters.hh_status.map(item => (
                                          <span key={item} className={`px-2 py-1 rounded-md text-xs font-medium flex-shrink-0 ${getStatusColor(item as any)} mr-1`}>{item}</span>
                                        ))}
                                      </>
                                    ) : (
                                      <span className="flex items-center text-xs font-semibold text-black">Select</span>
                                    )}
                                    <svg className="h-3 w-3 ml-1 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </div>
                                }
                              />
                            </div>
                          </div>
                          {/* Budget Type Filter */}
                          <div className="min-w-[100px] flex flex-col items-end justify-end">
                            <span className="text-xs text-gray-600 font-semibold mb-1 self-start">Budget Type</span>
                            <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
                              <MultiSelect
                                options={['Token','Fiat','WL']}
                                selected={kolFilters.budget_type}
                                onSelectedChange={(budget_type) => setKolFilters(prev => ({ ...prev, budget_type }))}
                                className="w-full"
                                triggerContent={
                                  <div className="w-full flex items-center h-7 min-h-[28px]">
                                    {kolFilters.budget_type.length > 0 ? (
                                      <>
                                        {kolFilters.budget_type.map(item => (
                                          <span key={item} className="px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800 flex-shrink-0 mr-1">{item}</span>
                                        ))}
                                      </>
                                    ) : (
                                      <span className="flex items-center text-xs font-semibold text-black">Select</span>
                                    )}
                                    <svg className="h-3 w-3 ml-1 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </div>
                                }
                              />
                            </div>
                          </div>
                          {/* Followers Filter */}
                          <div className="min-w-[130px] flex flex-col items-end justify-end">
                            <span className="text-xs text-gray-600 font-semibold mb-1 self-start">Followers</span>
                            <div className="w-full flex items-center gap-1 h-7 min-h-[28px] justify-start">
                              <Select
                                value={kolFilters.followers_operator}
                                onValueChange={(value) => setKolFilters(prev => ({ ...prev, followers_operator: value }))}
                              >
                                <SelectTrigger className="border-none shadow-none bg-transparent w-auto h-auto px-1 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none" style={{ outline: 'none', boxShadow: 'none', minWidth: 40 }}>
                                  <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value=">">{'>'}</SelectItem>
                                  <SelectItem value="<">{'<'}</SelectItem>
                                  <SelectItem value="=">=</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input
                                type="number"
                                value={kolFilters.followers_value}
                                onChange={(e) => setKolFilters(prev => ({ ...prev, followers_value: e.target.value }))}
                                className="auth-input h-7 text-xs w-16"
                              />
                            </div>
                          </div>
                          {/* Budget Filter */}
                          <div className="min-w-[130px] flex flex-col items-end justify-end">
                            <span className="text-xs text-gray-600 font-semibold mb-1 self-start">Budget</span>
                            <div className="w-full flex items-center gap-1 h-7 min-h-[28px] justify-start">
                              <Select
                                value={kolFilters.budget_operator}
                                onValueChange={(value) => setKolFilters(prev => ({ ...prev, budget_operator: value }))}
                              >
                                <SelectTrigger className="border-none shadow-none bg-transparent w-auto h-auto px-1 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none" style={{ outline: 'none', boxShadow: 'none', minWidth: 40 }}>
                                  <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value=">">{'>'}</SelectItem>
                                  <SelectItem value="<">{'<'}</SelectItem>
                                  <SelectItem value="=">=</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input
                                type="number"
                                value={kolFilters.budget_value}
                                onChange={(e) => setKolFilters(prev => ({ ...prev, budget_value: e.target.value }))}
                                className="auth-input h-7 text-xs w-16"
                              />
                            </div>
                          </div>
                          {/* Paid Filter */}
                          <div className="min-w-[130px] flex flex-col items-end justify-end">
                            <span className="text-xs text-gray-600 font-semibold mb-1 self-start">Paid (USD)</span>
                            <div className="w-full flex items-center gap-1 h-7 min-h-[28px] justify-start">
                              <Select
                                value={kolFilters.paid_operator}
                                onValueChange={(value) => setKolFilters(prev => ({ ...prev, paid_operator: value }))}
                              >
                                <SelectTrigger className="border-none shadow-none bg-transparent w-auto h-auto px-1 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none" style={{ outline: 'none', boxShadow: 'none', minWidth: 40 }}>
                                  <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value=">">{'>'}</SelectItem>
                                  <SelectItem value="<">{'<'}</SelectItem>
                                  <SelectItem value="=">=</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input
                                type="number"
                                value={kolFilters.paid_value}
                                onChange={(e) => setKolFilters(prev => ({ ...prev, paid_value: e.target.value }))}
                                className="auth-input h-7 text-xs w-16"
                              />
                            </div>
                          </div>
                          {/* Reset Filters Button */}
                          <div className="flex flex-col items-end justify-end">
                            <span className="text-xs text-transparent mb-1 self-start">Reset</span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7"
                              onClick={() => {
                                setKolFilters({
                                  platform: [],
                                  region: [],
                                  creator_type: [],
                                  content_type: [],
                                  hh_status: [],
                                  budget_type: [],
                                  followers_operator: '',
                                  followers_value: '',
                                  budget_operator: '',
                                  budget_value: '',
                                  paid_operator: '',
                                  paid_value: ''
                                });
                              }}
                            >
                              Reset Filters
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredKOLs.map((campaignKOL) => (
                      <Card key={campaignKOL.id} className="hover:shadow-lg transition-shadow duration-200">
                        <CardHeader className="pb-4">
                          <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-gradient-to-br from-[#3e8692] to-[#2d6470] rounded-full flex items-center justify-center mb-3">
                              <span className="text-white font-bold text-xl">
                                {campaignKOL.master_kol.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="mb-2">
                              <h3 className="font-semibold text-gray-900 text-lg">{campaignKOL.master_kol.name}</h3>
                              <p className="text-sm text-gray-500">{campaignKOL.master_kol.region || 'No region'}</p>
                            </div>
                            <div className="flex items-center space-x-2">
                              {(campaignKOL.master_kol.platform || []).map((platform: string) => (
                                <span key={platform} className="flex items-center justify-center h-6 w-6" title={platform}>
                                  {getPlatformIcon(platform)}
                                </span>
                              ))}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {/* Followers */}
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Followers</span>
                            <span className="font-medium text-gray-900">
                              {campaignKOL.master_kol.followers ? KOLService.formatFollowers(campaignKOL.master_kol.followers) : '-'}
                            </span>
                          </div>

                          {/* Status */}
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Status</span>
                            <Badge className={getStatusColor(campaignKOL.hh_status)}>
                              {campaignKOL.hh_status || 'No status'}
                            </Badge>
                          </div>

                          {/* Allocated Budget */}
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Allocated Budget</span>
                            <span className="font-medium text-gray-900">
                              {campaignKOL.allocated_budget ? `$${Number(campaignKOL.allocated_budget).toLocaleString('en-US')}` : '-'}
                            </span>
                          </div>

                          {/* Budget Type */}
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Budget Type</span>
                            <span className="font-medium text-gray-900">
                              {campaignKOL.budget_type || '-'}
                            </span>
                          </div>

                          {/* Paid Amount */}
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Paid</span>
                            <span className="font-medium text-gray-900">
                              {campaignKOL.paid ? `$${campaignKOL.paid}` : '-'}
                            </span>
                          </div>

                          {/* Content Count */}
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Content</span>
                            <span className="font-medium text-gray-900">
                              {contents.filter(content => content.campaign_kols_id === campaignKOL.id).length}
                            </span>
                          </div>

                          {/* Wallet */}
                          {campaignKOL.wallet && (
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-600">Wallet</span>
                              <span className="font-medium text-gray-900 truncate" title={campaignKOL.wallet}>
                                {campaignKOL.wallet}
                              </span>
                            </div>
                          )}

                          {/* Notes */}
                          {campaignKOL.notes && (
                            <div className="pt-2 border-t border-gray-100">
                              <span className="text-sm text-gray-600">Notes</span>
                              <p className="text-sm text-gray-900 mt-1 line-clamp-2">{campaignKOL.notes}</p>
                            </div>
                          )}

                          {/* Profile Link */}
                          {campaignKOL.master_kol.link && (
                            <div className="pt-2 border-t border-gray-100">
                              <a 
                                href={campaignKOL.master_kol.link} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 hover:text-blue-800 underline"
                              >
                                View Profile →
                              </a>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                    </div>
                  </>
                )}
              </CardContent>
            </div>
          </TabsContent>
          
          <TabsContent value="contents" className="mt-4">
            <div className="w-full bg-white border border-gray-200 shadow-sm p-6">
              <CardHeader className="pb-6 border-b border-gray-100 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-gray-100 p-2 rounded-lg"><FileText className="h-6 w-6 text-gray-600" /></div>
                  <h2 className="text-2xl font-bold text-gray-900">Contents</h2>
                </div>
                <div className="flex items-center">
                  <Dialog open={false} onOpenChange={setIsAddContentsDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        style={{ backgroundColor: '#3e8692', color: 'white' }}
                        className="hover:opacity-90"
                        onClick={async (e) => {
                          e.preventDefault();
                          const newId = `new-${Date.now()}`;
                          const newContent: any = {
                            id: newId,
                            campaign_id: id,
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
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Add Content</DialogTitle>
                      </DialogHeader>
                      <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto px-3 pb-6">
                        <div className="grid gap-2">
                          <Label className="mb-1 block">KOL</Label>
                          <Select
                            value={addContentData.campaign_kols_id}
                            onValueChange={v => setAddContentData(d => ({ ...d, campaign_kols_id: v }))}
                          >
                            <SelectTrigger className="auth-input">
                              <SelectValue placeholder="Select KOL" />
                            </SelectTrigger>
                            <SelectContent>
                              {campaignKOLs.map(kol => (
                                <SelectItem key={kol.id} value={kol.id}>{kol.master_kol.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label className="mb-1 block">Activation Date</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className="auth-input justify-start text-left font-normal focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692]"
                                style={{
                                  borderColor: "#e5e7eb",
                                  backgroundColor: "white",
                                  color: addContentData.activation_date ? "#111827" : "#9ca3af"
                                }}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {addContentData.activation_date ? addContentData.activation_date : "Select activation date"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="!bg-white border shadow-md w-auto p-0 z-50" align="start">
                              <CalendarComponent
                                mode="single"
                                selected={addContentData.activation_date ? new Date(addContentData.activation_date) : undefined}
                                onSelect={date => setAddContentData(d => ({
                                  ...d,
                                  activation_date: date ? formatDateLocal(date) : ''
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
                          <Label>Content Link</Label>
                          <Input
                            type="url"
                            placeholder="https://..."
                            value={addContentData.content_link}
                            onChange={e => setAddContentData(d => ({ ...d, content_link: e.target.value }))}
                            className="auth-input"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label>Platform</Label>
                            <Select
                              value={addContentData.platform}
                              onValueChange={v => setAddContentData(d => ({ ...d, platform: v }))}
                            >
                              <SelectTrigger className="auth-input">
                                <SelectValue placeholder="Select Platform" />
                              </SelectTrigger>
                              <SelectContent>
                                {fieldOptions.platforms.map(platform => (
                                  <SelectItem key={platform} value={platform}>{platform}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <Label>Type</Label>
                            <Select
                              value={addContentData.type}
                              onValueChange={v => setAddContentData(d => ({ ...d, type: v }))}
                            >
                              <SelectTrigger className="auth-input">
                                <SelectValue placeholder="Select Type" />
                              </SelectTrigger>
                              <SelectContent>
                                {fieldOptions.deliverables.map(type => (
                                  <SelectItem key={type} value={type}>{type}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label>Status</Label>
                            <Select
                              value={addContentData.status}
                              onValueChange={v => setAddContentData(d => ({ ...d, status: v }))}
                            >
                              <SelectTrigger className="auth-input">
                                <SelectValue placeholder="Select Status" />
                              </SelectTrigger>
                              <SelectContent>
                                {contentStatusOptions.map(option => (
                                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <Label>Impressions</Label>
                            <Input
                              type="number"
                              min={0}
                              value={addContentData.impressions}
                              onChange={e => setAddContentData(d => ({ ...d, impressions: e.target.value }))}
                              className="auth-input"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label>Likes</Label>
                            <Input
                              type="number"
                              min={0}
                              value={addContentData.likes}
                              onChange={e => setAddContentData(d => ({ ...d, likes: e.target.value }))}
                              className="auth-input"
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label>Retweets</Label>
                            <Input
                              type="number"
                              min={0}
                              value={addContentData.retweets}
                              onChange={e => setAddContentData(d => ({ ...d, retweets: e.target.value }))}
                              className="auth-input"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label>Comments</Label>
                          <Input
                            type="number"
                            min={0}
                            value={addContentData.comments}
                            onChange={e => setAddContentData(d => ({ ...d, comments: e.target.value }))}
                            className="auth-input"
                          />
                          </div>
                          <div className="grid gap-2">
                            <Label>Bookmarks</Label>
                            <Input
                              type="number"
                              min={0}
                              value={addContentData.bookmarks}
                              onChange={e => setAddContentData(d => ({ ...d, bookmarks: e.target.value }))}
                              className="auth-input"
                            />
                          </div>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddContentsDialogOpen(false)}>Cancel</Button>
                        <Button
                          style={{ backgroundColor: '#3e8692', color: 'white' }}
                          disabled={
                            !addContentData.campaign_kols_id ||
                            !addContentData.activation_date ||
                            !addContentData.content_link ||
                            !addContentData.platform ||
                            !addContentData.type ||
                            !addContentData.status ||
                            isAddingContent
                          }
                          onClick={async () => {
                            setIsAddingContent(true);
                            const payload = {
                              campaign_id: id,
                              campaign_kols_id: addContentData.campaign_kols_id,
                              activation_date: addContentData.activation_date || null,
                              content_link: addContentData.content_link || null,
                              platform: addContentData.platform || null,
                              type: addContentData.type || null,
                              status: addContentData.status || null,
                              impressions: addContentData.impressions ? Number(addContentData.impressions) : null,
                              likes: addContentData.likes ? Number(addContentData.likes) : null,
                              retweets: addContentData.retweets ? Number(addContentData.retweets) : null,
                              comments: addContentData.comments ? Number(addContentData.comments) : null,
                              bookmarks: addContentData.bookmarks ? Number(addContentData.bookmarks) : null,
                            };
                            console.log('Add Content payload:', payload);
                            try {
                              const { error, data } = await supabase.from('contents').insert(payload);
                              if (error) {
                                console.error('Supabase error:', error.message, error.details, error.hint);
                                return;
                              }
                              setIsAddContentsDialogOpen(false);
                              setAddContentData({
                                campaign_kols_id: '',
                                activation_date: '',
                                content_link: '',
                                platform: '',
                                type: '',
                                status: '',
                                impressions: '',
                                likes: '',
                                retweets: '',
                                comments: '',
                                bookmarks: '',
                              });
                              // Immediately update the table with the new content
                              const arr: any[] = (data ?? []) as any[];
                              if (arr.length > 0 && typeof arr[0] === 'object' && arr[0] !== null) {
                                let newContent: any = { ...arr[0] };
                                const kolsArr: any[] = Array.isArray(campaignKOLs) ? campaignKOLs : [];
                                let kol = kolsArr.find((k: any) => k.id === newContent.campaign_kols_id);
                                if (!newContent.master_kol && kol) {
                                  newContent.master_kol = kol.master_kol;
                                }
                                if (!newContent.master_kol) {
                                  newContent.master_kol = { name: 'Unknown', link: '' };
                                }
                                setContents((prev: any[]) => [newContent, ...prev]);
                              }
                              // Refetch contents to ensure table is properly updated
                              const fetchContentsAgain = async () => {
                                setLoadingContents(true);
                                try {
                                  const { data, error } = await supabase
                                    .from('contents')
                                    .select('*')
                                    .eq('campaign_id', id);
                                  if (error) throw error;
                                  setContents(data || []);
                                } catch (error) {
                                  console.error('Error refetching contents:', error);
                                } finally {
                                  setLoadingContents(false);
                                }
                              };
                              await fetchContentsAgain();
                            } catch (err) {
                              console.error('Unexpected error:', err);
                            } finally {
                              setIsAddingContent(false);
                            }
                          }}
                        >
                          {isAddingContent ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                          ) : (
                            'Add Content'
                          )}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {/* View Toggle */}
                <div className="mb-4">
                  <div className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
                    <div
                      onClick={() => setContentsViewMode('overview')}
                      className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer ${contentsViewMode === 'overview' ? 'bg-background text-foreground shadow-sm' : ''}`}
                    >
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Overview
                    </div>
                    <div
                      onClick={() => setContentsViewMode('table')}
                      className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer ${contentsViewMode === 'table' ? 'bg-background text-foreground shadow-sm' : ''}`}
                    >
                      <TableIcon className="h-4 w-4 mr-2" />
                      Table
                    </div>
                  </div>
                </div>
                {/* Overview Tab - Metrics from Information */}
                {contentsViewMode === 'overview' && (
                  <div className="space-y-6">
                    {/* Metrics Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {/* Total Impressions */}
                      <Card className="hover:shadow-lg transition-shadow duration-200">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="bg-gradient-to-br from-[#3e8692] to-[#2d6470] p-3 rounded-lg">
                              <BarChart3 className="h-6 w-6 text-white" />
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-gray-900">
                            {(() => {
                              const totalImpressions = contents.reduce((sum, content) => sum + (content.impressions || 0), 0);
                              return totalImpressions.toLocaleString();
                            })()}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">Total Impressions</p>
                        </CardContent>
                      </Card>

                      {/* Total Comments */}
                      <Card className="hover:shadow-lg transition-shadow duration-200">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="bg-gradient-to-br from-[#3e8692] to-[#2d6470] p-3 rounded-lg">
                              <BarChart3 className="h-6 w-6 text-white" />
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-gray-900">
                            {(() => {
                              const totalComments = contents.reduce((sum, content) => sum + (content.comments || 0), 0);
                              return totalComments.toLocaleString();
                            })()}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">Total Comments</p>
                        </CardContent>
                      </Card>

                      {/* Total Retweets */}
                      <Card className="hover:shadow-lg transition-shadow duration-200">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="bg-gradient-to-br from-[#3e8692] to-[#2d6470] p-3 rounded-lg">
                              <BarChart3 className="h-6 w-6 text-white" />
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-gray-900">
                            {(() => {
                              const totalRetweets = contents.reduce((sum, content) => sum + (content.retweets || 0), 0);
                              return totalRetweets.toLocaleString();
                            })()}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">Total Retweets</p>
                        </CardContent>
                      </Card>

                      {/* Total Likes */}
                      <Card className="hover:shadow-lg transition-shadow duration-200">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="bg-gradient-to-br from-[#3e8692] to-[#2d6470] p-3 rounded-lg">
                              <BarChart3 className="h-6 w-6 text-white" />
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-gray-900">
                            {(() => {
                              const totalLikes = contents.reduce((sum, content) => sum + (content.likes || 0), 0);
                              return totalLikes.toLocaleString();
                            })()}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">Total Likes</p>
                        </CardContent>
                      </Card>

                      {/* Total Engagements */}
                      <Card className="hover:shadow-lg transition-shadow duration-200">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="bg-gradient-to-br from-[#3e8692] to-[#2d6470] p-3 rounded-lg">
                              <BarChart3 className="h-6 w-6 text-white" />
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-gray-900">
                            {(() => {
                              const totalEngagements = contents.reduce((sum, content) =>
                                sum + (content.likes || 0) + (content.comments || 0) + (content.retweets || 0) + (content.bookmarks || 0), 0);
                              return totalEngagements.toLocaleString();
                            })()}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">Total Engagements</p>
                        </CardContent>
                      </Card>

                      {/* Total Bookmarks */}
                      <Card className="hover:shadow-lg transition-shadow duration-200">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="bg-gradient-to-br from-[#3e8692] to-[#2d6470] p-3 rounded-lg">
                              <BarChart3 className="h-6 w-6 text-white" />
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-gray-900">
                            {(() => {
                              const totalBookmarks = contents.reduce((sum, content) => sum + (content.bookmarks || 0), 0);
                              return totalBookmarks.toLocaleString();
                            })()}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">Total Bookmarks</p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Average Engagement Rate */}
                    <Card className="hover:shadow-lg transition-shadow duration-200">
                      <CardHeader>
                        <CardTitle className="text-lg font-semibold text-gray-900">Average Engagement Rate</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-gray-900">
                          {(() => {
                            const totalImpressions = contents.reduce((sum, content) => sum + (content.impressions || 0), 0);
                            const totalEngagements = contents.reduce((sum, content) =>
                              sum + (content.likes || 0) + (content.comments || 0) + (content.retweets || 0) + (content.bookmarks || 0), 0);
                            const engagementRate = totalImpressions > 0 ? (totalEngagements / totalImpressions) * 100 : 0;
                            return `${engagementRate.toFixed(2)}%`;
                          })()}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">Engagement Rate = (Likes + Comments + Retweets + Bookmarks) / Impressions</p>
                      </CardContent>
                    </Card>

                    {/* Charts Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Impressions Over Time */}
                      <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <h3 className="text-xl font-bold text-gray-900">Impressions Over Time</h3>
                            <p className="text-sm text-gray-500 mt-1">Impressions trend by activation date</p>
                          </div>
                        </div>
                        <div className="h-96">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={(() => {
                                // Group content by activation date and sum impressions
                                const impressionsByDate = contents.reduce((acc, content) => {
                                  if (content.activation_date) {
                                    const date = content.activation_date;
                                    if (!acc[date]) {
                                      acc[date] = 0;
                                    }
                                    acc[date] += content.impressions || 0;
                                  }
                                  return acc;
                                }, {} as Record<string, number>);

                                return Object.entries(impressionsByDate)
                                  .map(([date, impressions]) => ({
                                    date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                                    impressions
                                  }))
                                  .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                              })()}
                              margin={{ top: 30, right: 40, left: 40, bottom: 30 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                              <XAxis
                                dataKey="date"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }}
                              />
                              <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 12, fill: '#64748b' }}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: 'white',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '12px',
                                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                  fontSize: '14px'
                                }}
                                formatter={(value: number) => [value.toLocaleString(), 'Impressions']}
                                labelFormatter={(label: string) => `Date: ${label}`}
                              />
                              <Line
                                type="monotone"
                                dataKey="impressions"
                                stroke="#3e8692"
                                strokeWidth={3}
                                dot={{ fill: '#3e8692', strokeWidth: 2, r: 4 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Impressions by Platform */}
                      <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <h3 className="text-xl font-bold text-gray-900">Impressions by Platform</h3>
                            <p className="text-sm text-gray-500 mt-1">Impressions distribution across platforms</p>
                          </div>
                        </div>
                        <div className="h-96">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={(() => {
                                  const platformImpressions = contents.reduce((acc, content) => {
                                    const platform = content.platform || 'Unknown';
                                    if (!acc[platform]) {
                                      acc[platform] = 0;
                                    }
                                    acc[platform] += content.impressions || 0;
                                    return acc;
                                  }, {} as Record<string, number>);

                                  return Object.entries(platformImpressions).map(([platform, impressions]) => ({
                                    platform,
                                    impressions
                                  }));
                                })()}
                                cx="50%"
                                cy="50%"
                                outerRadius={120}
                                dataKey="impressions"
                                label={({ platform, impressions }) => `${platform}: ${impressions.toLocaleString()}`}
                              >
                                {(() => {
                                  const platformImpressions = contents.reduce((acc, content) => {
                                    const platform = content.platform || 'Unknown';
                                    if (!acc[platform]) {
                                      acc[platform] = 0;
                                    }
                                    acc[platform] += content.impressions || 0;
                                    return acc;
                                  }, {} as Record<string, number>);

                                  const colors = ['#3e8692', '#2d6470', '#1e4a5a', '#0f2d3a'];
                                  return Object.entries(platformImpressions).map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                                  ));
                                })()}
                              </Pie>
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: 'white',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '12px',
                                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                  fontSize: '14px'
                                }}
                                formatter={(value: number, name: string, props: any) => {
                                  const totalImpressions = contents.reduce((sum, content) => sum + (content.impressions || 0), 0);
                                  const percentage = totalImpressions > 0 ? ((value / totalImpressions) * 100).toFixed(1) : 0;
                                  return [
                                    `${value.toLocaleString()} (${percentage}%)`,
                                    'Impressions'
                                  ];
                                }}
                                labelFormatter={(label: string) => `Platform: ${label}`}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Table Tab - Existing Contents Table */}
                {contentsViewMode === 'table' && (
                  <>
                <div className="flex items-center justify-between mb-2">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search Contents by KOL, platform, or status..."
                      className="pl-10 auth-input"
                      value={contentsSearchTerm}
                      onChange={e => setContentsSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                <div className="mb-6 mt-6">
                  <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                        <span className="text-sm font-semibold text-gray-700">{selectedContents.length} Content{selectedContents.length !== 1 ? 's' : ''} selected</span>
                      </div>
                      <div className="h-4 w-px bg-gray-300"></div>
                      <span className="text-xs text-gray-600 font-medium">Bulk Edit Fields</span>
                    </div>
                    <div className="flex flex-wrap items-end gap-4">
                      <div className="flex flex-col items-end justify-end">
                        <div className="h-5"></div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-gray-600 border-gray-300 hover:bg-gray-50"
                          onClick={handleSelectAllContents}
                        >
                          {filteredContents.length > 0 && filteredContents.every(content => selectedContents.includes(content.id)) ? 'Deselect All' : 'Select All'}
                        </Button>
                      </div>
                      <div className="min-w-[120px] flex flex-col items-end justify-end">
                        <span className="text-xs text-gray-600 font-semibold mb-1 self-start">Status</span>
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
                      <div className="flex gap-2">
                        <div className="flex flex-col items-end justify-end">
                          <div className="h-5"></div>
                          <Button
                            size="sm"
                            className="bg-[#3e8692] hover:bg-[#2d6b75] text-white border-0 shadow-sm whitespace-nowrap"
                            disabled={selectedContents.length === 0 || !bulkContentStatus}
                            onClick={handleBulkStatusChange}
                          >
                            Apply
                          </Button>
                        </div>
                        <div className="flex flex-col items-end justify-end">
                          <div className="h-5"></div>
                          <Button
                            size="sm"
                            className="bg-red-600 hover:bg-red-700 text-white border-0 shadow-sm whitespace-nowrap"
                            disabled={selectedContents.length === 0}
                            onClick={() => setShowBulkDeleteDialog(true)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 font-medium ml-auto whitespace-nowrap">
                        {selectedContents.length > 0 && `${selectedContents.length} item${selectedContents.length !== 1 ? 's' : ''} selected`}
                      </div>
                    </div>
                  </div>
                </div>
                {loadingContents ? (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50 border-b border-gray-200">
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 text-center whitespace-nowrap">#</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 text-left select-none">KOL</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Platform</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Type</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Status</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Activation Date</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Content Link</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Impressions</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Likes</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Retweets</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Comments</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Bookmarks</TableHead>
                          <TableHead className="relative bg-gray-50 select-none">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...Array(5)].map((_, i) => (
                          <TableRow key={i}>
                            {[...Array(12)].map((_, j) => (
                              <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : contents.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p className="text-lg font-medium mb-2">No content created yet</p>
                    <p className="text-sm text-gray-400">Content created for this campaign will appear here.</p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-auto" style={{ minHeight: '400px', position: 'relative' }}>
                    <Table className="min-w-full" style={{ tableLayout: 'auto', width: 'auto', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                      <TableHeader>
                        <TableRow className="bg-gray-50 border-b border-gray-200">
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 text-center whitespace-nowrap">#</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 text-left select-none">KOL</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">
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
                                    <div className="text-xs font-semibold text-gray-600 mb-2">Filter Platform</div>
                                    {['X','Telegram','YouTube','Facebook','TikTok'].map((platform) => (
                                      <div
                                        key={platform}
                                        className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-gray-100 cursor-pointer"
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
                                <span className="ml-1 bg-[#3e8692] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  {contentFilters.platform.length}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">
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
                                    <div className="text-xs font-semibold text-gray-600 mb-2">Filter Type</div>
                                    {['Video','Thread','Post','Story','Reel','Short'].map((type) => (
                                      <div
                                        key={type}
                                        className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-gray-100 cursor-pointer"
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
                                <span className="ml-1 bg-[#3e8692] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  {contentFilters.type.length}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">
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
                                    <div className="text-xs font-semibold text-gray-600 mb-2">Filter Status</div>
                                    {contentStatusOptions.map((option) => (
                                      <div
                                        key={option.value}
                                        className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-gray-100 cursor-pointer"
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
                                <span className="ml-1 bg-[#3e8692] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  {contentFilters.status.length}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Activation Date</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Content Link</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Impressions</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Likes</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Retweets</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Comments</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Bookmarks</TableHead>
                          <TableHead className="relative bg-gray-50 select-none">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="bg-white">
                        {filteredContents.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={13} className="text-center py-12">
                              <div className="flex flex-col items-center justify-center text-gray-500">
                                <FileText className="h-12 w-12 mb-4 text-gray-300" />
                                <p className="text-lg font-medium mb-2">No content matches your filters</p>
                                <p className="text-sm text-gray-400 mb-4">Try adjusting your filter criteria</p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setContentFilters({
                                      platform: [],
                                      type: [],
                                      status: []
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
                            <TableRow key={content.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors border-b border-gray-200`}>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden text-center text-gray-600 group`} style={{ verticalAlign: 'middle' }}>
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
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden text-gray-600 group`} style={{ verticalAlign: 'middle', fontWeight: 'bold', width: '20%' }}>
                                <div className="flex items-center w-full h-full">
                                  {renderEditableContentCell(content.campaign_kols_id, 'campaign_kols_id', content)}
                                </div>
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                {renderEditableContentCell(content.platform, 'platform', content)}
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                {renderEditableContentCell(content.type, 'type', content)}
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                {renderEditableContentCell(content.status, 'status', content)}
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                {renderEditableContentCell(content.activation_date, 'activation_date', content)}
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                {renderEditableContentCell(content.content_link, 'content_link', content)}
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                {renderEditableContentCell(content.impressions, 'impressions', content)}
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                {renderEditableContentCell(content.likes, 'likes', content)}
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                {renderEditableContentCell(content.retweets, 'retweets', content)}
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                {renderEditableContentCell(content.comments, 'comments', content)}
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                {renderEditableContentCell(content.bookmarks, 'bookmarks', content)}
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} p-2 overflow-hidden`}>
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
            </div>
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments" className="mt-4">
            <div className="w-full bg-white border border-gray-200 shadow-sm p-6">
              <CardHeader className="pb-6 border-b border-gray-100 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-gray-100 p-2 rounded-lg">
                    <DollarSign className="h-6 w-6 text-gray-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900">Payment Management</h2>
                </div>
                <div className="flex items-center gap-3">
                  <Dialog open={isAddingPayment} onOpenChange={setIsAddingPayment}>
                    <DialogTrigger asChild>
                      <Button size="sm" style={{ backgroundColor: '#3e8692', color: 'white' }} className="hover:opacity-90">
                        <Plus className="h-4 w-4 mr-2" />
                        Record Payment
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
                      <DialogHeader>
                        <DialogTitle>Record Payment</DialogTitle>
                      </DialogHeader>
                      <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto px-3 pb-6">
                        <div className="grid gap-2">
                          <Label htmlFor="kol-select">KOL</Label>
                          <Select
                            value={newPaymentData.campaign_kol_id}
                            onValueChange={(value) => setNewPaymentData(prev => ({ ...prev, campaign_kol_id: value }))}
                          >
                            <SelectTrigger className="auth-input">
                              <SelectValue placeholder="Select KOL" />
                            </SelectTrigger>
                            <SelectContent>
                              {campaignKOLs.map((kol) => (
                                <SelectItem key={kol.id} value={kol.id}>
                                  {kol.master_kol.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="amount">Amount (USD)</Label>
                          <div className="relative w-full">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">$</span>
                            <Input
                              id="amount"
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9,]*"
                              className="auth-input pl-6 w-full"
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
                                className="auth-input justify-start text-left font-normal focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692]"
                                style={{
                                  borderColor: "#e5e7eb",
                                  backgroundColor: "white",
                                  color: newPaymentData.payment_date ? "#111827" : "#9ca3af"
                                }}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {newPaymentData.payment_date ? newPaymentData.payment_date : "Select payment date"}
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
                          <Label htmlFor="payment-method">Payment Method</Label>
                          <Select
                            value={newPaymentData.payment_method}
                            onValueChange={(value) => setNewPaymentData(prev => ({ ...prev, payment_method: value }))}
                          >
                            <SelectTrigger className="auth-input">
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
                          <Label htmlFor="content">Content (Optional)</Label>
                          <Select
                            value={newPaymentData.content_id}
                            onValueChange={(value) => setNewPaymentData(prev => ({ ...prev, content_id: value }))}
                          >
                            <SelectTrigger className="auth-input">
                              <SelectValue placeholder="Select content" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No content linked</SelectItem>
                              {contents
                                .filter(content => content.campaign_kols_id === newPaymentData.campaign_kol_id)
                                .map(content => (
                                  <SelectItem key={content.id} value={content.id}>
                                    {content.type || 'Content'} - {content.platform || 'Unknown'} 
                                    {content.activation_date && ` (${new Date(content.activation_date).toLocaleDateString()})`}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="transaction-id">Transaction ID (Optional)</Label>
                          <Input
                            id="transaction-id"
                            value={newPaymentData.transaction_id}
                            onChange={(e) => setNewPaymentData(prev => ({ ...prev, transaction_id: e.target.value }))}
                            placeholder="Enter transaction ID"
                            className="auth-input"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="notes">Notes (Optional)</Label>
                          <Textarea
                            id="notes"
                            value={newPaymentData.notes}
                            onChange={(e) => setNewPaymentData(prev => ({ ...prev, notes: e.target.value }))}
                            placeholder="Add any notes about this payment"
                            rows={3}
                            className="auth-input"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddingPayment(false)}>
                          Cancel
                        </Button>
                        <Button 
                          onClick={handleAddPayment} 
                          disabled={!newPaymentData.campaign_kol_id || newPaymentData.amount <= 0}
                          style={{ backgroundColor: '#3e8692', color: 'white' }}
                          className="hover:opacity-90"
                        >
                          Record Payment
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {/* View Toggle */}
                <div className="mb-4">
                  <div className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
                    <div
                      onClick={() => setPaymentViewMode('table')}
                      className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer ${paymentViewMode === 'table' ? 'bg-background text-foreground shadow-sm' : ''}`}
                    >
                      <TableIcon className="h-4 w-4 mr-2" />
                      Table
                    </div>
                    <div
                      onClick={() => setPaymentViewMode('graph')}
                      className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer ${paymentViewMode === 'graph' ? 'bg-background text-foreground shadow-sm' : ''}`}
                    >
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Graph
                    </div>
                  </div>
                </div>
                
                {/* Table View */}
                {paymentViewMode === 'table' && (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Search Payments by KOL, method, or notes..."
                          className="pl-10 auth-input"
                          value={paymentsSearchTerm}
                          onChange={e => setPaymentsSearchTerm(e.target.value)}
                        />
                      </div>
                    </div>
                {/* Bulk Menu */}
                {selectedPayments.length > 0 && (
                  <div className="mb-4">
                    <Card className="border border-gray-200 bg-white">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-gray-700">
                              {selectedPayments.length} payments selected
                            </span>
                            <span className="text-sm text-gray-500">Bulk Edit Fields</span>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleSelectAllPayments}
                            className="h-8 px-3 text-xs"
                          >
                            {(() => {
                              const filteredPayments = payments.filter(payment => {
                                const kol = campaignKOLs.find(k => k.id === payment.campaign_kol_id);
                                const search = paymentsSearchTerm.toLowerCase();
                                return (
                                  !search ||
                                  (kol?.master_kol?.name?.toLowerCase().includes(search)) ||
                                  (payment.payment_method?.toLowerCase().includes(search)) ||
                                  (payment.notes?.toLowerCase().includes(search))
                                );
                              });
                              const allSelected = filteredPayments.length > 0 && filteredPayments.every(p => selectedPayments.includes(p.id));
                              return allSelected ? 'Deselect All' : 'Select All';
                            })()}
                          </Button>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 max-w-xs">
                            <Select value={bulkPaymentMethod} onValueChange={v => setBulkPaymentMethod(v)}>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select payment method" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Token">Token</SelectItem>
                                <SelectItem value="Fiat">Fiat</SelectItem>
                                <SelectItem value="WL">WL</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            size="sm"
                            style={{ backgroundColor: '#3e8692', color: 'white' }}
                            disabled={selectedPayments.length === 0 || !bulkPaymentMethod}
                            onClick={handleBulkPaymentMethodChange}
                            className="h-8 px-3 text-xs"
                          >
                            Apply
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={selectedPayments.length === 0}
                            onClick={handleBulkDeletePayments}
                            className="h-8 px-3 text-xs"
                          >
                            Delete
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
                {loadingPayments ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-center space-x-4">
                        <Skeleton className="h-12 w-12 rounded-full" />
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-[250px]" />
                          <Skeleton className="h-4 w-[200px]" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {payments.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <DollarSign className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                        <p className="text-lg font-medium mb-2">No payments recorded</p>
                        <p className="text-sm text-gray-400">Payments recorded for this campaign will appear here.</p>
                      </div>
                    ) : (
                      <div className="border rounded-lg overflow-auto" style={{ minHeight: '400px', position: 'relative' }}>
                        <Table className="min-w-full" style={{ tableLayout: 'auto', width: 'auto', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                          <TableHeader>
                            <TableRow className="bg-gray-50 border-b border-gray-200">
                              <TableHead className="relative bg-gray-50 border-r border-gray-200 text-center whitespace-nowrap">#</TableHead>
                              <TableHead className="relative bg-gray-50 border-r border-gray-200 text-left select-none">KOL</TableHead>
                              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Amount</TableHead>
                              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Payment Date</TableHead>
                              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Method</TableHead>
                              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Content</TableHead>
                              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Notes</TableHead>
                              <TableHead className="relative bg-gray-50 select-none">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody className="bg-white">
                            {payments
                              .filter(payment => {
                                const kol = campaignKOLs.find(k => k.id === payment.campaign_kol_id);
                                const search = paymentsSearchTerm.toLowerCase();
                                return (
                                  !search ||
                                  (kol?.master_kol?.name?.toLowerCase().includes(search)) ||
                                  (payment.payment_method?.toLowerCase().includes(search)) ||
                                  (payment.notes?.toLowerCase().includes(search))
                                );
                              })
                              .map((payment, index) => (
                              <TableRow key={payment.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors border-b border-gray-200`}>
                                <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden text-center text-gray-600 group`} style={{ verticalAlign: 'middle' }}>
                                  <div className="flex items-center justify-center w-full h-full">
                                    {selectedPayments.includes(payment.id) ? (
                                      <Checkbox
                                        checked={true}
                                        onCheckedChange={checked => {
                                          setSelectedPayments(prev => checked ? [...prev, payment.id] : prev.filter(id => id !== payment.id));
                                        }}
                                        className="mx-auto"
                                      />
                                    ) : (
                                      <>
                                        <span className="block group-hover:hidden w-full text-center">{index + 1}</span>
                                        <span className="hidden group-hover:flex w-full justify-center">
                                          <Checkbox
                                            checked={selectedPayments.includes(payment.id)}
                                            onCheckedChange={checked => {
                                              setSelectedPayments(prev => checked ? [...prev, payment.id] : prev.filter(id => id !== payment.id));
                                            }}
                                            className="mx-auto"
                                          />
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden text-gray-600`} style={{ verticalAlign: 'middle', fontWeight: 'bold' }}>
                                  <div className="flex items-center w-full h-full">
                                    {campaignKOLs.find(kol => kol.id === payment.campaign_kol_id)?.master_kol?.name || 'Unknown KOL'}
                                  </div>
                                </TableCell>
                                <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                  ${payment.amount.toLocaleString()}
                                </TableCell>
                                <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                  {new Date(payment.payment_date).toLocaleDateString()}
                                </TableCell>
                                <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                  {payment.payment_method}
                                </TableCell>
                                <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                  {payment.content_id ? (
                                    (() => {
                                      const content = contents.find(c => c.id === payment.content_id);
                                      return content ? 
                                        `${content.type || 'Content'} - ${content.platform || 'Unknown'}` : 
                                        'Content not found';
                                    })()
                                  ) : (
                                    <span className="text-gray-400 italic">No content linked</span>
                                  )}
                                </TableCell>
                                <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                  {payment.notes || '-'}
                                </TableCell>
                                <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} p-2 overflow-hidden`}>
                                  <div className="flex items-center gap-2">
                                    <Button size="sm" variant="outline" onClick={() => handleEditPayment(payment)}>
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => { setPaymentToDelete(payment); setShowPaymentDeleteDialog(true); }}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                )}
                  </>
                )}
                
                {/* Graph View */}
                {paymentViewMode === 'graph' && (
                  <div className="space-y-8">
                    {/* Budget Overview Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Total Budget</div>
                          <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                        </div>
                        <div className="text-3xl font-bold text-gray-900 mb-1">
                          {CampaignService.formatCurrency(campaign.total_budget)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {campaign.budget_allocations && campaign.budget_allocations.length > 0 
                            ? `${campaign.budget_allocations.length} regions allocated`
                            : 'Campaign allocation'
                          }
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl border border-blue-100 shadow-sm hover:shadow-md transition-shadow duration-200">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Payments</div>
                          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                        </div>
                        <div className="text-3xl font-bold text-blue-900 mb-1">
                          {CampaignService.formatCurrency(payments.reduce((sum, payment) => sum + (payment.amount || 0), 0))}
                        </div>
                        <div className="text-xs text-blue-600">
                          {((payments.reduce((sum, payment) => sum + (payment.amount || 0), 0) / campaign.total_budget) * 100).toFixed(1)}% of total budget
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 p-6 rounded-xl border border-emerald-100 shadow-sm hover:shadow-md transition-shadow duration-200">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-semibold text-emerald-700 uppercase tracking-wide">Remaining</div>
                          <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                        </div>
                        <div className="text-3xl font-bold text-emerald-900 mb-1">
                          {CampaignService.formatCurrency(campaign.total_budget - payments.reduce((sum, payment) => sum + (payment.amount || 0), 0))}
                        </div>
                        <div className="text-xs text-emerald-600">
                          {(((campaign.total_budget - payments.reduce((sum, payment) => sum + (payment.amount || 0), 0)) / campaign.total_budget) * 100).toFixed(1)}% available
                        </div>
                      </div>
                    </div>

                    {/* Regional Budget Summary */}
                    {campaign.budget_allocations && campaign.budget_allocations.length > 0 && (
                      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Regional Budget Summary</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {campaign.budget_allocations.map((alloc: any) => {
                            // Helper function to map regions to APAC/Global
                            const mapRegionToCategory = (region: string) => {
                              const apacRegions = ['China', 'Korea', 'Vietnam', 'SEA', 'Philippines', 'apac'];
                              const globalRegions = ['Global', 'global'];
                              
                              if (apacRegions.includes(region)) return 'apac';
                              if (globalRegions.includes(region)) return 'global';
                              return region; // Keep other regions as is
                            };
                            
                            const kolsAllocated = campaignKOLs
                              .filter(kol => mapRegionToCategory(kol.master_kol.region) === alloc.region && kol.allocated_budget)
                              .reduce((sum, kol) => sum + (kol.allocated_budget || 0), 0);
                            
                            const actualPayments = payments
                              .filter(payment => {
                                const kol = campaignKOLs.find(k => k.id === payment.campaign_kol_id);
                                return kol && mapRegionToCategory(kol.master_kol.region) === alloc.region;
                              })
                              .reduce((sum, payment) => sum + (payment.amount || 0), 0);
                            
                            const remaining = alloc.allocated_budget - actualPayments;
                            const utilization = (actualPayments / alloc.allocated_budget) * 100;
                            
                            return (
                              <div key={alloc.region} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="text-sm font-semibold text-gray-700">
                                    {alloc.region === 'apac' ? 'APAC' : alloc.region === 'global' ? 'Global' : alloc.region}
                                  </div>
                                  <div className="text-xs text-gray-500">{utilization.toFixed(1)}% used</div>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex justify-between text-xs">
                                    <span className="text-gray-600">Regional Budget:</span>
                                    <span className="font-medium">{CampaignService.formatCurrency(alloc.allocated_budget)}</span>
                                  </div>
                                  <div className="flex justify-between text-xs">
                                    <span className="text-gray-600">Actual Payments:</span>
                                    <span className="font-medium text-blue-600">{CampaignService.formatCurrency(actualPayments)}</span>
                                  </div>
                                  <div className="flex justify-between text-xs">
                                    <span className="text-gray-600">Remaining:</span>
                                    <span className="font-medium text-emerald-600">{CampaignService.formatCurrency(remaining)}</span>
                                  </div>
                                </div>
                                <div className="mt-3">
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div 
                                      className="bg-[#3e8692] h-2 rounded-full transition-all duration-300" 
                                      style={{ width: `${Math.min(utilization, 100)}%` }}
                                    ></div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Budget Overview Chart */}
                    <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">Budget Overview</h3>
                          <p className="text-sm text-gray-500 mt-1">Comparison of total budget vs actual payments</p>
                        </div>
                        <div className="flex items-center space-x-4 text-xs">
                          <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 rounded bg-gray-400"></div>
                            <span className="text-gray-600 font-medium">Total</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 rounded bg-[#3e8692]"></div>
                            <span className="text-gray-600 font-medium">Payments</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 rounded bg-emerald-500"></div>
                            <span className="text-gray-600 font-medium">Remaining</span>
                          </div>
                        </div>
                      </div>
                      <div className="h-96">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={[
                              {
                                name: 'Budget Breakdown',
                                total: campaign.total_budget,
                                allocated: payments.reduce((sum, payment) => sum + (payment.amount || 0), 0),
                                remaining: campaign.total_budget - payments.reduce((sum, payment) => sum + (payment.amount || 0), 0)
                              }
                            ]}
                            margin={{ top: 30, right: 40, left: 40, bottom: 30 }}
                            barCategoryGap="40%"
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis 
                              dataKey="name" 
                              axisLine={false}
                              tickLine={false}
                              tick={{ fontSize: 14, fill: '#64748b', fontWeight: 500 }}
                            />
                            <YAxis 
                              axisLine={false}
                              tickLine={false}
                              tick={{ fontSize: 12, fill: '#64748b' }}
                              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                            />
                            <Tooltip 
                              contentStyle={{
                                backgroundColor: 'white',
                                border: '1px solid #e2e8f0',
                                borderRadius: '12px',
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                fontSize: '14px'
                              }}
                              formatter={(value: number, name: string) => [
                                `$${value.toLocaleString()}`, 
                                name === 'total' ? 'Total Budget' : name === 'allocated' ? 'Allocated Budget' : 'Remaining Budget'
                              ]}
                              labelFormatter={() => ''}
                            />
                            <Bar dataKey="total" fill="#9ca3af" name="total" radius={[8, 8, 8, 8]} />
                            <Bar dataKey="allocated" fill="#3e8692" name="allocated" radius={[8, 8, 8, 8]} />
                            <Bar dataKey="remaining" fill="#10b981" name="remaining" radius={[8, 8, 8, 8]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Regional Budget Allocation */}
                    {campaign.budget_allocations && campaign.budget_allocations.length > 0 && (
                      <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <h3 className="text-xl font-bold text-gray-900">Regional Budget Allocation</h3>
                            <p className="text-sm text-gray-500 mt-1">Budget distribution across regions</p>
                          </div>
                          <div className="flex items-center space-x-4 text-xs">
                            <div className="flex items-center space-x-2">
                              <div className="w-3 h-3 rounded bg-gray-400"></div>
                              <span className="text-gray-600 font-medium">Regional Budget</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <div className="w-3 h-3 rounded bg-[#3e8692]"></div>
                              <span className="text-gray-600 font-medium">Payments Made</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <div className="w-3 h-3 rounded bg-emerald-500"></div>
                              <span className="text-gray-600 font-medium">Remaining</span>
                            </div>
                          </div>
                        </div>
                        <div className="h-96">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={(() => {
                                // Helper function to map regions to APAC/Global
                                const mapRegionToCategory = (region: string) => {
                                  const apacRegions = ['China', 'Korea', 'Vietnam', 'SEA', 'Philippines', 'apac'];
                                  const globalRegions = ['Global', 'global'];
                                  
                                  if (apacRegions.includes(region)) return 'apac';
                                  if (globalRegions.includes(region)) return 'global';
                                  return region; // Keep other regions as is
                                };
                                
                                // Get all unique regions from both budget allocations and payments
                                const budgetRegions = (campaign.budget_allocations || []).map((alloc: any) => alloc.region);
                                const paymentRegions = payments
                                  .map(payment => {
                                    const kol = campaignKOLs.find(k => k.id === payment.campaign_kol_id);
                                    return mapRegionToCategory(kol?.master_kol.region || '');
                                  })
                                  .filter(Boolean);
                                const allRegions = Array.from(new Set([...budgetRegions, ...paymentRegions]));
                                
                                return allRegions.map(region => {
                                  const budgetAlloc = (campaign.budget_allocations || []).find((alloc: any) => alloc.region === region);
                                  const regionPayments = payments
                                    .filter(payment => {
                                      const kol = campaignKOLs.find(k => k.id === payment.campaign_kol_id);
                                      const mappedRegion = mapRegionToCategory(kol?.master_kol.region || '');
                                      return kol && mappedRegion === region;
                                    })
                                    .reduce((sum, payment) => sum + (payment.amount || 0), 0);
                                  
                                  return {
                                    region: region,
                                    allocated: budgetAlloc ? budgetAlloc.allocated_budget : 0,
                                    payments: regionPayments,
                                    remaining: (budgetAlloc ? budgetAlloc.allocated_budget : 0) - regionPayments
                                  };
                                });
                              })()}
                              margin={{ top: 30, right: 40, left: 40, bottom: 30 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                              <XAxis 
                                dataKey="region" 
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }}
                                tickFormatter={(value) => value === 'apac' ? 'APAC' : value === 'global' ? 'Global' : value}
                              />
                              <YAxis 
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 12, fill: '#64748b' }}
                                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                              />
                              <Tooltip 
                                contentStyle={{
                                  backgroundColor: 'white',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '12px',
                                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                  fontSize: '14px'
                                }}
                                formatter={(value: number, name: string) => [
                                  `$${value.toLocaleString()}`, 
                                  name === 'allocated' ? 'Regional Budget' : name === 'payments' ? 'Payments Made' : 'Remaining'
                                ]}
                                labelFormatter={(label: string) => {
                                  return label === 'apac' ? 'APAC' : label === 'global' ? 'Global' : label;
                                }}
                              />
                              <Bar dataKey="allocated" fill="#9ca3af" name="allocated" radius={[8, 8, 8, 8]} />
                              <Bar dataKey="payments" fill="#3e8692" name="payments" radius={[8, 8, 8, 8]} />
                              <Bar dataKey="remaining" fill="#10b981" name="remaining" radius={[8, 8, 8, 8]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* Payment Charts Row */}
                    {payments.length > 0 && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Payment Methods Distribution */}
                        <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
                          <div className="flex items-center justify-between mb-6">
                            <div>
                              <h3 className="text-xl font-bold text-gray-900">Payment Methods Distribution</h3>
                              <p className="text-sm text-gray-500 mt-1">Breakdown of payments by method</p>
                            </div>
                            <div className="flex items-center space-x-4 text-xs">
                              <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded bg-[#8b5cf6]"></div>
                                <span className="text-gray-600 font-medium">Token</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded bg-[#f59e0b]"></div>
                                <span className="text-gray-600 font-medium">Fiat</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded bg-[#10b981]"></div>
                                <span className="text-gray-600 font-medium">WL</span>
                              </div>
                            </div>
                          </div>
                          <div className="h-96">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={(() => {
                                  // Group payments by payment method and sum amounts
                                  const paymentMethods = payments.reduce((acc, payment) => {
                                    const method = payment.payment_method || 'Unknown';
                                    if (!acc[method]) {
                                      acc[method] = 0;
                                    }
                                    acc[method] += payment.amount || 0;
                                    return acc;
                                  }, {} as Record<string, number>);

                                  // Convert to array format for chart
                                  return Object.entries(paymentMethods).map(([method, amount]) => ({
                                    method: method,
                                    amount: amount
                                  }));
                                })()}
                                margin={{ top: 30, right: 40, left: 40, bottom: 30 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis 
                                  dataKey="method" 
                                  axisLine={false}
                                  tickLine={false}
                                  tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }}
                                />
                                <YAxis 
                                  axisLine={false}
                                  tickLine={false}
                                  tick={{ fontSize: 12, fill: '#64748b' }}
                                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                                />
                                <Tooltip 
                                  contentStyle={{
                                    backgroundColor: 'white',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '12px',
                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                    fontSize: '14px'
                                  }}
                                  formatter={(value: number) => [`$${value.toLocaleString()}`, 'Total Amount']}
                                  labelFormatter={(label: string) => label}
                                />
                                <Bar 
                                  dataKey="amount" 
                                  radius={[8, 8, 0, 0]}
                                >
                                  {(() => {
                                    // Group payments by payment method and sum amounts
                                    const paymentMethods = payments.reduce((acc, payment) => {
                                      const method = payment.payment_method || 'Unknown';
                                      if (!acc[method]) {
                                        acc[method] = 0;
                                      }
                                      acc[method] += payment.amount || 0;
                                      return acc;
                                    }, {} as Record<string, number>);

                                    // Convert to array format for chart
                                    const chartData = Object.entries(paymentMethods).map(([method, amount]) => ({
                                      method: method,
                                      amount: amount
                                    }));

                                    return chartData.map((entry, index) => {
                                      let color = '#8b5cf6'; // Default purple
                                      if (entry.method === 'Token') color = '#8b5cf6'; // Purple
                                      else if (entry.method === 'Fiat') color = '#f59e0b'; // Amber
                                      else if (entry.method === 'WL') color = '#10b981'; // Emerald
                                      
                                      return (
                                        <Cell key={`cell-${index}`} fill={color} />
                                      );
                                    });
                                  })()}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* Payment Timeline Chart */}
                        <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
                          <div className="flex items-center justify-between mb-6">
                            <div>
                              <h3 className="text-xl font-bold text-gray-900">Payment Timeline</h3>
                              <p className="text-sm text-gray-500 mt-1">Payment amounts over time by method</p>
                            </div>
                            <div className="flex items-center space-x-4 text-xs">
                              <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded bg-[#8b5cf6]"></div>
                                <span className="text-gray-600 font-medium">Token</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded bg-[#f59e0b]"></div>
                                <span className="text-gray-600 font-medium">Fiat</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="w-3 h-3 rounded bg-[#10b981]"></div>
                                <span className="text-gray-600 font-medium">WL</span>
                              </div>
                            </div>
                          </div>
                          <div className="h-96">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart
                                data={(() => {
                                  // Group payments by date and payment method
                                  const paymentsByDate = payments.reduce((acc, payment) => {
                                    const date = new Date(payment.payment_date).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric'
                                    });
                                    
                                    if (!acc[date]) {
                                      acc[date] = {
                                        date: date,
                                        Token: 0,
                                        Fiat: 0,
                                        WL: 0
                                      };
                                    }
                                    
                                    const method = payment.payment_method || 'Token';
                                    acc[date][method] += payment.amount || 0;
                                    
                                    return acc;
                                  }, {} as Record<string, any>);

                                  // Convert to array and sort by date
                                  return Object.values(paymentsByDate).sort((a: any, b: any) => {
                                    const dateA = new Date(a.date);
                                    const dateB = new Date(b.date);
                                    return dateA.getTime() - dateB.getTime();
                                  });
                                })()}
                                margin={{ top: 30, right: 40, left: 40, bottom: 30 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis 
                                  dataKey="date" 
                                  axisLine={false}
                                  tickLine={false}
                                  tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }}
                                />
                                <YAxis 
                                  axisLine={false}
                                  tickLine={false}
                                  tick={{ fontSize: 12, fill: '#64748b' }}
                                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                                />
                                <Tooltip 
                                  contentStyle={{
                                    backgroundColor: 'white',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '12px',
                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                    fontSize: '14px'
                                  }}
                                  formatter={(value: number, name: string) => [`$${value.toLocaleString()}`, name]}
                                  labelFormatter={(label: string) => `Payment Date: ${label}`}
                                />
                                <Line type="monotone" dataKey="Token" stroke="#8b5cf6" strokeWidth={3} dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 4 }} />
                                <Line type="monotone" dataKey="Fiat" stroke="#f59e0b" strokeWidth={3} dot={{ fill: '#f59e0b', strokeWidth: 2, r: 4 }} />
                                <Line type="monotone" dataKey="WL" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </div>
          </TabsContent>
        </Tabs>
        </div>
      </div>
      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-gray-600 mt-2 mb-2">Are you sure you want to delete this content?</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              setShowDeleteDialog(false);
              if (!contentToDelete) return;
              const contentId = contentToDelete.id;
              const prevContents = [...contents];
              setContents(prev => prev.filter(c => c.id !== contentId));
              try {
                await supabase.from('contents').delete().eq('id', contentId);
                toast({
                  title: 'Content deleted',
                  description: 'Content deleted successfully.',
                  variant: 'destructive',
                  duration: 3000,
                });
              } catch (error) {
                setContents(prev => prev);
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
      
      {/* Payment Delete confirmation dialog */}
      <Dialog open={showPaymentDeleteDialog} onOpenChange={setShowPaymentDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-gray-600 mt-2 mb-2">Are you sure you want to delete this payment?</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              setShowPaymentDeleteDialog(false);
              if (!paymentToDelete) return;
              const paymentId = paymentToDelete.id;
              try {
                await handleDeletePayment(paymentId);
                toast({
                  title: 'Payment deleted',
                  description: 'Payment deleted successfully.',
                  variant: 'destructive',
                  duration: 3000,
                });
              } catch (error) {
                toast({
                  title: 'Error',
                  description: 'Failed to delete payment.',
                  variant: 'destructive',
                  duration: 3000,
                });
              }
              setPaymentToDelete(null);
            }}>Delete Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* KOL Delete confirmation dialog */}
      <Dialog open={showKOLDeleteDialog} onOpenChange={setShowKOLDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-gray-600 mt-2 mb-2">
            Are you sure you want to delete {kolsToDelete.length} KOL{kolsToDelete.length !== 1 ? 's' : ''}?
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowKOLDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              setShowKOLDeleteDialog(false);
              if (kolsToDelete.length === 0) return;
              
              try {
                // Delete all selected KOLs
                await Promise.all(kolsToDelete.map(kolId => handleDeleteKOL(kolId)));
              toast({
                title: 'KOL(s) deleted',
                description: `${kolsToDelete.length} KOL${kolsToDelete.length !== 1 ? 's' : ''} deleted successfully.`,
                variant: 'destructive',
                duration: 3000,
              });
                // Clear selections
                setSelectedKOLs([]);
                setKolsToDelete([]);
              } catch (error) {
                toast({
                  title: 'Error',
                  description: 'Failed to delete KOL(s).',
                  variant: 'destructive',
                  duration: 3000,
                });
              }
            }}>Delete KOL{kolsToDelete.length !== 1 ? 's' : ''}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Bulk Delete</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-gray-600 mt-2 mb-2">Are you sure you want to delete {selectedContents.length} content item{selectedContents.length !== 1 ? 's' : ''}?</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              setShowBulkDeleteDialog(false);
              const toDelete = selectedContents;
              const prevContents = [...contents];
              setContents(prev => prev.filter(c => !toDelete.includes(c.id)));
              try {
                await Promise.all(toDelete.map(contentId => supabase.from('contents').delete().eq('id', contentId)));
                toast({
                  title: 'Contents deleted',
                  description: `${toDelete.length} content item${toDelete.length !== 1 ? 's' : ''} deleted successfully.`,
                  variant: 'destructive',
                  duration: 3000,
                });
              } catch (error) {
                setContents(prev => prev);
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

      {/* Edit Payment Dialog */}
      <Dialog open={isEditingPayment} onOpenChange={setIsEditingPayment}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Edit Payment</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto px-3 pb-6">
            <div className="grid gap-2">
              <Label htmlFor="edit-kol">KOL</Label>
              <Select
                value={newPaymentData.campaign_kol_id}
                onValueChange={(value) => setNewPaymentData(prev => ({ ...prev, campaign_kol_id: value }))}
              >
                <SelectTrigger className="auth-input">
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
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">$</span>
                <Input
                  id="edit-amount"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9,]*"
                  className="auth-input pl-6 w-full"
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
                    className="auth-input justify-start text-left font-normal focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692]"
                    style={{
                      borderColor: "#e5e7eb",
                      backgroundColor: "white",
                      color: newPaymentData.payment_date ? "#111827" : "#9ca3af"
                    }}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newPaymentData.payment_date ? newPaymentData.payment_date : "Select payment date"}
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
                <SelectTrigger className="auth-input">
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
              <Label htmlFor="edit-content">Content (Optional)</Label>
              <Select
                value={newPaymentData.content_id}
                onValueChange={(value) => setNewPaymentData(prev => ({ ...prev, content_id: value }))}
              >
                <SelectTrigger className="auth-input">
                  <SelectValue placeholder="Select content" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No content linked</SelectItem>
                  {contents
                    .filter(content => content.campaign_kols_id === newPaymentData.campaign_kol_id)
                    .map(content => (
                      <SelectItem key={content.id} value={content.id}>
                        {content.type || 'Content'} - {content.platform || 'Unknown'} 
                        {content.activation_date && ` (${new Date(content.activation_date).toLocaleDateString()})`}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-transaction-id">Transaction ID (Optional)</Label>
              <Input
                id="edit-transaction-id"
                value={newPaymentData.transaction_id}
                onChange={(e) => setNewPaymentData(prev => ({ ...prev, transaction_id: e.target.value }))}
                placeholder="Enter transaction ID"
                className="auth-input"
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
                className="auth-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditingPayment(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpdatePayment} 
              disabled={!newPaymentData.campaign_kol_id || newPaymentData.amount <= 0}
              style={{ backgroundColor: '#3e8692', color: 'white' }}
              className="hover:opacity-90"
            >
              Update Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


    </div>
  );
};

export default CampaignDetailsPage; 