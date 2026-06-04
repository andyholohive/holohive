'use client';

/**
 * OrbitTrackingSection — the inline-edit section for orbit-stage
 * opportunities: next check-in date, reason, time-in-orbit + last-
 * contacted readouts, and a "what to watch for" textarea.
 *
 * Reuses `next_action_at` + `next_action_notes` columns (an opp can't
 * be both orbit AND post-proposal, so the columns serve double duty
 * without conflict).
 *
 * Extracted from `OpportunitySlideOver.tsx` 2026-06-03 (Pass 1 of the
 * slide-over slice).
 */

import { Button } from '@/components/ui/button';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Calendar, RotateCcw } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useSalesPipeline } from '@/contexts/SalesPipelineContext';
import {
  ORBIT_REASONS,
  SalesPipelineService,
  type SalesPipelineOpportunity,
} from '@/lib/salesPipelineService';

interface OrbitTrackingSectionProps {
  opp: SalesPipelineOpportunity;
}

export function OrbitTrackingSection({ opp }: OrbitTrackingSectionProps) {
  const { applyOppPatch } = useSalesPipeline();
  if (opp.stage !== 'orbit') return null;

  const checkinDate = opp.next_action_at ? new Date(opp.next_action_at + 'T00:00:00') : null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isOverdue = !!checkinDate && checkinDate < today;
  const isToday = !!checkinDate && checkinDate.getTime() === today.getTime();

  return (
    <div className="border-t pt-6">
      <h4 className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider mb-3 flex items-center gap-2">
        <RotateCcw className="h-3.5 w-3.5 text-orange-600" />
        Orbit Tracking
      </h4>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <Label className="text-xs text-ink-warm-500">Next check-in</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={`focus-brand justify-start text-left font-normal w-full h-7 text-sm ${
                  isOverdue
                    ? 'bg-rose-50 border-rose-200 text-rose-700'
                    : `bg-white border-cream-200 ${opp.next_action_at ? 'text-ink-warm-900' : 'text-ink-warm-400'}`
                }`}
              >
                <Calendar className="mr-2 h-3.5 w-3.5" />
                {opp.next_action_at
                  ? `${format(checkinDate!, 'MMM d, yyyy')}${isOverdue ? ' · overdue' : isToday ? ' · today' : ''}`
                  : 'Select date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
              <CalendarPicker
                mode="single"
                selected={checkinDate || undefined}
                onSelect={async (date) => {
                  const v = date
                    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                    : null;
                  applyOppPatch(opp.id, { next_action_at: v } as Partial<SalesPipelineOpportunity>);
                  try { await SalesPipelineService.update(opp.id, { next_action_at: v } as any); }
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
          <Label className="text-xs text-ink-warm-500">Reason</Label>
          <Select
            value={opp.orbit_reason || ''}
            onValueChange={async (v) => {
              const nextVal = v || null;
              if (nextVal === (opp.orbit_reason || null)) return;
              applyOppPatch(opp.id, { orbit_reason: nextVal } as Partial<SalesPipelineOpportunity>);
              try { await SalesPipelineService.update(opp.id, { orbit_reason: nextVal } as any); }
              catch (err) { console.error(err); }
            }}
          >
            <SelectTrigger className="h-7 text-sm focus-brand"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {ORBIT_REASONS.map(r => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-ink-warm-500">Time in orbit</Label>
          <p className="font-medium mt-1.5 text-sm">
            {opp.bucket_changed_at || opp.updated_at
              ? formatDistanceToNow(new Date(opp.bucket_changed_at || opp.updated_at))
              : <span className="text-ink-warm-400">—</span>}
          </p>
        </div>
        <div>
          <Label className="text-xs text-ink-warm-500">Last contacted</Label>
          <p className="font-medium mt-1.5 text-sm">
            {opp.last_contacted_at
              ? formatDistanceToNow(new Date(opp.last_contacted_at), { addSuffix: true })
              : <span className="text-ink-warm-400">—</span>}
          </p>
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-ink-warm-500">What to watch for</Label>
          <Textarea
            key={`orbit-watch-${opp.id}`}
            defaultValue={opp.next_action_notes || ''}
            placeholder="e.g. Watching for Korea expansion announcement, Series A raise, or exchange listing — message them when any of these hit."
            onBlur={async (e) => {
              const v = e.target.value.trim() || null;
              if (v === opp.next_action_notes) return;
              applyOppPatch(opp.id, { next_action_notes: v } as Partial<SalesPipelineOpportunity>);
              try { await SalesPipelineService.update(opp.id, { next_action_notes: v } as any); }
              catch (err) { console.error(err); }
            }}
            rows={2}
            className="text-sm focus-brand"
          />
        </div>
      </div>
    </div>
  );
}
