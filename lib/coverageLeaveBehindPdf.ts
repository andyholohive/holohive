/**
 * Coverage Leave-behind → PDF, via the canonical template + Chromium print.
 *
 * REWRITTEN [2026-07-27]. The previous build drew its own layout with jsPDF and
 * html2canvas and broke `lib/templates/coverage-rules.md` three ways: `#3e8692`
 * where the brand is `#376D79`, a reimplemented frame instead of the canonical
 * template, and rasterising through a second engine. rules.md's parity rule is
 * explicit — the skill and HHP render the same template from the same contract
 * through the same engine, "Chromium for the PDF, never a second engine", so
 * their outputs never differ. A hand-drawn lookalike is precisely what that
 * rule exists to prevent.
 *
 * WHY BROWSER PRINT RATHER THAN HEADLESS PUPPETEER: the template is already a
 * print document — `@page { size: A4; margin: 14mm... }`,
 * `print-color-adjust: exact`, and `@media print` rules that hide the draft
 * banner and the pending blocks. Those are instructions to a browser's print
 * engine; jsPDF and html2canvas cannot honour any of them, which is the
 * mechanical reason the old build had to redraw everything by hand. The
 * operator's own Chrome IS Chromium, so printing there satisfies the parity
 * rule, renders Korean from system fonts (no ~5MB Noto embed, no tofu boxes),
 * and keeps text selectable. Server-side puppeteer was the alternative, but the
 * two routes here that already try it (app/api/prospects/scrape,
 * .../funding/scan) both carry "avoids Vercel bundling issues" hedges and fail
 * soft with "Puppeteer not available" — not a path to rely on in production.
 *
 * WHAT THIS FILE DOES NOT DO: invent content. Per rules.md's division of
 * labour the template is "a dumb renderer" and the intelligence lives upstream.
 * CoverageContract supplies counts, channel-type rows, velocity and evidence
 * posts. The framing — headline, audience read, the per-row `does` line, post
 * translations, topic split — is editorial and arrives via `edits`. Anything
 * absent renders as a `ph-text` placeholder and forces `draft: true`, which is
 * the contract's own convention for "awaiting the pull".
 *
 * CAUTION, verified against the template: `@media print` hides only `.banner`
 * and `.killed`. The orange `ph-text` placeholders are NOT hidden, so printing
 * an unfilled render produces a PDF that still shows `[HEADLINE]` etc. but has
 * LOST the "DRAFT. Not for send." banner. That is the template author's
 * deliberate design (the banner says so), and it means the draft warning has to
 * happen before the print dialog, not on the page — which is why
 * openLeaveBehindForPrint reports `draft` back to the caller.
 */

import Mustache from 'mustache';
import type { CoverageContract } from '@/lib/coverageAnalysis';
import TEMPLATE from '@/lib/templates/coverage-leavebehind.template.html';

/**
 * The human-written half. Every field is optional: whatever is missing becomes
 * a visible draft placeholder rather than a plausible-looking invention.
 */
export interface LeaveBehindEdits {
  /** Full sentence. Renders as the callout headline. */
  headline?: string;
  /** Full sentence, under the headline. */
  headline_support?: string;
  /**
   * NOUN PHRASE, no trailing period — spliced mid-sentence by the template:
   * "coverage skews to {audience_mix}, with {audience_underreached} largely
   * outside it." Writing a full sentence here produces "retail traders., with".
   */
  audience_mix?: string;
  /** NOUN PHRASE, no trailing period. See audience_mix. */
  audience_underreached?: string;
  /** Full sentence, rendered bold, leading the velocity read. */
  velocity_read_bold?: string;
  /** Optional continuation after the bold sentence. Include a leading space. */
  velocity_read?: string;
  /** Per channel_type, the editorial "what this type does" line. */
  does?: Record<string, string>;
  /** Per post, keyed `${channel}:${tg_message_id}` — the English gloss. */
  translations?: Record<string, string>;
  split_note?: string;
  posts_note?: string;
  benchmark_competitor?: string;
}

