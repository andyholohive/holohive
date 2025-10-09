import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { VectorStore } from './vectorStore';
import { KOLService, MasterKOL } from './kolService';
import { CampaignService } from './campaignService';
import { ClientService } from './clientService';
import { MessageTemplateService } from './messageTemplateService';
import { supabase } from './supabase';
import OpenAI from 'openai';

// Lazy initialization of OpenAI client to ensure env vars are loaded
let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// ============================================================================
// Agent Tool Types & Schemas
// ============================================================================

/**
 * Base interface for all agent tools
 */
export interface AgentTool {
  name: string;
  description: string;
  parameters: z.ZodObject<any>;
  execute: (params: any, context: ToolContext) => Promise<ToolResult>;
}

/**
 * Execution context passed to every tool
 */
export interface ToolContext {
  userId: string;
  userRole: 'admin' | 'member' | 'client';
  sessionId?: string;
  supabaseClient?: any; // Authenticated Supabase client for server-side operations
}

/**
 * Standard tool execution result
 */
export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
}

/**
 * Helper to get the appropriate Supabase client (authenticated server client or default client)
 */
function getSupabaseClient(context: ToolContext) {
  return context.supabaseClient || supabase;
}

// ============================================================================
// Tool 1: Search KOLs
// ============================================================================

const searchKOLsSchema = z.object({
  query: z.string().min(1).describe('Natural language search query for finding KOLs'),
  limit: z.number().min(1).max(100).default(20).describe('Maximum number of results to return (1-100)'),
  threshold: z.number().min(0).max(1).default(0.7).describe('Similarity threshold (0-1, higher = more strict)'),
  region: z.string().optional().describe('Filter by specific region'),
  platform: z.string().optional().describe('Filter by specific platform'),
});

export const searchKOLsTool: AgentTool = {
  name: 'search_kols',
  description: 'Search for KOLs using semantic/natural language queries. Finds KOLs based on meaning, not just keywords. Use this to find KOLs matching specific criteria like region, content type, expertise, audience size, etc.',
  parameters: searchKOLsSchema,

  async execute(params, context): Promise<ToolResult> {
    try {
      const { query, limit, threshold, region, platform } = searchKOLsSchema.parse(params);
      const client = getSupabaseClient(context);

      // Perform semantic search
      const results = await VectorStore.searchKOLs(query, {
        limit,
        threshold,
      });

      // Fetch full KOL details
      const kolIds = results.map(r => r.id);
      if (kolIds.length === 0) {
        return {
          success: true,
          data: [],
          message: 'No KOLs found matching the search criteria'
        };
      }

      const { data: kols, error } = await client
        .from('master_kols')
        .select('*')
        .in('id', kolIds);

      if (error) throw error;

      // Apply additional filters
      let filteredKOLs = kols || [];

      if (region) {
        filteredKOLs = filteredKOLs.filter((k: any) => k.region?.toLowerCase() === region.toLowerCase());
      }

      if (platform) {
        filteredKOLs = filteredKOLs.filter((k: any) =>
          k.platform?.some((p: any) => p.toLowerCase() === platform.toLowerCase())
        );
      }

      // Attach similarity scores
      const kolsWithScores = filteredKOLs.map((kol: any) => {
        const result = results.find((r: any) => r.id === kol.id);
        return {
          ...kol,
          similarity: result?.similarity || 0,
          match_reason: result?.metadata?.match_reason
        };
      }).sort((a: any, b: any) => b.similarity - a.similarity);

      return {
        success: true,
        data: kolsWithScores,
        message: `Found ${kolsWithScores.length} KOL(s) matching "${query}"`
      };
    } catch (error) {
      console.error('Error in search_kols:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to search KOLs'
      };
    }
  }
};

// ============================================================================
// Tool 2: Create Campaign
// ============================================================================

