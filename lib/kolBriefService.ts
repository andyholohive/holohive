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
  kols: BriefConsoleKol[];
}

export interface BriefConsole {
  lineup_id: string;
  campaign_id: string;
  week_number: number | null;
  week_of: string | null;
  status: string;
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
 */
export function computeBriefExpiry(weekOf: string | Date | null): string {
  const d = weekOf ? new Date(weekOf) : new Date();
  d.setUTCDate(d.getUTCDate() + (weekOf ? 13 : 10));
  d.setUTCHours(23, 59, 59, 0);
  return d.toISOString();
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
  async mintTokensForLineup(lineupId: string, actorId?: string): Promise<{ minted: number; total: number }> {
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
    if (angleList.length === 0) return { minted: 0, total: 0 };

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
      const key = `${slot.kol_id}:${angle.sort_order}`;
      if (seen.has(key)) continue;
      seen.add(key);
      toInsert.push({
        token: generateBriefToken(),
        kol_id: slot.kol_id,
        campaign_id: lineup.campaign_id,
        lineup_id: lineup.id,
        week_number: lineup.week_number,
        angle_no: angle.sort_order,
        angle_name: angle.angle_name,
        expires_at: expiresAt,
      });
    }

    if (toInsert.length > 0) {
      const { error: insErr } = await (this.supabase as any).from('kol_brief_tokens').insert(toInsert);
      if (insErr) throw new Error(insErr.message);
    }
    void actorId;
    return { minted: toInsert.length, total: slotList.length };
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

    const angleById = new Map(angleList.map(a => [a.id, a]));
    let sentCount = 0, openedCount = 0, totalCount = 0;
    const anglesOut: BriefConsoleAngle[] = angleList.map(a => ({
      angle_no: a.sort_order,
      angle_name: a.angle_name,
      message: messageByAngle.get(a.sort_order) ?? '',
      kols: [] as BriefConsoleKol[],
    }));
    const angleOutByNo = new Map(anglesOut.map(a => [a.angle_no, a]));

    for (const slot of slotList) {
      const angle = angleById.get(slot.angle_id);
      if (!angle) continue;
      const kol = slot.master_kols || {};
      const tok = tokenByKey.get(`${slot.kol_id}:${angle.sort_order}`);
      totalCount++;
      if (tok?.sent_at) sentCount++;
      if (tok?.opened_at) openedCount++;
      angleOutByNo.get(angle.sort_order)?.kols.push({
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

    return {
      lineup_id: lineup.id,
      campaign_id: lineup.campaign_id,
      week_number: lineup.week_number,
      week_of: lineup.week_of,
      status: lineup.status,
      angles: anglesOut,
      sentCount,
      openedCount,
      totalCount,
      expiresAt: computeBriefExpiry(lineup.week_of),
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
