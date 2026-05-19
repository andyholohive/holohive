import { getClaudeClient } from './claude';

/**
 * Parse a multi-task, multi-client batch message from /bulk into a
 * structured list of pending tasks.
 *
 * Why a dedicated parser instead of looping single /task calls:
 *   - One Claude call vs N — much cheaper and faster
 *   - Cross-row context: Claude can see the whole batch and resolve
 *     ambiguities (e.g. a date range on one line) consistently
 *   - One preview UI to confirm/cancel the whole batch atomically
 *
 * Resolution split (same pattern as the single /task parser, just
 * fan-out across many lines):
 *   - @-mentions: pre-resolved DETERMINISTICALLY before the Claude
 *     call. We pass Claude a {handle → user_id, user_name} map and it
 *     references handles in its output. Anything Claude can't
 *     resolve becomes an `issue` with severity='warn'.
 *   - Client names: same idea. Pre-loaded list of {id, name} passed
 *     to Claude; we ask it to pick the best match or NULL.
 *   - Dates: Claude resolves "May 19" / "May 20-21" / etc. against
 *     today's KST date. Date ranges → use the LATER date for due
 *     (when the task should be done by). Already-passed dates kept
 *     as-is (back-dated work is sometimes intentional).
 *   - ✅ markers: Claude flags is_complete=true. Callback SKIPS those
 *     at insert time so they don't pollute the active list.
 */

export interface ParsedBulkTask {
  task_name: string;
  due_date: string | null;
  /** users.id of the primary assignee — first @-mention on the line. */
  primary_assignee_id: string | null;
  /** Human-readable name for the preview, even when id resolution failed. */
  primary_assignee_name: string | null;
  /** Additional @-mentions on the same line. Gets appended to the
   *  task's description as a "Co-owners: ..." footer because tasks
   *  has no co_owner_ids array. Strings, not user_ids, to preserve
   *  unresolved handles for visibility. */
  co_owner_handles: string[];
  /** ✅ marker in the input — signals "already done", skip at insert. */
  is_complete: boolean;
  /** Anything from the source line that didn't fit task_name. */
  notes: string | null;
}

export interface ParsedBulkSection {
  /** Verbatim header from the input (e.g. "Fogo"). */
  client_name: string;
  /** Resolved clients.id, or null if no match. */
  client_id: string | null;
  tasks: ParsedBulkTask[];
}

export interface ParsedBulkIssue {
  severity: 'warn' | 'error';
  message: string;
}

export interface ParsedBulk {
  sections: ParsedBulkSection[];
  issues: ParsedBulkIssue[];
}

export interface BulkParseInput {
  body: string;
  /** Preloaded team roster — {handle → user_id, user_name} map.
   *  Handles are lower-cased; the prompt instructs Claude to match
   *  case-insensitively. */
  teamMembers: Array<{ id: string; name: string; telegram_username: string | null }>;
  /** Preloaded client list — name+id pairs for fuzzy matching. */
  clients: Array<{ id: string; name: string }>;
}

const SUBMIT_BULK_TOOL = {
  name: 'submit_bulk_tasks',
  description:
    "Submit the parsed batch of tasks grouped by client section. Always call this exactly once. If the input has parsing issues (unresolvable @-mentions, ambiguous client names, etc.), include them in the issues array — don't bail out, partial parses are still useful.",
  input_schema: {
    type: 'object' as const,
    properties: {
      sections: {
        type: 'array',
        description:
          'One entry per client section in the input. Section headers are usually short lines (no bullet, no date) — typically just a client/project name.',
        items: {
          type: 'object',
          properties: {
            client_name: {
              type: 'string',
              description: 'The section header verbatim (e.g. "Fogo", "Venice", "Altura").',
            },
            client_id: {
              type: ['string', 'null'],
              description:
                'Best-match clients.id from the provided clients list. Use NULL if no reasonable match (will be flagged as an issue). Match case-insensitively and tolerate suffixes like "Labs", "Inc", etc.',
            },
            tasks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  task_name: {
                    type: 'string',
                    description:
                      'Short, action-oriented task title. Strip the date, @-mentions, and trailing ✅ from the source line — those go in their own fields.',
                  },
                  due_date: {
                    type: ['string', 'null'],
                    description:
                      'YYYY-MM-DD. For date ranges like "May 20-21", use the LATER date (when work should be DONE BY). NULL only if no date is parseable.',
                  },
                  primary_assignee_handle: {
                    type: ['string', 'null'],
                    description:
                      'The FIRST @-mention on the line, without the @ prefix. Match against the team roster case-insensitively. NULL if no @-mention on the line.',
                  },
                  co_owner_handles: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                      'All @-mentions AFTER the first on the same line, without @ prefix. Empty array if only one @-mention. Used to populate a "Co-owners: ..." footer in the task description.',
                  },
                  is_complete: {
                    type: 'boolean',
                    description:
                      'TRUE if the source line ends with a ✅ or otherwise indicates the task is already done. Tasks marked complete are SKIPPED at insert.',
                  },
                  notes: {
                    type: ['string', 'null'],
                    description:
                      'Any context from the source line that didn\'t fit task_name (clarifications, sub-bullets, etc.). NULL if nothing extra.',
                  },
                },
                required: [
                  'task_name',
                  'due_date',
                  'primary_assignee_handle',
                  'co_owner_handles',
                  'is_complete',
                  'notes',
                ],
              },
            },
          },
          required: ['client_name', 'client_id', 'tasks'],
        },
      },
      issues: {
        type: 'array',
        description:
          'Per-batch warnings or errors — unresolvable @-mentions, unmatched client names, ambiguous dates, etc. Use severity="warn" when the task is still creatable, "error" when it isn\'t.',
        items: {
          type: 'object',
          properties: {
            severity: { type: 'string', enum: ['warn', 'error'] },
            message: { type: 'string' },
          },
          required: ['severity', 'message'],
        },
      },
    },
    required: ['sections', 'issues'],
  },
};