const createCampaignSchema = z.object({
  client_id: z.string().uuid().describe('Client ID for the campaign'),
  name: z.string().min(1).describe('Campaign name'),
  description: z.string().optional().describe('Campaign description'),
  total_budget: z.number().min(0).describe('Total campaign budget in USD'),
  start_date: z.string().describe('Campaign start date (YYYY-MM-DD)'),
  end_date: z.string().describe('Campaign end date (YYYY-MM-DD)'),
  region: z.string().optional().describe('Primary region for the campaign'),
  status: z.enum(['Planning', 'Active', 'Paused', 'Completed']).default('Planning').describe('Campaign status'),
  budget_type: z.array(z.string()).optional().describe('Budget allocation types'),
});

export const createCampaignTool: AgentTool = {
  name: 'create_campaign',
  description: 'Create a new marketing campaign for a client. Use this when the user wants to set up a new campaign with budget, dates, and other details.',
  parameters: createCampaignSchema,

  async execute(params, context): Promise<ToolResult> {
    try {
      const campaignData = createCampaignSchema.parse(params);
      const client = getSupabaseClient(context);

      // Verify client exists and user has access
      const clients = await ClientService.getClientsForUser(context.userRole, context.userId);
      const hasAccess = clients.some(c => c.id === campaignData.client_id);

      if (!hasAccess && context.userRole !== 'admin') {
        return {
          success: false,
          error: 'You do not have access to this client'
        };
      }

      // Create campaign with authenticated client
      const campaign = await CampaignService.createCampaign(campaignData, client);

      return {
        success: true,
        data: campaign,
        message: `Campaign "${campaign.name}" created successfully`
      };
    } catch (error) {
      console.error('Error in create_campaign:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create campaign'
      };
    }
  }
};

// ============================================================================
// Tool 3: Create KOL List
// ============================================================================

const createKOLListSchema = z.object({
  name: z.string().min(1).describe('Name for the KOL list'),
  search_criteria: z.string().min(1).describe('Natural language description of KOLs to find'),
  limit: z.number().min(1).max(100).default(20).describe('Maximum number of KOLs to include'),
  threshold: z.number().min(0).max(1).default(0.7).describe('Similarity threshold for matching'),
  region: z.string().optional().describe('Filter by specific region'),
  platform: z.string().optional().describe('Filter by specific platform'),
  description: z.string().optional().describe('Description of the list purpose'),
});

export const createKOLListTool: AgentTool = {
  name: 'create_kol_list',
  description: 'Create a curated list of KOLs using semantic search. Use this to build lists based on natural language criteria like "Korean crypto educators with 100k+ followers" or "Meme creators in SEA".',
  parameters: createKOLListSchema,

  async execute(params, context): Promise<ToolResult> {
    try {
      const { name, search_criteria, limit, threshold, region, platform, description } = createKOLListSchema.parse(params);
      const client = getSupabaseClient(context);

      // Search for matching KOLs
      const searchResults = await VectorStore.searchKOLs(search_criteria, {
        limit,
        threshold
      });

      if (searchResults.length === 0) {
        return {
          success: false,
          error: `No KOLs found matching criteria: "${search_criteria}"`
        };
      }

      // Fetch full KOL details
      const kolIds = searchResults.map(r => r.id);
      const { data: kols, error: kolError } = await client
        .from('master_kols')
        .select('*')
        .in('id', kolIds);

      if (kolError) throw kolError;

      // Apply additional filters
      let filteredKOLs = kols || [];

      if (region) {
        filteredKOLs = filteredKOLs.filter((k: any) => k.region?.toLowerCase() === region.toLowerCase());
      }

      if (platform) {
        filteredKOLs = filteredKOLs.filter((k: any) =>
          k.platform?.some((p: any) => p.toLowerCase() === platform.toLowerCase())
        );
      }

      // Create the list
      const { data: list, error: listError } = await client
        .from('lists')
        .insert({
          name,
          notes: description || `List created from search: "${search_criteria}"`,
          status: 'active',
        })
        .select()
        .single();

      if (listError) throw listError;

      // Add KOLs to the list
      const listItems = filteredKOLs.map((kol: any) => {
        return {
          list_id: list.id,
          master_kol_id: kol.id,
          status: 'active',
          notes: null,
        };
      });

      const { error: itemsError } = await client
        .from('list_kols')
        .insert(listItems);

      if (itemsError) throw itemsError;

      return {
        success: true,
        data: {
          list,
          kol_count: filteredKOLs.length,
          kols: filteredKOLs.map((kol: any) => {
            const result = searchResults.find((r: any) => r.id === kol.id);
            return {
              ...kol,
              similarity: result?.similarity || 0
            };
          })
        },
        message: `Created list "${name}" with ${filteredKOLs.length} KOL(s)`
      };
    } catch (error) {
      console.error('Error in create_kol_list:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create KOL list'
      };
    }
  }
};

