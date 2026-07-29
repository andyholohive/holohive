/**
 * Automatic subdomain provisioning for short links.
 *
 * Creating `tria.holohive.io/fitcheck` needs two things beyond the DB row:
 * a CNAME at the registrar, and the domain attached to this Vercel project.
 * Both have APIs, so HHP does them itself rather than making someone click
 * through two dashboards for every client.
 *
 * Credentials (all optional — absent means fall back to manual):
 *   GODADDY_API_TOKEN                     — PREFERRED. A Personal Access Token from
 *                                           developer.godaddy.com/personal-access-token,
 *                                           scoped `domains.domain:read` + `domains.dns:update`.
 *   GODADDY_API_KEY / GODADDY_API_SECRET  — legacy fallback. GoDaddy has this classic
 *                                           developer key scheduled for retirement (already
 *                                           dead for their v3 Domains APIs), so it is only
 *                                           used when no PAT is present.
 *   VERCEL_API_TOKEN                      — Vercel account settings → Tokens.
 *   VERCEL_PROJECT_ID                     — Project settings → General.
 *   VERCEL_TEAM_ID                        — only if the project sits in a team.
 *
 * Everything here is best-effort and reports rather than throws: a DNS
 * hiccup must not lose the link row someone just filled in. The caller
 * records the outcome on the row so the UI can show what actually happened
 * instead of implying success.
 */

export const LINK_ROOT_DOMAIN = 'holohive.io';
/** Vercel's CNAME target for project domains. */
const VERCEL_CNAME_TARGET = 'cname.vercel-dns.com';

export type ProvisionResult = {
  status: 'provisioned' | 'manual' | 'failed' | 'pending';
  error?: string;
  /** Human-readable trail, surfaced in the UI so failures are debuggable. */
  steps: string[];
};

/**
 * GoDaddy auth header. A PAT is a Bearer token and is the path GoDaddy is
 * moving everyone to; the classic `sso-key <key>:<secret>` pair still works
 * on the v1 records endpoints but is deprecated, so it's the fallback only.
 */
function godaddyAuth(): string | null {
  const pat = process.env.GODADDY_API_TOKEN;
  if (pat) return `Bearer ${pat}`;
  const key = process.env.GODADDY_API_KEY;
  const secret = process.env.GODADDY_API_SECRET;
  if (key && secret) return `sso-key ${key}:${secret}`;
  return null;
}

export function provisioningConfigured(): boolean {
  return Boolean(
    godaddyAuth() &&
    process.env.VERCEL_API_TOKEN &&
    process.env.VERCEL_PROJECT_ID,
  );
}

/**
 * Per-variable presence, for diagnosing a half-configured setup.
 *
 * Booleans only — never the values, and never a prefix of them. "No API
 * credentials configured" is useless when three variables could each be the
 * culprit; this turns it into a named one. Worth its keep because the usual
 * causes (a typo, or ticking Preview instead of Production) are invisible
 * from the outside otherwise.
 */
export function provisioningStatus(): {
  configured: boolean;
  godaddyToken: boolean;
  godaddyLegacyPair: boolean;
  vercelToken: boolean;
  vercelProjectId: boolean;
  vercelTeamId: boolean;
} {
  return {
    configured: provisioningConfigured(),
    godaddyToken: Boolean(process.env.GODADDY_API_TOKEN),
    godaddyLegacyPair: Boolean(process.env.GODADDY_API_KEY && process.env.GODADDY_API_SECRET),
    vercelToken: Boolean(process.env.VERCEL_API_TOKEN),
    vercelProjectId: Boolean(process.env.VERCEL_PROJECT_ID),
    vercelTeamId: Boolean(process.env.VERCEL_TEAM_ID),
  };
}

function vercelQuery(): string {
  const team = process.env.VERCEL_TEAM_ID;
  return team ? `?teamId=${encodeURIComponent(team)}` : '';
}

/**
 * GoDaddy: does a record already exist on this subdomain?
 *
 * Matters because `tria`, `yano` and `jdot` are GoDaddy *forwards*, which
 * materialise as A records. An A and a CNAME can't coexist on one name, so
 * blindly writing the CNAME would fail — or worse, half-apply. We detect it
 * and hand back a precise instruction instead of a generic error.
 */