export async function parseBulkTasks(input: BulkParseInput): Promise<ParsedBulk> {
  const claude = getClaudeClient();

  // KST date for "today" — same logic as the single /task parser.
  // The team operates on Korea time; relative dates ("Friday") resolve
  // against this.
  const nowUtcMs = Date.now();
  const kstNow = new Date(nowUtcMs + 9 * 60 * 60 * 1000);
  const todayKst = kstNow.toISOString().slice(0, 10);
  const dayOfWeekKst = kstNow.toLocaleDateString('en-US', { weekday: 'long' });

  const teamRoster = input.teamMembers
    .filter(m => m.telegram_username) // skip people without an @-handle
    .map(m => `- @${m.telegram_username} → ${m.name}`)
    .join('\n');

  const clientRoster = input.clients
    .map(c => `- ${c.name} (id: ${c.id})`)
    .join('\n');

  const systemPrompt = `You parse multi-task, multi-client batch messages from a Korean crypto KOL agency's Telegram chat into structured task data.

Today is ${todayKst} (${dayOfWeekKst}) in KST. Resolve all relative dates against this. The team operates on Korea time.

Input structure (loose, expect variation):
  - Section headers (typically short, no bullet, no date) = client name
  - Bullet lines under each section = tasks for that client
  - Each task line typically has: date - @assignee(s) - description ✅?

Team members (use these to resolve @-mentions case-insensitively):
${teamRoster}

Clients (match section headers to these case-insensitively, tolerate suffixes):
${clientRoster}

Rules:
  - Section header → match to a client.id. If no match, set client_id=null AND add an issue with severity='warn'.
  - First @-mention on a task line = primary_assignee. Remaining @-mentions = co_owner_handles.
  - Strip date and @-mentions from task_name. Keep it action-oriented.
  - Date ranges (e.g. "May 20-21") → use the LATER date for due_date.
  - ✅ markers → set is_complete=true. Don't pretend the task isn't there; just mark it.
  - If a handle doesn't match the roster, leave it in primary_assignee_handle / co_owner_handles AS-TYPED and add a warn issue ("Unresolved mention: @typo").
  - Always call submit_bulk_tasks exactly once. Never ask questions or skip the call.`;

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    temperature: 0.2,
    system: systemPrompt,
    tools: [SUBMIT_BULK_TOOL],
    tool_choice: { type: 'tool', name: 'submit_bulk_tasks' },
    messages: [{ role: 'user', content: input.body }],
  });

  const toolUse = response.content.find((b: any) => b.type === 'tool_use') as
    | { type: 'tool_use'; name: string; input: any }
    | undefined;
  if (!toolUse) {
    throw new Error('Claude did not call submit_bulk_tasks');
  }

  const raw = toolUse.input as {
    sections: Array<{
      client_name: string;
      client_id: string | null;
      tasks: Array<{
        task_name: string;
        due_date: string | null;
        primary_assignee_handle: string | null;
        co_owner_handles: string[];
        is_complete: boolean;
        notes: string | null;
      }>;
    }>;
    issues: ParsedBulkIssue[];
  };

  // Post-process: resolve handles → user_id + name using the roster
  // map. Claude already knows the mapping (we passed it in the
  // system prompt) but doing the resolution client-side guarantees
  // we never trust Claude to invent user IDs.
  const handleToUser = new Map<string, { id: string; name: string }>();
  for (const m of input.teamMembers) {
    if (m.telegram_username) {
      handleToUser.set(m.telegram_username.toLowerCase(), { id: m.id, name: m.name });
    }
  }

  const sections: ParsedBulkSection[] = (raw.sections || []).map(s => ({
    client_name: s.client_name,
    client_id: s.client_id,
    tasks: (s.tasks || []).map(t => {
      const handle = t.primary_assignee_handle?.toLowerCase().replace(/^@/, '') || null;
      const resolved = handle ? handleToUser.get(handle) : null;
      return {
        task_name: t.task_name?.trim() || '(untitled task)',
        due_date: t.due_date || null,
        primary_assignee_id: resolved?.id || null,
        primary_assignee_name: resolved?.name || (handle ? `@${handle}` : null),
        co_owner_handles: (t.co_owner_handles || []).map(h => h.replace(/^@/, '')),
        is_complete: !!t.is_complete,
        notes: t.notes?.trim() || null,
      };
    }),
  }));

  return {
    sections,
    issues: raw.issues || [],
  };
}
