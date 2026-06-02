/**
 * PATCH /api/meeting-action-items/:id — toggle is_done, edit text, or change ownership.
 *   If is_done is toggled true and an auto-created task exists, also mark the task complete.
 * DELETE /api/meeting-action-items/:id — hard delete the item (auto-created task is NOT
 *   deleted; user can clean up manually if needed).
 */

import { NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/dashboard/queries';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const sb = adminSupabase();
    const body = await request.json();
    const patch: Record<string, any> = {};
    if (body.text !== undefined) patch.text = String(body.text).trim();
    if (body.is_done !== undefined) patch.is_done = !!body.is_done;
    if (body.owner_user_id !== undefined) patch.owner_user_id = body.owner_user_id || null;
    if (body.owner_client_side !== undefined) patch.owner_client_side = !!body.owner_client_side;

    const { data, error } = await (sb as any)
      .from('meeting_action_items')
      .update(patch)
      .eq('id', params.id)
      .select()
      .single();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });

    // If we just marked done AND there's an auto-created task, propagate.
    if (patch.is_done === true && data.auto_created_task_id) {
      await (sb as any)
        .from('tasks')
        .update({ status: 'complete', completed_at: new Date().toISOString() })
        .eq('id', data.auto_created_task_id);
    }

    return NextResponse.json({ actionItem: data });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to update action item', detail: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const sb = adminSupabase();
    const { error } = await (sb as any)
      .from('meeting_action_items')
      .delete()
      .eq('id', params.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to delete action item', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
