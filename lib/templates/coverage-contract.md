# Coverage Snapshot: data contract

One contract feeds two outputs from one run:

- **Client leave-behind** (`client-leavebehind.template.html`): data + representative posts only. Auto-generatable from the pull. Rendered HTML (Intelligence-tab view) and PDF (prospect hand-over).
- **Internal call-prep** (`internal-callprep.template.html`): the interpretation, talking points delivered live on the call, never handed over. Human-written or pipeline-drafted from evidence.

The templates render whatever is in the contract; they never fetch or invent. The data comes from HHP (KOL profiles via the HHP MCP, coverage via the TG intelligence layer), never a hand-paste. See `rules.md` for the invariants (tier internal-only, channel type from HHP profiles, audience is client-safe, no channel-count cap, diagnose-not-prescribe).

Draft convention: for values still awaiting the pull, pass them wrapped as `<span class="ph-text">[E-1]</span>` and set `draft: true`. For final, pass the number/string.

## Client leave-behind fields

| Field | Meaning |
|-------|---------|
| `subject` | Project / prospect name. |
| `date` | Human date, e.g. "15 July 2026". |
| `coverage_window_days` | Coverage window (usually 30). |
| `velocity_months` | Months the velocity chart spans (usually 6). |
| `draft` | true shows the draft banner (hidden on print regardless). |
| `headline` | The one framed POV line (the single interpretation the leave-behind carries). |
| `headline_support` | 2-3 supporting sentences. |
| `tile_channels`, `tile_posts`, `tile_pct`, `tile_repeat` | The four coverage-count tiles. `tile_pct` renders with a trailing `%`. Value or ph-span. |
| `channel_types` | Array of `{type, channels, avg_views, does}`. Rows are swappable per project: show the creator types actually present (Native, Tracker, Analyst, Educator, Curator, Scout, Visionary, Onboarder), not a fixed set. Tier/scores never here. |
| `audience_mix` | Who the coverage reaches (from profiles), e.g. "active retail traders and DeFi-native users". |
| `audience_underreached` | The segment largely outside the coverage. |
| `velocity_bars` | Array of `{h}` (0-100), oldest to newest. |
| `velocity_labels` | Array of `{label}`, one per bar (months). |
| `velocity_read_bold`, `velocity_read` | The trajectory read (bold lead + rest). |
| `velocity_note` | The [EWL: replace with real series] gate note (ph-span). |
| `split` | Array of `{label, width, pct}`. `width` is the bar (0-100 number); `pct` is the displayed value (number or ph-span). |
| `split_note` | Plain-language read of the split. |
| `split_pending` | true shows the [SPLIT pending] gate block (hidden on print). |
| `benchmark_pending` | true shows the benchmark [pending] block (hidden on print). |
| `benchmark_competitor` | Competitor to benchmark against, e.g. "Base". |
| `posts` | Array of `{channel_label, tag, shot_caption, translation, views_reactions}`. 3 to 4 for the hand-over; no bookable-KOL names. |
| `posts_note` | Caption under the posts grid. |

## Call-prep fields

| Field | Meaning |
|-------|---------|
| `source_line` | Provenance, e.g. "Yano's write-up + EWL's read, 16 Jul 2026". |
| `narrative_points` | Array of strings: how the narrative formed (the story). |
| `current_state_points` | Array of strings: where it stands now (incl. view-count reality, named entities). |
| `beliefs` | Array of strings: what users now believe (say as our read). |
| `beliefs_note` | One line on why that belief base is the asset. |
| `gap_line` | The money-moment gap, one bold sentence. |
| `gap_note` | How to deliver it (diagnose, then stop). |
| `gap_points` | Array of strings: supporting points (next step, what it takes). |
| `questions` | Array of strings: questions to draw them out. |
| `evidence_links_html` | Optional raw-HTML block of real source links. Omit to hide the section. |
| `say`, `dont` | Arrays of strings for the say / don't-say guardrail. |
| `credibility_tactic` | Optional raw-HTML paragraph. Omit to hide the section. |

## Example (Robinhood, draft)

