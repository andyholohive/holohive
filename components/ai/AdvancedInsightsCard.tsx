import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { PredictiveInsight } from '@/lib/advancedAIService';
import { TrendingUp, TrendingDown, Target, Clock, DollarSign, Users, Zap, Lightbulb } from 'lucide-react';

interface AdvancedInsightsCardProps {
  insights: PredictiveInsight[];
  onApplyInsight?: (insight: PredictiveInsight) => void;
  onDismiss?: () => void;
}

export function AdvancedInsightsCard({ insights, onApplyInsight, onDismiss }: AdvancedInsightsCardProps) {
  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'campaign_performance':
        return <TrendingUp className="w-4 h-4" />;
      case 'kol_recommendation':
        return <Users className="w-4 h-4" />;
      case 'budget_optimization':
        return <DollarSign className="w-4 h-4" />;
      case 'timing_suggestion':
        return <Clock className="w-4 h-4" />;
      default:
        return <Lightbulb className="w-4 h-4" />;
    }
  };

  const getInsightColor = (type: string) => {
    switch (type) {
      case 'campaign_performance':
        return 'bg-blue-100 text-blue-800';
      case 'kol_recommendation':
        return 'bg-green-100 text-green-800';
      case 'budget_optimization':
        return 'bg-purple-100 text-purple-800';
      case 'timing_suggestion':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const formatConfidence = (confidence: number) => {
    return `${(confidence * 100).toFixed(0)}%`;
  };

  if (insights.length === 0) {
    return null;
  }

  return (
    <Card className="border border-gray-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5" style={{ color: '#3e8692' }} />
            <CardTitle className="text-lg font-semibold text-gray-900">
              AI Insights & Predictions
            </CardTitle>
          </div>
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="h-6 w-6 p-0 text-gray-600 hover:text-gray-800"
            >
              ×
            </Button>
          )}
        </div>
        <p className="text-sm text-gray-600">
          Based on your data and patterns, here are some intelligent recommendations:
        </p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {insights.map((insight, index) => (
          <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${getInsightColor(insight.type)}`}>
                  {getInsightIcon(insight.type)}
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 capitalize">
                    {insight.type.replace('_', ' ')}
                  </h4>
                  <p className="text-sm text-gray-600">
                    Confidence: <span className={getConfidenceColor(insight.confidence)}>
                      {formatConfidence(insight.confidence)}
                    </span>
                  </p>
                </div>
              </div>
              <Badge variant={insight.actionable ? "default" : "secondary"}>
                {insight.actionable ? "Actionable" : "Informational"}
              </Badge>
            </div>
            
            <div className="space-y-3">
              <p className="text-sm text-gray-700 leading-relaxed">
                {insight.reasoning}
              </p>
              
              {insight.data && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <h5 className="text-sm font-medium text-gray-900 mb-2">Key Data:</h5>
                  <div className="space-y-2">
                    {Object.entries(insight.data).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-sm">
                        <span className="text-gray-600 capitalize">
                          {key.replace(/([A-Z])/g, ' $1').trim()}:
                        </span>
                        <span className="font-medium text-gray-900">
                          {typeof value === 'number' 
                            ? value.toLocaleString()
                            : Array.isArray(value)
                            ? value.join(', ')
                            : String(value)
                          }
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {insight.actionable && onApplyInsight && (
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={() => onApplyInsight(insight)}
                    className="flex items-center gap-2 hover:opacity-90"
                    style={{ backgroundColor: '#3e8692', color: 'white' }}
                  >
                    <Target className="w-3 h-3" />
                    Apply Insight
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => console.log('Learn more about:', insight.type)}
                  >
                    Learn More
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
        
        <div className="bg-gray-100 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="w-4 h-4" style={{ color: '#3e8692' }} />
            <span className="text-sm font-medium text-gray-900">Pro Tip</span>
          </div>
          <p className="text-sm text-gray-700">
            These insights are generated using advanced AI algorithms analyzing your campaign patterns, 
            KOL performance, and market trends. Apply them to optimize your campaigns and improve ROI.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
