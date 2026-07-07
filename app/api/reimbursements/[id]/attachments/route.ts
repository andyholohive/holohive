import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';
import { ReimbursementService } from '@/lib/reimbursementService';
import { ALLOWED_ATTACHMENT_MIME, MAX_ATTACHMENT_SIZE_BYTES } from '@/lib/expenseService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET  /api/reimbursements/[id]/attachments — list receipts (owner or super-admin)
 * POST /api/reimbursements/[id]/attachments — upload a receipt (owner, pending only)
 *   Body: multipart/form-data with field "file"
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.response;

  const req = await ReimbursementService.getById(params.id);
  if (!req) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  if (req.requested_by !== guard.user.id && guard.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const attachments = await ReimbursementService.listAttachments(params.id);
  return NextResponse.json({ attachments });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.response;

  const req = await ReimbursementService.getById(params.id);
  if (!req) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  if (req.requested_by !== guard.user.id) {
    return NextResponse.json({ error: 'You can only attach to your own request' }, { status: 403 });
  }
  if (req.status !== 'pending') {
    return NextResponse.json({ error: 'Cannot attach to a reviewed request' }, { status: 409 });
  }

  let formData: FormData;
  try { formData = await request.formData(); }
  catch { return NextResponse.json({ error: 'Multipart parse failed' }, { status: 400 }); }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file in "file" field' }, { status: 400 });
  }
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return NextResponse.json({ error: `File exceeds ${MAX_ATTACHMENT_SIZE_BYTES} bytes` }, { status: 413 });
  }
  if (!ALLOWED_ATTACHMENT_MIME.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported type: ${file.type}` }, { status: 415 });
  }

  try {
    const buffer = await file.arrayBuffer();
    const attachment = await ReimbursementService.addAttachment({
      requestId: params.id,
      fileName: file.name,
      fileBuffer: buffer,
      mimeType: file.type,
      fileSizeBytes: file.size,
    });
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Upload failed' }, { status: 500 });
  }
}
