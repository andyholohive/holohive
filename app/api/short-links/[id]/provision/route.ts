import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/requireSuperAdmin';
import { provisionSubdomain } from '@/lib/domainProvisioning';

export const dynamic = 'force-dynamic';

/**
 * POST /api/short-links/[id]/provision — retry DNS setup for this link's
 * subdomain.
 *
 * The realistic use is the GoDaddy-forwarding conflict: `tria`, `yano` and
 * `jdot` carry forwarding A records, so the first attempt returns a `failed`
 * with instructions to switch forwarding off. Once that's done, Retry
 * finishes the job. provisionSubdomain is idempotent, so this is also safe
 * to hit on a link that's already fine.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireRole(request, ['admin', 'super_admin']);
  if (!guard.ok) return guard.response;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: link } = await (supabase as any)
    .from('short_links')
    .select('id, subdomain')
    .eq('id', params.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 });

  const result = await provisionSubdomain((link as any).subdomain);

  // Every link on this subdomain shares its DNS, so they all move together —
  // otherwise a retry would fix one row and leave its siblings reading
  // 'failed' for a subdomain that now works.
  await (supabase as any)
    .from('short_links')
    .update({
      dns_status: result.status,
      dns_error: result.error ?? null,
      dns_checked_at: new Date().toISOString(),
    })
    .eq('subdomain', (link as any).subdomain)
    .is('deleted_at', null);

  return NextResponse.json({ result });
}
