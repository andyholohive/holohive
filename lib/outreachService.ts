import { supabase } from './supabase';

/**
 * CRM · TG Outreach — data layer for /crm/outreach.
 *
 * Mirrors CRMService's shape (static class over the browser client) rather
 * than adding API routes: this is internal sales data behind the normal
 * session gate, read and written by the same people who read the rest of
 * the CRM, and a second access pattern for one page would be its own tax.
 */

// ── Status model ─────────────────────────────────────────────────────
// Notion's 21-value "Status 2" funnel verbatim. The DB CHECK constraint on
// outreach_prospects.status is generated from this same list, so adding a
// value means touching both — deliberately, since every rate on the page
// keys off which bucket a status falls in.

export type OutreachStatus =
  // To-do
  | 'not_started' | 'to_contact' | 'ready_to_send' | 'contacted'
  | 'bump_1_unseen' | 'bump_1_seen' | 'bump_2_unseen' | 'bump_2_seen'
  | 'bump_3_unseen' | 'bump_3_seen' | 'final_bump'
  | 'team_engaged' | 'team_denial' | 'blocked' | 'x'
  // In progress
  | 'response_interested' | 'response_referred'
  | 'response_denial' | 'response_not_working'
  // Complete
  | 'lead' | 'lead_trial';

export const OUTREACH_STATUSES: OutreachStatus[] = [
  'not_started', 'to_contact', 'ready_to_send', 'contacted',
  'bump_1_unseen', 'bump_1_seen', 'bump_2_unseen', 'bump_2_seen',
  'bump_3_unseen', 'bump_3_seen', 'final_bump',
  'team_engaged', 'team_denial', 'blocked', 'x',
  'response_interested', 'response_referred', 'response_denial', 'response_not_working',
  'lead', 'lead_trial',
];

export type Stage = 'queued' | 'ready' | 'outreached' | 'responded' | 'lead' | 'dead';

/** Every way a prospect ends without becoming a lead. */
export const DEAD_STATUSES: OutreachStatus[] = [
  'response_denial', 'response_not_working', 'team_denial', 'blocked', 'x',
];

/** A bump is still outreach awaiting a reply, so it groups with 'contacted'. */
export const BUMP_STATUSES: OutreachStatus[] = [
  'bump_1_unseen', 'bump_1_seen', 'bump_2_unseen', 'bump_2_seen',
  'bump_3_unseen', 'bump_3_seen', 'final_bump',
];

/**
 * Runtime status catalogue, loaded from outreach_statuses.
 *
 * The hardcoded lists above stay as the compile-time shape for the 21
 * original values, but anything added at runtime lives here — including its
 * stage, which is what keeps the funnel rates total.
 */
export interface OutreachStatusRow {
  key: string; label: string; tone: string; stage: Stage;
  display_order: number; is_active: boolean;
}

let statusCache: OutreachStatusRow[] | null = null;

export async function listStatuses(force = false): Promise<OutreachStatusRow[]> {
  if (statusCache && !force) return statusCache;
  const { data } = await db()
    .from('outreach_statuses')
    .select('key, label, tone, stage, display_order, is_active')
    .eq('is_active', true)
    .order('display_order');
  statusCache = ((data ?? []) as OutreachStatusRow[]);
  return statusCache;
}

/** Add a status. `stage` is required by the table, so a new one cannot be
 *  created without saying which funnel bucket it counts in. */
export async function addStatus(input: {
  label: string; stage: Stage; tone?: string;
}): Promise<{ ok: boolean; error?: string; key?: string }> {
  const label = input.label.trim();
  if (!label) return { ok: false, error: 'Name is required.' };
  // Key derived from the label: lower, non-alphanumerics to underscore. Keys
  // are what the prospects table stores, so they must be stable and typo-free
  // rather than typed by hand.
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (!key) return { ok: false, error: 'Name needs at least one letter or number.' };

  // Append at the end of the current order rather than a fixed 99, so a
  // second and third added status don't tie and sort arbitrarily.
  const { data: last } = await db()
    .from('outreach_statuses')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((last?.display_order as number | undefined) ?? 0) + 1;

  const { error } = await db().from('outreach_statuses').insert({
    key, label, stage: input.stage, tone: input.tone ?? 'neutral', display_order: nextOrder,
  });
  if (error) {
    return { ok: false, error: /duplicate/i.test(error.message) ? 'That status already exists.' : error.message };
  }
  statusCache = null;
  return { ok: true, key };
}

