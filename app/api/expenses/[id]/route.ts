import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';
import { ExpenseService } from '@/lib/expenseService';

export const dynamic = 'force-dynamic';

/**
 * GET    /api/expenses/[id]   — detail (includes attachments)
 * PATCH  /api/expenses/[id]   — update arbitrary fields (mark paid, edit amount, etc.)
 * DELETE /api/expenses/[id]   — soft delete (sets deleted_at)
 *
 * Reminder: editing a TEMPLATE updates future instances only — past
 * instances stay at their frozen values. Marking paid on a template
 * is forbidden by the DB CHECK constraint and the service layer's
 * markPaid filter.
 */

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const row = await ExpenseService.getById(params.id);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const attachments = await ExpenseService.listAttachments(params.id);
    return NextResponse.json({ expense: row, attachments });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Lookup failed' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  let body: any;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // Whitelist updatable fields
  const allowed = [
    'user_id', 'amount_usd', 'expense_type', 'description', 'notes',
    'recurrence_end_date', 'expense_date',
    'is_paid', 'paid_at', 'paid_by', 'paid_notes',
  ];
  const patch: any = {};
  for (const k of allowed) if (k in body) patch[k] = body[k];

  // Auto-stamp paid_at + paid_by when transitioning is_paid → true
  if (patch.is_paid === true) {
    if (!patch.paid_at) patch.paid_at = new Date().toISOString();
    if (!patch.paid_by && guard.user?.id) patch.paid_by = guard.user.id;
  }
  if (patch.is_paid === false) {
    patch.paid_at = null;
    patch.paid_by = null;
    patch.paid_notes = null;
  }

  try {
    const updated = await ExpenseService.update(params.id, patch);
    return NextResponse.json({ expense: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Update failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    await ExpenseService.softDelete(params.id, guard.user?.id || 'unknown');
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Delete failed' }, { status: 500 });
  }
}
