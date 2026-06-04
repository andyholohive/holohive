/**
 * salesPipelineHelpers — pure helpers + constants shared between the
 * sales-pipeline page and the extracted child components.
 *
 * Extracted from `app/crm/sales-pipeline/page.tsx` on 2026-06-02 as
 * part of the Phase 1 structural split. These were previously inlined
 * as `useMemo`/local helpers on the page; moving them out lets the
 * forecastKpis memo in the page AND the ForecastPanel / MetricsPanel
 * / kanban / table components import the same definitions without
 * prop drilling.
 *
 * **Pure functions only** — no React, no state, no async. If you
 * find yourself wanting to add a hook here, it belongs back in the
 * page or in `contexts/SalesPipelineContext.tsx`.
 */

import { differenceInDays } from 'date-fns';
import type { SalesPipelineOpportunity, SalesPipelineStage } from '@/lib/salesPipelineService';

/**
 * Stage-weighted win probabilities used by the **Forecast** view
 * (`forecastKpis.weighted`, the post-proposal "what's actually going
 * to close" number).
 *
 * Conservative — only covers stages where a proposal has been sent,
 * because earlier-stage opportunities are too speculative for a
 * forecast number we'd track actuals against. Stages absent from
 * this map default to 0.2 in the reducer.
 *
 * Pair this with `STAGE_WIN_PROB_BROAD` (below) which extends to all
 * pipeline stages for the **Sales Dashboard's** "weighted pipeline"
 * — a broader, more aspirational number ("what could this be worth?").
 * The two tables intentionally disagree on `proposal_call` /
 * `v2_contract` because they serve different surfaces with different
 * tolerance for speculation.
 */
export const STAGE_WIN_PROB: Record<string, number> = {
  proposal_sent: 0.20,
  proposal_call: 0.40,
  v2_contract: 0.70,
};

/**
 * Stage-weighted win probabilities for the **Sales Dashboard's**
 * "weighted pipeline" tile (`dashboardMetrics.weightedPipeline`).
 *
 * Hoisted from an inline map in `page.tsx` on 2026-06-03 so the
 * dashboard and forecast pull from the same module rather than the
 * dashboard duplicating its own probability table locally.
 *
 * Broader than `STAGE_WIN_PROB` (includes cold/warm/intro/booked) so
 * the dashboard surfaces "potential pipeline value" across the whole
 * funnel — a managerial signal, not a commit number.
 *
 * Difference vs `STAGE_WIN_PROB`: these numbers are intentionally
 * more optimistic on `proposal_call` / `v2_contract` (0.7 / 0.9 vs
 * 0.4 / 0.7) — the dashboard view assumes deals that get this deep
 * usually close; the forecast view is more cautious.
 */
export const STAGE_WIN_PROB_BROAD: Record<string, number> = {
  cold_dm: 0.05,
  warm: 0.10,
  tg_intro: 0.15,
  booked: 0.25,
  discovery_done: 0.40,
  proposal_call: 0.70,
  v2_contract: 0.90,
};

/**
 * "At risk" heuristic for the Forecast view's per-card flag + the
 * `forecastKpis.atRiskCount` aggregate.
 *
 * Marks an opportunity at risk when the proposal was sent 14+ days
 * ago AND the row hasn't been updated (any update) in the last 7
 * days. `updated_at` is a reasonable proxy for "last touched"
 * without joining the activities table.
 *
 * Tune the 14 / 7 day thresholds with care — these are the numbers
 * the team watches in their daily standup.
 */
export function isOppAtRisk(opp: SalesPipelineOpportunity): boolean {
  if (!opp.proposal_sent_at) return false;
  const proposalAgeDays = differenceInDays(new Date(), new Date(opp.proposal_sent_at));
  if (proposalAgeDays < 14) return false;
  if (!opp.updated_at) return true;
  const inactivityDays = differenceInDays(new Date(), new Date(opp.updated_at));
  return inactivityDays > 7;
}

/**
 * Strip URL prefixes off a POC handle for compact display.
 *
 * Pattern: a raw `poc_handle` may come in as a full URL ("https://x.com/foo"),
 * a platform-prefixed handle ("twitter.com/foo"), or just "@foo". This
 * normalises all of those to "@foo" (or the bare handle if no leading @
 * fits). Used by every table cell + slide-over header that renders the
 * handle inline.
 *
 * Was previously inlined in three places (page.tsx, ActionsTab,
 * OpportunitySlideOver) — hoisted here 2026-06-03 so changes to the URL
 * vocabulary only need to land once.
 */
export function cleanPocHandle(handle: string): string {
  return handle
    .replace(/^https?:\/\/(www\.)?(x\.com|twitter\.com|instagram\.com|linkedin\.com\/in|t\.me|discord\.gg|discord\.com\/users)\/?/i, '@')
    .replace(/^https?:\/\/(www\.)?[^/]+\/?/i, '')
    .replace(/\/+$/, '');
}

