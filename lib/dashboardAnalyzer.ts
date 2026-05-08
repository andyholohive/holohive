import { getClaudeClient } from './claude';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Priority Dashboard analyzer.
 *
 * Synthesizes a weekly company-operating snapshot from:
 *   - dashboard_self_reports (per-user check-ins for the week)
 *   - telegram_messages from chats tagged with dashboard_role
 *   - clients + crm_opportunities (for raw KPI counts)
 *   - users (team roster for owner attribution)
 *
 * Calls Claude (Sonnet) with a submit_dashboard tool whose input_schema
 * mirrors what /dashboard/page.tsx renders. The page is the contract;
 * if a new section is added there, the schema needs to grow too.
 *
 * Cost: ~$0.10–$0.25 per run with Sonnet, depending on chat volume.
 * Called from POST /api/dashboard/refresh and the Monday cron.
 */

const MODEL = 'claude-sonnet-4-20250514' as const;

// Per-chat message cap (most recent N). Keeps the prompt bounded for
// chats where one team member is hyperactive (e.g. an ops chat with
// 1000+ msgs/week). Older messages drop off silently.
const MAX_MESSAGES_PER_CHAT = 120;

// Total token budget for the chat-history section. If summed messages
// would exceed this, we trim chats round-robin (one msg per chat at a
// time from the oldest end) until we fit.
const CHAT_HISTORY_TOKEN_BUDGET = 35_000;

// Crude tokens-per-character estimate for budgeting. Real tokenizer
// would be more accurate but adds a dependency; ~4 chars/token is a
// safe over-count for English + emoji.
const TOKENS_PER_CHAR = 0.28;

export type DashboardPayload = {
  kpis: {
    active_clients: number;
    pipeline_count: number;
    qualified_leads_per_week: number;
    qualified_leads_target: number;
    [key: string]: number | undefined;
  };
  objectives: Array<{
    category: 'Korea' | 'Pipeline' | 'Internal' | 'Client' | string;
    title: string;
    description?: string;
    owners?: string[];
  }>;
  time_allocation: Record<string, {
    role?: string;
    items: Array<{ name: string; pct: number }>;
    callout?: string;
  }>;
  client_health: Array<{
    client: string;
    phase?: string;
    lead?: string;
    this_week?: string;
  }>;
  initiative_health: Array<{
    name: string;
    status: string;
    owners?: string[];
  }>;
  coordination: Array<{
    type: 'conflict' | 'handoff' | 'overlap';
    text: string;
    people?: string[];
  }>;
};

export interface DashboardAnalysisResult {
  payload: DashboardPayload;
  source_summary: {
    chats_analyzed: number;
    messages_analyzed: number;
    self_reports_count: number;
    team_members: number;
    clients: number;
    pipeline_opps: number;
    truncated_messages: number;
  };
  cost_usd: number;
  model: string;
}

