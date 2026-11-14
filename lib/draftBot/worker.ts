import { escapeHtml } from '@/lib/telegramHtml';
import { tg } from './tg';
import { getDraftConfig, draftAllowedInChat, type DraftConfig } from './config';
import { slotDeadline } from './resolve';

/**
 * Scheduled side of /draft.
 *
 * The bot runs as serverless functions, so nothing can sit and wait out the
 * cancel window in memory. A decision writes `send_at`; this job, run every
 * minute, sends what is due. The real delay is therefore the window plus up
 * to a minute.
 */

/**
 * Send one draft's decision to the KOL group. Claiming the row first
 * (`outbound_sent_at`) is what makes Cancel and a second run of the job lose.
 */
export async function sendOutbound(sb: any, cfg: DraftConfig, draftId: string): Promise<'sent' | 'skipped' | 'failed'> {
  const { data: claimed } = await sb
    .from('content_drafts')
    .update({ outbound_sent_at: new Date().toISOString() })
    .eq('id', draftId)
    .in('status', ['approved', 'changes_requested'])
    .is('outbound_sent_at', null).not('send_at', 'is', null)
    .select('id, kol_chat_id, kol_thread_id, source_message_id, outbound_text, outbound_preview_message_id, review_chat_id, review_thread_id, review_message_id');
  const d = (claimed as any[])?.[0];
  if (!d) return 'skipped';

  const topicReply = (text: string) => tg('sendMessage', {
    chat_id: d.review_chat_id,
    ...(d.review_thread_id ? { message_thread_id: d.review_thread_id } : {}),
    text, parse_mode: 'HTML',
    reply_parameters: { message_id: d.review_message_id, allow_sending_without_reply: true },
  });

  // The mode can be switched off between the decision and the send.
  if (!draftAllowedInChat(cfg, d.kol_chat_id) || !d.outbound_text) {
    if (d.review_chat_id) await topicReply('⚠ Not sent to the KOL: /draft is switched off for that chat.');
    return 'failed';
  }
  const sent = await tg<{ message_id: number }>('sendMessage', {
    chat_id: d.kol_chat_id,
    ...(d.kol_thread_id ? { message_thread_id: d.kol_thread_id } : {}),
    text: d.outbound_text,
    reply_parameters: { message_id: d.source_message_id, allow_sending_without_reply: true },
  });
  if (!sent.ok) {
    console.error('[/draft] outbound send failed:', sent.description);
    if (d.review_chat_id) await topicReply(`⚠ Could not send to the KOL group: ${escapeHtml(sent.description)}. Please message the KOL directly.`);
    return 'failed';
  }
  await sb.from('content_drafts').update({ outbound_message_id: sent.result.message_id }).eq('id', draftId);
  if (d.review_chat_id && d.outbound_preview_message_id) {
    // Keep the Korean that went out visible in the topic, without the button.
    await tg('editMessageText', {
      chat_id: d.review_chat_id, message_id: d.outbound_preview_message_id,
      text: `📨 <b>Sent to the KOL</b>\n\n${escapeHtml(d.outbound_text)}`,
      parse_mode: 'HTML', link_preview_options: { is_disabled: true },
    });
  } else if (d.review_chat_id) {
    await topicReply(`📨 <b>Sent to the KOL</b>\n\n${escapeHtml(d.outbound_text)}`);
  }
  return 'sent';
}

export interface WorkerResult { sent: number; failed: number; nudged: number; deadlineNudged: number }

export async function runDraftWorker(sb: any): Promise<WorkerResult> {
  const cfg = await getDraftConfig(sb);
  const out: WorkerResult = { sent: 0, failed: 0, nudged: 0, deadlineNudged: 0 };
  if (cfg.mode === 'off') return out;
  const nowIso = new Date().toISOString();

  const { data: due } = await sb
    .from('content_drafts').select('id')
    .in('status', ['approved', 'changes_requested'])
    .is('outbound_sent_at', null).lte('send_at', nowIso)
    .limit(25);
  for (const r of (due ?? []) as Array<{ id: string }>) {
    const res = await sendOutbound(sb, cfg, r.id);
    if (res === 'sent') out.sent++;
    else if (res === 'failed') out.failed++;
  }

  // Nudges: at most one of each kind per draft.
  const { data: pending } = await sb
    .from('content_drafts')
    .select(`
      id, created_at, nudged_at, deadline_nudged_at, review_chat_id, review_thread_id, review_message_id,
      slot:lineup_slots(angle:lineup_angles(lineup:campaign_lineups(week_of)))
    `)
    .eq('status', 'pending_review')
    .not('review_message_id', 'is', null)
    .or('nudged_at.is.null,deadline_nudged_at.is.null')
    .limit(50);
  for (const d of (pending ?? []) as any[]) {
    const reply = (text: string) => tg('sendMessage', {
      chat_id: d.review_chat_id,
      ...(d.review_thread_id ? { message_thread_id: d.review_thread_id } : {}),
      text,
      reply_parameters: { message_id: d.review_message_id, allow_sending_without_reply: true },
    });
    const ageH = (Date.now() - Date.parse(d.created_at)) / 3_600_000;
    if (!d.nudged_at && cfg.nudgeHours > 0 && ageH >= cfg.nudgeHours) {
      // Claim before sending so two overlapping runs can't both nudge.
      const { data: won } = await sb.from('content_drafts').update({ nudged_at: nowIso }).eq('id', d.id).is('nudged_at', null).eq('status', 'pending_review').select('id');
      if (won?.length) {
        await reply(`${cfg.nudgeTags ? `${cfg.nudgeTags} ` : ''}This draft has been waiting ${Math.floor(ageH)}h for a decision.`);
        out.nudged++;
      }
    }
    const weekOf: string | undefined = d.slot?.angle?.lineup?.week_of;
    if (!d.deadline_nudged_at && weekOf) {
      const left = slotDeadline(weekOf).getTime() - Date.now();
      if (left <= 24 * 3_600_000) {
        const { data: won } = await sb.from('content_drafts').update({ deadline_nudged_at: nowIso }).eq('id', d.id).is('deadline_nudged_at', null).eq('status', 'pending_review').select('id');
        if (won?.length) {
          await reply(`⏰ ${cfg.nudgeTags ? `${cfg.nudgeTags} ` : ''}${left > 0 ? 'Lineup deadline is less than 24h away' : 'Lineup deadline has passed'} and this draft is still pending.`);
          out.deadlineNudged++;
        }
      }
    }
  }
  return out;
}
