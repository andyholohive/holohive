/**
 * Expense tracking service — super_admin only.
 *
 * Three row shapes in the `expenses` table (CHECK-enforced):
 *   1. one_time:  template_id NULL, is_template=false, expense_date set
 *   2. template:  template_id NULL, is_template=true, recurrence_start_date set
 *   3. instance:  template_id → template, is_template=false, expense_date set
 *
 * Recurrence model (option B per 2026-05-29 design):
 *   Templates generate instance rows via the daily
 *   /api/cron/generate-expense-instances cron. Each instance is
 *   independently editable, can be marked paid, and can be soft-deleted.
 *   Editing a template updates FUTURE instances only — past instances
 *   stay frozen at their generated values. Templates always have
 *   is_paid=false (CHECK enforces).
 *
 * Soft delete: setting `deleted_at` hides the row from default queries.
 * The unique index `uniq_expense_instance_per_period` covers soft-deleted
 * rows too, so deleting an instance keeps it deleted permanently — the
 * cron won't re-create it.
 *
 * All callers should be the API routes in /api/expenses/* which run with
 * service-role + their own super_admin auth gate. Direct service usage
 * from client components would bypass auth — don't do that.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type ExpenseFrequency = 'one_time' | 'daily' | 'weekly' | 'monthly';
export type ExpenseType = 'travel' | 'software' | 'meals_drinks' | 'others';

export interface Expense {
  id: string;
  template_id: string | null;
  is_template: boolean;
  user_id: string;
  amount_usd: number;
  frequency: ExpenseFrequency;
  expense_type: ExpenseType;
  description: string;
  notes: string | null;
  recurrence_start_date: string | null;
  recurrence_end_date: string | null;
  expense_date: string | null;
  is_paid: boolean;
  paid_at: string | null;
  paid_by: string | null;
  paid_notes: string | null;
  deleted_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ExpenseAttachment {
  id: string;
  expense_id: string;
  file_name: string;
  file_url: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  uploaded_at: string;
}

export interface CreateExpenseInput {
  user_id: string;
  amount_usd: number;
  frequency: ExpenseFrequency;
  expense_type: ExpenseType;
  description: string;
  notes?: string | null;
  recurrence_start_date?: string | null;   // required if frequency != one_time
  recurrence_end_date?: string | null;
  expense_date?: string | null;             // required if frequency == one_time
  created_by: string;                       // session user id
}

export interface UpdateExpenseInput {
  user_id?: string;
  amount_usd?: number;
  expense_type?: ExpenseType;
  description?: string;
  notes?: string | null;
  recurrence_end_date?: string | null;      // template only
  expense_date?: string | null;             // instance/one_time only
  is_paid?: boolean;
  paid_at?: string | null;
  paid_by?: string | null;
  paid_notes?: string | null;
}

// ─── Storage bucket constants ─────────────────────────────────────────
export const ATTACHMENTS_BUCKET = 'expense-attachments';
export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;  // 10 MB
export const MAX_ATTACHMENTS_PER_EXPENSE = 5;
export const ALLOWED_ATTACHMENT_MIME = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
];

/**
 * For a recurring template starting on `startDate`, returns the
 * day-of-month the instance should be generated on for the given month.
 *
 * Rule (per Andy 2026-05-29, option C): if start_date's day is greater
 * than the month's last day (e.g. start day=31 in February), clamp to
 * the month's last day. So Jan 31 monthly → Feb 28, Mar 31, Apr 30, etc.
 */
export function clampDayOfMonth(startDay: number, year: number, month: number): number {
  // month is 1-12. Get the last day of the month.
  const lastDay = new Date(year, month, 0).getDate(); // day 0 of next month = last day of this month
  return Math.min(startDay, lastDay);
}

/**
 * For a recurring template, decides whether the given date is an
 * instance-generation day.
 *
 * - daily:   always true
 * - weekly:  true if today's day-of-week matches the template's start date
 * - monthly: true if today's day-of-month matches the template's start date
 *            (with end-of-month clamping per clampDayOfMonth)
 */
