'use client';

/**
 * CreateEditOpportunityDialog — the new-opportunity + edit-opportunity
 * Form dialog. The same form is reused inside the slide-over when
 * `slideOverMode === 'edit'`, so this dialog suppresses its own open
 * state in that case (the slide-over takes over visually).
 *
 * Form fields:
 *   - Name (required), Stage (create only — edit happens via DnD)
 *   - POC Platform + POC Handle/ID
 *   - Project Twitter (powers the row-hover "+" affordance)
 *   - Owner + Co-Owners (chip-add row)
 *   - Source (pill row; "referral" reveals a Referrer field;
 *     anything other than "cold_outreach" reveals the Affiliate
 *     combobox with inline-create-on-empty)
 *   - Notes
 *   - Details (hidden by `details.hidden`, kept for parity with the
 *     pre-extraction shape — historical edit-only fields like Path /
 *     Bucket / TG Handle / Deal Value / Currency / Temperature)
 *   - Edit-only Copy Booking Link strip
 *
 * Extracted from `app/crm/sales-pipeline/page.tsx` (was
 * `renderFormDialog`, ~379 LOC) on 2026-06-02 as part of Phase 3 of
 * the structural split. The page still owns `handleCreate` /
 * `handleUpdate` because they coordinate side-effects (stage
 * transitions, optimistic local updates, post-create slide-over
 * open, etc.) that need access to many page-level pieces.
 *
 * Inline-creating an affiliate calls `CRMService.createAffiliate`
 * directly here and pushes the result into the affiliates list via
 * `setAffiliates` from context. This keeps the dialog self-contained
 * for that one async write.
 *
 * v11 note: gray-* tokens preserved during the structural split.
 * The v11 pass will reconsider the "Source" pill row + the inline
 * date-picker chrome.
 */

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Calendar,
  Check,
  ChevronRight,
  ChevronsUpDown,
  Plus,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSalesPipeline } from '@/contexts/SalesPipelineContext';
import { CRMService } from '@/lib/crmService';
import {
  ALL_V2_STAGES,
  STAGE_LABELS,
  POC_PLATFORMS,
  type SalesPipelineStage,
  type PocPlatform,
  type Bucket,
  type DmAccount,
} from '@/lib/salesPipelineService';

