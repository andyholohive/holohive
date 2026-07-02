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
import { ChevronDown, RefreshCw } from 'lucide-react';
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
  // HHP Creator Taxonomy Spec — Creator Type capped at 2. Generic
  // prop so any other field needing a hard ceiling can opt in. Only
  // applies to assignment surfaces (this dialog), not filters.
  maxSelected,
}: {
  selected: string[];
  options: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  maxSelected?: number;
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
              // Cap-aware: when maxSelected is set and the user is at
              // the limit, new picks are blocked but deselections
              // stay allowed so the user can swap.
              const atCap = typeof maxSelected === 'number' && selected.length >= maxSelected;
              const disabled = atCap && !isSelected;
              return (
                <label
                  key={opt}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm ${
                    disabled
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-cream-50 cursor-pointer'
                  }`}
                  title={disabled ? `Max ${maxSelected} selected — deselect one to swap.` : undefined}
                >
                  <Checkbox
                    checked={isSelected}
                    disabled={disabled}
                    onCheckedChange={() => {
                      if (disabled) return;
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
  const [refreshingAvatar, setRefreshingAvatar] = useState(false);

  // Reset form whenever a new kol is passed in (i.e. dialog opens).
  useEffect(() => {
    if (kol) {
      setMasterKolForm({
        name: kol.name,
        link: kol.link,
        platform: kol.platform || [],
        followers: kol.followers,
        region: kol.region,
        community_founder: kol.community_founder ?? false,
        deliverables: kol.deliverables || [],
        creator_types: kol.creator_types || [],
        content_type: kol.content_type || [],
        niche_tags: kol.niche_tags || [],
        post_price: kol.post_price ?? null,
        share_price: kol.share_price ?? null,
        pricing_notes: kol.pricing_notes ?? null,
        in_house: kol.in_house,
        notes: kol.notes,
        wallet: kol.wallet,
        profile_picture_url: kol.profile_picture_url,
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
            {/* ─── Avatar + Refresh ─────────────────────────────────────
                Per KOL-AVATAR.4. Tries Telegram first (durable storage URL),
                falls through to X via unavatar.io. The cache-busted ?t=...
                suffix on the URL forces the browser to show the new pic
                immediately after refresh. */}
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-full overflow-hidden bg-cream-100 border border-cream-200 flex items-center justify-center text-ink-warm-400 text-xs">
                {masterKolForm.profile_picture_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={masterKolForm.profile_picture_url}
                    alt={masterKolForm.name || 'KOL avatar'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  'No pic'
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!kol || refreshingAvatar}
                onClick={async () => {
                  if (!kol) return;
                  setRefreshingAvatar(true);
                  try {
                    const res = await fetch(`/api/kols/${kol.id}/refresh-avatar`, {
                      method: 'POST',
                    });
                    const json = await res.json();
                    if (json?.ok && json?.url) {
                      setMasterKolForm(f => ({ ...f, profile_picture_url: json.url }));
                      toast({
                        title: 'Avatar refreshed',
                        description: `Source: ${json.source}`,
                      });
                    } else {
                      toast({
                        title: 'Could not refresh',
                        description: json?.error || 'Unknown error',
                        variant: 'destructive',
                      });
                    }
                  } catch (err: any) {
                    toast({
                      title: 'Refresh failed',
                      description: err?.message || 'Network error',
                      variant: 'destructive',
                    });
                  } finally {
                    setRefreshingAvatar(false);
                  }
                }}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshingAvatar ? 'animate-spin' : ''}`} />
                {refreshingAvatar ? 'Refreshing...' : 'Refresh avatar'}
              </Button>
            </div>

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
                <Label htmlFor="mk-post-price">Post Price ($) <RequiredAsterisk /></Label>
                <Input
                  id="mk-post-price"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={masterKolForm.post_price ?? ''}
                  onChange={(e) => setMasterKolForm(f => ({
                    ...f,
                    post_price: e.target.value === '' ? null : Number(e.target.value),
                  }))}
                  placeholder="e.g. 1250"
                  className="focus-brand"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mk-share-price">Share Price ($)</Label>
                <Input
                  id="mk-share-price"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={masterKolForm.share_price ?? ''}
                  onChange={(e) => setMasterKolForm(f => ({
                    ...f,
                    share_price: e.target.value === '' ? null : Number(e.target.value),
                  }))}
                  placeholder="Optional"
                  className="focus-brand"
                />
              </div>

              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="mk-pricing-notes">Pricing Notes</Label>
                <Input
                  id="mk-pricing-notes"
                  value={masterKolForm.pricing_notes || ''}
                  onChange={(e) => setMasterKolForm(f => ({ ...f, pricing_notes: e.target.value || null }))}
                  placeholder="Free-text carry-over (barter, revshare, etc.)"
                  className="focus-brand"
                />
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
                <Label>Niche Tags</Label>
                <DialogMultiSelect
                  selected={masterKolForm.niche_tags || []}
                  options={fieldOptions?.niches || []}
                  onChange={(next) => setMasterKolForm(f => ({ ...f, niche_tags: next }))}
                  placeholder="Select niche tags..."
                />
              </div>

              <div className="space-y-1.5 col-span-2">
                <Label>Creator Types <span className="text-xs font-normal text-ink-warm-400">· max 2</span></Label>
                <DialogMultiSelect
                  selected={masterKolForm.creator_types || []}
                  options={fieldOptions?.creatorTypes || []}
                  onChange={(next) => setMasterKolForm(f => ({ ...f, creator_types: next }))}
                  placeholder="Select creator types..."
                  // HHP Creator Taxonomy Spec — max 2.
                  maxSelected={2}
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
                  checked={!!masterKolForm.community_founder}
                  onCheckedChange={(v) => setMasterKolForm(f => ({ ...f, community_founder: v }))}
                />
                <Label className="cursor-pointer">Community Founder</Label>
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
                <Label htmlFor="mk-notes">Notes</Label>
                <Textarea
                  id="mk-notes"
                  value={masterKolForm.notes || ''}
                  onChange={(e) => setMasterKolForm(f => ({ ...f, notes: e.target.value || null }))}
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
