'use client';

import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Bot, Search, Copy, Check, Sparkles, Target, Building2, Megaphone, Users,
  GitBranch, ExternalLink, AlertCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/**
 * /mcp — HoloHive MCP Connector cookbook.
 *
 * Reference page for every tool exposed by our MCP server, with example
 * prompts you can paste straight into Claude.ai or Claude Code chats.
 *
 * Self-contained: no API calls, no DB hits — the tool list is hard-coded
 * here so it renders instantly. When we add new MCP tools, update the
 * TOOL_GROUPS array below.
 *
 * Design choices:
 *   - Tabs filter by surface (Discovery / CRM / Clients / etc.) so the
 *     full 22-tool list isn't dumped on the user at once.
 *   - Search is a global free-text filter that matches tool names AND
 *     example prompt content — most useful when the user thinks "what
 *     was that prompt about Korean exchange listings?"
 *   - Every prompt has a copy button. The whole point of this page is
 *     to be a clipboard launchpad for Claude.
 *   - Connector URL + setup blurb at the top so a new teammate can
 *     bootstrap from this single page.
 */

const CONNECTOR_URL = 'https://app.holohive.io/api/mcp/mcp';

interface Tool {
  name: string;
  description: string;
  write?: boolean;
  prompts: string[];
}

interface ToolGroup {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Tailwind color name for accent ring/badge */
  color: 'purple' | 'sky' | 'amber' | 'emerald' | 'rose' | 'lime';
  tools: Tool[];
}

