# HoloHive MCP Connector — Setup Guide

This adds HoloHive as a custom **MCP (Model Context Protocol) connector** in
Claude.ai, so you can ask Claude questions about your prospects, campaigns,
KOLs, and Korean exchange listings directly from a chat — no need to switch
tabs into HoloHive.

## What Claude can do once connected

**Twenty-five tools** are exposed across Discovery, Intelligence, CRM,
Clients, Campaigns, KOLs, Tasks, and Forms.

> **Note:** The MCP is intentionally **read-only** as of late April 2026.
> Claude can query and synthesize anything in the system, but cannot
> create, edit, or delete records. (A previous `log_crm_activity` write
> tool was removed.) This is by design — keeps the connector safe to
> grant to teammates without worrying about misinterpreted writes.

### Discovery & Intelligence
| Tool | What you'd ask Claude |
|------|------------------------|
| `list_recent_prospects` | "Show me reviewed-but-not-promoted prospects from CryptoRank in the last 14 days, sorted by Korea score" |
| `get_prospect_detail` | "Tell me everything about prospect X" |
| `get_recent_signals` | "Any new poc_korea_mention signals in the last 3 days?" |
| `get_kr_listings` | "Anything new on Upbit in the last 3 days?" |
| `get_intelligence_cost_summary` | "How much did Discovery cost this month? Where's the money going?" |

### CRM
| Tool | What you'd ask Claude |
|------|------------------------|
| `list_crm_opportunities` | "What's in my Deals pipeline at proposal or contract stage?" |
| `get_opportunity_detail` | "Full breakdown on opportunity X — scores, contacts, activity" |
| `crm_stage_summary` | "Show me my pipeline distribution across all stages" |
| `crm_followups_due` | "Who haven't I contacted in 7+ days?" |

### Clients
| Tool | What you'd ask Claude |
|------|------------------------|
| `list_clients` | "What clients are active? Search for 'Galxe'." |
| `get_client_detail` | "Quick info on this client — campaigns count, opps count" |
| `summarize_client` | "Give me everything about Galxe — campaigns, payments, opps, recent delivery logs" |

### Campaigns
| Tool | What you'd ask Claude |
|------|------------------------|
| `list_active_campaigns` | "What campaigns are running right now?" |
| `get_campaign_detail` | "Pull up the Solayer campaign — status, KOL roster, payments" |
| `list_campaign_kols` | "Who's signed on to this campaign? Show only confirmed." |
| `get_campaign_payments` | "Payment status across this campaign — paid vs pending" |

### KOLs
| Tool | What you'd ask Claude |
|------|------------------------|
| `search_kols` | "Find KOLs with 'crypto' in their name in Korea" |
| `list_top_kols` | "Top Tier 1 Korean DeFi KOLs with 100K+ followers" (no name needed) |
| `get_kol_detail` | "Full record on KOL X — pricing, niche, deliverables, link" |

### Tasks
| Tool | What you'd ask Claude |
|------|------------------------|
| `list_team_tasks` | "What's overdue across the team?" / "My open tasks due in the next 7 days" |
| `get_task_detail` | "Pull up that task — show me the description and latest comment" |

### Forms
| Tool | What you'd ask Claude |
|------|------------------------|
| `list_form_submissions` | "What form submissions came in this week?" |
| `get_form_submission_detail` | "Show me the answers for that submission" |

### Cross-cutting
| Tool | What you'd ask Claude |
|------|------------------------|
| `summarize_pipeline` | "Give me a high-level snapshot — Discovery + CRM + Campaigns" |
| `get_promoted_opportunity_for_prospect` | "Did Solayer get promoted? What stage is it in?" |

**All 25 tools are read-only.** Claude can query, search, summarize,
and synthesize anything in the system, but cannot create, edit, or
delete records. If you need a write tool back (e.g., `log_crm_activity`
for in-chat activity logging), the AsyncLocalStorage plumbing in
`lib/mcp/context.ts` is preserved — re-add the
`mcpAuthStorage.run(ctx, () => handler(req))` wrapper in
`app/api/mcp/[transport]/route.ts` and register the write tool. See
the git history for the previous `log_crm_activity` implementation.

---

## One-time setup (do this on Vercel before connecting)

Set these env vars on the production deployment:

```
MCP_ALLOWED_EMAILS=leeandy755@gmail.com
```

