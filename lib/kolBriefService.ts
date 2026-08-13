/**
 * KOL Brief Delivery — service layer (spec v2, 2026-07-13).
 *
 * Per-KOL tokenized brief pages minted from a confirmed lineup, with an
 * append-only open log and a per-angle outreach message template. Client-side
 * import via `KolBriefService` from this file; the token/open primitives are
 * safe to call from a server route with a service-role client too.
 *
 * ARCHITECTURE NOTE [2026-07-16]: the spec locks tokens + open-events into a
 * separate shared "delivery" Supabase project. That project isn't provisioned
 * yet, so v1 stores them in the main HHP Supabase (tables kol_brief_tokens,
 * kol_brief_open_events, campaign_angle_messages). The per-KOL Vercel page
 * reads/logs via a token-gated public HHP endpoint (Phase 2). Reversible —
 * migrate to the shared project when it lands.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { isAllowedBriefPageRef, allowedBriefHosts } from '@/lib/briefPageRef';
import {
  deriveLineupLifecycleStage,
  type LineupBriefStats,
  type LineupLifecycleStage,
  type LineupStatus,
} from '@/lib/lineupManagerService';

export interface BriefToken {
  id: string;
  token: string;
  kol_id: string;
  campaign_id: string;
  lineup_id: string | null;
  week_number: number | null;
  angle_no: number | null;
  angle_name: string | null;
  page_ref: string | null;
  expires_at: string;
  sent_at: string | null;
  sent_by: string | null;
  opened_at: string | null;
  open_count: number;
}

export interface BriefConsoleKol {
  kol_id: string;
  name: string;
  handle: string | null;
  platform: string | null;
  token: string | null;
  page_ref: string | null;
  expires_at: string | null;
  sent_at: string | null;
  opened_at: string | null;
  open_count: number;
}

export interface BriefConsoleAngle {
  angle_no: number;
  angle_name: string;
  message: string;
  /**
   * The published brief page for this angle. Stored per-token (every KOL on
   * the angle shares one page), surfaced here per-angle because that is the
   * unit a manager sets it at. Null until the generator posts it or someone
   * pastes it in the console.
   */
  page_ref: string | null;
  kols: BriefConsoleKol[];
}

export interface BriefConsole {
  lineup_id: string;
  campaign_id: string;
  week_number: number | null;
  week_of: string | null;
  status: string;
  /**
   * Extended lifecycle stage (brief_preview / approved / delivered when
   * confirmed) — derived from the token store, never persisted. See
   * `deriveLineupLifecycleStage` in lib/lineupManagerService.ts.
   */
  stage: LineupLifecycleStage;
  angles: BriefConsoleAngle[];
  sentCount: number;
  openedCount: number;
  totalCount: number;
  expiresAt: string | null;
}

