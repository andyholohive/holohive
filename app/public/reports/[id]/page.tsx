'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { FileText, Download, Eye, Calendar as CalendarIcon, Building2, BarChart3, ExternalLink, Megaphone } from 'lucide-react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabasePublic = createClient(supabaseUrl, supabaseAnonKey);

type Campaign = {
  id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
  description: string | null;
  region: string | null;
  share_report_publicly: boolean | null;
  client_name?: string;
};

type CampaignKOL = {
  id: string;
  master_kol: {
    name: string;
  };
};

type ContentItem = {
  id: string;
  campaign_kols_id: string;
  activation_date: string | null;
  impressions: number | null;
  likes: number | null;
  retweets: number | null;
  comments: number | null;
  bookmarks: number | null;
};

type ReportFile = {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  created_at: string;
};

type CampaignReport = {
  custom_message: string | null;
};

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
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

const getFileIcon = (fileType: string) => {
  if (fileType.startsWith('image/')) return '🖼️';
  if (fileType.startsWith('video/')) return '🎥';
  if (fileType.includes('pdf')) return '📄';
  if (fileType.includes('spreadsheet') || fileType.includes('excel')) return '📊';
  if (fileType.includes('document') || fileType.includes('word')) return '📝';
  return '📎';
};

// Helper to check if a string is a valid UUID
const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

