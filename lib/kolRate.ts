/**
 * KOL rate resolution — one place, because there were two.
 *
 * [2026-07-29] Jdot's "KOLs we have already paid show $0 / blank pricing",
 * flagged 12 Jul and re-flagged five times. It is three defects with one root:
 * two columns for one concept.
 *
 *   • `master_kols.post_price`   — what every UI editor writes. 210 of 320
 *                                  live KOLs have it.
 *   • `master_kols.standard_rate`— what the payment cascades read. 26 have it.
 *
 * 189 KOLs have post_price set and standard_rate NULL, so the cascade found
 * nothing and defaulted to 0. The decisive number: where BOTH are set they
 * never disagree — 21 agree, 0 conflict. standard_rate carries no information
 * post_price doesn't already have. It is a vestigial copy, not a second
 * concept, so there is no reconciliation call to make: prefer post_price and
 * keep standard_rate as a fallback for the handful of rows that only have it.
 *
 * Second defect, same family: a stored `agreed_rate` of 0 was treated as a
 * real negotiated rate by `(agreed_rate ?? null) !== null`, so it beat a valid
 * standard rate and produced a $0 payment. 12 campaign_kols rows carry it.
 * Zero is not a rate anyone agreed — it is the absence of one. If a genuine
 * $0/barter deal ever needs modelling it should be an explicit flag, not a
 * magic number that silently wins.
 *
 * The 139 existing $0 payments are NOT touched by this — fixing the cascade
 * only affects payments created from here on. Repricing them is a separate
 * data pass.
 */

export interface KolRateSource {
  post_price?: number | string | null;
  standard_rate?: number | string | null;
  repost_rate?: number | string | null;
}

/** Columns any caller must select for these helpers to work. */
export const KOL_RATE_COLUMNS = 'post_price, standard_rate, repost_rate' as const;

function toNumber(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * The KOL's standard per-post rate. Prefers `post_price` (what the UI writes)
 * and falls back to `standard_rate` (what the cascade historically read).
 */
export function effectiveStandardRate(kol: KolRateSource | null | undefined): number | null {
  if (!kol) return null;
  return toNumber(kol.post_price) ?? toNumber(kol.standard_rate);
}

/**
 * Is there a real negotiated rate on this campaign_kol?
 * Explicitly false for 0 — see the note above.
 */
export function hasAgreedRate(agreedRate: number | string | null | undefined): boolean {
  const n = toNumber(agreedRate);
  return n !== null && n !== 0;
}

/**
 * Resolve the amount a payment row should carry.
 *
 * Order: agreed rate → repost rate (or half the standard) → standard → the
 * caller's own fallback (e.g. the KOL's most recent payment) → 0.
 */
export function resolvePaymentAmount(opts: {
  contentType: string | null | undefined;
  agreedRate: number | string | null | undefined;
  kol: KolRateSource | null | undefined;
  fallback?: number | null;
}): number {
  const { contentType, agreedRate, kol, fallback } = opts;
  const standard = effectiveStandardRate(kol);

  if (contentType === 'Repost') {
    const repost = toNumber(kol?.repost_rate);
    if (repost !== null) return repost;
    if (standard !== null) return Math.round(standard * 0.5 * 100) / 100;
    return 0;
  }

  if (hasAgreedRate(agreedRate)) return toNumber(agreedRate)!;
  if (standard !== null) return standard;
  return fallback ?? 0;
}
