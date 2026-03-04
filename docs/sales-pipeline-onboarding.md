# Sales Pipeline — Onboarding Guide

Welcome to the Holo Hive Sales Pipeline! This guide walks you through everything you need to know to manage your outreach, close deals, and keep your pipeline healthy.

---

## Table of Contents

1. [Overview — How the Pipeline Works](#1-overview--how-the-pipeline-works)
2. [Getting Started — Adding Opportunities](#2-getting-started--adding-opportunities)
3. [Understanding Stages](#3-understanding-stages)
4. [The Actions Tab — Your Daily To-Do List](#4-the-actions-tab--your-daily-to-do-list)
5. [Cold DM Outreach & The Bump System](#5-cold-dm-outreach--the-bump-system)
6. [Moving Through the Pipeline](#6-moving-through-the-pipeline)
7. [The Opportunity Detail Panel](#7-the-opportunity-detail-panel)
8. [Pipeline View — Table & Kanban](#8-pipeline-view--table--kanban)
9. [Overall Tab — Your Big Picture View](#9-overall-tab--your-big-picture-view)
10. [Orbit — Managing Shelved Deals](#10-orbit--managing-shelved-deals)
11. [Templates — Quick Message Copy](#11-templates--quick-message-copy)
12. [Dashboard & Metrics](#12-dashboard--metrics)
13. [Tips & Best Practices](#13-tips--best-practices)

---

## 1. Overview — How the Pipeline Works

The Sales Pipeline tracks every potential deal from first contact to closed-won. Each opportunity flows through **stages**, and the system tells you exactly what to do next via **actions**.

### The Stage Flow

```
Cold DM → Warm → TG Intro → Booked → Discovery Done → Proposal Call → Contract → Closed Won
                                                                          ↓
                                                                        Orbit (shelved)
                                                                          ↓
                                                                      Closed Lost
```

At the top of the page, you'll see **alert cards** that highlight anything needing immediate attention:

| Card | What It Means |
|------|--------------|
| **Booking Needed** | Deals past discovery with no future meeting set (BAMFAM violation) |
| **Overdue** | A meeting happened but you haven't logged the outcome |
| **Stale (7d+)** | Deals with no contact in 7+ days |
| **At Risk** | Closing-stage deals with a low temperature score |
| **Meetings** | How many meetings you have today / this week |

---

## 2. Getting Started — Adding Opportunities

Click the **"+ New"** button at the top right to create an opportunity.

### Required Fields
- **Name** — The company or contact name

### Recommended Fields
- **POC Platform & Handle** — Where you first reached out (Twitter, Instagram, Telegram, etc.) and their handle
- **Owner** — Who on the team owns this deal
- **Source** — How you found them:
  - *Cold Outreach* — You reached out first (affiliate field is hidden for this source)
  - *Referral* — Someone introduced you (a "Referrer" field appears)
  - *Inbound, Event, Twitter, LinkedIn, Telegram, Website*

### Affiliate (for non-cold-outreach sources)
If the deal came through an affiliate or partner, use the searchable dropdown to select one. If the affiliate doesn't exist yet, just type their name and click **"Add [name] as new affiliate"** — it's created instantly.

### Notes
Add any context that will help you or your team understand the deal.

---

## 3. Understanding Stages

Each stage represents where the deal currently sits in your sales process:

| Stage | What's Happening |
|-------|-----------------|
| **Cold DM** | You've identified a lead and are reaching out via DM |
| **Warm** | They've responded to your outreach |
| **TG Intro** | You've connected on Telegram |
| **Booked** | A discovery call is scheduled |
| **Discovery Done** | The discovery call happened, you understand their needs |
| **Proposal Call** | Time to present your proposal on a call |
| **Contract** | Proposal accepted, chasing the signature |
| **Closed Won** | Deal signed! |
| **Orbit** | Deal shelved — not the right time, but may revisit |
| **Closed Lost** | Deal didn't work out |
| **Nurture** | Long-term relationship, periodic check-ins |

### Color Coding
Each stage has its own color throughout the app — in badges, kanban columns, and table headers — so you can quickly identify where deals are at a glance.

---

## 4. The Actions Tab — Your Daily To-Do List

The **Actions tab** is the heart of the pipeline. It scans all your opportunities and tells you exactly what needs to happen next, ranked by priority.

### Priority Levels

| Icon | Priority | Meaning |
|------|----------|---------|
| Red triangle | **Urgent** | Do this now — overdue meetings, BAMFAM violations |
| Amber lightning | **High** | Should do today — bumps due, follow-ups needed |
| Blue clock | **Medium** | Can wait a bit — periodic check-ins |
| Gray clock | **Low/Wait** | No action needed yet — meeting is upcoming, cooling period |

### How Actions Work

Each opportunity gets **one primary action** based on its stage and status. For example:

- A cold DM with no bumps → **"Send First DM"**
- A cold DM bumped 4 days ago → **"Bump #2"**
- A warm/interested deal → **"Get TG Handle"**
- A booked deal with a past meeting → **"Discovery Done"**
- A proposal_call deal → **"Send Proposal"**

### Quick Actions & Alternatives

Next to the primary action button, you'll often see:
- **Quick action** (green button) — A common shortcut. For example, "Replied!" instantly moves a cold DM to warm.
- **Dropdown arrow** — More options like "Orbit", "Lost", or stage-specific alternatives.

### Filtering Actions

Use the tabs at the top to focus:
- **All** — Everything actionable
- **Outreach** — Cold DM, Warm, TG Intro, Booked stages
- **Closing** — Discovery Done, Proposal Call, Contract stages
- **Orbit** — Deals in orbit that may need attention
- **Waiting** — Deals in a cooling period (bump cooldowns, nurturing)

You can also filter by:
- **My Actions** — Only your deals
- **All Actions** — Everyone's deals

### Sorting

Sort your actions by Priority (default), Stage, Temperature, Deal Value, Name, Newest, or Oldest. Your sort preference is saved automatically.

---

## 5. Cold DM Outreach & The Bump System

The **Outreach tab** is dedicated to your cold DM pipeline with advanced filtering, pagination, and bulk operations.

### The Bump Lifecycle

Bumps track how many times you've reached out to a lead:

1. **Bump #0** → Action: "Send First DM"
2. **After sending** → bump_number becomes 1, 3-day cooldown starts
3. **During cooldown** → Action: "Wait Xd" (shows days remaining)
4. **After 3 days** → Action: "Bump #2"
5. **Repeat** up to 4 bumps
6. **After 4 bumps with no reply** → Action: "Review → Orbit"

> **Important:** During the "Wait" period, you can still mark a lead as "Replied!" if they respond — the action stays visible with a quick "Replied!" button.

### If They Reply

At any point, if a lead replies, click **"Replied!"** to move them to the **Warm** stage.

### Outreach Filters

- **Owner tabs** — Filter by team member or view all
- **Search** — Find opportunities by name
- **Path** — Closer (Path A) or SDR (Path B)
- **Bucket** — A, B, or C priority
- **Bump Status** — No bumps, 1-2 bumps, 3+ bumps

### Bulk Operations

Select multiple opportunities using the checkboxes, then:
- **Bump All** — Record a bump for all selected
- **Move to Warm** — Advance all to warm (they replied!)
- **Delete** — Remove selected opportunities

---

## 6. Moving Through the Pipeline

As deals progress, different prompts and actions guide you:

### Warm → TG Intro: "Got TG!"

When you click "Got TG!" (either as a quick action or from the dropdown), a dialog asks you to **enter their Telegram handle**. This saves the handle and moves the deal forward.

### Booked → Discovery Done: Bucket Assignment

After marking a deal as "Discovery Done" (the discovery call happened), you're prompted to **assign a bucket**:

| Bucket | Meaning |
|--------|---------|
| **A — Hot** | High intent, likely to close |
| **B — Warm** | Interested but needs nurturing |
| **C — Low** | Lower priority, longer timeline |

This helps prioritize your pipeline and shows up in the temperature score calculation.

### Proposal Call → Send Proposal → Contract

The proposal call stage has a two-step flow:
1. **"Send Proposal"** — Click this after the call to mark the proposal as sent. An activity log popup lets you record details.
2. **"To Contract"** — After the proposal is sent, this becomes the next action to move the deal into the contract stage.

### Contract → Closed Won: "Chase Signature"

In the contract stage, "Chase Signature" is your primary action (records a follow-up activity). Use the **"Signed!"** quick action when the deal closes.

Need to schedule another call? Use **"Schedule Call"** from the dropdown.

### Moving to Orbit

When a deal stalls, you can move it to **Orbit** from any stage. You'll be asked to select a reason:
- No Response
- Bad Timing
- No Budget
- Went with Competitor
- Other

Deals in orbit for 90+ days will surface a "Resurrect" action to re-engage them.

### Closing a Deal as Lost

Moving to "Closed Lost" prompts you for an optional reason. This helps track why deals don't close.

---

## 7. The Opportunity Detail Panel

Click any opportunity name to open the **slide-over panel** on the right side. This is your command center for a single deal.

### What You'll See

- **Header** — Name, stage badge, bucket, path, deal value
- **Details card** — Temperature score, owner, POC info, TG handle, source, next meeting, last contacted
- **Notes** — Any context about the deal

### Editing

Click the **pencil icon** to enter edit mode. You can update:
- Name, POC, owner, source, stage
- Deal value, currency
- TG handle, meeting date/time
- Notes and all other fields

### Bump Controls (Cold DM only)

A visual progress tracker shows bumps 1-4 as dots. Use the **+** and **-** buttons to manually adjust the bump count.

### Quick Actions

- **Move to Orbit** — Orange button at the bottom
- **Delete** — Red button (use carefully!)
- **Move to Stage** — Dropdown to manually move to any stage

### Activity Timeline

The bottom of the panel shows a chronological timeline of all activities:
- Notes, calls, messages, meetings, proposals, bumps
- Each has a type icon, title, description, outcome, and next steps

**To add an activity**, fill in the form at the top of the timeline section:
1. Select the type (Note, Call, Message, Meeting, Proposal)
2. Add a title and optional details
3. Set outcome, next step, and dates as needed
4. Click "Add"

---

## 8. Pipeline View — Table & Kanban

The **Pipeline tab** shows all active opportunities (non-orbit, non-closed) in two views:

### Table View (Default)

- Opportunities grouped by stage with collapsible headers
- Each header shows the stage name, count, and total deal value
- **Drag and drop** rows to reorder within a stage (use the grip handle on the left)
- **Click a name or deal value** to edit it inline
- **Click a row** to open the detail panel

### Kanban View

- Vertical columns for each stage
- **Drag cards** between columns to change stages
- Cards show key info: name, value, bucket, temperature, bump progress
- Collapsible columns with chevrons
- Drop zones for "Orbit" and "Lost" on the sides

### Path Filter

Use the dropdown to filter by:
- **All Paths** — See everything
- **Path A (Closer)** — Direct closer pipeline
- **Path B (SDR)** — SDR-led pipeline

---

## 9. Overall Tab — Your Big Picture View

The **Overall tab** gives you a consolidated view with three collapsible sections:

1. **Outreach** (blue) — Your full cold DM pipeline
2. **Pipeline** (green) — All active deals in table view
3. **Orbit** (amber) — Shelved deals

The tab badge shows the **total count of active opportunities** (excluding closed won and closed lost).

Click any section header to expand/collapse it. This is great for a quick daily review without switching between tabs.

---

## 10. Orbit — Managing Shelved Deals

The **Orbit tab** groups shelved deals by their orbit reason (No Response, Bad Timing, No Budget, etc.).

Each group shows:
- The reason label and count
- A table with deal details, time in orbit, and last contacted date

### What Happens Over Time

- Deals in orbit for **90+ days** get a "Resurrect" action in the Actions tab
- You can manually resurrect a deal from the orbit tab's menu → moves it back to Cold DM
- Or mark it as Lost if it's truly dead

---

## 11. Templates — Quick Message Copy

The **Templates tab** stores reusable DM and message templates for each pipeline stage.

### Browsing Templates

Use the **stage filter pills** at the top to filter:
- All, Cold DM, Warm, TG Intro, Booked, Discovery Done, Proposal Call, Contract, Bumps

Each template card shows:
- Name and stage/sub-type badges
- Content preview
- Variable placeholders (e.g., `[KOL_NAME]`, `[PROJECT_NAME]`)

### Using a Template

Click the **copy icon** on any template card to copy the content to your clipboard. Then paste it into your DM and replace the placeholders.

### Creating a Template

1. Click **"+ New Template"**
2. Fill in:
   - **Name** — A descriptive label (e.g., "Cold DM — Crypto Project Intro")
   - **Stage** — Which stage this template is for
   - **Sub-type** — For bumps: Bump 1, Bump 2, Bump 3. For others: General, Initial, Follow-up
   - **Content** — Your message. Use `[KOL_NAME]`, `[PROJECT_NAME]`, etc. as placeholders
3. Click **"Create Template"**

### Editing & Deleting

- **Edit** — Click the pencil icon on a template card
- **Delete** — Click the trash icon (immediate, no confirmation)

### Pre-loaded Templates

The system comes with default templates:
- Cold DM — Initial Outreach
- Bump 1, 2, 3 — Escalating follow-ups
- Warm — Reply follow-up
- TG Intro — First Telegram message

---

## 12. Dashboard & Metrics

Click the **"Sales Dashboard"** header at the top of the page to expand detailed analytics.

### Pipeline Health

| Metric | What It Shows |
|--------|--------------|
| Pipeline Value | Total deal value of all active opportunities |
| Weighted Pipeline | Deal values weighted by stage probability (Cold DM = 5%, Contract = 90%) |
| Active Deals | Count of non-closed/non-orbit deals |
| Revenue | Total value of closed-won deals |
| Deals Won | Number of closed-won deals |
| In Orbit | Number of shelved deals |

### Conversion Funnel

A visual bar chart showing how many deals pass through each stage — from DMs sent all the way to closed won. Helps identify where deals drop off.

### Key Rates

- **Response Rate** — % of cold DMs that got a reply
- **Close Rate** — Won / (Won + Lost)
- **Avg Deal Size** — Mean value of closed-won deals
- **Avg Close Time** — Days from created to closed
- **Qualified %** — Bucket A + B as % of total
- **Bucket A %** — Top-tier deals as % of total

### Bottleneck Analysis

Shows you:
- **Biggest Drop-off** — The stage where you lose the most deals
- **Slowest Stage** — Where deals sit the longest
- A full conversion table with stage-by-stage breakdown

### Temperature Score

Each opportunity has an auto-calculated temperature (0-100) based on:
- Bucket assignment (A = 40 base, B = 25, C = 10)
- How recently you've been in contact
- Number of logged activities
- Whether a meeting is booked
- Stage progression bonuses
- Penalties for stale deals, bump exhaustion, or silent warm leads

Use the **"Recalc Scores"** button to refresh all scores.

---

## 13. Tips & Best Practices

### Daily Workflow
1. Open the **Actions tab** — this is your to-do list
2. Work through urgent items first (red), then high (amber)
3. Check the **alert cards** at the top for anything critical
4. Log activities as you go — the system tracks everything

### BAMFAM Rule
**B**ook **A** **M**eeting **F**rom **A** **M**eeting. After any call past discovery, always schedule the next meeting before hanging up. The system enforces this — deals without a future meeting get flagged.

### Keep It Moving
- Don't let deals sit in a stage for too long without action
- The "Stale 7d+" alert catches deals you might have forgotten
- Temperature scores drop when deals go cold — use them as a health check

### Use Templates
Don't write every DM from scratch. Copy a template, personalize the placeholders, and send. Consistency + speed.

### Activity Logging
Every time you interact with a lead (DM, call, meeting, proposal), log it. This builds a timeline that helps your whole team understand where things stand — and it improves your temperature scores.

### When to Orbit
If a lead goes silent after 3-4 bumps, or if timing/budget isn't right, move them to Orbit rather than keeping them clogging your pipeline. They'll surface again in 90 days via the "Resurrect" action.

---

*Happy selling! If you have questions, reach out to your team lead or check the in-app guidance hints that appear with each action.*
