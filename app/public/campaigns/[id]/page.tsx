'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { createClient } from '@supabase/supabase-js';
import { List, Megaphone, Building2, DollarSign, Calendar as CalendarIcon, Users, BarChart3, Table as TableIcon, CreditCard, CheckCircle, Globe, Flag, FileText, Search, ChevronDown, ArrowUp, ArrowDown, ArrowUpDown, ExternalLink } from 'lucide-react';
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
  // Section 3.1 of HHP Campaign Dashboard Spec: client logo replaces
  // the generic megaphone icon in the slim hero. Pulled via the
  // clients FK join.
  client_logo_url?: string | null;
  budget_allocations?: { id: string; region: string; allocated_budget: number }[];
  share_creator_type?: boolean | null;
  share_kol_notes?: boolean | null;
  share_content_notes?: boolean | null;
  // Section 9 — showcase mode. When the page is opened with a
  // matching ?showcase=<token> URL param and showcase_enabled is true,
  // the email gate is bypassed and showcase_config masks render
  // accordingly. The token IS the auth; revocation = clearing it.
  showcase_enabled?: boolean;
  showcase_token?: string | null;
  showcase_config?: ShowcaseConfig | null;
};

type ShowcaseConfig = {
  hide_client_identity?: boolean;
  hide_kol_handles?: boolean;
  hide_budget?: boolean;
  hide_notes?: boolean;
};

/**
 * Section 4 — Activation Results data shape.
 *
 * The snapshot itself is just metadata + 5 JSONB blobs; the UI
 * components render only when their corresponding blob is present.
 * The blob shapes are intentionally loose — the activation portal
 * spec hasn't pinned them yet, and the Fogo-style components only
 * read a handful of well-named keys (entries, participants, etc.)
 * so the contract is forgiving.
 */
type ActivationSnapshot = {
  id: string;
  campaign_id: string;
  activation_name: string | null;
  activation_type: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  // Section 4.2 endpoint blobs.
  summary_json: SummaryBlob | null;
  entries_daily_json: EntriesDailyBlob | null;
  entries_by_kol_json: EntriesByKolBlob | null;
  clicks_json: ClicksBlob | null;
  ugc_json: UgcBlob | null;
  synced_at: string;
};

type SummaryBlob = {
  // KPI headlines — every key is optional; the UI renders cards
  // for whichever ones are present.
  total_entries?: number;
  unique_participants?: number;
  kols_activated?: number;
  wallets_registered?: number;
  cards_minted?: number;
  frames_created?: number;
  // For sublabel context lines like "60% of registered wallets".
  context_sublabels?: Record<string, string>;
  // Section 4.1 hero meta — duplicates the top-level columns but
  // some portals nest them inside summary.
  target_market?: string;
  // Section 4.1 Points/Prizes block.
  prize_pool?: string | number;
  draw_structure?: string;
  points_by_source?: Array<{ source: string; points: number }>;
};
type EntriesDailyBlob = Array<{ date: string; entries: number }>;
type EntriesByKolBlob = Array<{
  // Either kol_id or label is enough — kol_id lets us map to the
  // campaign_kols table for masked names, label is the portal's
  // pre-baked display name.
  kol_id?: string;
  label?: string;
  entries: number;
}>;
type ClicksBlob = {
  by_protocol?: Array<{ protocol: string; clicks: number }>;
  by_source?: Array<{ source: string; clicks: number }>;
  total_referrals?: number;
};
type UgcBlob = {
  posts_approved?: number;
  creators?: number;
  approval_rate?: number;
  views?: number;
  top_post?: {
    creator_label?: string;
    snippet?: string;
    views?: number;
    likes?: number;
    link?: string;
  };
};

type CampaignKOL = {
  id: string;
  hh_status: string | null;
  client_status: string | null;
  allocated_budget: number | null;
  budget_type: string | null;
  notes: string | null;
  // Section 5.2 — approved client-facing one-line bio per KOL per
  // campaign. NULL = team hasn't reviewed yet → column hides until
  // approved.
  profile_note: string | null;
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
  notes: string | null;
  // Section 3.1: drives the page-footer "Data as of …" snapshot
  // line. Picked as the max across rendered content so the stamp
  // reflects when the most recent metric pull landed.
  updated_at?: string | null;
  // [Spec 7.5] Tag assignments joined via content_tag_assignments.
  // The public page renders client-visibility tags as inline badges
  // before the Notes text; internal tags are filtered out at render.
  content_tag_assignments?: Array<{
    id: string;
    sequence_n: number | null;
    sequence_of: number | null;
    multipost_group_id: string | null;
    tag: {
      id: string;
      name: string;
      visibility: 'client' | 'internal';
      color: string | null;
    } | null;
  }> | null;
};

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

// KOL workflow stages, in journey order — used by the default Status
// sort so rows appear Curated → Contacted → Interested → Onboarded →
// Concluded (natural pipeline order). Mirrors the admin tracker at
// app/campaigns/[id]/page.tsx; keep both in sync.
const KOL_STATUS_ORDER = ['Curated', 'Contacted', 'Interested', 'Onboarded', 'Concluded'] as const;
const KOL_STATUS_ORDER_INDEX = (s: string | null | undefined): number => {
  if (!s) return KOL_STATUS_ORDER.length; // unknown → end of list
  const idx = KOL_STATUS_ORDER.indexOf(s as any);
  return idx === -1 ? KOL_STATUS_ORDER.length : idx;
};

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
    // ─── Spec types (HHP Creator Taxonomy Spec, 2026-05) ───
    'Native':    'bg-orange-100 text-orange-800',
    'Scout':     'bg-sky-100 text-sky-800',
    'Tracker':   'bg-slate-100 text-slate-800',
    'Analyst':   'bg-cyan-100 text-cyan-800',
    'Educator':  'bg-blue-100 text-blue-800',
    'Visionary': 'bg-indigo-100 text-indigo-800',
    'Onboarder': 'bg-teal-100 text-teal-800',
    'Curator':   'bg-lime-100 text-lime-800',
    // ─── Legacy values (kept for backward-compat) ───
    'Native (Meme/Culture)': 'bg-purple-100 text-purple-800',
    'Drama-Forward':  'bg-rose-100 text-rose-800',
    'Skeptic':        'bg-orange-100 text-orange-800',
    'Bridge Builder': 'bg-emerald-100 text-emerald-800',
    'General':  'bg-gray-100 text-gray-800',
    'Gaming':   'bg-pink-100 text-pink-800',
    'Crypto':   'bg-yellow-100 text-yellow-800',
    'Memecoin': 'bg-orange-100 text-orange-800',
    'NFT':      'bg-purple-100 text-purple-800',
    'Trading':  'bg-emerald-100 text-emerald-800',
    'AI':       'bg-blue-100 text-blue-800',
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
    Video: 'bg-rose-100 text-rose-800',
    Article: 'bg-emerald-100 text-emerald-800',
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
    case 'contacted':
      return 'bg-purple-100 text-purple-800';
    case 'interested':
      return 'bg-yellow-100 text-yellow-800';
    case 'onboarded':
      return 'bg-orange-100 text-orange-800';
    case 'concluded':
      return 'bg-emerald-100 text-emerald-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
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

