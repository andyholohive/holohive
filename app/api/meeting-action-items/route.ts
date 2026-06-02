/**
 * Meeting action items API.
 *
 * GET ?meeting_note_id=... — list action items for a meeting note
 * POST                    — create an action item, auto-create a task if HH-side
 *
 * Per Jdot spec: structured action items replace the freeform
 * `client_meeting_notes.action_items` text blob. When an item is HH-side
 * (owner_user_id set, owner_client_side false), we atomically create a
 * task linked back via `meeting_action_items.auto_created_task_id` so the
 * dashboard can surface "tasks created from call notes this week".
 */

import { NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/dashboard/queries';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const meetingNoteId = searchParams.get('meeting_note_id');
    if (!meetingNoteId) {
      return NextResponse.json({ error: 'meeting_note_id required' }, { status: 400 });
    }
    const sb = adminSupabase();
    const { data, error } = await (sb as any)
      .from('meeting_action_items')
      .select('id, meeting_note_id, text, owner_user_id, owner_client_side, is_done, auto_created_task_id, created_at')
      .eq('meeting_note_id', meetingNoteId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ actionItems: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to list action items', detail: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const sb = adminSupabase();
    const body = await request.json();
    if (!body?.meeting_note_id) {
      return NextResponse.json({ error: 'meeting_note_id required' }, { status: 400 });
    }
    if (!body?.text || typeof body.text !== 'string' || !body.text.trim()) {
      return NextResponse.json({ error: 'text required' }, { status: 400 });
    }

    const ownerUserId: string | null = body.owner_user_id || null;
    const ownerClientSide = !!body.owner_client_side;

    // 1. Insert the action item
    const { data: item, error: insertErr } = await (sb as any)
      .from('meeting_action_items')
      .insert({
        meeting_note_id: body.meeting_note_id,
        text: body.text.trim(),
        owner_user_id: ownerUserId,
        owner_client_side: ownerClientSide,
        is_done: false,
      })
      .select()
      .single();
    if (insertErr) throw insertErr;

    // 2. If HH-side (owner assigned + not client-side), auto-create a task.
    //    Look up the meeting note to get client_id + meeting_date for source attribution.
    let autoTask = null;
    if (ownerUserId && !ownerClientSide) {
      const { data: note } = await (sb as any)
        .from('client_meeting_notes')
        .select('client_id, meeting_date, title')
        .eq('id', body.meeting_note_id)
        .single();

      const { data: owner } = await (sb as any)
        .from('users')
        .select('name')
        .eq('id', ownerUserId)
        .single();

      const { data: task, error: taskErr } = await (sb as any)
        .from('tasks')
        .insert({
          task_name: body.text.trim(),
          assigned_to: ownerUserId,
          assigned_to_name: owner?.name || null,
          client_id: note?.client_id || null,
          status: 'to_do',
          priority: 'medium',
          task_type: 'General',
          frequency: 'one-time',
          source: 'call_note',
          source_date: note?.meeting_date || null,
          source_ref: item.id,
          description: note?.title ? `Auto-created from call notes: ${note.title}` : 'Auto-created from call notes',
        })
        .select()
        .single();

      if (!taskErr && task) {
        autoTask = task;
        // Link back
        await (sb as any)
          .from('meeting_action_items')
          .update({ auto_created_task_id: task.id })
          .eq('id', item.id);
        item.auto_created_task_id = task.id;
      }
    }

    return NextResponse.json({ actionItem: item, autoCreatedTask: autoTask }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to create action item', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
