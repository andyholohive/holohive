import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';
import { ReimbursementService } from '@/lib/reimbursementService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/reimbursements/[id]/reject — super-admin only.
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
    await ReimbursementService.reject(params.id, reviewerId, note);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Reject failed' }, { status: 500 });
  }
}
