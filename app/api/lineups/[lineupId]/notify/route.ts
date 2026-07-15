import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TelegramService } from '@/lib/telegramService';
import { LineupManagerService } from '@/lib/lineupManagerService';
import { escapeHtml } from '@/lib/telegramHtml';
import { getTemplate, renderTemplate } from '@/lib/messageTemplates';

export const dynamic = 'force-dynamic';

/**
 * POST /api/lineups/[lineupId]/notify
 *
 * HHP Lineup Manager Spec § 7 — Telegram notifications on lineup
 * state transitions:
 *
 *   • event=proposed  → Post the proposal to the shared lineup channel
 *                       (app_settings.lineup_proposal_chat_id). No DMs.
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
  // Auth: any team lead (admin or super_admin) may trigger a lineup
  // notification — CMs like Jaymz propose lineups and must be able to
  // fire the channel post. Gating this to super_admin silently dropped
  // the Telegram post after an admin proposed [Andy 2026-07-16].
  const { requireRole } = await import('@/lib/requireSuperAdmin');
  const guard = await requireRole(request, ['admin', 'super_admin']);
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
      // [2026-07-08] Per Andy: proposals post to the shared lineup channel
      // ONLY — no more approver DMs. The channel post is the single
      // notification, so a DM issue can never suppress it.
      // Destination: app_settings.lineup_proposal_chat_id (+ optional
      // _thread_id), set in /admin/telegram-comm.
      const [chatSetting, threadSetting] = await Promise.all([
        (supabase as any).from('app_settings').select('value').eq('key', 'lineup_proposal_chat_id').maybeSingle(),
        (supabase as any).from('app_settings').select('value').eq('key', 'lineup_proposal_chat_thread_id').maybeSingle(),
      ]);
      const broadcastChatId = (chatSetting.data as any)?.value as string | undefined;
      const broadcastThreadId = (threadSetting.data as any)?.value as string | undefined;
      if (!broadcastChatId) {
        return NextResponse.json({
          ok: false,
          skipped: true,
          reason: 'No lineup proposal channel configured. Set app_settings.lineup_proposal_chat_id in /admin/telegram-comm.',
        });
      }
      // Message body is template-driven — editable on /admin/telegram-comm.
      // The review link is always appended.
      const broadcastTemplate = await getTemplate(supabase, 'tmpl_lineup_proposed_broadcast');
      const broadcastText =
        renderTemplate(broadcastTemplate, {
          campaign: escapeHtml(campaign.name),
          week: String(lineup.week_number),
        }) +
        `\n\n<a href="${reviewLink}">Review on HHP</a>`;
      let chatPosted = false;
      let chatPostError: string | null = null;
      try {
        chatPosted = await TelegramService.sendToChat(
          broadcastChatId,
          broadcastText,
          'HTML',
          broadcastThreadId ? parseInt(broadcastThreadId, 10) : undefined,
        );
      } catch (err: any) {
        chatPosted = false;
        chatPostError = err?.message || 'unknown';
      }

      return NextResponse.json({ ok: chatPosted, chatPosted, chatPostError });
    }

    if (event === 'confirmed') {
      // [2026-06-26] Confirmed lineups now route to the global internal
      // team chat (app_settings.lineup_confirmed_chat_id + optional
      // _thread_id), NOT the per-campaign client ops chat. Confirm is
      // an internal coordination milestone — the team needs a single
      // shared feed of "what's locked in this week" without spamming
      // each client's ops chat. Falls back to campaigns.tg_ops_group_id
      // only if the global setting is unset (legacy escape hatch).
      const [globalChatSetting, globalThreadSetting] = await Promise.all([
        (supabase as any).from('app_settings').select('value').eq('key', 'lineup_confirmed_chat_id').maybeSingle(),
        (supabase as any).from('app_settings').select('value').eq('key', 'lineup_confirmed_chat_thread_id').maybeSingle(),
      ]);
      const globalChatId = (globalChatSetting.data as any)?.value as string | undefined;
      const globalThreadId = (globalThreadSetting.data as any)?.value as string | undefined;
      const targetChatId = globalChatId || campaign.tg_ops_group_id;
      const targetThreadId = globalChatId ? globalThreadId : undefined;
      if (!targetChatId) {
        return NextResponse.json({
          ok: false,
          skipped: true,
          reason: 'No destination configured. Set app_settings.lineup_confirmed_chat_id (recommended) or campaigns.tg_ops_group_id.',
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
      // shape stays consistent with the test fixture. Header line is
      // template-driven (editable on /admin/telegram-comm); the roster
      // body + footer stay generated.
      const headerTemplate = await getTemplate(supabase, 'tmpl_lineup_confirmed_header');
      const svc = new LineupManagerService(supabase as any);
      const text = await svc.formatLineupForGroupPost(
        lineupId,
        campaign.name,
        confirmedByName,
        headerTemplate,
      );
      const sent = await TelegramService.sendToChat(
        targetChatId,
        text,
        'Markdown', // Service formatter emits markdown links
        targetThreadId ? parseInt(targetThreadId, 10) : undefined,
      );
      return NextResponse.json({ ok: sent, target: globalChatId ? 'global' : 'per-campaign' });
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
