'use client';

/**
 * QualificationGrid — the 5-for-5 BANT+ checkboxes inside the
 * slide-over's view mode. Five binary flags (Budget / Decision Maker
 * / Timeline / Scope / Fit) with a `checkedCount / 5` chip in the
 * header that turns "Qualified" green at ≥3.
 *
 * Each checkbox toggle does an optimistic `applyOppPatch` followed
 * by a server `SalesPipelineService.update`; the patch is rolled back
 * if the server write fails.
 *
 * Extracted from `OpportunitySlideOver.tsx` 2026-06-03 (Pass 1 of the
 * slide-over slice).
 */

import { Checkbox } from '@/components/ui/checkbox';
import { useSalesPipeline } from '@/contexts/SalesPipelineContext';
import {
  SalesPipelineService,
  type SalesPipelineOpportunity,
} from '@/lib/salesPipelineService';

interface QualificationGridProps {
  opp: SalesPipelineOpportunity;
}

const QUALS = [
  { key: 'qual_budget',   label: 'Budget',         hint: 'Confirmed or directional' },
  { key: 'qual_dm',       label: 'Decision Maker', hint: 'Identified + engaged' },
  { key: 'qual_timeline', label: 'Timeline',       hint: 'Within ~90 days' },
  { key: 'qual_scope',    label: 'Scope',          hint: 'Knows what they want' },
  { key: 'qual_fit',      label: 'Fit',            hint: 'Right vertical/region/size' },
] as const;

export function QualificationGrid({ opp }: QualificationGridProps) {
  const { applyOppPatch } = useSalesPipeline();
  const checkedCount = QUALS.filter(q => (opp as any)[q.key]).length;
  const isQualified = checkedCount >= 3;

  return (
    <div className="border-t pt-6">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider">
          5-for-5 Qualification
        </h4>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isQualified ? 'bg-emerald-100 text-emerald-700' : 'bg-cream-100 text-ink-warm-700'}`}>
          {checkedCount}/5 {isQualified ? '· Qualified' : ''}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {QUALS.map(q => {
          const checked = !!(opp as any)[q.key];
          return (
            <label
              key={q.key}
              className={`flex items-start gap-2 p-2.5 rounded-md border cursor-pointer transition-colors ${checked ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-cream-200 hover:border-cream-300'}`}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={async (next) => {
                  const patch = { [q.key]: !!next };
                  applyOppPatch(opp.id, patch as Partial<SalesPipelineOpportunity>);
                  try {
                    await SalesPipelineService.update(opp.id, patch as any);
                  } catch (err) {
                    console.error('Error updating qual flag:', err);
                    applyOppPatch(opp.id, { [q.key]: checked } as Partial<SalesPipelineOpportunity>);
                  }
                }}
                className="mt-0.5"
              />
              <div className="min-w-0">
                <div className={`text-sm font-medium ${checked ? 'text-emerald-800' : 'text-ink-warm-700'}`}>{q.label}</div>
                <div className="text-[11px] text-ink-warm-500">{q.hint}</div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
