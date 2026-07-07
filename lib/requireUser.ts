/**
 * Lightweight authenticated-user guard for API routes that any logged-in
 * team member may call (not just super-admins).
 *
 * Returns the session user's id + role (resolved from the `users` table,
 * whose PK equals the Supabase auth user id — see requireSuperAdmin). Use
 * this for user-facing endpoints like reimbursement submission where the
 * caller acts on their own rows; gate admin-only actions with
 * requireSuperAdmin instead.
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

export interface UserGuardSuccess {
  ok: true;
  user: { id: string; name: string; role: string };
}
export interface UserGuardFailure {
  ok: false;
  response: NextResponse;
}

export async function requireUser(
  _request: Request,
): Promise<UserGuardSuccess | UserGuardFailure> {
  let sessionUserId: string | null = null;
  try {
    const sb = await createServerClient();
    const { data: { user } } = await sb.auth.getUser();
    sessionUserId = user?.id ?? null;
  } catch (err) {
    console.error('[requireUser] session lookup failed:', err);
  }
  if (!sessionUserId) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, response: NextResponse.json({ error: 'Server misconfigured' }, { status: 500 }) };
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: profile, error } = await (admin as any)
    .from('users')
    .select('id, name, role')
    .eq('id', sessionUserId)
    .maybeSingle();
  if (error || !profile) {
    return { ok: false, response: NextResponse.json({ error: 'User profile missing' }, { status: 403 }) };
  }
  return { ok: true, user: { id: profile.id, name: profile.name, role: profile.role } };
}
