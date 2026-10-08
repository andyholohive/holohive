'use client';

/**
 * Renewal pack dialog — pick slides, who it's for and a note for the "Next
 * term" slide, then mint a share link. Lists this client's earlier packs with
 * opens, copy and revoke. Admin+ (the API enforces it too).
 */

import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/hooks/use-toast';
import { Copy, ExternalLink, Loader2, Presentation, Trash2 } from 'lucide-react';
import { formatDate, formatRelativeShort } from '@/lib/dateFormat';
import { DEFAULT_SLIDES, RENEWAL_SLIDES, type RenewalSlide } from '@/lib/renewalPack';

interface Pack { id: string; token: string; preparedFor: string | null; slides: string[]; createdAt: string; opens: number; lastOpened: string | null }

export function RenewalPackDialog({ clientId, clientName, open, onOpenChange }: { clientId: string; clientName: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const [slides, setSlides] = useState<RenewalSlide[]>(DEFAULT_SLIDES);
  const [preparedFor, setPreparedFor] = useState(clientName);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const link = (token: string) => `${window.location.origin}/public/renewal/${token}`;

  const loadPacks = useCallback(async () => {
    const r = await fetch(`/api/clients/${clientId}/renewal-pack`);
    const d = await r.json().catch(() => ({}));
    setPacks(r.ok ? d.packs : []);
  }, [clientId]);
  useEffect(() => { if (open) loadPacks(); }, [open, loadPacks]);

  async function copy(token: string) {
    try { await navigator.clipboard.writeText(link(token)); toast({ title: 'Link copied', description: 'Paste it in the client chat.' }); }
    catch { toast({ title: 'Copy failed', description: link(token), variant: 'destructive' }); }
  }

  async function create() {
    setBusy(true);
    try {
      const r = await fetch(`/api/clients/${clientId}/renewal-pack`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slides, preparedFor, note }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Could not create the pack');
      await loadPacks();
      await copy(d.token);
      window.open(`/public/renewal/${d.token}?preview=1`, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      toast({ title: 'Could not create', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  }

  async function revoke(id: string) {
    const r = await fetch(`/api/clients/${clientId}/renewal-pack?id=${id}`, { method: 'DELETE' });
    setConfirmRevoke(null);
    if (!r.ok) { toast({ title: 'Could not revoke', variant: 'destructive' }); return; }
    toast({ title: 'Link revoked', description: 'Anyone opening it now gets a not-found page.' });
    loadPacks();
  }

  const toggle = (id: RenewalSlide) => setSlides((cur) => {
    const on = new Set(cur);
    if (on.has(id)) on.delete(id); else on.add(id);
    return RENEWAL_SLIDES.map((x) => x.id).filter((x) => on.has(x));
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Presentation className="h-4 w-4 text-brand" />Renewal pack</DialogTitle>
          <DialogDescription>
            A client-facing deck from this dashboard, frozen as of now. No spend, no channel names, no comparisons to named clients.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rp-for">Prepared for</Label>
              <Input id="rp-for" value={preparedFor} onChange={(e) => setPreparedFor(e.target.value)} placeholder="e.g. Venice team" className="h-9 focus-brand" />
            </div>
          </div>

          <div>
            <Label>Slides</Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {RENEWAL_SLIDES.map((x) => (
                <label key={x.id} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors ${slides.includes(x.id) ? 'border-brand/50 bg-brand-light/50' : 'border-cream-200 bg-white hover:border-brand/30'}`}>
                  <Checkbox checked={slides.includes(x.id)} onCheckedChange={() => toggle(x.id)} className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium text-ink-warm-900">{x.label}</span>
                    <span className="block text-xs text-ink-warm-500">{x.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-warm-500">Slides without data for this client are left out automatically.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rp-note">Note for the &ldquo;Next term&rdquo; slide</Label>
            <Textarea id="rp-note" value={note} onChange={(e) => setNote(e.target.value)} rows={4} className="focus-brand"
              placeholder="What we propose next term: focus, creators, cadence. Shown to the client as written." />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="brand" onClick={create} disabled={busy || !slides.length}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Presentation className="h-4 w-4 mr-2" />}Create link
            </Button>
          </div>

          <div className="border-t border-cream-200 pt-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Shared packs</p>
            {packs === null ? (
              <p className="text-xs text-ink-warm-400"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Loading</p>
            ) : packs.length === 0 ? (
              <p className="text-xs text-ink-warm-500">None yet for {clientName}.</p>
            ) : (
              <ul className="divide-y divide-cream-100">
                {packs.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-warm-900">{p.preparedFor || clientName} <span className="font-normal text-ink-warm-500">· {formatDate(p.createdAt)}</span></p>
                      <p className="text-xs text-ink-warm-500">{p.slides.length} slides · {p.lastOpened ? `opened ${formatRelativeShort(p.lastOpened)}` : 'not opened yet'}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <StatusBadge tone={p.opens ? 'success' : 'neutral'} size="sm">{p.opens} open{p.opens === 1 ? '' : 's'}</StatusBadge>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => copy(p.token)} aria-label="Copy link"><Copy className="h-3.5 w-3.5" /></Button>
                      <Button asChild variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="Preview">
                        <a href={`/public/renewal/${p.token}?preview=1`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                      </Button>
                      {confirmRevoke === p.id ? (
                        <Button variant="destructive" size="sm" className="h-7" onClick={() => revoke(p.id)}>Revoke</Button>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700" onClick={() => setConfirmRevoke(p.id)} aria-label="Revoke link"><Trash2 className="h-3.5 w-3.5" /></Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
