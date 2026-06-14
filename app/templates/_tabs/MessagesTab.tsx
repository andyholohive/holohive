'use client';

/**
 * Messages tab — formerly /templates (top-level page). Holds the
 * client-message templates library + AI learning examples. Promoted
 * here on 2026-06-03 when the three "Templates" sidebar entries
 * (Messages / Tasks / Deliverables) were consolidated into one
 * Templates page with three tabs.
 *
 * Self-contained: own loading state, own data fetch, own preview
 * dialogs. Renders an inner Templates/Examples segmented control
 * because these are two related-but-distinct corpora (curated
 * library vs AI training data); separating them inline keeps the
 * outer 3-way tab strip clean.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
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
import { formatDate as fmtDate } from '@/lib/dateFormat';

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

export default function MessagesTab() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [learningExamples, setLearningExamples] = useState<MessageExample[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingExamples, setLoadingExamples] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  const [selectedExample, setSelectedExample] = useState<MessageExample | null>(null);
  const [innerTab, setInnerTab] = useState<'templates' | 'examples'>('templates');
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
        title: 'Load failed',
        description: error instanceof Error ? error.message : 'Failed to load templates',
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
        title: 'Load failed',
        description: error instanceof Error ? error.message : 'Failed to load learning examples',
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
      kol_list_access: 'bg-emerald-100 text-emerald-800',
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
      activation_day: 'bg-rose-100 text-rose-800',
      mid_campaign_update: 'bg-violet-100 text-violet-800',
      initial_results: 'bg-sky-100 text-sky-800',
      final_report: 'bg-indigo-100 text-indigo-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return fmtDate(dateString);
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

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Inner tab-strip skeleton */}
        <div className="flex gap-2 border-b">
          <Skeleton className="h-10 w-32 rounded-t" />
          <Skeleton className="h-10 w-40 rounded-t" />
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Skeleton className="h-5 w-5 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-6 w-32" />
                  </div>
                  <Skeleton className="h-5 w-5 rounded" />
                </div>
              </CardHeader>
              <CardContent className="flex flex-col flex-grow">
                <div className="flex-grow space-y-4">
                  <div className="bg-cream-50 p-3 rounded border border-cream-200 space-y-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-5/6" />
                    <Skeleton className="h-3 w-4/6" />
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                  </div>
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
      {/* Toolbar — description on the left + counts strip on the right.
          Matches the toolbar shape used by TaskTemplatesTab and
          DeliverableTemplatesTab so the three tabs feel like the
          same family. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-ink-warm-500">
          Pre-built message templates for client comms + a corpus of "Sent" messages the AI uses to learn your style.
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-warm-700 tabular-nums">
            <span className="font-semibold text-ink-warm-900">{templates.length}</span>
            <span className="text-ink-warm-500 ml-1">template{templates.length === 1 ? '' : 's'}</span>
          </span>
          <span className="text-ink-warm-300">·</span>
          <span className="text-xs text-ink-warm-700 tabular-nums">
            <span className="font-semibold text-ink-warm-900">{learningExamples.length}</span>
            <span className="text-ink-warm-500 ml-1">example{learningExamples.length === 1 ? '' : 's'}</span>
          </span>
        </div>
      </div>

      {/* Inner Tabs — Templates / Learning Examples. v11 chrome
          matches the outer Tabs strip on /templates so nested tabs
          read as the same family (just smaller). */}
      <Tabs value={innerTab} onValueChange={(v) => setInnerTab(v as 'templates' | 'examples')}>
        <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200">
          <TabsTrigger
            value="templates"
            className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card text-xs font-medium px-3 py-1.5 text-ink-warm-500"
          >
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
            Templates
          </TabsTrigger>
          <TabsTrigger
            value="examples"
            className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card text-xs font-medium px-3 py-1.5 text-ink-warm-500"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            Learning Examples
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-6 mt-4">
          {/* [2026-06-05] "How to use templates with AI" info card
              hidden per Andy — the AI-generated-messages flow it
              describes isn't in active use anymore. Card markup
              preserved behind `{false && (...)}` so reviving it is
              a one-line flip (vs. re-typing the copy from scratch). */}
          {false && (
          <Card className="bg-brand-soft border-brand-light">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-brand mt-0.5 flex-shrink-0" />
                <div className="space-y-2">
                  <p className="text-sm text-brand-deep font-medium">
                    How to use templates with AI
                  </p>
                  <p className="text-sm text-ink-warm-700">
                    Use the AI chat to generate messages: <code className="bg-white border border-brand-light px-2 py-0.5 rounded">Generate an initial outreach for Jdot</code>
                    <br />
                    The AI will use these templates and learn from messages you mark as &quot;Sent&quot;.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          )}

          {/* Templates Grid — or EmptyState if the library is empty
              (shouldn't usually happen since templates are seeded, but
              defensible). */}
          {templates.length === 0 ? (
            <Card className="border-cream-200 overflow-hidden">
              <EmptyState
                icon={MessageSquare}
                title="No message templates yet."
                description="Templates are seeded from /api/templates — if this is empty, contact an admin to populate the library."
                className="py-12"
              />
            </Card>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => {
              // Apply Telegram formatting for preview
              const formatForTelegram = (content: string) => {
                let formatted = content;
                formatted = formatted.replace(/^([A-Z][A-Za-z\s&]+):$/gm, '**$1:**');
                formatted = formatted.replace(/\n([A-Z][A-Za-z\s&]+):\n/g, '\n**$1:**\n');
                formatted = formatted.replace(/^[•-]/gm, '▪️');
                formatted = formatted.replace(/^(GM|Hey team|Hi)/gm, '**$1**');
                return formatted;
              };

              const formattedContent = formatForTelegram(template.content);

              return (
                <Card key={template.id} className="border-cream-200 transition-shadow flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg font-semibold text-ink-warm-900 mb-2">
                          {template.name}
                        </CardTitle>
                        <Badge className={`${getMessageTypeColor(template.message_type)} pointer-events-none`}>
                          {formatMessageType(template.message_type)}
                        </Badge>
                      </div>
                      <MessageSquare className="h-5 w-5 text-ink-warm-400" />
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col flex-grow">
                    <div className="flex-grow space-y-4">
                      <div className="text-sm text-ink-warm-700 bg-cream-50 p-3 rounded border border-cream-200">
                        <div className="line-clamp-4 whitespace-pre-wrap" style={{ wordBreak: 'break-word' }}>
                          {formattedContent.split('\n').slice(0, 6).map((line, idx) => {
                            const isBold = line.match(/^\*\*(.+)\*\*$/);
                            if (isBold) {
                              return (
                                <div key={idx} className="font-semibold">
                                  {isBold[1]}
                                </div>
                              );
                            }
                            return <div key={idx}>{line || ' '}</div>;
                          }).slice(0, 4)}
                          {formattedContent.split('\n').length > 4 && (
                            <div className="text-ink-warm-400 italic">...</div>
                          )}
                        </div>
                      </div>

                      {template.variables && template.variables.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-ink-warm-700 mb-2">Variables:</p>
                          <div className="flex flex-wrap gap-1">
                            {template.variables.map((variable) => (
                              <Badge key={variable} variant="outline" className="text-xs">
                                {variable}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                        <div className="flex items-center gap-2 text-sm">
                          <TrendingUp className="h-4 w-4 text-ink-warm-400" />
                          <div>
                            <p className="text-xs text-ink-warm-500">Used</p>
                            <p className="font-semibold text-ink-warm-900">{template.usage_count}x</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-ink-warm-400" />
                          <div>
                            <p className="text-xs text-ink-warm-500">Last Used</p>
                            <p className="font-semibold text-ink-warm-900 text-xs">
                              {formatDate(template.last_used_at)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-4 mt-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedTemplate(template)}
                        className="w-full"
                      >
                        View Full
                      </Button>
                      <Button variant="brand" size="sm" onClick={() => handleCopyTemplate(template)} className="w-full">
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          )}
        </TabsContent>

        <TabsContent value="examples" className="space-y-6 mt-4">
          {/* Info card — v11 cream + brand-icon. Was bg-purple-50 /
              border-purple-200. The purple tint was the "AI" semantic
              cue but it clashed with the rest of the v11 chrome. */}
          <Card className="bg-cream-50 border-cream-200">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-brand mt-0.5 flex-shrink-0" />
                <div className="space-y-2">
                  <p className="text-sm text-ink-warm-900 font-medium">
                    AI Learning Examples
                  </p>
                  <p className="text-sm text-ink-warm-700">
                    These are messages you've marked as "Sent" that help the AI learn your communication style and preferences.
                    The AI uses these examples to generate better, more personalized messages.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {loadingExamples ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="border-cream-200">
                  <CardHeader className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-5/6" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : learningExamples.length === 0 ? (
            <Card className="border-cream-200 overflow-hidden">
              <EmptyState
                icon={Sparkles}
                title="No learning examples yet."
                description="Mark generated messages as 'Sent' to create learning examples for the AI."
                className="py-12"
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {learningExamples.map((example) => (
                <Card key={example.id} className="border-cream-200 transition-shadow flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg font-semibold text-ink-warm-900 mb-2">
                          {example.client_name || 'Other'}
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
                      <div className="text-sm text-ink-warm-700 bg-cream-50 p-3 rounded border border-cream-200">
                        <div className="line-clamp-4 whitespace-pre-wrap" style={{ wordBreak: 'break-word' }}>
                          {example.content.split('\n').slice(0, 4).map((line, idx) => (
                            <div key={idx}>{line || ' '}</div>
                          ))}
                          {example.content.split('\n').length > 4 && (
                            <div className="text-ink-warm-400 italic">...</div>
                          )}
                        </div>
                      </div>

                      {example.campaign_name && (
                        <div className="text-xs text-ink-warm-500">
                          Campaign: <span className="font-semibold">{example.campaign_name}</span>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                        <div className="flex items-center gap-2 text-sm">
                          <Star className="h-4 w-4 text-yellow-400" />
                          <div>
                            <p className="text-xs text-ink-warm-500">Rating</p>
                            <p className="font-semibold text-ink-warm-900">
                              {example.user_rating ? `${example.user_rating}/5` : 'N/A'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-ink-warm-400" />
                          <div>
                            <p className="text-xs text-ink-warm-500">Created</p>
                            <p className="font-semibold text-ink-warm-900 text-xs">
                              {formatDate(example.created_at)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {example.was_edited && (
                        <div className="text-xs text-ink-warm-500">
                          Edited {example.edit_count} time{example.edit_count !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-4 mt-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedExample(example)}
                        className="w-full"
                      >
                        View Full
                      </Button>
                      <Button variant="brand" size="sm" onClick={() => { navigator.clipboard.writeText(example.content); toast({ title: 'Copied!', description: 'Message copied to clipboard' }); }} className="w-full">
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
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-xl">{selectedTemplate?.name}</DialogTitle>
            <DialogDescription>
              <Badge className={getMessageTypeColor(selectedTemplate?.message_type || '')}>
                {formatMessageType(selectedTemplate?.message_type || '')}
              </Badge>
            </DialogDescription>
          </DialogHeader>

          {selectedTemplate && (
            <div className="flex-1 overflow-y-auto px-1 py-2 space-y-4">
              {selectedTemplate.variables && selectedTemplate.variables.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-ink-warm-900 mb-2">Available Variables</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedTemplate.variables.map((variable) => (
                      <Badge key={variable} variant="secondary" className="font-mono">
                        [{variable}]
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-ink-warm-500 mt-2">
                    These variables are automatically filled when generating messages via AI
                  </p>
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold text-ink-warm-900 mb-2">Template Content</h3>
                <pre className="text-sm bg-cream-50 p-4 rounded border border-cream-200 whitespace-pre-wrap font-sans">
                  {selectedTemplate.content}
                </pre>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                <div>
                  <p className="text-xs text-ink-warm-500">Usage Count</p>
                  <p className="text-lg font-semibold text-ink-warm-900">{selectedTemplate.usage_count}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-warm-500">Last Used</p>
                  <p className="text-sm font-semibold text-ink-warm-900">
                    {formatDate(selectedTemplate.last_used_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ink-warm-500">Created</p>
                  <p className="text-sm font-semibold text-ink-warm-900">
                    {formatDate(selectedTemplate.created_at)}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button variant="brand" onClick={() => handleCopyTemplate(selectedTemplate)} className="flex-1">
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
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-xl">{selectedExample?.client_name || 'Other'}</DialogTitle>
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
            <div className="flex-1 overflow-y-auto px-1 py-2 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-ink-warm-900 mb-2">Message Content</h3>
                <pre className="text-sm bg-cream-50 p-4 rounded border border-cream-200 whitespace-pre-wrap font-sans">
                  {selectedExample.content}
                </pre>
              </div>

              {selectedExample.campaign_name && (
                <div>
                  <h3 className="text-sm font-semibold text-ink-warm-900 mb-2">Campaign</h3>
                  <p className="text-sm text-ink-warm-700">{selectedExample.campaign_name}</p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                <div>
                  <p className="text-xs text-ink-warm-500">Rating</p>
                  <div className="flex items-center gap-1 mt-1">
                    {selectedExample.user_rating ? (
                      <>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`h-4 w-4 ${
                              star <= selectedExample.user_rating!
                                ? 'fill-yellow-400 text-yellow-400'
                                : 'text-ink-warm-300'
                            }`}
                          />
                        ))}
                        <span className="ml-1 text-sm font-semibold">{selectedExample.user_rating}/5</span>
                      </>
                    ) : (
                      <span className="text-sm text-ink-warm-400">No rating</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-ink-warm-500">Edit Count</p>
                  <p className="text-sm font-semibold text-ink-warm-900 mt-1">
                    {selectedExample.edit_count} edit{selectedExample.edit_count !== 1 ? 's' : ''}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ink-warm-500">Created</p>
                  <p className="text-sm font-semibold text-ink-warm-900 mt-1">
                    {formatDate(selectedExample.created_at)}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button variant="brand" onClick={() => { navigator.clipboard.writeText(selectedExample.content); toast({ title: 'Copied!', description: 'Message copied to clipboard' }); }} className="flex-1">
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