/** Unguessable URL token. Works in both browser and Node (no Buffer dependency). */
export function generateBriefToken(): string {
  const bytes = new Uint8Array(24);
  (globalThis.crypto as Crypto).getRandomValues(bytes);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa !== 'undefined'
    ? btoa(bin)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    : require('buffer').Buffer.from(bin, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Expiry = Sunday at the end of the week AFTER the lineup week (~10 days from
 * mid-week send), per spec §5. week_of is the lineup week's Monday; +13 days
 * lands on the following Sunday. Falls back to +10 days if week_of is absent.
 *
 * [2026-07-27] Never returns a date in the past. Minting for a week whose
 * Sunday has already gone produced links that were dead the moment they were
 * created — six TESTAMENT links were minted eight days after their own expiry,
 * and every KOL who opened one would have got "this brief link has expired".
 * There was no way to notice: nothing in the console showed the expiry had
 * already passed, and re-approving does not recompute it.
 *
 * The fallback applies the SAME rule to the current week rather than the
 * lineup week — this week's Monday + 13 — so a late mint gets the identical
 * "you have this week and next" window instead of an arbitrary grace period.
 */
export function computeBriefExpiry(weekOf: string | Date | null): string {
  const endOfWeekAfter = (mondayish: Date): Date => {
    const d = new Date(mondayish);
    d.setUTCDate(d.getUTCDate() + 13);
    d.setUTCHours(23, 59, 59, 0);
    return d;
  };

  const now = new Date();
  let expiry: Date;
  if (weekOf) {
    expiry = endOfWeekAfter(new Date(weekOf));
  } else {
    expiry = new Date(now);
    expiry.setUTCDate(expiry.getUTCDate() + 10);
    expiry.setUTCHours(23, 59, 59, 0);
  }

  if (expiry.getTime() <= now.getTime()) {
    // Back up to the current week's Monday, then apply the same +13.
    const monday = new Date(now);
    // getUTCDay(): 0=Sun … 6=Sat. Sunday belongs to the week that just ended.
    const offset = monday.getUTCDay() === 0 ? 6 : monday.getUTCDay() - 1;
    monday.setUTCDate(monday.getUTCDate() - offset);
    expiry = endOfWeekAfter(monday);
  }
  return expiry.toISOString();
}

/**
 * The one place `lineup_angles.sort_order` becomes a public `angle_no`.
 *
 * [2026-07-27] sort_order is 0-based; every human-facing label is 1-based —
 * the angle whose sort_order is 0 is literally named "Angle 1". angle_no used
 * to be a straight copy of sort_order, so the number HHP stored, published in
 * the page_ref contract, and rendered in the delivery console was one less
 * than the number everyone says out loud.
 *
 * That is worse than a cosmetic mismatch, because angle_no is the join key the
 * generator posts against. On a two-angle week, a generator following the
 * contract ("angles are numbered 1, 2, 3…") would attach angle 1's creative
 * card to angle 2's KOLs and match nothing for angle 2 — while the response
 * still came back {ok: true, tokensUpdated: N}. Wrong briefs to real creators,
 * reported as success.
 *
 * Converting here means the stored value, the wire contract, the console and
 * the lineup all say the same number. Callers must never read sort_order as an
 * angle_no directly.
 */
function angleNoOf(sortOrder: number): number {
  return sortOrder + 1;
}

/** Derive a display handle for {{handle}} substitution from a KOL row. */
function deriveHandle(link: string | null, name: string): string {
  if (link) {
    const m = link.match(/(?:x\.com|twitter\.com|t\.me|youtube\.com\/@)\/?@?([A-Za-z0-9_]+)/i);
    if (m) return m[1];
  }
  return name;
}

export class KolBriefService {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Mint one token per (KOL, angle) in the lineup — idempotent. Existing tokens
   * are preserved (never rotated on re-mint, so an already-sent link stays
   * valid); only genuinely-new (KOL, angle) slots get a fresh token. Returns
   * the number of tokens newly created.
   */
  async mintTokensForLineup(
    lineupId: string,
    actorId?: string,
  ): Promise<{ minted: number; total: number; revived: number }> {
    const { data: lineup, error: lErr } = await (this.supabase as any)
      .from('campaign_lineups')
      .select('id, campaign_id, week_number, week_of')
      .eq('id', lineupId)
      .single();
    if (lErr || !lineup) throw new Error(lErr?.message || 'Lineup not found');

    const { data: angles } = await (this.supabase as any)
      .from('lineup_angles')
      .select('id, angle_name, sort_order')
      .eq('lineup_id', lineupId);
    const angleList = (angles ?? []) as Array<{ id: string; angle_name: string; sort_order: number }>;
    if (angleList.length === 0) return { minted: 0, total: 0, revived: 0 };

    const angleById = new Map(angleList.map(a => [a.id, a]));
    const { data: slots } = await (this.supabase as any)
      .from('lineup_slots')
      .select('kol_id, angle_id')
      .in('angle_id', angleList.map(a => a.id));
    const slotList = (slots ?? []) as Array<{ kol_id: string; angle_id: string }>;

    // Existing tokens for this campaign/week, keyed kol:angle.
    const { data: existing } = await (this.supabase as any)
      .from('kol_brief_tokens')
      .select('id, kol_id, angle_no')
      .eq('campaign_id', lineup.campaign_id)
      .eq('week_number', lineup.week_number);
    const seen = new Set(
      ((existing ?? []) as Array<{ kol_id: string; angle_no: number }>).map(r => `${r.kol_id}:${r.angle_no}`),
    );

    const expiresAt = computeBriefExpiry(lineup.week_of);
    const toInsert: any[] = [];
    for (const slot of slotList) {
      const angle = angleById.get(slot.angle_id);
      if (!angle) continue;
      const key = `${slot.kol_id}:${angleNoOf(angle.sort_order)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      toInsert.push({
        token: generateBriefToken(),
        kol_id: slot.kol_id,
        campaign_id: lineup.campaign_id,
        lineup_id: lineup.id,
        week_number: lineup.week_number,
        angle_no: angleNoOf(angle.sort_order),
        angle_name: angle.angle_name,
        expires_at: expiresAt,
      });
    }

    if (toInsert.length > 0) {
      const { error: insErr } = await (this.supabase as any).from('kol_brief_tokens').insert(toInsert);
      if (insErr) throw new Error(insErr.message);
    }

    // [2026-07-27] Re-approving also refreshes expiry on tokens that already
    // expired. Tokens are never rotated (an already-sent link must keep
    // working), which previously meant a week minted late was stuck dead
    // forever: mint skipped the existing rows, and nothing else could write
    // expires_at. Approve is the manager saying "make this week's links
    // usable", so honour that. Only past-dated rows are touched — a live link
    // never silently gains extra life from an incidental re-approve.
    const { data: revived } = await (this.supabase as any)
      .from('kol_brief_tokens')
      .update({ expires_at: expiresAt, updated_at: new Date().toISOString() })
      .eq('lineup_id', lineup.id)
      .lt('expires_at', new Date().toISOString())
      .select('id');

    void actorId;
    return {
      minted: toInsert.length,
      total: slotList.length,
      revived: (revived ?? []).length,
    };
  }

  /** Assemble the Briefs & Delivery console view for a lineup week. */
  async getConsoleData(lineupId: string): Promise<BriefConsole> {
    const { data: lineup, error: lErr } = await (this.supabase as any)
      .from('campaign_lineups')
      .select('id, campaign_id, week_number, week_of, status')
      .eq('id', lineupId)
      .single();
    if (lErr || !lineup) throw new Error(lErr?.message || 'Lineup not found');

    const { data: angles } = await (this.supabase as any)
      .from('lineup_angles')
      .select('id, angle_name, sort_order')
      .eq('lineup_id', lineupId)
      .order('sort_order');
    const angleList = (angles ?? []) as Array<{ id: string; angle_name: string; sort_order: number }>;

    const { data: slots } = await (this.supabase as any)
      .from('lineup_slots')
      .select('kol_id, angle_id, sort_order, master_kols:master_kols(id, name, link, platform)')
      .in('angle_id', angleList.map(a => a.id))
      .order('sort_order');
    const slotList = (slots ?? []) as any[];

    const { data: tokens } = await (this.supabase as any)
      .from('kol_brief_tokens')
      .select('*')
      .eq('campaign_id', lineup.campaign_id)
      .eq('week_number', lineup.week_number);
    const tokenByKey = new Map(
      ((tokens ?? []) as BriefToken[]).map(t => [`${t.kol_id}:${t.angle_no}`, t]),
    );

    const { data: messages } = await (this.supabase as any)
      .from('campaign_angle_messages')
      .select('angle_no, message')
      .eq('lineup_id', lineupId);
    const messageByAngle = new Map(
      ((messages ?? []) as Array<{ angle_no: number; message: string }>).map(m => [m.angle_no, m.message]),
    );

    // page_ref lives on every token for the angle, so read it back from the
    // first token that has one rather than adding a parallel store that could
    // disagree with what the KOL pages actually serve.
    const pageRefByAngle = new Map<number, string>();
    for (const t of (tokens ?? []) as BriefToken[]) {
      if (t.angle_no != null && t.page_ref && !pageRefByAngle.has(t.angle_no)) {
        pageRefByAngle.set(t.angle_no, t.page_ref);
      }
    }

    const angleById = new Map(angleList.map(a => [a.id, a]));
    let sentCount = 0, openedCount = 0, totalCount = 0;
    const anglesOut: BriefConsoleAngle[] = angleList.map(a => ({
      angle_no: angleNoOf(a.sort_order),
      angle_name: a.angle_name,
      message: messageByAngle.get(angleNoOf(a.sort_order)) ?? '',
      page_ref: pageRefByAngle.get(angleNoOf(a.sort_order)) ?? null,
      kols: [] as BriefConsoleKol[],
    }));
    const angleOutByNo = new Map(anglesOut.map(a => [a.angle_no, a]));

    for (const slot of slotList) {
      const angle = angleById.get(slot.angle_id);
      if (!angle) continue;
      const kol = slot.master_kols || {};
      const tok = tokenByKey.get(`${slot.kol_id}:${angleNoOf(angle.sort_order)}`);
      totalCount++;
      if (tok?.sent_at) sentCount++;
      if (tok?.opened_at) openedCount++;
      angleOutByNo.get(angleNoOf(angle.sort_order))?.kols.push({
        kol_id: slot.kol_id,
        name: kol.name ?? 'KOL',
        handle: deriveHandle(kol.link ?? null, kol.name ?? ''),
        platform: kol.platform ?? null,
        token: tok?.token ?? null,
        page_ref: tok?.page_ref ?? null,
        expires_at: tok?.expires_at ?? null,
        sent_at: tok?.sent_at ?? null,
        opened_at: tok?.opened_at ?? null,
        open_count: tok?.open_count ?? 0,
      });
    }

    // Stage math runs on the token rows (not slots) so it matches
    // getTokenStatsByLineup — minted = tokens, delivered = all tokens sent.
    const tokenRows = (tokens ?? []) as BriefToken[];
    const briefStats: LineupBriefStats = {
      minted: tokenRows.length,
      sent: tokenRows.filter(t => t.sent_at).length,
    };

    return {
      lineup_id: lineup.id,
      campaign_id: lineup.campaign_id,
      week_number: lineup.week_number,
      week_of: lineup.week_of,
      status: lineup.status,
      stage: deriveLineupLifecycleStage(lineup.status as LineupStatus, briefStats, lineup.week_of),
      angles: anglesOut,
      sentCount,
      openedCount,
      totalCount,
      // The REAL expiry once tokens exist, not a recomputation. These can
      // disagree — tokens minted under an older rule keep the date they were
      // stamped with — and showing the computed one would report a healthy
      // week over links that are already dead. Earliest wins: that is when the
      // first KOL loses access. Falls back to the computed value pre-mint,
      // where it is a forecast rather than a fact.
      expiresAt: tokenRows.length > 0
        ? tokenRows.reduce((min, t) => (t.expires_at < min ? t.expires_at : min), tokenRows[0].expires_at)
        : computeBriefExpiry(lineup.week_of),
    };
  }

  /** Save/overwrite the one shared outreach message for an angle. */
  async upsertAngleMessage(lineupId: string, campaignId: string, angleNo: number, message: string, actorId?: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('campaign_angle_messages')
      .upsert(
        { lineup_id: lineupId, campaign_id: campaignId, angle_no: angleNo, message, created_by: actorId ?? null, updated_at: new Date().toISOString() },
        { onConflict: 'lineup_id,angle_no' },
      );
    if (error) throw new Error(error.message);
  }

  /**
   * Point an angle's minted tokens at a published brief page.
   *
   * [2026-07-27] The generator normally sets this over
   * /api/mcp/kol-brief/page-ref with the CRON_SECRET. That left no way for a
   * person to do it, so a week's links stayed dead until the generator shipped
   * — which is how six TESTAMENT links got minted against zero pages. This is
   * the manual path: paste the published URL, every token on the angle gets
   * it, and the KOL pages stop showing "being prepared".
   *
   * Same host allowlist as the machine endpoint, deliberately shared rather
   * than re-implemented, so a pasted URL can never be laxer than a posted one.
   * Passing an empty string clears the page_ref (back to the placeholder).
   *
   * Returns how many tokens were updated — 0 means the week has no minted
   * tokens for that angle yet, which is worth surfacing rather than silently
   * reporting success.
   */
  async setAnglePageRef(lineupId: string, angleNo: number, pageRef: string): Promise<number> {
    const trimmed = pageRef.trim();
    if (trimmed && !isAllowedBriefPageRef(trimmed)) {
      throw new Error(
        `Must be an https:// URL on an allowed host (${allowedBriefHosts().join(', ')}).`,
      );
    }
    const { data, error } = await (this.supabase as any)
      .from('kol_brief_tokens')
      .update({ page_ref: trimmed || null, updated_at: new Date().toISOString() })
      .eq('lineup_id', lineupId)
      .eq('angle_no', angleNo)
      .select('id');
    if (error) throw new Error(error.message);
    return (data ?? []).length;
  }

  /** Mark a KOL's brief as sent (fired when the manager copies the message). */
  async markSent(tokenId: string, actorId?: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('kol_brief_tokens')
      .update({ sent_at: new Date().toISOString(), sent_by: actorId ?? null, updated_at: new Date().toISOString() })
      .eq('id', tokenId);
    if (error) throw new Error(error.message);
  }

  /**
   * Record an open (called from the token-gated public page endpoint, Phase 2).
   * Append-only event + denormalized first-open/count on the token. Returns the
   * token row (with page_ref) so the page can render, or null if invalid/expired.
   */
  async recordOpen(token: string, ctx?: { ip?: string; userAgent?: string }): Promise<BriefToken | null> {
    const { data: row } = await (this.supabase as any)
      .from('kol_brief_tokens')
      .select('*')
      .eq('token', token)
      .maybeSingle();
    const tok = row as BriefToken | null;
    if (!tok) return null;
    if (new Date(tok.expires_at).getTime() < Date.now()) return null;

    await (this.supabase as any).from('kol_brief_open_events').insert({
      token_id: tok.id,
      ip: ctx?.ip ?? null,
      user_agent: ctx?.userAgent ?? null,
    });
    await (this.supabase as any)
      .from('kol_brief_tokens')
      .update({ opened_at: tok.opened_at ?? new Date().toISOString(), open_count: (tok.open_count ?? 0) + 1 })
      .eq('id', tok.id);
    return tok;
  }

  /**
   * Batch token stats per lineup — one query for the whole week selector.
   * Feeds `deriveLineupLifecycleStage` so the Lineups tab can show the
   * extended stages (Brief preview / Approved / Delivered) on confirmed
   * weeks. Lineups with no tokens simply have no entry in the map.
   */
  async getTokenStatsByLineup(lineupIds: string[]): Promise<Map<string, LineupBriefStats>> {
    const map = new Map<string, LineupBriefStats>();
    if (lineupIds.length === 0) return map;
    const { data } = await (this.supabase as any)
      .from('kol_brief_tokens')
      .select('lineup_id, sent_at')
      .in('lineup_id', lineupIds);
    for (const r of (data ?? []) as Array<{ lineup_id: string | null; sent_at: string | null }>) {
      if (!r.lineup_id) continue;
      const s = map.get(r.lineup_id) ?? { minted: 0, sent: 0 };
      s.minted += 1;
      if (r.sent_at) s.sent += 1;
      map.set(r.lineup_id, s);
    }
    return map;
  }

  /** Un-opened, already-sent KOLs for a week — feeds the Friday APAC nudge (Phase 4). */
  async listUnopenedForWeek(campaignId: string, weekNumber: number): Promise<BriefToken[]> {
    const { data } = await (this.supabase as any)
      .from('kol_brief_tokens')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('week_number', weekNumber)
      .not('sent_at', 'is', null)
      .is('opened_at', null);
    return (data ?? []) as BriefToken[];
  }
}
