import { createServerClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * /oauth/authorize — the OAuth consent page.
 *
 * Claude.ai sends the user here when they connect our MCP server.
 * Responsibilities:
 *   1. Verify the user is logged into HoloHive (Supabase session).
 *      If not, kick them to /auth and bounce back here after sign-in.
 *   2. Look up the registered client and validate redirect_uri.
 *   3. (Optional) Enforce an MCP_ALLOWED_EMAILS gate so a teammate
 *      with a HoloHive login can't grant access to OUR data on YOUR
 *      Claude.ai account.
 *   4. Render an Allow/Deny form. The form POSTs to
 *      /api/oauth/consent (a regular handler, not a Server Action,
 *      because Next 13.5 needs an experimental flag for actions and
 *      we'd rather not enable that for one form).
 *
 * The actual auth-code issuance and final redirect happens server-side
 * in /api/oauth/consent. This page is just validation + UI.
 */
export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const clientId = strParam(params.client_id);
  const redirectUri = strParam(params.redirect_uri);
  const responseType = strParam(params.response_type);
  const state = strParam(params.state);
  const codeChallenge = strParam(params.code_challenge);
  const codeChallengeMethod = strParam(params.code_challenge_method);

  if (!clientId || !redirectUri || responseType !== 'code') {
    return errorScreen(
      'Invalid authorization request',
      'Missing client_id / redirect_uri, or response_type is not "code".',
    );
  }

  // ── Auth check ──
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Send to /auth (HoloHive sign-in) with a redirectTo that rebuilds
    // this exact URL after login completes.
    const callbackUrl = `/oauth/authorize?${new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).filter(([, v]) => typeof v === 'string'),
      ) as Record<string, string>,
    ).toString()}`;
    redirect(`/auth?redirectTo=${encodeURIComponent(callbackUrl)}`);
  }

  // ── Allowed-emails gate ──
  const allowedRaw = process.env.MCP_ALLOWED_EMAILS;
  if (allowedRaw && allowedRaw.trim().length > 0) {
    const allowed = allowedRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const userEmail = (user.email || '').toLowerCase();
    if (!allowed.includes(userEmail)) {
      return errorScreen(
        'Not authorized',
        `Your account (${user.email}) is not in the MCP_ALLOWED_EMAILS list. Contact the workspace admin if this is unexpected.`,
      );
    }
  }

  // ── Resolve and validate client ──
  const service = serviceClient();
  if (!service) return errorScreen('Server error', 'Supabase service config missing.');

  const { data: client } = await (service as any)
    .from('mcp_oauth_clients')
    .select('id, client_id, client_name, redirect_uris')
    .eq('client_id', clientId)
    .single();
  if (!client) {
    return errorScreen(
      'Unknown client',
      'This OAuth client is not registered. Try removing and re-adding the connector in Claude.ai.',
    );
  }
  if (!Array.isArray(client.redirect_uris) || !client.redirect_uris.includes(redirectUri)) {
    return errorScreen(
      'Invalid redirect_uri',
      'The redirect URI does not match what was registered for this client.',
    );
  }

  return (
    <main className="flex items-center justify-center min-h-screen bg-gray-50 p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 max-w-md w-full p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-full bg-brand flex items-center justify-center text-white font-bold">
            H
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Authorize connection</h1>
            <p className="text-xs text-gray-500">HoloHive · MCP connector</p>
          </div>
        </div>

        <p className="text-sm text-gray-700 mb-2">
          <strong className="font-semibold">{client.client_name || 'An external app'}</strong> is requesting
          access to your HoloHive data so it can answer questions on your behalf.
        </p>
        <p className="text-xs text-gray-500 mb-5">
          Signed in as <strong className="font-medium text-gray-700">{user.email}</strong>.
          You can revoke access any time by deleting the rows in
          <code className="text-[10px] bg-gray-100 px-1 rounded mx-1">mcp_oauth_access_tokens</code>.
        </p>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 mb-5 space-y-1">
          <div className="font-semibold text-gray-800 mb-1">This will allow it to:</div>
          <div>• Read prospects, campaigns, KOLs, and Korean exchange listings</div>
          <div>• Run searches and summaries over your HoloHive data</div>
          <div className="text-gray-500">• It will <strong>not</strong> be able to modify or delete records</div>
        </div>

        {/* Hidden fields carry the original OAuth params over to the
            consent handler so it can issue a code bound to this exact
            request (correct client_id, redirect_uri, PKCE). */}
        <form action="/api/oauth/consent" method="POST" className="flex gap-2">
          <input type="hidden" name="client_id" value={clientId} />
          <input type="hidden" name="redirect_uri" value={redirectUri} />
          {state && <input type="hidden" name="state" value={state} />}
          {codeChallenge && <input type="hidden" name="code_challenge" value={codeChallenge} />}
          {codeChallengeMethod && (
            <input type="hidden" name="code_challenge_method" value={codeChallengeMethod} />
          )}
          <button
            type="submit"
            name="consent"
            value="deny"
            className="flex-1 px-4 py-2 rounded-md border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
          >
            Deny
          </button>
          <button
            type="submit"
            name="consent"
            value="allow"
            className="flex-1 px-4 py-2 rounded-md text-white text-sm font-semibold hover:opacity-90"
            style={{ backgroundColor: '#3e8692' }}
          >
            Allow
          </button>
        </form>
      </div>
    </main>
  );
}

function strParam(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function errorScreen(title: string, detail: string) {
  return (
    <main className="flex items-center justify-center min-h-screen bg-gray-50 p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 max-w-md w-full p-8 text-center">
        <h1 className="text-lg font-semibold text-gray-900 mb-2">{title}</h1>
        <p className="text-sm text-gray-600">{detail}</p>
      </div>
    </main>
  );
}
