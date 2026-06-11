import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TelegramService } from '@/lib/telegramService';
import { LineupManagerService } from '@/lib/lineupManagerService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/lineups/[lineupId]/notify
 *
 * HHP Lineup Manager Spec § 7 — Telegram notifications on lineup
 * state transitions:
 *
 *   • event=proposed  → DM the lineup approver (per spec: Jdot) with
 *                       a review link to the campaign page
 *   • event=confirmed → Post the formatted lineup to the campaign's
 *                       internal TG ops group chat (campaigns.tg_ops_group_id)
 *   • event=unlocked  → DM the original proposer that their lineup
 *                       was unlocked and needs edits
 *
 * Called from LineupsTab AFTER the corresponding service.* transition
 * runs. Kept separate from the service so the bot dispatch is owned
 * by the API layer (single source of truth for the bot token).
 *
 * Auth: requires authenticated session. Side effects on the bot
 * itself can't be revoked, so we want a real user attribution.
 *
 * Body: { event: 'proposed' | 'confirmed' | 'unlocked' }
 */

type Event = 'proposed' | 'confirmed' | 'unlocked';

/**
 * Lineup approvers — multi-user support. The lineup_approvers table
 * is the source of truth; falls back to legacy app_settings single
 * value, then env var, then jdot. Every resolved approver gets a DM.
 */
const APPROVER_SETTING_KEY = 'lineup_approver_user_id';
const APPROVER_EMAIL_FALLBACK = process.env.LINEUP_APPROVER_EMAIL || 'jdot@holohive.io';

type ApproverContact = {
  userId: string;
  telegramId: string | null;
  userName: string;
};

async function findApproverContacts(supabase: any): Promise<ApproverContact[]> {
  // Primary: dedicated lineup_approvers table. FK hint required
  // because lineup_approvers has two refs to users (user_id +
  // added_by) — PostgREST can't auto-pick.
  const { data: approverRows } = await supabase
    .from('lineup_approvers')
    .select('user_id, users!lineup_approvers_user_id_fkey(id, telegram_id, telegram_username, email)');
  const rows = (approverRows || []) as Array<{
    user_id: string;
    users: { id: string; telegram_id: string | null; telegram_username: string | null; email: string } | null;
  }>;
  if (rows.length > 0) {
    return rows
      .filter(r => r.users)
      .map(r => ({
        userId: r.users!.id,
        telegramId: r.users!.telegram_id || null,
        userName: r.users!.telegram_username || r.users!.email || 'Approver',
      }));
  }

  // Legacy fallback: app_settings single-value (pre-migration deployments).
  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', APPROVER_SETTING_KEY)
    .maybeSingle();
  const legacyId = setting?.value as string | undefined;
  if (legacyId) {
    const { data: user } = await supabase
      .from('users')
      .select('id, telegram_id, telegram_username, email')
      .eq('id', legacyId)
      .maybeSingle();
    if (user) {
      return [{
        userId: user.id,
        telegramId: user.telegram_id || null,
        userName: user.telegram_username || user.email || 'Approver',
      }];
    }
  }

  // Last-resort fallback: email lookup.
  const { data: byEmail } = await supabase
    .from('users')
    .select('id, telegram_id, telegram_username, email')
    .ilike('email', APPROVER_EMAIL_FALLBACK)
    .maybeSingle();
  if (byEmail) {
    return [{
      userId: byEmail.id,
      telegramId: byEmail.telegram_id || null,
      userName: byEmail.telegram_username || byEmail.email || 'Approver',
    }];
  }

  return [];
}

async function findUserChatId(
  supabase: any,
  userId: string,
): Promise<{ telegramId: string | null; userName: string }> {
  const { data: user } = await supabase
    .from('users')
    .select('telegram_id, telegram_username, email')
    .eq('id', userId)
    .maybeSingle();
  return {
    telegramId: user?.telegram_id || null,
    userName: user?.telegram_username || user?.email || 'User',
  };
}

