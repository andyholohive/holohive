import OpenAI from 'openai';

// Initialize OpenAI client with fallback
const getOpenAIClient = () => {
  const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.warn('OpenAI API key not found. AI features will use fallback responses.');
    return null;
  }
  
  return new OpenAI({ apiKey });
};

export interface AIContext {
  userRole?: string;
  availableKOLs?: any[];
  existingCampaigns?: any[];
  userPreferences?: any;
  recentActivity?: any[];
}

export interface AIResponse {
  content: string;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  cost: number;
}

export class OpenAIService {
  private static readonly MODEL = 'gpt-3.5-turbo';
  private static readonly MAX_TOKENS = 1000;
  private static readonly TEMPERATURE = 0.7;

  // Main method to get AI response
  static async getAIResponse(
    messages: any[], 
    context?: AIContext,
    systemPrompt?: string
  ): Promise<AIResponse> {
    try {
      // Use server-side API route for better security
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages,
          context,
          systemPrompt
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const result = await response.json();
      
      // Log usage for monitoring
      console.log('AI Usage:', {
        tokens: result.tokens,
        cost: result.cost,
        model: 'gpt-3.5-turbo'
      });

      return {
        content: result.content,
        tokens: result.tokens,
        cost: result.cost
      };

    } catch (error) {
      console.error('OpenAI API Error:', error);
      
      // Return fallback response
      return {
        content: this.getFallbackResponse(messages[messages.length - 1]?.content || ''),
        tokens: { input: 0, output: 0, total: 0 },
        cost: 0
      };
    }
  }

  // Generate campaign suggestions
  static async generateCampaignSuggestion(userInput: string, context?: AIContext): Promise<any> {
    const systemPrompt = `You are an expert KOL campaign strategist. Generate a detailed campaign suggestion based on the user's input.

Available regions: APAC, Global, China, Korea, Vietnam, SEA, Philippines, Brazil, Turkey
Available platforms: X (Twitter), Telegram, Instagram, TikTok

Format your response as a JSON object with the following structure:
{
  "name": "Campaign name",
  "description": "Detailed description",
  "budget": 50000,
  "duration": "4 weeks",
  "targetRegions": ["APAC"],
  "kolCount": 10,
  "budgetAllocation": [{"region": "APAC", "amount": 50000}],
  "suggestedKOLs": [],
  "reasoning": "Why this campaign would work"
}

Be realistic and practical with your suggestions.`;

    const response = await this.getAIResponse(
      [{ role: 'user', content: userInput }],
      context,
      systemPrompt
    );

    try {
      // Try to parse JSON response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Failed to parse JSON response:', error);
    }

    // Fallback to mock response
    return this.getMockCampaignSuggestion(userInput);
  }

  // Generate list suggestions
  static async generateListSuggestion(userInput: string, context?: AIContext): Promise<any> {
    const systemPrompt = `You are an expert KOL list curator. Generate a detailed KOL list suggestion based on the user's input.

Available regions: APAC, Global, China, Korea, Vietnam, SEA, Philippines, Brazil, Turkey
Available platforms: X (Twitter), Telegram, Instagram, TikTok

Format your response as a JSON object with the following structure:
{
  "name": "List name",
  "description": "Detailed description",
  "kolCount": 50,
  "criteria": {
    "regions": ["APAC"],
    "platforms": ["X", "Telegram"],
    "minFollowers": 10000,
    "maxFollowers": 1000000
  },
  "suggestedKOLs": [],
  "reasoning": "Why this list would be effective"
}

Be realistic and practical with your suggestions.`;

    const response = await this.getAIResponse(
      [{ role: 'user', content: userInput }],
      context,
      systemPrompt
    );

    try {
      // Try to parse JSON response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Failed to parse JSON response:', error);
    }

    // Fallback to mock response
    return this.getMockListSuggestion(userInput);
  }

  // Generate message templates
  static async generateMessageTemplate(context: any): Promise<string> {
    const systemPrompt = `You are an expert copywriter specializing in KOL outreach and campaign messaging.

Generate a professional message template based on the following context:
- Audience: ${context.targetAudience || 'KOL'}
- Tone: ${context.tone || 'professional'}
- Purpose: ${context.purpose || 'outreach'}
- Platform: ${context.platform || 'X'}

Include placeholders like {kol_name}, {campaign_name}, {company_name}, etc.
Make it engaging, professional, and platform-appropriate.
Keep it concise but compelling.`;

    const response = await this.getAIResponse(
      [{ role: 'user', content: 'Generate a message template' }],
      context,
      systemPrompt
    );

    return response.content;
  }

