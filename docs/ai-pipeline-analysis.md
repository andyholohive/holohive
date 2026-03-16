# AI Pipeline Analysis — Implementation Plan

## Overview

AI-powered analysis of the sales pipeline activity timeline to surface insights on deal progression, messaging effectiveness, rep performance, and pipeline health. Uses Supabase Edge Functions + Claude API.

---

## Data Available for Analysis

| Source | Fields | What AI Can Analyze |
|--------|--------|-------------------|
| `crm_activities` | type, title, description, outcome, next_step, attachment_url, created_at | Message content, outcomes, activity cadence, follow-up patterns |
| `crm_stage_history` | from_stage, to_stage, changed_by, changed_at, notes | Stage velocity, where deals stall, drop-off points, conversion rates |
| `crm_opportunities` | stage, deal_value, source, bump_number, temperature_score, bucket, orbit_reason, closed_lost_reason, warm_sub_state, poc_platform, dm_account | Deal characteristics, engagement scoring, loss reasons |
| `sales_dm_templates` | stage, sub_type, content, variables | Template usage and effectiveness |
| Opportunity timestamps | discovery_call_at, proposal_sent_at, calendly_sent_date, calendly_booked_date, last_contacted_at, last_bump_date, closed_at, created_at | Full velocity data, time-in-stage, response latency |

---

## Pre-Requisite Data Improvements

### Migration 1: Add `template_id` to `crm_activities`

Track which DM template was used per activity so AI can correlate template → outcome.

```sql
ALTER TABLE crm_activities ADD COLUMN template_id UUID REFERENCES sales_dm_templates(id);
```

Update the activity creation flow in `openActivityLogPrompt` / `confirmActivityLog` to pass the selected template ID.

### Migration 2: Add `outcome_type` enum to `crm_activities`

Structured outcome tagging for quantitative analysis instead of free-text parsing.

```sql
CREATE TYPE activity_outcome_type AS ENUM ('replied', 'no_reply', 'booked', 'objection', 'ghosted', 'completed', 'other');
ALTER TABLE crm_activities ADD COLUMN outcome_type activity_outcome_type;
```

Add a quick-select for outcome type in the activity log popup.

### Migration 3: Create `pipeline_insights` cache table

```sql
CREATE TABLE pipeline_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_type TEXT NOT NULL,
  scope TEXT NOT NULL,              -- opportunity ID or 'global'
  insight JSONB NOT NULL,
  model TEXT,                       -- e.g. 'claude-sonnet-4-6'
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_pipeline_insights_scope ON pipeline_insights(analysis_type, scope);
```

---

## Edge Function: `analyze-pipeline`

Single Supabase Edge Function that accepts `analysis_type` and optional `opportunity_id`.

### Endpoint

```
POST /functions/v1/analyze-pipeline
Authorization: Bearer <user-jwt>
Content-Type: application/json

{
  "analysis_type": "opportunity_summary",
  "opportunity_id": "uuid",     // required for opp-level analyses
  "force_refresh": false         // skip cache
}
```

### Analysis Types

#### 1. `opportunity_summary` (per-opp)

**Input:** All activities, stage history, and opp metadata for a single opportunity.

**Output:**
```json
{
  "summary": "3-sentence deal summary",
  "risk_level": "low | medium | high",
  "risk_factors": ["No contact in 12 days", "Stuck in discovery_done for 2 weeks"],
  "next_best_action": "Send a follow-up referencing their Q2 budget cycle",
  "days_in_pipeline": 34,
  "engagement_trend": "declining | stable | improving"
}
```

#### 2. `win_loss_patterns` (global)

**Input:** All closed_won and closed_lost opportunities with their full activity + stage history.

**Output:**
```json
{
  "winning_patterns": [
    "Deals that book a discovery call within 5 days of first DM close at 3x the rate",
    "Proposals sent within 48hrs of discovery have 70% close rate"
  ],
  "losing_patterns": [
    "Deals with 4+ bumps before warm rarely convert",
    "Orbit → re-engage has a 12% success rate"
  ],
  "avg_winning_timeline": { "cold_dm_to_warm": "3d", "warm_to_booked": "5d", "booked_to_closed": "18d" },
  "top_loss_reasons": [{ "reason": "no_budget", "count": 12 }, { "reason": "competitor", "count": 8 }]
}
```

#### 3. `stage_bottlenecks` (global)

**Input:** Stage history for all opportunities, grouped by stage transitions.

**Output:**
```json
{
  "bottlenecks": [
    { "stage": "discovery_done", "avg_days": 14, "median_days": 10, "drop_off_rate": 0.35 },
    { "stage": "warm", "avg_days": 7, "median_days": 4, "drop_off_rate": 0.45 }
  ],
  "conversion_funnel": { "cold_dm": 100, "warm": 42, "booked": 28, "discovery_done": 22, "proposal_call": 15, "v2_contract": 10, "v2_closed_won": 8 },
  "recommendations": ["Focus on warm→booked conversion — highest drop-off point"]
}
```

#### 4. `messaging_effectiveness` (global)

**Input:** All message activities with template_id, outcome_type, and the opp's subsequent stage changes.