// ============================================================================
// Tool 4: Add KOLs to Campaign
// ============================================================================

const addKOLsToCampaignSchema = z.object({
  campaign_id: z.string().uuid().describe('Campaign ID to add KOLs to'),
  kol_ids: z.array(z.string().uuid()).optional().describe('Array of KOL IDs to add (optional if using list_id or search_query)'),
  list_id: z.string().uuid().optional().describe('Optional: List ID to add all KOLs from that list'),
  search_query: z.string().optional().describe('Optional: Natural language query to find and add KOLs'),
  limit: z.number().min(1).max(50).optional().describe('If using search_query, max number of KOLs to add'),
});

export const addKOLsToCampaignTool: AgentTool = {
  name: 'add_kols_to_campaign',
  description: 'Add KOLs to a campaign. Can add specific KOLs by ID, all KOLs from a list, or find KOLs using semantic search.',
  parameters: addKOLsToCampaignSchema,

  async execute(params, context): Promise<ToolResult> {
    try {
      const { campaign_id, kol_ids, list_id, search_query, limit } = addKOLsToCampaignSchema.parse(params);
      const client = getSupabaseClient(context);

      // Verify campaign exists and user has access
      const campaign = await CampaignService.getCampaignById(campaign_id);
      if (!campaign) {
        return {
          success: false,
          error: 'Campaign not found'
        };
      }

      let kolsToAdd: string[] = kol_ids || [];

      // If list_id provided, get all KOLs from that list
      if (list_id) {
        const { data: listKOLs, error: listError } = await client
          .from('list_kols')
          .select('master_kol_id')
          .eq('list_id', list_id);

        if (listError) throw listError;

        const listKolIds = (listKOLs || []).map((lk: any) => lk.master_kol_id);
        kolsToAdd = Array.from(new Set([...kolsToAdd, ...listKolIds]));
      }

      // If search query provided, find KOLs using semantic search
      if (search_query) {
        const searchResults = await VectorStore.searchKOLs(search_query, {
          limit: limit || 10,
          threshold: 0.7
        });
        kolsToAdd = Array.from(new Set([...kolsToAdd, ...searchResults.map((r: any) => r.id)]));
      }

      // Validate we have KOLs to add
      if (kolsToAdd.length === 0) {
        return {
          success: false,
          error: 'No KOLs to add. Please provide kol_ids, list_id, or search_query.'
        };
      }

      // Add KOLs to campaign
      const campaignKOLs = kolsToAdd.map(master_kol_id => ({
        campaign_id,
        master_kol_id,
        hh_status: 'Curated' as const,
        notes: null,
      }));

      const { data, error } = await client
        .from('campaign_kols')
        .insert(campaignKOLs)
        .select();

      if (error) {
        // Handle duplicate entries gracefully
        if (error.code === '23505') {
          return {
            success: false,
            error: 'Some KOLs are already in this campaign'
          };
        }
        throw error;
      }

      return {
        success: true,
        data: data,
        message: `Added ${kolsToAdd.length} KOL(s) to campaign "${campaign.name}"`
      };
    } catch (error) {
      console.error('Error in add_kols_to_campaign:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add KOLs to campaign'
      };
    }
  }
};

// ============================================================================
// Tool 5: Generate Client Message
// ============================================================================