`MCP_ALLOWED_EMAILS` is a defense-in-depth gate. Even if a teammate has a
HoloHive login, they can't grant Claude.ai access to YOUR data unless their
email is on this list. For a single-user setup, just put your own email.
Comma-separated for multiple. Leave unset to skip the gate (any logged-in
HoloHive user could authorize a connector — fine if you trust everyone).

The other env vars (`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
etc.) are already set from the rest of the app — no new ones needed.

---

## Adding the connector in Claude.ai

1. **Open Claude.ai → Settings → Connectors → Add custom connector**
2. **Paste the URL:**
   ```
   https://app.holohive.io/api/mcp/mcp
   ```
   (Note: the `/mcp/mcp` is correct — the route is at `/api/mcp/[transport]`
   where transport='mcp' selects Streamable HTTP. Claude expects exactly this
   path.)
3. Claude.ai auto-discovers everything else via `/.well-known/oauth-authorization-server`.
4. Click **Connect** — Claude redirects you to `https://app.holohive.io/oauth/authorize`.
5. **Sign in** to HoloHive if you aren't already.
6. **Click Allow** on the consent screen.
7. You're back in Claude.ai. The connector now shows as connected.

That's it. Try asking:
- "What prospects came in this week?"
- "List active campaigns"
- "Show me the pipeline snapshot"

---

## How it works under the hood

- `/.well-known/oauth-authorization-server` — RFC 8414 metadata; tells Claude
  where to find the auth endpoints.
- `/.well-known/oauth-protected-resource` — RFC 9728 metadata; pairs the
  resource server with its authorization server.
- `/api/oauth/register` — RFC 7591 Dynamic Client Registration. Claude calls
  this once per connector install to mint a client_id/secret.
- `/oauth/authorize` — Consent UI. Verifies your HoloHive Supabase session,
  checks `MCP_ALLOWED_EMAILS`, shows Allow/Deny.
- `/api/oauth/consent` — Receives the form post; issues a 10-min single-use
  authorization code and redirects back to Claude.
- `/api/oauth/token` — Exchanges the code for a 1-hour bearer access token.
  Validates PKCE if used (Claude.ai always uses PKCE).
- `/api/mcp/[transport]` — The MCP server itself. Validates the bearer token
  against `mcp_oauth_access_tokens`, then dispatches to the registered tools.

All three new tables (`mcp_oauth_clients`, `mcp_oauth_auth_codes`,
`mcp_oauth_access_tokens`) have RLS enabled with no policies, so only the
service role can touch them.

---

## Revoking access

To revoke Claude's access:

```sql
-- Revoke ALL active tokens (kicks Claude.ai out, forces re-auth):
DELETE FROM mcp_oauth_access_tokens;

-- Or just the latest one:
DELETE FROM mcp_oauth_access_tokens
ORDER BY created_at DESC LIMIT 1;

-- Nuclear: also remove the registered client so Claude.ai has to re-register:
DELETE FROM mcp_oauth_clients WHERE client_name LIKE '%Claude%';
```

You can also remove the connector from Claude.ai's Settings → Connectors
panel, which triggers Claude to stop sending requests (the tokens still exist
server-side until you delete them or they expire 1h after issuance).

---

## Troubleshooting

**Claude.ai says "Failed to connect" after pasting the URL.**
Hit `/.well-known/oauth-authorization-server` directly in your browser —
should return JSON. If it 404s, Vercel hasn't deployed the new routes yet.

**Consent page shows "Not authorized".**
Your email isn't in `MCP_ALLOWED_EMAILS`. Update the env var on Vercel and
redeploy.

**Tools return "Unauthorized" mid-conversation.**
Token expired (1h TTL). Claude.ai should refresh automatically; if not,
disconnect and reconnect the connector.

**Server logs show `[MCP auth] Supabase config missing`.**
`SUPABASE_SERVICE_ROLE_KEY` or `NEXT_PUBLIC_SUPABASE_URL` isn't set on
Vercel. Check the Environment Variables panel.

---

## Adding more tools

Each tool is a small block in `lib/mcp/tools.ts` — a Zod input schema and an
async handler that returns a string. Wire it into `app/api/mcp/[transport]/route.ts`
with one `server.tool(...)` call. Type-check, deploy, done.

Examples of tools we might add later:
- `dismiss_prospect(id, reason)` — write tool, would need extra confirmation
- `summarize_campaign(id)` — KOL count, payment status, content metrics
- `recent_signals(prospect_id)` — full signal history for one prospect
- `crm_followups_due(days)` — opportunities with stale `last_contacted_at`
