import { supabase } from './supabase';
import { KOLService } from './kolService';
import { CampaignService } from './campaignService';
import { MessageTrainingService, MessageContext } from './messageTrainingService';
import { OpenAIService, AIContext } from './openaiService';

export interface CampaignSuggestion {
  name: string;
  description: string;
  budget: number;
  duration: string;
  targetRegions: string[];
  kolCount: number;
  budgetAllocation: { region: string; amount: number }[];
  suggestedKOLs: string[];
  reasoning: string;
}

export interface ListSuggestion {
  name: string;
  description: string;
  kolCount: number;
  criteria: {
    regions?: string[];
    platforms?: string[];
    minFollowers?: number;
    maxFollowers?: number;
    contentTypes?: string[];
    creatorTypes?: string[];
  };
  suggestedKOLs: any[];
  reasoning: string;
}

export class AIService {
  // Enhanced AI response with context awareness
  static async getAIResponse(messages: any[], context?: AIContext): Promise<string> {
    try {
      // Use OpenAI service for real AI responses
      const response = await OpenAIService.getAIResponse(messages, context);
      
      // Log usage for monitoring
      console.log('AI Usage:', {
        tokens: response.tokens,
        cost: response.cost,
        model: 'gpt-3.5-turbo'
      });
      
      return response.content;
    } catch (error) {
      console.error('Error getting AI response:', error);
      
      // Fallback to rule-based responses if OpenAI fails
      const lastMessage = messages[messages.length - 1];
      const userInput = lastMessage?.content?.toLowerCase() || '';

      // Campaign-related queries
      if (userInput.includes('campaign') || userInput.includes('create campaign')) {
        return this.handleCampaignQuery(userInput, context);
      }

      // List-related queries
      if (userInput.includes('list') || userInput.includes('create list') || userInput.includes('kol list')) {
        return this.handleListQuery(userInput, context);
      }

      // Budget-related queries
      if (userInput.includes('budget') || userInput.includes('cost') || userInput.includes('pricing')) {
        return this.handleBudgetQuery(userInput, context);
      }

      // KOL-related queries
      if (userInput.includes('kol') || userInput.includes('influencer') || userInput.includes('creator')) {
        return this.handleKOLQuery(userInput, context);
      }

      // Message-related queries
      if (userInput.includes('message') || userInput.includes('template') || userInput.includes('write') || userInput.includes('draft')) {
        return this.handleMessageQuery(userInput, context);
      }

      // Template management queries
      if (userInput.includes('template') || userInput.includes('manage templates') || userInput.includes('create template')) {
        return this.handleTemplateQuery(userInput, context);
      }

      // Greetings
      if (userInput.includes('hello') || userInput.includes('hi') || userInput.includes('hey')) {
        return this.getWelcomeMessage();
      }

      // General help
      if (userInput.includes('help') || userInput.includes('what can you do')) {
        return this.getHelpMessage();
      }

      // Default response
      return this.getDefaultResponse();
    }
  }

  private static async handleCampaignQuery(userInput: string, context?: AIContext): Promise<string> {
    if (userInput.includes('create') || userInput.includes('new')) {
      return `I can help you create a campaign! To get started, please tell me:

1. **Campaign Type**: What type of campaign are you planning? (e.g., product launch, brand awareness, community building)
2. **Budget Range**: What's your total budget?
3. **Target Regions**: Which regions are you targeting? (e.g., APAC, Global, specific countries)
4. **Timeline**: How long should the campaign run?
5. **Goals**: What are your main objectives?

Once you provide these details, I can suggest:
• Campaign structure and timeline
• Budget allocation across regions
• Recommended KOLs based on your criteria
• Content strategy and deliverables

What type of campaign are you looking to create?`;
    }

    if (userInput.includes('budget') || userInput.includes('cost')) {
      return `For campaign budgeting, I can help you with:

**Budget Allocation Guidelines:**
• **APAC Region**: Typically $5K-$50K per KOL depending on follower count
• **Global Region**: Typically $10K-$100K per KOL depending on reach
• **Content Creation**: Additional 20-30% for content production
• **Management Fee**: 10-15% for campaign management

**Sample Budgets:**
• **Small Campaign**: $10K-$25K (2-5 KOLs)
• **Medium Campaign**: $25K-$100K (5-15 KOLs)
• **Large Campaign**: $100K+ (15+ KOLs)

What's your budget range? I can suggest the optimal KOL mix and regional allocation.`;
    }

    return `I can help you with campaign planning! Here's what I can assist with:

• **Campaign Strategy**: Define objectives, target audience, and messaging
• **Budget Planning**: Optimal allocation across regions and KOLs
• **KOL Selection**: Match creators to your campaign goals
• **Timeline Planning**: Campaign scheduling and milestones
• **Content Strategy**: Recommended content types and deliverables

What specific aspect of campaign planning would you like help with?`;
  }

