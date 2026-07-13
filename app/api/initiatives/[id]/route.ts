/**
 * PATCH /api/initiatives/:id — update name, status, owner, tags on the
 *   promoted spec (is_initiative). Bumps updated_at.
 * DELETE /api/initiatives/:id — DEMOTE: set is_initiative=false. The spec
 *   (and its features) survive; it just drops off the initiatives list +
 *   dashboard card. [2026-07-14] Initiatives merged into specs (Plan A).
 */

import { NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/dashboard/queries';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const sb = adminSupabase();
    const body = await request.json();
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.owner_user_id !== undefined) patch.owner_id = body.owner_user_id || null;
    if (body.status !== undefined) {
      if (!['active', 'completed', 'parked'].includes(body.status)) {
        return NextResponse.json({ error: 'invalid status' }, { status: 400 });
      }
      patch.initiative_status = body.status;
    }
    if (body.category_tags !== undefined) {
      patch.category_tags = Array.isArray(body.category_tags)
        ? body.category_tags.map((t: any) => String(t).trim()).filter(Boolean)
        : [];
    }
    const { data, error } = await (sb as any)
      .from('specs')
      .update(patch)
      .eq('id', params.id)
      .eq('is_initiative', true)
      .select('id, name, owner_id, initiative_status, category_tags, created_at, updated_at')
      .single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({
      initiative: {
        id: data.id, name: data.name, owner_user_id: data.owner_id ?? null,
        status: data.initiative_status ?? 'active', category_tags: data.category_tags ?? [],
        created_at: data.created_at, updated_at: data.updated_at,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to update initiative', detail: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const sb = adminSupabase();
    // Demote rather than destroy — the spec (and its features) remain.
    const { error } = await (sb as any)
      .from('specs')
      .update({ is_initiative: false, updated_at: new Date().toISOString() })
      .eq('id', params.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to delete initiative', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
