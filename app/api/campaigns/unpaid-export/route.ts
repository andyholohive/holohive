import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/campaigns/unpaid-export — every unpaid payment, as CSV.
 *
 * [2026-08-18, Andy] Asked for from the All Budgets rollup on /campaigns:
 * one button, all the unpaid, chase the money.
 *
 * SCOPE, stated because it deliberately differs from the panel it launches
 * from. The rollup shows active non-ad-hoc clients only — 5 of them — and
 * just 2 of the 83 unpaid payments sit inside that set. Exporting the
 * rollup's scope would silently drop 81 rows a finance chase needs, so
 * this returns everything unpaid and carries an `In Rollup Scope` column
 * instead. Filtering is something a spreadsheet does well; recovering rows
 * that were never exported is not.
 *
 * The one exception, added 2026-08-25: rows on ARCHIVED clients are dropped.
 * Archived means the record was deleted — test data and internal
 * placeholders — so unlike an inactive client there is nothing to chase.
 *
 * "Unpaid" is `payment_date IS NULL`, the same test the Content tab and the
 * Analytics alert use. Amount is NOT part of it: a $0 payment is a real
 * settled deal (token, WL, barter), so zero-amount rows still count as
 * unpaid until dated, and they're flagged so they can be told apart from a
 * genuine sum awaiting transfer.
 */
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/** RFC-4180 quoting: wrap always, double any inner quote. Campaign and KOL
 *  names contain commas and quotes often enough that this isn't optional. */
function cell(v: unknown): string {
  if (v === null || v === undefined) return '""';
  return `"${String(v).replace(/"/g, '""')}"`;
}

export async function GET() {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = serviceClient();
  if (!supabase) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });

  const { data: payments, error } = await supabase
    .from('payments')
    .select('id, amount, campaign_id, campaign_kol_id, recipient_name, payment_category, wallet, notes, created_at')
    .is('payment_date', null)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = payments ?? [];
  const campaignIds = Array.from(new Set(rows.map(r => r.campaign_id).filter(Boolean)));
  const kolLinkIds = Array.from(new Set(rows.map(r => r.campaign_kol_id).filter(Boolean)));

  const [{ data: campaigns }, { data: kolLinks }] = await Promise.all([
    campaignIds.length
      ? supabase.from('campaigns').select('id, name, status, client_id').in('id', campaignIds)
      : Promise.resolve({ data: [] as any[] }),
    kolLinkIds.length
      ? supabase.from('campaign_kols').select('id, master_kol_id').in('id', kolLinkIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const clientIds = Array.from(new Set((campaigns ?? []).map(c => c.client_id).filter(Boolean)));
  const masterKolIds = Array.from(new Set((kolLinks ?? []).map(k => k.master_kol_id).filter(Boolean)));

  const [{ data: clients }, { data: kols }] = await Promise.all([
    clientIds.length
      ? supabase.from('clients').select('id, name, is_active, is_ad_hoc, archived_at').in('id', clientIds)
      : Promise.resolve({ data: [] as any[] }),
    masterKolIds.length
      ? supabase.from('master_kols').select('id, name').in('id', masterKolIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const campaignById = new Map((campaigns ?? []).map(c => [c.id, c]));
  const clientById = new Map((clients ?? []).map(c => [c.id, c]));
  const kolNameByLink = new Map(
    (kolLinks ?? []).map(l => [l.id, (kols ?? []).find(k => k.id === l.master_kol_id)?.name ?? null]),
  );

  const header = [
    'Client', 'Campaign', 'Campaign Status', 'KOL', 'Recipient', 'Amount USD',
    'Zero Amount', 'Category', 'Wallet', 'Notes', 'Created', 'In Rollup Scope', 'Payment ID',
  ];

  // [2026-08-25, Andy] Archived clients are dropped entirely, unlike merely
  // inactive ones which stay and are flagged out-of-scope.
  //
  // The distinction is whether the row is chaseable. An inactive client —
  // Altura, Impossible, X1 — is a real engagement that ended, and money may
  // genuinely still be owed. An archived one is a deleted record: test data
  // and internal placeholders nobody will ever invoice. Those were 15 of the
  // 95 rows and are noise even after filtering on In Rollup Scope.
  //
  // Deliberately narrower than the "export everything" rule above, which
  // exists so a finance chase never silently loses a chaseable row. An
  // archived client has none.
  const visibleRows = rows.filter(p => {
    const campaign = p.campaign_id ? campaignById.get(p.campaign_id) : null;
    const client = campaign?.client_id ? clientById.get(campaign.client_id) : null;
    return !client?.archived_at;
  });

  const body = visibleRows.map(p => {
    const campaign = p.campaign_id ? campaignById.get(p.campaign_id) : null;
    const client = campaign?.client_id ? clientById.get(campaign.client_id) : null;
    const inScope = !!client?.is_active && !client?.is_ad_hoc;
    return [
      client?.name ?? '(no client)',
      campaign?.name ?? '(no campaign)',
      campaign?.status ?? '',
      p.campaign_kol_id ? (kolNameByLink.get(p.campaign_kol_id) ?? '') : '',
      p.recipient_name ?? '',
      // Raw number, unformatted — a spreadsheet should get a number, not "$1,200".
      p.amount ?? 0,
      Number(p.amount ?? 0) === 0 ? 'yes' : '',
      p.payment_category ?? '',
      p.wallet ?? '',
      p.notes ?? '',
      p.created_at ? String(p.created_at).slice(0, 10) : '',
      inScope ? 'yes' : 'no',
      p.id,
    ].map(cell).join(',');
  });

  // Leading BOM so Excel opens UTF-8 KOL names correctly rather than as mojibake.
  const csv = '﻿' + [header.map(cell).join(','), ...body].join('\r\n');
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="unpaid-payments-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