async function godaddyExistingRecords(subdomain: string): Promise<Array<{ type: string; data: string }>> {
  const out: Array<{ type: string; data: string }> = [];
  for (const type of ['A', 'CNAME']) {
    const res = await fetch(
      `https://api.godaddy.com/v1/domains/${LINK_ROOT_DOMAIN}/records/${type}/${encodeURIComponent(subdomain)}`,
      {
        headers: {
          Authorization: godaddyAuth() as string,
          Accept: 'application/json',
        },
      },
    );
    if (!res.ok) continue; // 404 = no record of that type, which is the happy path
    const rows = await res.json().catch(() => []);
    for (const r of Array.isArray(rows) ? rows : []) {
      if (r?.data) out.push({ type, data: String(r.data) });
    }
  }
  return out;
}

/** Writes (replacing) the CNAME for `subdomain` → Vercel. */
async function godaddyPutCname(subdomain: string): Promise<void> {
  const res = await fetch(
    `https://api.godaddy.com/v1/domains/${LINK_ROOT_DOMAIN}/records/CNAME/${encodeURIComponent(subdomain)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: godaddyAuth() as string,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{ data: VERCEL_CNAME_TARGET, ttl: 600 }]),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GoDaddy ${res.status}: ${body.slice(0, 300)}`);
  }
}

/** A DNS record Vercel wants in place before it will verify ownership. */
type VerificationRecord = { type: string; domain: string; value: string };

/** Is this host attached to OUR project, verified, and what does it still need? */
async function vercelGetDomain(host: string): Promise<{
  present: boolean;
  verified: boolean;
  verification: VerificationRecord[];
}> {
  const res = await fetch(
    `https://api.vercel.com/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${encodeURIComponent(host)}${vercelQuery()}`,
    { headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}` } },
  );
  if (!res.ok) return { present: false, verified: false, verification: [] };
  const body = await res.json().catch(() => ({} as any));
  return {
    present: true,
    verified: body?.verified !== false,
    verification: Array.isArray(body?.verification) ? body.verification : [],
  };
}

/** Asks Vercel to re-run its ownership check now that the record exists. */
async function vercelVerifyDomain(host: string): Promise<boolean> {
  const res = await fetch(
    `https://api.vercel.com/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${encodeURIComponent(host)}/verify${vercelQuery()}`,
    { method: 'POST', headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}` } },
  );
  if (!res.ok) return false;
  const body = await res.json().catch(() => ({} as any));
  return body?.verified !== false;
}

/**
 * Writes a Vercel-issued verification record at GoDaddy.
 *
 * Vercel asks for ownership proof when it can't establish the domain from
 * the CNAME alone — typically a TXT on `_vercel.holohive.io`. The API hands
 * us the exact name and value, so there is no reason to make a human
 * transcribe it. `record.domain` is fully-qualified; GoDaddy wants the name
 * relative to the zone, hence the suffix strip.
 */
async function godaddyPutVerification(record: VerificationRecord): Promise<void> {
  const name = record.domain.endsWith(`.${LINK_ROOT_DOMAIN}`)
    ? record.domain.slice(0, -(LINK_ROOT_DOMAIN.length + 1))
    : record.domain === LINK_ROOT_DOMAIN ? '@' : record.domain;

  const res = await fetch(
    `https://api.godaddy.com/v1/domains/${LINK_ROOT_DOMAIN}/records/${encodeURIComponent(record.type)}/${encodeURIComponent(name)}`,
    {
      method: 'PUT',
      headers: { Authorization: godaddyAuth() as string, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ data: record.value, ttl: 600 }]),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GoDaddy ${res.status} writing ${record.type} ${name}: ${body.slice(0, 200)}`);
  }
}

/**
 * Attaches `<sub>.holohive.io` to the Vercel project.
 *
 * [2026-07-29] Rewritten after it reported success on a domain that was
 * never actually serving. Two ways the old version lied:
 *
 *   • It treated 409 as "already attached, fine". But 409 is ALSO what
 *     Vercel returns when the host belongs to a DIFFERENT project or team —
 *     in which case nothing was added and the link 404s at the edge.
 *   • It ignored `verified` in the response. Vercel accepts a domain in a
 *     pending-verification state; no cert is issued until it clears, so the
 *     URL stays dark while the row reads green.
 *
 * Now every path ends in a GET against THIS project, so the return value
 * describes what Vercel actually holds rather than what the POST returned.
 */
async function vercelAddDomain(host: string): Promise<{ verified: boolean }> {
  const res = await fetch(
    `https://api.vercel.com/v10/projects/${process.env.VERCEL_PROJECT_ID}/domains${vercelQuery()}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: host }),
    },
  );

  if (res.ok) {
    const body = await res.json().catch(() => ({} as any));
    if (body?.verified === false) return { verified: false };
    return { verified: true };
  }

  const body = await res.json().catch(() => ({} as any));
  const code = body?.error?.code;
  const conflict = res.status === 409
    || code === 'domain_already_in_use'
    || code === 'domain_already_exists';

  if (conflict) {
    // Confirm it's OURS before calling it done — this is the exact case the
    // old code got wrong.
    const owned = await vercelGetDomain(host);
    if (!owned.present) {
      throw new Error(
        `Vercel says ${host} is already in use but it is NOT on this project ` +
        `(VERCEL_PROJECT_ID). Another Vercel project or team is holding the ` +
        `domain — remove it there, or point VERCEL_PROJECT_ID at the right project.`,
      );
    }
    return { verified: owned.verified };
  }

  throw new Error(`Vercel ${res.status}: ${body?.error?.message ?? JSON.stringify(body).slice(0, 300)}`);
}

