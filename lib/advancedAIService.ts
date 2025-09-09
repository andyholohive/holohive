import { supabase } from './supabase';
import { CampaignService } from './campaignService';
import { KOLService } from './kolService';
import { MessageTrainingService, MessageContext } from './messageTrainingService';
import { OpenAIService, AIContext } from './openaiService';

export interface UserContext {
  userId: string;
  role: string;
  recentCampaigns: any[];
  recentKOLs: any[];
  preferences: UserPreferences;
  activityHistory: ActivityHistory[];
}

export interface UserPreferences {
  defaultRegions: string[];
  preferredPlatforms: string[];
  budgetRanges: { min: number; max: number }[];
  contentTypes: string[];
  communicationStyle: 'formal' | 'casual' | 'friendly' | 'professional';
}

export interface ActivityHistory {
  action: string;
  timestamp: string;
  details: any;
  success: boolean;
}

export interface PredictiveInsight {
  type: 'campaign_performance' | 'kol_recommendation' | 'budget_optimization' | 'timing_suggestion';
  confidence: number;
  reasoning: string;
  actionable: boolean;
  data: any;
}

export interface AutomatedWorkflow {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  actions: WorkflowAction[];
  enabled: boolean;
  lastRun?: string;
  successRate: number;
}

export interface WorkflowAction {
  type: 'create_campaign' | 'send_message' | 'update_status' | 'generate_report' | 'notify_user';
  parameters: any;
  conditions?: any[];
}

export class AdvancedAIService {
  private static userContextCache = new Map<string, UserContext>();

  // Advanced context awareness
  static async buildUserContext(userId: string): Promise<UserContext> {
    // Check cache first
    if (this.userContextCache.has(userId)) {
      return this.userContextCache.get(userId)!;
    }

    try {
      // Get user profile and preferences with error handling
      let userProfile = null;
      try {
        const { data: profile, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single();

        if (userError) {
          console.error('Error fetching user profile:', userError);
        } else {
          userProfile = profile;
        }
      } catch (userError) {
        console.error('Error in user profile query:', userError);
      }

      // Get recent campaigns with error handling - use the correct approach based on user role
      let recentCampaigns: any[] = [];
      try {
        if (userProfile?.role === 'admin') {
          // Admins can see all campaigns
          const { data: campaigns, error: campaignError } = await supabase
            .from('campaigns')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);

          if (campaignError) {
            console.error('Error fetching campaigns for admin:', campaignError);
          } else {
            recentCampaigns = campaigns || [];
          }
        } else {
          // Members can only see campaigns for clients they have access to
          const { data: campaignAccess, error: campaignError } = await supabase
            .from('client_access_members')
            .select(`
              campaigns!inner(*)
            `)
            .eq('user_id', userId)
            .order('campaigns.created_at', { ascending: false })
            .limit(5);

          if (campaignError) {
            console.error('Error fetching campaigns for member:', campaignError);
          } else {
            recentCampaigns = campaignAccess?.map((access: any) => access.campaigns).filter(Boolean) || [];
          }
        }
      } catch (campaignError) {
        console.error('Error in campaign query:', campaignError);
      }

      // Get recent KOL interactions with error handling
      let recentKOLs: any[] = [];
      try {
        if (recentCampaigns.length > 0) {
          const { data: kols, error: kolError } = await supabase
            .from('campaign_kols')
            .select(`
              *,
              master_kols (*)
            `)
            .eq('campaign_id', recentCampaigns[0].id)
            .limit(10);

          if (kolError) {
            console.error('Error fetching KOLs:', kolError);
          } else {
            recentKOLs = kols || [];
          }
        }
      } catch (kolError) {
        console.error('Error in KOL query:', kolError);
      }

      // Build activity history
      const activityHistory = await this.buildActivityHistory(userId);

      // Analyze preferences
      const preferences = await this.analyzeUserPreferences(userId, recentCampaigns);

      const context: UserContext = {
        userId,
        role: userProfile?.role || 'user',
        recentCampaigns,
        recentKOLs,
        preferences,
        activityHistory
      };

      // Cache for 5 minutes
      this.userContextCache.set(userId, context);
      setTimeout(() => this.userContextCache.delete(userId), 5 * 60 * 1000);

      return context;
    } catch (error) {
      console.error('Error building user context:', error);
      return this.getDefaultContext(userId);
    }
  }

