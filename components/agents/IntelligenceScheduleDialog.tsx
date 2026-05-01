'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Loader2, AlertTriangle, CheckCircle, XCircle, Clock, Play,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/**
 * Configures the daily auto-Discovery scan.
 *
 * Vercel fires /api/cron/discovery-scheduled at 00:00 UTC every day.
 * That endpoint reads the row this dialog edits, decides whether
 * today matches the chosen cadence (daily / weekdays / weekly), and
 * runs a real Discovery scan with the saved params if it does.
 *
 * Hot-find Telegram alerts already wire into the same scan path, so
 * any REACH_OUT_NOW / PRE_TOKEN_PRIORITY hit from the cron pings the
 * configured TG chat just like a manual run would.
 */

type Cadence = 'daily' | 'weekdays' | 'weekly';
type Model = 'sonnet' | 'opus';
type Source = 'dropstab' | 'rootdata' | 'cryptorank' | 'ethglobal';

interface Schedule {
  schedule_key: string;
  is_enabled: boolean;
  cadence: Cadence;
  weekly_day: number | null;
  weekly_cost_cap_usd: number | null;
  // Volume controls — top-level on scheduled_scans, NOT inside scan_params.
  // runs_per_day:  1 = morning only (00:00 UTC). 2 = morning + afternoon
  //                (also 12:00 UTC = 09:00 ET, catches US-hours news).
  // cooldown_days: how many days a prospect must NOT be re-scanned. Lower
  //                = more aggressive re-evaluation; default 14.
  runs_per_day: number;
  cooldown_days: number;
  scan_params: {
    recency_days?: number;
    min_raise_usd?: number;
    max_projects?: number;
    model?: Model;
    sources?: Source[];
  };
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_summary: any;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Mirror the validation lists in the API route. If those change there,
// they need to change here too.
const RECENCY_OPTIONS = [
  { v: 7,  label: '7 days' },
  { v: 14, label: '14 days' },
  { v: 30, label: '30 days (default)' },
  { v: 60, label: '60 days' },
  { v: 90, label: '90 days' },
];
const MIN_RAISE_OPTIONS = [
  { v: 500_000,    label: '$500K' },
  { v: 1_000_000,  label: '$1M (default)' },
  { v: 2_000_000,  label: '$2M' },
  { v: 5_000_000,  label: '$5M' },
  { v: 10_000_000, label: '$10M' },
];
const MAX_PROJECTS_OPTIONS = [
  { v: 5,  label: '5 — fastest, cheapest' },
  { v: 10, label: '10 (default)' },
  { v: 15, label: '15' },
  { v: 20, label: '20 — broad sweep' },
  { v: 25, label: '25 — high volume' },
  { v: 30, label: '30 — very high volume' },
  { v: 50, label: '50 — max (server cap)' },
];
// Volume controls (added Apr 30 2026 to address "not enough prospects daily").
const RUNS_PER_DAY_OPTIONS = [
  { v: 1, label: '1× per day (morning, 09:00 KST)' },
  { v: 2, label: '2× per day (morning + evening, also catches US hours)' },
];
const COOLDOWN_OPTIONS = [
  { v: 3,  label: '3 days — aggressive re-scanning' },
  { v: 7,  label: '7 days' },
  { v: 14, label: '14 days (default)' },
  { v: 30, label: '30 days — conservative' },
];
const SOURCE_OPTIONS: { id: Source; label: string }[] = [
  { id: 'dropstab',   label: 'DropsTab' },
  { id: 'rootdata',   label: 'RootData' },
  { id: 'cryptorank', label: 'CryptoRank' },
  { id: 'ethglobal',  label: 'ETHGlobal' },
];
const WEEKDAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms/60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms/3_600_000)}h ago`;
  return `${Math.round(ms/86_400_000)}d ago`;
}

/** Rough monthly cost estimate based on chosen params + cadence.
 *  Pulls from the same per-run cost ranges we've observed in production
 *  ($0.04-0.15 Sonnet per candidate, $0.10-0.30 Opus per candidate).
 *  Multiplies by runs_per_day so the user sees the full impact of
 *  switching morning-only → morning + evening before saving. */
function estimateMonthlyCost(s: Schedule): { lo: number; hi: number; runsPerMonth: number } {
  const { cadence, weekly_day, scan_params, runs_per_day } = s;
  let daysPerMonth = 0;
  if (cadence === 'daily') daysPerMonth = 30.4;
  else if (cadence === 'weekdays') daysPerMonth = 21.7;
  else if (cadence === 'weekly') daysPerMonth = weekly_day != null ? 4.3 : 0;

  // Runs per month = days that match cadence × runs_per_day. The
  // afternoon cron only fires for cadence ∈ {daily, weekdays} since
  // weekly only matches a single day; for weekly, runs_per_day still
  // doubles the count when the matching day fires.
  const runsPerMonth = daysPerMonth * (runs_per_day ?? 1);

  const max = scan_params.max_projects ?? 10;
  const isOpus = scan_params.model === 'opus';
  // Real-world cost per candidate (rough), assuming all candidates get
  // through Stage 2 enrichment.
  const costPerCandLo = isOpus ? 0.10 : 0.04;
  const costPerCandHi = isOpus ? 0.30 : 0.15;
  const sourceMultiplier = (scan_params.sources?.length || 1) > 1 ? 1.2 : 1.0;

  const lo = runsPerMonth * max * costPerCandLo * sourceMultiplier;
  const hi = runsPerMonth * max * costPerCandHi * sourceMultiplier;
  return { lo, hi, runsPerMonth };
}

export default function IntelligenceScheduleDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  // Rolling 7-day DISCOVERY spend, fetched from the same endpoint the
  // top-of-page cost badge uses. Shown next to the cap input so the
  // user can pick a sensible threshold relative to actual usage.
  const [currentSpend, setCurrentSpend] = useState<number | null>(null);

  // Edit buffer — separate from `schedule` so unsaved changes can be
  // diffed and reverted on Cancel.
  const [draft, setDraft] = useState<Schedule | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/intelligence/schedule/config');
      const data = await res.json();
      if (!res.ok || data.error) {
        toast({ title: 'Failed to load', description: data.error || 'Unknown error', variant: 'destructive' });
      } else {
        setSchedule(data.schedule);
        setDraft(data.schedule);
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message ?? 'Failed to load', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { if (open) load(); }, [open, load]);

  // Pull current weekly spend whenever the dialog opens (independent of
  // schedule load — this comes from agent_runs, not the schedule row).
  useEffect(() => {
    if (!open) return;
    fetch('/api/agents/cost-summary')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && typeof d.total_cost_usd === 'number') setCurrentSpend(d.total_cost_usd);
      })
      .catch(() => {});
  }, [open]);

  const dirty = !!draft && !!schedule && JSON.stringify(draft) !== JSON.stringify(schedule);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch('/api/intelligence/schedule/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_enabled: draft.is_enabled,
          cadence: draft.cadence,
          weekly_day: draft.cadence === 'weekly' ? draft.weekly_day : null,
          weekly_cost_cap_usd: draft.weekly_cost_cap_usd,
          runs_per_day: draft.runs_per_day,
          cooldown_days: draft.cooldown_days,
          scan_params: draft.scan_params,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast({ title: 'Save failed', description: data.error || 'Unknown error', variant: 'destructive' });
      } else {
        setSchedule(data.schedule);
        setDraft(data.schedule);
        toast({ title: 'Saved', description: 'Schedule updated. Next cron run uses these settings.' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message ?? 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Fire the saved schedule manually right now, bypassing cadence and
   * is_enabled. Useful for verifying a config before relying on the
   * 09:00 KST cron tomorrow. Uses saved params, NOT the unsaved draft —
   * we explicitly require Save first so what runs matches what the cron
   * will run.
   */
  const runNow = async () => {
    if (dirty) {
      toast({
        title: 'Save first',
        description: 'Save your changes so the test run uses the latest params.',
        variant: 'destructive',
      });
      return;
    }
    setRunning(true);
    toast({
      title: 'Running test scan…',
      description: 'This usually takes 1-3 min for Sonnet, longer for Opus. You can close the dialog; the scan continues server-side.',
    });
    try {
      const res = await fetch('/api/intelligence/schedule/run-now', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast({ title: 'Run failed', description: data.error || data.summary?.error || 'Unknown error', variant: 'destructive' });
      } else if (data.status === 'failed') {
        toast({
          title: 'Scan returned failed status',
          description: data.summary?.error || data.summary?.errors?.[0] || 'Check the schedule dialog for details.',
          variant: 'destructive',
        });
      } else {
        const found = data.summary?.candidates_found ?? data.summary?.projects_found ?? 0;
        const inserted = data.summary?.inserted ?? 0;
        const cost = data.summary?.cost_usd;
        toast({
          title: 'Test scan complete',
          description: `${found} candidates · ${inserted} new · ${typeof cost === 'number' ? '$' + cost.toFixed(3) : '—'}`,
        });
      }
      // Reload to refresh last-run UI regardless of pass/fail
      load();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message ?? 'Run failed', variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  const updateDraft = (patch: Partial<Schedule>) => {
    setDraft(prev => prev ? { ...prev, ...patch } : prev);
  };
  const updateScanParam = <K extends keyof Schedule['scan_params']>(
    key: K,
    value: Schedule['scan_params'][K],
  ) => {
    setDraft(prev => prev ? { ...prev, scan_params: { ...prev.scan_params, [key]: value } } : prev);
  };
  const toggleSource = (s: Source) => {
    setDraft(prev => {
      if (!prev) return prev;
      const cur = prev.scan_params.sources || [];
      const has = cur.includes(s);
      // Always keep at least one source selected
      if (has && cur.length === 1) return prev;
      const next = has ? cur.filter(x => x !== s) : [...cur, s];
      return { ...prev, scan_params: { ...prev.scan_params, sources: next } };
    });
  };

  const cost = draft ? estimateMonthlyCost(draft) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#3e8692]" />
            Auto Discovery scan
          </DialogTitle>
          <DialogDescription>
            Vercel runs a Discovery scan automatically at 09:00 KST (00:00 UTC) each day,
            using the cadence and parameters below. Hot-tier finds will fire your
            Telegram alerts (if alerts are configured).
          </DialogDescription>
        </DialogHeader>

        {loading || !draft ? (
          <div className="py-8 flex items-center justify-center text-gray-500 text-sm">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Loading schedule…
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Master enable toggle */}
            <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
              <Switch
                id="schedule-enabled"
                checked={draft.is_enabled}
                onCheckedChange={v => updateDraft({ is_enabled: v })}
              />
              <Label htmlFor="schedule-enabled" className="text-sm cursor-pointer flex-1">
                <div className="font-medium">{draft.is_enabled ? 'Auto-scan ON' : 'Auto-scan OFF'}</div>
                <div className="text-xs text-gray-500 font-normal">
                  {draft.is_enabled
                    ? 'Cron will run on the cadence below'
                    : 'No automatic scans will run until enabled'}
                </div>
              </Label>
            </div>

            {/* Cadence */}
            <div>
              <Label htmlFor="cadence">Cadence</Label>
              <Select value={draft.cadence} onValueChange={v => updateDraft({ cadence: v as Cadence })}>
                <SelectTrigger id="cadence" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Every day</SelectItem>
                  <SelectItem value="weekdays">Weekdays only (Mon–Fri)</SelectItem>
                  <SelectItem value="weekly">Once a week</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Weekly day picker (only when cadence=weekly) */}
            {draft.cadence === 'weekly' && (
              <div>
                <Label>Day of week</Label>
                <div className="grid grid-cols-7 gap-1 mt-1">
                  {WEEKDAY_LABELS.map((label, i) => {
                    const day = i + 1; // ISO Mon..Sun
                    const selected = draft.weekly_day === day;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => updateDraft({ weekly_day: day })}
                        className={`text-xs py-2 rounded-md border transition-colors ${
                          selected
                            ? 'border-[#3e8692] bg-[#e8f4f5] text-gray-900 font-semibold'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Scan params */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="recency">Recency window</Label>
                <Select
                  value={String(draft.scan_params.recency_days ?? 30)}
                  onValueChange={v => updateScanParam('recency_days', Number(v))}
                >
                  <SelectTrigger id="recency" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECENCY_OPTIONS.map(o => <SelectItem key={o.v} value={String(o.v)}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="minraise">Min raise</Label>
                <Select
                  value={String(draft.scan_params.min_raise_usd ?? 1_000_000)}
                  onValueChange={v => updateScanParam('min_raise_usd', Number(v))}
                >
                  <SelectTrigger id="minraise" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MIN_RAISE_OPTIONS.map(o => <SelectItem key={o.v} value={String(o.v)}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="maxproj">Max projects per run</Label>
                <Select
                  value={String(draft.scan_params.max_projects ?? 10)}
                  onValueChange={v => updateScanParam('max_projects', Number(v))}
                >
                  <SelectTrigger id="maxproj" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MAX_PROJECTS_OPTIONS.map(o => <SelectItem key={o.v} value={String(o.v)}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="model">Model</Label>
                <Select
                  value={draft.scan_params.model ?? 'sonnet'}
                  onValueChange={v => updateScanParam('model', v as Model)}
                >
                  <SelectTrigger id="model" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sonnet">Sonnet (cheap, fast)</SelectItem>
                    <SelectItem value="opus">Opus (more thorough, ~5× cost)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Sources */}
            <div>
              <Label className="mb-1.5 block">Sources</Label>
              <div className="grid grid-cols-2 gap-2">
                {SOURCE_OPTIONS.map(opt => {
                  const selected = (draft.scan_params.sources || []).includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleSource(opt.id)}
                      className={`flex items-center gap-2 text-left rounded-lg border p-2 text-xs transition-colors ${
                        selected
                          ? 'border-[#3e8692] bg-[#e8f4f5] text-gray-900'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <span className={`h-3 w-3 rounded-sm border ${selected ? 'bg-[#3e8692] border-[#3e8692]' : 'border-gray-300'}`}>
                        {selected && <CheckCircle className="h-3 w-3 text-white" />}
                      </span>
                      <span className="font-medium">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-500 mt-1">
                At least one source must stay selected. Adding sources adds ~20% cost per run.
              </p>
            </div>

            {/* ── Volume controls (added Apr 30 2026) ───────────────── */}
            <div className="rounded-lg border border-[#3e8692]/20 bg-[#3e8692]/5 p-3 space-y-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[#3e8692]">
                  Volume Controls
                </span>
                <span className="text-[10px] text-gray-500">— more prospects per day</span>
              </div>

              {/* Runs per day */}
              <div>
                <Label htmlFor="runs-per-day">Runs per day</Label>
                <Select
                  value={String(draft.runs_per_day ?? 1)}
                  onValueChange={v => updateDraft({ runs_per_day: Number(v) })}
                >
                  <SelectTrigger id="runs-per-day" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RUNS_PER_DAY_OPTIONS.map(o => (
                      <SelectItem key={o.v} value={String(o.v)}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-gray-500 mt-1">
                  2× runs catch funding announcements that drop during US business hours.
                  <strong className="text-gray-700"> Doubles cost.</strong>
                </p>
              </div>

              {/* Cooldown days */}
              <div>
                <Label htmlFor="cooldown">Re-scan cooldown</Label>
                <Select
                  value={String(draft.cooldown_days ?? 14)}
                  onValueChange={v => updateDraft({ cooldown_days: Number(v) })}
                >
                  <SelectTrigger id="cooldown" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COOLDOWN_OPTIONS.map(o => (
                      <SelectItem key={o.v} value={String(o.v)}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-gray-500 mt-1">
                  How many days a prospect must NOT be re-scanned. Lower = catches prospects
                  whose Korea signal fired AFTER their last scan, but increases re-research cost.
                </p>
              </div>
            </div>

            {/* Cost estimate */}
            {cost && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 text-xs">
                <p className="font-semibold mb-1 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Estimated monthly cost
                </p>
                <p>
                  ~<strong>{cost.runsPerMonth.toFixed(1)} runs/month</strong> × {draft.scan_params.max_projects} projects each:
                  roughly <strong>${cost.lo.toFixed(2)}–${cost.hi.toFixed(2)}/month</strong>
                </p>
                {!draft.is_enabled && (
                  <p className="mt-1 text-amber-700">Auto-scan is OFF — no cost yet.</p>
                )}
              </div>
            )}

            {/* Weekly cost cap (kill switch) */}
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <Label htmlFor="cost-cap" className="cursor-pointer">
                  Weekly cost cap
                  <span className="font-normal text-[10px] text-gray-500 ml-1">
                    — kill switch
                  </span>
                </Label>
                {currentSpend != null && (
                  <span className="text-[11px] text-gray-500 tabular-nums">
                    Current 7d: <span className="font-semibold text-gray-800">${currentSpend.toFixed(2)}</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">$</span>
                <input
                  id="cost-cap"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={1000}
                  step={1}
                  placeholder="No cap"
                  value={draft.weekly_cost_cap_usd ?? ''}
                  onChange={e => {
                    const v = e.target.value;
                    if (v === '') {
                      updateDraft({ weekly_cost_cap_usd: null });
                    } else {
                      const n = Number(v);
                      if (Number.isFinite(n) && n >= 0) updateDraft({ weekly_cost_cap_usd: n });
                    }
                  }}
                  className="auth-input flex-1 max-w-[150px]"
                />
                {draft.weekly_cost_cap_usd != null && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-gray-500"
                    onClick={() => updateDraft({ weekly_cost_cap_usd: null })}
                    title="Remove the cap (no auto-disable)"
                  >
                    Clear
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-gray-500 mt-2">
                When the rolling 7-day Discovery spend reaches this amount, the cron
                auto-disables the schedule and sends a Telegram alert. Manual scans
                (Run Discovery, Find POCs, Deep Dive, Run-now) <strong>are not capped</strong> —
                their spend still counts toward the budget though.
              </p>
              {currentSpend != null && draft.weekly_cost_cap_usd != null && currentSpend >= draft.weekly_cost_cap_usd && (
                <p className="text-[11px] text-red-700 mt-1 font-semibold">
                  ⚠ Already at or over cap — next cron run would disable the schedule.
                </p>
              )}
            </div>

            {/* Manual trigger — useful for verifying a config without
                waiting for tomorrow's cron. Bypasses cadence + is_enabled
                gates but uses the saved params, NOT the unsaved draft, so
                what runs matches what the cron will run. */}
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-gray-800">Test the config now</div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Fires the scan immediately with the saved params. Costs ~$0.10–$0.80
                    depending on model and max projects. Result lands in the Last run section below.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs shrink-0"
                  onClick={runNow}
                  disabled={running || saving || dirty}
                  title={dirty ? 'Save your changes first to test the latest params' : 'Run a one-off scan with the saved params'}
                >
                  {running ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
                  {running ? 'Running…' : 'Run now'}
                </Button>
              </div>
            </div>

            {/* Last run */}
            {schedule?.last_run_at && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs space-y-1">
                <div className="flex items-center gap-2 font-semibold text-gray-700 flex-wrap">
                  Last run
                  <Badge variant="outline" className="text-[10px]">
                    {schedule.last_run_status}
                  </Badge>
                  {schedule.last_run_summary?.manually_triggered && (
                    <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                      manual
                    </Badge>
                  )}
                  <span className="text-gray-500 font-normal">{relativeTime(schedule.last_run_at)}</span>
                </div>
                {schedule.last_run_summary && (
                  <div className="text-gray-600">
                    {typeof schedule.last_run_summary.candidates_found === 'number' && (
                      <span>{schedule.last_run_summary.candidates_found} candidates · </span>
                    )}
                    {typeof schedule.last_run_summary.inserted === 'number' && (
                      <span>{schedule.last_run_summary.inserted} new · </span>
                    )}
                    {typeof schedule.last_run_summary.cost_usd === 'number' && (
                      <span>${schedule.last_run_summary.cost_usd.toFixed(3)}</span>
                    )}
                    {schedule.last_run_summary.error && (
                      <span className="text-red-700">Error: {schedule.last_run_summary.error}</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Unsaved warning */}
            {dirty && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                Unsaved changes — click Save to apply before the next cron run.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || running}>
            Close
          </Button>
          <Button
            onClick={save}
            disabled={saving || running || !dirty || loading}
            style={{ backgroundColor: 'var(--brand)', color: 'white' }}
            className="hover:opacity-90"
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
