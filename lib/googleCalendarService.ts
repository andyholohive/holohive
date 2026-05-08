/**
 * Google Calendar integration for meeting reminders.
 *
 * Self-contained — no `googleapis` npm dep. We hit Google's OAuth + Calendar
 * REST endpoints directly via fetch. Keeps the bundle small and avoids
 * pulling in the entire SDK for what amounts to one auth flow + one
 * `events.list` call.
 *
 * Flow:
 *   1. /api/google/oauth/start → buildAuthUrl() → redirect user to Google
 *   2. Google redirects back to /api/google/oauth/callback with `code`
 *   3. exchangeCodeForTokens(code) → store in google_oauth_tokens
 *   4. Cron calls listUpcomingMeetEvents() per connected user, filters to
 *      events with a real Google Meet link
 *
 * Token refresh: access tokens last ~1h. We refresh lazily — if expires_at
 * is in the past (with a 60s buffer), getValidAccessToken() refreshes via
 * the stored refresh_token and writes the new access_token back.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';

// ── Config ─────────────────────────────────────────────────────────────

// We only need read access to the user's calendars. `calendar.readonly`
// would also work but `events.readonly` is the narrowest scope that lets
// us call events.list, which is all we do here.
export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

const GOOGLE_OAUTH_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_CALENDAR_LIST_URL =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events';

// ── Types ──────────────────────────────────────────────────────────────

export interface GoogleOAuthTokens {
  user_id: string;
  google_email: string;
  access_token: string;
  refresh_token: string;
  expires_at: string; // ISO timestamp
  scope: string;
  connected_at: string;
  updated_at: string;
}

export interface MeetEvent {
  id: string;            // Google's event id
  summary: string;       // event title
  start: string;         // ISO timestamp
  end: string;           // ISO timestamp
  meetLink: string;      // hangoutLink (always present after our filter)
  attendeeCount: number; // # of invitees
  htmlLink?: string;     // calendar.google.com link to the event
}

// ── Auth URL ───────────────────────────────────────────────────────────

/**
 * Build the consent screen URL the user is redirected to. State should be
 * a random opaque token that the callback verifies — typically the user_id
 * + a CSRF token, signed or stored in a short-lived cookie.
 */
export function buildAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = getRedirectUri();
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID not configured');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_OAUTH_SCOPES,
    // access_type=offline + prompt=consent guarantees we get a refresh_token
    // even on a re-connect. Without prompt=consent Google often omits the
    // refresh_token on subsequent flows for the same user.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${GOOGLE_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Resolve the redirect URI. Prefer GOOGLE_REDIRECT_URI for explicit
 * configuration; fall back to NEXT_PUBLIC_BASE_URL or VERCEL_URL.
 * Whatever we use here MUST be added to the OAuth client's authorized
 * redirect URIs in the Google Cloud Console — Google rejects the flow
 * otherwise with a `redirect_uri_mismatch` error.
 */
export function getRedirectUri(): string {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const base = process.env.NEXT_PUBLIC_BASE_URL
    ? (process.env.NEXT_PUBLIC_BASE_URL.startsWith('http')
        ? process.env.NEXT_PUBLIC_BASE_URL
        : `https://${process.env.NEXT_PUBLIC_BASE_URL}`)
    : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  return `${base}/api/google/oauth/callback`;
}

// ── Token exchange ─────────────────────────────────────────────────────

/**
 * Exchange the authorization code from the callback for an access_token
 * + refresh_token. Also fetches the user's Google email so we can show
 * "Connected as foo@gmail.com" in the UI.
 */
