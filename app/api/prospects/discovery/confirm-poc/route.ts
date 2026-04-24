import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * POST /api/prospects/discovery/confirm-poc
 *
 * Flips `is_grok_sourced` from true → false on a specific POC, removing the
 * "needs review" amber tint in the UI. Optionally accepts `action: 'delete'`
 * to remove the POC entirely (for obvious hallucinations).
 *
 * Body:
 *   {
 *     prospect_id: string,
 *     poc_index:   number,               // index into outreach_contacts
 *     action?:     'confirm' | 'delete'  // default 'confirm'
 *   }
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.prospect_id || typeof body.poc_index !== 'number') {
    return NextResponse.json(
      { error: 'Missing prospect_id or poc_index' },
      { status: 400 },
    );
  }
  const action: 'confirm' | 'delete' = body.action === 'delete' ? 'delete' : 'confirm';

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Read current contacts, mutate at the requested index, write back.
  // Not atomic vs concurrent edits, but contacts are rarely edited by
  // multiple people simultaneously so optimistic read-modify-write is fine.
  const { data: prospect, error: loadErr } = await (supabase as any)
    .from('prospects')
    .select('outreach_contacts')
    .eq('id', body.prospect_id)
    .single();
  if (loadErr || !prospect) {
    return NextResponse.json({ error: loadErr?.message || 'Prospect not found' }, { status: 404 });
  }

  const contacts: any[] = Array.isArray(prospect.outreach_contacts) ? prospect.outreach_contacts : [];
  if (body.poc_index < 0 || body.poc_index >= contacts.length) {
    return NextResponse.json({ error: 'poc_index out of range' }, { status: 400 });
  }

  let next: any[];
  if (action === 'delete') {
    next = contacts.filter((_, i) => i !== body.poc_index);
  } else {
    next = contacts.map((c, i) =>
      i === body.poc_index
        ? { ...c, is_grok_sourced: false, reviewed_at: new Date().toISOString() }
        : c,
    );
  }

  const { error: updErr } = await (supabase as any)
    .from('prospects')
    .update({ outreach_contacts: next, updated_at: new Date().toISOString() })
    .eq('id', body.prospect_id);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    action,
    remaining_contacts: next.length,
  });
}
