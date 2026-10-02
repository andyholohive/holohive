'use client';

/**
 * Korea Scan — run Yano's Korea read for any project, not only clients:
 * a prospect before a call, a competitor, a client's category. Reads the
 * Korean Telegram corpus (tg_channel_posts). Admin + super-admin.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
import { AlertTriangle, ArrowLeft, Briefcase, Loader2, Lock, Radar, RefreshCw, ScanSearch } from 'lucide-react';
import { formatDate, formatRelativeShort, formatTime } from '@/lib/dateFormat';
import { KoreaScanReport } from '@/components/koreaScan/KoreaScanReport';
import type { KoreaScan } from '@/lib/koreaScan/compute';
import { SavedScansList, ShareBar, type SavedScanRow } from '@/components/koreaScan/SavedScans';
import { DeckComposer, defaultDeck, type DeckChoice } from '@/components/koreaScan/DeckComposer';
import { cleanSlides } from '@/lib/koreaScan/angles';

interface PeerSetOption { id: string; label: string; field: string; members: string[] }
interface ProjectOption { name: string; aliases: string[]; exclude?: string[]; setId: string; isClient?: boolean }

const split = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);

export default function KoreaScanPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin';

  const [sets, setSets] = useState<PeerSetOption[] | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [corpus, setCorpus] = useState<{ lastPostAt: string | null; lastPulledAt: string | null; trackedChannels: number } | null>(null);
  const [tgRun, setTgRun] = useState<{ status: string; conclusion: string | null; createdAt: string; updatedAt: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState('');
  const [exclude, setExclude] = useState('');
  const [peerSetId, setPeerSetId] = useState('');
  const [preparedFor, setPreparedFor] = useState('');
  const [running, setRunning] = useState(false);
  const [scan, setScan] = useState<KoreaScan | null>(null);
  const [saved, setSaved] = useState<{ id: string; token: string } | null>(null);
  const [savedRows, setSavedRows] = useState<SavedScanRow[] | null>(null);
  const [origin, setOrigin] = useState('');
  const [deck, setDeck] = useState<DeckChoice | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isClientName = (n: string) => !!projects.find((p) => p.name.toLowerCase() === n.toLowerCase())?.isClient;

  /** A saved deck, or the scan's best-fit angle. */
  function deckFrom(sc: KoreaScan, d: any): DeckChoice {
    const slides = cleanSlides(d?.slides, sc);
    return slides.length ? { slides, kickers: d?.kickers === 'lifecycle' ? 'lifecycle' : 'verdict', angle: d?.angle ?? null } : defaultDeck(sc, isClientName(sc.subject));
  }

  /** Change the deck; the shared link follows after a short pause. */
  function changeDeck(next: DeckChoice) {
    setDeck(next);
    if (!saved) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const id = saved.id;
    saveTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/korea-scan/saved?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      if (!res.ok) toast({ title: 'Slide choice not saved', description: (await res.json().catch(() => ({}))).error, variant: 'destructive' });
    }, 600);
  }

  // Opened from a CRM opportunity: /mindshare/korea-scan?opportunity=<id>&name=<project>
  const params = useSearchParams();
  const opportunityId = params.get('opportunity');
  const opportunityName = params.get('name');

  useEffect(() => { setOrigin(window.location.origin); }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/korea-scan').then((r) => r.json()).then((d) => {
      setSets(d.peerSets ?? []);
      setProjects(d.projects ?? []);
      setCorpus(d.corpus ?? null);
      // Prefill from the opportunity's name when Korea Signal already tracks it.
      if (opportunityName) {
        const hit = (d.projects ?? []).find((p: ProjectOption) => p.name.toLowerCase() === opportunityName.toLowerCase());
        if (hit) { setName(hit.name); setAliases(hit.aliases.join(', ')); setExclude((hit.exclude ?? []).join(', ')); setPeerSetId(hit.setId); }
        else setName(opportunityName);
        setPreparedFor(opportunityName);
      }
    }).catch(() => setSets([]));
    loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Run the Telegram MCP crawl now, then follow the run until it finishes.
  async function loadTgRun() {
    const d = await fetch('/api/korea-scan/refresh').then((r) => r.json()).catch(() => null);
    setTgRun(d?.run ?? null);
    return d?.run ?? null;
  }
  useEffect(() => { if (isAdmin) loadTgRun(); }, [isAdmin]);
  useEffect(() => {
    if (!tgRun || tgRun.status === 'completed') return;
    const t = setInterval(async () => {
      const r = await loadTgRun();
      if (r?.status === 'completed') toast({ title: r.conclusion === 'success' ? 'Telegram crawl finished' : 'Telegram crawl failed', description: r.conclusion === 'success' ? 'Run the scan again to include the new posts.' : 'Check the mindshare scrape run in the kol-telegram-mcp repo.', variant: r.conclusion === 'success' ? undefined : 'destructive' });
    }, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tgRun?.status]);

  async function refreshFromTelegram() {
    setRefreshing(true);
    try {
      const res = await fetch('/api/korea-scan/refresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Could not start');
      toast(d.started
        ? { title: 'Telegram crawl started', description: 'About 15 minutes across every channel. Run the scan again after.' }
        : { title: 'No new crawl needed', description: d.reason });
      setTimeout(loadTgRun, 4000);
    } catch (e: any) {
      toast({ title: 'Telegram crawl not started', description: e.message, variant: 'destructive' });
    } finally {
      setRefreshing(false);
    }
  }

  async function loadSaved() {
    const res = await fetch(`/api/korea-scan/saved${opportunityId ? `?opportunity=${opportunityId}` : ''}`);
    const d = await res.json().catch(() => ({}));
    setSavedRows(d.scans ?? []);
  }

  async function openSaved(id: string) {
    const res = await fetch(`/api/korea-scan/saved?id=${id}`);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { toast({ title: 'Could not open that scan', variant: 'destructive' }); return; }
    setScan(d.scan.scan);
    setDeck(deckFrom(d.scan.scan, d.scan.deck));
    setSaved({ id: d.scan.id, token: d.scan.token });
    setPreparedFor(d.scan.prepared_for ?? '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

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
        body: JSON.stringify({ name, aliases: split(aliases), exclude: split(exclude), peerSetId, preparedFor, opportunityId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Scan failed');
      setScan(d.scan);
      setDeck(deckFrom(d.scan, d.saved?.deck));
      setSaved(d.saved ? { id: d.saved.id, token: d.saved.token } : null);
      if (d.saveError) toast({ title: 'Scan ran but was not saved', description: d.saveError, variant: 'destructive' });
      loadSaved();
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

      {opportunityId && (
        <div className="flex items-center gap-2 rounded-lg border border-brand/20 bg-brand-light px-4 py-2.5 text-sm text-gray-800">
          <Briefcase className="h-4 w-4 text-brand" />
          Scans run here are attached to the opportunity <b className="font-semibold">{opportunityName ?? 'from the sales pipeline'}</b>.
        </div>
      )}

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
              <Button variant="outline" onClick={refreshFromTelegram} disabled={refreshing || (!!tgRun && tgRun.status !== 'completed')}>
                {refreshing || (tgRun && tgRun.status !== 'completed') ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Refresh from Telegram
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              Data comes from our Telegram MCP: {corpus?.trackedChannels ?? '…'} channels crawled every 6 hours
              {corpus?.lastPulledAt && <>, last pulled {formatRelativeShort(corpus.lastPulledAt)}</>}.
              {' '}Refresh runs the crawl now instead of waiting for the next one (about 15 minutes).
              {tgRun && tgRun.status !== 'completed' && <> A crawl is running, started {formatTime(tgRun.createdAt)}.</>}
              {tgRun && tgRun.status === 'completed' && tgRun.conclusion !== 'success' && <> <span className="text-rose-600">The last crawl failed {formatRelativeShort(tgRun.updatedAt)}.</span></>}
            </p>
          </div>
        )}
      </Card>

      {running ? (
        <div className="space-y-5">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : scan ? (
        <>
          {saved && origin && <ShareBar token={saved.token} id={saved.id} origin={origin} onRevoked={() => { setSaved(null); loadSaved(); }} />}
          <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <Card className="border-gray-200 p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
              {deck && <DeckComposer s={scan} value={deck} onChange={changeDeck} client={isClientName(scan.subject)} />}
            </Card>
            <KoreaScanReport s={scan} preparedFor={preparedFor.trim() || null} slides={deck?.slides} kickers={deck?.kickers} />
          </div>
        </>
      ) : (
        <Card>
          <EmptyState icon={ScanSearch} title="Scan any project"
            description="Pick a tracked project or type a name and its Korean spellings, choose its field, and run. Each run is saved with a private link you can send." />
        </Card>
      )}

      {savedRows === null ? <Skeleton className="h-40 rounded-lg" /> : (
        <SavedScansList rows={savedRows} origin={origin} onOpen={openSaved}
          title={opportunityId ? `Scans for ${opportunityName ?? 'this opportunity'}` : 'Saved scans'} />
      )}
    </div>
  );
}
