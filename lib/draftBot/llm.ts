import { getClaudeClient } from '@/lib/claude';

/**
 * LLM calls for /draft: the English gloss, the per-client rule check and the
 * Korean change note. Same model the bot's task parser already uses; it reads
 * images, which the gloss needs for screenshot drafts.
 */
const MODEL = 'claude-sonnet-4-6';

export interface LintFlag { rule: string; span: string; severity: 'high' | 'medium' | 'low' }
export interface DraftImage { base64: string; mediaType: string }

function textOf(res: any): string {
  return ((res?.content ?? []) as any[]).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}

function firstJson(text: string, open: '{' | '['): any {
  const close = open === '{' ? '}' : ']';
  const a = text.indexOf(open); const b = text.lastIndexOf(close);
  if (a === -1 || b <= a) throw new Error('no JSON in model output');
  return JSON.parse(text.slice(a, b + 1));
}

/**
 * Plain English read of the draft. For images, also returns the text read out
 * of the image so the rule check has something to match against.
 */
export async function glossDraft(input: { text: string | null; images: DraftImage[] }): Promise<{ english: string; transcript: string }> {
  const content: any[] = [];
  for (const img of input.images.slice(0, 4)) {
    content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } });
  }
  content.push({
    type: 'text',
    text: [
      'This is a draft social post from a Korean crypto creator, sent for review before posting.',
      input.text ? `Draft text:\n"""\n${input.text}\n"""` : 'The draft is in the attached image(s).',
      '',
      'Return JSON only: {"transcript": string, "english": string}.',
      '"transcript": the draft text read from the image(s), exactly as written, or "" when there are no images.',
      '"english": a plain, faithful English translation of the whole draft (text and images). Do not summarize, soften or improve it. Keep tickers, handles and links as written.',
    ].join('\n'),
  });
  const res = await getClaudeClient().messages.create({ model: MODEL, max_tokens: 4000, messages: [{ role: 'user', content }] });
  const out = firstJson(textOf(res), '{');
  const english = typeof out.english === 'string' ? out.english.trim() : '';
  if (!english) throw new Error('empty gloss');
  return { english, transcript: typeof out.transcript === 'string' ? out.transcript.trim() : '' };
}

/** Exact, case-insensitive banned-term match. No model involved. */
export function matchBannedTerms(draft: string, bannedTerms: string[]): LintFlag[] {
  const lower = draft.toLowerCase();
  const flags: LintFlag[] = [];
  for (const term of bannedTerms) {
    const t = (term || '').trim();
    if (!t) continue;
    const i = lower.indexOf(t.toLowerCase());
    if (i !== -1) flags.push({ rule: `Banned term: ${t}`, span: draft.slice(i, i + t.length), severity: 'high' });
  }
  return flags;
}

/**
 * Check the plain-language rules. Every flag must quote a span that really is
 * in the draft; anything else is dropped, so the model can't invent a problem.
 * A tripwire, not a reviewer: a clean result only means no known rule fired.
 */
export async function lintRules(draft: string, rules: string[]): Promise<LintFlag[]> {
  const clean = rules.map(r => (r || '').trim()).filter(Boolean);
  if (!draft.trim() || clean.length === 0) return [];
  const res = await getClaudeClient().messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: [
        'Check this draft post against the client rules below. Flag only clear violations.',
        `Rules:\n${clean.map((r, i) => `${i + 1}. ${r}`).join('\n')}`,
        `Draft:\n"""\n${draft}\n"""`,
        'Return a JSON array only: [{"rule": string, "span": string, "severity": "high"|"medium"|"low"}].',
        '"rule" is the rule that was broken, in a few words. "span" is copied character for character from the draft, the shortest piece that shows the violation. Return [] when nothing is broken.',
      ].join('\n\n'),
    }],
  });
  const arr = firstJson(textOf(res), '[');
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((f: any) => f && typeof f.rule === 'string' && typeof f.span === 'string' && f.span.trim() && draft.includes(f.span))
    .map((f: any) => ({
      rule: f.rule.trim().slice(0, 200),
      span: f.span,
      severity: f.severity === 'high' || f.severity === 'low' ? f.severity : 'medium',
    }));
}

/** Mostly Hangul: the reviewer already wrote the note in Korean. */
export function isKorean(text: string): boolean {
  const letters = text.replace(/[\s\d\p{P}\p{S}]/gu, '');
  if (!letters) return false;
  const hangul = (letters.match(/[가-힣ㄱ-ㆎ]/g) || []).length;
  return hangul / letters.length >= 0.5;
}

const REGISTER_PROMPT = "Translate the reviewer's note into Korean for a Korean crypto creator. Use 존댓말, warm and polite. Use 혹시 for soft asks. Light ~~ or ^^ is fine. No em dashes. No hype adjectives. Keep any Korean phrase quoted from the draft exactly as written. Do not add any instruction the reviewer did not write. Output only the Korean note.";

/** Reviewer's change note in Korean, in the KOL relay register. */
export async function toKoreanNote(note: string): Promise<string> {
  const res = await getClaudeClient().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: REGISTER_PROMPT,
    messages: [{ role: 'user', content: note }],
  });
  const out = textOf(res).replace(/[—–]/g, ',').trim();
  if (!out) throw new Error('empty translation');
  return out;
}
