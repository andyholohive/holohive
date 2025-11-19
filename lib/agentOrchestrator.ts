import OpenAI from 'openai';
import { AGENT_TOOLS, getToolByName, getToolDefinitionsForOpenAI, ToolContext, ToolResult } from './agentTools';
import { AgentToolLogger } from './agentToolLogger';
import { VectorStore } from './vectorStore';
import { CampaignService } from './campaignService';
import { ClientService } from './clientService';
import { supabase } from './supabase';

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
// Agent Orchestrator Types
// ============================================================================

/**
 * Message in conversation history
 */
export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
}

/**
 * Agent execution step (for multi-step workflows)
 */
export interface ExecutionStep {
  step_number: number;
  tool_name: string;
  parameters: any;
  result: ToolResult;
  execution_time_ms: number;
}

/**
 * Agent response to user
 */
export interface AgentResponse {
  message: string;
  steps: ExecutionStep[];
  total_execution_time_ms: number;
  success: boolean;
  metadata?: {
    tools_used: string[];
    context_gathered: boolean;
    requires_clarification?: boolean;
    clarification_question?: string;
  };
}

/**
 * RAG context for decision making
 */
export interface RAGContext {
  user_campaigns: any[];
  user_clients: any[];
  user_lists: any[];
  relevant_kols?: any[];
}

// ============================================================================
// Agent Orchestrator
// ============================================================================

export class AgentOrchestrator {
  private conversationHistory: ConversationMessage[] = [];
  private context: ToolContext;
  private sessionId?: string;
  private ragContext?: RAGContext;
  private maxRetries = 3;
  private maxSteps = 10;

  constructor(context: ToolContext, sessionId?: string, initialHistory?: ConversationMessage[]) {
    this.context = context;
    this.sessionId = sessionId;
    // Load initial conversation history if provided
    if (initialHistory && initialHistory.length > 0) {
      this.conversationHistory = initialHistory;
      console.log(`[AgentOrchestrator] Loaded ${initialHistory.length} messages from history`);
    }
  }

