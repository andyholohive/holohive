'use client';

import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Sparkles, Building2 } from 'lucide-react';
import DiscoveryPanel from '@/components/agents/DiscoveryPanel';
import ExchangeListingsPanel from '@/components/agents/ExchangeListingsPanel';

// NOTE: Prospects, Korea Signals, Funding Radar, and AI Agents tabs are
// temporarily hidden while the team focuses on Discovery + KR Exchanges.
// To restore, re-add the TabsTrigger and TabsContent entries below (the
// panel components are still imported / kept in the codebase).

export default function IntelligencePage() {
  const [activeTab, setActiveTab] = useState('discovery');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Intelligence</h2>
        <p className="text-gray-600">Prospect discovery and Korean exchange listings</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="discovery" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Discovery
          </TabsTrigger>
          <TabsTrigger value="kr_exchanges" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            KR Exchanges
          </TabsTrigger>
        </TabsList>

        <TabsContent value="discovery" className="mt-4">
          <DiscoveryPanel />
        </TabsContent>

        <TabsContent value="kr_exchanges" className="mt-4">
          <ExchangeListingsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