export default function PublicCampaignPage({ params }: { params: { id: string } }) {
  const campaignId = params.id;
  // Showcase mode — Spec section 9. Detect ?showcase=<token> in the URL
  // on mount so we can fetch the campaign by token instead of by id/slug
  // and skip the email gate. Captured once via window.location so the
  // page-level Suspense boundary isn't required (no useSearchParams).
  const [showcaseToken, setShowcaseToken] = useState<string | null>(null);
  const [showcaseActive, setShowcaseActive] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = new URLSearchParams(window.location.search).get('showcase');
    if (t) setShowcaseToken(t);
  }, []);

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [kols, setKols] = useState<CampaignKOL[]>([]);
  const [contents, setContents] = useState<ContentItem[]>([]);
  // Section 4 — most recent activation snapshot for this campaign.
  // The Activation Results UI renders only when this is non-null.
  // Missing column (legacy DB) or no row both yield null; the UI
  // section just doesn't render and nothing in the rest of the
  // page depends on this state.
  const [activation, setActivation] = useState<ActivationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Showcase masking helpers. Centralized so the spec's per-flag
  // behavior reads the same wherever it's applied. When the page
  // isn't in showcase mode (typical path), every getter returns the
  // real value. Spec section 9 — defaults to all-hidden so the first
  // share never leaks anything sensitive.
  const cfg: ShowcaseConfig | null = showcaseActive ? (campaign?.showcase_config || null) : null;
  const mask = {
    clientIdentity: !!cfg?.hide_client_identity,
    kolHandles:     !!cfg?.hide_kol_handles,
    budget:         !!cfg?.hide_budget,
    notes:          !!cfg?.hide_notes,
  };
  const maskedKolName = (originalName: string, idx: number): string =>
    mask.kolHandles ? `KOL #${idx + 1}` : originalName;
  // Effective notes visibility — share_content_notes is the team's
  // intent ("show notes to the client"), masked to false when
  // showcase mode hides notes (Section 9 default).
  const notesVisible = !!campaign?.share_content_notes && !mask.notes;

  const [kolViewMode, setKolViewMode] = useState<'overview' | 'table' | 'cards'>('table');
  const [contentViewMode, setContentViewMode] = useState<'table' | 'overview'>('table');
  const [email, setEmail] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [clientEmail, setClientEmail] = useState<string | null>(null);
  const [approvedEmails, setApprovedEmails] = useState<string[]>([]);
  const [approvedDomains, setApprovedDomains] = useState<string[]>([]);
  const [loadingClientEmail, setLoadingClientEmail] = useState(true);
  const [campaignUuid, setCampaignUuid] = useState<string | null>(null);

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

  // ── Sortable column state ────────────────────────────────────────
  // Mirrors the KOL Dashboard pattern from /campaigns/[id]/page.tsx:
  // three-state cycle per column (asc → desc → cleared). Stable
  // ordering for equal-key rows is guaranteed by a
  // decorate-sort-undecorate pass below.
  type KolSortKey =
    | 'name' | 'platform' | 'followers' | 'region' | 'creator_type'
    | 'hh_status' | 'content_count';
  type ContentSortKey =
    | 'kol' | 'platform' | 'type' | 'status' | 'activation_date'
    | 'impressions' | 'likes' | 'retweets' | 'comments' | 'bookmarks';

  // Default: sort by Status (hh_status) in workflow order — see
  // KOL_STATUS_ORDER below. Surfaces in-progress KOLs together rather
  // than scattering them through an alphabetical / insertion-order list.
  const [kolSort, setKolSort] = useState<{ key: KolSortKey | null; dir: 'asc' | 'desc' }>({ key: 'hh_status', dir: 'asc' });
  const [contentSort, setContentSort] = useState<{ key: ContentSortKey | null; dir: 'asc' | 'desc' }>({ key: null, dir: 'asc' });

  const toggleKolSort = (key: KolSortKey) => {
    setKolSort(prev => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: null, dir: 'asc' };
    });
  };
  const toggleContentSort = (key: ContentSortKey) => {
    setContentSort(prev => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: null, dir: 'asc' };
    });
  };

  // Tiny sort indicator — directional arrow when active, faint
  // bidirectional arrow when not (telegraphs the column is sortable).
  const sortIcon = (active: boolean, dir: 'asc' | 'desc') => active
    ? (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
    : <ArrowUpDown className="h-3 w-3 opacity-30 group-hover:opacity-60" />;

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
    // Get KOL - if KOL is hidden (not in kols array), exclude this content
    const kol = kols.find(k => k.id === content.campaign_kols_id);

    // Only show content for visible (non-hidden) KOLs
    if (content.campaign_kols_id && !kol) return false;

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

  // ── Apply column sort to the filtered arrays ─────────────────────
  // Nullish always sorts last on asc (and first on desc as a natural
  // consequence) — that keeps "—" rows out of the user's way when
  // they're scanning for the biggest / smallest values.
  const compareNullable = (a: any, b: any, dirMul: number): number => {
    const aMissing = a === null || a === undefined || a === '';
    const bMissing = b === null || b === undefined || b === '';
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;
    if (typeof a === 'number' && typeof b === 'number') return (a - b) * dirMul;
    return String(a).localeCompare(String(b)) * dirMul;
  };

  const sortedKOLs = (() => {
    if (!kolSort.key) return filteredKOLs;
    const dirMul = kolSort.dir === 'asc' ? 1 : -1;
    // Pre-compute content counts per KOL so the comparator stays cheap.
    const contentCountByKolId = new Map<string, number>();
    for (const c of contents) {
      if (c.campaign_kols_id) {
        contentCountByKolId.set(c.campaign_kols_id, (contentCountByKolId.get(c.campaign_kols_id) || 0) + 1);
      }
    }
    const pull = (row: any): any => {
      switch (kolSort.key) {
        case 'name':         return row.master_kol?.name || '';
        case 'platform':     return (row.master_kol?.platform || []).join(', ');
        case 'followers':    return row.master_kol?.followers ?? null;
        case 'region':       return row.master_kol?.region || '';
        case 'creator_type': return (row.master_kol?.creator_type || []).join(', ');
        // Sort by workflow stage (KOL_STATUS_ORDER), not alphabetically.
        // Mirrors the admin /campaigns/[id]/page.tsx behavior.
        case 'hh_status':    return KOL_STATUS_ORDER_INDEX(row.hh_status);
        case 'content_count': return contentCountByKolId.get(row.id) || 0;
        default:             return '';
      }
    };
    return [...filteredKOLs]
      .map((kol, i) => ({ kol, i }))
      .sort((a, b) => {
        const cmp = compareNullable(pull(a.kol), pull(b.kol), dirMul);
        return cmp !== 0 ? cmp : a.i - b.i;
      })
      .map(x => x.kol);
  })();

  const sortedContents = (() => {
    if (!contentSort.key) return filteredContents;
    const dirMul = contentSort.dir === 'asc' ? 1 : -1;
    const pull = (row: any): any => {
      switch (contentSort.key) {
        case 'kol': {
          const kol = kols.find(k => k.id === row.campaign_kols_id);
          return kol?.master_kol?.name || '';
        }
        case 'platform':        return row.platform || '';
        case 'type':            return row.type || '';
        case 'status':          return row.status || '';
        case 'activation_date': return row.activation_date ? new Date(row.activation_date).getTime() : null;
        case 'impressions':     return row.impressions ?? null;
        case 'likes':           return row.likes ?? null;
        case 'retweets':        return row.retweets ?? null;
        case 'comments':        return row.comments ?? null;
        case 'bookmarks':       return row.bookmarks ?? null;
        default:                return '';
      }
    };
    return [...filteredContents]
      .map((c, i) => ({ c, i }))
      .sort((a, b) => {
        const cmp = compareNullable(pull(a.c), pull(b.c), dirMul);
        return cmp !== 0 ? cmp : a.i - b.i;
      })
      .map(x => x.c);
  })();

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
  }, [clientEmail, approvedEmails, approvedDomains]);

  useEffect(() => {
    if (isAuthenticated) {
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
          // Verify the cached email matches client email, is in approved emails, or has same domain
          const cachedEmailLower = cachedEmail?.toLowerCase();
          const clientEmailLower = clientEmail.toLowerCase();
          const isClientEmail = cachedEmailLower === clientEmailLower;
          const isApprovedEmail = approvedEmails.some(approved => approved.toLowerCase() === cachedEmailLower);

          // Check if email has the same domain as client email
          const getEmailDomain = (email: string) => email.split('@')[1];
          const cachedDomain = cachedEmailLower ? getEmailDomain(cachedEmailLower) : null;
          const clientDomain = getEmailDomain(clientEmailLower);
          const isSameDomain = cachedDomain && clientDomain && cachedDomain === clientDomain;
          const isApprovedDomain = approvedDomains.some(domain =>
            cachedDomain?.toLowerCase() === domain.toLowerCase()
          );

          if (cachedEmail && (isClientEmail || isApprovedEmail || isSameDomain || isApprovedDomain)) {
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

  // Log email view to database
  const logEmailView = async (userEmail: string, campaignUuid: string) => {
    try {
      await supabasePublic
        .from('campaign_email_views')
        .insert({
          campaign_id: campaignUuid,
          email: userEmail,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
        });
      console.log('Campaign email view logged:', userEmail);
    } catch (err) {
      console.error('Error logging campaign email view:', err);
      // Don't block authentication if logging fails
    }
  };

  async function fetchClientEmail() {
    try {
      setLoadingClientEmail(true);
      setError(null);

      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campaignId);
      let query = supabasePublic
        .from('campaigns')
        .select('id, client_id, approved_emails');

      if (isUUID) {
        query = query.eq('id', campaignId);
      } else {
        query = query.eq('slug', campaignId);
      }

      const { data: campaignData, error: campaignError } = await query.single();

      if (campaignError) {
        console.error('Campaign fetch error:', campaignError);
        throw new Error('Campaign not found or access denied');
      }

      if (!campaignData?.client_id) {
        throw new Error('Campaign has no associated client');
      }

      // Store the campaign UUID for logging
      setCampaignUuid(campaignData.id);

      // Approved emails from campaign level
      setApprovedEmails((campaignData.approved_emails as string[]) || []);

      const { data: clientData, error: clientError } = await supabasePublic
        .from('clients')
        .select('email, approved_domains')
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
      // Approved domains from client level only
      setApprovedDomains((clientData.approved_domains as string[]) || []);
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
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campaignId);
      let query = supabasePublic
        .from('campaigns')
        .select('id, client_id');

      if (isUUID) {
        query = query.eq('id', campaignId);
      } else {
        query = query.eq('slug', campaignId);
      }

      const { data: campaignData, error: campaignError } = await query.single();
      if (campaignError || !campaignData?.client_id) return null;

      // Store the campaign UUID for logging
      setCampaignUuid(campaignData.id);

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

    // Check if email matches client email, is in approved emails list, or has same domain as client
    const emailLower = email.toLowerCase();
    const authorizedEmailLower = authorizedEmail.toLowerCase();
    const isClientEmail = emailLower === authorizedEmailLower;
    const isApprovedEmail = approvedEmails.some(approved => approved.toLowerCase() === emailLower);

    // Check if email has the same domain as client email
    const getEmailDomain = (email: string) => email.split('@')[1];
    const enteredDomain = getEmailDomain(emailLower);
    const clientDomain = getEmailDomain(authorizedEmailLower);
    const isSameDomain = enteredDomain && clientDomain && enteredDomain === clientDomain;
    const isApprovedDomain = approvedDomains.some(domain =>
      enteredDomain?.toLowerCase() === domain.toLowerCase()
    );

    if (!isClientEmail && !isApprovedEmail && !isSameDomain && !isApprovedDomain) {
      setEmailError('This email address is not authorized to access this campaign');
      return;
    }

    // Save authentication to cache and proceed
    saveAuthToCache(email, authorizedEmail);

    // Log the email view
    if (campaignUuid) {
      await logEmailView(email, campaignUuid);
    }
    setIsAuthenticated(true);
  };

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);

      // Campaign — supports three lookup paths:
      //   1. ?showcase=<token> present → look up by showcase_token,
      //      requires showcase_enabled = true (Spec section 9)
      //   2. UUID-shaped path id → look up by id
      //   3. Otherwise → look up by slug
      // Showcase wins so a campaign can be both publicly-shared AND
      // showcase-linked without the email gate.
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campaignId);
      let campaignQuery = supabasePublic
        .from('campaigns')
        .select(`*, clients!campaigns_client_id_fkey(name, logo_url), campaign_budget_allocations(*)`);

      if (showcaseToken) {
        campaignQuery = campaignQuery
          .eq('showcase_token', showcaseToken)
          .eq('showcase_enabled', true);
      } else if (isUUID) {
        campaignQuery = campaignQuery.eq('id', campaignId);
      } else {
        campaignQuery = campaignQuery.eq('slug', campaignId);
      }

      const { data: campaignData, error: campaignError } = await campaignQuery.single();
      
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

      // Check if campaign is archived
      if (campaignData.status === 'archived') {
        setError('This campaign has been archived and is no longer available for public viewing.');
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
        client_logo_url: (campaignData.clients as any)?.logo_url || null,
        budget_allocations: (campaignData.campaign_budget_allocations || []).map((b: any) => ({ id: b.id, region: b.region, allocated_budget: b.allocated_budget })),
        share_creator_type: campaignData.share_creator_type || false,
        share_kol_notes: campaignData.share_kol_notes || false,
        share_content_notes: (campaignData as any).share_content_notes || false,
        // Showcase (Section 9) — only carry through when a token
        // matched on this fetch. The masking logic below uses
        // showcaseActive to decide whether to apply showcase_config.
        showcase_enabled: (campaignData as any).showcase_enabled || false,
        showcase_token: (campaignData as any).showcase_token || null,
        showcase_config: (campaignData as any).showcase_config || null,
      };
      setCampaign(normalizedCampaign);
      // If we reached this row via a matching showcase_token, the
      // token itself is the auth — skip the email gate and mark the
      // page as in-showcase so downstream masks apply.
      if (showcaseToken && normalizedCampaign.showcase_token === showcaseToken) {
        setShowcaseActive(true);
        setIsAuthenticated(true);
      }

      // KOLs - don't fail the whole page if this fails
      // Use the actual campaign UUID, not the slug from URL
      const actualCampaignId = campaignData.id;
      try {
        const { data: kolData, error: kolError } = await supabasePublic
          .from('campaign_kols')
          // Section 5: profile_note is the approved client-facing
          // one-line bio per KOL per campaign. Different from notes
          // (internal/team) and from master_kol.notes (per-KOL global).
          // Renders as a new "Profile" column on the KOL Dashboard.
          .select(`id, hh_status, client_status, allocated_budget, budget_type, notes, profile_note, master_kol:master_kols(id, name, link, followers, platform, region, content_type, creator_type)`)
          .eq('campaign_id', actualCampaignId)
          .or('hidden.is.null,hidden.eq.false')
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

      // Contents - don't fail the whole page if this fails.
      //
      // [Spec 7.5] We fetch tag assignments + their parent tag rows
      // inline so the public table can render client-facing badges
      // without an N+1 lookup. Internal-visibility tags get filtered
      // client-side so the public page never sees them even though
      // the joined row is in the payload.
      try {
        const { data: contentData, error: contentError } = await supabasePublic
          .from('contents')
          .select(`
            *,
            campaign_kol:campaign_kols(master_kol:master_kols(id, name, link)),
            content_tag_assignments(
              id, sequence_n, sequence_of, multipost_group_id,
              tag:content_tags(id, name, visibility, color)
            )
          `)
          .eq('campaign_id', actualCampaignId)
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

      // Section 4 — most recent activation snapshot for this campaign.
      // Soft-fail to null: the Activation Results section just won't
      // render. Logged at warn-level so the rest of the page never
      // breaks if the table is missing or the row is unparsed.
      try {
        const { data: snapData, error: snapErr } = await (supabasePublic as any)
          .from('activation_snapshots')
          .select('*')
          .eq('campaign_id', actualCampaignId)
          .order('synced_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (snapErr) {
          console.warn('Activation snapshot fetch error:', snapErr);
          setActivation(null);
        } else {
          setActivation((snapData as ActivationSnapshot | null) || null);
        }
      } catch (snapErr) {
        console.warn('Activation snapshot fetch failed:', snapErr);
        setActivation(null);
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
            <div className="bg-brand rounded-full p-3 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
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
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand mx-auto mb-4"></div>
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
                  className="w-full focus-brand"
                  required
                />
                {emailError && (
                  <p className="mt-2 text-sm text-rose-600">{emailError}</p>
                )}
              </div>
              
              <Button
                type="submit"
                className="w-full bg-brand hover:bg-[#2d6470] text-white"
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
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 mb-4 text-left">
                <p className="text-rose-600 text-sm font-medium">Error Details:</p>
                <p className="text-rose-600 text-sm mt-1">{error}</p>
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
                className="bg-brand hover:bg-[#2d6470] text-white"
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
        {/* ─── Slim Hero ─────────────────────────────────────────────
            HHP Campaign Dashboard Spec section 3. Replaces both the
            old title row (Megaphone + name + status) and the
            "Information + Metrics" card. Layout:
              - Left:  client logo (fallback to letter tile) + campaign name + status
              - Right: budget · date range on one line
              - Below: week-of-N progress bar (same math as the portal)
            Dropped per the spec: description paragraph, KOL count
            line, standalone Metrics block (budget-per-region). Each
            of those was either duplicated on the portal or noisy. */}
        {(() => {
          // Week math — identical to the portal hero so the two
          // experiences read in sync.
          const startMs = campaign.start_date ? new Date(`${campaign.start_date}T00:00:00`).getTime() : null;
          const endMs = campaign.end_date ? new Date(`${campaign.end_date}T00:00:00`).getTime() : null;
          const todayMs = Date.now();
          let weekN = 0, weekOf = 0, progressPct = 0;
          if (startMs && endMs && endMs > startMs) {
            const elapsedDays = Math.max(0, Math.floor((todayMs - startMs) / 86_400_000));
            const totalDays = Math.max(1, Math.ceil((endMs - startMs) / 86_400_000));
            weekN = Math.min(Math.ceil(elapsedDays / 7), Math.ceil(totalDays / 7));
            weekOf = Math.ceil(totalDays / 7);
            progressPct = Math.max(0, Math.min(1, (todayMs - startMs) / (endMs - startMs)));
          }
          const initial = (campaign.client_name || campaign.name || 'C').trim().charAt(0).toUpperCase();
          return (
            <div className="bg-white rounded-lg shadow-sm border mb-6 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3 flex-wrap">
                {/* Client logo — replaces the old generic Megaphone.
                    Falls back to a brand-tinted letter tile when no
                    logo is on the client record. Showcase: replaced
                    by a generic placeholder when client identity is
                    masked. */}
                {mask.clientIdentity ? (
                  <div className="w-10 h-10 rounded-md flex items-center justify-center bg-gray-100 text-gray-400 shrink-0">
                    <Megaphone className="h-5 w-5" />
                  </div>
                ) : campaign.client_logo_url ? (
                  <div className="w-10 h-10 rounded-md overflow-hidden border border-gray-200 bg-white shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={campaign.client_logo_url} alt={`${campaign.client_name || 'Client'} logo`} className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-md flex items-center justify-center text-sm font-bold bg-brand/10 text-brand shrink-0">
                    {initial}
                  </div>
                )}
                {/* Name + status, takes remaining left-half space.
                    Showcase: the campaign NAME stays (it's typically
                    a project codename, not an identity leak); the
                    client name underneath is what gets masked. */}
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold text-gray-900 truncate">
                    {mask.clientIdentity ? 'Confidential campaign' : campaign.name}
                  </h2>
                  {!mask.clientIdentity && campaign.client_name && (
                    <p className="text-xs text-gray-500 truncate">{campaign.client_name}</p>
                  )}
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium shrink-0 ${getStatusBadge(campaign.status)}`}>
                  {campaign.status}
                </span>
                {/* Budget + dates. Showcase: budget hidden when the
                    flag is set; dates always shown (engagement window
                    isn't sensitive). When budget is hidden and we
                    still have dates, just show dates without a pipe. */}
                <div className="text-sm text-gray-700 font-medium shrink-0 whitespace-nowrap">
                  {!mask.budget && formatCurrency(campaign.total_budget)}
                  {campaign.start_date && campaign.end_date && (
                    <>
                      {!mask.budget && <span className="text-gray-300 mx-2">|</span>}
                      <span className="text-gray-600">
                        {formatDate(campaign.start_date)} – {formatDate(campaign.end_date)}
                      </span>
                    </>
                  )}
                </div>
              </div>
              {/* Week progress bar — only when we have a valid date
                  range. Thin so it reads as ambient, not a CTA. */}
              {weekOf > 0 && (
                <div className="border-t border-gray-100 px-5 py-2.5 bg-gray-50/60">
                  <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1">
                    <span>Week {weekN} of {weekOf}</span>
                    <span className="tabular-nums">{Math.round(progressPct * 100)}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className="h-full bg-brand transition-all"
                      style={{ width: `${Math.round(progressPct * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })()}

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
                      <div
                        onClick={() => setKolViewMode('overview')}
                        className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer ${kolViewMode === 'overview' ? 'bg-background text-foreground shadow-sm' : ''}`}
                      >
                        <BarChart3 className="h-4 w-4 mr-2" />
                        Overview
                      </div>
                    </div>
                  </div>

                {/* Overview View */}
                {/* ─── KOL Performance Leaderboard ─────────────────
                    HHP Campaign Dashboard Spec section 6. Replaces
                    the old Overview (4 vanity stats + two degenerate
                    single-bar charts). The new Overview is built for
                    the question clients actually ask: "Who's
                    driving the results?"

                    Aggregates from `contents` per KOL (the
                    Content-Dashboard fallback path called out in the
                    spec — `kol_deliverables` will swap in once Phase
                    2 of the KOL Database Overhaul lands). Sorted
                    views-desc so the highest performer is row 1. */}
                {kolViewMode === 'overview' && (() => {
                  // ─── Aggregate ──────────────────────────────────
                  type Stats = { contentCount: number; views: number; engagements: number };
                  const byKol = new Map<string, Stats>();
                  for (const c of contents) {
                    const key = c.campaign_kols_id;
                    if (!key) continue;
                    const s = byKol.get(key) || { contentCount: 0, views: 0, engagements: 0 };
                    s.contentCount += 1;
                    s.views += c.impressions || 0;
                    s.engagements +=
                      (c.likes || 0) +
                      (c.comments || 0) +
                      (c.retweets || 0) +
                      (c.bookmarks || 0);
                    byKol.set(key, s);
                  }
                  const totalCampaignViews = Array.from(byKol.values()).reduce((sum, s) => sum + s.views, 0);
                  const totalContentLive = contents.length;
                  const totalEngagements = Array.from(byKol.values()).reduce((sum, s) => sum + s.engagements, 0);

                  // Each leaderboard row pairs a kol with its stats.
                  // KOLs without any content still show up at the
                  // bottom so the client can see who's been activated
                  // vs. who's posted.
                  const rows = kols
                    .map(k => ({
                      kol: k,
                      stats: byKol.get(k.id) || { contentCount: 0, views: 0, engagements: 0 },
                    }))
                    .sort((a, b) => b.stats.views - a.stats.views);

                  const formatNum = (n: number): string => {
                    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
                    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
                    return n.toLocaleString();
                  };

                  return (
                    <div className="space-y-6">
                      {/* Stat strip — Total KOLs · Content Posted ·
                          Views · Engagements. Compact horizontal
                          card row vs the old 4-up grid; less visual
                          noise and the leaderboard does the heavy
                          storytelling below. */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                          { label: 'Total KOLs', value: kols.length },
                          { label: 'Content Posted', value: totalContentLive },
                          { label: 'Total Views', value: formatNum(totalCampaignViews) },
                          { label: 'Total Engagements', value: formatNum(totalEngagements) },
                        ].map(stat => (
                          <Card key={stat.label} className="border border-gray-200">
                            <CardContent className="p-4">
                              <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">{stat.label}</p>
                              <p className="text-2xl font-bold text-gray-900 tabular-nums">{stat.value}</p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>

                      {/* Leaderboard table */}
                      <Card className="border border-gray-200 overflow-hidden">
                        <CardHeader className="border-b border-gray-100 bg-gray-50/60">
                          <CardTitle className="text-base font-semibold text-gray-900">
                            KOL Performance Leaderboard
                          </CardTitle>
                          <p className="text-xs text-gray-500 mt-0.5">Sorted by views — the highest-impact KOL is row 1.</p>
                        </CardHeader>
                        <CardContent className="p-0">
                          {rows.length === 0 ? (
                            <div className="p-8 text-center text-sm text-gray-500">
                              No KOLs activated yet.
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead className="bg-gray-50/80 text-[10px] uppercase tracking-wider text-gray-500">
                                  <tr>
                                    <th className="text-left py-2.5 px-4 w-12">#</th>
                                    <th className="text-left py-2.5 px-4">KOL</th>
                                    <th className="text-right py-2.5 px-4 w-24">Content</th>
                                    <th className="text-right py-2.5 px-4 w-28">Views</th>
                                    <th className="text-right py-2.5 px-4 w-32">Engagements</th>
                                    <th className="text-left py-2.5 px-4 w-[28%]">Share of Views</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map((r, idx) => {
                                    const sharePct = totalCampaignViews > 0
                                      ? (r.stats.views / totalCampaignViews) * 100
                                      : 0;
                                    return (
                                      <tr key={r.kol.id} className="border-t border-gray-100 hover:bg-gray-50/40">
                                        <td className="py-3 px-4 text-gray-500 tabular-nums font-medium">{idx + 1}</td>
                                        <td className="py-3 px-4">
                                          <div className="font-medium text-gray-900 truncate">
                                            {maskedKolName(r.kol.master_kol.name, idx)}
                                          </div>
                                          {/* Platform stays visible even when handles are
                                              masked — knowing "this KOL was X-native" is
                                              category-level, not identity. */}
                                          {r.kol.master_kol.platform && r.kol.master_kol.platform.length > 0 && (
                                            <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                                              {r.kol.master_kol.platform.join(' · ')}
                                            </div>
                                          )}
                                          {/* Section 5 — profile note. Truncated to
                                              one line so the leaderboard row doesn't
                                              grow tall when notes are long. */}
                                          {!mask.kolHandles && r.kol.profile_note && (
                                            <div className="text-[11px] text-gray-500 italic mt-0.5 truncate max-w-xs" title={r.kol.profile_note}>
                                              {r.kol.profile_note}
                                            </div>
                                          )}
                                        </td>
                                        <td className="py-3 px-4 text-right tabular-nums text-gray-700">
                                          {r.stats.contentCount}
                                        </td>
                                        <td className="py-3 px-4 text-right tabular-nums font-medium text-gray-900">
                                          {formatNum(r.stats.views)}
                                        </td>
                                        <td className="py-3 px-4 text-right tabular-nums text-gray-700">
                                          {formatNum(r.stats.engagements)}
                                        </td>
                                        <td className="py-3 px-4">
                                          <div className="flex items-center gap-2">
                                            <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                              <div
                                                className="h-full bg-brand"
                                                style={{ width: `${Math.max(2, Math.min(100, sharePct))}%` }}
                                              />
                                            </div>
                                            <span className="text-[11px] text-gray-500 tabular-nums w-12 text-right">
                                              {sharePct.toFixed(1)}%
                                            </span>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  );
                })()}
                {/* The legacy 4-stat Overview + degenerate single-bar
                    charts (Total KOLs in Campaign / Avg Followers /
                    Unique Platforms / KOLs by Region) was removed
                    here when the leaderboard above replaced it. Spec
                    section 6: "automated performance leaderboard."
                    Keeping the old block dead-coded made the file
                    50% larger for no gain. The leaderboard's
                    aggregation does all the heavy lifting. */}

                {/* Table View */}
                {kolViewMode === 'table' && (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Search KOLs by name, region, or status..."
                          className="pl-10 focus-brand"
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
                            <TableHead className="relative bg-gray-50 border-r border-gray-200 text-left select-none">
                              <button type="button" onClick={() => toggleKolSort('name')} className="flex items-center gap-1 group hover:text-gray-900" title="Sort by KOL name">
                                <span>KOL</span>
                                {sortIcon(kolSort.key === 'name', kolSort.dir)}
                              </button>
                            </TableHead>
                            <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">
                              <div className="flex items-center gap-1 group">
                                <button type="button" onClick={() => toggleKolSort('platform')} className="flex items-center gap-1 hover:text-gray-900" title="Sort by Platform">
                                  <span>Platform</span>
                                  {sortIcon(kolSort.key === 'platform', kolSort.dir)}
                                </button>
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
                                  <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                    {kolFilters.platform.length}
                                  </span>
                                )}
                              </div>
                            </TableHead>
                            <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">
                              <div className="flex items-center gap-1 group">
                                <button type="button" onClick={() => toggleKolSort('followers')} className="flex items-center gap-1 hover:text-gray-900" title="Sort by Followers">
                                  <span>Followers</span>
                                  {sortIcon(kolSort.key === 'followers', kolSort.dir)}
                                </button>
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
                                          className="h-8 text-xs focus-brand"
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
                                  <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                    1
                                  </span>
                                )}
                              </div>
                            </TableHead>
                            <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">
                              <div className="flex items-center gap-1 group">
                                <button type="button" onClick={() => toggleKolSort('region')} className="flex items-center gap-1 hover:text-gray-900" title="Sort by Region">
                                  <span>Region</span>
                                  {sortIcon(kolSort.key === 'region', kolSort.dir)}
                                </button>
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
                                  <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                    {kolFilters.region.length}
                                  </span>
                                )}
                              </div>
                            </TableHead>
                            {campaign?.share_creator_type && (
                              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">
                                <button type="button" onClick={() => toggleKolSort('creator_type')} className="flex items-center gap-1 group hover:text-gray-900" title="Sort by Creator Type">
                                  <span>Creator Type</span>
                                  {sortIcon(kolSort.key === 'creator_type', kolSort.dir)}
                                </button>
                              </TableHead>
                            )}
                            <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">
                              <div className="flex items-center gap-1 group">
                                <button type="button" onClick={() => toggleKolSort('hh_status')} className="flex items-center gap-1 hover:text-gray-900" title="Sort by Status">
                                  <span>Status</span>
                                  {sortIcon(kolSort.key === 'hh_status', kolSort.dir)}
                                </button>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                      <ChevronDown className="h-3 w-3" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-[200px] p-0" align="start">
                                    <div className="p-3">
                                      <div className="text-xs font-semibold text-gray-600 mb-2">Filter Status</div>
                                      {['Curated','Contacted','Interested','Onboarded','Concluded'].map((status) => (
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
                                  <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                    {kolFilters.hh_status.length}
                                  </span>
                                )}
                              </div>
                            </TableHead>
                            <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">
                              <button type="button" onClick={() => toggleKolSort('content_count')} className="flex items-center gap-1 group hover:text-gray-900" title="Sort by content count">
                                <span>Content</span>
                                {sortIcon(kolSort.key === 'content_count', kolSort.dir)}
                              </button>
                            </TableHead>
                            {campaign?.share_kol_notes && (
                              <TableHead className="relative bg-gray-50 select-none">Notes</TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody className="bg-white">
                          {sortedKOLs.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={(campaign?.share_creator_type ? 10 : 9) + (campaign?.share_kol_notes ? 1 : 0)} className="text-center py-12">
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
                            sortedKOLs.map((campaignKOL, index) => {
                              return (
                                <TableRow key={campaignKOL.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors border-b border-gray-200`}>
                                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden text-center text-gray-600`} style={{ verticalAlign: 'middle' }}>
                                    {index + 1}
                                  </TableCell>
                                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-r border-gray-200 p-2 overflow-hidden text-gray-600`} style={{ verticalAlign: 'middle', fontWeight: 'bold', width: '20%' }}>
                                    <div className="w-full h-full">
                                      <div className="flex items-center w-full">
                                        <div className="truncate font-bold">
                                          {maskedKolName(campaignKOL.master_kol.name, index)}
                                        </div>
                                        {/* Profile link hidden in showcase mode — the
                                            point of masking the name is to keep the KOL
                                            unidentifiable. */}
                                        {!mask.kolHandles && campaignKOL.master_kol.link && (
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
                                      {/* Section 5 — approved client-facing profile
                                          note. Renders as a subtitle under the KOL
                                          name. Hidden in showcase mode when handles
                                          are masked (the note would re-identify
                                          the KOL even with a masked name). */}
                                      {!mask.kolHandles && campaignKOL.profile_note && (
                                        <div className="text-xs text-gray-500 italic font-normal mt-0.5 leading-snug whitespace-normal max-w-md">
                                          {campaignKOL.profile_note}
                                        </div>
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
                                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${campaign?.share_kol_notes ? 'border-r border-gray-200' : ''} p-2 overflow-hidden text-center`}>
                                    <div className="font-medium text-gray-900">
                                      {contents.filter(content => content.campaign_kols_id === campaignKOL.id).length}
                                    </div>
                                  </TableCell>
                                  {campaign?.share_kol_notes && (
                                    <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} p-2 overflow-hidden`}>
                                      <div className="text-sm text-gray-600 max-w-xs whitespace-pre-wrap">
                                        {campaignKOL.notes || <span className="text-gray-400 italic">-</span>}
                                      </div>
                                    </TableCell>
                                  )}
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
                            <div className="w-16 h-16 bg-gradient-to-br from-brand to-[#2d6470] rounded-full flex items-center justify-center mb-3">
                              <span className="text-white font-bold text-xl">
                                {(mask.kolHandles ? `#${index + 1}` : item.master_kol.name.charAt(0).toUpperCase()).toString()}
                              </span>
                            </div>
                            <div className="mb-2">
                              <h3 className="font-semibold text-gray-900 text-lg">
                                {maskedKolName(item.master_kol.name, index)}
                              </h3>
                              {/* Region kept — geographic distribution is
                                  category-level evidence, not identity. */}
                              <p className="text-sm text-gray-500">{item.master_kol.region || 'No region'}</p>
                              {/* Section 5 — client-facing profile note. */}
                              {!mask.kolHandles && item.profile_note && (
                                <p className="text-xs text-gray-500 italic mt-1.5 leading-snug">
                                  {item.profile_note}
                                </p>
                              )}
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

                          {/* View Profile Link — hidden in showcase
                              mode when handles are masked (else the
                              link defeats the mask). */}
                          {!mask.kolHandles && item.master_kol.link && (
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

                          {/* Notes */}
                          {campaign?.share_kol_notes && item.notes && (
                            <div className="pt-2 border-t border-gray-100">
                              <span className="text-sm text-gray-600 block mb-1">Notes</span>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.notes}</p>
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
                          <div className="bg-gradient-to-br from-brand to-[#2d6470] p-3 rounded-lg">
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

                    {/* Total Views */}
                    <Card className="hover:shadow-lg transition-shadow duration-200">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="bg-gradient-to-br from-brand to-[#2d6470] p-3 rounded-lg">
                            <BarChart3 className="h-6 w-6 text-white" />
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-gray-900">
                          {(() => {
                            const totalViews = contents.reduce((sum, content) => sum + (content.impressions || 0), 0);
                            return totalViews.toLocaleString();
                          })()}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">Total Views</p>
                      </CardContent>
                    </Card>

                    {/* Total Reactions */}
                    <Card className="hover:shadow-lg transition-shadow duration-200">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="bg-gradient-to-br from-brand to-[#2d6470] p-3 rounded-lg">
                            <BarChart3 className="h-6 w-6 text-white" />
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-gray-900">
                          {(() => {
                            const totalReactions = contents.reduce((sum, content) => sum + (content.likes || 0), 0);
                            return totalReactions.toLocaleString();
                          })()}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">Total Reactions</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Charts Section */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Top KOLs by Reactions */}
                    <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
                      <div className="mb-6">
                        <h3 className="text-xl font-bold text-gray-900">Top KOLs by Reactions</h3>
                        <p className="text-sm text-gray-500 mt-1">KOLs ranked by total likes</p>
                      </div>
                      <div className="h-96">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={(() => {
                              // Calculate total likes per KOL.
                              // Showcase: label by masked handle so
                              // the chart axis doesn't leak names.
                              const kolReactions = contents.reduce((acc, content) => {
                                const kolIdx = kols.findIndex(k => k.id === content.campaign_kols_id);
                                if (kolIdx >= 0) {
                                  const kolName = maskedKolName(kols[kolIdx].master_kol.name, kolIdx);
                                  if (!acc[kolName]) {
                                    acc[kolName] = 0;
                                  }
                                  acc[kolName] += content.likes || 0;
                                }
                                return acc;
                              }, {} as Record<string, number>);

                              return Object.entries(kolReactions)
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
                              formatter={(value: number) => [value.toLocaleString(), 'Reactions']}
                            />
                            <Bar dataKey="likes" fill="#3e8692" radius={[8, 8, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Top KOLs by Views */}
                    <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
                      <div className="mb-6">
                        <h3 className="text-xl font-bold text-gray-900">Top KOLs by Views</h3>
                        <p className="text-sm text-gray-500 mt-1">KOLs ranked by total impressions</p>
                      </div>
                      <div className="h-96">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={(() => {
                              // Calculate total impressions per KOL.
                              // Showcase masking applied — see the
                              // Reactions chart above for rationale.
                              const kolViews = contents.reduce((acc, content) => {
                                const kolIdx = kols.findIndex(k => k.id === content.campaign_kols_id);
                                if (kolIdx >= 0) {
                                  const kolName = maskedKolName(kols[kolIdx].master_kol.name, kolIdx);
                                  if (!acc[kolName]) {
                                    acc[kolName] = 0;
                                  }
                                  acc[kolName] += content.impressions || 0;
                                }
                                return acc;
                              }, {} as Record<string, number>);

                              return Object.entries(kolViews)
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
                              formatter={(value: number) => [value.toLocaleString(), 'Views']}
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
                  {/* ─── Activation Results — Spec section 4 ───────
                      Fogo-style reusable block. Renders only when
                      an activation_snapshots row exists for this
                      campaign. Each sub-component conditionally
                      renders on its own data blob being present —
                      a simple PFP activation shows 3-4 blocks; a
                      Trader Card style shows all 8. Showcase mode
                      masks KOL names where they appear. */}
                  {activation && (() => {
                    const s = activation.summary_json;
                    const daily = activation.entries_daily_json;
                    const byKol = activation.entries_by_kol_json;
                    const clicks = activation.clicks_json;
                    const ugc = activation.ugc_json;

                    const formatNum = (n: number | null | undefined): string => {
                      if (n == null) return '—';
                      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
                      if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
                      return n.toLocaleString();
                    };
                    // Build per-KOL labels with showcase masking
                    // applied. We look up the campaign_kol by kol_id
                    // when the portal provides it; fall back to the
                    // portal's pre-baked `label` field otherwise.
                    const labelForKol = (entry: { kol_id?: string; label?: string }, idx: number): string => {
                      if (entry.kol_id) {
                        const kolIdx = kols.findIndex(k => k.id === entry.kol_id);
                        if (kolIdx >= 0) return maskedKolName(kols[kolIdx].master_kol.name, kolIdx);
                      }
                      // No mapping → use whatever label the portal
                      // returned. In showcase mode we still mask by
                      // position so the chart axis doesn't leak.
                      return mask.kolHandles ? `KOL #${idx + 1}` : (entry.label || `KOL #${idx + 1}`);
                    };

                    const totalEntries = byKol ? byKol.reduce((sum, e) => sum + (e.entries || 0), 0) : 0;
                    const sortedByKol = byKol
                      ? [...byKol].sort((a, b) => (b.entries || 0) - (a.entries || 0))
                      : [];

                    // Donut palette — recycle through 8 colors so a
                    // 20-KOL chart still reads. Matches the leaderboard
                    // share-bar so the two visuals feel paired.
                    const PIE = ['#3e8692', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#0ea5e9', '#ef4444', '#64748b'];

                    return (
                      <div className="mb-6 border border-brand/20 rounded-xl overflow-hidden bg-gradient-to-br from-brand/[0.03] to-transparent">
                        {/* ─── Activation Hero ───────────────────── */}
                        <div className="p-6 border-b border-brand/15 bg-white">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-brand mb-1">Activation Results</p>
                              <h3 className="text-2xl font-bold text-gray-900">
                                {activation.activation_name || 'Live Activation'}
                              </h3>
                              <div className="flex items-center gap-3 mt-1.5 text-sm text-gray-600 flex-wrap">
                                {activation.activation_type && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand/10 text-brand">
                                    {activation.activation_type}
                                  </span>
                                )}
                                {activation.start_date && activation.end_date && (
                                  <span>
                                    {formatDate(activation.start_date)} – {formatDate(activation.end_date)}
                                  </span>
                                )}
                                {s?.target_market && (
                                  <span className="text-gray-500">· {s.target_market}</span>
                                )}
                              </div>
                            </div>
                            {activation.status && (
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(activation.status)}`}>
                                {/* Display lowercase DB values ("active",
                                    "completed", "in_progress") in
                                    Title Case so the badge reads
                                    cleanly. Word-split on _ and space
                                    handles snake_case statuses too. */}
                                {activation.status
                                  .replace(/[_-]/g, ' ')
                                  .split(' ')
                                  .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                                  .join(' ')}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="p-6 space-y-6">
                          {/* ─── KPI cards ─────────────────────────
                              Each card renders only if the summary
                              blob has its key. The spec lists
                              concrete fields (total_entries, etc.)
                              + an open-ended "activation-specific"
                              bucket — we render the named ones
                              first, then any extras. */}
                          {s && (() => {
                            const cards = [
                              { key: 'total_entries',     label: 'Total Entries',       value: s.total_entries },
                              { key: 'unique_participants', label: 'Unique Participants', value: s.unique_participants },
                              { key: 'kols_activated',    label: 'KOLs Activated',      value: s.kols_activated },
                              { key: 'wallets_registered',label: 'Wallets Registered',  value: s.wallets_registered },
                              { key: 'cards_minted',      label: 'Cards Minted',        value: s.cards_minted },
                              { key: 'frames_created',    label: 'Frames Created',      value: s.frames_created },
                            ].filter(c => typeof c.value === 'number');

                            if (cards.length === 0) return null;
                            return (
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                {cards.map(c => (
                                  <div key={c.key} className="bg-white border border-gray-200 rounded-lg p-3">
                                    <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{c.label}</p>
                                    <p className="text-2xl font-bold text-gray-900 tabular-nums">{formatNum(c.value)}</p>
                                    {s.context_sublabels?.[c.key] && (
                                      <p className="text-[10px] text-gray-500 mt-0.5">{s.context_sublabels[c.key]}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            );
                          })()}

                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* ─── Daily entries chart ──────────── */}
                            {daily && daily.length > 0 && (
                              <div className="bg-white border border-gray-200 rounded-lg p-4">
                                <p className="text-sm font-semibold text-gray-900 mb-3">Daily Entries</p>
                                <div className="h-56">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={daily} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                      <Tooltip
                                        contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }}
                                        formatter={(value: number) => [value.toLocaleString(), 'Entries']}
                                      />
                                      <Bar dataKey="entries" fill="#3e8692" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>
                            )}

                            {/* ─── Entries by KOL channel donut ── */}
                            {byKol && byKol.length > 0 && (
                              <div className="bg-white border border-gray-200 rounded-lg p-4">
                                <p className="text-sm font-semibold text-gray-900 mb-3">Entries by KOL Channel</p>
                                <div className="h-56">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                      <Pie
                                        data={sortedByKol.map((e, idx) => ({
                                          name: labelForKol(e, idx),
                                          value: e.entries,
                                        }))}
                                        dataKey="value"
                                        innerRadius={50}
                                        outerRadius={80}
                                        paddingAngle={2}
                                      >
                                        {sortedByKol.map((_, idx) => (
                                          <Cell key={idx} fill={PIE[idx % PIE.length]} />
                                        ))}
                                      </Pie>
                                      <Tooltip
                                        contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }}
                                        formatter={(value: number, name: string) => [value.toLocaleString(), name]}
                                      />
                                    </PieChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* ─── KOL performance breakdown ──────── */}
                          {byKol && byKol.length > 0 && (
                            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
                                <p className="text-sm font-semibold text-gray-900">KOL Performance</p>
                                <p className="text-[11px] text-gray-500 mt-0.5">Ranked by entries · share-of-pie shown below name.</p>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                                    <tr>
                                      <th className="text-left py-2 px-4 w-12">#</th>
                                      <th className="text-left py-2 px-4">KOL</th>
                                      <th className="text-right py-2 px-4 w-24">Entries</th>
                                      <th className="text-left py-2 px-4 w-[30%]">Share</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {sortedByKol.map((e, idx) => {
                                      const sharePct = totalEntries > 0 ? (e.entries / totalEntries) * 100 : 0;
                                      return (
                                        <tr key={`${e.kol_id || e.label || idx}`} className="border-t border-gray-100">
                                          <td className="py-2 px-4 text-gray-500 tabular-nums">{idx + 1}</td>
                                          <td className="py-2 px-4 font-medium text-gray-900 truncate">{labelForKol(e, idx)}</td>
                                          <td className="py-2 px-4 text-right tabular-nums text-gray-900 font-medium">{formatNum(e.entries)}</td>
                                          <td className="py-2 px-4">
                                            <div className="flex items-center gap-2">
                                              <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                                <div className="h-full bg-brand" style={{ width: `${Math.max(2, Math.min(100, sharePct))}%` }} />
                                              </div>
                                              <span className="text-[11px] text-gray-500 tabular-nums w-12 text-right">{sharePct.toFixed(1)}%</span>
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* ─── Ecosystem engagement ─────────── */}
                            {clicks && (clicks.by_protocol?.length || clicks.by_source?.length || clicks.total_referrals) && (
                              <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                                <p className="text-sm font-semibold text-gray-900">Ecosystem Engagement</p>
                                {typeof clicks.total_referrals === 'number' && (
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="text-2xl font-bold text-gray-900 tabular-nums">{formatNum(clicks.total_referrals)}</span>
                                    <span className="text-xs text-gray-500">total referrals</span>
                                  </div>
                                )}
                                {clicks.by_protocol && clicks.by_protocol.length > 0 && (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">dApp clicks by protocol</p>
                                    <ul className="space-y-1.5">
                                      {clicks.by_protocol.map((p, idx) => (
                                        <li key={p.protocol + idx} className="flex items-center justify-between text-xs">
                                          <span className="text-gray-700">{p.protocol}</span>
                                          <span className="font-medium text-gray-900 tabular-nums">{formatNum(p.clicks)}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {clicks.by_source && clicks.by_source.length > 0 && (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">By source</p>
                                    <ul className="space-y-1.5">
                                      {clicks.by_source.map((p, idx) => (
                                        <li key={p.source + idx} className="flex items-center justify-between text-xs">
                                          <span className="text-gray-700">{p.source}</span>
                                          <span className="font-medium text-gray-900 tabular-nums">{formatNum(p.clicks)}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* ─── Points and prizes ────────────── */}
                            {s && (s.prize_pool || s.draw_structure || s.points_by_source) && (
                              <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                                <p className="text-sm font-semibold text-gray-900">Points & Prizes</p>
                                {s.prize_pool && (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wider text-gray-500">Prize pool</p>
                                    <p className="text-xl font-bold text-gray-900 tabular-nums">{s.prize_pool}</p>
                                  </div>
                                )}
                                {s.draw_structure && (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Draw structure</p>
                                    <p className="text-xs text-gray-700">{s.draw_structure}</p>
                                  </div>
                                )}
                                {s.points_by_source && s.points_by_source.length > 0 && (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Points by source</p>
                                    <ul className="space-y-1.5">
                                      {s.points_by_source.map((p, idx) => (
                                        <li key={p.source + idx} className="flex items-center justify-between text-xs">
                                          <span className="text-gray-700">{p.source}</span>
                                          <span className="font-medium text-gray-900 tabular-nums">{formatNum(p.points)}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* ─── UGC performance ──────────────── */}
                          {ugc && (ugc.posts_approved || ugc.creators || ugc.views || ugc.top_post) && (
                            <div className="bg-white border border-gray-200 rounded-lg p-4">
                              <p className="text-sm font-semibold text-gray-900 mb-3">UGC Performance</p>
                              {/* Headline stats */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                                {typeof ugc.posts_approved === 'number' && (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wider text-gray-500">Posts Approved</p>
                                    <p className="text-lg font-bold text-gray-900 tabular-nums">{formatNum(ugc.posts_approved)}</p>
                                  </div>
                                )}
                                {typeof ugc.creators === 'number' && (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wider text-gray-500">Creators</p>
                                    <p className="text-lg font-bold text-gray-900 tabular-nums">{formatNum(ugc.creators)}</p>
                                  </div>
                                )}
                                {typeof ugc.approval_rate === 'number' && (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wider text-gray-500">Approval Rate</p>
                                    <p className="text-lg font-bold text-gray-900 tabular-nums">{(ugc.approval_rate * 100).toFixed(1)}%</p>
                                  </div>
                                )}
                                {typeof ugc.views === 'number' && (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wider text-gray-500">Views</p>
                                    <p className="text-lg font-bold text-gray-900 tabular-nums">{formatNum(ugc.views)}</p>
                                  </div>
                                )}
                              </div>
                              {/* Top post */}
                              {ugc.top_post && (
                                <div className="border-t border-gray-100 pt-3">
                                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Top Post</p>
                                  <div className="flex items-start gap-3">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-semibold text-gray-900">
                                        {mask.kolHandles ? 'Top creator' : (ugc.top_post.creator_label || 'Creator')}
                                      </p>
                                      {ugc.top_post.snippet && (
                                        <p className="text-xs text-gray-600 italic mt-0.5 line-clamp-3">"{ugc.top_post.snippet}"</p>
                                      )}
                                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500 tabular-nums">
                                        {typeof ugc.top_post.views === 'number' && <span>{formatNum(ugc.top_post.views)} views</span>}
                                        {typeof ugc.top_post.likes === 'number' && <span>{formatNum(ugc.top_post.likes)} reactions</span>}
                                      </div>
                                    </div>
                                    {!mask.kolHandles && ugc.top_post.link && (
                                      <a href={ugc.top_post.link} target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand/80 shrink-0">
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </a>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Content View Toggle */}
                  <div className="mb-4">
                    <div className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
                      <div onClick={() => setContentViewMode('table')} className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer ${contentViewMode === 'table' ? 'bg-background text-foreground shadow-sm' : ''}`}>
                        <TableIcon className="h-4 w-4 mr-2" /> Table
                      </div>
                      <div onClick={() => setContentViewMode('overview')} className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer ${contentViewMode === 'overview' ? 'bg-background text-foreground shadow-sm' : ''}`}>
                        <BarChart3 className="h-4 w-4 mr-2" /> Overview
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
                            className="pl-10 focus-brand"
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
                              <TableHead className="relative bg-gray-50 border-r border-gray-200 text-left select-none">
                                <button type="button" onClick={() => toggleContentSort('kol')} className="flex items-center gap-1 group hover:text-gray-900" title="Sort by KOL name">
                                  <span>KOL</span>
                                  {sortIcon(contentSort.key === 'kol', contentSort.dir)}
                                </button>
                              </TableHead>
                              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">
                                <div className="flex items-center gap-1 group">
                                  <button type="button" onClick={() => toggleContentSort('platform')} className="flex items-center gap-1 hover:text-gray-900" title="Sort by Platform">
                                    <span>Platform</span>
                                    {sortIcon(contentSort.key === 'platform', contentSort.dir)}
                                  </button>
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
                                    <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                      {contentFilters.platform.length}
                                    </span>
                                  )}
                                </div>
                              </TableHead>
                              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">
                                <div className="flex items-center gap-1 group">
                                  <button type="button" onClick={() => toggleContentSort('type')} className="flex items-center gap-1 hover:text-gray-900" title="Sort by Type">
                                    <span>Type</span>
                                    {sortIcon(contentSort.key === 'type', contentSort.dir)}
                                  </button>
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
                                    <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                      {contentFilters.type.length}
                                    </span>
                                  )}
                                </div>
                              </TableHead>
                              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">
                                <div className="flex items-center gap-1 group">
                                  <button type="button" onClick={() => toggleContentSort('status')} className="flex items-center gap-1 hover:text-gray-900" title="Sort by Status">
                                    <span>Status</span>
                                    {sortIcon(contentSort.key === 'status', contentSort.dir)}
                                  </button>
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
                                    <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                      {contentFilters.status.length}
                                    </span>
                                  )}
                                </div>
                              </TableHead>
                              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">
                                <button type="button" onClick={() => toggleContentSort('activation_date')} className="flex items-center gap-1 group hover:text-gray-900" title="Sort by Activation Date">
                                  <span>Activation Date</span>
                                  {sortIcon(contentSort.key === 'activation_date', contentSort.dir)}
                                </button>
                              </TableHead>
                              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">Content Link</TableHead>
                              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">
                                <button type="button" onClick={() => toggleContentSort('impressions')} className="flex items-center gap-1 group hover:text-gray-900" title="Sort by Views">
                                  <span>Views</span>
                                  {sortIcon(contentSort.key === 'impressions', contentSort.dir)}
                                </button>
                              </TableHead>
                              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">
                                <button type="button" onClick={() => toggleContentSort('likes')} className="flex items-center gap-1 group hover:text-gray-900" title="Sort by Reactions">
                                  <span>Reactions</span>
                                  {sortIcon(contentSort.key === 'likes', contentSort.dir)}
                                </button>
                              </TableHead>
                              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">
                                <button type="button" onClick={() => toggleContentSort('retweets')} className="flex items-center gap-1 group hover:text-gray-900" title="Sort by Shares">
                                  <span>Shares</span>
                                  {sortIcon(contentSort.key === 'retweets', contentSort.dir)}
                                </button>
                              </TableHead>
                              <TableHead className="relative bg-gray-50 border-r border-gray-200 select-none">
                                <button type="button" onClick={() => toggleContentSort('comments')} className="flex items-center gap-1 group hover:text-gray-900" title="Sort by Replies">
                                  <span>Replies</span>
                                  {sortIcon(contentSort.key === 'comments', contentSort.dir)}
                                </button>
                              </TableHead>
                              <TableHead className={`relative bg-gray-50 ${notesVisible ? 'border-r border-gray-200' : ''} select-none`}>
                                <button type="button" onClick={() => toggleContentSort('bookmarks')} className="flex items-center gap-1 group hover:text-gray-900" title="Sort by Saves">
                                  <span>Saves</span>
                                  {sortIcon(contentSort.key === 'bookmarks', contentSort.dir)}
                                </button>
                              </TableHead>
                              {notesVisible && (
                                <TableHead className="relative bg-gray-50 select-none">Notes</TableHead>
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody className="bg-white">
                            {sortedContents.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={12 + (notesVisible ? 1 : 0)} className="text-center py-12">
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
                              sortedContents.map((content, index) => {
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
                                        if (['published', 'active', 'live', 'posted'].includes(s)) return 'bg-emerald-100 text-emerald-800';
                                        if (['scheduled'].includes(s)) return 'bg-blue-100 text-blue-800';
                                        if (['draft', 'pending'].includes(s)) return 'bg-yellow-100 text-yellow-800';
                                        if (['failed', 'removed'].includes(s)) return 'bg-rose-100 text-rose-800';
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
                                    <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${notesVisible ? 'border-r border-gray-200' : ''} p-2 overflow-hidden`}>
                                      {content.bookmarks ? formatFollowers(content.bookmarks) : '-'}
                                    </TableCell>
                                    {notesVisible && (
                                      <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} p-2 align-top`}>
                                        {/* HHP Onboarding Overhaul Spec § 9 #11 —
                                            "Complimen Post" truncation fix.
                                            The cell used to have overflow-hidden
                                            + max-w-xs, which under certain
                                            column widths could clip mid-word.
                                            break-words ensures clean wrapping
                                            at word boundaries; max-w-[18rem]
                                            keeps the column from over-stretching
                                            on long notes; align-top so multi-
                                            line notes don't shift the row. */}
                                        <div className="text-sm text-gray-600 max-w-[18rem] whitespace-pre-wrap break-words">
                                          {/* [Spec 7.5] Client-facing tag
                                              badges render before notes
                                              text. Internal tags filtered
                                              client-side. Multi-Post tag
                                              renders its sequence as
                                              "Post N of M" automatically. */}
                                          {(() => {
                                            const assignments = (content.content_tag_assignments || [])
                                              .filter(a => a.tag && a.tag.visibility === 'client');
                                            if (assignments.length === 0) return null;
                                            return (
                                              <div className="flex flex-wrap gap-1 mb-1.5">
                                                {assignments.map(a => {
                                                  const isMultiPost = a.tag!.name === 'Multi-Post' && a.sequence_n && a.sequence_of;
                                                  const label = isMultiPost
                                                    ? `Post ${a.sequence_n} of ${a.sequence_of}`
                                                    : a.tag!.name;
                                                  // Inline style for tag color since
                                                  // Tailwind can't bind dynamic hex.
                                                  const bg = a.tag!.color || '#10b981';
                                                  return (
                                                    <span
                                                      key={a.id}
                                                      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
                                                      style={{ backgroundColor: bg }}
                                                    >
                                                      {label}
                                                    </span>
                                                  );
                                                })}
                                              </div>
                                            );
                                          })()}
                                          {content.notes || (
                                            ((content.content_tag_assignments || []).some(a => a.tag?.visibility === 'client'))
                                              ? null
                                              : <span className="text-gray-400 italic">-</span>
                                          )}
                                        </div>
                                      </TableCell>
                                    )}
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
                        {/* Total Views */}
                        <Card className="hover:shadow-lg transition-shadow duration-200">
                          <CardHeader className="pb-3">
                            <div className="flex items-center gap-3">
                              <div className="bg-gradient-to-br from-brand to-[#2d6470] p-3 rounded-lg">
                                <BarChart3 className="h-6 w-6 text-white" />
                              </div>
                              <p className="text-sm text-gray-600">
                                {(() => {
                                  const totalViews = contents.reduce((sum, content) => sum + (content.impressions || 0), 0);
                                  return totalViews === 1 ? 'Total View' : 'Total Views';
                                })()}
                              </p>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold text-gray-900">
                              {(() => {
                                const totalViews = contents.reduce((sum, content) => sum + (content.impressions || 0), 0);
                                return totalViews.toLocaleString();
                              })()}
                            </div>
                          </CardContent>
                        </Card>

                        {/* Total Replies */}
                        <Card className="hover:shadow-lg transition-shadow duration-200">
                          <CardHeader className="pb-3">
                            <div className="flex items-center gap-3">
                              <div className="bg-gradient-to-br from-brand to-[#2d6470] p-3 rounded-lg">
                                <BarChart3 className="h-6 w-6 text-white" />
                              </div>
                              <p className="text-sm text-gray-600">
                                {(() => {
                                  const totalReplies = contents.reduce((sum, content) => sum + (content.comments || 0), 0);
                                  return totalReplies === 1 ? 'Total Reply' : 'Total Replies';
                                })()}
                              </p>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold text-gray-900">
                              {(() => {
                                const totalReplies = contents.reduce((sum, content) => sum + (content.comments || 0), 0);
                                return totalReplies.toLocaleString();
                              })()}
                            </div>
                          </CardContent>
                        </Card>

                        {/* Total Shares */}
                        <Card className="hover:shadow-lg transition-shadow duration-200">
                          <CardHeader className="pb-3">
                            <div className="flex items-center gap-3">
                              <div className="bg-gradient-to-br from-brand to-[#2d6470] p-3 rounded-lg">
                                <BarChart3 className="h-6 w-6 text-white" />
                              </div>
                              <p className="text-sm text-gray-600">
                                {(() => {
                                  const totalShares = contents.reduce((sum, content) => sum + (content.retweets || 0), 0);
                                  return totalShares === 1 ? 'Total Share' : 'Total Shares';
                                })()}
                              </p>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold text-gray-900">
                              {(() => {
                                const totalShares = contents.reduce((sum, content) => sum + (content.retweets || 0), 0);
                                return totalShares.toLocaleString();
                              })()}
                            </div>
                          </CardContent>
                        </Card>

                        {/* Total Reactions */}
                        <Card className="hover:shadow-lg transition-shadow duration-200">
                          <CardHeader className="pb-3">
                            <div className="flex items-center gap-3">
                              <div className="bg-gradient-to-br from-brand to-[#2d6470] p-3 rounded-lg">
                                <BarChart3 className="h-6 w-6 text-white" />
                              </div>
                              <p className="text-sm text-gray-600">
                                {(() => {
                                  const totalReactions = contents.reduce((sum, content) => sum + (content.likes || 0), 0);
                                  return totalReactions === 1 ? 'Total Reaction' : 'Total Reactions';
                                })()}
                              </p>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold text-gray-900">
                              {(() => {
                                const totalReactions = contents.reduce((sum, content) => sum + (content.likes || 0), 0);
                                return totalReactions.toLocaleString();
                              })()}
                            </div>
                          </CardContent>
                        </Card>

                        {/* Total Engagements */}
                        <Card className="hover:shadow-lg transition-shadow duration-200">
                          <CardHeader className="pb-3">
                            <div className="flex items-center gap-3">
                              <div className="bg-gradient-to-br from-brand to-[#2d6470] p-3 rounded-lg">
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

                        {/* Total Saves */}
                        <Card className="hover:shadow-lg transition-shadow duration-200">
                          <CardHeader className="pb-3">
                            <div className="flex items-center gap-3">
                              <div className="bg-gradient-to-br from-brand to-[#2d6470] p-3 rounded-lg">
                                <BarChart3 className="h-6 w-6 text-white" />
                              </div>
                              <p className="text-sm text-gray-600">
                                {(() => {
                                  const totalSaves = contents.reduce((sum, content) => sum + (content.bookmarks || 0), 0);
                                  return totalSaves === 1 ? 'Total Save' : 'Total Saves';
                                })()}
                              </p>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold text-gray-900">
                              {(() => {
                                const totalSaves = contents.reduce((sum, content) => sum + (content.bookmarks || 0), 0);
                                return totalSaves.toLocaleString();
                              })()}
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Value Anchor — Spec section 10. One factual
                          line sitting below the stat cards, deliberately
                          plain so it reads as evidence rather than a
                          marketing claim. Shows total views + budget.
                          Auto-hidden in showcase mode when the budget
                          mask is on (Section 10: "Hidden automatically
                          in showcase mode when budget is hidden"). */}
                      {!mask.budget && campaign?.total_budget && campaign.total_budget > 0 && (() => {
                        const totalViews = contents.reduce((sum, content) => sum + (content.impressions || 0), 0);
                        if (totalViews === 0) return null;
                        // 57945 → "57.9K", 1245000 → "1.2M". Spec
                        // example uses "57.9K" so we match that
                        // shorthand format rather than full
                        // toLocaleString.
                        const formatShort = (n: number): string => {
                          if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
                          if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
                          return n.toLocaleString();
                        };
                        const budgetFmt = `$${campaign.total_budget.toLocaleString()}`;
                        return (
                          <p className="text-sm text-gray-600 italic">
                            <span className="font-semibold text-gray-900 not-italic">{formatShort(totalViews)} views</span>
                            {' '}delivered against a{' '}
                            <span className="font-semibold text-gray-900 not-italic">{budgetFmt}</span>
                            {' '}engagement.
                          </p>
                        );
                      })()}

                      {/* Average Engagement Rate */}
                      <Card className="hover:shadow-lg transition-shadow duration-200">
                        <CardHeader>
                          <CardTitle className="text-lg font-semibold text-gray-900">Average Engagement Rate</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-bold text-gray-900">
                            {(() => {
                              const totalViews = contents.reduce((sum, content) => sum + (content.impressions || 0), 0);
                              const totalEngagements = contents.reduce((sum, content) => 
                                sum + (content.likes || 0) + (content.comments || 0) + (content.retweets || 0) + (content.bookmarks || 0), 0);
                              const engagementRate = totalViews > 0 ? (totalEngagements / totalViews) * 100 : 0;
                              return `${engagementRate.toFixed(2)}%`;
                            })()}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">Engagement Rate = (Reactions + Replies + Shares + Saves) / Views</p>
                        </CardContent>
                      </Card>

                      {/* Charts Section */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Total Views */}
                        <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
                          <div className="flex items-center justify-between mb-6">
                            <div>
                              <h3 className="text-xl font-bold text-gray-900">Total Views</h3>
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

                                  let cumulativeViews = 0;
                                  return sortedEntries.map(([date, impressions]) => {
                                    cumulativeViews += impressions;
                                    return {
                                      date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                                      impressions: cumulativeViews
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
                                  formatter={(value: number) => [value.toLocaleString(), 'Cumulative Views']}
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

                        {/* Views by Platform */}
                        <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
                          <div className="flex items-center justify-between mb-6">
                            <div>
                              <h3 className="text-xl font-bold text-gray-900">Views by Platform</h3>
                            </div>
                          </div>
                          <div className="h-96">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart margin={{ top: 20, right: 80, bottom: 20, left: 80 }}>
                                <Pie
                                  data={(() => {
                                    const platformViews = contents.reduce((acc, content) => {
                                      const platform = content.platform || 'Unknown';
                                      if (!acc[platform]) {
                                        acc[platform] = 0;
                                      }
                                      acc[platform] += content.impressions || 0;
                                      return acc;
                                    }, {} as Record<string, number>);

                                    return Object.entries(platformViews).map(([platform, impressions]) => ({
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
                                    const platformViews = contents.reduce((acc, content) => {
                                      const platform = content.platform || 'Unknown';
                                      if (!acc[platform]) {
                                        acc[platform] = 0;
                                      }
                                      acc[platform] += content.impressions || 0;
                                      return acc;
                                    }, {} as Record<string, number>);

                                    const colors = ['#3e8692', '#2d6470', '#1e4a5a', '#0f2d3a'];
                                    return Object.entries(platformViews).map((entry, index) => (
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
                                    const totalViews = contents.reduce((sum, content) => sum + (content.impressions || 0), 0);
                                    const percentage = totalViews > 0 ? ((value / totalViews) * 100).toFixed(1) : 0;
                                    return [
                                      `${value.toLocaleString()} (${percentage}%)`,
                                      'Views'
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

        {/* Snapshot timestamp — Spec section 3.1. Renders the most
            recent metrics update as a quiet footer line so clients
            know how fresh the numbers are. Uses the max updated_at
            across contents (the actual "last metrics pull") with a
            fallback to "now" when no content rows have updates yet. */}
        {(() => {
          let mostRecent: number | null = null;
          for (const c of contents) {
            if (c.updated_at) {
              const t = new Date(c.updated_at).getTime();
              if (!mostRecent || t > mostRecent) mostRecent = t;
            }
          }
          const stamp = (mostRecent ? new Date(mostRecent) : new Date()).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'UTC',
            timeZoneName: 'short',
          });
          return (
            <p className="text-[11px] text-gray-400 text-center mt-8">
              Data as of {stamp}
            </p>
          );
        })()}
      </div>
    </div>
  );
}