/** Stage for a status key, using the loaded catalogue when it has one.
 *  Falls back to the built-in mapping for the 21 originals so a call made
 *  before the catalogue loads is still correct rather than defaulting
 *  everything to 'queued'. */
export function stageOfRow(status: string, catalogue: OutreachStatusRow[] | null): Stage {
  const row = catalogue?.find(r => r.key === status);
  if (row) return row.stage;
  return stageOf(status as OutreachStatus);
}

export function stageOf(status: OutreachStatus): Stage {
  if (DEAD_STATUSES.includes(status)) return 'dead';
  if (status === 'lead' || status === 'lead_trial') return 'lead';
  if (status === 'response_interested' || status === 'response_referred'
      || status === 'team_engaged') return 'responded';
  if (status === 'contacted' || BUMP_STATUSES.includes(status)) return 'outreached';
  if (status === 'ready_to_send') return 'ready';
  return 'queued';
}

export interface OutreachProspect {
  id: string;
  role: string;
  telegram: string;
  company: string;
  company_url: string | null;
  owner: string;
  owner_user_id: string | null;
  status: OutreachStatus;
  message_type: string | null;
  /** Which touch got the reply. Pairs with message_type to read as
   *  "Bump 1 of Scan (Gap)" — the template is one dimension, how many
   *  touches it took is the other, and both are worth counting. */
  responded_to_step: RepliedStep | null;
  date_outreached: string | null;
  bumps_used: number;
  bumps_before_conversion: number | null;
  source: 'notion' | 'crm' | 'manual';
  crm_opportunity_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Set when the row has left the worklist. Nothing is deleted — parking is
   *  reversible and the row keeps every field it had. */
  parked_at: string | null;
  parked_reason: ParkReason | null;
}

/** The outreach ladder, mirroring the bump statuses. Fixed, not a
 *  field_options list — the sequence is the sequence. */
export type RepliedStep = 'opener' | 'bump_1' | 'bump_2' | 'bump_3' | 'final_bump';

export const REPLIED_STEPS: Array<{ key: RepliedStep; label: string }> = [
  { key: 'opener',     label: 'Opener' },
  { key: 'bump_1',     label: 'Bump 1' },
  { key: 'bump_2',     label: 'Bump 2' },
  { key: 'bump_3',     label: 'Bump 3' },
  { key: 'final_bump', label: 'Final Bump' },
];

export const REPLIED_STEP_LABELS: Record<RepliedStep, string> =
  Object.fromEntries(REPLIED_STEPS.map(s => [s.key, s.label])) as Record<RepliedStep, string>;

/** "Bump 1 of Scan (Gap)", or just "Bump 1" when no template is recorded. */
export function repliedStepLabel(
  step: RepliedStep | null, messageType: string | null,
): string | null {
  if (!step) return null;
  const base = REPLIED_STEP_LABELS[step] ?? step;
  return messageType ? `${base} of ${messageType}` : base;
}

export type ParkReason = 'no_handle' | 'duplicate' | 'terminal' | 'stale_no_reply';

export const PARK_REASON_LABELS: Record<ParkReason, string> = {
  no_handle: 'No handle',
  duplicate: 'Duplicate',
  terminal: 'Said no',
  stale_no_reply: 'No reply, 90d+',
};

export type CreateProspectData = Pick<OutreachProspect, 'telegram' | 'company'> &
  Partial<Omit<OutreachProspect, 'id' | 'created_at' | 'updated_at'>>;

/**
 * `outreach_prospects` postdates the checked-in lib/database.types.ts, so the
 * generated Database type has no row shape for it and every builder call
 * fails to resolve an overload. Same situation as `app_settings` elsewhere in
 * the codebase, handled the same way: one narrow untyped handle here rather
 * than an `as any` scattered across each call, with the real shape enforced
 * by the OutreachProspect interface above and the DB's own CHECK constraints.
 * Regenerating the types folds this away.
 */
const db = () => supabase as any;

const COLUMNS =
  'id, role, telegram, company, company_url, owner, owner_user_id, status, message_type, ' +
  'date_outreached, bumps_used, bumps_before_conversion, source, responded_to_step, ' +
  'crm_opportunity_id, notes, created_at, updated_at, parked_at, parked_reason';