const submitDashboardTool = {
  name: 'submit_dashboard',
  description: 'Submit the synthesized weekly Priority Dashboard payload.',
  input_schema: {
    type: 'object',
    properties: {
      kpis: {
        type: 'object',
        properties: {
          active_clients: { type: 'number' },
          pipeline_count: { type: 'number' },
          qualified_leads_per_week: { type: 'number', description: 'Inferred from this week\'s messages — leads that became qualified or had a meeting booked' },
          qualified_leads_target: { type: 'number', description: 'Default 5 unless something in the data suggests a different target' },
        },
        required: ['active_clients', 'pipeline_count', 'qualified_leads_per_week', 'qualified_leads_target'],
      },
      objectives: {
        type: 'array',
        description: 'Top 3-5 company objectives this week. Pull from self-reports + ops chat + recent direction. One sentence each.',
        items: {
          type: 'object',
          properties: {
            category: { type: 'string', enum: ['Korea', 'Pipeline', 'Internal', 'Client'] },
            title: { type: 'string' },
            description: { type: 'string' },
            owners: { type: 'array', items: { type: 'string' }, description: 'user_ids of owners (use the IDs from the team roster)' },
          },
          required: ['category', 'title'],
        },
      },
      time_allocation: {
        type: 'object',
        description: 'Map of user_id → time allocation. One entry per active team member. Items are 3-5 work areas with rough % allocations summing to ~100. If a user lacks data, infer from their role and recent activity. Add a callout when allocations look problematic (overload, scattered, etc.).',
        additionalProperties: {
          type: 'object',
          properties: {
            role: { type: 'string', description: 'Short role label, e.g. "Strategy + BD"' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  pct: { type: 'number' },
                },
                required: ['name', 'pct'],
              },
            },
            callout: { type: 'string', description: 'Optional flag — only when the allocation is genuinely worth attention (overload, conflict, etc.). Skip otherwise.' },
          },
          required: ['items'],
        },
      },
      client_health: {
        type: 'array',
        description: 'One row per active client. Phase = something like "Month 2" or "Beta" inferred from message history; lead = team member name driving delivery; this_week = one-sentence status.',
        items: {
          type: 'object',
          properties: {
            client: { type: 'string' },
            phase: { type: 'string' },
            lead: { type: 'string' },
            this_week: { type: 'string' },
          },
          required: ['client'],
        },
      },
      initiative_health: {
        type: 'array',
        description: 'Internal projects/initiatives mentioned in ops chat or self-reports (e.g. "ClickUp migration", "Reminder framework"). Status = Active / Blocked / Stale Nw (with N = weeks since last mention) / Done.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            status: { type: 'string' },
            owners: { type: 'array', items: { type: 'string' }, description: 'user_ids OR display names if no clear ID match' },
          },
          required: ['name', 'status'],
        },
      },
      coordination: {
        type: 'array',
        description: 'Cross-team coordination signals. Three types:\n  conflict — one person being pulled by multiple others; capacity issue\n  handoff — A is waiting on B to deliver before A can move\n  overlap — two people working the same thing; need a sync\nOnly include real signals from the data. Empty array is fine if nothing flags.',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['conflict', 'handoff', 'overlap'] },
            text: { type: 'string', description: 'One-sentence description of the situation' },
            people: { type: 'array', items: { type: 'string' }, description: 'user_ids of involved people' },
          },
          required: ['type', 'text'],
        },
      },
    },
    required: ['kpis', 'objectives', 'time_allocation', 'client_health', 'initiative_health', 'coordination'],
  },
};

const SYSTEM_PROMPT = `You are the synthesizer for HoloHive's weekly Priority Dashboard.

You'll be given:
  - The active team roster (with user_ids)
  - The active clients list
  - Each team member's self-report for this week (top focus, blockers, next-week)
  - Telegram chat history from internal Ops + per-client chats over the last 7 days
  - Raw counts (active clients, pipeline opps)

Your job: synthesize a single structured snapshot showing the company's
operating state this week. Call submit_dashboard EXACTLY ONCE with the
full payload.

GUIDELINES:
1. Self-reports are GROUND TRUTH — when a user says "I spent 40% of my
   time on X", weight X heavily in their time_allocation.
2. Chat messages are SECONDARY — use them to:
   - Fill gaps when a user didn't self-report
   - Detect coordination signals (conflict / handoff / overlap)
   - Identify stale initiatives (no mentions in N weeks)
   - Pull the "this week" status text for each client
3. Quality over quantity: if a section has thin data, keep it short.
   An empty coordination[] is better than fabricated tension.
4. Owner attribution: use the user_id strings from the team roster
   when assigning owners. If unclear, omit owners.
5. Tone: factual and operating-room concise. Not marketing-y. Not
   advisory. Each item should be one sentence the manager can scan.

Output is structured via the submit_dashboard tool. Do NOT reply with
plain text — the tool call is the only deliverable.`;

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

function mondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function estCharBudget(tokens: number): number {
  return Math.floor(tokens / TOKENS_PER_CHAR);
}

type ChatBucket = {
  chat: { id: string; chat_id: string; title: string | null; dashboard_role: string | null; opportunity_id: string | null; master_kol_id: string | null };
  messages: Array<{ from_user_name: string | null; text: string | null; message_date: string }>;
};

