import { lineupWeekEnded } from '@/lib/lineupDeadline';

export interface DraftKol { id: string; name: string; handle: string | null }
export interface DraftStaff { id: string; name: string }

export interface OpenSlot {
  slotId: string;
  campaignId: string;
  campaignName: string;
  clientName: string;
  weekNumber: number | null;
  weekOf: string;
  angleIndex: number;
  angleName: string | null;
}

/** The KOL that owns this group chat. Same bridge /wallet and /submit use. */
export async function resolveKolByChat(sb: any, chatId: string): Promise<DraftKol | null> {
  const { data } = await sb
    .from('telegram_chats')
    .select('master_kol_id, kol:master_kols!inner(id, name, telegram_username)')
    .eq('chat_id', chatId)
    .not('master_kol_id', 'is', null)
    .maybeSingle();
  const kol = (data as any)?.kol;
  if (!kol?.id) return null;
  return { id: kol.id, name: kol.name, handle: (kol.telegram_username || '').replace(/^@/, '') || null };
}

/** A team member, by Telegram user id. Deactivated accounts don't count. */
export async function resolveStaff(sb: any, tgUserId: number | string | null | undefined): Promise<DraftStaff | null> {
  if (!tgUserId) return null;
  const { data } = await sb
    .from('users')
    .select('id, name, is_active')
    .eq('telegram_id', String(tgUserId))
    .maybeSingle();
  if (!data || (data as any).is_active === false) return null;
  return { id: (data as any).id, name: (data as any).name || 'Team' };
}

/**
 * Confirmed lineup slots for this KOL that are not posted, one per campaign.
 *
 * /submit never needed a slot (it resolves campaign + KOL only), so this is
 * new. A slot counts while its lineup is confirmed, its week has not ended
 * (Sunday 23:59 KST) and the campaign is not Completed, Paused or archived.
 * When a KOL holds several open slots on one campaign, the earliest one
 * without an approved draft is used.
 */
export async function findOpenSlots(sb: any, kolId: string): Promise<OpenSlot[]> {
  const { data, error } = await sb
    .from('lineup_slots')
    .select(`
      id, sort_order, status,
      angle:lineup_angles!inner(
        id, angle_name, sort_order,
        lineup:campaign_lineups!inner(
          id, status, week_of, week_number,
          campaign:campaigns!inner(id, name, status, archived_at, client:clients(id, name))
        )
      )
    `)
    .eq('kol_id', kolId)
    .eq('status', 'pending');
  if (error) {
    console.error('[/draft] slot lookup failed:', error.message);
    return [];
  }
  type Row = {
    id: string; sort_order: number | null;
    angle: { angle_name: string | null; sort_order: number | null; lineup: {
      status: string; week_of: string; week_number: number | null;
      campaign: { id: string; name: string; status: string | null; archived_at: string | null; client: { name: string } | null };
    } };
  };
  const rows = ((data ?? []) as Row[])
    .filter(r => {
      const l = r.angle?.lineup; const c = l?.campaign;
      return !!l && !!c
        && l.status === 'confirmed'
        && !lineupWeekEnded(l.week_of)
        && c.status !== 'Completed' && c.status !== 'Paused' && !c.archived_at;
    })
    .sort((a, b) =>
      a.angle.lineup.week_of.localeCompare(b.angle.lineup.week_of)
      || (a.angle.sort_order ?? 0) - (b.angle.sort_order ?? 0)
      || (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (rows.length === 0) return [];

  const { data: approved } = await sb
    .from('content_drafts')
    .select('lineup_slot_id')
    .in('lineup_slot_id', rows.map(r => r.id))
    .eq('status', 'approved');
  const done = new Set(((approved ?? []) as Array<{ lineup_slot_id: string }>).map(r => r.lineup_slot_id));

  const byCampaign = new Map<string, Row>();
  for (const r of rows) {
    const cid = r.angle.lineup.campaign.id;
    const cur = byCampaign.get(cid);
    if (!cur || (done.has(cur.id) && !done.has(r.id))) byCampaign.set(cid, r);
  }
  return Array.from(byCampaign.values()).map(r => {
    const l = r.angle.lineup; const c = l.campaign;
    return {
      slotId: r.id,
      campaignId: c.id,
      campaignName: c.name,
      clientName: c.client?.name || c.name,
      weekNumber: l.week_number,
      weekOf: l.week_of,
      angleIndex: (r.angle.sort_order ?? 0) + 1,
      angleName: r.angle.angle_name,
    };
  });
}

/** Posting deadline for a lineup week: Sunday 23:59:59 KST. */
export function slotDeadline(weekOf: string): Date {
  return new Date(Date.parse(`${weekOf}T00:00:00Z`) - 9 * 3_600_000 + 7 * 86_400_000 - 1);
}

/**
 * The approved draft a new /submit should link to: the latest approved draft
 * for this KOL on this campaign that no content item has claimed yet.
 */
export async function claimableApprovedDraftId(sb: any, kolId: string, campaignId: string): Promise<string | null> {
  const { data: drafts } = await sb
    .from('content_drafts')
    .select('id')
    .eq('kol_id', kolId)
    .eq('campaign_id', campaignId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(10);
  const ids = ((drafts ?? []) as Array<{ id: string }>).map(d => d.id);
  if (ids.length === 0) return null;
  const { data: used } = await sb.from('content_items').select('draft_id').in('draft_id', ids);
  const taken = new Set(((used ?? []) as Array<{ draft_id: string }>).map(u => u.draft_id));
  return ids.find(id => !taken.has(id)) ?? null;
}
