'use client';

/**
 * Korea Scan — run Yano's Korea read for any project, not only clients:
 * a prospect before a call, a competitor, a client's category. Reads the
 * Korean Telegram corpus (tg_channel_posts). Admin + super-admin.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, ArrowLeft, Loader2, Lock, Radar, ScanSearch } from 'lucide-react';
import { formatDate } from '@/lib/dateFormat';
import { KoreaScanReport } from '@/components/koreaScan/KoreaScanReport';
import type { KoreaScan } from '@/lib/koreaScan/compute';

interface PeerSetOption { id: string; label: string; field: string; members: string[] }
interface ProjectOption { name: string; aliases: string[]; exclude?: string[]; setId: string }

const split = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);

export default function KoreaScanPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin';

  const [sets, setSets] = useState<PeerSetOption[] | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [corpus, setCorpus] = useState<{ lastPostAt: string | null; trackedChannels: number } | null>(null);
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState('');
  const [exclude, setExclude] = useState('');
  const [peerSetId, setPeerSetId] = useState('');
  const [preparedFor, setPreparedFor] = useState('');
  const [running, setRunning] = useState(false);
  const [scan, setScan] = useState<KoreaScan | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/korea-scan').then((r) => r.json()).then((d) => {
      setSets(d.peerSets ?? []);
      setProjects(d.projects ?? []);
      setCorpus(d.corpus ?? null);
    }).catch(() => setSets([]));
  }, [isAdmin]);

  function prefill(projectName: string) {
    const p = projects.find((x) => x.name === projectName);
    if (!p) return;
    setName(p.name);
    setAliases(p.aliases.join(', '));
    setExclude((p.exclude ?? []).join(', '));
    setPeerSetId(p.setId);
  }

  async function run() {
    setRunning(true);
    try {
      const res = await fetch('/api/korea-scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, aliases: split(aliases), exclude: split(exclude), peerSetId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Scan failed');
      setScan(d.scan);
    } catch (e: any) {
      toast({ title: 'Scan failed', description: e.message, variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  }

  const staleDays = corpus?.lastPostAt ? Math.floor((Date.now() - Date.parse(corpus.lastPostAt)) / 86_400_000) : null;
  const canRun = !!name.trim() && split(aliases).length > 0 && !!peerSetId && !running;

  const header = (
    <>
      <Link href="/mindshare" className="inline-flex w-fit items-center text-xs text-gray-500 transition-colors hover:text-brand">
        <ArrowLeft className="mr-1 h-3 w-3" />Back to Korea Signal
      </Link>
      <PageHeader icon={ScanSearch} title="Korea Scan"
        subtitle="How any project is covered in Korean crypto Telegram, against its field. For prospects as well as clients." />
    </>
  );

  if (authLoading) return <div className="space-y-6">{header}<Skeleton className="h-48 rounded-lg" /></div>;
  if (!isAdmin) {
    return (
      <div className="space-y-6">{header}
        <Card><EmptyState icon={Lock} title="Admins only" description="Korea Scan is limited to admin and super-admin accounts." /></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {staleDays != null && staleDays > 7 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <b className="font-semibold">The Korean channel crawl stopped {staleDays} days ago.</b> The newest post is from {formatDate(corpus!.lastPostAt!)}, so every scan
            ends there. Restart the crawler before sending a scan to a prospect.
          </p>
        </div>
      )}

      <Card className="border-gray-200">
        {!sets ? (
          <div className="grid gap-4 p-5 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : (
          <div className="space-y-4 p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Start from a tracked project</Label>
                <Select onValueChange={prefill}>
                  <SelectTrigger className="h-9 focus-brand"><SelectValue placeholder="Optional: fills in the spellings" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {projects.map((p) => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Compare against <RequiredAsterisk /></Label>
                <Select value={peerSetId} onValueChange={setPeerSetId}>
                  <SelectTrigger className="h-9 focus-brand"><SelectValue placeholder="Pick the project's field" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {sets.map((s) => <SelectItem key={s.id} value={s.id}>{s.label} · {s.members.length}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ks-name">Project name <RequiredAsterisk /></Label>
                <Input id="ks-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="RISE" className="h-9 focus-brand" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ks-for">Prepared for</Label>
                <Input id="ks-for" value={preparedFor} onChange={(e) => setPreparedFor(e.target.value)} placeholder="Shown on the cover. Leave blank for internal use." className="h-9 focus-brand" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ks-aliases">Spellings to match <RequiredAsterisk /></Label>
                <Input id="ks-aliases" value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="라이즈엑스, RISEx, rise.trade" className="h-9 focus-brand" />
                <p className="text-xs text-gray-500">Comma-separated. Include the Korean spelling. Short all-caps tickers match case-sensitively.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ks-exclude">Words that mean something else</Label>
                <Input id="ks-exclude" value={exclude} onChange={(e) => setExclude(e.target.value)} placeholder="엔터프라이즈, 서프라이즈" className="h-9 focus-brand" />
                <p className="text-xs text-gray-500">Removed before matching, so 엔터프라이즈 doesn’t count as 라이즈.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="brand" onClick={run} disabled={!canRun}>
                {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Radar className="mr-2 h-4 w-4" />}
                {running ? 'Scanning…' : 'Run scan'}
              </Button>
              <span className="text-xs text-gray-500">Reads {corpus?.trackedChannels ?? '…'} tracked channels. Takes about 15 seconds.</span>
            </div>
          </div>
        )}
      </Card>

      {running ? (
        <div className="space-y-5">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : scan ? (
        <KoreaScanReport s={scan} preparedFor={preparedFor.trim() || null} />
      ) : (
        <Card>
          <EmptyState icon={ScanSearch} title="Scan any project"
            description="Pick a tracked project or type a name and its Korean spellings, choose its field, and run. Nothing is saved." />
        </Card>
      )}
    </div>
  );
}
