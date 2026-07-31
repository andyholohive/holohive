import Anthropic from '@anthropic-ai/sdk';
import { priceUsage } from './claudeCost';

// ============================================
// Claude API Client
// Lazy singleton pattern matching agentOrchestrator.ts
// ============================================

let client: Anthropic | null = null;

export function getClaudeClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

// ============================================
// Types
// ============================================

export interface ClaudeResponse {
  content: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  cost_usd: number;
  stop_reason: string | null;
}

export interface ClaudeToolResult {
  finalContent: string;
  toolResults: {
    toolName: string;
    toolInput: Record<string, unknown>;
    result: unknown;
  }[];
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  cost_usd: number;
}

// [2026-06-16] Adding current Claude 4.x family. Legacy 20250514 IDs
// retire 2026-06-15 — kept in the union as transitional callers
// upgrade, but they should not be used for new code.
export type ClaudeModel =
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-8'
  | 'claude-haiku-4-5'
  | 'claude-sonnet-4-20250514'  // deprecated, retires 2026-06-15
  | 'claude-opus-4-20250514'    // deprecated, retires 2026-06-15
  | 'claude-haiku-4-5-20251001';

// [2026-07-31] Pricing moved to lib/claudeCost.ts so there is exactly one
// table. There used to be two — this map, and a private `estimateCost` inside
// the Discovery scan route — and they disagreed about which models exist. The
// audit that found the July overspend is documented at the top of that file.
//
// The old map also had no entry for `claude-sonnet-4-5`, which is the model
// Discovery passes and the one the usage dashboard shows as dominant. The
// lookup returned undefined and the next line read `.input` off it.

// ============================================
// Simple completion (no tools)
// ============================================

export async function callClaude(
  systemPrompts: string[],
  userPrompt: string,
  options?: {
    model?: ClaudeModel;
    maxTokens?: number;
    temperature?: number;
  }
): Promise<ClaudeResponse> {
  const claude = getClaudeClient();
  const model = options?.model ?? 'claude-sonnet-4-6';

  const response = await claude.messages.create({
    model,
    max_tokens: options?.maxTokens ?? 4096,
    temperature: options?.temperature ?? 0.3,
    system: systemPrompts.map((text) => ({ type: 'text' as const, text })),
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  return {
    content,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
    // priceUsage reads the whole usage object, so cache reads/writes and any
    // server-tool requests are counted. The old call passed only the two plain
    // token counts and silently dropped the rest.
    cost_usd: priceUsage(model, response.usage).cost_usd,
    stop_reason: response.stop_reason,
  };
}

// ============================================
// Completion with tools (handles tool_use loop)
// ============================================

export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
}

export async function callClaudeWithTools(
  systemPrompts: string[],
  userPrompt: string,
  tools: ClaudeTool[],
  options?: {
    model?: ClaudeModel;
    maxTokens?: number;
    temperature?: number;
    maxSteps?: number;
  }
): Promise<ClaudeToolResult> {
  const claude = getClaudeClient();
  const model = options?.model ?? 'claude-sonnet-4-6';
  const maxSteps = options?.maxSteps ?? 10;

  const toolDefinitions = tools.map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));

  const toolResults: ClaudeToolResult['toolResults'] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  // Priced per turn and summed. Every turn re-sends the whole accumulated
  // transcript, so in a long tool loop the later turns dominate the bill —
  // pricing only the final response understates it badly.
  let totalCostUsd = 0;
  let finalContent = '';

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userPrompt },
  ];

  for (let step = 0; step < maxSteps; step++) {
    const response = await claude.messages.create({
      model,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0.3,
      system: systemPrompts.map((text) => ({ type: 'text' as const, text })),
      messages,
      tools: toolDefinitions as Anthropic.ToolUnion[],
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;
    totalCostUsd += priceUsage(model, response.usage).cost_usd;

    // If no tool use, extract final text and break
    if (response.stop_reason !== 'tool_use') {
      finalContent = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n');
      break;
    }

    // Process tool calls
    const assistantContent = response.content;
    messages.push({ role: 'assistant', content: assistantContent });

    const toolUseBlocks = assistantContent.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      const tool = tools.find((t) => t.name === toolUse.name);
      if (!tool) {
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `Error: Unknown tool "${toolUse.name}"`,
          is_error: true,
        });
        continue;
      }

      try {
        const result = await tool.execute(toolUse.input as Record<string, unknown>);
        toolResults.push({
          toolName: toolUse.name,
          toolInput: toolUse.input as Record<string, unknown>,
          result,
        });
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        });
      } catch (error) {
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          is_error: true,
        });
      }
    }

    messages.push({ role: 'user', content: toolResultBlocks });

    // Also extract any text from this response
    const textContent = assistantContent
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    if (textContent) {
      finalContent = textContent;
    }
  }

  return {
    finalContent,
    toolResults,
    usage: {
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
    },
    cost_usd: totalCostUsd,
  };
}