export async function POST(
  request: Request,
  { params }: { params: { lineupId: string } },
) {
  // Auth check via the existing super-admin helper.
  const { requireSuperAdmin } = await import('@/lib/requireSuperAdmin');
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const { lineupId } = params;
  const body = (await request.json().catch(() => ({}))) as { event?: Event };
  const event = body.event;
  if (!event || !['proposed', 'confirmed', 'unlocked'].includes(event)) {
    return NextResponse.json(
      { error: 'Missing or invalid event. Expected proposed|confirmed|unlocked.' },
      { status: 400 },
    );
  }

  // Service-role client — the bot dispatch needs to read across
  // tables regardless of caller RLS scope.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Fetch the lineup + campaign meta for the message bodies.
  const { data: lineup, error: lErr } = await (supabase as any)
    .from('campaign_lineups')
    .select('id, campaign_id, week_number, status, proposed_by, confirmed_by')
    .eq('id', lineupId)
    .single();
  if (lErr || !lineup) {
    return NextResponse.json({ error: 'Lineup not found.' }, { status: 404 });
  }

  const { data: campaign } = await (supabase as any)
    .from('campaigns')
    .select('id, name, slug, tg_ops_group_id')
    .eq('id', lineup.campaign_id)
    .single();
  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
  }

  // Review link points at the campaign page's Lineups tab. The
  // route honors a ?tab=lineups query so deep links open straight
  // to this surface.
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    ? (process.env.NEXT_PUBLIC_BASE_URL.startsWith('http')
        ? process.env.NEXT_PUBLIC_BASE_URL
        : `https://${process.env.NEXT_PUBLIC_BASE_URL}`)
    : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  const reviewLink = `${baseUrl}/campaigns/${campaign.id}?tab=lineups`;

  // ─── Dispatch by event ─────────────────────────────────────────
  try {
    if (event === 'proposed') {
      const approvers = await findApproverContacts(supabase);
      if (approvers.length === 0) {
        return NextResponse.json({
          ok: false,
          skipped: true,
          reason: `No approvers configured (lineup_approvers table empty + ${APPROVER_SETTING_KEY} setting + email fallback ${APPROVER_EMAIL_FALLBACK} all empty).`,
        });
      }
      const withTg = approvers.filter(a => a.telegramId);
      if (withTg.length === 0) {
        const names = approvers.map(a => a.userName).join(', ');
        return NextResponse.json({
          ok: false,
          skipped: true,
          reason: `No telegram_id on any approver (${names}). They need to DM the bot first to receive notifications.`,
        });
      }
      const text =
        `<b>${campaign.name}</b>\n` +
        `Week ${lineup.week_number} lineup proposed for your review.\n\n` +
        `<a href="${reviewLink}">Review on HHP</a>`;
      // Fan out to all approvers with TG IDs. Failures per-recipient
      // don't fail the whole call — sent count + skipped list both
      // surface in the response.
      const results = await Promise.all(
        withTg.map(async a => {
          try {
            const sent = await TelegramService.sendToChat(a.telegramId!, text, 'HTML');
            return { userName: a.userName, sent };
          } catch (err: any) {
            return { userName: a.userName, sent: false, error: err?.message };
          }
        }),
      );
      const successCount = results.filter(r => r.sent).length;
      const skippedNoTg = approvers
        .filter(a => !a.telegramId)
        .map(a => a.userName);
      return NextResponse.json({
        ok: successCount > 0,
        recipient: results
          .filter(r => r.sent)
          .map(r => r.userName)
          .join(', '),
        sentCount: successCount,
        totalApprovers: approvers.length,
        skipped: skippedNoTg.length > 0 ? skippedNoTg : undefined,
      });
    }

    if (event === 'confirmed') {
      if (!campaign.tg_ops_group_id) {
        return NextResponse.json({
          ok: false,
          skipped: true,
          reason: 'Campaign has no tg_ops_group_id set. Configure on the campaign settings.',
        });
      }
      // Look up the confirmer's name for the post footer.
      let confirmedByName = 'Jdot';
      if (lineup.confirmed_by) {
        const { data: u } = await (supabase as any)
          .from('users')
          .select('telegram_username, email')
          .eq('id', lineup.confirmed_by)
          .maybeSingle();
        confirmedByName = u?.telegram_username || u?.email?.split('@')[0] || 'Jdot';
      }
      // The service has the formatter — reuse it so the message
      // shape stays consistent with the test fixture.
      const svc = new LineupManagerService(supabase as any);
      const text = await svc.formatLineupForGroupPost(
        lineupId,
        campaign.name,
        confirmedByName,
      );
      const sent = await TelegramService.sendToChat(
        campaign.tg_ops_group_id,
        text,
        'Markdown', // Service formatter emits markdown links
      );
      return NextResponse.json({ ok: sent });
    }

    if (event === 'unlocked') {
      // DM the original proposer.
      if (!lineup.proposed_by) {
        return NextResponse.json({
          ok: false,
          skipped: true,
          reason: 'Lineup has no proposed_by (was Jdot-direct?).',
        });
      }
      const { telegramId, userName } = await findUserChatId(supabase, lineup.proposed_by);
      if (!telegramId) {
        return NextResponse.json({
          ok: false,
          skipped: true,
          reason: `Proposer ${userName} has no telegram_id on their user row.`,
        });
      }
      const text =
        `<b>${campaign.name}</b>\n` +
        `Week ${lineup.week_number} lineup was unlocked. Edits needed.\n\n` +
        `<a href="${reviewLink}">Open on HHP</a>`;
      const sent = await TelegramService.sendToChat(telegramId, text, 'HTML');
      return NextResponse.json({ ok: sent, recipient: userName });
    }

    return NextResponse.json({ error: 'Unhandled event.' }, { status: 400 });
  } catch (err: any) {
    console.error('[lineup notify] error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Notification failed.' },
      { status: 500 },
    );
  }
}
