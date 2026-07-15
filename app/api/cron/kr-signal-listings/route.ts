import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { loadActiveClients } from '@/lib/krSignal/config';
import {
  fetchRecentKrwListings,
  getTokenKrVolumeKrw,
  getTokenKrVolumeByVenueKrw,
  getTokenKrPriceKrw,
  buildStage1Alert,
  buildStage2Recap,
  buildListingsDigest,
  type DetectedListing,
  type DigestEntry,
} from '@/lib/krSignal/listings';
import { getUsdKrw, getTrailing7dAvgVolumeUsd, getCoinPriceAndMcapUsd, searchCoingeckoIdBySymbol, getPerVenueVolume } from '@/lib/krSignal/adapters';
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
    // §6.7/§7.B: on FIRST sight, capture the listing-time KRW price (for the
    // digest's "Since listing" %) and freeze the trailing-7d avg volume
    // baseline (for the vol-spike multiple) — for every listing, not just
    // client tokens. Ticker → CoinGecko id resolves via exact-symbol search.
    const since = new Date(now.getTime() - 2 * 3600 * 1000).toISOString();
    const detected = await fetchRecentKrwListings(supabase, since);
    for (const l of detected) {
      const { data: known } = await supabase
        .from('kr_signal_listings')
        .select('id')
        .eq('ticker', l.symbol).eq('listed_on', l.listedOn)
        .maybeSingle();
      if (known) continue;
      const [price, cgId] = await Promise.all([
        getTokenKrPriceKrw(l.symbol).catch(() => 0),
        searchCoingeckoIdBySymbol(l.symbol),
      ]);
      const base = cgId ? await getTrailing7dAvgVolumeUsd(cgId).catch(() => 0) : 0;
      const { error } = await supabase.from('kr_signal_listings').upsert({
        ticker: l.symbol, venues: l.venues, listed_on: l.listedOn,
        listing_price_krw: price > 0 ? price : null,
        coingecko_id: cgId,
        baseline_7d: base > 0 ? base : null,
      }, { onConflict: 'ticker,listed_on' });
      if (!error) summary.recorded++;
    }

    const clients = await loadActiveClients(supabase);

    // 1.5 Daily per-venue volume snapshot (00:xx UTC run = 09:00 KST, the
    // spec §3 snapshot time). CoinGecko only exposes 24h per-exchange
    // volume, so the weekly report's TRUE 7d venue numbers come from
    // summing these daily rows (per Andy 2026-07-10). Piggybacks on this
    // hourly cron instead of adding another vercel cron entry.
    if (now.getUTCHours() === 0) {
      for (const c of clients) {
        if (!c.coingecko_id) continue;
        try {
          const pv = await getPerVenueVolume(c.coingecko_id);
          const day = now.toISOString().slice(0, 10);
          const rows = Object.entries(pv)
            .filter(([, usd]) => usd > 0)
            .map(([venue, usd]) => ({ client_id: c.id, day, venue, usd }));
          if (rows.length > 0) {
            await supabase.from('kr_signal_venue_vols_daily')
              .upsert(rows, { onConflict: 'client_id,day,venue' });
            summary.dailyVols = (summary.dailyVols ?? 0) + rows.length;
          }
        } catch (e) { /* keep sweeping */ }
      }
    }

    // 2. Client alert (§7.C) — a client's own token just listed.
    const alertClients = clients.filter((c) => c.features?.client_listing_alert && c.resolved_chat_id);
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
          // §7.C — price + mkt cap lines (client tokens have a curated coingecko_id).
          const pm = c.coingecko_id
            ? await getCoinPriceAndMcapUsd(c.coingecko_id)
            : { priceUsd: null, mcapUsd: null };
          const m = await sendMessage(c.resolved_chat_id!, buildStage1Alert(c.ticker, l, pm), c.resolved_thread_id);
          await supabase.from('kr_signal_alert_messages').insert({
            client_id: c.id, ticker: c.ticker, chat_id: String(c.resolved_chat_id), message_id: m.message_id,
            stage: 1, listed_on_key: l.listedOn, edit_due_at: new Date(now.getTime() + 24 * 3600 * 1000).toISOString(),
          });
          // §6.7 — the curated client coingecko_id beats the symbol-search guess:
          // re-freeze the baseline with it and pin the id on the listing row.
          if (c.coingecko_id) {
            const base = await getTrailing7dAvgVolumeUsd(c.coingecko_id).catch(() => 0);
            await supabase.from('kr_signal_listings')
              .update({ coingecko_id: c.coingecko_id, ...(base > 0 ? { baseline_7d: base } : {}) })
              .eq('ticker', l.symbol).eq('listed_on', l.listedOn);
          }
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
            .from('kr_signal_listings').select('venues, baseline_7d, listing_price_krw')
            .eq('ticker', a.ticker).eq('listed_on', a.listed_on_key).maybeSingle();
          const listing: DetectedListing = {
            symbol: a.ticker.toUpperCase(),
            venues: (lst as any)?.venues ?? ['upbit'],
            listedOn: a.listed_on_key,
            warning: false,
          };
          const [day1, priceNowKrw] = await Promise.all([
            getTokenKrVolumeByVenueKrw(a.ticker),
            getTokenKrPriceKrw(a.ticker).catch(() => 0),
          ]);
          // §6.7 vol-spike = day-1 KR volume (USD) ÷ frozen trailing-7d avg (USD).
          const day1Usd = fx > 0 ? day1.total / fx : 0;
          const base = Number((lst as any)?.baseline_7d ?? 0);
          const spike = base > 0 && day1Usd > 0 ? day1Usd / base : null;
          // §7.D price line — listing-time capture vs now, both KRW → USD at fx.
          const listPriceKrw = Number((lst as any)?.listing_price_krw ?? 0);
          const prices = fx > 0 && listPriceKrw > 0 && priceNowKrw > 0
            ? { listingUsd: listPriceKrw / fx, nowUsd: priceNowKrw / fx }
            : undefined;
          await editMessageText(a.chat_id, a.message_id, buildStage2Recap(a.ticker, listing, day1, fx, spike, prices));
          await supabase.from('kr_signal_listings')
            .update({ day1_kr_vol: day1.total }).eq('ticker', a.ticker).eq('listed_on', a.listed_on_key);
          await supabase.from('kr_signal_alert_messages')
            .update({ stage: 2, edited_at: now.toISOString() }).eq('id', a.id);
          summary.edits++;
        } catch (e) { /* keep sweeping */ }
      }
    }

    // 3.5 Day-1 volume capture for ALL recorded listings (§7.B digest needs
    // it, not just client tokens). Hourly cron: any row 24h+ past detection
    // without a capture gets its 24h KR volume snapshotted once.
    const { data: uncaptured } = await supabase
      .from('kr_signal_listings')
      .select('id, ticker')
      .is('day1_kr_vol', null)
      .lte('detected_at', new Date(now.getTime() - 24 * 3600 * 1000).toISOString())
      .gte('detected_at', new Date(now.getTime() - 8 * 24 * 3600 * 1000).toISOString());
    for (const row of (uncaptured ?? []) as any[]) {
      try {
        const vol = await getTokenKrVolumeKrw(row.ticker);
        if (vol > 0) {
          await supabase.from('kr_signal_listings').update({ day1_kr_vol: vol }).eq('id', row.id);
          summary.day1Captured = (summary.day1Captured ?? 0) + 1;
        }
      } catch (e) { /* keep sweeping */ }
    }

    // 4. Saturday digest (§7.B) — the week's KRW listings to digest clients.
    // Gate to a single hour (Sat 12:00 UTC = 21:00 KST) so the hourly cron
    // doesn't re-send the digest every hour on Saturday.
    if (now.getUTCDay() === 6 && now.getUTCHours() === 12) {
      const since7 = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
      const weekListings = await fetchRecentKrwListings(supabase, since7);
      const fx = await getUsdKrw().catch(() => 0);
      // §7.B — enrich each entry from the captured kr_signal_listings row:
      // Since-listing % (listing price vs now), Day-1 KR vol, vol-spike (§6.7).
      const entries: DigestEntry[] = [];
      for (const l of weekListings) {
        const entry: DigestEntry = { ...l };
        try {
          const { data: rec } = await supabase
            .from('kr_signal_listings')
            .select('listing_price_krw, day1_kr_vol, baseline_7d')
            .eq('ticker', l.symbol).eq('listed_on', l.listedOn).maybeSingle();
          const listPrice = Number((rec as any)?.listing_price_krw ?? 0);
          if (listPrice > 0) {
            const nowPrice = await getTokenKrPriceKrw(l.symbol).catch(() => 0);
            if (nowPrice > 0) entry.sinceListingPct = ((nowPrice - listPrice) / listPrice) * 100;
          }
          const day1 = Number((rec as any)?.day1_kr_vol ?? 0);
          if (day1 > 0) entry.day1KrVolKrw = day1;
          const base = Number((rec as any)?.baseline_7d ?? 0);
          if (day1 > 0 && base > 0 && fx > 0) entry.spikeMultiple = day1 / fx / base;
        } catch (e) { /* entry renders with whatever enrichment landed */ }
        entries.push(entry);
      }
      const html = buildListingsDigest(entries, weekLabelFor(now), fx);
      const digestClients = clients.filter((c) => c.features?.korea_listings_digest && c.resolved_chat_id);
      for (const c of digestClients) {
        try { await sendMessage(c.resolved_chat_id!, html, c.resolved_thread_id); summary.digests++; } catch (e) { /* keep sweeping */ }
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
