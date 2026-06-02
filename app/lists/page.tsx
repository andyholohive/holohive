'use client';

import { useState, useEffect, Fragment, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { KpiCard } from '@/components/ui/kpi-card';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
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
import { Plus, Search, Edit, List, User, Trash2, Calendar, Users, X, Flag, Globe, Share2, ChevronDown, Star, Copy, ExternalLink, Eye, LayoutGrid, ChevronLeft, ChevronRight, Shield, Mail, Activity, Clock } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import ListAccessDialog from '@/components/lists/ListAccessDialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase';
import { KOLService } from '@/lib/kolService';
import { useToast } from '@/hooks/use-toast';
import { generateUniqueSlug } from '@/lib/slugUtils';

interface SavedSortOrder {
  field: string;
  direction: 'asc' | 'desc';
}

interface ListItem {
  id: string;
  name: string;
  slug?: string | null;
  notes: string | null;
  status?: string | null;
  approved_emails?: string[] | null;
  sort_order?: SavedSortOrder | null;
  created_at: string;
  updated_at: string;
  kols?: {
    id: string;
    name: string;
    platform: string[] | null;
    followers: number | null;
    region: string | null;
    link: string | null;
    creator_type: string[] | null;
    rating?: number | null;
    status?: string | null;
    notes?: string | null;
  }[];
}

// Utility functions (matching campaigns details page).
// Maps a KOL status to a centralized BadgeTone, then resolves to the
// bg+text className via toneClassName so the visual matches StatusBadge
// pills elsewhere. Source palette: status-badge.tsx.
const KOL_STATUS_TONES: Record<string, BadgeTone> = {
  curated: 'info',
  interested: 'warning',
  onboarded: 'success',
  concluded: 'neutral',
};
const getStatusColor = (status: string) => {
  const tone = KOL_STATUS_TONES[status] ?? 'neutral';
  // Inline the StatusBadge palette so this helper stays a pure
  // className string (used inside a SelectTrigger's className, where
  // a full StatusBadge component would be awkward).
  return tone === 'info'    ? 'bg-sky-100 text-sky-800'
       : tone === 'warning' ? 'bg-amber-100 text-amber-800'
       : tone === 'success' ? 'bg-emerald-100 text-emerald-800'
       :                      'bg-cream-100 text-ink-warm-700';
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
        <svg className="h-4 w-4 text-rose-500" viewBox="0 0 24 24" fill="currentColor">
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

const getCreatorTypeColor = (type: string) => {
  const colorMap: { [key: string]: string } = {
    'Native (Meme/Culture)': 'bg-purple-100 text-purple-800',
    'Drama-Forward': 'bg-rose-100 text-rose-800',
    'Skeptic': 'bg-orange-100 text-orange-800',
    'Educator': 'bg-blue-100 text-blue-800',
    'Bridge Builder': 'bg-emerald-100 text-emerald-800',
    'Visionary': 'bg-indigo-100 text-indigo-800',
    'Onboarder': 'bg-teal-100 text-teal-800',
    'General': 'bg-cream-100 text-ink-warm-700',
    'Gaming': 'bg-pink-100 text-pink-800',
    'Crypto': 'bg-yellow-100 text-yellow-800',
    'Memecoin': 'bg-orange-100 text-orange-800',
    'NFT': 'bg-purple-100 text-purple-800',
    'Trading': 'bg-emerald-100 text-emerald-800',
    'AI': 'bg-blue-100 text-blue-800',
    'Research': 'bg-indigo-100 text-indigo-800',
    'Airdrop': 'bg-teal-100 text-teal-800',
    'Art': 'bg-pink-100 text-pink-800'
  };
  return colorMap[type] || 'bg-cream-100 text-ink-warm-700';
};

// Title-case helper for status strings (curated → Curated, etc.).
// Same pattern as the KolProfileModal helper.
const titleCase = (s: string | null | undefined): string => {
  if (!s) return '';
  return s
    .split(/[\s_-]+/)
    .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
};

// Map list status to the centralized StatusBadge tone palette.
// Curated reads as "in-progress / informational" (info/sky), Approved
// as "done/healthy" (success), Denied as "blocked" (danger).
const getListStatusTone = (status: string | null | undefined): BadgeTone => {
  switch (status) {
    case 'curated': return 'info';
    case 'approved': return 'success';
    case 'denied': return 'danger';
    default: return 'neutral';
  }
};

export default function ListsPage() {
  const { user, userProfile } = useAuth();
  const [lists, setLists] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('curated');

  // [Access tab v1] Centralized view of WHO has access to each list and
  // WHO has visited each list. Powered by list_access_grants and
  // list_email_views. Activates when statusFilter === 'access'.
  type AccessGrant = {
    id: string;
    list_id: string;
    email: string;
    granted_at: string;
    granted_by: string | null;
    granted_by_name: string | null;
    expires_at: string | null;
    revoked_at: string | null;
    revoked_reason: string | null;
  };
  type ListVisit = {
    id: string;
    list_id: string;
    email: string;
    viewed_at: string;
    event_type: string | null;
    click_target: string | null;
  };
  const [accessGrants, setAccessGrants] = useState<AccessGrant[]>([]);
  const [listVisits, setListVisits] = useState<ListVisit[]>([]);
  const [loadingAccess, setLoadingAccess] = useState(false);
  // Which list rows are expanded in the per-list overview. Default
  // collapsed — the summary metrics are usually enough at a glance.
  const [expandedAccessLists, setExpandedAccessLists] = useState<Set<string>>(new Set());
  // [Access tab v1] Sort + filter state for the per-list overview.
  // Default sort: most-active lists first (grants + visits desc),
  // matching the existing accessOverviewByList ordering.
  type AccessSortKey = 'name' | 'status' | 'grants' | 'visits' | 'lastVisit' | 'activity';
  const [accessSort, setAccessSort] = useState<{ key: AccessSortKey; dir: 'asc' | 'desc' }>({ key: 'activity', dir: 'desc' });
  const [accessSearchTerm, setAccessSearchTerm] = useState('');
  // Multi-select status filter: empty array = "show all".
  const [accessStatusFilter, setAccessStatusFilter] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;
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
  const [creatorTypeFilter, setCreatorTypeFilter] = useState<string[]>([]);
  const [creatorTypeFilterSearch, setCreatorTypeFilterSearch] = useState('');
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

  // Email views dialog state
  const [isEmailViewsDialogOpen, setIsEmailViewsDialogOpen] = useState(false);
  // New "Access & Activity" dialog (supersedes the legacy Views dialog).
  // Tracks which list is open + the dialog visibility.
  const [accessDialogListId, setAccessDialogListId] = useState<string | null>(null);
  const [isAccessDialogOpen, setIsAccessDialogOpen] = useState(false);
  const [emailViewsList, setEmailViewsList] = useState<ListItem | null>(null);
  // viewed_at is `string | null` in the DB but practically always set
  // (the row only exists after a view event). Mark nullable so the
  // setter below doesn't need a cast; consumers should null-guard.
  const [emailViews, setEmailViews] = useState<Array<{
    id: string;
    email: string;
    viewed_at: string | null;
    user_agent: string | null;
  }>>([]);
  const [loadingEmailViews, setLoadingEmailViews] = useState(false);

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
    approved_emails: [] as string[],
  });

  // View list sort order state
  const [viewListSortOrder, setViewListSortOrder] = useState<SavedSortOrder | null>(null);

  // Email input state
  const [emailInput, setEmailInput] = useState('');

  // Filter KOLs based on search term + dropdown filters
  const filteredAvailableKOLs = allKOLs.filter((kol: any) => {
    const matchesSearch =
      kol.name?.toLowerCase().includes(kolSearchTerm.toLowerCase()) ||
      (kol.region && kol.region.toLowerCase().includes(kolSearchTerm.toLowerCase())) ||
      (Array.isArray(kol.platform) && kol.platform.some((p: string) => p.toLowerCase().includes(kolSearchTerm.toLowerCase())));

    const matchesPlatform =
      platformFilter.length === 0 || (Array.isArray(kol.platform) && platformFilter.some(p => kol.platform.includes(p)));

    const matchesRegion = regionFilter.length === 0 || (kol.region && regionFilter.includes(kol.region));

    const matchesCreatorType =
      creatorTypeFilter.length === 0 || (Array.isArray(kol.creator_type) && creatorTypeFilter.some(ct => kol.creator_type.includes(ct)));

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

    return matchesSearch && matchesPlatform && matchesRegion && matchesCreatorType && matchesFollowers && matchesRating;
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
      
      // First, get all non-archived lists
      const { data: listsData, error: listsError } = await supabase
        .from('lists')
        .select(`
          id,
          name,
          notes,
          status,
          approved_emails,
          sort_order,
          created_at,
          updated_at
        `)
        .is('archived_at', null)
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
                creator_type
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

      // Cast: DB nullable fields vs interface (see archive/page.tsx note).
      setLists(listsWithKOLs as ListItem[]);
    } catch (err) {
      setError('Failed to load lists');
      console.error('Error fetching lists:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchKOLs = async () => {
    try {
      // `rating` was dropped from master_kols in migration 071. Selecting
      // it here previously made the whole query throw with "column does
      // not exist" → allKOLs stayed empty → the New/Edit List dialog
      // showed "No KOLs found." Removed; the rating-based filter +
      // star-rating column further down in this file are already
      // soft-degraded (read kol.rating which is undefined post-migration,
      // so filter is a no-op and stars render empty).
      const { data, error } = await supabase
        .from('master_kols')
        .select('id, name, platform, followers, region, link, creator_type')
        .is('archived_at', null)
        .order('name');

      if (error) throw error;
      setAllKOLs(data || []);
    } catch (err) {
      console.error('Error fetching KOLs:', err);
    }
  };



  const filteredLists = lists.filter(list => {
    const matchesSearch = list.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      list.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      list.kols?.some(kol =>
        kol.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        kol.region?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    const matchesStatus = statusFilter === 'all' || list.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusCounts = {
    all: lists.filter(list =>
      list.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      list.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      list.kols?.some(kol =>
        kol.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        kol.region?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    ).length,
    curated: lists.filter(list =>
      list.status === 'curated' &&
      (list.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      list.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      list.kols?.some(kol =>
        kol.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        kol.region?.toLowerCase().includes(searchTerm.toLowerCase())
      ))
    ).length,
    approved: lists.filter(list =>
      list.status === 'approved' &&
      (list.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      list.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      list.kols?.some(kol =>
        kol.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        kol.region?.toLowerCase().includes(searchTerm.toLowerCase())
      ))
    ).length,
    denied: lists.filter(list =>
      list.status === 'denied' &&
      (list.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      list.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      list.kols?.some(kol =>
        kol.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        kol.region?.toLowerCase().includes(searchTerm.toLowerCase())
      ))
    ).length,
  };

  // Pagination
  const totalPages = Math.ceil(filteredLists.length / itemsPerPage);
  const paginatedLists = filteredLists.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  // [Access tab v1] Pull all grants + all visits in two parallel queries
  // on mount (not lazily on tab activation) so the tab's count badge is
  // populated from the start. Resolves granted_by user IDs to display
  // names so the table shows "Granted by Andy" not a UUID.
  // Data sizes are small (tens of rows) — cheap to always fetch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingAccess(true);
      try {
        // [Access tab v1] list_access_grants is not yet in the generated
        // database.types.ts — cast the client to `any` to bypass. Easy
        // fix later: regenerate types or add the table by hand.
        const supabaseUntyped = supabase as any;
        const [grantsRes, visitsRes] = await Promise.all([
          supabaseUntyped
            .from('list_access_grants')
            .select('id, list_id, email, granted_at, granted_by, expires_at, revoked_at, revoked_reason')
            .order('granted_at', { ascending: false }),
          supabase
            .from('list_email_views')
            .select('id, list_id, email, viewed_at, event_type, click_target')
            .order('viewed_at', { ascending: false }),
        ]);
        if (cancelled) return;

        // Resolve granted_by UUID → user name. One round-trip for all
        // distinct user IDs found in the grants.
        const grantorIds = Array.from(
          new Set(((grantsRes.data || []) as any[]).map(g => g.granted_by).filter(Boolean))
        );
        let nameMap = new Map<string, string>();
        if (grantorIds.length > 0) {
          const { data: usersData } = await supabase
            .from('users')
            .select('id, name')
            .in('id', grantorIds);
          for (const u of (usersData || []) as any[]) nameMap.set(u.id, u.name);
        }

        const grants: AccessGrant[] = ((grantsRes.data || []) as any[]).map(g => ({
          id: g.id,
          list_id: g.list_id,
          email: g.email,
          granted_at: g.granted_at,
          granted_by: g.granted_by,
          granted_by_name: g.granted_by ? nameMap.get(g.granted_by) || null : null,
          expires_at: g.expires_at,
          revoked_at: g.revoked_at,
          revoked_reason: g.revoked_reason,
        }));
        setAccessGrants(grants);
        setListVisits((visitsRes.data || []) as ListVisit[]);
      } catch (err) {
        console.error('[Access tab] fetch error:', err);
      } finally {
        if (!cancelled) setLoadingAccess(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // [Access tab v1] Count of currently-active grants — drives the tab's
  // badge. Computed cheaply from the already-loaded accessGrants array.
  const accessTabCount = useMemo(() => {
    const now = new Date().toISOString();
    return accessGrants.filter(g => !g.revoked_at && (!g.expires_at || g.expires_at > now)).length;
  }, [accessGrants]);

  // [Access tab v1] Pre-group access + visits data by list_id for the
  // overview render. Returns the buckets in lists-order; sort + filter
  // happens in `filteredSortedAccess` below so users can re-sort
  // without recomputing the grouping.
  type AccessBucket = {
    list: ListItem;
    activeGrants: AccessGrant[];
    revokedGrants: AccessGrant[];
    visits: ListVisit[];
    lastVisitAt: string | null;
  };
  const accessOverviewByList = useMemo<AccessBucket[]>(() => {
    const now = new Date().toISOString();
    const isActiveGrant = (g: AccessGrant) =>
      !g.revoked_at && (!g.expires_at || g.expires_at > now);

    const buckets = new Map<string, AccessBucket>();
    for (const l of lists) {
      buckets.set(l.id, { list: l, activeGrants: [], revokedGrants: [], visits: [], lastVisitAt: null });
    }
    for (const g of accessGrants) {
      const b = buckets.get(g.list_id);
      if (!b) continue;
      if (isActiveGrant(g)) b.activeGrants.push(g);
      else b.revokedGrants.push(g);
    }
    for (const v of listVisits) {
      const b = buckets.get(v.list_id);
      if (!b) continue;
      b.visits.push(v);
      if (!b.lastVisitAt || v.viewed_at > b.lastVisitAt) b.lastVisitAt = v.viewed_at;
    }
    return Array.from(buckets.values());
  }, [lists, accessGrants, listVisits]);

  // [Access tab v1] Apply search + status filter + column sort to the
  // overview. Recomputes only when its inputs change.
  // List status workflow order (matches the existing status tabs):
  // curated (in queue) → approved (live) → denied (rejected).
  const LIST_STATUS_ORDER = ['curated', 'approved', 'denied'] as const;
  const listStatusOrderIndex = (s: string | null | undefined): number => {
    if (!s) return LIST_STATUS_ORDER.length;
    const idx = LIST_STATUS_ORDER.indexOf(s as any);
    return idx === -1 ? LIST_STATUS_ORDER.length : idx;
  };
  const filteredSortedAccess = useMemo<AccessBucket[]>(() => {
    const q = accessSearchTerm.trim().toLowerCase();
    let rows = accessOverviewByList;
    if (q) {
      rows = rows.filter(b => (b.list.name || '').toLowerCase().includes(q));
    }
    if (accessStatusFilter.length > 0) {
      rows = rows.filter(b => accessStatusFilter.includes(b.list.status || 'curated'));
    }
    // Sort (decorate-sort-undecorate for stability on ties)
    const dir = accessSort.dir === 'asc' ? 1 : -1;
    const pull = (b: AccessBucket): any => {
      switch (accessSort.key) {
        case 'name':       return (b.list.name || '').toLowerCase();
        case 'status':     return listStatusOrderIndex(b.list.status);
        case 'grants':     return b.activeGrants.length;
        case 'visits':     return b.visits.length;
        case 'lastVisit':  return b.lastVisitAt ? new Date(b.lastVisitAt).getTime() : 0;
        case 'activity':
        default:           return b.activeGrants.length + b.visits.length;
      }
    };
    return [...rows]
      .map((b, i) => ({ b, i }))
      .sort((a, z) => {
        const av = pull(a.b);
        const zv = pull(z.b);
        const cmp = typeof av === 'number' && typeof zv === 'number'
          ? (av - zv) * dir
          : String(av).localeCompare(String(zv)) * dir;
        return cmp !== 0 ? cmp : a.i - z.i;
      })
      .map(x => x.b);
  }, [accessOverviewByList, accessSearchTerm, accessStatusFilter, accessSort]);

  const toggleAccessSort = (key: AccessSortKey) => {
    setAccessSort(prev => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: 'activity', dir: 'desc' }; // third click → reset to default
    });
  };
  const accessSortIcon = (key: AccessSortKey) => {
    if (accessSort.key !== key) return null;
    return <span className="ml-0.5 text-[10px] text-ink-warm-500">{accessSort.dir === 'asc' ? '▲' : '▼'}</span>;
  };

  const toggleAccessExpand = (id: string) => {
    setExpandedAccessLists(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleEditList = (list: ListItem) => {
    setEditingList(list);
    setNewList({
      name: list.name,
      notes: list.notes || '',
      selectedKOLs: list.kols?.map(kol => kol.id) || [],
      approved_emails: (list as any).approved_emails || [],
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
      approved_emails: [],
    });
    setEmailInput('');
  };

  const handleViewList = (list: ListItem) => {
    setViewingList(list);
    setViewListSortOrder(list.sort_order || null);
    setIsViewListDialogOpen(true);
  };

  const handleShareList = (list: ListItem) => {
    setSharingList(list);
    setIsShareListDialogOpen(true);
  };

  // Handle showing email views for a list
  const handleShowEmailViews = async (list: ListItem) => {
    setEmailViewsList(list);
    setIsEmailViewsDialogOpen(true);
    setLoadingEmailViews(true);

    try {
      const { data, error } = await supabase
        .from('list_email_views')
        .select('id, email, viewed_at, user_agent')
        .eq('list_id', list.id)
        .order('viewed_at', { ascending: false });

      if (error) throw error;
      setEmailViews(data || []);
    } catch (err) {
      console.error('Error fetching email views:', err);
      toast({
        title: 'Error',
        description: 'Failed to load email views',
        variant: 'destructive',
      });
    } finally {
      setLoadingEmailViews(false);
    }
  };

  // Handle sorting in View List dialog
  const handleViewListSort = (field: string) => {
    setViewListSortOrder(prev => {
      if (prev?.field === field) {
        // Toggle direction if same field
        return { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      // Default to ascending for new field
      return { field, direction: 'asc' };
    });
  };

  // Save sort order to database
  const handleSaveSortOrder = async () => {
    if (!viewingList?.id || !viewListSortOrder) return;

    try {
      const { error } = await supabase
        .from('lists')
        .update({ sort_order: viewListSortOrder })
        .eq('id', viewingList.id);

      if (error) throw error;

      // Update local state
      setLists(prev => prev.map(list =>
        list.id === viewingList.id ? { ...list, sort_order: viewListSortOrder } : list
      ));
      setViewingList(prev => prev ? { ...prev, sort_order: viewListSortOrder } : null);

      toast({
        title: "Sort order saved",
        description: "The sort order will be applied when viewers access the public list.",
      });
    } catch (error) {
      console.error('Error saving sort order:', error);
      toast({
        title: "Error",
        description: "Failed to save sort order.",
        variant: "destructive",
      });
    }
  };

  // Get sorted KOLs for viewing
  const getSortedKols = (kols: ListItem['kols'], sortOrder: SavedSortOrder | null) => {
    if (!kols || !sortOrder) return kols;

    return [...kols].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortOrder.field) {
        case 'name':
          aVal = a.name?.toLowerCase() || '';
          bVal = b.name?.toLowerCase() || '';
          break;
        case 'followers':
          aVal = a.followers || 0;
          bVal = b.followers || 0;
          break;
        case 'region':
          aVal = a.region?.toLowerCase() || '';
          bVal = b.region?.toLowerCase() || '';
          break;
        case 'platform':
          aVal = a.platform?.join(',').toLowerCase() || '';
          bVal = b.platform?.join(',').toLowerCase() || '';
          break;
        case 'creator_type':
          aVal = a.creator_type?.join(',').toLowerCase() || '';
          bVal = b.creator_type?.join(',').toLowerCase() || '';
          break;
        case 'status':
          aVal = a.status?.toLowerCase() || '';
          bVal = b.status?.toLowerCase() || '';
          break;
        case 'rating':
          aVal = a.rating || 0;
          bVal = b.rating || 0;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortOrder.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder.direction === 'asc' ? 1 : -1;
      return 0;
    });
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
            approved_emails: newList.approved_emails.length > 0 ? newList.approved_emails : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingList.id);

        if (updateError) throw updateError;
        listId = editingList.id;

        // Diff KOL associations instead of delete-all + re-insert.
        // The old approach nuked every per-KOL `notes` and reset every
        // `status` back to 'curated' on save — meaning any annotations
        // the team had added (or a "shortlisted" / "rejected" status
        // they'd set) silently disappeared. Now we only delete the
        // KOLs being REMOVED and only insert the KOLs being ADDED;
        // existing KOLs in the list are left alone, preserving their
        // notes + status untouched.
        const previousKolIds = new Set((editingList.kols || []).map(k => k.id));
        const nextKolIds = new Set(newList.selectedKOLs);
        const toRemove = Array.from(previousKolIds).filter(id => !nextKolIds.has(id));
        const toAdd = Array.from(nextKolIds).filter(id => !previousKolIds.has(id));

        if (toRemove.length > 0) {
          const { error: removeError } = await supabase
            .from('list_kols')
            .delete()
            .eq('list_id', editingList.id)
            .in('master_kol_id', toRemove);
          if (removeError) throw removeError;
        }
        if (toAdd.length > 0) {
          const { error: addError } = await supabase
            .from('list_kols')
            .insert(toAdd.map(kolId => ({
              list_id: editingList.id,
              master_kol_id: kolId,
              status: 'curated',
            })));
          if (addError) throw addError;
        }
      } else {
        // Create new list with auto-generated slug
        const { data: newListData, error: insertError } = await supabase
          .from('lists')
          .insert({
            name: newList.name.trim(),
            slug: generateUniqueSlug(newList.name.trim()),
            notes: newList.notes.trim() || null,
            approved_emails: newList.approved_emails.length > 0 ? newList.approved_emails : null,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        listId = newListData.id;

        // New-list path keeps the original bulk-insert. No prior rows
        // exist so there's nothing to preserve; every KOL starts at
        // status='curated' with no notes.
        if (newList.selectedKOLs.length > 0) {
          const kolAssociations = newList.selectedKOLs.map(kolId => ({
            list_id: listId,
            master_kol_id: kolId,
            status: 'curated',
          }));

          const { error: kolsError } = await supabase
            .from('list_kols')
            .insert(kolAssociations);

          if (kolsError) throw kolsError;
        }
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
      // Soft delete - set archived_at timestamp
      const { error } = await supabase
        .from('lists')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', listToDelete);

      if (error) throw error;
      await fetchLists();

      toast({
        title: "List Archived",
        description: "The list has been archived. You can restore it from the Archive page.",
      });
    } catch (err) {
      console.error('Error archiving list:', err);
      toast({
        title: "Error",
        description: "Failed to archive list. Please try again.",
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

      // Create new list with auto-generated slug
      const { data: newListData, error: insertError } = await supabase
        .from('lists')
        .insert({
          name: combinedListName.trim(),
          slug: generateUniqueSlug(combinedListName.trim()),
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

  // ListCardSkeleton extracted to module scope below the page component
  // (audit 2026-05-06): was defined inline here, re-allocated every
  // render. Pure JSX with no closure deps so a clean extract.

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="space-y-6">
          <PageHeader
            title="Lists"
            subtitle="Manage your KOL lists and notes"
            kicker="Talent · Lists"
            kickerDot="amber"
            actions={(
              <>
                <Button variant="brand" disabled>
                  <List className="h-4 w-4 mr-2" />
                  Combine Lists
                </Button>
                <Button variant="brand" disabled>
                  <Plus className="h-4 w-4 mr-2" />
                  Add List
                </Button>
              </>
            )}
          />
          {/* ── Lists skeleton ───────────────────────────────────────
              Mirrors the loaded layout — SectionHeader skeleton +
              filter toolbar (tabs left, search middle, view toggle
              right) + card grid. Nothing shifts when data lands. */}
          <div className="space-y-4">
            <div className="section-head first flex items-center gap-3">
              <span className="dot bg-brand/30" aria-hidden />
              <Skeleton className="h-3 w-16" />
              <span className="flex-1 h-px bg-cream-200" aria-hidden />
              <Skeleton className="h-3 w-32" />
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-1 p-1 rounded-md bg-cream-100 border border-cream-200">
                <Skeleton className="h-8 w-14 rounded" />
                <Skeleton className="h-8 w-32 rounded" />
              </div>
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-warm-400" />
                <Input placeholder="Search lists by name, notes, or KOLs..." className="pl-10 focus-brand" disabled />
              </div>
              <div className="ml-auto flex gap-1 p-1 rounded-md bg-cream-100 border border-cream-200">
                <Skeleton className="h-8 w-10 rounded" />
                <Skeleton className="h-8 w-10 rounded" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <ListCardSkeleton key={index} />
              ))}
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (error) {
    return (
      <ProtectedRoute>
        <div className="space-y-6">
          <PageHeader title="Lists" subtitle="Manage your KOL lists and notes" kicker="Talent · Lists" kickerDot="amber" />
          <div className="text-center py-8">
            <p className="text-rose-600">{error}</p>
            <Button variant="brand" onClick={fetchLists} className="mt-4">
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
        <PageHeader
          title="Lists"
          subtitle="Manage your KOL lists and notes"
          kicker="Talent · Lists"
          kickerDot="amber"
          actions={(
            <>
              <Button variant="brand" onClick={() => setIsCombineListsDialogOpen(true)}
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
                <Button variant="brand">
                  <Plus className="h-4 w-4 mr-2" />
                  Add List
                </Button>
              </DialogTrigger>
                              <DialogContent className="max-w-6xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>{isEditMode ? 'Edit List' : 'Add New List'}</DialogTitle>
                  <DialogDescription>
                    {isEditMode ? 'Update the list information below.' : 'Create a new list to organize your KOLs.'}
                  </DialogDescription>
                </DialogHeader>
                {/* Form needs flex-col flex-1 min-h-0 so the flex chain
                    from DialogContent (flex-col) reaches the inner body
                    div's flex-1. Without it the form isn't a flex
                    container, the inner flex-1 becomes a no-op, and
                    the body grows to fit ALL content — pushing the
                    Select KOLs table past the dialog boundary instead
                    of scrolling inside. Same fix as Add Client. */}
                <form onSubmit={handleCreateList} className="flex flex-col flex-1 min-h-0">
                  {/* Two-column body on lg+ — form fields on the left,
                      Select KOLs on the right. The right column gets
                      ~2x the width of the left (1:2 ratio via
                      `lg:grid-cols-[minmax(300px,1fr)_2fr]`) because
                      the KOL table has 6+ columns and benefits from
                      every extra pixel. Left column has a 300px floor
                      so the form inputs stay usable. Columns stack on
                      smaller screens. */}
                  <div className="grid gap-6 py-4 flex-1 overflow-y-auto px-1 lg:grid-cols-[minmax(300px,1fr)_2fr]">
                    {/* ── Left column: List metadata ───────────────── */}
                    <div className="space-y-4 min-w-0">
                      <div className="grid gap-2">
                        <Label htmlFor="name">List Name</Label>
                        <Input
                          id="name"
                          value={newList.name}
                          onChange={(e) => setNewList({ ...newList, name: e.target.value })}
                          placeholder="Enter list name"
                          className="focus-brand"
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
                          className="focus-brand min-h-[100px]"
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="approved-emails">Approved Emails (Optional)</Label>
                        <p className="text-sm text-ink-warm-700 mb-2">
                          Add email addresses that can access this list via public link. Separate multiple emails with commas or new lines. Leave empty for public access.
                        </p>
                        <div className="flex flex-col gap-2">
                          <Textarea
                            id="approved-emails"
                            value={emailInput}
                            onChange={(e) => setEmailInput(e.target.value)}
                            placeholder="Enter email addresses (comma or newline separated)&#10;e.g. email1@example.com, email2@example.com&#10;or one per line"
                            className="focus-brand min-h-[80px]"
                            rows={3}
                          />
                          <Button
                            type="button"
                            onClick={() => {
                              // Parse input for multiple emails (comma or newline separated)
                              const emails = emailInput
                                .split(/[\n,]+/)
                                .map(email => email.trim().toLowerCase())
                                .filter(email => email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
                              const newEmails = emails.filter(email => !newList.approved_emails.includes(email));
                              if (newEmails.length > 0) {
                                setNewList({ ...newList, approved_emails: [...newList.approved_emails, ...newEmails] });
                                setEmailInput('');
                              }
                            }}
                            disabled={!emailInput.trim()}
                            variant="brand"
                            className="w-fit"
                          >
                            Add Emails
                          </Button>
                        </div>
                        {newList.approved_emails.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {newList.approved_emails.map((email, index) => (
                              <div
                                key={index}
                                className="inline-flex items-center gap-1 px-3 py-1 bg-cream-100 text-ink-warm-700 rounded-full text-sm"
                              >
                                <span>{email}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setNewList({
                                      ...newList,
                                      approved_emails: newList.approved_emails.filter((_, i) => i !== index)
                                    });
                                  }}
                                  className="ml-1 text-ink-warm-500 hover:text-ink-warm-700"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── Right column: Select KOLs tile ────────────
                        min-w-0 + overflow-hidden so the wide KOL
                        table inside can't push the tile past the
                        column width. The table itself scrolls
                        horizontally inside its own overflow wrapper. */}
                    <div className="grid gap-2 bg-cream-50 p-4 rounded-[14px] border border-cream-200 min-w-0 overflow-hidden h-fit lg:sticky lg:top-0">
                      <Label className="text-base font-semibold">Select KOLs ({newList.selectedKOLs.length} selected)</Label>
                      {/* Search bar */}
                      <div className="mb-3">
                        <Input
                          placeholder="Search KOLs by name, region, or platform..."
                          className="focus-brand"
                          value={kolSearchTerm}
                          onChange={e => setKolSearchTerm(e.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mb-2 self-start"
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
                      {/* Single scroll container handles BOTH axes —
                          vertical scrolling (max-h-[50vh]) and
                          horizontal scrolling (table wider than the
                          container). Using a raw <table> instead of
                          shadcn's <Table> primitive because <Table>
                          wraps the table in its own `overflow-auto`
                          div, which means the horizontal scrollbar
                          ends up at the bottom of the table content
                          (way below the viewport when scrolled).
                          By putting <table> directly in this wrapper,
                          the horizontal scrollbar sits at the bottom
                          of the visible 50vh viewport regardless of
                          vertical scroll position. min-w-[900px]
                          forces the table wide enough that 7 columns
                          stay legible, triggering the horizontal
                          scrollbar in typical column widths. */}
                      <div className="border border-cream-200 rounded-[14px] overflow-auto max-h-[50vh] mt-2">
                        <table className="w-full min-w-[900px] caption-bottom text-sm">
                          <TableHeader>
                            <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                              <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 w-12">Select</TableHead>
                              <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Name</TableHead>
                              <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 select-none">
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
                                        <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Followers</div>
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
                                            className="h-8 text-xs focus-brand"
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
                                    <span className="ml-1 bg-brand-light text-brand text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                      1
                                    </span>
                                  )}
                                </div>
                              </TableHead>
                              <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 select-none">
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
                                        <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Rating</div>
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
                                            className="h-8 text-xs focus-brand"
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
                                    <span className="ml-1 bg-brand-light text-brand text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                      1
                                    </span>
                                  )}
                                </div>
                              </TableHead>
                              <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 select-none">
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
                                        <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Region</div>
                                        {['Vietnam','Turkey','SEA','Philippines','Korea','Global','China','Brazil'].map((region) => (
                                          <div
                                            key={region}
                                            className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
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
                                    <span className="ml-1 bg-brand-light text-brand text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                      {regionFilter.length}
                                    </span>
                                  )}
                                </div>
                              </TableHead>
                              <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 select-none">
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
                                        <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Platform</div>
                                        {['X','Telegram','YouTube','Facebook','TikTok'].map((platform) => (
                                          <div
                                            key={platform}
                                            className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
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
                                    <span className="ml-1 bg-brand-light text-brand text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                      {platformFilter.length}
                                    </span>
                                  )}
                                </div>
                              </TableHead>
                              <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 select-none">
                                <div className="flex items-center gap-1 cursor-pointer group">
                                  <span>Creator Type</span>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                        <ChevronDown className="h-3 w-3" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[250px] p-0" align="start">
                                      <div className="p-3">
                                        <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Creator Type</div>
                                        {['Native (Meme/Culture)','Drama-Forward','Skeptic','Educator','Bridge Builder','Visionary','Onboarder','General','Gaming','Crypto','Memecoin','NFT','Trading','AI','Research','Airdrop','Art'].map((type) => (
                                          <div
                                            key={type}
                                            className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
                                            onClick={() => {
                                              const newTypes = creatorTypeFilter.includes(type)
                                                ? creatorTypeFilter.filter(t => t !== type)
                                                : [...creatorTypeFilter, type];
                                              setCreatorTypeFilter(newTypes);
                                            }}
                                          >
                                            <Checkbox checked={creatorTypeFilter.includes(type)} />
                                            <span className="text-sm">{type}</span>
                                          </div>
                                        ))}
                                        {creatorTypeFilter.length > 0 && (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="w-full mt-2 text-xs"
                                            onClick={() => setCreatorTypeFilter([])}
                                          >
                                            Clear
                                          </Button>
                                        )}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                  {creatorTypeFilter.length > 0 && (
                                    <span className="ml-1 bg-brand-light text-brand text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                      {creatorTypeFilter.length}
                                    </span>
                                  )}
                                </div>
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredAvailableKOLs.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={7} className="text-center py-8 text-ink-warm-500">
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
                                              className="text-sm text-brand hover:text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1 rounded px-1 py-0.5 transition-all duration-200"
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
                                            star <= (kol.rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-ink-warm-300'
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

                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </table>
                      </div>
                    </div> {/* Close bg-cream-50 wrapper */}
                  </div> {/* Close grid gap-4 */}
                  <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
                    <Button type="button" variant="outline" onClick={handleCloseListModal}>
                      Cancel
                    </Button>
                    <Button variant="brand" type="submit" disabled={isSubmitting || !newList.name.trim()}>
                      {isSubmitting ? (isEditMode ? 'Saving...' : 'Creating...') : (isEditMode ? 'Save List' : 'Create List')}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            </>
          )}
        />

        {/* Archive List Confirmation Dialog */}
        <Dialog open={isDeleteListDialogOpen} onOpenChange={setIsDeleteListDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Archive List</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-ink-warm-700">
                Are you sure you want to archive this list? You can restore it later from the Archive page.
              </p>
            </div>
            <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
              <Button variant="outline" onClick={() => setIsDeleteListDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDeleteList}
              >
                Archive List
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
              <p className="text-ink-warm-700">
                Are you sure you want to remove <strong>{kolToDelete?.kolName}</strong> from this list?
              </p>
            </div>
            <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
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
          <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>View List: {viewingList?.name}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-1">
              {viewingList?.notes && (
                <div className="mb-6">
                  <h4 className="font-semibold text-sm text-ink-warm-700 mb-2">Notes:</h4>
                  <div className="bg-cream-50 rounded-lg p-3 text-sm text-ink-warm-700">
                    {viewingList.notes}
                  </div>
                </div>
              )}
              {viewingList?.kols && viewingList.kols.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-sm text-ink-warm-700">
                      KOLs in this list ({viewingList.kols.length})
                    </h4>
                    <div className="flex items-center gap-2">
                      {viewListSortOrder && (
                        <span className="text-xs text-ink-warm-500">
                          Sorted by: {viewListSortOrder.field} ({viewListSortOrder.direction})
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSaveSortOrder}
                        disabled={!viewListSortOrder}
                        className="text-xs"
                      >
                        Save Sort Order
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-ink-warm-500 mb-2">Click on column headers to sort. Save the sort order to apply it to the public list view.</p>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                          <TableHead
                            className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 cursor-pointer hover:bg-cream-100 select-none"
                            onClick={() => handleViewListSort('name')}
                          >
                            <div className="flex items-center gap-1">
                              Name
                              {viewListSortOrder?.field === 'name' && (
                                <span>{viewListSortOrder.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead
                            className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 cursor-pointer hover:bg-cream-100 select-none"
                            onClick={() => handleViewListSort('followers')}
                          >
                            <div className="flex items-center gap-1">
                              Followers
                              {viewListSortOrder?.field === 'followers' && (
                                <span>{viewListSortOrder.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead
                            className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 cursor-pointer hover:bg-cream-100 select-none"
                            onClick={() => handleViewListSort('region')}
                          >
                            <div className="flex items-center gap-1">
                              Region
                              {viewListSortOrder?.field === 'region' && (
                                <span>{viewListSortOrder.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead
                            className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 cursor-pointer hover:bg-cream-100 select-none"
                            onClick={() => handleViewListSort('platform')}
                          >
                            <div className="flex items-center gap-1">
                              Platform
                              {viewListSortOrder?.field === 'platform' && (
                                <span>{viewListSortOrder.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead
                            className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 cursor-pointer hover:bg-cream-100 select-none"
                            onClick={() => handleViewListSort('creator_type')}
                          >
                            <div className="flex items-center gap-1">
                              Creator Type
                              {viewListSortOrder?.field === 'creator_type' && (
                                <span>{viewListSortOrder.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead
                            className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 cursor-pointer hover:bg-cream-100 select-none"
                            onClick={() => handleViewListSort('status')}
                          >
                            <div className="flex items-center gap-1">
                              Status
                              {viewListSortOrder?.field === 'status' && (
                                <span>{viewListSortOrder.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getSortedKols(viewingList.kols, viewListSortOrder)?.map((kol) => (
                          <TableRow key={kol.id}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{kol.name}</div>
                                {kol.link && (
                                  <a 
                                    href={kol.link} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-sm text-brand hover:text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1 rounded px-1 py-0.5 transition-all duration-200"
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
                  <p className="text-ink-warm-500">No KOLs in this list.</p>
                </div>
              )}
            </div>
            <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
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
                <div className="bg-cream-50 rounded-lg p-3 text-sm">
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
                      <span className="text-ink-warm-700 max-w-[200px] truncate" title={sharingList.notes}>
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
                    value={`${window.location.origin}/public/lists/${sharingList?.slug || sharingList?.id}`}
                    readOnly
                    className="flex-1 focus-brand"
                  />
                  <Button
                    variant="outline"
                    className="h-10"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/public/lists/${sharingList?.slug || sharingList?.id}`);
                      toast({
                        title: "Link copied!",
                        description: "Share link has been copied to clipboard.",
                        duration: 3000,
                      });
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10"
                    onClick={() => {
                      if (sharingList?.id) {
                        window.open(`${window.location.origin}/public/lists/${sharingList.slug || sharingList.id}`, '_blank');
                      }
                    }}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
              <Button variant="outline" onClick={() => setIsShareListDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* New Access & Activity dialog (managed grants + view/click feed) */}
        <ListAccessDialog
          listId={accessDialogListId}
          open={isAccessDialogOpen}
          onOpenChange={(open) => {
            setIsAccessDialogOpen(open);
            if (!open) setAccessDialogListId(null);
          }}
        />

        {/* Email Views Dialog (LEGACY — kept temporarily; superseded by ListAccessDialog above) */}
        <Dialog open={isEmailViewsDialogOpen} onOpenChange={setIsEmailViewsDialogOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Email Views: {emailViewsList?.name}
              </DialogTitle>
              <DialogDescription>
                Emails that have accessed this list via the public link.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {loadingEmailViews ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand"></div>
                </div>
              ) : emailViews.length === 0 ? (
                <div className="text-center py-8 text-ink-warm-500">
                  <Eye className="h-12 w-12 mx-auto mb-4 text-ink-warm-300" />
                  <p>No email views recorded yet.</p>
                  <p className="text-sm mt-2">Views will appear here when users access the list via the public link.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  <div className="text-sm text-ink-warm-500 mb-3">
                    {emailViews.length} view{emailViews.length !== 1 ? 's' : ''} recorded
                  </div>
                  {emailViews.map((view) => (
                    <div
                      key={view.id}
                      className="flex items-center justify-between p-3 bg-cream-50 rounded-lg hover:bg-cream-100 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-ink-warm-900 truncate">{view.email}</p>
                        <p className="text-xs text-ink-warm-500">
                          {new Date(view.viewed_at).toLocaleString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
              <Button variant="outline" onClick={() => setIsEmailViewsDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Combine Lists Dialog */}
        <Dialog open={isCombineListsDialogOpen} onOpenChange={setIsCombineListsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Combine Lists</DialogTitle>
              <DialogDescription>
                Select multiple lists to combine into a new list. All unique KOLs will be merged.
              </DialogDescription>
            </DialogHeader>
            {/* Same flex-col flex-1 min-h-0 fix as Add/Edit List —
                without it the form breaks the flex chain and the
                inner Select Lists list pushes the dialog past the
                viewport instead of scrolling inside. */}
            <form onSubmit={handleCombineLists} className="flex flex-col flex-1 min-h-0">
              <div className="grid gap-4 py-4 flex-1 overflow-y-auto px-1">
                <div className="grid gap-2">
                  <Label htmlFor="combined-list-name">New List Name</Label>
                  <Input
                    id="combined-list-name"
                    value={combinedListName}
                    onChange={(e) => setCombinedListName(e.target.value)}
                    placeholder="Enter name for combined list"
                    className="focus-brand"
                    required
                  />
                </div>

                <div className="border-t pt-4"></div>

                {/* Select Lists tile — min-w-0 prevents the list-row
                    Cards from pushing the tile past the dialog body
                    width when a list name is very long. The inner
                    list scrolls vertically inside a max-h so a
                    50-list account doesn't make the whole dialog
                    body taller than the viewport. */}
                <div className="grid gap-2 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
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

                  <div className="space-y-2 mt-2 max-h-[40vh] overflow-y-auto overflow-x-hidden px-0.5 -mx-0.5">
                    {lists.length === 0 ? (
                      <div className="text-center py-8 text-ink-warm-500">
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
                          // v11 Card row — selected state uses brand-soft
                          // tint to match the page's "selection mode is on"
                          // pattern from /kols bulk-action bar.
                          <Card
                            key={list.id}
                            className={`p-4 cursor-pointer transition-colors ${
                              isSelected ? 'border-brand-light bg-brand-soft' : 'hover:bg-cream-50'
                            }`}
                            onClick={toggleSelection}
                          >
                            <div className="flex items-start gap-3">
                              <div onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={toggleSelection}
                                  className="mt-1"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1 gap-2">
                                  <div className="font-medium text-ink-warm-900 truncate">{list.name}</div>
                                  <StatusBadge tone="neutral" size="sm" bordered>
                                    {kolCount} KOL{kolCount !== 1 ? 's' : ''}
                                  </StatusBadge>
                                </div>
                                {list.notes && (
                                  <p className="text-sm text-ink-warm-700 line-clamp-2">{list.notes}</p>
                                )}
                                <div className="text-xs text-ink-warm-500 mt-1 tabular-nums">
                                  Created: {formatDate(list.created_at)}
                                </div>
                              </div>
                            </div>
                          </Card>
                        );
                      })
                    )}
                  </div>
                </div>

                {selectedListsToCombine.length > 0 && (
                  // Brand-soft preview tile — was bg-blue-50/text-blue-800
                  // (outside the v11 palette). Same chrome as the "Save
                  // as template" form in /clients milestones modal.
                  <div className="rounded-[14px] border border-brand-light bg-brand-soft p-3 text-sm">
                    <div className="text-[11px] mono uppercase tracking-[0.14em] text-brand-deep mb-1">Preview</div>
                    <div className="text-ink-warm-700">
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
              <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
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
                <Button variant="brand" type="submit" disabled={isCombining || !combinedListName.trim() || selectedListsToCombine.length === 0}>
                  {isCombining ? 'Combining...' : 'Combine Lists'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── Lists ──────────────────────────────────────────────────
            Single SectionHeader carries the chapter rhythm; toolbar
            below has tabs (left, primary filter) + search (middle,
            refine-within) + view-mode toggle (right). Matches the
            /clients & /kols toolbar pattern. */}
        <div className="space-y-4">
          <SectionHeader
            label="Lists"
            dot="amber"
            counter={`${filteredLists.length} of ${statusCounts.all} list${statusCounts.all === 1 ? '' : 's'}${statusFilter === 'access' ? ' · access view' : ''}`}
            first
          />

          <div className="flex items-center gap-3 flex-wrap">
            {/* Per-status tabs (Curated / Approved / Denied) hidden
                per 2026-06-02 product decision — status was redundant
                with the badge on each card and didn't drive enough
                filtering use to justify the toolbar real estate.
                Functionality preserved (statusFilter still toggles
                between 'all' and 'access'); state untouched for
                easy restore. */}
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200">
                <TabsTrigger
                  value="all"
                  className="data-[state=active]:bg-white data-[state=active]:text-ink-warm-900 data-[state=active]:shadow-card px-4 py-2"
                >
                  All
                  <span className="ml-2 text-xs bg-cream-200 text-ink-warm-700 px-2 py-0.5 rounded-full pointer-events-none">{statusCounts.all}</span>
                </TabsTrigger>
                {/* [Access tab v1] Switches the page from the list grid
                    to a per-list access + visits overview. Brand-tinted
                    counter so it reads distinctly from the All tab. */}
                <TabsTrigger
                  value="access"
                  className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card px-4 py-2"
                >
                  Access &amp; Visits
                  <span className="ml-2 text-xs bg-brand-light text-brand px-2 py-0.5 rounded-full pointer-events-none">{accessTabCount}</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-warm-400" />
              <Input
                placeholder="Search lists by name, notes, or KOLs..."
                className="pl-10 focus-brand"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* View-mode toggle — hidden on the Access & Visits tab
                because that view is always a table (the card layout
                doesn't make sense for grant/visit data). Pushed to
                the right with ml-auto on the All tab; each segment
                matches the v11 tab chrome so the toggle visually
                belongs to the same toolbar family. */}
            {statusFilter !== 'access' && (
              <div className="ml-auto flex bg-cream-100 p-1 rounded-md border border-cream-200">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-8 px-3 ${viewMode === 'card' ? 'bg-white shadow-card text-brand' : 'text-ink-warm-500 hover:bg-cream-200 hover:text-ink-warm-700'}`}
                  onClick={() => setViewMode('card')}
                  title="Card view"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-8 px-3 ${viewMode === 'table' ? 'bg-white shadow-card text-brand' : 'text-ink-warm-500 hover:bg-cream-200 hover:text-ink-warm-700'}`}
                  onClick={() => setViewMode('table')}
                  title="Table view"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        {/* [Access tab v1] Centralized access + visits overview. Renders
            in place of the list grid when the user clicks the
            "Access & Visits" tab. Each list shows summary metrics; click
            the chevron to drill into the full grant + visit list. */}
        {statusFilter === 'access' ? (
          <div className="space-y-6">
            {/* Top-level summary stats */}
            {(() => {
              const totalActiveGrants = accessOverviewByList.reduce((s, b) => s + b.activeGrants.length, 0);
              const totalVisits = accessOverviewByList.reduce((s, b) => s + b.visits.length, 0);
              const listsWithActivity = accessOverviewByList.filter(b => b.activeGrants.length > 0 || b.visits.length > 0).length;
              const distinctViewers = new Set(listVisits.map(v => v.email.toLowerCase())).size;
              // Use the shared <KpiCard> primitive (same one /dashboard,
              // /analytics, /crm/network, /crm/contacts, /expenses, and
              // /wallets use) so this tab's hero stats read with the
              // same rhythm as every other KPI strip in the app.
              // Accent palette: brand for the primary "access is on"
              // metric, sky for informational visit count, emerald for
              // "positive activity", purple for segmentation.
              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KpiCard icon={Shield}   label="Active Grants"      value={totalActiveGrants} accent="brand"   />
                  <KpiCard icon={Eye}      label="Total Visits"       value={totalVisits}       accent="sky"     />
                  <KpiCard icon={Activity} label="Lists w/ Activity"  value={listsWithActivity} accent="emerald" />
                  <KpiCard icon={Users}    label="Distinct Viewers"   value={distinctViewers}   accent="purple"  />
                </div>
              );
            })()}

            {/* Search + count toolbar — Status filter popover hidden
                per 2026-06-02 product decision (pairs with the main
                per-status tab + card badge removal). accessStatusFilter
                state preserved for easy restore. */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-warm-400" />
                <Input
                  placeholder="Search lists…"
                  className="pl-10 focus-brand"
                  value={accessSearchTerm}
                  onChange={(e) => setAccessSearchTerm(e.target.value)}
                />
              </div>
              <span className="text-xs text-ink-warm-500 sm:ml-auto tabular-nums">
                {filteredSortedAccess.length} of {accessOverviewByList.length} list{accessOverviewByList.length === 1 ? '' : 's'}
              </span>
            </div>

            {/* Per-list overview table */}
            <Card className="border-cream-200 overflow-hidden">
              {loadingAccess ? (
                // Structural skeleton — same shape as the loaded table
                // (header row + 5 body rows w/ chevron + name + 3
                // numeric columns + date). Replaces the spinner +
                // "Loading…" text so nothing shifts on load.
                <Table>
                  <TableHeader>
                    <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                      <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 w-[40px]"></TableHead>
                      <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">List</TableHead>
                      <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Active Grants</TableHead>
                      <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Visits</TableHead>
                      <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Last Visit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i} className="border-cream-100">
                        <TableCell className="py-3.5 px-5"><Skeleton className="h-4 w-4 rounded-sm" /></TableCell>
                        <TableCell className="py-3.5 px-5"><Skeleton className="h-4 w-40" /></TableCell>
                        <TableCell className="py-3.5 px-5 text-right"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                        <TableCell className="py-3.5 px-5 text-right"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                        <TableCell className="py-3.5 px-5"><Skeleton className="h-3 w-20" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : filteredSortedAccess.length === 0 ? (
                <div className="p-8">
                  <EmptyState
                    icon={Shield}
                    title={accessSearchTerm ? 'No lists match' : 'No lists yet'}
                    description={accessSearchTerm
                      ? 'Try widening your search.'
                      : 'Once lists exist with grants or visits, they\'ll appear here.'}
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    {/* Status column hidden — pairs with the main lists
                        view's per-status tab + card badge removal. */}
                    <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                      <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 w-[40px]"></TableHead>
                      <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 cursor-pointer select-none hover:text-ink-warm-900" onClick={() => toggleAccessSort('name')}>
                        List{accessSortIcon('name')}
                      </TableHead>
                      <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right cursor-pointer select-none hover:text-ink-warm-900" onClick={() => toggleAccessSort('grants')}>
                        Active Grants{accessSortIcon('grants')}
                      </TableHead>
                      <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right cursor-pointer select-none hover:text-ink-warm-900" onClick={() => toggleAccessSort('visits')}>
                        Visits{accessSortIcon('visits')}
                      </TableHead>
                      <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 cursor-pointer select-none hover:text-ink-warm-900" onClick={() => toggleAccessSort('lastVisit')}>
                        Last Visit{accessSortIcon('lastVisit')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSortedAccess.map(bucket => {
                      const isExpanded = expandedAccessLists.has(bucket.list.id);
                      const hasDetail = bucket.activeGrants.length > 0 || bucket.revokedGrants.length > 0 || bucket.visits.length > 0;
                      return (
                        <Fragment key={bucket.list.id}>
                          <TableRow
                            className={`${hasDetail ? 'cursor-pointer hover:bg-cream-50/50' : ''} transition-colors`}
                            onClick={() => hasDetail && toggleAccessExpand(bucket.list.id)}
                          >
                            <TableCell className="py-3">
                              {hasDetail ? (
                                isExpanded
                                  ? <ChevronDown className="h-4 w-4 text-ink-warm-400" />
                                  : <ChevronRight className="h-4 w-4 text-ink-warm-400" />
                              ) : <span className="inline-block w-4" />}
                            </TableCell>
                            <TableCell className="py-3.5 px-5 font-medium text-ink-warm-900">{bucket.list.name}</TableCell>
                            <TableCell className="py-3.5 px-5 text-right font-semibold text-ink-warm-900 tabular-nums">
                              {bucket.activeGrants.length}
                            </TableCell>
                            <TableCell className="py-3.5 px-5 text-right font-semibold text-ink-warm-900 tabular-nums">
                              {bucket.visits.length}
                            </TableCell>
                            <TableCell className="py-3.5 px-5 text-sm text-ink-warm-500 tabular-nums">
                              {bucket.lastVisitAt
                                ? new Date(bucket.lastVisitAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                : '—'}
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow className="bg-cream-50/30">
                              <TableCell colSpan={5} className="py-4 px-6">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                  {/* Active Grants column */}
                                  <div>
                                    <p className="text-xs font-semibold text-ink-warm-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                      <Shield className="h-3 w-3" /> Who has access ({bucket.activeGrants.length})
                                    </p>
                                    {bucket.activeGrants.length === 0 ? (
                                      <p className="text-xs text-ink-warm-400 italic py-2">No active grants.</p>
                                    ) : (
                                      <div className="space-y-1.5">
                                        {bucket.activeGrants.map(g => (
                                          <div key={g.id} className="flex items-center gap-2 text-xs bg-white rounded p-2 border border-cream-100">
                                            <Mail className="h-3 w-3 text-ink-warm-400 flex-shrink-0" />
                                            <span className="font-medium text-ink-warm-900 truncate flex-1">{g.email}</span>
                                            <span className="text-ink-warm-400 text-[10px] flex-shrink-0">
                                              {g.granted_by_name ? `by ${g.granted_by_name} · ` : ''}
                                              {new Date(g.granted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                              {g.expires_at && ` · exp ${new Date(g.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {bucket.revokedGrants.length > 0 && (
                                      <p className="text-[10px] text-ink-warm-400 mt-2">
                                        + {bucket.revokedGrants.length} revoked / expired
                                      </p>
                                    )}
                                  </div>
                                  {/* Visits column */}
                                  <div>
                                    <p className="text-xs font-semibold text-ink-warm-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                      <Eye className="h-3 w-3" /> Recent visits ({bucket.visits.length})
                                    </p>
                                    {bucket.visits.length === 0 ? (
                                      <p className="text-xs text-ink-warm-400 italic py-2">No visits yet.</p>
                                    ) : (
                                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                                        {bucket.visits.slice(0, 20).map(v => (
                                          <div key={v.id} className="flex items-center gap-2 text-xs bg-white rounded p-2 border border-cream-100">
                                            <Clock className="h-3 w-3 text-ink-warm-400 flex-shrink-0" />
                                            <span className="text-ink-warm-900 truncate flex-1">{v.email}</span>
                                            <span className="text-ink-warm-400 text-[10px] flex-shrink-0">
                                              {new Date(v.viewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                            </span>
                                          </div>
                                        ))}
                                        {bucket.visits.length > 20 && (
                                          <p className="text-[10px] text-ink-warm-400 text-center pt-1">+ {bucket.visits.length - 20} older visits</p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Card>
          </div>
        ) : filteredLists.length === 0 ? (
          <EmptyState
            icon={List}
            title={searchTerm || statusFilter !== 'all'
              ? 'No lists match your criteria.'
              : 'No lists yet.'}
          >
            {!searchTerm && statusFilter === 'all' && (
              <Button variant="brand" onClick={() => { setIsEditMode(false); setIsNewListOpen(true); }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Your First List
              </Button>
            )}
          </EmptyState>
        ) : viewMode === 'card' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedLists.map((list) => (
              // v11 list card — same shape as the /clients card:
              // logo tile + name (left) + hover-action cluster (right)
              // in CardHeader; status badge row; CardContent has the
              // body + action button rows pinned via mt-auto.
              <Card key={list.id} className="crd-hover group flex flex-col h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {/* Brand-soft tile + List icon — matches the
                          /clients logo tile fallback chrome. */}
                      <div className="w-10 h-10 rounded-md bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center flex-shrink-0">
                        <List className="h-5 w-5" />
                      </div>
                      <span className="text-base font-semibold text-ink-warm-900 tracking-tight truncate min-w-0">{list.name}</span>
                    </div>
                    {/* Hover-action cluster — opacity-60 at rest,
                        sharpens on card hover. Square 28px tiles. */}
                    <div className="flex items-center gap-0.5 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity duration-200">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleEditList(list); }}
                        className="h-7 w-7 p-0 rounded-md text-ink-warm-500 hover:text-ink-warm-900 hover:bg-cream-100"
                        title="Edit list"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleDeleteList(list.id); }}
                        className="h-7 w-7 p-0 rounded-md text-ink-warm-500 hover:text-rose-600 hover:bg-rose-50"
                        title="Delete list"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {/* Status badge row — KOL count only. Status pill
                      (Curated/Approved/Denied) hidden per 2026-06-02
                      product decision; matches the per-status tab
                      removal above. */}
                  <div className="flex gap-2 flex-wrap">
                    <StatusBadge tone="neutral" size="sm" bordered>
                      {list.kols?.length || 0} KOL{(list.kols?.length || 0) !== 1 ? 's' : ''}
                    </StatusBadge>
                  </div>
                  {/* Created date row — only render if present */}
                  <div className="mt-2 flex items-center text-sm text-ink-warm-500">
                    <Calendar className="h-4 w-4 mr-2 text-ink-warm-400" />
                    <span className="tabular-nums">{formatDate(list.created_at)}</span>
                  </div>
                </CardHeader>
                <CardContent className="pt-3 border-t border-cream-100 flex flex-col flex-1">
                  {list.notes && (
                    <div className="mb-3">
                      <div className="text-[11px] mono uppercase tracking-[0.14em] text-ink-warm-500 mb-1.5">Notes</div>
                      <div className="bg-cream-50 border border-cream-200 rounded-md p-2.5 text-sm text-ink-warm-700 min-h-[48px] max-h-[100px] overflow-y-auto">
                        {list.notes}
                      </div>
                    </div>
                  )}
                  <div className="mt-auto">
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
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleShareList(list)}
                      >
                        <Share2 className="h-4 w-4 mr-2" />
                        Share
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          setAccessDialogListId(list.id);
                          setIsAccessDialogOpen(true);
                        }}
                        title="Manage who has access + see view/click activity"
                      >
                        <Shield className="h-4 w-4 mr-2" />
                        Access
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          /* Table View */
          <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                {/* Status column hidden per 2026-06-02 product decision
                    — pairs with the per-status tab + card badge removal. */}
                <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                  <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">List Name</TableHead>
                  <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">KOLs</TableHead>
                  <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Created</TableHead>
                  <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Notes</TableHead>
                  <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedLists.map((list) => (
                  <TableRow
                    key={list.id}
                    className="cursor-pointer hover:bg-cream-50"
                    onClick={() => handleViewList(list)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="bg-cream-100 p-1.5 rounded-lg">
                          <List className="h-4 w-4 text-ink-warm-700" />
                        </div>
                        <span className="font-medium text-ink-warm-900">{list.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {list.kols?.length || 0} KOL{(list.kols?.length || 0) !== 1 ? 's' : ''}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-ink-warm-700 text-sm">
                      {formatDate(list.created_at)}
                    </TableCell>
                    <TableCell className="text-ink-warm-700 text-sm max-w-[200px] truncate">
                      {list.notes || '-'}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleViewList(list)}
                          title="View list"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleShareList(list)}
                          title="Share list"
                        >
                          <Share2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleEditList(list)}
                          title="Edit list"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          onClick={() => handleDeleteList(list.id)}
                          title="Delete list"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {filteredLists.length > itemsPerPage && (
          <div className="flex items-center justify-between pt-4">
            <p className="text-sm text-ink-warm-700">
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredLists.length)} of {filteredLists.length} lists
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm text-ink-warm-700">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

// Module-scope skeleton — see comment in main component for context.
// Pure JSX with no props/closure; one stable function reference for the
// whole app lifetime so React's reconciler treats every instance as the
// same component type (no remount on parent re-render).
// Structural skeleton mirroring the new v11 list card 1:1 so the
// layout doesn't shift when data lands. Same logo tile + name +
// hover-action cluster + status badge row + created-date row +
// 2-row action grid as the loaded card.
function ListCardSkeleton() {
  return (
    <Card className="crd-hover h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <Skeleton className="h-10 w-10 rounded-md flex-shrink-0" />
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0 opacity-60">
            <Skeleton className="h-7 w-7 rounded-md" />
            <Skeleton className="h-7 w-7 rounded-md" />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="mt-2 flex items-center">
          <Skeleton className="h-4 w-4 mr-2 rounded-sm" />
          <Skeleton className="h-4 w-28" />
        </div>
      </CardHeader>
      <CardContent className="pt-3 border-t border-cream-100 flex flex-col flex-1">
        <div className="mt-auto space-y-2">
          <div className="flex gap-2">
            <Skeleton className="h-8 flex-1 rounded-md" />
            <Skeleton className="h-8 flex-1 rounded-md" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 flex-1 rounded-md" />
            <Skeleton className="h-8 flex-1 rounded-md" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 