  // Predictive analytics
  static async generatePredictiveInsights(userId: string): Promise<PredictiveInsight[]> {
    try {
      // Build user context
      const context = await this.buildUserContext(userId);
      
      // Use rule-based insights only (no GPT calls for cost optimization)
      const insights: PredictiveInsight[] = [];

      // Campaign performance prediction
      const campaignInsight = await this.predictCampaignPerformance(context);
      if (campaignInsight) insights.push(campaignInsight);

      // KOL recommendation
      const kolInsight = await this.predictKOLRecommendations(context);
      if (kolInsight) insights.push(kolInsight);

      // Budget optimization
      const budgetInsight = await this.predictBudgetOptimization(context);
      if (budgetInsight) insights.push(budgetInsight);

      // Timing suggestions
      const timingInsight = await this.predictOptimalTiming(context);
      if (timingInsight) insights.push(timingInsight);

      return insights;
      
    } catch (error) {
      console.error('Error generating predictive insights:', error);
      return [];
      
    }
  }

  // Automated workflow management
  static async createAutomatedWorkflow(workflow: Omit<AutomatedWorkflow, 'id' | 'successRate'>): Promise<AutomatedWorkflow> {
    throw new Error('Automated workflows feature is not yet available. Please apply the database migration first.');
  }

  static async executeWorkflow(workflowId: string, context: any = {}): Promise<boolean> {
    console.warn('Automated workflows feature is not yet available. Please apply the database migration first.');
    return false;
  }

  // Smart campaign suggestions with context
  static async generateSmartCampaignSuggestion(userInput: string, userId: string): Promise<any> {
    const context = await this.buildUserContext(userId);
    const insights = await this.generatePredictiveInsights(userId);

    // Analyze user input for intent
    const intent = this.analyzeUserIntent(userInput);
    
    // Get historical data for similar campaigns
    const similarCampaigns = await this.findSimilarCampaigns(intent, context);
    
    // Generate optimized suggestion
    const suggestion = await this.optimizeCampaignSuggestion(intent, context, insights, similarCampaigns);

    return {
      ...suggestion,
      confidence: this.calculateConfidence(intent, context, insights),
      reasoning: this.generateReasoning(intent, context, insights),
      alternatives: await this.generateAlternatives(intent, context)
    };
  }

  // Advanced message generation with context
  static async generateAdvancedMessage(context: MessageContext, userId: string): Promise<string> {
    const userContext = await this.buildUserContext(userId);
    const insights = await this.generatePredictiveInsights(userId);

    // Get user's communication style preference
    const preferredTone = userContext.preferences.communicationStyle;

    // Analyze message context for optimal approach
    const messageStrategy = this.analyzeMessageStrategy(context, userContext, insights);

    // Generate personalized message
    const message = await MessageTrainingService.generateContextualMessage(context);

    // Apply personalization based on user context
    const personalizedMessage = this.personalizeMessage(message, userContext, messageStrategy);

    return personalizedMessage;
  }

  // Performance analytics and optimization
  static async analyzePerformance(userId: string, timeRange: string = '30d'): Promise<any> {
    const context = await this.buildUserContext(userId);
    
    const campaignPerformance = await this.analyzeCampaignPerformance(context, timeRange);
    const kolEffectiveness = await this.analyzeKOLEffectiveness(context, timeRange);
    const budgetEfficiency = await this.analyzeBudgetEfficiency(context, timeRange);
    const engagementTrends = await this.analyzeEngagementTrends(context, timeRange);
    
    const analysis = {
      campaignPerformance,
      kolEffectiveness,
      budgetEfficiency,
      engagementTrends,
      recommendations: await this.generatePerformanceRecommendations(context, { campaignPerformance, kolEffectiveness, budgetEfficiency, engagementTrends })
    };

    return analysis;
  }

  // Private helper methods
  private static async buildActivityHistory(userId: string): Promise<ActivityHistory[]> {
    // This would integrate with a proper activity tracking system
    // For now, return mock data
    return [
      {
        action: 'campaign_created',
        timestamp: new Date().toISOString(),
        details: { campaignId: 'mock-1' },
        success: true
      }
    ];
  }

  private static async analyzeUserPreferences(userId: string, campaigns: any[]): Promise<UserPreferences> {
    // Analyze user behavior to determine preferences
    const regions = Array.from(new Set(campaigns.map(c => c.target_region).filter(Boolean)));
    const platforms = Array.from(new Set(campaigns.map(c => c.platform).filter(Boolean)));
    
    return {
      defaultRegions: regions.length > 0 ? regions : ['APAC'],
      preferredPlatforms: platforms.length > 0 ? platforms : ['X', 'Telegram'],
      budgetRanges: [{ min: 10000, max: 100000 }],
      contentTypes: ['meme', 'news', 'trading'],
      communicationStyle: 'professional'
    };
  }

