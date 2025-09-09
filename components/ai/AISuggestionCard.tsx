'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CampaignSuggestion, ListSuggestion } from '@/lib/aiService';
import { Plus, Users, DollarSign, Calendar, MapPin } from 'lucide-react';

interface AISuggestionCardProps {
  type: 'campaign' | 'list';
  suggestion: CampaignSuggestion | ListSuggestion;
  onApply: (suggestion: CampaignSuggestion | ListSuggestion) => void;
  onDismiss: () => void;
}

export default function AISuggestionCard({ type, suggestion, onApply, onDismiss }: AISuggestionCardProps) {
  const isCampaign = type === 'campaign';
  const campaignSuggestion = suggestion as CampaignSuggestion;
  const listSuggestion = suggestion as ListSuggestion;

  return (
    <Card className="border-2 border-[#3e8692] bg-gradient-to-br from-blue-50 to-teal-50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-[#3e8692]">
            {isCampaign ? '🎯 Campaign Suggestion' : '📋 KOL List Suggestion'}
          </CardTitle>
          <Badge variant="outline" className="border-[#3e8692] text-[#3e8692]">
            AI Generated
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Name and Description */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-1">
            {isCampaign ? campaignSuggestion.name : listSuggestion.name}
          </h3>
          <p className="text-sm text-gray-600">
            {isCampaign ? campaignSuggestion.description : listSuggestion.description}
          </p>
        </div>

        {/* Campaign-specific details */}
        {isCampaign && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              <div>
                <p className="text-xs text-gray-500">Budget</p>
                <p className="font-semibold">${campaignSuggestion.budget.toLocaleString()}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-xs text-gray-500">KOLs</p>
                <p className="font-semibold">{campaignSuggestion.kolCount}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-purple-600" />
              <div>
                <p className="text-xs text-gray-500">Duration</p>
                <p className="font-semibold">{campaignSuggestion.duration}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <MapPin className="h-4 w-4 text-red-600" />
              <div>
                <p className="text-xs text-gray-500">Regions</p>
                <p className="font-semibold">{campaignSuggestion.targetRegions.join(', ')}</p>
              </div>
            </div>
          </div>
        )}

        {/* List-specific details */}
        {!isCampaign && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-xs text-gray-500">KOLs</p>
                <p className="font-semibold">{listSuggestion.kolCount}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <MapPin className="h-4 w-4 text-red-600" />
              <div>
                <p className="text-xs text-gray-500">Regions</p>
                <p className="font-semibold">{listSuggestion.criteria.regions?.join(', ')}</p>
              </div>
            </div>
          </div>
        )}

        {/* Budget Allocation for Campaigns */}
        {isCampaign && campaignSuggestion.budgetAllocation.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">Budget Allocation:</p>
            <div className="space-y-1">
              {campaignSuggestion.budgetAllocation.map((allocation, index) => (
                <div key={index} className="flex justify-between text-xs">
                  <span className="text-gray-600">{allocation.region}:</span>
                  <span className="font-medium">${allocation.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reasoning */}
        <div className="bg-white rounded-lg p-3 border">
          <p className="text-xs font-medium text-gray-700 mb-1">AI Reasoning:</p>
          <p className="text-xs text-gray-600">
            {isCampaign ? campaignSuggestion.reasoning : listSuggestion.reasoning}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-2 pt-2">
          <Button
            onClick={() => onApply(suggestion)}
            className="flex-1 hover:opacity-90"
            style={{ backgroundColor: '#3e8692', color: 'white' }}
          >
            <Plus className="h-4 w-4 mr-2" />
            {isCampaign ? 'Create Campaign' : 'Create List'}
          </Button>
          
          <Button
            variant="outline"
            onClick={onDismiss}
            className="px-4"
          >
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
} 