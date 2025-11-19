import { supabase } from './supabase';
import { Database } from './database.types';
import { AIService } from './aiService';
import { AgentOrchestrator, AgentResponse } from './agentOrchestrator';

type ChatSession = Database['public']['Tables']['chat_sessions']['Row'];
type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];

export interface ChatSessionWithMessages extends ChatSession {
  messages: ChatMessage[];
}

export interface AgentChatMessage extends ChatMessage {
  agent_actions?: any[];
  agent_status?: 'thinking' | 'executing' | 'completed' | 'error';
  execution_time_ms?: number;
  is_agent_response?: boolean;
}

export class ChatService {
  // Get all chat sessions for the current user
  static async getChatSessions(): Promise<ChatSession[]> {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('User not authenticated');
    }

    const { data, error } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching chat sessions:', error);
      throw error;
    }

    return data || [];
  }

  // Get a specific chat session with all messages
  static async getChatSession(sessionId: string): Promise<ChatSessionWithMessages | null> {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('User not authenticated');
    }

    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (sessionError) {
      console.error('Error fetching chat session:', sessionError);
      throw sessionError;
    }

    if (!session) return null;

    const { data: messages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('Error fetching chat messages:', messagesError);
      throw messagesError;
    }

    return {
      ...session,
      messages: messages || []
    };
  }

  // Create a new chat session
  static async createChatSession(title?: string): Promise<ChatSession> {
    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({
        title: title || 'New Chat',
        user_id: (await supabase.auth.getUser()).data.user?.id
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating chat session:', error);
      throw error;
    }

    // If no title was provided, update with the session ID
    if (!title) {
      const sessionId = data.id;
      const newTitle = `Chat ${sessionId.slice(0, 8)}`;
      await this.updateSessionTitle(sessionId, newTitle);
      data.title = newTitle;
    }

    return data;
  }

  // Add a message to a chat session
  static async addMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: Record<string, any>,
    supabaseClient?: any // Optional: pass authenticated client for server-side calls
  ): Promise<ChatMessage> {
    const client = supabaseClient || supabase;

    const { data, error } = await client
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        role,
        content,
        metadata: metadata || {}
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding message:', error);
      throw error;
    }

    // Update the session's updated_at timestamp
    await client
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    return data;
  }

  // Update chat session title
  static async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('User not authenticated');
    }

    const { error } = await supabase
      .from('chat_sessions')
      .update({
        title,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error updating session title:', error);
      throw error;
    }
  }

  // Delete a chat session and all its messages
  static async deleteChatSession(sessionId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('User not authenticated');
    }

    const { error } = await supabase
      .from('chat_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting chat session:', error);
      throw error;
    }
  }

  // Get AI response using the enhanced AIService (legacy)
  static async getAIResponse(messages: ChatMessage[], context?: any): Promise<string> {
    return await AIService.getAIResponse(messages, context);
  }

  // Get AI response using Agent Orchestrator (NEW - recommended)
  static async getAgentResponse(
    sessionId: string,
    userMessage: string,
    options?: {
      userId?: string;
      userRole?: 'admin' | 'member' | 'client';
      useStreaming?: boolean;
      onStatus?: (status: 'thinking' | 'executing' | 'completed' | 'error') => void;
      onToolExecution?: (toolName: string, step: number) => void;
      supabaseClient?: any; // Optional: pass authenticated client for server-side calls
    }
  ): Promise<AgentChatMessage> {
    // Use provided user info or get from session
    let userId: string;
    let userRole: 'admin' | 'member' | 'client';

    if (options?.userId && options?.userRole) {
      userId = options.userId;
      userRole = options.userRole;
    } else {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('User not authenticated');
      }

      // Get user role
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      userId = user.id;
      userRole = (userData?.role || 'member') as 'admin' | 'member' | 'client';
    }

    // Get the supabase client to use (server-side or client-side)
    const client = options?.supabaseClient;

    // Add user message to chat
    await this.addMessage(sessionId, 'user', userMessage, undefined, client);

    // Update status: thinking
    if (options?.onStatus) {
      options.onStatus('thinking');
    }

    // Load conversation history from database for context
    const { ConversationMemoryManager } = await import('./agentOrchestrator');
    const conversationHistory = await ConversationMemoryManager.loadConversation(sessionId, client);

    console.log(`[ChatService] Loaded ${conversationHistory.length} messages from history for session ${sessionId}`);
    if (conversationHistory.length > 0) {
      console.log(`[ChatService] Last 3 messages:`, conversationHistory.slice(-3).map(m => ({ role: m.role, content: m.content.substring(0, 100) })));
    }

    // Create orchestrator instance with loaded conversation history
    const orchestrator = new AgentOrchestrator(
      {
        userId: userId,
        userRole: userRole,
        sessionId,
        supabaseClient: client, // Pass authenticated client to tools
      },
      sessionId,
      conversationHistory
    );

    try {
      // Update status: executing
      if (options?.onStatus) {
        options.onStatus('executing');
      }

      // Process message through orchestrator
      const response: AgentResponse = await orchestrator.processMessage(userMessage);

      // Notify about tool executions
      if (options?.onToolExecution) {
        response.steps.forEach((step, index) => {
          options.onToolExecution!(step.tool_name, index + 1);
        });
      }

      // Update status: completed or error
      if (options?.onStatus) {
        options.onStatus(response.success ? 'completed' : 'error');
      }

      // Track reversible actions
      const reversibleActions = await this.trackAgentActions(
        sessionId,
        userId,
        response.steps
      );

      // Add assistant message with metadata
      const assistantMessage = await this.addMessage(
        sessionId,
        'assistant',
        response.message,
        {
          agent_actions: response.steps.map(step => ({
            tool_name: step.tool_name,
            parameters: step.parameters,
            result: step.result,
            execution_time_ms: step.execution_time_ms,
          })),
          agent_status: response.success ? 'completed' : 'error',
          execution_time_ms: response.total_execution_time_ms,
          is_agent_response: true,
          tools_used: response.metadata?.tools_used || [],
        },
        client // Pass authenticated client for server-side calls
      );

      // Save updated conversation history to database
      const updatedHistory = orchestrator.getConversationHistory();
      await ConversationMemoryManager.saveConversation(sessionId, userId, updatedHistory, client);

      return {
        ...assistantMessage,
        agent_actions: response.steps,
        agent_status: response.success ? 'completed' : 'error',
        execution_time_ms: response.total_execution_time_ms,
        is_agent_response: true,
      };

    } catch (error) {
      console.error('[ChatService] Error getting agent response:', error);

      if (options?.onStatus) {
        options.onStatus('error');
      }

      // Add error message
      const errorMessage = await this.addMessage(
        sessionId,
        'assistant',
        `I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          agent_status: 'error',
          is_agent_response: true,
        }
      );

      return {
        ...errorMessage,
        agent_status: 'error',
        is_agent_response: true,
      };
    }
  }

  // Track agent actions for undo/rollback
  private static async trackAgentActions(
    sessionId: string,
    userId: string,
    steps: any[]
  ): Promise<string[]> {
    const actionIds: string[] = [];

    for (const step of steps) {
      // Determine if action is reversible
      const isReversible = this.isActionReversible(step.tool_name, step.result);

      // Extract entity information
      const entityInfo = this.extractEntityInfo(step);

      console.log(`[ChatService.trackAgentActions] Step: ${step.tool_name}, Reversible: ${isReversible}, Entity:`, entityInfo);

      if (isReversible && entityInfo) {
        const { data, error } = await (supabase as any)
          .from('agent_action_history')
          .insert({
            session_id: sessionId,
            user_id: userId,
            action_type: this.getActionType(step.tool_name),
            tool_name: step.tool_name,
            entity_type: entityInfo.type,
            entity_id: entityInfo.id,
            action_data: {
              parameters: step.parameters,
              result: step.result,
            },
            is_reversible: true,
            is_reversed: false,
          })
          .select('id')
          .single();

        if (error) {
          console.error(`[ChatService.trackAgentActions] Error tracking action ${step.tool_name}:`, error);
        } else if (data) {
          actionIds.push(data.id);
          console.log(`[ChatService.trackAgentActions] Tracked action ${step.tool_name} with ID:`, data.id);
        }
      }
    }

    return actionIds;
  }

  // Determine if an action can be reversed
  private static isActionReversible(toolName: string, result: any): boolean {
    if (!result.success) return false;

    const reversibleTools = [
      'create_campaign',
      'create_kol_list',
      'add_kols_to_campaign',
      'update_campaign_status',
    ];

    return reversibleTools.includes(toolName);
  }

  // Extract entity information from step result
  private static extractEntityInfo(step: any): { type: string; id: string } | null {
    const { tool_name, result } = step;

    if (!result.success || !result.data) return null;

    switch (tool_name) {
      case 'create_campaign':
        return { type: 'campaign', id: result.data.id };
      case 'create_kol_list':
        return { type: 'kol_list', id: result.data.list?.id || result.data.id };
      case 'add_kols_to_campaign':
        return { type: 'campaign_kols', id: step.parameters.campaign_id };
      case 'update_campaign_status':
        return { type: 'campaign', id: step.parameters.campaign_id };
      default:
        return null;
    }
  }

  // Get action type from tool name
  private static getActionType(toolName: string): string {
    if (toolName.startsWith('create_')) return 'create';
    if (toolName.startsWith('update_')) return 'update';
    if (toolName.startsWith('delete_')) return 'delete';
    if (toolName.startsWith('search_') || toolName.startsWith('get_')) return 'search';
    if (toolName.startsWith('add_')) return 'create';
    if (toolName.startsWith('generate_')) return 'generate';
    if (toolName.startsWith('analyze_')) return 'analyze';
    return 'other';
  }

  // Undo a specific action
  static async undoAction(actionId: string, supabaseClient?: any): Promise<boolean> {
    const client = supabaseClient || supabase;
    const { data: { user } } = await client.auth.getUser();

    if (!user) {
      throw new Error('User not authenticated');
    }

    // Get action details
    const { data: action, error: fetchError } = await client
      .from('agent_action_history')
      .select('*')
      .eq('id', actionId)
      .eq('user_id', user.id)
      .eq('is_reversible', true)
      .eq('is_reversed', false)
      .single();

    if (fetchError || !action) {
      console.error('Action not found or not reversible:', fetchError);
      return false;
    }

    try {
      // Perform undo based on action type
      let undoSuccess = false;

      switch (action.tool_name) {
        case 'create_campaign':
          // Delete the campaign
          const { error: deleteError } = await client
            .from('campaigns')
            .delete()
            .eq('id', action.entity_id);
          undoSuccess = !deleteError;
          break;

        case 'create_kol_list':
          // Delete the list
          const { error: listError } = await client
            .from('kol_lists')
            .delete()
            .eq('id', action.entity_id);
          undoSuccess = !listError;
          break;

        case 'add_kols_to_campaign':
          // Remove KOLs from campaign
          const kolIds = action.action_data.parameters?.kol_ids || [];
          const { error: removeError } = await client
            .from('campaign_kols')
            .delete()
            .eq('campaign_id', action.entity_id)
            .in('kol_id', kolIds);
          undoSuccess = !removeError;
          break;

        case 'update_campaign_status':
          // Revert to previous status (stored in action_data)
          const previousStatus = action.action_data.previous_status;
          if (previousStatus) {
            const { error: revertError } = await client
              .from('campaigns')
              .update({ status: previousStatus })
              .eq('id', action.entity_id);
            undoSuccess = !revertError;
          }
          break;

        default:
          console.log('Undo not implemented for:', action.tool_name);
          return false;
      }

      if (undoSuccess) {
        // Mark action as reversed
        await client
          .from('agent_action_history')
          .update({
            is_reversed: true,
            reversed_at: new Date().toISOString(),
          })
          .eq('id', actionId);

        return true;
      }

      return false;

    } catch (error) {
      console.error('[ChatService] Error undoing action:', error);
      return false;
    }
  }

  // Get reversible actions for a session
  static async getReversibleActions(sessionId: string, supabaseClient?: any): Promise<any[]> {
    const client = supabaseClient || supabase;
    const { data: { user } } = await client.auth.getUser();

    if (!user) {
      throw new Error('User not authenticated');
    }

    const { data, error } = await client
      .from('agent_action_history')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .eq('is_reversible', true)
      .eq('is_reversed', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching reversible actions:', error);
      return [];
    }

    return data || [];
  }

  // Update all existing sessions with "New Chat" title to use their session ID
  static async updateExistingNewChatSessions(): Promise<void> {
    const { data: sessions, error } = await supabase
      .from('chat_sessions')
      .select('id, title')
      .eq('title', 'New Chat');

    if (error) {
      console.error('Error fetching sessions with "New Chat" title:', error);
      return;
    }

    if (sessions && sessions.length > 0) {
      for (const session of sessions) {
        const newTitle = `Chat ${session.id.slice(0, 8)}`;
        await this.updateSessionTitle(session.id, newTitle);
      }
    }
  }
} 