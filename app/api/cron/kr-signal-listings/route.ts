import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { loadActiveClients } from '@/lib/krSignal/config';
import {
  fetchRecentKrwListings,
  getTokenKrVolumeKrw,
  buildStage1Alert,
  buildStage2Recap,
  buildListingsDigest,
  type DetectedListing,
} from '@/lib/krSignal/listings';
import { getUsdKrw } from '@/lib/krSignal/adapters';
import { sendMessage, editMessageText } from '@/lib/krSignal/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/kr-signal-listings — Feature B (spec §7.B/C/D, §6.7).
 *
 * Hourly. Reuses HHP's korean_exchange_markets detection:
 *   1. Record new KRW listings (last 2h) into kr_signal_listings.
 *   2. Client alert (§7.C): if a client's OWN token just listed, post a Stage-1
 *      alert to their GC (client_listing_alert enabled) and schedule the +24h edit.
 *   3. +24h recap (§7.D): edit Stage-1 alerts in place with Day-1 KRW volume.
 *   4. Saturday digest (§7.B): the week's KRW listings to korea_listings_digest clients.
 *
 * Auth: Authorization: Bearer {CRON_SECRET}
 */
export async function GET(request: Request) {
  const startedAt = new Date();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  if (!process.env.KR_SIGNAL_BOT_TOKEN) {
    return NextResponse.json({ error: 'KR_SIGNAL_BOT_TOKEN not set' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: runRow } = await (supabase as any)
    .from('agent_runs')
    .insert({ agent_name: 'KR_SIGNAL_LISTINGS', run_type: 'scheduled', status: 'running', started_at: startedAt.toISOString(), input_params: {} })
    .select('id')
    .single();
  const runId = runRow?.id;
  const finishRun = async (status: 'completed' | 'failed', output: any, error?: string) => {
    if (!runId) return;
    const endedAt = new Date();
    await (supabase as any).from('agent_runs').update({
      status, completed_at: endedAt.toISOString(), duration_ms: endedAt.getTime() - startedAt.getTime(),
      output_summary: output, error_message: error ?? null,
    }).eq('id', runId);
  };

  const summary: any = { recorded: 0, alerts: 0, edits: 0, digests: 0 };
  try {
    const now = new Date();

    // 1. Record new KRW listings (last 2h — overlap tolerated; unique(ticker,listed_on) dedups).
    const since = new Date(now.getTime() - 2 * 3600 * 1000).toISOString();
    const detected = await fetchRecentKrwListings(supabase, since);
    for (const l of detected) {
      const { error } = await supabase
        .from('kr_signal_listings')
        .upsert({ ticker: l.symbol, venues: l.venues, listed_on: l.listedOn }, { onConflict: 'ticker,listed_on' });
      if (!error) summary.recorded++;
    }

    const clients = await loadActiveClients(supabase);

    // 2. Client alert (§7.C) — a client's own token just listed.
    const alertClients = clients.filter((c) => c.features?.client_listing_alert && c.telegram_chat_id);
    for (const l of detected) {
      for (const c of alertClients) {
        if (c.ticker.toUpperCase() !== l.symbol) continue;
        const { data: existing } = await supabase
          .from('kr_signal_alert_messages')
          .select('id')
          .eq('client_id', c.id).eq('ticker', c.ticker).eq('listed_on_key', l.listedOn)
          .maybeSingle();
        if (existing) continue;
        try {
          const m = await sendMessage(c.telegram_chat_id!, buildStage1Alert(c.ticker, l));
          await supabase.from('kr_signal_alert_messages').insert({
            client_id: c.id, ticker: c.ticker, chat_id: String(c.telegram_chat_id), message_id: m.message_id,
            stage: 1, listed_on_key: l.listedOn, edit_due_at: new Date(now.getTime() + 24 * 3600 * 1000).toISOString(),
          });
          summary.alerts++;
        } catch (e) { /* keep sweeping */ }
      }
    }

    // 3. +24h recap edit (§7.D) — Stage-1 alerts whose 24h window elapsed.
    const { data: dueAlerts } = await supabase
      .from('kr_signal_alert_messages')
      .select('id, ticker, chat_id, message_id, listed_on_key')
      .eq('stage', 1).is('edited_at', null).lte('edit_due_at', now.toISOString());
    if (dueAlerts && dueAlerts.length > 0) {
      const fx = await getUsdKrw().catch(() => 0);
      for (const a of dueAlerts as any[]) {
        try {
          const { data: lst } = await supabase
            .from('kr_signal_listings').select('venues')
            .eq('ticker', a.ticker).eq('listed_on', a.listed_on_key).maybeSingle();
          const listing: DetectedListing = {
            symbol: a.ticker.toUpperCase(),
            venues: (lst as any)?.venues ?? ['upbit'],
            listedOn: a.listed_on_key,
            warning: false,
          };
          const day1 = await getTokenKrVolumeKrw(a.ticker);
          await editMessageText(a.chat_id, a.message_id, buildStage2Recap(a.ticker, listing, day1, fx));
          await supabase.from('kr_signal_alert_messages')
            .update({ stage: 2, edited_at: now.toISOString() }).eq('id', a.id);
          summary.edits++;
        } catch (e) { /* keep sweeping */ }
      }
    }

    // 4. Saturday digest (§7.B) — the week's KRW listings to digest clients.
    // Gate to a single hour (Sat 12:00 UTC = 21:00 KST) so the hourly cron
    // doesn't re-send the digest every hour on Saturday.
    if (now.getUTCDay() === 6 && now.getUTCHours() === 12) {
      const since7 = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
      const weekListings = await fetchRecentKrwListings(supabase, since7);
      const weekLabel = weekLabelFor(now);
      const html = buildListingsDigest(weekListings, weekLabel);
      const digestClients = clients.filter((c) => c.features?.korea_listings_digest && c.telegram_chat_id);
      for (const c of digestClients) {
        try { await sendMessage(c.telegram_chat_id!, html); summary.digests++; } catch (e) { /* keep sweeping */ }
      }
    }

    await finishRun('completed', summary);
    return NextResponse.json({ ran: true, ...summary });
  } catch (e: any) {
    await finishRun('failed', summary, String(e?.message || e));
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

function weekLabelFor(now: Date): string {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 6);
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${M[start.getUTCMonth()]} ${start.getUTCDate()}–${now.getUTCDate()}`;
}
