import { NextRequest, NextResponse } from 'next/server';
import { ReimbursementService } from '@/lib/reimbursementService';
import { ExpenseType, ALLOWED_ATTACHMENT_MIME, MAX_ATTACHMENT_SIZE_BYTES } from '@/lib/expenseService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/public/reimbursements — PUBLIC (no auth; allowlisted via the
 * /api/public/ middleware prefix). Anyone with the form link can submit a
 * reimbursement request. Accepts multipart/form-data so the receipt is
 * uploaded server-side (service role) in the same call:
 *   requester_name, requester_email, amount_usd, expense_type,
 *   description, notes?, expense_date, file? (receipt)
 */
const VALID_TYPES: ExpenseType[] = ['travel', 'software', 'meals_drinks', 'others'];

export async function POST(request: NextRequest) {
  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ error: 'Multipart parse failed' }, { status: 400 }); }

  const requesterName = String(form.get('requester_name') || '').trim();
  const requesterEmail = String(form.get('requester_email') || '').trim();
  const amount = Number(form.get('amount_usd'));
  const expenseType = String(form.get('expense_type') || '') as ExpenseType;
  const description = String(form.get('description') || '').trim();
  const notes = String(form.get('notes') || '').trim();
  const expenseDate = String(form.get('expense_date') || '');

  if (!requesterName) return NextResponse.json({ error: 'Your name is required' }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(requesterEmail)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
  }
  if (!VALID_TYPES.includes(expenseType)) {
    return NextResponse.json({ error: 'Invalid expense category' }, { status: 400 });
  }
  if (!description) return NextResponse.json({ error: 'Description is required' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
    return NextResponse.json({ error: 'A valid expense date is required' }, { status: 400 });
  }

  // Validate the optional receipt before creating anything.
  const file = form.get('file');
  const hasFile = file && typeof file !== 'string';
  if (hasFile) {
    if ((file as File).size > MAX_ATTACHMENT_SIZE_BYTES) {
      return NextResponse.json({ error: 'Receipt exceeds the 10 MB limit' }, { status: 413 });
    }
    if (!ALLOWED_ATTACHMENT_MIME.includes((file as File).type)) {
      return NextResponse.json({ error: `Unsupported receipt type: ${(file as File).type}` }, { status: 415 });
    }
  }

  try {
    const created = await ReimbursementService.create({
      requester_name: requesterName,
      requester_email: requesterEmail,
      amount_usd: amount,
      expense_type: expenseType,
      description,
      notes: notes || null,
      expense_date: expenseDate,
    });

    if (hasFile) {
      const f = file as File;
      const buffer = await f.arrayBuffer();
      try {
        await ReimbursementService.addAttachment({
          requestId: created.id,
          fileName: f.name,
          fileBuffer: buffer,
          mimeType: f.type,
          fileSizeBytes: f.size,
        });
      } catch (attErr: any) {
        // Request stands even if the receipt fails to store.
        return NextResponse.json({ ok: true, id: created.id, receiptError: attErr?.message || 'Receipt upload failed' }, { status: 201 });
      }
    }

    return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to submit request' }, { status: 500 });
  }
}
