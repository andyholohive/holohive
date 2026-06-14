'use client';

/**
 * Activation Settings — admin UI for Section 4.2 + 11.1 of the
 * HHP Campaign Dashboard Spec. Two responsibilities:
 *
 *   1. Wire up the microsite API URL (`campaigns.activation_api_base_url`)
 *      so the cron can sync hourly. Spec calls for this to be set
 *      "during campaign setup".
 *
 *   2. Provide a manual snapshot editor for activations that DON'T
 *      have a microsite API yet (everything pre-Venice). Lets the
 *      team upsert a single demo-friendly snapshot without dropping
 *      to SQL. Removes the testing-via-DB pattern we hit on Venice.
 *
 * Standalone for the same reason as Showcase / Tag dialogs —
 * keeps the campaign admin page lean.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import {
  Zap, Plug, RefreshCw, CheckCircle2, AlertTriangle, Trash2, Save,
  Calendar as CalendarIcon, X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { formatDate, formatDateTime } from '@/lib/dateFormat';

// ─── DateField — matches the canonical project pattern from
//     app/expenses/page.tsx (Popover + Button trigger + Calendar
//     widget with brand-teal selection). Keeps date entry visually
//     identical across every admin form. Value stored as 'YYYY-MM-DD'
//     for direct DB submission. ───
function DateField({
  value, onChange, placeholder, allowClear,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  allowClear?: boolean;
}) {
  const selectedDate = value ? new Date(value + 'T00:00:00') : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-9 w-full justify-start font-normal focus-brand"
          style={{ color: value ? '#111827' : '#9ca3af' }}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
          {value
            ? formatDate(selectedDate!)
            : (placeholder || 'Select date')}
          {allowClear && value && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onChange(''); }}
              className="ml-auto opacity-50 hover:opacity-100"
              aria-label="Clear date"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
        <CalendarPicker
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            if (!date) { onChange(''); return; }
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            onChange(`${y}-${m}-${d}`);
          }}
          initialFocus
          classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
          modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
        />
      </PopoverContent>
    </Popover>
  );
}

type Snapshot = {
  id: string;
  campaign_id: string;
  activation_name: string | null;
  activation_type: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  summary_json: any;
  entries_daily_json: any;
  entries_by_kol_json: any;
  clicks_json: any;
  ugc_json: any;
  synced_at: string;
};

export default function ActivationSettingsDialog({
  open,
  onClose,
  campaignId,
}: {
  open: boolean;
  onClose: () => void;
  campaignId: string;
}) {
  const { toast } = useToast();

  // ─── State ──────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'connect' | 'manual'>('connect');

  // Connect tab
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);
  const [testResult, setTestResult] = useState<
    | { ok: true; data: any }
    | { ok: false; error: string }
    | null
  >(null);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Latest snapshot — read-only view + edit baseline
  const [latest, setLatest] = useState<Snapshot | null>(null);

  // Manual tab — single-row editor (upserts latest snapshot)
  const [manualForm, setManualForm] = useState({
    activation_name: '',
    activation_type: '',
    status: 'active',
    start_date: '',
    end_date: '',
    summary_json: '{\n  "total_entries": 0\n}',
    entries_daily_json: '[]',
    entries_by_kol_json: '[]',
    clicks_json: '{}',
    ugc_json: '{}',
  });
  const [savingManual, setSavingManual] = useState(false);

  // ─── Load on open ───────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setTestResult(null);

    Promise.all([
      (supabase as any)
        .from('campaigns')
        .select('activation_api_base_url')
        .eq('id', campaignId)
        .maybeSingle(),
      (supabase as any)
        .from('activation_snapshots')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('synced_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]).then(([cRes, sRes]: any[]) => {
      if (cRes.error) {
        toast({ title: 'Load failed', description: cRes.error.message, variant: 'destructive' });
      } else {
        setApiBaseUrl(cRes.data?.activation_api_base_url || '');
      }
      if (sRes.data) {
        setLatest(sRes.data as Snapshot);
        // Pre-fill the manual form with the existing snapshot so an
        // edit doesn't lose existing fields.
        setManualForm({
          activation_name: sRes.data.activation_name || '',
          activation_type: sRes.data.activation_type || '',
          status: sRes.data.status || 'active',
          start_date: sRes.data.start_date || '',
          end_date: sRes.data.end_date || '',
          summary_json: pretty(sRes.data.summary_json) || '{\n  "total_entries": 0\n}',
          entries_daily_json: pretty(sRes.data.entries_daily_json) || '[]',
          entries_by_kol_json: pretty(sRes.data.entries_by_kol_json) || '[]',
          clicks_json: pretty(sRes.data.clicks_json) || '{}',
          ugc_json: pretty(sRes.data.ugc_json) || '{}',
        });
      } else {
        setLatest(null);
      }
      setLoading(false);
    });
  }, [open, campaignId, toast]);

  // ─── Helpers ────────────────────────────────────────────────────
  function pretty(v: any): string {
    if (v == null) return '';
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return '';
    }
  }

  function parseSafe(s: string, fallback: any) {
    if (!s.trim()) return fallback;
    try {
      return JSON.parse(s);
    } catch {
      throw new Error(`Invalid JSON: ${s.slice(0, 30)}…`);
    }
  }

  // ─── Connect tab actions ────────────────────────────────────────
  const handleSaveUrl = async () => {
    setSavingUrl(true);
    const trimmed = apiBaseUrl.trim();
    const { error } = await (supabase as any)
      .from('campaigns')
      .update({ activation_api_base_url: trimmed || null })
      .eq('id', campaignId);
    setSavingUrl(false);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: trimmed ? 'API URL saved' : 'API URL cleared',
      description: trimmed
        ? 'Cron will pick this up on its next run.'
        : 'Sync is now paused for this campaign.',
    });
  };

  const handleTest = async () => {
    const trimmed = apiBaseUrl.trim();
    if (!trimmed) {
      setTestResult({ ok: false, error: 'Enter a URL first.' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const url = `${trimmed.replace(/\/+$/, '')}/api/activation/summary`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        setTestResult({ ok: false, error: `HTTP ${res.status} ${res.statusText}` });
      } else {
        const data = await res.json();
        setTestResult({ ok: true, data });
      }
    } catch (err: any) {
      setTestResult({ ok: false, error: err?.message || 'Fetch failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/cron/activation-sync?campaign_id=${campaignId}`, {
        method: 'GET',
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast({
          title: 'Sync failed',
          description: json?.error || json?.skipReason || `HTTP ${res.status}`,
          variant: 'destructive',
        });
      } else if (json.snapshotsWritten === 0) {
        const detail = json.errors?.[0]?.error || json.skipReason || 'No snapshot written — check the API URL is set + reachable.';
        toast({ title: 'Sync ran, no data', description: detail, variant: 'destructive' });
      } else {
        toast({
          title: 'Sync complete',
          description: `Wrote ${json.snapshotsWritten} snapshot. Reload the public page to see it.`,
        });
        // Refresh the latest snapshot view
        const { data } = await (supabase as any)
          .from('activation_snapshots')
          .select('*')
          .eq('campaign_id', campaignId)
          .order('synced_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) setLatest(data as Snapshot);
      }
    } catch (err: any) {
      toast({ title: 'Sync failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  // ─── Manual tab actions ─────────────────────────────────────────
  const handleManualSave = async () => {
    setSavingManual(true);
    try {
      const payload: Record<string, any> = {
        campaign_id: campaignId,
        activation_name: manualForm.activation_name.trim() || null,
        activation_type: manualForm.activation_type.trim() || null,
        status: manualForm.status.trim() || null,
        start_date: manualForm.start_date || null,
        end_date: manualForm.end_date || null,
        summary_json: parseSafe(manualForm.summary_json, null),
        entries_daily_json: parseSafe(manualForm.entries_daily_json, null),
        entries_by_kol_json: parseSafe(manualForm.entries_by_kol_json, null),
        clicks_json: parseSafe(manualForm.clicks_json, null),
        ugc_json: parseSafe(manualForm.ugc_json, null),
        synced_at: new Date().toISOString(),
      };
      // Upsert by replacing the row entirely when one exists. We
      // keep only the most recent snapshot per campaign in the manual
      // path — the cron path can carry history, the manual path
      // doesn't need to.
      if (latest) {
        const { error } = await (supabase as any)
          .from('activation_snapshots')
          .update(payload)
          .eq('id', latest.id);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any)
          .from('activation_snapshots')
          .insert(payload)
          .select('*')
          .single();
        if (error) throw error;
        setLatest(data as Snapshot);
      }
      toast({
        title: 'Snapshot saved',
        description: 'Reload the public campaign page to see it.',
      });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSavingManual(false);
    }
  };

  const handleManualDelete = async () => {
    if (!latest) return;
    if (!window.confirm('Delete this activation snapshot? The section will disappear from the public page until a new one is created.')) return;
    const { error } = await (supabase as any)
      .from('activation_snapshots')
      .delete()
      .eq('id', latest.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    setLatest(null);
    toast({ title: 'Snapshot deleted', description: 'Activation Results section is now hidden.' });
  };

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[720px] max-h-[88vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-brand" />
            Activation Settings
          </DialogTitle>
          <DialogDescription>
            Connect the activation portal API for automatic hourly sync, or manage the snapshot manually for demos and pre-API testing.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-ink-warm-500 py-6 text-center">Loading…</p>
        ) : (
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as 'connect' | 'manual')}
            className="flex-1 min-h-0 flex flex-col overflow-hidden"
          >
            {/* v11 underline tabs — matches the campaign admin page,
                /clients, /intelligence, etc. Consistent across every
                tabbed surface in the app. */}
            <TabsList className="w-full justify-start gap-0.5 bg-transparent p-0 h-auto rounded-none border-b border-cream-200 shrink-0">
              <TabsTrigger
                value="connect"
                className="relative px-3.5 py-2.5 text-sm font-medium text-ink-warm-500 hover:text-ink-warm-900 data-[state=active]:font-semibold data-[state=active]:text-brand-deep data-[state=active]:shadow-none data-[state=active]:bg-transparent rounded-none data-[state=active]:after:absolute data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-[2px] data-[state=active]:after:bg-brand data-[state=active]:after:rounded-t flex items-center gap-1.5"
              >
                <Plug className="h-3.5 w-3.5" />
                Connect API
              </TabsTrigger>
              <TabsTrigger
                value="manual"
                className="relative px-3.5 py-2.5 text-sm font-medium text-ink-warm-500 hover:text-ink-warm-900 data-[state=active]:font-semibold data-[state=active]:text-brand-deep data-[state=active]:shadow-none data-[state=active]:bg-transparent rounded-none data-[state=active]:after:absolute data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-[2px] data-[state=active]:after:bg-brand data-[state=active]:after:rounded-t flex items-center gap-1.5"
              >
                <Save className="h-3.5 w-3.5" />
                Manual Snapshot
              </TabsTrigger>
            </TabsList>

            {/* ─── Connect tab ─────────────────────────────────── */}
            <TabsContent value="connect" className="flex-1 overflow-y-auto min-h-0 mt-3 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="api-base-url" className="text-xs">Activation portal API base URL</Label>
                <Input
                  id="api-base-url"
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrl(e.target.value)}
                  placeholder="https://venicekorea.app"
                  className="focus-brand"
                />
                <p className="text-[11px] text-ink-warm-500">
                  HHP will hit <code className="bg-cream-100 px-1 rounded">{`<url>/api/activation/summary`}</code>, <code className="bg-cream-100 px-1 rounded">.../entries-daily</code>, <code className="bg-cream-100 px-1 rounded">.../entries-by-kol</code>, <code className="bg-cream-100 px-1 rounded">.../clicks</code>, and <code className="bg-cream-100 px-1 rounded">.../ugc</code> hourly.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleTest} disabled={testing}>
                  {testing ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plug className="h-3.5 w-3.5 mr-1" />}
                  Test connection
                </Button>
                <Button size="sm" variant="brand" onClick={handleSaveUrl} disabled={savingUrl}>
                  <Save className="h-3.5 w-3.5 mr-1" />
                  Save URL
                </Button>
              </div>

              {testResult && (
                <div className={`rounded-md border p-3 text-xs ${
                  testResult.ok
                    ? 'border-emerald-200 bg-emerald-50/50'
                    : 'border-rose-200 bg-rose-50/50'
                }`}>
                  {testResult.ok ? (
                    <>
                      <div className="flex items-center gap-1.5 font-medium text-emerald-700 mb-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Connection OK
                      </div>
                      <pre className="text-[10px] font-mono text-ink-warm-700 overflow-auto max-h-32 bg-white/60 p-2 rounded">
                        {JSON.stringify(testResult.data, null, 2)}
                      </pre>
                    </>
                  ) : (
                    <div className="flex items-start gap-1.5 text-rose-700">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <div>
                        <div className="font-medium">Connection failed</div>
                        <div className="text-[11px] mt-0.5">{testResult.error}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Sync status panel */}
              <div className="border-t border-cream-200 pt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wider text-ink-warm-500">Latest snapshot</Label>
                  <Button size="sm" variant="outline" onClick={handleSyncNow} disabled={syncing}>
                    {syncing ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                    Sync now
                  </Button>
                </div>
                {latest ? (
                  <div className="border border-cream-200 rounded-md p-3 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-ink-warm-500">Name</span>
                      <span className="font-medium text-ink-warm-900">{latest.activation_name || '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-warm-500">Type · Status</span>
                      <span className="font-medium text-ink-warm-900">
                        {latest.activation_type || '—'} · {latest.status || '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-warm-500">Last sync</span>
                      <span className="font-medium text-ink-warm-900">
                        {formatDateTime(latest.synced_at)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-ink-warm-500 italic py-2">No snapshot yet. Save a URL + Sync now, or use the Manual tab.</p>
                )}
              </div>
            </TabsContent>

            {/* ─── Manual tab ──────────────────────────────────── */}
            <TabsContent value="manual" className="flex-1 overflow-y-auto min-h-0 mt-3 space-y-4">
              <p className="text-xs text-ink-warm-500 bg-cream-50 border border-cream-200 rounded-md p-2.5">
                <strong className="text-ink-warm-700">For activations without a microsite API yet.</strong> Edit JSON blobs directly. Each `*_json` field maps to one of the 8 components on the public page — leave empty to hide that component.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="m-name" className="text-xs">Name</Label>
                  <Input
                    id="m-name"
                    value={manualForm.activation_name}
                    onChange={(e) => setManualForm({ ...manualForm, activation_name: e.target.value })}
                    placeholder="Venice PFP Generator"
                    className="focus-brand h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="m-type" className="text-xs">Type</Label>
                  <Input
                    id="m-type"
                    value={manualForm.activation_type}
                    onChange={(e) => setManualForm({ ...manualForm, activation_type: e.target.value })}
                    placeholder="PFP Generator"
                    className="focus-brand h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="m-status" className="text-xs">Status</Label>
                  <Input
                    id="m-status"
                    value={manualForm.status}
                    onChange={(e) => setManualForm({ ...manualForm, status: e.target.value })}
                    placeholder="active"
                    className="focus-brand h-8 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Start date</Label>
                    <DateField
                      value={manualForm.start_date}
                      onChange={(v) => setManualForm({ ...manualForm, start_date: v })}
                      placeholder="Select start date"
                      allowClear
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">End date</Label>
                    <DateField
                      value={manualForm.end_date}
                      onChange={(v) => setManualForm({ ...manualForm, end_date: v })}
                      placeholder="Select end date"
                      allowClear
                    />
                  </div>
                </div>
              </div>

              {/* JSON blob editors — each maps to one of the 8
                  conditional components on the public page. */}
              {[
                { key: 'summary_json',        label: 'Summary (KPI cards + Points/Prizes)', rows: 5 },
                { key: 'entries_daily_json',  label: 'Entries Daily (bar chart)',           rows: 3 },
                { key: 'entries_by_kol_json', label: 'Entries by KOL (donut + leaderboard)', rows: 3 },
                { key: 'clicks_json',         label: 'Ecosystem Engagement',                 rows: 3 },
                { key: 'ugc_json',            label: 'UGC Performance',                      rows: 3 },
              ].map(({ key, label, rows }) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={key} className="text-xs">{label}</Label>
                  <Textarea
                    id={key}
                    rows={rows}
                    value={(manualForm as any)[key]}
                    onChange={(e) => setManualForm({ ...manualForm, [key]: e.target.value })}
                    className="focus-brand font-mono text-[11px]"
                  />
                </div>
              ))}
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter className="border-t border-cream-100 pt-3 mt-0 shrink-0 flex-wrap gap-2">
          {tab === 'manual' && latest && (
            <Button
              variant="ghost"
              size="sm"
              className="text-rose-600 hover:text-rose-700 mr-auto"
              onClick={handleManualDelete}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Delete snapshot
            </Button>
          )}
          {tab === 'manual' && (
            <Button variant="brand" onClick={handleManualSave} disabled={savingManual}>
              <Save className="h-3.5 w-3.5 mr-1" />
              {savingManual ? 'Saving…' : latest ? 'Save changes' : 'Create snapshot'}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
