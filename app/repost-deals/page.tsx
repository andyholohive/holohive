'use client';

/**
 * Repost Deals — the operator console from Jdot's spec §7.
 *
 * Build a deal, see who is eligible and what it could cost before committing,
 * launch it into every KOL group chat at once, watch it fill, settle.
 *
 * The preview step carries the weight here. Every KOL carries a different
 * price, so "8 B-tier slots" does not tell an operator what the deal can
 * cost — the console has to show the worst case (the priciest eligible KOLs
 * filling every slot) before they set the ceiling.
 */

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/dateFormat';
import { Repeat2, Plus, Send, Ban, BadgeCheck, Users } from 'lucide-react';

type Deal = {
  id: string; name: string; source_post_link: string; status: string;
  niche_tags: string[]; tiers: string[]; tier_caps: Record<string, number>;
  budget_total: number; budget_spent: number;
  closes_at: string | null; close_reason: string | null;
  launched_at: string | null; created_at: string;
  offers_total: number; accepted: number; rejected: number; pending: number; declined_cap: number;
};

type Preview = {
  eligible_count: number;
  maxSpend: number;
  perTier: Record<string, { eligible: number; cap: number; maxSpend: number }>;
  eligible: Array<{ id: string; name: string; tier: string; price: number }>;
};

const STATUS_TONE: Record<string, BadgeTone> = {
  draft: 'neutral', live: 'brand', closed: 'warning', settled: 'success',
};
const CLOSE_REASON_LABEL: Record<string, string> = {
  slots_full: 'Slots full',
  budget_exhausted: 'Budget spent',
  timer_expired: 'Timer expired',
  manual_close: 'Closed by hand',
};
const TIERS = ['S', 'A', 'B', 'C', 'D'] as const;

const money = (n: number | string) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

