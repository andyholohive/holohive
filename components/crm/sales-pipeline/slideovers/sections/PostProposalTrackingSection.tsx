'use client';

/**
 * PostProposalTrackingSection — inline-edit grid for the post-proposal
 * stages: when the proposal went out, expected close date, decision
 * maker name/role, next action date, proposal doc URL, and a free-text
 * "next action / notes" textarea.
 *
 * Renders when `proposal_sent_at` is set OR the stage is one of
 * `proposal_sent` / `proposal_call` / `v2_contract`.
 *
 * Extracted from `OpportunitySlideOver.tsx` 2026-06-03 (Pass 1 of the
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
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { useSalesPipeline } from '@/contexts/SalesPipelineContext';
import {
  SalesPipelineService,
  type SalesPipelineOpportunity,
} from '@/lib/salesPipelineService';

interface PostProposalTrackingSectionProps {
  opp: SalesPipelineOpportunity;
}

export function PostProposalTrackingSection({ opp }: PostProposalTrackingSectionProps) {
  const { applyOppPatch } = useSalesPipeline();
  const shouldShow = !!opp.proposal_sent_at || ['proposal_sent', 'proposal_call', 'v2_contract'].includes(opp.stage);
  if (!shouldShow) return null;

  return (
    <div className="border-t pt-6">
      <h4 className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider mb-3">
        Post-Proposal Tracking
      </h4>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <Label className="text-xs text-ink-warm-500">Proposal sent</Label>
          <p className="font-medium mt-0.5">
            {opp.proposal_sent_at ? (
              <>
                {format(new Date(opp.proposal_sent_at), 'MMM d, yyyy')}
                <span className="text-xs text-ink-warm-400 ml-1">
                  ({differenceInDays(new Date(), new Date(opp.proposal_sent_at))}d ago)
                </span>
              </>
            ) : (
              <span className="text-ink-warm-400">—</span>
            )}
          </p>
        </div>
        <div>
          <Label className="text-xs text-ink-warm-500">Expected close</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={`focus-brand justify-start text-left font-normal w-full h-7 text-sm bg-white border-cream-200 ${opp.expected_close_date ? 'text-ink-warm-900' : 'text-ink-warm-400'}`}
              >
                <Calendar className="mr-2 h-3.5 w-3.5" />
                {opp.expected_close_date
                  ? format(new Date(opp.expected_close_date + 'T00:00:00'), 'MMM d, yyyy')
                  : 'Select date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
              <CalendarPicker
                mode="single"
                selected={opp.expected_close_date ? new Date(opp.expected_close_date + 'T00:00:00') : undefined}
                onSelect={async (date) => {
                  const v = date
                    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                    : null;
                  applyOppPatch(opp.id, { expected_close_date: v } as Partial<SalesPipelineOpportunity>);
                  try { await SalesPipelineService.update(opp.id, { expected_close_date: v } as any); }
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
          <Label className="text-xs text-ink-warm-500">Decision maker</Label>
          <Input
            key={`dm-name-${opp.id}`}
            defaultValue={opp.decision_maker_name || ''}
            placeholder="Name"
            onBlur={async (e) => {
              const v = e.target.value.trim() || null;
              if (v === opp.decision_maker_name) return;
              applyOppPatch(opp.id, { decision_maker_name: v } as Partial<SalesPipelineOpportunity>);
              try { await SalesPipelineService.update(opp.id, { decision_maker_name: v } as any); }
              catch (err) { console.error(err); }
            }}
            className="h-7 text-sm focus-brand"
          />
        </div>
        <div>
          <Label className="text-xs text-ink-warm-500">DM role</Label>
          <Input
            key={`dm-role-${opp.id}`}
            defaultValue={opp.decision_maker_role || ''}
            placeholder="e.g. Head of Marketing"
            onBlur={async (e) => {
              const v = e.target.value.trim() || null;
              if (v === opp.decision_maker_role) return;
              applyOppPatch(opp.id, { decision_maker_role: v } as Partial<SalesPipelineOpportunity>);
              try { await SalesPipelineService.update(opp.id, { decision_maker_role: v } as any); }
              catch (err) { console.error(err); }
            }}
            className="h-7 text-sm focus-brand"
          />
        </div>
        <div>
          <Label className="text-xs text-ink-warm-500">Next action date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={`focus-brand justify-start text-left font-normal w-full h-7 text-sm bg-white border-cream-200 ${opp.next_action_at ? 'text-ink-warm-900' : 'text-ink-warm-400'}`}
              >
                <Calendar className="mr-2 h-3.5 w-3.5" />
                {opp.next_action_at
                  ? format(new Date(opp.next_action_at + 'T00:00:00'), 'MMM d, yyyy')
                  : 'Select date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
              <CalendarPicker
                mode="single"
                selected={opp.next_action_at ? new Date(opp.next_action_at + 'T00:00:00') : undefined}
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
          <Label className="text-xs text-ink-warm-500">Proposal doc URL</Label>
          <Input
            key={`proposal-url-${opp.id}`}
            defaultValue={opp.proposal_doc_url || ''}
            placeholder="https://..."
            onBlur={async (e) => {
              const v = e.target.value.trim() || null;
              if (v === opp.proposal_doc_url) return;
              applyOppPatch(opp.id, { proposal_doc_url: v } as Partial<SalesPipelineOpportunity>);
              try { await SalesPipelineService.update(opp.id, { proposal_doc_url: v } as any); }
              catch (err) { console.error(err); }
            }}
            className="h-7 text-sm focus-brand"
          />
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-ink-warm-500">Next action / notes</Label>
          <Textarea
            key={`pp-notes-${opp.id}`}
            defaultValue={opp.next_action_notes || ''}
            placeholder="What are we waiting on? What's the next step?"
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
