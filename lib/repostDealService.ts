import type { SupabaseClient } from '@supabase/supabase-js';
import { assembleScoreInputs, computeKolScores, type Tier } from './kolScoreService';

/**
 * Repost Deal Bot — Jdot's spec, 19 Jun 2026.
 *
 * Eligibility and the launch snapshot live here so the operator console's
 * preview and the launch itself cannot disagree. §7 step 3 shows the operator
 * "the maximum possible spend if the most expensive eligible KOLs all claim",
 * and that number is only meaningful if it was computed the same way as the
 * list that actually gets the offer.
 */

export type DealStatus = 'draft' | 'live' | 'closed' | 'settled';
export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'declined_cap';

export type EligibleKol = {
  master_kol_id: string;
  name: string;
  chat_id: string;
  price: number;
  tier: Tier;
  niche_tags: string[];
};

/**
 * Who can be offered a repost deal.
 *
 * Three gates, all from the spec:
 *   §3 — a share price must be logged. "A KOL with no repost price is
 *        invisible to the repost deal system." This is the gate that
 *        currently excludes almost the whole roster; collecting prices is a
 *        prerequisite step, not part of the live flow.
 *   §7 — niche tags and tier must match what the operator targeted.
 *   §2.3 — the bot delivers into the KOL's own group chat, so a KOL with no
 *        linked chat cannot receive anything and is not counted toward caps.
 */
export async function findEligibleKols(
  supabase: SupabaseClient<any>,
  opts: { nicheTags: string[]; tiers: string[] },
): Promise<EligibleKol[]> {
  const { data: kols } = await (supabase as any)
    .from('master_kols')
    .select('id, name, share_price, niche_tags, niche')
    .is('archived_at', null)
    .not('share_price', 'is', null);

  const rows = (kols ?? []) as Array<{
    id: string; name: string; share_price: number | string | null;
    niche_tags: string[] | null; niche: string[] | null;
  }>;
  if (rows.length === 0) return [];

  // Chat lookup — one query, not one per KOL.
  const { data: chats } = await (supabase as any)
    .from('telegram_chats')
    .select('chat_id, master_kol_id')
    .in('master_kol_id', rows.map(r => r.id));
  const chatByKol = new Map<string, string>();
  for (const c of (chats ?? []) as Array<{ chat_id: string; master_kol_id: string }>) {
    if (!chatByKol.has(c.master_kol_id)) chatByKol.set(c.master_kol_id, c.chat_id);
  }

  // Tier is derived from Channel Score, not stored, so it is computed here
  // and then frozen onto each offer at launch.
  const scores = computeKolScores(await assembleScoreInputs(supabase));

  const out: EligibleKol[] = [];
  for (const k of rows) {
    const price = Number(k.share_price);
    if (!Number.isFinite(price) || price <= 0) continue;

    const chatId = chatByKol.get(k.id);
    if (!chatId) continue;

    const tier = scores.get(k.id)?.scores.tier;
    if (!tier) continue;                                  // unscored KOL has no tier to cap against
    if (opts.tiers.length > 0 && !opts.tiers.includes(tier)) continue;

    const tags = (k.niche_tags?.length ? k.niche_tags : k.niche) ?? [];
    // Any-match, not all-match: a deal targeting "gaming, defi" wants both
    // audiences, not creators who cover both at once.
    if (opts.nicheTags.length > 0 && !opts.nicheTags.some(t => tags.includes(t))) continue;

    out.push({ master_kol_id: k.id, name: k.name, chat_id: chatId, price, tier, niche_tags: tags });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * §7 step 3 — what the console shows before launch: how many eligible per
 * tier, and the worst-case spend if the most expensive claimants fill every
 * slot. The operator sets the budget ceiling against this number, so it has
 * to be the maximum, not an average.
 */
export function previewCaps(
  eligible: EligibleKol[],
  tierCaps: Record<string, number>,
): { perTier: Record<string, { eligible: number; cap: number; maxSpend: number }>; maxSpend: number } {
  const perTier: Record<string, { eligible: number; cap: number; maxSpend: number }> = {};
  for (const tier of new Set([...eligible.map(e => e.tier), ...Object.keys(tierCaps)])) {
    const inTier = eligible.filter(e => e.tier === tier);
    const cap = Number(tierCaps[tier]) || 0;
    const priciest = [...inTier].sort((a, b) => b.price - a.price).slice(0, cap);
    perTier[tier] = {
      eligible: inTier.length,
      cap,
      maxSpend: priciest.reduce((s, e) => s + e.price, 0),
    };
  }
  return {
    perTier,
    maxSpend: Object.values(perTier).reduce((s, t) => s + t.maxSpend, 0),
  };
}
