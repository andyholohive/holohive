/**
 * The strategy of record — read from the source documents, not indexed.
 *
 * [2026-09-11, Andy] "I want to focus more on when briefs were sent out,
 * strategies… Do not be lazy." The portfolio page previously listed the brief
 * documents as links without saying what was in them, which answered "is there
 * a brief" but not "what does it commit us to".
 *
 * Every line below was read out of the client's own KOL Content Brief doc in
 * Google Drive on 2026-09-11. It is transcribed, not inferred — where a doc
 * leaves a phase unwritten, that is recorded as a gap rather than filled in.
 * The docs are owner-locked against export, so this is a manual read; when a
 * brief is revised, this file has to be re-read rather than re-synced.
 *
 * Keyed on the client name as it appears in `clients.name`.
 */

export interface StrategyPhase {
  /** Phase name exactly as the brief titles it. */
  name: string;
  /** The window the brief assigns to the phase, verbatim. */
  window: string;
  /** How many briefs the phase budgets for. */
  volume: string;
  /** What the phase is trying to move the audience from → to. */
  arc: string;
  /** The named briefs filed under the phase. */
  briefs: string[];
  /**
   * A commitment the brief states as binding — a spend, a hard rule, a
   * constraint on how creators are paid or what they may promote. These are
   * the lines that turn into delivery obligations, so they are pulled out
   * rather than left inside the prose.
   */
  rule?: string;
  /** Set when the brief itself says the phase is not written yet. */
  gap?: string;
}

/**
 * A document read alongside the content brief — a baseline audit, an outreach
 * brief, an activation spec. These carry the constraints that never appear in
 * the weekly plan but govern what may ship.
 */
export interface SupportingDoc {
  title: string;
  /** What the document establishes, in one or two sentences. */
  summary: string;
  /** Lines the document states as binding on delivery. */
  rules?: string[];
}

/**
 * A commitment or constraint read out of the documents that the database has no
 * way to know, and that changes how this page's own numbers should be read.
 */
export interface StrategyAlert {
  tone: 'danger' | 'warning' | 'info';
  title: string;
  detail: string;
}

/**
 * A number the engagement committed to in writing, paired with the field on the
 * dossier that measures it.
 *
 * [2026-09-11] The documents state targets and HHP holds actuals, and until now
 * nothing compared them — so the page could show "107 posts" and "50+ posts
 * committed" on the same screen without ever saying which side was ahead.
 *
 * `metric` is null when the commitment is genuinely not measurable from this
 * database (advocacy, feedback quality). Those still render, marked as tracked
 * off-platform, because omitting them would quietly redefine the deal as only
 * the countable half of itself.
 */
export interface Commitment {
  label: string;
  /** The committed figure, as the document words it. */
  committed: string;
  /** Numeric target where one exists, for the comparison. */
  target?: number;
  /** Which dossier field measures this, when one does. */
  metric?: 'kols' | 'posts' | 'views' | null;
  /**
   * An actual taken from the client's own report rather than from HHP. Used
   * where the work was genuinely measured but measured somewhere else — an
   * activation site, a wrap report — so the commitment is not left reading as
   * unmeasured when the number is known and, in Fogo's case, well short.
   */
  reportedActual?: number;
  /** Where the number comes from, and any unit mismatch worth knowing. */
  source: string;
}

/**
 * A deliberate departure from the standard backbone — one the engagement chose
 * and can defend, as opposed to the backbone failing to hold. Rendered
 * alongside the live audit in `portfolioBackbone`.
 */
export interface BackboneDeviation {
  /** Which link of the chain, or which rail. */
  link: string;
  /**
   * Whether the engagement chose this shape or the backbone failed to hold.
   * Required rather than assumed: a documented departure is not automatically
   * a deliberate one, and labelling Venice's contradictory GTM "by design"
   * would have defended a mistake.
   */
  kind: 'design' | 'gap';
  /** What the standard workflow expects. */
  standard: string;
  /** What this engagement does instead, and why that was the right call. */
  actual: string;
}

export interface ClientStrategy {
  /** The brief document's own title. */
  docTitle: string;
  /** One-paragraph read on what the whole document is trying to do. */
  thesis: string;
  phases: StrategyPhase[];
  /**
   * How the engagement delivers. A private council does not post publicly, so a
   * post count of zero is the design rather than a miss — the comparison table
   * has to say so or it reads as the worst account on the page.
   */
  deliveryModel?: 'kol-campaign' | 'private-council';
  /** Contractual or compliance facts the derived attention list cannot infer. */
  alerts?: StrategyAlert[];
  /** Chosen departures from the standard workflow. */
  deviations?: BackboneDeviation[];
  /** What the engagement promised in numbers. */
  commitments?: Commitment[];
  /** Other documents read for this client. */
  supporting?: SupportingDoc[];
  /** ISO date this file was last reconciled against the live documents. */
  readOn: string;
}

