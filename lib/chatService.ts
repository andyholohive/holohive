import { supabase } from './supabase';
import { Database } from './database.types';
import { AIService } from './aiService';

type ChatSession = Database['public']['Tables']['chat_sessions']['Row'];
type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];

export interface ChatSessionWithMessages extends ChatSession {
  messages: ChatMessage[];
}

export class ChatService {
  // Get all chat sessions for the current user
  static async getChatSessions(): Promise<ChatSession[]> {
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching chat sessions:', error);
      throw error;
    }

    return data || [];
  }

  // Get a specific chat session with all messages
  static async getChatSession(sessionId: string): Promise<ChatSessionWithMessages | null> {
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('id', sessionId)
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
  static async addMessage(sessionId: string, role: 'user' | 'assistant' | 'system', content: string, metadata?: Record<string, any>): Promise<ChatMessage> {
    const { data, error } = await supabase
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
    await supabase
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    return data;
  }

  // Update chat session title
  static async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    const { error } = await supabase
      .from('chat_sessions')
      .update({ 
        title,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    if (error) {
      console.error('Error updating session title:', error);
      throw error;
    }
  }

  // Delete a chat session and all its messages
  static async deleteChatSession(sessionId: string): Promise<void> {
    const { error } = await supabase
      .from('chat_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) {
      console.error('Error deleting chat session:', error);
      throw error;
    }
  }

  // Get AI response using the enhanced AIService
  static async getAIResponse(messages: ChatMessage[], context?: any): Promise<string> {
    return await AIService.getAIResponse(messages, context);
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