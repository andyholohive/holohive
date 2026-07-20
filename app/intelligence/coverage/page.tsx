'use client';

/**
 * TG Intelligence Layer — the coverage read (provisional standalone
 * host). Keyed by ?subject_type=&subject_id=&query=; later embeds into
 * the sales-pipeline prospect detail once the CRM rebuild settles the
 * prospect record shape. Lives under /intelligence so it inherits that
 * layout's ProtectedRoute + Sidebar.
 *
 * Two artifacts from one contract (addendum):
 *   • Leave-behind — the data + representative posts. HTML for internal
 *     viewing; the branded PDF Export lands with the coverage-snapshot
 *     template pack.
 *   • Call-prep — the interpretation. Editable, team-facing, never
 *     handed to the client. Saved to the contract's callprep_draft.
 *
 * The client-safe vs internal split is structural: the analysis-layer
 * contract carries NO tier/scores/bookable handles, so nothing
 * tier-shaped can leak into the leave-behind; the interpretation lives
 * only in the call-prep textarea.
 */

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiCard } from '@/components/ui/kpi-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { formatDate, formatDateTime } from '@/lib/dateFormat';
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell } from 'recharts';
import { Radar, Play, RefreshCw, Download, Layers } from 'lucide-react';

type Contract = {
  query: string | null;
  window_days: number;
  generated_basis: { channels_scanned: number; channels_readable: number; scanned_at_latest: string | null };
  counts: { channels_covered: number; posts_total: number; pct_of_tracked_network: number | null; channels_repeat: number };
  channel_type_breakdown: Array<{ channel_type: string; channels: number; posts: number; avg_views_per_post: number | null }>;
  velocity: Array<{ month: string; posts: number }>;
  representative_posts: Array<{
    channel_handle: string | null; channel_title: string | null; channel_type: string | null;
    tg_message_id: number; posted_at: string; text: string; views: number | null; reaction_total: number | null; is_forward: boolean;
  }>;
  topic_split: null;
};