export function shouldGenerateInstance(
  template: Pick<Expense, 'frequency' | 'recurrence_start_date' | 'recurrence_end_date'>,
  forDate: Date,
): boolean {
  if (!template.recurrence_start_date) return false;
  const start = new Date(template.recurrence_start_date + 'T00:00:00Z');
  const target = new Date(
    Date.UTC(forDate.getUTCFullYear(), forDate.getUTCMonth(), forDate.getUTCDate())
  );

  // Don't generate before start date
  if (target.getTime() < start.getTime()) return false;

  // Don't generate after end date (if set)
  if (template.recurrence_end_date) {
    const end = new Date(template.recurrence_end_date + 'T00:00:00Z');
    if (target.getTime() > end.getTime()) return false;
  }

  if (template.frequency === 'daily') return true;

  if (template.frequency === 'weekly') {
    return start.getUTCDay() === target.getUTCDay();
  }

  if (template.frequency === 'monthly') {
    const startDay = start.getUTCDate();
    const clampedTarget = clampDayOfMonth(startDay, target.getUTCFullYear(), target.getUTCMonth() + 1);
    return target.getUTCDate() === clampedTarget;
  }

  return false;
}

// ─── Service class ───────────────────────────────────────────────────

/**
 * Build a service-role Supabase client. API routes call this once
 * per request. Never use this client from a browser context.
 */
