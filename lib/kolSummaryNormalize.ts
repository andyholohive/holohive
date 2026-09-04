/**
 * KOL blurb normalisation — English-only internal notes, plus a client-safe
 * public summary.
 *
 * [2026-09-04] Two problems, one pass:
 *
 * 1. 60 of 150 `style_summary` rows were written in Korean (the Telegram
 *    profiler reads Korean channels and answered in kind). Anyone on the team
 *    who doesn't read Korean got nothing from the field, and it leaked
 *    straight onto client-facing pages.
 *
 * 2. The same field is deliberately candid — it is profiler notes for us
 *    ("openly admits to lacking trading talent", "crime PTSD", slang quoted
 *    verbatim). Bolt flagged it reading as internal when a client opened a
 *    campaign page. Clients should see what the channel covers and who reads
 *    it, not a character assessment of the creator.
 *
 * So one model call per KOL returns both: `style_summary` translated to
 * English (tone and specifics preserved — it stays the candid internal note)
 * and a fresh `public_summary` that is neutral, positioning-focused, and safe
 * to put in front of the client whose campaign the KOL is on.
 *
 * Haiku is enough for translate-and-summarise and keeps a full roster pass
 * to a few cents.
 */

import { callClaude } from './claude';

export const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;
const HANGUL_G = /[ᄀ-ᇿ㄰-㆏가-힯]/g;

/** True when the text carries any Korean at all. */
export function hasKorean(v: unknown): boolean {
  return typeof v === 'string' && HANGUL.test(v);
}

/** Share of the string that is Hangul, 0–1. */
export function koreanRatio(v: unknown): number {
  if (typeof v !== 'string' || v.length === 0) return 0;
  return (v.match(HANGUL_G)?.length ?? 0) / v.length;
}

/**
 * Whether a string still reads as Korean prose rather than English.
 *
 * [2026-09-04] The first pass tested `hasKorean` and reverted to the original
 * whenever the translation contained any Hangul at all. That threw away 17
 * perfectly good translations, because a faithful English rendering keeps the
 * odd Korean proper noun — a channel called 뀨's Daily WEB3, a slang term
 * quoted as an example. Reverting meant storing the fully-Korean original, so
 * the guard made those rows worse than doing nothing. Density is the right
 * test: real English prose with a few Korean tokens sits under 5%, a
 * genuinely untranslated summary sits above 50%.
 */
export function isMostlyKorean(v: unknown, threshold = 0.15): boolean {
  return koreanRatio(v) > threshold;
}

export interface NormalizeInput {
  name: string;
  style_summary?: string | null;
  audience_summary?: string | null;
  brief_angle_hint?: string | null;
}

export interface NormalizeResult {
  style_summary: string | null;
  audience_summary: string | null;
  brief_angle_hint: string | null;
  public_summary: string | null;
  cost_usd: number;
}

const SYSTEM = `You normalise profile notes for crypto KOLs (Korean-market Telegram and X creators) held in a marketing CRM.

You are given a KOL's internal profiler notes, which may be written in Korean, in English, or in a mix.

Return STRICT JSON only — no prose, no markdown fence — with exactly these keys:
{
  "style_summary": string | null,
  "audience_summary": string | null,
  "brief_angle_hint": string | null,
  "public_summary": string
}

Rules for the three internal fields (style_summary, audience_summary, brief_angle_hint):
- These stay INTERNAL notes. Preserve the original meaning, specifics, tone and candour exactly — including blunt observations, self-deprecation, and named tickers or events.
- Translate into natural English. Never return Korean script. If a Korean slang term matters, render its meaning in English; you may keep a romanised term where it is a proper noun (e.g. Upbit, Bithumb).
- If an input field is null or empty, return null for it. If it is already fully English, return it unchanged.

Rules for public_summary — this one is shown to the PAYING CLIENT on a campaign page, beside the KOL we are recommending:
- 2 to 3 sentences, English, neutral professional tone. Describe what the channel covers, the format of its posts, and who reads it.
- It is a positioning description, not an endorsement and not a critique.
- NEVER include: judgements of the creator's competence or track record, trading losses or wins, self-deprecation, mental health references, profanity or slang, mockery of projects or exchanges, political content, or anything that reads as gossip.
- Do not name the creator's personal failings or personal life. Do not quote their slang.
- Write it so the KOL themselves and the client could both read it without objection.`;

function stripFence(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

export async function normalizeKolSummaries(input: NormalizeInput): Promise<NormalizeResult> {
  const userPrompt = JSON.stringify({
    kol_name: input.name,
    style_summary: input.style_summary ?? null,
    audience_summary: input.audience_summary ?? null,
    brief_angle_hint: input.brief_angle_hint ?? null,
  }, null, 2);

  const res = await callClaude([SYSTEM], userPrompt, {
    model: 'claude-haiku-4-5',
    maxTokens: 1600,
    temperature: 0.2,
  });

  let parsed: any;
  try {
    parsed = JSON.parse(stripFence(res.content));
  } catch {
    throw new Error('model did not return JSON');
  }

  const text = (v: unknown): string | null => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t ? t : null;
  };

  // Only reject a translation that is still Korean prose — see
  // isMostlyKorean for why presence alone is the wrong test.
  const guard = (translated: string | null, original: string | null | undefined): string | null => {
    if (translated && isMostlyKorean(translated)) return original ?? null;
    return translated ?? (original ?? null);
  };

  const publicSummary = text(parsed.public_summary);

  return {
    style_summary: guard(text(parsed.style_summary), input.style_summary),
    audience_summary: guard(text(parsed.audience_summary), input.audience_summary),
    brief_angle_hint: guard(text(parsed.brief_angle_hint), input.brief_angle_hint),
    // The client-facing blurb has no excuse for Korean at all beyond a proper
    // noun, and there is no original to fall back to.
    public_summary: publicSummary && !isMostlyKorean(publicSummary, 0.05) ? publicSummary : null,
    cost_usd: res.cost_usd,
  };
}
