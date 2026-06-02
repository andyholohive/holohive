'use client';

/**
 * MasterKolEditDialog — opens from the KOL Dashboard Table view's row
 * edit pencil. Updates the master_kols row that the campaign_kol
 * points at — same record the /kols page edits — so changes propagate
 * everywhere the KOL appears.
 *
 * Extracted from `app/campaigns/[id]/page.tsx` on 2026-06-02. Form
 * state + save handler live inside the component; the page only owns
 * `editingMasterKol` (which doubles as the open/null flag) so the
 * existing `openMasterKolEditDialog(kol)` callsite signature stays
 * unchanged.
 */

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { KOLService, type MasterKOL } from '@/lib/kolService';
import { useCampaignDetail } from '@/contexts/CampaignDetailContext';

/** Inline multi-select used by this dialog only. Lighter-weight than
 *  the project's general MultiSelect — sits inside a Dialog where the
 *  parent Popover/Dialog interactions need to be straightforward. */
function DialogMultiSelect({
  selected,
  options,
  onChange,
  placeholder = 'Select...',
}: {
  selected: string[];
  options: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-auto min-h-9 py-1.5"
        >
          <div className="flex flex-wrap gap-1 items-center text-left flex-1 min-w-0">
            {selected.length === 0 ? (
              <span className="text-ink-warm-400">{placeholder}</span>
            ) : (
              selected.map((s) => (
                <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-cream-100 text-ink-warm-700">
                  {s}
                </span>
              ))
            )}
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="max-h-64 overflow-auto py-1">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-ink-warm-400">No options</div>
          ) : (
            options.map((opt) => {
              const isSelected = selected.includes(opt);
              return (
                <label
                  key={opt}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-cream-50 cursor-pointer text-sm"
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => {
                      onChange(
                        isSelected
                          ? selected.filter((s) => s !== opt)
                          : [...selected, opt],
                      );
                    }}
                  />
                  <span>{opt}</span>
                </label>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface MasterKolEditDialogProps {
  /** When non-null, the dialog is open and pre-filled with this KOL's data. */
  kol: MasterKOL | null;
  /** Called to close the dialog (set kol to null). */
  onClose: () => void;
}

export function MasterKolEditDialog({ kol, onClose }: MasterKolEditDialogProps) {
  const { setCampaignKOLs, toast } = useCampaignDetail();
  const fieldOptions = KOLService.getFieldOptions();

  const [masterKolForm, setMasterKolForm] = useState<Partial<MasterKOL>>({});
  const [savingMasterKol, setSavingMasterKol] = useState(false);

  // Reset form whenever a new kol is passed in (i.e. dialog opens).
  useEffect(() => {
    if (kol) {
      setMasterKolForm({
        name: kol.name,
        link: kol.link,
        platform: kol.platform || [],
        followers: kol.followers,
        region: kol.region,
        community: kol.community ?? false,
        deliverables: kol.deliverables || [],
        creator_type: kol.creator_type || [],
        content_type: kol.content_type || [],
        niche: kol.niche || [],
        pricing: kol.pricing,
        in_house: kol.in_house,
        description: kol.description,
        wallet: kol.wallet,
      });
    } else {
      setMasterKolForm({});
    }
  }, [kol]);

  const handleSaveMasterKol = async () => {
    if (!kol) return;
    if (!masterKolForm.name?.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    setSavingMasterKol(true);
    try {
      const updated = await KOLService.updateKOL({
        id: kol.id,
        ...masterKolForm,
      } as any);
      // Mirror the change into local campaignKOLs so the table
      // reflects immediately without a full refetch.
      setCampaignKOLs(prev => prev.map(ck =>
        ck.master_kol.id === kol.id
          ? { ...ck, master_kol: { ...ck.master_kol, ...updated } }
          : ck,
      ));
      toast({ title: 'KOL updated', description: updated.name });
      onClose();
    } catch (err: any) {
      console.error('Error updating master KOL:', err);
      toast({ title: 'Save failed', description: err?.message || 'Failed to update KOL', variant: 'destructive' });
    } finally {
      setSavingMasterKol(false);
    }
  };

  return (
    <Dialog open={!!kol} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit KOL</DialogTitle>
            <DialogDescription>
              Update the master KOL info — changes apply everywhere this KOL is referenced.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-1 grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="mk-name">Name <RequiredAsterisk /></Label>
                <Input
                  id="mk-name"
                  value={masterKolForm.name || ''}
                  onChange={(e) => setMasterKolForm(f => ({ ...f, name: e.target.value }))}
                  className="focus-brand"
                />
              </div>

              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="mk-link">Profile Link</Label>
                <Input
                  id="mk-link"
                  value={masterKolForm.link || ''}
                  onChange={(e) => setMasterKolForm(f => ({ ...f, link: e.target.value || null }))}
                  placeholder="https://..."
                  className="focus-brand"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mk-followers">Followers</Label>
                <Input
                  id="mk-followers"
                  type="number"
                  value={masterKolForm.followers ?? ''}
                  onChange={(e) => setMasterKolForm(f => ({ ...f, followers: e.target.value ? Number(e.target.value) : null }))}
                  className="focus-brand"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mk-region">Region</Label>
                <Select
                  value={masterKolForm.region || ''}
                  onValueChange={(v) => setMasterKolForm(f => ({ ...f, region: v || null }))}
                >
                  <SelectTrigger id="mk-region" className="focus-brand">
                    <SelectValue placeholder="Select region" />
                  </SelectTrigger>
                  <SelectContent>
                    {(fieldOptions?.regions || []).map((r: string) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mk-pricing">Pricing</Label>
                <Select
                  value={masterKolForm.pricing || ''}
                  onValueChange={(v) => setMasterKolForm(f => ({ ...f, pricing: v || null }))}
                >
                  <SelectTrigger id="mk-pricing" className="focus-brand">
                    <SelectValue placeholder="Select pricing" />
                  </SelectTrigger>
                  <SelectContent>
                    {((fieldOptions as any)?.pricingTiers || []).map((p: string) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tier select removed — column dropped in migration 071.
                  Phase 3 will surface the auto-derived Score badge here. */}

              <div className="space-y-1.5 col-span-2">
                <Label>Platforms</Label>
                <DialogMultiSelect
                  selected={masterKolForm.platform || []}
                  options={fieldOptions?.platforms || []}
                  onChange={(next) => setMasterKolForm(f => ({ ...f, platform: next }))}
                  placeholder="Select platforms..."
                />
              </div>

              <div className="space-y-1.5 col-span-2">
                <Label>Niches</Label>
                <DialogMultiSelect
                  selected={masterKolForm.niche || []}
                  options={fieldOptions?.niches || []}
                  onChange={(next) => setMasterKolForm(f => ({ ...f, niche: next }))}
                  placeholder="Select niches..."
                />
              </div>

              <div className="space-y-1.5 col-span-2">
                <Label>Creator Type</Label>
                <DialogMultiSelect
                  selected={masterKolForm.creator_type || []}
                  options={fieldOptions?.creatorTypes || []}
                  onChange={(next) => setMasterKolForm(f => ({ ...f, creator_type: next }))}
                  placeholder="Select creator types..."
                />
              </div>

              <div className="space-y-1.5 col-span-2">
                <Label>Content Type</Label>
                <DialogMultiSelect
                  selected={masterKolForm.content_type || []}
                  options={fieldOptions?.contentTypes || []}
                  onChange={(next) => setMasterKolForm(f => ({ ...f, content_type: next }))}
                  placeholder="Select content types..."
                />
              </div>

              <div className="space-y-1.5 col-span-2">
                <Label>Deliverables</Label>
                <DialogMultiSelect
                  selected={masterKolForm.deliverables || []}
                  options={fieldOptions?.deliverables || []}
                  onChange={(next) => setMasterKolForm(f => ({ ...f, deliverables: next }))}
                  placeholder="Select deliverables..."
                />
              </div>

              {/* Rating input removed — column dropped in migration 071. */}

              <div className="space-y-1.5">
                <Label htmlFor="mk-in-house">In-House</Label>
                <Input
                  id="mk-in-house"
                  value={masterKolForm.in_house || ''}
                  onChange={(e) => setMasterKolForm(f => ({ ...f, in_house: e.target.value || null }))}
                  className="focus-brand"
                />
              </div>

              <div className="flex items-center gap-3 col-span-2 py-1">
                <Switch
                  checked={!!masterKolForm.community}
                  onCheckedChange={(v) => setMasterKolForm(f => ({ ...f, community: v }))}
                />
                <Label className="cursor-pointer">Community KOL</Label>
              </div>

              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="mk-wallet">Wallet</Label>
                <Input
                  id="mk-wallet"
                  value={masterKolForm.wallet || ''}
                  onChange={(e) => setMasterKolForm(f => ({ ...f, wallet: e.target.value || null }))}
                  className="focus-brand"
                />
              </div>

              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="mk-description">Description</Label>
                <Textarea
                  id="mk-description"
                  value={masterKolForm.description || ''}
                  onChange={(e) => setMasterKolForm(f => ({ ...f, description: e.target.value || null }))}
                  rows={3}
                  className="focus-brand"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="brand" onClick={handleSaveMasterKol} disabled={savingMasterKol}>
              {savingMasterKol ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
    </Dialog>
  );
}