const TOOL_GROUPS: ToolGroup[] = [
  {
    id: 'discovery',
    label: 'Discovery & Intelligence',
    icon: Sparkles,
    color: 'purple',
    tools: [
      {
        name: 'list_recent_prospects',
        description: 'List Discovery prospects with filters (tier, status, source, sort).',
        prompts: [
          'What Discovery prospects came in this week?',
          'Show me REACH_OUT_NOW prospects from the last 14 days, sorted by Korea score.',
          'Reviewed-but-not-promoted prospects from CryptoRank in the last month.',
        ],
      },
      {
        name: 'get_prospect_detail',
        description: 'Full info on one prospect — score, fit reasoning, signals, links.',
        prompts: [
          'Tell me everything about Liquid.',
          'Pull up that prospect from yesterday — show me the signals and fit reasoning.',
        ],
      },
      {
        name: 'get_recent_signals',
        description: 'Browse prospect_signals across all signal types, filterable by type / weight.',
        prompts: [
          'Any new poc_korea_mention signals in the last 3 days?',
          'What signals fired this week with weight 20 or higher?',
          'Show me all korea_intent_exchange signals from the past month.',
        ],
      },
      {
        name: 'get_kr_listings',
        description: 'Recent Korean exchange listings (Upbit / Bithumb), flagged when matched to a prospect.',
        prompts: [
          'Anything new on Upbit in the last 3 days?',
          'Korean exchange listings this week — flag any that match Discovery prospects.',
          'What listed on Bithumb yesterday?',
        ],
      },
      {
        name: 'get_intelligence_cost_summary',
        description: 'Discovery / POC enrichment / Deep Dive spend by run type.',
        prompts: [
          'How much did Discovery cost this month?',
          'Where\'s my Intelligence budget going — break it down by run type.',
          'Did anything fail in the last 30 days?',
        ],
      },
    ],
  },
  {
    id: 'crm',
    label: 'CRM',
    icon: Target,
    color: 'emerald',
    tools: [
      {
        name: 'list_crm_opportunities',
        description: 'Browse opportunities with filters (stages, owner, source, account_type, sort).',
        prompts: [
          'Show me everything in my Deals pipeline at proposal or contract stage.',
          'Who\'s in tg_intro right now, sorted by composite score?',
          'List opportunities I own with deal_value > 0.',
        ],
      },
      {
        name: 'get_opportunity_detail',
        description: 'Full info on one opportunity — all 5 scores, activity timeline, contacts, funding.',
        prompts: [
          'Pull up Bondex — full breakdown with scores and contacts.',
          'Why is Youmio sitting at contract? Show me the activity timeline.',
        ],
      },
      {
        name: 'crm_stage_summary',
        description: 'Pipeline distribution across the four canonical pipelines (Outreach / Leads / Deals / Accounts).',
        prompts: [
          'How does my pipeline look right now?',
          'Pipeline distribution snapshot.',
        ],
      },
      {
        name: 'crm_followups_due',
        description: 'Active opportunities not contacted in N days, skipping closed/dead/churned stages.',
        prompts: [
          'Who haven\'t I contacted in 7+ days?',
          'My stalest opportunities — sorted by oldest contact first.',
          'Anyone in deal_qualified or contract that\'s gone quiet?',
        ],
      },
      {
        name: 'log_crm_activity',
        write: true,
        description: 'Log a call/message/meeting/proposal/note/bump on an opportunity. Bumps last_contacted_at.',
        prompts: [
          'I just had a call with Liquid. We discussed Korean DEX integration timing, they\'re targeting Q3. Log it.',
          'Quick note on Galxe — they want to see the proposal by Friday. Set next_step to that.',
          'Mark Bondex as bumped — sent them a follow-up message this morning.',
        ],
      },
    ],
  },
  {
    id: 'clients',
    label: 'Clients',
    icon: Building2,
    color: 'sky',
    tools: [
      {
        name: 'list_clients',
        description: 'Active client roster with optional name search.',
        prompts: [
          'What clients are active right now?',
          'Search clients for "Galxe".',
          'Including archived — show me everyone we\'ve ever worked with.',
        ],
      },
      {
        name: 'get_client_detail',
        description: 'Quick info on one client — status, location, onboarding, campaign + opp counts.',
        prompts: [
          'Quick info on Holo Hive — campaign count, opps count.',
          'Is Galxe onboarded?',
        ],
      },
      {
        name: 'summarize_client',
        description: 'One-shot full picture: campaigns, payment totals, linked opps, recent CDL entries.',
        prompts: [
          'Give me everything about Solayer — campaigns, payments, opps, recent delivery logs.',
          'State of the Fogo account — full picture.',
          'What\'s been happening on Impossible\'s account in the last 90 days?',
        ],
      },
    ],
  },
  {
    id: 'campaigns',
    label: 'Campaigns',
    icon: Megaphone,
    color: 'amber',
    tools: [
      {
        name: 'list_active_campaigns',
        description: 'All non-archived, non-closed campaigns with client, status, budget, region, manager.',
        prompts: [
          'What campaigns are running right now?',
        ],
      },
      {
        name: 'get_campaign_detail',
        description: 'Full info on one campaign — KOL roster status, payments, intro/NDA/proposal flags, dates.',
        prompts: [
          'Pull up the 0G Campaign — KOL roster status, payments, dates.',
          'Status of the Solayer campaign.',
        ],
      },
      {
        name: 'list_campaign_kols',
        description: 'Roster for one campaign — name, tier, followers, hh/client status, allocated/paid.',
        prompts: [
          'Who\'s signed onto Galxe\'s campaign?',
          'Confirmed-only roster for the 0G Campaign.',
          'Show me the campaign roster sorted by allocated budget.',
        ],
      },
      {
        name: 'get_campaign_payments',
        description: 'Payment line items for a campaign — paid vs pending with totals.',
        prompts: [
          'Payment status on Galxe\'s campaign — paid vs pending.',
          'Pending payments on the 0G Campaign.',
          'Total payouts this campaign so far.',
        ],
      },
    ],
  },
  {
    id: 'kols',
    label: 'KOLs',
    icon: Users,
    color: 'rose',
    tools: [
      {
        name: 'search_kols',
        description: 'Search master KOL list by name (substring), with optional region/tier filters.',
        prompts: [
          'Find any KOLs with "crypto" in their name in Korea.',
          'Search for ETH Apple.',
        ],
      },
      {
        name: 'list_top_kols',
        description: 'Filtered KOL ranking — region, tier, niche, platform, min_followers, in-house. No name needed.',
        prompts: [
          'Top Tier 1 Korean DeFi KOLs with 100K+ followers.',
          'In-house Korean creators on Telegram.',
          'Best Tier S KOLs we have, any region.',
          'Korean GameFi creators with 50K+ followers.',
        ],
      },
      {
        name: 'get_kol_detail',
        description: 'Full record on one KOL — pricing, niche, content type, deliverables, link, wallet.',
        prompts: [
          'Tell me everything about ETH Apple — pricing, deliverables, contacts.',
          'Full record on Money Bottle.',
        ],
      },
    ],
  },
  {
    id: 'cross',
    label: 'Cross-cutting',
    icon: GitBranch,
    color: 'lime',
    tools: [
      {
        name: 'summarize_pipeline',
        description: 'High-level snapshot of Discovery + CRM + active campaigns.',
        prompts: [
          'Give me a HoloHive snapshot — Discovery, CRM, campaigns.',
          'How are we doing overall?',
        ],
      },
      {
        name: 'get_promoted_opportunity_for_prospect',
        description: 'Bridge Intelligence → CRM via promoted_opportunity_id.',
        prompts: [
          'Did Liquid get promoted? What stage is it now?',
          'Trace this prospect — was it ever promoted to CRM?',
        ],
      },
    ],
  },
];