export function CreateEditOpportunityDialog() {
  const { user } = useAuth();
  const {
    isCreateOpen,
    setIsCreateOpen,
    editingOpp,
    setEditingOpp,
    slideOverMode,
    form,
    setForm,
    handleCreate,
    handleUpdate,
    isSubmitting,
    activeUsers,
    users,
    affiliates,
    setAffiliates,
    affiliatePopoverOpen,
    setAffiliatePopoverOpen,
    affiliateSearch,
    setAffiliateSearch,
    bookingUserId,
    setBookingUserId,
    copyBookingLink,
  } = useSalesPipeline();

  const isEdit = !!editingOpp;
  // Only open as dialog for create, or edit when NOT in slide-over edit mode.
  const isOpen = isCreateOpen || (!!editingOpp && slideOverMode !== 'edit');

  return (
    <Dialog open={isOpen} onOpenChange={open => {
      if (!open) { setIsCreateOpen(false); setEditingOpp(null); setForm({ name: '' }); }
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Opportunity' : 'New Opportunity'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update opportunity details.' : 'Add a new opportunity to the sales pipeline.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={e => { e.preventDefault(); isEdit ? handleUpdate() : handleCreate(); }}>
          <div className="grid gap-4 py-4">
            {/* Basic Info */}
            <div className="grid gap-2">
              <Label>Name <RequiredAsterisk /></Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Company or contact name"
                className="focus-brand"
              />
            </div>

            {!isEdit && (
              <div className="grid gap-2">
                <Label>Stage</Label>
                <Select value={form.stage || 'cold_dm'} onValueChange={v => setForm(f => ({ ...f, stage: v as SalesPipelineStage }))}>
                  <SelectTrigger className="focus-brand"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALL_V2_STAGES.filter(s => s !== 'proposal_sent').map(s => (
                      <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>POC Platform</Label>
                <Select value={form.poc_platform || ''} onValueChange={v => setForm(f => ({ ...f, poc_platform: v as PocPlatform }))}>
                  <SelectTrigger className="focus-brand"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {POC_PLATFORMS.map(p => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>POC Handle / ID</Label>
                <Input
                  value={form.poc_handle || ''}
                  onChange={e => setForm(f => ({ ...f, poc_handle: e.target.value }))}
                  placeholder="@handle or ID"
                  className="focus-brand"
                />
              </div>
            </div>

            {/* Project Twitter — the project-level X/Twitter URL or
                handle. Populated here so the Twitter "+" affordance
                on the row hover (renderProjectNameSuffix) becomes a
                resolved link. */}
            <div className="grid gap-2">
              <Label>Project Twitter</Label>
              <Input
                value={form.twitter_handle || ''}
                onChange={e => setForm(f => ({ ...f, twitter_handle: e.target.value }))}
                placeholder="@handle or https://x.com/handle"
                className="focus-brand"
              />
            </div>
            <div className="grid gap-2">
              <Label>Owner</Label>
              <Select
                value={form.owner_id || ''}
                onValueChange={v => setForm(f => ({ ...f, owner_id: v }))}
              >
                <SelectTrigger className="focus-brand"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {activeUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Co-Owners</Label>
              <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 border rounded-md bg-white">
                {(form.co_owner_ids || []).map(id => {
                  const u = users.find(u => u.id === id);
                  return (
                    <span key={id} className="inline-flex items-center gap-1 bg-brand/10 text-brand text-xs px-2 py-0.5 rounded-full">
                      {u?.name || u?.email || id}
                      <button type="button" onClick={() => setForm(f => ({ ...f, co_owner_ids: (f.co_owner_ids || []).filter(i => i !== id) }))} className="ml-0.5">&times;</button>
                    </span>
                  );
                })}
                <Select value="" onValueChange={v => { if (v && !(form.co_owner_ids || []).includes(v) && v !== form.owner_id) setForm(f => ({ ...f, co_owner_ids: [...(f.co_owner_ids || []), v] })); }}>
                  <SelectTrigger className="border-none shadow-none bg-transparent h-6 w-auto px-1 text-xs text-ink-warm-400 focus:ring-0"><SelectValue placeholder="+ Add" /></SelectTrigger>
                  <SelectContent>
                    {activeUsers.filter(u => u.id !== form.owner_id && !(form.co_owner_ids || []).includes(u.id)).map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Source</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'cold_outreach', label: 'Cold Outreach' },
                  { value: 'referral', label: 'Referral' },
                  { value: 'inbound', label: 'Inbound' },
                  { value: 'event', label: 'Event' },
                  { value: 'twitter', label: 'Twitter' },
                  { value: 'linkedin', label: 'LinkedIn' },
                  { value: 'telegram', label: 'Telegram' },
                  { value: 'website', label: 'Website' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, source: f.source === opt.value ? undefined : opt.value }))}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                      form.source === opt.value
                        ? 'bg-brand text-white border-transparent'
                        : 'text-ink-warm-700 border-cream-200 hover:bg-cream-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {form.source === 'referral' && (
              <div className="grid gap-2">
                <Label>Referrer</Label>
                <Input
                  value={form.referrer || ''}
                  onChange={e => setForm(f => ({ ...f, referrer: e.target.value }))}
                  placeholder="Who referred?"
                  className="focus-brand"
                />
              </div>
            )}

            {form.source !== 'cold_outreach' && (
              <div className="grid gap-2">
                <Label>Affiliate</Label>
                <Popover open={affiliatePopoverOpen} onOpenChange={setAffiliatePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal focus-brand"
                    >
                      {form.affiliate_id
                        ? affiliates.find(a => a.id === form.affiliate_id)?.name || 'Select affiliate...'
                        : 'Select affiliate...'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[350px] p-0">
                    <Command>
                      <CommandInput
                        placeholder="Search or type new affiliate..."
                        value={affiliateSearch}
                        onValueChange={setAffiliateSearch}
                      />
                      <CommandList>
                        <CommandEmpty>
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-cream-50 flex items-center gap-2"
                            onClick={async () => {
                              if (!affiliateSearch.trim()) return;
                              try {
                                const created = await CRMService.createAffiliate({
                                  name: affiliateSearch.trim(),
                                  owner_id: user?.id,
                                });
                                setAffiliates(prev => [...prev, created]);
                                setForm(f => ({ ...f, affiliate_id: created.id }));
                                setAffiliateSearch('');
                                setAffiliatePopoverOpen(false);
                              } catch (err) {
                                console.error('Error creating affiliate:', err);
                              }
                            }}
                          >
                            <Plus className="h-4 w-4 text-brand" />
                            <span>Add "<strong>{affiliateSearch}</strong>" as new affiliate</span>
                          </button>
                        </CommandEmpty>
                        <CommandGroup>
                          {affiliates.map(a => (
                            <CommandItem
                              key={a.id}
                              value={a.name}
                              onSelect={() => {
                                setForm(f => ({ ...f, affiliate_id: f.affiliate_id === a.id ? undefined : a.id }));
                                setAffiliateSearch('');
                                setAffiliatePopoverOpen(false);
                              }}
                            >
                              <Check className={`mr-2 h-4 w-4 ${form.affiliate_id === a.id ? 'opacity-100' : 'opacity-0'}`} />
                              {a.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes || ''}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Additional notes..."
                className="focus-brand"
                rows={3}
              />
            </div>

            {/* Details Section — hidden for now */}
            {isEdit && <details className="group hidden">
              <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-ink-warm-700 select-none">
                <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                Details
              </summary>
              <div className="grid gap-4 mt-3 pl-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Path</Label>
                    <Select
                      value={form.dm_account || 'sdr'}
                      onValueChange={v => setForm(f => ({ ...f, dm_account: v as DmAccount }))}
                    >
                      <SelectTrigger className="focus-brand"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="closer">Closer (Path A)</SelectItem>
                        <SelectItem value="sdr">SDR (Path B)</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Bucket</Label>
                    <Select
                      value={form.bucket || ''}
                      onValueChange={v => setForm(f => ({ ...f, bucket: v as Bucket }))}
                    >
                      <SelectTrigger className="focus-brand"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A">A - High Priority</SelectItem>
                        <SelectItem value="B">B - Medium</SelectItem>
                        <SelectItem value="C">C - Low Priority</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>TG Handle</Label>
                  <Input
                    value={form.tg_handle || ''}
                    onChange={e => setForm(f => ({ ...f, tg_handle: e.target.value }))}
                    placeholder="@handle"
                    className="focus-brand"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Deal Value</Label>
                    <Input
                      type="number"
                      value={form.deal_value || ''}
                      onChange={e => setForm(f => ({ ...f, deal_value: e.target.value ? parseFloat(e.target.value) : undefined }))}
                      placeholder="0"
                      className="focus-brand"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Currency</Label>
                    <Select
                      value={form.currency || 'USD'}
                      onValueChange={v => setForm(f => ({ ...f, currency: v }))}
                    >
                      <SelectTrigger className="focus-brand"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="USDT">USDT</SelectItem>
                        <SelectItem value="USDC">USDC</SelectItem>
                        <SelectItem value="ETH">ETH</SelectItem>
                        <SelectItem value="BTC">BTC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {isEdit && (
                  <div className="grid gap-2">
                    <Label>Temperature Score: {form.temperature_score || 50} (Manual Override)</Label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={form.temperature_score || 50}
                      onChange={e => setForm(f => ({ ...f, temperature_score: parseInt(e.target.value) }))}
                      className="w-full accent-brand"
                    />
                  </div>
                )}
              </div>
            </details>}
          </div>

          {/* Copy Booking Link - only in edit mode */}
          {isEdit && editingOpp && (
            <div className="border-t pt-3 mb-1">
              <div className="flex items-center gap-2">
                <Select
                  value={bookingUserId[`edit-${editingOpp.id}`] || editingOpp.owner_id || ''}
                  onValueChange={v => setBookingUserId(prev => ({ ...prev, [`edit-${editingOpp.id}`]: v }))}
                >
                  <SelectTrigger className="h-8 text-sm flex-1">
                    <SelectValue placeholder="Team member" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeUsers.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-sm whitespace-nowrap"
                  onClick={() => copyBookingLink(bookingUserId[`edit-${editingOpp.id}`] || editingOpp.owner_id || '', editingOpp.id)}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Copy Booking Link
                </Button>
              </div>
            </div>
          )}

          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button type="button" variant="outline" onClick={() => { setIsCreateOpen(false); setEditingOpp(null); setForm({ name: '' }); }}>
              Cancel
            </Button>
            <Button variant="brand" type="submit" disabled={isSubmitting || !form.name.trim()}>
              {isSubmitting ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
