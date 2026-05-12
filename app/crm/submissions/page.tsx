'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Search, Inbox, Clock, DollarSign, User, Mail, MessageSquare,
  Target, Calendar, ChevronDown, ChevronUp, ExternalLink, RefreshCw, Loader2,
  ArrowRight, CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { EmptyState } from '@/components/ui/empty-state';
import { KpiCard } from '@/components/ui/kpi-card';
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
        title: 'Error',
        description: 'Failed to load submissions',
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

  const timelineColor = (timeline: string) => {
    if (timeline?.toLowerCase().includes('asap') || timeline?.toLowerCase().includes('immediately')) return 'bg-red-100 text-red-700 border-red-200';
    if (timeline?.toLowerCase().includes('soon') || timeline?.toLowerCase().includes('1-2')) return 'bg-amber-100 text-amber-700 border-amber-200';
    if (timeline?.toLowerCase().includes('3-6') || timeline?.toLowerCase().includes('quarter')) return 'bg-blue-100 text-blue-700 border-blue-200';
    return 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const fundingColor = (funding: string) => {
    if (funding?.includes('10M') || funding?.includes('50M') || funding?.includes('100M')) return 'bg-green-100 text-green-700 border-green-200';
    if (funding?.includes('2M') || funding?.includes('5M')) return 'bg-teal-100 text-teal-700 border-teal-200';
    if (funding?.includes('500K') || funding?.includes('1M')) return 'bg-blue-100 text-blue-700 border-blue-200';
    return 'bg-gray-100 text-gray-700 border-gray-200';
  };

  // Stats
  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisWeek = submissions.filter(s => new Date(s.created_at) >= weekAgo).length;
    const pending = submissions.filter(s => !convertedIds.has(s.id)).length;
    return { total: submissions.length, thisWeek, pending };
  }, [submissions, convertedIds]);

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header — real title/subtitle render immediately. */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Contact Submissions</h2>
            <p className="text-gray-600">Inbound inquiries from the contact form</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header — title left, search + refresh on the right.
          Standardized 2026-05-06: previously there were no actions in
          the header and the search lived in its own row below the stat
          cards. Now matches /network and /crm/contacts which keep
          search inline with the page title. */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Contact Submissions</h2>
          <p className="text-gray-600">Inbound inquiries from the contact form</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name, project, email..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10 w-64"
            />
          </div>
          <Select value={fundingFilter} onValueChange={(v) => setFundingFilter(v as FundingBucket)}>
            <SelectTrigger className="h-9 w-32 text-sm"><SelectValue placeholder="Funding" /></SelectTrigger>
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
            <SelectTrigger className="h-9 w-32 text-sm"><SelectValue placeholder="Timeline" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All timelines</SelectItem>
              <SelectItem value="asap">ASAP</SelectItem>
              <SelectItem value="soon">Within 1–2 mo</SelectItem>
              <SelectItem value="quarter">3–6 months</SelectItem>
              <SelectItem value="later">6+ months</SelectItem>
              <SelectItem value="unspecified">Unspecified</SelectItem>
            </SelectContent>
          </Select>
          <Select value={convertedFilter} onValueChange={(v) => setConvertedFilter(v as any)}>
            <SelectTrigger className="h-9 w-36 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchSubmissions(true)}
            disabled={refreshing}
            title="Refresh submissions"
          >
            {refreshing
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Stats — flat KpiCard baseline (was 3 ad-hoc Cards before
          2026-05-06). Total uses brand teal as the primary metric;
          This Week uses sky for "fresh / recent" semantics; Latest is
          gray since it's a date, not a count. */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          icon={Inbox}
          label="Total"
          value={stats.total}
          sub="All submissions"
          accent="brand"
        />
        <KpiCard
          icon={Clock}
          label="This Week"
          value={stats.thisWeek}
          sub="Last 7 days"
          accent="sky"
        />
        <KpiCard
          icon={Target}
          label="Pending"
          value={stats.pending}
          sub="Not yet converted"
          accent={stats.pending > 0 ? 'amber' : 'gray'}
        />
        <KpiCard
          icon={Calendar}
          label="Latest"
          value={submissions.length > 0 ? formatDate(submissions[0].created_at) : '—'}
          sub="Most recent submission"
          accent="gray"
        />
      </div>

      {/* Search bar moved into the header above on 2026-05-06 (was a
          standalone row below the stats). */}

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer hover:text-gray-900 w-[180px]"
                onClick={() => handleSort('created_at')}
              >
                Date <SortIcon field="created_at" />
              </TableHead>
              <TableHead
                className="cursor-pointer hover:text-gray-900"
                onClick={() => handleSort('name')}
              >
                Name <SortIcon field="name" />
              </TableHead>
              <TableHead
                className="cursor-pointer hover:text-gray-900"
                onClick={() => handleSort('project_name')}
              >
                Project <SortIcon field="project_name" />
              </TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Telegram</TableHead>
              <TableHead>Funding</TableHead>
              <TableHead>Timeline</TableHead>
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
                    title={searchTerm ? 'No submissions match your search.' : 'No submissions yet.'}
                    className="py-12"
                  />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(s => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => setSelectedSubmission(s)}
                >
                  <TableCell className="text-sm text-gray-500">
                    <div>{formatDate(s.created_at)}</div>
                    <div className="text-xs text-gray-400">{formatTime(s.created_at)}</div>
                  </TableCell>
                  <TableCell className="font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      <span>{s.name}</span>
                      {convertedIds.has(s.id) && (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 gap-1"
                          title="Converted to opportunity"
                        >
                          <CheckCircle2 className="h-2.5 w-2.5" /> In pipeline
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-700">{s.project_name}</TableCell>
                  <TableCell className="text-gray-500 text-sm">{s.role}</TableCell>
                  <TableCell>
                    <a
                      href={`mailto:${s.email}`}
                      onClick={e => e.stopPropagation()}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {s.email}
                    </a>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{s.telegram}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${fundingColor(s.funding)}`}>
                      {s.funding}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${timelineColor(s.timeline)}`}>
                      {s.timeline}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedSubmission} onOpenChange={open => !open && setSelectedSubmission(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" style={{ color: '#3e8692' }} />
              {selectedSubmission?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedSubmission && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Project</p>
                  <p className="text-sm font-medium text-gray-900">{selectedSubmission.project_name}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Role</p>
                  <p className="text-sm text-gray-700">{selectedSubmission.role}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Email</p>
                  <a href={`mailto:${selectedSubmission.email}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    {selectedSubmission.email}
                  </a>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Telegram</p>
                  <p className="text-sm text-gray-700 flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {selectedSubmission.telegram}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Funding</p>
                  <Badge variant="outline" className={`text-xs ${fundingColor(selectedSubmission.funding)}`}>
                    <DollarSign className="h-3 w-3 mr-1" />
                    {selectedSubmission.funding}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Timeline</p>
                  <Badge variant="outline" className={`text-xs ${timelineColor(selectedSubmission.timeline)}`}>
                    <Clock className="h-3 w-3 mr-1" />
                    {selectedSubmission.timeline}
                  </Badge>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Goals</p>
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 leading-relaxed border">
                  {selectedSubmission.goals || '—'}
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t text-xs text-gray-400">
                <span>Submitted {formatDate(selectedSubmission.created_at)} at {formatTime(selectedSubmission.created_at)}</span>
              </div>

              {/* Convert / open-existing action — closes the funnel by
                  pulling the submission into the actual sales pipeline. */}
              <div className="pt-3 border-t flex justify-end gap-2">
                {convertedIds.has(selectedSubmission.id) ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const oppId = convertedOppMap.get(selectedSubmission.id);
                      if (oppId) router.push(`/crm/sales-pipeline?opp=${oppId}`);
                    }}
                  >
                    <ArrowRight className="h-4 w-4 mr-1.5" /> Open in pipeline
                  </Button>
                ) : (
                  <Button
                    onClick={() => convertToOpportunity(selectedSubmission)}
                    disabled={converting}
                    style={{ backgroundColor: '#3e8692', color: 'white' }}
                    className="hover:opacity-90"
                  >
                    {converting ? (
                      <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Converting…</>
                    ) : (
                      <><Target className="h-4 w-4 mr-1.5" /> Convert to opportunity</>
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
