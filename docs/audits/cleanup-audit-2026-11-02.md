# HoloHive Portal — what's outdated or unused (cleanup audit, 2026-11-02)

**Method.** Import graph over `app/`, `components/`, `lib/`, `hooks/`, `contexts/` (what nothing imports); API routes nothing calls; every production table cross-referenced against the code and its live row count; `agent_runs` for cron liveness; `depcheck` for npm; the repo tree for clutter. Row counts and dates are from production on 2026-11-02.

**Headline.** About 25,000 lines of code and roughly 20 tables belong to five features that are either switched off or were never used: the Legacy Sales board, the Holo GPT / AI-agent layer, the hidden Intelligence tabs, the RAG/embeddings layer, and Repost Deals. Separately, one scheduled job has silently stopped (the weekly strategic digest, last posted for the week of 10/12), and one hourly cron has run 1,777 times against a table that has never had a row.

---

## 1. Whole features that are dead or dormant

| # | Feature | Evidence | Size | Suggested action |
|---|---|---|---|---|
| 1 | **Legacy Sales board** (`/crm/sales-pipeline`) | Superseded by Pipeline v1.3 (Yano's 10/26 list built on the new one). Hidden from non-super-admins since 10/27. No component outside its own folder imports anything from it. | 3,168-line page + 8,690 lines in `components/crm/sales-pipeline/` + `lib/salesPipelineService.ts`, `lib/salesPipelineHelpers.ts` ≈ **12,500 lines** | Confirm with Yano that nothing on it is still needed (stage history, templates tab, activity log), then delete the route, folder and two libs. `bookings` reads in `salesPipelineService` move with Meetings (item 7). |
| 2 | **Holo GPT / AI assistant** (`/chat`, floating chat, workflow manager, message-template manager) | Nav gated off since 05/05. `FloatingChat` (1,229 lines) is mounted nowhere. Last chat message **2026-01-09**. `chat_sessions` 83 rows, `chat_messages` 250. | `app/chat` 1,119 + `components/ai/*` ≈ 3,100 + `lib/advancedAIService.ts`, `lib/openaiService.ts` ≈ **4,700 lines** | Delete the page, the six `components/ai/*` files, `advancedAIService`, and the two chat tables. `FloatingChatNew.tsx` is a 1-line stub. Keep `lib/openaiService.ts` only if `/api/ai` is used by anything else (it isn't referenced from the UI). |
| 3 | **Hidden Intelligence tabs**: Prospects, Korea Signals, Funding Radar, AI Agents, Call Briefs | Hidden "temporarily" in June per the comment in `app/intelligence/page.tsx`; five months later still hidden. Panels import nothing live. Backing tables: `call_briefs` 0 rows, `signals` 0, `prospect_intel` 0, `agent_handoffs` 0, `agent_action_history` 0, `agent_execution_logs` last write **2025-11-18**, `funding_rounds` last write 04/20. | `KoreaSignalsPanel` 1,486 + `ProspectsTab` 1,165 + `AgentDashboard` 695 + `FundingRadarPanel` 623 + `CallBriefPanel` 234 + `AIScoreDisplay` 168 ≈ **4,400 lines** | Decide per tab. Discovery and KR Exchanges are live and stay. The rest: delete the panel files and drop the six empty tables. `prospects` (4,862 rows, written daily by Discovery) stays. |
| 4 | **Scout / ColdCraft / Hermes agents** | `SCOUT` last ran **2026-04-01** (4 runs ever). `/api/agents/coldcraft`, `/api/agents/scheduled` last touched 04/03 and referenced by nothing. Hermes was evaluated and deferred (memory 07/17); `HERMES_SETUP.md`, `/api/hermes`, `/api/webhooks/hermes` remain. | `lib/agents/scoutAgent.ts`, `coldcraftAgent.ts`, `brains/*`, `ScoutQualifyDialog.tsx`, 4 API routes | Delete. If Hermes comes back it starts from a new spec anyway. |
| 5 | **RAG / embeddings layer** | `/api/embeddings` unreferenced since **2025-10-09**. `kol_embeddings` 373 rows last written 04/24 (**15 MB**, the largest non-log table), `client_embeddings` 4 rows, `campaign_embeddings` 0 rows but 1.6 MB of index. `lib/vectorStore.ts` is still imported by `agentOrchestrator`, `agentTools`, `kolService`, `/api/kols/index`. Root-level docs `QUICK_START_RAG.md`, `AUTO_INDEXING_COMPLETE.md`, `INDEXING_EXPLAINED.md`, `OPENAI_SETUP.md`. | ~1,000 lines + 18 MB | Check whether `kolService` actually calls the vector path in any live screen (likely only the old chat). If not: delete the three tables, `vectorStore`, `/api/embeddings`, `/api/kols/index`, and the four docs. |
| 6 | **Repost Deals** | Built 08/20. `repost_deals` and `repost_deal_offers` have **never had a row**. `REPOST_DEAL_EXPIRY` cron runs **hourly, 1,777 runs, always "0 expired"**. `/repost-deals` page is super-admin only. | `app/repost-deals` 410 + `lib/repostDealService.ts`, `lib/repostDealBot.ts`, 3 API routes, 1 cron | Either launch it (needs a KOL with `share_price`, only 1 has one) or park it: remove the cron from `vercel.json` now, keep the code one more quarter, then delete. |
| 7 | **Meetings / bookings** (`/crm/meetings`, `/public/book/[slug]`) | Andy hid the nav 08/18. `bookings` 6 rows, newest **03/06/2026**; `booking_pages` 7. Meetings are tracked in client call notes now. | `app/crm/meetings` 793 + `app/public/book/[slug]` 620 + `lib/bookingService.ts` | Delete both routes and the lib; drop the two tables after exporting the 6 rows if anyone wants the history. |
| 8 | **Monday Form v2** | Archived 07/09 when Daily Pulse replaced it. Table `monday_form_submissions` is empty and referenced by no code; two leftover mentions in `InternalTab.tsx` and the `dashboard-escalations` cron. | — | Drop the table, remove the two references. |
| 9 | **Wallet Analytics** (`/wallets`) | `wallet_analytics` 1,197 rows, last write **05/24**. Still in the sidebar. | 589-line page | Verify whether anyone opens it. If the data source stopped in May, the page is showing five-month-old numbers as if current. |
| 10 | **Task automations & task templates** | `task_automations` 0 rows, `task_automation_logs` 0, `task_templates` 0 (templates now live in `deliverable_templates`). `/tasks/automations` page exists, admin-gated. | 415-line page + 3 tables | Confirm with Jdot that automations were never configured, then delete the page and drop the three tables. |

## 2. Things that are broken rather than unused (found on the way)

- **Weekly strategic digest has stopped.** Cron is daily at 15:00 UTC; it last posted for the week of **10/12** (`weekly_strategic_digest_last_sent_week`), so the weeks of 10/19 and 10/26 were missed with no failure logged. Needs a look at why it decides not to send.
- **Discovery** has 8 failed runs out of 164 and the KR listings crons 32 + 28 failures (the CoinGecko 429s fixed 10/26; worth confirming the failure count stops climbing).
- `components/ui/alert-dialog.tsx` imports `@radix-ui/react-compose-refs`, which is not in `package.json`. It works only because another package pulls it in transitively. Add it explicitly.

## 3. API routes nothing calls

Delete unless marked keep.

| Route | Last touched | Note |
|---|---|---|
| `/api/embeddings` | 2025-10 | item 5 |
| `/api/analytics/sales-funnel` | 05/14 | legacy board |
| `/api/hermes/watchlist` | 04/20 | item 4 |
| `/api/agents/coldcraft`, `/api/agents/scheduled` | 04/03 | item 4 |
| `/api/tasks/cron`, `/api/tasks/weekly-report` | 07/06, 06/14 | not in `vercel.json`; **verify no external scheduler hits them** |
| `/api/dashboard/chats`, `/api/dashboard/v2/client` | 05/08, 08/14 | dashboard v1 leftovers |
| `/api/kols/scores-preview`, `/api/kols/rescore-snapshots` | 07/13, 08/19 | one-off admin tools from the scoring rebuild |
| `/api/links/reconcile` | 07/25 | one-off |
| `/api/repost-deals/[id]/close`, `/settle` | 08/20 | item 6 |
| `/api/initiatives/[id]` | 07/14 | check the Initiatives page doesn't build the URL dynamically |
| `/api/prospects/discovery/enrich-pocs` | 08/25 | check DiscoveryPanel doesn't build the URL dynamically |
| `/api/google/oauth/callback` | 05/08 | **keep** — it's Google's redirect target, not called from our code |

Two cron routes exist on disk but are not scheduled: `/api/cron/backfill-channel-tg-id` and `/api/cron/signals-scan` (both last touched 07/06). Delete `signals-scan` with item 3; `backfill-channel-tg-id` has an admin-button twin and can go.

## 4. Database

**Drop now, no code touches them:** `_backup_unfiled_action_items_20260729` (312 rows; verified safe 07/29), `gtm_phases` (0), `template_usage_analytics` (0), `monday_form_submissions` (0), `list_kols_history` (1 row), `site_funnel_counts` (61) and `site_inquiries` (2) if the marketing-site funnel is no longer wired to this project.

**Drop with their feature (sections above):** `chat_sessions`, `chat_messages`, `call_briefs`, `signals`, `prospect_intel`, `agent_handoffs`, `agent_action_history`, `agent_execution_logs`, `kol_embeddings`, `client_embeddings`, `campaign_embeddings`, `repost_deals`, `repost_deal_offers`, `bookings`, `booking_pages`, `task_automations`, `task_automation_logs`, `task_templates`.

**Empty but belong to live features, leave:** `client_renewal_packs` / `_views` (feature shipped 10/19, no pack made yet), `korea_scans` / `korea_scan_views` (Yano hasn't saved a scan yet), `kr_signal_alert_messages`, `meeting_action_items`, `outreach_drafts`, `pending_submissions`, `content_submission_approvers`, `form_task_mappings`, `form_submission_failures`, `external_costs`, `campaign_activations`, `client_mindshare_weekly`, `task_attachments`, `task_comments`, `tg_api_runs`. Worth a second look in Q1 if still empty.

`record_audit_log` has no code references by design (written by triggers). Keep.

## 5. Settings keys nothing reads

`lineup_approver_user_id`, `lineup_dm_approvers_enabled`, `renewal_alert_amber_days`, `renewal_alert_red_days`. Delete the rows so the next person doesn't assume they do something.

## 6. npm

Unused: `@dnd-kit/modifiers`, `@hookform/resolvers`, `@next/swc-wasm-nodejs`, `@radix-ui/react-progress`, `@supabase/auth-ui-react`, `@supabase/auth-ui-shared`, dev `tsx`. (`autoprefixer` and `postcss` are flagged but used by the build config; keep.) Missing: `@radix-ui/react-compose-refs` (section 2), and `pdfjs-dist` used by `scripts/copy-pdf-worker.mjs`.

## 7. Repo clutter

- **Root:** 15 markdown files from the AI/RAG build phases (`PHASE_1..4_SUMMARY.md`, `AGENTIC_AI_IMPLEMENTATION.md`, `MESSAGE_TEMPLATE_SYSTEM.md`, `HERMES_SETUP.md`, `OPENAI_SETUP.md`, `SUPABASE_SETUP.md`, `DATABASE_MIGRATION.md`, `run-migration.md`, the three indexing docs), `build-output.txt`, three one-off scripts (`extract_image.js`, `extract_profile_urls.js`, `get_image_url.js`), two HTML decks. Move anything still useful into `docs/`, delete the rest.
- **`docs/`:** `HoloHive_CRM_Demo (1).html` (a download), `Philton BD Tracker.csv` (a person's prospect list committed to the repo; should not live in git), several one-pagers in both `.md` and `.html` form.
- **`supabase/migrations/`:** 5 files, out of sync with production since January per CLAUDE.md. Either regenerate from prod or delete the folder so nobody runs them.
- **Unmounted components:** `VersionCheck.tsx` (2025-10), `components/krsignal/BriefClientTabs.tsx`, `components/ai/FloatingChatNew.tsx`.

## Suggested order

1. **No decisions needed, an hour:** drop the backup table and the six orphan tables, delete the four dead settings keys, remove the Repost Deal expiry cron from `vercel.json`, add `@radix-ui/react-compose-refs`, remove the six unused npm packages, delete root clutter and the CSV, delete the unmounted components and the two unscheduled cron routes.
2. **One question each, then delete:** Legacy Sales (Yano), task automations (Jdot), Wallet Analytics (whoever opened it last), Meetings/bookings (Andy already decided the nav; this finishes it).
3. **Half a day each:** Holo GPT layer, hidden Intelligence tabs + agents, embeddings layer. Each is a delete-and-verify-build pass.
4. **Fix, not cleanup:** the weekly strategic digest.

Total if everything above goes: roughly **25,000 lines, 25 tables, 18 MB**, and three crons that currently run for nothing.
