import { supabase } from './supabase';
import OpenAI from 'openai';

// Lazy initialization of OpenAI client
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

export interface MessageTemplate {
  id: string;
  name: string;
  message_type: string;
  subject?: string;
  content: string;
  variables: string[];
  usage_count: number;
  last_used_at?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MessageExample {
  id: string;
  user_id: string;
  client_id?: string;
  campaign_id?: string;
  message_type: string;
  subject?: string;
  content: string;
  template_id?: string;
  was_ai_generated: boolean;
  original_ai_content?: string;
  user_rating?: number;
  was_edited: boolean;
  edit_count: number;
  was_sent: boolean;
  context_data?: any;
  generation_parameters?: any;
  created_at: string;
}

export interface GenerateMessageOptions {
  message_type: string;
  client_id?: string;
  campaign_id?: string;
  variables?: Record<string, string>;
  custom_instructions?: string;
  use_learning?: boolean; // Whether to search for similar examples
  user_id?: string;
  supabaseClient?: any;
}

export class MessageTemplateService {
  /**
   * Get all active templates
   */
  static async getTemplates(supabaseClient?: any): Promise<MessageTemplate[]> {
    const client = supabaseClient || supabase;
    const { data, error } = await client
      .from('message_templates')
      .select('*')
      .eq('is_active', true)
      .order('usage_count', { ascending: false });

    if (error) {
      console.error('Error fetching templates:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Get template by type
   */
  static async getTemplateByType(
    messageType: string,
    supabaseClient?: any
  ): Promise<MessageTemplate | null> {
    const client = supabaseClient || supabase;
    const { data, error } = await client
      .from('message_templates')
      .select('*')
      .eq('message_type', messageType)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      console.error('Error fetching template:', error);
      throw error;
    }

    return data;
  }

  /**
   * Fill template variables with actual values
   */
  static fillTemplate(
    template: string,
    variables: Record<string, string>
  ): string {
    let filled = template;

    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\[${key}\\]`, 'g');
      filled = filled.replace(regex, value);
    });

    return filled;
  }

  /**
   * Format message for Telegram
   * Telegram uses specific markdown formatting
   */
  static formatForTelegram(content: string): string {
    // Telegram formatting:
    // Bold: **text** or __text__
    // Italic: *text* or _text_
    // Code: `text`
    // Links: [text](url)

    // Convert section headers to bold
    let formatted = content;

    // Make standalone section names bold (like "Breakdown", "Focus", "Next steps:")
    formatted = formatted.replace(/^([\w\s]+):$/gm, '**$1:**');
    formatted = formatted.replace(/\n([\w\s]+):\n/g, '\n**$1:**\n');

    // Make bullet points more visible
    formatted = formatted.replace(/^•/gm, '▪️');
    formatted = formatted.replace(/^-/gm, '▪️');

    // Make "GM" and "Hey team" bold
    formatted = formatted.replace(/^(GM|Hey team|Hi)/gm, '**$1**');

    return formatted;
  }

  /**
   * Extract variables from template content
   */
  static extractVariables(content: string): string[] {
    const regex = /\[([A-Z_]+)\]/g;
    const matches = Array.from(content.matchAll(regex));
    const variables = new Set<string>();

    for (const match of matches) {
      variables.add(match[1]);
    }

    return Array.from(variables);
  }

  /**
   * Generate embedding for message content
   */
  static async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await getOpenAI().embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  /**
   * Find similar message examples using vector search
   */
  static async findSimilarExamples(
    messageType: string,
    searchQuery: string,
    limit: number = 5,
    supabaseClient?: any
  ): Promise<MessageExample[]> {
    const client = supabaseClient || supabase;

    try {
      // Generate embedding for search query
      const embedding = await this.generateEmbedding(searchQuery);

      // Search for similar messages
      const { data, error } = await client.rpc('search_similar_messages', {
        query_embedding: JSON.stringify(embedding),
        message_type_filter: messageType,
        match_threshold: 0.7,
        match_count: limit,
      });

      if (error) {
        console.error('Error searching similar messages:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in findSimilarExamples:', error);
      return [];
    }
  }

  /**
   * Generate message using template + AI enhancement + learning
   */
  static async generateMessage(
    options: GenerateMessageOptions
  ): Promise<{ content: string; template_id?: string }> {
    const client = options.supabaseClient || supabase;

    // 1. Get the template
    const template = await this.getTemplateByType(options.message_type, client);

    if (!template) {
      throw new Error(`No template found for message type: ${options.message_type}`);
    }

    // 2. Fill template variables
    let baseContent = template.content;
    if (options.variables) {
      baseContent = this.fillTemplate(baseContent, options.variables);
    }

    // 3. If learning enabled, find similar examples for context
    let similarExamples: MessageExample[] = [];
    if (options.use_learning !== false) {
      similarExamples = await this.findSimilarExamples(
        options.message_type,
        baseContent,
        3,
        client
      );
    }

    // 4. Use AI to enhance the message (if needed)
    let enhancedContent = baseContent;

    // If we have similar examples or custom instructions, use AI to enhance
    if (similarExamples.length > 0 || options.custom_instructions) {
      const systemPrompt = `You are a professional marketing communications specialist.
You help refine client messages to be clear, professional, and effective.

${similarExamples.length > 0 ? `Here are examples of similar messages that were well-received:\n\n${similarExamples.map((ex, i) => `Example ${i + 1} (Rating: ${ex.user_rating || 'N/A'}/5):\n${ex.content}\n`).join('\n')}` : ''}

${options.custom_instructions ? `Additional instructions: ${options.custom_instructions}` : ''}

Review the message below and make minor improvements while maintaining the core structure and tone.
Only improve clarity, professionalism, and impact. Do not change the fundamental message.`;

      const userPrompt = `Here's the message to review:\n\n${baseContent}`;

      try {
        const response = await getOpenAI().chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 1000,
        });

        enhancedContent = response.choices[0].message.content || baseContent;
      } catch (error) {
        console.error('Error enhancing message with AI:', error);
        // Fall back to base content if AI enhancement fails
        enhancedContent = baseContent;
      }
    }

