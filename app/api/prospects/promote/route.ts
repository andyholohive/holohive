import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { ProspectsService } from '@/lib/prospectsService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/prospects/promote — Promote prospect(s) to pipeline opportunities
 * Body: { id: string } — single promote
 * Body: { ids: string[] } — bulk promote
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();

    // Bulk promote
    if (body.ids && Array.isArray(body.ids)) {
      const result = await ProspectsService.bulkPromote(body.ids, user.id);
      return NextResponse.json(result);
    }

    // Single promote
    if (body.id) {
      const oppId = await ProspectsService.promote(body.id, user.id);
      return NextResponse.json({ success: true, opportunity_id: oppId });
    }

    return NextResponse.json({ error: 'id or ids required' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PATCH /api/prospects/promote — Dismiss or update status
 * Body: { id: string, status: 'dismissed' | 'reviewed' | 'new' }
 * Body: { ids: string[], status: 'dismissed' }
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const status = body.status;

    if (body.ids && Array.isArray(body.ids) && status) {
      // Bulk status update — works for any status (dismissed, reviewed, needs_review, new)
      const { error } = await supabase
        .from('prospects')
        .update({ status, updated_at: new Date().toISOString() })
        .in('id', body.ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, updated: body.ids.length });
    }

    if (body.id && status) {
      const { error } = await supabase
        .from('prospects')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/prospects/promote — Delete prospect(s)
 * Body: { id: string } — single delete
 * Body: { ids: string[] } — bulk delete
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const ids = body.ids || (body.id ? [body.id] : []);

    if (ids.length === 0) {
      return NextResponse.json({ error: 'id or ids required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('prospects')
      .delete()
      .in('id', ids);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, deleted: ids.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
