'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PortalDocumentsCard from '@/components/documents/PortalDocumentsCard';
import {
  Building2,
  Calendar,
  DollarSign,
  Users,
  BarChart3,
  ExternalLink,
  FileText,
  TrendingUp,
  Eye,
  EyeOff,
  Megaphone,
  StickyNote,
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
  Award,
} from 'lucide-react';
import 'react-quill/dist/quill.snow.css';
import TopPostEmbed from '@/components/portal/TopPostEmbed';
import { formatDate as fmtDate, formatRelativeShort } from '@/lib/dateFormat';
import { getCampaignWeek, getTotalCampaignWeeksFromCoverage } from '@/lib/campaignWeekHelpers';
import { authorizePortalGate, type GateReason } from '@/lib/portalGateClient';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
// [2026-07-09] Read-only anon client for the public portal — no auth
// session. persistSession:false keeps it out of GoTrue storage so it
// doesn't collide with the app's cookie browser client (lib/supabase),
// which triggered the "Multiple GoTrueClient instances" console warning.
const supabasePublic = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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
  // 4th Resources card on the portal — KOL Content Brief link.
  // Set via Client Context modal → Resource Links. NULL = card hidden.
  kol_content_brief_url: string | null;
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

// [Campaign Live v1] Top performing post — auto-derived from the
// `contents` table. We pick the row with the highest impressions for
// the active campaign and join up through campaign_kols → master_kols
// to get the KOL name + link (for the @handle).
//
// Spec gap: `contents` does not store the post text itself, so the
// "snippet" field falls back to the `notes` column when populated, or
// hides cleanly when not.
type TopPostData = {
  contentId: string;
  kolName: string;
  kolLink: string | null;
  platform: string | null;
  contentLink: string;
  notes: string | null;
  impressions: number;
  likes: number;
  comments: number;
  retweets: number;
};

// [Campaign Live v1] Aggregate stats for the 4-card Stats Row, scoped
// to the active campaign and filtered to posted content only.
//   - kolsActivated = distinct KOLs with ≥1 posted piece of content
//     (our cleanest proxy for "activated" since we don't have a
//     dedicated activation status field)
//   - contentLive   = count of posts with status='posted'
//   - impressions   = SUM of impressions on those posts
//   - engagements   = SUM of (likes + retweets + comments + bookmarks)
//                     across those posts
//   - postsLast7Days = subset of contentLive whose activation_date is
//     within the last 7 days. Used by the This Week feed to auto-derive
//     a "N posts went live this week" item.
type ActiveCampaignStats = {
  kolsActivated: number;
  contentLive: number;
  impressions: number;
  engagements: number;
  postsLast7Days: number;
};

// [Campaign Live v1] Week-over-week deltas for the Stats Row trend
// arrows. Computed in the portal from current values + the most
// recent snapshot at least ~5 days old (mig 079 + the
// /api/cron/campaign-weekly-snapshot cron).
//
// Per spec, KOLs Activated and Content Live show RAW deltas ("↑ 3
// this week"); Impressions and Engagements show PERCENT deltas
// ("↑ 18%"). Each is null when there's no prior snapshot to compare
// to — the UI then just hides the arrow.
type StatsTrends = {
  kolsActivatedDelta: number | null;
  contentLiveDelta: number | null;
  impressionsPctDelta: number | null;
  engagementsPctDelta: number | null;
};

// [Campaign Live v1] An item in the "This Week" feed.
//   status='done'     → green dot, recent achievement
//   status='pending'  → orange dot, in flight
// `dateLabel` is a pre-formatted display string ("Today", "Yesterday",
// "May 28", "Due Fri", etc.). Pre-formatted so the renderer stays dumb.
//
// [2026-06-09] The 'upcoming' status was removed per the v2 spec
// (no "Coming Up" section). Kept as a string-literal type union of
// just done/pending so consumers can't accidentally re-introduce it.
type ThisWeekItem = {
  text: string;
  dateLabel: string | null;
  status: 'done' | 'pending';
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
  // [Campaign Live v1] Phase badge label (e.g. "Seeding Phase"). NULL = no badge.
  // Backed by mig 078 (drafted, not yet applied). Selected with `?` fallback in
  // fetchCampaigns so the page doesn't break if the column hasn't been added yet.
  current_phase?: string | null;
};

// Helper to check if a string is a valid UUID
const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'TBD';
  return fmtDate(dateString);
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
      return 'bg-emerald-100 text-emerald-800';
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

// [2026-07-09] Client-facing file title. Storage keys look like
// "1772646558355-7s3j6f.pdf" (timestamp-hash), which is ugly and
// meaningless to a client. Strip the upload prefix; if what remains is
// just a random hash, fall back to a friendly type name by extension.
const friendlyFileTitle = (fileName: string): string => {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const typeName =
    ext === 'pdf' ? 'PDF Document'
    : ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext) ? 'Image'
    : ['doc', 'docx'].includes(ext) ? 'Word Document'
    : ['xls', 'xlsx', 'csv'].includes(ext) ? 'Spreadsheet'
    : ['ppt', 'pptx'].includes(ext) ? 'Presentation'
    : 'Attachment';
  const base = fileName
    .replace(/\.[^.]+$/, '')        // drop extension
    .replace(/^\d{8,}[-_]/, '')     // drop leading upload timestamp prefix
    .replace(/[-_]+/g, ' ')
    .trim();
  // A bare random hash (no spaces, short) isn't a real name → use type.
  const looksLikeHash = base.length > 0 && base.length <= 12 && !base.includes(' ');
  return base && !looksLikeHash ? base : typeName;
};

// [Campaign Live v1] Pull "@handle" out of a profile URL.
// Handles t.me/foo, x.com/foo, twitter.com/foo, youtube.com/@foo, etc.
// Returns null if the URL is malformed or has no usable path segment.
const extractHandleFromUrl = (url: string | null): string | null => {
  if (!url) return null;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/+|\/+$/g, '');
    if (!path) return null;
    // youtube uses /@handle/...; strip the leading @ for consistent display.
    return path.split('/')[0].replace(/^@/, '') || null;
  } catch {
    return null;
  }
};

const kolStatusMap: Record<string, { label: string; color: string }> = {
  'Curated': { label: 'Shortlisted', color: 'bg-gray-100 text-gray-700' },
  'Contacted': { label: 'Pitching', color: 'bg-blue-100 text-blue-700' },
  'Interested': { label: 'Negotiating', color: 'bg-yellow-100 text-yellow-700' },
  'Onboarded': { label: 'Content Creation', color: 'bg-purple-100 text-purple-700' },
  'Concluded': { label: 'Completed', color: 'bg-emerald-100 text-emerald-700' },
};

