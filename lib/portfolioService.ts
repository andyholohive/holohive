import { supabase } from './supabase';

/**
 * Client Portfolio — one dossier per live client, assembled from every system
 * that knows something about the relationship.
 *
 * [2026-09-11] Built for the reader who has never seen HHP or heard of Holo
 * Hive. The individual pages already answer "how is this campaign doing"; none
 * of them answers "what is going on with this client", because that answer is
 * spread across nine tables — the engagement terms, the weekly lineup and the
 * angles inside it, when the brief was proposed and confirmed, what the client
 * said in their own chat, what we sent them, whether they opened it, and what
 * the audience said back.
 *
 * Everything here is read-only and computed live rather than snapshotted, so
 * the page cannot quietly go stale the way a pasted summary does.
 *
 * Deliberately excluded: campaigns flagged `is_test`, and fee revenue. No fee
 * has been recorded against any engagement term, so every margin figure would
 * render $0 and read as "we earned nothing" rather than "nobody typed it in".
 */

export interface AngleView {
  name: string;
  creators: string[];
}

export interface WeekView {
  weekNumber: number;
  weekOf: string;
  status: string;
  slots: number;
  posted: number;
  missed: number;
  pending: number;
  angles: AngleView[];
  /** The brief cycle: when the plan was put up, signed off, and closed. */
  proposedAt: string | null;
  confirmedAt: string | null;
  closedAt: string | null;
  /** Days between the plan going up and the week starting. Negative = late. */
  leadDays: number | null;
  /** Hours the plan sat waiting for sign-off. */
  reviewHours: number | null;
}

export interface DocView {
  title: string;
  createdAt: string;
  opens: number;
  readers: number;
  minutes: number;
}

export interface MilestoneView {
  name: string;
  subtitle: string | null;
  status: string;
}

export interface LinkView {
  name: string;
  url: string;
  types: string[];
  access: string | null;
  createdAt: string | null;
}

export interface MessageView {
  who: string;
  isClient: boolean;
  at: string;
  text: string;
}

/**
 * Position against the other live accounts, 1 = highest.
 *
 * [2026-09-13, Andy] A number on its own does not say whether it is good. "29
 * minutes of reading" means nothing until you know it is the most of any
 * client and the next one manages one minute.
 */
export interface RankView {
  /** How many accounts are being compared. */
  of: number;
  clientReadingMinutes: number;
  portalVisits: number;
  posts: number;
  views: number;
  invoiced: number;
}

export interface ClientDossier {
  id: string;
  name: string;
  logoUrl: string | null;
  /** Engagement term envelope, from the signed stint. */
  stintStart: string | null;
  stintEnd: string | null;
  daysLeft: number | null;
  terms: number;
  monthsEngaged: number;

  invoiced: number;
  toCreators: number;
  unspent: number;
  owed: number;
  owedRows: number;

  campaignName: string | null;
  campaignStatus: string | null;
  campaignPhase: string | null;
  campaignStart: string | null;
  weekNumber: number | null;

  scope: string | null;
  team: string | null;
  latestCallNote: { date: string | null; content: string } | null;
  callNoteCount: number;

  kols: number;
  kolsOnboarded: number;
  posts: number;
  views: number;
  engagements: number;

  weeks: WeekView[];
  docs: DocView[];
  messages: MessageView[];
  sentiment: Record<string, number>;
  portalExternalVisits: number;
  portalLastVisit: string | null;
  /**
   * Document engagement from the CLIENT only.
   *
   * [2026-09-13, Andy] These used to count every open, including ours. Across
   * the whole log that is 394 internal opens and 225 with no viewer recorded
   * against 332 genuine client reads — so roughly two thirds of what was being
   * reported as "the client is reading our work" was us reading it, or nobody
   * identifiable. Umia in particular read as 169 opens and looked engaged; 16
   * of those were the client. Fogo and Venice read as engaged and are zero.
   */
  docOpens: number;
  docReaders: number;
  docMinutes: number;
  /** Our own team's opens, kept visible so the exclusion is auditable. */
  docInternalOpens: number;
  /** Opens with no viewer recorded — cannot be credited to anyone. */
  docUnattributedOpens: number;
  /** Where this client sits against the others. 1 is highest. */
  rank: RankView;

  topPosts: { kol: string; type: string; views: number; engagements: number; date: string | null }[];

