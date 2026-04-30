'use client';

import React, { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Bot, Search, Copy, Check, Sparkles, Target, Building2, Megaphone, Users,
  GitBranch, AlertCircle, ListTodo, FileText,
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
    id: 'tasks',
    label: 'Tasks',
    icon: ListTodo,
    color: 'sky',
    tools: [
      {
        name: 'list_team_tasks',
        description: 'Browse the team\'s task list. Filter by owner, status, due-date window, or client. Sorted by due-date ascending so overdue / soonest-due bubble to top.',
        prompts: [
          'What\'s overdue across the team?',
          'My open tasks due in the next 7 days.',
          'Show me all tasks linked to Galxe.',
          'Anything blocked right now?',
        ],
      },
      {
        name: 'get_task_detail',
        description: 'Full info on one task — name, status, priority, frequency, assignee, due date, linked client, description, latest comment.',
        prompts: [
          'Pull up that task — show me the description and latest comment.',
          'Full detail on the recurring CDL task.',
        ],
      },
    ],
  },
  {
    id: 'forms',
    label: 'Forms',
    icon: FileText,
    color: 'amber',
    tools: [
      {
        name: 'list_form_submissions',
        description: 'List recent form_responses across all forms (or one specific form). Default last 7 days. Returns a per-form breakdown at the top.',
        prompts: [
          'What form submissions came in this week?',
          'Submissions to the prospect intake form in the last 30 days.',
          'Anything submitted today?',
        ],
      },
      {
        name: 'get_form_submission_detail',
        description: 'Full submission for one response_id — form name + description, submitter, linked client, and pretty-printed answers from response_data.',
        prompts: [
          'Show me the answers for that submission.',
          'Pull up the full response from the latest intake form submission.',
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

/**
 * Copy-to-clipboard button with visual feedback. Used for prompts AND
 * the connector URL. Two variants:
 *   - icon-only (label='') for inline use next to prompt lines
 *   - full button (label='Copy') for prominent copy targets
 */
function CopyButton({ value, variant = 'icon' }: { value: string; variant?: 'icon' | 'full' }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast({ title: 'Copied', description: value.length > 70 ? value.slice(0, 70) + '…' : value });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Copy failed', description: 'Clipboard unavailable', variant: 'destructive' });
    }
  };

  if (variant === 'full') {
    return (
      <button
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-gray-200 bg-white text-gray-700 hover:border-[#3e8692] hover:text-[#3e8692] transition-colors"
        title="Copy to clipboard"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    );
  }
  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center h-7 w-7 rounded-md text-gray-400 hover:bg-gray-100 hover:text-[#3e8692] transition-all shrink-0"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600 opacity-100" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/** Color tokens per surface — extracted so accents stay consistent. */
const COLOR_CLASSES: Record<ToolGroup['color'], { bg: string; text: string; border: string; iconBg: string; accent: string }> = {
  purple:  { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200',  iconBg: 'bg-purple-100',  accent: 'bg-purple-500'  },
  sky:     { bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200',     iconBg: 'bg-sky-100',     accent: 'bg-sky-500'     },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   iconBg: 'bg-amber-100',   accent: 'bg-amber-500'   },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', iconBg: 'bg-emerald-100', accent: 'bg-emerald-500' },
  rose:    { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    iconBg: 'bg-rose-100',    accent: 'bg-rose-500'    },
  lime:    { bg: 'bg-lime-50',    text: 'text-lime-700',    border: 'border-lime-200',    iconBg: 'bg-lime-100',    accent: 'bg-lime-500'    },
};

/**
 * One tool, with all its example prompts. Single-column layout so prompts
 * have full width to breathe. Header has the tool name (bigger, code-styled),
 * a read/write tag, and the description below. Each prompt is a clean
 * left-bordered quote block with a hover-revealed copy button at the right.
 */
function ToolBlock({ tool, color }: { tool: Tool; color: ToolGroup['color'] }) {
  const c = COLOR_CLASSES[color];
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-gray-300 transition-colors">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <code className={`text-base font-mono font-semibold ${c.text}`}>{tool.name}</code>
              {tool.write ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
                  ⚠ Write
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wider bg-gray-100 text-gray-500">
                  Read
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{tool.description}</p>
          </div>
        </div>
      </div>

      {/* Prompts — left-bordered quote blocks with hover-revealed copy */}
      <div className="px-5 py-4 space-y-2.5 bg-gray-50/40">
        {tool.prompts.map((p, i) => (
          <div
            key={i}
            className="group flex items-start gap-2 -mx-2 px-2 py-2 rounded-lg hover:bg-white transition-colors"
          >
            <div className={`w-0.5 self-stretch rounded-full ${c.accent} opacity-50 shrink-0 my-0.5`} />
            <p className="text-[13.5px] text-gray-800 leading-relaxed flex-1 italic">
              &ldquo;{p}&rdquo;
            </p>
            <CopyButton value={p} variant="icon" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A whole surface (Discovery, CRM, etc.) with its colored title bar
 *  and the tool blocks underneath. */
function SurfaceSection({ group }: { group: ToolGroup }) {
  const c = COLOR_CLASSES[group.color];
  const Icon = group.icon;
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl ${c.iconBg} flex items-center justify-center shrink-0`}>
          <Icon className={`h-5 w-5 ${c.text}`} />
        </div>
        <div>
          <h2 className={`text-lg font-bold ${c.text}`}>{group.label}</h2>
          <p className="text-xs text-gray-500">
            {group.tools.length} {group.tools.length === 1 ? 'tool' : 'tools'}
          </p>
        </div>
      </div>
      <div className="space-y-3">
        {group.tools.map((t) => (
          <ToolBlock key={t.name} tool={t} color={group.color} />
        ))}
      </div>
    </section>
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
    <div className="max-w-4xl mx-auto pb-12">
      {/* ── Hero ───────────────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-12 w-12 rounded-2xl bg-[#3e8692] flex items-center justify-center">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Claude Cookbook</h1>
            <p className="text-sm text-gray-500">HoloHive MCP — example prompts for every tool</p>
          </div>
        </div>
        <p className="text-base text-gray-700 leading-relaxed max-w-2xl">
          When you connect HoloHive to Claude.ai, you can ask Claude questions about your prospects,
          campaigns, KOLs, and CRM in plain English. Below are examples to get you started — copy any
          prompt and paste it into a Claude chat.
        </p>
      </div>

      {/* ── Setup card ─────────────────────────────────────────────── */}
      <div className="mb-10 rounded-2xl bg-gradient-to-br from-[#3e8692]/8 to-[#3e8692]/3 border border-[#3e8692]/20 p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-[#3e8692] text-white text-xs font-bold">
            ⚡
          </span>
          <h3 className="text-base font-bold text-gray-900">Connect to Claude.ai (one-time setup)</h3>
        </div>

        <ol className="space-y-3.5 mb-4">
          {[
            <>Open <strong>Claude.ai</strong> &rarr; <strong>Settings</strong> &rarr; <strong>Connectors</strong> &rarr; click <strong>Add custom connector</strong>.</>,
            <>Paste the connector URL below into Claude&rsquo;s input box.</>,
            <>Click <strong>Connect</strong>, then sign in to HoloHive when prompted, then click <strong>Allow</strong> on the consent screen.</>,
            <>You&rsquo;re done. Try one of the prompts below in any Claude chat.</>,
          ].map((line, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-white border border-[#3e8692]/30 text-[#3e8692] text-xs font-bold shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span className="text-sm text-gray-700 leading-relaxed pt-0.5">{line}</span>
            </li>
          ))}
        </ol>

        {/* Connector URL — prominent, instantly copyable */}
        <div className="rounded-xl bg-white border border-gray-200 p-3 flex items-center gap-3">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider shrink-0 hidden sm:inline">URL</span>
          <code className="text-sm font-mono text-gray-800 flex-1 break-all">{CONNECTOR_URL}</code>
          <CopyButton value={CONNECTOR_URL} variant="full" />
        </div>

        <p className="text-xs text-gray-500 mt-3">
          The same connector works in Claude Code (CLI) and the Claude.ai mobile/desktop apps —
          all clients share this single MCP server URL.
        </p>
      </div>

      {/* ── Sticky filter bar ──────────────────────────────────────── */}
      <div className="sticky top-0 z-10 -mx-4 px-4 py-3 mb-6 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[260px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder='Search tools or prompts (try "Korean exchange" or "follow-up")…'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-10 text-sm auth-input"
              />
            </div>
            <span className="text-xs text-gray-500 shrink-0">
              {search
                ? `${matchedTools} of ${totalTools} tools match`
                : `${totalTools} tools · ${COMBOS.length} combos`}
            </span>
          </div>

          {/* Category pills — flex-wrap because there are 8 of them */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeCategory === 'all'
                  ? 'bg-[#3e8692] text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            {TOOL_GROUPS.map((g) => {
              const Icon = g.icon;
              const active = activeCategory === g.id;
              const c = COLOR_CLASSES[g.color];
              return (
                <button
                  key={g.id}
                  onClick={() => setActiveCategory(g.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    active
                      ? `${c.text} ${c.bg} ring-1 ring-inset ${c.border}`
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {g.label}
                  <span className={`text-[10px] ${active ? 'opacity-70' : 'text-gray-400'}`}>{g.tools.length}</span>
                </button>
              );
            })}
            <button
              onClick={() => setActiveCategory('combos')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeCategory === 'combos'
                  ? 'bg-[#3e8692]/10 text-[#3e8692] ring-1 ring-inset ring-[#3e8692]/30'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Sparkles className="h-3 w-3" />
              Combos
              <span className={`text-[10px] ${activeCategory === 'combos' ? 'opacity-70' : 'text-gray-400'}`}>{COMBOS.length}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────── */}
      {activeCategory === 'combos' ? (
        // Combos view — multi-tool prompts
        <section className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-[#3e8692]/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-[#3e8692]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Multi-tool combos</h2>
              <p className="text-xs text-gray-500">
                One prompt → multiple tool calls. Claude figures out the right sequence.
              </p>
            </div>
          </div>
          {COMBOS.map((c, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 hover:border-gray-300 transition-colors">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#3e8692]" />
                <h3 className="text-base font-bold text-gray-900">{c.title}</h3>
              </div>
              <div className="px-5 py-4 bg-gray-50/40">
                <div className="group flex items-start gap-2 mb-3 -mx-2 px-2 py-2 rounded-lg hover:bg-white transition-colors">
                  <div className="w-0.5 self-stretch rounded-full bg-[#3e8692] opacity-50 shrink-0 my-0.5" />
                  <p className="text-[13.5px] text-gray-800 leading-relaxed flex-1 italic">
                    &ldquo;{c.prompt}&rdquo;
                  </p>
                  <CopyButton value={c.prompt} variant="icon" />
                </div>
                <details className="group/details">
                  <summary className="text-[11px] text-gray-500 cursor-pointer hover:text-gray-700 select-none flex items-center gap-1">
                    <span className="font-semibold uppercase tracking-wider">What Claude calls</span>
                    <span className="opacity-50 group-open/details:rotate-90 transition-transform">▶</span>
                  </summary>
                  <code className="block mt-2 text-[11px] font-mono text-gray-600 leading-relaxed bg-white border border-gray-200 rounded-lg p-2.5">
                    {c.triggers}
                  </code>
                </details>
              </div>
            </div>
          ))}
        </section>
      ) : (
        // Tool surface view — sectioned by category
        <div className="space-y-10">
          {filteredGroups.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <AlertCircle className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm font-medium">No tools match &ldquo;{search}&rdquo;</p>
              <p className="text-xs mt-1">Try a different keyword or clear the filter.</p>
            </div>
          ) : (
            filteredGroups.map((g) => <SurfaceSection key={g.id} group={g} />)
          )}
        </div>
      )}

      {/* ── Pro tips ───────────────────────────────────────────────── */}
      <div className="mt-12 rounded-2xl bg-gradient-to-br from-gray-50 to-white border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-[#3e8692]" />
          <h3 className="text-base font-bold text-gray-900">Pro tips</h3>
        </div>
        <ul className="space-y-3">
          {PRO_TIPS.map((tip, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-[#3e8692]/10 text-[#3e8692] text-[10px] font-bold shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span className="text-sm text-gray-700 leading-relaxed">{tip}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <div className="mt-8 text-center text-xs text-gray-400">
        Want a tool that isn&apos;t here? Edit{' '}
        <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">app/mcp/page.tsx</code>{' '}
        and add to <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">TOOL_GROUPS</code>.
      </div>
    </div>
  );
}