// ── Rates ────────────────────────────────────────────────────────────
//
// [2026-08-14, Yano's definitions verbatim]
//   "Response is % that respond"
//   "Lead rate is what % of outreach will turn to a lead, aka trial rate
//    or convo or call"
//   "Trial rate is just % of people that take you up on the free offer"
//
// Two consequences worth stating, because both differ from the mockup:
//
//   1. ALL THREE share one denominator — outreach actually sent. Someone
//      still sitting in To Contact has not been given the chance to reply
//      and would only deflate every rate. The mockup divided trials by
//      leads instead, which measured a different thing (how many closed
//      leads started) and broke comparability between the three cards.
//
//   2. A "lead" is trial OR conversation OR call, per Yano — so it counts
//      the engaged statuses too, not only the two Complete ones. That makes
//      the three nest cleanly: trials ⊆ leads ⊆ responded, which is what
//      lets them be read as one funnel rather than three unrelated numbers.

export interface OutreachRates {
  total: number;
  /** Denominator for all three rates: prospects we have actually messaged. */
  contacted: number;
  responded: number;
  leads: number;
  trials: number;
  dead: number;
  /** null rather than 0 when the denominator is empty — "no data" is not "0%". */
  responseRate: number | null;
  leadRate: number | null;
  trialRate: number | null;
}

/** Did they reply at all? A denial IS a response — counting only positive
 *  replies would make response rate a synonym for interest rate. */
export function hasResponded(p: Pick<OutreachProspect, 'status'>, cat?: OutreachStatusRow[] | null): boolean {
  const st = stageOfRow(p.status, cat ?? null);
  return st === 'responded' || st === 'lead'
    || p.status === 'response_denial' || p.status === 'response_not_working';
}

/** Trial OR convo OR call, per Yano. The engaged statuses are the "convo or
 *  call" half; lead / lead_trial are the closed half. */
export function isLead(p: Pick<OutreachProspect, 'status'>, cat?: OutreachStatusRow[] | null): boolean {
  const st = stageOfRow(p.status, cat ?? null);
  return st === 'lead' || st === 'responded';
}

/** Took up the free offer. */
export function isTrial(p: Pick<OutreachProspect, 'status'>): boolean {
  return p.status === 'lead_trial';
}

/** Rates over whatever set is passed — the page hands in the CURRENT view's
 *  rows, not the whole table, so "response rate" answers for the segment on
 *  screen (this owner, this message type) rather than only globally. */
export function computeRates(
  rows: OutreachProspect[],
  cat?: OutreachStatusRow[] | null,
): OutreachRates {
  const contacted = rows.filter(p => p.date_outreached !== null).length;
  const responded = rows.filter(p => hasResponded(p, cat)).length;
  const leads = rows.filter(p => isLead(p, cat)).length;
  const trials = rows.filter(isTrial).length;
  const dead = rows.filter(p => stageOfRow(p.status, cat ?? null) === 'dead').length;

  const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 100));

  return {
    total: rows.length,
    contacted,
    responded,
    leads,
    trials,
    dead,
    responseRate: pct(responded, contacted),
    leadRate: pct(leads, contacted),
    trialRate: pct(trials, contacted),
  };
}

// ── CRUD ─────────────────────────────────────────────────────────────

export class OutreachService {
  static async list(): Promise<OutreachProspect[]> {
    const { data, error } = await db()
      .from('outreach_prospects')
      .select(COLUMNS)
      .order('date_outreached', { ascending: false, nullsFirst: false })
      .order('company', { ascending: true });
    if (error) throw new Error(`Failed to load prospects: ${error.message}`);
    return (data ?? []) as unknown as OutreachProspect[];
  }

  /** Park or unpark. Nothing is deleted; the row keeps every field and
   *  comes back with one call. */
  static async setParked(
    id: string, parked: boolean, reason?: ParkReason,
  ): Promise<void> {
    const { error } = await db()
      .from('outreach_prospects')
      .update(parked
        ? { parked_at: new Date().toISOString(), parked_reason: reason ?? 'terminal' }
        : { parked_at: null, parked_reason: null })
      .eq('id', id);
    if (error) throw new Error(`Failed to update prospect: ${error.message}`);
  }