export default function ClientPortalPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const idOrSlug = params.id;

  // Auth states
  const [clientId, setClientId] = useState<string | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  // audit C1 Phase 2: the email-gate authorization lists (email/approved_emails/
  // approved_domains) are NO LONGER read via the anon key. clientLoaded just marks
  // that the client's display record resolved; the gate itself runs server-side.
  const [clientLoaded, setClientLoaded] = useState(false);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loadingClientEmail, setLoadingClientEmail] = useState(true);

  // Data states
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  // [2026-07-09] Client-level engagement facts, so every campaign surface
  // reads the SAME term end + total budget (the engagement term is a client
  // attribute, not per-campaign). covered_through → Week N of M's "M" +
  // displayed end date; budget total → sum of engagement terms.
  // [2026-07-09] Collapse long lists to 4 by default (Form Submissions +
  // Uploaded Files), with a Show-all toggle.
  const [showAllForms, setShowAllForms] = useState(false);
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [showAllLinks, setShowAllLinks] = useState(false);
  const [clientCoveredThrough, setClientCoveredThrough] = useState<string | null>(null);
  const [clientBudgetTotal, setClientBudgetTotal] = useState<number | null>(null);
  useEffect(() => {
    if (!clientId) { setClientCoveredThrough(null); setClientBudgetTotal(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data: cov } = await supabasePublic.from('client_coverage').select('covered_through').eq('client_id', clientId);
        const maxCov = ((cov as Array<{ covered_through: string | null }> | null) ?? [])
          .map(r => r.covered_through).filter((d): d is string => !!d).sort().pop() ?? null;
        if (!cancelled) setClientCoveredThrough(maxCov);
      } catch { /* fall back to end_date */ }
      try {
        const { data: bud } = await supabasePublic.from('client_engagement_total').select('total_amount').eq('client_id', clientId).maybeSingle();
        const terms = bud ? Number((bud as { total_amount: number | string | null }).total_amount ?? 0) : 0;
        if (!cancelled) setClientBudgetTotal(terms > 0 ? terms : null);
      } catch { /* fall back to total_budget */ }
    })();
    return () => { cancelled = true; };
  }, [clientId]);
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
  const [milestones, setMilestones] = useState<{ id: string; name: string; subtitle: string | null; status: string; status_message: string | null; display_order: number; updated_at?: string | null }[]>([]);
  // [Campaign Live v1] Tracks whether the user has expanded the collapsed
  // onboarding row at the bottom of the page in Campaign Live mode. Default
  // collapsed — onboarding is reference material once the campaign is live.
  const [onboardingExpandedInLiveMode, setOnboardingExpandedInLiveMode] = useState(false);
  // [Portal load-together v1] Becomes true once every initial fetch has
  // completed. Used to hold the portal's main content area behind a
  // spinner until all data is ready — prevents the "Welcome → Welcome
  // back" flicker, the onboarding-banner pop-in/out, and the
  // Onboarding→Live mode-switch reflow.
  const [initialFetchesDone, setInitialFetchesDone] = useState(false);
  // [Campaign Live v1] Top performing post — auto-derived from `contents`
  // for the active campaign. Re-fetched whenever the active campaign changes.
  const [topPost, setTopPost] = useState<TopPostData | null>(null);
  // [Campaign Live v1] Aggregate stats for the 4-card Stats Row. Populated
  // by the same fetch as topPost (single round-trip).
  const [activeStats, setActiveStats] = useState<ActiveCampaignStats | null>(null);
  // [Campaign Live v1] Week-over-week deltas. Null when no prior
  // snapshot exists (e.g. first week of a new campaign).
  const [statsTrends, setStatsTrends] = useState<StatsTrends | null>(null);
  const [expandedMilestoneId, setExpandedMilestoneId] = useState<string | null>(null);
  const [clientLinks, setClientLinks] = useState<{ id: string; name: string; url: string; description: string | null; link_types: string[] }[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [mindshareEnabled, setMindshareEnabled] = useState(false);
  const [mindshareWeekly, setMindshareWeekly] = useState<{ week_number: number; week_start: string; mention_count: number; mindshare_pct: number }[]>([]);
  const [clientDeliverables, setClientDeliverables] = useState<{ id: string; title: string; status: string; completedSteps: number; totalSteps: number; templateName: string; templateColor: string; templateIcon: string; startDate: string | null; targetCompletion: string | null }[]>([]);

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
            .select('id, name, slug, logo_url')
            .eq('id', idOrSlug)
            .is('archived_at', null)
            .single();

          if (error || !data) {
            setError('Client not found');
            setLoadingClientEmail(false);
            return;
          }
          setClient(data as any);
          setClientLoaded(true);
        } else {
          // Fetch by slug
          const { data, error } = await supabasePublic
            .from('clients')
            .select('id, name, slug, logo_url')
            .eq('slug', idOrSlug)
            .is('archived_at', null)
            .single();

          if (error || !data) {
            setError('Client not found');
            setLoadingClientEmail(false);
            return;
          }
          setClientId(data.id);
          setClient(data as any);
          setClientLoaded(true);
        }
      } catch (err) {
        setError('Failed to load client');
        setLoadingClientEmail(false);
      }
    }
    resolveClientId();
  }, [idOrSlug]);

  // Check cached auth once the client record has resolved.
  useEffect(() => {
    if (clientLoaded) {
      void checkCachedAuth();
      setLoadingClientEmail(false);
    }
  }, [clientLoaded]);

  // Fetch data when authenticated.
  //
  // [Portal load-together v1] Wraps all 14 initial fetches in Promise.all
  // and flips `initialFetchesDone = true` only after every single one
  // resolves. The main content area below stays behind a spinner until
  // then — see the `portalReady` check in the <main> render.
  //
  // Why hold rendering: prevents the welcome text flicker
  // ("Welcome" → "Welcome back"), the onboarding banner pop-in/out, and
  // the Onboarding→Live mode reflow that happened when state arrived
  // piecemeal. Total parallel-fetch time is typically ~600-1000ms, all
  // of which is hidden behind the existing portal entrance animation
  // for cached-auth users.
  useEffect(() => {
    if (!isAuthenticated || !clientId) return;
    let cancelled = false;
    setInitialFetchesDone(false);
    (async () => {
      try {
        await Promise.all([
          fetchCampaigns(),
          fetchMeetingNotes(),
          fetchClientContext(),
          fetchDecisionLog(),
          fetchWeeklyUpdates(),
          fetchActionItems(),
          fetchMilestones(),
          fetchMindshare(),
          fetchClientLinks(),
          checkOnboardingStatus(),
          fetchKolRoster(),
          fetchFormSubmissions(),
          fetchClientDeliverables(),
        ]);
      } catch (err) {
        // Individual fetches already log + show their own toasts; we just
        // need to unblock the UI so the user isn't stuck on a spinner.
        console.error('Portal initial fetch error:', err);
      } finally {
        if (!cancelled) setInitialFetchesDone(true);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId, isAuthenticated]);

  // Server-side email authorization (audit C1 Phase 2). The authorization lists
  // (email / approved_emails / approved_domains) are no longer exposed to the
  // browser — the gate runs on the server via /api/public/portal-gate/authorize,
  // which reuses lib/portalDocAuth (same rules, incl. the free-mail denylist).
  // Returns which rule matched (for the access log) or null if not authorized.
  const resolveAuthorizationReason = async (
    inputEmail: string
  ): Promise<GateReason> => {
    const res = await authorizePortalGate(idOrSlug, inputEmail);
    return res.ok ? res.reason : null;
  };

  // Fire-and-forget POST to the access-log endpoint. Failures are
  // intentionally swallowed — logging is observability, not critical
  // path; we never want a logging hiccup to block portal access.
  const logPortalAccess = async (
    inputEmail: string,
    via: 'exact' | 'approved_email' | 'same_domain' | 'approved_domain' | 'cache'
  ) => {
    if (!clientId || !inputEmail) return;
    try {
      await fetch('/api/portal/log-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, email: inputEmail, authorized_via: via }),
      });
    } catch {
      // intentional silence — see comment above
    }
  };

  // Check if user is already authenticated via cache. Async now — the gate
  // re-check runs server-side (audit C1 Phase 2).
  const checkCachedAuth = async () => {
    if (!clientLoaded) return;

    const enterAuthenticated = (authedEmail: string) => {
      setEmail(authedEmail);
      setIsAuthenticated(true);
      setWelcomePhase('enter');
      setShowWelcome(true);
      void logPortalAccess(authedEmail, 'cache');
      requestAnimationFrame(() => {
        setTimeout(() => setWelcomePhase('ready'), 50);
      });
    };

    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { email: cachedEmail, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_DURATION && cachedEmail) {
          const { ok } = await authorizePortalGate(idOrSlug, cachedEmail);
          if (ok) { enterAuthenticated(cachedEmail); return; }
        }
        localStorage.removeItem(cacheKey);
      }

      // [2026-07-06] Unified access — accept a sign-in from any other
      // public surface (campaign tracker, reports) as long as that
      // email passes THIS client's authorization rules.
      const globalRaw = localStorage.getItem('portal_global_auth');
      if (globalRaw) {
        const { email: globalEmail, timestamp: globalTs } = JSON.parse(globalRaw);
        if (globalEmail && Date.now() - globalTs < CACHE_DURATION) {
          const { ok } = await authorizePortalGate(idOrSlug, globalEmail);
          if (ok) { saveAuthToCache(globalEmail); enterAuthenticated(globalEmail); return; }
        }
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
      // Save global portal auth for cross-page navigation (campaign/report pages).
      // Only the visitor's email is shared — the client's authorization lists are
      // no longer held client-side (audit C1 Phase 2).
      const globalAuthData = {
        email,
        clientId,
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

    if (!clientLoaded) {
      setEmailError('Unable to verify access. Please try again.');
      return;
    }

    const reason = await resolveAuthorizationReason(email);
    if (!reason) {
      setEmailError('This email address is not authorized to access this portal');
      return;
    }

    saveAuthToCache(email);
    // Stamp the audit log with whichever rule passed. Don't await — the
    // portal shouldn't wait on observability before rendering.
    void logPortalAccess(email, reason);
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
          campaign_kols(id, hidden),
          contents(
            campaign_kols_id,
            impressions,
            likes,
            comments,
            retweets,
            bookmarks
          ),
          current_phase
        `)
        .eq('client_id', clientId)
        .is('archived_at', null)
        .order('start_date', { ascending: false });

      if (campaignsError) throw campaignsError;

      const processedCampaigns = campaignsData?.map(campaign => {
        // [2026-05-27] Visibility-aware aggregation.
        //
        // 1) Build the set of NON-HIDDEN campaign_kol IDs for this
        //    campaign (matches the visibility logic in the KOL list
        //    at ~line 1121 which filters hidden=null|false).
        // 2) Filter contents to those either (a) not tied to any
        //    KOL (campaign-level content), or (b) tied to a visible
        //    KOL. Hidden-KOL content is excluded from kol_count,
        //    content_count, total_impressions, and total_engagement
        //    so the tracker headline numbers match what the client
        //    sees rendered below.
        const allKols = (campaign as any).campaign_kols || [];
        const visibleKolIds = new Set(
          allKols.filter((k: any) => !k.hidden).map((k: any) => k.id),
        );
        const visibleKolCount = visibleKolIds.size;

        const allContents = (campaign as any).contents || [];
        const visibleContents = allContents.filter((c: any) =>
          !c.campaign_kols_id || visibleKolIds.has(c.campaign_kols_id),
        );

        const totalImpressions = visibleContents.reduce(
          (sum: number, c: any) => sum + (c.impressions || 0),
          0,
        );
        const totalEngagement = visibleContents.reduce(
          (sum: number, c: any) =>
            sum + (c.likes || 0) + (c.comments || 0) + (c.retweets || 0) + (c.bookmarks || 0),
          0,
        );

        return {
          ...campaign,
          kol_count: visibleKolCount,
          content_count: visibleContents.length,
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

  // Meeting notes + decision log are confidential client content — fetched via
  // the gated server endpoint (audit C1 Phase 2), which re-checks the email gate
  // and returns only this client's rows. Both come back in one call; each fetcher
  // sets its own slice so the existing Promise.all wiring is untouched.
  async function fetchGatedContent(): Promise<{ meetingNotes: any[]; decisionLog: any[] }> {
    if (!clientId || !email) return { meetingNotes: [], decisionLog: [] };
    try {
      const res = await fetch('/api/public/portal-gate/content', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idOrSlug, email }), cache: 'no-store',
      });
      if (!res.ok) return { meetingNotes: [], decisionLog: [] };
      const json = await res.json();
      return { meetingNotes: json.meetingNotes ?? [], decisionLog: json.decisionLog ?? [] };
    } catch {
      return { meetingNotes: [], decisionLog: [] };
    }
  }

  async function fetchMeetingNotes() {
    if (!clientId) return;
    try {
      const { meetingNotes } = await fetchGatedContent();
      setMeetingNotes(meetingNotes);
    } catch (err) {
      console.error('Error fetching meeting notes:', err);
    }
  }

  async function fetchClientContext() {
    if (!clientId) return;
    try {
      const { data } = await supabasePublic
        .from('client_context')
        .select('id, engagement_type, scope, start_date, milestones, client_contacts, holohive_contacts, telegram_url, shared_drive_url, gtm_sync_url, kol_content_brief_url, onboarding_phase')
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
      const { decisionLog } = await fetchGatedContent();
      setDecisionLog(decisionLog);
    } catch (err) {
      console.error('Error fetching decision log:', err);
    }
  }

  async function fetchWeeklyUpdates() {
    if (!clientId) return;
    try {
      const { data } = await supabasePublic
        .from('client_weekly_updates')
        // v2: also pull this_week_feed + top_post_override so the
        // portal renders the new structured shape. Old columns stay
        // selected so weeks saved before the migration still work.
        .select('id, week_of, current_focus, active_initiatives, next_checkin, open_questions, this_week_feed, top_post_override')
        .eq('client_id', clientId)
        .order('week_of', { ascending: false });
      setWeeklyUpdates((data || []) as any);
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
        // [Campaign Live v1] added updated_at so we can derive the "Completed
        // [date]" tail on the collapsed-onboarding row at the bottom of the
        // page in Campaign Live mode.
        .select('id, name, subtitle, status, status_message, display_order, is_visible, updated_at')
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

  // [Campaign Live v1] Single fetch that powers BOTH the Top Performing
  // Post card AND the Stats Row, for the active campaign.
  //
  // Pulls every posted content row for the campaign in one round-trip,
  // then derives:
  //   - topPost         (the highest-impressions row)
  //   - activeStats     (counts + sums across all rows)
  //
  // Why one query instead of two: at campaign scale (≤ a few hundred
  // posts), pulling all rows and reducing in JS is cheaper than two
  // separate round-trips, and keeps both UIs perfectly consistent.
  //
  // Status filter ('posted') everywhere — drafts/scheduled rows don't
  // count toward "live" stats and shouldn't promote to top post either.
  // Phase 2 / Zone C: when a CM has pinned a specific post via the
  // Weekly Update Top Post override, pass that content_id here so the
  // portal renders the pinned post instead of the auto-pick. NULL =
  // use the default highest-engagement selection. If the pinned id
  // isn't found in the current rows (post archived or wrong campaign),
  // we fall back to the auto-pick silently.
  async function fetchTopPost(campaignId: string, overrideContentId?: string | null) {
    try {
      const { data } = await supabasePublic
        .from('contents')
        .select(`
          id,
          campaign_kols_id,
          platform,
          content_link,
          impressions,
          likes,
          comments,
          retweets,
          bookmarks,
          notes,
          activation_date,
          campaign_kols!inner (
            master_kols!inner (
              name,
              link
            )
          )
        `)
        .eq('campaign_id', campaignId)
        .eq('status', 'posted');

      const rows = (data as any[]) || [];

      // Stats Row — counts + sums
      let impressionsSum = 0;
      let engagementsSum = 0;
      const distinctKolIds = new Set<string>();
      let topRow: any = null;
      // [2026-06-16] Top Post ranking — per spec § 3b: "highest total
      // engagement (Impressions + Likes + Retweets + Comments)". Was
      // ranking by impressions only; switched to summed engagement to
      // match the spec literal. Same data already computed for the
      // Stats Row engagementsSum, so no extra pass over rows.
      let topEngagement = -1;
      let postsLast7Days = 0;
      // Cutoff for "this week" — anything posted within the last 7 days.
      // Compared as YYYY-MM-DD strings to avoid timezone foot-guns.
      const sevenDaysAgoStr = (() => {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - 7);
        return d.toISOString().slice(0, 10);
      })();

      for (const r of rows) {
        impressionsSum += r.impressions || 0;
        engagementsSum +=
          (r.likes || 0) +
          (r.retweets || 0) +
          (r.comments || 0) +
          (r.bookmarks || 0);
        if (r.campaign_kols_id) distinctKolIds.add(r.campaign_kols_id);
        // Track top post in the same pass — saves a sort. Engagement =
        // impressions + likes + retweets + comments + bookmarks per spec
        // § 3b. Bookmarks included because they're already in
        // engagementsSum above; consistent metric across Stats Row and
        // Top Post pick.
        const rowEngagement =
          (r.impressions || 0) +
          (r.likes || 0) +
          (r.retweets || 0) +
          (r.comments || 0) +
          (r.bookmarks || 0);
        if (rowEngagement > topEngagement) {
          topEngagement = rowEngagement;
          topRow = r;
        }
        // Posted in the last 7 days?
        // Need to also fetch activation_date — added to the SELECT above.
        if (r.activation_date && r.activation_date >= sevenDaysAgoStr) {
          postsLast7Days++;
        }
      }

      const currentStats: ActiveCampaignStats = {
        kolsActivated: distinctKolIds.size,
        contentLive: rows.length,
        impressions: impressionsSum,
        engagements: engagementsSum,
        postsLast7Days,
      };
      setActiveStats(currentStats);

      // [Campaign Live v1] Compute trend deltas vs. last week's snapshot.
      // Look for the most recent snapshot from at least 5 days ago — gives
      // us week-over-week even if the snapshot landed early or late.
      // No snapshot → no trends → arrows stay hidden in the UI.
      try {
        const fiveDaysAgo = new Date();
        fiveDaysAgo.setUTCDate(fiveDaysAgo.getUTCDate() - 5);
        const cutoff = fiveDaysAgo.toISOString().slice(0, 10);

        const { data: snapRows } = await supabasePublic
          .from('campaign_weekly_snapshots')
          .select('kols_activated, content_live, impressions, engagements, snapshot_date')
          .eq('campaign_id', campaignId)
          .lte('snapshot_date', cutoff)
          .order('snapshot_date', { ascending: false })
          .limit(1);

        const prior = (snapRows as any[])?.[0];
        if (!prior) {
          setStatsTrends(null);
        } else {
          const pctDelta = (current: number, previous: number): number | null => {
            if (previous === 0) return current > 0 ? null : 0; // "New" — can't compute %
            return ((current - previous) / previous) * 100;
          };
          setStatsTrends({
            kolsActivatedDelta: currentStats.kolsActivated - (prior.kols_activated || 0),
            contentLiveDelta: currentStats.contentLive - (prior.content_live || 0),
            impressionsPctDelta: pctDelta(currentStats.impressions, prior.impressions || 0),
            engagementsPctDelta: pctDelta(currentStats.engagements, prior.engagements || 0),
          });
        }
      } catch (snapErr) {
        console.error('Error fetching snapshot trends:', snapErr);
        setStatsTrends(null);
      }

      // Apply Top Post override if the CM pinned one for the latest
      // week. If the override id matches a row in the current
      // campaign's posted content, swap it in for topRow. Falls back
      // to the auto-pick if not found (e.g. post was archived or the
      // pinned content belongs to a different campaign).
      if (overrideContentId) {
        const pinned = rows.find(r => r.id === overrideContentId);
        if (pinned) topRow = pinned;
      }

      if (!topRow) {
        setTopPost(null);
        return;
      }
      // Supabase returns the joined row as an object (not array) because of !inner.
      const mk = topRow.campaign_kols?.master_kols;
      setTopPost({
        contentId: topRow.id,
        kolName: mk?.name || 'Unknown KOL',
        kolLink: mk?.link || null,
        platform: topRow.platform,
        contentLink: topRow.content_link,
        notes: topRow.notes,
        impressions: topRow.impressions || 0,
        likes: topRow.likes || 0,
        comments: topRow.comments || 0,
        retweets: topRow.retweets || 0,
      });
    } catch (err) {
      console.error('Error fetching top post + stats:', err);
      setTopPost(null);
      setActiveStats(null);
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
          master_kols(name, link, platform),
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
          // tier removed — column dropped in migration 071. Public portal
          // now omits the tier badge; replace with Score in Phase 3.
          tier: null,
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

  async function fetchClientDeliverables() {
    if (!clientId) return;
    try {
      const { data: dels } = await supabasePublic
        .from('deliverables')
        .select('id, title, status, start_date, target_completion, template_id, parent_task_id')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (!dels || dels.length === 0) return;

      const templateIds = [...new Set(dels.map((d: any) => d.template_id))];
      const { data: tmpls } = await supabasePublic
        .from('deliverable_templates')
        .select('id, name, color, icon')
        .in('id', templateIds);

      const tmplMap = new Map((tmpls || []).map((t: any) => [t.id, t]));

      const results = [];
      for (const d of dels) {
        const tmpl = tmplMap.get(d.template_id) || { name: 'Workflow', color: '#3e8692', icon: 'ClipboardList' };
        const { data: subtasks } = await supabasePublic
          .from('tasks')
          .select('status')
          .eq('parent_task_id', d.parent_task_id);

        const total = subtasks?.length || 0;
        const done = subtasks?.filter((s: any) => s.status === 'complete').length || 0;

        results.push({
          id: d.id,
          title: d.title,
          status: d.status,
          completedSteps: done,
          totalSteps: total,
          templateName: tmpl.name,
          templateColor: tmpl.color,
          templateIcon: tmpl.icon,
          startDate: d.start_date,
          targetCompletion: d.target_completion,
        });
      }
      setClientDeliverables(results);
    } catch (err) {
      console.error('Error fetching client deliverables:', err);
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

  // ─── [Campaign Live v1] Mode-switch derived state ────────────────
  // When all onboarding milestones are complete AND we have an active
  // campaign to display, swap the hero out for a campaign-first layout
  // and collapse the milestone tracker to a single row at the bottom.
  // Per spec: no manual toggle, evaluated on every render.

  // Pick the campaign to feature in the hero. Spec: "If multiple are
  // active, show the one with the nearest end date or the one most
  // recently started." We use nearest end date for ties.
  const activeCampaign = useMemo<Campaign | null>(() => {
    if (!campaigns.length) return null;
    const today = new Date().toISOString().slice(0, 10);
    const inWindow = campaigns.filter(c =>
      c.start_date && c.end_date && c.start_date <= today && c.end_date >= today
    );
    if (inWindow.length > 0) {
      // Nearest end date first
      return [...inWindow].sort((a, b) => (a.end_date! < b.end_date! ? -1 : 1))[0];
    }
    // No in-window campaign — fall back to the most recently started one.
    // (Campaigns query already orders by start_date DESC.)
    return campaigns[0];
  }, [campaigns]);

  const allMilestonesComplete = milestones.length > 0 && milestones.every(m => m.status === 'complete');
  // Live mode requires both an all-complete onboarding AND a campaign to
  // show. Without a campaign the hero would be empty, so we'd rather
  // stay in onboarding mode than render a stub.
  const isCampaignLiveMode = allMilestonesComplete && !!activeCampaign;

  // Week math for the hero. Week number + total both come from the
  // canonical Monday-anchored helper in lib/campaignWeekHelpers.ts so
  // the portal and the campaign page agree — Week 1 = first Monday
  // on/after start_date. (Was raw ceil((today-start)/7d) here, which
  // ran one week ahead of the campaign page.) The progress bar stays
  // date-based for smoothness.
  const campaignWeekInfo = useMemo(() => {
    if (!activeCampaign?.start_date || !activeCampaign?.end_date) return null;
    const start = new Date(activeCampaign.start_date + 'T00:00:00').getTime();
    const end = new Date(activeCampaign.end_date + 'T00:00:00').getTime();
    const now = Date.now();
    const totalMs = end - start;
    if (totalMs <= 0) return null;
    const progressPct = (Math.max(0, Math.min(totalMs, now - start)) / totalMs) * 100;
    const wk = getCampaignWeek(activeCampaign.start_date);
    // M derives from the client's engagement term (covered_through), falling
    // back to the campaign end_date — same rule as the campaign tracker.
    const totalWeeks = Math.max(1, getTotalCampaignWeeksFromCoverage(activeCampaign.start_date, clientCoveredThrough, activeCampaign.end_date));
    const currentWeek = wk ? Math.min(totalWeeks, wk.weekNumber) : 1;
    return { progressPct, currentWeek, totalWeeks };
  }, [activeCampaign?.start_date, activeCampaign?.end_date, clientCoveredThrough]);

  // Completion date for the collapsed-onboarding row tail. Most recent
  // `updated_at` among the complete milestones — best proxy for "when
  // onboarding finished" without adding a dedicated column.
  const onboardingCompletedAt = useMemo(() => {
    if (!allMilestonesComplete) return null;
    const stamps = milestones
      .map(m => m.updated_at)
      .filter((s): s is string => !!s)
      .sort();
    return stamps.length ? stamps[stamps.length - 1] : null;
  }, [milestones, allMilestonesComplete]);

  // [Portal load-together v1] Combined "everything has loaded" flag.
  // Used by <main> to hold rendering until the page can paint atomically.
  //
  // Two-part condition:
  //   1. All 14 initial fetches resolved (initialFetchesDone)
  //   2. If we're going to show Live mode, the top post fetch (which
  //      fires AFTER activeCampaign is computed, one tick later) must
  //      also have completed (activeStats !== null)
  //
  // The second condition avoids a brief "live mode without stats"
  // render that would still feel like flicker even though it's atomic.
  const portalReady = initialFetchesDone && (!isCampaignLiveMode || activeStats !== null);

  // [Campaign Live v1] Re-fetch the top post + Stats Row aggregates
  // whenever the active campaign changes (or we exit live mode). Single
  // round-trip — see fetchTopPost. Placed after the useMemo above
  // because activeCampaign is declared above this hook.
  useEffect(() => {
    if (isAuthenticated && activeCampaign?.id) {
      // Read the latest weekly update's top_post_override (if any) and
      // pass its content_id so the portal renders the pinned post.
      // The dep array includes weeklyUpdates[0]?.top_post_override so
      // a CM saving an override in the admin tab re-fires this fetch
      // when the user reloads the portal.
      const overrideId = (weeklyUpdates[0] as any)?.top_post_override?.content_id || null;
      fetchTopPost(activeCampaign.id, overrideId);
    } else {
      setTopPost(null);
      setActiveStats(null);
      setStatsTrends(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeCampaign?.id, (weeklyUpdates[0] as any)?.top_post_override?.content_id]);

  // [Campaign Live v1] Build the "This Week" feed by merging:
  //   - Auto-derived "done" items from tracker data (posts went live, etc.)
  //   - Manual "pending" items from the latest client_weekly_updates row
  //     (each line of active_initiatives becomes one bullet)
  //   - Manual "upcoming" items (next_checkin date)
  //
  // CM still drives the human content via the weekly_updates admin form;
  // the auto-derived items mean the feed never goes empty even when the
  // CM is mid-sprint.
  const thisWeekItems = useMemo<ThisWeekItem[]>(() => {
    if (!isCampaignLiveMode) return [];
    const items: ThisWeekItem[] = [];

    // 1) Auto-derived green items
    if (activeStats && activeStats.postsLast7Days > 0) {
      items.push({
        text: `${activeStats.postsLast7Days} KOL post${activeStats.postsLast7Days === 1 ? '' : 's'} went live`,
        dateLabel: 'This week',
        status: 'done',
      });
    }

    const latest = weeklyUpdates[0] as any;

    // 2) Prefer the v2 structured this_week_feed JSONB if present.
    //    Each item already has {text, date, status: pending|done}, so
    //    we map directly. Falls back to the old active_initiatives
    //    newline-split below when the v2 column is empty/missing.
    //    Status flips on the admin side render here in real-time
    //    because the portal re-fetches on auth + every reload.
    const v2Feed: Array<{ id: string; text: string; date: string | null; status: 'pending' | 'done' }> | null =
      Array.isArray(latest?.this_week_feed) ? latest.this_week_feed : null;
    if (v2Feed && v2Feed.length > 0) {
      // [2026-06-11] Sort: pending first (what's still happening), then
      // done (what already shipped). Within each group, items keep
      // their authored order — admin curates ordering in the Weekly
      // Update tab and the portal respects it. Cap at 5 AFTER sorting
      // so a long list doesn't push pending items below the fold.
      const sortedV2 = [...v2Feed].sort((a, b) => {
        if (a.status === b.status) return 0;
        return a.status === 'pending' ? -1 : 1;
      });
      for (const it of sortedV2.slice(0, 5)) {
        const dateLabel = it.date
          ? fmtDate(it.date + 'T00:00:00')
          : null;
        items.push({ text: it.text, dateLabel, status: it.status });
      }
    } else if (latest?.active_initiatives) {
      // Legacy shape — newline-separated string, strip bullet prefix.
      // Kept so weeks saved before the v2 migration still render.
      const lines = (latest.active_initiatives as string)
        .split('\n')
        .map(l => l.replace(/^[-•\s]+/, '').trim())
        .filter(Boolean);
      for (const line of lines.slice(0, 5)) {
        items.push({ text: line, dateLabel: null, status: 'pending' });
      }
    }

    // 3) Manual upcoming — next check-in — REMOVED 2026-06-09.
    //    The v2 spec is explicit: "No 'Coming Up' section. Only this
    //    week." Legacy next_checkin only fires for old rows that have
    //    no v2 this_week_feed AND active_initiatives is missing —
    //    increasingly rare. Drop it to match spec exactly. Data
    //    column kept in case the team wants to bring this back as a
    //    separate hero element later.

    return items;
  }, [isCampaignLiveMode, activeStats, weeklyUpdates]);
  // ──────────────────────────────────────────────────────────────────

  // Until the client submits the onboarding form, EVERY content section
  // below the banner stays hidden — the form prompt has to be the only
  // visible call-to-action so they can't ignore it. Used in place of
  // raw `portalPhase !== 'kickoff'` checks throughout the JSX below.
  // `hasOnboardingResponse === true` (not `!== false`) means we hide
  // during the initial null/loading state too — avoids a flash of
  // content for un-onboarded clients before the check completes.
  // checkOnboardingStatus() defaults to true on "no form configured"
  // or transient errors, so this fails open in those cases (sections
  // still show even if the lookup hiccups).
  const onboardingComplete = hasOnboardingResponse === true;
  const showAdvancedSections = portalPhase !== 'kickoff' && onboardingComplete;

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
  if (error && !clientLoaded) {
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
                {/* Greeting reflects onboarding state [Andy 2026-07-16]:
                    clients who haven't submitted the onboarding form see
                    "Welcome" (they're new); everyone else "Welcome back".
                    Defaults to "Welcome" while the onboarding check is in
                    flight (hasOnboardingResponse === null) so brand-new
                    clients — the case this serves — never flicker. A
                    returning, already-onboarded client may briefly settle
                    "Welcome" → "Welcome back" as the check resolves;
                    acceptable on this transient entrance screen. */}
                {onboardingComplete ? 'Welcome back' : 'Welcome'}
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
                className="w-full py-3 px-6 rounded-xl font-semibold text-white transition-all duration-200 active:scale-[0.98]"
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
        {/* [Portal load-together v1] Hold everything behind a centered
            spinner until the initial fetch batch (and top-post derived
            fetch, if Live mode) all complete. This way the whole portal
            paints once, instead of: Welcome → Welcome back → onboarding
            tracker → Live mode hero (mode reflow → reflow → reflow).

            The header above stays visible so the user has spatial
            context ("you're in the right place"). The spinner replaces
            only the scrollable main content. */}
        {!portalReady ? (
          <div className="flex items-center justify-center py-24 sm:py-32">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-brand mx-auto mb-4" />
              <p className="text-sm text-gray-500">Loading your portal…</p>
            </div>
          </div>
        ) : (
          <>
        {/* Welcome Section — hidden in Campaign Live mode (replaced by the
            Active Campaign hero below). [Campaign Live v1] */}
        {!isCampaignLiveMode && (
          <div className="mb-10">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {/* Greeting reflects onboarding state [Andy 2026-07-16]:
                  "Welcome" until the onboarding form is submitted, then
                  "Welcome back". No flicker here — this block is behind
                  the portalReady gate, so hasOnboardingResponse is
                  already resolved by the time it paints. */}
              {onboardingComplete ? 'Welcome back' : 'Welcome'}, <span className="text-brand">{client?.name}</span>
            </h1>
            <p className="text-gray-500 text-lg">
              {welcomeSubtitle}
            </p>
          </div>
        )}

        {/* ─── [Campaign Live v1] Active Campaign Hero ──────────────────
            Replaces the onboarding milestone tracker once setup is done.
            Pure read of campaign.start_date / end_date + an optional
            current_phase label (mig 078 — drafted, not yet applied).
            No manual maintenance. */}
        {isCampaignLiveMode && activeCampaign && (
          <Card className="border border-gray-200 shadow-xl rounded-xl overflow-hidden mb-10">
            <CardContent className="p-6 sm:p-8">
              {/* [2026-07-09 per Andy] "Active Campaign" kicker + KOL count
                  removed. End date shows the engagement TERM end
                  (covered_through), falling back to campaign end_date. */}
              <h1 className="text-3xl font-bold text-gray-900 mb-1">
                {activeCampaign.name}
              </h1>
              {(() => {
                const termEnd = clientCoveredThrough ?? activeCampaign.end_date;
                return activeCampaign.start_date && termEnd ? (
                  <p className="text-gray-500 text-base mb-6">
                    {formatDate(activeCampaign.start_date)} — {formatDate(termEnd)}
                  </p>
                ) : <div className="mb-6" />;
              })()}

              {/* Continuous progress bar + week label. No countdown, no ring. */}
              {campaignWeekInfo && (
                <div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${campaignWeekInfo.progressPct}%`,
                        backgroundColor: '#3e8692', // brand
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-brand">
                      Week {campaignWeekInfo.currentWeek} of {campaignWeekInfo.totalWeeks}
                    </p>
                    {/* Phase badge — only renders when mig 078 is applied AND
                        the CM has set a phase. Until then the slot is empty
                        and the layout still looks correct. */}
                    {/* [2026-07-09] Campaign phase hidden per Andy (internal + public). */}
                    {false && activeCampaign?.current_phase && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand/10 text-brand text-sm font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand" />
                        {activeCampaign?.current_phase}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
            {/* ── Your Campaigns merged inline per Andy 2026-06-19 ──
                When the advanced section gate is on, render the full
                Your Campaigns header + search + tabs + list as a second
                section inside this same Card. Border-top separates it
                from the Active Campaign hero above. The standalone
                Your Campaigns Card lower on the page is suppressed in
                this branch so the content doesn't double-render. */}
            {showAdvancedSections && (
              <div className="border-t border-gray-100">
                <div className="bg-white px-6 sm:px-8 pt-6 pb-4 border-b border-gray-100">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <CardTitle className="text-lg font-bold text-gray-900">Your Campaigns</CardTitle>
                  </div>
                </div>
                <CardContent className="p-6">
                  <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="mb-6">
                    <TabsList className="bg-gray-100 p-1 rounded-lg">
                      <TabsTrigger value="all" className="rounded-md px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm cursor-pointer">All ({stats.total})</TabsTrigger>
                      <TabsTrigger value="active" className="rounded-md px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm cursor-pointer">Active ({stats.active + stats.planning})</TabsTrigger>
                      <TabsTrigger value="completed" className="rounded-md px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm cursor-pointer">Completed ({stats.completed})</TabsTrigger>
                    </TabsList>
                  </Tabs>
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
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-3 mb-3">
                                    <h3 className="font-bold text-lg text-gray-900 truncate group-hover:text-brand transition-colors">
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
                                      {/* [2026-07-09] End date = engagement TERM
                                          end (client covered_through); budget =
                                          engagement-terms total. Both fall back. */}
                                      <span>{formatDate(campaign.start_date)} - {formatDate(clientCoveredThrough ?? campaign.end_date)}</span>
                                    </div>
                                    {(clientBudgetTotal ?? campaign.total_budget) ? (
                                      <div className="flex items-center gap-2">
                                        <div className="p-1 bg-gray-100 rounded">
                                          <DollarSign className="h-3.5 w-3.5 text-gray-500" />
                                        </div>
                                        <span className="font-medium text-gray-700">{formatCurrency(clientBudgetTotal ?? campaign.total_budget)}</span>
                                      </div>
                                    ) : null}
                                    {/* [2026-07-09] KOLs / impressions / engagement removed
                                        from the portal campaign card per Andy — date + budget only. */}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <Button
                                    variant="outline"
                                    size="lg"
                                    className="rounded-lg border-gray-200 hover:border-brand transition-colors h-11 px-6 text-base font-semibold"
                                    onClick={() => {
                                      const url = campaign.slug
                                        ? `/public/campaigns/${campaign.slug}`
                                        : `/public/campaigns/${campaign.id}`;
                                      window.open(url, '_blank');
                                    }}
                                  >
                                    <ExternalLink className="h-5 w-5 mr-2" />
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
                                      className="rounded-lg bg-gradient-to-r from-brand to-[#2d6570] hover:from-[#2d6570] hover:to-[#1d4a52] shadow-md hover:shadow-lg transition-all"
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
              </div>
            )}
          </Card>
        )}

        {/* ─── [Campaign Live v1] Stats Row (4 cards) ──────────────────
            Per spec: KOLs Activated · Content Live · Impressions · Engagements.
            Order matters — spec is explicit that Content Live + KOLs Activated
            sit next to each other (positions 1 & 2).

            No denominators (spec: "KOLs Activated is just a flat number.
            Not 8/23. No denominator.").

            Trend arrows come from statsTrends (campaign_weekly_snapshots).
            Null = no prior snapshot to compare to → arrow hidden,
            "—" placeholder keeps card heights consistent. */}
        {isCampaignLiveMode && activeStats && (() => {
          // Inline trend renderer — keeps the 4 cards visually consistent.
          // Raw delta for counts; percentage for aggregates per spec.
          const renderTrend = (
            delta: number | null,
            mode: 'raw' | 'pct',
            unit?: string,
          ) => {
            if (delta === null) {
              return <p className="text-xs text-gray-400 mt-1">&nbsp;</p>;
            }
            if (delta === 0) {
              return <p className="text-xs text-gray-400 mt-1">No change this week</p>;
            }
            const up = delta > 0;
            const value =
              mode === 'pct'
                ? `${Math.abs(delta).toFixed(0)}%`
                : `${Math.abs(delta)}${unit ? ` ${unit}` : ''}`;
            return (
              <p className={`text-xs mt-1 font-medium ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
                {up ? '↑' : '↓'} {value} this week
              </p>
            );
          };
          return (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
              {/* 1. KOLs Activated — raw delta ("↑ 3 this week") */}
              <Card className="border border-gray-200 shadow-lg rounded-xl overflow-hidden">
                <CardContent className="p-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    KOLs Activated
                  </p>
                  <p className="text-3xl font-bold text-gray-900">{activeStats.kolsActivated}</p>
                  {renderTrend(statsTrends?.kolsActivatedDelta ?? null, 'raw')}
                </CardContent>
              </Card>
              {/* 2. Content Live — raw delta */}
              <Card className="border border-gray-200 shadow-lg rounded-xl overflow-hidden">
                <CardContent className="p-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Content Live
                  </p>
                  <p className="text-3xl font-bold text-gray-900">{activeStats.contentLive}</p>
                  {renderTrend(statsTrends?.contentLiveDelta ?? null, 'raw')}
                </CardContent>
              </Card>
              {/* 3. Views — % delta ("↑ 18%"). [2026-07-09] Label
                  standardized to "Views" to match the campaign page
                  (same underlying number was "Impressions" here). */}
              <Card className="border border-gray-200 shadow-lg rounded-xl overflow-hidden">
                <CardContent className="p-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Views
                  </p>
                  <p className="text-3xl font-bold text-gray-900">{formatNumber(activeStats.impressions)}</p>
                  {renderTrend(statsTrends?.impressionsPctDelta ?? null, 'pct')}
                </CardContent>
              </Card>
              {/* 4. Engagements — % delta */}
              <Card className="border border-gray-200 shadow-lg rounded-xl overflow-hidden">
                <CardContent className="p-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Engagements
                  </p>
                  <p className="text-3xl font-bold text-gray-900">{formatNumber(activeStats.engagements)}</p>
                  {renderTrend(statsTrends?.engagementsPctDelta ?? null, 'pct')}
                </CardContent>
              </Card>
            </div>
          );
        })()}

        {/* ─── [Campaign Live v1] This Week + Top Post 2-col row ──────
            Wrap both cards in a flex row: This Week wider on the left
            (~60%), Top Post narrower on the right (~40%) — mirrors the
            spec's "This Week | Top Post | Resources" layout (Resources
            stays in its existing position lower on the page for now).

            On mobile (< lg): stacks vertically.

            Edge cases: if one of them has no data, the other expands
            to fill the row via flex-1 (no awkward empty column). If
            neither has data, the whole wrapper is hidden. */}
        {isCampaignLiveMode && (thisWeekItems.length > 0 || topPost) && (
          <div className="flex flex-col lg:flex-row gap-6 mb-10">

            {/* ── This Week — left column (~60%) ── */}
            {thisWeekItems.length > 0 && (
              <Card className="flex-1 lg:basis-3/5 border border-gray-200 shadow-xl rounded-xl overflow-hidden">
                <CardContent className="p-6 sm:p-8">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="p-2 bg-gradient-to-br from-brand to-[#2d6570] rounded-xl shadow-lg">
                      <Activity className="h-5 w-5 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">This Week</h3>
                  </div>

                  <ul className="space-y-3">
                    {/* Sort by status per Andy 2026-06-19: pending items
                        first (current focus), done items grouped at the
                        bottom (already-crossed-out so the eye glides
                        past). Stable sort within each group preserves
                        the source order from the feed. */}
                    {[...thisWeekItems]
                      .sort((a, b) => {
                        const rank = (s: ThisWeekItem['status']) => s === 'done' ? 1 : 0;
                        return rank(a.status) - rank(b.status);
                      })
                      .map((it, i) => (
                        <li key={`now-${i}`} className="flex items-center gap-3">
                          <span
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              it.status === 'done' ? 'bg-emerald-500' : 'bg-orange-500'
                            }`}
                          />
                          <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                            {/* [2026-07-09 per Andy] No strikethrough — it
                                read as cancelled/done to clients. The dot
                                color (emerald = done, orange = pending) is
                                now the only status signal; the text stays
                                fully legible for every item. */}
                            <p className="text-sm leading-none text-gray-900">
                              {it.text}
                            </p>
                            {it.dateLabel && (
                              <p className="text-xs text-gray-400 flex-shrink-0 leading-none">{it.dateLabel}</p>
                            )}
                          </div>
                        </li>
                      ))}
                  </ul>

                  {/* "Coming Up" block removed 2026-06-09 to match
                      the v2 spec: "No 'Coming Up' section. Only this
                      week." The thisWeekItems builder no longer
                      produces 'upcoming' status items either, so the
                      old conditional was dead code. */}
                </CardContent>
              </Card>
            )}

            {/* ── Top Performing Post — right column (~40%) ──
                Auto-derived from `contents`. Spec calls this "the most
                persuasive element on the page — clients screenshot it."
                Compact layout to fit in the narrower column. */}
            {topPost && (
              <Card className="flex-1 lg:basis-2/5 border border-gray-200 shadow-xl rounded-xl overflow-hidden">
            <CardContent className="p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 bg-gradient-to-br from-brand to-[#2d6570] rounded-xl shadow-lg">
                  <Award className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Top Performing Post</h3>
              </div>

              {/* KOL name + handle/platform — primary identifier */}
              <p className="text-xl font-bold text-gray-900 leading-tight">{topPost.kolName}</p>
              {(extractHandleFromUrl(topPost.kolLink) || topPost.platform) && (
                <p className="text-sm text-gray-500 mt-1">
                  {extractHandleFromUrl(topPost.kolLink) && (
                    <span>@{extractHandleFromUrl(topPost.kolLink)}</span>
                  )}
                  {extractHandleFromUrl(topPost.kolLink) && topPost.platform && <span> · </span>}
                  {topPost.platform && <span>{topPost.platform}</span>}
                </p>
              )}

              {/* [2026-05-27] Replaced the static link / notes-quote card
                  with the embedded post itself via TopPostEmbed —
                  renders the real X/Twitter or Telegram post inline
                  using each platform's official widget. Falls back
                  gracefully to a clickable link card if the URL is
                  unparseable, the platform isn't supported, or the
                  embed script fails to load within 6s. Notes (if any)
                  surface in the fallback card as secondary commentary
                  rather than replacing the post link. Per audit:
                  100% of valid content_link rows are X or Telegram. */}
              <TopPostEmbed url={topPost.contentLink} notes={topPost.notes} />

              {/* 4 stats horizontal — Views/Reactions/Reposts/Replies per
                  the Andy 2026-06-19 platform-native vocab decision (spec
                  originally said "Likes" but UI standard is now
                  "Reactions" everywhere). */}
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <p className="text-2xl font-bold text-gray-900">{formatNumber(topPost.impressions)}</p>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mt-0.5">Views</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{formatNumber(topPost.likes)}</p>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mt-0.5">Reactions</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{formatNumber(topPost.retweets)}</p>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mt-0.5">Reposts</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{formatNumber(topPost.comments)}</p>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mt-0.5">Replies</p>
                </div>
              </div>
            </CardContent>
          </Card>
            )}
          </div>
        )}

        {/* Onboarding Banner — shows in EVERY phase whenever the form
            hasn't been submitted. Originally gated to kickoff phase
            only, but the team often sets up milestones (which moves
            portalPhase to 'discovery') BEFORE the client fills the
            form, which silently hid the banner. The form-prompt has
            to override anything else when not filled. */}
        {hasOnboardingResponse === false && onboardingFormSlug && (
          <Card className="border border-gray-200 shadow-xl rounded-xl overflow-hidden mb-10 bg-gradient-to-r from-brand/10 to-brand/5">
            <CardContent className="flex items-center justify-between py-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-brand to-[#2d6570] rounded-xl shadow-lg">
                  <FileText className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Complete Your Onboarding</h3>
                  <p className="text-sm text-gray-600">Help us get started by filling out your onboarding form.</p>
                </div>
              </div>
              <Button
                onClick={() => {
                  // Same tab (not _blank) + a return param so the form can send
                  // the client straight back to this portal after submitting
                  // [Andy 2026-07-17].
                  const ret = encodeURIComponent(window.location.pathname + window.location.search);
                  window.location.href = `${window.location.origin}/public/forms/${onboardingFormSlug}?client=${clientId}&return=${ret}`;
                }}
                className="bg-brand hover:bg-[#2d6570] text-white px-6"
              >
                Fill Out Form
                <ExternalLink className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Campaign Onboarding Milestones — only show after the client
            has submitted the onboarding form. Without this gate the
            action board appears alongside the "Complete Your Onboarding"
            banner above (line 1429), which contradicts itself: the
            banner says "fill the form" while the action board acts as
            if onboarding is already done.
            `hasOnboardingResponse === true` (not `!== false`) avoids a
            flash-of-wrong-content for un-onboarded clients during the
            initial check. checkOnboardingStatus() defaults to true on
            "no form configured" or transient errors, so the gate fails
            open in those cases. */}
        {/* HHP Onboarding Overhaul Spec § 8 critical #3 — "YOUR TASKS"
            hero card. Single most-valuable thing the portal can show:
            the client's outstanding to-dos from the active milestone
            surfaced as a prominent card above the milestone section.
            Renders only when there's an active milestone with at least
            one un-done client task. */}
        {(() => {
          if (!activeMilestone || isCampaignLiveMode || hasOnboardingResponse !== true) return null;
          const items = actionItems.filter(i =>
            i.milestone_id === activeMilestone.id
            && i.court === 'yours'
            && !i.is_done
          ).sort((a, b) => a.display_order - b.display_order);
          if (items.length === 0) return null;
          return (
            <Card id="section-your-tasks" className="border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-white shadow-xl rounded-xl overflow-hidden mb-6">
              <CardContent className="p-6 sm:p-7">
                <div className="flex items-start gap-4">
                  <div className="p-2.5 bg-orange-500 rounded-xl shadow-md flex-shrink-0">
                    <Activity className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-bold text-gray-900">What we need from you</h3>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                        {items.length} task{items.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mb-4">
                      To unlock the next step in <span className="font-medium">{activeMilestone.name}</span>.
                    </p>
                    <ul className="space-y-2.5">
                      {items.map(item => (
                        <li key={item.id} className="flex items-start gap-2.5">
                          <div className="w-4 h-4 rounded border-2 border-orange-400 bg-white flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800 leading-5">{item.text}</p>
                            {item.attachment_url && (
                              <a
                                href={item.attachment_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-brand hover:underline mt-0.5 inline-block"
                              >
                                {item.attachment_label || 'Open link'} ↗
                              </a>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* [Campaign Live v1] Hide the top-positioned milestone tracker
            once we're in Campaign Live mode. It re-appears at the bottom
            of the page as a collapsed row that can be expanded. */}
        {milestones.length > 0 && hasOnboardingResponse === true && !isCampaignLiveMode && (
          <Card id="section-milestones" className="border border-gray-200 shadow-xl rounded-xl overflow-hidden mb-10">
            <CardContent className="p-6 sm:p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-brand to-[#2d6570] rounded-xl shadow-lg">
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
                            <div className="absolute w-6 h-6 rounded-full bg-brand/20 animate-ping" style={{ animationDuration: '2s' }} />
                            <div className="absolute w-5 h-5 rounded-full bg-brand/10 animate-pulse" />
                            <div className="relative w-4 h-4 rounded-full border-[3px] border-brand bg-white" />
                          </div>
                        ) : (
                          <div className={`rounded-full ${isComplete ? 'w-3 h-3 bg-brand' : 'w-3 h-3 bg-gray-300'}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Milestone cards. HHP Onboarding Overhaul Spec § 8
                  critical #2 — vertical timeline. The relative
                  wrapper + absolute-positioned line creates a
                  connector running through the milestone icon column,
                  turning the stacked cards into a true timeline. The
                  line sits z-0 behind the icons; cards sit at z-10. */}
              <div className="relative space-y-3">
                {/* Vertical connector line — anchored where the icons
                    render (icon center = px-5 left padding (20px) +
                    half of w-8 (16px) = 36px from container edge).
                    Bottom inset prevents the line from poking past
                    the last milestone's icon. */}
                <div
                  className="absolute top-8 bottom-8 w-0.5 bg-gray-200 z-0"
                  style={{ left: '36px' }}
                  aria-hidden="true"
                />
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
                      className={`relative z-10 rounded-xl border transition-all ${isActive ? 'border-gray-300 bg-white shadow-md' : isComplete ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'}`}
                    >
                      {/* Header */}
                      <div
                        className="flex items-center gap-3 px-5 py-4 cursor-pointer"
                        onClick={() => setExpandedMilestoneId(isExpanded ? null : ms.id)}
                      >
                        {isComplete ? (
                          <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center flex-shrink-0">
                            <CheckCircle2 className="h-5 w-5 text-white" />
                          </div>
                        ) : isActive ? (
                          <div className="w-8 h-8 rounded-full bg-brand/10 border-2 border-brand flex items-center justify-center flex-shrink-0">
                            <div className="w-3 h-3 rounded-full bg-brand" />
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
                        <span className={`text-xs font-medium px-3 py-1 rounded-full ${isComplete ? 'bg-brand/10 text-brand' : isActive ? 'bg-orange-100 text-orange-700' : 'text-gray-400'}`}>
                          {isComplete ? 'Complete' : isActive ? 'Action needed' : 'Upcoming'}
                        </span>
                        {isUpcoming ? null : isExpanded ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
                      </div>

                      {/* Expanded content */}
                      {isExpanded && !isUpcoming && (
                        <div className="px-5 pb-5 space-y-4 border-t border-gray-100">
                          {/* HHP Onboarding Overhaul Spec § 4 — "Never
                              client-visible: HOLO HIVE internal tasks."
                              Was previously a two-column layout showing
                              HH tasks (oursItems) alongside the client's
                              tasks. Now shows only the client column;
                              internal tracking moved fully to the admin
                              /clients modal. */}
                          {yoursItems.length > 0 && (
                            <div className="pt-4">
                              {/* Removed HH column intentionally — see comment above */}
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
                                          <a href={item.attachment_url} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-xs text-brand hover:underline">
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
          <Card className="border border-gray-200 shadow-xl rounded-xl overflow-hidden mb-10">
            <CardContent className="p-6 sm:p-8 space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-brand to-[#2d6570] rounded-xl shadow-lg">
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
                    <div className="w-3 h-3 rounded-sm bg-brand" />
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
                            <div className="w-full max-w-[24px] bg-brand rounded-t-sm transition-all duration-500" style={{ height: `${(pct / 110) * 100}%` }} />
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
                            <div className="w-full max-w-[24px] bg-brand rounded-t-sm transition-all duration-500" style={{ height: `${barHeight}%` }} />
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


        {/* Stats Cards — discovery & tracker only.
            [2026-07-09 per Andy] Removed the 4-card stat strip above Form
            Submissions; gated off (not deleted) for easy restore. */}
        {false && showAdvancedSections && <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-10">
          <Card className="group relative hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-gray-200 shadow-lg overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-brand/5 to-brand/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            <CardContent className="pt-6 pb-5 relative">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Total Campaigns</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
                </div>
                <div className="p-3 bg-gradient-to-br from-brand to-[#2d6570] rounded-xl shadow-lg">
                  <Megaphone className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="group relative hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-gray-200 shadow-lg overflow-hidden">
            {/* [Portal v1] Stat card icons unified to brand (was: per-stat
                rainbow). Stats are still distinguishable via labels +
                numbers; the icon palette doesn't need to do that work. */}
            <div className="absolute inset-0 bg-gradient-to-br from-brand/5 to-brand/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            <CardContent className="pt-6 pb-5 relative">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Active</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.active}</p>
                </div>
                <div className="p-3 bg-gradient-to-br from-brand to-[#2d6570] rounded-xl shadow-lg">
                  <TrendingUp className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="group relative hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-gray-200 shadow-lg overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-brand/5 to-brand/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            <CardContent className="pt-6 pb-5 relative">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Planning</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.planning}</p>
                </div>
                <div className="p-3 bg-gradient-to-br from-brand to-[#2d6570] rounded-xl shadow-lg">
                  <Calendar className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="group relative hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-gray-200 shadow-lg overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-brand/5 to-brand/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            <CardContent className="pt-6 pb-5 relative">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Completed</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.completed}</p>
                </div>
                <div className="p-3 bg-gradient-to-br from-brand to-[#2d6570] rounded-xl shadow-lg">
                  <BarChart3 className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Live KOL Status Metrics — shown in discovery/tracker when KOLs exist */}
          {showAdvancedSections && kolRoster.length > 0 && (
            <>
              <Card className="group relative hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-gray-200 shadow-lg overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-brand/5 to-brand/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                <CardContent className="pt-6 pb-5 relative">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-1">KOLs Secured</p>
                      <p className="text-3xl font-bold text-gray-900">{kolsSecured}<span className="text-lg text-gray-400 font-normal">/{kolRoster.length}</span></p>
                    </div>
                    <div className="p-3 bg-gradient-to-br from-brand to-[#2d6570] rounded-xl shadow-lg">
                      <UserCheck className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="group relative hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 border border-gray-200 shadow-lg overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-brand/5 to-brand/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                <CardContent className="pt-6 pb-5 relative">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-1">Content Live</p>
                      <p className="text-3xl font-bold text-gray-900">{contentLive}</p>
                    </div>
                    <div className="p-3 bg-gradient-to-br from-brand to-[#2d6570] rounded-xl shadow-lg">
                      <Eye className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>}

        {/* Weekly Status Section — discovery & tracker only.
            [Campaign Live v1] Hidden in Live mode; replaced by the new
            "This Week" card below the hero (with status-dot bullets per
            spec). The data backing both is the same client_weekly_updates
            row — only the rendering differs. */}
        {showAdvancedSections && weeklyUpdates.length > 0 && !isCampaignLiveMode && (
          <Card className="border border-gray-200 shadow-xl rounded-xl overflow-hidden mb-10 border-l-4 border-l-brand">
            <CardHeader className="bg-white border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-brand to-[#2d6570] rounded-xl shadow-lg">
                  <Activity className="h-5 w-5 text-white" />
                </div>
                <CardTitle className="text-lg font-bold text-gray-900">What's Active Now</CardTitle>
                <span className="text-sm text-gray-500">Week of {fmtDate(weeklyUpdates[0].week_of + 'T00:00:00')}</span>
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
                          <span className="text-brand mt-0.5">•</span>
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
                      <p className="text-sm text-gray-700 font-medium">{fmtDate(weeklyUpdates[0].next_checkin + 'T00:00:00')}</p>
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
                      className="flex items-center gap-1 text-sm text-brand hover:text-[#2d6570] font-medium"
                    >
                      {showPreviousUpdates ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      {showPreviousUpdates ? 'Hide' : 'Show'} Previous Updates ({weeklyUpdates.length - 1})
                    </button>
                    {showPreviousUpdates && (
                      <div className="mt-3 space-y-3">
                        {weeklyUpdates.slice(1).map((update) => (
                          <div key={update.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                            <p className="text-xs text-gray-400 mb-1">Week of {fmtDate(update.week_of + 'T00:00:00')}</p>
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
        {showAdvancedSections && (formSubmissions.length > 0 || (clientContext && (clientContext.telegram_url || clientContext.shared_drive_url || clientContext.gtm_sync_url || clientContext.kol_content_brief_url)) || clientLinks.length > 0 || formAttachments.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
            {/* Form Submissions */}
            {formSubmissions.length > 0 && (
              <Card className="border border-gray-200 shadow-xl rounded-xl overflow-hidden h-full">
                <CardHeader className="bg-white border-b border-gray-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-brand to-[#2d6570] rounded-xl shadow-lg">
                      <ClipboardList className="h-5 w-5 text-white" />
                    </div>
                    <CardTitle className="text-lg font-bold text-gray-900">Form Submissions</CardTitle>
                    <span className="text-sm text-gray-500">({formSubmissions.length})</span>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Submitted Forms</h4>
                  <div className="space-y-3">
                    {(showAllForms ? formSubmissions : formSubmissions.slice(0, 4)).map((sub) => (
                      <div
                        key={sub.id}
                        onClick={() => setViewingSubmission(sub)}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-brand/5 border border-gray-100 hover:border-brand/30 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-brand" />
                          <div>
                            <p className="text-sm font-semibold text-gray-900 group-hover:text-brand">{sub.formName}</p>
                            <p className="text-xs text-gray-500">
                              {fmtDate(sub.submittedAt)}
                            </p>
                          </div>
                        </div>
                        {sub.attachments.length > 0 && (
                          <Badge variant="secondary" className="text-xs bg-brand/10 text-brand">
                            {sub.attachments.length} {sub.attachments.length === 1 ? 'file' : 'files'}
                          </Badge>
                        )}
                      </div>
                    ))}
                    {formSubmissions.length > 4 && (
                      <button
                        type="button"
                        onClick={() => setShowAllForms(v => !v)}
                        className="w-full text-center text-xs font-medium text-brand hover:text-brand-dark py-1.5"
                      >
                        {showAllForms ? 'Show less' : `Show all ${formSubmissions.length}`}
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Resources */}
            {((clientContext && (clientContext.telegram_url || clientContext.shared_drive_url || clientContext.gtm_sync_url || clientContext.kol_content_brief_url)) || clientLinks.length > 0 || formAttachments.length > 0) && (
              <Card id="section-resources" className="border border-gray-200 shadow-xl rounded-xl overflow-hidden h-full">
                <CardHeader className="bg-white border-b border-gray-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-brand to-[#2d6570] rounded-xl shadow-lg">
                      <LinkIcon className="h-5 w-5 text-white" />
                    </div>
                    <CardTitle className="text-lg font-bold text-gray-900">Resources</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  {/* [2026-07-10] The fixed context links (Telegram / Brand
                      Assets / GTM / KOL Content Brief) and the client resource
                      links share ONE cap of 4 — the context links count toward
                      it. Show all/less reveals the rest. */}
                  {(() => {
                    const items: Array<{ key: string; href: string; icon: JSX.Element; wrap: string; title: string; subtitle?: string }> = [];
                    if (clientContext?.telegram_url) items.push({ key: 'ctx-tg', href: clientContext.telegram_url, icon: <Send className="h-5 w-5 text-blue-600" />, wrap: 'bg-blue-100 group-hover:bg-blue-200', title: 'Telegram Group', subtitle: 'Open chat' });
                    if (clientContext?.shared_drive_url) items.push({ key: 'ctx-drive', href: clientContext.shared_drive_url, icon: <FolderOpen className="h-5 w-5 text-emerald-600" />, wrap: 'bg-emerald-100 group-hover:bg-emerald-200', title: 'Brand Assets', subtitle: 'View files' });
                    if (clientContext?.gtm_sync_url) items.push({ key: 'ctx-gtm', href: clientContext.gtm_sync_url, icon: <Globe className="h-5 w-5 text-purple-600" />, wrap: 'bg-purple-100 group-hover:bg-purple-200', title: 'GTM Overview', subtitle: 'View plan' });
                    if (clientContext?.kol_content_brief_url) items.push({ key: 'ctx-brief', href: clientContext.kol_content_brief_url, icon: <FileText className="h-5 w-5 text-amber-600" />, wrap: 'bg-amber-100 group-hover:bg-amber-200', title: 'KOL Content Brief', subtitle: 'Open brief' });
                    for (const link of clientLinks) items.push({ key: link.id, href: link.url, icon: <LinkIcon className="h-5 w-5 text-brand" />, wrap: 'bg-brand-light group-hover:bg-[#d4edef]', title: link.name, subtitle: link.description || undefined });
                    if (items.length === 0) return null;
                    const shown = showAllLinks ? items : items.slice(0, 4);
                    return (
                      <div className="space-y-3">
                        {shown.map(it => (
                          <a
                            key={it.key}
                            href={it.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-brand/5 hover:border-brand/20 border border-gray-100 transition-all group"
                          >
                            <div className={`p-2 rounded-lg transition-colors ${it.wrap}`}>{it.icon}</div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 group-hover:text-brand truncate">{it.title}</p>
                              {it.subtitle && <p className="text-xs text-gray-500 truncate">{it.subtitle}</p>}
                            </div>
                            <ExternalLink className="h-4 w-4 text-gray-400 ml-auto group-hover:text-brand flex-shrink-0" />
                          </a>
                        ))}
                        {items.length > 4 && (
                          <button
                            type="button"
                            onClick={() => setShowAllLinks(v => !v)}
                            className="w-full text-center text-xs font-medium text-brand hover:text-brand-dark py-1.5"
                          >
                            {showAllLinks ? 'Show less' : `Show all ${items.length}`}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                  {formAttachments.length > 0 && (
                    <div className={(clientContext && (clientContext.telegram_url || clientContext.shared_drive_url || clientContext.gtm_sync_url || clientContext.kol_content_brief_url)) || clientLinks.length > 0 ? 'mt-6 pt-6 border-t border-gray-100' : ''}>
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Uploaded Files</h4>
                      <div className="space-y-3">
                        {(showAllFiles ? formAttachments : formAttachments.slice(0, 4)).map((att, i) => {
                          const ext = att.fileName.split('.').pop()?.toLowerCase() || '';
                          const isPdf = ext === 'pdf';
                          const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
                          const isDoc = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext);
                          const iconColor = isPdf ? 'text-rose-500 bg-rose-100' : isImage ? 'text-blue-500 bg-blue-100' : isDoc ? 'text-indigo-500 bg-indigo-100' : 'text-gray-500 bg-gray-100';
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
                                {/* [2026-07-09] Clean title instead of the raw
                                    storage key; subtitle is the file type, NOT
                                    the internal onboarding-checklist field label
                                    (which was leaking to the client). */}
                                <p className="text-sm font-medium text-gray-800 truncate">{friendlyFileTitle(att.fileName)}</p>
                                <p className="text-xs text-gray-400 uppercase tracking-wide">{ext || 'file'}</p>
                              </div>
                              <ExternalLink className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            </a>
                          );
                        })}
                        {formAttachments.length > 4 && (
                          <button
                            type="button"
                            onClick={() => setShowAllFiles(v => !v)}
                            className="w-full text-center text-xs font-medium text-brand hover:text-brand-dark py-1.5"
                          >
                            {showAllFiles ? 'Show less' : `Show all ${formAttachments.length}`}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {/* Document Portal — shared hosted PDFs with tracked in-portal
                      viewing. Self-contained; renders nothing when there are none. */}
                  <PortalDocumentsCard portalId={idOrSlug} email={email} />
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Form Submission Detail Dialog */}
        {/* [Portal v1] Form Submission popup — restyled to match the
            Meeting Note popup pattern: brand left-border accent, gradient
            icon container in header, consistent gray-50 field cards,
            brand-color hover states (not orange). */}
        <Dialog open={!!viewingSubmission} onOpenChange={() => setViewingSubmission(null)}>
          <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-hidden border-l-4 border-l-brand rounded-xl">
            <DialogHeader className="pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-brand to-[#2d6570] rounded-xl shadow-lg">
                  <ClipboardList className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-xl font-bold text-gray-900 leading-tight">
                    {viewingSubmission?.formName}
                  </DialogTitle>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>
                      Submitted{' '}
                      {viewingSubmission && fmtDate(viewingSubmission.submittedAt)}
                    </span>
                  </div>
                </div>
              </div>
            </DialogHeader>
            {viewingSubmission && (() => {
              // [Portal v1] Group attachments under their parent field card.
              // Attachments arrive with `.label` set to the field label they
              // were uploaded for (see fetchFormSubmissions). Merge them so
              // each field shows its text answer + its files together in one
              // card, instead of two disconnected sections.
              //
              // Fields without text answers but with attachments still get
              // their own card (orphan-label loop below).
              const attsByLabel = new Map<string, typeof viewingSubmission.attachments>();
              for (const att of viewingSubmission.attachments) {
                if (!attsByLabel.has(att.label)) attsByLabel.set(att.label, []);
                attsByLabel.get(att.label)!.push(att);
              }
              const fieldLabels = new Set(viewingSubmission.fields.map(f => f.label));
              type Item = {
                label: string;
                answer: string | null;
                atts: typeof viewingSubmission.attachments;
              };
              const items: Item[] = viewingSubmission.fields.map(f => ({
                label: f.label,
                answer: f.answer,
                atts: attsByLabel.get(f.label) || [],
              }));
              // Orphan attachments (label didn't match any answered field)
              attsByLabel.forEach((atts, label) => {
                if (!fieldLabels.has(label)) {
                  items.push({ label, answer: null, atts });
                }
              });

              return (
                <div className="overflow-y-auto max-h-[60vh] pr-2 pt-4 space-y-3">
                  {items.map((it, i) => (
                    <div key={i} className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        {it.label}
                      </p>
                      {it.answer && (
                        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                          {it.answer}
                        </p>
                      )}
                      {it.atts.length > 0 && (
                        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 ${it.answer ? 'mt-3' : ''}`}>
                          {it.atts.map((att, j) => {
                            const ext = att.fileName.split('.').pop()?.toLowerCase() || '';
                            const isPdf = ext === 'pdf';
                            const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
                            const isDoc = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext);
                            const iconColor = isPdf
                              ? 'text-rose-500 bg-rose-100'
                              : isImage
                              ? 'text-blue-500 bg-blue-100'
                              : isDoc
                              ? 'text-indigo-500 bg-indigo-100'
                              : 'text-gray-500 bg-gray-100';
                            return (
                              <a
                                key={j}
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                // Nested-card surface: bg-white (instead of
                                // gray-50) for contrast against the parent
                                // gray-50 field card.
                                className="flex items-center gap-3 p-2.5 bg-white rounded-lg hover:bg-brand/5 border border-gray-200 hover:border-brand/30 transition-all group"
                              >
                                <div className={`p-2 rounded-lg ${iconColor} flex-shrink-0`}>
                                  {isImage ? <ImageIcon className="h-4 w-4" /> : <File className="h-4 w-4" />}
                                </div>
                                <p className="text-sm font-medium text-gray-800 truncate group-hover:text-brand flex-1">
                                  {att.fileName}
                                </p>
                                <Download className="h-4 w-4 text-gray-400 group-hover:text-brand flex-shrink-0" />
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Deliverables Progress — visible when client has deliverables */}
        {clientDeliverables.length > 0 && (
          <Card id="section-deliverables" className="border border-gray-200 shadow-xl rounded-xl overflow-hidden mt-10">
            <CardContent className="p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-gradient-to-br from-brand to-[#2d6570] rounded-xl shadow-lg">
                  <ClipboardList className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Active Workflows</h3>
              </div>

              <div className="space-y-4">
                {clientDeliverables.map(d => {
                  const progressPct = d.totalSteps > 0 ? (d.completedSteps / d.totalSteps) * 100 : 0;
                  return (
                    <div key={d.id} className="bg-gray-50 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{d.title}</div>
                          <div className="text-xs text-gray-500">{d.templateName}</div>
                        </div>
                        <Badge className={`border-0 text-[10px] ${
                          d.status === 'complete' ? 'bg-emerald-50 text-emerald-600' :
                          d.status === 'cancelled' ? 'bg-gray-50 text-gray-500' :
                          'bg-blue-50 text-blue-600'
                        }`}>
                          {d.status === 'complete' ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <Circle className="h-3 w-3 mr-1" />}
                          {d.status === 'complete' ? 'Complete' : d.status === 'cancelled' ? 'Cancelled' : 'In Progress'}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                        <span>{d.completedSteps} of {d.totalSteps} steps complete</span>
                        <span>{Math.round(progressPct)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${progressPct}%`, backgroundColor: d.templateColor || '#3e8692' }}
                        />
                      </div>

                      {(d.startDate || d.targetCompletion) && (
                        <div className="flex items-center justify-between mt-2 text-[10px] text-gray-400">
                          {d.startDate && <span>Started {fmtDate(d.startDate + 'T00:00:00')}</span>}
                          {d.targetCompletion && <span>Target {fmtDate(d.targetCompletion + 'T00:00:00')}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Campaigns Section — discovery & tracker only.
            Suppressed when the Active Campaign hero is rendered (Campaign
            Live mode), since this content is now merged inline above
            per Andy 2026-06-19. Kept for non-Campaign-Live paths so
            clients without an active campaign still see their list. */}
        {showAdvancedSections && !(isCampaignLiveMode && activeCampaign) && <Card id="section-campaigns" className="border border-gray-200 shadow-xl rounded-xl overflow-hidden mt-10">
          <CardHeader className="bg-white border-b border-gray-100 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle className="text-lg font-bold text-gray-900">Your Campaigns</CardTitle>
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
                              <h3 className="font-bold text-lg text-gray-900 truncate group-hover:text-brand transition-colors">
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
                                  <Eye className="h-4 w-4 text-brand" />
                                  <span className="text-gray-600">
                                    <span className="font-semibold text-gray-900">{formatNumber(campaign.total_impressions)}</span> impressions
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <TrendingUp className="h-4 w-4 text-emerald-500" />
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
                              className="rounded-lg border-gray-200 hover:border-brand transition-colors"
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
                                className="rounded-lg bg-gradient-to-r from-brand to-[#2d6570] hover:from-[#2d6570] hover:to-[#1d4a52] shadow-md hover:shadow-lg transition-all"
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
        {portalPhase === 'tracker' && onboardingComplete && kolRoster.length > 0 && (
          <Card id="section-kol-roster" className="border border-gray-200 shadow-xl rounded-xl overflow-hidden mt-10">
            <CardHeader className="bg-white border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-brand to-[#2d6570] rounded-xl shadow-lg">
                  <Users className="h-5 w-5 text-white" />
                </div>
                <CardTitle className="text-lg font-bold text-gray-900">KOL Roster</CardTitle>
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
                          <Megaphone className="h-4 w-4 text-brand" />
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
                                <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Views</th>
                                <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Engagement</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {kols.map((kol) => (
                                <tr key={kol.id} className="hover:bg-gray-50">
                                  <td className="py-2.5 px-3">
                                    {kol.link ? (
                                      <a href={kol.link} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline font-medium">
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
                                          <a key={i} href={link} target="_blank" rel="noopener noreferrer" className="text-brand hover:text-[#2d6570]">
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
        {showAdvancedSections && meetingNotes.length > 0 && (
          <Card className="border border-gray-200 shadow-xl rounded-xl overflow-hidden mt-10">
            <CardHeader className="bg-white border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-brand to-[#2d6570] rounded-xl shadow-lg">
                  <StickyNote className="h-5 w-5 text-white" />
                </div>
                <CardTitle className="text-lg font-bold text-gray-900">Meeting Notes</CardTitle>
                <span className="text-sm text-gray-500">({meetingNotes.length})</span>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                {meetingNotes.map((note, index) => (
                  <div
                    key={note.id}
                    className="group bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 overflow-hidden border-l-4 border-l-brand cursor-pointer"
                    style={{ animationDelay: `${index * 50}ms` }}
                    onClick={() => setViewingNote(note)}
                  >
                    <div className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-lg text-gray-900 truncate group-hover:text-brand transition-colors">
                            {note.title}
                          </h3>
                          <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                            <div className="p-1 bg-gray-100 rounded">
                              <Calendar className="h-3.5 w-3.5 text-gray-500" />
                            </div>
                            <span>{fmtDate(note.meeting_date + 'T00:00:00')}</span>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg border-gray-200 hover:border-brand transition-colors flex-shrink-0 ml-4"
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
          <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-hidden border-l-4 border-l-brand rounded-xl">
            <DialogHeader className="pb-4 border-b border-gray-100">
              <DialogTitle className="text-xl font-bold text-gray-900">{viewingNote?.title}</DialogTitle>
              <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                <div className="p-1 bg-gray-100 rounded">
                  <Calendar className="h-3.5 w-3.5 text-gray-500" />
                </div>
                <span>
                  {viewingNote && fmtDate(viewingNote.meeting_date + 'T00:00:00')}
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
        {showAdvancedSections && decisionLog.length > 0 && (
          <Card className="border border-gray-200 shadow-xl rounded-xl overflow-hidden mt-10">
            <CardHeader className="bg-white border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-brand to-[#2d6570] rounded-xl shadow-lg">
                  <MessageSquare className="h-5 w-5 text-white" />
                </div>
                <CardTitle className="text-lg font-bold text-gray-900">Decision Log</CardTitle>
                <span className="text-sm text-gray-500">({decisionLog.length})</span>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-3">
                {decisionLog.map((dec) => (
                  <div key={dec.id} className="flex items-start gap-4 border-l-4 border-l-purple-300 pl-4 py-2">
                    <div className="text-xs text-gray-400 whitespace-nowrap mt-0.5">
                      {fmtDate(dec.decision_date + 'T00:00:00')}
                    </div>
                    <p className="text-sm text-gray-700">{dec.summary}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}


        {/* ─── [Campaign Live v1] Collapsed Onboarding Row ──────────────
            In Campaign Live mode, the milestone tracker is hidden from
            its usual position at the top of the page and re-appears
            here as a collapsed card. Click to expand and review the
            completed onboarding history.

            Visual: mirrors the existing "Campaign Onboarding" tracker
            header (same Card shell, same brand-gradient icon container,
            same title styling, same right-side meta block) — so it
            reads as the SAME section, just compressed. Chevron toggles
            the disclosure.

            Default state: collapsed. Reads existing milestone data —
            zero maintenance. */}
        {isCampaignLiveMode && milestones.length > 0 && (
          <Card className="border border-gray-200 shadow-xl rounded-xl overflow-hidden mt-10">
            <button
              type="button"
              onClick={() => setOnboardingExpandedInLiveMode(prev => !prev)}
              aria-expanded={onboardingExpandedInLiveMode}
              className="w-full text-left hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between px-6 sm:px-8 py-5">
                {/* Left: same icon + title as the active onboarding tracker */}
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-brand to-[#2d6570] rounded-xl shadow-lg">
                    <Activity className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Campaign Onboarding</h3>
                </div>
                {/* Right: same meta layout as the active tracker, just
                    swapped "X of Y milestones complete" for the post-
                    completion equivalent. */}
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-emerald-600">All complete</p>
                    <p className="text-xs text-gray-500">
                      {completedMilestones} of {milestones.length} milestones
                      {onboardingCompletedAt ? ` · Completed ${formatDate(onboardingCompletedAt)}` : ''}
                    </p>
                  </div>
                  {onboardingExpandedInLiveMode ? (
                    <ChevronUp className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  )}
                </div>
              </div>
            </button>

            {/* Expanded view — simple milestone list using the SAME
                brand-colored circular check icon the active tracker uses
                for its "complete" state (line ~1690), so completed items
                look identical in both contexts.

                Not the full action-item drill-down — that's onboarding-
                mode behavior; here we're in reference-only mode. */}
            {onboardingExpandedInLiveMode && (
              <CardContent className="px-6 sm:px-8 pb-6 pt-4 border-t border-gray-100">
                <div className="space-y-3">
                  {milestones.map(ms => (
                    <div key={ms.id} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0 pt-1">
                        <p className="text-sm font-semibold text-gray-900">{ms.name}</p>
                        {ms.subtitle && (
                          <p className="text-xs text-gray-500 mt-0.5">{ms.subtitle}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
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
          </>
        )}
      </main>

    </div>
  );
}
