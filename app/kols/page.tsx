"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Plus, Crown, Save, X, Trash2, Star, Globe, Flag } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { KOLService, MasterKOL } from "@/lib/kolService";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';

export default function KOLsPage() {
  const { user, userProfile } = useAuth();
  const [kols, setKols] = useState<MasterKOL[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCell, setEditingCell] = useState<{kolId: string, field: keyof MasterKOL} | null>(null);
  const [editingValue, setEditingValue] = useState<any>(null);
  const [selectedKOLs, setSelectedKOLs] = useState<string[]>([]);
  const [bulkEdit, setBulkEdit] = useState<Partial<MasterKOL>>({});
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isSavingNewKOL, setIsSavingNewKOL] = useState(false);
  // 1. Add state for delete dialog (single KOL)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [kolToDelete, setKolToDelete] = useState<string | null>(null);

  // 2. Add state for bulk delete dialog
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const fieldOptions = KOLService.getFieldOptions();
  const { toast } = useToast();

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

  const filteredKOLs = kols.filter(kol =>
    kol.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (kol.region && kol.region.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (Array.isArray(kol.niche) && kol.niche.some(n => n.toLowerCase().includes(searchTerm.toLowerCase())))
  );

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
      'Tier 1': 'bg-emerald-100 text-emerald-800',
      'Tier 2': 'bg-blue-100 text-blue-800',
      'Tier 3': 'bg-amber-100 text-amber-800',
      'Tier 4': 'bg-red-100 text-red-800'
    };
    return colorMap[tier] || 'bg-gray-100 text-gray-800';
  };

  const KOLTableSkeleton = () => (
    <div className="border rounded-lg overflow-auto">
      <Table className="min-w-max whitespace-nowrap">
        <TableHeader>
          <TableRow className="bg-gray-50 border-b border-gray-200">
            <TableHead className="bg-gray-50 border-r border-gray-200 text-center whitespace-nowrap">#</TableHead>
            <TableHead className="bg-gray-50 border-r border-gray-200 whitespace-nowrap">Name</TableHead>
            <TableHead className="bg-gray-50 border-r border-gray-200 whitespace-nowrap">Link</TableHead>
            <TableHead className="bg-gray-50 border-r border-gray-200 whitespace-nowrap">Platform</TableHead>
            <TableHead className="bg-gray-50 border-r border-gray-200 whitespace-nowrap">Followers</TableHead>
            <TableHead className="bg-gray-50 border-r border-gray-200 whitespace-nowrap">Region</TableHead>
            <TableHead className="bg-gray-50 border-r border-gray-200 whitespace-nowrap">Community</TableHead>
            <TableHead className="bg-gray-50 border-r border-gray-200 whitespace-nowrap">Content Type</TableHead>
            <TableHead className="bg-gray-50 border-r border-gray-200 whitespace-nowrap">Niche</TableHead>
            <TableHead className="bg-gray-50 border-r border-gray-200 whitespace-nowrap">Pricing</TableHead>
            <TableHead className="bg-gray-50 border-r border-gray-200 whitespace-nowrap">Tier</TableHead>
            <TableHead className="bg-gray-50 border-r border-gray-200 whitespace-nowrap">Rating</TableHead>
            <TableHead className="bg-gray-50 border-r border-gray-200 whitespace-nowrap">Group Chat</TableHead>
            <TableHead className="bg-gray-50 border-r border-gray-200 whitespace-nowrap">Description</TableHead>
            <TableHead className="bg-gray-50 whitespace-nowrap">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="bg-white">
          {Array.from({ length: 8 }).map((_, index) => (
            <TableRow key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b border-gray-200`}>
              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden text-center w-12`}><Skeleton className="h-4 w-6 mx-auto" /></TableCell>
              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden w-32`}><Skeleton className="h-4 w-full" /></TableCell>
              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden w-24`}><Skeleton className="h-4 w-full" /></TableCell>
              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden w-24`}><div className="flex flex-nowrap gap-1 items-center w-full"><Skeleton className="h-5 w-5 rounded-full" /><Skeleton className="h-5 w-5 rounded-full" /></div></TableCell>
              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden w-20`}><Skeleton className="h-4 w-full" /></TableCell>
              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden w-28`}><div className="flex items-center gap-1 w-full"><Skeleton className="h-4 w-4 rounded" /><Skeleton className="h-4 w-20" /></div></TableCell>
              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden w-20`}><Skeleton className="h-6 w-full rounded-full" /></TableCell>
              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden w-32`}><div className="flex flex-nowrap gap-1 w-full"><Skeleton className="h-6 w-16 rounded-md" /><Skeleton className="h-6 w-20 rounded-md" /></div></TableCell>
              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden w-32`}><div className="flex flex-nowrap gap-1 w-full"><Skeleton className="h-6 w-18 rounded-md" /><Skeleton className="h-6 w-16 rounded-md" /><Skeleton className="h-6 w-14 rounded-md" /></div></TableCell>
              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden w-20`}><Skeleton className="h-4 w-full" /></TableCell>
              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden w-16`}><Skeleton className="h-4 w-full" /></TableCell>
              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden w-24`}><div className="flex items-center space-x-1 w-full">{[1, 2, 3, 4, 5].map(star => (<Skeleton key={star} className="h-3 w-3 rounded" />))}</div></TableCell>
              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden w-20`}><Skeleton className="h-6 w-full rounded-full" /></TableCell>
              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden w-40`}><Skeleton className="h-4 w-full" /></TableCell>
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
            <div className="flex items-center space-x-1">
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
                         field === 'tier' ? (fieldOptions?.tiers || []) : [];
          const getSelectStyling = () => {
            if (field === 'pricing' && value) {
              return `${getPricingColor(value)} px-2 py-1 rounded-md text-xs font-medium inline-flex items-center`;
            }
            if (field === 'tier' && value) {
              return `${getTierColor(value)} px-2 py-1 rounded-md text-xs font-medium inline-flex items-center`;
            }
            if (field === 'region' && value) {
              return `px-2 py-1 text-xs font-medium inline-flex items-center`;
            }
            return 'px-2 py-1 text-xs font-medium inline-flex items-center';
          };
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
                  {field === 'region' && value && (
                    <div className="flex items-center space-x-1">
                      <span>{getRegionIcon(value).flag}</span>
                      <span>{value}</span>
                    </div>
                  )}
                  {field !== 'region' && value}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {options.map(option => (
                  <SelectItem key={option} value={option}>
                    {field === 'region' ? (
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
          const multiOptions = field === 'platform' ? (fieldOptions?.platforms || []) :
                              field === 'content_type' ? (fieldOptions?.contentTypes || []) :
                              field === 'niche' ? (fieldOptions?.niches || []) : [];
          const currentValues = Array.isArray(value) ? value : [];
          const placeholder = field === 'platform' ? 'Select platforms...' :
                             field === 'content_type' ? 'Select content types...' :
                             field === 'niche' ? 'Select niches...' : 'Select options...';
          const renderOption = (option: string) => {
            if (field === 'platform') {
              return (
                <div className="flex items-center justify-center h-5 w-5" title={option}>
                  {getPlatformIcon(option)}
                </div>
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
                renderOption={renderOption}
                triggerContent={
                  <div className="flex items-center justify-between w-full">
                    <div className="flex gap-1 overflow-x-auto overflow-y-hidden whitespace-nowrap [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] flex-1">
                      {currentValues.map((item, index) => (
                        <span key={item} className={`px-2 py-1 rounded-md text-xs font-medium flex-shrink-0 ${
                          field === 'content_type' ? getContentTypeColor(item) : 
                          field === 'niche' ? getNicheColor(item) : 
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {field === 'platform' ? (
                            <div className="flex items-center justify-center h-5 w-5" title={item}>
                              {getPlatformIcon(item)}
                            </div>
                          ) : item}
                        </span>
                      ))}
                    </div>
                    <svg className="h-3 w-3 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                }
                className=""
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
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium">{selectedKOLs.length} selected:</span>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {/* Platform */}
          <div className="min-w-[120px] flex flex-col items-end justify-end">
            <span className="text-xs text-gray-500 font-semibold mb-1 self-start">Platform</span>
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
          {/* Content Type */}
          <div className="min-w-[120px] flex flex-col items-end justify-end">
            <span className="text-xs text-gray-500 font-semibold mb-1 self-start">Content Type</span>
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
                          <span key={item} className={`px-2 py-1 rounded-md text-xs font-medium flex-shrink-0 ${getContentTypeColor ? getContentTypeColor(item) : 'bg-gray-100 text-gray-800'}`}>{item}</span>
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
          {/* Niche */}
          <div className="min-w-[120px] flex flex-col items-end justify-end">
            <span className="text-xs text-gray-500 font-semibold mb-1 self-start">Niche</span>
            <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
              <MultiSelect
                options={fieldOptions.niches || []}
                selected={bulkEdit.niche || []}
                onSelectedChange={niche => setBulkEdit(prev => ({ ...prev, niche }))}
                placeholder="Niche"
                className="w-full"
                triggerContent={
                  <div className="w-full flex items-center h-7 min-h-[28px]">
                    {bulkEdit.niche && bulkEdit.niche.length > 0 ? (
                      <>
                        {bulkEdit.niche.map((item, idx) => (
                          <span key={item} className={`px-2 py-1 rounded-md text-xs font-medium flex-shrink-0 ${getNicheColor ? getNicheColor(item) : 'bg-gray-100 text-gray-800'}`}>{item}</span>
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
            <span className="text-xs text-gray-500 font-semibold mb-1 self-start">Pricing</span>
            <Select value={bulkEdit.pricing || ''} onValueChange={pricing => setBulkEdit(prev => ({ ...prev, pricing: pricing as MasterKOL['pricing'] }))}>
              <SelectTrigger
                className={`border-none shadow-none bg-transparent w-full h-7 min-h-[28px] px-2 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none data-[state=open]:outline-none data-[state=open]:ring-0 data-[state=open]:border-none ${bulkEdit.pricing ? getPricingColor(bulkEdit.pricing) : ''}`}
                style={{ outline: 'none', boxShadow: 'none' }}
              >
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {(fieldOptions.pricingTiers || []).map(tier => (
                  <SelectItem key={tier} value={tier}>{tier}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Tier */}
          <div className="min-w-[80px] flex flex-col items-end justify-end">
            <span className="text-xs text-gray-500 font-semibold mb-1 self-start">Tier</span>
            <Select value={bulkEdit.tier || ''} onValueChange={tier => setBulkEdit(prev => ({ ...prev, tier: tier as MasterKOL['tier'] }))}>
              <SelectTrigger
                className={`border-none shadow-none bg-transparent w-full h-7 min-h-[28px] px-2 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none data-[state=open]:outline-none data-[state=open]:ring-0 data-[state=open]:border-none ${bulkEdit.tier ? getTierColor(bulkEdit.tier) : ''}`}
                style={{ outline: 'none', boxShadow: 'none' }}
              >
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {(fieldOptions.tiers || []).map(tier => (
                  <SelectItem key={tier} value={tier}>{tier}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Community */}
          <div className="min-w-[80px] flex flex-col items-end justify-end">
            <span className="text-xs text-gray-500 font-semibold mb-1 self-start">Community</span>
            <Select value={bulkEdit.community === true ? 'yes' : bulkEdit.community === false ? 'no' : ''} onValueChange={v => setBulkEdit(prev => ({ ...prev, community: v === 'yes' }))}>
              <SelectTrigger
                className={`border-none shadow-none bg-transparent w-full h-7 min-h-[28px] px-2 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1 focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none data-[state=open]:outline-none data-[state=open]:ring-0 data-[state=open]:border-none ${bulkEdit.community !== undefined ? (bulkEdit.community ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800') : ''}`}
                style={{ outline: 'none', boxShadow: 'none' }}
              >
                <span>{bulkEdit.community === true ? 'Yes' : bulkEdit.community === false ? 'No' : 'Select'}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Group Chat */}
          <div className="min-w-[100px] flex flex-col items-end justify-end">
            <span className="text-xs text-gray-500 font-semibold mb-1 self-start">Group Chat</span>
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
          {/* Region */}
          <div className="min-w-[100px] flex flex-col items-end justify-end">
            <span className="text-xs text-gray-500 font-semibold mb-1 self-start">Region</span>
            <Select value={bulkEdit.region || ''} onValueChange={region => setBulkEdit(prev => ({ ...prev, region: region as MasterKOL['region'] }))}>
              <SelectTrigger
                className={`border-none shadow-none bg-transparent w-full h-7 min-h-[28px] px-2 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none data-[state=open]:outline-none data-[state=open]:ring-0 data-[state=open]:border-none ${bulkEdit.region ? '' : ''}`}
                style={{ outline: 'none', boxShadow: 'none' }}
              >
                {bulkEdit.region ? (
                  <div className="flex items-center space-x-1">
                    <span>{getRegionIcon(bulkEdit.region).flag}</span>
                    <span className="text-xs font-semibold text-black">{bulkEdit.region}</span>
                  </div>
                ) : (
                  <span className="text-xs font-semibold text-black">Select</span>
                )}
              </SelectTrigger>
              <SelectContent>
                {(fieldOptions.regions || []).map(region => (
                  <SelectItem key={region} value={region}>{region}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            style={{ backgroundColor: '#3e8692', color: 'white' }}
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
            variant="destructive"
            disabled={selectedKOLs.length === 0 || isBulkDeleting}
            onClick={() => setShowBulkDeleteDialog(true)}
          >
            Delete
          </Button>
        </div>
        <div className="mt-6 mb-2">
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
      </div>
      <div className="border rounded-lg overflow-auto">
        <Table className="min-w-full" style={{ 
          tableLayout: 'auto',
          borderCollapse: 'collapse',
          whiteSpace: 'nowrap'
        }} suppressHydrationWarning>
          <TableHeader>
            <TableRow className="bg-gray-50 border-b border-gray-200">
              <TableHead className="relative bg-gray-50 border-r border-gray-200 text-center whitespace-nowrap w-12 select-none">#</TableHead>
              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Name</TableHead>
              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Link</TableHead>
              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Platform</TableHead>
              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Followers</TableHead>
              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Region</TableHead>
              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Community</TableHead>
              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Content Type</TableHead>
              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Niche</TableHead>
              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Pricing</TableHead>
              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Tier</TableHead>
              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Rating</TableHead>
              <TableHead className="relative bg-gray-50 border-r border-gray-200 whitespace-nowrap select-none">Group Chat</TableHead>
              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Description</TableHead>
              <TableHead className="relative bg-gray-50 select-none">Actions</TableHead>
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
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                    <div className="truncate">{renderEditableCell(kol.name, 'name', kol.id)}</div>
                  </TableCell>
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                    <div className="truncate">{renderEditableCell(kol.link, 'link', kol.id)}</div>
                  </TableCell>
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                    <div className="truncate">{renderEditableCell(kol.platform, 'platform', kol.id, 'multiselect')}</div>
                  </TableCell>
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden group`} style={{}}>
                    <div className="truncate flex items-center">
                      {renderEditableCell(kol.followers, 'followers', kol.id, 'number')}
                    </div>
                  </TableCell>
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                    <div className="truncate">{renderEditableCell(kol.region, 'region', kol.id, 'select')}</div>
                  </TableCell>
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                    <div className="truncate">{renderEditableCell(kol.community, 'community', kol.id, 'boolean')}</div>
                  </TableCell>
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                    <div className="truncate">{renderEditableCell(kol.content_type, 'content_type', kol.id, 'multiselect')}</div>
                  </TableCell>
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                    <div className="truncate">{renderEditableCell(kol.niche, 'niche', kol.id, 'multiselect')}</div>
                  </TableCell>
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                    <div className="truncate">{renderEditableCell(kol.pricing, 'pricing', kol.id, 'select')}</div>
                  </TableCell>
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                    <div className="truncate">{renderEditableCell(kol.tier, 'tier', kol.id, 'select')}</div>
                  </TableCell>
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                    <div className="truncate">{renderEditableCell(kol.rating, 'rating', kol.id, 'rating')}</div>
                  </TableCell>
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                    <div className="truncate">{renderEditableCell(kol.group_chat, 'group_chat', kol.id, 'boolean')}</div>
                  </TableCell>
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                    <div className="truncate">{renderEditableCell(kol.description, 'description', kol.id)}</div>
                  </TableCell>
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
            {searchTerm ? 'Try adjusting your search terms.' : 'Start by adding your first KOL.'}
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