const generateClientMessageSchema = z.object({
  client_id: z.string().uuid().describe('Client ID to generate message for'),
  message_type: z.string().describe('Type of message: initial_outreach, nda_request, kol_list_access, kol_list_delivery, final_kol_picks, post_call_followup, contract_activation, activation_inputs, budget_plan, outreach_update, finalizing_kols, creator_brief, final_checklist, activation_day, mid_campaign_update, initial_results, final_report'),
  campaign_id: z.string().uuid().optional().describe('Optional campaign ID for context'),
  custom_instructions: z.string().optional().describe('Additional instructions for customizing the message'),
  variables: z.record(z.string()).optional().describe('Custom variables to fill in the template (e.g., {"CLIENT_NAME": "Acme Corp", "PROJECT_NAME": "Token Launch"})'),
  use_learning: z.boolean().default(true).describe('Whether to learn from similar past messages'),
});

export const generateClientMessageTool: AgentTool = {
  name: 'generate_client_message',
  description: 'Generate a professional message to send to a client using templates and learning from past messages. Automatically fills in variables from campaign/client data. Supports types: initial_outreach, nda_request, kol_list_delivery, post_call_followup, contract_activation, activation_day, final_report, and more.',
  parameters: generateClientMessageSchema,

  async execute(params, context): Promise<ToolResult> {
    try {
      const { client_id, message_type, campaign_id, custom_instructions, variables, use_learning } = generateClientMessageSchema.parse(params);
      const client = getSupabaseClient(context);

      // Get client details
      const { data: clientData, error: clientError } = await client
        .from('clients')
        .select('*')
        .eq('id', client_id)
        .single();

      if (clientError) throw clientError;

      // Get campaign details if provided
      let campaign = null;
      if (campaign_id) {
        campaign = await CampaignService.getCampaignById(campaign_id);
      }

      // Auto-populate variables from client and campaign data
      const autoVariables: Record<string, string> = {
        CLIENT_NAME: clientData.name,
        CLIENT_HANDLE: clientData.name,
        EMAIL_ADDRESS: clientData.email,
        ...(campaign && {
          PROJECT_NAME: campaign.name,
          CAMPAIGN_NAME: campaign.name,
          TGE_LAUNCH: campaign.start_date,
        }),
      };

      // Merge with custom variables (custom variables override auto variables)
      const finalVariables = { ...autoVariables, ...(variables || {}) };

      // Generate message using template service
      const result = await MessageTemplateService.generateMessage({
        message_type,
        client_id,
        campaign_id,
        variables: finalVariables,
        custom_instructions,
        use_learning,
        user_id: context.userId,
        supabaseClient: client,
      });

      // Save the generated message as an example for learning
      const messageExampleId = await MessageTemplateService.saveMessageExample(
        context.userId,
        message_type,
        result.content,
        {
          client_id,
          campaign_id,
          template_id: result.template_id,
          was_ai_generated: true,
          original_ai_content: result.content,
          was_sent: false,
          context_data: {
            client_name: clientData.name,
            campaign_name: campaign?.name,
          },
          generation_parameters: params,
          supabaseClient: client,
        }
      );

      return {
        success: true,
        data: {
          message: result.content,
          message_example_id: messageExampleId,
          template_id: result.template_id,
          client_name: clientData.name,
          client_email: clientData.email,
          campaign_name: campaign?.name,
          message_type,
          variables_used: finalVariables,
        },
        message: `Generated ${message_type} message for ${clientData.name}. The message has been saved and will help improve future generations.`
      };
    } catch (error) {
      console.error('Error in generate_client_message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate client message'
      };
    }
  }
};

// ============================================================================
// Tool 6: Save Message Example (User's Own Messages)
// ============================================================================

const saveMessageExampleSchema = z.object({
  message_content: z.string().min(10).describe('The full message content to save'),
  message_type: z.string().describe('Type of message: initial_outreach, nda_request, kol_list_access, kol_list_delivery, final_kol_picks, post_call_followup, contract_activation, activation_inputs, budget_plan, outreach_update, finalizing_kols, creator_brief, final_checklist, activation_day, mid_campaign_update, initial_results, final_report'),
  client_id: z.string().uuid().describe('Client ID this message was sent to'),
  campaign_id: z.string().uuid().optional().describe('Optional campaign ID if message is related to a specific campaign'),
  rating: z.number().min(1).max(5).optional().describe('User rating of this message quality (1-5 stars)'),
  notes: z.string().optional().describe('Optional notes about this message or when it was sent'),
});