/** Bucket key for the Forecast view's six period rows. */
export type ForecastPeriodKey =
  | 'thisWeek'
  | 'nextWeek'
  | 'thisMonth'
  | 'nextMonth'
  | 'later'
  | 'noDate';

/** Period buckets keyed by `ForecastPeriodKey`. Each entry is the
 *  list of forecast-eligible opportunities falling in that window. */
export type ForecastByPeriod = Record<ForecastPeriodKey, SalesPipelineOpportunity[]>;

/** KPI strip values shown above the period buckets in the Forecast
 *  view. Computed once and passed via SalesPipelineContext. */
export type ForecastKpis = {
  totalValue: number;
  weighted: number;
  thisMonthValue: number;
  atRiskCount: number;
  atRiskValue: number;
};

/**
 * ACTION_GUIDANCE — `label`/`hint` pairs the slide-over surfaces above
 * the body when the user opens it via an action item ("Why is this
 * here?"). Keyed by the action label string emitted by `getNextAction`.
 *
 * Moved out of `page.tsx` on 2026-06-02 so the ActionsTab + the
 * slide-over can share the same source of truth without prop drilling.
 * Edit with care — these strings are the user-visible hint copy.
 */
export const ACTION_GUIDANCE: Record<string, { label: string; hint: string }> = {
  'Book Next Meeting!': { label: 'Book Next Meeting', hint: 'Click the pencil icon (Edit) → set the Next Meeting date field. No deal should exist without a future meeting (BAMFAM).' },
  'Book Meeting':       { label: 'Book Meeting', hint: 'Click the pencil icon (Edit) → set the Next Meeting date field to stay BAMFAM-compliant.' },
  'Get TG Handle':      { label: 'Get TG Handle', hint: 'DM them asking for their Telegram handle, then click Edit → fill in the TG Handle field. Once entered, click "Got TG!" to advance.' },
  'Follow Up':          { label: 'Follow Up', hint: 'Send a follow-up DM. After messaging, log it as an activity below so the team knows.' },
  'Schedule Meeting':   { label: 'Schedule Meeting', hint: 'Send Calendly or propose a time. Click the pencil icon (Edit) → set the Next Meeting date field once confirmed.' },
  'Prep for Meeting':   { label: 'Prep for Meeting', hint: 'Review their notes, bucket, and past activity below. Update Notes with talking points before the call.' },
  'Follow Up Proposal': { label: 'Follow Up Proposal', hint: 'Message them to check if they reviewed the proposal. Log their response as an activity below.' },
  'Send Proposal':      { label: 'Send Proposal', hint: 'Draft & send the pricing proposal based on discovery call notes. This will mark the proposal as sent.' },
  'Need More Info':     { label: 'Need More Info', hint: 'They need more details before a proposal. Add notes on what they need, then follow up.' },
  'Resurrect':          { label: 'Resurrect Check', hint: "It's been 90+ days. Review their notes — DM to re-engage, or move to Lost if no longer viable." },
  'Chase Signature':    { label: 'Chase Signature', hint: 'Follow up on the contract. Once they sign, use the "Signed!" button to close the deal.' },
  'Schedule Call':      { label: 'Schedule Call', hint: 'Book a call to discuss the contract. Click Edit → set the Next Meeting date field.' },
  'Log Meeting Outcome':{ label: 'Log Meeting Outcome', hint: 'A meeting just happened — add an activity below with the outcome, key takeaways, and next steps. Update the Next Meeting date if another was scheduled.' },
  'Reschedule':         { label: 'Reschedule Meeting', hint: 'Meeting needs rescheduling. Click the pencil icon (Edit) → update the Next Meeting date field.' },
  'No Show':            { label: 'No Show', hint: "They didn't show up. Log a \"No Show\" activity below and decide whether to reschedule or orbit." },
  'Keep Bumping':       { label: 'Keep Bumping', hint: 'Override the orbit suggestion — review notes and continue follow-up DMs.' },
  'Re-engage or Orbit': { label: 'Re-engage', hint: "It's been 7+ days with no progress on TG. Send them a nudge — if still no reply, consider orbiting." },
  'Update Stage':       { label: 'Fix Stage', hint: 'Proposal was already sent but this deal is still in Discovery Done. Move it to the correct stage.' },
  'Check In':           { label: 'Nurture Check-In', hint: "It's been 30+ days. Send a light touch — share content, ask how things are going, or see if timing is better now." },
};

/**
 * ActionPriority — drives the urgency tint + sort order in the
 * Actions tab. 'wait' is its own bucket (separate from "low") for
 * deals in cooling-period purgatory.
 */
export type ActionPriority = 'urgent' | 'high' | 'medium' | 'low' | 'wait';

// Re-export the stage union for callers that already import this file
// so they don't need a second import from salesPipelineService.
export type { SalesPipelineStage };
