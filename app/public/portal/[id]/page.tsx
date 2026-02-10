'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Building2,
  Calendar,
  DollarSign,
  Users,
  BarChart3,
  Search,
  ExternalLink,
  FileText,
  TrendingUp,
  Eye,
  Megaphone,
  StickyNote,
  Briefcase,
  Activity,
  ChevronDown,
  ChevronUp,
  MessageSquare
} from 'lucide-react';
import 'react-quill/dist/quill.snow.css';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabasePublic = createClient(supabaseUrl, supabaseAnonKey);

type Client = {
  id: string;
  name: string;
  email: string;
  slug: string | null;
  logo_url: string | null;
};

type MeetingNote = {
  id: string;
  title: string;
  content: string | null;
  attendees: string | null;
  action_items: string | null;
  meeting_date: string;
  created_at: string;
};

type ClientContext = {
  id: string;
  engagement_type: string | null;
  scope: string | null;
  start_date: string | null;
  milestones: string | null;
  client_contacts: string | null;
  holohive_contacts: string | null;
};

type DecisionLogEntry = {
  id: string;
  decision_date: string;
  summary: string;
};

type WeeklyUpdate = {
  id: string;
  week_of: string;
  current_focus: string;
  active_initiatives: string | null;
  next_checkin: string | null;
  open_questions: string | null;
};

type Campaign = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  total_budget: number | null;
  start_date: string | null;
  end_date: string | null;
  region: string | null;
  description: string | null;
  share_report_publicly: boolean | null;
  kol_count: number;
  content_count: number;
  total_impressions: number;
  total_engagement: number;
};

// Helper to check if a string is a valid UUID
const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'TBD';
  return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatCurrency = (amount: number | null) => {
  if (!amount) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
};

const formatNumber = (num: number) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
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

