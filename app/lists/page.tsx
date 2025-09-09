'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, Edit, List, User, Trash2, Calendar, Users, X, Flag, Globe, Share2 } from 'lucide-react';
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

  // New list form state
  const [newList, setNewList] = useState({
    name: '',
    notes: '',
    selectedKOLs: [] as string[],
  });

  // Filter KOLs based on search term
  const filteredAvailableKOLs = allKOLs.filter((kol: any) =>
    kol.name.toLowerCase().includes(kolSearchTerm.toLowerCase()) ||
    (kol.region && kol.region.toLowerCase().includes(kolSearchTerm.toLowerCase())) ||
    (Array.isArray(kol.platform) && kol.platform.some((p: string) => p.toLowerCase().includes(kolSearchTerm.toLowerCase())))
  );

  const { toast } = useToast();

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
        .select('id, name, platform, followers, region, link, content_type')
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
                              <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
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


                    <div className="grid gap-2">
                      <Label>Select KOLs ({newList.selectedKOLs.length} selected)</Label>
                      <div className="flex items-center max-w-sm w-full mb-2">
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
                          if (allIds.every(id => newList.selectedKOLs.includes(id))) {
                            // Deselect all
                            setNewList(prev => ({ ...prev, selectedKOLs: prev.selectedKOLs.filter(id => !allIds.includes(id)) }));
                          } else {
                            // Select all
                            setNewList(prev => ({ ...prev, selectedKOLs: Array.from(new Set([...prev.selectedKOLs, ...allIds])) }));
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