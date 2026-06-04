'use client';

import React, { useState, useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { Radar, Sparkles, Building2, DollarSign, Activity, Bell, Clock } from 'lucide-react';
import {
  HoverCard, HoverCardTrigger, HoverCardContent,
} from '@/components/ui/hover-card';
import DiscoveryPanel from '@/components/agents/DiscoveryPanel';
import ExchangeListingsPanel from '@/components/agents/ExchangeListingsPanel';
import RecentSignalsPanel from '@/components/agents/RecentSignalsPanel';
import IntelligenceAlertsDialog from '@/components/agents/IntelligenceAlertsDialog';
import IntelligenceScheduleDialog from '@/components/agents/IntelligenceScheduleDialog';
import { InfoChip } from '@/components/intelligence/InfoChip';

// NOTE: Prospects, Korea Signals, Funding Radar, and AI Agents tabs are
// temporarily hidden while the team focuses on Discovery + KR Exchanges.
// To restore, re-add the TabsTrigger and TabsContent entries below (the
// panel components are still imported / kept in the codebase).

// Friendly labels for agent_runs.run_type values shown in the cost breakdown.
const RUN_TYPE_LABEL: Record<string, string> = {
  discovery_scan: 'Run Discovery',
  poc_enrichment: 'Find POCs (Claude)',
  grok_poc_enrichment: 'Find POCs (Grok)',
  grok_deep_dive: 'Deep Dive (Grok)',
};

export default function IntelligencePage() {
  const [activeTab, setActiveTab] = useState('discovery');
  const [alertsDialogOpen, setAlertsDialogOpen] = useState(false);
  const [alertsConfigured, setAlertsConfigured] = useState<boolean>(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState<boolean>(false);
  const [cost, setCost] = useState<{
    total_cost_usd: number;
    runs: number;
    by_run_type: Record<string, { cost: number; count: number }>;
    window_days: number;
  } | null>(null);

  useEffect(() => {
    // Lightweight ping just to check if alerts are enabled — used to color
    // the bell icon (gray when off, brand-teal when on). The full config
    // is loaded inside the dialog when opened.
    fetch('/api/intelligence/alerts/config')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.channel) setAlertsConfigured(!!d.channel.is_enabled); })
      .catch(() => {});
    // Same pattern for the auto-scan schedule chip — just need is_enabled.
    fetch('/api/intelligence/schedule/config')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.schedule) setScheduleEnabled(!!d.schedule.is_enabled); })
      .catch(() => {});
  }, [alertsDialogOpen, scheduleDialogOpen]);

  // Cost summary: refetch on mount, on tab focus, and every 5 min while
  // mounted. The previous version fetched once on page load and let the
  // badge go stale during long sessions — annoying when the user just
  // ran a scan and the chip still shows yesterday's spend. Tab focus
  // covers the common "switched tabs, came back" case; the interval
  // covers leaving the page open in the background.
  useEffect(() => {
    const fetchCost = () => {
      fetch('/api/agents/cost-summary')
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d && typeof d.total_cost_usd === 'number') setCost(d); })
        .catch(() => {});
    };
    fetchCost();
    const onFocus = () => fetchCost();
    window.addEventListener('focus', onFocus);
    const interval = setInterval(fetchCost, 5 * 60 * 1000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Radar}
        title="Intelligence"
        subtitle="Prospect discovery and Korean exchange listings"
        kicker="CRM · Intelligence"
        kickerDot="brand"
        actions={(
          <>
            {/* Schedule, Alerts, Cost — same chip shape (label + value,
                cream background, icon-tinted by state). The colored
                state dot was dropped 2026-06-03; the icon tint already
                encodes on/off, the dot was the same signal twice. */}
            <InfoChip
              icon={Clock}
              label="Auto-scan"
              value={scheduleEnabled ? 'On' : 'Off'}
              active={scheduleEnabled}
              onClick={() => setScheduleDialogOpen(true)}
              title={scheduleEnabled ? 'Auto-scan ON · click to configure' : 'Auto-scan OFF · click to set up'}
              ariaLabel="Configure scheduled discovery scan"
            />
            <InfoChip
              icon={Bell}
              label="Alerts"
              value={alertsConfigured ? 'On' : 'Off'}
              active={alertsConfigured}
              onClick={() => setAlertsDialogOpen(true)}
              title={alertsConfigured ? 'Alerts ON · click to configure' : 'Alerts OFF · click to set up'}
              ariaLabel="Configure intelligence alerts"
            />
            {/* Weekly cost — hidden when there are no runs in the
                window so a fresh install doesn't render "$0.00". */}
            {cost && cost.runs > 0 && (
              <HoverCard openDelay={100} closeDelay={50}>
                <HoverCardTrigger asChild>
                  <div>
                    <InfoChip
                      icon={DollarSign}
                      label="This week"
                      value={<span className="tabular-nums">${cost.total_cost_usd.toFixed(2)}</span>}
                      title="This week's Intelligence spend"
                      ariaLabel="This week's Intelligence spend"
                    />
                  </div>
                </HoverCardTrigger>
                <HoverCardContent side="bottom" align="end" className="w-72 text-xs">
                  <div className="font-semibold text-ink-warm-700 mb-1.5">
                    Last {cost.window_days} days · {cost.runs} run{cost.runs !== 1 ? 's' : ''}
                  </div>
                  <div className="space-y-1">
                    {Object.entries(cost.by_run_type).map(([type, v]) => (
                      <div key={type} className="flex items-baseline justify-between gap-2">
                        <span className="text-ink-warm-700">
                          {RUN_TYPE_LABEL[type] || type}
                        </span>
                        <span className="tabular-nums text-ink-warm-700">
                          <span className="font-semibold text-ink-warm-900">${v.cost.toFixed(2)}</span>
                          <span className="text-ink-warm-400 ml-1.5">× {v.count}</span>
                        </span>
                      </div>
                    ))}
                    {Object.keys(cost.by_run_type).length === 0 && (
                      <div className="text-ink-warm-500 italic">No runs this week.</div>
                    )}
                  </div>
                </HoverCardContent>
              </HoverCard>
            )}
          </>
        )}
      />

      {/* v11 main tab strip — matches the padding + active treatment
          used elsewhere in the app (cream-100 container, white tile
          on active, brand text). The previous per-tab semantic colors
          (Discovery=violet, Signals=sky, KR Exchanges=emerald) were
          arbitrary — these aren't distinct workflows like the sales
          tabs are, so the unified brand tone reads cleaner. */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200">
          <TabsTrigger
            value="discovery"
            className="flex items-center gap-2 px-3 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-brand"
          >
            <Sparkles className="h-4 w-4" />
            Discovery
          </TabsTrigger>
          <TabsTrigger
            value="signals"
            className="flex items-center gap-2 px-3 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-brand"
          >
            <Activity className="h-4 w-4" />
            Signals
          </TabsTrigger>
          <TabsTrigger
            value="kr_exchanges"
            className="flex items-center gap-2 px-3 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-brand"
          >
            <Building2 className="h-4 w-4" />
            KR Exchanges
          </TabsTrigger>
        </TabsList>

        <TabsContent value="discovery" className="mt-4">
          <DiscoveryPanel />
        </TabsContent>

        <TabsContent value="signals" className="mt-4">
          <RecentSignalsPanel />
        </TabsContent>

        <TabsContent value="kr_exchanges" className="mt-4">
          <ExchangeListingsPanel />
        </TabsContent>
      </Tabs>

      <IntelligenceAlertsDialog open={alertsDialogOpen} onOpenChange={setAlertsDialogOpen} />
      <IntelligenceScheduleDialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen} />
    </div>
  );
}
