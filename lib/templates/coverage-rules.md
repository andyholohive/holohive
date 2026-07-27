# Coverage Snapshot: invariant rules

The Korea Coverage Snapshot is a sales asset handed to a prospect on an intro call. It proves Holo Hive already understands their Korea position better than they do, then stops. These rules hold no matter who fills the contract (this skill today, HHP's Intelligence tab later) and no matter which render. This file is the single source of truth for the invariants; HHP's build mirrors it, and if they ever diverge, this file wins. Parity rule: the skill and HHP render the same templates from the same contract through the same engine (Chromium for the PDF, never a second engine), so their final outputs never differ.

## The four invariants

**1. Diagnose, do not prescribe.** The snapshot names the problem and the appetite. It never hands over the fix, the strategy, or the roadmap. "Nobody is owning the can-Koreans-use-this question" is a diagnosis. "Run a 12-KOL education campaign" is a prescription and never appears. The take (block 5) is where a prescription tends to leak; hold it to what is happening and where the gap is.

**2. Under-claim the numbers.** Every figure is anchored to the tracked-channel count and window. The methodology line must state that counts are indicative and do not claim full coverage. The scan will always miss channels we are not in, so report a footprint slightly low rather than hand a prospect a number they can disprove. Never imply completeness.

**3. Two views, two renders, one template.** The same frame serves two audiences and two formats:
- **HTML, Intelligence tab (internal).** The team's working view. 5 to 8 posts, `note` set to the internal working line, channel names allowed. Scrolls, screenshots full size, no page limit.
- **PDF export (prospect hand-over).** The 3 to 4 posts selected, no internal `note`, no bookable-KOL names. 1 to 2 pages, do not cram.
Never hand the internal HTML view or the working post set to a prospect.

**4. Tier and scores stay internal; channel type and niche can show.** Never put KOL tier (S/A/B/C/D), channel scores, or named bookable-KOL handles on any client-facing render. On the client render, group and label covering channels by channel type, our HHP creator-type profiling (Native, Tracker, Analyst, Educator, and so on) filtered to the project's niche, which is descriptive and client-safe. Audience type from the profiles (who the coverage reaches: retail, DeFi-native, institutional-curious, beginner) is also client-safe and worth surfacing. The channel-type rows are swappable per project: show the creator types actually present in the coverage, not a fixed set. Tier, channel scores, and named handles live only in the internal call-prep.

## Render rules

- Brand per hh-brand-formatting: teal `#376D79`, dark `#2A5460`, light `#E8F1F3`, Arial. No other palette.
- No em dashes anywhere. En dashes only in number ranges (e.g. 2–3, 5,000–10,000), never as prose connectors. Hyphens are fine.
- Korean renders in the original; the English line under each post is a gloss, not a replacement. PDF render needs a CJK font (Noto Sans CJK KR or equivalent) on the machine.
- Two renders from one frame: HTML for the tab (screen, scrolls) and PDF for the hand-over (print styles, 1 to 2 pages). No one-page target; page count does not matter for the hand-over because it is not in the per-page-tracked Document Portal. Do not cram either render. The PDF is rendered by Chromium only, the same engine HHP uses; never weasyprint or any other engine, which would diverge from HHP.
- Reaction counts are pre-formatted strings ("Reactions 128"), no emoji glyphs (they tofu-box without an emoji font).
- `is_sample` note only for demos.

## Division of labor

This skill and its template are a dumb renderer. The intelligence lives upstream:
- Numbers, translations, topic split, velocity read, and the take are produced by the analysis layer (Claude reading the coverage today; HHP's LLM analysis stage once the TG intelligence layer is live) and delivered as the contract object.
- The template only lays the contract into the frame. No model in the render path, so the same contract always produces the same output.
- This skill never gathers the coverage data itself; it renders a provided contract. Coverage comes from the TG intelligence layer, and the channel-type and audience fields from the HHP KOL profiles (HHP MCP). Data is never hand-keyed or pasted; if the sources are not connected, the read cannot be produced.
