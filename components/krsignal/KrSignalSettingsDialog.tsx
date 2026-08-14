'use client';

/**
 * KrSignalSettingsDialog — per-client Korea Signal Bot configuration.
 *
 * Opened from the /clients page (next to Weekly Update). Lets an admin
 * configure everything the KR Signal spec parks at "confirm at build":
 * token identity + CoinGecko id, tracked venues, the peer_basket (with
 * live CoinGecko suggestions), the share-of-voice content source, the
 * Telegram destination, feature toggles, and signal thresholds.
 *
 * The row is keyed to a HHP client via kr_signal_clients.client_id; the
 * first save inserts, later saves patch (see upsertConfigForHhpClient).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChatThreadPicker } from '@/components/telegram/ChatThreadPicker';
import { WeeklyReviewPanel } from './WeeklyReviewPanel';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/dateFormat';
import { Radio, Search, X, Plus, ChevronDown, Sliders, Loader2, Eye, Send, AlertTriangle } from 'lucide-react';

type ClientLite = { id: string; name: string };

type CoinResult = { id: string; symbol: string; name: string; rank: number | null; thumb: string | null };

type TestResult = {
  ok: boolean;
  sent?: boolean;
  dry_run?: boolean;
  chat_id?: string | null;
  source?: 'override' | 'default' | 'none';
  preview?: string;
  pending?: string[];
  message_id?: number | null;
  error?: string;
};

type Features = { weekly_market_report: boolean; korea_listings_digest: boolean; client_listing_alert: boolean };
type Thresholds = { kimchi_hot: number; kimchi_positive: number; kimchi_flat: number; trend_deadband: number };

type Form = {
  is_active: boolean;
  ticker: string;
  coingecko_id: string;
  contract: string;
  chain: string;
  kr_listed: boolean;
  kr_venues: string[];
  global_venues: string[];
  peer_basket: string[];
  track_sov: boolean;
  telegram_chat_id: string;
  telegram_thread_id: string;
  features: Features;
  thresholds: Thresholds;
};

const ALL_VENUES = ['upbit', 'bithumb', 'coinbase', 'bybit', 'kraken', 'bitget', 'gate'] as const;
const KR_VENUES = ['upbit', 'bithumb'] as const;
const VENUE_LABEL: Record<string, string> = {
  upbit: 'Upbit', bithumb: 'Bithumb', coinbase: 'Coinbase', bybit: 'Bybit',
  kraken: 'Kraken', bitget: 'Bitget', gate: 'Gate',
};

const DEFAULT_THRESHOLDS: Thresholds = {
  kimchi_hot: 0.03, kimchi_positive: 0.01, kimchi_flat: 0.01, trend_deadband: 0.05,
};

function emptyForm(): Form {
  return {
    is_active: true, ticker: '', coingecko_id: '', contract: '', chain: '',
    kr_listed: false, kr_venues: [], global_venues: [], peer_basket: [],
    track_sov: false, telegram_chat_id: '', telegram_thread_id: '',
    features: { weekly_market_report: true, korea_listings_digest: true, client_listing_alert: false },
    thresholds: { ...DEFAULT_THRESHOLDS },
  };
}

/** Telegram HTML → readable text. The report body lives in a <pre> block with
 *  ASCII bars, so unescaping entities and dropping tags preserves the layout
 *  while keeping stored markup inert (it came from our own renderer, but this
 *  panel has no reason to execute it). */
function stripTelegramHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

