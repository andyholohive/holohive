/**
 * xAI Grok client wrapper.
 *
 * Grok (grok-4) is the only LLM with native live X read access. We use it
 * for the Discovery "Deep Dive X" feature to analyze a POC's recent X
 * activity for Korea / Asia relevance signals.
 *
 * Setup: set GROK_API_KEY env var (from https://x.ai/api).
 *
 * API docs: https://docs.x.ai/api
 */

const GROK_BASE_URL = 'https://api.x.ai/v1';

export interface GrokMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * xAI Agent Tools (per https://docs.x.ai/docs/guides/tools/overview).
 * Built-in server-side tools are declared as simple type markers.
 *
 * Date-range filtering is NOT a built-in option — enforce via prompt
 * (tell Grok "only consider posts from <date> onward") and via a
 * server-side post-filter when writing signals.
 */
export type GrokBuiltInTool =
  | { type: 'x_search' }
  | { type: 'web_search' }
  | { type: 'code_interpreter' };

export interface GrokRequest {
  model?: string;                    // default 'grok-4'
  messages: GrokMessage[];
  temperature?: number;
  max_tokens?: number;
  tools?: GrokBuiltInTool[];
}

export interface GrokResponse {
  id: string;
  choices: Array<{
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    num_sources_used?: number;
  };
}

export class GrokError extends Error {
  constructor(message: string, public status?: number, public raw?: any) {
    super(message);
    this.name = 'GrokError';
  }
}

/**
 * Calls xAI's /v1/responses endpoint (the Agent Tools API). Chat Completions
 * live search was deprecated in 2026 — `/v1/responses` is the new path with
 * built-in tools like `x_search`, `web_search`, `code_interpreter`.
 *
 * We preserve the OpenAI-style public interface (messages in, choices out)
 * by translating in this wrapper:
 *   messages[role=system].content → `instructions`
 *   messages[role=user|assistant] → `input` array
 *   response.output[].content[type=output_text].text → choices[0].message.content
 *   response.usage.input_tokens / output_tokens → prompt_tokens / completion_tokens
 */
export async function grokChatCompletion(req: GrokRequest): Promise<GrokResponse> {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) {
    throw new GrokError('GROK_API_KEY env var not set. Add it to use Grok.', 500);
  }

  // Split the system prompt out (responses API uses `instructions`).
  const systemMessages = req.messages.filter(m => m.role === 'system').map(m => m.content);
  const nonSystem = req.messages.filter(m => m.role !== 'system');

  const body: any = {
    model: req.model ?? 'grok-4',
    input: nonSystem.map(m => ({ role: m.role, content: m.content })),
    temperature: req.temperature ?? 0.2,
    max_output_tokens: req.max_tokens ?? 4000,
  };
  if (systemMessages.length > 0) {
    body.instructions = systemMessages.join('\n\n');
  }
  if (req.tools) {
    body.tools = req.tools;
  }

  const res = await fetch(`${GROK_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    // 4 min ceiling — agent-tool chains (x_search + web_search) can legitimately
    // take 2-3 min, but anything longer means Grok's in a search loop and we
    // should fail fast so the dev server isn't blocked.
    signal: AbortSignal.timeout(240_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new GrokError(
      `Grok API ${res.status}: ${res.statusText} — ${errText.slice(0, 300)}`,
      res.status,
      errText,
    );
  }

  const raw: any = await res.json();

  // Normalize the /v1/responses shape into our legacy chat-completions shape.
  // The response.output is an array of items; we want the first `message` item
  // and concatenate all `output_text` content blocks (ignore reasoning blocks).
  let assistantText = '';
  const finishReason = raw.status ?? 'stop';
  const outputArr: any[] = Array.isArray(raw.output) ? raw.output : [];
  for (const item of outputArr) {
    if (item?.type !== 'message') continue;
    const content: any[] = Array.isArray(item.content) ? item.content : [];
    for (const block of content) {
      if (block?.type === 'output_text' && typeof block.text === 'string') {
        assistantText += block.text;
      }
    }
  }
  // Fallback: some SDKs expose a convenience `output_text` at the top level.
  if (!assistantText && typeof raw.output_text === 'string') {
    assistantText = raw.output_text;
  }

  const usage = raw.usage || {};
  return {
    id: raw.id ?? '',
    choices: [
      {
        message: { role: 'assistant', content: assistantText },
        finish_reason: finishReason,
      },
    ],
    usage: {
      prompt_tokens: usage.input_tokens ?? 0,
      completion_tokens: usage.output_tokens ?? 0,
      total_tokens: usage.total_tokens ?? ((usage.input_tokens ?? 0) + (usage.output_tokens ?? 0)),
      num_sources_used: usage.num_sources_used,
    },
  };
}

/**
 * Grok pricing (rough, per 1M tokens — update as xAI changes tiers):
 *   grok-4 input:  $3
 *   grok-4 output: $15
 *   live search: ~$0.005 per search result returned
 */
export function estimateGrokCost(
  inputTokens: number,
  outputTokens: number,
  sourcesUsed: number = 0,
): number {
  return (inputTokens / 1_000_000) * 3
       + (outputTokens / 1_000_000) * 15
       + sourcesUsed * 0.005;
}

/**
 * Extracts the first balanced JSON object from a string. Robust to Grok
 * occasionally wrapping JSON in ```json fences or adding a short preamble.
 */
export function extractJson(text: string): any | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;
  try {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}
