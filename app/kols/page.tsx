"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Plus, Crown, Save, X, Trash2, Star, Globe, Flag, Menu, Filter, Settings } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { KOLService, MasterKOL } from "@/lib/kolService";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';

export default function KOLsPage() {
  const { user, userProfile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [kols, setKols] = useState<MasterKOL[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCell, setEditingCell] = useState<{kolId: string, field: keyof MasterKOL} | null>(null);
  const [editingValue, setEditingValue] = useState<any>(null);
  const [selectedKOLs, setSelectedKOLs] = useState<string[]>([]);
  const [bulkEdit, setBulkEdit] = useState<Partial<MasterKOL>>({});
  const [filters, setFilters] = useState({
    name: '',
    link: '',
    platform: [] as string[],
    followers: '',
    followersOperator: '>' as '>' | '<',
    region: [] as string[],
    creator_type: [] as string[],
    content_type: [] as string[],
    deliverables: [] as string[],
    pricing: [] as string[],
    rating: '',
    ratingOperator: '>' as '>' | '<',
    group_chat: [] as string[],
    description: ''
  });

  // Default visible columns
  const defaultVisibleColumns = {
    name: true,
    link: true,
    platform: true,
    followers: true,
    region: true,
    creator_type: true,
    content_type: true,
    deliverables: true,
    pricing: true,
    rating: true,
    group_chat: true,
    description: true
  };

  // Initialize visible columns from URL params
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const columnsParam = searchParams.get('columns');
    if (columnsParam) {
      try {
        const parsedColumns = JSON.parse(decodeURIComponent(columnsParam));
        return { ...defaultVisibleColumns, ...parsedColumns };
      } catch (e) {
        console.error('Error parsing columns from URL:', e);
      }
    }
    return defaultVisibleColumns;
  });
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [filterSearchTerms, setFilterSearchTerms] = useState<{[key: string]: string}>({});
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isSavingNewKOL, setIsSavingNewKOL] = useState(false);
  // 1. Add state for delete dialog (single KOL)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [kolToDelete, setKolToDelete] = useState<string | null>(null);

  // 2. Add state for bulk delete dialog
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const fieldOptions = KOLService.getFieldOptions();
  const { toast } = useToast();

  // Function to update URL with column visibility
  const updateColumnVisibilityInURL = (newVisibleColumns: typeof defaultVisibleColumns) => {
    const params = new URLSearchParams(searchParams.toString());
    const columnsParam = encodeURIComponent(JSON.stringify(newVisibleColumns));
    params.set('columns', columnsParam);
    router.replace(`/kols?${params.toString()}`, { scroll: false });
  };

  // Function to handle column visibility changes
  const handleColumnVisibilityChange = (columnKey: keyof typeof defaultVisibleColumns, checked: boolean) => {
    const newVisibleColumns = { ...visibleColumns, [columnKey]: checked };
    setVisibleColumns(newVisibleColumns);
    updateColumnVisibilityInURL(newVisibleColumns);
  };

  // Multi-select dropdown component
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

    // Add safety checks
    const safeOptions = Array.isArray(options) ? options : [];
    const safeSelected = Array.isArray(selected) ? selected : [];

    // Filter options based on search term
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

  useEffect(() => {
    fetchKOLs();
  }, []);

  const fetchKOLs = async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedKOLs = await KOLService.getAllKOLs();
      setKols(fetchedKOLs);
    } catch (err) {
      console.error('Error fetching KOLs:', err);
      setError('Failed to load KOLs');
    } finally {
      setLoading(false);
    }
  };

  // Filter KOLs based on filter state and search term
  const filteredKOLs = kols.filter(kol => {
    const matchesSearch = !searchTerm || 
      kol.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      kol.region?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      kol.creator_type?.some(ct => ct.toLowerCase().includes(searchTerm.toLowerCase())) ||
      kol.content_type?.some(ct => ct.toLowerCase().includes(searchTerm.toLowerCase())) ||
      kol.deliverables?.some(d => d.toLowerCase().includes(searchTerm.toLowerCase())) ||
      kol.platform?.some(p => p.toLowerCase().includes(searchTerm.toLowerCase())) ||
      kol.description?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilters = (
      (!filters.name || kol.name?.toLowerCase().includes(filters.name.toLowerCase())) &&
      (!filters.link || kol.link?.toLowerCase().includes(filters.link.toLowerCase())) &&
      (!filters.platform.length || filters.platform.some(p => kol.platform?.includes(p))) &&
      (!filters.followers || (filters.followersOperator === '>' ? 
        (kol.followers && parseInt(kol.followers.toString()) > parseInt(filters.followers)) :
        (kol.followers && parseInt(kol.followers.toString()) < parseInt(filters.followers)))) &&
      (!filters.region.length || filters.region.some(r => kol.region === r)) &&
      (!filters.creator_type.length || filters.creator_type.some(ct => kol.creator_type?.includes(ct))) &&
      (!filters.content_type.length || filters.content_type.some(ct => kol.content_type?.includes(ct))) &&
      (!filters.deliverables.length || filters.deliverables.some(d => kol.deliverables?.includes(d))) &&
      (!filters.pricing.length || filters.pricing.some(p => kol.pricing === p)) &&
      (!filters.rating || (filters.ratingOperator === '>' ? 
        (kol.rating && parseInt(kol.rating.toString()) > parseInt(filters.rating)) :
        (kol.rating && parseInt(kol.rating.toString()) < parseInt(filters.rating)))) &&
      (!filters.group_chat.length || filters.group_chat.some(gc => kol.group_chat === (gc === 'yes'))) &&
      (!filters.description || kol.description?.toLowerCase().includes(filters.description.toLowerCase()))
    );

    return matchesSearch && matchesFilters;
  });

  const handleCellDoubleClick = (kolId: string, field: keyof MasterKOL, currentValue: any) => {
    setEditingCell({ kolId, field });
    setEditingValue(currentValue);
  };

  const handleCellSave = async () => {
    if (!editingCell) return;
    try {
      const kolToUpdate = kols.find(k => k.id === editingCell.kolId);
      if (!kolToUpdate) return;
      const updatedKOL = { ...kolToUpdate, [editingCell.field]: editingValue };
      const kolId = editingCell.kolId;
      setKols(prevKols => 
        prevKols.map(k => k.id === kolId ? updatedKOL : k)
      );
      setEditingCell(null);
      setEditingValue(null);
      try {
        await KOLService.updateKOL(updatedKOL);
      } catch (error) {
        console.error('Error updating KOL:', error);
        setKols(prevKols => 
          prevKols.map(k => k.id === kolId ? kolToUpdate : k)
        );
      }
    } catch (err) {
      console.error('Error updating KOL:', err);
      setEditingCell(null);
      setEditingValue(null);
    }
  };

  const handleCellCancel = () => {
    setEditingCell(null);
    setEditingValue(null);
  };

  // 3. Update handleDelete to open dialog instead of window.confirm
  const handleDelete = (kolId: string) => {
    setKolToDelete(kolId);
    setShowDeleteDialog(true);
  };

  const handleAddNew = async () => {
    try {
      setIsSavingNewKOL(true);
      const emptyKOL = {
        name: '',
        link: '',
        platform: [],
        followers: undefined, // fix linter error
        region: null,
        community: false,
        content_type: [],
        niche: [],
        pricing: null,
        tier: null,
        group_chat: false,
        description: ''
      };
      const createdKOL = await KOLService.createKOL(emptyKOL);
      setKols(prevKols => [createdKOL, ...prevKols]); // add to top
      setEditingCell({ kolId: createdKOL.id, field: 'name' });
      setEditingValue('');
    } catch (err) {
      console.error('Error creating KOL:', err);
    } finally {
      setIsSavingNewKOL(false);
    }
  };

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

  const getNicheColor = (niche: string) => {
    const colorMap: { [key: string]: string } = {
      'General': 'bg-gray-100 text-gray-800',
      'Gaming': 'bg-indigo-100 text-indigo-800',
      'Crypto': 'bg-emerald-100 text-emerald-800',
      'Memecoin': 'bg-pink-100 text-pink-800',
      'NFT': 'bg-violet-100 text-violet-800',
      'Trading': 'bg-cyan-100 text-cyan-800',
      'AI': 'bg-slate-100 text-slate-800',
      'Research': 'bg-amber-100 text-amber-800',
      'Airdrop': 'bg-lime-100 text-lime-800',
      'Art': 'bg-rose-100 text-rose-800'
    };
    return colorMap[niche] || 'bg-gray-100 text-gray-800';
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

  const getTierColor = (tier: string) => {
    const colorMap: { [key: string]: string } = {
      'Tier 1': 'bg-red-100 text-red-800',
      'Tier 2': 'bg-orange-100 text-orange-800',
      'Tier 3': 'bg-yellow-100 text-yellow-800',
      'Tier 4': 'bg-green-100 text-green-800'
    };
    return colorMap[tier] || 'bg-gray-100 text-gray-800';
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

  const getActiveFilterCount = (filterKey: string) => {
    const filter = filters[filterKey as keyof typeof filters];
    if (Array.isArray(filter)) {
      return filter.length;
    }
    if (typeof filter === 'string' && filter !== '' && filter !== 'all') {
      return 1;
    }
    return 0;
  };

  const KOLTableSkeleton = () => (
    <div className="border rounded-lg overflow-auto">
      <Table className="min-w-max whitespace-nowrap">
        <TableHeader>
          <TableRow className="bg-gray-50 border-b border-gray-200">
            <TableHead className="bg-gray-50 border-r border-gray-200 text-center whitespace-nowrap">#</TableHead>
            {visibleColumns.name && <TableHead className="bg-gray-50 border-r border-gray-200 whitespace-nowrap">Name</TableHead>}
            {visibleColumns.link && <TableHead className="bg-gray-50 border-r border-gray-200 whitespace-nowrap">Link</TableHead>}
            {visibleColumns.platform && <TableHead className="bg-gray-50 border-r border-gray-200 whitespace-nowrap">Platform</TableHead>}
            {visibleColumns.followers && <TableHead className="bg-gray-50 border-r border-gray-200 select-none">Followers</TableHead>}
            {visibleColumns.region && <TableHead className="bg-gray-50 border-r border-gray-200 select-none">Region</TableHead>}
            {visibleColumns.creator_type && <TableHead className="bg-gray-50 border-r border-gray-200 select-none">Creator Type</TableHead>}
            {visibleColumns.content_type && <TableHead className="bg-gray-50 border-r border-gray-200 select-none">Content Type</TableHead>}
            {visibleColumns.deliverables && <TableHead className="bg-gray-50 border-r border-gray-200 select-none">Deliverables</TableHead>}
            {visibleColumns.pricing && <TableHead className="bg-gray-50 border-r border-gray-200 select-none">Pricing</TableHead>}
            {visibleColumns.rating && <TableHead className="bg-gray-50 border-r border-gray-200 select-none">Rating</TableHead>}
            {visibleColumns.group_chat && <TableHead className="bg-gray-50 border-r border-gray-200 select-none">Group Chat</TableHead>}
            {visibleColumns.description && <TableHead className="bg-gray-50 border-r border-gray-200 select-none">Description</TableHead>}
            <TableHead className="bg-gray-50 whitespace-nowrap">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="bg-white">
          {Array.from({ length: 8 }).map((_, index) => (
            <TableRow key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b border-gray-200`}>
              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden text-center w-12`}><Skeleton className="h-4 w-6 mx-auto" /></TableCell>
              {visibleColumns.name && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden w-32`}><Skeleton className="h-4 w-full" /></TableCell>}
              {visibleColumns.link && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden w-24`}><Skeleton className="h-4 w-full" /></TableCell>}
              {visibleColumns.platform && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden w-24`}><div className="flex flex-nowrap gap-1 items-center w-full"><Skeleton className="h-5 w-5 rounded-full" /><Skeleton className="h-5 w-5 rounded-full" /></div></TableCell>}
              {visibleColumns.followers && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden w-20`}><Skeleton className="h-4 w-full" /></TableCell>}
              {visibleColumns.region && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden w-28`}><div className="flex items-center gap-1 w-full"><Skeleton className="h-4 w-4 rounded" /><Skeleton className="h-4 w-20" /></div></TableCell>}
              {visibleColumns.creator_type && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden w-20`}><Skeleton className="h-6 w-full rounded-full" /></TableCell>}
              {visibleColumns.content_type && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden w-32`}><div className="flex flex-nowrap gap-1 w-full"><Skeleton className="h-6 w-16 rounded-md" /><Skeleton className="h-6 w-20 rounded-md" /></div></TableCell>}
              {visibleColumns.deliverables && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden w-32`}><div className="flex flex-nowrap gap-1 w-full"><Skeleton className="h-6 w-18 rounded-md" /><Skeleton className="h-6 w-16 rounded-md" /><Skeleton className="h-6 w-14 rounded-md" /></div></TableCell>}
              {visibleColumns.pricing && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden w-20`}><Skeleton className="h-4 w-full" /></TableCell>}
              {visibleColumns.rating && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden w-24`}><div className="flex items-center space-x-1 w-full">{[1, 2, 3, 4, 5].map(star => (<Skeleton key={star} className="h-3 w-3 rounded" />))}</div></TableCell>}
              {visibleColumns.group_chat && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden w-20`}><Skeleton className="h-6 w-full rounded-full" /></TableCell>}
              {visibleColumns.description && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden w-40`}><Skeleton className="h-4 w-full" /></TableCell>}
              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} p-2 overflow-hidden w-16`}><div className="flex space-x-1 w-full"><Skeleton className="h-8 w-8 rounded" /><Skeleton className="h-8 w-8 rounded" /></div></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  // Column resize handlers
  // Remove columnWidths, isResizing, resizingColumn, handleMouseDown, handleMouseMove, handleMouseUp, ResizeHandle
  // Remove all style={{ width: ... }}, minWidth, maxWidth from TableHead and TableCell
  // Set tableLayout to 'auto' or remove it from <Table>

  // Add resize line component


  const renderEditableCell = (value: any, field: keyof MasterKOL, kolId: string, type: 'text' | 'number' | 'select' | 'multiselect' | 'boolean' | 'rating' = 'text') => {
    const isEditing = editingCell?.kolId === kolId && editingCell?.field === field;
    if (type === 'boolean' || type === 'select' || type === 'multiselect' || type === 'rating') {
      switch (type) {
        case 'boolean':
          if (field === 'community' || field === 'group_chat') {
            return (
              <Select 
                value={Boolean(value) ? 'yes' : 'no'} 
                onValueChange={async (newValue) => {
                  const boolValue = newValue === 'yes';
                  const kolToUpdate = kols.find(k => k.id === kolId);
                  if (kolToUpdate) {
                    const updatedKOL = { ...kolToUpdate, [field]: boolValue };
                    setKols(prevKols => 
                      prevKols.map(k => k.id === kolId ? updatedKOL : k)
                    );
                    try {
                      await KOLService.updateKOL(updatedKOL);
                    } catch (error) {
                      console.error('Error updating boolean:', error);
                      setKols(prevKols => 
                        prevKols.map(k => k.id === kolId ? kolToUpdate : k)
                      );
                    }
                  }
                }}
              >
                <SelectTrigger 
                  className={`border-none shadow-none bg-transparent w-auto ${
                  value ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  } px-2 py-1 rounded-md text-xs font-medium inline-flex items-center h-auto focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none`}
                  style={{ outline: 'none', boxShadow: 'none' }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            );
          }
          break;
        case 'rating':
          return (
            <div 
              className="flex items-center space-x-1"
              onDoubleClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const kolToUpdate = kols.find(k => k.id === kolId);
                if (kolToUpdate) {
                  const updatedKOL = { ...kolToUpdate, [field]: 0 };
                  setKols(prevKols => 
                    prevKols.map(k => k.id === kolId ? updatedKOL : k)
                  );
                  try {
                    await KOLService.updateKOL(updatedKOL);
                  } catch (error) {
                    console.error('Error updating rating:', error);
                    setKols(prevKols => 
                      prevKols.map(k => k.id === kolId ? kolToUpdate : k)
                    );
                  }
                }
              }}
            >
              {[1, 2, 3, 4, 5].map(star => (
                <Star
                  key={star}
                  className={`h-3 w-3 cursor-pointer ${
                    star <= (value || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                  }`}
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const kolToUpdate = kols.find(k => k.id === kolId);
                    if (kolToUpdate) {
                      const updatedKOL = { ...kolToUpdate, [field]: star };
                      setKols(prevKols => 
                        prevKols.map(k => k.id === kolId ? updatedKOL : k)
                      );
                      try {
                        await KOLService.updateKOL(updatedKOL);
                      } catch (error) {
                        console.error('Error updating rating:', error);
                        setKols(prevKols => 
                          prevKols.map(k => k.id === kolId ? kolToUpdate : k)
                        );
                      }
                    }
                  }}
                />
              ))}
            </div>
          );
        case 'select':
          const options = field === 'region' ? (fieldOptions?.regions || []) :
                         field === 'pricing' ? (fieldOptions?.pricingTiers || []) :
                         field === 'tier' ? (fieldOptions?.tiers || []) :
                         field === 'creator_type' ? (fieldOptions?.creatorTypes || []) : [];
          const getSelectStyling = () => {
            if (field === 'pricing' && value) {
              return `${getPricingColor(value)} px-2 py-1 rounded-md text-xs font-medium inline-flex items-center`;
            }
            if (field === 'tier' && value) {
              return `${getTierColor(value)} px-2 py-1 rounded-md text-xs font-medium inline-flex items-center`;
            }
            if (field === 'creator_type' && value) {
              return `${getCreatorTypeColor(value)} px-2 py-1 rounded-md text-xs font-medium inline-flex items-center`;
            }
            if (field === 'region' && value) {
              return `px-2 py-1 text-xs font-medium inline-flex items-center`;
            }
            return 'px-2 py-1 text-xs font-medium inline-flex items-center';
          };

          // Handle region and pricing as single-select MultiSelect
          if (field === 'region' || field === 'pricing') {
            const fieldKey = field as 'region' | 'pricing';
            return (
              <MultiSelect
                options={options}
                selected={value ? [value] : []}
                onSelectedChange={async (selected) => {
                  // For single-select behavior, always take the last selected item
                  const newValue = selected.length > 0 ? selected[selected.length - 1] : null;
                  const kolToUpdate = kols.find(k => k.id === kolId);
                  if (kolToUpdate) {
                    const updatedKOL = { ...kolToUpdate, [fieldKey]: newValue };
                    setKols(prevKols => 
                      prevKols.map(k => k.id === kolId ? updatedKOL : k)
                    );
                    try {
                      await KOLService.updateKOL(updatedKOL);
                    } catch (error) {
                      console.error('Error updating field:', error);
                      setKols(prevKols => 
                        prevKols.map(k => k.id === kolId ? kolToUpdate : k)
                      );
                    }
                  }
                }}
                renderOption={(option) => {
                  if (fieldKey === 'region') {
                    return (
                      <div className="flex items-center space-x-2">
                        <span>{getRegionIcon(option).flag}</span>
                        <span>{option}</span>
                      </div>
                    );
                  } else if (fieldKey === 'pricing') {
                    return (
                      <span className={`px-2 py-1 rounded-md text-xs font-medium ${getPricingColor(option)}`}>
                        {option}
                      </span>
                    );
                  }
                  return option;
                }}
                triggerContent={
                  <div className="w-full flex items-center h-7 min-h-[28px]">
                    {value ? (
                      fieldKey === 'region' ? (
                        <div className="flex items-center space-x-1">
                          <span>{getRegionIcon(value).flag}</span>
                          <span className="text-xs font-semibold text-black">{value}</span>
                        </div>
                      ) : fieldKey === 'pricing' ? (
                        <span className={`px-2 py-1 rounded-md text-xs font-medium ${getPricingColor(value)}`}>
                          {value}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-black">{value}</span>
                      )
                    ) : (
                      <span className="flex items-center text-xs font-semibold text-black">Select</span>
                    )}
                    <svg className="h-3 w-3 ml-1 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                }
              />
            );
          }

          // Handle other select fields with original Select component
          return (
            <Select 
              value={value || ''} 
              onValueChange={async (newValue) => {
                const kolToUpdate = kols.find(k => k.id === kolId);
                if (kolToUpdate) {
                  const updatedKOL = { ...kolToUpdate, [field]: newValue };
                  setKols(prevKols => 
                    prevKols.map(k => k.id === kolId ? updatedKOL : k)
                  );
                  try {
                    await KOLService.updateKOL(updatedKOL);
                  } catch (error) {
                    console.error('Error updating select:', error);
                    setKols(prevKols => 
                      prevKols.map(k => k.id === kolId ? kolToUpdate : k)
                    );
                  }
                }
              }}
            >
              <SelectTrigger 
                className={`border-none shadow-none bg-transparent w-auto h-auto ${getSelectStyling()} focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none data-[state=open]:outline-none data-[state=open]:ring-0 data-[state=open]:border-none`}
                style={{ outline: 'none', boxShadow: 'none' }}
              >
                <SelectValue>
                  {(field as string) === 'region' && value && (
                    <div className="flex items-center space-x-1">
                      <span>{getRegionIcon(value).flag}</span>
                      <span>{value}</span>
                    </div>
                  )}
                  {(field as string) !== 'region' && value}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {options.map(option => (
                  <SelectItem key={option} value={option}>
                    {(field as string) === 'region' ? (
                      <div className="flex items-center space-x-2">
                        <span>{getRegionIcon(option).flag}</span>
                        <span>{option}</span>
                      </div>
                    ) : option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        case 'multiselect':
          const multiOptions = (field as string) === 'platform' ? (fieldOptions?.platforms || []) :
                              (field as string) === 'deliverables' ? (fieldOptions?.deliverables || []) :
                              (field as string) === 'niche' ? (fieldOptions?.niches || []) :
                                                              (field as string) === 'creator_type' ? (fieldOptions?.creatorTypes || []) :
                                (field as string) === 'content_type' ? (fieldOptions?.contentTypes || []) : [];
          const currentValues = Array.isArray(value) ? value : [];
                      const placeholder = (field as string) === 'platform' ? 'Select platforms...' :
                              (field as string) === 'deliverables' ? 'Select deliverables...' :
                              (field as string) === 'niche' ? 'Select niches...' :
                              (field as string) === 'creator_type' ? 'Select creator types...' :
                              (field as string) === 'content_type' ? 'Select content types...' : 'Select options...';
          const renderOption = (option: string) => {
            if ((field as string) === 'platform') {
              return (
                <div className="flex items-center justify-center h-5 w-5" title={option}>
                  {getPlatformIcon(option)}
                </div>
              );
            }
            if ((field as string) === 'deliverables') {
              return (
                <span className={`px-2 py-1 rounded-md text-xs font-medium ${getNewContentTypeColor(option)}`}>
                  {option}
                </span>
              );
            }
            if (field === 'content_type') {
              return (
                <span className={`px-2 py-1 rounded-md text-xs font-medium ${getNewContentTypeColor(option)}`}>
                  {option}
                </span>
              );
            }
            if (field === 'creator_type') {
              return (
                <span className={`px-2 py-1 rounded-md text-xs font-medium ${getCreatorTypeColor(option)}`}>
                  {option}
                </span>
              );
            }
            return <span>{option}</span>;
          };
          return (
            <div className="relative w-full">
              <MultiSelect
                options={multiOptions}
                selected={currentValues}
                onSelectedChange={async (newValues) => {
                  const kolToUpdate = kols.find(k => k.id === kolId);
                  if (kolToUpdate) {
                    const updatedKOL = { ...kolToUpdate, [field]: newValues };
                    setKols(prevKols => 
                      prevKols.map(k => k.id === kolId ? updatedKOL : k)
                    );
                    try {
                      await KOLService.updateKOL(updatedKOL);
                    } catch (error) {
                      console.error('Error updating multiselect:', error);
                      setKols(prevKols => 
                        prevKols.map(k => k.id === kolId ? kolToUpdate : k)
                      );
                    }
                  }
                }}
                placeholder={placeholder}
                className="w-full"
                triggerContent={
                  <div className="w-full flex items-center h-7 min-h-[28px]">
                    {currentValues.length > 0 ? (
                      <>
                        {currentValues.map((item, idx) => (
                        <span key={item} className={`px-2 py-1 rounded-md text-xs font-medium flex-shrink-0 ${
                            field === 'platform' ? '' :
                            field === 'deliverables' ? getNewContentTypeColor(item) :
                          field === 'niche' ? getNicheColor(item) : 
                            field === 'creator_type' ? getCreatorTypeColor(item) :
                            field === 'content_type' ? getNewContentTypeColor(item) : 'bg-gray-100 text-gray-800'
                          } ${field === 'creator_type' || field === 'niche' || field === 'deliverables' || field === 'content_type' ? 'mr-1' : ''}`}>
                            {field === 'platform' ? getPlatformIcon(item) : item}
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
          );
        default:
          break;
      }
    }
    if (isEditing && (type === 'text' || type === 'number')) {
      const getInputStyling = () => {
        let baseStyles = "w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none";
        if (field === 'name') {
          return `${baseStyles} font-bold`;
        }
        if (field === 'link') {
          return `${baseStyles} text-blue-600`;
        }
        return `${baseStyles}`;
      };
      switch (type) {
        case 'number':
          return (
            <Input
              type="number"
              value={editingValue || ''}
              onChange={(e) => setEditingValue(parseInt(e.target.value) || null)}
              onBlur={handleCellSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCellSave();
                if (e.key === 'Escape') handleCellCancel();
              }}
              className={getInputStyling()}
              style={{ outline: 'none', boxShadow: 'none', userSelect: 'text' }}
              autoFocus
            />
          );
        default:
          return (
            <Input
              value={editingValue || ''}
              onChange={(e) => setEditingValue(e.target.value)}
              onBlur={handleCellSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCellSave();
                if (e.key === 'Escape') handleCellCancel();
              }}
              className={getInputStyling()}
              style={{ outline: 'none', boxShadow: 'none', userSelect: 'text' }}
              autoFocus
            />
          );
      }
    }
    const displayContent = (() => {
      switch (type) {
        case 'number':
          return field === 'followers' ? KOLService.formatFollowers(value) : value;
        default:
          if (field === 'name' && value) {
            return (
              <span className="font-bold">
                {value}
              </span>
            );
          }
          if (field === 'link' && value) {
            return (
              <a 
                href={value} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-blue-600 hover:text-blue-800"
              >
                <span className="truncate max-w-32">{value}</span>
              </a>
            );
          }
          return value || '-';
      }
    })();
    return (
      <div 
        className="cursor-pointer w-full h-full flex items-center px-1 py-1"
        onDoubleClick={() => handleCellDoubleClick(kolId, field, value)}
        title="Double-click to edit"
      >
        {displayContent}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">KOLs</h2>
            <p className="text-gray-600">Manage your Key Opinion Leaders</p>
          </div>
          <Button 
            className="hover:opacity-90" 
            style={{ backgroundColor: '#3e8692', color: 'white' }}
            disabled
          >
            <Plus className="h-4 w-4 mr-2" />
            Add KOL
          </Button>
        </div>
        <div className="flex items-center space-x-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search KOLs by name, region, or niche..."
              className="pl-10 auth-input"
              disabled
            />
          </div>
        </div>
        <KOLTableSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">KOLs</h2>
            <p className="text-gray-600">Manage your Key Opinion Leaders</p>
          </div>
        </div>
        <div className="text-center py-8">
          <p className="text-red-600">{error}</p>
          <Button onClick={fetchKOLs} className="mt-4">Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">KOLs</h2>
          <p className="text-gray-600">Manage your Key Opinion Leaders</p>
        </div>
        <Button 
          size="sm"
          className="hover:opacity-90" 
          style={{ backgroundColor: '#3e8692', color: 'white' }}
          onClick={handleAddNew}
          disabled={isSavingNewKOL}
        >
          {isSavingNewKOL ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
          ) : (
            <>
          <Plus className="h-4 w-4 mr-2" />
          Add KOL
            </>
          )}
        </Button>
      </div>
      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search KOLs by name, region, or niche..."
            className="pl-10 auth-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      {/* Bulk action bar below search bar (split into two rows) */}
      <div className="mb-4 mt-6">
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
              <span className="text-sm font-semibold text-gray-700">{selectedKOLs.length} KOL{selectedKOLs.length !== 1 ? 's' : ''} selected</span>
            </div>
            <div className="h-4 w-px bg-gray-300"></div>
            <span className="text-xs text-gray-600 font-medium">Bulk Edit Fields</span>
          </div>
          <div className="mb-4 pb-4 border-b border-gray-200">
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
          <div className="flex flex-wrap items-end gap-2">
          {/* Platform */}
          <div className="min-w-[120px] flex flex-col items-end justify-end">
            <span className="text-xs text-gray-600 font-semibold mb-1 self-start">Platform</span>
            <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
              <MultiSelect
                options={fieldOptions.platforms || []}
                selected={bulkEdit.platform || []}
                onSelectedChange={platform => setBulkEdit(prev => ({ ...prev, platform }))}
                placeholder="Platform"
                className="w-full"
                triggerContent={
                  <div className="w-full flex items-center h-7 min-h-[28px]">
                    {bulkEdit.platform && bulkEdit.platform.length > 0 ? (
                      <>
                        {bulkEdit.platform.map((item, idx) => (
                          <span key={item} className="px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800 flex items-center">
                            {getPlatformIcon ? getPlatformIcon(item) : null}
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
          {/* Region */}
          <div className="min-w-[100px] flex flex-col items-end justify-end">
            <span className="text-xs text-gray-600 font-semibold mb-1 self-start">Region</span>
            <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
              <MultiSelect
                options={fieldOptions.regions || []}
                selected={bulkEdit.region ? [bulkEdit.region] : []}
                onSelectedChange={regions => {
                  // For single-select behavior, always take the last selected item
                  const newRegion = regions.length > 0 ? regions[regions.length - 1] : null;
                  setBulkEdit(prev => ({ ...prev, region: newRegion }));
                }}
                placeholder="Region"
                className="w-full"
                renderOption={(option) => (
                  <div className="flex items-center space-x-2">
                    <span>{getRegionIcon(option).flag}</span>
                    <span>{option}</span>
                  </div>
                )}
                triggerContent={
                  <div className="w-full flex items-center h-7 min-h-[28px]">
                    {bulkEdit.region ? (
                      <div className="flex items-center space-x-1">
                        <span>{getRegionIcon(bulkEdit.region).flag}</span>
                        <span className="text-xs font-semibold text-black">{bulkEdit.region}</span>
                      </div>
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
          {/* Creator Type */}
          <div className="min-w-[120px] flex flex-col items-end justify-end">
            <span className="text-xs text-gray-600 font-semibold mb-1 self-start">Creator Type</span>
            <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
              <MultiSelect
                options={fieldOptions.creatorTypes || []}
                selected={bulkEdit.creator_type || []}
                onSelectedChange={creator_type => setBulkEdit(prev => ({ ...prev, creator_type }))}
                placeholder="Creator Type"
                className="w-full"
                triggerContent={
                  <div className="w-full flex items-center h-7 min-h-[28px]">
                    {bulkEdit.creator_type && bulkEdit.creator_type.length > 0 ? (
                      <>
                        {bulkEdit.creator_type.map((item, idx) => (
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
          {/* Content Type */}
          <div className="min-w-[120px] flex flex-col items-end justify-end">
            <span className="text-xs text-gray-600 font-semibold mb-1 self-start">Content Type</span>
            <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
              <MultiSelect
                options={fieldOptions.contentTypes || []}
                selected={bulkEdit.content_type || []}
                onSelectedChange={content_type => setBulkEdit(prev => ({ ...prev, content_type }))}
                placeholder="Content Type"
                className="w-full"
                triggerContent={
                  <div className="w-full flex items-center h-7 min-h-[28px]">
                    {bulkEdit.content_type && bulkEdit.content_type.length > 0 ? (
                      <>
                        {bulkEdit.content_type.map((item, idx) => (
                          <span key={item} className={`px-2 py-1 rounded-md text-xs font-medium flex-shrink-0 ${getNewContentTypeColor(item)} mr-1`}>{item}</span>
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
          {/* Deliverables */}
          <div className="min-w-[120px] flex flex-col items-end justify-end">
            <span className="text-xs text-gray-600 font-semibold mb-1 self-start">Deliverables</span>
            <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
              <MultiSelect
                options={fieldOptions.deliverables || []}
                selected={bulkEdit.deliverables || []}
                onSelectedChange={deliverables => setBulkEdit(prev => ({ ...prev, deliverables }))}
                placeholder="Deliverables"
                className="w-full"
                triggerContent={
                  <div className="w-full flex items-center h-7 min-h-[28px]">
                    {bulkEdit.deliverables && bulkEdit.deliverables.length > 0 ? (
                      <>
                        {bulkEdit.deliverables.map((item, idx) => (
                          <span key={item} className={`px-2 py-1 rounded-md text-xs font-medium flex-shrink-0 ${getNewContentTypeColor(item)} mr-1`}>{item}</span>
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
          {/* Pricing */}
          <div className="min-w-[100px] flex flex-col items-end justify-end">
            <span className="text-xs text-gray-600 font-semibold mb-1 self-start">Pricing</span>
            <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
              <MultiSelect
                options={fieldOptions.pricingTiers || []}
                selected={bulkEdit.pricing ? [bulkEdit.pricing] : []}
                onSelectedChange={pricingTiers => {
                  // For single-select behavior, always take the last selected item
                  const newPricing = pricingTiers.length > 0 ? pricingTiers[pricingTiers.length - 1] : null;
                  setBulkEdit(prev => ({ ...prev, pricing: newPricing }));
                }}
                placeholder="Pricing"
                className="w-full"
                renderOption={(option) => (
                  <span className={`px-2 py-1 rounded-md text-xs font-medium ${getPricingColor(option)}`}>
                    {option}
                  </span>
                )}
                triggerContent={
                  <div className="w-full flex items-center h-7 min-h-[28px]">
                    {bulkEdit.pricing ? (
                      <span className={`px-2 py-1 rounded-md text-xs font-medium ${getPricingColor(bulkEdit.pricing)}`}>
                        {bulkEdit.pricing}
                      </span>
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
          {/* Group Chat */}
          <div className="min-w-[100px] flex flex-col items-end justify-end">
            <span className="text-xs text-gray-600 font-semibold mb-1 self-start">Group Chat</span>
            <Select value={bulkEdit.group_chat === true ? 'yes' : bulkEdit.group_chat === false ? 'no' : ''} onValueChange={v => setBulkEdit(prev => ({ ...prev, group_chat: v === 'yes' }))}>
              <SelectTrigger
                className={`border-none shadow-none bg-transparent w-full h-7 min-h-[28px] px-2 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1 focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none data-[state=open]:outline-none data-[state=open]:ring-0 data-[state=open]:border-none ${bulkEdit.group_chat !== undefined ? (bulkEdit.group_chat ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800') : ''}`}
                style={{ outline: 'none', boxShadow: 'none' }}
              >
                <span>{bulkEdit.group_chat === true ? 'Yes' : bulkEdit.group_chat === false ? 'No' : 'Select'}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex gap-3">
              <Button
                size="sm"
                className="bg-[#3e8692] hover:bg-[#2d6b75] text-white border-0 shadow-sm"
                disabled={selectedKOLs.length === 0}
                onClick={async () => {
                  if (selectedKOLs.length === 0) return;
                  const updates = { ...bulkEdit };
                  setKols(prev => prev.map(kol => selectedKOLs.includes(kol.id) ? { ...kol, ...updates } : kol));
                  await Promise.all(selectedKOLs.map(kolId => {
                    const { id, ...fields } = { ...kols.find(k => k.id === kolId), ...updates };
                    return KOLService.updateKOL({ id: kolId, ...fields });
                  }));
                  setBulkEdit({});
                  setSelectedKOLs([]);
                }}
              >
                Apply
              </Button>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white border-0 shadow-sm"
                disabled={selectedKOLs.length === 0 || isBulkDeleting}
                onClick={() => setShowBulkDeleteDialog(true)}
              >
                Delete
              </Button>
            </div>
            <div className="text-xs text-gray-500 font-medium">
              {selectedKOLs.length > 0 && `${selectedKOLs.length} item${selectedKOLs.length !== 1 ? 's' : ''} selected`}
            </div>
          </div>
        </div>
        </div>
      </div>
      {/* Column visibility dropdown */}
      <div className="mb-4">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Column Visibility
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto min-w-80" align="start" side="top">
            <div className="space-y-3">
              <h4 className="font-medium text-sm">Toggle Columns</h4>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries({
                  name: 'Name',
                  link: 'Link',
                  platform: 'Platform',
                  followers: 'Followers',
                  region: 'Region',
                  creator_type: 'Creator Type',
                  content_type: 'Content Type',
                  deliverables: 'Deliverables',
                  pricing: 'Pricing',
                  rating: 'Rating',
                  group_chat: 'Group Chat',
                  description: 'Description'
                }).map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors">
                    <span className="text-sm font-medium mr-4">{label}</span>
                    <Switch
                      checked={visibleColumns[key as keyof typeof visibleColumns]}
                      onCheckedChange={(checked) => {
                        handleColumnVisibilityChange(key as keyof typeof defaultVisibleColumns, checked);
                      }}
                      className="data-[state=checked]:bg-[#3e8692] data-[state=unchecked]:bg-gray-200"
                    />
                  </label>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div className="border rounded-lg overflow-auto">
        <Table className="min-w-full" style={{ 
          tableLayout: 'auto',
          borderCollapse: 'collapse',
          whiteSpace: 'nowrap'
        }} suppressHydrationWarning>
          <TableHeader>
            <TableRow className="bg-gray-50 border-b border-gray-200">
              <TableHead className="bg-gray-50 border-r border-gray-200 text-center whitespace-nowrap">#</TableHead>
              {visibleColumns.name && <TableHead className="bg-gray-50 border-r border-gray-200 whitespace-nowrap">Name</TableHead>}
              {visibleColumns.link && <TableHead className="bg-gray-50 border-r border-gray-200 whitespace-nowrap">Link</TableHead>}
              {visibleColumns.platform && <TableHead className="bg-gray-50 border-r border-gray-200 whitespace-nowrap">Platform</TableHead>}
              {visibleColumns.followers && <TableHead className="bg-gray-50 border-r border-gray-200 select-none">Followers</TableHead>}
              {visibleColumns.region && <TableHead className="bg-gray-50 border-r border-gray-200 select-none">Region</TableHead>}
              {visibleColumns.creator_type && <TableHead className="bg-gray-50 border-r border-gray-200 select-none">Creator Type</TableHead>}
              {visibleColumns.content_type && <TableHead className="bg-gray-50 border-r border-gray-200 select-none">Content Type</TableHead>}
              {visibleColumns.deliverables && <TableHead className="bg-gray-50 border-r border-gray-200 select-none">Deliverables</TableHead>}
              {visibleColumns.pricing && <TableHead className="bg-gray-50 border-r border-gray-200 select-none">Pricing</TableHead>}
              {visibleColumns.rating && <TableHead className="bg-gray-50 border-r border-gray-200 select-none">Rating</TableHead>}
              {visibleColumns.group_chat && <TableHead className="bg-gray-50 border-r border-gray-200 select-none">Group Chat</TableHead>}
              {visibleColumns.description && <TableHead className="bg-gray-50 border-r border-gray-200 select-none">Description</TableHead>}
              <TableHead className="bg-gray-50 whitespace-nowrap">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="bg-white">
            {filteredKOLs.map((kol, index) => {
              const kolWithVerified = kol as MasterKOL & { verifiedFollowers?: boolean };
              const isChecked = selectedKOLs.includes(kol.id);
              return (
                <TableRow key={kol.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors border-b border-gray-200`}>
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden text-center text-gray-600 group`} style={{ verticalAlign: 'middle', width: 48 }}>
                    <div className="flex items-center justify-center w-full h-full">
                      {isChecked ? (
                        <Checkbox
                          checked={true}
                          onCheckedChange={checked => {
                            if (checked) {
                              setSelectedKOLs(prev => Array.from(new Set([...prev, kol.id])));
                            } else {
                              setSelectedKOLs(prev => prev.filter(id => id !== kol.id));
                            }
                          }}
                          className="mx-auto"
                        />
                      ) : (
                        <>
                          <span className="block group-hover:hidden w-full text-center">{index + 1}</span>
                          <span className="hidden group-hover:flex w-full justify-center">
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={checked => {
                                if (checked) {
                                  setSelectedKOLs(prev => Array.from(new Set([...prev, kol.id])));
                                } else {
                                  setSelectedKOLs(prev => prev.filter(id => id !== kol.id));
                                }
                              }}
                              className="mx-auto"
                            />
                          </span>
                        </>
                      )}
                    </div>
                  </TableCell>
                  {visibleColumns.name && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                      <div className="truncate">{renderEditableCell(kol.name, 'name', kol.id, 'text')}</div>
                  </TableCell>
                  )}
                  {visibleColumns.link && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                      <div className="truncate">{renderEditableCell(kol.link, 'link', kol.id, 'text')}</div>
                  </TableCell>
                  )}
                  {visibleColumns.platform && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                    <div className="truncate">{renderEditableCell(kol.platform, 'platform', kol.id, 'multiselect')}</div>
                  </TableCell>
                  )}
                  {visibleColumns.followers && (
                    <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                      <div className="truncate">{renderEditableCell(kol.followers, 'followers', kol.id, 'number')}</div>
                  </TableCell>
                  )}
                  {visibleColumns.region && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                    <div className="truncate">{renderEditableCell(kol.region, 'region', kol.id, 'select')}</div>
                  </TableCell>
                  )}
                  {visibleColumns.creator_type && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                      <div className="truncate">{renderEditableCell(kol.creator_type, 'creator_type', kol.id, 'multiselect')}</div>
                  </TableCell>
                  )}
                  {visibleColumns.content_type && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                    <div className="truncate">{renderEditableCell(kol.content_type, 'content_type', kol.id, 'multiselect')}</div>
                  </TableCell>
                  )}
                  {visibleColumns.deliverables && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                      <div className="truncate">{renderEditableCell(kol.deliverables, 'deliverables', kol.id, 'multiselect')}</div>
                  </TableCell>
                  )}
                  {visibleColumns.pricing && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                    <div className="truncate">{renderEditableCell(kol.pricing, 'pricing', kol.id, 'select')}</div>
                  </TableCell>
                  )}
                  {visibleColumns.rating && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                    <div className="truncate">{renderEditableCell(kol.rating, 'rating', kol.id, 'rating')}</div>
                  </TableCell>
                  )}
                  {visibleColumns.group_chat && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                    <div className="truncate">{renderEditableCell(kol.group_chat, 'group_chat', kol.id, 'boolean')}</div>
                  </TableCell>
                  )}
                  {visibleColumns.description && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                      <div className="truncate">{renderEditableCell(kol.description, 'description', kol.id, 'text')}</div>
                  </TableCell>
                  )}
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} p-2 overflow-hidden`}>
                    <div className="flex space-x-1">
                      <Button size="sm" variant="outline" onClick={() => handleDelete(kol.id)}>
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
      {filteredKOLs.length === 0 && (
        <div className="text-center py-8">
          <Crown className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-2">No KOLs found</p>
          <p className="text-sm text-gray-500">
            {searchTerm || Object.values(filters).some(value => 
              (typeof value === 'string' && value !== '') || 
              (Array.isArray(value) && value.length > 0)
            ) ? 'Could not find KOLs with selected filters.' : 'Start by adding your first KOL.'}
          </p>
        </div>
      )}
      {/* 4. Add Dialog for single delete at the bottom of the component */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-gray-600 mt-2 mb-2">Are you sure you want to delete this KOL?</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              setShowDeleteDialog(false);
              if (!kolToDelete) return;
              const kolToDeleteObj = kols.find(k => k.id === kolToDelete);
              if (!kolToDeleteObj) return;
              setKols(prevKols => prevKols.filter(k => k.id !== kolToDelete));
              try {
                await KOLService.deleteKOL(kolToDelete);
                toast({
                  title: 'KOL deleted',
                  description: 'KOL deleted successfully.',
                  variant: 'destructive',
                  duration: 3000,
                });
              } catch (error) {
                console.error('Error deleting KOL:', error);
                setKols(prevKols => [...prevKols, kolToDeleteObj]);
              }
              setKolToDelete(null);
            }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* 5. Add Dialog for bulk delete at the bottom of the component */}
      <Dialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Bulk Delete</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-gray-600 mt-2 mb-2">Are you sure you want to delete {selectedKOLs.length} KOL{selectedKOLs.length !== 1 ? 's' : ''}?</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              setShowBulkDeleteDialog(false);
              const toDelete = selectedKOLs;
              setKols(prev => prev.filter(kol => !toDelete.includes(kol.id)));
              await Promise.all(toDelete.map(kolId => KOLService.deleteKOL(kolId)));
              toast({
                title: 'KOLs deleted',
                description: `${toDelete.length} KOL${toDelete.length !== 1 ? 's' : ''} deleted successfully.`,
                variant: 'destructive',
                duration: 3000,
              });
              setSelectedKOLs([]);
            }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 