'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { AdvancedInsightsCard } from '@/components/ai/AdvancedInsightsCard';
import { WorkflowManager } from '@/components/ai/WorkflowManager';
import { AdvancedAIService, PredictiveInsight } from '@/lib/advancedAIService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, Users, DollarSign, Clock, Zap, BarChart3, Activity, Target } from 'lucide-react';

export default function AIInsightsPage() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [insights, setInsights] = useState<PredictiveInsight[]>([]);
  const [performanceData, setPerformanceData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('30d');

  useEffect(() => {
    if (userProfile?.id) {
      loadInsights();
      loadPerformanceData();
    }
  }, [userProfile?.id, timeRange]);

  const loadInsights = async () => {
    try {
      setLoading(true);
      const data = await AdvancedAIService.generatePredictiveInsights(userProfile!.id);
      setInsights(data);
    } catch (error) {
      console.error('Error loading insights:', error);
      toast({
        title: "Error",
        description: "Failed to load AI insights.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadPerformanceData = async () => {
    try {
      const data = await AdvancedAIService.analyzePerformance(userProfile!.id, timeRange);
      setPerformanceData(data);
    } catch (error) {
      console.error('Error loading performance data:', error);
    }
  };

  const handleApplyInsight = (insight: PredictiveInsight) => {
    toast({
      title: "Insight Applied",
      description: `Applied ${insight.type.replace('_', ' ')} insight to your campaign strategy.`,
    });
    // Here you would implement the actual application logic
    console.log('Applying insight:', insight);
  };

  const getMetricIcon = (metric: string) => {
    switch (metric) {
      case 'campaigns': return <TrendingUp className="w-4 h-4" />;
      case 'kols': return <Users className="w-4 h-4" />;
      case 'budget': return <DollarSign className="w-4 h-4" />;
      case 'engagement': return <Activity className="w-4 h-4" />;
      default: return <BarChart3 className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">AI Insights & Analytics</h2>
            <p className="text-gray-600">Advanced AI-powered insights, predictive analytics, and automated workflows to optimize your campaigns.</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="relative flex-1 max-w-sm">
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-8 w-16 mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <Skeleton className="h-48 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">AI Insights & Analytics</h2>
          <p className="text-gray-600">Advanced AI-powered insights, predictive analytics, and automated workflows to optimize your campaigns.</p>
        </div>
      </div>

      <Tabs defaultValue="insights" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="insights" className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            AI Insights
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Performance Analytics
          </TabsTrigger>
          <TabsTrigger value="workflows" className="flex items-center gap-2">
            <Target className="w-4 h-4" />
            Automated Workflows
          </TabsTrigger>
        </TabsList>

        <div className="mt-8">

        <TabsContent value="insights" className="space-y-6">
          {/* Time Range Selector */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Predictive Insights</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Time Range:</span>
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                  <SelectItem value="1y">Last year</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={loadInsights}
                className="hover:opacity-90"
              >
                <Zap className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>

          {/* AI Insights */}
          <AdvancedInsightsCard
            insights={insights}
            onApplyInsight={handleApplyInsight}
          />

          {/* Quick Actions */}
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button
                  variant="outline"
                  className="h-20 flex flex-col items-center justify-center gap-2 hover:opacity-90"
                  onClick={() => console.log('Generate campaign suggestion')}
                >
                  <TrendingUp className="w-6 h-6" />
                  <span>Generate Campaign</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-20 flex flex-col items-center justify-center gap-2 hover:opacity-90"
                  onClick={() => console.log('Optimize budget')}
                >
                  <DollarSign className="w-6 h-6" />
                  <span>Optimize Budget</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-20 flex flex-col items-center justify-center gap-2 hover:opacity-90"
                  onClick={() => console.log('Find KOLs')}
                >
                  <Users className="w-6 h-6" />
                  <span>Find KOLs</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Performance Analytics</h2>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="1y">Last year</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {performanceData && (
            <div className="space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      {getMetricIcon('campaigns')}
                      <span className="text-sm font-medium text-gray-600">Total Campaigns</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 mt-2">
                      {performanceData.campaignPerformance?.totalCampaigns || 0}
                    </p>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      {getMetricIcon('engagement')}
                      <span className="text-sm font-medium text-gray-600">Avg Engagement</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 mt-2">
                      {((performanceData.campaignPerformance?.avgEngagement || 0) * 100).toFixed(1)}%
                    </p>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      {getMetricIcon('budget')}
                      <span className="text-sm font-medium text-gray-600">Total Spent</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 mt-2">
                      ${(performanceData.budgetEfficiency?.totalSpent || 0).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2">
                      {getMetricIcon('kols')}
                      <span className="text-sm font-medium text-gray-600">ROI</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 mt-2">
                      {(performanceData.budgetEfficiency?.roi || 0).toFixed(1)}x
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Performance Details */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <CardTitle>Campaign Performance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Top Performing Region</span>
                        <span className="font-medium">{performanceData.campaignPerformance?.topPerformingRegion || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Top Platform</span>
                        <span className="font-medium">{performanceData.campaignPerformance?.topPerformingPlatform || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Cost per Engagement</span>
                        <span className="font-medium">${performanceData.budgetEfficiency?.avgCostPerEngagement || 0}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <CardTitle>Engagement Trends</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Trend</span>
                        <span className="font-medium capitalize">{performanceData.engagementTrends?.trend || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Growth Rate</span>
                        <span className="font-medium">{(performanceData.engagementTrends?.growthRate || 0) * 100}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Peak Days</span>
                        <span className="font-medium">{(performanceData.engagementTrends?.peakDays || []).join(', ')}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Recommendations */}
              {performanceData.recommendations && performanceData.recommendations.length > 0 && (
                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <CardTitle>AI Recommendations</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {performanceData.recommendations.map((rec: string, index: number) => (
                        <div key={index} className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                          <Target className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-blue-900">{rec}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="workflows" className="space-y-6">
          <WorkflowManager />
        </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
