import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';
import { ExpenseService } from '@/lib/expenseService';

export const dynamic = 'force-dynamic';

/**
 * GET    /api/expenses/attachments/[id]  — returns { signed_url } (5-min TTL)
 * DELETE /api/expenses/attachments/[id]  — removes row + storage blob
 */

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const url = await ExpenseService.getSignedAttachmentUrl(params.id, 300);
  if (!url) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ signed_url: url, expires_in: 300 });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    await ExpenseService.deleteAttachment(params.id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Delete failed' }, { status: 500 });
  }
}