  /**
   * Main entry point: Process a user message and return agent response
   */
  async processMessage(userMessage: string): Promise<AgentResponse> {
    const startTime = Date.now();
    const steps: ExecutionStep[] = [];

    try {
      // Step 1: Gather RAG context (user's data for decision making)
      await this.gatherRAGContext();

      // Step 2: Add user message to conversation history (only if not already present)
      // This prevents duplicates when history is loaded from database
      const lastMessage = this.conversationHistory[this.conversationHistory.length - 1];
      const isDuplicate = lastMessage && lastMessage.content === userMessage && lastMessage.role === 'user';

      console.log(`[AgentOrchestrator] Processing message. History length: ${this.conversationHistory.length}, Is duplicate: ${isDuplicate}`);

      if (!isDuplicate) {
        this.conversationHistory.push({
          role: 'user',
          content: userMessage,
        });
        console.log(`[AgentOrchestrator] Added user message to history. New length: ${this.conversationHistory.length}`);
      } else {
        console.log(`[AgentOrchestrator] Skipped duplicate user message`);
      }

      // Step 3: Get GPT-4 response with function calling
      let currentStepCount = 0;
      let continueExecution = true;
      let finalResponse = '';

      while (continueExecution && currentStepCount < this.maxSteps) {
        const response = await this.callGPT4WithTools();

        // Check if GPT-4 wants to call a function
        const toolCalls = response.choices[0].message.tool_calls;

        if (toolCalls && toolCalls.length > 0) {
          // Execute tool calls
          for (const toolCall of toolCalls) {
            currentStepCount++;

            const stepStartTime = Date.now();
            const toolName = 'function' in toolCall ? toolCall.function.name : '';
            const toolArgs = 'function' in toolCall ? JSON.parse(toolCall.function.arguments) : {};

            console.log(`[AgentOrchestrator] Executing tool: ${toolName}`, toolArgs);

            // Execute the tool
            const tool = getToolByName(toolName);
            if (!tool) {
              throw new Error(`Tool not found: ${toolName}`);
            }

            const result = await AgentToolLogger.executeWithLogging(
              toolName,
              this.context.userId,
              this.sessionId,
              toolArgs,
              async () => await tool.execute(toolArgs, this.context)
            );

            const stepExecutionTime = Date.now() - stepStartTime;

            // Record execution step
            steps.push({
              step_number: currentStepCount,
              tool_name: toolName,
              parameters: toolArgs,
              result,
              execution_time_ms: stepExecutionTime,
            });

            // Add function result to conversation
            this.conversationHistory.push({
              role: 'assistant',
              content: '',
              function_call: {
                name: toolName,
                arguments: 'function' in toolCall ? toolCall.function.arguments : '{}',
              },
            });

            this.conversationHistory.push({
              role: 'function',
              name: toolName,
              content: JSON.stringify(result),
            });
          }
        } else {
          // GPT-4 returned a text response (no more tools to call)
          finalResponse = response.choices[0].message.content || '';
          this.conversationHistory.push({
            role: 'assistant',
            content: finalResponse,
          });
          continueExecution = false;
        }
      }

      // Check if we hit max steps
      if (currentStepCount >= this.maxSteps) {
        finalResponse = `I've completed ${this.maxSteps} steps but may need to continue. ${finalResponse}`;
      }

      const totalTime = Date.now() - startTime;

      return {
        message: finalResponse,
        steps,
        total_execution_time_ms: totalTime,
        success: true,
        metadata: {
          tools_used: Array.from(new Set(steps.map(s => s.tool_name))),
          context_gathered: !!this.ragContext,
        },
      };

    } catch (error) {
      console.error('[AgentOrchestrator] Error processing message:', error);

      const totalTime = Date.now() - startTime;

      return {
        message: `I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        steps,
        total_execution_time_ms: totalTime,
        success: false,
        metadata: {
          tools_used: Array.from(new Set(steps.map(s => s.tool_name))),
          context_gathered: !!this.ragContext,
        },
      };
    }
  }

  /**
   * Gather RAG context: User's campaigns, clients, lists for decision making
   */
  private async gatherRAGContext(): Promise<void> {
    try {
      // Get user's campaigns
      const campaigns = await CampaignService.getCampaignsForUser(
        this.context.userRole,
        this.context.userId,
        this.context.supabaseClient
      );

      console.log(`[RAG Context] Found ${campaigns.length} campaigns:`, campaigns.map(c => ({ id: c.id, name: c.name })));

      // Get user's clients
      const clients = await ClientService.getClientsForUser(
        this.context.userRole,
        this.context.userId
      );

      // Get user's KOL lists
      const { data: lists } = await supabase
        .from('lists')
        .select('id, name, notes, status')
        .limit(20);

      // Get counts for each list
      const listsWithCounts = await Promise.all(
        (lists || []).map(async (list) => {
          const { count } = await supabase
            .from('list_kols')
            .select('*', { count: 'exact', head: true })
            .eq('list_id', list.id);

          return {
            ...list,
            kol_count: count || 0,
          };
        })
      );

      this.ragContext = {
        user_campaigns: campaigns.slice(0, 10).map(c => ({
          id: c.id,
          name: c.name,
          client_name: c.client_name,
          status: c.status,
          total_budget: c.total_budget,
          start_date: c.start_date,
          end_date: c.end_date,
        })),
        user_clients: clients.slice(0, 10).map(c => ({
          id: c.id,
          name: c.name,
          email: c.email,
        })),
        user_lists: (listsWithCounts || []).map(l => ({
          id: l.id,
          name: l.name,
          description: l.notes,
          kol_count: l.kol_count,
        })),
      };

      console.log('[AgentOrchestrator] RAG context gathered:', {
        campaigns: this.ragContext.user_campaigns.length,
        clients: this.ragContext.user_clients.length,
        lists: this.ragContext.user_lists.length,
      });

    } catch (error) {
      console.error('[AgentOrchestrator] Error gathering RAG context:', error);
      // Don't fail - just continue without context
      this.ragContext = {
        user_campaigns: [],
        user_clients: [],
        user_lists: [],
      };
    }
  }

  /**
   * Call GPT-4 with function calling capability
   */
  private async callGPT4WithTools(): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    const systemPrompt = this.buildSystemPrompt();

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...this.conversationHistory.map(msg => {
        if (msg.role === 'function') {
          return {
            role: 'function' as const,
            name: msg.name!,
            content: msg.content,
          };
        }
        return {
          role: msg.role as 'system' | 'user' | 'assistant',
          content: msg.content,
        };
      }),
    ];

    console.log(`[AgentOrchestrator] Calling GPT-4o with ${messages.length} messages (1 system + ${this.conversationHistory.length} conversation)`);
    console.log(`[AgentOrchestrator] Last 3 messages:`, messages.slice(-3).map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content.substring(0, 100) : m.content })));

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages,
      tools: getToolDefinitionsForOpenAI(),
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 1500,
    });

    return response;
  }

  /**
   * Build system prompt with RAG context
   */
  private buildSystemPrompt(): string {
    // Get current date in YYYY-MM-DD format
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const todayFormatted = today.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const basePrompt = `You are an intelligent AI assistant for a KOL (Key Opinion Leader) campaign management system. Your role is to help users manage their marketing campaigns, find KOLs, create lists, analyze performance, and communicate with clients.

CURRENT DATE: ${todayFormatted} (${todayStr})

**CRITICAL: CONVERSATION MEMORY**
You MUST read and remember ALL previous messages in this conversation. The user may provide information across multiple messages. When you have accumulated enough information to complete a requested action, EXECUTE THE TOOL IMMEDIATELY. Do NOT ask for information that was already provided in earlier messages.

Example of correct behavior:
- User: "Create a campaign"
- You: "Which client, budget, dates?"
- User: "Holo Hive, $50K, Q4 Test"
- You: "What are the start and end dates?"
- User: "Nov 18 to Nov 30 2025"
- You: [IMMEDIATELY call create_campaign with: client=Holo Hive, name=Q4 Test, budget=50000, start=2025-11-18, end=2025-11-30] ← EXECUTE NOW!

WRONG behavior: Asking again for client name or budget that was already provided.

**CRITICAL: USE UUIDs FROM USER CONTEXT - NEVER USE NAMES AS IDs**
All tool parameters that end with "_id" (campaign_id, client_id, list_id) MUST be UUIDs, NOT names!
- When user says "Q4 Test campaign" → Look in USER CONTEXT below to find the UUID (e.g., "e6391f1c-...")
- When user says "TEST AI list" → Look in USER CONTEXT below to find the list UUID
- When user says "Holo Hive client" → Look in USER CONTEXT below to find the client UUID

WRONG: campaign_id: "Q4 Test" ← This is INVALID, will fail validation!
CORRECT: campaign_id: "e6391f1c-f0df-4eb3-a4db-2f9208df89df" ← This is a UUID, will succeed!

ALWAYS check the USER CONTEXT section at the end of this prompt BEFORE calling any tool. The context lists all campaigns, clients, and lists with their UUIDs.

You have access to powerful tools that can:
- Search for KOLs using semantic/natural language queries
- Create and manage marketing campaigns
- Build curated KOL lists
- Add KOLs to campaigns
- Generate professional client messages
- Save user's own messages to learning database
- Analyze campaign performance and provide insights
- Provide budget recommendations
- Update campaign status
- Retrieve user context

IMPORTANT GUIDELINES:
1. **CONVERSATION CONTEXT** - You have access to the full conversation history. When a user references something from earlier in the conversation (like "those KOLs", "that campaign", "the list we just created"), look back at previous messages and tool results to understand what they're referring to. ALWAYS maintain context across messages.
2. **ASK CLARIFYING QUESTIONS** - If the user's request is missing critical information, ASK for it before executing tools. For example:
   - "Create a campaign" → Ask: "Which client is this campaign for? What's the budget and timeframe?"
   - "Generate a message" → If client not specified, ask: "Which client would you like to message?"
   - "Add these to a campaign" → If multiple campaigns exist, ask: "Which campaign should I add them to?"
   DO NOT guess or make assumptions. Be conversational and ask naturally.
3. **COMPLETE PENDING ACTIONS** - When you've asked for information and the user provides it, IMMEDIATELY proceed with the action. For example:
   - If you asked for campaign details and user provides them → Execute create_campaign tool NOW
   - If you asked which client and user answers → Proceed with the original request immediately
   - Don't just acknowledge the information - USE IT to complete the pending task
   - Look back at the conversation to see what action was being requested and complete it
4. **REMEMBER PREVIOUS RESULTS** - When a user refers to previous tool results:
   - "Create a list with those KOLs" → Use the KOL IDs from the previous search_kols result
   - "Add them to my campaign" → Use the entities from the previous operation
   - "That list we created" → Reference the list from previous create_kol_list result
5. **Always gather context first** - Use get_user_context if you need to know what campaigns/clients/lists the user has
6. **Be proactive** - If a user asks to create something, check if they have the necessary resources first
7. **Use semantic search** - When looking for KOLs, use natural language descriptions
8. **Confirm destructive actions** - Before updating or deleting, confirm with the user
9. **Provide clear responses** - Explain what you did and show relevant results
10. **Handle errors gracefully** - If a tool fails, explain why and suggest alternatives
11. **Multi-step workflows** - Break complex requests into logical steps
12. **Date handling** - When users say "today", use ${todayStr}. Convert all dates to YYYY-MM-DD format (e.g., "Oct 13th, 2025" → "2025-10-13"). You must handle natural language dates yourself and convert them to the required format.
13. **Client lookup** - When users mention a client by name, search for it in the USER CONTEXT below to find the client_id. If the client doesn't exist in the context, inform the user they need to create it first.
14. **List handling** - When users ask to add a list to a campaign, search for the list by name in the USER CONTEXT below to get the list_id, then use add_kols_to_campaign with the list_id parameter (not kol_ids).
15. **Message generation** - When users ask to "generate", "create", or "write" a message/outreach/email for a client:
    a. Look up the client_id from the USER CONTEXT (match by client name)
    b. If client not specified or ambiguous, ASK which client they mean
    c. Determine the message_type from the request (e.g., "initial outreach" = initial_outreach, "NDA" = nda_request)
    d. Use generate_client_message tool - if client is clear, proceed immediately
    e. If no specific campaign is mentioned, generate without campaign_id (the tool will auto-fill variables)
    f. Available message types: initial_outreach, nda_request, kol_list_access, kol_list_delivery, final_kol_picks, post_call_followup, contract_activation, activation_inputs, budget_plan, outreach_update, finalizing_kols, creator_brief, final_checklist, activation_day, mid_campaign_update, initial_results, final_report
16. **Saving user messages** - When users want to "save", "add", or "store" their own message for learning:
    a. Ask them to paste the full message content
    b. Identify the message type (or ask if unclear)
    c. Look up client_id from USER CONTEXT
    d. Optionally ask for campaign and rating (1-5 stars)
    e. Use save_message_example tool to save to learning database
    f. Confirm the message was saved and will improve future generations
17. **Campaign insights** - When users ask for "insights", "analysis", "thoughts", "feedback", or "what do you think" about a campaign:
    a. Look up the campaign_id from USER CONTEXT (match by campaign name)
    b. Use analyze_campaign_performance tool with include_recommendations=true
    c. Present the insights in a clear, conversational way highlighting strengths, improvements, and recommendations
    d. If user doesn't specify a campaign, ask which one they want analyzed or list available campaigns
18. **Budget recommendations** - When users ask for budget recommendations, allocation advice, or how to spend their budget:
    a. The ONLY required parameter is total_budget - extract it from their message
    b. If they mention regions (e.g., "Korea and Japan", "Asia", "Global"), include those
    c. If they mention objectives (e.g., "engagement", "brand awareness"), include those
    d. campaign_id is OPTIONAL - only use if they reference a specific existing campaign by name
    e. If user says "new campaign", do NOT ask for campaign_id or client - proceed immediately with just budget/regions/objectives
    f. Example: "Give me budget recommendations for $100k targeting Korea" → Call get_budget_recommendations(total_budget=100000, regions=["Korea"]) immediately
    g. DO NOT ask for campaign or client information when user clearly states it's a new/hypothetical budget analysis

USER CONTEXT (what this user has access to):`;

    // Add RAG context if available
    if (this.ragContext) {
      let contextDetails = '\n\n';

      if (this.ragContext.user_clients.length > 0) {
        contextDetails += `**Clients (${this.ragContext.user_clients.length}):**\n`;
        this.ragContext.user_clients.forEach(c => {
          contextDetails += `- ${c.name} (ID: ${c.id}, Email: ${c.email})\n`;
        });
        contextDetails += '\n';
      }

      if (this.ragContext.user_campaigns.length > 0) {
        contextDetails += `**Recent Campaigns (${this.ragContext.user_campaigns.length}):**\n`;
        this.ragContext.user_campaigns.forEach(c => {
          contextDetails += `- "${c.name}" (ID: ${c.id}) for ${c.client_name} - ${c.status} - $${c.total_budget}\n`;
        });
        contextDetails += '\n';
      }

      if (this.ragContext.user_lists.length > 0) {
        contextDetails += `**KOL Lists (${this.ragContext.user_lists.length}):**\n`;
        this.ragContext.user_lists.forEach(l => {
          contextDetails += `- "${l.name}" (ID: ${l.id}) - ${l.kol_count} KOLs${l.description ? ` - ${l.description}` : ''}\n`;
        });
        contextDetails += '\n';
      }

      if (this.ragContext.user_clients.length === 0) {
        contextDetails += `**Note:** User has no clients yet. They need to create a client before creating campaigns.\n`;
      }

      return basePrompt + contextDetails;
    }

    return basePrompt + '\n\n(Context not yet gathered)';
  }

  /**
   * Get conversation history (useful for debugging)
   */
  getConversationHistory(): ConversationMessage[] {
    return this.conversationHistory;
  }

  /**
   * Reset conversation history
   */
  resetConversation(): void {
    this.conversationHistory = [];
    this.ragContext = undefined;
  }

  /**
   * Add system message to conversation
   */
  addSystemMessage(message: string): void {
    this.conversationHistory.push({
      role: 'system',
      content: message,
    });
  }

  /**
   * Get RAG context (useful for debugging)
   */
  getRAGContext(): RAGContext | undefined {
    return this.ragContext;
  }

  /**
   * Retry failed tool execution with exponential backoff
   */
  private async retryToolExecution(
    toolName: string,
    parameters: any,
    attempt: number = 1
  ): Promise<ToolResult> {
    try {
      const tool = getToolByName(toolName);
      if (!tool) {
        throw new Error(`Tool not found: ${toolName}`);
      }

      const result = await tool.execute(parameters, this.context);

      if (result.success) {
        return result;
      }

      // If failed and we have retries left
      if (attempt < this.maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
        console.log(`[AgentOrchestrator] Retrying ${toolName} in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`);

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.retryToolExecution(toolName, parameters, attempt + 1);
      }

      return result;

    } catch (error) {
      if (attempt < this.maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`[AgentOrchestrator] Error in ${toolName}, retrying in ${delay}ms`);

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.retryToolExecution(toolName, parameters, attempt + 1);
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Analyze user intent from message (useful for routing)
   */
  static async analyzeIntent(message: string): Promise<{
    intent: 'create' | 'search' | 'analyze' | 'update' | 'delete' | 'general';
    entities: {
      campaign?: string;
      client?: string;
      kol?: string;
      list?: string;
    };
    confidence: number;
  }> {
    const intents = {
      create: ['create', 'make', 'build', 'generate', 'add', 'new'],
      search: ['find', 'search', 'look for', 'show me', 'get'],
      analyze: ['analyze', 'report', 'performance', 'how is', 'stats'],
      update: ['update', 'change', 'modify', 'edit'],
      delete: ['delete', 'remove', 'cancel'],
    };

    const lowerMessage = message.toLowerCase();

    // Simple keyword-based intent detection
    for (const [intent, keywords] of Object.entries(intents)) {
      for (const keyword of keywords) {
        if (lowerMessage.includes(keyword)) {
          return {
            intent: intent as any,
            entities: {}, // Could be enhanced with NER
            confidence: 0.8,
          };
        }
      }
    }

    return {
      intent: 'general',
      entities: {},
      confidence: 0.5,
    };
  }
}

// ============================================================================
// Conversation Memory Manager
// ============================================================================

/**
 * Manages conversation memory across sessions
 */
export class ConversationMemoryManager {
  /**
   * Save conversation to database
   */
  static async saveConversation(
    sessionId: string,
    userId: string,
    messages: ConversationMessage[],
    supabaseClient?: any
  ): Promise<void> {
    try {
      // Note: User and assistant messages are already saved via ChatService.addMessage()
      // This function is currently a no-op to prevent duplicates
      // In the future, we could use this to save system messages or tool execution details

      // Do nothing - messages are already persisted via ChatService.addMessage()
      return;

    } catch (error) {
      console.error('[ConversationMemoryManager] Error saving conversation:', error);
    }
  }

  /**
   * Load conversation from database
   */
  static async loadConversation(sessionId: string, supabaseClient?: any): Promise<ConversationMessage[]> {
    try {
      const client = supabaseClient || supabase;
      const { data, error } = await client
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      console.log(`[ConversationMemoryManager] Loaded ${(data || []).length} messages for session ${sessionId}`);

      return (data || []).map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        function_call: (msg.metadata && typeof msg.metadata === 'object' && !Array.isArray(msg.metadata) && 'function_call' in msg.metadata) ? msg.metadata.function_call as any : undefined,
      }));

    } catch (error) {
      console.error('[ConversationMemoryManager] Error loading conversation:', error);
      return [];
    }
  }

  /**
   * Get conversation summary (for context window management)
   */
  static async getConversationSummary(messages: ConversationMessage[]): Promise<string> {
    if (messages.length === 0) return '';

    // Simple summary: Last 3 exchanges
    const recentMessages = messages.slice(-6); // 3 user + 3 assistant

    return recentMessages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');
  }

  /**
   * Truncate conversation to fit context window
   */
  static truncateConversation(
    messages: ConversationMessage[],
    maxTokens: number = 6000
  ): ConversationMessage[] {
    // Simple truncation: Keep first (system) and last N messages
    if (messages.length <= 10) return messages;

    const systemMessages = messages.filter(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    // Keep last 20 messages + system messages
    const recentMessages = otherMessages.slice(-20);

    return [...systemMessages, ...recentMessages];
  }
}
