import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';
import { ReimbursementService, ReimbursementStatus } from '@/lib/reimbursementService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reimbursements — super-admin review queue.
 *   ?status=pending|approved|rejected filters (omit for all).
 * Submission is public: see POST /api/public/reimbursements.
 */
export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const status = request.nextUrl.searchParams.get('status') as ReimbursementStatus | null;
    const requests = await ReimbursementService.list(status ? { status } : {});
    return NextResponse.json({ requests });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load requests' }, { status: 500 });
  }
}
