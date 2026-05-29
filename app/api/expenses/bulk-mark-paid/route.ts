import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';
import { ExpenseService } from '@/lib/expenseService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/expenses/bulk-mark-paid
 *   Body: { ids: string[], unpaid?: boolean, notes?: string }
 *
 * Marks N expense instances as paid in a single call. Templates are
 * filtered out by the service layer (markPaid only accepts is_template=false).
 * Set unpaid=true to mark UNpaid (in case of accidental mark).
 */

export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;
  if (!guard.user) return NextResponse.json({ error: 'Session required' }, { status: 401 });

  let body: any;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: 'ids array required' }, { status: 400 });
  }

  try {
    const updated = body.unpaid === true
      ? await ExpenseService.markUnpaid(body.ids)
      : await ExpenseService.markPaid(body.ids, guard.user.id, body.notes ?? null);
    return NextResponse.json({ updated, requested: body.ids.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Bulk update failed' }, { status: 500 });
  }
}