  /** The standard onboarding ladder — the same seven steps for every client,
   *  which is what makes "how far along are they" answerable at a glance. */
  milestones: MilestoneView[];
  /** The strategy library: GTM plans, outreach briefs, content briefs, research.
   *  These live in `links` and are the documents the weekly angles come from. */
  links: LinkView[];
  linkCount: number;
  /** How much work has been logged against this client, ever and lately. */
  deliveryEntries: number;
  deliveryLast14: number;
}

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const day = 86_400_000;

/** Monday of the week containing `d`, ISO. Lineup weeks are Mon–Sun. */
function iso(d: Date) { return d.toISOString().slice(0, 10); }

/** Our own team, so a chat line can be attributed to "us" or "them". */
const TEAM = new Set(['jdothamilton', 'boltxbt', 'jaymz0', 'andyleekorea', 'yanolima', 'elquazo', 'jeremyin', 'sosonchain']);

export async function getPortfolio(): Promise<ClientDossier[]> {
  const [
    clientsRes, ltvRes, stintsRes, campaignsRes, ckRes, contentsRes,
    lineupsRes, anglesRes, slotsRes, logRes, paymentsRes,
    docsRes, docLogRes, chatsRes, msgsRes, ctxRes, commentsRes, visitsRes, kolNameRes,
    milestonesRes, linksRes, deliveryRes, teamRes,
  ] = await Promise.all([
    // [2026-09-11] `is_ad_hoc` is excluded here for the same reason the
    // twelve-month chart excludes it, and the two must agree: without this the
    // page contradicted itself, the chart reporting five clients while the KPI
    // strip and the dossier list below it said six. The sixth was `TestGo`, an
    // ad-hoc row with no engagement term at all, which rendered a full dossier
    // with every stage empty. Ad-hoc engagements are one-off pieces of work and
    // do not belong in a portfolio of retained clients either way.
    (supabase as any).from('clients').select('id, name, logo_url').eq('is_active', true)
      .is('archived_at', null).or('is_ad_hoc.is.null,is_ad_hoc.eq.false'),
    (supabase as any).from('client_ltv').select('*'),
    (supabase as any).from('client_stints').select('client_id, start_date, end_date, status'),
    (supabase as any).from('campaigns').select('id, client_id, name, status, current_phase, start_date, total_budget, is_test').is('archived_at', null),
    (supabase as any).from('campaign_kols').select('id, campaign_id, master_kol_id, hh_status'),
    (supabase as any).from('contents').select('id, campaign_id, campaign_kols_id, activation_date, status, type, impressions, likes, retweets, comments, bookmarks'),
    (supabase as any).from('campaign_lineups').select('id, campaign_id, week_number, week_of, status'),
    (supabase as any).from('lineup_angles').select('id, lineup_id, angle_name, sort_order'),
    (supabase as any).from('lineup_slots').select('id, angle_id, kol_id, status, sort_order'),
    (supabase as any).from('lineup_activity_log').select('lineup_id, action, ts'),
    (supabase as any).from('payments').select('campaign_id, amount, payment_date'),
    (supabase as any).from('documents').select('id, client_id, title, created_at, status'),
    (supabase as any).from('document_access_log').select('document_id, viewer_email, dwell_ms, occurred_at'),
    (supabase as any).from('telegram_chats').select('chat_id, client_id, title'),
    (supabase as any).from('telegram_messages').select('chat_id, from_user_name, from_username, text, message_date').order('message_date', { ascending: false }),
    (supabase as any).from('client_context').select('client_id, scope, holohive_contacts, call_notes'),
    (supabase as any).from('post_comments').select('content_id, sentiment_label').not('sentiment_label', 'is', null),
    (supabase as any).from('portal_visits').select('client_id, is_external, visited_at'),
    (supabase as any).from('master_kols').select('id, name'),
    (supabase as any).from('client_milestones').select('client_id, name, subtitle, status, display_order, is_visible'),
    (supabase as any).from('links').select('client_id, name, url, link_types, access, status, created_at'),
    (supabase as any).from('client_delivery_log').select('client_id, logged_at'),
    // Our own roster, so "internal" is who we actually are rather than a guess
    // at a domain — Jeremyin's account is a gmail address, and a domain test
    // would have counted his reads as a client's.
    (supabase as any).from('users').select('email'),
  ]);

  const clients = (clientsRes.data ?? []) as any[];
  const ltvBy = new Map<string, any>(((ltvRes.data ?? []) as any[]).map(r => [r.client_id, r]));
  const stintBy = new Map<string, any>(((stintsRes.data ?? []) as any[]).map(r => [r.client_id, r]));
  const kolName = new Map<string, string>(((kolNameRes.data ?? []) as any[]).map(k => [k.id, k.name]));

  // Test campaigns are internal rehearsals; they would read as a real account.
  const campaigns = ((campaignsRes.data ?? []) as any[]).filter(c => c.is_test !== true);
  const campaignsBy = new Map<string, any[]>();
  for (const c of campaigns) {
    if (!campaignsBy.has(c.client_id)) campaignsBy.set(c.client_id, []);
    campaignsBy.get(c.client_id)!.push(c);
  }

  const ckById = new Map<string, any>(((ckRes.data ?? []) as any[]).map(r => [r.id, r]));
  const anglesByLineup = new Map<string, any[]>();
  for (const a of (anglesRes.data ?? []) as any[]) {
    if (!anglesByLineup.has(a.lineup_id)) anglesByLineup.set(a.lineup_id, []);
    anglesByLineup.get(a.lineup_id)!.push(a);
  }
  const slotsByAngle = new Map<string, any[]>();
  for (const s of (slotsRes.data ?? []) as any[]) {
    if (!slotsByAngle.has(s.angle_id)) slotsByAngle.set(s.angle_id, []);
    slotsByAngle.get(s.angle_id)!.push(s);
  }
  const logByLineup = new Map<string, any[]>();
  for (const l of (logRes.data ?? []) as any[]) {
    if (!logByLineup.has(l.lineup_id)) logByLineup.set(l.lineup_id, []);
    logByLineup.get(l.lineup_id)!.push(l);
  }

  // Anyone on the users table is us. Plus the domain, to catch a teammate who
  // reads while signed out of HHP but signed in to the portal with work email.
  const teamEmails = new Set(
    ((teamRes.data ?? []) as any[])
      .map(u => String(u.email ?? '').trim().toLowerCase())
      .filter(Boolean),
  );
  const isInternalViewer = (email: string | null | undefined) => {
    const e = String(email ?? '').trim().toLowerCase();
    if (!e) return false;
    return teamEmails.has(e) || e.endsWith('@holohive.io');
  };

  type DocAcc = {
    opens: number; readers: Set<string>; ms: number;
    internalOpens: number; unattributedOpens: number;
  };
  const docAccessBy = new Map<string, DocAcc>();
  for (const a of (docLogRes.data ?? []) as any[]) {
    const cur = docAccessBy.get(a.document_id)
      ?? { opens: 0, readers: new Set<string>(), ms: 0, internalOpens: 0, unattributedOpens: 0 };

    if (!a.viewer_email) {
      // No viewer recorded. It cannot be credited to the client, and calling it
      // internal would be equally unfounded — counted apart from both.
      cur.unattributedOpens += 1;
    } else if (isInternalViewer(a.viewer_email)) {
      cur.internalOpens += 1;
    } else {
      cur.opens += 1;
      cur.readers.add(a.viewer_email);
      cur.ms += num(a.dwell_ms);
    }
    docAccessBy.set(a.document_id, cur);
  }

  const chatsByClient = new Map<string, string[]>();
  for (const c of (chatsRes.data ?? []) as any[]) {
    if (!c.client_id) continue;
    if (!chatsByClient.has(c.client_id)) chatsByClient.set(c.client_id, []);
    chatsByClient.get(c.client_id)!.push(String(c.chat_id));
  }
  const msgsByChat = new Map<string, any[]>();
  for (const m of (msgsRes.data ?? []) as any[]) {
    const k = String(m.chat_id);
    if (!msgsByChat.has(k)) msgsByChat.set(k, []);
    msgsByChat.get(k)!.push(m);
  }

  const ctxBy = new Map<string, any>(((ctxRes.data ?? []) as any[]).map(r => [r.client_id, r]));

  const contentById = new Map<string, any>(((contentsRes.data ?? []) as any[]).map(c => [c.id, c]));
  const sentimentByCampaign = new Map<string, Record<string, number>>();
  for (const pc of (commentsRes.data ?? []) as any[]) {
    const co = contentById.get(pc.content_id);
    if (!co) continue;
    const bucket = sentimentByCampaign.get(co.campaign_id) ?? {};
    bucket[pc.sentiment_label] = (bucket[pc.sentiment_label] ?? 0) + 1;
    sentimentByCampaign.set(co.campaign_id, bucket);
  }

  const today = new Date(); today.setUTCHours(0, 0, 0, 0);

  const out: ClientDossier[] = [];

  for (const cl of clients) {
    const ltv = ltvBy.get(cl.id) ?? {};
    const stint = stintBy.get(cl.id) ?? {};
    const mine = campaignsBy.get(cl.id) ?? [];
    // The live campaign is the one that matters; fall back to the newest.
    const camp = mine.find(c => c.status === 'Active') ?? mine.sort(
      (a, b) => String(b.start_date ?? '').localeCompare(String(a.start_date ?? '')))[0] ?? null;

    const campIds = new Set(mine.map(c => c.id));
    const cks = ((ckRes.data ?? []) as any[]).filter(k => campIds.has(k.campaign_id));
    const cont = ((contentsRes.data ?? []) as any[]).filter(c => campIds.has(c.campaign_id));
    const posted = cont.filter(c => c.status === 'posted');

    // ── weekly plan + brief cycle ─────────────────────────────────────
    const lineups = ((lineupsRes.data ?? []) as any[])
      .filter(l => campIds.has(l.campaign_id))
      .sort((a, b) => num(b.week_number) - num(a.week_number))
      .slice(0, 6);

    const weeks: WeekView[] = lineups.map(l => {
      const angles = (anglesByLineup.get(l.id) ?? [])
        .sort((a, b) => num(a.sort_order) - num(b.sort_order));
      let posted_ = 0, missed = 0, pending = 0, slots = 0;
      const angleViews: AngleView[] = angles.map(a => {
        const ss = (slotsByAngle.get(a.id) ?? []).sort((x, y) => num(x.sort_order) - num(y.sort_order));
        slots += ss.length;
        for (const s of ss) {
          if (s.status === 'posted') posted_ += 1;
          else if (s.status === 'missed') missed += 1;
          else pending += 1;
        }
        return {
          name: a.angle_name || 'Untitled angle',
          creators: ss.map(s => kolName.get(s.kol_id) ?? 'Unassigned'),
        };
      });

      const log = logByLineup.get(l.id) ?? [];
      const first = (action: string) => {
        const hits = log.filter(x => x.action === action).map(x => x.ts).sort();
        return hits[0] ?? null;
      };
      const proposedAt = first('proposed');
      const confirmedAt = first('confirmed');
      const closedAt = first('completed');
      const weekStart = l.week_of ? new Date(l.week_of + 'T00:00:00Z').getTime() : null;
      const leadDays = proposedAt && weekStart != null
        ? Math.round((weekStart - new Date(proposedAt).getTime()) / day)
        : null;
      const reviewHours = proposedAt && confirmedAt
        ? Math.round(((new Date(confirmedAt).getTime() - new Date(proposedAt).getTime()) / 3_600_000) * 10) / 10
        : null;

      return {
        weekNumber: num(l.week_number), weekOf: l.week_of, status: l.status,
        slots, posted: posted_, missed, pending, angles: angleViews,
        proposedAt, confirmedAt, closedAt, leadDays, reviewHours,
      };
    });

    // ── money ─────────────────────────────────────────────────────────
    const pays = ((paymentsRes.data ?? []) as any[]).filter(p => campIds.has(p.campaign_id));
    const owedRows = pays.filter(p => !p.payment_date);
    const owed = owedRows.reduce((s, p) => s + num(p.amount), 0);

    // ── what we sent, and whether they read it ────────────────────────
    const docs = ((docsRes.data ?? []) as any[])
      .filter(d => d.client_id === cl.id)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    let docOpens = 0, docMs = 0, docInternal = 0, docUnattributed = 0;
    const allReaders = new Set<string>();
    const docViews: DocView[] = docs.slice(0, 6).map(d => {
      const acc = docAccessBy.get(d.id)
        ?? { opens: 0, readers: new Set<string>(), ms: 0, internalOpens: 0, unattributedOpens: 0 };
      return {
        title: d.title, createdAt: d.created_at,
        opens: acc.opens, readers: acc.readers.size,
        minutes: Math.round((acc.ms / 60000) * 10) / 10,
      };
    });
    for (const d of docs) {
      const acc = docAccessBy.get(d.id);
      if (!acc) continue;
      docOpens += acc.opens; docMs += acc.ms;
      docInternal += acc.internalOpens; docUnattributed += acc.unattributedOpens;
      acc.readers.forEach(r => allReaders.add(r));
    }

    // ── their chat ────────────────────────────────────────────────────
    const chatIds = chatsByClient.get(cl.id) ?? [];
    const msgs: MessageView[] = chatIds
      .flatMap(id => msgsByChat.get(id) ?? [])
      .filter(m => m.text && m.text !== '[Media]')
      .sort((a, b) => String(b.message_date).localeCompare(String(a.message_date)))
      .slice(0, 5)
      .map(m => ({
        who: m.from_user_name || m.from_username || 'Unknown',
        isClient: !TEAM.has(String(m.from_username ?? '').toLowerCase()),
        at: m.message_date,
        text: String(m.text),
      }));

    // ── the strategy of record ────────────────────────────────────────
    const ctx = ctxBy.get(cl.id) ?? {};
    const notes: any[] = Array.isArray(ctx.call_notes) ? ctx.call_notes : [];
    const sortedNotes = [...notes].sort((a, b) =>
      String(b?.date ?? b?.created_at ?? '').localeCompare(String(a?.date ?? a?.created_at ?? '')));
    const latest = sortedNotes[0];

    const topPosts = [...posted]
      .sort((a, b) => num(b.impressions) - num(a.impressions))
      .slice(0, 3)
      .map(c => ({
        kol: kolName.get(ckById.get(c.campaign_kols_id)?.master_kol_id) ?? 'Unknown',
        type: c.type ?? 'Post',
        views: num(c.impressions),
        engagements: num(c.likes) + num(c.retweets) + num(c.comments) + num(c.bookmarks),
        date: c.activation_date,
      }));

    const milestones: MilestoneView[] = ((milestonesRes.data ?? []) as any[])
      .filter(m => m.client_id === cl.id && (m.is_visible ?? true))
      .sort((a, b) => num(a.display_order) - num(b.display_order))
      .map(m => ({ name: m.name, subtitle: m.subtitle ?? null, status: m.status ?? 'upcoming' }));

    const allLinks = ((linksRes.data ?? []) as any[])
      .filter(l => l.client_id === cl.id && l.status !== 'archived')
      .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
    const links: LinkView[] = allLinks.slice(0, 8).map(l => ({
      name: l.name, url: l.url,
      types: Array.isArray(l.link_types) ? l.link_types : [],
      access: l.access ?? null, createdAt: l.created_at ?? null,
    }));

    const deliveries = ((deliveryRes.data ?? []) as any[]).filter(x => x.client_id === cl.id);
    const cutoff = Date.now() - 14 * day;

    const visits = ((visitsRes.data ?? []) as any[]).filter(v => v.client_id === cl.id && v.is_external);
    const sentiment = camp ? (sentimentByCampaign.get(camp.id) ?? {}) : {};

    const endMs = stint.end_date ? new Date(stint.end_date + 'T00:00:00Z').getTime() : null;

    out.push({
      id: cl.id, name: cl.name, logoUrl: cl.logo_url ?? null,
      stintStart: stint.start_date ?? null, stintEnd: stint.end_date ?? null,
      daysLeft: endMs != null ? Math.round((endMs - today.getTime()) / day) : null,
      terms: num(ltv.terms), monthsEngaged: num(ltv.months_engaged),

      invoiced: num(ltv.invoiced_total), toCreators: num(ltv.creator_payouts),
      unspent: num(ltv.budget_unspent), owed, owedRows: owedRows.length,

      campaignName: camp?.name ?? null, campaignStatus: camp?.status ?? null,
      campaignPhase: camp?.current_phase ?? null, campaignStart: camp?.start_date ?? null,
      weekNumber: weeks[0]?.weekNumber ?? null,

      scope: ctx.scope ?? null,
      team: ctx.holohive_contacts ?? null,
      latestCallNote: latest ? { date: latest.date ?? latest.created_at ?? null, content: String(latest.content ?? '') } : null,
      callNoteCount: notes.length,

      kols: cks.length,
      kolsOnboarded: cks.filter(k => k.hh_status === 'Onboarded').length,
      posts: posted.length,
      views: posted.reduce((s, c) => s + num(c.impressions), 0),
      engagements: posted.reduce((s, c) => s + num(c.likes) + num(c.retweets) + num(c.comments) + num(c.bookmarks), 0),

      weeks, docs: docViews, messages: msgs, sentiment,
      portalExternalVisits: visits.length,
      portalLastVisit: visits.map(v => v.visited_at).sort().slice(-1)[0] ?? null,
      docOpens, docReaders: allReaders.size, docMinutes: Math.round((docMs / 60000) * 10) / 10,
      docInternalOpens: docInternal, docUnattributedOpens: docUnattributed,
      // Filled in once every account is built — a rank needs the whole set.
      rank: { of: 0, clientReadingMinutes: 0, portalVisits: 0, posts: 0, views: 0, invoiced: 0 },
      topPosts,
      milestones, links, linkCount: allLinks.length,
      deliveryEntries: deliveries.length,
      deliveryLast14: deliveries.filter(x => new Date(x.logged_at).getTime() >= cutoff).length,
    });
  }

  assignRanks(out);

  // Biggest relationship first — it is the one a newcomer should read first.
  return out.sort((a, b) => b.invoiced - a.invoiced);
}

