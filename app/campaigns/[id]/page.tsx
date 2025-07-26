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
import { Calendar as CalendarIcon, Megaphone, Building2, DollarSign, ArrowLeft, CheckCircle, FileText, PauseCircle, BadgeCheck, Phone, Users, Trash2, Plus, Search, Flag, Globe, Loader, Calendar as CalendarIconImport } from "lucide-react";
import { CampaignService, CampaignWithDetails } from "@/lib/campaignService";
import { Skeleton } from "@/components/ui/skeleton";
import { UserService } from "@/lib/userService";
import { KOLService } from "@/lib/kolService";
import { CampaignKOLService, CampaignKOLWithDetails } from "@/lib/campaignKolService";
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
    }
  }, [campaign]);

  const fetchCampaignKOLs = async () => {
    if (!campaign) return;
    try {
      setLoadingKOLs(true);
      const kols = await CampaignKOLService.getCampaignKOLs(campaign.id);
      setCampaignKOLs(kols);
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

  const filteredKOLs = campaignKOLs.filter(kol =>
    kol.master_kol.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    kol.hh_status.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (kol.notes && kol.notes.toLowerCase().includes(searchTerm.toLowerCase()))
  );
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

  const [editingNotes, setEditingNotes] = useState<{ [kolId: string]: string }>({});
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);

  const handleNotesChange = (kolId: string, value: string) => {
    setEditingNotes((prev) => ({ ...prev, [kolId]: value }));
  };
  const handleNotesSave = async (kolId: string) => {
    const value = editingNotes[kolId];
    if (value !== undefined) {
      await CampaignKOLService.updateCampaignKOL(kolId, { notes: value });
      setCampaignKOLs(prev => prev.map(kol => kol.id === kolId ? { ...kol, notes: value } : kol));
      setEditingNotesId(null);
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

  // 2. Fetch contents for all campaignKOLs when campaignKOLs change
  useEffect(() => {
    const fetchContents = async () => {
      setLoadingContents(true);
      try {
        // Optionally, you can fetch all contents for the campaign here
        // or leave as is for initial load only
        const { data, error } = await supabase
          .from('contents')
          .select('*');
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
  }, []); // Only on mount

  const [contentsSearchTerm, setContentsSearchTerm] = useState('');
  const [bulkContentStatus, setBulkContentStatus] = useState('');

  // 1. Add state for selection and bulk actions for contents
  const [selectedContents, setSelectedContents] = useState<string[]>([]);

  // 2. Add filtering logic for search and status
  const filteredContents = contents.filter(content => {
    const kol = campaignKOLs.find(k => k.id === content.campaign_kols_id);
    const search = contentsSearchTerm.toLowerCase();
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
    const updatedContent = { ...contentToUpdate, [field]: editingContentValue };
    setContents(prev => prev.map(c => c.id === contentId ? updatedContent : c));
    setEditingContentCell(null);
    setEditingContentValue(null);
    try {
      await supabase.from('contents').update({ [field]: editingContentValue }).eq('id', contentId);
    } catch (err) {
      setContents(prev => prev.map(c => c.id === contentId ? contentToUpdate : c));
    }
  };

  // 4. Handle cancel
  const handleContentCellCancel = () => {
    setEditingContentCell(null);
    setEditingContentValue(null);
  };

  // 5. Render editable cell
  const renderEditableContentCell = (value: any, field: string, content: any) => {
    const isEditing = editingContentCell?.contentId === content.id && editingContentCell?.field === field;
    const textFields = ["content_link", "activation_date", "impressions", "likes", "retweets", "comments"];
    const numberFields = ["impressions", "likes", "retweets", "comments"];
    const selectFields = ["platform", "type", "status", "campaign_kols_id"];

    // Always-editable select fields with requested styling
    if (selectFields.includes(field)) {
      let options: string[] = [];
      let getColorClass = () => '';
      if (field === 'platform') {
        options = fieldOptions.platforms;
      } else if (field === 'type') {
        options = fieldOptions.contentTypes;
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
    // Update in database
    try {
      await supabase.from('contents').update({ [field]: newValue }).eq('id', content.id);
    } catch (err) {
      // Optionally handle error
    }
    setEditingContentCell(null);
    setEditingContentValue(null);
  };

  // Add at the top of the component, after other useState declarations:
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [contentToDelete, setContentToDelete] = useState<any | null>(null);

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

  const budgetTypeOptions = ["Token", "Fiat", "WL"];

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
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="information">Information</TabsTrigger>
              <TabsTrigger value="kols">KOLs</TabsTrigger>
              <TabsTrigger value="contents">Contents</TabsTrigger>
            </TabsList>
            
            <TabsContent value="information" className="mt-4">
              <div className="w-full bg-white border border-gray-200 shadow-sm p-6">
              <CardHeader className="pb-6 border-b border-gray-100 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-gray-100 p-2 rounded-lg"><Megaphone className="h-6 w-6 text-gray-600" /></div>
                  {editMode ? (
                    <Input className="text-2xl font-bold text-gray-900" value={form?.name || ""} onChange={e => handleChange("name", e.target.value)} />
                  ) : (
                    <h2 className="text-2xl font-bold text-gray-900">{campaign.name}</h2>
                  )}
                </div>
                {!editMode && (
                  <Button variant="outline" size="sm" onClick={handleEdit}>Edit</Button>
                )}
              </CardHeader>
              <CardContent className="pt-6 space-y-6 flex-1 flex flex-col">
                <div className="grid grid-cols-2 gap-4 text-sm flex-1">
                  <div>
                    <div className="text-gray-500 mb-1">Start Date</div>
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
                      <div className="font-medium">{formatDate(campaign?.start_date)}</div>
                    )}
                  </div>
                  <div>
                    <div className="text-gray-500 mb-1">End Date</div>
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
                      <div className="font-medium">{formatDate(campaign?.end_date)}</div>
                    )}
                  </div>
                  <div>
                    <div className="text-gray-500 mb-1">Region</div>
                    {editMode ? (
                      <Select value={form?.region || ""} onValueChange={value => handleChange("region", value)}>
                        <SelectTrigger className="w-full focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692]" style={{ borderColor: '#e5e7eb' }}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="apac">APAC</SelectItem>
                          <SelectItem value="global">Global</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="font-medium">{displayRegion(campaign?.region)}</div>
                    )}
                  </div>
                  <div>
                    <div className="text-gray-500 mb-1">Status</div>
                    {editMode ? (
                      <Select value={form?.status || ""} onValueChange={value => handleChange("status", value)}>
                        <SelectTrigger className="w-full focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692]" style={{ borderColor: '#e5e7eb' }}>
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
                      <div className="font-medium">{getStatusBadge(campaign.status)}</div>
                    )}
                  </div>
                  <div>
                    <div className="text-gray-500 mb-1">Intro Call</div>
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
                      <div className="font-medium flex items-center gap-1">{campaign?.intro_call ? <><Phone className="h-4 w-4 text-[#3e8692]" />Yes</> : "No"}</div>
                    )}
                  </div>
                  {!!(editMode ? form?.intro_call : campaign?.intro_call) && (
                    <div>
                      <div className="text-gray-500 mb-1">Intro Call Date</div>
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
                        <div className="font-medium">{campaign?.intro_call_date ? formatDate(campaign.intro_call_date) : '-'}</div>
                      )}
                    </div>
                  )}
                  {/* Manager */}
                  <div>
                    <div className="text-gray-500 mb-1">Manager</div>
                    {editMode ? (
                      <Select value={form?.manager || ""} onValueChange={value => handleChange("manager", value)}>
                        <SelectTrigger className="w-full focus:ring-2 focus:ring-[#3e8692] focus:border-[#3e8692]" style={{ borderColor: '#e5e7eb' }}>
                          <SelectValue placeholder="Select manager" />
                        </SelectTrigger>
                        <SelectContent>
                          {allUsers.map((user) => (
                            <SelectItem key={user.id} value={user.id}>{user.name || user.email}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="font-medium">{allUsers.find(u => u.id === campaign.manager)?.name || '-'}</div>
                    )}
                  </div>
                  {/* Call Support */}
                  <div>
                    <div className="text-gray-500 mb-1">Call Support</div>
                    {editMode ? (
                      <Checkbox id="call_support" checked={!!form?.call_support} onCheckedChange={checked => handleChange("call_support", !!checked)} />
                    ) : (
                      <div className="font-medium">{campaign?.call_support ? 'Yes' : 'No'}</div>
                    )}
                  </div>
                  {/* Client Choosing KOLs */}
                  <div>
                    <div className="text-gray-500 mb-1">Client Choosing KOLs</div>
                    {editMode ? (
                      <Checkbox id="client_choosing_kols" checked={!!form?.client_choosing_kols} onCheckedChange={checked => handleChange("client_choosing_kols", !!checked)} />
                    ) : (
                      <div className="font-medium">{campaign?.client_choosing_kols ? 'Yes' : 'No'}</div>
                    )}
                  </div>
                  {/* Multi-Activation */}
                  <div>
                    <div className="text-gray-500 mb-1">Multi-Activation</div>
                    {editMode ? (
                      <Checkbox id="multi_activation" checked={!!form?.multi_activation} onCheckedChange={checked => handleChange("multi_activation", !!checked)} />
                    ) : (
                      <div className="font-medium">{campaign?.multi_activation ? 'Yes' : 'No'}</div>
                    )}
                  </div>
                  {/* Proposal Sent */}
                  <div>
                    <div className="text-gray-500 mb-1">Proposal Sent</div>
                    {editMode ? (
                      <Checkbox id="proposal_sent" checked={!!form?.proposal_sent} onCheckedChange={checked => handleChange("proposal_sent", !!checked)} />
                    ) : (
                      <div className="font-medium">{campaign?.proposal_sent ? 'Yes' : 'No'}</div>
                    )}
                  </div>
                  {/* NDA Signed */}
                  <div>
                    <div className="text-gray-500 mb-1">NDA Signed</div>
                    {editMode ? (
                      <Checkbox id="nda_signed" checked={!!form?.nda_signed} onCheckedChange={checked => handleChange("nda_signed", !!checked)} />
                    ) : (
                      <div className="font-medium">{campaign?.nda_signed ? 'Yes' : 'No'}</div>
                    )}
                  </div>
                  {/* Budget Type */}
                  <div>
                    <div className="text-gray-500 mb-1">Budget Type</div>
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
                      <div className="font-medium">{(campaign?.budget_type || []).join(', ') || '-'}</div>
                    )}
                  </div>
                  <div className="col-span-2">
                    <div className="text-gray-500 mb-1">Description</div>
                    {editMode ? (
                      <Textarea
                        value={form?.description || ""}
                        onChange={e => handleChange("description", e.target.value)}
                        className="focus-visible:ring-2 focus-visible:ring-[#3e8692] focus-visible:border-[#3e8692]"
                        style={{ borderColor: '#e5e7eb' }}
                      />
                    ) : (
                      <div className="font-medium whitespace-pre-line">{campaign.description || '-'}</div>
                    )}
                  </div>
                </div>
                {/* Move total budget and budget utilized above regional allocations */}
                <div className="flex gap-8 items-center mb-2">
                  <div>
                    <div className="text-gray-500 text-sm mb-1">Total Budget</div>
                    {editMode ? (
                      <div className="relative w-full">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">$</span>
                        <Input
                          type="number"
                          className="pl-6 w-full focus-visible:ring-2 focus-visible:ring-[#3e8692] focus-visible:border-[#3e8692] text-sm"
                          style={{ borderColor: '#e5e7eb' }}
                          value={form?.total_budget || ""}
                          onChange={e => handleChange("total_budget", e.target.value)}
                        />
                      </div>
                    ) : (
                      <div className="text-sm">{CampaignService.formatCurrency(campaign.total_budget)}</div>
                    )}
                  </div>
                  <div>
                    <div className="text-gray-500 text-sm mb-1">Budget Utilized</div>
                    <div className="text-sm">{CampaignService.calculateBudgetUtilization(campaign.total_budget, campaign.total_allocated || 0)}%</div>
                  </div>
                </div>
                {editMode ? (
                  <div>
                    <div className="text-gray-500 mb-2 font-semibold">Regional Allocations</div>
                    <div className="flex flex-col gap-2">
                      {allocations.map((alloc, idx) => (
                        <div key={alloc.id || idx} className="flex items-center gap-2">
                          <Select value={alloc.region} onValueChange={value => {
                            const updated = [...allocations];
                            updated[idx].region = value;
                            setAllocations(updated);
                          }}>
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
                    <div>
                      <div className="text-gray-500 mb-2 font-semibold">Regional Allocations</div>
                      <div className="flex flex-wrap gap-2">
                        {campaign.budget_allocations.map((alloc: any) => (
                          <span key={alloc.id} className="text-xs px-3 py-1 rounded-md bg-gray-100 text-gray-700">
                            {alloc.region}: {CampaignService.formatCurrency(alloc.allocated_budget)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                )}
                {editMode && (
                  <div className="flex gap-2 mt-6">
                    <Button variant="default" style={{ backgroundColor: '#3e8692', color: 'white' }} onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
                    <Button variant="outline" onClick={handleCancel} disabled={saving}>Cancel</Button>
                  </div>
                )}
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
                <div className="flex items-center">
                  <Dialog open={isAddKOLsDialogOpen} onOpenChange={setIsAddKOLsDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" style={{ backgroundColor: '#3e8692', color: 'white' }} className="hover:opacity-90">
                        <Plus className="h-4 w-4 mr-2" />
                        Add KOLs
                      </Button>
                    </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
                     <DialogHeader>
                       <DialogTitle>Add KOLs to Campaign</DialogTitle>
                     </DialogHeader>
                     <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto px-3 pb-6">
                       <div className="grid gap-2">
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
                               <SelectItem key={status} value={status}>{status}</SelectItem>
                             ))}
                           </SelectContent>
                         </Select>
                       </div>
                       <div className="grid gap-2">
                         <Label htmlFor="notes">Default Notes</Label>
                         <Textarea
                           id="notes"
                           placeholder="Add notes for selected KOLs..."
                           value={newKOLData.notes}
                           onChange={(e) => setNewKOLData(prev => ({ ...prev, notes: e.target.value }))}
                           className="auth-input"
                         />
                       </div>
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
                           className="mb-2"
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
                                 <TableHead>Content Type</TableHead>
                               </TableRow>
                             </TableHeader>
                             <TableBody>
                               {filteredAvailableKOLs.length === 0 ? (
                                 <TableRow>
                                   <TableCell colSpan={6} className="text-center py-8 text-gray-500">
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
                                             href={kol.link} 
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
                                   </TableRow>
                                 ))
                               )}
                             </TableBody>
                           </Table>
                         </div>
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
                <div className="flex items-center gap-2 mb-4 mt-6">
                  <span className="text-sm font-medium">{selectedKOLs.length} selected:</span>
                </div>
                <div className="mt-2 mb-4" style={{ maxWidth: 200 }}>
                  <Select value={bulkStatus} onValueChange={(value: string) => setBulkStatus(value as CampaignKOLWithDetails['hh_status'] | "") }>
                    <SelectTrigger 
                      className={`border-none shadow-none bg-transparent w-full h-auto px-2 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none ${bulkStatus ? getStatusColor(bulkStatus) : ''}`}
                      style={{ outline: 'none', boxShadow: 'none', minWidth: 90 }}
                    >
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {CampaignKOLService.getHHStatusOptions().map((status) => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2 mb-2">
                  <Button
                    size="sm"
                    style={{ backgroundColor: '#3e8692', color: 'white' }}
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
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={selectedKOLs.length === 0}
                    onClick={() => {
                      setKolsToDelete(selectedKOLs);
                      setShowKOLDeleteDialog(true);
                    }}
                  >
                    Delete
                  </Button>
                </div>
                <div className="mt-6 mb-6">
                  <Button
                    size="sm"
                    variant="outline"
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
                ) : filteredKOLs.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p className="text-lg font-medium mb-2">No KOLs assigned yet</p>
                    <p className="text-sm text-gray-400">Add KOLs to this campaign to get started.</p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-auto" style={{ minHeight: '400px', position: 'relative' }}>
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
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Platform</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Followers</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Region</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Status</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Notes</TableHead>
                          <TableHead className="relative bg-gray-50 select-none">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="bg-white">
                        {filteredKOLs.map((campaignKOL, index) => {
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
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden group`}>
                                <div className="truncate flex items-center">
                                  {campaignKOL.master_kol.followers ? KOLService.formatFollowers(campaignKOL.master_kol.followers) : '-'}
                                </div>
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                <div className="flex items-center gap-1">
                                  <span>{getRegionIcon(campaignKOL.master_kol.region || '').flag}</span>
                                  <span className="text-xs font-medium">{campaignKOL.master_kol.region || '-'}</span>
                                </div>
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden align-middle`}>
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
                                      <SelectItem key={status} value={status}>{status}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 align-middle overflow-hidden`} style={{ width: '30%' }}>
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
                                  <div className="truncate min-h-[32px] cursor-pointer flex items-center px-1 py-1" style={{ minHeight: 32 }} title={campaignKOL.notes} onClick={() => { setEditingNotesId(campaignKOL.id); setEditingNotes((prev) => ({ ...prev, [campaignKOL.id]: campaignKOL.notes ?? '' })); }}>
                                    {campaignKOL.notes || <span className="text-gray-400 italic">Click to add notes</span>}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} p-2 overflow-hidden`}>
                                <div className="flex space-x-1">
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
                        })}
                      </TableBody>
                    </Table>
                  </div>
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
                  <Dialog open={isAddContentsDialogOpen} onOpenChange={setIsAddContentsDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" style={{ backgroundColor: '#3e8692', color: 'white' }} className="hover:opacity-90">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Contents
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
                                {fieldOptions.contentTypes.map(type => (
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
                                    .select('*');
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
                <div className="flex items-center gap-2 mb-4 mt-6">
                  <span className="text-sm font-medium">{selectedContents.length} selected:</span>
                </div>
                <div className="mt-2 mb-4" style={{ maxWidth: 200 }}>
                  <Select value={bulkContentStatus} onValueChange={v => setBulkContentStatus(v)}>
                    <SelectTrigger className={`border-none shadow-none bg-transparent w-full h-auto px-2 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none ${bulkContentStatus ? '' : ''}`}
                      style={{ outline: 'none', boxShadow: 'none', minWidth: 90 }}>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {contentStatusOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2 mb-2">
                  <Button
                    size="sm"
                    style={{ backgroundColor: '#3e8692', color: 'white' }}
                    disabled={selectedContents.length === 0 || !bulkContentStatus}
                    onClick={handleBulkStatusChange}
                  >
                    Apply
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={selectedContents.length === 0}
                    onClick={() => setShowBulkDeleteDialog(true)}
                  >
                    Delete
                  </Button>
                </div>
                <div className="mt-6 mb-6">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSelectAllContents}
                  >
                    {filteredContents.length > 0 && filteredContents.every(content => selectedContents.includes(content.id)) ? 'Deselect All' : 'Select All'}
                  </Button>
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
                ) : filteredContents.length === 0 ? (
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
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Platform</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Type</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Status</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Activation Date</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Content Link</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Impressions</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Likes</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Retweets</TableHead>
                          <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Comments</TableHead>
                          <TableHead className="relative bg-gray-50 select-none">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="bg-white">
                        {filteredContents.map((content, index) => {
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
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} p-2 overflow-hidden`}>
                                <Button size="sm" variant="outline" onClick={() => { setContentToDelete(content); setShowDeleteDialog(true); }}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
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
    </div>
  );
};

export default CampaignDetailsPage; 