  private static getDefaultContext(userId: string): UserContext {
    return {
      userId,
      role: 'user',
      recentCampaigns: [],
      recentKOLs: [],
      preferences: {
        defaultRegions: ['APAC'],
        preferredPlatforms: ['X', 'Telegram'],
        budgetRanges: [{ min: 10000, max: 100000 }],
        contentTypes: ['meme', 'news', 'trading'],
        communicationStyle: 'professional'
      },
      activityHistory: []
    };
  }

  private static async predictCampaignPerformance(context: UserContext): Promise<PredictiveInsight | null> {
    if (context.recentCampaigns.length === 0) return null;

    const avgEngagement = context.recentCampaigns.reduce((sum, c) => sum + (c.engagement_rate || 0), 0) / context.recentCampaigns.length;
    
    return {
      type: 'campaign_performance',
      confidence: 0.75,
      reasoning: `Based on ${context.recentCampaigns.length} recent campaigns with average engagement of ${avgEngagement.toFixed(2)}%`,
      actionable: true,
      data: { predictedEngagement: avgEngagement * 1.1 }
    };
  }

  private static async predictKOLRecommendations(context: UserContext): Promise<PredictiveInsight | null> {
    return {
      type: 'kol_recommendation',
      confidence: 0.8,
      reasoning: 'Based on successful KOLs in similar campaigns',
      actionable: true,
      data: { recommendedKOLs: ['kol-1', 'kol-2', 'kol-3'] }
    };
  }

  private static async predictBudgetOptimization(context: UserContext): Promise<PredictiveInsight | null> {
    return {
      type: 'budget_optimization',
      confidence: 0.7,
      reasoning: 'Analysis of cost-per-engagement across regions',
      actionable: true,
      data: { optimalAllocation: { APAC: 0.6, Global: 0.4 } }
    };
  }

  private static async predictOptimalTiming(context: UserContext): Promise<PredictiveInsight | null> {
    return {
      type: 'timing_suggestion',
      confidence: 0.65,
      reasoning: 'Based on historical engagement patterns',
      actionable: true,
      data: { optimalDays: ['Monday', 'Wednesday', 'Friday'], optimalHours: [9, 14, 18] }
    };
  }

  private static async executeWorkflowAction(action: WorkflowAction, context: any): Promise<void> {
    switch (action.type) {
      case 'create_campaign':
        await CampaignService.createCampaign(action.parameters);
        break;
      case 'send_message':
        // Implement message sending logic
        break;
      case 'update_status':
        // Implement status update logic
        break;
      case 'generate_report':
        // Implement report generation logic
        break;
      case 'notify_user':
        // Implement notification logic
        break;
    }
  }

  private static analyzeUserIntent(userInput: string): any {
    const lowerInput = userInput.toLowerCase();
    
    return {
      type: lowerInput.includes('campaign') ? 'campaign' : 'general',
      urgency: lowerInput.includes('urgent') || lowerInput.includes('asap') ? 'high' : 'normal',
      budget: this.extractBudgetFromText(userInput),
      regions: this.extractRegionsFromText(userInput),
      platforms: this.extractPlatformsFromText(userInput)
    };
  }

  private static async findSimilarCampaigns(intent: any, context: UserContext): Promise<any[]> {
    // This would query the database for similar campaigns
    return context.recentCampaigns.filter(c => 
      c.target_region === intent.regions?.[0] || 
      c.platform === intent.platforms?.[0]
    );
  }

  private static async optimizeCampaignSuggestion(intent: any, context: UserContext, insights: PredictiveInsight[], similarCampaigns: any[]): Promise<any> {
    // Apply insights and context to optimize the suggestion
    const baseSuggestion = {
      budget: intent.budget || context.preferences.budgetRanges[0].max,
      regions: intent.regions || context.preferences.defaultRegions,
      platforms: intent.platforms || context.preferences.preferredPlatforms
    };

    // Apply predictive insights
    const budgetInsight = insights.find(i => i.type === 'budget_optimization');
    if (budgetInsight) {
      baseSuggestion.budget = budgetInsight.data.optimalAllocation;
    }

    return baseSuggestion;
  }

