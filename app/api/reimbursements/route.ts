import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';
import { ReimbursementService, ReimbursementStatus } from '@/lib/reimbursementService';
import { ExpenseType } from '@/lib/expenseService';

export const dynamic = 'force-dynamic';

const VALID_TYPES: ExpenseType[] = ['travel', 'software', 'meals_drinks', 'others'];

/**
 * GET /api/reimbursements
 *   ?scope=mine (default) — the caller's own requests
 *   ?scope=all            — every request (super-admin only); ?status filters
 *
 * POST /api/reimbursements
 *   Body: { amount_usd, expense_type, description, notes?, expense_date }
 *   Creates a pending request owned by the caller.
 */
export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.response;

  const scope = request.nextUrl.searchParams.get('scope') || 'mine';
  try {
    if (scope === 'all') {
      if (guard.user.role !== 'super_admin') {
        return NextResponse.json({ error: 'Super-admin only' }, { status: 403 });
      }
      const status = request.nextUrl.searchParams.get('status') as ReimbursementStatus | null;
      const requests = await ReimbursementService.list(status ? { status } : {});
      return NextResponse.json({ requests });
    }
    const requests = await ReimbursementService.listMine(guard.user.id);
    return NextResponse.json({ requests });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load requests' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.response;

  let body: any;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const amount = Number(body?.amount_usd);
  const expenseType = body?.expense_type as ExpenseType;
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  const expenseDate = body?.expense_date as string;

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
  }
  if (!VALID_TYPES.includes(expenseType)) {
    return NextResponse.json({ error: 'Invalid expense type' }, { status: 400 });
  }
  if (!description) {
    return NextResponse.json({ error: 'Description is required' }, { status: 400 });
  }
  if (!expenseDate || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
    return NextResponse.json({ error: 'A valid expense date is required' }, { status: 400 });
  }

  try {
    const created = await ReimbursementService.create({
      requested_by: guard.user.id,
      amount_usd: amount,
      expense_type: expenseType,
      description,
      notes: typeof body?.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
      expense_date: expenseDate,
    });
    return NextResponse.json({ request: created }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to create request' }, { status: 500 });
  }
}
