'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search, Inbox, Clock, User, Mail, MessageSquare,
  Target, Calendar, ChevronDown, ChevronUp, RefreshCw, Loader2,
  ArrowRight, CheckCircle2, Download,
} from 'lucide-react';
import { downloadCsv, todayStamp } from '@/lib/csvExport';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { EmptyState } from '@/components/ui/empty-state';
import { KpiCard } from '@/components/ui/kpi-card';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRouter } from 'next/navigation';

interface ContactSubmission {
  id: number;
  name: string;
  project_name: string;
  email: string;
  role: string;
  telegram: string;
  funding: string;
  timeline: string;
  goals: string;
  created_at: string;
}

// Dedup-key prefix used when converting a submission into a CRM opportunity.
// The DB has a unique partial index on crm_opportunities.dedup_key, so this
// + the submission id guarantees one opportunity per submission.
const SUBMISSION_DEDUP_PREFIX = 'submission:';

// Bucket free-text funding values into broad ranges for the filter dropdown.
// Keep the buckets coarse — the form's funding strings vary too much to
// match exactly.
type FundingBucket = 'all' | '<500K' | '500K-2M' | '2M-10M' | '10M+' | 'unspecified';
const fundingBucketOf = (raw: string | null | undefined): FundingBucket => {
  if (!raw) return 'unspecified';
  const s = raw.toLowerCase();
  if (s.includes('100m') || s.includes('50m') || s.includes('25m') || s.includes('10m')) return '10M+';
  if (s.includes('5m') || s.includes('2m') || s.includes('3m')) return '2M-10M';
  if (s.includes('1m') || s.includes('500k') || s.includes('750k')) return '500K-2M';
  if (s.includes('k')) return '<500K';
  return 'unspecified';
};

type TimelineBucket = 'all' | 'asap' | 'soon' | 'quarter' | 'later' | 'unspecified';
const timelineBucketOf = (raw: string | null | undefined): TimelineBucket => {
  if (!raw) return 'unspecified';
  const s = raw.toLowerCase();
  if (s.includes('asap') || s.includes('immediately')) return 'asap';
  if (s.includes('1-2') || s.includes('soon') || s.includes('month')) return 'soon';
  if (s.includes('3-6') || s.includes('quarter')) return 'quarter';
  if (s.includes('6+') || s.includes('later') || s.includes('year')) return 'later';
  return 'unspecified';
};

// v11 tone maps — replace the per-page inline pill colors with the
// shared StatusBadge palette so this page reads like the rest of CRM.
// 2026-06-03.
const fundingTone = (raw: string | null | undefined): BadgeTone => {
  if (!raw) return 'neutral';
  if (raw.includes('10M') || raw.includes('50M') || raw.includes('100M')) return 'success';
  if (raw.includes('2M') || raw.includes('5M')) return 'brand';
  if (raw.includes('500K') || raw.includes('1M')) return 'info';
  return 'neutral';
};

const timelineTone = (raw: string | null | undefined): BadgeTone => {
  if (!raw) return 'neutral';
  const s = raw.toLowerCase();
  if (s.includes('asap') || s.includes('immediately')) return 'danger';
  if (s.includes('soon') || s.includes('1-2')) return 'warning';
  if (s.includes('3-6') || s.includes('quarter')) return 'info';
  return 'neutral';
};