  static async create(input: CreateProspectData): Promise<OutreachProspect> {
    const { data, error } = await db()
      .from('outreach_prospects')
      .insert({ ...input, source: input.source ?? 'manual' })
      .select(COLUMNS)
      .single();
    if (error) {
      // The unique index on (telegram, company) is the guard against a
      // double-add quietly inflating every rate's denominator — say so
      // plainly rather than surfacing a constraint name.
      if (error.code === '23505') {
        throw new Error(`${input.telegram} is already on the board for ${input.company}.`);
      }
      throw new Error(`Failed to add prospect: ${error.message}`);
    }
    return data as unknown as OutreachProspect;
  }

  static async update(id: string, updates: Partial<CreateProspectData>): Promise<OutreachProspect> {
    const { data, error } = await db()
      .from('outreach_prospects')
      .update(updates)
      .eq('id', id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`Failed to update prospect: ${error.message}`);
    return data as unknown as OutreachProspect;
  }

  /**
   * Move a prospect to a new status, keeping the fields that hang off it
   * consistent. Doing this here rather than in the page means the same
   * bookkeeping happens whichever surface changes the status.
   */
  static async setStatus(
    p: OutreachProspect,
    status: OutreachStatus,
  ): Promise<OutreachProspect> {
    const updates: Partial<CreateProspectData> = { status };

    // Moving into outreach for the first time stamps the send date — the
    // denominator of all three rates is "has a date_outreached", so a
    // status that means "we sent it" must set one or the rates under-count.
    const nowSending = status === 'contacted' || BUMP_STATUSES.includes(status);
    if (nowSending && !p.date_outreached) {
      updates.date_outreached = new Date().toISOString().slice(0, 10);
    }

    // Bump count follows the bump status rather than being tracked by hand.
    const bumpIndex = BUMP_STATUSES.indexOf(status);
    if (bumpIndex >= 0) {
      // bump_1_* → 1, bump_2_* → 2, bump_3_* → 3, final_bump → 4
      updates.bumps_used = Math.min(4, Math.floor(bumpIndex / 2) + 1);
    }

    // On conversion, freeze how many bumps it took — the whole point of
    // Notion's "Bump used Before conversion" column.
    if ((status === 'lead' || status === 'lead_trial') && p.bumps_before_conversion === null) {
      updates.bumps_before_conversion = p.bumps_used;
    }

    return this.update(p.id, updates);
  }

  static async remove(id: string): Promise<void> {
    const { error } = await db().from('outreach_prospects').delete().eq('id', id);
    if (error) throw new Error(`Failed to delete prospect: ${error.message}`);
  }
}

/**
 * The reps who can own a prospect.
 *
 * Users, not free text — the old column was typed by hand, so a rename or a
 * new starter silently orphaned the owner filter. Which users is held in
 * app_settings (`outreach_owner_emails`, comma-separated) rather than a
 * constant, so adding the next rep is a settings change and not a deploy.
 * The file this replaced carried a comment warning about exactly that.
 *
 * Unset falls back to nobody rather than everybody: a mis-set key should
 * shrink the dropdown, not hand the whole team someone else's book.
 */
export async function listOwnerOptions(): Promise<Array<{ id: string; name: string; email: string }>> {
  const { data: setting } = await db()
    .from('app_settings').select('value').eq('key', 'outreach_owner_emails').maybeSingle();
  const emails = String((setting as any)?.value ?? '')
    .split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean);
  if (emails.length === 0) return [];

  const { data } = await db()
    .from('users').select('id, name, email').in('email', emails);
  return ((data ?? []) as any[])
    .map(u => ({ id: u.id, name: u.name ?? u.email, email: u.email }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Message types, editable without a deploy (field_options). */
export async function listMessageTypes(): Promise<string[]> {
  const { data } = await db()
    .from('field_options')
    .select('option_value')
    .eq('field_name', 'outreach_message_type')
    .eq('is_active', true)
    .order('display_order');
  return ((data ?? []) as any[]).map(r => r.option_value);
}

/** Add a message type from the board itself, so a new one does not need
 *  a trip to an admin screen mid-flow. */
export async function addMessageType(value: string): Promise<boolean> {
  const v = value.trim();
  if (!v) return false;
  const { error } = await db()
    .from('field_options')
    .insert({ field_name: 'outreach_message_type', option_value: v, is_active: true, display_order: 99 });
  return !error;
}