export function KrSignalSettingsDialog({
  open, onOpenChange, clients, initialClientId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clients: ClientLite[];
  initialClientId?: string | null;
}) {
  const { toast } = useToast();
  const [clientId, setClientId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm());
  // The kr_signal_clients row id — the test endpoint keys off it, and its
  // absence is also what "never saved" means.
  const [configId, setConfigId] = useState<string | null>(null);
  // Snapshot of the last-saved form, so the test can refuse to run against
  // settings the operator has since edited but not saved.
  const [savedForm, setSavedForm] = useState<Form | null>(null);
  const [testing, setTesting] = useState<'preview' | 'send' | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const selectedClient = useMemo(() => clients.find(c => c.id === clientId) ?? null, [clients, clientId]);

  // ── Past reports (§ viewer) ───────────────────────────────────────
  // [2026-08-03] Reads what was actually sent. Nothing here re-renders a past
  // week — see app/api/kr-signal/clients/[clientId]/reports/route.ts for why a
  // reconstruction would be fiction rather than history.
  const [reports, setReports] = useState<any[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [openWeek, setOpenWeek] = useState<string | null>(null);

  const loadReports = async () => {
    if (!clientId) return;
    setReportsLoading(true);
    try {
      const res = await fetch(`/api/kr-signal/clients/${clientId}/reports`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load reports');
      setReports(json.reports ?? []);
      setReportsLoaded(true);
    } catch (e) {
      toast({
        title: 'Could not load past reports',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setReportsLoading(false);
    }
  };

  // Reset when the client changes — otherwise the previous client's reports
  // stay on screen under the new client's name.
  useEffect(() => { setReports([]); setReportsLoaded(false); setOpenWeek(null); }, [clientId]);
  const dirty = useMemo(
    () => !!savedForm && JSON.stringify(savedForm) !== JSON.stringify(form),
    [savedForm, form],
  );

  // Pick the initial client when the dialog opens.
  useEffect(() => {
    if (!open) return;
    const first = initialClientId || clients[0]?.id || '';
    setClientId(first);
  }, [open, initialClientId, clients]);

  // Load the config whenever the selected client changes.
  useEffect(() => {
    if (!open || !clientId) return;
    let cancelled = false;
    // A result from the previously-selected client would be misread as this
    // one's.
    setTestResult(null);
    setConfirmSend(false);
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/kr-signal/clients/${clientId}`);
        const json = await res.json();
        if (cancelled) return;
        const cfg = json?.config;
        if (cfg) {
          setConfigured(true);
          setConfigId(cfg.id ?? null);
          const next: Form = {
            is_active: !!cfg.is_active,
            ticker: cfg.ticker ?? '',
            coingecko_id: cfg.coingecko_id ?? '',
            contract: cfg.contract ?? '',
            chain: cfg.chain ?? '',
            kr_listed: !!cfg.kr_listed,
            kr_venues: Array.isArray(cfg.kr_venues) ? cfg.kr_venues : [],
            global_venues: Array.isArray(cfg.global_venues) ? cfg.global_venues : [],
            peer_basket: Array.isArray(cfg.peer_basket) ? cfg.peer_basket : [],
            track_sov: typeof cfg.content_log_source === 'string' && cfg.content_log_source.startsWith('hhp:'),
            telegram_chat_id: cfg.telegram_chat_id ?? '',
            telegram_thread_id: cfg.telegram_thread_id ?? '',
            features: {
              weekly_market_report: !!cfg.features?.weekly_market_report,
              korea_listings_digest: !!cfg.features?.korea_listings_digest,
              client_listing_alert: !!cfg.features?.client_listing_alert,
            },
            thresholds: {
              kimchi_hot: num(cfg.thresholds?.kimchi_hot, DEFAULT_THRESHOLDS.kimchi_hot),
              kimchi_positive: num(cfg.thresholds?.kimchi_positive, DEFAULT_THRESHOLDS.kimchi_positive),
              kimchi_flat: num(cfg.thresholds?.kimchi_flat, DEFAULT_THRESHOLDS.kimchi_flat),
              trend_deadband: num(cfg.thresholds?.trend_deadband, DEFAULT_THRESHOLDS.trend_deadband),
            },
          };
          setForm(next);
          setSavedForm(next);
        } else {
          setConfigured(false);
          setConfigId(null);
          setForm(emptyForm());
          setSavedForm(null);
        }
      } catch {
        if (!cancelled) { setConfigured(false); setConfigId(null); setForm(emptyForm()); setSavedForm(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, clientId]);

  const patch = (p: Partial<Form>) => setForm(prev => ({ ...prev, ...p }));
  const toggleVenue = (list: 'kr_venues' | 'global_venues', v: string) =>
    setForm(prev => ({
      ...prev,
      [list]: prev[list].includes(v) ? prev[list].filter(x => x !== v) : [...prev[list], v],
    }));

  const save = async () => {
    if (!clientId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/kr-signal/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: selectedClient?.name ?? '',
          ticker: form.ticker,
          coingecko_id: form.coingecko_id || null,
          contract: form.contract || null,
          chain: form.chain || null,
          kr_listed: form.kr_listed,
          kr_venues: form.kr_venues,
          global_venues: form.global_venues,
          peer_basket: form.peer_basket,
          content_log_source: form.track_sov ? `hhp:${clientId}` : null,
          telegram_chat_id: form.telegram_chat_id || null,
          telegram_thread_id: form.telegram_thread_id || null,
          features: form.features,
          thresholds: form.thresholds,
          is_active: form.is_active,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Save failed');
      setConfigured(true);
      if (json?.config?.id) setConfigId(json.config.id);
      // Re-baseline so the test stops warning about unsaved edits, and drop a
      // stale result that described the pre-save config.
      setSavedForm(form);
      setTestResult(null);
      toast({ title: 'Korea Signal settings saved', description: selectedClient?.name });
    } catch (e: any) {
      toast({ title: 'Save failed', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Preview builds the real Sunday report and sends nothing; send posts it to
   * the client's resolved chat. Both go through the same endpoint the
   * /admin/telegram-comm row uses, so a pass here is evidence about the actual
   * cron path — not a separate code path that could drift from it.
   */
  const runTest = async (mode: 'preview' | 'send') => {
    if (!configId) return;
    setTesting(mode);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/kr-signal-clients/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: configId, dryRun: mode === 'preview' }),
      });
      const json = await res.json();
      if (res.status === 403) {
        setTestResult({ ok: false, error: 'Test sends are super-admin only.' });
      } else {
        setTestResult(json as TestResult);
      }
      if (mode === 'send' && json?.ok) {
        toast({ title: 'Test sent', description: `Posted to ${json.chat_id}` });
      }
    } catch (e: any) {
      setTestResult({ ok: false, error: String(e?.message || e) });
    } finally {
      setTesting(null);
      setConfirmSend(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-brand" />
            Korea Signal Settings
          </DialogTitle>
          <DialogDescription>
            Per-client configuration for the Korea market-intel Telegram digest.
          </DialogDescription>
        </DialogHeader>

        {/* Client selector + enable */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs text-ink-warm-500">Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="h-9 focus-brand mt-1"><SelectValue placeholder="Select a client" /></SelectTrigger>
              <SelectContent>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pt-5">
            <StatusBadge tone={configured ? (form.is_active ? 'success' : 'warning') : 'neutral'} size="sm">
              {configured ? (form.is_active ? 'Active' : 'Paused') : 'Not configured'}
            </StatusBadge>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => patch({ is_active: v })} id="ks-active" />
              <Label htmlFor="ks-active" className="text-sm">Enabled</Label>
            </div>
          </div>
        </div>

        <Separator />

        {loading ? (
          <div className="space-y-3 flex-1">
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-32 rounded-lg" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-1 space-y-6">
            {/* ── Pending review ──────────────────────────
                [2026-08-14 per Andy] Reports now wait for a human before a
                client sees them. This is where Telegram's "Edit" button lands
                — it renders nothing when the queue is empty, so the dialog is
                unchanged on any day without a report waiting. */}
            <WeeklyReviewPanel krClientId={configId} onSent={() => { setReportsLoaded(false); }} />

            {/* ── Token identity ─────────────────────────── */}
            <Section title="Token identity">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ticker">
                  <Input value={form.ticker} onChange={e => patch({ ticker: e.target.value.toUpperCase() })}
                    placeholder="VVV" className="h-9 focus-brand" />
                </Field>
                <Field label="Chain">
                  <Input value={form.chain} onChange={e => patch({ chain: e.target.value })}
                    placeholder="base / solana / …" className="h-9 focus-brand" />
                </Field>
              </div>
              <CoinPicker
                label="CoinGecko ID"
                help="Powers venue volumes, kimchi premium inputs & peer rank. Pick from results so the id is exact."
                value={form.coingecko_id}
                onSelect={(coin) => patch({ coingecko_id: coin.id })}
                onClear={() => patch({ coingecko_id: '' })}
              />
              <div className="grid grid-cols-1 gap-3">
                <Field label="Contract (optional)">
                  <Input value={form.contract} onChange={e => patch({ contract: e.target.value })}
                    placeholder="0x… / mint address" className="h-9 focus-brand font-mono text-xs" />
                </Field>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={form.kr_listed} onCheckedChange={(v) => patch({ kr_listed: !!v })} />
                <span className="text-sm">Listed on a Korean exchange (Upbit / Bithumb)</span>
              </label>
            </Section>

            {/* ── Tracked venues ─────────────────────────── */}
            <Section title="Tracked venues" help="Denominator for KR-vol-share + the By-Venue breakdown.">
              <div>
                <Label className="text-xs text-ink-warm-500">Korean venues</Label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {KR_VENUES.map(v => (
                    <VenueChip key={v} label={VENUE_LABEL[v]} active={form.kr_venues.includes(v)}
                      onClick={() => toggleVenue('kr_venues', v)} kr />
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs text-ink-warm-500">Global venues</Label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {ALL_VENUES.filter(v => !KR_VENUES.includes(v as any)).map(v => (
                    <VenueChip key={v} label={VENUE_LABEL[v]} active={form.global_venues.includes(v)}
                      onClick={() => toggleVenue('global_venues', v)} />
                  ))}
                </div>
              </div>
            </Section>

            {/* ── Peer basket ────────────────────────────── */}
            <Section
              title="Peer basket"
              help="Ranks this token's KR-vol-share against these peers (“#N vs peers”). Empty = the line is hidden."
            >
              <PeerBasketEditor
                value={form.peer_basket}
                onChange={(next) => patch({ peer_basket: next })}
              />
            </Section>

            {/* ── Share of voice ─────────────────────────── */}
            <Section title="Share of voice" help="Output-volume proxy from this client's posted HHP content. Off = the line is hidden.">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={form.track_sov} onCheckedChange={(v) => patch({ track_sov: !!v })} />
                <span className="text-sm">Track this client's HHP content growth (WoW)</span>
              </label>
            </Section>

            {/* ── Telegram destination ───────────────────── */}
            <Section title="Telegram destination — override (optional)" help="Overrides where the digest posts. Leave blank to send to the client's linked /crm/telegram chat.">
              <ChatThreadPicker
                chatId={form.telegram_chat_id}
                threadId={form.telegram_thread_id}
                onChange={({ chatId: cid, threadId: tid }) => patch({ telegram_chat_id: cid, telegram_thread_id: tid })}
                label=""
                popoverWidth={620}
              />
            </Section>

            {/* ── Test ───────────────────────────────────── */}
            <Section
              title="Test this config"
              help="Builds the real Sunday report with this client's live data. Preview sends nothing; Send test posts it to the chat above, marked as a test."
            >
              {!configId ? (
                <p className="text-xs text-ink-warm-500">Save the settings once before testing.</p>
              ) : (
                <>
                  {dirty && (
                    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-amber-800">
                        You have unsaved changes. The test runs against the <b>saved</b> settings — save first
                        so you're testing what you're looking at.
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline" size="sm"
                      onClick={() => runTest('preview')}
                      disabled={!!testing || dirty}
                    >
                      {testing === 'preview'
                        ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Building…</>
                        : <><Eye className="h-3.5 w-3.5 mr-1.5" />Preview (no send)</>}
                    </Button>

                    {!confirmSend ? (
                      <Button
                        variant="outline" size="sm"
                        onClick={() => { setTestResult(null); setConfirmSend(true); }}
                        disabled={!!testing || dirty}
                      >
                        <Send className="h-3.5 w-3.5 mr-1.5" />Send test
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-ink-warm-600">Posts to the client's chat —</span>
                        <Button variant="brand" size="sm" onClick={() => runTest('send')} disabled={!!testing}>
                          {testing === 'send'
                            ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Sending…</>
                            : 'Send it'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmSend(false)} disabled={!!testing}>
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>

                  {testResult && <TestResultPanel result={testResult} />}
                </>
              )}
            </Section>

            {/* ── Digest features ────────────────────────── */}
            <Section title="Digest features">
              <FeatureToggle label="Weekly market report" desc="Sunday KR market digest"
                checked={form.features.weekly_market_report}
                onChange={(v) => patch({ features: { ...form.features, weekly_market_report: v } })} />
              <FeatureToggle label="Korea listings digest" desc="Saturday new-listing roundup"
                checked={form.features.korea_listings_digest}
                onChange={(v) => patch({ features: { ...form.features, korea_listings_digest: v } })} />
              <FeatureToggle label="Client listing alert" desc="Celebratory ping when this token lists on Upbit/Bithumb"
                checked={form.features.client_listing_alert}
                onChange={(v) => patch({ features: { ...form.features, client_listing_alert: v } })} />
            </Section>

            {/* ── Advanced thresholds ────────────────────── */}
            <ThresholdsSection value={form.thresholds} onChange={(t) => patch({ thresholds: t })} />

            {/* ── Past reports ───────────────────────────── */}
            <Section title="Past reports">
              {!reportsLoaded ? (
                <Button variant="outline" size="sm" onClick={loadReports} disabled={reportsLoading}>
                  {reportsLoading
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Loading…</>
                    : <><Eye className="h-4 w-4 mr-2" />Load past reports</>}
                </Button>
              ) : reports.length === 0 ? (
                <p className="text-sm text-ink-warm-500">
                  No weekly reports recorded for this client yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {reports.map((r: any) => {
                    const isOpen = openWeek === r.week_ending;
                    return (
                      <div key={r.week_ending} className="border border-cream-200 rounded-md overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setOpenWeek(isOpen ? null : r.week_ending)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-cream-50 transition-colors"
                        >
                          <ChevronDown className={`h-4 w-4 text-ink-warm-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                          <span className="text-sm font-medium text-ink-warm-900">
                            Week ending {formatDate(r.week_ending)}
                          </span>
                          {r.report_html
                            ? <StatusBadge tone="success" size="sm">Report saved</StatusBadge>
                            : <StatusBadge tone="neutral" size="sm">Metrics only</StatusBadge>}
                        </button>

                        {isOpen && (
                          <div className="px-3 pb-3 border-t border-cream-100 pt-3">
                            {r.report_html ? (
                              /* The stored value is the exact Telegram HTML that was
                                 sent. Rendering it as text preserves the <pre> ASCII
                                 bars without executing markup we'd then have to trust. */
                              <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-words font-mono text-ink-warm-800 bg-cream-50 rounded p-3 max-h-[40vh] overflow-y-auto">
                                {stripTelegramHtml(r.report_html)}
                              </pre>
                            ) : (
                              <>
                                <p className="text-xs text-ink-warm-500 mb-2">
                                  This week was sent before reports were archived, so the exact
                                  message isn&rsquo;t recoverable. These are the metrics stored at
                                  the time — the report itself is not reconstructed, because the
                                  snapshot doesn&rsquo;t hold everything the report showed.
                                </p>
                                <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-words font-mono text-ink-warm-700 bg-cream-50 rounded p-3 max-h-[40vh] overflow-y-auto">
                                  {JSON.stringify(r.metrics, null, 2)}
                                </pre>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>
          </div>
        )}

        <DialogFooter className="border-t border-cream-200 pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Close</Button>
          <Button variant="brand" onClick={save} disabled={saving || loading || !clientId}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : 'Save settings'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Small building blocks ──────────────────────────────────────────

function num(v: any, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function Section({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-cream-200 bg-white p-4 space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-ink-warm-900">{title}</h4>
        {help && <p className="text-xs text-ink-warm-500 mt-0.5">{help}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-ink-warm-500">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function VenueChip({ label, active, onClick, kr }: { label: string; active: boolean; onClick: () => void; kr?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
        active
          ? kr ? 'bg-brand text-white border-brand' : 'bg-ink-warm-800 text-white border-ink-warm-800'
          : 'bg-cream-50 text-ink-warm-600 border-cream-200 hover:bg-cream-100'
      }`}
    >
      {kr && <span>🇰🇷</span>}{label}
    </button>
  );
}

function FeatureToggle({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-sm text-ink-warm-900">{label}</div>
        <div className="text-xs text-ink-warm-500">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// ─── Test result ────────────────────────────────────────────────────

/**
 * The preview arrives as Telegram HTML. It's rendered as TEXT, never as
 * markup — the string is assembled from CoinGecko names, client-entered
 * tickers and peer ids, none of which are trusted enough to inject into the
 * admin's DOM. Formatting is cosmetic here; the numbers are the point.
 */
function telegramHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function TestResultPanel({ result }: { result: TestResult }) {
  if (!result.ok) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 p-3">
        <div className="text-xs font-semibold text-rose-800 mb-1">Test failed</div>
        <p className="text-xs text-rose-700 break-words">{result.error || 'Unknown error'}</p>
        {result.chat_id && (
          <p className="text-[11px] text-rose-600 mt-1.5">
            Destination was <code className="bg-white/60 px-1 rounded">{result.chat_id}</code>.
            &quot;chat not found&quot; or &quot;bot was kicked&quot; means the KR Signal bot isn&apos;t in that chat.
          </p>
        )}
      </div>
    );
  }

  const destLabel = result.source === 'override' ? 'override chat' : "client's linked chat";

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
        <div className="text-xs font-semibold text-emerald-800">
          {result.dry_run ? 'Report built — nothing was sent.' : 'Delivered.'}
        </div>
        <p className="text-[11px] text-emerald-700 mt-1">
          {result.chat_id
            ? <>{result.dry_run ? 'Would post to' : 'Posted to'} <code className="bg-white/60 px-1 rounded">{result.chat_id}</code> ({destLabel}).</>
            : 'No override and no linked client chat — a real send would have nowhere to go.'}
        </p>
      </div>

      {result.pending && result.pending.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-semibold text-amber-800 mb-1">
            {result.pending.length} line{result.pending.length === 1 ? '' : 's'} degraded or hidden
          </div>
          <ul className="space-y-1">
            {result.pending.map((p, i) => (
              <li key={i} className="text-[11px] text-amber-800 flex gap-1.5">
                <span className="text-amber-500">•</span><span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.preview && (
        <div>
          <div className="text-[11px] text-ink-warm-500 mb-1">
            What the report says this week — formatting stripped for preview.
          </div>
          <pre className="max-h-64 overflow-y-auto rounded-md border border-cream-200 bg-cream-50 p-3 text-[11px] leading-relaxed text-ink-warm-800 whitespace-pre-wrap break-words">
            {telegramHtmlToText(result.preview)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Peer-basket editor with CoinGecko suggestions ──────────────────

function PeerBasketEditor({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map(id => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-brand-light text-brand px-2.5 py-1 text-xs font-medium">
              {id}
              <button type="button" onClick={() => onChange(value.filter(x => x !== id))} className="hover:text-rose-600">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <CoinPicker
        label=""
        placeholder="Search a peer token to add…"
        value=""
        addMode
        disabledIds={value}
        onSelect={(coin) => { if (!value.includes(coin.id)) onChange([...value, coin.id]); }}
      />
    </div>
  );
}

// ─── Shared CoinGecko search picker ─────────────────────────────────

function CoinPicker({
  label, help, value, placeholder, addMode, disabledIds, onSelect, onClear,
}: {
  label: string;
  help?: string;
  value: string;
  placeholder?: string;
  addMode?: boolean;
  disabledIds?: string[];
  onSelect: (coin: CoinResult) => void;
  onClear?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CoinResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [openList, setOpenList] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/kr-signal/coingecko-search?q=${encodeURIComponent(query.trim())}`);
        const json = await res.json();
        setResults(json?.results ?? []);
        setOpenList(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  return (
    <div className="relative">
      {label && <Label className="text-xs text-ink-warm-500">{label}</Label>}
      {help && <p className="text-xs text-ink-warm-400 mb-1">{help}</p>}
      {!addMode && value && (
        <div className="flex items-center gap-2 mb-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-light text-brand px-2.5 py-1 text-xs font-medium">
            {value}
            {onClear && (
              <button type="button" onClick={onClear} className="hover:text-rose-600"><X className="h-3 w-3" /></button>
            )}
          </span>
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-warm-400" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length && setOpenList(true)}
          placeholder={placeholder ?? 'Search CoinGecko…'}
          className="h-9 pl-8 focus-brand"
        />
        {searching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-warm-400 animate-spin" />}
      </div>
      {openList && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-cream-200 bg-white shadow-lg max-h-64 overflow-y-auto">
          {results.map(coin => {
            const disabled = disabledIds?.includes(coin.id);
            return (
              <button
                key={coin.id}
                type="button"
                disabled={disabled}
                onClick={() => { onSelect(coin); setQuery(''); setResults([]); setOpenList(false); }}
                className={`flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-cream-50 ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {coin.thumb && <img src={coin.thumb} alt="" className="h-5 w-5 rounded-full" />}
                <span className="font-medium text-ink-warm-900">{coin.name}</span>
                <span className="text-ink-warm-500">{coin.symbol}</span>
                <span className="ml-auto flex items-center gap-2">
                  {coin.rank && <span className="text-xs text-ink-warm-400">#{coin.rank}</span>}
                  <code className="text-[10px] text-ink-warm-400">{coin.id}</code>
                  {addMode && !disabled && <Plus className="h-3.5 w-3.5 text-brand" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Advanced thresholds (collapsible) ──────────────────────────────

function ThresholdsSection({ value, onChange }: { value: Thresholds; onChange: (t: Thresholds) => void }) {
  const [open, setOpen] = useState(false);
  const setT = (k: keyof Thresholds, raw: string) => {
    const n = Number(raw);
    onChange({ ...value, [k]: Number.isFinite(n) ? n : value[k] });
  };
  const rows: { k: keyof Thresholds; label: string; help: string }[] = [
    { k: 'kimchi_hot', label: 'Kimchi hot', help: 'above → "retail heating up"' },
    { k: 'kimchi_positive', label: 'Kimchi positive', help: 'above → "leaning in"' },
    { k: 'kimchi_flat', label: 'Kimchi flat band', help: '±band around zero' },
    { k: 'trend_deadband', label: 'Trend deadband', help: 'WoW ± before an arrow flips' },
  ];
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-cream-200 bg-white">
      <CollapsibleTrigger className="flex items-center justify-between w-full p-4">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-ink-warm-500" />
          <span className="text-sm font-semibold text-ink-warm-900">Advanced thresholds</span>
        </div>
        <ChevronDown className={`h-4 w-4 text-ink-warm-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">
        <p className="text-xs text-ink-warm-500 mb-3">Fractions, e.g. 0.03 = 3%. Defaults suit most tokens — only tune if a client's read feels off.</p>
        <div className="grid grid-cols-2 gap-3">
          {rows.map(r => (
            <Field key={r.k} label={r.label}>
              <Input
                type="number" step="0.005"
                value={String(value[r.k])}
                onChange={e => setT(r.k, e.target.value)}
                className="h-9 focus-brand"
              />
              <p className="text-[11px] text-ink-warm-400 mt-1">{r.help}</p>
            </Field>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
