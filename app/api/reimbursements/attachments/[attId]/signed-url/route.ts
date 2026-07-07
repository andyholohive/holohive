import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';
import { ReimbursementService } from '@/lib/reimbursementService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reimbursements/attachments/[attId]/signed-url
 * Short-lived signed URL for a receipt. Super-admin only (review side).
 */
export async function GET(request: NextRequest, { params }: { params: { attId: string } }) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;
  const url = await ReimbursementService.getSignedAttachmentUrl(params.attId);
  if (!url) return NextResponse.json({ error: 'Could not sign URL' }, { status: 500 });
  return NextResponse.json({ url });
}
