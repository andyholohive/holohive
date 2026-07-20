/**
 * Shared fetch for the activation microsite API. The microsites 308
 * apex→https→www, and `fetch` strips the Authorization header on cross-origin
 * redirects → silent 401. So we follow redirects manually and re-attach the
 * Bearer token only across same-site hops (apex↔www / scheme upgrade).
 */
const relatedHost = (a: string, b: string) =>
  a === b || `www.${a}` === b || a === `www.${b}`;

export function activationUrl(base: string, endpoint: string, activationIdParam?: string | null): string {
  const b = base.trim().replace(/\/+$/, '');
  const qs = activationIdParam ? `?activation_id=${encodeURIComponent(activationIdParam)}` : '';
  return `${b}/api/activation/${endpoint}${qs}`;
}

export interface ActivationFetchResult {
  status: number;
  ok: boolean;
  data: any;       // parsed JSON, or null if the body wasn't JSON
  finalUrl: string;
}

export async function activationFetch(
  startUrl: string,
  token?: string,
  timeoutMs = 12_000,
): Promise<ActivationFetchResult> {
  let current = startUrl;
  let carryAuth = true;
  let res: Response | null = null;
  for (let hop = 0; hop < 5; hop++) {
    res = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: 'application/json',
        ...(token && carryAuth ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) break;
      const next = new URL(loc, current);
      carryAuth = relatedHost(new URL(current).host, next.host);
      current = next.toString();
      continue;
    }
    break;
  }
  const finalRes = res!;
  const text = await finalRes.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  return { status: finalRes.status, ok: finalRes.ok, data, finalUrl: current };
}