interface Combo {
  title: string;
  prompt: string;
  triggers: string;
}

const COMBOS: Combo[] = [
  {
    title: 'The morning briefing',
    prompt: 'Give me my morning HoloHive briefing — pipeline snapshot, anyone overdue for follow-up, any new prospects worth my attention, and any Korean exchange listings overnight.',
    triggers: 'summarize_pipeline + crm_followups_due + list_recent_prospects(tier=REACH_OUT_NOW) + get_kr_listings',
  },
  {
    title: 'The client deep-dive',
    prompt: 'I have a call with Galxe in 30 min. Brief me on the account — what\'s the state of their campaign, any payment lag, what was the last activity, what should I bring up?',
    triggers: 'summarize_client + get_campaign_detail + list_crm_opportunities(filter=galxe) + Claude synthesizes',
  },
  {
    title: 'The Discovery → CRM trace',
    prompt: 'That Liquid prospect from last week — where did it end up? Show me the prospect data AND the linked CRM opportunity.',
    triggers: 'list_recent_prospects(search=liquid) → get_promoted_opportunity_for_prospect → get_opportunity_detail',
  },
  {
    title: 'Cost investigation',
    prompt: 'Why was the Intelligence cost so high this week? Break it down and tell me what failed.',
    triggers: 'get_intelligence_cost_summary(days=7) + Claude reads the failure breakdown',
  },
  {
    title: 'Campaign health check',
    prompt: 'Health check on all active campaigns — for each one give me KOL count, payment % paid, and how stale the latest activity is.',
    triggers: 'list_active_campaigns → loops get_campaign_detail for each → synthesizes',
  },
  {
    title: 'Field outreach prep',
    prompt: 'I want to find Korean DeFi KOLs at Tier 1 or higher with 100K+ followers, then for each one show me their pricing and whether they\'re already in any of our campaigns.',
    triggers: 'list_top_kols(region=Korea, niche=DeFi, tier=Tier 1, min_followers=100000) → loops get_kol_detail → cross-references list_campaign_kols',
  },
  {
    title: 'Meeting log + next-step',
    prompt: 'Just got off a call with Solayer. They committed to signing the contract by Tuesday. Log the activity AND set the next-step date.',
    triggers: 'list_crm_opportunities(search=solayer) to get the ID → log_crm_activity(type=call, next_step=\'Sign contract\', next_step_date=\'2026-05-05\')',
  },
];

const PRO_TIPS = [
  'You don\'t need to know tool names. Just speak naturally — Claude picks the right tool(s).',
  'Names work as well as IDs. Say "Galxe" or "the 0G Campaign" — Claude calls a list_* tool first to find the UUID, then drills in.',
  'For follow-up actions, be explicit. "Log the activity" or "log it" triggers the write tool. Otherwise Claude defaults to read-only.',
  'Combo questions are usually faster than splitting. Asking "brief me on Galxe" once is faster than 3 separate questions about campaigns/payments/contacts — Claude parallelizes the tool calls.',
  'Cost is real but small. Each tool call is a few cents at most; a typical "morning briefing" prompt costs under $0.05.',
];