export default function ClientPortalPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const idOrSlug = params.id;

  // Auth states
  const [clientId, setClientId] = useState<string | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [clientEmail, setClientEmail] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loadingClientEmail, setLoadingClientEmail] = useState(true);

  // Data states
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [meetingNotes, setMeetingNotes] = useState<MeetingNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [clientContext, setClientContext] = useState<ClientContext | null>(null);
  const [linkedCRMAccount, setLinkedCRMAccount] = useState<{ scope: string | null; closed_at: string | null; qualified_at: string | null; created_at: string } | null>(null);
  const [decisionLog, setDecisionLog] = useState<DecisionLogEntry[]>([]);
  const [weeklyUpdates, setWeeklyUpdates] = useState<WeeklyUpdate[]>([]);
  const [showPreviousUpdates, setShowPreviousUpdates] = useState(false);

  // UI states
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'completed'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewingNote, setViewingNote] = useState<MeetingNote | null>(null);

  // Cache key for this specific client portal
  const cacheKey = `portal_auth_${idOrSlug}`;
  const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  // Resolve slug to UUID on mount
  useEffect(() => {
    async function resolveClientId() {
      try {
        if (isUUID(idOrSlug)) {
          setClientId(idOrSlug);
          // Fetch client email
          const { data, error } = await supabasePublic
            .from('clients')
            .select('id, name, email, slug, logo_url')
            .eq('id', idOrSlug)
            .is('archived_at', null)
            .single();

          if (error || !data) {
            setError('Client not found');
            setLoadingClientEmail(false);
            return;
          }
          setClient(data);
          setClientEmail(data.email);
        } else {
          // Fetch by slug
          const { data, error } = await supabasePublic
            .from('clients')
            .select('id, name, email, slug, logo_url')
            .eq('slug', idOrSlug)
            .is('archived_at', null)
            .single();

          if (error || !data) {
            setError('Client not found');
            setLoadingClientEmail(false);
            return;
          }
          setClientId(data.id);
          setClient(data);
          setClientEmail(data.email);
        }
      } catch (err) {
        setError('Failed to load client');
        setLoadingClientEmail(false);
      }
    }
    resolveClientId();
  }, [idOrSlug]);

  // Check cached auth when client email is available
  useEffect(() => {
    if (clientEmail) {
      checkCachedAuth();
      setLoadingClientEmail(false);
    }
  }, [clientEmail]);

  // Fetch data when authenticated
  useEffect(() => {
    if (isAuthenticated && clientId) {
      fetchCampaigns();
      fetchMeetingNotes();
      fetchClientContext();
      fetchDecisionLog();
      fetchWeeklyUpdates();
    }
  }, [clientId, isAuthenticated]);

  // Check if user is already authenticated via cache
  const checkCachedAuth = () => {
    if (!clientEmail) return;

    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { email: cachedEmail, timestamp } = JSON.parse(cached);
        const now = Date.now();

        if (now - timestamp < CACHE_DURATION) {
          if (cachedEmail && cachedEmail.toLowerCase() === clientEmail.toLowerCase()) {
            setEmail(cachedEmail);
            setIsAuthenticated(true);
            return;
          }
        }
        localStorage.removeItem(cacheKey);
      }
    } catch (error) {
      console.error('Error checking cached auth:', error);
      localStorage.removeItem(cacheKey);
    }
  };

  // Save authentication to cache
  const saveAuthToCache = (email: string) => {
    try {
      const authData = {
        email,
        clientId,
        timestamp: Date.now()
      };
      localStorage.setItem(cacheKey, JSON.stringify(authData));
      // Save global portal auth for cross-page navigation (campaign/report pages)
      const globalAuthData = {
        email,
        clientId,
        clientEmail,
        timestamp: Date.now()
      };
      localStorage.setItem('portal_global_auth', JSON.stringify(globalAuthData));
    } catch (error) {
      console.error('Error saving auth to cache:', error);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    if (!clientEmail) {
      setEmailError('Unable to verify access. Please try again.');
      return;
    }

    if (email.toLowerCase() !== clientEmail.toLowerCase()) {
      setEmailError('This email address is not authorized to access this portal');
      return;
    }

    saveAuthToCache(email);
    setIsAuthenticated(true);
  };

  async function fetchCampaigns() {
    if (!clientId) return;
    try {
      setLoading(true);
      setError(null);

      const { data: campaignsData, error: campaignsError } = await supabasePublic
        .from('campaigns')
        .select(`
          id,
          name,
          slug,
          status,
          total_budget,
          start_date,
          end_date,
          region,
          description,
          share_report_publicly,
          campaign_kols(count),
          contents(
            impressions,
            likes,
            comments,
            retweets,
            bookmarks
          )
        `)
        .eq('client_id', clientId)
        .is('archived_at', null)
        .order('start_date', { ascending: false });

      if (campaignsError) throw campaignsError;

      const processedCampaigns = campaignsData?.map(campaign => {
        const contents = (campaign as any).contents || [];
        const totalImpressions = contents.reduce((sum: number, c: any) => sum + (c.impressions || 0), 0);
        const totalEngagement = contents.reduce((sum: number, c: any) =>
          sum + (c.likes || 0) + (c.comments || 0) + (c.retweets || 0) + (c.bookmarks || 0), 0);

        return {
          ...campaign,
          kol_count: (campaign as any).campaign_kols?.[0]?.count || 0,
          content_count: contents.length,
          total_impressions: totalImpressions,
          total_engagement: totalEngagement,
        };
      }) || [];

      setCampaigns(processedCampaigns as Campaign[]);
    } catch (err) {
      console.error('Error fetching campaigns:', err);
      setError('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }

  async function fetchMeetingNotes() {
    if (!clientId) return;
    try {
      const { data, error } = await supabasePublic
        .from('client_meeting_notes')
        .select('id, title, content, attendees, action_items, meeting_date, created_at')
        .eq('client_id', clientId)
        .order('meeting_date', { ascending: false });

      if (error) throw error;
      setMeetingNotes(data || []);
    } catch (err) {
      console.error('Error fetching meeting notes:', err);
    }
  }

  async function fetchClientContext() {
    if (!clientId) return;
    try {
      const { data } = await supabasePublic
        .from('client_context')
        .select('id, engagement_type, scope, start_date, milestones, client_contacts, holohive_contacts')
        .eq('client_id', clientId)
        .single();
      setClientContext(data || null);
    } catch (err) {
      // No context yet
    }

    // Also fetch linked CRM account for scope and start_date
    try {
      const { data: crmData } = await supabasePublic
        .from('crm_opportunities')
        .select('scope, closed_at, qualified_at, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      setLinkedCRMAccount(crmData || null);
    } catch (err) {
      // No CRM account linked
    }
  }

  async function fetchDecisionLog() {
    if (!clientId) return;
    try {
      const { data } = await supabasePublic
        .from('client_decision_log')
        .select('id, decision_date, summary')
        .eq('client_id', clientId)
        .order('decision_date', { ascending: false });
      setDecisionLog(data || []);
    } catch (err) {
      console.error('Error fetching decision log:', err);
    }
  }

  async function fetchWeeklyUpdates() {
    if (!clientId) return;
    try {
      const { data } = await supabasePublic
        .from('client_weekly_updates')
        .select('id, week_of, current_focus, active_initiatives, next_checkin, open_questions')
        .eq('client_id', clientId)
        .order('week_of', { ascending: false });
      setWeeklyUpdates(data || []);
    } catch (err) {
      console.error('Error fetching weekly updates:', err);
    }
  }

  // Filter campaigns based on active tab and search term
  const filteredCampaigns = campaigns.filter(campaign => {
    const matchesTab = activeTab === 'all' ||
      (activeTab === 'active' && (campaign.status === 'Active' || campaign.status === 'Planning')) ||
      (activeTab === 'completed' && campaign.status === 'Completed');

    const matchesSearch = !searchTerm ||
      campaign.name.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesTab && matchesSearch;
  });

  // Calculate statistics
  const stats = {
    total: campaigns.length,
    active: campaigns.filter(c => c.status === 'Active').length,
    planning: campaigns.filter(c => c.status === 'Planning').length,
    completed: campaigns.filter(c => c.status === 'Completed').length,
    totalBudget: campaigns.reduce((sum, c) => sum + (c.total_budget || 0), 0),
  };

  // Loading state
  if (loadingClientEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#3e8692] mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !clientEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Portal Not Found</h2>
            <p className="text-gray-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Email authentication gate
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-4">
              <Image
                src="/images/logo.png"
                alt="Holo Hive"
                width={120}
                height={40}
                className="h-10 w-auto"
              />
            </div>
            {client?.logo_url && (
              <div className="flex justify-center mb-2">
                <img
                  src={client.logo_url}
                  alt={client.name}
                  className="h-10 w-auto max-w-[120px] object-contain rounded-lg"
                />
              </div>
            )}
            <CardTitle className="text-xl">Client Portal</CardTitle>
            {client && (
              <p className="text-gray-600 mt-2">Welcome, {client.name}</p>
            )}
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4 text-center">
              Please enter your email address to access your campaigns and reports.
            </p>
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <Input
                  type="email"
                  placeholder="your.email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="auth-input"
                  required
                />
                {emailError && (
                  <p className="text-sm text-red-600 mt-2">{emailError}</p>
                )}
              </div>
              <Button type="submit" className="w-full bg-[#3e8692] hover:bg-[#2d6570]">
                Access Portal
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main portal content
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Image
                src="/images/logo.png"
                alt="Holo Hive"
                width={100}
                height={32}
                className="h-8 w-auto"
              />
              <span className="text-gray-300">|</span>
              <span className="text-gray-600 font-medium">Client Portal</span>
            </div>
            <div className="flex items-center gap-3">
              {client?.logo_url ? (
                <img
                  src={client.logo_url}
                  alt={client.name}
                  className="h-8 w-auto max-w-[100px] object-contain rounded-lg"
                />
              ) : (
                <Building2 className="h-5 w-5 text-gray-400" />
              )}
              <span className="font-medium text-gray-900">{client?.name}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Welcome Section */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome back, <span className="text-[#3e8692]">{client?.name}</span>
          </h1>
          <p className="text-gray-500 text-lg">
            View and track all your campaigns in one place.
          </p>
        </div>

        {/* Client Context Section */}
        {(clientContext || linkedCRMAccount) && (
          <Card className="border-0 shadow-lg rounded-xl overflow-hidden mb-10">
            <CardHeader className="bg-gradient-to-r from-[#3e8692]/5 to-transparent pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-[#3e8692] to-[#2d6570] rounded-xl shadow-lg">
                  <Briefcase className="h-5 w-5 text-white" />
                </div>
                <CardTitle className="text-xl font-bold text-gray-900">Engagement Overview</CardTitle>
                {clientContext?.engagement_type && (
                  <span className="px-3 py-1 bg-[#e8f4f5] text-[#3e8692] text-sm font-medium rounded-full">{clientContext.engagement_type}</span>
                )}
                {(() => {
                  const startDate = linkedCRMAccount?.closed_at || linkedCRMAccount?.qualified_at || linkedCRMAccount?.created_at || clientContext?.start_date;
                  return startDate ? (
                    <span className="ml-auto text-sm text-gray-400 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      Since {new Date(startDate.includes('T') ? startDate : startDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                    </span>
                  ) : null;
                })()}
              </div>
            </CardHeader>
            <CardContent className="p-6 pt-2">
              {/* Scope — full width (use CRM scope if available, formatted nicely) */}
              {(() => {
                const crmScope = linkedCRMAccount?.scope;
                // Scope labels (consistent with pipeline page)
                const scopeLabels: Record<string, string> = {
                  'fundraising': 'Fundraising',
                  'advisory': 'Advisory',
                  'kol_activation': 'KOL Activation',
                  'gtm': 'GTM',
                  'bd_partnerships': 'BD/Partnerships',
                  'apac': 'APAC',
                };
                const formattedCRMScope = crmScope ? crmScope.split(',').map(s => scopeLabels[s.trim()] || s.trim()).join(', ') : null;
                const displayScope = formattedCRMScope || clientContext?.scope;
                return displayScope ? (
                  <div className="mb-5">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{displayScope}</p>
                  </div>
                ) : null;
              })()}

              {/* Milestones as a timeline */}
              {clientContext?.milestones && (
                <div className="mb-5 bg-gray-50 rounded-lg p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Milestones</p>
                  <div className="space-y-2">
                    {clientContext.milestones.split('\n').filter(Boolean).map((milestone, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="mt-1.5 h-2 w-2 rounded-full bg-[#3e8692] flex-shrink-0" />
                        <p className="text-sm text-gray-700">{milestone}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Contacts side by side */}
              {(clientContext?.client_contacts || clientContext?.holohive_contacts) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {clientContext?.client_contacts && (
                    <div className="flex items-start gap-3 bg-gray-50 rounded-lg p-3">
                      <Users className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Client Contacts</p>
                        <p className="text-sm text-gray-700">{clientContext?.client_contacts}</p>
                      </div>
                    </div>
                  )}
                  {clientContext?.holohive_contacts && (
                    <div className="flex items-start gap-3 bg-gray-50 rounded-lg p-3">
                      <Users className="h-4 w-4 text-[#3e8692] mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Holo Hive Contacts</p>
                        <p className="text-sm text-gray-700">{clientContext?.holohive_contacts}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-10">
          <Card className="group relative hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border-0 shadow-md overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[#3e8692]/5 to-[#3e8692]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            <CardContent className="pt-6 pb-5 relative">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Total Campaigns</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
                </div>
                <div className="p-3 bg-gradient-to-br from-[#3e8692] to-[#2d6570] rounded-xl shadow-lg">
                  <Megaphone className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="group relative hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border-0 shadow-md overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-green-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            <CardContent className="pt-6 pb-5 relative">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Active</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.active}</p>
                </div>
                <div className="p-3 bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg">
                  <TrendingUp className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="group relative hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border-0 shadow-md overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            <CardContent className="pt-6 pb-5 relative">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Planning</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.planning}</p>
                </div>
                <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
                  <Calendar className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="group relative hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border-0 shadow-md overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-gray-500/5 to-gray-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            <CardContent className="pt-6 pb-5 relative">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Completed</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.completed}</p>
                </div>
                <div className="p-3 bg-gradient-to-br from-gray-500 to-gray-600 rounded-xl shadow-lg">
                  <BarChart3 className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Weekly Status Section */}
        {weeklyUpdates.length > 0 && (
          <Card className="border-0 shadow-lg rounded-xl overflow-hidden mb-10 border-l-4 border-l-[#3e8692]">
            <CardHeader className="bg-white border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg">
                  <Activity className="h-5 w-5 text-white" />
                </div>
                <CardTitle className="text-xl font-bold text-gray-900">What's Active Now</CardTitle>
                <span className="text-sm text-gray-500">Week of {new Date(weeklyUpdates[0].week_of + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div>
                  <p className="font-semibold text-gray-900 text-lg">{weeklyUpdates[0].current_focus}</p>
                </div>
                {weeklyUpdates[0].active_initiatives && (
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-2">Active Initiatives</p>
                    <ul className="space-y-1">
                      {weeklyUpdates[0].active_initiatives.split('\n').filter(Boolean).map((item, i) => (
                        <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                          <span className="text-[#3e8692] mt-0.5">•</span>
                          <span>{item.replace(/^[-•]\s*/, '')}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex flex-wrap gap-6">
                  {weeklyUpdates[0].next_checkin && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Next Check-in</p>
                      <p className="text-sm text-gray-700 font-medium">{new Date(weeklyUpdates[0].next_checkin + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                    </div>
                  )}
                </div>
                {weeklyUpdates[0].open_questions && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                    <p className="text-sm font-medium text-orange-800 mb-1">Open Questions / Blockers</p>
                    <p className="text-sm text-orange-700 whitespace-pre-wrap">{weeklyUpdates[0].open_questions}</p>
                  </div>
                )}
                {weeklyUpdates.length > 1 && (
                  <div>
                    <button
                      onClick={() => setShowPreviousUpdates(!showPreviousUpdates)}
                      className="flex items-center gap-1 text-sm text-[#3e8692] hover:text-[#2d6570] font-medium"
                    >
                      {showPreviousUpdates ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      {showPreviousUpdates ? 'Hide' : 'Show'} Previous Updates ({weeklyUpdates.length - 1})
                    </button>
                    {showPreviousUpdates && (
                      <div className="mt-3 space-y-3">
                        {weeklyUpdates.slice(1).map((update) => (
                          <div key={update.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                            <p className="text-xs text-gray-400 mb-1">Week of {new Date(update.week_of + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                            <p className="text-sm font-medium text-gray-700">{update.current_focus}</p>
                            {update.active_initiatives && (
                              <div className="mt-1">
                                {update.active_initiatives.split('\n').filter(Boolean).map((item, i) => (
                                  <p key={i} className="text-xs text-gray-600">• {item.replace(/^[-•]\s*/, '')}</p>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Campaigns Section */}
        <Card className="border-0 shadow-lg rounded-xl overflow-hidden">
          <CardHeader className="bg-white border-b border-gray-100 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle className="text-xl font-bold text-gray-900">Your Campaigns</CardTitle>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search campaigns..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 auth-input rounded-lg"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="mb-6">
              <TabsList className="bg-gray-100 p-1 rounded-lg">
                <TabsTrigger value="all" className="rounded-md px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm cursor-pointer">All ({stats.total})</TabsTrigger>
                <TabsTrigger value="active" className="rounded-md px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm cursor-pointer">Active ({stats.active + stats.planning})</TabsTrigger>
                <TabsTrigger value="completed" className="rounded-md px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm cursor-pointer">Completed ({stats.completed})</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Campaign List */}
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse">
                    <div className="h-36 bg-gray-100 rounded-xl"></div>
                  </div>
                ))}
              </div>
            ) : filteredCampaigns.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Megaphone className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No campaigns found</h3>
                <p className="text-gray-500">
                  {searchTerm ? 'Try a different search term.' : 'No campaigns match the selected filter.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredCampaigns.map((campaign, index) => {
                  const statusBorderColor = campaign.status === 'Active'
                    ? 'border-l-green-500'
                    : campaign.status === 'Planning'
                    ? 'border-l-blue-500'
                    : campaign.status === 'Paused'
                    ? 'border-l-yellow-500'
                    : 'border-l-gray-400';

                  return (
                    <div
                      key={campaign.id}
                      className={`group bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 overflow-hidden border-l-4 ${statusBorderColor}`}
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <div className="p-5">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                          {/* Campaign Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-3">
                              <h3 className="font-bold text-lg text-gray-900 truncate group-hover:text-[#3e8692] transition-colors">
                                {campaign.name}
                              </h3>
                              <Badge className={`${getStatusBadge(campaign.status)} font-medium px-2.5 py-0.5 cursor-default pointer-events-none`}>
                                {campaign.status}
                              </Badge>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-500 mb-4">
                              <div className="flex items-center gap-2">
                                <div className="p-1 bg-gray-100 rounded">
                                  <Calendar className="h-3.5 w-3.5 text-gray-500" />
                                </div>
                                <span>{formatDate(campaign.start_date)} - {formatDate(campaign.end_date)}</span>
                              </div>
                              {campaign.total_budget && (
                                <div className="flex items-center gap-2">
                                  <div className="p-1 bg-gray-100 rounded">
                                    <DollarSign className="h-3.5 w-3.5 text-gray-500" />
                                  </div>
                                  <span className="font-medium text-gray-700">{formatCurrency(campaign.total_budget)}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <div className="p-1 bg-gray-100 rounded">
                                  <Users className="h-3.5 w-3.5 text-gray-500" />
                                </div>
                                <span>{campaign.kol_count} KOLs</span>
                              </div>
                            </div>

                            {/* Quick Metrics */}
                            {campaign.content_count > 0 && (
                              <div className="flex items-center gap-6 text-sm">
                                <div className="flex items-center gap-2">
                                  <Eye className="h-4 w-4 text-[#3e8692]" />
                                  <span className="text-gray-600">
                                    <span className="font-semibold text-gray-900">{formatNumber(campaign.total_impressions)}</span> impressions
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <TrendingUp className="h-4 w-4 text-green-500" />
                                  <span className="text-gray-600">
                                    <span className="font-semibold text-gray-900">{formatNumber(campaign.total_engagement)}</span> engagement
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-lg border-gray-200 hover:border-[#3e8692] hover:text-[#3e8692] transition-colors"
                              onClick={() => {
                                const url = campaign.slug
                                  ? `/public/campaigns/${campaign.slug}`
                                  : `/public/campaigns/${campaign.id}`;
                                window.open(url, '_blank');
                              }}
                            >
                              <ExternalLink className="h-4 w-4 mr-1.5" />
                              View Campaign
                            </Button>
                            {campaign.share_report_publicly && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  const url = campaign.slug
                                    ? `/public/reports/${campaign.slug}`
                                    : `/public/reports/${campaign.id}`;
                                  window.open(url, '_blank');
                                }}
                                className="rounded-lg bg-gradient-to-r from-[#3e8692] to-[#2d6570] hover:from-[#2d6570] hover:to-[#1d4a52] shadow-md hover:shadow-lg transition-all"
                              >
                                <FileText className="h-4 w-4 mr-1.5" />
                                View Report
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Meeting Notes Section */}
        {meetingNotes.length > 0 && (
          <Card className="border-0 shadow-lg rounded-xl overflow-hidden mt-8">
            <CardHeader className="bg-white border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-[#3e8692] to-[#2d6570] rounded-xl shadow-lg">
                  <StickyNote className="h-5 w-5 text-white" />
                </div>
                <CardTitle className="text-xl font-bold text-gray-900">Meeting Notes</CardTitle>
                <span className="text-sm text-gray-500">({meetingNotes.length})</span>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                {meetingNotes.map((note, index) => (
                  <div
                    key={note.id}
                    className="group bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 overflow-hidden border-l-4 border-l-[#3e8692] cursor-pointer"
                    style={{ animationDelay: `${index * 50}ms` }}
                    onClick={() => setViewingNote(note)}
                  >
                    <div className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-lg text-gray-900 truncate group-hover:text-[#3e8692] transition-colors">
                            {note.title}
                          </h3>
                          <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                            <div className="p-1 bg-gray-100 rounded">
                              <Calendar className="h-3.5 w-3.5 text-gray-500" />
                            </div>
                            <span>{new Date(note.meeting_date + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg border-gray-200 hover:border-[#3e8692] hover:text-[#3e8692] transition-colors flex-shrink-0 ml-4"
                          onClick={(e) => { e.stopPropagation(); setViewingNote(note); }}
                        >
                          <ExternalLink className="h-4 w-4 mr-1.5" />
                          View Note
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Meeting Note Detail Dialog */}
        <Dialog open={!!viewingNote} onOpenChange={(open) => { if (!open) setViewingNote(null); }}>
          <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-hidden border-l-4 border-l-[#3e8692] rounded-xl">
            <DialogHeader className="pb-4 border-b border-gray-100">
              <DialogTitle className="text-xl font-bold text-gray-900">{viewingNote?.title}</DialogTitle>
              <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                <div className="p-1 bg-gray-100 rounded">
                  <Calendar className="h-3.5 w-3.5 text-gray-500" />
                </div>
                <span>
                  {viewingNote && new Date(viewingNote.meeting_date + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
              </div>
            </DialogHeader>
            <div className="overflow-y-auto max-h-[60vh] pr-2 pt-2 space-y-4">
              {viewingNote?.attendees && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Users className="h-4 w-4 text-gray-400" />
                  <span><span className="font-medium">Attendees:</span> {viewingNote.attendees}</span>
                </div>
              )}
              {viewingNote?.content ? (
                <div className="ql-snow">
                  <div className="ql-editor !px-0 !text-gray-600" dangerouslySetInnerHTML={{ __html: viewingNote.content }} />
                </div>
              ) : (
                <p className="text-sm text-gray-500">No content for this note.</p>
              )}
              {viewingNote?.action_items && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-sm font-medium text-gray-700 mb-2">Action Items</p>
                  <div className="ql-snow">
                    <div className="ql-editor !px-0 !text-gray-600 !text-sm" dangerouslySetInnerHTML={{ __html: viewingNote.action_items }} />
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Decision Log Section */}
        {decisionLog.length > 0 && (
          <Card className="border-0 shadow-lg rounded-xl overflow-hidden mt-8">
            <CardHeader className="bg-white border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg">
                  <MessageSquare className="h-5 w-5 text-white" />
                </div>
                <CardTitle className="text-xl font-bold text-gray-900">Decision Log</CardTitle>
                <span className="text-sm text-gray-500">({decisionLog.length})</span>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-3">
                {decisionLog.map((dec) => (
                  <div key={dec.id} className="flex items-start gap-4 border-l-4 border-l-purple-300 pl-4 py-2">
                    <div className="text-xs text-gray-400 whitespace-nowrap mt-0.5">
                      {new Date(dec.decision_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    <p className="text-sm text-gray-700">{dec.summary}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
            <p>Need help? Contact your campaign manager or reach out to our team.</p>
            <div className="flex items-center gap-2">
              <span>Powered by</span>
              <Image
                src="/images/logo.png"
                alt="Holo Hive"
                width={80}
                height={24}
                className="h-5 w-auto opacity-60"
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
