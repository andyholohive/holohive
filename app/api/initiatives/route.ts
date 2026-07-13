/**
 * GET /api/initiatives           — list promoted specs (is_initiative)
 * POST /api/initiatives          — create a new initiative (a promoted spec)
 *
 * [2026-07-14] Initiatives merged into specs (Plan A): an initiative is a
 * spec with is_initiative=true. This route now reads/writes `specs` but
 * keeps the old response shape ({ id, name, owner_user_id, status,
 * category_tags, ... }) so the /initiatives + /tasks tabs need no change.
 * `initiative_status` on the spec carries the active/completed/parked
 * value (spec.status is a separate build-status field, left untouched).
 */

import { NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/dashboard/queries';

export const dynamic = 'force-dynamic';

/** Shape a promoted-spec row like a legacy initiative row. */
function toInitiative(s: any) {
  return {
    id: s.id,
    name: s.name,
    owner_user_id: s.owner_id ?? null,
    status: s.initiative_status ?? 'active',
    category_tags: s.category_tags ?? [],
    created_at: s.created_at,
    updated_at: s.updated_at,
  };
}

export async function GET(request: Request) {
  try {
    const sb = adminSupabase();
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status'); // 'active' | 'completed' | 'parked' | null
    let q = (sb as any)
      .from('specs')
      .select('id, name, owner_id, initiative_status, category_tags, created_at, updated_at')
      .eq('is_initiative', true)
      .order('updated_at', { ascending: false });
    if (statusFilter && ['active', 'completed', 'parked'].includes(statusFilter)) {
      q = q.eq('initiative_status', statusFilter);
    }
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ initiatives: (data ?? []).map(toInitiative) });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to list initiatives', detail: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const sb = adminSupabase();
    const body = await request.json();
    if (!body?.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    const insert: Record<string, any> = {
      name: body.name.trim(),
      is_initiative: true,
      owner_id: body.owner_user_id || null,
      initiative_status: body.status && ['active', 'completed', 'parked'].includes(body.status) ? body.status : 'active',
      category_tags: Array.isArray(body.category_tags) ? body.category_tags.map((t: any) => String(t).trim()).filter(Boolean) : [],
    };
    const { data, error } = await (sb as any)
      .from('specs')
      .insert(insert)
      .select('id, name, owner_id, initiative_status, category_tags, created_at, updated_at')
      .single();
    if (error) throw error;
    return NextResponse.json({ initiative: toInitiative(data) }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to create initiative', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