  private static async handleListQuery(userInput: string, context?: AIContext): Promise<string> {
    if (userInput.includes('create') || userInput.includes('new')) {
      return `I can help you create a KOL list! To get the best recommendations, please tell me:

1. **Purpose**: What's the list for? (e.g., specific campaign, ongoing partnerships, research)
2. **Target Regions**: Which regions? (e.g., APAC, Global, China, Korea, SEA)
3. **Platforms**: Which platforms? (e.g., X/Twitter, Telegram, both)
4. **Follower Range**: What follower count range? (e.g., 10K-100K, 100K-1M, 1M+)
5. **Content Types**: What content do they create? (e.g., memes, trading, education)

**Available Filters:**
• **Regions**: APAC, Global, China, Korea, Vietnam, SEA, Philippines, Brazil, Turkey
• **Platforms**: X/Twitter, Telegram
• **Creator Types**: Native, Drama-Forward, Skeptic, Educator, Bridge Builder, Visionary, Onboarder
• **Content Types**: Meme, News, Trading, Deep Dive, Technical Education

What type of KOLs are you looking for?`;
    }

    return `I can help you create and manage KOL lists! Here's what I can do:

• **Smart Filtering**: Find KOLs by region, platform, followers, content type
• **List Creation**: Create curated lists for specific campaigns or purposes
• **KOL Analysis**: Get insights on creator types and content styles
• **List Management**: Organize and update your KOL lists

What would you like to do with KOL lists?`;
  }

  private static async handleBudgetQuery(userInput: string, context?: AIContext): Promise<string> {
    return `Here's my guidance on KOL pricing and budget allocation:

**Pricing by Follower Count:**
• **10K-50K followers**: $1K-$5K per post
• **50K-200K followers**: $5K-$15K per post
• **200K-1M followers**: $15K-$50K per post
• **1M+ followers**: $50K+ per post

**Regional Pricing Differences:**
• **APAC**: Generally 20-30% lower than Global rates
• **China**: Premium pricing due to market size
• **Korea**: High engagement rates, competitive pricing
• **SEA**: Growing market, good value for money

**Budget Allocation Tips:**
• Allocate 60-70% to KOL fees
• Reserve 20-30% for content production
• Keep 10-15% for management and contingency

Would you like me to help you create a specific budget plan for your campaign?`;
  }

  private static async handleKOLQuery(userInput: string, context?: AIContext): Promise<string> {
    return `I can help you find and analyze KOLs! Here's what I can assist with:

**KOL Discovery:**
• Find KOLs by region, platform, follower count
• Filter by content type and creator style
• Identify high-engagement creators

**KOL Analysis:**
• Engagement rates and audience quality
• Content style and brand fit
• Pricing and availability

**Creator Types Available:**
• **Native**: Meme/culture creators
• **Drama-Forward**: Controversy-driven content
• **Skeptic**: Critical analysis creators
• **Educator**: Educational content creators
• **Bridge Builder**: Community-focused creators
• **Visionary**: Thought leadership creators
• **Onboarder**: New user acquisition specialists

What specific KOL criteria are you looking for?`;
  }

  private static getWelcomeMessage(): string {
    return `Hello! I'm your AI assistant for KOL Campaign Management. 🤖

I can help you with:

🎯 **Campaign Planning**
• Create campaign strategies and budgets
• Suggest optimal KOL mixes
• Plan timelines and deliverables

📋 **KOL Lists**
• Find creators by region, platform, followers
• Create curated lists for specific campaigns
• Analyze creator types and content styles

💰 **Budget Management**
• Pricing guidance and budget allocation
• Regional cost analysis
• ROI optimization

💬 **Content Strategy**
• Content type recommendations
• Messaging and tone guidance
• Platform-specific strategies

What would you like to work on today?`;
  }

