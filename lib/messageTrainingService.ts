import { supabase } from './supabase';
import { Database } from './database.types';
import { OpenAIService } from './openaiService';

export interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  category: 'campaign' | 'outreach' | 'follow-up' | 'general';
  tone: 'professional' | 'casual' | 'friendly' | 'formal';
  target_audience: 'kol' | 'client' | 'partner';
  tags: string[];
  usage_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface MessageContext {
  campaignType?: string;
  targetRegion?: string;
  budget?: number;
  kolCount?: number;
  clientName?: string;
  kolName?: string;
  platform?: string;
  contentType?: string;
}

export interface TrainingData {
  messages: any[];
  campaigns: any[];
  clientInteractions: any[];
  kolInteractions: any[];
}

export class MessageTrainingService {
  // Get all message templates
  static async getMessageTemplates(): Promise<MessageTemplate[]> {
    const { data, error } = await supabase
      .from('message_templates')
      .select('*')
      .order('usage_count', { ascending: false });

    if (error) {
      console.error('Error fetching message templates:', error);
      return [];
    }

    return data || [];
  }

  // Create a new message template
  static async createMessageTemplate(template: Omit<MessageTemplate, 'id' | 'usage_count' | 'created_at' | 'updated_at'>): Promise<MessageTemplate | null> {
    const { data, error } = await supabase
      .from('message_templates')
      .insert({
        ...template,
        usage_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating message template:', error);
      return null;
    }

    return data;
  }

  // Update message template usage count
  static async incrementUsageCount(templateId: string): Promise<void> {
    // First get current usage count
    const { data: template } = await supabase
      .from('message_templates')
      .select('usage_count')
      .eq('id', templateId)
      .single();

    if (template) {
      const { error } = await supabase
        .from('message_templates')
        .update({ 
          usage_count: template.usage_count + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', templateId);

      if (error) {
        console.error('Error updating usage count:', error);
      }
    }
  }

  // Generate contextual message based on context
  static async generateContextualMessage(context: MessageContext, template?: MessageTemplate): Promise<string> {
    if (template) {
      return this.customizeTemplate(template, context);
    }

    // Generate new message based on context
    return await this.generateNewMessage(context);
  }

  // Customize existing template with context
  private static customizeTemplate(template: MessageTemplate, context: MessageContext): string {
    let message = template.content;

    // Replace placeholders with context data
    if (context.clientName) {
      message = message.replace(/\{client_name\}/g, context.clientName);
    }
    if (context.kolName) {
      message = message.replace(/\{kol_name\}/g, context.kolName);
    }
    if (context.campaignType) {
      message = message.replace(/\{campaign_type\}/g, context.campaignType);
    }
    if (context.targetRegion) {
      message = message.replace(/\{target_region\}/g, context.targetRegion);
    }
    if (context.budget) {
      message = message.replace(/\{budget\}/g, `$${context.budget.toLocaleString()}`);
    }
    if (context.kolCount) {
      message = message.replace(/\{kol_count\}/g, context.kolCount.toString());
    }
    if (context.platform) {
      message = message.replace(/\{platform\}/g, context.platform);
    }
    if (context.contentType) {
      message = message.replace(/\{content_type\}/g, context.contentType);
    }

    return message;
  }

  // Generate new message based on context
  private static async generateNewMessage(context: MessageContext): Promise<string> {
    try {
      // Use OpenAI service for real AI message generation
      const message = await OpenAIService.generateMessageTemplate(context);
      return message;
    } catch (error) {
      console.error('Error generating new message:', error);
      
      // Fallback to template-based generation
      const { campaignType, targetRegion, budget, kolCount, clientName, kolName, platform, contentType } = context;

      // Campaign outreach message
      if (campaignType && targetRegion) {
        return this.generateCampaignOutreachMessage(context);
      }

      // KOL outreach message
      if (kolName && platform) {
        return this.generateKOLOutreachMessage(context);
      }

      // Client update message
      if (clientName && campaignType) {
        return this.generateClientUpdateMessage(context);
      }

      // Default message
      return this.generateDefaultMessage(context);
    }
  }

  private static generateCampaignOutreachMessage(context: MessageContext): string {
    const { campaignType, targetRegion, budget, kolCount, platform } = context;
    
    return `Hi there! 👋

We're launching a ${campaignType} campaign targeting ${targetRegion} and we'd love to collaborate with you!

**Campaign Details:**
• **Type**: ${campaignType}
• **Region**: ${targetRegion}
• **Budget**: ${budget ? `$${budget.toLocaleString()}` : 'TBD'}
• **KOLs**: ${kolCount || 'Multiple'} creators
• **Platform**: ${platform || 'X/Twitter & Telegram'}

**What we're looking for:**
• Authentic content that resonates with your audience
• Creative collaboration on campaign messaging
• Engagement with your community

Would you be interested in discussing this opportunity? We can share more details about the campaign goals and deliverables.

Looking forward to hearing from you! 🚀`;
  }

  private static generateKOLOutreachMessage(context: MessageContext): string {
    const { kolName, platform, contentType, campaignType } = context;
    
    return `Hi ${kolName}! 👋

I've been following your amazing ${contentType || 'content'} on ${platform} and I'm impressed by your engagement and creativity!

We're currently working on a ${campaignType || 'exciting campaign'} and I think you'd be a perfect fit for our brand partnership.

**Why we'd love to work with you:**
• Your authentic voice and strong community
• High engagement rates on your content
• Alignment with our brand values
• Creative approach to ${contentType || 'content creation'}

Would you be interested in a quick chat about potential collaboration opportunities? We can discuss campaign details, deliverables, and compensation.

Looking forward to connecting! ✨`;
  }

  private static generateClientUpdateMessage(context: MessageContext): string {
    const { clientName, campaignType, targetRegion, budget } = context;
    
    return `Hi ${clientName}! 👋

I wanted to provide you with an update on your ${campaignType} campaign for ${targetRegion}.

**Campaign Progress:**
• **Status**: Active and performing well
• **Budget**: ${budget ? `$${budget.toLocaleString()}` : 'On track'}
• **Engagement**: Strong community response
• **Next Steps**: Content optimization and scaling

**Key Highlights:**
• KOLs are delivering excellent content
• Audience engagement exceeds expectations
• Regional performance is strong
• Ready for next phase optimization

Would you like to schedule a call to discuss the results and plan the next steps?

Best regards! 📈`;
  }

  private static generateDefaultMessage(context: MessageContext): string {
    return `Hi there! 👋

I hope this message finds you well. I wanted to reach out about a potential collaboration opportunity that I think would be a great fit.

We're looking for authentic creators who can help us connect with their community in a meaningful way. Your content and engagement really stand out to us.

Would you be interested in discussing this opportunity further? I'd love to share more details about what we have in mind.

Looking forward to hearing from you! ✨`;
  }

  // Get message suggestions based on context
  static async getMessageSuggestions(context: MessageContext): Promise<MessageTemplate[]> {
    const templates = await this.getMessageTemplates();
    
    // Filter templates based on context
    return templates.filter(template => {
      // Match category
      if (context.campaignType && template.category === 'campaign') return true;
      if (context.kolName && template.target_audience === 'kol') return true;
      if (context.clientName && template.target_audience === 'client') return true;
      
      // Match tags
      if (context.targetRegion && template.tags.includes(context.targetRegion.toLowerCase())) return true;
      if (context.platform && template.tags.includes(context.platform.toLowerCase())) return true;
      
      return false;
    }).slice(0, 5); // Return top 5 matches
  }

  // Train on existing data
  static async trainOnExistingData(): Promise<void> {
    try {
      // Collect training data from various sources
      const trainingData = await this.collectTrainingData();
      
      // Analyze patterns and create templates
      await this.analyzeAndCreateTemplates(trainingData);
      
      console.log('Message training completed successfully');
    } catch (error) {
      console.error('Error during message training:', error);
    }
  }

  private static async collectTrainingData(): Promise<TrainingData> {
    // This would collect data from campaigns, messages, etc.
    // For now, we'll create some sample templates
    return {
      messages: [],
      campaigns: [],
      clientInteractions: [],
      kolInteractions: []
    };
  }

  private static async analyzeAndCreateTemplates(trainingData: TrainingData): Promise<void> {
    // Create sample templates based on common patterns
    const sampleTemplates: Omit<MessageTemplate, 'id' | 'usage_count' | 'created_at' | 'updated_at'>[] = [
      {
        name: 'Campaign Outreach - APAC',
        content: `Hi there! 👋

We're launching a {campaign_type} campaign targeting {target_region} and we'd love to collaborate with you!

**Campaign Details:**
• **Type**: {campaign_type}
• **Region**: {target_region}
• **Budget**: {budget}
• **KOLs**: {kol_count} creators
• **Platform**: {platform}

Would you be interested in discussing this opportunity? We can share more details about the campaign goals and deliverables.

Looking forward to hearing from you! 🚀`,
        category: 'campaign',
        tone: 'professional',
        target_audience: 'kol',
        tags: ['apac', 'campaign', 'outreach']
      },
      {
        name: 'KOL Follow-up',
        content: `Hi {kol_name}! 👋

Just following up on our previous conversation about the {campaign_type} campaign. I wanted to check if you had any questions or if you'd like to discuss the details further.

We're really excited about the potential collaboration and think your audience would love this campaign!

Let me know if you're still interested or if you need any additional information.

Best regards! ✨`,
        category: 'follow-up',
        tone: 'friendly',
        target_audience: 'kol',
        tags: ['follow-up', 'kol']
      },
      {
        name: 'Client Update',
        content: `Hi {client_name}! 👋

I wanted to provide you with an update on your {campaign_type} campaign for {target_region}.

**Campaign Progress:**
• **Status**: Active and performing well
• **Budget**: {budget} (on track)
• **Engagement**: Strong community response
• **Next Steps**: Content optimization and scaling

Would you like to schedule a call to discuss the results and plan the next steps?

Best regards! 📈`,
        category: 'general',
        tone: 'professional',
        target_audience: 'client',
        tags: ['client', 'update', 'progress']
      }
    ];

    // Create templates in database
    for (const template of sampleTemplates) {
      await this.createMessageTemplate(template);
    }
  }

  // Get message analytics
  static async getMessageAnalytics(): Promise<any> {
    const templates = await this.getMessageTemplates();
    
    const analytics = {
      totalTemplates: templates.length,
      totalUsage: templates.reduce((sum, t) => sum + t.usage_count, 0),
      topTemplates: templates.slice(0, 5),
      categoryBreakdown: templates.reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      toneBreakdown: templates.reduce((acc, t) => {
        acc[t.tone] = (acc[t.tone] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };

    return analytics;
  }
} 