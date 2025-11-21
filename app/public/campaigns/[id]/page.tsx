'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { createClient } from '@supabase/supabase-js';
import { List, Megaphone, Building2, DollarSign, Calendar as CalendarIcon, Users, BarChart3, Table as TableIcon, CreditCard, CheckCircle, Globe, Flag, FileText, Search, ChevronDown } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabasePublic = createClient(supabaseUrl, supabaseAnonKey);

type Campaign = {
  id: string;
  name: string;
  status: string;
  total_budget: number;
  start_date: string;
  end_date: string;
  description: string | null;
  region: string | null;
  created_at: string;
  client_id: string;
  client_name?: string | null;
  budget_allocations?: { id: string; region: string; allocated_budget: number }[];
  share_creator_type?: boolean | null;
};

type CampaignKOL = {
  id: string;
  hh_status: string | null;
  client_status: string | null;
  allocated_budget: number | null;
  budget_type: string | null;
  master_kol: {
    id: string;
    name: string;
    link: string | null;
    followers: number | null;
    platform: string[] | null;
    region: string | null;
    content_type: string[] | null;
    creator_type: string[] | null;
  };
};

type ContentItem = {
  id: string;
  campaign_kols_id: string;
  platform: string | null;
  type: string | null;
  status: string | null;
  activation_date: string | null;
  content_link: string | null;
  impressions: number | null;
  likes: number | null;
  retweets: number | null;
  comments: number | null;
  bookmarks: number | null;
};

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

const formatCurrency = (amount: number | null | undefined) => {
  if (!amount) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

const formatFollowers = (followers: number | null): string => {
  if (!followers) return '0';
  if (followers >= 1000000) return `${(followers / 1000000).toFixed(1)}M`;
  if (followers >= 1000) return `${(followers / 1000).toFixed(1)}K`;
  return followers.toString();
};

const getRegionIcon = (region: string) => {
  const regionMap: { [key: string]: { flag: string } } = {
    Vietnam: { flag: '🇻🇳' },
    Turkey: { flag: '🇹🇷' },
    SEA: { flag: '🌏' },
    Philippines: { flag: '🇵🇭' },
    Korea: { flag: '🇰🇷' },
    Global: { flag: '🌍' },
    China: { flag: '🇨🇳' },
    Brazil: { flag: '🇧🇷' },
  };
  return regionMap[region] || { flag: '🏳️' };
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
  };
  return colorMap[creatorType] || 'bg-gray-100 text-gray-800';
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
    Post: 'bg-blue-100 text-blue-800',
    Video: 'bg-red-100 text-red-800',
    Article: 'bg-green-100 text-green-800',
    AMA: 'bg-purple-100 text-purple-800',
    Ambassadorship: 'bg-orange-100 text-orange-800',
    Alpha: 'bg-yellow-100 text-yellow-800',
    QRT: 'bg-cyan-100 text-cyan-800',
    Thread: 'bg-teal-100 text-teal-800',
    Spaces: 'bg-pink-100 text-pink-800',
    Newsletter: 'bg-slate-100 text-slate-800',
  };
  return colorMap[type] || 'bg-gray-100 text-gray-800';
};