/**
 * Rank every account against the others, 1 = highest.
 *
 * Ties share a position and the next rank skips accordingly (1, 2, 2, 4), so
 * two accounts on zero client reading minutes are not silently ordered by
 * whichever came back from the database first. That matters here: three of
 * five clients sit at zero on some of these measures.
 */
function assignRanks(rows: ClientDossier[]): void {
  const of = rows.length;
  const apply = (
    key: keyof RankView,
    value: (r: ClientDossier) => number,
  ) => {
    const sorted = [...rows].sort((a, b) => value(b) - value(a));
    let lastValue: number | null = null;
    let lastRank = 0;
    sorted.forEach((r, i) => {
      const v = value(r);
      const rank = lastValue !== null && v === lastValue ? lastRank : i + 1;
      lastValue = v;
      lastRank = rank;
      (r.rank as any)[key] = rank;
    });
  };

  for (const r of rows) r.rank.of = of;
  apply('clientReadingMinutes', r => r.docMinutes);
  apply('portalVisits', r => r.portalExternalVisits);
  apply('posts', r => r.posts);
  apply('views', r => r.views);
  apply('invoiced', r => r.invoiced);
}

/** Portfolio-level roll-up for the KPI strip. */
export function rollUp(rows: ClientDossier[]) {
  return {
    clients: rows.length,
    invoiced: rows.reduce((s, r) => s + r.invoiced, 0),
    toCreators: rows.reduce((s, r) => s + r.toCreators, 0),
    unspent: rows.reduce((s, r) => s + r.unspent, 0),
    owed: rows.reduce((s, r) => s + r.owed, 0),
    posts: rows.reduce((s, r) => s + r.posts, 0),
    views: rows.reduce((s, r) => s + r.views, 0),
    kols: rows.reduce((s, r) => s + r.kols, 0),
  };
}

