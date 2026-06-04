'use client';

/**
 * DealSection — high-traffic state fields (deal value, currency, next
 * meeting date/time, meeting type) that used to live in the Edit form
 * but were moved into inline-edit-on-blur on 2026-05-14 so reps can
 * update them without opening the modal.
 *
 * Pattern: every Input/Textarea is uncontrolled (`defaultValue` +
 * `key={opp.id}`) so parent re-renders from `applyOppPatch` don't
 * reset the DOM value mid-type. The `key` remounts the input when
 * the user switches to a different opp so the new starting value
 * picks up cleanly.
 *
 * Extracted from `OpportunitySlideOver.tsx` 2026-06-03 (Pass 2 of the
 * slide-over slice).
 */

import { Button } from '@/components/ui/button';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { useSalesPipeline } from '@/contexts/SalesPipelineContext';
import {
  SalesPipelineService,
  type SalesPipelineOpportunity,
} from '@/lib/salesPipelineService';

interface DealSectionProps {
  opp: SalesPipelineOpportunity;
}

export function DealSection({ opp }: DealSectionProps) {
  const { applyOppPatch } = useSalesPipeline();

  return (
    <div className="border-t pt-6">
      <h4 className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider mb-3">Deal</h4>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <Label className="text-xs text-ink-warm-500">Deal value</Label>
          <Input
            key={`deal-value-${opp.id}`}
            type="number"
            defaultValue={opp.deal_value ?? ''}
            placeholder="0"
            onBlur={async (e) => {
              const raw = e.target.value.trim();
              const v = raw === '' ? null : parseFloat(raw);
              if (v === opp.deal_value) return;
              if (v !== null && Number.isNaN(v)) return;
              applyOppPatch(opp.id, { deal_value: v } as Partial<SalesPipelineOpportunity>);
              try { await SalesPipelineService.update(opp.id, { deal_value: v } as any); }
              catch (err) { console.error(err); }
            }}
            className="h-7 text-sm focus-brand"
          />
        </div>
        <div>
          <Label className="text-xs text-ink-warm-500">Currency</Label>
          <Select
            value={opp.currency || 'USD'}
            onValueChange={async (v) => {
              if (v === (opp.currency || 'USD')) return;
              applyOppPatch(opp.id, { currency: v } as Partial<SalesPipelineOpportunity>);
              try { await SalesPipelineService.update(opp.id, { currency: v } as any); }
              catch (err) { console.error(err); }
            }}
          >
            <SelectTrigger className="h-7 text-sm focus-brand"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="USDT">USDT</SelectItem>
              <SelectItem value="USDC">USDC</SelectItem>
              <SelectItem value="ETH">ETH</SelectItem>
              <SelectItem value="BTC">BTC</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-ink-warm-500">Next meeting</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={`focus-brand justify-start text-left font-normal w-full h-7 text-sm bg-white border-cream-200 ${opp.next_meeting_at ? 'text-ink-warm-900' : 'text-ink-warm-400'}`}
              >
                <Calendar className="mr-2 h-3.5 w-3.5" />
                {opp.next_meeting_at
                  ? format(new Date(opp.next_meeting_at), 'MMM d, yyyy')
                  : 'Select date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
              <CalendarPicker
                mode="single"
                selected={opp.next_meeting_at ? new Date(opp.next_meeting_at) : undefined}
                onSelect={async (date) => {
                  let iso: string | null = null;
                  if (date) {
                    const existing = opp.next_meeting_at ? new Date(opp.next_meeting_at) : new Date();
                    date.setHours(existing.getHours(), existing.getMinutes(), 0, 0);
                    iso = date.toISOString();
                  }
                  applyOppPatch(opp.id, { next_meeting_at: iso } as Partial<SalesPipelineOpportunity>);
                  try { await SalesPipelineService.update(opp.id, { next_meeting_at: iso } as any); }
                  catch (err) { console.error(err); }
                }}
                initialFocus
                classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <Label className="text-xs text-ink-warm-500">Meeting time</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={`focus-brand justify-start text-left font-normal w-full h-7 text-sm bg-white border-cream-200 ${opp.next_meeting_at ? 'text-ink-warm-900' : 'text-ink-warm-400'}`}
                disabled={!opp.next_meeting_at}
              >
                <Clock className="mr-2 h-3.5 w-3.5" />
                {opp.next_meeting_at ? format(new Date(opp.next_meeting_at), 'h:mm a') : '—'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
              <div className="flex gap-0 divide-x">
                <ScrollArea className="h-[200px] w-[70px]">
                  <div className="p-1">
                    {Array.from({ length: 24 }, (_, h) => {
                      const label = `${h === 0 ? 12 : h > 12 ? h - 12 : h} ${h >= 12 ? 'PM' : 'AM'}`;
                      const isSelected = opp.next_meeting_at && new Date(opp.next_meeting_at).getHours() === h;
                      return (
                        <Button
                          key={h}
                          variant={isSelected ? 'brand' : 'ghost'}
                          className="w-full justify-center font-normal text-xs h-7 px-1"
                          onClick={async () => {
                            const d = opp.next_meeting_at ? new Date(opp.next_meeting_at) : new Date();
                            d.setHours(h, d.getMinutes(), 0, 0);
                            const iso = d.toISOString();
                            applyOppPatch(opp.id, { next_meeting_at: iso } as Partial<SalesPipelineOpportunity>);
                            try { await SalesPipelineService.update(opp.id, { next_meeting_at: iso } as any); }
                            catch (err) { console.error(err); }
                          }}
                        >
                          {label}
                        </Button>
                      );
                    })}
                  </div>
                </ScrollArea>
                <ScrollArea className="h-[200px] w-[50px]">
                  <div className="p-1">
                    {Array.from({ length: 60 }, (_, m) => {
                      const isSelected = opp.next_meeting_at && new Date(opp.next_meeting_at).getMinutes() === m;
                      return (
                        <Button
                          key={m}
                          variant={isSelected ? 'brand' : 'ghost'}
                          className="w-full justify-center font-normal text-xs h-7 px-1"
                          onClick={async () => {
                            const d = opp.next_meeting_at ? new Date(opp.next_meeting_at) : new Date();
                            d.setMinutes(m, 0, 0);
                            const iso = d.toISOString();
                            applyOppPatch(opp.id, { next_meeting_at: iso } as Partial<SalesPipelineOpportunity>);
                            try { await SalesPipelineService.update(opp.id, { next_meeting_at: iso } as any); }
                            catch (err) { console.error(err); }
                          }}
                        >
                          {String(m).padStart(2, '0')}
                        </Button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-ink-warm-500">Meeting type</Label>
          <Select
            value={(opp as any).next_meeting_type || ''}
            onValueChange={async (v) => {
              const nextVal = v || null;
              if (nextVal === ((opp as any).next_meeting_type || null)) return;
              applyOppPatch(opp.id, { next_meeting_type: nextVal } as Partial<SalesPipelineOpportunity>);
              try { await SalesPipelineService.update(opp.id, { next_meeting_type: nextVal } as any); }
              catch (err) { console.error(err); }
            }}
          >
            <SelectTrigger className="h-7 text-sm focus-brand"><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="discovery">Discovery Call</SelectItem>
              <SelectItem value="proposal">Proposal Call</SelectItem>
              <SelectItem value="follow_up">Follow Up</SelectItem>
              <SelectItem value="closing">Closing Call</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
