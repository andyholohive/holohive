import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';
import { ReimbursementService } from '@/lib/reimbursementService';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reimbursements/attachments/[attId]/signed-url
 * Returns a short-lived signed URL for a receipt. Allowed for the request
 * owner or any super-admin.
 */
export async function GET(request: NextRequest, { params }: { params: { attId: string } }) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.response;

  // Resolve the attachment's owning request to authorize access.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: att } = await (admin as any)
    .from('reimbursement_attachments')
    .select('request_id')
    .eq('id', params.attId)
    .maybeSingle();
  if (!att) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const req = await ReimbursementService.getById(att.request_id);
  if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (req.requested_by !== guard.user.id && guard.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = await ReimbursementService.getSignedAttachmentUrl(params.attId);
  if (!url) return NextResponse.json({ error: 'Could not sign URL' }, { status: 500 });
  return NextResponse.json({ url });
}