  private static getHelpMessage(): string {
    return `Here's what I can help you with:

**🎯 Campaign Management**
• "Create a campaign for [product/objective]"
• "Help me plan a [budget] campaign"
• "Suggest KOLs for [region] campaign"

**📋 KOL Lists**
• "Create a list of [region] KOLs"
• "Find KOLs with [follower range] followers"
• "List creators who do [content type]"

**💰 Budget & Pricing**
• "What's the typical budget for [campaign type]?"
• "How much do KOLs cost in [region]?"
• "Help me allocate budget across regions"

**📊 Analysis & Insights**
• "Analyze my campaign performance"
• "Compare KOL engagement rates"
• "Suggest content strategy"

Just ask me anything about campaigns, KOLs, or budget planning!`;
  }

  private static getDefaultResponse(): string {
    return `I'm here to help with your KOL campaign management! 

I can assist with:
• Creating campaigns and strategies
• Finding and analyzing KOLs
• Budget planning and allocation
• Content strategy and messaging
• Performance analysis and insights
• Message templates and generation

What would you like to work on? You can ask me to create a campaign, find KOLs, help with budgeting, write messages, or anything else related to your campaigns.`;
  }

  private static async handleMessageQuery(userInput: string, context?: AIContext): Promise<string> {
    if (userInput.includes('create') || userInput.includes('write') || userInput.includes('draft')) {
      return `I can help you create messages! To generate the best message, please tell me:

1. **Message Type**: What type of message? (e.g., campaign outreach, KOL follow-up, client update)
2. **Target Audience**: Who is this for? (e.g., KOL, client, partner)
3. **Context**: Any specific details? (e.g., campaign name, region, budget, KOL name)
4. **Tone**: What tone do you want? (e.g., professional, casual, friendly, formal)

**Available Message Types:**
• **Campaign Outreach**: Initial contact with KOLs
• **KOL Follow-up**: Follow-up messages
• **Client Updates**: Progress reports to clients
• **General**: Generic templates

**Tone Options:**
• **Professional**: Business-like and formal
• **Casual**: Relaxed and informal
• **Friendly**: Warm and approachable
• **Formal**: Very structured and official

What type of message would you like me to help you create?`;
    }

    return `I can help you with message creation and templates! Here's what I can do:

• **Message Generation**: Create contextual messages based on your needs
• **Template Management**: Access and customize message templates
• **Tone Customization**: Adjust message tone for different audiences
• **Context Integration**: Include campaign details, KOL info, etc.

What would you like to do with messages?`;
  }

  private static async handleTemplateQuery(userInput: string, context?: AIContext): Promise<string> {
    if (userInput.includes('create') || userInput.includes('new')) {
      return `I can help you create message templates! Here's what you need to know:

**Template Components:**
• **Name**: Descriptive name for the template
• **Content**: Message content with placeholders like {client_name}, {kol_name}, {campaign_type}
• **Category**: campaign, outreach, follow-up, or general
• **Tone**: professional, casual, friendly, or formal
• **Target Audience**: kol, client, or partner
• **Tags**: Keywords for easy searching

**Placeholder Examples:**
• {client_name} - Client's name
• {kol_name} - KOL's name
• {campaign_type} - Type of campaign
• {target_region} - Target region
• {budget} - Budget amount
• {platform} - Platform (X, Telegram)

Would you like me to help you create a specific template?`;
    }

    if (userInput.includes('manage') || userInput.includes('view') || userInput.includes('list')) {
      return `I can help you manage your message templates! Here's what you can do:

**Template Management:**
• **View All Templates**: Browse all available templates
• **Filter & Search**: Find templates by category, tone, audience
• **Usage Analytics**: See which templates are most used
• **Edit & Customize**: Modify existing templates
• **Create New**: Add new templates to your library

**Template Categories:**
• **Campaign**: Campaign-related messages
• **Outreach**: Initial contact messages
• **Follow-up**: Follow-up and reminder messages
• **General**: Generic templates

Would you like to view your templates or create a new one?`;
    }

    return `I can help you with message template management! Here's what I can do:

• **Template Creation**: Create new message templates
• **Template Management**: View, edit, and organize templates
• **Usage Analytics**: Track template performance
• **Smart Suggestions**: Get template recommendations

What would you like to do with templates?`;
  }

  // Generate campaign suggestions based on user input
  static async generateCampaignSuggestion(userInput: string, context?: AIContext): Promise<CampaignSuggestion> {
    try {
      // Use OpenAI service for real AI suggestions
      const suggestion = await OpenAIService.generateCampaignSuggestion(userInput, context);
      return suggestion as CampaignSuggestion;
    } catch (error) {
      console.error('Error generating campaign suggestion:', error);
      
      // Fallback to rule-based generation
      const budget = this.extractBudget(userInput);
      const regions = this.extractRegions(userInput);
      const duration = this.extractDuration(userInput);

      return {
        name: "AI-Generated Campaign",
        description: "Campaign suggestion based on your requirements",
        budget: budget || 50000,
        duration: duration || "4 weeks",
        targetRegions: regions || ["APAC"],
        kolCount: Math.ceil((budget || 50000) / 10000),
        budgetAllocation: this.generateBudgetAllocation(regions || ["APAC"], budget || 50000),
        suggestedKOLs: [],
        reasoning: "Generated based on your input criteria"
      };
    }
  }