**Output:**
```json
{
  "template_performance": [
    { "template_name": "Cold DM v2", "sent_count": 45, "reply_rate": 0.31, "book_rate": 0.12 },
    { "template_name": "Follow-up Nudge", "sent_count": 30, "reply_rate": 0.20, "book_rate": 0.07 }
  ],
  "best_performing_openers": ["Templates mentioning specific project metrics get 2x replies"],
  "optimal_follow_up_cadence": "3 days between bumps yields best response rate",
  "platform_effectiveness": { "twitter": { "reply_rate": 0.35 }, "telegram": { "reply_rate": 0.28 } }
}
```

#### 5. `rep_performance` (global)

**Input:** Opportunities and activities grouped by owner_id.

**Output:**
```json
{
  "reps": [
    {
      "owner_id": "uuid",
      "name": "Rep Name",
      "deals_closed": 5,
      "close_rate": 0.22,
      "avg_deal_size": 15000,
      "avg_close_time_days": 24,
      "response_rate": 0.38,
      "strengths": ["Fast follow-up cadence", "High discovery→proposal conversion"],
      "areas_to_improve": ["Warm leads going stale — avg 8 days without contact"]
    }
  ]
}
```

#### 6. `pipeline_health` (global)

**Input:** All active opportunities with current metrics.

**Output:**
```json
{
  "total_pipeline_value": 250000,
  "weighted_pipeline_value": 85000,
  "forecast_accuracy_note": "Based on stage probabilities",
  "at_risk_deals": [{ "name": "Opp X", "reason": "No activity in 14 days, temperature dropping" }],
  "stale_deals_count": 5,
  "health_score": 72,
  "top_recommendations": [
    "5 deals in warm have not been contacted in 7+ days",
    "3 proposals outstanding for 10+ days — follow up or close out"
  ]
}
```

---

## Edge Function Implementation Skeleton

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { analysis_type, opportunity_id, force_refresh } = await req.json();

  // 1. Check cache (skip if force_refresh)
  if (!force_refresh) {
    const scope = opportunity_id || "global";
    const { data: cached } = await supabase
      .from("pipeline_insights")
      .select("insight")
      .eq("analysis_type", analysis_type)
      .eq("scope", scope)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (cached) return Response.json(cached.insight);
  }

  // 2. Fetch relevant data based on analysis_type
  const context = await gatherContext(supabase, analysis_type, opportunity_id);

  // 3. Call Claude API
  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
  const systemPrompt = getSystemPrompt(analysis_type);
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: "user", content: JSON.stringify(context) }],
  });

  const insight = JSON.parse(response.content[0].text);

  // 4. Cache result
  await supabase.from("pipeline_insights").insert({
    analysis_type,
    scope: opportunity_id || "global",
    insight,
    model: "claude-sonnet-4-6",
    tokens_used: response.usage.input_tokens + response.usage.output_tokens,
    expires_at: new Date(Date.now() + 1000 * 60 * 60 * (analysis_type.includes("summary") ? 1 : 24)).toISOString(),
  });

  return Response.json(insight);
});
```

---

## Frontend Integration

### Per-Opportunity: "AI Summary" in Slide-Over

Add a button in the slide-over header area:

```
[✨ AI Summary]  →  loading spinner  →  inline card with summary, risk, next action
```

- Call: `POST /functions/v1/analyze-pipeline { analysis_type: "opportunity_summary", opportunity_id }`
- Display inline in the slide-over, above the activity timeline
- Cache for 1 hour per opp

### Global: "Insights" Tab in Pipeline Page

New tab alongside Overview / Actions / Outreach / Orbit / Templates:

```
Overview | Actions | Outreach | Orbit | Templates | Insights
```

Sections:
1. **Pipeline Health** — health score gauge, at-risk deals, recommendations
2. **Stage Funnel** — visual conversion funnel with bottleneck highlights
3. **Win/Loss Patterns** — key findings with supporting data
4. **Messaging** — template leaderboard, cadence insights
5. **Rep Performance** — per-rep cards with strengths/improvements

Each section loads independently with its own loading state. Global insights cache for 24 hours.

---

## Implementation Order

| Step | What | Scope |
|------|------|-------|
| 1 | Migrations: `template_id`, `outcome_type` on activities, `pipeline_insights` table | Database |
| 2 | Update activity log popup: pass template_id on save, add outcome_type quick-select | `sales-pipeline/page.tsx` |
| 3 | Edge Function: `opportunity_summary` analysis type only | Edge Function |
| 4 | "AI Summary" button in slide-over | `sales-pipeline/page.tsx` |
| 5 | Edge Function: remaining analysis types (`win_loss_patterns`, `stage_bottlenecks`, `messaging_effectiveness`, `rep_performance`, `pipeline_health`) | Edge Function |
| 6 | "Insights" tab with all global sections | `sales-pipeline/page.tsx` |

---

## Cost Estimation

- **Per-opp summary**: ~1K input tokens, ~500 output → ~$0.005/call
- **Global analyses**: ~10-50K input tokens depending on deal count → ~$0.05-0.25/call
- **With 24hr caching on global + 1hr on per-opp**: Minimal daily cost for a team of 5-10

---

## Environment Variables Needed

```
ANTHROPIC_API_KEY=sk-ant-...
```

Add to Supabase Edge Function secrets via dashboard or CLI.
