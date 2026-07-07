import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';
import { ReimbursementService } from '@/lib/reimbursementService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reimbursements/[id]/attachments — list a request's receipts.
 * Super-admin only (review side). Receipts are attached at submission time
 * via the public POST /api/public/reimbursements.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const attachments = await ReimbursementService.listAttachments(params.id);
    return NextResponse.json({ attachments });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load receipts' }, { status: 500 });
  }
}