  // Generate list suggestions based on user input
  static async generateListSuggestion(userInput: string, context?: AIContext): Promise<ListSuggestion> {
    try {
      // Use OpenAI service for real AI suggestions
      const suggestion = await OpenAIService.generateListSuggestion(userInput, context);
      return suggestion as ListSuggestion;
    } catch (error) {
      console.error('Error generating list suggestion:', error);
      
      // Fallback to rule-based generation
      const regions = this.extractRegions(userInput);
      const platforms = this.extractPlatforms(userInput);
      const followerRange = this.extractFollowerRange(userInput);

      return {
        name: "AI-Generated KOL List",
        description: "KOL list based on your criteria",
        kolCount: 10,
        criteria: {
          regions: regions || ["APAC"],
          platforms: platforms || ["X", "Telegram"],
          minFollowers: followerRange?.min || 10000,
          maxFollowers: followerRange?.max || 1000000
        },
        suggestedKOLs: [],
        reasoning: "Generated based on your input criteria"
      };
    }
  }

  // Helper methods for extracting information from user input
  private static extractBudget(input: string): number | null {
    const budgetMatch = input.match(/\$?(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:k|thousand|k\b)/i);
    if (budgetMatch) {
      const amount = parseFloat(budgetMatch[1].replace(/,/g, ''));
      return input.toLowerCase().includes('k') ? amount * 1000 : amount;
    }
    return null;
  }

  private static extractRegions(input: string): string[] {
    const regions = [];
    const regionKeywords = {
      'apac': 'APAC',
      'global': 'Global',
      'china': 'China',
      'korea': 'Korea',
      'vietnam': 'Vietnam',
      'sea': 'SEA',
      'philippines': 'Philippines',
      'brazil': 'Brazil',
      'turkey': 'Turkey'
    };

    for (const [keyword, region] of Object.entries(regionKeywords)) {
      if (input.includes(keyword)) {
        regions.push(region);
      }
    }

    return regions.length > 0 ? regions : ['APAC'];
  }

  private static extractPlatforms(input: string): string[] {
    const platforms = [];
    if (input.includes('x') || input.includes('twitter')) platforms.push('X');
    if (input.includes('telegram')) platforms.push('Telegram');
    return platforms.length > 0 ? platforms : ['X', 'Telegram'];
  }

  private static extractDuration(input: string): string {
    if (input.includes('week')) {
      const weekMatch = input.match(/(\d+)\s*week/i);
      return weekMatch ? `${weekMatch[1]} weeks` : '4 weeks';
    }
    if (input.includes('month')) {
      const monthMatch = input.match(/(\d+)\s*month/i);
      return monthMatch ? `${monthMatch[1]} months` : '1 month';
    }
    return '4 weeks';
  }

  private static extractFollowerRange(input: string): { min: number; max: number } | null {
    // Extract follower ranges like "10k-100k", "1M+", etc.
    const rangeMatch = input.match(/(\d+(?:\.\d+)?)\s*(?:k|m|thousand|million)?\s*[-–—]\s*(\d+(?:\.\d+)?)\s*(?:k|m|thousand|million)?/i);
    if (rangeMatch) {
      const min = this.parseFollowerCount(rangeMatch[1], input);
      const max = this.parseFollowerCount(rangeMatch[2], input);
      return { min, max };
    }
    return null;
  }

  private static parseFollowerCount(count: string, context: string): number {
    const num = parseFloat(count);
    const isK = context.toLowerCase().includes('k') || count.includes('k');
    const isM = context.toLowerCase().includes('m') || count.includes('m');
    
    if (isM) return num * 1000000;
    if (isK) return num * 1000;
    return num;
  }

  private static generateBudgetAllocation(regions: string[], totalBudget: number): { region: string; amount: number }[] {
    const allocation = [];
    const regionCount = regions.length;
    const baseAmount = totalBudget / regionCount;

    for (const region of regions) {
      allocation.push({
        region,
        amount: Math.round(baseAmount)
      });
    }

    return allocation;
  }
} 