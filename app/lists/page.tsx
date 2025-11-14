'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, Edit, List, User, Trash2, Calendar, Users, X, Flag, Globe, Share2, ChevronDown, Star } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { KOLService } from '@/lib/kolService';
import { useToast } from '@/hooks/use-toast';

interface ListItem {
  id: string;
  name: string;
  notes: string | null;
  status?: string | null;
  created_at: string;
  updated_at: string;
  kols?: {
    id: string;
    name: string;
    platform: string[] | null;
    followers: number | null;
    region: string | null;
    link: string | null;
    content_type: string[] | null;
    status?: string | null;
    notes?: string | null;
  }[];
}

// Utility functions (matching campaigns details page)
const getStatusColor = (status: string) => {
  switch (status) {
    case 'curated': return 'bg-blue-100 text-blue-800';
    case 'interested': return 'bg-yellow-100 text-yellow-800';
    case 'onboarded': return 'bg-green-100 text-green-800';
    case 'concluded': return 'bg-gray-100 text-gray-800';
    default: return 'bg-gray-100 text-gray-800';
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
          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.10-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
        </svg>
      );
    default:
      return null;
  }
};

const getContentTypeColor = (type: string) => {
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
  return colorMap[type] || 'bg-gray-100 text-gray-800';
};

// List status colors (for curated/approved/denied)
const getListStatusColor = (status: string) => {
  switch (status) {
    case 'curated':
      return 'bg-blue-100 text-blue-800';
    case 'approved':
      return 'bg-green-100 text-green-800';
    case 'denied':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export default function ListsPage() {
  const { user, userProfile } = useAuth();
  const [lists, setLists] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isNewListOpen, setIsNewListOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingList, setEditingList] = useState<ListItem | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [allKOLs, setAllKOLs] = useState<any[]>([]);
  const [kolSearchTerm, setKolSearchTerm] = useState('');
  const [platformFilter, setPlatformFilter] = useState<string[]>([]);
  const [regionFilter, setRegionFilter] = useState<string[]>([]);
  const [platformFilterSearch, setPlatformFilterSearch] = useState('');
  const [regionFilterSearch, setRegionFilterSearch] = useState('');
  const [contentTypeFilter, setContentTypeFilter] = useState<string[]>([]);
  const [contentTypeFilterSearch, setContentTypeFilterSearch] = useState('');
  const [followersOperator, setFollowersOperator] = useState('');
  const [followersValue, setFollowersValue] = useState('');
  const [ratingOperator, setRatingOperator] = useState('');
  const [ratingValue, setRatingValue] = useState('');


  // Confirmation dialog states
  const [isDeleteListDialogOpen, setIsDeleteListDialogOpen] = useState(false);
  const [isDeleteKOLDialogOpen, setIsDeleteKOLDialogOpen] = useState(false);
  const [listToDelete, setListToDelete] = useState<string | null>(null);
  const [kolToDelete, setKolToDelete] = useState<{ listId: string; kolId: string; kolName: string } | null>(null);

  // View list dialog state
  const [isViewListDialogOpen, setIsViewListDialogOpen] = useState(false);
  const [viewingList, setViewingList] = useState<ListItem | null>(null);
  
  // KOL notes editing state
  const [editingKolNotes, setEditingKolNotes] = useState<{kolId: string, notes: string} | null>(null);

  // Share list dialog state
  const [isShareListDialogOpen, setIsShareListDialogOpen] = useState(false);
  const [sharingList, setSharingList] = useState<ListItem | null>(null);

  // Combine lists dialog state
  const [isCombineListsDialogOpen, setIsCombineListsDialogOpen] = useState(false);
  const [selectedListsToCombine, setSelectedListsToCombine] = useState<string[]>([]);
  const [combinedListName, setCombinedListName] = useState('');
  const [isCombining, setIsCombining] = useState(false);

  // New list form state
  const [newList, setNewList] = useState({
    name: '',
    notes: '',
    selectedKOLs: [] as string[],
  });

  // Filter KOLs based on search term + dropdown filters
  const filteredAvailableKOLs = allKOLs.filter((kol: any) => {
    const matchesSearch =
      kol.name?.toLowerCase().includes(kolSearchTerm.toLowerCase()) ||
      (kol.region && kol.region.toLowerCase().includes(kolSearchTerm.toLowerCase())) ||
      (Array.isArray(kol.platform) && kol.platform.some((p: string) => p.toLowerCase().includes(kolSearchTerm.toLowerCase())));

    const matchesPlatform =
      platformFilter.length === 0 || (Array.isArray(kol.platform) && platformFilter.some(p => kol.platform.includes(p)));

    const matchesRegion = regionFilter.length === 0 || (kol.region && regionFilter.includes(kol.region));

    const matchesContentType =
      contentTypeFilter.length === 0 || (Array.isArray(kol.content_type) && contentTypeFilter.some(ct => kol.content_type.includes(ct)));

    const matchesFollowers = (() => {
      if (!followersOperator || !followersValue) return true;
      const kolFollowers = kol.followers || 0;
      const filterValue = parseInt(followersValue, 10);
      if (isNaN(filterValue)) return true;

      switch (followersOperator) {
        case '>':
          return kolFollowers > filterValue;
        case '<':
          return kolFollowers < filterValue;
        case '=':
          return kolFollowers === filterValue;
        default:
          return true;
      }
    })();

    const matchesRating = (() => {
      if (!ratingOperator || !ratingValue) return true;
      const kolRating = kol.rating || 0;
      const filterValue = parseInt(ratingValue, 10);
      if (isNaN(filterValue)) return true;

      switch (ratingOperator) {
        case '>':
          return kolRating > filterValue;
        case '<':
          return kolRating < filterValue;
        case '=':
          return kolRating === filterValue;
        default:
          return true;
      }
    })();

    return matchesSearch && matchesPlatform && matchesRegion && matchesContentType && matchesFollowers && matchesRating;
  });

  const { toast } = useToast();

  // Multi-select dropdown component (identical styling to KOLs bulk menu)
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
        <PopoverContent className="w-[220px] p-0" align="start">
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
                  className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    const newSelected = safeSelected.includes(option)
                      ? safeSelected.filter(item => item !== option)
                      : [...safeSelected, option];
                    onSelectedChange(newSelected);
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
  };

  useEffect(() => {
    fetchLists();
    fetchKOLs();
  }, [user?.id]);

  const fetchLists = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      setError(null);
      
      // First, get all lists with whitelist company info
      const { data: listsData, error: listsError } = await supabase
        .from('lists')
        .select(`
          id,
          name,
          notes,
          status,
          created_at,
          updated_at
        `)
        .order('created_at', { ascending: false });

      if (listsError) throw listsError;

      // Then, get KOLs for each list
      const listsWithKOLs = await Promise.all(
        (listsData || []).map(async (list) => {
          const { data: kolsData, error: kolsError } = await supabase
            .from('list_kols')
            .select(`
              status,
              notes,
              master_kol:master_kols(
                id,
                name,
                platform,
                followers,
                region,
                link,
                content_type
              )
            `)
            .eq('list_id', list.id);

          if (kolsError) throw kolsError;

          return {
            ...list,

            kols: kolsData?.map(item => ({
              ...item.master_kol,
              status: item.status,
              notes: item.notes || null
            })).filter(Boolean) || []
          };
        })
      );

      setLists(listsWithKOLs);
    } catch (err) {
      setError('Failed to load lists');
      console.error('Error fetching lists:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchKOLs = async () => {
    try {
      const { data, error } = await supabase
        .from('master_kols')
        .select('id, name, platform, followers, region, link, content_type, rating')
        .order('name');

      if (error) throw error;
      setAllKOLs(data || []);
    } catch (err) {
      console.error('Error fetching KOLs:', err);
    }
  };



  const filteredLists = lists.filter(list =>
    list.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    list.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    list.kols?.some(kol => 
      kol.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      kol.region?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const handleEditList = (list: ListItem) => {
    setEditingList(list);
    setNewList({
      name: list.name,
      notes: list.notes || '',
      selectedKOLs: list.kols?.map(kol => kol.id) || [],
    });
    setIsEditMode(true);
    setIsNewListOpen(true);
  };

  const handleCloseListModal = () => {
    setIsNewListOpen(false);
    setIsEditMode(false);
    setEditingList(null);
    setNewList({ 
      name: '', 
      notes: '', 
      selectedKOLs: [],
    });
  };

  const handleViewList = (list: ListItem) => {
    setViewingList(list);
    setIsViewListDialogOpen(true);
  };

  const handleShareList = (list: ListItem) => {
    setSharingList(list);
    setIsShareListDialogOpen(true);
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newList.name.trim()) return;
    
    try {
      setIsSubmitting(true);
      
      let listId: string;
      
      if (isEditMode && editingList) {
        // Update existing list
        const { error: updateError } = await supabase
          .from('lists')
          .update({
            name: newList.name.trim(),
            notes: newList.notes.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingList.id);

        if (updateError) throw updateError;
        listId = editingList.id;

        // Remove existing KOL associations
        const { error: deleteError } = await supabase
          .from('list_kols')
          .delete()
          .eq('list_id', editingList.id);

        if (deleteError) throw deleteError;
      } else {
        // Create new list
        const { data: newListData, error: insertError } = await supabase
          .from('lists')
          .insert({
            name: newList.name.trim(),
            notes: newList.notes.trim() || null,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        listId = newListData.id;
      }

      // Add KOL associations
      if (newList.selectedKOLs.length > 0) {
        const kolAssociations = newList.selectedKOLs.map(kolId => ({
          list_id: listId,
          master_kol_id: kolId,
          status: 'curated', // Default status for new KOLs in list
        }));

        const { error: kolsError } = await supabase
          .from('list_kols')
          .insert(kolAssociations);

        if (kolsError) throw kolsError;
      }
    
      handleCloseListModal();
      await fetchLists();
      
      toast({
        title: isEditMode ? "List Updated" : "List Created",
        description: isEditMode 
          ? "Your list has been updated successfully." 
          : "Your list has been created successfully.",
      });
    } catch (err) {
      console.error('Error saving list:', err);
      toast({
        title: "Error",
        description: "Failed to save list. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteList = async (listId: string) => {
    setListToDelete(listId);
    setIsDeleteListDialogOpen(true);
  };

  const confirmDeleteList = async () => {
    if (!listToDelete) return;
    
    try {
      const { error } = await supabase
        .from('lists')
        .delete()
        .eq('id', listToDelete);

      if (error) throw error;
      await fetchLists();
      
      toast({
        title: "List Deleted",
        description: "The list has been deleted successfully.",
      });
    } catch (err) {
      console.error('Error deleting list:', err);
      toast({
        title: "Error",
        description: "Failed to delete list. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleteListDialogOpen(false);
      setListToDelete(null);
    }
  };

  const handleRemoveKOLFromList = async (listId: string, kolId: string, kolName: string) => {
    setKolToDelete({ listId, kolId, kolName });
    setIsDeleteKOLDialogOpen(true);
  };

  const confirmRemoveKOLFromList = async () => {
    if (!kolToDelete) return;
    
    try {
      const { error } = await supabase
        .from('list_kols')
        .delete()
        .eq('list_id', kolToDelete.listId)
        .eq('master_kol_id', kolToDelete.kolId);

      if (error) throw error;
      await fetchLists();
      
      toast({
        title: "KOL Removed",
        description: `${kolToDelete.kolName} has been removed from the list.`,
      });
    } catch (err) {
      console.error('Error removing KOL from list:', err);
      toast({
        title: "Error",
        description: "Failed to remove KOL from list. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleteKOLDialogOpen(false);
      setKolToDelete(null);
    }
  };

  const handleUpdateKOLStatus = async (kolId: string, status: string) => {
    try {
      if (!viewingList?.id) return;
      
      // Find the list_kols record to update
      const { error } = await supabase
        .from('list_kols')
        .update({ status })
        .eq('master_kol_id', kolId)
        .eq('list_id', viewingList.id);

      if (error) throw error;
      
      // Update local state
      if (viewingList) {
        setViewingList(prev => prev ? {
          ...prev,
          kols: prev.kols?.map(kol => 
            kol.id === kolId ? { ...kol, status } : kol
          )
        } : null);
      }
      
      // Also update the main lists state
      setLists(prev => prev.map(list => 
        list.id === viewingList?.id ? {
          ...list,
          kols: list.kols?.map(kol => 
            kol.id === kolId ? { ...kol, status } : kol
          )
        } : list
      ));

      toast({
        title: "Status Updated",
        description: "KOL status has been updated successfully.",
      });
    } catch (err) {
      console.error('Error updating KOL status:', err);
      toast({
        title: "Error",
        description: "Failed to update KOL status. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleStartEditKolNotes = (kolId: string, currentNotes: string) => {
    setEditingKolNotes({ kolId, notes: currentNotes || '' });
  };

  const handleSaveKolNotes = async () => {
    if (!editingKolNotes || !viewingList) return;
    
    try {
      // Update the notes in the database
      const { error } = await supabase
        .from('list_kols')
        .update({ notes: editingKolNotes.notes.trim() || null })
        .eq('list_id', viewingList.id)
        .eq('master_kol_id', editingKolNotes.kolId);

      if (error) throw error;

      // Update the local state
      setViewingList(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          kols: prev.kols?.map(kol => 
            kol.id === editingKolNotes.kolId 
              ? { ...kol, notes: editingKolNotes.notes.trim() || null } 
              : kol
          )
        };
      });

      // Also update the main lists state
      setLists(prev => 
        prev.map(list => 
          list.id === viewingList.id 
            ? {
                ...list,
                kols: list.kols?.map(kol => 
                  kol.id === editingKolNotes.kolId 
                    ? { ...kol, notes: editingKolNotes.notes.trim() || null } 
                    : kol
                )
              }
            : list
        )
      );

      setEditingKolNotes(null);
      toast({
        title: "Notes Updated",
        description: "KOL notes have been updated successfully.",
      });
    } catch (err) {
      console.error('Error updating KOL notes:', err);
      toast({
        title: "Error",
        description: "Failed to update KOL notes. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCancelEditKolNotes = () => {
    setEditingKolNotes(null);
  };

  const handleCombineLists = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!combinedListName.trim() || selectedListsToCombine.length === 0) return;

    try {
      setIsCombining(true);

      // Get all unique KOL IDs from selected lists
      const selectedLists = lists.filter(list => selectedListsToCombine.includes(list.id));
      const allKolIds = new Set<string>();

      selectedLists.forEach(list => {
        list.kols?.forEach(kol => {
          allKolIds.add(kol.id);
        });
      });

      // Create new list
      const { data: newListData, error: insertError } = await supabase
        .from('lists')
        .insert({
          name: combinedListName.trim(),
          notes: `Combined from: ${selectedLists.map(l => l.name).join(', ')}`,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Add all unique KOLs to the new list
      if (allKolIds.size > 0) {
        const kolAssociations = Array.from(allKolIds).map(kolId => ({
          list_id: newListData.id,
          master_kol_id: kolId,
          status: 'curated',
        }));

        const { error: kolsError } = await supabase
          .from('list_kols')
          .insert(kolAssociations);

        if (kolsError) throw kolsError;
      }

      // Reset state and close dialog
      setIsCombineListsDialogOpen(false);
      setSelectedListsToCombine([]);
      setCombinedListName('');
      await fetchLists();

      toast({
        title: "Lists Combined",
        description: `Successfully created "${combinedListName}" with ${allKolIds.size} unique KOLs.`,
      });
    } catch (err) {
      console.error('Error combining lists:', err);
      toast({
        title: "Error",
        description: "Failed to combine lists. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCombining(false);
    }
  };

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const ListCardSkeleton = () => (
    <Card className="transition-shadow h-full flex flex-col">
      <CardHeader className="pb-4">
        <div className="mb-3">
          <div className="flex items-center justify-between text-lg font-semibold text-gray-600 mb-2">
            <div className="flex items-center">
              <Skeleton className="h-8 w-8 rounded-lg mr-2" />
              <Skeleton className="h-5 w-40" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center text-sm text-gray-600">
            <Skeleton className="h-4 w-4 mr-2" />
            <Skeleton className="h-4 w-36" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4 border-t border-gray-100 flex flex-col flex-1">
        <div className="flex gap-2 mt-auto">
          <Skeleton className="h-8 w-full rounded" />
          <Skeleton className="h-8 w-full rounded" />
        </div>
        <Skeleton className="h-8 w-full rounded mt-2" />
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Lists</h2>
              <p className="text-gray-600">Manage your KOL lists and notes</p>
            </div>
            <div className="flex space-x-3">
              <Button className="hover:opacity-90" style={{ backgroundColor: '#3e8692', color: 'white' }} disabled>
                <List className="h-4 w-4 mr-2" />
                Combine Lists
              </Button>
              <Button className="hover:opacity-90" style={{ backgroundColor: '#3e8692', color: 'white' }} disabled>
                <Plus className="h-4 w-4 mr-2" />
                Add List
              </Button>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input placeholder="Search lists by name, notes, or KOLs..." className="pl-10 auth-input" disabled />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <ListCardSkeleton key={index} />
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
              <h2 className="text-2xl font-bold text-gray-900">Lists</h2>
              <p className="text-gray-600">Manage your KOL lists and notes</p>
            </div>
          </div>
          <div className="text-center py-8">
            <p className="text-red-600">{error}</p>
            <Button onClick={fetchLists} className="mt-4 hover:opacity-90" style={{ backgroundColor: '#3e8692', color: 'white' }}>
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
            <h2 className="text-2xl font-bold text-gray-900">Lists</h2>
            <p className="text-gray-600">Manage your KOL lists and notes</p>
          </div>
          <div className="flex space-x-3">
            <Button
              className="hover:opacity-90"
              style={{ backgroundColor: '#3e8692', color: 'white' }}
              onClick={() => setIsCombineListsDialogOpen(true)}
              disabled={lists.length < 2}
              title={lists.length < 2 ? "Need at least 2 lists to combine" : "Combine multiple lists into one"}
            >
              <List className="h-4 w-4 mr-2" />
              Combine Lists
            </Button>
            <Dialog open={isNewListOpen} onOpenChange={(open) => {
              if (!open) {
                handleCloseListModal();
              } else {
                setIsNewListOpen(true);
              }
            }}>
              <DialogTrigger asChild>
                <Button className="hover:opacity-90" style={{ backgroundColor: '#3e8692', color: 'white' }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add List
                </Button>
              </DialogTrigger>
                              <DialogContent className="max-w-6xl max-h-[80vh] overflow-hidden">
                <DialogHeader>
                  <DialogTitle>{isEditMode ? 'Edit List' : 'Add New List'}</DialogTitle>
                  <DialogDescription>
                    {isEditMode ? 'Update the list information below.' : 'Create a new list to organize your KOLs.'}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateList}>
                  <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto px-3 pb-6">
                    <div className="grid gap-2">
                      <Label htmlFor="name">List Name</Label>
                      <Input
                        id="name"
                        value={newList.name}
                        onChange={(e) => setNewList({ ...newList, name: e.target.value })}
                        placeholder="Enter list name"
                        className="auth-input"
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea
                        id="notes"
                        value={newList.notes}
                        onChange={(e) => setNewList({ ...newList, notes: e.target.value })}
                        placeholder="Enter notes about this list..."
                        className="auth-input min-h-[100px]"
                      />
                    </div>

                    <div className="border-t pt-4 mt-2"></div>

                    <div className="grid gap-2 bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <Label className="text-base font-semibold">Select KOLs ({newList.selectedKOLs.length} selected)</Label>
                      {/* Search bar */}
                      <div className="mb-3">
                        <Input
                          placeholder="Search KOLs by name, region, or platform..."
                          className="auth-input"
                          value={kolSearchTerm}
                          onChange={e => setKolSearchTerm(e.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mb-2"
                        onClick={() => {
                          const allIds = filteredAvailableKOLs.map(kol => kol.id);
                          if (allIds.length > 0 && allIds.every(id => newList.selectedKOLs.includes(id))) {
                            // Deselect all (clear entire selection)
                            setNewList(prev => ({ ...prev, selectedKOLs: [] }));
                          } else {
                            // Select all (only the filtered ones)
                            setNewList(prev => ({ ...prev, selectedKOLs: allIds }));
                          }
                        }}
                      >
                        {filteredAvailableKOLs.length > 0 && filteredAvailableKOLs.every(kol => newList.selectedKOLs.includes(kol.id)) ? 'Deselect All' : 'Select All'}
                      </Button>
                      <div className="border rounded-lg overflow-hidden mt-2">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-gray-50">
                              <TableHead className="w-12">Select</TableHead>
                              <TableHead>Name</TableHead>
                              <TableHead className="relative bg-gray-50 select-none">
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
                                            value={followersOperator}
                                            onValueChange={(value) => setFollowersOperator(value)}
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
                                            value={followersValue}
                                            onChange={(e) => setFollowersValue(e.target.value)}
                                            className="h-8 text-xs auth-input"
                                          />
                                        </div>
                                        {(followersOperator || followersValue) && (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="w-full text-xs"
                                            onClick={() => {
                                              setFollowersOperator('');
                                              setFollowersValue('');
                                            }}
                                          >
                                            Clear
                                          </Button>
                                        )}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                  {(followersOperator && followersValue) && (
                                    <span className="ml-1 bg-[#3e8692] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                      1
                                    </span>
                                  )}
                                </div>
                              </TableHead>
                              <TableHead className="relative bg-gray-50 select-none">
                                <div className="flex items-center gap-1 cursor-pointer group">
                                  <span>Rating</span>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                        <ChevronDown className="h-3 w-3" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[200px] p-0" align="start">
                                      <div className="p-3">
                                        <div className="text-xs font-semibold text-gray-600 mb-2">Filter Rating</div>
                                        <div className="flex items-center gap-2 mb-2">
                                          <Select
                                            value={ratingOperator}
                                            onValueChange={(value) => setRatingOperator(value)}
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
                                            value={ratingValue}
                                            onChange={(e) => setRatingValue(e.target.value)}
                                            className="h-8 text-xs auth-input"
                                          />
                                        </div>
                                        {(ratingOperator || ratingValue) && (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="w-full text-xs"
                                            onClick={() => {
                                              setRatingOperator('');
                                              setRatingValue('');
                                            }}
                                          >
                                            Clear
                                          </Button>
                                        )}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                  {(ratingOperator && ratingValue) && (
                                    <span className="ml-1 bg-[#3e8692] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                      1
                                    </span>
                                  )}
                                </div>
                              </TableHead>
                              <TableHead className="relative bg-gray-50 select-none">
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
                                              const newRegions = regionFilter.includes(region)
                                                ? regionFilter.filter(r => r !== region)
                                                : [...regionFilter, region];
                                              setRegionFilter(newRegions);
                                            }}
                                          >
                                            <Checkbox checked={regionFilter.includes(region)} />
                                            <div className="flex items-center gap-1">
                                              <span>{getRegionIcon(region).flag}</span>
                                              <span className="text-sm">{region}</span>
                                            </div>
                                          </div>
                                        ))}
                                        {regionFilter.length > 0 && (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="w-full mt-2 text-xs"
                                            onClick={() => setRegionFilter([])}
                                          >
                                            Clear
                                          </Button>
                                        )}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                  {regionFilter.length > 0 && (
                                    <span className="ml-1 bg-[#3e8692] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                      {regionFilter.length}
                                    </span>
                                  )}
                                </div>
                              </TableHead>
                              <TableHead className="relative bg-gray-50 select-none">
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
                                              const newPlatforms = platformFilter.includes(platform)
                                                ? platformFilter.filter(p => p !== platform)
                                                : [...platformFilter, platform];
                                              setPlatformFilter(newPlatforms);
                                            }}
                                          >
                                            <Checkbox checked={platformFilter.includes(platform)} />
                                            <div className="flex items-center gap-1" title={platform}>
                                              {getPlatformIcon(platform)}
                                            </div>
                                          </div>
                                        ))}
                                        {platformFilter.length > 0 && (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="w-full mt-2 text-xs"
                                            onClick={() => setPlatformFilter([])}
                                          >
                                            Clear
                                          </Button>
                                        )}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                  {platformFilter.length > 0 && (
                                    <span className="ml-1 bg-[#3e8692] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                      {platformFilter.length}
                                    </span>
                                  )}
                                </div>
                              </TableHead>
                              <TableHead className="relative bg-gray-50 select-none">
                                <div className="flex items-center gap-1 cursor-pointer group">
                                  <span>Content Type</span>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                        <ChevronDown className="h-3 w-3" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[250px] p-0" align="start">
                                      <div className="p-3">
                                        <div className="text-xs font-semibold text-gray-600 mb-2">Filter Content Type</div>
                                        {['Meme','News','Trading','Deep Dive','Meme/Cultural Narrative','Drama Queen','Sceptics','Technical Educator','Bridge Builders','Visionaries'].map((type) => (
                                          <div
                                            key={type}
                                            className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-gray-100 cursor-pointer"
                                            onClick={() => {
                                              const newTypes = contentTypeFilter.includes(type)
                                                ? contentTypeFilter.filter(t => t !== type)
                                                : [...contentTypeFilter, type];
                                              setContentTypeFilter(newTypes);
                                            }}
                                          >
                                            <Checkbox checked={contentTypeFilter.includes(type)} />
                                            <span className="text-sm">{type}</span>
                                          </div>
                                        ))}
                                        {contentTypeFilter.length > 0 && (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="w-full mt-2 text-xs"
                                            onClick={() => setContentTypeFilter([])}
                                          >
                                            Clear
                                          </Button>
                                        )}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                  {contentTypeFilter.length > 0 && (
                                    <span className="ml-1 bg-[#3e8692] text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                      {contentTypeFilter.length}
                                    </span>
                                  )}
                                </div>
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredAvailableKOLs.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                                  No KOLs found.
                                </TableCell>
                              </TableRow>
                            ) : (
                              filteredAvailableKOLs.map((kol) => (
                                <TableRow key={kol.id}>
                                  <TableCell>
                                    <Checkbox
                                      checked={newList.selectedKOLs.includes(kol.id)}
                                      onCheckedChange={(checked) => {
                                        if (checked) {
                                          setNewList(prev => ({
                                            ...prev,
                                            selectedKOLs: [...prev.selectedKOLs, kol.id]
                                          }));
                                        } else {
                                          setNewList(prev => ({
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
                                              className="text-sm text-blue-600 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-[#3e8692] focus:ring-offset-1 rounded px-1 py-0.5 transition-all duration-200"
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
                                    <div className="flex items-center space-x-1">
                                      {[1, 2, 3, 4, 5].map(star => (
                                        <Star
                                          key={star}
                                          className={`h-3 w-3 ${
                                            star <= (kol.rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                                          }`}
                                        />
                                      ))}
                                    </div>
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
                    </div> {/* Close bg-gray-50 wrapper */}
                  </div> {/* Close grid gap-4 */}
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={handleCloseListModal}>
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={isSubmitting || !newList.name.trim()} 
                      className="hover:opacity-90" 
                      style={{ backgroundColor: '#3e8692', color: 'white' }}
                    >
                      {isSubmitting ? (isEditMode ? 'Saving...' : 'Creating...') : (isEditMode ? 'Save List' : 'Create List')}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Delete List Confirmation Dialog */}
        <Dialog open={isDeleteListDialogOpen} onOpenChange={setIsDeleteListDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Delete List</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-gray-600">
                Are you sure you want to delete this list? This action cannot be undone.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteListDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={confirmDeleteList}
              >
                Delete List
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete KOL Confirmation Dialog */}
        <Dialog open={isDeleteKOLDialogOpen} onOpenChange={setIsDeleteKOLDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Remove KOL from List</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-gray-600">
                Are you sure you want to remove <strong>{kolToDelete?.kolName}</strong> from this list?
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteKOLDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={confirmRemoveKOLFromList}
              >
                Remove KOL
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View List Dialog */}
        <Dialog open={isViewListDialogOpen} onOpenChange={setIsViewListDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>View List: {viewingList?.name}</DialogTitle>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto px-3 pb-6">
              {viewingList?.notes && (
                <div className="mb-6">
                  <h4 className="font-semibold text-sm text-gray-700 mb-2">Notes:</h4>
                  <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
                    {viewingList.notes}
                  </div>
                </div>
              )}
              {viewingList?.kols && viewingList.kols.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-sm text-gray-700">
                      KOLs in this list ({viewingList.kols.length})
                    </h4>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead>Name</TableHead>
                          <TableHead>Followers</TableHead>
                          <TableHead>Region</TableHead>
                          <TableHead>Platform</TableHead>
                          <TableHead>Content Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {viewingList.kols.map((kol) => (
                          <TableRow key={kol.id}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{kol.name}</div>
                                {kol.link && (
                                  <a 
                                    href={kol.link} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-sm text-blue-600 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-[#3e8692] focus:ring-offset-1 rounded px-1 py-0.5 transition-all duration-200"
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
                            <TableCell>
                              <Select 
                                value={kol.status || 'curated'} 
                                onValueChange={(value) => handleUpdateKOLStatus(kol.id, value)}
                              >
                                <SelectTrigger 
                                  className={`border-none shadow-none bg-transparent w-auto h-auto px-2 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none ${getStatusColor(kol.status || 'curated')}`}
                                  style={{ outline: 'none', boxShadow: 'none', minWidth: 90 }}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="curated">Curated</SelectItem>
                                  <SelectItem value="interested">Interested</SelectItem>
                                  <SelectItem value="onboarded">Onboarded</SelectItem>
                                  <SelectItem value="concluded">Concluded</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              {editingKolNotes?.kolId === kol.id ? (
                                <Input
                                  value={editingKolNotes.notes}
                                  onChange={(e) => setEditingKolNotes(prev => prev ? { ...prev, notes: e.target.value } : null)}
                                  onBlur={handleSaveKolNotes}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveKolNotes();
                                    if (e.key === 'Escape') handleCancelEditKolNotes();
                                  }}
                                  className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none"
                                  style={{ outline: 'none', boxShadow: 'none', userSelect: 'text' }}
                                  autoFocus
                                />
                              ) : (
                                <div 
                                  className="cursor-pointer w-full h-full flex items-center px-1 py-1"
                                  onClick={() => handleStartEditKolNotes(kol.id, kol.notes || '')}
                                  title="Click to edit notes"
                                >
                                  {kol.notes || '-'}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">No KOLs in this list.</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewListDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Share List Dialog */}
        <Dialog open={isShareListDialogOpen} onOpenChange={setIsShareListDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Share List: {sharingList?.name}</DialogTitle>
              <DialogDescription>
                Share this list with others by copying the link or generating a shareable code.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>List Details</Label>
                <div className="bg-gray-50 rounded-lg p-3 text-sm">
                  <div className="flex justify-between mb-2">
                    <span className="font-medium">Name:</span>
                    <span>{sharingList?.name}</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="font-medium">KOLs:</span>
                    <span>{sharingList?.kols?.length || 0}</span>
                  </div>
                  {sharingList?.notes && (
                    <div className="flex justify-between">
                      <span className="font-medium">Notes:</span>
                      <span className="text-gray-600 max-w-[200px] truncate" title={sharingList.notes}>
                        {sharingList.notes}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="share-link">Share Link</Label>
                <div className="flex gap-2">
                  <Input
                    id="share-link"
                    value={`${window.location.origin}/public/lists/${sharingList?.id}`}
                    readOnly
                    className="flex-1 auth-input"
                  />
                  <Button
                    variant="outline"
                    className="h-10"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/public/lists/${sharingList?.id}`);
                      toast({
                        title: "Link copied!",
                        description: "Share link has been copied to clipboard.",
                        duration: 3000,
                      });
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsShareListDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Combine Lists Dialog */}
        <Dialog open={isCombineListsDialogOpen} onOpenChange={setIsCombineListsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>Combine Lists</DialogTitle>
              <DialogDescription>
                Select multiple lists to combine into a new list. All unique KOLs will be merged.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCombineLists}>
              <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto px-3">
                <div className="grid gap-2">
                  <Label htmlFor="combined-list-name">New List Name</Label>
                  <Input
                    id="combined-list-name"
                    value={combinedListName}
                    onChange={(e) => setCombinedListName(e.target.value)}
                    placeholder="Enter name for combined list"
                    className="auth-input"
                    required
                  />
                </div>

                <div className="border-t pt-4"></div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">
                      Select Lists to Combine ({selectedListsToCombine.length} selected)
                    </Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (selectedListsToCombine.length === lists.length) {
                          setSelectedListsToCombine([]);
                        } else {
                          setSelectedListsToCombine(lists.map(l => l.id));
                        }
                      }}
                    >
                      {selectedListsToCombine.length === lists.length ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>

                  <div className="space-y-2 mt-2">
                    {lists.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        No lists available.
                      </div>
                    ) : (
                      lists.map((list) => {
                        const isSelected = selectedListsToCombine.includes(list.id);
                        const kolCount = list.kols?.length || 0;

                        const toggleSelection = () => {
                          if (isSelected) {
                            setSelectedListsToCombine(prev => prev.filter(id => id !== list.id));
                          } else {
                            setSelectedListsToCombine(prev => [...prev, list.id]);
                          }
                        };

                        return (
                          <div
                            key={list.id}
                            className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                              isSelected ? 'border-[#3e8692] bg-[#3e8692]/5' : 'border-gray-200 hover:border-gray-300'
                            }`}
                            onClick={toggleSelection}
                          >
                            <div className="flex items-start space-x-3">
                              <div onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={toggleSelection}
                                  className="mt-1"
                                />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="font-medium text-gray-900">{list.name}</div>
                                  <Badge variant="outline" className="text-xs">
                                    {kolCount} KOL{kolCount !== 1 ? 's' : ''}
                                  </Badge>
                                </div>
                                {list.notes && (
                                  <p className="text-sm text-gray-600 line-clamp-2">{list.notes}</p>
                                )}
                                <div className="text-xs text-gray-500 mt-1">
                                  Created: {formatDate(list.created_at)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {selectedListsToCombine.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                    <div className="font-medium text-blue-900 mb-1">Preview</div>
                    <div className="text-blue-800">
                      {(() => {
                        const selectedLists = lists.filter(list => selectedListsToCombine.includes(list.id));
                        const uniqueKolIds = new Set<string>();
                        selectedLists.forEach(list => {
                          list.kols?.forEach(kol => uniqueKolIds.add(kol.id));
                        });
                        return `Combining ${selectedLists.length} list${selectedLists.length !== 1 ? 's' : ''} will create a new list with ${uniqueKolIds.size} unique KOL${uniqueKolIds.size !== 1 ? 's' : ''}.`;
                      })()}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsCombineListsDialogOpen(false);
                    setSelectedListsToCombine([]);
                    setCombinedListName('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isCombining || !combinedListName.trim() || selectedListsToCombine.length === 0}
                  className="hover:opacity-90"
                  style={{ backgroundColor: '#3e8692', color: 'white' }}
                >
                  {isCombining ? 'Combining...' : 'Combine Lists'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <div className="flex items-center space-x-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input 
              placeholder="Search lists by name, notes, or KOLs..." 
              className="pl-10 auth-input" 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLists.length === 0 ? (
            <div className="col-span-full text-center py-8">
              <p className="text-gray-600">{searchTerm ? 'No lists found matching your search.' : 'No lists found.'}</p>
              {!searchTerm && (
                <Button 
                  className="mt-4 hover:opacity-90" 
                  style={{ backgroundColor: '#3e8692', color: 'white' }} 
                  onClick={() => { setIsEditMode(false); setIsNewListOpen(true); }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First List
                </Button>
              )}
            </div>
          ) : (
            filteredLists.map((list) => (
              <Card key={list.id} className="transition-shadow group">
                <CardHeader className="pb-4">
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-lg font-semibold text-gray-600 mb-2">
                      <div className="flex items-center">
                        <div className="bg-gray-100 p-1.5 rounded-lg mr-2">
                          <List className="h-5 w-5 text-gray-600" />
                        </div>
                        {list.name}
                      </div>
                      <div className="flex items-center space-x-1">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleEditList(list)} 
                          className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-gray-100 w-auto px-2" 
                          title="Edit list"
                        >
                          <Edit className="h-4 w-4 text-gray-600" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleDeleteList(list.id)} 
                          className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-gray-100 w-auto px-2" 
                          title="Delete list"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-2 items-center">
                      <Badge variant="outline" className="text-xs">
                        {list.kols?.length || 0} KOL{(list.kols?.length || 0) !== 1 ? 's' : ''}
                      </Badge>
                      {list.status && (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getListStatusColor(list.status)}`}>
                          {list.status.charAt(0).toUpperCase() + list.status.slice(1)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center text-sm text-gray-600">
                      <Calendar className="h-4 w-4 mr-2 text-gray-600" />
                      <span className="text-gray-600">{formatDate(list.created_at)}</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 border-t border-gray-100">
                  {list.notes && (
                    <div className="mb-4">
                      <h4 className="font-semibold text-sm text-gray-700 mb-2">Notes:</h4>
                      <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 min-h-[60px] max-h-[100px] overflow-y-auto">
                        {list.notes}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 mb-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      onClick={() => handleEditList(list)}
                    >
                      Edit List
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      onClick={() => handleViewList(list)}
                    >
                      View List
                    </Button>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => handleShareList(list)}
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    Share List
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
} 