export default function SubmissionsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<ContactSubmission[]>([]);
  // Track which submission ids already have a CRM opportunity. Looked up
  // via dedup_key so we can show a "Converted" badge and disable the
  // convert button without duplicating the opportunity.
  const [convertedIds, setConvertedIds] = useState<Set<number>>(new Set());
  const [convertedOppMap, setConvertedOppMap] = useState<Map<number, string>>(new Map());
  const [converting, setConverting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [fundingFilter, setFundingFilter] = useState<FundingBucket>('all');
  const [timelineFilter, setTimelineFilter] = useState<TimelineBucket>('all');
  const [convertedFilter, setConvertedFilter] = useState<'all' | 'pending' | 'converted'>('all');
  const [selectedSubmission, setSelectedSubmission] = useState<ContactSubmission | null>(null);
  const [sortField, setSortField] = useState<'created_at' | 'name' | 'project_name'>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  // Separate refreshing state so the manual refresh button can show a
  // spinner without blanking the table (vs. setLoading(true) which would).
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [{ data, error }, oppResp] = await Promise.all([
        supabase
          .from('contact_submissions')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('crm_opportunities')
          .select('id, dedup_key')
          .like('dedup_key', `${SUBMISSION_DEDUP_PREFIX}%`),
      ]);

      if (error) throw error;
      // Cast: DB row has nullable fields the local interface narrows. See
      // notes in archive/page.tsx for the long-term fix (align interfaces
      // with database.types.ts). Safe at runtime — extra fields ignored.
      setSubmissions((data || []) as ContactSubmission[]);

      // Build the converted-id map from existing opportunities.
      const ids = new Set<number>();
      const map = new Map<number, string>();
      for (const opp of (oppResp.data || []) as Array<{ id: string; dedup_key: string }>) {
        const subId = Number(opp.dedup_key.slice(SUBMISSION_DEDUP_PREFIX.length));
        if (Number.isFinite(subId)) {
          ids.add(subId);
          map.set(subId, opp.id);
        }
      }
      setConvertedIds(ids);
      setConvertedOppMap(map);
    } catch (error) {
      console.error('Error fetching submissions:', error);
      toast({
        title: 'Load failed',
        description: error instanceof Error ? error.message : 'Failed to load submissions',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Convert a submission into a CRM opportunity. Prefills as much as we
  // can from the form; relies on the unique dedup_key index to guarantee
  // a single opportunity per submission (race-safe).
  const convertToOpportunity = async (s: ContactSubmission) => {
    if (converting) return;
    setConverting(true);
    try {
      const dedupKey = `${SUBMISSION_DEDUP_PREFIX}${s.id}`;
      const notesParts = [
        s.goals && `Goals: ${s.goals}`,
        s.role && `Role: ${s.role}`,
        s.email && `Email: ${s.email}`,
        s.timeline && `Timeline: ${s.timeline}`,
        `Source: contact form (${formatDate(s.created_at)})`,
      ].filter(Boolean);

      const insertPayload: any = {
        name: s.project_name || s.name || 'Untitled inbound',
        stage: 'new',
        source: 'inbound',
        poc_platform: s.telegram ? 'telegram' : (s.email ? 'email' : null),
        poc_handle: s.telegram || s.email || null,
        tg_handle: s.telegram || null,
        decision_maker_name: s.name || null,
        funding_amount: s.funding || null,
        notes: notesParts.join('\n'),
        dedup_key: dedupKey,
      };

      const { data, error } = await supabase
        .from('crm_opportunities')
        .insert([insertPayload])
        .select('id')
        .single();

      if (error) {
        // Unique-violation on dedup_key means someone already converted
        // this submission — surface as a non-error and link to the
        // existing opportunity.
        if ((error as any).code === '23505') {
          const { data: existing } = await supabase
            .from('crm_opportunities')
            .select('id')
            .eq('dedup_key', dedupKey)
            .single();
          if (existing?.id) {
            toast({ title: 'Already converted', description: 'Opening existing opportunity.' });
            router.push(`/crm/sales-pipeline?opp=${existing.id}`);
            return;
          }
        }
        throw error;
      }

      setConvertedIds(prev => new Set(prev).add(s.id));
      setConvertedOppMap(prev => {
        const next = new Map(prev);
        if (data?.id) next.set(s.id, data.id);
        return next;
      });
      toast({ title: 'Opportunity created', description: `${insertPayload.name} added to the pipeline.` });
      if (data?.id) router.push(`/crm/sales-pipeline?opp=${data.id}`);
    } catch (err: any) {
      console.error('Error converting submission:', err);
      toast({ title: 'Conversion failed', description: err?.message || 'Could not create opportunity.', variant: 'destructive' });
    } finally {
      setConverting(false);
    }
  };

  const filtered = useMemo(() => {
    let items = submissions;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      items = items.filter(s =>
        s.name?.toLowerCase().includes(term) ||
        s.project_name?.toLowerCase().includes(term) ||
        s.email?.toLowerCase().includes(term) ||
        s.telegram?.toLowerCase().includes(term) ||
        s.role?.toLowerCase().includes(term)
      );
    }
    if (fundingFilter !== 'all') {
      items = items.filter(s => fundingBucketOf(s.funding) === fundingFilter);
    }
    if (timelineFilter !== 'all') {
      items = items.filter(s => timelineBucketOf(s.timeline) === timelineFilter);
    }
    if (convertedFilter === 'pending') items = items.filter(s => !convertedIds.has(s.id));
    if (convertedFilter === 'converted') items = items.filter(s => convertedIds.has(s.id));
    return [...items].sort((a, b) => {
      const aVal = a[sortField] || '';
      const bVal = b[sortField] || '';
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [submissions, searchTerm, sortField, sortDir, fundingFilter, timelineFilter, convertedFilter, convertedIds]);

  // Counts for the tab chips — derived from the search-filtered pool
  // but BEFORE the converted tab itself filters, so the chip count
  // reflects "what you'd see if you switched". Funding/timeline
  // filters also apply so the tab counts stay coherent with the
  // active narrowing.
  const tabCounts = useMemo(() => {
    let pool = submissions;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      pool = pool.filter(s =>
        s.name?.toLowerCase().includes(term) ||
        s.project_name?.toLowerCase().includes(term) ||
        s.email?.toLowerCase().includes(term) ||
        s.telegram?.toLowerCase().includes(term) ||
        s.role?.toLowerCase().includes(term)
      );
    }
    if (fundingFilter !== 'all') pool = pool.filter(s => fundingBucketOf(s.funding) === fundingFilter);
    if (timelineFilter !== 'all') pool = pool.filter(s => timelineBucketOf(s.timeline) === timelineFilter);
    return {
      all: pool.length,
      pending: pool.filter(s => !convertedIds.has(s.id)).length,
      converted: pool.filter(s => convertedIds.has(s.id)).length,
    };
  }, [submissions, searchTerm, fundingFilter, timelineFilter, convertedIds]);

  // Active-filter pretty-string for the SectionHeader counter. Empty
  // when no filters are applied so the counter reads as a clean
  // "N of M submissions".
  const activeFilterText = useMemo(() => {
    const parts: string[] = [];
    if (convertedFilter === 'pending') parts.push('pending');
    if (convertedFilter === 'converted') parts.push('converted');
    if (fundingFilter !== 'all') parts.push(fundingFilter);
    if (timelineFilter !== 'all') parts.push(timelineFilter);
    if (searchTerm) parts.push(`"${searchTerm}"`);
    return parts.join(' · ');
  }, [convertedFilter, fundingFilter, timelineFilter, searchTerm]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 inline ml-1" />
      : <ChevronDown className="h-3 w-3 inline ml-1" />;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  // Stats
  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisWeek = submissions.filter(s => new Date(s.created_at) >= weekAgo).length;
    const pending = submissions.filter(s => !convertedIds.has(s.id)).length;
    return { total: submissions.length, thisWeek, pending };
  }, [submissions, convertedIds]);

  // Header actions — extracted so the loading + loaded states share
  // identical shape (only `disabled` flips). Prevents the action row
  // from reflowing when data arrives.
  const headerActions = (disabled: boolean) => (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => downloadCsv(filtered, [
          { header: 'Date', accessor: r => new Date(r.created_at).toISOString() },
          { header: 'Name', accessor: r => r.name },
          { header: 'Project', accessor: r => r.project_name },
          { header: 'Role', accessor: r => r.role },
          { header: 'Email', accessor: r => r.email },
          { header: 'Telegram', accessor: r => r.telegram },
          { header: 'Funding', accessor: r => r.funding },
          { header: 'Timeline', accessor: r => r.timeline },
          { header: 'Goals', accessor: r => r.goals },
          { header: 'Converted', accessor: r => convertedIds.has(r.id) ? 'yes' : 'no' },
        ], `contact-submissions-${todayStamp()}`)}
        disabled={disabled || filtered.length === 0}
        title="Download current view as CSV"
      >
        <Download className="h-4 w-4 mr-1.5" />
        Export
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => fetchSubmissions(true)}
        disabled={disabled || refreshing}
        title="Refresh submissions"
      >
        {refreshing
          ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          : <RefreshCw className="h-4 w-4 mr-1.5" />}
        Refresh
      </Button>
    </>
  );

  // ── Loading branch ────────────────────────────────────────────────
  // Renders PageHeader + SectionHeader skeletons that mirror the
  // loaded shape exactly so the title strip + chapter divider don't
  // shift when data arrives. KPI grid uses h-24 rounded-xl (matches
  // KpiCard); filter toolbar mirrors tabs + search + selects; table
  // skeleton has the v11 header row + 5 body rows.
  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={Inbox}
          title="Contact Submissions"
          subtitle="Inbound inquiries from the contact form"
          kicker="CRM · Submissions"
          kickerDot="brand"
          actions={headerActions(true)}
        />

        {/* 4 KPI tiles — matches the loaded grid-cols-1 md:grid-cols-4
            (previous version mismatched with grid-cols-3 + 3 cards,
            which caused the row to reshape when data landed). */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>

        <div className="space-y-4">
          {/* SectionHeader skeleton — dot + label width + counter,
              `.first` so the top hairline is suppressed. */}
          <div className="section-head first flex items-center gap-3">
            <span className="dot bg-brand/30" aria-hidden />
            <Skeleton className="h-3 w-24" />
            <span className="flex-1 h-px bg-cream-200" aria-hidden />
            <Skeleton className="h-3 w-40" />
          </div>

          {/* Filter toolbar skeleton — tabs left, search middle, selects right. */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1 p-1 rounded-md bg-cream-100 border border-cream-200">
              <Skeleton className="h-8 w-14 rounded" />
              <Skeleton className="h-8 w-20 rounded" />
              <Skeleton className="h-8 w-24 rounded" />
            </div>
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-warm-400" aria-hidden />
              <Input
                placeholder="Search by name, project, email..."
                className="pl-10 focus-brand"
                disabled
              />
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Skeleton className="h-9 w-32 rounded-md" />
              <Skeleton className="h-9 w-32 rounded-md" />
            </div>
          </div>

          {/* Table skeleton — v11 header strip + 5 body rows shaped
              like real submission rows. */}
          <Card className="overflow-hidden">
            <div className="border-b border-cream-200 bg-cream-50/80 py-2.5 px-5 flex items-center gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className={`h-3 ${i === 1 || i === 2 ? 'flex-1' : 'w-16'}`} />
              ))}
            </div>
            <div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-3.5 px-5 border-b border-cream-100 last:border-0">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 flex-1 max-w-[180px]" />
                  <Skeleton className="h-4 flex-1 max-w-[160px]" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // ── Loaded branch ─────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Inbox}
        title="Contact Submissions"
        subtitle="Inbound inquiries from the contact form"
        kicker="CRM · Submissions"
        kickerDot="brand"
        actions={headerActions(false)}
      />

      {/* 4 KPI tiles — Total in brand teal as the headline; This Week
          in sky (recency); Pending amber when there's a backlog else
          gray; Latest as a soft gray date. */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KpiCard
          icon={Inbox}
          label="Total"
          value={stats.total}
          sub="all submissions"
          accent="brand"
        />
        <KpiCard
          icon={Clock}
          label="This Week"
          value={stats.thisWeek}
          sub="last 7 days"
          accent="sky"
        />
        <KpiCard
          icon={Target}
          label="Pending"
          value={stats.pending}
          sub="not yet converted"
          accent={stats.pending > 0 ? 'amber' : 'gray'}
        />
        <KpiCard
          icon={Calendar}
          label="Latest"
          value={submissions.length > 0 ? formatDate(submissions[0].created_at) : '—'}
          sub="most recent"
          accent="gray"
        />
      </div>

      <div className="space-y-4">
        {/* v11 chapter divider above the filter row + table. Counter
            reflects the live narrowing so it doubles as a "what's
            applied" readout. */}
        <SectionHeader
          label="Inquiries"
          dot="brand"
          counter={`${filtered.length} of ${submissions.length} submissions${activeFilterText ? ` · ${activeFilterText}` : ''}`}
          first
        />

        {/* v11 filter toolbar — Tabs (left) + Search (middle, flex-1
            min-w-[220px] max-w-sm) + power-user selects (right). */}
        <div className="flex items-center gap-3 flex-wrap">
          <Tabs value={convertedFilter} onValueChange={(v) => setConvertedFilter(v as typeof convertedFilter)}>
            <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200">
              <TabsTrigger
                value="all"
                className="px-3 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-brand"
              >
                All
                <span className="text-xs bg-brand-light text-brand px-2 py-0.5 rounded-full ml-2 tabular-nums">
                  {tabCounts.all}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="pending"
                className="px-3 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-brand"
              >
                Pending
                <span className="text-xs bg-brand-light text-brand px-2 py-0.5 rounded-full ml-2 tabular-nums">
                  {tabCounts.pending}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="converted"
                className="px-3 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-brand"
              >
                Converted
                <span className="text-xs bg-brand-light text-brand px-2 py-0.5 rounded-full ml-2 tabular-nums">
                  {tabCounts.converted}
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-warm-400 pointer-events-none" aria-hidden />
            <Input
              placeholder="Search by name, project, email..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10 focus-brand"
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <Select value={fundingFilter} onValueChange={(v) => setFundingFilter(v as FundingBucket)}>
              <SelectTrigger className="h-9 w-36 text-sm focus-brand"><SelectValue placeholder="Funding" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All funding</SelectItem>
                <SelectItem value="<500K">&lt; $500K</SelectItem>
                <SelectItem value="500K-2M">$500K – $2M</SelectItem>
                <SelectItem value="2M-10M">$2M – $10M</SelectItem>
                <SelectItem value="10M+">$10M+</SelectItem>
                <SelectItem value="unspecified">Unspecified</SelectItem>
              </SelectContent>
            </Select>
            <Select value={timelineFilter} onValueChange={(v) => setTimelineFilter(v as TimelineBucket)}>
              <SelectTrigger className="h-9 w-36 text-sm focus-brand"><SelectValue placeholder="Timeline" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All timelines</SelectItem>
                <SelectItem value="asap">ASAP</SelectItem>
                <SelectItem value="soon">Within 1–2 mo</SelectItem>
                <SelectItem value="quarter">3–6 months</SelectItem>
                <SelectItem value="later">6+ months</SelectItem>
                <SelectItem value="unspecified">Unspecified</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table — v11 chrome: cream-50 header strip + ink-warm-500
            tracked-out column headers + per-row border-cream-100. */}
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                <TableHead
                  className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 cursor-pointer w-[180px]"
                  onClick={() => handleSort('created_at')}
                >
                  Date <SortIcon field="created_at" />
                </TableHead>
                <TableHead
                  className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 cursor-pointer"
                  onClick={() => handleSort('name')}
                >
                  Name <SortIcon field="name" />
                </TableHead>
                <TableHead
                  className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 cursor-pointer"
                  onClick={() => handleSort('project_name')}
                >
                  Project <SortIcon field="project_name" />
                </TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Role</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Email</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Telegram</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Funding</TableHead>
                <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Timeline</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  {/* colSpan must match the column count above (8) so the
                      empty cell spans the whole table — narrowing this
                      would push the icon to the leftmost column only. */}
                  <TableCell colSpan={8} className="p-0">
                    <EmptyState
                      icon={Inbox}
                      title={
                        searchTerm || fundingFilter !== 'all' || timelineFilter !== 'all' || convertedFilter !== 'all'
                          ? 'No submissions match your filters.'
                          : 'No submissions yet.'
                      }
                      description={
                        searchTerm || fundingFilter !== 'all' || timelineFilter !== 'all' || convertedFilter !== 'all'
                          ? 'Try widening the filter or clearing the search.'
                          : 'When someone submits the contact form, the inquiry will appear here.'
                      }
                      className="py-12"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(s => (
                  <TableRow
                    key={s.id}
                    className="border-cream-100 row-accent cursor-pointer"
                    onClick={() => setSelectedSubmission(s)}
                  >
                    <TableCell className="py-3.5 px-5 text-sm text-ink-warm-500 tabular-nums">
                      <div>{formatDate(s.created_at)}</div>
                      <div className="text-xs text-ink-warm-400">{formatTime(s.created_at)}</div>
                    </TableCell>
                    <TableCell className="py-3.5 px-5 font-medium text-ink-warm-900">
                      <div className="flex items-center gap-2">
                        <span>{s.name}</span>
                        {convertedIds.has(s.id) && (
                          <StatusBadge tone="success" size="sm">
                            <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                            In pipeline
                          </StatusBadge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 px-5 text-ink-warm-700">{s.project_name}</TableCell>
                    <TableCell className="py-3.5 px-5 text-ink-warm-500 text-sm">{s.role}</TableCell>
                    <TableCell className="py-3.5 px-5">
                      <a
                        href={`mailto:${s.email}`}
                        onClick={e => e.stopPropagation()}
                        className="text-sm text-brand hover:text-brand-dark hover:underline"
                      >
                        {s.email}
                      </a>
                    </TableCell>
                    <TableCell className="py-3.5 px-5 text-sm text-ink-warm-700">{s.telegram}</TableCell>
                    <TableCell className="py-3.5 px-5">
                      {s.funding ? (
                        <StatusBadge tone={fundingTone(s.funding)} size="sm">{s.funding}</StatusBadge>
                      ) : (
                        <span className="text-xs text-ink-warm-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5 px-5">
                      {s.timeline ? (
                        <StatusBadge tone={timelineTone(s.timeline)} size="sm">{s.timeline}</StatusBadge>
                      ) : (
                        <span className="text-xs text-ink-warm-400">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Detail Dialog — v11 scroll/footer pattern. Body is the sole
          scroll surface (flex-1 overflow-y-auto), footer pinned with
          border-t. Convert / Open-in-pipeline action moves into the
          DialogFooter instead of a free-floating row at the bottom
          of the body. */}
      <Dialog open={!!selectedSubmission} onOpenChange={open => !open && setSelectedSubmission(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-4 w-4 text-brand" />
              {selectedSubmission?.name || 'Submission'}
            </DialogTitle>
            {selectedSubmission && (
              <DialogDescription>
                Submitted {formatDate(selectedSubmission.created_at)} at {formatTime(selectedSubmission.created_at)}
              </DialogDescription>
            )}
          </DialogHeader>
          {selectedSubmission && (
            <div className="flex-1 overflow-y-auto px-1 py-2 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-warm-400 mb-1">Project</p>
                  <p className="text-sm font-medium text-ink-warm-900">{selectedSubmission.project_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-warm-400 mb-1">Role</p>
                  <p className="text-sm text-ink-warm-700">{selectedSubmission.role || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-warm-400 mb-1">Email</p>
                  {selectedSubmission.email ? (
                    <a
                      href={`mailto:${selectedSubmission.email}`}
                      className="text-sm text-brand hover:text-brand-dark hover:underline inline-flex items-center gap-1"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {selectedSubmission.email}
                    </a>
                  ) : (
                    <p className="text-sm text-ink-warm-400">—</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-warm-400 mb-1">Telegram</p>
                  <p className="text-sm text-ink-warm-700 flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {selectedSubmission.telegram || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-warm-400 mb-1">Funding</p>
                  {selectedSubmission.funding ? (
                    <StatusBadge tone={fundingTone(selectedSubmission.funding)} size="sm">
                      {selectedSubmission.funding}
                    </StatusBadge>
                  ) : (
                    <p className="text-sm text-ink-warm-400">—</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-warm-400 mb-1">Timeline</p>
                  {selectedSubmission.timeline ? (
                    <StatusBadge tone={timelineTone(selectedSubmission.timeline)} size="sm">
                      {selectedSubmission.timeline}
                    </StatusBadge>
                  ) : (
                    <p className="text-sm text-ink-warm-400">—</p>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-warm-400 mb-1">Goals</p>
                <div className="bg-cream-50 rounded-lg p-3 text-sm text-ink-warm-700 leading-relaxed border border-cream-200">
                  {selectedSubmission.goals || '—'}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            {selectedSubmission && convertedIds.has(selectedSubmission.id) ? (
              <Button
                variant="outline"
                onClick={() => {
                  const oppId = convertedOppMap.get(selectedSubmission.id);
                  if (oppId) router.push(`/crm/sales-pipeline?opp=${oppId}`);
                }}
              >
                <ArrowRight className="h-4 w-4 mr-1.5" /> Open in pipeline
              </Button>
            ) : selectedSubmission ? (
              <Button
                variant="brand"
                onClick={() => convertToOpportunity(selectedSubmission)}
                disabled={converting}
              >
                {converting ? (
                  <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Converting…</>
                ) : (
                  <><Target className="h-4 w-4 mr-1.5" /> Convert to opportunity</>
                )}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