const getStatusColor = (status: string) => {
  const s = (status || '').toLowerCase();
  switch (s) {
    case 'curated':
      return 'bg-blue-100 text-blue-800';
    case 'interested':
      return 'bg-yellow-100 text-yellow-800';
    case 'onboarded':
      return 'bg-green-100 text-green-800';
    case 'concluded':
      return 'bg-gray-100 text-gray-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'Active':
      return 'bg-green-100 text-green-800';
    case 'Planning':
      return 'bg-blue-100 text-blue-800';
    case 'Paused':
      return 'bg-yellow-100 text-yellow-800';
    case 'Completed':
      return 'bg-gray-100 text-gray-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export default function PublicCampaignPage({ params }: { params: { id: string } }) {
  const campaignId = params.id;
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [kols, setKols] = useState<CampaignKOL[]>([]);
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kolViewMode, setKolViewMode] = useState<'overview' | 'table' | 'cards'>('overview');
  const [contentViewMode, setContentViewMode] = useState<'table' | 'overview'>('overview');
  const [email, setEmail] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [clientEmail, setClientEmail] = useState<string | null>(null);
  const [loadingClientEmail, setLoadingClientEmail] = useState(true);

  // KOL Table filters and search
  const [searchTerm, setSearchTerm] = useState('');
  const [kolFilters, setKolFilters] = useState({
    platform: [] as string[],
    region: [] as string[],
    hh_status: [] as string[],
    budget_type: [] as string[],
    followers_operator: '',
    followers_value: '',
    budget_operator: '',
    budget_value: '',
    paid_operator: '',
    paid_value: ''
  });

  // Content Table filters and search
  const [contentsSearchTerm, setContentsSearchTerm] = useState('');
  const [contentFilters, setContentFilters] = useState({
    platform: [] as string[],
    type: [] as string[],
    status: [] as string[]
  });

  // Filter and search KOLs
  const filteredKOLs = kols.filter(kol => {
    // Search filter
    const matchesSearch = searchTerm === '' ||
      kol.master_kol.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (kol.master_kol.region && kol.master_kol.region.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (kol.hh_status && kol.hh_status.toLowerCase().includes(searchTerm.toLowerCase()));

    // Platform filter
    const matchesPlatform = kolFilters.platform.length === 0 ||
      (kol.master_kol.platform && kol.master_kol.platform.some(p => kolFilters.platform.includes(p)));

    // Region filter
    const matchesRegion = kolFilters.region.length === 0 ||
      (kol.master_kol.region && kolFilters.region.includes(kol.master_kol.region));

    // Status filter
    const matchesStatus = kolFilters.hh_status.length === 0 ||
      (kol.hh_status && kolFilters.hh_status.includes(kol.hh_status));

    // Budget Type filter
    const matchesBudgetType = kolFilters.budget_type.length === 0 ||
      (kol.budget_type && kolFilters.budget_type.includes(kol.budget_type));

    // Followers filter
    let matchesFollowers = true;
    if (kolFilters.followers_operator && kolFilters.followers_value) {
      const followers = kol.master_kol.followers || 0;
      const value = parseFloat(kolFilters.followers_value);
      if (kolFilters.followers_operator === '>') matchesFollowers = followers > value;
      else if (kolFilters.followers_operator === '<') matchesFollowers = followers < value;
      else if (kolFilters.followers_operator === '=') matchesFollowers = followers === value;
    }

    // Budget filter
    let matchesBudget = true;
    if (kolFilters.budget_operator && kolFilters.budget_value) {
      const budget = kol.allocated_budget || 0;
      const value = parseFloat(kolFilters.budget_value);
      if (kolFilters.budget_operator === '>') matchesBudget = budget > value;
      else if (kolFilters.budget_operator === '<') matchesBudget = budget < value;
      else if (kolFilters.budget_operator === '=') matchesBudget = budget === value;
    }

    return matchesSearch && matchesPlatform && matchesRegion && matchesStatus &&
           matchesBudgetType && matchesFollowers && matchesBudget;
  });

  // Filter and search Contents
  const filteredContents = contents.filter(content => {
    // Get KOL name for search
    const kol = kols.find(k => k.id === content.campaign_kols_id);
    const kolName = kol?.master_kol?.name || '';

    // Search filter
    const matchesSearch = contentsSearchTerm === '' ||
      kolName.toLowerCase().includes(contentsSearchTerm.toLowerCase()) ||
      (content.platform && content.platform.toLowerCase().includes(contentsSearchTerm.toLowerCase())) ||
      (content.status && content.status.toLowerCase().includes(contentsSearchTerm.toLowerCase()));

    // Platform filter
    const matchesPlatform = contentFilters.platform.length === 0 ||
      (content.platform && contentFilters.platform.includes(content.platform));

    // Type filter
    const matchesType = contentFilters.type.length === 0 ||
      (content.type && contentFilters.type.includes(content.type));

    // Status filter
    const matchesStatus = contentFilters.status.length === 0 ||
      (content.status && contentFilters.status.includes(content.status));

    return matchesSearch && matchesPlatform && matchesType && matchesStatus;
  });

  // Cache key for this specific campaign
  const cacheKey = `campaign_auth_${campaignId}`;
  const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  useEffect(() => {
    fetchClientEmail();
  }, [campaignId]);

  useEffect(() => {
    if (clientEmail) {
      checkCachedAuth();
    }
  }, [clientEmail]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [campaignId, isAuthenticated]);

  // Check if user is already authenticated via cache
  const checkCachedAuth = () => {
    if (!clientEmail) return;
    
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { email: cachedEmail, timestamp } = JSON.parse(cached);
        const now = Date.now();
        
        // Check if cache is still valid (within 24 hours)
        if (now - timestamp < CACHE_DURATION) {
          // Verify the cached email still matches the current client email
          if (cachedEmail && cachedEmail.toLowerCase() === clientEmail.toLowerCase()) {
            setEmail(cachedEmail);
            setIsAuthenticated(true);
            return;
          }
        }
        
        // Cache expired or invalid, remove it
        localStorage.removeItem(cacheKey);
      }
    } catch (error) {
      console.error('Error checking cached auth:', error);
      localStorage.removeItem(cacheKey);
    }
  };

  // Save authentication to cache
  const saveAuthToCache = (email: string, clientEmail: string) => {
    try {
      const authData = {
        email,
        clientEmail,
        timestamp: Date.now()
      };
      localStorage.setItem(cacheKey, JSON.stringify(authData));
    } catch (error) {
      console.error('Error saving auth to cache:', error);
    }
  };

  async function fetchClientEmail() {
    try {
      setLoadingClientEmail(true);
      setError(null);
      
      const { data: campaignData, error: campaignError } = await supabasePublic
        .from('campaigns')
        .select('client_id')
        .eq('id', campaignId)
        .single();
      
      if (campaignError) {
        console.error('Campaign fetch error:', campaignError);
        throw new Error('Campaign not found or access denied');
      }
      
      if (!campaignData?.client_id) {
        throw new Error('Campaign has no associated client');
      }
      
      const { data: clientData, error: clientError } = await supabasePublic
        .from('clients')
        .select('email')
        .eq('id', campaignData.client_id)
        .single();
      
      if (clientError) {
        console.error('Client fetch error:', clientError);
        throw new Error('Client information not found');
      }
      
      if (!clientData?.email) {
        throw new Error('Client has no email address configured');
      }
      
      setClientEmail(clientData.email);
    } catch (e: any) {
      console.error('Error fetching client email:', e);
      setError(e.message || 'Failed to load campaign access information');
      setClientEmail(null);
    } finally {
      setLoadingClientEmail(false);
    }
  }

  // Fetch client email directly (returns the email instead of only setting state)
  async function getClientEmail(): Promise<string | null> {
    try {
      const { data: campaignData, error: campaignError } = await supabasePublic
        .from('campaigns')
        .select('client_id')
        .eq('id', campaignId)
        .single();
      if (campaignError || !campaignData?.client_id) return null;

      const { data: clientData, error: clientError } = await supabasePublic
        .from('clients')
        .select('email')
        .eq('id', campaignData.client_id)
        .single();
      if (clientError || !clientData?.email) return null;

      return clientData.email as string;
    } catch {
      return null;
    }
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    // Ensure we have the authorized client email; fetch on demand if needed
    const authorizedEmail = clientEmail || (await getClientEmail());
    if (!authorizedEmail) {
      setEmailError('Unable to verify authorized email right now. Please try again.');
      return;
    }

    if (email.toLowerCase() !== authorizedEmail.toLowerCase()) {
      setEmailError('This email address is not authorized to access this campaign');
      return;
    }

    // Save authentication to cache and proceed
    saveAuthToCache(email, authorizedEmail);
    setIsAuthenticated(true);
  };

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);

      // Campaign
      const { data: campaignData, error: campaignError } = await supabasePublic
        .from('campaigns')
        .select(`*, clients!campaigns_client_id_fkey(name), campaign_budget_allocations(*)`)
        .eq('id', campaignId)
        .single();
      
      if (campaignError) {
        console.error('Campaign fetch error:', campaignError);
        // Only throw if it's a real error, not just no data found
        if (campaignError.code === 'PGRST116') {
          setError('Campaign not found');
        } else {
          setError(`Failed to load campaign: ${campaignError.message}`);
        }
        return;
      }

      if (!campaignData) {
        setError('Campaign not found');
        return;
      }

      const normalizedCampaign: Campaign = {
        id: campaignData.id,
        name: campaignData.name,
        status: campaignData.status,
        total_budget: campaignData.total_budget,
        start_date: campaignData.start_date,
        end_date: campaignData.end_date,
        description: campaignData.description,
        region: campaignData.region,
        created_at: campaignData.created_at,
        client_id: campaignData.client_id,
        client_name: (campaignData.clients as any)?.name || null,
        budget_allocations: (campaignData.campaign_budget_allocations || []).map((b: any) => ({ id: b.id, region: b.region, allocated_budget: b.allocated_budget })),
        share_creator_type: campaignData.share_creator_type || false,
      };
      setCampaign(normalizedCampaign);

      // KOLs - don't fail the whole page if this fails
      try {
        const { data: kolData, error: kolError } = await supabasePublic
          .from('campaign_kols')
          .select(`id, hh_status, client_status, allocated_budget, budget_type, master_kol:master_kols(id, name, link, followers, platform, region, content_type, creator_type)`)
          .eq('campaign_id', campaignId)
          .order('created_at', { ascending: false });
        
        if (kolError) {
          console.warn('KOLs fetch error:', kolError);
          setKols([]);
        } else {
          setKols((kolData as any) || []);
        }
      } catch (kolErr) {
        console.warn('KOLs fetch failed:', kolErr);
        setKols([]);
      }

      // Contents - don't fail the whole page if this fails
      try {
        const { data: contentData, error: contentError } = await supabasePublic
          .from('contents')
          .select('*, campaign_kol:campaign_kols(master_kol:master_kols(id, name, link))')
          .eq('campaign_id', campaignId)
          .order('created_at', { ascending: false });
        
        if (contentError) {
          console.warn('Contents fetch error:', contentError);
          setContents([]);
        } else {
          setContents((contentData as any) || []);
        }
      } catch (contentErr) {
        console.warn('Contents fetch failed:', contentErr);
        setContents([]);
      }
    } catch (e: any) {
      console.error('Unexpected error loading public campaign:', e);
      setError('An unexpected error occurred while loading the campaign');
    } finally {
      setLoading(false);
    }
  }

  // Email authentication gate
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <div className="bg-[#3e8692] rounded-full p-3 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <Megaphone className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Campaign Access</h1>
            <p className="text-gray-600">
              {loadingClientEmail ? 
                'Loading campaign access information...' :
                'Please enter the authorized email address to view this campaign'
              }
            </p>
          </div>
          
          {loadingClientEmail ? (
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3e8692] mx-auto mb-4"></div>
              <p className="text-gray-600">Verifying campaign access...</p>
            </div>
          ) : (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Authorized Email Address
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter the authorized email address"
                  className="w-full auth-input"
                  required
                />
                {emailError && (
                  <p className="mt-2 text-sm text-red-600">{emailError}</p>
                )}
              </div>
              
              <Button
                type="submit"
                className="w-full bg-[#3e8692] hover:bg-[#2d6470] text-white"
              >
                Access Campaign
              </Button>
            </form>
          )}
          
          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              By accessing this campaign, you agree to our terms of service.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading campaign...</p>
          <p className="text-gray-400 text-sm mt-2">Campaign ID: {campaignId}</p>
        </div>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200">
          <div className="w-full px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center space-x-4">
              <Image src="/images/logo.png" alt="KOL Campaign Manager Logo" width={40} height={40} className="rounded-lg" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">Holo Hive Campaign Manager</h1>
              </div>
            </div>
          </div>
        </div>
        <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
            <Megaphone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Campaign Not Found</h2>
            <p className="text-gray-600 mb-4">This campaign doesn't exist or is not publicly accessible.</p>
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-left">
                <p className="text-red-600 text-sm font-medium">Error Details:</p>
                <p className="text-red-600 text-sm mt-1">{error}</p>
                <p className="text-gray-500 text-xs mt-2">Campaign ID: {campaignId}</p>
              </div>
            )}
            <p className="text-gray-400 text-sm mt-2">Campaign ID: {campaignId}</p>
            <div className="mt-6">
              <Button 
                onClick={() => {
                  setError(null);
                  fetchData();
                }}
                className="bg-[#3e8692] hover:bg-[#2d6470] text-white"
              >
                Try Again
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center space-x-4">
            <Image src="/images/logo.png" alt="KOL Campaign Manager Logo" width={40} height={40} className="rounded-lg" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Holo Hive Campaign Manager</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Title */}
        <div className="flex items-center space-x-4 mb-6">
          <div className="bg-gray-100 p-2 rounded-lg">
            <Megaphone className="h-6 w-6 text-gray-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{campaign.name}</h2>
          </div>
          <div className="ml-auto">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadge(campaign.status)}`}>
              {campaign.status}
            </span>
          </div>
        </div>

        {/* Information + Metrics */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className={`grid gap-4 ${campaign.budget_allocations && campaign.budget_allocations.length > 0 ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
            <div className="space-y-3">
              <div className="flex items-center text-sm text-gray-600">
                <Building2 className="h-4 w-4 mr-2 text-gray-500" />
                <span className="text-gray-700">{campaign.client_name || 'Unknown Client'}</span>
              </div>
              <div className="flex items-center text-sm text-gray-600">
                <Users className="h-4 w-4 mr-2 text-gray-500" />
                <span className="text-gray-700">{kols.length} KOL{kols.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center text-sm text-gray-600">
                <DollarSign className="h-4 w-4 mr-2 text-gray-500" />
                <span className="text-gray-700">{formatCurrency(campaign.total_budget)}</span>
              </div>
              <div className="flex items-center text-sm text-gray-600">
                <CalendarIcon className="h-4 w-4 mr-2 text-gray-500" />
                <span className="text-gray-700">{formatDate(campaign.start_date)} - {formatDate(campaign.end_date)}</span>
              </div>
              {campaign.description && (
                <div className="text-sm text-gray-700">
                  <span className="font-medium">Description: </span>
                  <span>{campaign.description}</span>
                </div>
              )}
            </div>
            {campaign.budget_allocations && campaign.budget_allocations.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">Metrics</h3>
                <div className="flex flex-wrap gap-2">
                  {campaign.budget_allocations.map((alloc) => (
                    <span key={alloc.id} className="px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                      {alloc.region === 'apac' ? 'APAC' : alloc.region === 'global' ? 'Global' : alloc.region}: {formatCurrency(alloc.allocated_budget)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tabs for KOLs and Contents */}
        <Tabs defaultValue="kols" className="bg-white rounded-lg shadow-sm border">
          <div className="px-6 pt-4">
            <TabsList>
              <TabsTrigger value="kols">KOL Dashboard</TabsTrigger>
              {/* <TabsTrigger value="performance">Performance</TabsTrigger> */}
              <TabsTrigger value="contents">Content Dashboard</TabsTrigger>
            </TabsList>
          </div>
          <div className="px-6 pb-4">
            <TabsContent value="kols">
              <div className="w-full bg-white border border-gray-200 shadow-sm p-6">
                <CardHeader className="pb-6 border-b border-gray-100 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-gray-100 p-2 rounded-lg">
                      <Users className="h-5 w-5 text-gray-600" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900">KOL Dashboard</h2>
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
                        onClick={() => setKolViewMode('cards')}
                        className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer ${kolViewMode === 'cards' ? 'bg-background text-foreground shadow-sm' : ''}`}
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
                          <div className="flex items-center gap-3">
                            <div className="bg-gradient-to-br from-[#3e8692] to-[#2d6470] p-3 rounded-lg">
                              <Users className="h-6 w-6 text-white" />
                            </div>
                            <p className="text-sm text-gray-600">Total KOLs in Campaign</p>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-gray-900">
                            {kols.length}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Average Followers per KOL */}
                      <Card className="hover:shadow-lg transition-shadow duration-200">
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-3">
                            <div className="bg-gradient-to-br from-[#3e8692] to-[#2d6470] p-3 rounded-lg">
                              <BarChart3 className="h-6 w-6 text-white" />
                            </div>
                            <p className="text-sm text-gray-600">Average Followers per KOL</p>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-gray-900">
                            {(() => {
                              if (kols.length > 0) {
                                const totalFollowers = kols.reduce((sum, kol) => sum + (kol.master_kol.followers || 0), 0);
                                const average = Math.round(totalFollowers / kols.length);
                                return formatFollowers(average);
                              }
                              return '0';
                            })()}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Distribution of KOLs by Platform */}
                      <Card className="hover:shadow-lg transition-shadow duration-200">
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-3">
                            <div className="bg-gradient-to-br from-[#3e8692] to-[#2d6470] p-3 rounded-lg">
                              <Globe className="h-6 w-6 text-white" />
                            </div>
                            <p className="text-sm text-gray-600">
                              {(() => {
                                const platforms = new Set();
                                kols.forEach(kol => {
                                  if (kol.master_kol.platform) {
                                    kol.master_kol.platform.forEach((p: string) => platforms.add(p));
                                  }
                                });
                                return platforms.size === 1 ? 'Unique Platform' : 'Unique Platforms';
                              })()}
                            </p>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-gray-900">
                            {(() => {
                              const platforms = new Set();
                              kols.forEach(kol => {
                                if (kol.master_kol.platform) {
                                  kol.master_kol.platform.forEach((p: string) => platforms.add(p));
                                }
                              });
                              return platforms.size;
                            })()}
                          </div>
                        </CardContent>
                      </Card>

                      {/* KOLs by Region */}
                      <Card className="hover:shadow-lg transition-shadow duration-200">
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-3">
                            <div className="bg-gradient-to-br from-[#3e8692] to-[#2d6470] p-3 rounded-lg">
                              <Flag className="h-6 w-6 text-white" />
                            </div>
                            <p className="text-sm text-gray-600">
                              {(() => {
                                const regions = new Set();
                                kols.forEach(kol => {
                                  if (kol.master_kol.region) {
                                    regions.add(kol.master_kol.region);
                                  }
                                });
                                return regions.size === 1 ? 'Region Represented' : 'Regions Represented';
                              })()}
                            </p>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-gray-900">
                            {(() => {
                              const regions = new Set();
                              kols.forEach(kol => {
                                if (kol.master_kol.region) {
                                  regions.add(kol.master_kol.region);
                                }
                              });
                              return regions.size;
                            })()}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Charts Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Platform Distribution Chart */}
                      <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <h3 className="text-xl font-bold text-gray-900">KOLs by Platform</h3>
                          </div>
                        </div>
                        <div className="h-96">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                              data={(() => {
                                const platformCounts: { [key: string]: number } = {};
                                kols.forEach(kol => {
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
                                allowDecimals={false}
                              />
                              <Tooltip 
                                contentStyle={{
                                  backgroundColor: 'white',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '12px',
                                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                                  fontSize: '14px',
                                  padding: '12px 16px',
                                  fontWeight: '500'
                                }}
                                formatter={(value: number) => [value, 'KOLs']}
                                labelFormatter={(label: string) => `Platform: ${label}`}
                                labelStyle={{
                                  color: '#374151',
                                  fontWeight: '600',
                                  marginBottom: '4px'
                                }}
                              />
                              <Bar 
                                dataKey="count" 
                                radius={[8, 8, 0, 0]}
                              >
                                {(() => {
                                  const platformCounts: { [key: string]: number } = {};
                                  kols.forEach(kol => {
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
                                      <Cell key={`cell-${index}`} fill={color} />
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
                          </div>
                        </div>
                        <div className="h-96">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                              data={(() => {
                                const regionCounts: { [key: string]: number } = {};
                                kols.forEach(kol => {
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
                                allowDecimals={false}
                              />
                              <Tooltip 
                                contentStyle={{
                                  backgroundColor: 'white',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '12px',
                                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                                  fontSize: '14px',
                                  padding: '12px 16px',
                                  fontWeight: '500'
                                }}
                                formatter={(value: number) => [value, 'KOLs']}
                                labelFormatter={(label: string) => `Region: ${label}`}
                                labelStyle={{
                                  color: '#374151',
                                  fontWeight: '600',
                                  marginBottom: '4px'
                                }}
                              />
                              <Bar 
                                dataKey="count" 
                                radius={[8, 8, 0, 0]}
                              >
                                {(() => {
                                  const regionCounts: { [key: string]: number } = {};
                                  kols.forEach(kol => {
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
                            {campaign?.share_creator_type && (
                              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Creator Type</TableHead>
                            )}
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
                                          <span className={`px-2 py-1 rounded-md text-xs font-medium ${getStatusColor(status.toLowerCase())}`}>
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
                            <TableHead className="relative bg-gray-50 select-none">Content</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="bg-white">
                          {filteredKOLs.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={campaign?.share_creator_type ? 10 : 9} className="text-center py-12">
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
                                        hh_status: [],
                                        budget_type: [],
                                        followers_operator: '',
                                        followers_value: '',
                                        budget_operator: '',
                                        budget_value: '',
                                        paid_operator: '',
                                        paid_value: ''
                                      });
                                      setSearchTerm('');
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
                                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden text-center text-gray-600`} style={{ verticalAlign: 'middle' }}>
                                    {index + 1}
                                  </TableCell>
                                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden text-gray-600`} style={{ verticalAlign: 'middle', fontWeight: 'bold', width: '20%' }}>
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
                                    {campaignKOL.master_kol.followers ? formatFollowers(campaignKOL.master_kol.followers) : '-'}
                                  </TableCell>
                                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                    {campaignKOL.master_kol.region ? (
                                      <div className="flex items-center space-x-1">
                                        <span>{getRegionIcon(campaignKOL.master_kol.region).flag}</span>
                                        <span>{campaignKOL.master_kol.region}</span>
                                      </div>
                                    ) : '-'}
                                  </TableCell>
                                  {campaign?.share_creator_type && (
                                    <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                      {campaignKOL.master_kol.creator_type && campaignKOL.master_kol.creator_type.length > 0 ? (
                                        <div className="flex flex-wrap gap-1">
                                          {campaignKOL.master_kol.creator_type.map((type: string) => (
                                            <span key={type} className={`px-2 py-1 rounded-md text-xs font-medium ${getCreatorTypeColor(type)}`}>
                                              {type}
                                            </span>
                                          ))}
                                        </div>
                                      ) : '-'}
                                    </TableCell>
                                  )}
                                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${getStatusColor(campaignKOL.hh_status || 'curated')}`}>
                                      {campaignKOL.hh_status || 'Curated'}
                                    </span>
                                  </TableCell>
                                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} p-2 overflow-hidden text-center`}>
                                    <div className="font-medium text-gray-900">
                                      {contents.filter(content => content.campaign_kols_id === campaignKOL.id).length}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}

                {/* Cards View */}
                {kolViewMode === 'cards' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {kols.map((item, index) => (
                      <Card key={item.id} className="hover:shadow-lg transition-shadow duration-200">
                        <CardHeader className="pb-4">
                          <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-gradient-to-br from-[#3e8692] to-[#2d6470] rounded-full flex items-center justify-center mb-3">
                              <span className="text-white font-bold text-xl">
                                {item.master_kol.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="mb-2">
                              <h3 className="font-semibold text-gray-900 text-lg">{item.master_kol.name}</h3>
                              <p className="text-sm text-gray-500">{item.master_kol.region || 'No region'}</p>
                            </div>
                            <div className="flex items-center space-x-2">
                              {(item.master_kol.platform || []).map((platform: string) => (
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
                              {item.master_kol.followers ? formatFollowers(item.master_kol.followers) : '-'}
                            </span>
                          </div>

                          {/* Status */}
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Status</span>
                            <Badge className={getStatusColor(item.hh_status || 'curated')}>
                              {item.hh_status || 'No status'}
                            </Badge>
                          </div>

                          {/* Content Types */}
                          {Array.isArray(item.master_kol.content_type) && item.master_kol.content_type.length > 0 && (
                            <div>
                              <span className="text-sm text-gray-600 block mb-2">Content Types</span>
                              <div className="flex flex-wrap gap-1">
                                {item.master_kol.content_type.map((type: string, idx: number) => (
                                  <span key={idx} className={`px-2 py-1 rounded-md text-xs font-medium ${getContentTypeColor(type)}`}>
                                    {type}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* View Profile Link */}
                          {item.master_kol.link && (
                            <div className="pt-2 border-t border-gray-100">
                              <a 
                                href={item.master_kol.link} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                              >
                                View Profile →
                              </a>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                    {kols.length === 0 && (
                      <div className="col-span-full text-center py-8 text-gray-500">
                        No KOLs in this campaign.
                      </div>
                    )}
                  </div>
                )}
                </CardContent>
              </div>
            </TabsContent>

            {/* Performance Tab */}
            <TabsContent value="performance">
              <div className="w-full bg-white border border-gray-200 shadow-sm p-6">
                <CardHeader className="pb-6 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="bg-gray-100 p-2 rounded-lg">
                      <BarChart3 className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900">Performance</h2>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-6">
                  {/* Performance Metrics Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {/* Number of KOLs */}
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
                          {kols.length}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">Total KOLs</p>
                      </CardContent>
                    </Card>

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
                  </div>

                  {/* Charts Section */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Top KOLs by Likes */}
                    <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
                      <div className="mb-6">
                        <h3 className="text-xl font-bold text-gray-900">Top KOLs by Likes</h3>
                        <p className="text-sm text-gray-500 mt-1">KOLs ranked by total likes</p>
                      </div>
                      <div className="h-96">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={(() => {
                              // Calculate total likes per KOL
                              const kolLikes = contents.reduce((acc, content) => {
                                const kol = kols.find(k => k.id === content.campaign_kols_id);
                                if (kol) {
                                  const kolName = kol.master_kol.name;
                                  if (!acc[kolName]) {
                                    acc[kolName] = 0;
                                  }
                                  acc[kolName] += content.likes || 0;
                                }
                                return acc;
                              }, {} as Record<string, number>);

                              return Object.entries(kolLikes)
                                .map(([name, likes]) => ({ name, likes }))
                                .sort((a, b) => b.likes - a.likes)
                                .slice(0, 10); // Top 10
                            })()}
                            margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis
                              dataKey="name"
                              axisLine={false}
                              tickLine={false}
                              tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }}
                              angle={-45}
                              textAnchor="end"
                              height={100}
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
                              formatter={(value: number) => [value.toLocaleString(), 'Likes']}
                            />
                            <Bar dataKey="likes" fill="#3e8692" radius={[8, 8, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Top KOLs by Impressions */}
                    <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
                      <div className="mb-6">
                        <h3 className="text-xl font-bold text-gray-900">Top KOLs by Impressions</h3>
                        <p className="text-sm text-gray-500 mt-1">KOLs ranked by total impressions</p>
                      </div>
                      <div className="h-96">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={(() => {
                              // Calculate total impressions per KOL
                              const kolImpressions = contents.reduce((acc, content) => {
                                const kol = kols.find(k => k.id === content.campaign_kols_id);
                                if (kol) {
                                  const kolName = kol.master_kol.name;
                                  if (!acc[kolName]) {
                                    acc[kolName] = 0;
                                  }
                                  acc[kolName] += content.impressions || 0;
                                }
                                return acc;
                              }, {} as Record<string, number>);

                              return Object.entries(kolImpressions)
                                .map(([name, impressions]) => ({ name, impressions }))
                                .sort((a, b) => b.impressions - a.impressions)
                                .slice(0, 10); // Top 10
                            })()}
                            margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis
                              dataKey="name"
                              axisLine={false}
                              tickLine={false}
                              tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }}
                              angle={-45}
                              textAnchor="end"
                              height={100}
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
                            />
                            <Bar dataKey="impressions" fill="#2d6470" radius={[8, 8, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </div>
            </TabsContent>

            <TabsContent value="contents">
              <div className="w-full bg-white border border-gray-200 shadow-sm p-6">
                <CardHeader className="pb-6 border-b border-gray-100 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-gray-100 p-2 rounded-lg">
                      <FileText className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900">Content Dashboard</h2>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-6">
                  {/* Content View Toggle */}
                  <div className="mb-4">
                    <div className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
                      <div onClick={() => setContentViewMode('overview')} className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer ${contentViewMode === 'overview' ? 'bg-background text-foreground shadow-sm' : ''}`}>
                        <BarChart3 className="h-4 w-4 mr-2" /> Overview
                      </div>
                      <div onClick={() => setContentViewMode('table')} className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer ${contentViewMode === 'table' ? 'bg-background text-foreground shadow-sm' : ''}`}>
                        <TableIcon className="h-4 w-4 mr-2" /> Table
                      </div>
                    </div>
                  </div>

                  {/* Table View */}
                  {contentViewMode === 'table' && (
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

                      <div className="border rounded-lg overflow-auto">
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
                                        {['Published','Scheduled','Draft','Pending','Failed','Removed'].map((status) => (
                                          <div
                                            key={status}
                                            className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-gray-100 cursor-pointer"
                                            onClick={() => {
                                              const newStatuses = contentFilters.status.includes(status)
                                                ? contentFilters.status.filter(s => s !== status)
                                                : [...contentFilters.status, status];
                                              setContentFilters(prev => ({ ...prev, status: newStatuses }));
                                            }}
                                          >
                                            <Checkbox checked={contentFilters.status.includes(status)} />
                                            <span className="text-sm">{status}</span>
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
                              <TableHead className="relative bg-gray-50 select-none">Bookmarks</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody className="bg-white">
                            {filteredContents.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={12} className="text-center py-12">
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
                                const kol = kols.find(k => k.id === content.campaign_kols_id);
                                return (
                                  <TableRow key={content.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors border-b border-gray-200`}>
                                    <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden text-center text-gray-600`} style={{ verticalAlign: 'middle' }}>
                                      {index + 1}
                                    </TableCell>
                                    <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden text-gray-600`} style={{ verticalAlign: 'middle', fontWeight: 'bold', width: '20%' }}>
                                      <div className="flex items-center w-full h-full">
                                        <div className="truncate font-bold">{kol?.master_kol?.name || '-'}</div>
                                        {kol?.master_kol?.link && (
                                          <a
                                            href={kol.master_kol.link}
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
                                      {content.platform ? (
                                        <div className="flex gap-1 items-center">
                                          <span className="flex items-center justify-center h-5 w-5" title={content.platform}>
                                            {getPlatformIcon(content.platform)}
                                          </span>
                                        </div>
                                      ) : '-'}
                                    </TableCell>
                                    <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                      {content.type ? (
                                        <span className={`px-2 py-1 rounded-md text-xs font-medium ${getContentTypeColor(content.type)}`}>
                                          {content.type}
                                        </span>
                                      ) : '-'}
                                    </TableCell>
                                    <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                      <span className={`px-2 py-1 rounded-md text-xs font-medium ${(() => {
                                        const s = (content.status || '').toLowerCase();
                                        if (['published', 'active', 'live', 'posted'].includes(s)) return 'bg-green-100 text-green-800';
                                        if (['scheduled'].includes(s)) return 'bg-blue-100 text-blue-800';
                                        if (['draft', 'pending'].includes(s)) return 'bg-yellow-100 text-yellow-800';
                                        if (['failed', 'removed'].includes(s)) return 'bg-red-100 text-red-800';
                                        return 'bg-gray-100 text-gray-800';
                                      })()}`}>
                                        {content.status ? content.status.charAt(0).toUpperCase() + content.status.slice(1).toLowerCase() : '-'}
                                      </span>
                                    </TableCell>
                                    <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                      {content.activation_date ? formatDate(content.activation_date) : '-'}
                                    </TableCell>
                                    <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                      {content.content_link ? (
                                        <a href={content.content_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">
                                          Open
                                        </a>
                                      ) : '-'}
                                    </TableCell>
                                    <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                      {content.impressions ? formatFollowers(content.impressions) : '-'}
                                    </TableCell>
                                    <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                      {content.likes ? formatFollowers(content.likes) : '-'}
                                    </TableCell>
                                    <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                      {content.retweets ? formatFollowers(content.retweets) : '-'}
                                    </TableCell>
                                    <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden`}>
                                      {content.comments ? formatFollowers(content.comments) : '-'}
                                    </TableCell>
                                    <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} p-2 overflow-hidden`}>
                                      {content.bookmarks ? formatFollowers(content.bookmarks) : '-'}
                                    </TableCell>
                                  </TableRow>
                                );
                              })
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}

                  {/* Overview View - Metrics */}
                  {contentViewMode === 'overview' && (
                    <div className="space-y-6">
                      {/* Metrics Cards */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Total Impressions */}
                        <Card className="hover:shadow-lg transition-shadow duration-200">
                          <CardHeader className="pb-3">
                            <div className="flex items-center gap-3">
                              <div className="bg-gradient-to-br from-[#3e8692] to-[#2d6470] p-3 rounded-lg">
                                <BarChart3 className="h-6 w-6 text-white" />
                              </div>
                              <p className="text-sm text-gray-600">
                                {(() => {
                                  const totalImpressions = contents.reduce((sum, content) => sum + (content.impressions || 0), 0);
                                  return totalImpressions === 1 ? 'Total Impression' : 'Total Impressions';
                                })()}
                              </p>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold text-gray-900">
                              {(() => {
                                const totalImpressions = contents.reduce((sum, content) => sum + (content.impressions || 0), 0);
                                return totalImpressions.toLocaleString();
                              })()}
                            </div>
                          </CardContent>
                        </Card>

                        {/* Total Comments */}
                        <Card className="hover:shadow-lg transition-shadow duration-200">
                          <CardHeader className="pb-3">
                            <div className="flex items-center gap-3">
                              <div className="bg-gradient-to-br from-[#3e8692] to-[#2d6470] p-3 rounded-lg">
                                <BarChart3 className="h-6 w-6 text-white" />
                              </div>
                              <p className="text-sm text-gray-600">
                                {(() => {
                                  const totalComments = contents.reduce((sum, content) => sum + (content.comments || 0), 0);
                                  return totalComments === 1 ? 'Total Comment' : 'Total Comments';
                                })()}
                              </p>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold text-gray-900">
                              {(() => {
                                const totalComments = contents.reduce((sum, content) => sum + (content.comments || 0), 0);
                                return totalComments.toLocaleString();
                              })()}
                            </div>
                          </CardContent>
                        </Card>

                        {/* Total Retweets */}
                        <Card className="hover:shadow-lg transition-shadow duration-200">
                          <CardHeader className="pb-3">
                            <div className="flex items-center gap-3">
                              <div className="bg-gradient-to-br from-[#3e8692] to-[#2d6470] p-3 rounded-lg">
                                <BarChart3 className="h-6 w-6 text-white" />
                              </div>
                              <p className="text-sm text-gray-600">
                                {(() => {
                                  const totalRetweets = contents.reduce((sum, content) => sum + (content.retweets || 0), 0);
                                  return totalRetweets === 1 ? 'Total Retweet' : 'Total Retweets';
                                })()}
                              </p>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold text-gray-900">
                              {(() => {
                                const totalRetweets = contents.reduce((sum, content) => sum + (content.retweets || 0), 0);
                                return totalRetweets.toLocaleString();
                              })()}
                            </div>
                          </CardContent>
                        </Card>

                        {/* Total Likes */}
                        <Card className="hover:shadow-lg transition-shadow duration-200">
                          <CardHeader className="pb-3">
                            <div className="flex items-center gap-3">
                              <div className="bg-gradient-to-br from-[#3e8692] to-[#2d6470] p-3 rounded-lg">
                                <BarChart3 className="h-6 w-6 text-white" />
                              </div>
                              <p className="text-sm text-gray-600">
                                {(() => {
                                  const totalLikes = contents.reduce((sum, content) => sum + (content.likes || 0), 0);
                                  return totalLikes === 1 ? 'Total Like' : 'Total Likes';
                                })()}
                              </p>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold text-gray-900">
                              {(() => {
                                const totalLikes = contents.reduce((sum, content) => sum + (content.likes || 0), 0);
                                return totalLikes.toLocaleString();
                              })()}
                            </div>
                          </CardContent>
                        </Card>

                        {/* Total Engagements */}
                        <Card className="hover:shadow-lg transition-shadow duration-200">
                          <CardHeader className="pb-3">
                            <div className="flex items-center gap-3">
                              <div className="bg-gradient-to-br from-[#3e8692] to-[#2d6470] p-3 rounded-lg">
                                <BarChart3 className="h-6 w-6 text-white" />
                              </div>
                              <p className="text-sm text-gray-600">
                                {(() => {
                                  const totalEngagements = contents.reduce((sum, content) =>
                                    sum + (content.likes || 0) + (content.comments || 0) + (content.retweets || 0) + (content.bookmarks || 0), 0);
                                  return totalEngagements === 1 ? 'Total Engagement' : 'Total Engagements';
                                })()}
                              </p>
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
                          </CardContent>
                        </Card>

                        {/* Total Bookmarks */}
                        <Card className="hover:shadow-lg transition-shadow duration-200">
                          <CardHeader className="pb-3">
                            <div className="flex items-center gap-3">
                              <div className="bg-gradient-to-br from-[#3e8692] to-[#2d6470] p-3 rounded-lg">
                                <BarChart3 className="h-6 w-6 text-white" />
                              </div>
                              <p className="text-sm text-gray-600">
                                {(() => {
                                  const totalBookmarks = contents.reduce((sum, content) => sum + (content.bookmarks || 0), 0);
                                  return totalBookmarks === 1 ? 'Total Bookmark' : 'Total Bookmarks';
                                })()}
                              </p>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold text-gray-900">
                              {(() => {
                                const totalBookmarks = contents.reduce((sum, content) => sum + (content.bookmarks || 0), 0);
                                return totalBookmarks.toLocaleString();
                              })()}
                            </div>
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
                        {/* Total Impressions */}
                        <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
                          <div className="flex items-center justify-between mb-6">
                            <div>
                              <h3 className="text-xl font-bold text-gray-900">Total Impressions</h3>
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

                                  // Sort by date and calculate cumulative impressions
                                  const sortedEntries = Object.entries(impressionsByDate).sort(([dateA], [dateB]) =>
                                    new Date(dateA).getTime() - new Date(dateB).getTime()
                                  ) as [string, number][];

                                  let cumulativeImpressions = 0;
                                  return sortedEntries.map(([date, impressions]) => {
                                    cumulativeImpressions += impressions;
                                    return {
                                      date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                                      impressions: cumulativeImpressions
                                    };
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
                                  tickFormatter={(value) => value.toLocaleString()}
                                />
                                <Tooltip
                                  contentStyle={{
                                    backgroundColor: 'white',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '12px',
                                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                                    fontSize: '14px',
                                    padding: '12px 16px',
                                    fontWeight: '500'
                                  }}
                                  formatter={(value: number) => [value.toLocaleString(), 'Cumulative Impressions']}
                                  labelFormatter={(label: string) => `Date: ${label}`}
                                  labelStyle={{
                                    color: '#374151',
                                    fontWeight: '600',
                                    marginBottom: '4px'
                                  }}
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
                            </div>
                          </div>
                          <div className="h-96">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart margin={{ top: 20, right: 80, bottom: 20, left: 80 }}>
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
                                      impressions,
                                      name: platform
                                    }));
                                  })()}
                                  cx="50%"
                                  cy="50%"
                                  labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                                  label={(props: any) => {
                                    const { cx, cy, midAngle, outerRadius, platform, impressions } = props;
                                    const RADIAN = Math.PI / 180;
                                    const radius = outerRadius + 35;
                                    const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                    const y = cy + radius * Math.sin(-midAngle * RADIAN);

                                    return (
                                      <g>
                                        <foreignObject x={x - 50} y={y - 18} width={100} height={36}>
                                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2px' }}>
                                              {getPlatformIcon(platform)}
                                            </div>
                                            <div style={{ fontSize: '11px', fontWeight: '600', color: '#374151', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                              {impressions.toLocaleString()}
                                            </div>
                                          </div>
                                        </foreignObject>
                                      </g>
                                    );
                                  }}
                                  outerRadius={100}
                                  dataKey="impressions"
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
                                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                                    fontSize: '14px',
                                    padding: '12px 16px',
                                    fontWeight: '500'
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
                                  labelStyle={{
                                    color: '#374151',
                                    fontWeight: '600',
                                    marginBottom: '4px'
                                  }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}


