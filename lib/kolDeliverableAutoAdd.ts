/**
 * Auto-append a content type to a KOL's master_kols.deliverables list
 * when the type is logged on any campaign content row. Idempotent:
 * silently skips if the label is already present (or if the input
 * type isn't a recognized contents.type value).
 *
 * Maps contents.type → master_kols.deliverables label:
 *   - QRT     → 'Repost' (QRT stays in contents.type for now per
 *               Andy's TBC; the KOL-side picker uses 'Repost')
 *   - Post    → 'Post'
 *   - Video   → 'Video'
 *   - Article → 'Article'
 *   - AMA     → 'AMA'
 *   - Thread  → 'Thread'
 *   - Spaces  → 'Spaces'
 *   - Newsletter → 'Newsletter'
 *
 * Per spec (Andy 2026-06-29): every time a content type lands on a
 * KOL, ensure the corresponding label is in their deliverables. No
 * "first time only" check needed — the append is idempotent so the
 * cost of redundant calls is one extra round-trip per known label.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const CONTENT_TYPE_TO_DELIVERABLE: Record<string, string> = {
  Post: 'Post',
  QRT: 'Repost',
  Video: 'Video',
  Article: 'Article',
  AMA: 'AMA',
  Thread: 'Thread',
  Spaces: 'Spaces',
  Newsletter: 'Newsletter',
};

/**
 * Map a contents.type value to its master_kols.deliverables label.
 * Returns null for unrecognized types (the caller should no-op).
 */
export function mapContentTypeToDeliverable(contentType: string | null | undefined): string | null {
  if (!contentType) return null;
  return CONTENT_TYPE_TO_DELIVERABLE[contentType] ?? null;
}

/**
 * Append the label corresponding to `contentType` to the KOL's
 * deliverables array if it's not already there. Returns the updated
 * array (or null if no change was needed / KOL not found).
 */
export async function ensureKolDeliverable(
  supabase: SupabaseClient,
  masterKolId: string | null | undefined,
  contentType: string | null | undefined,
): Promise<string[] | null> {
  if (!masterKolId) return null;
  const label = mapContentTypeToDeliverable(contentType);
  if (!label) return null;

  const { data: kol } = await (supabase as any)
    .from('master_kols')
    .select('id, deliverables')
    .eq('id', masterKolId)
    .maybeSingle();
  if (!kol) return null;

  const current: string[] = Array.isArray(kol.deliverables) ? kol.deliverables : [];
  if (current.includes(label)) return null;

  const next = [...current, label];
  const { error } = await (supabase as any)
    .from('master_kols')
    .update({ deliverables: next })
    .eq('id', masterKolId);
  if (error) {
    console.warn('[kolDeliverableAutoAdd] update failed:', error.message);
    return null;
  }
  return next;
}