export default function PublicReportPage({ params }: { params: { id: string } }) {
  const idOrSlug = params.id;
  const [campaignId, setCampaignId] = useState<string | null>(null); // Resolved UUID
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [campaignKOLs, setCampaignKOLs] = useState<CampaignKOL[]>([]);
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [reportFiles, setReportFiles] = useState<ReportFile[]>([]);
  const [customMessage, setCustomMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [clientEmail, setClientEmail] = useState<string | null>(null);
  const [loadingClientEmail, setLoadingClientEmail] = useState(true);

  // Cache key for this specific campaign
  const cacheKey = `report_auth_${idOrSlug}`;
  const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  // Resolve slug to UUID on mount
  useEffect(() => {
    async function resolveCampaignId() {
      if (isUUID(idOrSlug)) {
        setCampaignId(idOrSlug);
      } else {
        // Fetch by slug to get UUID
        const { data, error } = await supabasePublic
          .from('campaigns')
          .select('id')
          .eq('slug', idOrSlug)
          .single();

        if (error || !data) {
          setError('Campaign not found');
          setLoadingClientEmail(false);
          return;
        }
        setCampaignId(data.id);
      }
    }
    resolveCampaignId();
  }, [idOrSlug]);

  useEffect(() => {
    if (campaignId) {
      fetchClientEmail();
    }
  }, [campaignId]);

  useEffect(() => {
    if (clientEmail) {
      checkCachedAuth();
    }
  }, [clientEmail]);

  useEffect(() => {
    if (isAuthenticated && campaignId) {
      fetchData();
    }
  }, [campaignId, isAuthenticated]);

  // Check if user is already authenticated via cache
  const checkCachedAuth = () => {
    if (!clientEmail) return;

    try {
      // First check for portal global auth (from client portal)
      const portalAuth = localStorage.getItem('portal_global_auth');
      if (portalAuth) {
        const { email: portalEmail, clientEmail: portalClientEmail, timestamp: portalTimestamp } = JSON.parse(portalAuth);
        const now = Date.now();

        // Check if portal auth is still valid and email matches
        if (now - portalTimestamp < CACHE_DURATION) {
          const portalEmailLower = portalEmail?.toLowerCase();
          const clientEmailLower = clientEmail.toLowerCase();
          const portalClientEmailLower = portalClientEmail?.toLowerCase();

          // If portal was authenticated with the same client email, auto-authenticate
          if (portalEmail && (portalEmailLower === clientEmailLower || portalClientEmailLower === clientEmailLower)) {
            setEmail(portalEmail);
            setIsAuthenticated(true);
            return;
          }
        }
      }

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
    if (!campaignId) return;
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
    if (!campaignId) return null;
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
      setEmailError('This email address is not authorized to access this report');
      return;
    }

    // Save authentication to cache and proceed
    saveAuthToCache(email, authorizedEmail);
    setIsAuthenticated(true);
  };

  async function fetchData() {
    if (!campaignId) return;
    try {
      setLoading(true);
      setError(null);

      // Fetch campaign
      const { data: campaignData, error: campaignError } = await supabasePublic
        .from('campaigns')
        .select(`*, clients!campaigns_client_id_fkey(name)`)
        .eq('id', campaignId)
        .single();

      if (campaignError) {
        console.error('Campaign fetch error:', campaignError);
        setError('Campaign not found');
        return;
      }

      if (!campaignData) {
        setError('Campaign not found');
        return;
      }

      // Check if report is publicly shared
      if (!campaignData.share_report_publicly) {
        setError('This campaign report is not publicly available');
        return;
      }

      const campaignWithClient = {
        ...campaignData,
        client_name: campaignData.clients?.name || null
      };

      setCampaign(campaignWithClient);

      // Fetch campaign KOLs
      const { data: kolsData } = await supabasePublic
        .from('campaign_kols')
        .select('id, master_kol:master_kol_id(name)')
        .eq('campaign_id', campaignId);

      if (kolsData) {
        const formattedKOLs = kolsData.map((kol: any) => ({
          id: kol.id,
          master_kol: {
            name: kol.master_kol?.name || 'Unknown'
          }
        }));
        setCampaignKOLs(formattedKOLs as CampaignKOL[]);
      }

      // Fetch contents
      const { data: contentsData } = await supabasePublic
        .from('contents')
        .select('id, campaign_kols_id, activation_date, impressions, likes, retweets, comments, bookmarks')
        .eq('campaign_id', campaignId);

      if (contentsData) {
        setContents(contentsData as ContentItem[]);
      }

      // Fetch public report files
      const { data: filesData } = await supabasePublic
        .from('campaign_report_files')
        .select('id, file_name, file_url, file_type, file_size, created_at')
        .eq('campaign_id', campaignId)
        .eq('is_public', true)
        .order('display_order', { ascending: true });

      if (filesData) {
        setReportFiles(filesData as ReportFile[]);
      }

      // Fetch custom message from campaign_reports
      const { data: reportData } = await supabasePublic
        .from('campaign_reports')
        .select('custom_message')
        .eq('campaign_id', campaignId)
        .single();

      if (reportData) {
        setCustomMessage(reportData.custom_message);
      }

    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError('Failed to load report data');
    } finally {
      setLoading(false);
    }
  }

  // Calculate performance metrics
  const totalImpressions = contents.reduce((sum, content) => sum + (content.impressions || 0), 0);
  const totalLikes = contents.reduce((sum, content) => sum + (content.likes || 0), 0);
  const totalComments = contents.reduce((sum, content) => sum + (content.comments || 0), 0);
  const totalRetweets = contents.reduce((sum, content) => sum + (content.retweets || 0), 0);
  const totalBookmarks = contents.reduce((sum, content) => sum + (content.bookmarks || 0), 0);
  const totalEngagement = totalLikes + totalComments + totalRetweets + totalBookmarks;
  const engagementRate = totalImpressions > 0 ? ((totalEngagement / totalImpressions) * 100).toFixed(2) : '0.00';

  // Per-KOL performance data
  const kolPerformance = campaignKOLs.map(kol => {
    const kolContents = contents.filter(c => c.campaign_kols_id === kol.id);
    const impressions = kolContents.reduce((sum, c) => sum + (c.impressions || 0), 0);
    const engagement = kolContents.reduce((sum, c) =>
      sum + (c.likes || 0) + (c.comments || 0) + (c.retweets || 0) + (c.bookmarks || 0), 0);
    return {
      name: kol.master_kol?.name || 'Unknown',
      impressions,
      engagement,
      contentCount: kolContents.length
    };
  }).filter(kol => kol.contentCount > 0);

  // Timeline data aggregated by activation date - CUMULATIVE
  const timelineDataRaw = contents
    .filter(c => c.activation_date)
    .reduce((acc: any[], content) => {
      const date = new Date(content.activation_date!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const existing = acc.find(item => item.date === date);
      if (existing) {
        existing.impressions += content.impressions || 0;
        existing.engagement += (content.likes || 0) + (content.comments || 0) + (content.retweets || 0) + (content.bookmarks || 0);
      } else {
        acc.push({
          date,
          impressions: content.impressions || 0,
          engagement: (content.likes || 0) + (content.comments || 0) + (content.retweets || 0) + (content.bookmarks || 0),
        });
      }
      return acc;
    }, [])
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Make cumulative
  let cumulativeImpressions = 0;
  let cumulativeEngagement = 0;
  const timelineData = timelineDataRaw.map(item => {
    cumulativeImpressions += item.impressions;
    cumulativeEngagement += item.engagement;
    return {
      date: item.date,
      impressions: cumulativeImpressions,
      engagement: cumulativeEngagement,
    };
  });

  // Show loading state
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

  // Show error state
  if (error && !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show email authentication gate
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-center mb-4">
              <div className="bg-[#3e8692] p-3 rounded-full">
                <FileText className="h-8 w-8 text-white" />
              </div>
            </div>
            <CardTitle className="text-2xl text-center">Campaign Report Access</CardTitle>
            <p className="text-sm text-gray-600 text-center">
              Enter your email address to view this campaign report
            </p>
          </CardHeader>
          <CardContent>
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
                Access Report
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show main loading state after authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#3e8692] mx-auto mb-4"></div>
          <p className="text-gray-600">Loading report...</p>
        </div>
      </div>
    );
  }

  // Show error if report not available
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show main report content
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
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <div className="bg-gray-100 p-2 rounded-lg">
              <FileText className="h-6 w-6 text-gray-600" />
            </div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-gray-900">{campaign?.name}</h2>
              <span className="text-2xl font-bold text-gray-900">Report</span>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadge(campaign?.status || '')}`}>
              {campaign?.status}
            </span>
          </div>
          <div>
            <Button
              onClick={() => window.open(`/public/campaigns/${idOrSlug}`, '_blank')}
              className="bg-[#3e8692] hover:bg-[#2d6570] text-white"
              size="sm"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View Campaign
            </Button>
          </div>
        </div>

        {/* Information Card */}
        {(campaign?.client_name || campaign?.description) && (
          <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
            <div className="space-y-3">
              {campaign?.client_name && (
                <div className="flex items-center text-sm text-gray-600">
                  <Building2 className="h-4 w-4 mr-2 text-gray-500" />
                  <span className="text-gray-700">{campaign.client_name}</span>
                </div>
              )}
              <div className="flex items-center text-sm text-gray-600">
                <CalendarIcon className="h-4 w-4 mr-2 text-gray-500" />
                <span className="text-gray-700">
                  {campaign?.start_date && formatDate(campaign.start_date)} - {campaign?.end_date && formatDate(campaign.end_date)}
                </span>
              </div>
              {campaign?.description && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-sm text-gray-700">{campaign.description}</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-6">
          {/* Custom Message */}
          {customMessage && (
            <div className="bg-white p-8 rounded-lg border shadow-sm">
              <h3 className="text-xl font-bold text-gray-900 mb-6">Message from Team</h3>
              <div
                className="prose prose-gray max-w-none text-gray-700
                  prose-headings:text-gray-900 prose-headings:font-semibold
                  prose-h2:mt-6 prose-h2:mb-3 first:prose-h2:mt-0
                  prose-h3:mt-5 prose-h3:mb-2
                  prose-p:my-3 prose-p:leading-relaxed
                  prose-ul:my-3 prose-ol:my-3
                  prose-li:my-1 prose-a:text-[#3e8692] prose-a:no-underline hover:prose-a:underline
                  prose-strong:font-semibold prose-em:italic
                  [&>h2:first-child]:mt-0"
                dangerouslySetInnerHTML={{ __html: customMessage }}
              />
            </div>
          )}

          {/* Performance Summary */}
          <div className="bg-white p-8 rounded-lg border shadow-sm">
            <div className="mb-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Performance Summary</h3>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              {/* Impressions Card */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl border border-blue-200 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <Eye className="h-5 w-5 text-blue-600" />
                </div>
                <p className="text-sm font-medium text-blue-700 mb-1">Total Impressions</p>
                <p className="text-3xl font-bold text-blue-900">{totalImpressions.toLocaleString()}</p>
              </div>

              {/* Engagement Card */}
              <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-xl border border-green-200 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <BarChart3 className="h-5 w-5 text-green-600" />
                </div>
                <p className="text-sm font-medium text-green-700 mb-1">Total Engagement</p>
                <p className="text-3xl font-bold text-green-900">{totalEngagement.toLocaleString()}</p>
              </div>

              {/* Engagement Rate Card */}
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-xl border border-purple-200 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <BarChart3 className="h-5 w-5 text-purple-600" />
                </div>
                <p className="text-sm font-medium text-purple-700 mb-1">Engagement Rate</p>
                <p className="text-3xl font-bold text-purple-900">{Number(engagementRate).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}%</p>
              </div>

              {/* Content Pieces Card */}
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-xl border border-orange-200 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <FileText className="h-5 w-5 text-orange-600" />
                </div>
                <p className="text-sm font-medium text-orange-700 mb-1">Content Pieces</p>
                <p className="text-3xl font-bold text-orange-900">{contents.length.toLocaleString()}</p>
              </div>
            </div>

            {/* Timeline Chart */}
            {timelineData.length > 0 && (
              <div className="mt-6">
                <h4 className="text-xl font-bold text-gray-900 mb-6">Performance Over Time</h4>
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timelineData} margin={{ top: 30, right: 40, left: 40, bottom: 30 }}>
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
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                        fontSize: '14px'
                      }}
                      formatter={(value: number) => [value.toLocaleString()]}
                    />
                    <Legend
                      wrapperStyle={{ paddingTop: '20px' }}
                      iconType="circle"
                    />
                    <Line
                      type="monotone"
                      dataKey="impressions"
                      stroke="#3b82f6"
                      strokeWidth={3}
                      dot={{ fill: '#3b82f6', r: 4 }}
                      activeDot={{ r: 6 }}
                      name="Impressions"
                    />
                    <Line
                      type="monotone"
                      dataKey="engagement"
                      stroke="#10b981"
                      strokeWidth={3}
                      dot={{ fill: '#10b981', r: 4 }}
                      activeDot={{ r: 6 }}
                      name="Engagement"
                    />
                  </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Per-KOL Performance */}
            {kolPerformance.length > 0 && (
              <div className="mt-6">
                <h4 className="text-xl font-bold text-gray-900 mb-6">Creator Performance</h4>
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={kolPerformance} margin={{ top: 30, right: 40, left: 40, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
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
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                        fontSize: '14px'
                      }}
                      formatter={(value: number) => [value.toLocaleString()]}
                    />
                    <Legend
                      wrapperStyle={{ paddingTop: '20px' }}
                      iconType="circle"
                    />
                    <Bar
                      dataKey="impressions"
                      name="Impressions"
                      fill="#3b82f6"
                      radius={[8, 8, 0, 0]}
                    />
                    <Bar
                      dataKey="engagement"
                      name="Engagement"
                      fill="#10b981"
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* Report Files */}
          {reportFiles.length > 0 && (
            <div className="bg-white p-8 rounded-lg border shadow-sm">
              <div className="mb-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Report Files</h3>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {reportFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-3xl">{getFileIcon(file.file_type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {file.file_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(file.file_size)} • {formatDate(file.created_at)}
                      </p>
                    </div>
                    <a
                      href={file.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[#3e8692] hover:bg-[#3e8692] hover:text-white border border-[#3e8692] rounded-lg transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      <span>View</span>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Calendly CTA Section */}
          <div className="bg-gradient-to-r from-[#3e8692] to-[#2d6570] p-8 rounded-lg border shadow-lg text-center">
            <h3 className="text-2xl font-bold text-white mb-4">Ready to Launch Your Next Campaign?</h3>
            <p className="text-white/90 mb-6 text-lg">
              Schedule a call with our team to discuss your influencer marketing needs
            </p>
            <div className="flex gap-4 justify-center flex-wrap">
              <a
                href="https://yano.holohive.io"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-white text-[#3e8692] font-semibold rounded-lg hover:bg-gray-100 transition-colors shadow-md"
              >
                Schedule with Yano
              </a>
              <a
                href="https://jdot.holohive.io"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-white text-[#3e8692] font-semibold rounded-lg hover:bg-gray-100 transition-colors shadow-md"
              >
                Schedule with Jdot
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