export interface RenderArgs {
  contract: CoverageContract;
  /** Project / prospect name — the template's {{subject}}. */
  subjectLabel: string;
  generatedAt: string | null;
  edits?: LeaveBehindEdits;
  /** mm/dd/yyyy formatter, passed in so this module stays free of date policy. */
  formatDate: (iso: string | null | undefined) => string;
}

/**
 * Placeholders come in two forms because the template does.
 *
 * [2026-07-27] The first cut used one HTML helper everywhere and shipped a bug
 * straight into the print preview: Mustache renders `{{x}}` HTML-ESCAPED and
 * `{{{x}}}` raw, so the escaped fields printed the literal string
 * `<span class="ph-text">[HEADLINE]</span>` instead of an orange chip. Verified
 * against the template — raw fields are audience_mix, audience_underreached,
 * avg_views, tile_*, translation, channel_label, views_reactions, velocity_note;
 * everything else (headline, headline_support, does, split_note, posts_note,
 * velocity_read_bold, shot_caption, tag) is escaped and must receive PLAIN TEXT.
 *
 * If you add a field, check which stache the template uses before picking a
 * helper. Getting it wrong fails visibly but only in the printed output.
 */
const phHtml = (code: string) => `<span class="ph-text">[${code}]</span>`;
const phText = (code: string) => `[${code}]`;

/**
 * Collects which placeholders were emitted, so `draft` is decided by what
 * actually happened rather than by string-sniffing the rendered HTML. The
 * previous version tested the output for "ph-text", which matched both the
 * correct chip AND the escaped-and-broken form — so the assertion passed while
 * the render was wrong.
 */
class Missing {
  readonly codes: string[] = [];
  /** Raw-stache field: emits the styled chip. */
  html(value: string | number | null | undefined, code: string): string {
    if (value === null || value === undefined || value === '') {
      this.codes.push(code);
      return phHtml(code);
    }
    return String(value);
  }
  /** Escaped-stache field: must be plain text or the tags print literally. */
  text(value: string | number | null | undefined, code: string): string {
    if (value === null || value === undefined || value === '') {
      this.codes.push(code);
      return phText(code);
    }
    return String(value);
  }
}

function monthLabel(iso: string): string {
  // "2026-07" → "Jul". Deliberately not lib/dateFormat: that module is locked
  // to mm/dd/yyyy for dates, and this is a bare month-axis tick.
  const m = Number(String(iso).slice(5, 7));
  return ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m] ?? String(iso);
}

/**
 * Contract + edits → the Mustache view. Exported so a render can be asserted
 * against without opening a window.
 */
