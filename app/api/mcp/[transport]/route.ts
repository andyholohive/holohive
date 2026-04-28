import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { authenticateMcpRequest, unauthorizedResponse } from '@/lib/mcp/auth';
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
async function authedHandler(req: Request): Promise<Response> {
  const ctx = await authenticateMcpRequest(req);
  if (!ctx) return unauthorizedResponse();

  // Stash auth context on the request so tools could access it later
  // if we ever need per-user scoping (we don't today — single-user).
  // Currently tools use service role + the consent layer scopes who
  // can connect at all.
  return handler(req);
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