export default function RepostDealsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    name: '', source_post_link: '', budget_total: '', hours: '24',
    niche: '', tiers: [] as string[], caps: {} as Record<string, string>,
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch('/api/repost-deals');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(res.status === 401 || res.status === 403
          ? 'Repost Deals is super-admin only.'
          : json.error || 'Could not load deals.');
        setDeals([]);
        return;
      }
      setLoadError(null);
      setDeals(json.deals ?? []);
    } catch {
      setLoadError('Could not reach the server.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const capsNumeric = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(form.caps)) {
      const n = Number(v);
      if (n > 0) out[k] = n;
    }
    return out;
  }, [form.caps]);

  const runPreview = async () => {
    setPreviewing(true);
    try {
      const res = await fetch('/api/repost-deals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preview: true,
          niche_tags: form.niche.split(',').map(s => s.trim()).filter(Boolean),
          tiers: form.tiers,
          tier_caps: capsNumeric,
        }),
      });
      const json = await res.json().catch(() => ({}));
      // An error body has no perTier. Surface it instead of storing a shape
      // the render will walk into.
      if (!res.ok || !json?.perTier) {
        setPreview(null);
        toast({
          title: 'Eligibility check failed',
          description: json?.error || (res.status === 401 || res.status === 403
            ? 'Repost Deals is super-admin only.' : 'Try again.'),
          variant: 'destructive',
        });
        return;
      }
      setPreview(json);
    } finally { setPreviewing(false); }
  };

  const createAndLaunch = async (launch: boolean) => {
    setBusy(true);
    try {
      const res = await fetch('/api/repost-deals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          source_post_link: form.source_post_link,
          budget_total: Number(form.budget_total),
          niche_tags: form.niche.split(',').map(s => s.trim()).filter(Boolean),
          tiers: form.tiers,
          tier_caps: capsNumeric,
          closes_at: new Date(Date.now() + Number(form.hours || 24) * 3600_000).toISOString(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Create failed');

      if (launch) {
        const lr = await fetch(`/api/repost-deals/${json.deal.id}/launch`, { method: 'POST' });
        const lj = await lr.json();
        if (!lr.ok) throw new Error(lj.reason || lj.error || 'Launch failed');
        toast({ title: 'Deal launched', description: `${lj.sent} offer(s) sent${lj.failed ? `, ${lj.failed} failed to send` : ''}.` });
      } else {
        toast({ title: 'Draft saved' });
      }
      setCreateOpen(false);
      setForm({ name: '', source_post_link: '', budget_total: '', hours: '24', niche: '', tiers: [], caps: {} });
      setPreview(null);
      await load();
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const act = async (deal: Deal, verb: 'launch' | 'close' | 'settle') => {
    setBusy(true);
    try {
      const res = await fetch(`/api/repost-deals/${deal.id}/${verb}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.reason || json.error || `${verb} failed`);
      toast({ title: `Deal ${verb === 'launch' ? 'launched' : verb === 'close' ? 'closed' : 'settled'}` });
      await load();
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const header = (
    <PageHeader
      icon={Repeat2}
      title="Repost Deals"
      subtitle="Broadcast one repost offer to every eligible KOL at once — first come, first served"
      actions={(
        <Button variant="brand" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />New Deal
        </Button>
      )}
    />
  );

  if (loading) {
    return (
      <div className="space-y-6">
        {header}
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {loadError ? (
        <EmptyState icon={Repeat2} title="Can't show deals" description={loadError} />
      ) : deals.length === 0 ? (
        <EmptyState
          icon={Repeat2}
          title="No repost deals yet"
          description="Create a deal to broadcast one repost offer across every eligible KOL group chat."
        >
          <Button variant="brand" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />New Deal
          </Button>
        </EmptyState>
      ) : (
        <Card className="border-cream-200 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                  {['Deal', 'Status', 'Slots', 'Budget', 'Closes', ''].map(h => (
                    <TableHead key={h} className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {deals.map(d => (
                  <TableRow key={d.id} className="border-gray-100">
                    <TableCell className="py-3">
                      <span className="font-medium text-ink-warm-900">{d.name}</span>
                      <span className="block text-[11px] text-ink-warm-400 truncate max-w-xs">{d.source_post_link}</span>
                    </TableCell>
                    <TableCell className="py-3">
                      <StatusBadge tone={STATUS_TONE[d.status] ?? 'neutral'} size="sm">
                        {d.status[0].toUpperCase() + d.status.slice(1)}
                      </StatusBadge>
                      {d.close_reason && (
                        <span className="block text-[11px] text-ink-warm-400 mt-0.5">
                          {CLOSE_REASON_LABEL[d.close_reason] ?? d.close_reason}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="py-3 tabular-nums text-sm">
                      <span className="text-ink-warm-900 font-medium">{d.accepted}</span>
                      <span className="text-ink-warm-400"> accepted</span>
                      <span className="block text-[11px] text-ink-warm-400">
                        {d.pending} pending · {d.rejected} passed{d.declined_cap ? ` · ${d.declined_cap} too late` : ''}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 tabular-nums text-sm">
                      {money(d.budget_spent)} <span className="text-ink-warm-400">/ {money(d.budget_total)}</span>
                    </TableCell>
                    <TableCell className="py-3 text-sm">
                      {d.closes_at ? formatDateTime(d.closes_at) : <span className="text-ink-warm-400">—</span>}
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {d.status === 'draft' && (
                          <Button size="sm" variant="brand" disabled={busy} onClick={() => act(d, 'launch')}>
                            <Send className="h-3.5 w-3.5 mr-1" />Launch
                          </Button>
                        )}
                        {d.status === 'live' && (
                          <Button size="sm" variant="outline" className="border-rose-300 text-rose-600 hover:bg-rose-50"
                            disabled={busy} onClick={() => act(d, 'close')}>
                            <Ban className="h-3.5 w-3.5 mr-1" />Close
                          </Button>
                        )}
                        {d.status === 'closed' && (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => act(d, 'settle')}>
                            <BadgeCheck className="h-3.5 w-3.5 mr-1" />Settle
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New repost deal</DialogTitle>
            <DialogDescription>
              One offer, broadcast to every eligible KOL group chat. Slots and budget cap the spend.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Deal name <RequiredAsterisk /></Label>
              <Input className="h-9 focus-brand" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Fogo mainnet announcement" />
            </div>
            <div>
              <Label>Post to be reposted <RequiredAsterisk /></Label>
              <Input className="h-9 focus-brand" value={form.source_post_link}
                onChange={e => setForm({ ...form, source_post_link: e.target.value })}
                placeholder="https://t.me/channel/123" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Budget ceiling ($) <RequiredAsterisk /></Label>
                <Input className="h-9 focus-brand" inputMode="numeric" value={form.budget_total}
                  onChange={e => setForm({ ...form, budget_total: e.target.value })} placeholder="2000" />
              </div>
              <div>
                <Label>Closes in (hours)</Label>
                <Input className="h-9 focus-brand" inputMode="numeric" value={form.hours}
                  onChange={e => setForm({ ...form, hours: e.target.value })} placeholder="24" />
              </div>
            </div>

            <div>
              <Label>Niche tags</Label>
              <Input className="h-9 focus-brand" value={form.niche}
                onChange={e => setForm({ ...form, niche: e.target.value })}
                placeholder="Comma-separated. Leave blank to target every niche." />
            </div>

            <div>
              <Label>Tiers and slot caps</Label>
              <p className="text-xs text-ink-warm-500 mb-2">
                A tier with no cap gets no slots. Tier comes from Channel Score and is frozen when the deal launches.
              </p>
              <div className="grid grid-cols-5 gap-2">
                {TIERS.map(t => (
                  <div key={t}>
                    <div className="text-[11px] uppercase tracking-wider text-ink-warm-400 mb-1">Tier {t}</div>
                    <Input
                      className="h-9 focus-brand" inputMode="numeric" placeholder="0"
                      value={form.caps[t] ?? ''}
                      onChange={e => {
                        const caps = { ...form.caps, [t]: e.target.value };
                        const tiers = Object.entries(caps).filter(([, v]) => Number(v) > 0).map(([k]) => k);
                        setForm({ ...form, caps, tiers });
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-cream-200 p-3 bg-cream-50/50">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-ink-warm-700">
                  <Users className="h-4 w-4 text-ink-warm-400" />
                  {preview
                    ? <span><b>{preview.eligible_count}</b> eligible · worst case <b>{money(preview.maxSpend)}</b></span>
                    : <span className="text-ink-warm-500">Check who this reaches before launching.</span>}
                </div>
                <Button size="sm" variant="outline" onClick={runPreview} disabled={previewing}>
                  {previewing ? 'Checking…' : 'Check eligibility'}
                </Button>
              </div>

              {preview && (
                <>
                  {/* Worst case, not average: every KOL is priced differently,
                      so slot caps alone don't bound the spend. */}
                  {Number(form.budget_total) > 0 && preview.maxSpend > Number(form.budget_total) && (
                    <p className="mt-2 text-xs text-amber-700">
                      The caps could ask for {money(preview.maxSpend)} but the ceiling is {money(Number(form.budget_total))} —
                      the deal will close on budget before every slot fills.
                    </p>
                  )}
                  {preview.eligible_count === 0 && (
                    <p className="mt-2 text-xs text-rose-600">
                      Nobody is eligible. A KOL needs a share price logged, a matching niche and tier, and a linked
                      Telegram group chat.
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(preview.perTier ?? {})
                      .filter(([, v]) => v.cap > 0 || v.eligible > 0)
                      .map(([tier, v]) => (
                        <StatusBadge key={tier} tone={v.eligible < v.cap ? 'warning' : 'neutral'} size="sm">
                          {tier}: {v.eligible} eligible / {v.cap} slots
                        </StatusBadge>
                      ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <DialogFooter className="border-t border-cream-200 pt-3">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="outline" onClick={() => createAndLaunch(false)} disabled={busy}>Save draft</Button>
            <Button variant="brand" onClick={() => createAndLaunch(true)} disabled={busy}>
              <Send className="h-4 w-4 mr-2" />Launch now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