export function buildLeaveBehindView(args: RenderArgs): Record<string, unknown> {
  const { contract: c, subjectLabel, generatedAt, edits = {}, formatDate } = args;
  const miss = new Missing();

  const peak = Math.max(1, ...c.velocity.map(v => v.posts));
  const velocity_bars = c.velocity.map(v => ({ h: Math.round((v.posts / peak) * 100) }));
  const velocity_labels = c.velocity.map(v => ({ label: monthLabel(v.month) }));

  const channel_types = c.channel_type_breakdown.map(row => ({
    type: row.channel_type,
    channels: String(row.channels),
    // {{{avg_views}}} — raw, so the chip is safe here.
    avg_views: miss.html(
      row.avg_views_per_post === null
        ? null
        : Math.round(row.avg_views_per_post).toLocaleString('en-US'),
      'E-5',
    ),
    // Editorial. rules.md invariant 4 permits channel TYPE on the client
    // render, but what a type "does" is a written read, not a scan output.
    // {{does}} — ESCAPED, so plain text only.
    does: miss.text(edits.does?.[row.channel_type], 'DOES'),
  }));

  // rules.md invariant 3: the PDF carries 3 to 4 posts, no internal note, and
  // no bookable-KOL names. The slice is the enforcement — a caller cannot widen
  // it — and channel_label is the TYPE, never the handle.
  const posts = c.representative_posts.slice(0, 4).map(p => {
    const key = `${p.channel_handle ?? p.channel_title ?? ''}:${p.tg_message_id}`;
    const bits: string[] = [];
    if (p.views !== null) bits.push(`Views ${p.views.toLocaleString('en-US')}`);
    if (p.reaction_total !== null) bits.push(`Reactions ${p.reaction_total.toLocaleString('en-US')}`);
    return {
      channel_label: miss.html(p.channel_type, 'TYPE'),   // {{{channel_label}}}
      tag: p.is_forward ? 'Forwarded' : 'Original',       // {{tag}} — escaped
      shot_caption: p.text,                               // {{shot_caption}} — escaped
      translation: miss.html(edits.translations?.[key], 'TRANSLATION'), // {{{translation}}}
      // Pre-formatted strings, no emoji glyphs — they tofu-box without an
      // emoji font (rules.md, Render rules). {{{views_reactions}}} — raw, so
      // the &middot; entity survives.
      views_reactions: miss.html(bits.join(' &middot; ') || null, 'METRICS'),
    };
  });

  // Escaped fields — plain text, or the tags print literally.
  const headline = miss.text(edits.headline, 'HEADLINE');
  const headline_support = miss.text(edits.headline_support, 'SUPPORT');
  const velocity_read_bold = miss.text(edits.velocity_read_bold, 'VELOCITY');
  const split_note = miss.text(edits.split_note, 'SPLIT NOTE');
  const posts_note = miss.text(edits.posts_note, 'POSTS NOTE');
  // Raw fields — styled chip is safe.
  const audience_mix = miss.html(edits.audience_mix, 'AUDIENCE');
  const audience_underreached = miss.html(edits.audience_underreached, 'UNDERREACHED');

  return {
    subject: subjectLabel,
    date: formatDate(generatedAt),
    coverage_window_days: c.window_days,
    velocity_months: c.velocity.length || 6,
    // Decided by what was actually emitted, not by sniffing the output.
    draft: miss.codes.length > 0,

    headline,
    headline_support,

    // rules.md invariant 2, under-claim: every count is anchored to the
    // channels actually read. Nothing here implies the scan saw channels we
    // are not in.
    tile_channels: String(c.counts.channels_covered),
    tile_posts: String(c.counts.posts_total),
    tile_pct: miss.html(
      c.counts.pct_of_tracked_network === null
        ? null
        : String(Math.round(c.counts.pct_of_tracked_network)),
      'E-3',
    ),
    tile_repeat: String(c.counts.channels_repeat),

    channel_types,
    audience_mix,
    audience_underreached,

    velocity_bars,
    velocity_labels,
    velocity_read_bold,
    velocity_read: edits.velocity_read ?? '',
    velocity_note: c.velocity.length ? '' : phHtml('EWL: replace with real series'),

    // topic_split stays null on the contract until the classification pass
    // lands, so the split block always renders as pending. rules.md is
    // explicit: do not invent the split.
    split: [],
    split_note,
    split_pending: c.topic_split === null,

    benchmark_pending: true,
    benchmark_competitor: edits.benchmark_competitor || 'a category peer',

    posts,
    posts_note,
  };
}

/** Contract + edits → the filled HTML. Pure; safe to snapshot or assert on. */
export function renderLeaveBehindHtml(args: RenderArgs): string {
  return Mustache.render(TEMPLATE, buildLeaveBehindView(args));
}

/**
 * Open the filled leave-behind in a new window and hand it to Chromium's print
 * dialog, where the operator picks "Save as PDF".
 *
 * `opened: false` means the popup was blocked, so the caller can say so rather
 * than leave the button looking like it worked. `draft: true` means editorial
 * fields are still missing — the caller must warn, because the printed PDF
 * keeps the placeholders but drops the DRAFT banner (see the file header).
 */
export function openLeaveBehindForPrint(args: RenderArgs): { opened: boolean; draft: boolean } {
  const draft = buildLeaveBehindView(args).draft === true;
  const html = renderLeaveBehindHtml(args);
  const w = window.open('', '_blank');
  if (!w) return { opened: false, draft };
  w.document.open();
  w.document.write(html);
  w.document.close();
  // Print after layout. Calling print() against a document Chrome has not laid
  // out yet yields a blank first page.
  w.addEventListener('load', () => {
    w.focus();
    w.print();
  });
  return { opened: true, draft };
}
