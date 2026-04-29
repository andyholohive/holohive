import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { authenticateMcpRequest, unauthorizedResponse } from '@/lib/mcp/auth';
import { mcpAuthStorage } from '@/lib/mcp/context';
import {
  getServiceClient,
  listRecentProspects,
  listRecentProspectsSchema,
  getProspectDetail,
  getProspectDetailSchema,
  listActiveCampaigns,
  listActiveCampaignsSchema,
  searchKols,
  searchKolsSchema,
  getKrListings,
  getKrListingsSchema,
  summarizePipeline,
  summarizePipelineSchema,
  // Intelligence-deep tools
  getRecentSignals,
  getRecentSignalsSchema,
  getIntelligenceCostSummary,
  getIntelligenceCostSummarySchema,
  // CRM tools
  listCrmOpportunities,
  listCrmOpportunitiesSchema,
  getOpportunityDetail,
  getOpportunityDetailSchema,
  crmStageSummary,
  crmStageSummarySchema,
  crmFollowupsDue,
  crmFollowupsDueSchema,
  // Cross-link
  getPromotedOpportunityForProspect,
  getPromotedOpportunityForProspectSchema,
  // Round 3 — clients & campaigns deeper, KOL filtering, CRM activity logging
  listClients, listClientsSchema,
  getClientDetail, getClientDetailSchema,
  summarizeClient, summarizeClientSchema,
  getCampaignDetail, getCampaignDetailSchema,
  listCampaignKols, listCampaignKolsSchema,
  getCampaignPayments, getCampaignPaymentsSchema,
  listTopKols, listTopKolsSchema,
  getKolDetail, getKolDetailSchema,
  logCrmActivity, logCrmActivitySchema,
} from '@/lib/mcp/tools';

export const dynamic = 'force-dynamic';
// MCP requests are short — a typical tool call is one Supabase query.
// 60s is plenty and well under Vercel's hobby/pro limits.
export const maxDuration = 60;

/**
 * /api/mcp/[transport]
 *
 * Streamable HTTP MCP server (transport='mcp') and SSE fallback
 * (transport='sse'). Both routes go through the same handler — the
 * mcp-handler library multiplexes them based on the path segment.
 *
 * Auth: every incoming request must carry a valid Bearer token issued
 * by our /api/oauth/token endpoint. Tokens are scoped per (user, client)
 * pair so a token revocation only affects that one connector install.
 *
 * Tools registered: see lib/mcp/tools.ts. The server is read-only by
 * design — Claude can query but not mutate. If we ever want to support
 * actions ("dismiss this prospect", "add this to a campaign"), they go
 * here as a separate tool with extra confirmation in the prompt.
 */