/* ── the shape of the book of business over time ───────────────────────── */

/** Enough of a client to name and picture it in the chart tooltip. */
export interface ClientChip {
  id: string;
  name: string;
  logoUrl: string | null;
}

export interface MonthPoint {
  /** First day of the month, ISO. */
  month: string;
  /** Short label for the axis, e.g. "Sep". */
  label: string;
  /** Long label for the tooltip, e.g. "September 2026". */
  longLabel: string;
  /** Clients on a full retained engagement that month. */
  retained: number;
  /** Who they were, for the tooltip. */
  clients: ClientChip[];
}

/**
 * Active clients per month for the trailing 12 months.
 *
 * "Active in a month" means the client had an engagement term overlapping any
 * part of it — the same definition the rest of the portfolio uses, so the last
 * column of this chart equals the client count in the KPI strip above it.
 *
 * Archived clients are excluded, which is what removes the test rows
 * (`Fast Test`, `QuazoCorp Test`, `Checking for error` and friends) without
 * hand-maintaining a denylist. Genuine past clients — DataHaven, Xyber, Space —
 * are not archived and so still count, which is the point: this is a history,
 * not a snapshot of who is live today.
 *
 * [2026-09-11, Andy] Ad-hoc engagements are excluded outright rather than
 * charted alongside. They are one-off pieces of work, not clients on the book,
 * and counting them — in their own series or folded into the total — overstates
 * the retained base this chart exists to show.
 */
