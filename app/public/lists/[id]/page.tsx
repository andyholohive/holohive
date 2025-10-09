'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { List, Calendar, Users } from 'lucide-react';
import Image from 'next/image';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';

// Create a standalone Supabase client for public access
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabasePublic = createClient(supabaseUrl, supabaseAnonKey);

interface SharedListItem {
  id: string;
  name: string;
  notes: string | null;
  status: string;
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

// Utility functions
const formatFollowers = (followers: number | null): string => {
  if (!followers) return '0';
  if (followers >= 1000000) {
    return `${(followers / 1000000).toFixed(1)}M`;
  }
  if (followers >= 1000) {
    return `${(followers / 1000).toFixed(1)}K`;
  }
  return followers.toString();
};

const getListStatusColor = (status: string) => {
  switch (status) {
    case 'curated': return 'bg-blue-100 text-blue-800';
    case 'approved': return 'bg-green-100 text-green-800';
    case 'denied': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'curated': return 'bg-blue-100 text-blue-800';
    case 'interested': return 'bg-yellow-100 text-yellow-800';
    case 'onboarded': return 'bg-green-100 text-green-800';
    case 'concluded': return 'bg-gray-100 text-gray-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const capitalizeStatus = (status: string) => {
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const getRegionIcon = (region: string) => {
  const regionMap: { [key: string]: { flag: string; icon: any } } = {
    'Vietnam': { flag: '🇻🇳', icon: null },
    'Turkey': { flag: '🇹🇷', icon: null },
    'SEA': { flag: '🌏', icon: null },
    'Philippines': { flag: '🇵🇭', icon: null },
    'Korea': { flag: '🇰🇷', icon: null },
    'Global': { flag: '🌍', icon: null },
    'China': { flag: '🇨🇳', icon: null },
    'Brazil': { flag: '🇧🇷', icon: null }
  };
  return regionMap[region] || { flag: '🏳️', icon: null };
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

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const statusOptions = [
  { value: 'curated', label: 'Curated' },
  { value: 'interested', label: 'Interested' },
  { value: 'onboarded', label: 'Onboarded' },
  { value: 'concluded', label: 'Concluded' }
];

export default function SharedListPage({ params }: { params: { id: string } }) {
  const listId = params.id;
  const [list, setList] = useState<SharedListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingKolNotes, setEditingKolNotes] = useState<{kolId: string, notes: string} | null>(null);

  useEffect(() => {
    console.log('Component mounted, listId:', listId);
    fetchSharedList();
  }, [listId]);

  async function fetchSharedList() {
    try {
      console.log('Fetching shared list for ID:', listId);
      setLoading(true);
      setError(null);

      // Get the list details
      const { data: listData, error: listError } = await supabasePublic
        .from('lists')
        .select('*')
        .eq('id', listId)
        .single();

      if (listError) {
        console.error('List error:', listError);
        setError('Failed to load list');
        return;
      }

      console.log('List data found:', listData);

      // Get KOLs for this list
      const { data: kolsData, error: kolsError } = await supabasePublic
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
        .eq('list_id', listId);

      if (kolsError) {
        console.error('KOLs error:', kolsError);
        setError('Failed to load KOLs');
        return;
      }

      console.log('KOLs data found:', kolsData);

      const listWithKOLs = {
        ...listData,
        kols: kolsData?.map(item => ({
          ...item.master_kol,
          status: item.status,
          notes: item.notes || null
        })).filter(Boolean) || []
      };

      console.log('Final list with KOLs:', listWithKOLs);
      setList(listWithKOLs);
    } catch (err) {
      console.error('Error fetching shared list:', err);
      setError('Failed to load list');
    } finally {
      setLoading(false);
    }
  }

  const handleUpdateKOLStatus = async (kolId: string, status: string) => {
    try {
      if (!list?.id) return;

      console.log('Updating KOL status:', { kolId, status, listId: list.id });

      // Update local state first for immediate feedback
      setList(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          kols: prev.kols?.map(kol =>
            kol.id === kolId ? { ...kol, status } : kol
          )
        };
      });

      // Update the status in the database
      const { error } = await supabasePublic
        .from('list_kols')
        .update({ status })
        .eq('master_kol_id', kolId)
        .eq('list_id', list.id);

      if (error) {
        console.error('Error updating KOL status:', error);
        // Revert local state on error
        fetchSharedList();
      } else {
        console.log('KOL status updated successfully');
      }
    } catch (err) {
      console.error('Error updating KOL status:', err);
      fetchSharedList();
    }
  };

  const handleStartEditKolNotes = (kolId: string, currentNotes: string) => {
    setEditingKolNotes({ kolId, notes: currentNotes || '' });
  };

  const handleSaveKolNotes = async () => {
    if (!editingKolNotes || !list) return;

    const notesToSave = editingKolNotes.notes.trim() || null;

    try {
      console.log('Saving KOL notes:', { kolId: editingKolNotes.kolId, notes: notesToSave, listId: list.id });

      // Update local state first for immediate feedback
      setList(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          kols: prev.kols?.map(kol =>
            kol.id === editingKolNotes.kolId
              ? { ...kol, notes: notesToSave }
              : kol
          )
        };
      });

      setEditingKolNotes(null);

      // Update the notes in the database
      const { error } = await supabasePublic
        .from('list_kols')
        .update({ notes: notesToSave })
        .eq('list_id', list.id)
        .eq('master_kol_id', editingKolNotes.kolId);

      if (error) {
        console.error('Error updating KOL notes:', error);
        fetchSharedList();
      } else {
        console.log('KOL notes updated successfully');
      }
    } catch (err) {
      console.error('Error updating KOL notes:', err);
      fetchSharedList();
    }
  };

  const handleCancelEditKolNotes = () => {
    setEditingKolNotes(null);
  };

  const handleUpdateListStatus = async (newStatus: string) => {
    try {
      if (!list?.id) return;

      console.log('Updating list status:', { listId: list.id, newStatus });

      // Update local state first for immediate feedback
      setList(prev => {
        if (!prev) return prev;
        return { ...prev, status: newStatus };
      });

      // Update the status in the database
      const { error } = await supabasePublic
        .from('lists')
        .update({ status: newStatus })
        .eq('id', list.id);

      if (error) {
        console.error('Error updating list status:', error);
        // Revert local state on error
        fetchSharedList();
      } else {
        console.log('List status updated successfully');
      }
    } catch (err) {
      console.error('Error updating list status:', err);
      fetchSharedList();
    }
  };

  console.log('Render state:', { loading, error, list: !!list, listId });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading list...</p>
          <p className="text-gray-400 text-sm mt-2">List ID: {listId}</p>
        </div>
      </div>
    );
  }

  if (error || !list) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header with Logo */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Image
                  src="/images/logo.png"
                  alt="KOL Campaign Manager Logo"
                  width={40}
                  height={40}
                  className="rounded-lg"
                />
                <div>
                  <h1 className="text-xl font-bold text-gray-900">KOL Campaign Manager</h1>
                  <p className="text-sm text-gray-600">Shared List</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
            <List className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">List Not Found</h2>
            <p className="text-gray-600">The list you're looking for doesn't exist or has been removed.</p>
            <p className="text-gray-400 text-sm mt-2">List ID: {listId}</p>
            <p className="text-gray-400 text-sm mt-1">Error: {error}</p>
            <p className="text-gray-400 text-sm mt-1">Please check the URL and try again.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with Logo */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Image
                src="/images/logo.png"
                alt="KOL Campaign Manager Logo"
                width={40}
                height={40}
                className="rounded-lg"
              />
              <div>
                <h1 className="text-xl font-bold text-gray-900">KOL Campaign Manager</h1>
                <p className="text-sm text-gray-600">Shared List</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* List Title */}
        <div className="flex items-center space-x-4 mb-6">
          <div className="bg-gray-100 p-2 rounded-lg">
            <List className="h-6 w-6 text-gray-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{list.name}</h2>
            <p className="text-gray-600">Shared List</p>
          </div>
          <div className="ml-auto">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getListStatusColor(list.status)}`}>
              {list.status.charAt(0).toUpperCase() + list.status.slice(1)}
            </span>
          </div>
        </div>

        {/* List Details */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-600">
                {list.kols?.length || 0} KOL{(list.kols?.length || 0) !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-600">
                Created {formatDate(list.created_at)}
              </span>
            </div>
            {list.notes && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-sm text-gray-700 mb-2">Notes:</h3>
                <p className="text-sm text-gray-700">{list.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* KOLs Table - Exactly matching view list popup */}
        {list.kols && list.kols.length > 0 ? (
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h4 className="font-semibold text-sm text-gray-700">
                KOLs in this list ({list.kols.length})
              </h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">#</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Followers</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Region</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Platform</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Content Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {list.kols.map((kol, index) => (
                    <tr key={`${kol.id}-${index}`} className="hover:bg-gray-50 group">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{index + 1}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="font-medium text-gray-900">{kol.name}</div>
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
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatFollowers(kol.followers)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {kol.region ? (
                          <div className="flex items-center space-x-1">
                            <span>{getRegionIcon(kol.region).flag}</span>
                            <span>{kol.region}</span>
                          </div>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {Array.isArray(kol.platform) ? (
                          <div className="flex gap-1">
                            {kol.platform.map((platform: string, idx: number) => (
                              <div key={idx} className="flex items-center justify-center h-5 w-5" title={platform}>
                                {getPlatformIcon(platform)}
                              </div>
                            ))}
                          </div>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {Array.isArray(kol.content_type) ? (
                          <div className="flex flex-wrap gap-1">
                            {kol.content_type.map((type: string, idx: number) => (
                              <span key={idx} className={`px-2 py-1 rounded-md text-xs font-medium ${getContentTypeColor(type)}`}>
                                {type}
                              </span>
                            ))}
                          </div>
                        ) : '-'}
                      </td>
                                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
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
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
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
                        </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
            <List className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No KOLs in this list.</p>
          </div>
        )}

        {/* Approve/Deny Buttons */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mt-6">
          <div className="flex justify-center space-x-4">
            <Button
              onClick={() => handleUpdateListStatus('approved')}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2"
              disabled={list.status === 'approved'}
            >
              Approve
            </Button>
            <Button
              onClick={() => handleUpdateListStatus('denied')}
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-2"
              disabled={list.status === 'denied'}
            >
              Deny
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
