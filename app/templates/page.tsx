'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Copy, TrendingUp, Calendar, Info, Star, Sparkles, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface MessageTemplate {
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
}

interface MessageExample {
  id: string;
  user_id: string;
  client_id?: string;
  campaign_id?: string;
  message_type: string;
  content: string;
  was_ai_generated: boolean;
  user_rating?: number;
  was_edited: boolean;
  edit_count: number;
  was_sent: boolean;
  created_at: string;
  client_name?: string;
  campaign_name?: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [learningExamples, setLearningExamples] = useState<MessageExample[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingExamples, setLoadingExamples] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  const [selectedExample, setSelectedExample] = useState<MessageExample | null>(null);
  const [activeTab, setActiveTab] = useState<'templates' | 'examples'>('templates');
  const { toast } = useToast();

  useEffect(() => {
    fetchTemplates();
    fetchLearningExamples();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/templates');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast({
        title: 'Error',
        description: 'Failed to load templates',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchLearningExamples = async () => {
    setLoadingExamples(true);
    try {
      const response = await fetch('/api/templates/examples');
      if (response.ok) {
        const data = await response.json();
        setLearningExamples(data);
      }
    } catch (error) {
      console.error('Error fetching learning examples:', error);
      toast({
        title: 'Error',
        description: 'Failed to load learning examples',
        variant: 'destructive',
      });
    } finally {
      setLoadingExamples(false);
    }
  };

  const handleCopyTemplate = (template: MessageTemplate) => {
    navigator.clipboard.writeText(template.content);
    toast({
      title: 'Copied!',
      description: `${template.name} copied to clipboard`,
    });
  };

  const getMessageTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      initial_outreach: 'bg-blue-100 text-blue-800',
      nda_request: 'bg-purple-100 text-purple-800',
      kol_list_access: 'bg-green-100 text-green-800',
      kol_list_delivery: 'bg-teal-100 text-teal-800',
      final_kol_picks: 'bg-orange-100 text-orange-800',
      post_call_followup: 'bg-yellow-100 text-yellow-800',
      contract_activation: 'bg-pink-100 text-pink-800',
      activation_inputs: 'bg-cyan-100 text-cyan-800',
      budget_plan: 'bg-emerald-100 text-emerald-800',
      outreach_update: 'bg-lime-100 text-lime-800',
      finalizing_kols: 'bg-amber-100 text-amber-800',
      creator_brief: 'bg-fuchsia-100 text-fuchsia-800',
      final_checklist: 'bg-rose-100 text-rose-800',
      activation_day: 'bg-red-100 text-red-800',
      mid_campaign_update: 'bg-violet-100 text-violet-800',
      initial_results: 'bg-sky-100 text-sky-800',
      final_report: 'bg-indigo-100 text-indigo-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatMessageType = (type: string) => {
    const acronyms = ['nda', 'kol'];
    return type.replace(/_/g, ' ').split(' ').map(word => {
      if (acronyms.includes(word.toLowerCase())) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
  };

  if (loading || loadingExamples) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 bg-gray-200 rounded w-64 mb-2 animate-pulse"></div>
            <div className="h-4 bg-gray-100 rounded w-80 animate-pulse"></div>
          </div>
          <div className="flex gap-2">
            <div className="h-7 bg-gray-200 rounded w-24 animate-pulse"></div>
            <div className="h-7 bg-gray-200 rounded w-24 animate-pulse"></div>
          </div>
        </div>

        {/* Tabs Skeleton */}
        <div className="flex gap-2 border-b">
          <div className="h-10 bg-gray-200 rounded-t w-32 animate-pulse"></div>
          <div className="h-10 bg-gray-100 rounded-t w-40 animate-pulse"></div>
        </div>

        {/* Info Card Skeleton */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="h-5 w-5 bg-blue-200 rounded animate-pulse"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-blue-200 rounded w-48 animate-pulse"></div>
                <div className="h-3 bg-blue-100 rounded w-full animate-pulse"></div>
                <div className="h-3 bg-blue-100 rounded w-3/4 animate-pulse"></div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cards Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="h-5 bg-gray-200 rounded w-3/4 mb-3 animate-pulse"></div>
                    <div className="h-6 bg-gray-200 rounded w-32 animate-pulse"></div>
                  </div>
                  <div className="h-5 w-5 bg-gray-200 rounded animate-pulse"></div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col flex-grow">
                <div className="flex-grow space-y-4">
                  {/* Content Preview Skeleton */}
                  <div className="bg-gray-50 p-3 rounded border border-gray-200 space-y-2">
                    <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-3 bg-gray-200 rounded w-5/6 animate-pulse"></div>
                    <div className="h-3 bg-gray-200 rounded w-4/6 animate-pulse"></div>
                  </div>

                  {/* Variables Skeleton */}
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-20 animate-pulse"></div>
                    <div className="flex gap-1">
                      <div className="h-5 bg-gray-200 rounded w-16 animate-pulse"></div>
                      <div className="h-5 bg-gray-200 rounded w-20 animate-pulse"></div>
                    </div>
                  </div>

                  {/* Stats Skeleton */}
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    <div className="space-y-1">
                      <div className="h-3 bg-gray-200 rounded w-12 animate-pulse"></div>
                      <div className="h-4 bg-gray-200 rounded w-8 animate-pulse"></div>
                    </div>
                    <div className="space-y-1">
                      <div className="h-3 bg-gray-200 rounded w-16 animate-pulse"></div>
                      <div className="h-3 bg-gray-200 rounded w-12 animate-pulse"></div>
                    </div>
                  </div>
                </div>

                {/* Buttons Skeleton */}
                <div className="grid grid-cols-2 gap-2 pt-4 mt-auto">
                  <div className="h-9 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-9 bg-gray-200 rounded animate-pulse"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Client Message Templates</h1>
          <p className="text-gray-600 mt-1">
            Pre-built templates and AI learning examples
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary" className="text-sm px-3 py-1">
            {templates.length} Templates
          </Badge>
          <Badge variant="outline" className="text-sm px-3 py-1">
            {learningExamples.length} Examples
          </Badge>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'templates' | 'examples')}>
        <TabsList>
          <TabsTrigger value="templates">
            <MessageSquare className="h-4 w-4 mr-2" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="examples">
            <Sparkles className="h-4 w-4 mr-2" />
            Learning Examples
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-6">
          {/* Info Card */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="space-y-2">
                  <p className="text-sm text-blue-900 font-medium">
                    How to use templates with AI
                  </p>
                  <p className="text-sm text-blue-800">
                    Use the AI chat to generate messages: <code className="bg-blue-100 px-2 py-0.5 rounded">Generate an initial outreach for Jdot</code>
                    <br />
                    The AI will use these templates and learn from messages you mark as "Sent".
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.map((template) => {
          // Apply Telegram formatting for preview
          const formatForTelegram = (content: string) => {
            let formatted = content;
            // Make section headers bold
            formatted = formatted.replace(/^([A-Z][A-Za-z\s&]+):$/gm, '**$1:**');
            formatted = formatted.replace(/\n([A-Z][A-Za-z\s&]+):\n/g, '\n**$1:**\n');
            // Replace bullet points with emoji
            formatted = formatted.replace(/^[•-]/gm, '▪️');
            // Make greetings bold
            formatted = formatted.replace(/^(GM|Hey team|Hi)/gm, '**$1**');
            return formatted;
          };

          const formattedContent = formatForTelegram(template.content);

          return (
            <Card key={template.id} className="transition-shadow flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg font-semibold text-gray-900 mb-2">
                      {template.name}
                    </CardTitle>
                    <Badge className={`${getMessageTypeColor(template.message_type)} pointer-events-none`}>
                      {formatMessageType(template.message_type)}
                    </Badge>
                  </div>
                  <MessageSquare className="h-5 w-5 text-gray-400" />
                </div>
              </CardHeader>
              <CardContent className="flex flex-col flex-grow">
                <div className="flex-grow space-y-4">
                  {/* Content Preview with Telegram formatting */}
                  <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded border border-gray-200">
                    <div className="line-clamp-4 whitespace-pre-wrap" style={{ wordBreak: 'break-word' }}>
                      {formattedContent.split('\n').slice(0, 6).map((line, idx) => {
                        // Check if line should be bold
                        const isBold = line.match(/^\*\*(.+)\*\*$/);
                        if (isBold) {
                          return (
                            <div key={idx} className="font-semibold">
                              {isBold[1]}
                            </div>
                          );
                        }
                        return <div key={idx}>{line || '\u00A0'}</div>;
                      }).slice(0, 4)}
                      {formattedContent.split('\n').length > 4 && (
                        <div className="text-gray-400 italic">...</div>
                      )}
                    </div>
                  </div>

                  {/* Variables */}
                  {template.variables && template.variables.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-700 mb-2">Variables:</p>
                      <div className="flex flex-wrap gap-1">
                        {template.variables.map((variable) => (
                          <Badge key={variable} variant="outline" className="text-xs">
                            {variable}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    <div className="flex items-center gap-2 text-sm">
                      <TrendingUp className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">Used</p>
                        <p className="font-semibold text-gray-900">{template.usage_count}x</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-xs text-gray-500">Last Used</p>
                        <p className="font-semibold text-gray-900 text-xs">
                          {formatDate(template.last_used_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions - Always at bottom */}
                <div className="grid grid-cols-2 gap-2 pt-4 mt-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedTemplate(template)}
                    className="w-full"
                  >
                    View Full
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleCopyTemplate(template)}
                    className="w-full"
                    style={{ backgroundColor: '#3e8692' }}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
        </TabsContent>

        <TabsContent value="examples" className="space-y-6">
          {/* Info Card */}
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
                <div className="space-y-2">
                  <p className="text-sm text-purple-900 font-medium">
                    AI Learning Examples
                  </p>
                  <p className="text-sm text-purple-800">
                    These are messages you've marked as "Sent" that help the AI learn your communication style and preferences.
                    The AI uses these examples to generate better, more personalized messages.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Learning Examples Grid */}
          {loadingExamples ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="h-3 bg-gray-200 rounded"></div>
                      <div className="h-3 bg-gray-200 rounded"></div>
                      <div className="h-3 bg-gray-200 rounded w-5/6"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : learningExamples.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center py-12">
                <Sparkles className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No learning examples yet.</p>
                <p className="text-sm text-gray-500 mt-2">
                  Mark generated messages as "Sent" to create learning examples for the AI.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {learningExamples.map((example) => (
                <Card key={example.id} className="transition-shadow flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg font-semibold text-gray-900 mb-2">
                          {example.client_name || 'Unknown Client'}
                        </CardTitle>
                        <div className="flex flex-wrap gap-2">
                          <Badge className={`${getMessageTypeColor(example.message_type)} pointer-events-none`}>
                            {formatMessageType(example.message_type)}
                          </Badge>
                          {example.was_ai_generated ? (
                            <Badge variant="secondary" className="bg-purple-100 text-purple-800 pointer-events-none">
                              <Sparkles className="h-3 w-3 mr-1" />
                              AI Generated
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-blue-100 text-blue-800 pointer-events-none">
                              <User className="h-3 w-3 mr-1" />
                              User Provided
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col flex-grow">
                    <div className="flex-grow space-y-4">
                      {/* Content Preview */}
                      <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded border border-gray-200">
                        <div className="line-clamp-4 whitespace-pre-wrap" style={{ wordBreak: 'break-word' }}>
                          {example.content.split('\n').slice(0, 4).map((line, idx) => (
                            <div key={idx}>{line || '\u00A0'}</div>
                          ))}
                          {example.content.split('\n').length > 4 && (
                            <div className="text-gray-400 italic">...</div>
                          )}
                        </div>
                      </div>

                      {/* Campaign Info */}
                      {example.campaign_name && (
                        <div className="text-xs text-gray-500">
                          Campaign: <span className="font-semibold">{example.campaign_name}</span>
                        </div>
                      )}

                      {/* Stats */}
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                        <div className="flex items-center gap-2 text-sm">
                          <Star className="h-4 w-4 text-yellow-400" />
                          <div>
                            <p className="text-xs text-gray-500">Rating</p>
                            <p className="font-semibold text-gray-900">
                              {example.user_rating ? `${example.user_rating}/5` : 'N/A'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <div>
                            <p className="text-xs text-gray-500">Created</p>
                            <p className="font-semibold text-gray-900 text-xs">
                              {formatDate(example.created_at)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Edit Count */}
                      {example.was_edited && (
                        <div className="text-xs text-gray-500">
                          Edited {example.edit_count} time{example.edit_count !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>

                    {/* Actions - Always at bottom */}
                    <div className="grid grid-cols-2 gap-2 pt-4 mt-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedExample(example)}
                        className="w-full"
                      >
                        View Full
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(example.content);
                          toast({
                            title: 'Copied!',
                            description: 'Message copied to clipboard',
                          });
                        }}
                        className="w-full"
                        style={{ backgroundColor: '#3e8692' }}
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Preview Dialog for Templates */}
      <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">{selectedTemplate?.name}</DialogTitle>
            <DialogDescription>
              <Badge className={getMessageTypeColor(selectedTemplate?.message_type || '')}>
                {formatMessageType(selectedTemplate?.message_type || '')}
              </Badge>
            </DialogDescription>
          </DialogHeader>

          {selectedTemplate && (
            <div className="space-y-4">
              {/* Variables */}
              {selectedTemplate.variables && selectedTemplate.variables.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Available Variables</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedTemplate.variables.map((variable) => (
                      <Badge key={variable} variant="secondary" className="font-mono">
                        [{variable}]
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    These variables are automatically filled when generating messages via AI
                  </p>
                </div>
              )}

              {/* Full Content */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Template Content</h3>
                <pre className="text-sm bg-gray-50 p-4 rounded border border-gray-200 whitespace-pre-wrap font-sans">
                  {selectedTemplate.content}
                </pre>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                <div>
                  <p className="text-xs text-gray-500">Usage Count</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedTemplate.usage_count}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Last Used</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatDate(selectedTemplate.last_used_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Created</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatDate(selectedTemplate.created_at)}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4">
                <Button
                  onClick={() => handleCopyTemplate(selectedTemplate)}
                  className="flex-1"
                  style={{ backgroundColor: '#3e8692' }}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Template
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setSelectedTemplate(null)}
                  className="flex-1"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Preview Dialog for Learning Examples */}
      <Dialog open={!!selectedExample} onOpenChange={() => setSelectedExample(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">{selectedExample?.client_name || 'Unknown Client'}</DialogTitle>
            <DialogDescription>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge className={getMessageTypeColor(selectedExample?.message_type || '')}>
                  {formatMessageType(selectedExample?.message_type || '')}
                </Badge>
                {selectedExample?.was_ai_generated ? (
                  <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                    <Sparkles className="h-3 w-3 mr-1" />
                    AI Generated
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    <User className="h-3 w-3 mr-1" />
                    User Provided
                  </Badge>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>

          {selectedExample && (
            <div className="space-y-4">
              {/* Full Content */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Message Content</h3>
                <pre className="text-sm bg-gray-50 p-4 rounded border border-gray-200 whitespace-pre-wrap font-sans">
                  {selectedExample.content}
                </pre>
              </div>

              {/* Campaign Info */}
              {selectedExample.campaign_name && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Campaign</h3>
                  <p className="text-sm text-gray-600">{selectedExample.campaign_name}</p>
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                <div>
                  <p className="text-xs text-gray-500">Rating</p>
                  <div className="flex items-center gap-1 mt-1">
                    {selectedExample.user_rating ? (
                      <>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`h-4 w-4 ${
                              star <= selectedExample.user_rating!
                                ? 'fill-yellow-400 text-yellow-400'
                                : 'text-gray-300'
                            }`}
                          />
                        ))}
                        <span className="ml-1 text-sm font-semibold">{selectedExample.user_rating}/5</span>
                      </>
                    ) : (
                      <span className="text-sm text-gray-400">No rating</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Edit Count</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">
                    {selectedExample.edit_count} edit{selectedExample.edit_count !== 1 ? 's' : ''}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Created</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">
                    {formatDate(selectedExample.created_at)}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4">
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(selectedExample.content);
                    toast({
                      title: 'Copied!',
                      description: 'Message copied to clipboard',
                    });
                  }}
                  className="flex-1"
                  style={{ backgroundColor: '#3e8692' }}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Message
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setSelectedExample(null)}
                  className="flex-1"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