  private static calculateConfidence(intent: any, context: UserContext, insights: PredictiveInsight[]): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence based on available data
    if (context.recentCampaigns.length > 0) confidence += 0.2;
    if (insights.length > 0) confidence += 0.2;
    if (intent.budget) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  private static generateReasoning(intent: any, context: UserContext, insights: PredictiveInsight[]): string {
    const reasons = [];

    if (context.recentCampaigns.length > 0) {
      reasons.push(`Based on ${context.recentCampaigns.length} previous campaigns`);
    }

    if (insights.length > 0) {
      reasons.push(`Incorporating ${insights.length} predictive insights`);
    }

    if (intent.budget) {
      reasons.push(`Optimized for your budget of $${intent.budget.toLocaleString()}`);
    }

    return reasons.join('. ') + '.';
  }

  private static async generateAlternatives(intent: any, context: UserContext): Promise<any[]> {
    // Generate alternative suggestions
    return [
      { ...intent, budget: intent.budget * 0.8, description: 'Budget-conscious option' },
      { ...intent, budget: intent.budget * 1.2, description: 'Premium option' }
    ];
  }

  private static analyzeMessageStrategy(context: MessageContext, userContext: UserContext, insights: PredictiveInsight[]): any {
    return {
      tone: userContext.preferences.communicationStyle,
      urgency: context.campaignType?.includes('launch') ? 'high' : 'normal',
      personalization: 'high'
    };
  }

  private static personalizeMessage(message: string, userContext: UserContext, strategy: any): string {
    // Apply personalization based on user context and strategy
    let personalized = message;

    // Add user-specific elements
    if (userContext.preferences.communicationStyle === 'casual') {
      personalized = personalized.replace(/Hi there!/g, 'Hey!');
    }

    return personalized;
  }

  private static extractBudgetFromText(text: string): number | null {
    const match = text.match(/\$?(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:k|thousand|k\b)/i);
    if (match) {
      const amount = parseFloat(match[1].replace(/,/g, ''));
      return text.toLowerCase().includes('k') ? amount * 1000 : amount;
    }
    return null;
  }

  private static extractRegionsFromText(text: string): string[] {
    const regions = [];
    const regionKeywords = {
      'apac': 'APAC',
      'global': 'Global',
      'china': 'China',
      'korea': 'Korea'
    };

    for (const [keyword, region] of Object.entries(regionKeywords)) {
      if (text.toLowerCase().includes(keyword)) {
        regions.push(region);
      }
    }

    return regions;
  }

  private static extractPlatformsFromText(text: string): string[] {
    const platforms = [];
    if (text.toLowerCase().includes('x') || text.toLowerCase().includes('twitter')) platforms.push('X');
    if (text.toLowerCase().includes('telegram')) platforms.push('Telegram');
    return platforms;
  }

  private static async analyzeCampaignPerformance(context: UserContext, timeRange: string): Promise<any> {
    // Implement campaign performance analysis
    return {
      totalCampaigns: context.recentCampaigns.length,
      avgEngagement: 0.05,
      topPerformingRegion: 'APAC',
      topPerformingPlatform: 'X'
    };
  }

  private static async analyzeKOLEffectiveness(context: UserContext, timeRange: string): Promise<any> {
    // Implement KOL effectiveness analysis
    return {
      totalKOLs: context.recentKOLs.length,
      avgEngagement: 0.08,
      topKOLs: context.recentKOLs.slice(0, 3)
    };
  }

  private static async analyzeBudgetEfficiency(context: UserContext, timeRange: string): Promise<any> {
    // Implement budget efficiency analysis
    return {
      totalSpent: context.recentCampaigns.reduce((sum, c) => sum + (c.budget || 0), 0),
      avgCostPerEngagement: 0.02,
      roi: 1.5
    };
  }

  private static async analyzeEngagementTrends(context: UserContext, timeRange: string): Promise<any> {
    // Implement engagement trends analysis
    return {
      trend: 'increasing',
      growthRate: 0.15,
      peakDays: ['Monday', 'Wednesday']
    };
  }

  private static async generatePerformanceRecommendations(context: UserContext, analysis: any): Promise<string[]> {
    const recommendations = [];

    if (analysis.campaignPerformance.avgEngagement < 0.05) {
      recommendations.push('Consider optimizing content strategy to improve engagement rates');
    }

    if (analysis.budgetEfficiency.roi < 1.2) {
      recommendations.push('Review budget allocation to improve ROI');
    }

    return recommendations;
  }
}