```json
{
  "subject": "Robinhood",
  "date": "15 July 2026",
  "coverage_window_days": 30,
  "velocity_months": 6,
  "draft": true,
  "headline": "Robinhood ran at the top of Korean crypto mindshare for two to three weeks. That level of attention is rare, and it has already peaked.",
  "headline_support": "The expensive part is done. Korean users understand the story and have made real money in this ecosystem, which most chains never manage. Interest is now easing off the peak. It is still relatively strong, but it is still almost entirely about memes rather than the chain itself, and coverage at that level does not hold on its own.",
  "tile_channels": "<span class=\"ph-text\">[E-1]</span>",
  "tile_posts": "<span class=\"ph-text\">[E-2]</span>",
  "tile_pct": "<span class=\"ph-text\">[E-3]</span>",
  "tile_repeat": "<span class=\"ph-text\">[E-4]</span>",
  "channel_types": [
    { "type": "Native (real-time calls)", "channels": "<span class=\"ph-text\">[H-1]</span>", "avg_views": "<span class=\"ph-text\">[H-2]</span>", "does": "drives the initial spike" },
    { "type": "Tracker (follows over weeks)", "channels": "<span class=\"ph-text\">[H-3]</span>", "avg_views": "<span class=\"ph-text\">[H-4]</span>", "does": "sustains the narrative" },
    { "type": "Analyst (data, charts)", "channels": "<span class=\"ph-text\">[H-5]</span>", "avg_views": "<span class=\"ph-text\">[H-6]</span>", "does": "adds credibility" },
    { "type": "Educator / Curator", "channels": "<span class=\"ph-text\">[H-7]</span>", "avg_views": "<span class=\"ph-text\">[H-8]</span>", "does": "broadens and explains" }
  ],
  "audience_mix": "<span class=\"ph-text\">[audience mix, e.g. active retail traders and DeFi-native users]</span>",
  "audience_underreached": "<span class=\"ph-text\">[under-reached segment]</span>",
  "velocity_bars": [ {"h":8},{"h":12},{"h":18},{"h":34},{"h":100},{"h":72} ],
  "velocity_labels": [ {"label":"Feb"},{"label":"Mar"},{"label":"Apr"},{"label":"May"},{"label":"Jun"},{"label":"Jul"} ],
  "velocity_read_bold": "Month over month, negligible until spring, then a sharp climb to a June peak, now easing.",
  "velocity_read": "The wave held the top of the scene for two to three weeks and interest is still relatively strong.",
  "velocity_note": "<span class=\"ph-text\">[EWL: monthly shape is the qualitative read. Replace with the real month-by-month series. If the data contradicts the shape, the data wins and the headline changes with it.]</span>",
  "split": [
    { "label": "Meme tokens on Robinhood", "width": 68, "pct": "<span class=\"ph-text\">[S-1]</span>" },
    { "label": "The chain / product itself", "width": 14, "pct": "<span class=\"ph-text\">[S-2]</span>" },
    { "label": "Ecosystem projects (Rialto, Arcus)", "width": 11, "pct": "<span class=\"ph-text\">[S-3]</span>" },
    { "label": "Negative / Noxa issue", "width": 7, "pct": "<span class=\"ph-text\">[S-4]</span>" }
  ],
  "split_note": "Almost all of it still runs through memes. Very little is about the chain itself; Rialto and Arcus are the few non-meme projects getting any attention.",
  "split_pending": true,
  "benchmark_pending": true,
  "benchmark_competitor": "Base",
  "posts": [
    { "channel_label": "<span class=\"ph-text\">[Channel 1]</span>", "tag": "Breakout channel", "shot_caption": "Screenshot: the meme call Koreans traded on", "translation": "<span class=\"ph-text\">[Translation: an early Robinhood meme call that built the expectations.]</span>", "views_reactions": "<span class=\"ph-text\">[views / reactions]</span>" },
    { "channel_label": "<span class=\"ph-text\">[Channel 2]</span>", "tag": "Mainstream channel", "shot_caption": "Screenshot: the public credit", "translation": "<span class=\"ph-text\">[Translation: a larger channel crediting the meme channels after making money on the idea.]</span>", "views_reactions": "<span class=\"ph-text\">[views / reactions]</span>" },
    { "channel_label": "<span class=\"ph-text\">[Channel 3]</span>", "tag": "Non-meme", "shot_caption": "Screenshot: Rialto / Arcus", "translation": "<span class=\"ph-text\">[Translation: one of the few posts about the ecosystem rather than a meme token.]</span>", "views_reactions": "<span class=\"ph-text\">[views / reactions]</span>" },
    { "channel_label": "<span class=\"ph-text\">[Channel 4]</span>", "tag": "Negative", "shot_caption": "Screenshot: Noxa / users leaving", "translation": "<span class=\"ph-text\">[Translation: the Noxa issue and chatter about users leaving the chain.]</span>", "views_reactions": "<span class=\"ph-text\">[views / reactions]</span>" }
  ],
  "posts_note": "All sourced from public channels. Cards 1 and 2 are the wave forming, the call, then the mainstream picking it up.",

  "source_line": "Yano's write-up + EWL's read, 16 Jul 2026",
  "narrative_points": [
    "Koreans historically avoided memes: language and timing meant they entered late and finished cycles at a loss, so memes stayed a small separate sector.",
    "This cycle broke that pattern. Several KOLs explained the Robinhood meme narrative <strong>before the chain launched</strong>, convincingly enough to build real expectation. Koreans got in early for once and many took significant profit.",
    "Bigger mainstream channels then made money on those ideas and <strong>publicly credited the meme channels</strong>. Those channels became breakout stars, and Robinhood memes were a main topic across the scene for several weeks.",
    "The underlying reason it grew: most new projects never hand Korean users real profit, and <strong>large, openly shared profit is the strongest viral driver in crypto.</strong> Robinhood produced it."
  ],
  "current_state_points": [
    "Robinhood held <strong>top mindshare for two to three weeks.</strong> Declining now, still relatively strong. Only SK Hynix was comparable recently.",
    "View-count reality: 1,500 to 3,000 views reaches a meaningful part of the audience; 5,000 to 10,000 means nearly everyone active has seen it. The breakout channel averaged ~5,000 per post over two weeks.",
    "The attention is almost entirely memes. The <strong>Noxa issue</strong> turned the image mildly negative. Pure Robinhood posts are rare; <strong>Rialto and Arcus</strong> are the few non-meme projects getting attention."
  ],
  "beliefs": [
    "\"There is money to be made on this chain.\"",
    "\"The team cares about activating the ecosystem.\"",
    "\"There may be some benefit or opportunity here for us.\""
  ],
  "beliefs_note": "That belief base is the asset. It is why this chain is workable and most are not: users have already made or watched real money here.",
  "gap_line": "The attention was built on memes. Almost nothing is posted about the chain itself, and what Korean users actually do with Robinhood has no owner.",
  "gap_note": "Deliver this as a diagnosis, then stop and let them ask \"so what would you do.\" Do not hand over the plan on the call.",
  "gap_points": [
    "Next step is converting meme attention into interest in the chain itself, using non-meme projects like <strong>Arcus and Rialto</strong> to build ecosystem expectation.",
    "This only works because users already profited here. A product alone does not pull Koreans in: even a Hyperliquid-level UX launching on <strong>MegaETH</strong> would struggle. It takes the right voices, plus real time and capital.",
    "Holding the current position will not sustain attention, and pushing the meme narrative harder looks bad given how Koreans view memes."
  ],
  "questions": [
    "What is your current Korea plan, and who owns it internally?",
    "Have you seen the split between meme attention and interest in the chain itself?",
    "What would \"Korean users actually using Robinhood\" look like to you in 90 days?"
  ],
  "evidence_links_html": "Breakout / credit: <a href=\"https://telegram.me/WeCryptoTogether/64468\">WeCryptoTogether/64468</a> &middot; <a href=\"https://telegram.me/Yndegen/3587\">Yndegen/3587</a><br>Noxa: <a href=\"https://telegram.me/justdegenguy/4074\">justdegenguy/4074</a><br>Non-meme: <a href=\"https://t.me/minebuu_cryptoball/4866\">minebuu/4866</a> &middot; <a href=\"https://t.me/Honeyofwhitesocks_2/10713\">Honeyofwhitesocks_2/10713</a>",
  "say": [
    "The market mechanics and view-count reality (proves you know the terrain).",
    "The gap, as a diagnosis: no owner for chain-level usage.",
    "User beliefs framed as \"our read of sentiment.\""
  ],
  "dont": [
    "Assert the causal story as proven fact; it is our read.",
    "Put hard numbers you cannot back yet (gated to the data pull).",
    "Prescribe the campaign on the call. Name the gap, let them ask."
  ],
  "credibility_tactic": "Yano suggests referencing his X post (<a href=\"https://x.com/jeg6322/status/2075816787619573961\">x.com/jeg6322</a>) and noting the analysis came from someone who actively trades and interacts in these Korean communities, to ground the read as real rather than desk research."
}
```