export async function getClientHistory(months = 12): Promise<MonthPoint[]> {
  const [stintsRes, clientsRes] = await Promise.all([
    supabase.from('client_stints').select('client_id, start_date, end_date'),
    supabase.from('clients').select('id, name, logo_url, is_ad_hoc, archived_at'),
  ]);

  const clients = new Map<string, { name: string; logoUrl: string | null; adHoc: boolean }>();
  for (const c of (clientsRes.data ?? []) as any[]) {
    if (c.archived_at) continue;
    clients.set(c.id, { name: c.name, logoUrl: c.logo_url ?? null, adHoc: Boolean(c.is_ad_hoc) });
  }

  const now = new Date();
  const out: MonthPoint[] = [];

  for (let i = months - 1; i >= 0; i--) {
    // UTC throughout so the buckets don't drift by a day near month boundaries.
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0));
    const seen = new Set<string>();

    for (const s of (stintsRes.data ?? []) as any[]) {
      const c = clients.get(s.client_id);
      if (!c || !s.start_date) continue;
      // Overlap test: the term began on or before the month ended, and had not
      // already finished when the month began. An open-ended term never ends.
      if (new Date(s.start_date) > end) continue;
      if (s.end_date && new Date(s.end_date) < start) continue;
      seen.add(s.client_id);
    }

    const chips: ClientChip[] = [...seen]
      .filter(id => !clients.get(id)!.adHoc)
      .map(id => ({ id, name: clients.get(id)!.name, logoUrl: clients.get(id)!.logoUrl }))
      .sort((a, b) => a.name.localeCompare(b.name));

    out.push({
      month: start.toISOString().slice(0, 10),
      // The chart axis needs "Sep" and its tooltip "September 2026". mm/dd/yyyy
      // would be wrong for both, so these two are a deliberate exception.
      // The justification sits above the directive rather than after the rule
      // id: the linter's matcher expects the id to end the line, and trailing
      // prose silently voids the disable.
      // lint-conventions: disable-next-line no-raw-toLocaleDateString
      label: start.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
      // lint-conventions: disable-next-line no-raw-toLocaleDateString
      longLabel: start.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      retained: chips.length,
      clients: chips,
    });
  }

  return out;
}

