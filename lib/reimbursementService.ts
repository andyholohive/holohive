/**
 * Reimbursement requests — user-submitted expense reimbursements that
 * super-admins review on the /expenses page.
 *
 * Flow:
 *   1. Any authenticated team member submits a request from /reimbursements
 *      (amount, category, date, description, receipt attachment).
 *   2. Super-admins see the pending queue on /expenses → "Requests" tab.
 *   3. On APPROVE, a one_time row is created in `expenses` (is_paid=false,
 *      user_id = the requester), its receipts are copied into
 *      expense_attachments, and the request is stamped approved + linked to
 *      the new expense_id. From there it flows through the normal expense
 *      paid/unpaid + CSV pipeline.
 *   4. On REJECT, the request is stamped rejected with an optional note.
 *
 * Receipts reuse the existing `expense-attachments` storage bucket under a
 * `reimbursements/{request_id}/...` prefix, so no new bucket / storage
 * policy is needed. All storage + DB access runs with the service role via
 * the API routes in /api/reimbursements/* — never call this from a client
 * component (it would bypass the auth gate).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  ExpenseService,
  ExpenseType,
  ATTACHMENTS_BUCKET,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENTS_PER_EXPENSE,
  ALLOWED_ATTACHMENT_MIME,
} from '@/lib/expenseService';

export type ReimbursementStatus = 'pending' | 'approved' | 'rejected';

export interface ReimbursementRequest {
  id: string;
  requested_by: string;
  amount_usd: number;
  expense_type: ExpenseType;
  description: string;
  notes: string | null;
  expense_date: string;              // 'YYYY-MM-DD'
  status: ReimbursementStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  expense_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReimbursementAttachment {
  id: string;
  request_id: string;
  file_name: string;
  file_url: string;                  // storage key in ATTACHMENTS_BUCKET
  file_size_bytes: number | null;
  mime_type: string | null;
  uploaded_at: string;
}

export interface CreateReimbursementInput {
  requested_by: string;              // session user id
  amount_usd: number;
  expense_type: ExpenseType;
  description: string;
  notes?: string | null;
  expense_date: string;              // 'YYYY-MM-DD'
}

function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export class ReimbursementService {
  /** Admin view: every request (optionally filtered by status). */
  static async list(opts: { status?: ReimbursementStatus; include_deleted?: boolean; limit?: number } = {}): Promise<ReimbursementRequest[]> {
    const sb = adminClient();
    let q = (sb as any).from('reimbursement_requests').select('*');
    if (!opts.include_deleted) q = q.is('deleted_at', null);
    if (opts.status) q = q.eq('status', opts.status);
    q = q.order('created_at', { ascending: false }).limit(opts.limit ?? 500);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []) as ReimbursementRequest[];
  }

  /** Submitter view: only the caller's own requests. */
  static async listMine(userId: string): Promise<ReimbursementRequest[]> {
    const sb = adminClient();
    const { data, error } = await (sb as any)
      .from('reimbursement_requests')
      .select('*')
      .eq('requested_by', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data || []) as ReimbursementRequest[];
  }

  static async getById(id: string): Promise<ReimbursementRequest | null> {
    const sb = adminClient();
    const { data, error } = await (sb as any)
      .from('reimbursement_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as ReimbursementRequest) || null;
  }

  static async create(input: CreateReimbursementInput): Promise<ReimbursementRequest> {
    const sb = adminClient();
    const { data, error } = await (sb as any)
      .from('reimbursement_requests')
      .insert({
        requested_by: input.requested_by,
        amount_usd: input.amount_usd,
        expense_type: input.expense_type,
        description: input.description,
        notes: input.notes ?? null,
        expense_date: input.expense_date,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as ReimbursementRequest;
  }

  // ─── Attachments ────────────────────────────────────────────────────

  static async listAttachments(requestId: string): Promise<ReimbursementAttachment[]> {
    const sb = adminClient();
    const { data, error } = await (sb as any)
      .from('reimbursement_attachments')
      .select('*')
      .eq('request_id', requestId)
      .order('uploaded_at', { ascending: true });
    if (error) throw error;
    return (data || []) as ReimbursementAttachment[];
  }

  static async addAttachment(input: {
    requestId: string;
    fileName: string;
    fileBuffer: ArrayBuffer | Buffer;
    mimeType: string;
    fileSizeBytes: number;
  }): Promise<ReimbursementAttachment> {
    if (input.fileSizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new Error(`File exceeds 10 MB limit (${input.fileSizeBytes} bytes)`);
    }
    if (!ALLOWED_ATTACHMENT_MIME.includes(input.mimeType)) {
      throw new Error(`Unsupported MIME type: ${input.mimeType}`);
    }

    const sb = adminClient();

    const { count, error: countErr } = await (sb as any)
      .from('reimbursement_attachments')
      .select('id', { count: 'exact', head: true })
      .eq('request_id', input.requestId);
    if (countErr) throw countErr;
    if ((count ?? 0) >= MAX_ATTACHMENTS_PER_EXPENSE) {
      throw new Error(`Max ${MAX_ATTACHMENTS_PER_EXPENSE} attachments per request`);
    }

    const cleanName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const storageKey = `reimbursements/${input.requestId}/${crypto.randomUUID()}-${cleanName}`;

    const { error: uploadErr } = await sb.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(storageKey, input.fileBuffer as any, { contentType: input.mimeType, upsert: false });
    if (uploadErr) throw uploadErr;

    const { data: row, error: insErr } = await (sb as any)
      .from('reimbursement_attachments')
      .insert({
        request_id: input.requestId,
        file_name: input.fileName,
        file_url: storageKey,
        file_size_bytes: input.fileSizeBytes,
        mime_type: input.mimeType,
      })
      .select('*')
      .single();
    if (insErr) {
      try { await sb.storage.from(ATTACHMENTS_BUCKET).remove([storageKey]); } catch {}
      throw insErr;
    }
    return row as ReimbursementAttachment;
  }

  static async getSignedAttachmentUrl(attachmentId: string, expiresIn = 300): Promise<string | null> {
    const sb = adminClient();
    const { data: att, error } = await (sb as any)
      .from('reimbursement_attachments')
      .select('file_url')
      .eq('id', attachmentId)
      .maybeSingle();
    if (error || !att) return null;
    const { data, error: urlErr } = await sb.storage
      .from(ATTACHMENTS_BUCKET)
      .createSignedUrl(att.file_url, expiresIn);
    if (urlErr) return null;
    return data?.signedUrl ?? null;
  }

  // ─── Review transitions ─────────────────────────────────────────────

  /**
   * Approve a pending request: creates a one_time expense (unpaid) owned by
   * the requester, copies each receipt into expense_attachments, then stamps
   * the request approved + linked to the new expense. Returns both rows.
   */
  static async approve(id: string, reviewerId: string, note?: string | null): Promise<{ expenseId: string }> {
    const sb = adminClient();

    const req = await this.getById(id);
    if (!req) throw new Error('Request not found');
    if (req.status !== 'pending') throw new Error(`Request is already ${req.status}`);

    // 1. Create the expense (one_time, unpaid) owned by the requester.
    const expense = await ExpenseService.create({
      user_id: req.requested_by,
      amount_usd: Number(req.amount_usd),
      frequency: 'one_time',
      expense_type: req.expense_type,
      description: req.description,
      notes: req.notes ?? null,
      expense_date: req.expense_date,
      created_by: reviewerId,
    });

    // 2. Copy receipts into the expense's attachment set. The blobs live in
    //    the same bucket, so we copy each object to the expense's path and
    //    insert an expense_attachments row pointing at the new key. Copy
    //    failures are non-fatal — the expense + review still stand.
    const attachments = await this.listAttachments(id);
    for (const att of attachments) {
      try {
        const cleanName = att.file_name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
        const destKey = `${expense.id}/${crypto.randomUUID()}-${cleanName}`;
        const { error: copyErr } = await sb.storage.from(ATTACHMENTS_BUCKET).copy(att.file_url, destKey);
        if (copyErr) continue;
        await (sb as any).from('expense_attachments').insert({
          expense_id: expense.id,
          file_name: att.file_name,
          file_url: destKey,
          file_size_bytes: att.file_size_bytes,
          mime_type: att.mime_type,
        });
      } catch {
        // best-effort receipt migration
      }
    }

    // 3. Stamp the request approved + link to the expense.
    const { error: updErr } = await (sb as any)
      .from('reimbursement_requests')
      .update({
        status: 'approved',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        review_note: note ?? null,
        expense_id: expense.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (updErr) throw updErr;

    return { expenseId: expense.id };
  }

  static async reject(id: string, reviewerId: string, note?: string | null): Promise<void> {
    const sb = adminClient();
    const req = await this.getById(id);
    if (!req) throw new Error('Request not found');
    if (req.status !== 'pending') throw new Error(`Request is already ${req.status}`);
    const { error } = await (sb as any)
      .from('reimbursement_requests')
      .update({
        status: 'rejected',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        review_note: note ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;
  }
}