export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  email: string;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID/SECRET not configured');
  }

  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getRedirectUri(),
    grant_type: 'authorization_code',
  });

  const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${data.error_description || data.error || res.statusText}`);
  }
  if (!data.refresh_token) {
    // We requested prompt=consent specifically to force this — if it's
    // still missing the user previously connected with a different scope
    // and Google is reusing their grant. Tell them to revoke + reconnect.
    throw new Error('No refresh_token returned. Revoke the connection at https://myaccount.google.com/permissions and try again.');
  }

  // Fetch userinfo to get the connected email
  const userRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const userData = await userRes.json();
  if (!userRes.ok) {
    throw new Error(`Failed to fetch userinfo: ${userData.error || userRes.statusText}`);
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    scope: data.scope,
    email: userData.email,
  };
}

/**
 * Refresh an expired access_token using the stored refresh_token.
 * Returns the new access_token + expires_in.
 */
async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID/SECRET not configured');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Token refresh failed: ${data.error_description || data.error || res.statusText}`);
  }
  return { access_token: data.access_token, expires_in: data.expires_in };
}

/**
 * Return a non-expired access token for the given user. Refreshes via the
 * stored refresh_token if needed and writes the new access_token back to
 * google_oauth_tokens. Throws if the user isn't connected.
 */
export async function getValidAccessToken(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  const { data: tokens, error } = await (supabase as any)
    .from('google_oauth_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .single();

  if (error || !tokens) {
    throw new Error(`No Google connection for user ${userId}`);
  }

  // 60-second buffer — refresh slightly early to avoid mid-request expiry.
  const expiresAt = new Date(tokens.expires_at).getTime();
  if (Date.now() < expiresAt - 60_000) {
    return tokens.access_token;
  }

  // Need to refresh
  const refreshed = await refreshAccessToken(tokens.refresh_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await (supabase as any)
    .from('google_oauth_tokens')
    .update({
      access_token: refreshed.access_token,
      expires_at: newExpiresAt,
    })
    .eq('user_id', userId);
  return refreshed.access_token;
}

// ── Calendar fetch ─────────────────────────────────────────────────────

/**
 * List the user's upcoming Google Meet events within `lookaheadMinutes`
 * from now. Filters out events without a `hangoutLink` (Andy's choice:
 * Meet-only, not arbitrary calendar events) and cancelled events.
 *
 * Notes on Google's events.list:
 *   - timeMin/timeMax bound the search to the [now, now+lookahead] range
 *   - singleEvents=true expands recurring events into individual instances
 *   - orderBy=startTime requires singleEvents=true
 */
export async function listUpcomingMeetEvents(
  accessToken: string,
  lookaheadMinutes: number = 60,
): Promise<MeetEvent[]> {
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + lookaheadMinutes * 60_000).toISOString();

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  });
  const url = `${GOOGLE_CALENDAR_LIST_URL}?${params.toString()}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Calendar fetch failed: ${data.error?.message || res.statusText}`);
  }

  const items = (data.items || []) as any[];
  const meetEvents: MeetEvent[] = [];

  for (const ev of items) {
    if (ev.status === 'cancelled') continue;
    if (!ev.hangoutLink) continue; // Meet-only filter
    if (!ev.start?.dateTime) continue; // skip all-day events

    meetEvents.push({
      id: ev.id,
      summary: ev.summary || '(No title)',
      start: ev.start.dateTime,
      end: ev.end?.dateTime || ev.start.dateTime,
      meetLink: ev.hangoutLink,
      attendeeCount: (ev.attendees || []).length,
      htmlLink: ev.htmlLink,
    });
  }

  return meetEvents;
}

// ── Disconnect ─────────────────────────────────────────────────────────

/**
 * Revoke the user's tokens at Google's end and delete the row. Calling
 * revoke is best-effort; even if it fails (e.g. token already invalid)
 * we still wipe our row so the user can reconnect cleanly.
 */
export async function disconnectUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const { data: tokens } = await (supabase as any)
    .from('google_oauth_tokens')
    .select('access_token')
    .eq('user_id', userId)
    .single();

  if (tokens?.access_token) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${tokens.access_token}`, {
        method: 'POST',
      });
    } catch {
      // Swallow — we still want to delete the row below.
    }
  }

  await (supabase as any)
    .from('google_oauth_tokens')
    .delete()
    .eq('user_id', userId);
}
