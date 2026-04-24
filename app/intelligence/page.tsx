'use client';

import React, { useState, useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Sparkles, Building2, DollarSign, Activity } from 'lucide-react';
import {
  HoverCard, HoverCardTrigger, HoverCardContent,
} from '@/components/ui/hover-card';
import DiscoveryPanel from '@/components/agents/DiscoveryPanel';
import ExchangeListingsPanel from '@/components/agents/ExchangeListingsPanel';
import RecentSignalsPanel from '@/components/agents/RecentSignalsPanel';

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
  const [cost, setCost] = useState<{
    total_cost_usd: number;
    runs: number;
    by_run_type: Record<string, { cost: number; count: number }>;
    window_days: number;
  } | null>(null);

  useEffect(() => {
    fetch('/api/agents/cost-summary')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && typeof d.total_cost_usd === 'number') setCost(d); })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Intelligence</h2>
          <p className="text-gray-600">Prospect discovery and Korean exchange listings</p>
        </div>

        {/* Weekly cost badge — hovers to reveal per-run-type breakdown.
            Hidden if no runs in the window so the page isn't cluttered by
            a "$0.00 this week" on a fresh install. */}
        {cost && cost.runs > 0 && (
          <HoverCard openDelay={100} closeDelay={50}>
            <HoverCardTrigger asChild>
              <div
                className="flex items-center gap-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 cursor-help select-none"
                aria-label="This week's Intelligence spend"
              >
                <DollarSign className="h-3.5 w-3.5 text-gray-500" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-gray-500 leading-none">This week</span>
                  <span className="text-sm font-semibold text-gray-900 leading-tight tabular-nums">
                    ${cost.total_cost_usd.toFixed(2)}
                  </span>
                </div>
              </div>
            </HoverCardTrigger>
            <HoverCardContent side="bottom" align="end" className="w-72 text-xs">
              <div className="font-semibold text-gray-800 mb-1.5">
                Last {cost.window_days} days · {cost.runs} run{cost.runs !== 1 ? 's' : ''}
              </div>
              <div className="space-y-1">
                {Object.entries(cost.by_run_type).map(([type, v]) => (
                  <div key={type} className="flex items-baseline justify-between gap-2">
                    <span className="text-gray-700">
                      {RUN_TYPE_LABEL[type] || type}
                    </span>
                    <span className="tabular-nums text-gray-600">
                      <span className="font-semibold text-gray-900">${v.cost.toFixed(2)}</span>
                      <span className="text-gray-400 ml-1.5">× {v.count}</span>
                    </span>
                  </div>
                ))}
                {Object.keys(cost.by_run_type).length === 0 && (
                  <div className="text-gray-500 italic">No runs this week.</div>
                )}
              </div>
            </HoverCardContent>
          </HoverCard>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="discovery" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Discovery
          </TabsTrigger>
          <TabsTrigger value="signals" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Signals
          </TabsTrigger>
          <TabsTrigger value="kr_exchanges" className="flex items-center gap-2">
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
    </div>
  );
}
