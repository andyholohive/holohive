'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  EyeOff,
  Megaphone,
  StickyNote,
  Briefcase,
  Activity,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Link as LinkIcon,
  FolderOpen,
  Globe,
  Send,
  UserCheck,
  Hash,
  ClipboardList,
  Download,
  File,
  Image as ImageIcon,
  CheckCircle2,
  Circle,
  Lock,
  ArrowRight,
  AlertCircle,
  Bell,
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
  telegram_url: string | null;
  shared_drive_url: string | null;
  gtm_sync_url: string | null;
  onboarding_phase: string | null;
};

type CampaignDNAField = {
  label: string;
  answer: string;
  page_number: number;
};

type KolRosterEntry = {
  id: string;
  name: string;
  link: string | null;
  platform: string | null;
  tier: string | null;
  status: string;
  displayStatus: string;
  statusColor: string;
  contentLinks: string[];
  impressions: number;
  engagement: number;
  campaignName: string;
  campaignId: string;
};

type DecisionLogEntry = {
  id: string;
  decision_date: string;
  summary: string;
};

type FormSubmission = {
  id: string;
  formName: string;
  submittedAt: string;
  fields: { label: string; answer: string }[];
  attachments: { label: string; url: string; fileName: string }[];
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

const stripHtml = (html: string) => {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
};

const kolStatusMap: Record<string, { label: string; color: string }> = {
  'Curated': { label: 'Shortlisted', color: 'bg-gray-100 text-gray-700' },
  'Contacted': { label: 'Pitching', color: 'bg-blue-100 text-blue-700' },
  'Interested': { label: 'Negotiating', color: 'bg-yellow-100 text-yellow-700' },
  'Onboarded': { label: 'Content Creation', color: 'bg-purple-100 text-purple-700' },
  'Concluded': { label: 'Completed', color: 'bg-green-100 text-green-700' },
};

export default function ClientPortalPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const idOrSlug = params.id;

  // Auth states
  const [clientId, setClientId] = useState<string | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [clientEmail, setClientEmail] = useState<string | null>(null);
  const [approvedEmails, setApprovedEmails] = useState<string[]>([]);
  const [approvedDomains, setApprovedDomains] = useState<string[]>([]);
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
  const [hasOnboardingResponse, setHasOnboardingResponse] = useState<boolean | null>(null);
  const [onboardingFormSlug, setOnboardingFormSlug] = useState<string | null>(null);
  const [onboardingFormId, setOnboardingFormId] = useState<string | null>(null);
  const [campaignDNA, setCampaignDNA] = useState<CampaignDNAField[]>([]);
  const [kolRoster, setKolRoster] = useState<KolRosterEntry[]>([]);
  const [formSubmissions, setFormSubmissions] = useState<FormSubmission[]>([]);
  const [viewingSubmission, setViewingSubmission] = useState<FormSubmission | null>(null);
  const [earliestSubmissionDate, setEarliestSubmissionDate] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomePhase, setWelcomePhase] = useState<'enter' | 'ready' | 'opening' | 'done'>('enter');
  const [portalFadeIn, setPortalFadeIn] = useState(false);
  const [actionItems, setActionItems] = useState<{ id: string; text: string; court: string; phase: string; is_done: boolean; display_order: number; attachment_url: string | null; attachment_label: string | null; milestone_id: string | null }[]>([]);
  const [milestones, setMilestones] = useState<{ id: string; name: string; subtitle: string | null; status: string; status_message: string | null; display_order: number }[]>([]);
  const [expandedMilestoneId, setExpandedMilestoneId] = useState<string | null>(null);
  const [clientLinks, setClientLinks] = useState<{ id: string; name: string; url: string; description: string | null; link_types: string[] }[]>([]);
  const [recentActivities, setRecentActivities] = useState<{ id: string; activity_type: string; title: string; description: string | null; created_by_name: string | null; created_at: string; is_read: boolean }[]>([]);
  const [activityLimit, setActivityLimit] = useState(5);
  const [totalActivities, setTotalActivities] = useState(0);
  const [totalUnread, setTotalUnread] = useState(0);
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [mindshareEnabled, setMindshareEnabled] = useState(false);
  const [mindshareWeekly, setMindshareWeekly] = useState<{ week_number: number; week_start: string; mention_count: number; mindshare_pct: number }[]>([]);

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
            .select('id, name, email, slug, logo_url, approved_emails, approved_domains')
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
          setApprovedEmails(data.approved_emails || []);
          setApprovedDomains(data.approved_domains || []);
        } else {
          // Fetch by slug
          const { data, error } = await supabasePublic
            .from('clients')
            .select('id, name, email, slug, logo_url, approved_emails, approved_domains')
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
          setApprovedEmails(data.approved_emails || []);
          setApprovedDomains(data.approved_domains || []);
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
      fetchActionItems();
      fetchMilestones();
      fetchMindshare();
      fetchClientLinks();
      fetchRecentActivities();
      checkOnboardingStatus();
      fetchKolRoster();
      fetchFormSubmissions();
    }
  }, [clientId, isAuthenticated]);

  // Shared email authorization check (matches campaign page pattern)
  const isEmailAuthorized = (inputEmail: string): boolean => {
    if (!clientEmail) return false;
    const emailLower = inputEmail.toLowerCase();
    const clientEmailLower = clientEmail.toLowerCase();
    const inputDomain = emailLower.split('@')[1];
    const clientDomain = clientEmailLower.split('@')[1];

    const isClientEmail = emailLower === clientEmailLower;
    const isApprovedEmail = approvedEmails.some(e => e.toLowerCase() === emailLower);
    const isSameDomain = inputDomain === clientDomain;
    const isApprovedDomain = approvedDomains.some(d => inputDomain === d.toLowerCase());

    return isClientEmail || isApprovedEmail || isSameDomain || isApprovedDomain;
  };

  // Check if user is already authenticated via cache
  const checkCachedAuth = () => {
    if (!clientEmail) return;

    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { email: cachedEmail, timestamp } = JSON.parse(cached);
        const now = Date.now();

        if (now - timestamp < CACHE_DURATION) {
          if (cachedEmail && isEmailAuthorized(cachedEmail)) {
            setEmail(cachedEmail);
            setIsAuthenticated(true);
            setWelcomePhase('enter');
            setShowWelcome(true);
            requestAnimationFrame(() => {
              setTimeout(() => setWelcomePhase('ready'), 50);
            });
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

    if (!isEmailAuthorized(email)) {
      setEmailError('This email address is not authorized to access this portal');
      return;
    }

    saveAuthToCache(email);
    setIsAuthenticated(true);
    setWelcomePhase('enter');
    setShowWelcome(true);
    // Animate in after a brief frame
    requestAnimationFrame(() => {
      setTimeout(() => setWelcomePhase('ready'), 50);
    });
  };

  const handleWelcomeContinue = () => {
    setWelcomePhase('opening');
    // After doors fully open, switch to portal with teal overlay fade
    setTimeout(() => {
      setPortalFadeIn(true);
      setIsAuthenticated(true);
      setShowWelcome(false);
      // Remove overlay after fade completes
      setTimeout(() => setPortalFadeIn(false), 1000);
    }, 1200);
  };

  async function checkOnboardingStatus() {
    if (!clientId) return;
    try {
      // Find the onboarding form
      const { data: form } = await supabasePublic
        .from('forms')
        .select('id, slug')
        .eq('slug', 'holo-hive-onboarding')
        .eq('status', 'published')
        .single();

      if (!form) {
        setHasOnboardingResponse(true); // no form exists, hide banner
        return;
      }

      setOnboardingFormSlug(form.slug);
      setOnboardingFormId(form.id);

      // Check if this client has already submitted a response
      const { count } = await supabasePublic
        .from('form_responses')
        .select('id', { count: 'exact', head: true })
        .eq('form_id', form.id)
        .eq('client_id', clientId);

      const hasResponse = (count || 0) > 0;
      setHasOnboardingResponse(hasResponse);
      if (hasResponse) {
        fetchCampaignDNA(form.id);
        // Fetch earliest submission date for phase computation
        const { data: earliestResp } = await supabasePublic
          .from('form_responses')
          .select('submitted_at')
          .eq('form_id', form.id)
          .eq('client_id', clientId)
          .order('submitted_at', { ascending: true })
          .limit(1);
        if (earliestResp && earliestResp.length > 0) {
          setEarliestSubmissionDate(earliestResp[0].submitted_at);
        }
      }
    } catch (err) {
      console.error('Error checking onboarding status:', err);
      setHasOnboardingResponse(true); // hide banner on error
    }
  }

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
        .select('id, engagement_type, scope, start_date, milestones, client_contacts, holohive_contacts, telegram_url, shared_drive_url, gtm_sync_url, onboarding_phase')
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

  async function fetchActionItems() {
    if (!clientId) return;
    try {
      const { data } = await supabasePublic
        .from('client_action_items')
        .select('id, text, court, phase, is_done, display_order, attachment_url, attachment_label, milestone_id')
        .eq('client_id', clientId)
        .eq('is_hidden', false)
        .order('display_order', { ascending: true });
      setActionItems(data || []);
    } catch (err) {
      console.error('Error fetching action items:', err);
    }
  }

  async function fetchMilestones() {
    if (!clientId) return;
    try {
      const { data } = await supabasePublic
        .from('client_milestones')
        .select('id, name, subtitle, status, status_message, display_order, is_visible')
        .eq('client_id', clientId)
        .eq('is_visible', true)
        .order('display_order', { ascending: true });
      setMilestones(data || []);
      // Auto-expand the first active milestone
      const active = (data || []).find(m => m.status === 'active');
      if (active) setExpandedMilestoneId(active.id);
    } catch (err) {
      console.error('Error fetching milestones:', err);
    }
  }

  async function fetchMindshare() {
    if (!clientId) return;
    try {
      const { data: config } = await supabasePublic
        .from('client_mindshare_config')
        .select('is_enabled')
        .eq('client_id', clientId)
        .single();
      if (!config?.is_enabled) {
        setMindshareEnabled(false);
        return;
      }
      setMindshareEnabled(true);
      const { data: weekly } = await supabasePublic
        .from('client_mindshare_weekly')
        .select('week_number, week_start, mention_count, mindshare_pct')
        .eq('client_id', clientId)
        .order('week_number', { ascending: true });
      setMindshareWeekly(weekly || []);
    } catch (err) {
      console.error('Error fetching mindshare:', err);
    }
  }

  async function fetchRecentActivities(limit = 5) {
    if (!clientId) return;
    try {
      const [{ data }, { count }, { count: unreadCount }] = await Promise.all([
        supabasePublic
          .from('client_activity_log')
          .select('id, activity_type, title, description, created_by_name, created_at, is_read')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(limit),
        supabasePublic
          .from('client_activity_log')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', clientId),
        supabasePublic
          .from('client_activity_log')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', clientId)
          .eq('is_read', false),
      ]);
      setRecentActivities(data || []);
      setTotalActivities(count || 0);
      setTotalUnread(unreadCount || 0);
    } catch (err) {
      console.error('Error fetching activities:', err);
    }
  }

  async function fetchClientLinks() {
    if (!clientId) return;
    try {
      const { data } = await supabasePublic
        .from('links')
        .select('id, name, url, description, link_types')
        .eq('client_id', clientId)
        .eq('access', 'client')
        .eq('status', 'active')
        .order('name');
      setClientLinks(data || []);
    } catch (err) {
      console.error('Error fetching client links:', err);
    }
  }

  async function fetchCampaignDNA(formId: string) {
    if (!clientId) return;
    try {
      // Fetch form fields (exclude section/description types)
      const { data: fields } = await supabasePublic
        .from('form_fields')
        .select('id, label, field_type, page_number, display_order')
        .eq('form_id', formId)
        .not('field_type', 'in', '("section","description")')
        .order('page_number', { ascending: true })
        .order('display_order', { ascending: true });

      if (!fields || fields.length === 0) return;

      // Fetch the latest response for this client
      const { data: responses } = await supabasePublic
        .from('form_responses')
        .select('id, response_data')
        .eq('form_id', formId)
        .eq('client_id', clientId)
        .order('submitted_at', { ascending: false })
        .limit(1);

      if (!responses || responses.length === 0) return;

      const responseData = responses[0].response_data as Record<string, any>;
      const dnaFields: CampaignDNAField[] = [];

      for (const field of fields) {
        const answer = responseData[field.id];
        if (answer === undefined || answer === null || answer === '') continue;
        const answerStr = Array.isArray(answer) ? answer.join(', ') : String(answer);
        if (!answerStr.trim()) continue;
        dnaFields.push({
          label: stripHtml(field.label),
          answer: answerStr,
          page_number: field.page_number || 1,
        });
      }

      setCampaignDNA(dnaFields);
    } catch (err) {
      console.error('Error fetching campaign DNA:', err);
    }
  }

  async function fetchKolRoster() {
    if (!clientId) return;
    try {
      // Get campaign IDs for this client
      const { data: campaignsData } = await supabasePublic
        .from('campaigns')
        .select('id, name')
        .eq('client_id', clientId)
        .is('archived_at', null);

      if (!campaignsData || campaignsData.length === 0) return;

      const campaignMap = new Map(campaignsData.map(c => [c.id, c.name]));
      const campaignIds = campaignsData.map(c => c.id);

      // Fetch campaign_kols with nested data
      const { data: kolsData } = await supabasePublic
        .from('campaign_kols')
        .select(`
          id,
          campaign_id,
          status,
          hidden,
          master_kols(name, link, platform, tier),
          contents(content_link, impressions, likes, comments, retweets, bookmarks)
        `)
        .in('campaign_id', campaignIds)
        .or('hidden.is.null,hidden.eq.false');

      if (!kolsData) return;

      const roster: KolRosterEntry[] = kolsData.map((kol: any) => {
        const mk = kol.master_kols || {};
        const contents = kol.contents || [];
        const statusInfo = kolStatusMap[kol.status] || { label: kol.status, color: 'bg-gray-100 text-gray-700' };
        const impressions = contents.reduce((sum: number, c: any) => sum + (c.impressions || 0), 0);
        const engagement = contents.reduce((sum: number, c: any) =>
          sum + (c.likes || 0) + (c.comments || 0) + (c.retweets || 0) + (c.bookmarks || 0), 0);
        const contentLinks = contents.filter((c: any) => c.content_link).map((c: any) => c.content_link);

        return {
          id: kol.id,
          name: mk.name || 'Unknown',
          link: mk.link || null,
          platform: mk.platform || null,
          tier: mk.tier || null,
          status: kol.status,
          displayStatus: statusInfo.label,
          statusColor: statusInfo.color,
          contentLinks,
          impressions,
          engagement,
          campaignName: campaignMap.get(kol.campaign_id) || 'Unknown',
          campaignId: kol.campaign_id,
        };
      });

      setKolRoster(roster);
    } catch (err) {
      console.error('Error fetching KOL roster:', err);
    }
  }

  async function fetchFormSubmissions() {
    if (!clientId) return;
    try {
      const { data: responsesData } = await supabasePublic
        .from('form_responses')
        .select('id, form_id, response_data, submitted_at')
        .eq('client_id', clientId)
        .order('submitted_at', { ascending: false });

      if (!responsesData || responsesData.length === 0) return;

      const formIds = [...new Set(responsesData.map(r => r.form_id))];

      const [{ data: formsData }, { data: fieldsData }] = await Promise.all([
        supabasePublic
          .from('forms')
          .select('id, name')
          .in('id', formIds),
        supabasePublic
          .from('form_fields')
          .select('id, form_id, label, field_type, page_number, display_order')
          .in('form_id', formIds)
          .not('field_type', 'in', '("section","description")')
          .order('page_number', { ascending: true })
          .order('display_order', { ascending: true }),
      ]);

      const formNameMap = new Map((formsData || []).map(f => [f.id, f.name]));
      const fieldsByForm = new Map<string, typeof fieldsData>();
      for (const field of fieldsData || []) {
        const arr = fieldsByForm.get(field.form_id) || [];
        arr.push(field);
        fieldsByForm.set(field.form_id, arr);
      }

      const submissions: FormSubmission[] = responsesData.map(resp => {
        const rd = (resp.response_data || {}) as Record<string, any>;
        const fields = fieldsByForm.get(resp.form_id) || [];
        const qaPairs: { label: string; answer: string }[] = [];
        const attachments: { label: string; url: string; fileName: string }[] = [];

        for (const field of fields) {
          const answer = rd[field.id];
          if (answer === undefined || answer === null || answer === '') continue;
          const answerStr = Array.isArray(answer) ? answer.join(', ') : String(answer);
          if (!answerStr.trim()) continue;
          qaPairs.push({ label: stripHtml(field.label), answer: answerStr });
        }

        // Extract attachments
        for (const key of Object.keys(rd)) {
          if (key.endsWith('_attachments') && Array.isArray(rd[key])) {
            const fieldId = key.replace('_attachments', '');
            const field = fields.find(f => f.id === fieldId);
            const label = field ? stripHtml(field.label) : 'Attachment';
            for (const url of rd[key]) {
              if (typeof url === 'string' && url.trim()) {
                const fileName = decodeURIComponent(url.split('/').pop() || 'file');
                attachments.push({ label, url, fileName });
              }
            }
          }
        }

        return {
          id: resp.id,
          formName: formNameMap.get(resp.form_id) || 'Form',
          submittedAt: resp.submitted_at,
          fields: qaPairs,
          attachments,
        };
      });

      setFormSubmissions(submissions);
    } catch (err) {
      console.error('Error fetching form submissions:', err);
    }
  }

  // Collect all form attachments for resource vault
  const formAttachments = formSubmissions.flatMap(s => s.attachments);

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

  // Milestone-driven progress
  const completedMilestones = milestones.filter(m => m.status === 'complete').length;
  const activeMilestone = milestones.find(m => m.status === 'active');
  const portalPhase: 'kickoff' | 'discovery' | 'tracker' = activeMilestone ? 'discovery' : completedMilestones === milestones.length && milestones.length > 0 ? 'tracker' : 'kickoff';

  // KOL live status metrics
  const kolsSecured = kolRoster.filter(k => k.status === 'Onboarded' || k.status === 'Concluded').length;
  const contentLive = kolRoster.filter(k => k.contentLinks.length > 0).length;

  // Welcome subtitle
  const welcomeSubtitle = activeMilestone
    ? `Current milestone: ${activeMilestone.name}`
    : completedMilestones === milestones.length && milestones.length > 0
    ? "All milestones complete. Your campaign is live."
    : "Let's get started — complete the steps below to kick off your campaign.";

  // Loading state
  if (loadingClientEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(160deg, #0c2d33 0%, #1a4a52 35%, #3e8692 70%, #5ba3ad 100%)' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-white/80 mx-auto mb-4"></div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !clientEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(160deg, #0c2d33 0%, #1a4a52 35%, #3e8692 70%, #5ba3ad 100%)' }}>
        <div className="max-w-md w-full mx-4 text-center p-10 rounded-2xl" style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)' }}>
          <Building2 className="h-12 w-12 mx-auto mb-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
          <h2 className="text-xl font-semibold text-white mb-2">Portal Not Found</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>{error}</p>
        </div>
      </div>
    );
  }

  // Welcome transition screen
  if (showWelcome) {
    const isVisible = welcomePhase === 'ready';
    const isLeaving = welcomePhase === 'opening' || welcomePhase === 'done';

    return (
      <div className="min-h-screen flex items-center justify-center overflow-hidden relative" style={{ background: 'linear-gradient(160deg, #0c2d33 0%, #1a4a52 35%, #3e8692 70%, #5ba3ad 100%)' }}>
        {/* Animated glow orbs */}
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute rounded-full"
            style={{
              width: '800px', height: '800px',
              background: 'radial-gradient(circle, rgba(91,163,173,0.3) 0%, transparent 60%)',
              top: '-200px', right: '-200px',
              animation: 'pulse 4s ease-in-out infinite',
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              width: '600px', height: '600px',
              background: 'radial-gradient(circle, rgba(62,134,146,0.25) 0%, transparent 60%)',
              bottom: '-150px', left: '-150px',
              animation: 'pulse 5s ease-in-out infinite 1s',
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              width: '300px', height: '300px',
              background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 60%)',
              top: '40%', left: '50%',
              transform: 'translate(-50%, -50%)',
              animation: 'pulse 3s ease-in-out infinite 0.5s',
            }}
          />
          {/* Subtle grid pattern overlay */}
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }} />
        </div>

        {/* Door panels */}
        <div className="absolute inset-0 flex z-10 pointer-events-none">
          <div
            className="h-full"
            style={{
              width: '50%',
              background: 'linear-gradient(160deg, #0c2d33 0%, #1a4a52 35%, #3e8692 70%, #5ba3ad 100%)',
              transform: isLeaving ? 'translateX(-105%)' : 'translateX(0)',
              transition: 'transform 1.2s cubic-bezier(0.77, 0, 0.175, 1)',
              boxShadow: isLeaving ? '4px 0 30px rgba(0,0,0,0.2)' : 'none',
            }}
          />
          <div
            className="h-full"
            style={{
              width: '50%',
              background: 'linear-gradient(200deg, #0c2d33 0%, #1a4a52 35%, #3e8692 70%, #5ba3ad 100%)',
              transform: isLeaving ? 'translateX(105%)' : 'translateX(0)',
              transition: 'transform 1.2s cubic-bezier(0.77, 0, 0.175, 1)',
              boxShadow: isLeaving ? '-4px 0 30px rgba(0,0,0,0.2)' : 'none',
            }}
          />
        </div>

        {/* Subtle horizontal shimmer line */}
        <div
          className="absolute z-10"
          style={{
            top: '50%',
            left: 0,
            right: 0,
            height: '1px',
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 20%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 80%, transparent 100%)',
            opacity: isVisible ? 1 : 0,
            transition: 'opacity 1.5s ease-out 0.3s',
          }}
        />

        {/* Welcome content */}
        <div
          className="relative z-20 text-center px-6"
          style={{
            opacity: isLeaving ? 0 : isVisible ? 1 : 0,
            transform: isLeaving ? 'scale(0.9)' : isVisible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(20px)',
            transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Frosted glass card */}
          <div
            className="rounded-3xl px-16 py-14 mx-auto max-w-md"
            style={{
              background: 'rgba(255,255,255,0.04)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            }}
          >
            {/* Greeting text */}
            <div
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(15px)',
                transition: 'all 0.7s ease-out 0.15s',
              }}
            >
              <p className="text-xs font-medium uppercase tracking-[0.35em] mb-8" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Welcome back
              </p>
            </div>

            {/* Client logo or Holo Hive logo */}
            <div
              className="mb-5 flex justify-center"
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0) scale(1)' : 'translateY(15px) scale(0.9)',
                transition: 'all 0.7s ease-out 0.25s',
              }}
            >
              {client?.logo_url ? (
                <div className="relative">
                  <div
                    className="absolute -inset-1 rounded-2xl"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))',
                      filter: 'blur(1px)',
                    }}
                  />
                  <img
                    src={client.logo_url}
                    alt={client.name}
                    className="relative h-20 w-20 object-cover rounded-2xl"
                    style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}
                  />
                </div>
              ) : (
                <Image
                  src="/images/logo.png"
                  alt="Holo Hive"
                  width={180}
                  height={60}
                  className="h-14 w-auto"
                  style={{ filter: 'brightness(0) invert(1)', opacity: 0.9 }}
                />
              )}
            </div>

            {/* Client name */}
            <div
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(15px)',
                transition: 'all 0.7s ease-out 0.35s',
              }}
            >
              <h1 className="text-4xl sm:text-5xl font-bold text-white mb-10" style={{ textShadow: '0 2px 20px rgba(0,0,0,0.15)', letterSpacing: '-0.02em' }}>
                {client?.name}
              </h1>
            </div>

            {/* Divider */}
            <div
              className="mx-auto mb-10"
              style={{
                width: '40px',
                height: '1px',
                background: 'rgba(255,255,255,0.2)',
                opacity: isVisible ? 1 : 0,
                transition: 'opacity 0.7s ease-out 0.4s',
              }}
            />

            {/* Enter button */}
            <div
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(15px)',
                transition: 'all 0.7s ease-out 0.5s',
              }}
            >
              <button
                onClick={handleWelcomeContinue}
                className="group inline-flex items-center gap-3 text-lg font-medium text-white/80 transition-all duration-300 hover:text-white active:scale-95"
              >
                Enter Portal
                <svg className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1.5 opacity-60 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
                </svg>
              </button>
            </div>
          </div>

          {/* Powered by */}
          <div
            className="mt-8"
            style={{
              opacity: isVisible ? 1 : 0,
              transition: 'opacity 1s ease-out 0.8s',
            }}
          >
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
              Powered by Holo Hive
            </p>
          </div>
        </div>

        <style jsx>{`
          @keyframes pulse {
            0%, 100% { opacity: 0.5; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.05); }
          }
        `}</style>
      </div>
    );
  }

  // Email authentication gate
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(160deg, #0c2d33 0%, #1a4a52 35%, #3e8692 70%, #5ba3ad 100%)' }}>
        {/* Background orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute rounded-full" style={{ width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(91,163,173,0.2) 0%, transparent 60%)', top: '-100px', right: '-100px' }} />
          <div className="absolute rounded-full" style={{ width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(62,134,146,0.15) 0%, transparent 60%)', bottom: '-80px', left: '-80px' }} />
        </div>

        <div className="relative z-10 max-w-md w-full">
          {/* Logo area */}
          <div className="text-center mb-8">
            {client?.logo_url ? (
              <img
                src={client.logo_url}
                alt={client.name}
                className="h-16 w-16 object-cover rounded-2xl shadow-lg mx-auto mb-4"
              />
            ) : (
              <Image
                src="/images/logo.png"
                alt="Holo Hive"
                width={140}
                height={46}
                className="h-12 w-auto mx-auto mb-4"
                style={{ filter: 'brightness(0) invert(1)', opacity: 0.9 }}
              />
            )}
            <h1 className="text-2xl font-bold text-white mb-1">
              {client?.name ? `${client.name} Portal` : 'Client Portal'}
            </h1>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Enter your email to access your dashboard
            </p>
          </div>

          {/* Login card */}
          <div className="rounded-2xl p-8" style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <form onSubmit={handleEmailSubmit} className="space-y-5">
              <div>
                <input
                  type="email"
                  placeholder="your.email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl text-white placeholder-white/30 outline-none transition-all duration-200 focus:ring-2 focus:ring-white/30"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                />
                {emailError && (
                  <p className="text-sm mt-2" style={{ color: '#f87171' }}>{emailError}</p>
                )}
              </div>
              <button
                type="submit"
                className="w-full py-3 px-6 rounded-xl font-semibold text-white transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.1) 100%)', border: '1px solid rgba(255,255,255,0.2)', boxShadow: '0 2px 20px rgba(0,0,0,0.1)' }}
              >
                Access Portal
              </button>
            </form>
          </div>

          {/* Powered by */}
          <div className="text-center mt-6">
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Powered by</span>
              <Image
                src="/images/logo.png"
                alt="Holo Hive"
                width={60}
                height={20}
                className="h-4 w-auto"
                style={{ filter: 'brightness(0) invert(1)', opacity: 0.3 }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main portal content
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100">
      {/* Teal-to-portal transition overlay */}
      {portalFadeIn && (
        <div
          className="fixed inset-0 z-[100] pointer-events-none"
          style={{
            background: 'linear-gradient(160deg, #0c2d33 0%, #1a4a52 35%, #3e8692 70%, #5ba3ad 100%)',
            animation: 'portalOverlayFade 1s ease-out forwards',
          }}
        />
      )}
      <style>{`
        @keyframes portalOverlayFade {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(62,134,146,0.2); }
          50% { box-shadow: 0 0 0 8px rgba(62,134,146,0.1); }
        }
      `}</style>
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
            {welcomeSubtitle}
          </p>
        </div>

        {/* Onboarding Banner — only in kickoff phase */}
        {portalPhase === 'kickoff' && hasOnboardingResponse === false && onboardingFormSlug && (
          <Card className="border-0 shadow-lg rounded-xl overflow-hidden mb-10 bg-gradient-to-r from-[#3e8692]/10 to-[#3e8692]/5">
            <CardContent className="flex items-center justify-between py-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-[#3e8692] to-[#2d6570] rounded-xl shadow-lg">
                  <FileText className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Complete Your Onboarding</h3>
                  <p className="text-sm text-gray-600">Help us get started by filling out your onboarding form.</p>
                </div>
              </div>
              <Button
                onClick={() => {
                  window.open(`${window.location.origin}/public/forms/${onboardingFormSlug}?client=${clientId}`, '_blank');
                }}
                className="bg-[#3e8692] hover:bg-[#2d6570] text-white px-6"
              >
                Fill Out Form
                <ExternalLink className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Campaign Onboarding Milestones */}
        {milestones.length > 0 && (
          <Card id="section-milestones" className="border-0 shadow-lg rounded-xl overflow-hidden mb-10">
            <CardContent className="p-6 sm:p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-[#3e8692] to-[#2d6570] rounded-xl shadow-lg">
                    <Activity className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Campaign Onboarding</h3>
                </div>
                <div className="text-right">
                  {activeMilestone && <p className="text-sm font-semibold text-gray-900">{activeMilestone.name}</p>}
                  <p className="text-xs text-gray-500">{completedMilestones} of {milestones.length} milestones complete</p>
                </div>
              </div>

              {/* Progress bar with dots */}
              <div className="relative mb-6 flex items-center" style={{ height: '20px' }}>
                {/* Bar */}
                <div className="absolute left-0 right-0 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${milestones.length > 1 ? (completedMilestones / (milestones.length - 1)) * 100 : 0}%`, backgroundColor: '#3e8692' }} />
                </div>
                {/* Dots */}
                <div className="relative w-full flex justify-between">
                  {milestones.map((ms) => {
                    const isComplete = ms.status === 'complete';
                    const isActive = ms.status === 'active';
                    return (
                      <div key={ms.id} className="flex items-center justify-center">
                        {isActive ? (
                          <div className="relative flex items-center justify-center">
                            <div className="absolute w-6 h-6 rounded-full bg-[#3e8692]/20 animate-ping" style={{ animationDuration: '2s' }} />
                            <div className="absolute w-5 h-5 rounded-full bg-[#3e8692]/10 animate-pulse" />
                            <div className="relative w-4 h-4 rounded-full border-[3px] border-[#3e8692] bg-white" />
                          </div>
                        ) : (
                          <div className={`rounded-full ${isComplete ? 'w-3 h-3 bg-[#3e8692]' : 'w-3 h-3 bg-gray-300'}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Milestone cards */}
              <div className="space-y-3">
                {milestones.map((ms) => {
                  const msItems = actionItems.filter(i => i.milestone_id === ms.id);
                  const yoursItems = msItems.filter(i => i.court === 'yours').sort((a, b) => a.display_order - b.display_order);
                  const oursItems = msItems.filter(i => i.court === 'ours').sort((a, b) => a.display_order - b.display_order);
                  const isExpanded = expandedMilestoneId === ms.id;
                  const isComplete = ms.status === 'complete';
                  const isActive = ms.status === 'active';
                  const isUpcoming = ms.status === 'upcoming';

                  return (
                    <div
                      key={ms.id}
                      className={`rounded-xl border transition-all ${isActive ? 'border-gray-300 bg-white shadow-md' : isComplete ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'}`}
                    >
                      {/* Header */}
                      <div
                        className="flex items-center gap-3 px-5 py-4 cursor-pointer"
                        onClick={() => setExpandedMilestoneId(isExpanded ? null : ms.id)}
                      >
                        {isComplete ? (
                          <div className="w-8 h-8 rounded-full bg-[#3e8692] flex items-center justify-center flex-shrink-0">
                            <CheckCircle2 className="h-5 w-5 text-white" />
                          </div>
                        ) : isActive ? (
                          <div className="w-8 h-8 rounded-full bg-[#3e8692]/10 border-2 border-[#3e8692] flex items-center justify-center flex-shrink-0">
                            <div className="w-3 h-3 rounded-full bg-[#3e8692]" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <Lock className="h-4 w-4 text-gray-300" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold ${isUpcoming ? 'text-gray-400' : 'text-gray-900'}`}>{ms.name}</p>
                          {ms.subtitle && <p className={`text-sm ${isUpcoming ? 'text-gray-300' : 'text-gray-500'}`}>{ms.subtitle}</p>}
                        </div>
                        <span className={`text-xs font-medium px-3 py-1 rounded-full ${isComplete ? 'bg-[#3e8692]/10 text-[#3e8692]' : isActive ? 'bg-orange-100 text-orange-700' : 'text-gray-400'}`}>
                          {isComplete ? 'Complete' : isActive ? 'Action needed' : 'Upcoming'}
                        </span>
                        {isUpcoming ? null : isExpanded ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
                      </div>

                      {/* Expanded content */}
                      {isExpanded && !isUpcoming && (
                        <div className="px-5 pb-5 space-y-4 border-t border-gray-100">
                          {/* Two-column action items */}
                          {(oursItems.length > 0 || yoursItems.length > 0) && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-2 h-2 rounded-full bg-[#3e8692]" />
                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Holo Hive</p>
                                </div>
                                <div className="space-y-2">
                                  {oursItems.map(item => (
                                    <div key={item.id} className="flex items-start gap-2.5">
                                      <div className="w-1.5 h-1.5 rounded-full bg-[#3e8692] flex-shrink-0 mt-[7px]" />
                                      <span className={`text-sm leading-5 ${item.is_done ? 'line-through text-gray-400' : 'text-gray-700'}`}>{item.text}</span>
                                    </div>
                                  ))}
                                  {oursItems.length === 0 && <p className="text-xs text-gray-400">No items</p>}
                                </div>
                              </div>
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-2 h-2 rounded-full bg-orange-500" />
                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Your Tasks</p>
                                </div>
                                <div className="space-y-2">
                                  {yoursItems.map(item => (
                                    <div key={item.id} className="flex items-start gap-2.5">
                                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0 mt-[7px]" />
                                      <div>
                                        <span className={`text-sm ${item.is_done ? 'line-through text-gray-400' : 'text-gray-700'}`}>{item.text}</span>
                                        {item.attachment_url && (
                                          <a href={item.attachment_url} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-xs text-[#3e8692] hover:underline">
                                            <ExternalLink className="h-3 w-3" />
                                            {item.attachment_label || 'View'}
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                  {yoursItems.length === 0 && <p className="text-xs text-gray-400">No items</p>}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Status message banner */}
                          {ms.status_message && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-3">
                              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                              <p className="text-sm text-amber-800">{ms.status_message}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
        {/* Milestone-based progress is rendered above */}

        {/* Recent Activities — rendered in floating button modal */}

        {/* Korean Mindshare Tracker */}
        {mindshareEnabled && (
          <Card className="border-0 shadow-lg rounded-xl overflow-hidden mb-10">
            <CardContent className="p-6 sm:p-8 space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-[#3e8692] to-[#2d6570] rounded-xl shadow-lg">
                  <BarChart3 className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Korean Mindshare Tracker</h3>
              </div>
              {/* Stats row */}
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Current mindshare</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {mindshareWeekly.length > 0 ? `${mindshareWeekly[mindshareWeekly.length - 1].mindshare_pct}%` : '0%'}
                  </p>
                  <p className="text-xs text-gray-400">vs. benchmark</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Telegram mentions</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {mindshareWeekly.length > 0 ? mindshareWeekly[mindshareWeekly.length - 1].mention_count : 0}
                  </p>
                  <p className="text-xs text-gray-400">this week</p>
                </div>
              </div>

              {/* Mindshare growth vs benchmark */}
              <div className="border border-gray-100 rounded-xl p-5">
                <h4 className="text-sm font-bold text-gray-900 mb-0.5">Mindshare growth vs. benchmark</h4>
                <p className="text-xs text-gray-500 mb-4">% of benchmark penetration · weekly</p>

                {/* Donut + description */}
                {mindshareWeekly.length > 0 && (
                  <div className="flex items-center gap-5 mb-5">
                    <div className="relative w-16 h-16 flex-shrink-0">
                      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                        <circle cx="18" cy="18" r="14" fill="none" stroke="#e5e7eb" strokeWidth="3.5" />
                        <circle cx="18" cy="18" r="14" fill="none" stroke="#3e8692" strokeWidth="3.5"
                          strokeDasharray={`${mindshareWeekly[mindshareWeekly.length - 1].mindshare_pct * 0.88} 88`}
                          strokeLinecap="round" />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-bold text-gray-900">{mindshareWeekly[mindshareWeekly.length - 1].mindshare_pct}%</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{client?.name} — early signal</p>
                      <p className="text-xs text-gray-500 mt-0.5">Mentions beginning to register across tracked Korean Telegram channels. Benchmark reflects a well-penetrated project at full market saturation.</p>
                    </div>
                  </div>
                )}

                {/* Legend */}
                <div className="flex items-center gap-4 text-xs text-gray-500 mb-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-[#3e8692]" />
                    <span>{client?.name || 'Client'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-gray-300" />
                    <span>Benchmark (100%)</span>
                  </div>
                </div>

                {/* Chart */}
                <div className="relative h-40 border-l border-b border-gray-200">
                  {[100, 80, 60, 40, 20, 0].map((val) => (
                    <div key={val} className="absolute left-0 flex items-center" style={{ bottom: `${(val / 110) * 100}%` }}>
                      <span className="text-[10px] text-gray-400 w-8 text-right pr-2">{val}%</span>
                      {val === 100 && <div className="absolute left-8 right-0 border-t border-dashed border-gray-300" style={{ width: 'calc(100% - 2rem)' }} />}
                    </div>
                  ))}
                  <div className="absolute left-10 right-0 bottom-0 h-full flex items-end gap-1">
                    {Array.from({ length: 8 }, (_, i) => {
                      const week = mindshareWeekly.find(w => w.week_number === i + 1);
                      const pct = week ? week.mindshare_pct : 0;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                          {pct > 0 && (
                            <div className="w-full max-w-[24px] bg-[#3e8692] rounded-t-sm transition-all duration-500" style={{ height: `${(pct / 110) * 100}%` }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex ml-10 mt-1">
                  {Array.from({ length: 8 }, (_, i) => (
                    <div key={i} className="flex-1 text-center">
                      <span className="text-[10px] text-gray-400">W{i + 1}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Weekly mention volume */}
              <div className="border border-gray-100 rounded-xl p-5">
                <h4 className="text-sm font-bold text-gray-900 mb-0.5">Weekly mention volume</h4>
                <p className="text-xs text-gray-500 mb-4">Telegram scans across Korean regional channels</p>

                <div className="relative h-32 border-l border-b border-gray-200">
                  {(() => {
                    const maxMentions = Math.max(15, ...mindshareWeekly.map(w => w.mention_count));
                    const step = Math.ceil(maxMentions / 3);
                    const ticks = [0, step, step * 2, step * 3];
                    return ticks.map(val => (
                      <div key={val} className="absolute left-0 flex items-center" style={{ bottom: `${(val / (step * 3)) * 100}%` }}>
                        <span className="text-[10px] text-gray-400 w-6 text-right pr-1.5">{val}</span>
                      </div>
                    ));
                  })()}
                  <div className="absolute left-8 right-0 bottom-0 h-full flex items-end gap-1">
                    {Array.from({ length: 8 }, (_, i) => {
                      const week = mindshareWeekly.find(w => w.week_number === i + 1);
                      const count = week ? week.mention_count : 0;
                      const maxMentions = Math.max(15, ...mindshareWeekly.map(w => w.mention_count));
                      const barHeight = maxMentions > 0 ? (count / maxMentions) * 100 : 0;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                          {count > 0 && (
                            <div className="w-full max-w-[24px] bg-[#3e8692] rounded-t-sm transition-all duration-500" style={{ height: `${barHeight}%` }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex ml-8 mt-1">
                  {Array.from({ length: 8 }, (_, i) => (
                    <div key={i} className="flex-1 text-center">
                      <span className="text-[10px] text-gray-400">W{i + 1}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Client Context Section — hidden when mindshare tracker is disabled */}
        {mindshareEnabled && (clientContext || linkedCRMAccount) && (
          <Card className="border-0 shadow-lg rounded-xl overflow-hidden mb-10">
            <CardContent className="p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-gradient-to-br from-[#3e8692] to-[#2d6570] rounded-xl shadow-lg">
                  <Briefcase className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Engagement Overview</h3>
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

        {/* Stats Cards — discovery & tracker only */}
        {portalPhase !== 'kickoff' && <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-10">
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

          {/* Live KOL Status Metrics — shown in discovery/tracker when KOLs exist */}
          {portalPhase !== 'kickoff' && kolRoster.length > 0 && (
            <>
              <Card className="group relative hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border-0 shadow-md overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                <CardContent className="pt-6 pb-5 relative">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-1">KOLs Secured</p>
                      <p className="text-3xl font-bold text-gray-900">{kolsSecured}<span className="text-lg text-gray-400 font-normal">/{kolRoster.length}</span></p>
                    </div>
                    <div className="p-3 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg">
                      <UserCheck className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="group relative hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border-0 shadow-md overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-orange-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                <CardContent className="pt-6 pb-5 relative">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-1">Content Live</p>
                      <p className="text-3xl font-bold text-gray-900">{contentLive}</p>
                    </div>
                    <div className="p-3 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg">
                      <Eye className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>}

        {/* Weekly Status Section — discovery & tracker only */}
        {portalPhase !== 'kickoff' && weeklyUpdates.length > 0 && (
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

        {/* Form Submissions & Resources Row — discovery & tracker only */}
        {portalPhase !== 'kickoff' && (formSubmissions.length > 0 || (clientContext && (clientContext.telegram_url || clientContext.shared_drive_url || clientContext.gtm_sync_url)) || clientLinks.length > 0 || formAttachments.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
            {/* Form Submissions */}
            {formSubmissions.length > 0 && (
              <Card className="border-0 shadow-lg rounded-xl overflow-hidden h-full">
                <CardHeader className="bg-white border-b border-gray-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg">
                      <ClipboardList className="h-5 w-5 text-white" />
                    </div>
                    <CardTitle className="text-xl font-bold text-gray-900">Form Submissions</CardTitle>
                    <span className="text-sm text-gray-500">({formSubmissions.length})</span>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Submitted Forms</h4>
                  <div className="space-y-3">
                    {formSubmissions.map((sub) => (
                      <div
                        key={sub.id}
                        onClick={() => setViewingSubmission(sub)}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-orange-50 border border-gray-100 hover:border-orange-200 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-orange-500" />
                          <div>
                            <p className="text-sm font-semibold text-gray-900 group-hover:text-orange-700">{sub.formName}</p>
                            <p className="text-xs text-gray-500">
                              {new Date(sub.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          </div>
                        </div>
                        {sub.attachments.length > 0 && (
                          <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700">
                            {sub.attachments.length} {sub.attachments.length === 1 ? 'file' : 'files'}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Resources */}
            {((clientContext && (clientContext.telegram_url || clientContext.shared_drive_url || clientContext.gtm_sync_url)) || clientLinks.length > 0 || formAttachments.length > 0) && (
              <Card id="section-resources" className="border-0 shadow-lg rounded-xl overflow-hidden h-full">
                <CardHeader className="bg-white border-b border-gray-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-[#3e8692] to-[#2d6570] rounded-xl shadow-lg">
                      <LinkIcon className="h-5 w-5 text-white" />
                    </div>
                    <CardTitle className="text-xl font-bold text-gray-900">Resources</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  {clientContext && (clientContext.telegram_url || clientContext.shared_drive_url || clientContext.gtm_sync_url) && (
                    <div className="space-y-3">
                      {clientContext.telegram_url && (
                        <a
                          href={clientContext.telegram_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-[#3e8692]/5 hover:border-[#3e8692]/20 border border-gray-100 transition-all group"
                        >
                          <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                            <Send className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900 group-hover:text-[#3e8692]">Telegram Group</p>
                            <p className="text-xs text-gray-500">Open chat</p>
                          </div>
                          <ExternalLink className="h-4 w-4 text-gray-400 ml-auto group-hover:text-[#3e8692]" />
                        </a>
                      )}
                      {clientContext.shared_drive_url && (
                        <a
                          href={clientContext.shared_drive_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-[#3e8692]/5 hover:border-[#3e8692]/20 border border-gray-100 transition-all group"
                        >
                          <div className="p-2 bg-green-100 rounded-lg group-hover:bg-green-200 transition-colors">
                            <FolderOpen className="h-5 w-5 text-green-600" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900 group-hover:text-[#3e8692]">Shared Drive</p>
                            <p className="text-xs text-gray-500">View files</p>
                          </div>
                          <ExternalLink className="h-4 w-4 text-gray-400 ml-auto group-hover:text-[#3e8692]" />
                        </a>
                      )}
                      {clientContext.gtm_sync_url && (
                        <a
                          href={clientContext.gtm_sync_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-[#3e8692]/5 hover:border-[#3e8692]/20 border border-gray-100 transition-all group"
                        >
                          <div className="p-2 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition-colors">
                            <Globe className="h-5 w-5 text-purple-600" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900 group-hover:text-[#3e8692]">GTM Sync / Tracker</p>
                            <p className="text-xs text-gray-500">Open tracker</p>
                          </div>
                          <ExternalLink className="h-4 w-4 text-gray-400 ml-auto group-hover:text-[#3e8692]" />
                        </a>
                      )}
                    </div>
                  )}
                  {clientLinks.length > 0 && (
                    <div className={clientContext && (clientContext.telegram_url || clientContext.shared_drive_url || clientContext.gtm_sync_url) ? 'mt-4 space-y-3' : 'space-y-3'}>
                      {clientLinks.map(link => (
                        <a
                          key={link.id}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-[#3e8692]/5 hover:border-[#3e8692]/20 border border-gray-100 transition-all group"
                        >
                          <div className="p-2 bg-[#e8f4f5] rounded-lg group-hover:bg-[#d4edef] transition-colors">
                            <LinkIcon className="h-5 w-5 text-[#3e8692]" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900 group-hover:text-[#3e8692]">{link.name}</p>
                            {link.description && <p className="text-xs text-gray-500">{link.description}</p>}
                          </div>
                          <ExternalLink className="h-4 w-4 text-gray-400 ml-auto group-hover:text-[#3e8692]" />
                        </a>
                      ))}
                    </div>
                  )}
                  {formAttachments.length > 0 && (
                    <div className={(clientContext && (clientContext.telegram_url || clientContext.shared_drive_url || clientContext.gtm_sync_url)) || clientLinks.length > 0 ? 'mt-6 pt-6 border-t border-gray-100' : ''}>
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Uploaded Files</h4>
                      <div className="space-y-3">
                        {formAttachments.map((att, i) => {
                          const ext = att.fileName.split('.').pop()?.toLowerCase() || '';
                          const isPdf = ext === 'pdf';
                          const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
                          const isDoc = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext);
                          const iconColor = isPdf ? 'text-red-500 bg-red-100' : isImage ? 'text-blue-500 bg-blue-100' : isDoc ? 'text-indigo-500 bg-indigo-100' : 'text-gray-500 bg-gray-100';
                          return (
                            <a
                              key={i}
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 border border-gray-100 transition-all group"
                            >
                              <div className={`p-2 rounded-lg ${iconColor}`}>
                                {isImage ? <ImageIcon className="h-4 w-4" /> : <File className="h-4 w-4" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-800 truncate">{att.fileName}</p>
                                <p className="text-xs text-gray-400">{att.label}</p>
                              </div>
                              <ExternalLink className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Form Submission Detail Dialog */}
        <Dialog open={!!viewingSubmission} onOpenChange={() => setViewingSubmission(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-gray-900">
                {viewingSubmission?.formName}
              </DialogTitle>
              <p className="text-sm text-gray-500">
                Submitted {viewingSubmission && new Date(viewingSubmission.submittedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </DialogHeader>
            {viewingSubmission && (
              <div className="space-y-6 mt-4">
                <div className="space-y-3">
                  {viewingSubmission.fields.map((f, i) => (
                    <div key={i} className="border-l-4 border-l-orange-300 pl-4 py-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{f.label}</p>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{f.answer}</p>
                    </div>
                  ))}
                </div>
                {viewingSubmission.attachments.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Attachments</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {viewingSubmission.attachments.map((att, i) => {
                        const ext = att.fileName.split('.').pop()?.toLowerCase() || '';
                        const isPdf = ext === 'pdf';
                        const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
                        const isDoc = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext);
                        const iconColor = isPdf ? 'text-red-500 bg-red-100' : isImage ? 'text-blue-500 bg-blue-100' : isDoc ? 'text-indigo-500 bg-indigo-100' : 'text-gray-500 bg-gray-100';
                        return (
                          <a
                            key={i}
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 border border-gray-100 transition-all group"
                          >
                            <div className={`p-2 rounded-lg ${iconColor}`}>
                              {isImage ? <ImageIcon className="h-4 w-4" /> : <File className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-800 truncate group-hover:text-orange-700">{att.fileName}</p>
                              <p className="text-xs text-gray-400">{att.label}</p>
                            </div>
                            <Download className="h-4 w-4 text-gray-400 group-hover:text-orange-500 flex-shrink-0" />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Campaigns Section — discovery & tracker only */}
        {portalPhase !== 'kickoff' && <Card id="section-campaigns" className="border-0 shadow-lg rounded-xl overflow-hidden mt-10">
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
        </Card>}

        {/* KOL Roster — tracker only */}
        {portalPhase === 'tracker' && kolRoster.length > 0 && (
          <Card id="section-kol-roster" className="border-0 shadow-lg rounded-xl overflow-hidden mt-8">
            <CardHeader className="bg-white border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-[#3e8692] to-[#2d6570] rounded-xl shadow-lg">
                  <Users className="h-5 w-5 text-white" />
                </div>
                <CardTitle className="text-xl font-bold text-gray-900">KOL Roster</CardTitle>
                <span className="text-sm text-gray-500">({kolRoster.length} KOLs)</span>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {(() => {
                const grouped = kolRoster.reduce<Record<string, KolRosterEntry[]>>((acc, kol) => {
                  const key = kol.campaignId;
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(kol);
                  return acc;
                }, {});
                return (
                  <div className="space-y-6">
                    {Object.entries(grouped).map(([campaignId, kols]) => (
                      <div key={campaignId}>
                        <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                          <Megaphone className="h-4 w-4 text-[#3e8692]" />
                          {kols[0].campaignName}
                          <span className="text-xs text-gray-400 font-normal">({kols.length})</span>
                        </h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-200">
                                <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">KOL</th>
                                <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Platform</th>
                                <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tier</th>
                                <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Content</th>
                                <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Impressions</th>
                                <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Engagement</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {kols.map((kol) => (
                                <tr key={kol.id} className="hover:bg-gray-50">
                                  <td className="py-2.5 px-3">
                                    {kol.link ? (
                                      <a href={kol.link} target="_blank" rel="noopener noreferrer" className="text-[#3e8692] hover:underline font-medium">
                                        {kol.name}
                                      </a>
                                    ) : (
                                      <span className="font-medium text-gray-900">{kol.name}</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-gray-600 capitalize">{kol.platform || '—'}</td>
                                  <td className="py-2.5 px-3 text-gray-600 capitalize">{kol.tier || '—'}</td>
                                  <td className="py-2.5 px-3">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${kol.statusColor}`}>
                                      {kol.displayStatus}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right">
                                    {kol.contentLinks.length > 0 ? (
                                      <div className="flex items-center justify-end gap-1">
                                        {kol.contentLinks.slice(0, 3).map((link, i) => (
                                          <a key={i} href={link} target="_blank" rel="noopener noreferrer" className="text-[#3e8692] hover:text-[#2d6570]">
                                            <ExternalLink className="h-3.5 w-3.5" />
                                          </a>
                                        ))}
                                        {kol.contentLinks.length > 3 && (
                                          <span className="text-xs text-gray-400">+{kol.contentLinks.length - 3}</span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-gray-400">—</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-right text-gray-700 font-medium">{kol.impressions > 0 ? formatNumber(kol.impressions) : '—'}</td>
                                  <td className="py-2.5 px-3 text-right text-gray-700 font-medium">{kol.engagement > 0 ? formatNumber(kol.engagement) : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* Meeting Notes Section — discovery & tracker only */}
        {portalPhase !== 'kickoff' && meetingNotes.length > 0 && (
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

        {/* Decision Log Section — discovery & tracker only */}
        {portalPhase !== 'kickoff' && decisionLog.length > 0 && (
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

      {/* Floating Activity Button + Dropdown */}
      {recentActivities.length > 0 && (
        <div className="fixed top-[73px] left-0 right-0 z-40 pointer-events-none">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-end">
            <div className="pointer-events-auto relative mt-3">
              <button
                onClick={() => setActivityModalOpen(!activityModalOpen)}
                className="relative w-11 h-11 rounded-full bg-[#3e8692] shadow-lg flex items-center justify-center hover:bg-[#2d6570] transition-colors cursor-pointer"
              >
                <Bell className="h-5 w-5 text-white" />
                {totalUnread > 0 && (
                  <div className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                    <span className="text-white text-[10px] font-bold">!</span>
                  </div>
                )}
              </button>

              {/* Dropdown */}
              {activityModalOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setActivityModalOpen(false)} />
                  <div className="absolute right-0 top-[52px] z-50 w-[380px] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-[#3e8692]" />
                        <p className="text-sm font-bold text-gray-900">Recent Activity</p>
                      </div>
                      <span className="text-xs text-gray-400">{totalActivities} total</span>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto">
                      <div className="p-3 space-y-1">
                        {recentActivities.map((activity) => {
                          const timeAgo = (() => {
                            const diff = Date.now() - new Date(activity.created_at).getTime();
                            const mins = Math.floor(diff / 60000);
                            if (mins < 60) return `${mins}m ago`;
                            const hours = Math.floor(mins / 60);
                            if (hours < 24) return `${hours}h ago`;
                            const days = Math.floor(hours / 24);
                            if (days < 7) return `${days}d ago`;
                            return new Date(activity.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                          })();

                          const iconColor = activity.activity_type === 'milestone_status' ? 'bg-[#3e8692]'
                            : activity.activity_type === 'campaign_status' ? 'bg-blue-500'
                            : activity.activity_type === 'link_added' ? 'bg-purple-500'
                            : activity.activity_type === 'resource_updated' ? 'bg-green-500'
                            : 'bg-gray-400';

                          const scrollTarget = activity.activity_type === 'milestone_status' ? 'section-milestones'
                            : activity.activity_type === 'campaign_status' ? 'section-campaigns'
                            : activity.activity_type === 'link_added' || activity.activity_type === 'resource_updated' ? 'section-resources'
                            : null;

                          return (
                            <div
                              key={activity.id}
                              className={`flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors ${!activity.is_read ? 'bg-[#3e8692]/[0.04]' : ''} ${scrollTarget ? 'hover:bg-gray-50 cursor-pointer' : ''}`}
                              onClick={async () => {
                                if (!activity.is_read) {
                                  setRecentActivities(prev => prev.map(a => a.id === activity.id ? { ...a, is_read: true } : a));
                                  setTotalUnread(prev => Math.max(0, prev - 1));
                                  await supabasePublic.from('client_activity_log').update({ is_read: true }).eq('id', activity.id);
                                }
                                if (scrollTarget) {
                                  const el = document.getElementById(scrollTarget);
                                  if (el) {
                                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    setActivityModalOpen(false);
                                  }
                                }
                              }}
                            >
                              <div className={`w-5 h-5 rounded-full ${iconColor} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-medium text-gray-900 truncate">{activity.title}</p>
                                  {!activity.is_read && <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />}
                                </div>
                                {activity.description && <p className="text-xs text-gray-500 truncate">{activity.description}</p>}
                              </div>
                              <span className="text-[11px] text-gray-400 flex-shrink-0 mt-0.5">{timeAgo}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {totalActivities > recentActivities.length && (
                      <div className="px-4 py-2.5 border-t border-gray-100 text-center">
                        <button
                          onClick={() => {
                            const newLimit = activityLimit + 5;
                            setActivityLimit(newLimit);
                            fetchRecentActivities(newLimit);
                          }}
                          className="text-xs font-medium text-[#3e8692] cursor-pointer"
                        >
                          Show more ({totalActivities - recentActivities.length} remaining)
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
