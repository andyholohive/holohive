'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Plus, Trash2, Calendar as CalendarIcon, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { campaignActivationService, type CampaignActivation } from '@/lib/campaignActivationService';
import { formatDate, toIsoDate } from '@/lib/dateFormat';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName?: string;
}

type DeliverableRow = { platform: string; type: string; count: number };

const PLATFORMS = ['X', 'Telegram', 'YouTube', 'Instagram', 'TikTok'];
const DELIVERABLE_TYPES = ['Post', 'Thread', 'Video', 'Repost', 'QRT', 'Livestream', 'Newsletter'];

export function AddActivationDialog({ open, onOpenChange, campaignId, campaignName }: Props) {
  const { toast } = useToast();
  const [existing, setExisting] = useState<CampaignActivation[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [effectiveDate, setEffectiveDate] = useState<Date | undefined>(new Date());
  const [budgetDelta, setBudgetDelta] = useState<string>('');
  const [deliverables, setDeliverables] = useState<DeliverableRow[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    campaignActivationService.list(campaignId)
      .then(setExisting)
      .catch(err => toast({ title: 'Failed to load activations', description: err?.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
    // Reset form
    setEffectiveDate(new Date());
    setBudgetDelta('');
    setDeliverables([]);
    setNotes('');
  }, [open, campaignId, toast]);

  const addDeliverableRow = () => {
    setDeliverables(rows => [...rows, { platform: 'X', type: 'Post', count: 1 }]);
  };

  const updateDeliverable = (idx: number, patch: Partial<DeliverableRow>) => {
    setDeliverables(rows => rows.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const removeDeliverable = (idx: number) => {
    setDeliverables(rows => rows.filter((_, i) => i !== idx));
  };

  const save = async () => {
    if (!effectiveDate) {
      toast({ title: 'Effective date required', variant: 'destructive' });
      return;
    }
    const budget = Number((budgetDelta || '0').replace(/,/g, ''));
    if (Number.isNaN(budget)) {
      toast({ title: 'Budget delta must be a number', variant: 'destructive' });
      return;
    }
    if (deliverables.length === 0 && budget === 0) {
      toast({ title: 'Add at least a deliverable or a budget delta', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const created = await campaignActivationService.create({
        campaign_id: campaignId,
        effective_date: toIsoDate(effectiveDate.toISOString()),
        budget_delta_usd: budget,
        extra_deliverables: deliverables,
        notes: notes.trim() || null,
      });
      setExisting(prev => [created, ...prev]);
      setBudgetDelta('');
      setDeliverables([]);
      setNotes('');
      toast({ title: 'Activation added' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this activation?')) return;
    try {
      await campaignActivationService.remove(id);
      setExisting(prev => prev.filter(a => a.id !== id));
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err?.message, variant: 'destructive' });
    }
  };

  const totalDelta = existing.reduce((sum, a) => sum + Number(a.budget_delta_usd || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-brand" />
            Activations
          </DialogTitle>
          <DialogDescription>
            Mid-stint scope additions for {campaignName ?? 'this campaign'}. Each activation layers extra deliverables + budget onto the existing campaign — no new campaign row.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1 py-2 space-y-4">
          {/* Existing activations */}
          {existing.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wider text-ink-warm-500">Existing activations</Label>
                <span className="text-xs text-ink-warm-500">
                  {existing.length} · +${totalDelta.toLocaleString('en-US')}
                </span>
              </div>
              <div className="border border-cream-200 rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                      <TableHead className="py-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 w-[110px]">Effective</TableHead>
                      <TableHead className="py-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 w-[110px] text-right">Budget Δ</TableHead>
                      <TableHead className="py-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Deliverables</TableHead>
                      <TableHead className="py-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {existing.map(a => (
                      <TableRow key={a.id} className="border-cream-100">
                        <TableCell className="py-2 px-3 text-xs">{formatDate(a.effective_date)}</TableCell>
                        <TableCell className="py-2 px-3 text-xs text-right mono tabular-nums">
                          {a.budget_delta_usd > 0 ? '+' : ''}${Number(a.budget_delta_usd).toLocaleString('en-US')}
                        </TableCell>
                        <TableCell className="py-2 px-3">
                          <div className="flex flex-wrap gap-1">
                            {a.extra_deliverables.length === 0 && <span className="text-xs text-ink-warm-400 italic">—</span>}
                            {a.extra_deliverables.map((d, i) => (
                              <StatusBadge key={i} tone="neutral" size="sm">
                                {d.count ?? 1}× {d.platform ?? '?'} {d.type ?? ''}
                              </StatusBadge>
                            ))}
                          </div>
                          {a.notes && <p className="mt-1 text-[11px] text-ink-warm-500 italic">{a.notes}</p>}
                        </TableCell>
                        <TableCell className="py-2 px-3">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50" onClick={() => remove(a.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          {loading && <div className="text-xs text-ink-warm-500">Loading…</div>}

          {/* New activation form */}
          <div className="border border-brand/20 bg-brand/5 rounded-md p-3 space-y-3">
            <Label className="text-xs uppercase tracking-wider text-brand">Add activation</Label>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Effective date <RequiredAsterisk /></Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-9 w-full justify-start font-normal focus-brand">
                      <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                      {effectiveDate ? formatDate(effectiveDate.toISOString()) : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
                    <Calendar
                      mode="single"
                      selected={effectiveDate}
                      onSelect={setEffectiveDate}
                      classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                      modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Budget delta (USD)</Label>
                <Input
                  value={budgetDelta}
                  onChange={(e) => setBudgetDelta(e.target.value)}
                  placeholder="0"
                  className="h-9 focus-brand mono tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Extra deliverables</Label>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addDeliverableRow}>
                  <Plus className="h-3 w-3 mr-1" /> Add row
                </Button>
              </div>
              {deliverables.length === 0 ? (
                <p className="text-[11px] text-ink-warm-500 italic">No extra deliverables. Add a row to specify.</p>
              ) : (
                <div className="space-y-1.5">
                  {deliverables.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Select value={row.platform} onValueChange={(v) => updateDeliverable(i, { platform: v })}>
                        <SelectTrigger className="h-8 focus-brand w-[110px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={row.type} onValueChange={(v) => updateDeliverable(i, { type: v })}>
                        <SelectTrigger className="h-8 focus-brand w-[110px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DELIVERABLE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={1}
                        value={row.count}
                        onChange={(e) => updateDeliverable(i, { count: Number(e.target.value) || 1 })}
                        className="h-8 w-20 focus-brand text-xs"
                      />
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => removeDeliverable(i)}>
                        <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional: what triggered this scope addition"
                className="focus-brand text-sm"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Close</Button>
          <Button variant="brand" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Add Activation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