/**
 * Provisions `<subdomain>.holohive.io` end to end.
 *
 * Safe to call repeatedly — both halves are idempotent, so this doubles as
 * the retry path for a link whose provisioning failed the first time.
 */
export async function provisionSubdomain(subdomain: string): Promise<ProvisionResult> {
  const steps: string[] = [];
  if (!provisioningConfigured()) {
    return {
      status: 'manual',
      steps: ['No API credentials configured — DNS must be set up by hand.'],
    };
  }

  const host = `${subdomain}.${LINK_ROOT_DOMAIN}`;
  try {
    const existing = await godaddyExistingRecords(subdomain);
    const conflictingA = existing.find(r => r.type === 'A');
    if (conflictingA) {
      // Almost certainly GoDaddy Domain Forwarding, which owns this A record.
      // Deleting the record alone doesn't disable forwarding, so tell the
      // human exactly what to switch off rather than guessing.
      return {
        status: 'failed',
        error:
          `${host} currently has an A record (${conflictingA.data}) — that's GoDaddy Domain ` +
          `Forwarding. Turn forwarding off for this subdomain in GoDaddy, then hit Retry. ` +
          `Its old destination can be re-created here as a root-path link so nothing is lost.`,
        steps,
      };
    }
    const alreadyCname = existing.find(
      r => r.type === 'CNAME' && r.data.replace(/\.$/, '') === VERCEL_CNAME_TARGET,
    );
    if (alreadyCname) {
      steps.push('CNAME already points at Vercel — left alone.');
    } else {
      await godaddyPutCname(subdomain);
      steps.push(`CNAME ${subdomain} → ${VERCEL_CNAME_TARGET} written at GoDaddy.`);
    }

    let { verified } = await vercelAddDomain(host);

    if (!verified) {
      // Vercel wants ownership proof. It tells us exactly which record, so
      // write it rather than asking a human to copy a challenge string.
      const info = await vercelGetDomain(host);
      if (info.verification.length > 0) {
        for (const rec of info.verification) {
          await godaddyPutVerification(rec);
          steps.push(`Wrote ${rec.type} ${rec.domain} for Vercel ownership check.`);
        }
        verified = await vercelVerifyDomain(host);
        steps.push(verified
          ? 'Vercel verified the domain.'
          : 'Verification record written; Vercel has not accepted it yet.');
      }
    }

    if (!verified) {
      // Still unverified means no certificate, so the URL does not serve.
      // Reporting 'provisioned' here is what made the row lie last time.
      const info = await vercelGetDomain(host);
      const needed = info.verification
        .map(r => `${r.type} ${r.domain} = ${r.value}`)
        .join('; ');
      return {
        status: 'pending',
        error:
          `${host} is on the Vercel project but not verified yet, so no ` +
          `certificate has been issued and the URL will not resolve. ` +
          (needed
            ? `The verification record has been written at GoDaddy (${needed}) — ` +
              `DNS needs a few minutes to propagate before Vercel will accept it. Hit Retry.`
            : `Vercel reported no verification record to add; retry shortly.`),
        steps,
      };
    }
    steps.push(`${host} attached to the Vercel project and verified.`);

    return { status: 'provisioned', steps };
  } catch (err: any) {
    return { status: 'failed', error: err?.message ?? 'Unknown provisioning error', steps };
  }
}
