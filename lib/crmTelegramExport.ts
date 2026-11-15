import { supabase } from '@/lib/supabase';

/**
 * Telegram handles with the company they belong to, across the CRM.
 *
 * The Contacts export only covers the Contacts page (62 people, 4 of them
 * linked to a company as of 2026-11-16). Most Telegram points of contact live
 * on pipeline deals instead, where the deal name is the company. This pulls
 * both into one list.
 *
 * Deals are read here, in pages, rather than taken from a page's own state:
 * a plain select stops at 1,000 rows and the pipeline is at 950.
 */
export interface TelegramContactRow {
  company: string;
  telegram: string;
  contactName: string;
  source: 'Pipeline' | 'Contacts';
  stageOrRole: string;
}

/** "@handle" from a handle, an @handle or a t.me link. Empty when there is none. */
export function normalizeTelegramHandle(raw: string | null | undefined): string {
  const h = (raw || '').trim()
    .replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '')
    .replace(/^@/, '')
    .split(/[/?\s]/)[0];
  return h ? `@${h}` : '';
}

const PAGE = 1000;

export async function fetchTelegramContactRows(): Promise<TelegramContactRow[]> {
  const sb = supabase as any;
  const rows: TelegramContactRow[] = [];

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('crm_opportunities')
      .select('id, name, tg_handle, poc_platform, poc_handle, decision_maker_name, pipeline_stage, stage, bucket')
      .is('archived_at', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const o of (data ?? []) as any[]) {
      const tg = normalizeTelegramHandle(o.tg_handle)
        || (String(o.poc_platform || '').toLowerCase() === 'telegram' ? normalizeTelegramHandle(o.poc_handle) : '');
      if (!tg) continue;
      rows.push({
        company: o.name || '',
        telegram: tg,
        contactName: o.decision_maker_name || '',
        source: 'Pipeline',
        stageOrRole: o.pipeline_stage || o.stage || o.bucket || '',
      });
    }
    if (!data || data.length < PAGE) break;
  }

  const [{ data: contacts, error: cErr }, { data: links, error: lErr }] = await Promise.all([
    sb.from('crm_contacts').select('id, name, telegram_id, role'),
    sb.from('crm_contact_links').select('contact_id, opportunity:crm_opportunities(name), partner:crm_partners(name), affiliate:crm_affiliates(name)'),
  ]);
  if (cErr) throw cErr;
  if (lErr) throw lErr;
  const companyByContact = new Map<string, string>();
  for (const l of (links ?? []) as any[]) {
    const name = l.opportunity?.name || l.partner?.name || l.affiliate?.name;
    if (name && !companyByContact.has(l.contact_id)) companyByContact.set(l.contact_id, name);
  }
  for (const c of (contacts ?? []) as any[]) {
    const tg = normalizeTelegramHandle(c.telegram_id);
    if (!tg) continue;
    rows.push({
      company: companyByContact.get(c.id) || '',
      telegram: tg,
      contactName: c.name || '',
      source: 'Contacts',
      stageOrRole: c.role || '',
    });
  }

  // Companies A to Z, rows with no company last.
  return rows.sort((a, b) => (a.company ? 0 : 1) - (b.company ? 0 : 1) || a.company.localeCompare(b.company));
}
