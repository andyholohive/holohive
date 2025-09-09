import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageTemplateCard } from './MessageTemplateCard';
import { MessageTrainingService, MessageTemplate, MessageContext } from '@/lib/messageTrainingService';
import { Plus, Search, Filter, MessageSquare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface MessageTemplateManagerProps {
  context?: MessageContext;
  onTemplateSelected?: (template: MessageTemplate) => void;
}

export function MessageTemplateManager({ context, onTemplateSelected }: MessageTemplateManagerProps) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [toneFilter, setToneFilter] = useState<string>('all');
  const [audienceFilter, setAudienceFilter] = useState<string>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    content: '',
    category: 'general' as const,
    tone: 'professional' as const,
    target_audience: 'kol' as const,
    tags: [] as string[]
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    filterTemplates();
  }, [templates, searchTerm, categoryFilter, toneFilter, audienceFilter]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await MessageTrainingService.getMessageTemplates();
      setTemplates(data);
    } catch (error) {
      console.error('Error loading templates:', error);
      toast({
        title: "Error",
        description: "Failed to load message templates.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filterTemplates = () => {
    let filtered = templates;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(template =>
        template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        template.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        template.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(template => template.category === categoryFilter);
    }

    // Tone filter
    if (toneFilter !== 'all') {
      filtered = filtered.filter(template => template.tone === toneFilter);
    }

    // Audience filter
    if (audienceFilter !== 'all') {
      filtered = filtered.filter(template => template.target_audience === audienceFilter);
    }

    setFilteredTemplates(filtered);
  };

  const handleCreateTemplate = async () => {
    try {
      const created = await MessageTrainingService.createMessageTemplate(newTemplate);
      if (created) {
        toast({
          title: "Success",
          description: "Message template created successfully.",
        });
        setIsCreateDialogOpen(false);
        setNewTemplate({
          name: '',
          content: '',
          category: 'general',
          tone: 'professional',
          target_audience: 'kol',
          tags: []
        });
        loadTemplates();
      }
    } catch (error) {
      console.error('Error creating template:', error);
      toast({
        title: "Error",
        description: "Failed to create message template.",
        variant: "destructive",
      });
    }
  };

  const handleUseTemplate = (template: MessageTemplate) => {
    if (onTemplateSelected) {
      onTemplateSelected(template);
    }
    // Increment usage count
    MessageTrainingService.incrementUsageCount(template.id);
    loadTemplates(); // Refresh to show updated usage count
  };

  const handlePreviewTemplate = (template: MessageTemplate) => {
    // Show template in a modal or expand the card
    console.log('Preview template:', template);
  };

  const handleTrainOnData = async () => {
    try {
      await MessageTrainingService.trainOnExistingData();
      toast({
        title: "Training Complete",
        description: "Message templates have been generated from existing data.",
      });
      loadTemplates();
    } catch (error) {
      console.error('Error training on data:', error);
      toast({
        title: "Training Failed",
        description: "Failed to train on existing data.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Message Templates</h2>
            <p className="text-gray-600">Create, manage, and organize your message templates</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled>
              <MessageSquare className="w-4 h-4 mr-2" />
              Train on Data
            </Button>
            <Button disabled>
              <Plus className="w-4 h-4 mr-2" />
              New Template
            </Button>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Search templates by name, content, or tags..." className="pl-10 auth-input" disabled />
          </div>
          <div className="flex gap-2">
            <Select disabled>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
            </Select>
            <Select disabled>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
            </Select>
            <Select disabled>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <Skeleton className="h-6 w-3/4 mb-2" />
                    <div className="flex flex-wrap gap-2">
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-5 w-20" />
                      <Skeleton className="h-5 w-14" />
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-4 w-6" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-1">
                    <Skeleton className="h-5 w-12" />
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-14" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                    <Skeleton className="h-16 w-full rounded-lg" />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Skeleton className="h-8 flex-1" />
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Message Templates</h2>
          <p className="text-gray-600">Create, manage, and organize your message templates</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleTrainOnData}
            className="flex items-center gap-2 hover:bg-gray-50"
          >
            <MessageSquare className="w-4 h-4" />
            Train on Data
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2 hover:opacity-90" style={{ backgroundColor: '#3e8692', color: 'white' }}>
                <Plus className="w-4 h-4" />
                New Template
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-hidden">
              <DialogHeader>
                <DialogTitle>Create New Message Template</DialogTitle>
                <DialogDescription>
                  Create a new message template for your campaigns and outreach.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); handleCreateTemplate(); }}>
                <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto px-3 pb-6">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Template Name</Label>
                    <Input
                      id="name"
                      value={newTemplate.name}
                      onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                      placeholder="Enter template name"
                      className="auth-input"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="content">Message Content</Label>
                    <Textarea
                      id="content"
                      value={newTemplate.content}
                      onChange={(e) => setNewTemplate({ ...newTemplate, content: e.target.value })}
                      placeholder="Enter message content (use {placeholder} for dynamic values)"
                      rows={8}
                      className="auth-input"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="category">Category</Label>
                      <Select
                        value={newTemplate.category}
                        onValueChange={(value: any) => setNewTemplate({ ...newTemplate, category: value })}
                      >
                        <SelectTrigger className="auth-input">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="campaign">Campaign</SelectItem>
                          <SelectItem value="outreach">Outreach</SelectItem>
                          <SelectItem value="follow-up">Follow-up</SelectItem>
                          <SelectItem value="general">General</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="tone">Tone</Label>
                      <Select
                        value={newTemplate.tone}
                        onValueChange={(value: any) => setNewTemplate({ ...newTemplate, tone: value })}
                      >
                        <SelectTrigger className="auth-input">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="professional">Professional</SelectItem>
                          <SelectItem value="casual">Casual</SelectItem>
                          <SelectItem value="friendly">Friendly</SelectItem>
                          <SelectItem value="formal">Formal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="audience">Target Audience</Label>
                      <Select
                        value={newTemplate.target_audience}
                        onValueChange={(value: any) => setNewTemplate({ ...newTemplate, target_audience: value })}
                      >
                        <SelectTrigger className="auth-input">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="kol">KOL</SelectItem>
                          <SelectItem value="client">Client</SelectItem>
                          <SelectItem value="partner">Partner</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={!newTemplate.name.trim() || !newTemplate.content.trim()}
                    className="hover:opacity-90"
                    style={{ backgroundColor: "#3e8692", color: "white" }}
                  >
                    Create Template
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search templates by name, content, or tags..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 auth-input"
          />
        </div>
        <div className="flex gap-2">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="campaign">Campaign</SelectItem>
              <SelectItem value="outreach">Outreach</SelectItem>
              <SelectItem value="follow-up">Follow-up</SelectItem>
              <SelectItem value="general">General</SelectItem>
            </SelectContent>
          </Select>
          <Select value={toneFilter} onValueChange={setToneFilter}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tones</SelectItem>
              <SelectItem value="professional">Professional</SelectItem>
              <SelectItem value="casual">Casual</SelectItem>
              <SelectItem value="friendly">Friendly</SelectItem>
              <SelectItem value="formal">Formal</SelectItem>
            </SelectContent>
          </Select>
          <Select value={audienceFilter} onValueChange={setAudienceFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Audiences</SelectItem>
              <SelectItem value="kol">KOL</SelectItem>
              <SelectItem value="client">Client</SelectItem>
              <SelectItem value="partner">Partner</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <div className="text-center py-8">
          <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No templates found</h3>
          <p className="text-gray-600 mb-4">
            {searchTerm || categoryFilter !== 'all' || toneFilter !== 'all' || audienceFilter !== 'all'
              ? 'Try adjusting your filters or search terms.'
              : 'Create your first message template to get started.'}
          </p>
          {!searchTerm && categoryFilter === 'all' && toneFilter === 'all' && audienceFilter === 'all' && (
                          <Button onClick={() => setIsCreateDialogOpen(true)} className="hover:opacity-90" style={{ backgroundColor: '#3e8692', color: 'white' }}>
                <Plus className="w-4 h-4 mr-2" />
                Create Template
              </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => (
            <MessageTemplateCard
              key={template.id}
              template={template}
              onUseTemplate={handleUseTemplate}
              onPreviewTemplate={handlePreviewTemplate}
            />
          ))}
        </div>
      )}
    </>
  );
}
