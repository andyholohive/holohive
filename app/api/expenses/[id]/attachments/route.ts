import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/requireSuperAdmin';
import { ExpenseService, ALLOWED_ATTACHMENT_MIME, MAX_ATTACHMENT_SIZE_BYTES } from '@/lib/expenseService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/expenses/[id]/attachments
 *   Body: multipart/form-data with field "file"
 *
 * Per-file: 10 MB max, MIME must be in allowed list (JPG/PNG/GIF/WebP/PDF).
 * Per-expense: max 5 attachments (enforced in service).
 *
 * Returns the new attachment row (file_url is the storage key — UI
 * needs to call GET /api/expenses/attachments/[id]/signed-url to
 * view it).
 */

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  let formData: FormData;
  try { formData = await request.formData(); }
  catch { return NextResponse.json({ error: 'Multipart parse failed' }, { status: 400 }); }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file in "file" field' }, { status: 400 });
  }

  // Tighten validation client-side errors before hitting storage
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return NextResponse.json({ error: `File exceeds ${MAX_ATTACHMENT_SIZE_BYTES} bytes` }, { status: 413 });
  }
  if (!ALLOWED_ATTACHMENT_MIME.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported type: ${file.type}` }, { status: 415 });
  }

  try {
    const buffer = await file.arrayBuffer();
    const attachment = await ExpenseService.addAttachment({
      expenseId: params.id,
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
