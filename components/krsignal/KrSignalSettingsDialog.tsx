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
import { useToast } from '@/hooks/use-toast';
import { Radio, Search, X, Plus, ChevronDown, Sliders, Loader2 } from 'lucide-react';

type ClientLite = { id: string; name: string };

type CoinResult = { id: string; symbol: string; name: string; rank: number | null; thumb: string | null };

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

  const selectedClient = useMemo(() => clients.find(c => c.id === clientId) ?? null, [clients, clientId]);

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
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/kr-signal/clients/${clientId}`);
        const json = await res.json();
        if (cancelled) return;
        const cfg = json?.config;
        if (cfg) {
          setConfigured(true);
          setForm({
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
          });
        } else {
          setConfigured(false);
          setForm(emptyForm());
        }
      } catch {
        if (!cancelled) { setConfigured(false); setForm(emptyForm()); }
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
      toast({ title: 'Korea Signal settings saved', description: selectedClient?.name });
    } catch (e: any) {
      toast({ title: 'Save failed', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setSaving(false);
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
            <Section title="Telegram destination" help="Which group chat (and optional topic) the digest posts to.">
              <ChatThreadPicker
                chatId={form.telegram_chat_id}
                threadId={form.telegram_thread_id}
                onChange={({ chatId: cid, threadId: tid }) => patch({ telegram_chat_id: cid, telegram_thread_id: tid })}
                label=""
                popoverWidth={620}
              />
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
