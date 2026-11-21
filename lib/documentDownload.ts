/**
 * Signed URL that makes the browser SAVE a hosted document rather than open it.
 *
 * The viewer's signed URL comes back from Supabase Storage with no
 * Content-Disposition, so the PDF opens inline. A Download button pointing at
 * it can't fix that with `<a download>`: browsers ignore the attribute on a
 * cross-origin link, and the PDF lives on *.supabase.co, not app.holohive.io.
 * Signing with `{ download: filename }` makes Storage answer with
 * `Content-Disposition: attachment`, which every browser honours [2026-11-21].
 *
 * Only call this when the document's download_enabled is on — the URL is the
 * download, so handing it out is the permission.
 */

/** "Venice: Korea / Snapshot" → "Venice Korea Snapshot.pdf" */
export function documentFilename(title: string | null | undefined): string {
  const base = (title || 'Document')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.pdf$/i, '')
    .slice(0, 150) || 'Document';
  return `${base}.pdf`;
}

export async function signDocumentDownloadUrl(
  admin: any,
  storageRef: string,
  title: string | null | undefined,
): Promise<string | null> {
  const { data, error } = await admin.storage
    .from('client-documents')
    .createSignedUrl(storageRef, 3600, { download: documentFilename(title) });
  return error || !data?.signedUrl ? null : data.signedUrl;
}
