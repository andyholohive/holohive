/**
 * Single source of truth for what a Claude call actually cost.
 *
 * [2026-07-31] Written after a spend audit. July's API bill was $79.24 while
 * `agent_runs` reported $5.86 — a 13x gap. Three separate under-counts caused
 * it, and all three are fixed here:
 *
 *   1. `lib/claude.ts` priced from a map that had no entry for the model
 *      Discovery actually uses (`claude-sonnet-4-5`). `MODEL_PRICING[model]`
 *      returned undefined and the next line dereferenced `.input` on it.
 *   2. Both pricers counted only `input_tokens` + `output_tokens`. Cache reads
 *      and cache writes are billed separately and were invisible.
 *   3. Nothing anywhere priced server-side tool use. The console showed 1,368
 *      web searches in July — about $13.68 — that no counter in this repo
 *      could see.
 *
 * The console's July split was 44.9M tokens in against 0.5M out. An 87:1 ratio
 * is the signature of an agentic search loop re-sending its accumulated context
 * each turn, so getting the input side right is most of the job.
 */

/** Per-million-token rates. Keep in sync with platform.claude.com/docs/en/pricing. */
export interface ModelRate {
  input: number;
  output: number;
}

/**
 * Aliases AND dated IDs both need entries: callers pass the alias
 * (`claude-sonnet-4-5`) but the usage dashboard reports the resolved dated form
 * (`claude-sonnet-4-5-20250929`). Pricing one and not the other is how a model
 * goes unpriced.
 */
export const MODEL_RATES: Record<string, ModelRate> = {
  'claude-opus-4-8': { input: 5.0, output: 25.0 },
  'claude-opus-4-7': { input: 5.0, output: 25.0 },
  'claude-opus-4-6': { input: 5.0, output: 25.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-5-20250929': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
  // Deprecated, retired 2026-06-15. Priced so historical rows stay readable.
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-opus-4-20250514': { input: 15.0, output: 75.0 },
};

/**
 * Unknown models bill at the most expensive rate we know about, not zero.
 *
 * This direction is deliberate. The old code effectively priced an unknown
 * model at nothing, which meant a spend cap computed from it could never trip.
 * Over-stating an unknown model makes a cap fire early and loudly; understating
 * makes it fail open and silent. Early and loud is the recoverable failure.
 */
const UNKNOWN_MODEL_RATE: ModelRate = { input: 15.0, output: 75.0 };

/** Cache reads bill at 10% of base input; cache writes at 125%. */
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

/** Server-side web search, per request. */
const WEB_SEARCH_USD_PER_REQUEST = 10 / 1000;

const warnedModels = new Set<string>();

export function rateFor(model: string): ModelRate {
  const rate = MODEL_RATES[model];
  if (rate) return rate;
  // Warn once per model per process — an unpriced model is a real bug, but a
  // log line per call would drown the function logs.
  if (!warnedModels.has(model)) {
    warnedModels.add(model);
    console.warn(
      `[claudeCost] No pricing entry for "${model}". Billing it at the ` +
      `most expensive known rate so spend caps stay conservative. ` +
      `Add it to MODEL_RATES in lib/claudeCost.ts.`,
    );
  }
  return UNKNOWN_MODEL_RATE;
}

/**
 * The shape we care about from the SDK's usage object. Declared structurally
 * rather than importing Anthropic's type so both the TS callers and the
 * hand-rolled raw-SDK routes can pass what they have.
 */
export interface ClaudeUsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
}

export interface PricedUsage {
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  web_searches: number;
  /** Cost attributable to web search alone — the line item nothing used to show. */
  web_search_usd: number;
  model: string;
  /** True when the model had no pricing entry and fell back. Surface this. */
  estimated: boolean;
}

/**
 * Price one Claude response. Accepts the raw SDK `usage` object.
 *
 * Callers that loop (tool-use turns they drive themselves) should call this per
 * turn and sum, or accumulate usage and call once — both give the same answer
 * because every field here is additive.
 */
export function priceUsage(model: string, usage: ClaudeUsageLike | null | undefined): PricedUsage {
  const rate = rateFor(model);
  const estimated = !MODEL_RATES[model];

  const input = Math.max(0, usage?.input_tokens ?? 0);
  const output = Math.max(0, usage?.output_tokens ?? 0);
  const cacheRead = Math.max(0, usage?.cache_read_input_tokens ?? 0);
  const cacheWrite = Math.max(0, usage?.cache_creation_input_tokens ?? 0);
  const searches = Math.max(0, usage?.server_tool_use?.web_search_requests ?? 0);

  const webSearchUsd = searches * WEB_SEARCH_USD_PER_REQUEST;

  const tokenUsd =
    (input * rate.input +
      cacheRead * rate.input * CACHE_READ_MULTIPLIER +
      cacheWrite * rate.input * CACHE_WRITE_MULTIPLIER +
      output * rate.output) /
    1_000_000;

  return {
    cost_usd: tokenUsd + webSearchUsd,
    input_tokens: input,
    output_tokens: output,
    cache_read_tokens: cacheRead,
    cache_write_tokens: cacheWrite,
    web_searches: searches,
    web_search_usd: webSearchUsd,
    model,
    estimated,
  };
}

/** Sum priced usages — for multi-call stages that report one figure. */
export function sumPriced(parts: PricedUsage[]): Omit<PricedUsage, 'model' | 'estimated'> & {
  model: string;
  estimated: boolean;
} {
  return parts.reduce<ReturnType<typeof sumPriced>>(
    (acc, p) => ({
      cost_usd: acc.cost_usd + p.cost_usd,
      input_tokens: acc.input_tokens + p.input_tokens,
      output_tokens: acc.output_tokens + p.output_tokens,
      cache_read_tokens: acc.cache_read_tokens + p.cache_read_tokens,
      cache_write_tokens: acc.cache_write_tokens + p.cache_write_tokens,
      web_searches: acc.web_searches + p.web_searches,
      web_search_usd: acc.web_search_usd + p.web_search_usd,
      model: p.model || acc.model,
      estimated: acc.estimated || p.estimated,
    }),
    {
      cost_usd: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      web_searches: 0,
      web_search_usd: 0,
      model: '',
      estimated: false,
    },
  );
}