const handler = createMcpHandler(
  async (server) => {
    server.tool(
      'list_recent_prospects',
      'List Discovery prospects added in the last N days. Optionally filter by action tier (REACH_OUT_NOW, PRE_TOKEN_PRIORITY, CONSIDER, DISMISS). Returns a compact list with name, symbol, tier, funding, and any Korea-listing flags.',
      listRecentProspectsSchema,
      async (args) => {
        const supabase = getServiceClient();
        const text = await listRecentProspects(supabase, args);
        return { content: [{ type: 'text', text }] };
      },
    );

    server.tool(
      'get_prospect_detail',
      'Fetch detailed info for one Discovery prospect by UUID — score, fit reasoning, funding, signals, links. Use list_recent_prospects first to get the UUID.',
      getProspectDetailSchema,
      async (args) => {
        const supabase = getServiceClient();
        const text = await getProspectDetail(supabase, args);
        return { content: [{ type: 'text', text }] };
      },
    );

    server.tool(
      'list_active_campaigns',
      'List all active (non-archived, non-closed) HoloHive campaigns with client, status, budget, region, and manager.',
      listActiveCampaignsSchema,
      async (args) => {
        const supabase = getServiceClient();
        const text = await listActiveCampaigns(supabase, args);
        return { content: [{ type: 'text', text }] };
      },
    );

    server.tool(
      'search_kols',
      'Search the master KOL list by name (case-insensitive substring). Optional region and tier filters. Returns name, tier, follower count, niche, platforms.',
      searchKolsSchema,
      async (args) => {
        const supabase = getServiceClient();
        const text = await searchKols(supabase, args);
        return { content: [{ type: 'text', text }] };
      },
    );

    server.tool(
      'get_kr_listings',
      'List recent Korean exchange listings (Upbit / Bithumb) in the last N days. Flags any that match a Discovery prospect.',
      getKrListingsSchema,
      async (args) => {
        const supabase = getServiceClient();
        const text = await getKrListings(supabase, args);
        return { content: [{ type: 'text', text }] };
      },
    );

    server.tool(
      'summarize_pipeline',
      'High-level snapshot of the Discovery + CRM + Campaigns pipeline: prospect counts by tier, CRM opportunity counts by stage, active campaign count.',
      summarizePipelineSchema,
      async () => {
        const supabase = getServiceClient();
        const text = await summarizePipeline(supabase);
        return { content: [{ type: 'text', text }] };
      },
    );

    // ─── Intelligence-deep tools ─────────────────────────────────────

    server.tool(
      'get_recent_signals',
      'Fetch recent prospect_signals across the Discovery system. Filter by signal_type (e.g. "korea_intent_exchange", "poc_korea_mention", "korea_exchange_listing"), prospect_id, or minimum relevancy_weight. Use this for the Intelligence > Signals tab questions.',
      getRecentSignalsSchema,
      async (args) => {
        const supabase = getServiceClient();
        const text = await getRecentSignals(supabase, args);
        return { content: [{ type: 'text', text }] };
      },
    );

    server.tool(
      'get_intelligence_cost_summary',
      'Aggregate Discovery / POC enrichment / Deep Dive spend by run_type over a window. Mirrors the cost chip on the Intelligence page but with finer breakdown — answers "where is the budget going" questions.',
      getIntelligenceCostSummarySchema,
      async (args) => {
        const supabase = getServiceClient();
        const text = await getIntelligenceCostSummary(supabase, args);
        return { content: [{ type: 'text', text }] };
      },
    );

    // ─── CRM tools ───────────────────────────────────────────────────

    server.tool(
      'list_crm_opportunities',
      'Browse CRM opportunities with filters. stages is a comma-separated list (e.g. "warm,tg_intro,booked" or "proposal,contract"). Useful stages: cold_dm, warm, tg_intro, booked, discovery_done, proposal, contract, closed_won, closed_lost, account_active. Sort by composite_score / deal_value / last_contacted_at / updated_at.',
      listCrmOpportunitiesSchema,
      async (args) => {
        const supabase = getServiceClient();
        const text = await listCrmOpportunities(supabase, args);
        return { content: [{ type: 'text', text }] };
      },
    );

    server.tool(
      'get_opportunity_detail',
      'Full info on one CRM opportunity by UUID — all 5 scores (composite, ICP, signal, temperature, timing), activity timeline (last contacted/messaged/replied), POC contacts, funding, project context (token status, TGE date, Korea presence, team doxxed), notes.',
      getOpportunityDetailSchema,
      async (args) => {
        const supabase = getServiceClient();
        const text = await getOpportunityDetail(supabase, args);
        return { content: [{ type: 'text', text }] };
      },
    );

    server.tool(
      'crm_stage_summary',
      'Pipeline distribution: counts of CRM opportunities by stage, grouped into the four canonical pipelines (Outreach, Leads, Booked/Discovery, Deals, Accounts). Plus an account_type breakdown. Use this for "how does my pipeline look" snapshots.',
      crmStageSummarySchema,
      async () => {
        const supabase = getServiceClient();
        const text = await crmStageSummary(supabase);
        return { content: [{ type: 'text', text }] };
      },
    );

    server.tool(
      'crm_followups_due',
      'List active CRM opportunities not contacted in the last N days (default 7). Skips closed/dead/churned stages — only returns ones where a follow-up is actually warranted. Sorted by stalest first.',
      crmFollowupsDueSchema,
      async (args) => {
        const supabase = getServiceClient();
        const text = await crmFollowupsDue(supabase, args);
        return { content: [{ type: 'text', text }] };
      },
    );

    // ─── Cross-link: Intelligence ↔ CRM ──────────────────────────────

    server.tool(
      'get_promoted_opportunity_for_prospect',
      'Given a Discovery prospect UUID, return its linked CRM opportunity (via promoted_opportunity_id). Tells you whether a prospect was promoted, and if so, what stage it landed at. Useful for "did this prospect convert" questions.',
      getPromotedOpportunityForProspectSchema,
      async (args) => {
        const supabase = getServiceClient();
        const text = await getPromotedOpportunityForProspect(supabase, args);
        return { content: [{ type: 'text', text }] };
      },
    );

    // ─── Clients ────────────────────────────────────────────────────

    server.tool(
      'list_clients',
      'List HoloHive clients (the paying customers — distinct from CRM opportunities). Filter by active_only (default true) or search by name. Returns name, email, location, status, onboarding state.',
      listClientsSchema,
      async (args) => {
        const supabase = getServiceClient();
        const text = await listClients(supabase, args);
        return { content: [{ type: 'text', text }] };
      },
    );

    server.tool(
      'get_client_detail',
      'Quick detail on one client: status, location, onboarding info, count of active/total campaigns, count of CRM opportunities linked. For the full picture use summarize_client instead.',
      getClientDetailSchema,
      async (args) => {
        const supabase = getServiceClient();
        const text = await getClientDetail(supabase, args);
        return { content: [{ type: 'text', text }] };
      },
    );

    server.tool(
      'summarize_client',
      'One-shot multi-surface summary of a client: profile + active campaigns + payment status (paid/pending) + linked CRM opportunities + recent client_delivery_log entries. The killer "give me everything about <client>" tool.',
      summarizeClientSchema,
      async (args) => {
        const supabase = getServiceClient();
        const text = await summarizeClient(supabase, args);
        return { content: [{ type: 'text', text }] };
      },
    );

    // ─── Campaigns deeper ────────────────────────────────────────────

    server.tool(
      'get_campaign_detail',
      'Full info on one campaign: client, status, region, manager, dates, budget, KOL roster status breakdown (hh_status + client_status histograms), payment summary (paid vs pending), intro/NDA/proposal flags, description.',
      getCampaignDetailSchema,
      async (args) => {
        const supabase = getServiceClient();
        const text = await getCampaignDetail(supabase, args);
        return { content: [{ type: 'text', text }] };
      },
    );

    server.tool(
      'list_campaign_kols',
      'KOL roster for a specific campaign — name, tier, region, follower count, hh_status + client_status, allocated budget, paid amount. Filter by status if needed. Sorted by allocated budget descending.',
      listCampaignKolsSchema,
      async (args) => {
        const supabase = getServiceClient();
        const text = await listCampaignKols(supabase, args);
        return { content: [{ type: 'text', text }] };
      },
    );

    server.tool(
      'get_campaign_payments',
      'Payment line items for a campaign — amount, method, category, recipient, paid date (or pending). Filter by paid/pending. Includes paid/pending totals at the top.',
      getCampaignPaymentsSchema,
      async (args) => {
        const supabase = getServiceClient();
        const text = await getCampaignPayments(supabase, args);
        return { content: [{ type: 'text', text }] };
      },
    );

    // ─── KOLs deeper ─────────────────────────────────────────────────

    server.tool(
      'list_top_kols',
      'Filtered KOL ranking — region, tier, niche, platform, min_followers, in_house_only filters. Sorted by follower count desc. Use this when you don\'t have a specific name to search for (search_kols requires a query string). Common queries: "S-tier Korean DeFi KOLs with 100K+ followers", "in-house GameFi creators".',
      listTopKolsSchema,
      async (args) => {
        const supabase = getServiceClient();
        const text = await listTopKols(supabase, args);
        return { content: [{ type: 'text', text }] };
      },
    );

    server.tool(
      'get_kol_detail',
      'Full info on one KOL by UUID — tier, region, follower count, platforms, niche, content type, deliverables, pricing, in-house status, link, wallet, community/group-chat flags, description.',
      getKolDetailSchema,
      async (args) => {
        const supabase = getServiceClient();
        const text = await getKolDetail(supabase, args);
        return { content: [{ type: 'text', text }] };
      },
    );

    // ─── CRM activity logging (the only WRITE tool) ─────────────────
    //
    // The tool description below tells Claude to ALWAYS confirm with
    // the user before calling. This is the safety mechanism — Claude
    // models follow detailed tool-use instructions reliably, and the
    // confirmation step prevents misinterpreted "I had a call" from
    // turning into an unintended log write.

    server.tool(
      'log_crm_activity',
      [
        'Log a CRM activity (call, message, meeting, proposal, note, or bump) on an existing opportunity AND bump the opportunity\'s last_contacted_at timestamp.',
        '',
        'CRITICAL: This is a WRITE tool. ALWAYS confirm with the user before calling it. Repeat back the opportunity NAME (not just the ID), the activity type, and the title/description. Wait for explicit "yes" or equivalent before calling. Never auto-log based on inference — only log when the user explicitly says to.',
        '',
        'Use list_crm_opportunities or summarize_pipeline to find the opportunity_id first. The tool returns a confirmation with the new activity ID and a note that last_contacted_at was bumped.',
      ].join('\n'),
      logCrmActivitySchema,
      async (args) => {
        const supabase = getServiceClient();
        const text = await logCrmActivity(supabase, args);
        return { content: [{ type: 'text', text }] };
      },
    );
  },
  {
    // Server identity reported during MCP initialize handshake.
    serverInfo: {
      name: 'holohive-mcp',
      version: '0.1.0',
    },
  },
  {
    // basePath = the prefix Next.js mounts the route at. Our route file
    // lives at app/api/mcp/[transport]/route.ts so the base is /api/mcp.
    basePath: '/api/mcp',
    // SSE requires Redis on Vercel for cross-instance coordination — we
    // don't run Redis, so we disable SSE and keep the modern Streamable
    // HTTP transport only (which is what Claude.ai prefers anyway).
    disableSse: true,
    verboseLogs: true,
    maxDuration: 60,
  },
);

// Auth wrapper: validate the bearer token before delegating to the
// MCP handler. The handler itself is transport-agnostic — it doesn't
// care that we did auth, it just executes the tool.
//
// We wrap handler(req) in mcpAuthStorage.run(ctx, ...) so any tool that
// needs the calling user's id (currently log_crm_activity for owner
// attribution) can pull it via mcpAuthStorage.getStore() without
// changing every tool signature. Read tools just ignore it.
async function authedHandler(req: Request): Promise<Response> {
  const ctx = await authenticateMcpRequest(req);
  if (!ctx) return unauthorizedResponse();
  return mcpAuthStorage.run(ctx, () => handler(req));
}

export { authedHandler as GET, authedHandler as POST, authedHandler as DELETE };

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-session-id, mcp-protocol-version',
      'Access-Control-Expose-Headers': 'mcp-session-id, mcp-protocol-version, WWW-Authenticate',
    },
  });
}

// Suppress an unused-import lint warning if `z` isn't referenced directly
// here (it's used inside lib/mcp/tools.ts via the schema exports).
void z;
