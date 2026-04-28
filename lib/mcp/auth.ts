import { createClient } from '@supabase/supabase-js';

/**
 * Bearer-token validator for MCP requests.
 *
 * Claude.ai sends `Authorization: Bearer <access_token>` on every
 * MCP call. We look the token up in `mcp_oauth_access_tokens`, check
 * it hasn't expired, and return the user_id+email it represents.
 * The token also gets a last_used_at bump for audit visibility.
 *
 * Returns null on any failure (missing header, malformed token,
 * expired, not found) — caller responds with 401.
 */
export interface McpAuthContext {
  user_id: string;
  user_email: string | null;
  client_id: string;
  token: string;
}

export async function authenticateMcpRequest(req: Request): Promise<McpAuthContext | null> {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('[MCP auth] Supabase config missing');
    return null;
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data, error } = await (supabase as any)
    .from('mcp_oauth_access_tokens')
    .select('token, user_id, user_email, client_id, expires_at')
    .eq('token', token)
    .single();

  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;

  // Best-effort last_used_at bump — fire and forget. If this fails it
  // just means the audit trail is slightly out of date; doesn't affect
  // the request.
  (supabase as any)
    .from('mcp_oauth_access_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('token', token)
    .then(() => {})
    .catch(() => {});

  return {
    user_id: data.user_id,
    user_email: data.user_email,
    client_id: data.client_id,
    token,
  };
}

/** Build a 401 response that complies with RFC 6750. The
 *  WWW-Authenticate header tells Claude.ai *why* auth failed, which
 *  triggers the re-auth flow rather than a permanent error. */
export function unauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({ error: 'invalid_token', error_description: 'Bearer token is missing, malformed, or expired' }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer realm="HoloHive MCP", error="invalid_token"',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}
