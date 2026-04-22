'use client';

import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Globe, Radar, DollarSign, Bot, Sparkles } from 'lucide-react';
import ProspectsTab from '@/components/agents/ProspectsTab';
import KoreaSignalsPanel from '@/components/agents/KoreaSignalsPanel';
import FundingRadarPanel from '@/components/agents/FundingRadarPanel';
import AgentDashboard from '@/components/agents/AgentDashboard';
import DiscoveryPanel from '@/components/agents/DiscoveryPanel';

export default function IntelligencePage() {
  const [activeTab, setActiveTab] = useState('discovery');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Intelligence</h2>
        <p className="text-gray-600">Prospect discovery, signal scanning, and AI agent operations</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="discovery" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Discovery
          </TabsTrigger>
          <TabsTrigger value="prospects" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Prospects
          </TabsTrigger>
          <TabsTrigger value="korea_signals" className="flex items-center gap-2">
            <Radar className="h-4 w-4" />
            Korea Signals
          </TabsTrigger>
          <TabsTrigger value="funding_radar" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Funding Radar
          </TabsTrigger>
          <TabsTrigger value="agents" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            AI Agents
          </TabsTrigger>
        </TabsList>

        <TabsContent value="discovery" className="mt-4">
          <DiscoveryPanel />
        </TabsContent>

        <TabsContent value="prospects" className="mt-4">
          <ProspectsTab />
        </TabsContent>

        <TabsContent value="korea_signals" className="mt-4">
          <KoreaSignalsPanel />
        </TabsContent>

        <TabsContent value="funding_radar" className="mt-4">
          <FundingRadarPanel />
        </TabsContent>

        <TabsContent value="agents" className="mt-4">
          <AgentDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