function formatChatBuckets(buckets: ChatBucket[], clientById: Map<string, string>): { text: string; truncated: number } {
  // Trim each chat to MAX_MESSAGES_PER_CHAT, then build per-chat
  // sections. If the total still busts our token budget, keep dropping
  // the OLDEST messages from the largest chat round-robin until we fit.
  let truncated = 0;
  const buckets2 = buckets.map(b => {
    const trimmed = b.messages.slice(-MAX_MESSAGES_PER_CHAT);
    truncated += b.messages.length - trimmed.length;
    return { chat: b.chat, messages: trimmed };
  });

  const formatChat = (b: ChatBucket): string => {
    const roleLabel = b.chat.dashboard_role || 'untagged';
    const linked = b.chat.opportunity_id
      ? ` (opp: ${b.chat.opportunity_id})`
      : b.chat.master_kol_id
        ? ` (kol: ${b.chat.master_kol_id})`
        : '';
    const header = `## [${roleLabel}] ${b.chat.title ?? b.chat.chat_id}${linked} — ${b.messages.length} msgs`;
    const lines = b.messages.map(m => {
      const t = (m.text || '').replace(/\s+/g, ' ').slice(0, 400);
      const date = m.message_date.slice(5, 16); // MM-DD HH:MM
      const from = m.from_user_name || 'unknown';
      return `[${date}] @${from}: ${t}`;
    });
    return [header, ...lines].join('\n');
  };

  // Keep dropping oldest messages from the largest chat until under budget.
  // This is gentler than truncating one chat to zero — preserves coverage.
  const charBudget = estCharBudget(CHAT_HISTORY_TOKEN_BUDGET);
  const buildText = () => buckets2.map(formatChat).join('\n\n');
  while (buildText().length > charBudget) {
    // Find largest chat by message count and drop one msg from its head.
    buckets2.sort((a, b) => b.messages.length - a.messages.length);
    if (buckets2[0].messages.length === 0) break;
    buckets2[0].messages.shift();
    truncated++;
  }
  return { text: buildText(), truncated };
}

// ───────────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────────