export const saveMessageExampleTool: AgentTool = {
  name: 'save_message_example',
  description: 'Save a user\'s own message to the learning database. Use this when user wants to add their own historical messages or examples for the AI to learn from. Messages saved this way will improve future AI generations.',
  parameters: saveMessageExampleSchema,

  async execute(params, context): Promise<ToolResult> {
    try {
      const { message_content, message_type, client_id, campaign_id, rating, notes } = saveMessageExampleSchema.parse(params);
      const client = getSupabaseClient(context);

      // Get client details for context
      const { data: clientData, error: clientError } = await client
        .from('clients')
        .select('*')
        .eq('id', client_id)
        .single();

      if (clientError) throw clientError;

      // Get campaign details if provided
      let campaign = null;
      if (campaign_id) {
        campaign = await CampaignService.getCampaignById(campaign_id);
      }

      // Save the message example
      const messageExampleId = await MessageTemplateService.saveMessageExample(
        context.userId,
        message_type,
        message_content,
        {
          client_id,
          campaign_id,
          template_id: undefined, // No template since this is user-provided
          was_ai_generated: false, // This is a real user message
          original_ai_content: undefined,
          was_sent: true, // User says they sent this
          context_data: {
            client_name: clientData.name,
            campaign_name: campaign?.name,
            notes: notes,
          },
          generation_parameters: null,
          supabaseClient: client,
        }
      );

      // If rating provided, save it as feedback
      if (rating) {
        await MessageTemplateService.trackFeedback(
          messageExampleId,
          'rating',
          {
            helpful_score: rating,
            user_comments: notes,
            supabaseClient: client,
          }
        );
      }

      return {
        success: true,
        data: {
          message_example_id: messageExampleId,
          message_type,
          client_name: clientData.name,
          campaign_name: campaign?.name,
          rating,
        },
        message: `✓ Message saved to learning database! This ${message_type} message for ${clientData.name} will help improve future AI generations${rating ? ` (rated ${rating}/5 stars)` : ''}.`
      };
    } catch (error) {
      console.error('Error in save_message_example:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save message example'
      };
    }
  }
};

// ============================================================================
// Tool 7: Analyze Campaign Performance
// ============================================================================

const analyzeCampaignPerformanceSchema = z.object({
  campaign_id: z.string().uuid().describe('Campaign ID to analyze'),
  include_recommendations: z.boolean().default(true).describe('Whether to include AI-generated recommendations'),
});

