/**
 * Signal deduplication utilities.
 * Handles both source-specific and semantic (cross-source) dedup.
 */

/** Extract core words from a headline for semantic matching (source-independent) */
export function headlineFingerprint(headline: string): string {
  return (headline || '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .sort()
    .slice(0, 8)
    .join('|');
}

/**
 * Check if a signal is a duplicate of an existing one.
 * Uses both source-specific (exact key) and semantic (fingerprint) dedup.
 */
export function isDuplicate(
  signal: { prospect_id: string; signal_type: string; source_name: string; headline: string },
  existingKeys: Set<string>,
  semanticKeys: Set<string>
): boolean {
  // Source-specific dedup
  const key = `${signal.prospect_id}|${signal.signal_type}|${signal.source_name}|${signal.headline?.substring(0, 100)}`;
  if (existingKeys.has(key)) return true;

  // Semantic dedup: same prospect + type + similar headline across ANY source
  const semanticKey = `${signal.prospect_id}|${signal.signal_type}|${headlineFingerprint(signal.headline)}`;
  if (semanticKeys.has(semanticKey)) return true;

  return false;
}

/**
 * Register a signal as seen (for future dedup checks).
 */
export function markSeen(
  signal: { prospect_id: string; signal_type: string; source_name: string; headline: string },
  existingKeys: Set<string>,
  semanticKeys: Set<string>
): void {
  const key = `${signal.prospect_id}|${signal.signal_type}|${signal.source_name}|${signal.headline?.substring(0, 100)}`;
  existingKeys.add(key);

  const semanticKey = `${signal.prospect_id}|${signal.signal_type}|${headlineFingerprint(signal.headline)}`;
  semanticKeys.add(semanticKey);
}