export async function generatePriorityDashboard(
  supabase: SupabaseClient,
  weekOf?: string,
): Promise<DashboardAnalysisResult> {
  const week = weekOf ?? mondayOfWeek(new Date());
  const weekStart = new Date(week + 'T00:00:00Z');
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const weekStartIso = weekStart.toISOString();
  const weekEndIso = weekEnd.toISOString();

  // ── Pull all context in parallel ──────────────────────────────────
  const [usersRes, clientsRes, oppsCountRes, selfReportsRes, taggedChatsRes] = await Promise.all([
    (supabase as any)
      .from('users')
      .select('id, name, email, role')
      .eq('is_active', true)
      .neq('role', 'guest')
      .neq('role', 'client'),
    (supabase as any)
      .from('clients')
      .select('id, name, is_active, archived_at')
      .eq('is_active', true)
      .is('archived_at', null),
    (supabase as any)
      .from('crm_opportunities')
      .select('id', { count: 'exact', head: true })
      .in('stage', ['booked', 'discovery_done', 'deal_qualified', 'proposal', 'proposal_sent', 'proposal_call', 'negotiation']),
    (supabase as any)
      .from('dashboard_self_reports')
      .select('user_id, primary_focus, blockers, next_week, notes, responded_at')
      .eq('week_of', week)
      .not('responded_at', 'is', null),
    (supabase as any)
      .from('telegram_chats')
      .select('id, chat_id, title, dashboard_role, opportunity_id, master_kol_id')
      .not('dashboard_role', 'is', null),
  ]);

  const users = (usersRes.data || []) as Array<{ id: string; name: string | null; email: string; role: string | null }>;
  const clients = (clientsRes.data || []) as Array<{ id: string; name: string }>;
  const selfReports = (selfReportsRes.data || []) as Array<any>;
  const taggedChats = (taggedChatsRes.data || []) as Array<{ id: string; chat_id: string; title: string | null; dashboard_role: string | null; opportunity_id: string | null; master_kol_id: string | null }>;
  const pipelineCount = oppsCountRes.count ?? 0;

  // ── Pull last 7d messages for tagged chats ─────────────────────────
  let chatBuckets: ChatBucket[] = [];
  let totalMessages = 0;
  if (taggedChats.length > 0) {
    const chatIds = taggedChats.map(c => c.chat_id);
    const { data: msgs } = await (supabase as any)
      .from('telegram_messages')
      .select('chat_id, from_user_name, text, message_date')
      .in('chat_id', chatIds)
      .gte('message_date', weekStartIso)
      .lt('message_date', weekEndIso)
      .order('message_date', { ascending: true });
    const messagesByChat = new Map<string, Array<{ from_user_name: string | null; text: string | null; message_date: string }>>();
    for (const m of (msgs || []) as any[]) {
      if (!messagesByChat.has(m.chat_id)) messagesByChat.set(m.chat_id, []);
      messagesByChat.get(m.chat_id)!.push(m);
      totalMessages++;
    }
    chatBuckets = taggedChats
      .map(chat => ({ chat, messages: messagesByChat.get(chat.chat_id) || [] }))
      // Drop chats with zero messages this week — they add header noise.
      .filter(b => b.messages.length > 0);
  }

  const clientById = new Map(clients.map(c => [c.id, c.name]));
  const userById = new Map(users.map(u => [u.id, u.name || u.email]));

  // ── Build prompt sections ─────────────────────────────────────────
  const teamRosterText = users
    .map(u => `  ${u.id} — ${u.name || u.email}${u.role ? ` (${u.role})` : ''}`)
    .join('\n');
  const clientsText = clients.map(c => `  ${c.name} (id: ${c.id})`).join('\n') || '  (none)';

  const selfReportsText = selfReports.length > 0
    ? selfReports.map(r => {
        const name = userById.get(r.user_id) || r.user_id;
        const focus = (r.primary_focus || []).map((f: string) => `    • ${f}`).join('\n') || '    (no focus listed)';
        const blockers = r.blockers ? `\n  Blockers: ${r.blockers}` : '';
        const nextWk = r.next_week ? `\n  Next week: ${r.next_week}` : '';
        const notes = r.notes ? `\n  Notes: ${r.notes}` : '';
        return `### ${name} (${r.user_id})\n  Focus:\n${focus}${blockers}${nextWk}${notes}`;
      }).join('\n\n')
    : '(no self-reports submitted this week)';

  const { text: chatHistoryText, truncated: truncatedMessages } = chatBuckets.length > 0
    ? formatChatBuckets(chatBuckets, clientById)
    : { text: '(no tagged chats had messages this week)', truncated: 0 };

  const userPrompt = `## TEAM ROSTER (use these user_ids when attributing owners)
${teamRosterText}

## ACTIVE CLIENTS (${clients.length})
${clientsText}

## RAW METRICS
- active_clients: ${clients.length}
- pipeline_count: ${pipelineCount}

## SELF-REPORTS (week of ${week}) — GROUND TRUTH
${selfReportsText}

## TELEGRAM CHAT HISTORY (last 7 days, tagged chats only)
${chatHistoryText}

---

Synthesize the dashboard. Call submit_dashboard with the full payload.`;

  // ── Call Claude ────────────────────────────────────────────────────
  const anthropic = getClaudeClient();
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
    tools: [submitDashboardTool as any],
    tool_choice: { type: 'tool', name: 'submit_dashboard' },
  });

  // Extract the tool input
  const toolBlock = response.content.find(
    (b: any) => b.type === 'tool_use' && b.name === 'submit_dashboard',
  ) as any;
  if (!toolBlock || !toolBlock.input) {
    throw new Error('Claude did not return a submit_dashboard tool call');
  }
  const payload = toolBlock.input as DashboardPayload;

  // Cost
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  // Sonnet 4 pricing: $3/MTok input, $15/MTok output
  const cost = (inputTokens * 3.0 + outputTokens * 15.0) / 1_000_000;

  return {
    payload,
    source_summary: {
      chats_analyzed: chatBuckets.length,
      messages_analyzed: totalMessages,
      self_reports_count: selfReports.length,
      team_members: users.length,
      clients: clients.length,
      pipeline_opps: pipelineCount,
      truncated_messages: truncatedMessages,
    },
    cost_usd: Number(cost.toFixed(4)),
    model: MODEL,
  };
}