function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export class ExpenseService {
  /**
   * Create a one_time expense, or create a recurring template + its
   * first instance (so the user sees a row immediately instead of
   * waiting for tomorrow's cron).
   *
   * Returns the row that should be highlighted to the user:
   *   - for one_time:     the one_time row itself
   *   - for recurring:    the FIRST INSTANCE (not the template), so
   *                       the user lands on something with a date +
   *                       a payable state
   */
  static async create(input: CreateExpenseInput): Promise<Expense> {
    const sb = adminClient();

    if (input.frequency === 'one_time') {
      if (!input.expense_date) {
        throw new Error('expense_date is required for one_time expenses');
      }
      const { data, error } = await (sb as any)
        .from('expenses')
        .insert({
          user_id: input.user_id,
          amount_usd: input.amount_usd,
          frequency: 'one_time',
          expense_type: input.expense_type,
          description: input.description,
          notes: input.notes ?? null,
          expense_date: input.expense_date,
          created_by: input.created_by,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as Expense;
    }

    // Recurring: create template, then create first instance
    if (!input.recurrence_start_date) {
      throw new Error('recurrence_start_date is required for recurring expenses');
    }

    const { data: template, error: tmplErr } = await (sb as any)
      .from('expenses')
      .insert({
        user_id: input.user_id,
        amount_usd: input.amount_usd,
        frequency: input.frequency,
        expense_type: input.expense_type,
        description: input.description,
        notes: input.notes ?? null,
        recurrence_start_date: input.recurrence_start_date,
        recurrence_end_date: input.recurrence_end_date ?? null,
        is_template: true,
        created_by: input.created_by,
      })
      .select('*')
      .single();
    if (tmplErr) throw tmplErr;

    // Generate the first instance immediately (date = recurrence_start_date).
    // The cron will pick up subsequent instances starting tomorrow.
    const { data: firstInstance, error: instErr } = await (sb as any)
      .from('expenses')
      .insert({
        template_id: template.id,
        user_id: input.user_id,
        amount_usd: input.amount_usd,
        frequency: input.frequency,
        expense_type: input.expense_type,
        description: input.description,
        notes: input.notes ?? null,
        expense_date: input.recurrence_start_date,
        is_template: false,
        created_by: input.created_by,
      })
      .select('*')
      .single();
    if (instErr) {
      // Roll back the template if instance failed
      await (sb as any).from('expenses').delete().eq('id', template.id);
      throw instErr;
    }

    return firstInstance as Expense;
  }

  static async update(id: string, input: UpdateExpenseInput): Promise<Expense> {
    const sb = adminClient();
    const patch: any = { ...input };
    // updated_at handled by trigger
    delete patch.id;
    const { data, error } = await (sb as any)
      .from('expenses')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as Expense;
  }

  /** Mark one or more instance rows as paid in a single call. */
  static async markPaid(ids: string[], paidBy: string, paidNotes?: string | null): Promise<number> {
    if (ids.length === 0) return 0;
    const sb = adminClient();
    const { data, error } = await (sb as any)
      .from('expenses')
      .update({
        is_paid: true,
        paid_at: new Date().toISOString(),
        paid_by: paidBy,
        paid_notes: paidNotes ?? null,
      })
      .in('id', ids)
      .eq('is_template', false)              // can't pay templates
      .is('deleted_at', null)
      .select('id');
    if (error) throw error;
    return (data || []).length;
  }

  /** Mark one or more rows as UNpaid (in case of accidental mark). */
  static async markUnpaid(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const sb = adminClient();
    const { data, error } = await (sb as any)
      .from('expenses')
      .update({ is_paid: false, paid_at: null, paid_by: null, paid_notes: null })
      .in('id', ids)
      .select('id');
    if (error) throw error;
    return (data || []).length;
  }

  /** Soft-delete a row. For templates, also soft-deletes future
   *  instances (past instances stay so reports keep their data). */
  static async softDelete(id: string, deletedByUserId: string): Promise<void> {
    const sb = adminClient();
    const now = new Date().toISOString();
    const today = new Date().toISOString().slice(0, 10);

    // Load the row to know whether it's a template
    const { data: row, error: loadErr } = await (sb as any)
      .from('expenses')
      .select('id, is_template')
      .eq('id', id)
      .single();
    if (loadErr) throw loadErr;

    // Soft-delete the row itself
    await (sb as any)
      .from('expenses')
      .update({ deleted_at: now })
      .eq('id', id);

    // If it was a template, also soft-delete its FUTURE instances.
    // Past instances stay so monthly reports keep their data.
    if (row.is_template) {
      await (sb as any)
        .from('expenses')
        .update({ deleted_at: now })
        .eq('template_id', id)
        .gte('expense_date', today)
        .is('deleted_at', null);
    }
    // Suppress unused arg warning — kept for future audit logging
    void deletedByUserId;
  }

  /** Filter shape for the list endpoint. */
  static async list(opts: {
    user_id?: string;
    expense_type?: ExpenseType;
    frequency?: ExpenseFrequency;
    paid?: boolean;          // true = only paid, false = only unpaid, undefined = both
    from_date?: string;
    to_date?: string;
    include_deleted?: boolean;
    include_templates?: boolean;
    limit?: number;
  } = {}): Promise<Expense[]> {
    const sb = adminClient();
    let q = (sb as any).from('expenses').select('*');

    if (!opts.include_deleted) q = q.is('deleted_at', null);
    if (!opts.include_templates) q = q.eq('is_template', false);
    if (opts.user_id) q = q.eq('user_id', opts.user_id);
    if (opts.expense_type) q = q.eq('expense_type', opts.expense_type);
    if (opts.frequency) q = q.eq('frequency', opts.frequency);
    if (opts.paid === true) q = q.eq('is_paid', true);
    if (opts.paid === false) q = q.eq('is_paid', false);
    if (opts.from_date) q = q.gte('expense_date', opts.from_date);
    if (opts.to_date) q = q.lte('expense_date', opts.to_date);

    q = q.order('expense_date', { ascending: false, nullsFirst: false })
         .order('created_at', { ascending: false })
         .limit(opts.limit ?? 500);

    const { data, error } = await q;
    if (error) throw error;
    return (data || []) as Expense[];
  }

  static async getById(id: string): Promise<Expense | null> {
    const sb = adminClient();
    const { data, error } = await (sb as any)
      .from('expenses')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as Expense) || null;
  }

  /** All attachments for an expense. */
  static async listAttachments(expenseId: string): Promise<ExpenseAttachment[]> {
    const sb = adminClient();
    const { data, error } = await (sb as any)
      .from('expense_attachments')
      .select('*')
      .eq('expense_id', expenseId)
      .order('uploaded_at', { ascending: true });
    if (error) throw error;
    return (data || []) as ExpenseAttachment[];
  }

  /** Upload a single attachment. Caller passes the file as a Buffer
   *  (from the API route's FormData parse). Returns the row. */
  static async addAttachment(input: {
    expenseId: string;
    fileName: string;
    fileBuffer: ArrayBuffer | Buffer;
    mimeType: string;
    fileSizeBytes: number;
  }): Promise<ExpenseAttachment> {
    if (input.fileSizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new Error(`File exceeds 10 MB limit (${input.fileSizeBytes} bytes)`);
    }
    if (!ALLOWED_ATTACHMENT_MIME.includes(input.mimeType)) {
      throw new Error(`Unsupported MIME type: ${input.mimeType}`);
    }

    const sb = adminClient();

    // Check current attachment count
    const { count, error: countErr } = await (sb as any)
      .from('expense_attachments')
      .select('id', { count: 'exact', head: true })
      .eq('expense_id', input.expenseId);
    if (countErr) throw countErr;
    if ((count ?? 0) >= MAX_ATTACHMENTS_PER_EXPENSE) {
      throw new Error(`Max ${MAX_ATTACHMENTS_PER_EXPENSE} attachments per expense`);
    }

    // Storage path: <expense_id>/<random-uuid>-<original-name>
    const cleanName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const storageKey = `${input.expenseId}/${crypto.randomUUID()}-${cleanName}`;

    const { error: uploadErr } = await sb.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(storageKey, input.fileBuffer as any, {
        contentType: input.mimeType,
        upsert: false,
      });
    if (uploadErr) throw uploadErr;

    const { data: insertedRow, error: insErr } = await (sb as any)
      .from('expense_attachments')
      .insert({
        expense_id: input.expenseId,
        file_name: input.fileName,
        file_url: storageKey,      // we generate signed URLs on demand
        file_size_bytes: input.fileSizeBytes,
        mime_type: input.mimeType,
      })
      .select('*')
      .single();
    if (insErr) {
      // Best-effort cleanup of uploaded blob
      try { await sb.storage.from(ATTACHMENTS_BUCKET).remove([storageKey]); } catch {}
      throw insErr;
    }
    return insertedRow as ExpenseAttachment;
  }

  /** Generate a short-lived signed URL for viewing/downloading. */
  static async getSignedAttachmentUrl(attachmentId: string, expiresIn = 300): Promise<string | null> {
    const sb = adminClient();
    const { data: att, error: attErr } = await (sb as any)
      .from('expense_attachments')
      .select('file_url')
      .eq('id', attachmentId)
      .maybeSingle();
    if (attErr || !att) return null;

    const { data, error } = await sb.storage
      .from(ATTACHMENTS_BUCKET)
      .createSignedUrl(att.file_url, expiresIn);
    if (error) return null;
    return data?.signedUrl ?? null;
  }

  /** Delete an attachment row + remove the blob from storage. */
  static async deleteAttachment(attachmentId: string): Promise<void> {
    const sb = adminClient();
    const { data: att } = await (sb as any)
      .from('expense_attachments')
      .select('file_url')
      .eq('id', attachmentId)
      .maybeSingle();

    if (att?.file_url) {
      try { await sb.storage.from(ATTACHMENTS_BUCKET).remove([att.file_url]); } catch {}
    }
    await (sb as any).from('expense_attachments').delete().eq('id', attachmentId);
  }
}
