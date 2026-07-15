/**
 * Shared super_admin guard for API routes.
 *
 * Use at the top of any /api/* handler that should only allow
 * super-admin users. Returns either:
 *   - A NextResponse with a 401/403 if the user is unauthenticated
 *     or not super_admin (the caller returns this directly)
 *   - The authenticated super-admin user row, so the handler can
 *     reference `userId` / `name` for audit fields without re-querying
 *
 * The cron-secret bypass (Authorization: Bearer ${CRON_SECRET}) from
 * the wider middleware also applies here — server-to-server calls
 * that come through a cron skip the user check entirely and the
 * returned `user` will be null with `isCron = true`.
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

export interface SuperAdminGuardSuccess {
  ok: true;
  isCron: boolean;
  user: { id: string; name: string; role: string } | null;
}

export interface SuperAdminGuardFailure {
  ok: false;
  response: NextResponse;
}

/**
 * Role-parameterized guard. `requireSuperAdmin` is the `['super_admin']`
 * case; pass `['admin', 'super_admin']` for routes any team lead may hit
 * (e.g. the lineup-notify dispatch, which admins like CMs legitimately
 * trigger when they propose/confirm a lineup — gating it to super_admin
 * silently dropped the Telegram post [Andy 2026-07-16]).
 */
export async function requireRole(
  request: Request,
  allowedRoles: string[],
): Promise<SuperAdminGuardSuccess | SuperAdminGuardFailure> {
  // ─── Cron / server-to-server bypass ────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') || '';
    if (auth === `Bearer ${cronSecret}`) {
      return { ok: true, isCron: true, user: null };
    }
  }

  // ─── Session-based auth ────────────────────────────────────────────
  let sessionUser: { id: string } | null = null;
  try {
    const sb = await createServerClient();
    const { data: { user } } = await sb.auth.getUser();
    sessionUser = user ? { id: user.id } : null;
  } catch (err) {
    console.error('[requireRole] session lookup failed:', err);
  }

  if (!sessionUser) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  // ─── Role check (service role to bypass RLS on users) ──────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Server misconfigured' }, { status: 500 }),
    };
  }
  const admin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: profile, error } = await (admin as any)
    .from('users')
    .select('id, name, role')
    .eq('id', sessionUser.id)
    .maybeSingle();

  if (error || !profile) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'User profile missing' }, { status: 403 }),
    };
  }
  if (!allowedRoles.includes(profile.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Requires one of: ${allowedRoles.join(', ')}` },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    isCron: false,
    user: { id: profile.id, name: profile.name, role: profile.role },
  };
}

export async function requireSuperAdmin(
  request: Request,
): Promise<SuperAdminGuardSuccess | SuperAdminGuardFailure> {
  return requireRole(request, ['super_admin']);
}
