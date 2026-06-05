'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Shield, Eye, MousePointerClick, Calendar, Trash2, UserPlus, Loader2, Clock, Activity, RotateCcw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/**
 * ListAccessDialog — admin UI for the "Access & Activity" panel on a
 * single list. Backed by /api/lists/[id]/access (GET state, POST mutate).
 *
 * Three sections:
 *   1. Access duration setting (auto-expire)
 *   2. Current grants table (with revoke per row)
 *   3. Recent view/click activity feed
 *
 * Refetches state after every mutation so the UI always reflects truth.
 */

interface Grant {
  id: string;
  email: string;
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
}

interface PerEmailSummary {
  views: number;
  clicks: number;
  last_view_at: string | null;
}

interface RecentEvent {
  email: string;
  event_type: 'view' | 'click';
  click_target: string | null;
  ip_address: string | null;
  viewed_at: string;
}

interface AccessData {
  list: {
    id: string;
    name: string;
    access_duration_days: number | null;
    approved_emails: string[];
  };
  grants: Grant[];
  recent_events: RecentEvent[];
  per_email_summary: Record<string, PerEmailSummary>;
}

interface Props {
  listId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DURATION_OPTIONS = [
  { v: 0,   label: 'Off — never auto-expire' },
  { v: 7,   label: '7 days' },
  { v: 14,  label: '14 days' },
  { v: 30,  label: '30 days' },
  { v: 60,  label: '60 days' },
  { v: 90,  label: '90 days' },
  { v: 180, label: '180 days' },
];

function relTime(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) {
    // Future date (expires_at)
    const futureMs = -ms;
    if (futureMs < 86_400_000) return `in ${Math.round(futureMs / 3_600_000)}h`;
    return `in ${Math.round(futureMs / 86_400_000)}d`;
  }
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toISOString().slice(0, 10);
}