export const analyzeCampaignPerformanceTool: AgentTool = {
  name: 'analyze_campaign_performance',
  description: 'Analyze campaign and provide comprehensive insights including strengths, weaknesses, opportunities, and actionable recommendations. Perfect for when user asks for campaign insights, analysis, or "what do you think about this campaign".',
  parameters: analyzeCampaignPerformanceSchema,

  async execute(params, context): Promise<ToolResult> {
    try {
      const { campaign_id, include_recommendations } = analyzeCampaignPerformanceSchema.parse(params);
      const client = getSupabaseClient(context);

      // Get campaign details
      const campaign = await CampaignService.getCampaignById(campaign_id);
      if (!campaign) {
        return {
          success: false,
          error: 'Campaign not found'
        };
      }

      // Get campaign KOLs
      const { data: campaignKOLs, error: kolsError } = await client
        .from('campaign_kols')
        .select(`
          *,
          master_kols(*)
        `)
        .eq('campaign_id', campaign_id);

      if (kolsError) throw kolsError;

      // Calculate metrics
      const totalKOLs = campaignKOLs?.length || 0;
      const budgetUtilization = campaign.total_allocated
        ? (campaign.total_allocated / campaign.total_budget) * 100
        : 0;

      const kolsByStatus = {
        pending: campaignKOLs?.filter((k: any) => k.status === 'pending').length || 0,
        approved: campaignKOLs?.filter((k: any) => k.status === 'approved').length || 0,
        rejected: campaignKOLs?.filter((k: any) => k.status === 'rejected').length || 0,
        contacted: campaignKOLs?.filter((k: any) => k.status === 'contacted').length || 0,
      };

      // Get KOL distribution by region/platform
      const kols = campaignKOLs?.map((ck: any) => (ck as any).master_kols).filter(Boolean) || [];
      const regionDistribution = kols.reduce((acc: any, kol: any) => {
        const region = kol.region || 'Unknown';
        acc[region] = (acc[region] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const platformDistribution = kols.reduce((acc: any, kol: any) => {
        kol.platform?.forEach((p: string) => {
          acc[p] = (acc[p] || 0) + 1;
        });
        return acc;
      }, {} as Record<string, number>);

      // Build analysis object
      const analysis = {
        campaign_name: campaign.name,
        campaign_status: campaign.status,
        budget: {
          total: campaign.total_budget,
          allocated: campaign.total_allocated || 0,
          remaining: campaign.total_budget - (campaign.total_allocated || 0),
          utilization_percentage: Math.round(budgetUtilization),
        },
        kols: {
          total: totalKOLs,
          by_status: kolsByStatus,
          by_region: regionDistribution,
          by_platform: platformDistribution,
        },
        timeline: {
          start_date: campaign.start_date,
          end_date: campaign.end_date,
          status: campaign.status,
        }
      };

      // Generate AI insights if requested
      let insights = null;
      if (include_recommendations) {
        const analysisContext = `
Campaign: ${campaign.name}
Status: ${campaign.status}
Budget: $${campaign.total_budget} (${Math.round(budgetUtilization)}% utilized)
Remaining Budget: $${campaign.total_budget - (campaign.total_allocated || 0)}
KOLs: ${totalKOLs} total (${kolsByStatus.approved} approved, ${kolsByStatus.contacted} contacted, ${kolsByStatus.pending} pending, ${kolsByStatus.rejected} rejected)

Region Distribution:
${Object.entries(regionDistribution).map(([r, c]) => `- ${r}: ${c} KOLs`).join('\n')}

Platform Distribution:
${Object.entries(platformDistribution).map(([p, c]) => `- ${p}: ${c} KOLs`).join('\n')}

Timeline:
- Start Date: ${campaign.start_date || 'Not set'}
- End Date: ${campaign.end_date || 'Not set'}

Analyze this campaign and provide comprehensive insights in the following format:

**Strengths (What's Going Well):**
List 2-3 positive aspects of the campaign based on the data

**Areas for Improvement:**
List 2-3 specific areas that need attention or optimization

**Actionable Recommendations:**
Provide 3-5 specific, actionable recommendations to improve campaign performance

**Overall Assessment:**
A brief 1-2 sentence summary of the campaign's health and outlook
`;

        const response = await getOpenAI().chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'You are an expert marketing campaign analyst specializing in influencer marketing. Provide comprehensive, actionable insights based on campaign data. Be specific, honest, and constructive. Focus on both positives and areas for improvement.'
            },
            {
              role: 'user',
              content: analysisContext
            }
          ],
          temperature: 0.7,
          max_tokens: 800,
        });

        insights = response.choices[0].message.content;
      }

      return {
        success: true,
        data: {
          analysis,
          insights
        },
        message: `Analyzed campaign "${campaign.name}" with comprehensive insights`
      };
    } catch (error) {
      console.error('Error in analyze_campaign_performance:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze campaign'
      };
    }
  }
};

// ============================================================================
// Tool 7: Get Budget Recommendations
// ============================================================================

const getBudgetRecommendationsSchema = z.object({
  campaign_id: z.string().uuid().optional().describe('Specific campaign ID to get recommendations for'),
  total_budget: z.number().min(0).describe('Total budget available'),
  regions: z.array(z.string()).optional().describe('Target regions for the campaign'),
  objectives: z.string().optional().describe('Campaign objectives and goals'),
});

