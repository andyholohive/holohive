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

export async function grokChatCompletion(req: GrokRequest): Promise<GrokResponse> {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) {
    throw new GrokError('GROK_API_KEY env var not set. Add it to use Grok.', 500);
  }

  const body: any = {
    model: req.model ?? 'grok-4',
    messages: req.messages,
    temperature: req.temperature ?? 0.2,
    max_tokens: req.max_tokens ?? 4000,
  };
  if (req.tools) {
    body.tools = req.tools;
  }

  const res = await fetch(`${GROK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new GrokError(
      `Grok API ${res.status}: ${res.statusText} — ${errText.slice(0, 300)}`,
      res.status,
      errText,
    );
  }

  return res.json();
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
