'use client';

/**
 * New deal — a door onto the Pipeline that is not TG Outreach.
 *
 * [Yano 2026-10-26] "rn only projects that get marked as a lead thru outreach
 * get put into pipeline." Referrals, inbounds and expansions on current
 * clients had nowhere to go. This creates the deal at New Lead with the two
 * people that matter recorded separately: the owner (who works it, can
 * change) and who sourced it (fixed from here on).
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Plus } from 'lucide-react';
import { PipelineV13Service } from '@/lib/pipelineV13Service';

const SOURCES: Array<{ key: string; label: string }> = [
  { key: 'referral', label: 'Referral' },
  { key: 'inbound', label: 'Inbound' },
  { key: 'event', label: 'Event' },
  { key: 'cold_outbound', label: 'Cold Outbound' },
  { key: 'discovery', label: 'Discovery' },
  { key: 'expansion', label: 'Expansion (existing client)' },
];

export default function NewDealDialog({ onCreated }: { onCreated?: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState<Array<{ id: string; name: string }>>([]);
  const [clients, setClients] = useState<Array<{ id: string; name: string; status: string | null }>>([]);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [source, setSource] = useState('referral');
  const [ownerId, setOwnerId] = useState('');
  const [sourcedBy, setSourcedBy] = useState('');
  const [expansion, setExpansion] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientQuery, setClientQuery] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const [t, c] = await Promise.all([PipelineV13Service.assignableOwners(), PipelineV13Service.attachableClients()]);
        setTeam(t); setClients(c);
      } catch (err: any) {
        toast({ title: 'Could not load the team', description: err?.message, variant: 'destructive' });
      }
    })();
    // Default both people to whoever is opening the dialog.
    setOwnerId(user?.id ?? ''); setSourcedBy(user?.id ?? '');
  }, [open, user?.id, toast]);

  const clientMatches = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    return clients.filter(c => !q || c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [clients, clientQuery]);
  const chosenClient = clients.find(c => c.id === clientId) ?? null;

  function reset() {
    setName(''); setValue(''); setSource('referral'); setExpansion(false); setClientId(''); setClientQuery('');
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (expansion && !clientId) return;
    const num = value.trim() ? Number(value.replace(/[$,]/g, '')) : null;
    if (num !== null && !Number.isFinite(num)) return;
    setSaving(true);
    try {
      await PipelineV13Service.create({
        name: trimmed, dealValue: num, ownerId: ownerId || null, sourcedBy: sourcedBy || null,
        source: expansion ? 'expansion' : source, clientId: expansion ? clientId : null,
        notes: expansion && chosenClient ? `Expansion on ${chosenClient.name}.` : null,
      });
      toast({ title: `${trimmed} added`, description: 'It starts at New Lead.' });
      setOpen(false); reset(); onCreated?.();
    } catch (err: any) {
      toast({ title: 'Could not create the deal', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  }

  return (
    <>
      <Button variant="brand" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-2" />New deal
      </Button>
      <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New deal</DialogTitle>
            <DialogDescription>
              For deals that did not come through TG Outreach — a referral, an inbound,
              or more work for a current client.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-cream-200 bg-cream-50 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-ink-warm-900">Expansion on an existing client</p>
                <p className="text-[11px] text-ink-warm-500">Attach it to the client so it shows next to their current work.</p>
              </div>
              <Switch checked={expansion} onCheckedChange={v => { setExpansion(v); if (!v) setClientId(''); }} />
            </div>

            {expansion && (
              <div>
                <Label>Client <RequiredAsterisk /></Label>
                {chosenClient ? (
                  <div className="mt-1 flex items-center justify-between rounded-md border border-brand/40 bg-brand-light/40 px-3 py-2 text-sm">
                    <span className="font-medium text-ink-warm-900">{chosenClient.name}</span>
                    <button type="button" className="text-xs text-ink-warm-500 hover:text-brand" onClick={() => { setClientId(''); setName(''); }}>Change</button>
                  </div>
                ) : (
                  <>
                    <Input value={clientQuery} onChange={e => setClientQuery(e.target.value)} placeholder="Search clients" className="h-9 mt-1 focus-brand" autoFocus />
                    <div className="mt-1 max-h-44 overflow-y-auto rounded-md border border-cream-200 divide-y divide-cream-100">
                      {clientMatches.length === 0 && <p className="px-3 py-2 text-xs text-ink-warm-400">No clients match.</p>}
                      {clientMatches.map(c => (
                        <button key={c.id} type="button" onClick={() => { setClientId(c.id); if (!name.trim()) setName(`${c.name} — expansion`); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-cream-50 flex items-center justify-between">
                          <span>{c.name}</span>
                          {c.status && <span className="text-[10px] uppercase tracking-wider text-ink-warm-400">{c.status}</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <div>
              <Label htmlFor="deal-name">Project <RequiredAsterisk /></Label>
              <Input id="deal-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sonic Labs" className="h-9 mt-1 focus-brand" autoFocus={!expansion} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="deal-value">Value (USD)</Label>
                <Input id="deal-value" inputMode="numeric" value={value} onChange={e => setValue(e.target.value)} placeholder="Optional" className="h-9 mt-1 focus-brand" />
              </div>
              <div>
                <Label>Source</Label>
                <Select value={expansion ? 'expansion' : source} onValueChange={setSource} disabled={expansion}>
                  <SelectTrigger className="h-9 mt-1 focus-brand"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SOURCES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Owner</Label>
                <Select value={ownerId} onValueChange={setOwnerId}>
                  <SelectTrigger className="h-9 mt-1 focus-brand"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    {team.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-ink-warm-500 mt-1">Works the deal. Can be reassigned.</p>
              </div>
              <div>
                <Label>Sourced by</Label>
                <Select value={sourcedBy} onValueChange={setSourcedBy}>
                  <SelectTrigger className="h-9 mt-1 focus-brand"><SelectValue placeholder="Nobody" /></SelectTrigger>
                  <SelectContent>
                    {team.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-ink-warm-500 mt-1">Brought it in. Stays fixed.</p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="brand" onClick={submit} disabled={saving || !name.trim() || (expansion && !clientId)}>
              {saving ? 'Adding…' : 'Add to pipeline'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
