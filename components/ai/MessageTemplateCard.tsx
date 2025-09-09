import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageTemplate } from '@/lib/messageTrainingService';
import { Copy, Eye, MessageSquare, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface MessageTemplateCardProps {
  template: MessageTemplate;
  onUseTemplate: (template: MessageTemplate) => void;
  onPreviewTemplate: (template: MessageTemplate) => void;
}

export function MessageTemplateCard({ template, onUseTemplate, onPreviewTemplate }: MessageTemplateCardProps) {
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(template.content);
      toast({
        title: "Template copied!",
        description: "Message template has been copied to clipboard.",
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Failed to copy template to clipboard.",
        variant: "destructive",
      });
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'campaign': return 'bg-blue-100 text-blue-800';
      case 'outreach': return 'bg-green-100 text-green-800';
      case 'follow-up': return 'bg-yellow-100 text-yellow-800';
      case 'general': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getToneColor = (tone: string) => {
    switch (tone) {
      case 'professional': return 'bg-purple-100 text-purple-800';
      case 'casual': return 'bg-orange-100 text-orange-800';
      case 'friendly': return 'bg-pink-100 text-pink-800';
      case 'formal': return 'bg-indigo-100 text-indigo-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getAudienceColor = (audience: string) => {
    switch (audience) {
      case 'kol': return 'bg-teal-100 text-teal-800';
      case 'client': return 'bg-cyan-100 text-cyan-800';
      case 'partner': return 'bg-emerald-100 text-emerald-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg font-semibold text-gray-900">
              {template.name}
            </CardTitle>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge className={getCategoryColor(template.category)}>
                {template.category}
              </Badge>
              <Badge className={getToneColor(template.tone)}>
                {template.tone}
              </Badge>
              <Badge className={getAudienceColor(template.target_audience)}>
                {template.target_audience.toUpperCase()}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-1 text-sm text-gray-500">
            <TrendingUp className="w-4 h-4" />
            <span>{template.usage_count}</span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="space-y-4">
          {/* Tags */}
          {template.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {template.tags.map((tag, index) => (
                <span
                  key={index}
                  className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Message Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Preview</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-6 px-2 text-xs"
              >
                {isExpanded ? 'Show less' : 'Show more'}
              </Button>
            </div>
            
            <div className={`bg-gray-50 rounded-lg p-3 text-sm text-gray-700 ${
              isExpanded ? 'max-h-none' : 'max-h-20 overflow-hidden'
            }`}>
              {template.content}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              onClick={() => onUseTemplate(template)}
              className="flex-1 hover:opacity-90"
              style={{ backgroundColor: '#3e8692', color: 'white' }}
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Use Template
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onPreviewTemplate(template)}
            >
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopy}
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
