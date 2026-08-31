'use client';

/**
 * CRM · Pipeline (v1.3)
 *
 * The deal funnel from Yano's CRM spec v1.3, and the intended replacement for
 * /crm/sales-pipeline. Both run at once for now — nothing has been deleted.
 *
 * The two boards read the same crm_opportunities rows through different stage
 * columns: the old one via `stage` (12 DM-funnel values), this one via
 * `pipeline_stage` (6 deal-funnel ones). A database trigger carries legacy
 * moves forward so this board is never stale; it does not write back, because
 * that direction is lossy. See lib/pipelineV13Service.ts.
 *
 * Deals arrive here on their own: reaching Lead on the Outreach board creates
 * the opportunity if it does not exist (trg_outreach_lead_to_pipeline).
 */

import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { Button } from '@/components/ui/button';
import { Target, Send } from 'lucide-react';
import PipelineBoard from '@/components/crm/PipelineBoard';

export default function PipelinePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Target}
        kicker="CRM · Pipeline"
        kickerDot="brand"
        title="Pipeline"
        subtitle="Deals in flight — drag a card to move it, drop it below to close it"
        actions={(
          <Button asChild variant="outline" size="sm">
            <Link href="/crm/outreach">
              <Send className="h-4 w-4 mr-2" />Outreach
            </Link>
          </Button>
        )}
      />

      <SectionHeader
        label="Board"
        dot="brand"
        counter="01 — new lead → qualified → discovery → proposal → negotiation → contract"
        first
      />

      <PipelineBoard />
    </div>
  );
}