export const CLIENT_STRATEGY: Record<string, ClientStrategy> = {
  Venice: {
    docTitle: 'Venice KOL Content Briefs',
    readOn: '2026-09-11',
    deviations: [
      {
        link: 'Briefs & plans',
        kind: 'gap',
        standard: 'The GTM plan sits above the content brief, and the brief executes it.',
        actual: 'They contradict each other. The GTM names privacy as the thing we intentionally do not lead with; the creative cards make privacy a MUST INCLUDE and demote token mechanics to MUST NOT. The briefs won on the evidence, but the plan above them was never updated, so the top of this client’s document chain no longer describes the campaign underneath it.',
      },
      {
        link: 'Post',
        kind: 'design',
        standard: 'Slots produce posts, and posts are the output.',
        actual: 'Phase 1.2 ran through a community activation instead — venicekorea.app, 819 verified signups each requiring a wallet connection and an Upbit ID, ~4,000 product prompts and 361 UGC posts. The qualifying steps are the deliverable there, and they are counted nowhere in the Post link.',
      },
    ],
    alerts: [
      {
        tone: 'warning',
        title: 'Venice — the GTM plan of record contradicts what we actually brief',
        detail: 'The Korea GTM Plan names privacy as the thing we intentionally do NOT lead with, on the basis that privacy narratives have limited traction in Korea. The content briefs and creative cards lead with privacy and list staking mechanics as a MUST NOT. Our own Week 3 and Month 1 reports show the privacy message landing — audiences citing Venice’s data policy unprompted — so the briefs are right and the plan is stale. It has not been updated since the Week 2 pivot, so anyone briefing off the GTM today would brief the abandoned campaign.',
      },
    ],
    commitments: [
      { label: 'Korean creators activated', committed: '12 across complementary niches', target: 12, metric: 'kols',
        source: 'KOL Insights Report, from 10 onboarding calls. Phase 1.1 ran all 12 active; by Week 9 five were active.' },
      { label: 'Scheduled posts per week', committed: '12 per week', metric: null,
        source: 'Weeks 1-2 report: 24 scheduled against a 24 target, plus 7 organic, 31 delivered. Cadence fell to 5 posts in Week 9.' },
      { label: 'Verified community signups', committed: 'No stated target', reportedActual: 819, metric: null,
        source: 'Month 1: 819 signups, each requiring a Venice wallet connection and Upbit ID — product adoption rather than impressions.' },
    ],
    thesis:
      'Venice arrives in Korea on the back of the $VVV Upbit listing, which brings an audience for the ticker rather than for the product. The brief treats that as the problem to solve, not the win to ride: token mechanics are supporting material, never the lead, and the job of the early phase is that people who came for the listing find a project worth understanding.',
    phases: [
      {
        name: 'Phase 1.1 — Awareness to Education',
        window: 'Opening phase',
        volume: '3–4 briefs',
        arc: 'From "a ticker that just listed" to "a project worth understanding".',
        briefs: [],
        rule:
          'Token mechanics are supporting material, not the lead. Coverage exists so the listing audience finds substance behind the ticker.',
      },
      {
        name: 'Phase 1.2 — Product & Narrative Depth',
        window: 'Follow-on phase',
        volume: '4–5 briefs',
        arc: 'Budget is reallocated toward the KOL channels that performed in 1.1, and coverage goes deeper on product.',
        briefs: [],
        rule:
          'Hard rule from the Venice team: any community activation in this phase uses stablecoin reward pools, not $VVV. It applies to every activation brief in the phase without exception.',
      },
    ],
    supporting: [
      {
        title: 'Venice: Korea GTM Plan (DocSend) — and where it went stale',
        summary:
          'The plan of record, written at contract signing. Objective: establish Venice as the leading privacy-first AI platform in Korea and close the gap between the Bithumb/Upbit listing presence and real local understanding. Phase 1.1 "Token Awareness" May 12 – Jun 5, Phase 1.2 "Product and Narrative Depth" Jun 8 – Jul 3. It leads with $VVV as a live capital asset with working mechanics — staking yield, DIEM minting, monthly buy-and-burn — plus Voorhees credibility and 3M users at 15,000+ inference requests an hour.',
        rules: [
          'Its "intentionally NOT leading with" line is the one that matters, and the campaign ended up doing the opposite: "Privacy as the opening hook. Privacy narratives have limited traction in Korea." The outreach brief agreed, and the May 16 KOL insight calls agreed harder — twelve creators independently said the Korean audience cares about price first.',
          'The content briefs and creative cards do the reverse. Brief 2 leads on privacy outright, and the Bucket 1 creative card makes "privacy as the lead, product problem first" a MUST INCLUDE with staking mechanics and DIEM demoted to MUST NOT.',
          'The pivot was right, and the evidence is in our own reporting. Week 3 recorded two commenters in one channel independently citing Venice not storing personal data as what they valued, unprompted; Month 1 recorded the same message surfacing verbatim in two channels by Week 3. Privacy travelled in Korea after all.',
          'What did not happen is anyone updating the plan. The retrospective explains why the pivot occurred — Lorenzo flagged discomfort with token-purchase-tied mechanics on May 14 and Austin harder on May 15 — but the GTM still tells a reader that privacy is the thing we deliberately avoid. Anyone briefing off it today would brief the campaign that was abandoned in Week 2.',
        ],
      },
      {
        title: 'Weekly and monthly campaign reports (DocSend, May–Jul 2026)',
        summary:
          'Seven reports covering Weeks 1-2, 3, 6, 7, 9 and Month 1. Month 1 (May 12 – Jun 8, Phase 1.1) closes at 60 posts from 12 KOLs, ~71,000 views and 819 verified signups — each one requiring a Venice wallet connection plus an Upbit ID alongside X and Telegram handles, so multi-step qualification rather than passive follows. Weeks 1-2 also logged 772 ecosystem clicks, 77% to Venice links. The Phase 1.2 community activation drew ~425 entries in its first week, 1,100+ Venice prompts and 210 UGC posts on X, closing at ~4,000 prompts and 361 UGC posts by Week 7.',
        rules: [
          'Cadence falls off sharply in Phase 1.2. Phase 1.1 averaged 15 posts a week across 12 active KOLs; Week 6 ran 11 posts, Week 7 eight posts with 7 KOLs active, and Week 9 five posts with 5 KOLs and ~8,200 views. The reports are candid that Week 9 was "education week, no conversion mechanic running by design", but the trend is a shrinking active roster.',
          'The activation’s bonus mechanic worked as designed — 43% of entrants (177 of 425) submitted more than the minimum screenshot, so people were exploring the product rather than completing a competition.',
          'Angle design produced a real split worth reusing: the mechanics-breakdown angle drove entry volume (Coinboys, 193 of 224 entries from one channel), while the discovery angle drove depth (Chukapikachu, 13.2 entries per post). Volume and depth came from different formats, not different effort.',
        ],
      },
      {
        title: 'Creative Cards — what a creator actually receives',
        summary:
          'The missing link between an angle and a post. Each angle becomes a one-page Creative Card naming the campaign, the brief focus, the specific KOLs it goes to, and a 48-to-72-hour post deadline from delivery. It opens with "Your Angle" — a paragraph explaining why this brief suits that channel’s register — then "The One Idea" in a single sentence, a PROMPT pointing at a real source with instructions on what to take and what to leave (the Delphi piece: read the architecture sections, "leave the valuation comparisons alone"), and Raw Material as optional facts rather than required beats: "Use these facts however you want. You do not need to hit all of them."',
        rules: [
          'Every card carries a two-column Guardrails table. For Bucket 1 — MUST INCLUDE: the Venice.ai link and @AskVenice tag, privacy as the lead with the product problem first, a discovery tone. MUST NOT: token price targets or investment advice, staking mechanics or DIEM as the lead, sign-up CTAs or participation hooks.',
          'Tone is specified rather than implied: "You came across something credible. You looked into it, you found Venice. Not a sales pitch."',
          'The card gives research, source material and framing, and explicitly leaves delivery to the creator — which is the outreach brief’s "a starting point, not a script" rendered as an actual artifact.',
        ],
      },
      {
        title: 'How the weekly angles are actually assigned',
        summary:
          'Each Venice brief names two or three angles and gives each to one creator, chosen on register rather than reach: EWL (research-forward, "highest credibility voice in the lineup") sets the trust frame; Manbull is used for conviction because he covered Venice organically before the campaign; Chukapikachu bridges from Virtuals — a name Korean retail already knows — into Venice; Yobeul anchors pure-action posts because reach and short form are his format. The arc runs from why privacy matters, to Venice against closed AI, to who Erik Voorhees is, into the community activation, then deeper into Pro and the API.',
        rules: [
          'The Phase 1.1 closing brief exists to make Erik Voorhees "a name worth knowing" — the credibility layer that makes everything before it make sense.',
          'The Week 2 argument is deliberately narrow: every major AI model trains on your conversations and Venice is built so it does not. Readers should walk away thinking differently about their own AI usage.',
          'The community activation ran at venicekorea.app on real product usage across five free features — Agentic Chat, image and video generation, AI Characters, Code — with 108 winners and a $2,000 prize pool, entries scaling with how much of the product someone actually explored.',
        ],
      },
      {
        title: 'Venice Engagement Retrospective (May 2026)',
        summary:
          'An unusually candid internal post-mortem on the first two weeks. The verdict is that the strategy was right and the execution had gaps. What worked: the Upbit listing on May 12 was pivoted into the Week 1 anchor same-day and the campaign site went viral in Korea; data-led deliverables reset a shaky relationship (819 verified signups, 10/12 creators onboarded); removing the Upbit screenshot requirement within hours of Austin flagging it drove 200–300 more entries. What did not: the campaign opened on a community activation tied to token-purchase verification when it should have opened on project, team and product.',
        rules: [
          'When a client flags discomfort with a core element of the strategy, that triggers an internal discussion before anything else ships. Lorenzo flagged it May 14 and Austin harder on May 15; neither signal stopped the next deliverable.',
          'A new decision-maker arriving mid-engagement gets a brief within 24 hours. Austin joined the group cold and his first call covered questions the GTM plan had already answered.',
          'Walk the user journey before it goes public — two or three KOLs giving honest feedback would have caught the four-step activation flow before the client saw it.',
          'The attribution framework belongs in the portal on Day 1. It had existed since April 28 and went unsent for five days while the client asked twice for exactly that.',
          'One portal link from Day 1, with the onboarding form inside it and call booking triggered on submission — not onboarding form and portal as two separate touchpoints.',
        ],
      },
      {
        title: 'Venice KOL Outreach Brief — APAC',
        summary:
          'The recruiting document handed to creators. Positions Venice as a working privacy-first AI platform — 3M registered users, 50,000+ daily active, 15,000+ inference requests an hour — rather than a whitepaper, and lays out the live $VVV utility loop (stake 100 to unlock Pro, ~15% staking yield, lock to mint DIEM at $1 of AI compute) plus the monthly buy-and-burn funded from platform revenue.',
        rules: [
          'Lead with product utility and token mechanics when speaking to Korean audiences. Privacy is a supporting proof point, not the opening hook.',
          'Briefs give creators directional angles and factual grounding, not a script — creators adapt them to how they actually talk, and use their own voice over the brief’s.',
          'Creators show Venice in action where they can — live inference, real use cases, honest reactions — because that lands harder than explanation.',
        ],
      },
      {
        title: 'Venice Pre-Engagement Baseline',
        summary:
          'A Telegram audit of 71 curated Korean channels over a 12-month lookback, taken at engagement start (May 18). Venice was almost invisible: 106 mentions across a full year, and 49 of 71 channels (69%) never mentioned it once. Of the mentions that existed, 67% were about price and only 16 across 12 months discussed Venice as a product. Two listings — Bithumb Apr 1, Upbit May 12 — produced the only sustained spikes; between them the project went quiet. That is the awareness gap the KOL programme was built to close.',
        rules: [
          'The 45-mention post-listing wave is mostly Upbit, not us. Briefed content had not shipped yet, so week 1 reports frame it honestly rather than crediting the campaign for organic listing momentum.',
        ],
      },
    ],
  },

  Fogo: {
    docTitle: 'FOGO KOL Content Briefs',
    readOn: '2026-09-11',
    deviations: [
      {
        link: 'Post',
        kind: 'design',
        standard: 'The evidence a week produces is a set of posts, logged with date, views and engagement.',
        actual: 'For Phase 1.2 the evidence is custom software. Three activations were built from scratch — a PFP generator, the Trader Card site pulling live on-chain data from Fogoscan and Fuul, and the Speed Game — and they produced wallets, $7M of Valiant volume and 752 UGC posts. The campaign report puts it plainly: "standard KOL campaigns deliver posts; these delivered on-chain participation." That output has no home in the Post link.',
      },
      {
        link: 'Angle',
        kind: 'design',
        standard: 'Each week carries two or three angles, assigned by us.',
        actual: 'The Superluminal weeks propose two or three angles and let the client pick the strongest fits, so angle selection moves to the client for that stretch. Fogo also runs a second parallel narrative track — the nine-brief Superluminal Push — alongside the numbered brief sequence rather than inside it.',
      },
      {
        link: 'Campaign roster',
        kind: 'design',
        standard: 'Creators are briefed and paid to post.',
        actual: 'Creators are also given $1,000 of $FOGO each to use the ecosystem before writing, on an informal three-month hold with no clawback. Part of the roster’s relationship is an unsecured token position rather than a fee, which is not something the payment chain models.',
      },
    ],
    commitments: [
      { label: 'Trader Card participating wallets', committed: '2,000+ wallets', target: 2000, reportedActual: 917, metric: null,
        source: 'Activation brief target against the final performance report (Jul 6), which supersedes the mid-campaign breakdown’s 320. Short of target, but those participants pushed $7M through Valiant across ~750K transactions.' },
      { label: 'UGC posts generated', committed: '600+ (3 per active wallet)', target: 600, reportedActual: 752, metric: null,
        source: 'Final report records 752 live UGC posts and 35,354 X impressions — the one activation target that was beaten.' },
      { label: 'Trader Card winners', committed: '225+, about 1 in 9', metric: null,
        source: 'Activation brief, scaled to the 2,000-wallet target it did not reach.' },
    ],
    thesis:
      'Fogo is positioned as a credible, trading-first L1 built by institutional-grade founders and designed for on-chain financial markets, with a deliberate but subtle hook toward the Valiant launch. The document is explicitly sequential: the audience has to know what Fogo is before any brief talks about incentives or participation mechanics.',
    phases: [
      {
        name: 'Phase 1.1 — Awareness & Ecosystem Discovery',
        window: 'Opening phase',
        volume: '6–8 briefs',
        arc: 'From "what this is" to "how the ecosystem works and why it is worth exploring".',
        briefs: [
          'Brief 1 — Awareness & Introduction',
          'Brief 2 — Flame Season 2 & Valiant',
          'Brief 3 — Building in Public: The Ambient Session',
          'Brief 4 — Valiant Onboarding',
          'Brief 5 — Putting $FOGO to Work',
          'Brief 6 — Making Every Token Count',
        ],
        rule:
          'Creators onboarded for ecosystem-focused briefs receive $1,000 of $FOGO to use the ecosystem directly — staking, depositing, trading on Valiant — so the content reflects genuine hands-on usage rather than description.',
      },
      {
        name: 'Phase 1.2 — Conversion & Activation',
        window: 'Timed to Fogo’s biggest catalysts',
        volume: '5–6 briefs',
        arc: 'Converts the awareness built in 1.1 into sustained Korean community representation and on-chain activity.',
        briefs: [
          'Brief 7 — PFP Frame Campaign',
          'Brief 8 — Fogo Trader Card',
          'Brief 9 — Fogo Speed Game',
        ],
        rule:
          'Briefs here are reactive and milestone-driven — exchange listings, trading competitions, ecosystem growth moments — and budget is reallocated toward top-performing KOL channels.',
      },
      {
        name: 'Superluminal Push',
        window: 'Standalone campaign section',
        volume: '9 briefs',
        arc: 'A dedicated narrative run: First Signal → The Mechanics → Lived Consequence → What Makes It Credible → The Numbers That Warrant It → See It For Yourself → The World Is Live → The Architecture Bet → Built For This.',
        briefs: [],
      },
    ],
    supporting: [
      {
        title: 'How the weekly angles are actually assigned',
        summary:
          'Fogo’s nine numbered briefs build strictly on each other — each one opens by recapping what the previous weeks established before adding its layer, so the sequence cannot be reordered. Brief 1 is awareness and credibility only, and explicitly says Valiant perps are live but should be mentioned "naturally as an ecosystem signal this week, not as a CTA." From Brief 4 the focus shifts from context to participation. The Superluminal weeks work differently again: each offers two or three angles and lets the client pick the strongest fits, with each angle matched to a named creator — EWL for mechanism-first readers, Snatch0x for perp-DEX internals, HoneyOfWhiteSocks for rotators who think in terms of moving capital, Mujammin for fast retail traders who follow his own book.',
        rules: [
          'Creator rotation is explicit and tracked — one angle notes EWL "was not activated for last week’s brief, making him fresh for rotation this week."',
          'The two community activations are deliberately different in friction: the PFP Frame campaign needs no wallet and no sign-in, just a photo and a download, while the Trader Card drives real on-chain participation with a live leaderboard and a 500,000 $FOGO ($10,000) prize pool over four to six weeks.',
          'The Superluminal tone is fixed across every angle: creators are sharing something they found, not something they were asked to promote.',
        ],
      },
      {
        title: 'FOGO: Korea GTM Plan',
        summary:
          'The engagement’s own objective document. Establish Fogo as the trading-first L1 in Korea with serious on-chain traders and DeFi users — deliberately ahead of general retail, because Korea is one of the most sophisticated trading markets in crypto and experienced traders will value the technical differentiation rather than covering it shallowly. The aim is a reference layer built before the milestones land: Valiant perps, Ambient launch, potential Korean CEX listings. Timeline: onboarding Mar 5–10, Phase 1.1 Mar 9 – Apr 19, Phase 1.2 Apr 20 – May 17.',
        rules: [
          'Leading with: real technical differentiation (consistent 40ms blocks, colocation consensus, Fogo Sessions), institutional founder credibility (Jump Crypto, Citadel Securities, Douro Labs/Pyth) and a live mainnet with working DeFi primitives.',
          'Intentionally NOT leading with token price narratives, airdrop farming mechanics or speculative hype. Flame Season 2 is framed as an ecosystem participation program, not a farming event.',
          'The high-performance L1 space is crowded and many chains claim speed without real differentiation, so content must showcase the trading experience rather than describe it.',
          'Success is engagement quality — content that demonstrates genuine product familiarity — not volume for its own sake.',
        ],
      },
      {
        title: 'FOGO KOL Outreach Brief',
        summary:
          'The recruiting document. Fogo is a Layer 1 purpose-built for DeFi and on-chain trading, running a custom Firedancer-based client on the Agave codebase from Douro Labs (the Pyth team), at consistent 40ms blocks with sub-second finality and full SVM compatibility, so Solana dApps and wallets work out of the box. It lays out the live ecosystem — Valiant (spot + perps), Ignition and Brasa (liquid staking), Pyron (lending), Ambient (perp DEX, launching) — the founder bench, and the funding history including the Echo community round that took $8M in under two hours.',
        rules: [
          'Creators produce authentic Korean-audience-relevant content, keep organic and consistent output that compounds awareness over time, and align naturally with Fogo’s milestone calendar.',
          'Content direction and specific activation details are shared separately once onboarded — the outreach brief deliberately stops short of them.',
        ],
      },
      {
        title: '$FOGO Creator Incentive Budget',
        summary:
          '$25,000 in $FOGO, split $10,000 to creator incentives at roughly $1,000 each, $5,000 to community events and giveaways, and $10,000 held in reserve pending a Week 6 read. Explicitly not payment for posting — creators are already paid for content — but skin in the game, so coverage comes from firsthand use. Three buckets direct where it goes: Valiant for active trading and live positions, Pyron for collateral and borrowing, Brasa/Ignition for staking yield.',
        rules: [
          'Informal three-month hold on a handshake, no formal contract, and no clawback — creators absorb full market risk on their allocation.',
          'The stated purpose is to bridge the experience gap: creators who have actually used the product produce more credible and culturally resonant content than scripted promotion.',
          'Live in the document’s own comments: referral programs are now illegal in Korea, which cuts against the proposal to onboard each KOL through the Valiant affiliate form. Unresolved on the page.',
        ],
      },
      {
        title: 'FOGO: Korea GTM Overview, Phase 2 (DocSend, Jun–Aug)',
        summary:
          'The follow-on plan, and unusually honest about its own ceiling. The objective is to sustain presence through a "lean summer gap" and arrive at Superluminal’s August launch with an engaged, educated community already primed to amplify it — with Fogo as the main character at KBW. The existing Phase 1 audience is 10+ KOL communities and 168K combined Korean follower reach who "do not need reintroduction to Fogo".',
        rules: [
          'The candid line: "The team said it plainly in April: high excitement cannot be expected until Superluminal is live. The strategy in the gap period is retention and anticipation, not aggressive acquisition."',
          'Intentionally not leading with farming mechanics or short-term incentive programs — the agreed Phase 2 direction is to communicate the ecosystem as a long-term engagement, not a seasonal farming opportunity.',
          'Superluminal transition messaging must be defined and aligned before any KOL content goes out on the launch.',
        ],
      },
      {
        title: '$FOGO Budget Summary (DocSend, Jun 22, 2026)',
        summary:
          'The campaign wallet ledger. 1,094,000 $FOGO received; 364,750 distributed on-chain — five KOL ecosystem incentives of 55,000 each on Apr 1, 750 for ecosystem testing and fees, and 89,000 for the PFP campaign prize pool on May 2. A further 550,000 was committed but not yet distributed at the time of writing: 500,000 for the Trader Card prize pool and 50,000 for Speed Run, both dated Jun 30. Remaining balance 729,252, or 179,252 once the committed pools are netted off.',
        rules: [
          'The five 55,000 transfers, all within six minutes on Apr 1, are the $1,000-per-creator incentive from the creator incentive document arriving on-chain — the paper commitment and the ledger line up.',
        ],
      },
      {
        title: 'Trader Card & Speed Game — final performance report (Jul 6, 2026)',
        summary:
          'The seven-week wrap, May 12 to June 30, and the numbers that should be quoted rather than the mid-campaign ones: 917 distinct participants, $7M of Valiant volume across ~750K transactions, 752 live UGC posts and 35,354 X impressions, with the Speed Game pulling ~317K sessions from 771 players and ~50M taps. The funnel runs 220,291 combined KOL subscribers → 36,811 Telegram post views → 917 participants → 88 active trading wallets → $7M. Fogo’s own team flagged the biggest single day on Valiant ever during the first week, roughly double the previous record, and a fresh daily high of $2.5M by early June.',
        rules: [
          'The volume headline needs its caveat attached. Of 88 active trading wallets, 16 carried ~85% of the $7M and 48 were under $10K. The $7M is real and routed through the client’s core metric, but it is 16 wallets, not a broad base.',
          'The clearest operational lesson in any of these documents: trader card creation spiked on exactly the days KOLs posted and went quiet in between, so a steady weekly KOL beat beats front-loading at launch.',
          'Two distinct KOL jobs showed up in the data — entry drivers who fill the funnel (Chukapikachu alone drove 23% of entries with step-by-step how-to content, Coinboys 15%) versus a smaller set of trader-audience channels that move the volume. The report’s recommendation is to budget both tiers deliberately next time.',
          'Step-by-step guides converted far better than editorial takes, across the board.',
          'The Speed Game held roughly 12,000 sessions a day for three weeks with no added spend — habit rather than a launch bump — and the report proposes packaging it for global reuse.',
        ],
      },
      {
        title: 'Fogo Korea Campaign Report (DocSend, Jun 4, 2026)',
        summary:
          'The client-facing wrap on the three-month engagement, 17 pages. Headline: 54 activated posts from 17 unique Korean KOLs, 71,337 Telegram impressions, ~75% of budget deployed, cost per post 30–40% below standard Korean third-party agency pricing and 32% below industry CPA on community events. The per-brief view table is the most useful page in it, because it shows education briefs decaying and activations reversing it — B1 Awareness drew 8,269 views, falling brief by brief to 4,612 by B6 Making Every Token Count, then the PFP Frame campaign took 11,277 and the Trader Card 19,333. Ten primary Telegram KOLs carried a combined 113.6K followers, and the smallest channel on the roster (3.1K) posted the highest engagement rate at 5.30%, against 0.53% for the largest.',
        rules: [
          'Platform split matters for how any of this is quoted: Telegram carried 82.4% of impressions as the primary Korean venue at roughly 10x X’s engagement, and all 15,200 X impressions came from organic UGC and #FogoKorea posts by Trader Card and PFP participants — not paid placements.',
          'The 2,400x figure resolves here, and it does not hold. The report derives it from ~30 price-focused mentions against 86,537 total views — mentions measured against views, which is not a mindshare multiple. The like-for-like number is 28x, 30 mentions to 830.',
          'Two slides in the same deck disagree on engagements. The platform table totals 1,777 (1,342 Telegram + 435 X); the per-KOL table totals 1,342 while still summing impressions across both platforms, which makes its 1.88% engagement rate a Telegram-only numerator over an all-platform denominator.',
          'Participant counts drift slightly across documents — the PFP activation is 474 in the activations breakdown, 473 in this report, "around 500" in the case study. Worth settling on one before any of them is reused.',
          'The recommendation is continuity: the channels, creators and community built over three months are "the hardest part of Korea market development," and the cost of restarting from zero is significantly higher than the cost of continuity.',
        ],
      },
      {
        title: 'Case Study — Fogo Korea, Mar 5 – Jun 3, 2026',
        summary:
          'The outward-facing write-up of the first three months. Its framing of the challenge is the sharpest thing in it: the problem was never awareness but credibility, and Korean exchanges actively monitor the same Telegram networks Korean communities use for education, so substantive presence in those conversations positions a project differently when listing teams look. Before the engagement Fogo had roughly 30 organic Korean mentions, every one price-focused, with no Korean-language content and no tracked on-chain participation. Headline results: $5.5M on-chain volume from Korean wallets on Valiant, ~800 activation participants, 86,537 impressions across 176 KOL and UGC posts, and Valiant’s all-time-high daily volume on May 18 attributed to the Korean activation by Fogo’s team in writing.',
        rules: [
          'The method it credits: every creator was onboarded on-chain and used the ecosystem before writing a word, so content came from first-person experience.',
          'On curation — the smallest channel in the roster outperformed channels ten times its size on every quality metric, because selection is on audience composition rather than follower count.',
          'Care before reusing the numbers: the document states mindshare growth two different ways. The stat block says 28x, 30 mentions to 830 mentions, which is like-for-like and defensible. The Results section says 2,400x — the campaign report it draws from derives that from 30 mentions against 86,537 views, so it measures mentions in units of views and is not a mindshare multiple. A stray "$5.5 in real on-chain trading volume" in the same section is also missing its M.',
        ],
      },
      {
        title: 'Community Activations — the three-mechanic framework and what it produced',
        summary:
          'The internal breakdown of Fogo Korea’s three activations, April–June 2026, with results rather than plans. Activation 1, the PFP Frame Generator (Apr 24–28), deliberately had no wallet connection and no gas — a low barrier chasing volume and social proof — and drew 474 entries across 9 KOL channels against a $1,500 pool; Coinboys alone drove 97 entries (20.5%) and KoonCrypto 73 (15.4%), and that per-KOL split fed the Phase 1.2 curation decisions. Activation 2, the Trader Card (May 9 – Jun 30), connected wallets at fogotradingcards.com and pulled live on-chain activity from Fogoscan and Fuul, awarding points across trading volume, four ecosystem dApps, social tasks, UGC and a Speed Run game, with a 500,000 $FOGO pool and 12 KOL channels carrying referral tracking. The document’s own framing: standard KOL campaigns deliver posts; these delivered on-chain participation, measurable volume and community content, all traceable back to specific channels.',
        rules: [
          'Read this document as mid-campaign, not final. It records 320 wallets and $5.5M while the activation was still running; the July 6 performance report closes it at 917 participants and $7M. Both fall short of the brief’s 2,000-wallet target, but 917 is the number to quote.',
          'Ecosystem depth was the thinner half: of the participants, 52 touched at least one dApp, 30 used two or more, and only 10 used all four, averaging 2.12 interactions each. UGC held up better at 67 approved posts across 26 creators.',
          'The sequencing was deliberate — the PFP round established a social identity layer and confirmed which KOL communities were most responsive before the larger $10K pool was deployed.',
        ],
      },
      {
        title: 'Superluminal Push Outline — 4-week, July 2026',
        summary:
          'The pre-mainnet run for Superluminal. The central message is a market-structure story, not an incentive story: most perps DEXs inherit the same CLOB structure from traditional finance, whose speed race creates a latency tax on ordinary traders; Superluminal’s DFBA batch auctions clear every order in the same 40ms window at a uniform price, so execution quality becomes a function of price rather than infrastructure spend. Fogo’s 40ms blocks are what make that possible on-chain. The arc runs First Signal (Jul 3–7) → The Mechanics (Jul 10–14) → The Implications (Jul 17–21) → Sustained Anticipation (Jul 24–28).',
        rules: [
          'Product first — lead with DFBA, execution quality and team pedigree. Not rewards or points.',
          'No incentive details for the whole month. Incentives stay in reserve; comms are weighted on the product and its differentiators.',
          'No competitor references — frame the comparison as CLOB vs DFBA structurally, never against a named exchange.',
          'Tone is genuine technical curiosity: a creator who found something structurally interesting and is sharing it honestly, not a launch announcement.',
          'Single CTA — the slx.fi waitlist, across all four weeks.',
          'Each creator is briefed on a distinct standpoint so a full month of pre-launch coverage reads layered rather than repetitive.',
        ],
      },
      {
        title: 'Superluminal Wallet Quality Verification',
        summary:
          'The gate that decides who may enter a community activation. Open activations attract three kinds of low-quality participant — fresh wallets minutes old, bots that pass basic address checks but have never touched a DeFi protocol, and passive CEX holders who never moved funds on-chain — and each dilutes engagement and skews the metrics the activation exists to capture. Wallets are scored 0–10 at connect time (1.5–3 seconds, no user friction beyond a standard wallet connect) on wallet age, DEX and perp activity, token diversity, 30-day volume and cross-chain history, using only free API tiers: Helius, Solscan, Hyperliquid, Drift, Birdeye and Dune. Entry tiers are Bronze 3–4 points for maximum reach, Silver 5–6 for a standard high-quality base, Gold 7+ for priority or whitelist.',
        rules: [
          'The goal is not exclusivity for its own sake — it is that the activation reaches wallets representing real traders, DeFi participants and protocol users.',
          'Zero cost by design: no paid subscriptions, no ongoing data costs at activation-scale traffic.',
        ],
      },
    ],
  },

  Umia: {
    docTitle: 'Umia KOL Content Briefs',
    readOn: '2026-09-11',
    deviations: [
      {
        link: 'Briefs & plans',
        kind: 'gap',
        standard: 'The content brief is written and approved before the weeks it governs.',
        actual: 'Two of Umia’s three stages were published with their brief lists unwritten — "to come, developed as auction details and early-bid terms are confirmed with the client." The strategy document deferred the work rather than the team forgetting it, which is also why weekly plans later went up late: there was no written brief to propose from.',
      },
      {
        link: 'Post',
        kind: 'gap',
        standard: 'Every post is logged against a slot.',
        actual: 'Complimentary posts were not submitted through the normal flow, which is what produced the "0/4 posted" close-out on a week where content existed. The posting path and the logging path came apart.',
      },
    ],
    commitments: [
      { label: 'Korean creators onboarded as genuine participants', committed: '10', target: 10, metric: 'kols',
        source: 'Korea-specific mandate in the market research brief' },
      { label: 'Korea Signal baseline', committed: 'From Week 1', metric: null,
        source: 'Delivered — the zero-mention audit of 326 channels, July 21.' },
      { label: 'Korean Auction Hub', committed: 'Standing before the open round', metric: null,
        source: 'Mandate ahead of the auction.' },
      { label: 'Read on Korean appetite', committed: 'By Day 30', metric: null,
        source: 'Mandate ahead of the auction.' },
    ],
    thesis:
      'Umia enters Korea from a standing start with no Korean footprint, into a research-literate audience that reads a cold project introduction as paid and tends to backfire against it. So the brief refuses the introduction format and enters through narratives the audience already follows — the backlash against broken token structures, equity-token messes, dual-token games, rugs and abandonments — and surfaces Umia through that substance, credibility first.',
    phases: [
      {
        name: 'Introduction, Credibility and Awareness',
        window: 'Jul 28 – Aug 10',
        volume: '3–4 briefs',
        arc: 'From no Korean footprint to a first sustained body of coverage that earns a second look.',
        briefs: [
          'Introducing Umia',
          'The Questions Last Week Left Open',
          'The Problem Was Never Technical',
          'Proof, Not Another Argument',
        ],
        rule:
          'No cold project introduction. Entry is through narratives already live with the audience, with credibility leading and the product surfacing through the substance.',
      },
      {
        name: 'Auction Activation',
        window: 'Aug 11 – Aug 20',
        volume: '2–3 briefs, timed to the auction window',
        arc: 'Turns understanding into participation. Content shifts from what Umia is to how to take part — the Umia extension and the zkTLS verification step — so an unfamiliar flow feels familiar before the open round. The stage overview still says August 20, but the later weekly briefs record the sale moving to end of August and then splitting in two: August 26 for early access, August 29 for the public auction. The briefs treat that split as the news, because most Korean awareness had stopped at the single date Umia posted.',
        briefs: ['Two Dates, Two Doors'],
        rule:
          'Early-bid framing is developed with the client and stays on earned eligibility, never on price.',
        gap:
          'The brief list for this stage is unwritten — the document says briefs are "to come, developed as auction details and early-bid terms are confirmed with the client."',
      },
      {
        name: 'Post-TGE Marketing and KBW Activation',
        window: 'Aug 21 – Sep 30',
        volume: '3–5 briefs across the post-sale weeks and KBW',
        arc: 'The weeks after the auction are where a Korean holder base either consolidates or quietly drifts, so coverage continues past the point most campaigns end. Focus returns to substance — what happened in the sale, and what the treasury and decision markets do now that they are live rather than theoretical. Korea Blockchain Week in late September anchors the stage as Umia’s in-person Korea debut.',
        briefs: ['After The Close', 'Who Decides What Launches'],
        gap:
          'Partly unwritten — the document says further briefs are "to come, developed after the auction and confirmed ahead of KBW."',
      },
    ],
    supporting: [
      {
        title: 'Umia: Korea GTM Overview (DocSend, Jul 24, 2026)',
        summary:
          'The plan of record. North star, stated as such: verified Korean wallets bidding in the auction — explicitly "not raise totals". Content strategy is ten creators and roughly fifty Korean-native pieces. It leads with Umia as the value creation layer for on-chain ventures: tokens as financial primitives anchored to a venture’s treasury, revenue and IP via a MetaLeX wrapper, raised through an open Uniswap v4 auction into a non-custodial treasury the team cannot drain, with decision markets framed as a financial primitive and trading opportunity rather than governance.',
        rules: [
          'It settles the futarchy question the market research had left open. Intentionally not leading with governance-as-value or DAO framing — so the client’s wish to make futarchy "synonymous with Umia" is answered by the plan, not left hanging.',
          'Also not leading with price, market-cap, return or investment framing (compliance-bound), nor heavy VC or deep-theory framing, "which reads bearish in Korea".',
          'Compliance is restated as tight: decision markets border restricted prediction-market territory in Korea, so content stays education-only and is cleared by Umia before shipping.',
          'Timeline runs onboarding Jul 20–27, introduction and credibility Jul 28 – Aug 10, auction activation Aug 11–20, post-TGE and KBW Aug 21 – Sep 30, then ecosystem marketing from Oct 1 — the engagement widening from Umia itself to the ventures launching through it.',
        ],
      },
      {
        title: 'How the weekly angles are actually assigned',
        summary:
          'Read at brief level rather than stage level, Umia’s plan is a set of running arguments carried by named creators, not a topic rota. Each week names two or three angles and hands each to one creator with their follower count, the character of their audience, and an explicit reason that creator fits that angle. Threads continue: Don’t Focus Hype gets "you made this exact argument in Week 2, so this is your own thread continuing at a deeper layer, not a new brief landing cold on your channel," and Yobeul’s second post is framed as connecting his first look to what is coming rather than repeating it. New creators are introduced deliberately — Jammin is brought in by EWL for a question neither existing thread has touched.',
        rules: [
          'The arc is argumentative, not promotional: Week 1 opens on how tokens are structured, Week 2 goes to where the money goes after a raise and whether a good team would even choose this route, Week 3 to capital formation as the real bottleneck, Week 4 tests the argument against the testnet’s closing record (66,000+ visitors, ~160,000 auction interactions over two-plus weeks).',
          'When the sale date moved, the brief’s instruction was to stay on substance rather than push participation.',
          'No eligibility specifics from us — that waits on Umia’s own announcement.',
        ],
      },
      {
        title: 'Umia Korea Market Research (Jul 23, 2026)',
        summary:
          'The pre-engagement read. Umia is a community-owned token launch platform from Chainbound — a Cayman segregated portfolio company under a MetaLex BORG wrapper — bundling an on-chain auction, a non-custodial treasury with only three programmatic exit paths, and futarchy-style decision markets. The research finds the real differentiator is the auction-plus-treasury bundle, not the auction mechanic, which CoinList already runs identically: every competitor handles the sale, none dictates what happens to the money afterward. It also grades the story honestly — Telegram at 86 subscribers, one press wave off a single CEO interview, no visible protocol code on the public GitHub org, and three of four named client contacts with no independent public trace.',
        rules: [
          'A Korean exchange listing is not a credible near-term outcome for a token this size. That expectation needs managing now, not after the auction.',
          'The word “futarchy” has twice failed to hold Korean attention — and sits outside the contract’s scope anyway, since governance and decision markets are expressly excluded from paid content.',
          'Scope conflict, unreconciled: the client’s onboarding form asks for futarchy to be made “synonymous with Umia,” which the signed contract does not cover. Flagged as needing settling with the client before any creator is briefed.',
          'CoinList is contractually unavailable to South Korean residents. If Umia is accessible to Korean investors that is a concrete, checkable advantage worth stating plainly rather than as a vague claim.',
        ],
      },
      {
        title: 'Umia Korea Signal Baseline (Jul 21, 2026)',
        summary:
          'An audit of 326 Korean trading and community Telegram channels over the 12 months before engagement start, on four keywords. The result is a true zero: 0 mentions, in 0 of 326 channels. No project chatter, no product discussion, no tech framing — the name had simply not reached the market. The document reads that as an asset, not a gap: there is no narrative to correct and no baggage to carry, so the first sustained coverage defines what Koreans think Umia is, and every mention in the post-engagement audit is attributable growth against a zero line.',
        rules: [
          'A mechanism story needs the research-forward channels first. Umia’s futarchy and on-chain capital formation is the kind of story Korean analyst and educator channels explain well and retail channels amplify afterward — credibility first, reach second.',
          'The launch clock is the constraint. Korean Telegram covers a landing story inside the same window, and today that frame is empty — an advantage only until launch day.',
          'Compliance: Umia’s decision-market mechanics sit close to prediction-market territory, which is restricted under Korean regulation. All creator content goes through compliance review before distribution — walkthrough and education formats only, no participation referral links.',
        ],
      },
    ],
  },

  Jumper: {
    docTitle: 'Jumper: Handoff Snapshot (Sales → Delivery)',
    readOn: '2026-09-11',
    deviations: [
      {
        link: 'Campaign → Week',
        kind: 'gap',
        standard: 'By the time a term is live, a campaign carries a roster and a first weekly lineup.',
        actual: 'Neither exists. The engagement began Sept 9 with no content brief written, no creator shortlist and no lineup. Some of that is deliberate restraint — the handoff instructs that nobody is briefed off it while the agreement is uncountersigned, and every creator needs client approval before onboarding — but the effect is the same: this account sits at Campaign and has not reached Week, with first content contractually due Sept 16.',
      },
      {
        link: 'Onboarding ladder',
        kind: 'gap',
        standard: 'Seven steps, with the outreach brief, GTM plan and content brief signed off before week one.',
        actual: 'Compressed to almost nothing by a six-week term with first content due on day seven. The Korea Signal baseline was delivered, but the brief-approval steps that normally precede any creator contact are running alongside the deadline rather than ahead of it.',
      },
    ],
    thesis:
      'Jumper has no content brief yet — this is the sales-to-delivery handoff, written Sept 9 off the consulting agreement and the client thread. Positioning is a super app for onchain finance in the client’s own words and explicitly NOT a bridge: $40B lifetime volume, Jumper Earn, tokenised-stock trading, limit orders, and Perps launching end of September aggregating Lighter and Hyperliquid. Arjun named Jupiter as the model and asked us to nail the forward-looking three-to-five-year story before anything reaches a creator. Target is Korean traders — Legion investors first, perps users after — and he would rather raise $500,000 from ten people than from ten thousand, so investor quality beats reach.',
    phases: [],
    commitments: [
      { label: 'Korean creators onboarded and producing', committed: '15 or more', target: 15, metric: 'kols',
        source: 'Consulting agreement, Initial Term' },
      { label: 'Localized Korean-language posts', committed: '50 or more', target: 50, metric: 'posts',
        source: 'Initial Term. If extended, the engagement as a whole owes 150+ inclusive of this.' },
      { label: 'Korean Telegram reader-views', committed: '65,000 or more', target: 65000, metric: 'views',
        source: 'Initial Term; 200,000+ if extended. Note the unit gap — the agreement counts Korean Telegram reader-views, while the figure beside it is impressions across Telegram and X together, so this comparison is indicative, not contractual.' },
      { label: 'First creator content live', committed: 'By Sept 16, 2026', metric: null,
        source: 'Day-ten clause. Month one is waived or refunded if it slips.' },
    ],
    alerts: [
      {
        tone: 'danger',
        title: 'Jumper — first creator content is contractually due Sept 16',
        detail: 'The handoff calls the day-ten clause the sharpest thing in the engagement: creator content not live within ten days of the Sept 19 start waives or refunds month one. Its own instruction is not to brief creators or commit spend off that document alone, because as of Sept 9 the agreement was not countersigned and the product access and invite codes owed in week one had not arrived.',
      },
      {
        tone: 'warning',
        title: 'Jumper — a confirmed airdrop is already priced into Korean expectations',
        detail: 'The baseline found Jumper cited by name in Korean channels as the reference case for a confirmed token airdrop, while the Legion sale asks that same audience to buy at a $75M FDV. That belief needs a clear answer before creators speak, because the first Korean to ask it publicly sets the tone for everyone reading.',
      },
    ],
    supporting: [
      {
        title: 'Deal shape and what is owed',
        summary:
          'Six weeks, Sept 9 – Oct 20, $15,000 KOL budget administered at zero markup. The engagement owes 15+ Korean creators onboarded and producing, 50+ localized Korean posts, and 65,000+ Korean Telegram reader-views, with the same creators publishing on X at no extra cost. Korea Blockchain Week support (Sept 29 – Oct 1) is included. Legion PR lands Sept 22 and the sale goes live Sept 29.',
        rules: [
          'All four performance clauses are on inputs, not outcomes — undelivered inputs mean we keep working at no cost, and a sixty-day overrun gives the client a refund right.',
          'Content that reads as advertising is withdrawn and replaced at our cost. Korean paid-partnership disclosure is mandatory.',
          'Every creator is client-approved before onboarding, so nobody is briefed ahead of approval.',
        ],
      },
      {
        title: 'Live risk — read this before briefing anyone',
        summary:
          'The handoff is blunt that week one carries the fee risk, not week six. As of writing, the agreement was NOT countersigned, and product access and invite codes owed in week one had not arrived. The document’s own instruction: do not brief creators, commit creator spend, or give the client a date off it alone.',
        rules: [
          'The day-ten clause is the sharpest thing in the engagement and lands Sept 19 — creator content not live within ten days of the Sept 19 start waives or refunds month one. First creator content is due Sept 16.',
          'Day-thirty dissatisfaction makes month one refundable on seven days’ notice.',
          'Nobody raised it on the kickoff: Jumper has been exploited twice and historical users still hold live token approvals to the LI.FI Diamond. An agreed answer is needed before a creator is asked about it.',
          'No legal, regulatory, tax, accounting, investment or financial advice on the token, the TGE or its distribution — and no representation on amount raised, allocation, listing, price, volume or market cap.',
          'Korean personal data under PIPA, minimum necessary, with a data processing agreement in place before any processing on the client’s behalf.',
        ],
      },
      {
        title: 'Jumper Korea Signal Baseline',
        summary:
          'The pre-engagement audit found Jumper is known in Korea — but by the wrong rooms. The channels carrying the most mentions are airdrop and farming rooms whose readers are there to extract value at zero cost, which is the hardest possible audience to convert into buyers at a fixed valuation. Mention volume is also concentrated in small rooms: the channel with the most mentions carries 623 subscribers. One 55,773-subscriber channel did describe the product exactly as the company would want — a unified interface for deploying and managing capital across 15+ protocols — unprompted and in Korean, in January. So the positioning is not untested in this market; it is untested at volume.',
        rules: [
          'A confirmed airdrop is already priced into Korean expectations — Jumper is cited by name as the reference case for one. Part of this market believes it has already earned an allocation, and that belief needs a clear answer before creators speak, because the first Korean to ask it publicly sets the tone for everyone reading.',
          'Recognition and purchase intent are not the same asset, and Jumper holds the first without the second.',
          'Sale and platform details remain pre-announcement and must not reach any creator ahead of the client’s own PR.',
          'The engagement’s own framing: every mention in the baseline was written by someone passing through. The work is to produce the first mentions written by someone who stayed.',
        ],
      },
      {
        title: 'How this client works',
        summary:
          'Arjun Chand at LI.FI is the single point of contact and approver, confirmed on the Sept 9 kickoff. He approves inside 12–24 hours, faster than the agreement’s 48, and asked for open high-frequency questions rather than batched ones. Marko Jurina, Jumper’s CEO after the spin-out, was neither present nor mentioned and is not the working contact. A full legal markup came back in three days, so this client reads carefully.',
        rules: [
          'Arjun was openly skeptical of Korea agencies and nearly decided against a Korea go-to-market entirely, choosing us after three trust-building calls. The engagement starts on earned rather than assumed trust — he framed it himself as a bet.',
          'State our standards plainly and never quote clause numbers at them.',
          'The lever he handed us: every existing Korean mention of Jumper sits inside Squid’s own Korea push. Squid raised at a $60–65M FDV; Jumper is asking $75M having done roughly forty times the volume.',
          'The product repositioned since drafting — jumper.exchange now redirects to jumper.xyz, leading with “Smart App for the Universal Market,” while the agreement’s recital still says bridge and swap aggregator. Confirm the framing before any brief quotes either.',
        ],
      },
    ],
  },

  Button: {
    docTitle: 'Button: Engagement Overview (Aug 10 – Nov 10, 2026)',
    readOn: '2026-09-11',
    thesis:
      'Button is not a KOL campaign and does not run on the weekly Week → Angle → Slot → Post backbone. It is a private council of ten Korean traders, analysts and researchers with real capital, seated around the product to turn hands-on use into feedback that moves Button toward product-market fit. Public coverage is explicitly out of scope for the term — "the council is the channel" — so the zero in this client’s post count is the design, not a failure. The bar the engagement sets itself is eight of ten members genuinely advocating by term end, where an advocate is first a retained user in the product weekly.',
    deliveryModel: 'private-council',
    deviations: [
      {
        link: 'Week → Angle → Slot → Post',
        kind: 'design',
        standard: 'A weekly lineup carries angles, each angle carries slots, and each slot ends in a public post.',
        actual: 'None of that runs. Button has no lineups, no angles and no posts, because the engagement overview puts public coverage out of scope for the term — "the council is the channel." The ten seats are the deliverable and structured weekly feedback is the output, so four links of the chain are deliberately absent rather than missing.',
      },
      {
        link: 'Campaign roster',
        kind: 'design',
        standard: 'The roster is creators we brief to publish.',
        actual: 'The ten people on Button’s roster are council members, not publishers. They are recruited for capital, judgement and willingness to use the product — five deploy $1M or more and seven write their own bots — and they are cut and replaced if they go quiet rather than carried as inactive.',
      },
      {
        link: 'Rail · Weekly report',
        kind: 'design',
        standard: 'A written read on the week, sent every Monday.',
        actual: 'Replaced by a weekly synthesis of member usage, friction and feature asks in members’ own words, every line traceable to a named member and verified product usage — and timed to Button’s ship cadence rather than to a Monday.',
      },
    ],
    commitments: [
      { label: 'Council members, held at ten', committed: '10 active', target: 10, metric: 'kols',
        source: 'Engagement overview. Quiet members are cut and replaced rather than carried.' },
      { label: 'Members genuinely advocating by term end', committed: '8 of 10', metric: null,
        source: 'The engagement’s own bar. An advocate is first a retained user, in the product weekly — tracked off-platform in the weekly synthesis.' },
      { label: 'Council growth by term end', committed: 'Toward 20–30', metric: null,
        source: 'Via vouched introductions from seated members, at Button’s pace.' },
      { label: 'Missing features surfaced for Korean traders', committed: 'The ten that matter most', metric: null,
        source: 'Delivered weekly in members’ own words and mapped to what Button ships next.' },
    ],
    alerts: [
      {
        tone: 'info',
        title: 'Button posts nothing publicly, by design',
        detail: 'Button is a private council of ten Korean traders, and the engagement overview puts public coverage out of scope for the term — "the council is the channel." Its zero in the posts column is the model working, not an account failing. What it produces instead is structured weekly feedback, which is why it leads every account on this page for document reading.',
      },
      {
        tone: 'warning',
        title: 'Button — no creator content may imply performance',
        detail: 'Button is pursuing RIA licensing in the United States, so no member communication may imply or promise a return, and the restriction extends to results tables and backtest screenshots, not only to stated returns. Korean creators may also not publicly post referral links; attribution runs through custom landing pages on a pull basis.',
      },
    ],
    phases: [
      {
        name: 'Onboarding and council sourcing',
        window: 'Aug 10 – 24',
        volume: 'Shortlist of 10+ put to Button for approval',
        arc: 'Kickoff, product access and invite codes in week one, measurement baseline frozen, candidates sourced and vetted from the Korean trading network, one-on-one onboarding underway.',
        briefs: [],
      },
      {
        name: 'Council seated and first depth reads',
        window: 'Aug 25 – Sep 9',
        volume: 'Feedback rounds against Button’s ship cadence',
        arc: 'The council of ten is fully seated and the Day 30 Report lands by Sept 9 with the first honest read on engagement and product friction.',
        briefs: [],
      },
      {
        name: 'Joint targets at the Week 6 checkpoint',
        window: 'Sep 10 – 21',
        volume: '—',
        arc: 'Back-half targets set together with Button around Sept 21, informed by the Day 30 Report and where the roadmap stands.',
        briefs: [],
      },
      {
        name: 'Korea Blockchain Week',
        window: 'Sep 22 – Oct 1',
        volume: 'Founders dinner, 10–15 seats',
        arc: 'KBW ground support and council members met in person while both founders are in Seoul.',
        briefs: [],
      },
      {
        name: 'Managed growth and incentive experiments',
        window: 'Oct 2 – Nov 10',
        volume: 'Council grows toward 20–30 at Button’s pace',
        arc: 'Vouched introductions from seated members; month three adds small-group incentive experiments directed and funded by Button; the term closes with the like-for-like Korea Signal comparison against the baseline.',
        briefs: [],
      },
    ],
    supporting: [
      {
        title: 'Button Korea Signal Baseline (Aug 10, 2026)',
        summary:
          'An audit of 327 curated Korean channels over the twelve months before engagement start found exactly two mentions of Button — both on the same day, 3 December 2025, both reacting to the seed round rather than the product, and nothing in the 250 days since. Of 465 candidate matches reviewed, 463 were false hits on a common interface word. The document’s framing is that this is silence, not hostility: no negative history, no price narrative, no competing frame to dislodge.',
        rules: [
          'Korea holds a stale frame, and that is the real problem. Both mentions describe a BTC-collateral borrow/trade/earn venue on Hyperliquid — not the thesis-testing product Button leads with today. Left alone that is the frame that spreads, because it is the only one on the record.',
          'Funding news travels in Korea; product does not, unless someone shows it. Eight months of building after the raise produced nothing, so announcements alone will not carry this — someone credible has to be seen using it.',
          'Compliance: Button is pursuing RIA licensing in the United States, so no creator content may imply or promise performance — and that restriction extends to results tables and screenshots, not only to stated returns.',
          'Korean creators may not publicly post referral links. Attribution runs through custom landing pages on a pull basis, and all content passes Holo Hive compliance review before distribution.',
        ],
      },
      {
        title: 'Panel Survey 1 Findings (Aug 24, 2026)',
        summary:
          'Ten members answered. Five deploy $1M or more, seven write their own bots, and eight had not traded on Button — four had not opened it. So almost every answer is about the member’s own workflow rather than the product. The gap they name is the plumbing between a view and a live position, not the view itself: the missing terminal that joins idea to execution. They are also not a crypto-only audience — seven trade equities and five hold Korean brokerage accounts. Two members independently asked, unprompted, for X as a data source.',
        rules: [
          'The read: “The narrative lands. The access does not.” Invite codes and one working session per member were the gate on the next round measuring the product rather than the same workflows again.',
          'Expect comparison, not instruction. These members do not need to be taught automation — the useful question is what Button does that their own scripts cannot.',
        ],
      },
      {
        title: 'Panel Survey 2 Findings (Sep 7, 2026)',
        summary:
          'The access gate cleared: all ten got in, against four who had never opened it in Survey 1, and nine reached a backtest. The constraint moved to data — five of the nine hit a wall on missing venues, Korean market data, funding fees or history depth. Not one member took an answer at face value; eight looked at the sources and seven went back to their own charts to check. Seven of ten want an approval gate before an agent touches their account, and the two strongest builders will not hand over execution at all — the opposite of what we expected.',
          rules: [
          'The read: “They are in. Now the data is what limits them.” Most of what stopped them is data to buy, not models to build.',
          'X is the only question all ten answered the same way — every member wants the timeline read for them. Nothing else in either survey has been unanimous.',
          'The sharpest dissent, worth carrying honestly: “I do not think there is anything Button can do that my own tools or scripts cannot” — Plusev, who runs an arbitrage desk.',
        ],
      },
    ],
  },
};

export function strategyFor(clientName: string): ClientStrategy | null {
  return CLIENT_STRATEGY[clientName] ?? null;
}