  // Generate predictive insights
  static async generatePredictiveInsights(userId: string, context?: AIContext): Promise<any[]> {
    const systemPrompt = `You are an expert data analyst specializing in KOL campaign performance and predictive analytics.

Based on the user's context and data, generate 3-4 actionable insights in JSON format:
[
  {
    "type": "campaign_performance" | "kol_recommendation" | "budget_optimization" | "timing_suggestion",
    "confidence": 0.85,
    "reasoning": "Detailed explanation",
    "actionable": true,
    "data": {}
  }
]

Focus on practical, actionable insights that can improve campaign performance.`;

    const response = await this.getAIResponse(
      [{ role: 'user', content: 'Generate predictive insights for my campaigns' }],
      context,
      systemPrompt
    );

    try {
      // Try to parse JSON response
      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Failed to parse JSON response:', error);
    }

    // Fallback to mock insights
    return this.getMockInsights();
  }

  // Build system prompt with context
  private static buildSystemPrompt(context?: AIContext): string {
    return `You are an AI assistant for a KOL Campaign Manager platform. You help users create campaigns, manage KOLs, generate message templates, and provide insights.

User Context:
- Role: ${context?.userRole || 'user'}
- Recent campaigns: ${context?.existingCampaigns?.length || 0}
- Available KOLs: ${context?.availableKOLs?.length || 0}

Available Features:
- Create campaigns with budget allocation
- Manage KOL lists and outreach
- Generate message templates
- Provide performance insights
- Budget optimization
- Campaign timing recommendations

Available Regions: APAC, Global, China, Korea, Vietnam, SEA, Philippines, Brazil, Turkey
Available Platforms: X (Twitter), Telegram, Instagram, TikTok

Respond naturally and helpfully. Be concise but informative. If you need to generate structured data, format it as JSON.`;
  }

  // Fallback responses when API fails
  private static getFallbackResponse(userInput: string): string {
    const lowerInput = userInput.toLowerCase();
    
    if (lowerInput.includes('campaign')) {
      return "I can help you create campaigns! Please tell me about your budget, target regions, and goals.";
    }
    
    if (lowerInput.includes('template') || lowerInput.includes('message')) {
      return "I can help you create message templates. What type of message do you need?";
    }
    
    if (lowerInput.includes('kol') || lowerInput.includes('list')) {
      return "I can help you find and manage KOLs. What criteria are you looking for?";
    }
    
    if (lowerInput.includes('insight') || lowerInput.includes('analyze')) {
      return "I can provide insights about your campaigns. What specific data would you like me to analyze?";
    }
    
    return "Hello! I'm your AI assistant for KOL campaign management. How can I help you today?";
  }

  // Mock responses for fallback
  private static getMockCampaignSuggestion(userInput: string): any {
    return {
      name: "APAC Brand Awareness Campaign",
      description: "A comprehensive campaign targeting APAC markets",
      budget: 50000,
      duration: "4 weeks",
      targetRegions: ["APAC"],
      kolCount: 10,
      budgetAllocation: [{ region: "APAC", amount: 50000 }],
      suggestedKOLs: [],
      reasoning: "Based on your requirements for APAC targeting"
    };
  }

  private static getMockListSuggestion(userInput: string): any {
    return {
      name: "APAC KOL List",
      description: "Curated list of APAC KOLs",
      kolCount: 50,
      criteria: {
        regions: ["APAC"],
        platforms: ["X", "Telegram"],
        minFollowers: 10000,
        maxFollowers: 1000000
      },
      suggestedKOLs: [],
      reasoning: "Targeted APAC KOLs for maximum reach"
    };
  }

  private static getMockInsights(): any[] {
    return [
      {
        type: "campaign_performance",
        confidence: 0.85,
        reasoning: "Your recent campaigns show strong engagement in APAC markets",
        actionable: true,
        data: {}
      },
      {
        type: "kol_recommendation",
        confidence: 0.78,
        reasoning: "Consider expanding to Vietnam and Philippines for better reach",
        actionable: true,
        data: {}
      }
    ];
  }
}