export default function ListAccessDialog({ listId, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [data, setData] = useState<AccessData | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null); // tracks per-row spinners
  const [newEmail, setNewEmail] = useState('');
  // v11 destructive-Dialog state — replaces the two native confirm()s
  // that previously gated the revoke + apply-expiry-to-all flows
  // (2026-06-05). `revokePending` holds the email being revoked;
  // `applyExpiryPending` is a boolean since the bulk-apply has no
  // per-row payload.
  const [revokePending, setRevokePending] = useState<string | null>(null);
  const [applyExpiryPending, setApplyExpiryPending] = useState(false);

  const fetchData = useCallback(async () => {
    if (!listId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/lists/${listId}/access`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
    } catch (err: any) {
      toast({ title: 'Failed to load', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [listId, toast]);

  useEffect(() => {
    if (open && listId) fetchData();
  }, [open, listId, fetchData]);

  const post = async (action: string, body: Record<string, any>, key: string) => {
    if (!listId) return;
    setBusyKey(key);
    try {
      const res = await fetch(`/api/lists/${listId}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      await fetchData();
      return json;
    } catch (err: any) {
      toast({ title: 'Action failed', description: err?.message, variant: 'destructive' });
    } finally {
      setBusyKey(null);
    }
  };

  const handleAddEmail = async () => {
    const e = newEmail.trim().toLowerCase();
    if (!e || !e.includes('@')) {
      toast({ title: 'Invalid email', variant: 'destructive' });
      return;
    }
    const result = await post('grant', { email: e }, 'grant');
    if (result?.ok) {
      toast({ title: 'Access granted', description: `${e} can now view this list.` });
      setNewEmail('');
    }
  };

  // Stage the revoke for the v11 confirm Dialog; the actual revoke
  // fires from confirmRevoke below.
  const handleRevoke = (email: string) => {
    setRevokePending(email);
  };

  const confirmRevoke = async () => {
    if (!revokePending) return;
    const email = revokePending;
    await post('revoke', { email }, `revoke-${email}`);
    setRevokePending(null);
    toast({ title: 'Access revoked', description: email });
  };

  const handleDurationChange = async (days: string) => {
    const n = Number(days);
    await post('set_duration', { days: n === 0 ? null : n }, 'duration');
    toast({ title: 'Auto-expire updated' });
  };

  // Stage the bulk apply for the v11 confirm Dialog; the actual mutate
  // fires from confirmApplyDuration below.
  const handleApplyDuration = () => {
    if (!data?.list.access_duration_days) return;
    setApplyExpiryPending(true);
  };

  const confirmApplyDuration = async () => {
    if (!data?.list.access_duration_days) return;
    const result = await post('apply_duration_to_existing', {}, 'apply');
    setApplyExpiryPending(false);
    if (result?.ok) {
      toast({ title: 'Applied', description: `${result.updated} grant(s) updated.` });
    }
  };

  // Active grants (not revoked) split from revoked-history
  const activeGrants = (data?.grants || []).filter(g => !g.revoked_at);
  const revokedGrants = (data?.grants || []).filter(g => g.revoked_at);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* v11 flex-col dialog — header pinned, body scrolls inside,
          consistent scrollbar position with the rest of the app. */}
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-brand" />
            Access &amp; Activity
            {data?.list.name && <span className="text-ink-warm-500 font-normal">— {data.list.name}</span>}
          </DialogTitle>
          <DialogDescription>
            Who has access, who&apos;s viewing it, and when access auto-expires.
          </DialogDescription>
        </DialogHeader>

        {loading || !data ? (
          // Structural skeleton — mirrors the loaded sections (settings
          // tile + grant-access input row + grants table + activity feed).
          <div className="flex-1 overflow-y-auto px-1 py-6 space-y-6">
            <Skeleton className="h-20 rounded-[14px]" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <div className="flex gap-2">
                <Skeleton className="h-9 flex-1 rounded-md" />
                <Skeleton className="h-9 w-16 rounded-md" />
              </div>
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-32 rounded-[14px]" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-24 rounded-[14px]" />
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-1 space-y-6 pt-2">
            {/* ── Settings: auto-expire duration ──────────────────────
                rounded-[14px] to match Card primitive radius. */}
            <section className="rounded-[14px] border border-cream-200 bg-cream-50 p-4">
              <div className="flex items-start gap-3">
                <Clock className="h-4 w-4 text-ink-warm-500 mt-1 shrink-0" />
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-ink-warm-900 mb-1">Auto-expire access</h4>
                  <p className="text-xs text-ink-warm-500 mb-3">
                    New emails added to this list will lose access automatically after the chosen duration.
                    Existing emails are unaffected unless you click &quot;Apply to existing&quot;.
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select
                      value={String(data.list.access_duration_days ?? 0)}
                      onValueChange={handleDurationChange}
                    >
                      <SelectTrigger className="h-9 w-56 text-sm focus-brand bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DURATION_OPTIONS.map(o => (
                          <SelectItem key={o.v} value={String(o.v)}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {data.list.access_duration_days != null && data.list.access_duration_days > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 text-xs"
                        onClick={handleApplyDuration}
                        disabled={busyKey === 'apply'}
                      >
                        {busyKey === 'apply' && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                        Apply to existing
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* ── Grant access (add email) ─────────────────────────────
                v11 input chrome — focus-brand for the brand-teal focus
                ring (was using browser default), text-sm matches the
                Settings select trigger height. */}
            <section>
              <h4 className="text-sm font-semibold text-ink-warm-900 mb-2 flex items-center gap-1.5">
                <UserPlus className="h-4 w-4" />
                Grant access
              </h4>
              <div className="flex items-center gap-2">
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddEmail(); }}
                  className="h-9 text-sm focus-brand"
                />
                <Button variant="brand" type="button" size="sm" className="h-9 text-xs shrink-0" onClick={handleAddEmail} disabled={busyKey === 'grant'}>
                  {busyKey === 'grant' && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                  Add
                </Button>
              </div>
            </section>

            {/* ── Active grants ──────────────────────────────────────── */}
            <section>
              <h4 className="text-sm font-semibold text-ink-warm-900 mb-2 flex items-center gap-1.5">
                Active access ({activeGrants.length})
              </h4>
              {activeGrants.length === 0 ? (
                <p className="text-sm text-ink-warm-400 italic py-3 text-center border border-dashed border-cream-200 rounded-[14px]">
                  No one has access yet.
                </p>
              ) : (
                <div className="border border-cream-200 rounded-[14px] overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-cream-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-ink-warm-500 uppercase tracking-wider">Email</th>
                        <th className="px-3 py-2 text-left font-medium text-ink-warm-500 uppercase tracking-wider">Granted</th>
                        <th className="px-3 py-2 text-left font-medium text-ink-warm-500 uppercase tracking-wider">Expires</th>
                        <th className="px-3 py-2 text-left font-medium text-ink-warm-500 uppercase tracking-wider">Activity</th>
                        <th className="px-3 py-2 text-left font-medium text-ink-warm-500 uppercase tracking-wider">Last view</th>
                        <th className="px-3 py-2 w-16"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cream-100">
                      {activeGrants.map(g => {
                        const summary = data.per_email_summary[g.email];
                        const expiresMs = g.expires_at ? new Date(g.expires_at).getTime() - Date.now() : null;
                        const daysUntil = expiresMs != null ? Math.ceil(expiresMs / 86_400_000) : null;
                        const expiryClass = daysUntil != null
                          ? (daysUntil <= 0 ? 'text-rose-600 font-semibold'
                              : daysUntil <= 7 ? 'text-amber-600'
                              : 'text-ink-warm-700')
                          : 'text-ink-warm-400 italic';
                        return (
                          <tr key={g.id} className="hover:bg-cream-50">
                            <td className="px-3 py-2 text-ink-warm-900 font-mono text-[11px]">{g.email}</td>
                            <td className="px-3 py-2 text-ink-warm-700">{fmtDate(g.granted_at)}</td>
                            <td className={`px-3 py-2 ${expiryClass}`}>
                              {g.expires_at
                                ? <span title={fmtDate(g.expires_at)}>{relTime(g.expires_at)}</span>
                                : 'Never'}
                            </td>
                            <td className="px-3 py-2 text-ink-warm-700">
                              {summary ? (
                                <span className="inline-flex items-center gap-2">
                                  <span className="inline-flex items-center gap-0.5"><Eye className="h-3 w-3" />{summary.views}</span>
                                  <span className="inline-flex items-center gap-0.5"><MousePointerClick className="h-3 w-3" />{summary.clicks}</span>
                                </span>
                              ) : (
                                <span className="text-ink-warm-300">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-ink-warm-500">
                              {summary?.last_view_at ? relTime(summary.last_view_at) : 'never'}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                className="text-rose-500 hover:text-rose-700 disabled:opacity-50"
                                title="Revoke access"
                                onClick={() => handleRevoke(g.email)}
                                disabled={busyKey === `revoke-${g.email}`}
                              >
                                {busyKey === `revoke-${g.email}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ── Recent activity feed ───────────────────────────────── */}
            <section>
              <h4 className="text-sm font-semibold text-ink-warm-900 mb-2 flex items-center gap-1.5">
                <Activity className="h-4 w-4" />
                Recent activity
                <span className="text-[10px] text-ink-warm-400 font-normal">(latest 100 events)</span>
              </h4>
              {data.recent_events.length === 0 ? (
                <p className="text-sm text-ink-warm-400 italic py-3 text-center border border-dashed border-cream-200 rounded-[14px]">
                  No views or clicks recorded yet.
                </p>
              ) : (
                <div className="border border-cream-200 rounded-[14px] max-h-72 overflow-y-auto">
                  <ul className="divide-y divide-cream-100">
                    {data.recent_events.slice(0, 30).map((e, i) => {
                      const Icon = e.event_type === 'click' ? MousePointerClick : Eye;
                      return (
                        <li key={i} className="px-3 py-2 text-xs flex items-start gap-2 hover:bg-cream-50">
                          <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${e.event_type === 'click' ? 'text-brand' : 'text-ink-warm-400'}`} />
                          <div className="flex-1 min-w-0">
                            <span className="font-mono text-ink-warm-700">{e.email}</span>
                            <span className="text-ink-warm-400"> {e.event_type === 'click' ? 'clicked' : 'viewed'}</span>
                            {e.click_target && (
                              <span className="text-ink-warm-500"> → <span className="text-brand break-all">{e.click_target.length > 60 ? e.click_target.slice(0, 60) + '…' : e.click_target}</span></span>
                            )}
                          </div>
                          <span className="text-ink-warm-400 shrink-0">{relTime(e.viewed_at)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </section>

            {/* ── Revoked grants history (collapsed) ─────────────────── */}
            {revokedGrants.length > 0 && (
              <details className="rounded-[14px] border border-cream-200">
                <summary className="px-3 py-2 text-xs text-ink-warm-700 cursor-pointer hover:bg-cream-50 select-none">
                  Revoked history ({revokedGrants.length})
                </summary>
                <div className="border-t border-cream-100">
                  <table className="w-full text-xs">
                    <thead className="bg-cream-50/50">
                      <tr>
                        <th className="px-3 py-1.5 text-left text-ink-warm-500 font-medium">Email</th>
                        <th className="px-3 py-1.5 text-left text-ink-warm-500 font-medium">Revoked</th>
                        <th className="px-3 py-1.5 text-left text-ink-warm-500 font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revokedGrants.slice(0, 20).map(g => (
                        <tr key={g.id}>
                          <td className="px-3 py-1.5 font-mono text-[11px] text-ink-warm-700">{g.email}</td>
                          <td className="px-3 py-1.5 text-ink-warm-500">{relTime(g.revoked_at)}</td>
                          <td className="px-3 py-1.5">
                            <Badge variant="outline" className="text-[10px]">{g.revoked_reason || 'manual'}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        )}

        {/* Revoke-access confirm — v11 destructive Dialog replacing
            the native confirm() that used to gate `handleRevoke`.
            Nested inside the parent ListAccessDialog; depth-aware
            overlay in `components/ui/dialog.tsx` handles the
            stacked backdrop. 2026-06-05. */}
        <Dialog open={!!revokePending} onOpenChange={(open) => { if (!open) setRevokePending(null); }}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Trash2 className="h-4 w-4 text-rose-500" />
                Revoke Access?
              </DialogTitle>
              <DialogDescription className="text-sm text-ink-warm-700 pt-2">
                <strong>{revokePending ?? ''}</strong> will lose access to this list. They&apos;ll need to be re-added to view it again.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
              <Button variant="outline" onClick={() => setRevokePending(null)} disabled={busyKey === `revoke-${revokePending}`}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmRevoke} disabled={busyKey === `revoke-${revokePending}`}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                {busyKey === `revoke-${revokePending}` ? 'Revoking…' : 'Revoke'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Apply-expiry-to-all confirm — v11 destructive Dialog. Not
            a deletion (uses RotateCcw, not Trash2), but still
            variant="destructive" because it overwrites existing
            expires_at values across every active grant. 2026-06-05. */}
        <Dialog open={applyExpiryPending} onOpenChange={(open) => { if (!open) setApplyExpiryPending(false); }}>
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <RotateCcw className="h-4 w-4 text-rose-500" />
                Apply Expiry To All?
              </DialogTitle>
              <DialogDescription className="text-sm text-ink-warm-700 pt-2">
                Each of the <strong>{activeGrants.length}</strong> current active grant{activeGrants.length === 1 ? '' : 's'} will get <code className="px-1 rounded bg-cream-100 text-[12px]">expires_at = granted_at + {data?.list.access_duration_days ?? 0} days</code>. Existing expiries will be overwritten.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
              <Button variant="outline" onClick={() => setApplyExpiryPending(false)} disabled={busyKey === 'apply'}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmApplyDuration} disabled={busyKey === 'apply'}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                {busyKey === 'apply' ? 'Applying…' : 'Apply Expiry'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
