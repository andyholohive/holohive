/**
 * PATCH /api/initiatives/:id — update name, status, owner, tags. Bumps updated_at.
 * DELETE /api/initiatives/:id — soft delete (sets deleted_at). Linked tasks unaffected
 *   (tasks.linked_initiative is ON DELETE SET NULL but soft-delete just hides the row).
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
    if (body.owner_user_id !== undefined) patch.owner_user_id = body.owner_user_id || null;
    if (body.status !== undefined) {
      if (!['active', 'completed', 'parked'].includes(body.status)) {
        return NextResponse.json({ error: 'invalid status' }, { status: 400 });
      }
      patch.status = body.status;
    }
    if (body.category_tags !== undefined) {
      patch.category_tags = Array.isArray(body.category_tags)
        ? body.category_tags.map((t: any) => String(t).trim()).filter(Boolean)
        : [];
    }
    const { data, error } = await (sb as any)
      .from('initiatives')
      .update(patch)
      .eq('id', params.id)
      .is('deleted_at', null)
      .select()
      .single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ initiative: data });
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
    const { error } = await (sb as any)
      .from('initiatives')
      .update({ deleted_at: new Date().toISOString() })
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
