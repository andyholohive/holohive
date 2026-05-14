import { getClaudeClient } from './claude';

/**
 * Parse a free-form /task message into structured task fields.
 *
 * Uses Claude with a forced tool call as a structured-output mechanism
 * — we define one tool ("submit_task"), force the model to use it, and
 * inspect the tool input. Cleaner than asking Claude to return JSON
 * and re-parsing, and more reliable since the SDK validates the input
 * against our schema before returning.
 *
 * The assignee is NOT parsed by Claude — it's pre-resolved from the
 * Telegram message entities by telegramAssigneeResolver. We pass the
 * resolved assignee in only as context (so Claude knows whose name to
 * mention in any clarification text). This separates the deterministic
 * problem (handle → user.id) from the fuzzy one (free text → fields).
 *
 * Date handling: we hand Claude today's date in KST (the team is
 * Korea-focused) so it can resolve "Friday" → an actual YYYY-MM-DD.
 *
 * Returns the parsed task plus a `clarification_needed` field that
 * signals whether the preview should ask the user for more info before
 * the ✅ Create button works. v1 always offers Create — clarification
 * just shows a hint in the preview.
 */
export interface ParsedTask {
  task_name: string;
  due_date: string | null;             // YYYY-MM-DD or null
  why: string | null;                  // Business reason (Context Protocol field 2)
  good_looks_like: string | null;      // Reference (Context Protocol field 3)
  description: string | null;          // Combined long-form notes if any
  clarification_needed: string | null; // Human-readable hint of what's missing/ambiguous
}

export interface ParseTaskInput {
  /** The raw message text after the /task command (just the body). */
  body: string;
  /** Pre-resolved assignee from message entities, if any. */
  assignee?: { user_id: string; name: string } | null;
  /** Available team members — gives Claude context for clarification text. */
  teamMembers: Array<{ id: string; name: string; telegram_username: string | null }>;
}

const SUBMIT_TASK_TOOL = {
  name: 'submit_task',
  description:
    "Submit the parsed task fields. Always call this exactly once with your best extraction of the user's intent.",
  input_schema: {
    type: 'object' as const,
    properties: {
      task_name: {
        type: 'string',
        description:
          'Short, action-oriented task title. Imperative mood ("Write OST recap brief", not "OST recap brief is needed"). Strip @-mentions and dates from the title — those go in their own fields.',
      },
      due_date: {
        type: ['string', 'null'],
        description:
          'YYYY-MM-DD if the user specified a deadline (relative or absolute). NULL if no deadline mentioned. Resolve relative dates (e.g. "Friday", "next week") against today\'s date in KST.',
      },
      why: {
        type: ['string', 'null'],
        description:
          'The business reason or downstream use, if mentioned. Examples: "Goes into Thursday client pitch", "Needed for Robonet expansion decision". NULL if no rationale given.',
      },
      good_looks_like: {
        type: ['string', 'null'],
        description:
          'Reference to a similar past deliverable, if mentioned. Examples: "Like Fogo Week 1 brief", "Same format as last month\'s OST report". NULL if no reference.',
      },
      description: {
        type: ['string', 'null'],
        description:
          'Any additional context that didn\'t fit the other fields — extra requirements, scope notes, etc. NULL if there\'s nothing left to say after task_name/why/good_looks_like.',
      },
      clarification_needed: {
        type: ['string', 'null'],
        description:
          'If something critical is ambiguous (e.g. no assignee was tagged, deadline is unclear, or the request is too vague to act on), a short human-readable note about what to clarify. NULL if the parse is confident.',
      },
    },
    required: [
      'task_name',
      'due_date',
      'why',
      'good_looks_like',
      'description',
      'clarification_needed',
    ],
  },
};

export async function parseTaskFromText(input: ParseTaskInput): Promise<ParsedTask> {
  const claude = getClaudeClient();

  // KST = UTC+9. We don't pull from Intl since the Vercel runtime is
  // UTC; build the KST date manually so "today" is unambiguous.
  const nowUtcMs = Date.now();
  const kstNow = new Date(nowUtcMs + 9 * 60 * 60 * 1000);
  const todayKst = kstNow.toISOString().slice(0, 10);
  const dayOfWeekKst = kstNow.toLocaleDateString('en-US', { weekday: 'long' });

  const teamRoster = input.teamMembers
    .map(m => `- ${m.name}${m.telegram_username ? ` (@${m.telegram_username})` : ''}`)
    .join('\n');

  const assigneeNote = input.assignee
    ? `Assignee already resolved from @-mention: ${input.assignee.name}. Don't extract assignee — it's handled.`
    : 'No assignee was @-tagged. Set clarification_needed to flag that the creator should re-send with @<person> tagged, unless the message clearly delegates to a specific named person on the team (in which case still flag — we want explicit @-tagging).';

  const systemPrompt = `You parse free-form task delegation messages from a crypto KOL agency's Telegram into structured task fields.

Today is ${todayKst} (${dayOfWeekKst}) in KST. The team operates on Korea time — resolve any relative dates against this.

Team members:
${teamRoster}

${assigneeNote}

The team uses a "Context Protocol" for delegations — every task should have:
  WHAT (task_name)        — the concrete deliverable
  WHY (why)               — business reason / downstream use
  GOOD LOOKS LIKE (good_looks_like) — reference to a similar past deliverable
  WHEN (due_date)         — specific deadline

You are filling those four fields plus an optional description. Be conservative — if the user didn't say WHY or GOOD LOOKS LIKE, leave those NULL rather than inventing them.

Always call the submit_task tool exactly once. Don't ask questions; if something is unclear, fill what you can and note the gap in clarification_needed.`;

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    temperature: 0.2,
    system: systemPrompt,
    tools: [SUBMIT_TASK_TOOL],
    tool_choice: { type: 'tool', name: 'submit_task' },
    messages: [{ role: 'user', content: input.body }],
  });

  // Forced tool use → response.content has exactly one tool_use block.
  const toolUse = response.content.find((b: any) => b.type === 'tool_use') as
    | { type: 'tool_use'; name: string; input: any }
    | undefined;

  if (!toolUse) {
    throw new Error('Claude did not call submit_task — model misbehaved or schema mismatch');
  }

  const parsed = toolUse.input as ParsedTask;

  // Belt-and-suspenders normalization. Schema says fields are required
  // but the SDK doesn't enforce nullability of "string|null" union types
  // at runtime, and Claude occasionally omits a field entirely. Coerce
  // missing → null so downstream code doesn't have to ?? everywhere.
  return {
    task_name: parsed.task_name?.trim() || '(untitled task)',
    due_date: parsed.due_date || null,
    why: parsed.why || null,
    good_looks_like: parsed.good_looks_like || null,
    description: parsed.description || null,
    clarification_needed: parsed.clarification_needed || null,
  };
}
