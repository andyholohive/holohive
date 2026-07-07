import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';
import { ReimbursementService } from '@/lib/reimbursementService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/reimbursements/[id]/approve — super-admin only.
 * Creates a one-time (unpaid) expense from the request, copies receipts
 * into expense_attachments, and stamps the request approved.
 * Body: { note? }
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  let note: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body?.note === 'string' && body.note.trim()) note = body.note.trim();
  } catch { /* body optional */ }

  try {
    const reviewerId = guard.user?.id ?? '';
    const result = await ReimbursementService.approve(params.id, reviewerId, note);
    return NextResponse.json({ ok: true, expenseId: result.expenseId });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Approve failed' }, { status: 500 });
  }
}