export const getBudgetRecommendationsTool: AgentTool = {
  name: 'get_budget_recommendations',
  description: 'Get AI-powered budget allocation recommendations based on campaign goals, target regions, and historical data.',
  parameters: getBudgetRecommendationsSchema,

  async execute(params, context): Promise<ToolResult> {
    try {
      const { campaign_id, total_budget, regions, objectives } = getBudgetRecommendationsSchema.parse(params);

      let campaign = null;
      if (campaign_id) {
        campaign = await CampaignService.getCampaignById(campaign_id);
      }

      // Get historical campaign data for insights
      const userCampaigns = await CampaignService.getCampaignsForUser(context.userRole, context.userId);

      const contextPrompt = `
Budget Allocation Request:
- Total Budget: $${total_budget}
${campaign ? `- Campaign: ${campaign.name}` : ''}
${regions?.length ? `- Target Regions: ${regions.join(', ')}` : ''}
${objectives ? `- Objectives: ${objectives}` : ''}

Historical Context:
- User has ${userCampaigns.length} previous campaigns
${userCampaigns.length > 0 ? `- Average campaign budget: $${Math.round(userCampaigns.reduce((sum, c) => sum + c.total_budget, 0) / userCampaigns.length)}` : ''}

Please provide:
1. Recommended budget allocation across regions/platforms
2. Suggested spending breakdown (KOL fees, production, management, etc.)
3. Rationale for the recommendations
4. Risk factors to consider
`;

      const response = await getOpenAI().chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a marketing budget optimization specialist. Provide data-driven budget allocation recommendations with clear rationale.'
          },
          {
            role: 'user',
            content: contextPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 800,
      });

      const recommendations = response.choices[0].message.content;

      return {
        success: true,
        data: {
          total_budget,
          recommendations,
          campaign_name: campaign?.name,
          regions,
          objectives
        },
        message: 'Generated budget recommendations'
      };
    } catch (error) {
      console.error('Error in get_budget_recommendations:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get budget recommendations'
      };
    }
  }
};

// ============================================================================
// Tool 8: Update Campaign Status
// ============================================================================

const updateCampaignStatusSchema = z.object({
  campaign_id: z.string().uuid().describe('Campaign ID to update'),
  status: z.enum(['Planning', 'Active', 'Paused', 'Completed']).describe('New campaign status'),
  reason: z.string().optional().describe('Reason for status change'),
});

export const updateCampaignStatusTool: AgentTool = {
  name: 'update_campaign_status',
  description: 'Update the status of a campaign (Planning, Active, Paused, Completed). Use this to change campaign state based on user requests.',
  parameters: updateCampaignStatusSchema,

  async execute(params, context): Promise<ToolResult> {
    try {
      const { campaign_id, status, reason } = updateCampaignStatusSchema.parse(params);

      // Update campaign status
      const updatedCampaign = await CampaignService.updateCampaign(campaign_id, { status });

      // Log the status change
      const logMessage = reason
        ? `Status changed to ${status}. Reason: ${reason}`
        : `Status changed to ${status}`;

      return {
        success: true,
        data: updatedCampaign,
        message: `Campaign "${updatedCampaign.name}" ${logMessage}`
      };
    } catch (error) {
      console.error('Error in update_campaign_status:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update campaign status'
      };
    }
  }
};

// ============================================================================
// Tool 9: Get User Context
// ============================================================================

const getUserContextSchema = z.object({
  include_campaigns: z.boolean().default(true).describe('Include user\'s campaigns'),
  include_clients: z.boolean().default(true).describe('Include user\'s clients'),
  include_lists: z.boolean().default(true).describe('Include user\'s KOL lists'),
  limit: z.number().min(1).max(100).default(20).describe('Limit results per category'),
});

