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
  Loader2, AlertTriangle, CheckCircle, XCircle, Clock,
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
  { v: 20, label: '20 — broadest sweep' },
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
 *  ($0.04-0.15 Sonnet per candidate, $0.10-0.30 Opus per candidate). */
function estimateMonthlyCost(s: Schedule): { lo: number; hi: number; runsPerMonth: number } {
  const { cadence, weekly_day, scan_params } = s;
  let runsPerMonth = 0;
  if (cadence === 'daily') runsPerMonth = 30.4;
  else if (cadence === 'weekdays') runsPerMonth = 21.7;
  else if (cadence === 'weekly') runsPerMonth = weekly_day != null ? 4.3 : 0;

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
  const [schedule, setSchedule] = useState<Schedule | null>(null);

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

            {/* Last run */}
            {schedule?.last_run_at && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs space-y-1">
                <div className="flex items-center gap-2 font-semibold text-gray-700">
                  Last run
                  <Badge variant="outline" className="text-[10px]">
                    {schedule.last_run_status}
                  </Badge>
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Close
          </Button>
          <Button
            onClick={save}
            disabled={saving || !dirty || loading}
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