function CoverageInner() {
  const params = useSearchParams();
  const { toast } = useToast();

  const subjectType = params.get('subject_type') || 'project';
  const subjectId = params.get('subject_id') || '';
  const queryParam = params.get('query') || '';

  const [loading, setLoading] = useState(true);
  const [contractId, setContractId] = useState<string | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [callprep, setCallprep] = useState('');
  const [savingCallprep, setSavingCallprep] = useState(false);

  const [runQuery, setRunQuery] = useState(queryParam);
  const [runDays, setRunDays] = useState(30);
  const [dispatching, setDispatching] = useState(false);
  const [generating, setGenerating] = useState(false);

  const fetchLatest = useCallback(async () => {
    if (!subjectId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/intelligence/coverage?subject_type=${subjectType}&subject_id=${subjectId}`);
      if (res.ok) {
        const d = await res.json();
        setContractId(d.id);
        setContract(d.contract);
        setGeneratedAt(d.generated_at);
        setCallprep(typeof d.callprep_draft?.text === 'string' ? d.callprep_draft.text : '');
        setRunQuery((q) => q || d.contract?.query || '');
      } else {
        setContract(null);
      }
    } finally {
      setLoading(false);
    }
  }, [subjectType, subjectId]);

  useEffect(() => { fetchLatest(); }, [fetchLatest]);

  const dispatchScan = async () => {
    if (!runQuery.trim()) { toast({ title: 'Enter a project name / ticker to scan for' }); return; }
    setDispatching(true);
    try {
      const res = await fetch('/api/intelligence/coverage/dispatch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject_type: subjectType, subject_id: subjectId, query: runQuery.trim(), days: runDays }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.hint || d.detail || d.error || 'Dispatch failed');
      toast({ title: 'Scan queued', description: 'Roster scan is running — posts land in a few minutes, then hit Generate.' });
    } catch (e: any) {
      toast({ title: 'Scan dispatch failed', description: e.message, variant: 'destructive' });
    } finally {
      setDispatching(false);
    }
  };

  const generateContract = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/intelligence/coverage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject_type: subjectType, subject_id: subjectId, window_days: runDays }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Generate failed');
      setContractId(d.id); setContract(d.contract); setGeneratedAt(d.generated_at);
      toast({ title: 'Contract generated', description: `${d.contract.counts.posts_total} post(s) across ${d.contract.counts.channels_covered} channel(s).` });
    } catch (e: any) {
      toast({ title: 'Generate failed', description: e.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const saveCallprep = async () => {
    if (!contractId) return;
    setSavingCallprep(true);
    try {
      const res = await fetch('/api/intelligence/coverage', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: contractId, callprep_draft: { text: callprep } }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      toast({ title: 'Call-prep saved' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSavingCallprep(false);
    }
  };

  const runControls = (
    <div className="flex items-end gap-2 flex-wrap">
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-gray-500">Project / ticker</Label>
        <Input value={runQuery} onChange={(e) => setRunQuery(e.target.value)} placeholder="e.g. Robinhood" className="h-9 w-44 focus-brand" />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-gray-500">Window</Label>
        <Input type="number" value={runDays} min={7} max={180} onChange={(e) => setRunDays(Math.max(7, Math.min(180, parseInt(e.target.value) || 30)))} className="h-9 w-20 focus-brand" />
      </div>
      <Button variant="outline" size="sm" onClick={dispatchScan} disabled={dispatching || !subjectId}>
        <Play className="h-4 w-4 mr-2" />{dispatching ? 'Queuing…' : 'Run scan'}
      </Button>
      <Button variant="brand" size="sm" onClick={generateContract} disabled={generating || !subjectId}>
        <RefreshCw className={`h-4 w-4 mr-2 ${generating ? 'animate-spin' : ''}`} />{generating ? 'Generating…' : 'Generate'}
      </Button>
    </div>
  );

  if (!subjectId) {
    return (
      <div className="space-y-6">
        <PageHeader icon={Radar} title="Coverage Intelligence" subtitle="Pre-call prospect coverage research" />
        <EmptyState icon={Radar} title="No subject selected"
          description="Open this from a prospect record, or pass ?subject_type=project&subject_id=<uuid>&query=<name> in the URL." />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader icon={Radar} title="Coverage Intelligence" subtitle="Pre-call prospect coverage research" actions={runControls} />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  const maxVelocity = contract ? Math.max(1, ...contract.velocity.map(v => v.posts)) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Radar}
        title="Coverage Intelligence"
        subtitle={contract?.query ? `Korean TG coverage for “${contract.query}”` : 'Pre-call prospect coverage research'}
        actions={runControls}
      />

      {!contract ? (
        <EmptyState icon={Radar} title="No coverage read yet"
          description="Run a scan for this prospect, wait for the roster sweep to finish, then Generate to build the coverage read.">
          <Button variant="brand" onClick={dispatchScan} disabled={dispatching}>
            <Play className="h-4 w-4 mr-2" />Run first scan
          </Button>
        </EmptyState>
      ) : (
        <Tabs defaultValue="leavebehind">
          <TabsList>
            <TabsTrigger value="leavebehind">Leave-behind (client-safe)</TabsTrigger>
            <TabsTrigger value="callprep">Call-prep (internal)</TabsTrigger>
          </TabsList>

          <TabsContent value="leavebehind" className="space-y-6 mt-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
              <span>Generated {generatedAt ? formatDateTime(generatedAt) : '—'}</span>
              <span>·</span>
              <span>Trailing {contract.window_days} days</span>
              <span>·</span>
              <span>{contract.generated_basis.channels_scanned} channels scanned, {contract.generated_basis.channels_readable} readable</span>
              <Button variant="outline" size="sm" className="ml-auto" disabled title="Branded PDF lands with the coverage-snapshot template pack">
                <Download className="h-4 w-4 mr-2" />Export PDF (soon)
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <KpiCard icon={Radar} label="Channels covered" value={contract.counts.channels_covered} accent="brand" sub="≥1 matching post" />
              <KpiCard icon={Layers} label="Posts referencing" value={contract.counts.posts_total} accent="sky" />
              <KpiCard icon={Radar} label="% of tracked network" value={contract.counts.pct_of_tracked_network != null ? `${contract.counts.pct_of_tracked_network}%` : '—'} accent="purple" sub="indicative, not complete" />
              <KpiCard icon={Layers} label="Covered more than once" value={contract.counts.channels_repeat} accent="emerald" />
            </div>

            <Card className="border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-100 text-sm font-semibold text-gray-700">Who is covering it</div>
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Channel type</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Channels</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Posts</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Avg views / post</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contract.channel_type_breakdown.map((r) => (
                    <TableRow key={r.channel_type} className="border-gray-100">
                      <TableCell className="py-3"><StatusBadge tone="slate">{r.channel_type}</StatusBadge></TableCell>
                      <TableCell className="py-3">{r.channels}</TableCell>
                      <TableCell className="py-3">{r.posts}</TableCell>
                      <TableCell className="py-3 tabular-nums">{r.avg_views_per_post != null ? r.avg_views_per_post.toLocaleString('en-US') : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            <Card className="border-gray-200 p-4">
              <div className="text-sm font-semibold text-gray-700 mb-3">Velocity — posts per month</div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={contract.velocity}>
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Bar dataKey="posts" radius={[4, 4, 0, 0]}>
                      {contract.velocity.map((v, i) => (
                        <Cell key={i} fill={v.posts >= maxVelocity ? '#3e8692' : '#9cc3c9'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-100 text-sm font-semibold text-gray-700">What the channels are saying <span className="font-normal text-gray-400">— top post per channel, verbatim</span></div>
              <div className="divide-y divide-gray-100">
                {contract.representative_posts.map((p) => (
                  <div key={p.tg_message_id} className="p-4">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{p.channel_title || p.channel_handle || 'Channel'}</span>
                      {p.channel_type && <StatusBadge tone="slate" size="sm">{p.channel_type}</StatusBadge>}
                      {p.is_forward && <StatusBadge tone="neutral" size="sm">Forward</StatusBadge>}
                      <span className="ml-auto text-xs text-gray-500">{formatDate(p.posted_at)} · {p.views != null ? `${p.views.toLocaleString('en-US')} views` : '—'} · {p.reaction_total ?? 0} reactions</span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-4">{p.text}</p>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="callprep" className="space-y-4 mt-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Internal only — the interpretation, why the narrative formed, the gap to land, talking points. Never handed to the client; delivered live.
            </div>
            <Textarea
              value={callprep}
              onChange={(e) => setCallprep(e.target.value)}
              placeholder={'Why the narrative formed…\n\nThe take…\n\nThe gap to land…\n\nTalking points…'}
              className="focus-brand min-h-[320px] font-mono text-sm"
            />
            <div className="flex justify-end">
              <Button variant="brand" onClick={saveCallprep} disabled={savingCallprep || !contractId}>
                {savingCallprep ? 'Saving…' : 'Save call-prep'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

export default function CoveragePage() {
  return (
    <Suspense fallback={<div className="p-6"><Skeleton className="h-64 rounded-lg" /></div>}>
      <CoverageInner />
    </Suspense>
  );
}