/* ── where the same creator carries more than one account ──────────────── */

export interface CreatorReach {
  id: string;
  name: string;
  /** Live clients this creator is on the roster for, alphabetical. */
  clients: string[];
}

/**
 * Creators working across more than one live account.
 *
 * [2026-09-11, Andy] Two things fall out of the same number. A creator on four
 * of four posting accounts is a single point of failure — lose them and four
 * campaigns degrade the same week — and they are also showing the same Korean
 * audience four different projects in the same voice, which is precisely the
 * credibility the small analyst channels are paid a premium for.
 *
 * Counted on roster membership rather than posts, because the exposure exists
 * from the moment someone is briefed on two accounts, not from when the second
 * post lands.
 */
export async function getCreatorOverlap(): Promise<CreatorReach[]> {
  const [clientsRes, campaignsRes, ckRes, kolsRes] = await Promise.all([
    supabase.from('clients').select('id, name, is_ad_hoc, archived_at').eq('is_active', true),
    supabase.from('campaigns').select('id, client_id, is_test'),
    supabase.from('campaign_kols').select('campaign_id, master_kol_id'),
    supabase.from('master_kols').select('id, name'),
  ]);

  const clientName = new Map<string, string>();
  for (const c of (clientsRes.data ?? []) as any[]) {
    if (c.archived_at || c.is_ad_hoc) continue;
    clientName.set(c.id, c.name);
  }

  const campaignClient = new Map<string, string>();
  for (const c of (campaignsRes.data ?? []) as any[]) {
    if (c.is_test) continue;
    if (clientName.has(c.client_id)) campaignClient.set(c.id, c.client_id);
  }

  const kolName = new Map<string, string>();
  for (const k of (kolsRes.data ?? []) as any[]) kolName.set(k.id, k.name);

  const reach = new Map<string, Set<string>>();
  for (const ck of (ckRes.data ?? []) as any[]) {
    const clientId = campaignClient.get(ck.campaign_id);
    if (!clientId || !ck.master_kol_id) continue;
    if (!reach.has(ck.master_kol_id)) reach.set(ck.master_kol_id, new Set());
    reach.get(ck.master_kol_id)!.add(clientId);
  }

  return [...reach.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([id, set]) => ({
      id,
      name: kolName.get(id) ?? 'Unknown creator',
      clients: [...set].map(cid => clientName.get(cid)!).sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => b.clients.length - a.clients.length || a.name.localeCompare(b.name));
}
