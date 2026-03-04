# Sales Playbook x CRM Integration Plan

**Version 1.1 (Post-Audit) | February 2026 | For: Management Review**

---

## The Problem

The Sales Playbook v2.0 defines a proven 17-section process — from first DM to signed deal — but it lives as a static document. The team reads it and tries to remember. Follow-ups are tracked in heads or scattered notes. There's no visibility into DM volume, response rates, or meeting counts. BAMFAM is aspirational, not enforced. The weekly rhythm depends on discipline alone.

## The Opportunity

~70% of the data infrastructure already exists in our CRM (templates, contacts, TG bot, stage history, pipeline). But the playbook-driven **workflow layer** — two-path routing, bump sequences, Calendly tracking, Orbit system — is entirely new work. By embedding the playbook directly into the CRM, we turn a reference document into an executable system where every stage, script, template, and follow-up cadence becomes trackable, automated, and measurable.

## Key Context: Two-Path Booking Model

The SDR (Phil) now DMs from the Closer's (Jdot's) account in addition to his own. This creates two booking paths that affect the entire pipeline:

- **Path A (Closer's Account):** Cold DM → Warm → Calendly sent in DM → Booked. No TG exchange needed. No GC creation needed. Faster path — fewer steps.
- **Path B (SDR's Account):** Cold DM → Warm → Get TG → Calendly sent in TG → Booked → Open GC (add Closer). TG handoff required. GC opened after booking. Has its own nudge cadence.

A new `dm_account` field on every opportunity is the routing key. Pipeline logic, sequences, and templates all branch on this value.

---

## What Changes

### Pipeline Stages (Complete Redesign)

**Current Flow:**
New → Contacted → Qualified → Unqualified → Deal Qualified → Proposal → Negotiation → Contract → Won/Lost

**New Flow:**
Cold DM (5 bumps) → Warm (Interested / Silent) → TG* (Path B only) → Booked → Discovery Done → Proposal Sent → Proposal Call → Contract → Closed Won

**Exit lanes at every stage:** Orbit (with reason) or Closed Lost (with reason)

| Stage Change | Why |
|---|---|
| "Contacted" → **Cold DM** | It's a stage, not an action — leads sit here through 5 bumps over ~19 days |
| "Qualified" → **Warm** with sub-states | `warm_sub_state`: Interested (actively engaging) vs Silent (opened but no reply — triggers re-bump) |
| New: **TG** stage (Path B only) | Path B requires TG handoff before Calendly. Own nudge cadence: Day 2, 5, 10. Day 14 no booking → Orbit |
| New: **Booked** stage | Calendly link sent → Lead books → auto-move to Booked. Tracks sent-vs-booked gap |
| "Proposal" split into **Sent + Call** | Track proposal-to-call conversion. Post-proposal silence sequence fires at Sent stage |
| New: **Orbit** exit lane | 5 reasons: No Response, Not Now, Ghost, Has Team, Hard No. Two cadences: 45d or 60d. Resurrection flow back to pipeline |
| New: **Closed Lost** exit lane | Terminal exit. Reason tracked for pattern analysis (budget, timing, competitor, went in-house) |

**Migration:** Existing opportunities auto-mapped to nearest new stage. No data loss. `dm_account` defaults to "sdr" for existing leads.

---

### Lead Bucket System (New)

Every opportunity gets a **bucket** field (A/B/C) and a **temperature score** (0-100).

- **Bucket A (Hot):** Budget mentioned, timeline given, decision-maker present. Fast-track sequence fires.
- **Bucket B (Warm):** Interest shown but missing signals. 21-day nurture sequence fires.
- **Bucket C (Cold):** Early stage, no signals. Monthly nurture cadence.

Bucket drives which **sequence** fires, which **templates** surface, and which **dashboard metrics** apply. Bucket can change as new signals arrive. Auto-scoring based on: budget signal, timeline given, decision-maker identified, Korea mentioned unprompted.

---

### Automated Sequences (7 Types — All New)

Currently zero automation exists. The proposed system has 7 sequence types running via a cron-driven Edge Function that checks for due actions daily and creates tasks with pre-loaded templates.

#### Sequence 0: Cold Outreach — 5-Bump (Highest Volume)

| Bump | Timing | Message Type |
|---|---|---|
| 0 | Day 0 | Opener — personalized cold DM |
| 1 | Day 3-4 | Value — insight or market data |
| 2 | Day 7-8 | Credibility — case study or social proof |
| 3 | Day 12-13 | Direct Ask — explicit call-to-action |
| 4 | Day 18-19 | Breakup — "going to pause for now" |
| — | Day 26 | No response after Bump 4 → auto-move to Orbit (reason: no_response) |

Fields: `bump_number` (0-4), `last_bump_date`. If lead replies at any bump → auto-move to Warm, stop sequence.

#### Sequence 0b: TG Booking Nudge (Path B Only)

| Day | Action |
|---|---|
| 0 | Lead enters TG stage. Calendly sent in TG. |
| 2 | Nudge: "Did you get a chance to check the calendar link?" |
| 5 | Nudge: Value add + reminder |
| 10 | Nudge: Direct re-ask |
| 14 | No booking → auto-move to Orbit (reason: ghost) |

#### Sequence 1: Bucket A — Fast Track

Day 0: Discovery call (Jdot runs CLOSER framework) → Same-day post-call TG with case studies (Phil) → Day 2-3: Proposal prep → Day 4-5: Proposal call + BAMFAM (book contract review) → Day 7-14: Contract → Signed → Won

#### Sequence 2: Bucket B — 21-Day Nurture

| Day | Action |
|---|---|
| 0 | Discovery done. Classified as Bucket B. Post-call TG sent. |
| 4-5 | First value touch: competitor intel OR market data OR campaign results (3 template options) |
| 8-10 | Second value touch: exchange/market signal |
| 14-21 | Soft re-engagement: "worth 15 min to walk through what changed?" |
| 21 | Temperature check. Warm → move to Bucket A. Cold → Monthly nurture. |

#### Sequence 3: Post-Proposal Silence

Day 3-4: "Any questions from the proposal?" → Day 7: Market intel value add → Day 14: Final follow-up, auto-reclassify to Bucket B if no response.

#### Sequence 4: Monthly Nurture (Bucket B/C)

Month 1: Competitor/exchange intel → Month 2: Campaign results/volume data → Month 3: Content/KOL signal → Month 4-5 no response: Breakup message, pause nurture.

#### Sequence 5: Orbit (Long-Term)

| Orbit Reason | Cadence | Touch Type |
|---|---|---|
| No Response | Every 60 days | Value touch (market data, competitor move) |
| Not Now | Every 45 days | Value touch + soft re-engagement |
| Ghost | Every 60 days | Light touch, breakup after 3 attempts |
| Has Team | Every 60 days | Case study results, "how's it going?" |
| Hard No | None | No outreach. Monitor for trigger events only. |

Fields: `orbit_reason`, `orbit_cadence_days`, `orbit_touch_number`, `resurrect_count`. Trigger event match → resurrect back to pipeline.

---

### Stage-Linked Templates (Upgrade)

Current templates exist but aren't linked to pipeline stages. Proposed: templates get `pipeline_stage`, `bucket`, `dm_account`, and `sequence_day` fields. When you open an opportunity, the right template auto-surfaces.

| Stage | Bucket | Template |
|---|---|---|
| Cold DM (Bump 0-4) | All | 5-bump templates (Opener, Value, Credibility, Direct Ask, Breakup) |
| Warm (Path A) | All | Send Calendly link in DM |
| Warm (Path B) | All | "Drop your TG" → then send Calendly in TG |
| Booked | All | Pre-call agenda setting (24-48h before) |
| Discovery Done | A | Same-day follow-up + case studies |
| Discovery Done | B | Same-day follow-up + data walkthrough offer |
| Discovery Done | C | Soft close, keep in loop |
| Nurture (Day 4-5) | B | Value touch V1/V2/V3 |
| Nurture (Day 8-10) | B | Market signal message |
| Nurture (Day 14-21) | B | Soft re-engagement |
| Proposal (Day 3-4) | A | Post-proposal check-in |
| Proposal (Day 7) | A | Market intel value add |
| Proposal (Day 14) | A | Final check-in / reclassify to B |
| Monthly Nurture | B/C | Rotating: competitor, exchange, case study, KOL signal |
| Re-engagement | B/C | Competitive / Social Proof / Breakup / Event |

---

### Activity Tracking + BAMFAM (New)

New `crm_activities` table — every call, message, meeting, and proposal logged per opportunity with timestamp, owner, and notes. **BAMFAM enforcement:** every call/meeting must have a "Next Step" field. If empty, the opportunity card shows a warning badge.

Features:
- Activity log per opportunity (call happened, message sent, proposal delivered, meeting booked)
- BAMFAM tracker with next_meeting_at and next_meeting_type fields
- Pre-call prep checklist auto-filled from opportunity data (project basics, token status, competitors, insight drops)
- Existing TG integration linked to activity timeline

---

### Sales Dashboard (New Page)

**Phil's Metrics:** DMs sent (target: 100/week), response rate (target: 3-4%), meetings booked (target: 4-5/week), qualified rate (A+B target: 70%+), value touches completed

**Jdot's Metrics:** Discovery calls (target: 3-4/week), close rate for Bucket A (target: 75%+), avg deal size (target: $60K+), avg close time (target: 7-14 days), Bucket A percentage (target: 50%)

**Pipeline Summary:** Total pipeline value, active deals, overdue follow-ups, BAMFAM violations

**Path A vs B Filter:** Every metric can be filtered by `dm_account` to compare performance across booking paths.

### No-Show & Contract Alerts

| Alert | Trigger | Action |
|---|---|---|
| No-Show | Booked lead doesn't show for discovery | 3-day reschedule window (auto-task). Day 3 no response → Orbit (reason: ghost) |
| Contract Unsigned | Contract sent but not signed after 3 days | Alert Closer + Founder. Auto-task to follow up. |

### Weekly Rhythm Report (Auto-generated Monday)

Sent to team TG channel every Monday:
- **Last week:** Deals closed, revenue, conversion rates, DMs sent (by account), meetings run
- **This week:** Scheduled calls, proposals due, nurture touches queued, follow-ups overdue
- **Alerts:** Stale leads (no contact 7+ days), BAMFAM violations, no-shows pending reschedule, unsigned contracts, Bucket B leads ready for re-assessment

---

### AI Integration (Holo GPT Upgrade)

Leverages existing `agentOrchestrator.ts` and `agentTools.ts`. New agent tools added:

| Tool | What It Does |
|---|---|
| Pre-Call Research Agent | Auto-generates prep doc: project basics, token data, competitor Korea presence, suggested insight drops, bucket prediction |
| Message Composer | Drafts personalized messages using playbook templates + opportunity context. Phil reviews and sends. |
| Bucket Scoring Engine | Analyzes call notes against playbook criteria and suggests bucket classification with reasoning |
| Objection Coach | Surfaces playbook response scripts + NEPQ framework steps when objection type is logged |
| Trigger Event Scanner | Monitors competitor announcements, exchange listings, funding rounds via RSS/APIs. Auto-creates re-engagement tasks. |
| Proposal Generator | Drafts proposals from opportunity data: situation recap, Korea opportunity sizing, scope, pricing. Cuts prep from 2 hours to 20 minutes. |

---

## Database Changes

### Modified Tables

**`crm_opportunities` — Add ~25 fields:**

Phase 1a fields:
- `bucket` (enum: A/B/C)
- `temperature_score` (integer 0-100)
- `dm_account` (enum: closer/sdr/other) — routing key
- `bump_number` (integer 0-4)
- `last_bump_date` (timestamp)
- `warm_sub_state` (enum: interested/silent)
- `tg_handle` (text)
- `calendly_sent_via` (enum: dm/tg/not_yet)
- `calendly_sent_date` (timestamp)
- `calendly_booked_date` (timestamp)
- `gc_opened` (enum: na/not_yet/opened)
- `orbit_reason` (enum: no_response/not_now/ghost/has_team/hard_no)
- `closed_lost_reason` (text)
- `dedup_key` (text — unique constraint on project name + handle)
- `next_meeting_at` (timestamp)
- `next_meeting_type` (text)
- `bucket_changed_at` (timestamp)
- `discovery_call_at` (timestamp)
- `proposal_sent_at` (timestamp)

Phase 1b fields:
- `orbit_cadence_days` (integer)
- `orbit_touch_number` (integer)
- `resurrect_count` (integer)
- `gc_opened_date` (timestamp)
- `no_show` (boolean)
- `contract_sent_date` (timestamp)
- `contract_signed_date` (timestamp)
- `kickoff_date` (timestamp)

**`crm_contacts` — Add 2 fields:**
- `is_decision_maker` (boolean)
- `influence_level` (enum: champion/influencer/blocker)

**`message_templates` — Add 5 fields:**
- `pipeline_stage` (text)
- `bucket` (text)
- `dm_account` (text — for path-specific templates)
- `sequence_day` (integer)
- `playbook_section` (text)

### New Tables (7)

| Table | Key Columns | Purpose |
|---|---|---|
| `crm_activities` | opportunity_id, type (call/message/meeting/proposal/note), title, description, outcome, next_step, next_step_date, owner_id | Activity timeline + BAMFAM enforcement |
| `crm_sequences` | opportunity_id, sequence_type (7 types), started_at, status (active/paused/completed), current_step | Track active sequences per opportunity |
| `crm_sequence_steps` | sequence_id, step_number, due_date, action_type, template_id, status (pending/done/skipped), completed_at | Individual steps with due dates + templates |
| `crm_trigger_events` | event_type, description, source_url, relevant_categories (array), matched_opportunities (array) | Market trigger events for re-engagement |
| `crm_call_preps` | opportunity_id, project_basics, token_status, recent_news, competitors, korea_presence, insight_drops (array), call_objective | Structured pre-call prep docs |
| `crm_proposals` | opportunity_id, proposal_type (full/audit), situation_recap, scope_section, investment_terms, status (draft/sent/viewed/accepted/rejected) | Proposal builder + tracking |
| `sales_metrics_daily` | date, user_id, dms_sent, responses_received, meetings_booked, discovery_calls, proposals_sent, deals_closed, revenue_closed | Daily snapshots for dashboard + reports |

---

## Implementation Roadmap

### Phase 1a — Correct Pipeline + Core Fields + Cold Sequence

**Deliverables:**
1. Add all Phase 1a fields to `crm_opportunities` (dm_account, bump_number, warm_sub_state, tg_handle, calendly fields, orbit_reason, dedup_key, etc.)
2. Create `crm_activities` table
3. Create `crm_sequences` + `crm_sequence_steps` tables
4. Implement correct pipeline stages (Cold DM → Warm → TG → Booked → Discovery Done → Proposal Sent → Proposal Call → Contract → Closed Won)
5. Add Orbit and Closed Lost exit lanes with reason fields
6. Add bucket field + temperature score to opportunities
7. Build cold outreach 5-bump sequence (cron Edge Function)
8. Build activity timeline UI per opportunity
9. Add BAMFAM next_meeting tracking with warning badges
10. Add decision-maker flag to contacts
11. Implement dedup check on lead creation (project name + handle)
12. Update pipeline Kanban/table views for new stages

**Value:** Pipeline accurately reflects two-path reality. Cold outreach is tracked and automated. Duplicates prevented. Every opportunity has a bucket, activity history, and BAMFAM compliance.

### Phase 1b — Calendly + Orbit + Templates

**Deliverables:**
1. Calendly webhook Edge Function (`invitee.created` → auto-move to Booked)
2. TG booking nudge sequence (Path B: Day 2, 5, 10, 14 → Orbit)
3. Full Orbit system: 5 reasons, two cadences (45d/60d), resurrection flow
4. Add Phase 1b fields (orbit_cadence_days, no_show, contract dates, etc.)
5. No-show tracking (flag + 3-day reschedule window auto-task)
6. Contract alerts (3-day unsigned → alert Closer + Founder)
7. Link message templates to stages + buckets + dm_account
8. Build template auto-surfacing UI on opportunity detail
9. Build pre-call prep checklist form
10. Dashboard: split metrics by dm_account dimension

**Value:** Calendly auto-updates pipeline. Orbit nurtures cold leads long-term. Templates surface at the right stage for the right path. No-shows and stale contracts flagged automatically.

### Phase 2 — Automation + Dashboard + Reports

**Deliverables:**
1. Build generic sequence engine for all 7 types (cron runner)
2. Implement: Fast Track, 21-Day Nurture, Post-Proposal Silence, Monthly Nurture, Orbit touch sequences
3. Create `sales_metrics_daily` table + daily snapshot Edge Function
4. Build Sales Dashboard page (Phil metrics, Jdot metrics, pipeline summary, Path A vs B filter)
5. Build weekly Monday report auto-generation → TG channel
6. Create `crm_proposals` table + proposal tracker UI

**Value:** Follow-ups happen automatically. No lead falls through the cracks. Metrics are real-time with Path A/B comparison. Monday standups have data.

### Phase 3 — Intelligence (AI)

**Deliverables:**
1. Add playbook knowledge to Holo GPT (new agent tools)
2. Auto-generate pre-call research docs via AI
3. AI-assisted bucket scoring from call notes
4. Build trigger event scanner (RSS/API monitoring)
5. Create `crm_trigger_events` table + auto-match to B/C leads
6. AI proposal generator from opportunity context
7. Objection handling coach (real-time script surfacing)

**Value:** The CRM doesn't just track — it thinks. Prep time drops 80%. Proposals drafted in minutes. No market signal missed.

---

## Before & After

| Before (Playbook as Document) | After (Playbook in CRM) |
|---|---|
| Team reads 17-section PDF and tries to remember | Two-path routing baked into every stage |
| Follow-ups tracked in heads or scattered notes | 5-bump cold outreach runs automatically per lead |
| No visibility into DM volume or response rates | Calendly integration auto-moves leads to Booked |
| Proposals built from scratch each time | Every follow-up is queued, templated, and tracked |
| Bucket classification is a mental exercise | Orbit system nurtures cold leads with the right cadence |
| Trigger events noticed by chance | Real-time dashboard with Path A vs B comparison |
| BAMFAM is aspirational, not enforced | Dedup prevents double-contacting from multiple accounts |
| Weekly rhythm depends on discipline | No-shows get 3-day reschedule window, then Orbit |
| No way to measure playbook compliance | BAMFAM enforced with warnings on every opportunity |
| — | Monday report auto-generated and sent to TG |
| — | Full audit trail of playbook execution per deal |

---

**The Goal:** When a new salesperson joins, they don't read the playbook — they open the CRM, and the playbook tells them exactly what to do next. Every lead, every day, every touchpoint. No guesswork.