export const getUserContextTool: AgentTool = {
  name: 'get_user_context',
  description: 'Get comprehensive context about the user\'s campaigns, clients, and KOL lists. Use this to understand what the user has access to before performing actions.',
  parameters: getUserContextSchema,

  async execute(params, context): Promise<ToolResult> {
    try {
      const { include_campaigns, include_clients, include_lists, limit } = getUserContextSchema.parse(params);
      const client = getSupabaseClient(context);

      const userContext: any = {
        user_id: context.userId,
        user_role: context.userRole,
      };

      // Get campaigns
      if (include_campaigns) {
        const campaigns = await CampaignService.getCampaignsForUser(context.userRole, context.userId);
        userContext.campaigns = campaigns.slice(0, limit).map(c => ({
          id: c.id,
          name: c.name,
          client_name: c.client_name,
          status: c.status,
          total_budget: c.total_budget,
          start_date: c.start_date,
          end_date: c.end_date,
        }));
        userContext.total_campaigns = campaigns.length;
      }

      // Get clients
      if (include_clients) {
        const clients = await ClientService.getClientsForUser(context.userRole, context.userId);
        userContext.clients = clients.slice(0, limit).map(c => ({
          id: c.id,
          name: c.name,
          email: c.email,
          campaign_count: c.campaign_count,
        }));
        userContext.total_clients = clients.length;
      }

      // Get KOL lists
      if (include_lists) {
        const { data: lists, error } = await client
          .from('lists')
          .select('id, name, notes, status, created_at')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) throw error;

        // Get KOL counts for each list separately
        const listsWithCounts = await Promise.all(
          (lists || []).map(async (list: any) => {
            const { count } = await client
              .from('list_kols')
              .select('*', { count: 'exact', head: true })
              .eq('list_id', list.id);

            return {
              id: list.id,
              name: list.name,
              description: list.notes,
              status: list.status,
              kol_count: count || 0,
            };
          })
        );

        userContext.kol_lists = listsWithCounts;
        userContext.total_lists = lists?.length || 0;
      }

      return {
        success: true,
        data: userContext,
        message: 'Retrieved user context successfully'
      };
    } catch (error) {
      console.error('Error in get_user_context:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get user context'
      };
    }
  }
};

// ============================================================================
// Tool 10: Get Database Stats
// ============================================================================

const getDatabaseStatsSchema = z.object({});

export const getDatabaseStatsTool: AgentTool = {
  name: 'get_database_stats',
  description: 'Get overall database statistics including total counts of KOLs, campaigns, clients, and lists. Use this to answer questions about totals or overall numbers.',
  parameters: getDatabaseStatsSchema,

  async execute(params, context): Promise<ToolResult> {
    try {
      const client = getSupabaseClient(context);

      // Get total KOL count
      const { count: kolCount } = await client
        .from('master_kols')
        .select('*', { count: 'exact', head: true });

      // Get total campaigns count (user-specific)
      const { count: campaignCount } = await client
        .from('campaigns')
        .select('*', { count: 'exact', head: true });

      // Get total clients count (user-specific)
      const { count: clientCount } = await client
        .from('clients')
        .select('*', { count: 'exact', head: true });

      // Get total lists count (user-specific)
      const { count: listCount } = await client
        .from('lists')
        .select('*', { count: 'exact', head: true });

      const stats = {
        total_kols: kolCount || 0,
        total_campaigns: campaignCount || 0,
        total_clients: clientCount || 0,
        total_lists: listCount || 0,
      };

      return {
        success: true,
        data: stats,
        message: `Database contains ${stats.total_kols} KOLs, ${stats.total_campaigns} campaigns, ${stats.total_clients} clients, and ${stats.total_lists} lists.`
      };
    } catch (error: any) {
      return {
        success: false,
        data: null,
        message: `Failed to get database stats: ${error.message}`
      };
    }
  }
};

// ============================================================================
// Export All Tools
// ============================================================================

export const AGENT_TOOLS: AgentTool[] = [
  searchKOLsTool,
  createCampaignTool,
  createKOLListTool,
  addKOLsToCampaignTool,
  generateClientMessageTool,
  saveMessageExampleTool,
  analyzeCampaignPerformanceTool,
  getBudgetRecommendationsTool,
  updateCampaignStatusTool,
  getUserContextTool,
  getDatabaseStatsTool,
];

// Helper to get tool by name
export function getToolByName(name: string): AgentTool | undefined {
  return AGENT_TOOLS.find(tool => tool.name === name);
}

// Helper to get all tool definitions for OpenAI function calling
export function getToolDefinitionsForOpenAI() {
  return AGENT_TOOLS.map(tool => {
    // Convert Zod schema to JSON Schema that OpenAI accepts
    const jsonSchema = zodToJsonSchema(tool.parameters, {
      target: 'openApi3',
      $refStrategy: 'none',
    });

    return {
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: jsonSchema,
      }
    };
  });
}