// ─── Components ─────────────────────────────────────────────────────────

function CopyChip({ value, label = 'Copy' }: { value: string; label?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast({ title: 'Copied', description: value.length > 60 ? value.slice(0, 60) + '…' : value });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Copy failed', description: 'Clipboard unavailable', variant: 'destructive' });
    }
  };
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-[#3e8692] transition-colors shrink-0"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
      {label}
    </button>
  );
}

const COLOR_CLASSES: Record<ToolGroup['color'], { bg: string; text: string; border: string; ring: string }> = {
  purple:  { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200',  ring: 'ring-purple-200/50' },
  sky:     { bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200',     ring: 'ring-sky-200/50' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   ring: 'ring-amber-200/50' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', ring: 'ring-emerald-200/50' },
  rose:    { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    ring: 'ring-rose-200/50' },
  lime:    { bg: 'bg-lime-50',    text: 'text-lime-700',    border: 'border-lime-200',    ring: 'ring-lime-200/50' },
};

function ToolCard({ tool, color }: { tool: Tool; color: ToolGroup['color'] }) {
  const c = COLOR_CLASSES[color];
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <code className={`text-sm font-mono font-semibold ${c.text}`}>{tool.name}</code>
              {tool.write ? (
                <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200 font-semibold uppercase tracking-wide">
                  ⚠ Write
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] bg-gray-50 text-gray-600 border-gray-200 font-medium">
                  read
                </Badge>
              )}
            </div>
            <p className="text-xs text-gray-600 mt-1">{tool.description}</p>
          </div>
        </div>

        <div className="space-y-1.5 mt-3 border-t border-gray-100 pt-3">
          {tool.prompts.map((p, i) => (
            <div key={i} className="flex items-start gap-2 group">
              <span className="text-gray-300 mt-0.5">›</span>
              <span className="text-xs text-gray-700 italic flex-1 leading-relaxed">{p}</span>
              <CopyChip value={p} label="" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function McpGuidePage() {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Apply search across tool names + descriptions + prompt content. We
  // search inside each tool individually so the result preserves group
  // structure (matching tools in the right group, empty groups hidden).
  const filteredGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    return TOOL_GROUPS
      .filter(g => activeCategory === 'all' || g.id === activeCategory)
      .map(g => ({
        ...g,
        tools: term
          ? g.tools.filter(t =>
              t.name.toLowerCase().includes(term) ||
              t.description.toLowerCase().includes(term) ||
              t.prompts.some(p => p.toLowerCase().includes(term)),
            )
          : g.tools,
      }))
      .filter(g => g.tools.length > 0);
  }, [activeCategory, search]);

  const totalTools = TOOL_GROUPS.reduce((n, g) => n + g.tools.length, 0);
  const matchedTools = filteredGroups.reduce((n, g) => n + g.tools.length, 0);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bot className="h-6 w-6 text-[#3e8692]" />
            Claude MCP Cookbook
          </h2>
          <p className="text-gray-600">
            Example prompts for every HoloHive tool exposed to Claude.ai and Claude Code.
            Copy any prompt and paste it straight into Claude.
          </p>
        </div>
      </div>

      {/* Setup card */}
      <Card className="border-[#3e8692]/20 bg-[#3e8692]/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-full bg-[#3e8692] flex items-center justify-center text-white font-bold shrink-0 text-sm">
              H
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 mb-1">Connect HoloHive to Claude.ai</p>
              <ol className="text-xs text-gray-700 space-y-1 list-decimal pl-4">
                <li>Open Claude.ai → Settings → Connectors → <strong>Add custom connector</strong></li>
                <li>
                  Paste this URL:&nbsp;
                  <code className="bg-white border border-gray-200 rounded px-1.5 py-0.5 text-[11px] font-mono">{CONNECTOR_URL}</code>
                  <span className="ml-2 inline-block">
                    <CopyChip value={CONNECTOR_URL} label="copy URL" />
                  </span>
                </li>
                <li>Click <strong>Connect</strong> → sign in to HoloHive if needed → click <strong>Allow</strong> on the consent screen.</li>
                <li>Done. Try one of the prompts below in any Claude chat.</li>
              </ol>
              <p className="text-[11px] text-gray-500 mt-2">
                The same connector works in Claude Code (CLI) — both clients share the same MCP server URL.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search + total */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search tools or prompts (e.g. 'Korean exchange', 'follow-up')..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm auth-input"
          />
        </div>
        <span className="text-xs text-gray-500">
          {search ? `${matchedTools} of ${totalTools} tools` : `${totalTools} tools across ${TOOL_GROUPS.length} surfaces`}
        </span>
      </div>

      {/* Category tabs */}
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">All</TabsTrigger>
          {TOOL_GROUPS.map((g) => {
            const Icon = g.icon;
            return (
              <TabsTrigger key={g.id} value={g.id} className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                {g.label}
                <span className="text-[10px] text-gray-400 ml-0.5">{g.tools.length}</span>
              </TabsTrigger>
            );
          })}
          <TabsTrigger value="combos" className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Combos
            <span className="text-[10px] text-gray-400 ml-0.5">{COMBOS.length}</span>
          </TabsTrigger>
        </TabsList>

        {/* Tool grid */}
        <TabsContent value={activeCategory} className="mt-5">
          {activeCategory === 'combos' ? (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 mb-2">
                Multi-tool prompts — Claude figures out which tools to call and in what order.
              </p>
              {COMBOS.map((c, i) => (
                <Card key={i} className="overflow-hidden border-l-[3px] border-l-[#3e8692]">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="h-3.5 w-3.5 text-[#3e8692]" />
                      <h4 className="text-sm font-semibold text-gray-900">{c.title}</h4>
                    </div>
                    <div className="flex items-start gap-2 mb-2 group">
                      <span className="text-gray-300 mt-0.5">›</span>
                      <span className="text-xs text-gray-700 italic flex-1 leading-relaxed">{c.prompt}</span>
                      <CopyChip value={c.prompt} label="" />
                    </div>
                    <div className="flex items-start gap-2 text-[11px] text-gray-500 pl-5">
                      <span className="font-semibold">Triggers:</span>
                      <code className="font-mono">{c.triggers}</code>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {filteredGroups.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                  <p className="text-sm">No tools match your search.</p>
                </div>
              ) : filteredGroups.map((g) => {
                const Icon = g.icon;
                const c = COLOR_CLASSES[g.color];
                return (
                  <div key={g.id}>
                    <div className={`flex items-center gap-2 px-3 py-2 ${c.bg} ${c.border} border rounded-t-lg`}>
                      <Icon className={`h-4 w-4 ${c.text}`} />
                      <h3 className={`text-sm font-semibold ${c.text}`}>{g.label}</h3>
                      <Badge variant="secondary" className="text-[10px] font-medium">{g.tools.length}</Badge>
                    </div>
                    <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 p-3 border ${c.border} border-t-0 rounded-b-lg bg-gray-50/30`}>
                      {g.tools.map((t) => (
                        <ToolCard key={t.name} tool={t} color={g.color} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Pro tips */}
      <Card className="bg-gray-50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-[#3e8692]" />
            <h3 className="text-sm font-semibold text-gray-900">Pro tips</h3>
          </div>
          <ul className="space-y-2 text-xs text-gray-700">
            {PRO_TIPS.map((tip, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-[#3e8692] font-bold mt-0.5 shrink-0">•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="text-center text-[11px] text-gray-400 pt-2 pb-6">
        Want a tool that isn&apos;t here? See{' '}
        <code className="font-mono bg-gray-100 px-1 py-0.5 rounded">docs/MCP_SETUP.md</code>{' '}
        for how to add new tools.
        <a
          href="https://app.holohive.io/api/mcp/mcp"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-2 inline-flex items-center gap-1 text-[#3e8692] hover:underline"
        >
          Connector URL <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>
    </div>
  );
}
