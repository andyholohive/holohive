/**
 * GET /api/initiatives           — list (active, completed, parked, excluding soft-deleted)
 * POST /api/initiatives          — create new initiative
 */

import { NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/dashboard/queries';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const sb = adminSupabase();
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status'); // 'active' | 'completed' | 'parked' | null
    let q = (sb as any)
      .from('initiatives')
      .select('id, name, owner_user_id, status, category_tags, created_at, updated_at')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });
    if (statusFilter && ['active', 'completed', 'parked'].includes(statusFilter)) {
      q = q.eq('status', statusFilter);
    }
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ initiatives: data ?? [] });
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
      owner_user_id: body.owner_user_id || null,
      status: body.status && ['active', 'completed', 'parked'].includes(body.status) ? body.status : 'active',
      category_tags: Array.isArray(body.category_tags) ? body.category_tags.map((t: any) => String(t).trim()).filter(Boolean) : [],
    };
    const { data, error } = await (sb as any)
      .from('initiatives')
      .insert(insert)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ initiative: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to create initiative', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
