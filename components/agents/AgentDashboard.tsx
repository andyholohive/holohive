'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import {
  Bot, Radar, Database, MessageSquare, Shield, Eye, Search, Pen, Hammer,
  RefreshCw, Clock, CheckCircle, XCircle, Loader2, DollarSign, Zap,
  ArrowRight, Activity, TrendingUp, AlertTriangle, Plus, Satellite, Sparkles,
} from 'lucide-react';
import ScoutQualifyDialog from './ScoutQualifyDialog';
import { supabase } from '@/lib/supabase';

const ACRONYMS = new Set(['tge', 'icp', 'dm', 'evm', 'nft', 'dao', 'defi', 'rwa', 'depin', 'bd', 'vc', 'tg', 'l1', 'l2', 'api', 'sdk']);
function formatLabel(str: string): string {
  return str.replace(/_/g, ' ').split(' ').map((w) => {
    const lower = w.toLowerCase();
    if (ACRONYMS.has(lower)) return w.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}

// ============================================
// Types
// ============================================

interface AgentRun {
  id: string;
  agent_name: string;
  run_type: string;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  input_params: Record<string, unknown>;
  output_summary: Record<string, unknown>;
  error_message: string | null;
  triggered_by: string | null;
  tokens_used: number;
  cost_usd: number;
}

interface AgentHandoff {
  id: string;
  from_agent: string;
  to_agent: string;
  handoff_type: string;
  payload: Record<string, unknown>;
  status: string;
  priority: number;
  opportunity_id: string | null;
  created_at: string;
  processed_at: string | null;
}

interface AgentStats {
  total_runs: number;
  completed: number;
  failed: number;
  running: number;
  total_tokens: number;
  total_cost_usd: number;
  avg_duration_ms: number;
  by_agent: Record<string, { runs: number; completed: number; failed: number; cost: number }>;
}

// ============================================
// Agent metadata
// ============================================

const AGENT_INFO: Record<string, {
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  schedule: string;
  type: 'scheduled' | 'on_demand';
}> = {
  RADAR: {
    label: 'RADAR',
    description: 'Signal Scanner — detects actionable signals for prospects',
    icon: Radar,
    color: 'text-blue-600',
    schedule: 'Daily 7:00 AM KST',
    type: 'scheduled',
  },
  ATLAS: {
    label: 'ATLAS',
    description: 'Database Manager — maintains prospect scores and tiers',
    icon: Database,
    color: 'text-emerald-600',
    schedule: 'Sunday 8:00 PM KST + on-demand',
    type: 'scheduled',
  },
  MERCURY: {
    label: 'MERCURY',
    description: 'Outreach Crafter — drafts personalized cold messages',
    icon: MessageSquare,
    color: 'text-amber-600',
    schedule: 'Daily 9:30 AM KST',
    type: 'scheduled',
  },
  SENTINEL: {
    label: 'SENTINEL',
    description: 'Pipeline Manager — monitors deal health and follow-ups',
    icon: Shield,
    color: 'text-red-600',
    schedule: 'Mon/Thu 8:00 AM KST',
    type: 'scheduled',
  },
  ORACLE: {
    label: 'ORACLE',
    description: 'Intel Analyst — deep prospect research and call prep',
    icon: Eye,
    color: 'text-purple-600',
    schedule: 'On-demand',
    type: 'on_demand',
  },
  SCOUT: {
    label: 'SCOUT',
    description: 'Prospect Qualifier — evaluates URLs against ICP criteria',
    icon: Search,
    color: 'text-cyan-600',
    schedule: 'On-demand',
    type: 'on_demand',
  },
  COLDCRAFT: {
    label: 'COLDCRAFT',
    description: 'Cold Message Generator — deep per-prospect message crafting',
    icon: Pen,
    color: 'text-pink-600',
    schedule: 'On-demand',
    type: 'on_demand',
  },
  FORGE: {
    label: 'FORGE',
    description: 'Content Engine — generates proof material and content',
    icon: Hammer,
    color: 'text-orange-600',
    schedule: 'Tue/Thu 10:00 AM KST',
    type: 'scheduled',
  },
  HERMES: {
    label: 'HERMES',
    description: 'External Monitor — watches Korean Telegram groups and exchange volumes 24/7 from a self-hosted VPS',
    icon: Satellite,
    color: 'text-indigo-600',
    schedule: 'Continuous (external)',
    type: 'scheduled',
  },
  DISCOVERY: {
    label: 'DISCOVERY',
    description: 'Lead Finder — searches DropsTab and the web for crypto projects with live outreach triggers',
    icon: Sparkles,
    color: 'text-violet-600',
    schedule: 'On-demand',
    type: 'on_demand',
  },
};

// ============================================
// Component
// ============================================

export default function AgentDashboard() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [handoffs, setHandoffs] = useState<AgentHandoff[]>([]);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [signals, setSignals] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scoutOpen, setScoutOpen] = useState(false);
  const [scoutInitialReport, setScoutInitialReport] = useState<any>(null);
  const [activeSection, setActiveSection] = useState<'overview' | 'signals' | 'drafts'>('overview');

  const fetchData = useCallback(async () => {
    try {
      const [runsRes, statsRes, handoffsRes] = await Promise.all([
        fetch('/api/agents/runs?limit=50'),
        fetch('/api/agents/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'stats' }),
        }),
        fetch('/api/agents/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'handoffs' }),
        }),
      ]);

      if (runsRes.ok) {
        const runsData = await runsRes.json();
        setRuns(runsData.runs || []);
      }
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.stats || null);
      }
      if (handoffsRes.ok) {
        const handoffsData = await handoffsRes.json();
        setHandoffs(handoffsData.handoffs || []);
      }

      // Fetch signals and drafts directly from Supabase
      const { data: signalsData } = await supabase
        .from('signals')
        .select('*, opportunity:crm_opportunities(id, name)')
        .order('created_at', { ascending: false })
        .limit(20);
      setSignals(signalsData || []);

      const { data: draftsData } = await supabase
        .from('outreach_drafts')
        .select('*, opportunity:crm_opportunities(id, name)')
        .order('created_at', { ascending: false })
        .limit(20);
      setDrafts(draftsData || []);
    } catch (error) {
      console.error('Error fetching agent data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatCost = (cost: number) => {
    if (cost === 0) return '$0.00';
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'running': return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      default: return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = {
      completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      failed: 'bg-red-50 text-red-700 border-red-200',
      running: 'bg-blue-50 text-blue-700 border-blue-200',
      pending: 'bg-gray-50 text-gray-600 border-gray-200',
      processing: 'bg-amber-50 text-amber-700 border-amber-200',
    };
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${variants[status] || variants.pending}`}>
        {statusIcon(status)}
        {formatLabel(status)}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const pendingHandoffs = handoffs.filter(h => h.status === 'pending');

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900">AI Agent System</h3>
            <p className="text-sm text-gray-500">8-agent sales automation powered by Claude</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setScoutOpen(true)}
              style={{ backgroundColor: '#3e8692' }}
              className="text-white"
            >
              <Search className="w-4 h-4 mr-1.5" />
              Qualify Prospect
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border border-gray-200">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                <Activity className="w-4 h-4" style={{ color: '#3e8692' }} />
                Total Runs
              </div>
              <div className="text-2xl font-bold" style={{ color: '#3e8692' }}>{stats?.total_runs || 0}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {stats?.completed || 0} completed, {stats?.failed || 0} failed
              </div>
            </CardContent>
          </Card>

          <Card className="border border-gray-200">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                <Zap className="w-4 h-4" style={{ color: '#3e8692' }} />
                Tokens Used
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {(stats?.total_tokens || 0).toLocaleString()}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                Avg {formatDuration(stats?.avg_duration_ms || 0)} per run
              </div>
            </CardContent>
          </Card>

          <Card className="border border-gray-200">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                <DollarSign className="w-4 h-4" style={{ color: '#3e8692' }} />
                Total Cost
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {formatCost(stats?.total_cost_usd || 0)}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                Across all agent runs
              </div>
            </CardContent>
          </Card>

          <Card className="border border-gray-200">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                <ArrowRight className="w-4 h-4" style={{ color: '#3e8692' }} />
                Pending Handoffs
              </div>
              <div className="text-2xl font-bold text-gray-900">{pendingHandoffs.length}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {stats?.running || 0} agents currently running
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Agent Grid */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Agents</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(AGENT_INFO).map(([key, info]) => {
              const Icon = info.icon;
              const agentStats = stats?.by_agent[key];
              const lastRun = runs.find(r => r.agent_name === key);

              return (
                <Card key={key} className="border border-gray-200 hover:border-gray-300 transition-colors">
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-5 h-5 ${info.color}`} />
                        <span className="font-semibold text-sm text-gray-900">{info.label}</span>
                      </div>
                      <Badge
                        className={`text-[10px] px-1.5 py-0 border ${
                          info.type === 'scheduled'
                            ? 'bg-teal-50 text-teal-700 border-teal-200'
                            : 'bg-gray-50 text-gray-600 border-gray-200'
                        }`}
                      >
                        {info.type === 'scheduled' ? 'Auto' : 'Manual'}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 mb-1.5">{info.description}</p>
                    <div className="text-[10px] text-gray-400 mb-2">{info.schedule}</div>

                    {agentStats ? (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="font-medium">{agentStats.runs} runs</span>
                        <span className="text-gray-300">|</span>
                        <span className="text-emerald-600">{agentStats.completed} ok</span>
                        {agentStats.failed > 0 && (
                          <>
                            <span className="text-gray-300">|</span>
                            <span className="text-red-500">{agentStats.failed} failed</span>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400">No runs yet</div>
                    )}

                    {lastRun && (
                      <div className="flex items-center gap-1 mt-1.5 text-[10px] text-gray-400">
                        {statusIcon(lastRun.status)}
                        Last run {formatTimeAgo(lastRun.started_at)}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Section Toggle */}
        <div className="flex gap-2">
          {(['overview', 'signals', 'drafts'] as const).map((section) => (
            <Button
              key={section}
              size="sm"
              variant={activeSection === section ? 'default' : 'outline'}
              onClick={() => setActiveSection(section)}
              style={activeSection === section ? { backgroundColor: '#3e8692' } : {}}
              className={activeSection === section ? 'text-white border-transparent' : ''}
            >
              {section === 'overview' && 'Runs'}
              {section === 'signals' && `Signals${signals.length > 0 ? ` (${signals.length})` : ''}`}
              {section === 'drafts' && `Drafts${drafts.length > 0 ? ` (${drafts.length})` : ''}`}
            </Button>
          ))}
        </div>

        {/* Signals Feed */}
        {activeSection === 'signals' && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Signal Feed</h4>
            <Card className="border border-gray-200">
              <ScrollArea className="h-[400px]">
                <div className="divide-y divide-gray-100">
                  {signals.length === 0 ? (
                    <div className="p-8 text-center text-sm text-gray-400">
                      <Radar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      No signals detected yet. Signals appear when RADAR or SCOUT agents run.
                    </div>
                  ) : (
                    signals.map((signal: any) => (
                      <div key={signal.id} className="px-4 py-3 hover:bg-gray-50">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className={`w-4 h-4 ${
                              signal.tier === 1 ? 'text-red-500' : signal.tier === 2 ? 'text-amber-500' : 'text-blue-400'
                            }`} />
                            <span className="text-sm font-medium text-gray-900">
                              {signal.opportunity?.name || 'Unknown'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-[10px]">Tier {signal.tier}</Badge>
                            <Badge variant="outline" className="text-[10px]">{formatLabel(signal.confidence)}</Badge>
                            {!signal.is_active && <Badge className="bg-gray-100 text-gray-500 text-[10px]">Expired</Badge>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">{formatLabel(signal.signal_type)}</Badge>
                          <span className="text-[10px] text-gray-400">{signal.detected_by}</span>
                        </div>
                        <p className="text-xs text-gray-600">{signal.signal_detail}</p>
                        {signal.source_url && (
                          <a href={signal.source_url} target="_blank" rel="noopener noreferrer"
                             className="text-[10px] text-blue-500 hover:underline">{signal.source_url}</a>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </Card>
          </div>
        )}

        {/* Outreach Drafts Queue */}
        {activeSection === 'drafts' && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Outreach Drafts</h4>
            <Card className="border border-gray-200">
              <ScrollArea className="h-[400px]">
                <div className="divide-y divide-gray-100">
                  {drafts.length === 0 ? (
                    <div className="p-8 text-center text-sm text-gray-400">
                      <MessageSquare className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      No outreach drafts yet. Drafts appear when MERCURY or COLDCRAFT agents run.
                    </div>
                  ) : (
                    drafts.map((draft: any) => (
                      <div key={draft.id} className="px-4 py-3 hover:bg-gray-50">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">
                              {draft.opportunity?.name || 'Unknown'}
                            </span>
                            <Badge variant="outline" className="text-[10px]">Touch {draft.touch_number}</Badge>
                            <Badge variant="outline" className="text-[10px]">{draft.channel}</Badge>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {draft.quality_gate_passed ? (
                              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">QG Passed</Badge>
                            ) : (
                              <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">QG Failed</Badge>
                            )}
                            <Badge variant="outline" className="text-[10px]">{draft.status}</Badge>
                          </div>
                        </div>
                        {draft.framework_used && (
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-[10px]">{formatLabel(draft.framework_used)}</Badge>
                            <span className="text-[10px] text-gray-400">{draft.created_by}</span>
                            {draft.tracking_id && <span className="text-[10px] text-gray-400">{draft.tracking_id}</span>}
                          </div>
                        )}
                        <div className="mt-1 p-2 bg-gray-50 rounded text-xs text-gray-700 font-mono whitespace-pre-wrap">
                          {draft.message_draft}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
                            onClick={async () => {
                              await supabase.from('outreach_drafts').update({ status: 'approved' }).eq('id', draft.id);
                              fetchData();
                            }}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
                            onClick={async () => {
                              await supabase.from('outreach_drafts').delete().eq('id', draft.id);
                              fetchData();
                            }}
                          >
                            <XCircle className="w-3 h-3 mr-1" /> Reject
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </Card>
          </div>
        )}

        {/* Recent Runs */}
        {activeSection === 'overview' && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Recent Runs</h4>
          <Card className="border border-gray-200">
            <ScrollArea className="h-[320px]">
              <div className="divide-y divide-gray-100">
                {runs.length === 0 ? (
                  <div className="p-8 text-center text-sm text-gray-400">
                    <Bot className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    No agent runs yet. Runs will appear here once agents are triggered.
                  </div>
                ) : (
                  runs.map((run) => {
                    const info = AGENT_INFO[run.agent_name];
                    const Icon = info?.icon || Bot;

                    return (
                      <div
                        key={run.id}
                        className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 ${
                          run.agent_name === 'SCOUT' && run.status === 'completed' ? 'cursor-pointer' : ''
                        }`}
                        onClick={() => {
                          if (run.agent_name === 'SCOUT' && run.status === 'completed' && run.output_summary) {
                            setScoutInitialReport(run.output_summary as any);
                            setScoutOpen(true);
                          }
                        }}
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${info?.color || 'text-gray-400'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">{run.agent_name}</span>
                            {statusBadge(run.status)}
                            <Badge variant="outline" className="text-[10px]">{formatLabel(run.run_type)}</Badge>
                            {run.agent_name === 'SCOUT' && run.status === 'completed' && (
                              <span className="text-[10px] font-medium hover:underline" style={{ color: '#3e8692' }}>View Report</span>
                            )}
                          </div>
                          {run.error_message && (
                            <p className="text-xs text-red-500 mt-0.5 truncate">{run.error_message}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs text-gray-500">{formatDuration(run.duration_ms)}</div>
                          <div className="text-[10px] text-gray-400">{formatTimeAgo(run.started_at)}</div>
                        </div>
                        <div className="text-right shrink-0 w-16">
                          <div className="text-xs text-gray-500">{(run.tokens_used || 0).toLocaleString()} tok</div>
                          <div className="text-[10px] text-gray-400">{formatCost(parseFloat(String(run.cost_usd || 0)))}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </Card>
        </div>
        )}

        {/* Pending Handoffs */}
        {pendingHandoffs.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Pending Handoffs ({pendingHandoffs.length})
            </h4>
            <Card className="border border-amber-200 bg-amber-50/30">
              <div className="divide-y divide-amber-100">
                {pendingHandoffs.map((handoff) => (
                  <div key={handoff.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex items-center gap-1 text-xs">
                      <Badge variant="outline" className="text-[10px]">{handoff.from_agent}</Badge>
                      <ArrowRight className="w-3 h-3 text-gray-400" />
                      <Badge variant="outline" className="text-[10px]">{handoff.to_agent}</Badge>
                    </div>
                    <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">
                      {formatLabel(handoff.handoff_type)}
                    </Badge>
                    <span className="text-xs text-gray-500 ml-auto">{formatTimeAgo(handoff.created_at)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* SCOUT Qualify Dialog */}
      <ScoutQualifyDialog
        open={scoutOpen}
        onClose={() => { setScoutOpen(false); setScoutInitialReport(null); }}
        onOpportunityCreated={() => {
          handleRefresh();
        }}
        initialReport={scoutInitialReport}
      />
    </TooltipProvider>
  );
}