    // 5. Format for Telegram
    const telegramFormatted = this.formatForTelegram(enhancedContent);

    // 6. Increment template usage
    await client.rpc('increment_template_usage', {
      template_uuid: template.id,
    });

    return {
      content: telegramFormatted,
      template_id: template.id,
    };
  }

  /**
   * Save message example (for learning)
   */
  static async saveMessageExample(
    userId: string,
    messageType: string,
    content: string,
    options: {
      client_id?: string;
      campaign_id?: string;
      template_id?: string;
      was_ai_generated?: boolean;
      original_ai_content?: string;
      was_sent?: boolean;
      context_data?: any;
      generation_parameters?: any;
      supabaseClient?: any;
    } = {}
  ): Promise<string> {
    const client = options.supabaseClient || supabase;

    // Generate embedding for the message
    const embedding = await this.generateEmbedding(content);

    const { data, error } = await client
      .from('client_message_examples')
      .insert({
        user_id: userId,
        client_id: options.client_id,
        campaign_id: options.campaign_id,
        message_type: messageType,
        content,
        template_id: options.template_id,
        was_ai_generated: options.was_ai_generated || false,
        original_ai_content: options.original_ai_content,
        was_sent: options.was_sent || false,
        context_data: options.context_data,
        generation_parameters: options.generation_parameters,
        embedding,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error saving message example:', error);
      throw error;
    }

    return data.id;
  }

  /**
   * Track message feedback (edits, ratings, etc.)
   */
  static async trackFeedback(
    messageExampleId: string,
    feedbackType: 'edit' | 'rating' | 'sent' | 'discarded',
    options: {
      before_content?: string;
      after_content?: string;
      helpful_score?: number;
      user_comments?: string;
      supabaseClient?: any;
    } = {}
  ): Promise<void> {
    const client = options.supabaseClient || supabase;

    // Calculate edit summary if it's an edit
    let editSummary = null;
    if (feedbackType === 'edit' && options.before_content && options.after_content) {
      const beforeLength = options.before_content.length;
      const afterLength = options.after_content.length;
      const lengthDiff = Math.abs(afterLength - beforeLength);
      editSummary = `Changed ${lengthDiff} characters (${beforeLength} → ${afterLength})`;
    }

    await client.from('ai_message_feedback').insert({
      message_example_id: messageExampleId,
      feedback_type: feedbackType,
      before_content: options.before_content,
      after_content: options.after_content,
      edit_summary: editSummary,
      helpful_score: options.helpful_score,
      user_comments: options.user_comments,
    });

    // Update the message example
    if (feedbackType === 'edit') {
      await client
        .from('client_message_examples')
        .update({
          was_edited: true,
          edit_count: client.raw('edit_count + 1'),
          content: options.after_content,
        })
        .eq('id', messageExampleId);

      // Re-generate embedding for the edited content
      if (options.after_content) {
        const newEmbedding = await this.generateEmbedding(options.after_content);
        await client
          .from('client_message_examples')
          .update({ embedding: newEmbedding })
          .eq('id', messageExampleId);
      }
    } else if (feedbackType === 'rating' && options.helpful_score) {
      await client
        .from('client_message_examples')
        .update({ user_rating: options.helpful_score })
        .eq('id', messageExampleId);
    } else if (feedbackType === 'sent') {
      await client
        .from('client_message_examples')
        .update({ was_sent: true })
        .eq('id', messageExampleId);
    }
  }

  /**
   * Get message statistics for learning insights
   */
  static async getMessageStats(
    userId: string,
    messageType?: string,
    supabaseClient?: any
  ): Promise<any> {
    const client = supabaseClient || supabase;

    let query = client
      .from('client_message_examples')
      .select('*')
      .eq('user_id', userId);

    if (messageType) {
      query = query.eq('message_type', messageType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching message stats:', error);
      throw error;
    }

    const messages = data || [];

    return {
      total_messages: messages.length,
      ai_generated: messages.filter((m: any) => m.was_ai_generated).length,
      sent: messages.filter((m: any) => m.was_sent).length,
      edited: messages.filter((m: any) => m.was_edited).length,
      average_rating:
        messages.filter((m: any) => m.user_rating).reduce((sum: number, m: any) => sum + (m.user_rating || 0), 0) /
          messages.filter((m: any) => m.user_rating).length || 0,
      by_type: messages.reduce((acc: any, m: any) => {
        acc[m.message_type] = (acc[m.message_type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };
  }
}
