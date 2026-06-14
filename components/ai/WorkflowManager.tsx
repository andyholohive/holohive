import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AdvancedAIService, AutomatedWorkflow, WorkflowAction } from '@/lib/advancedAIService';
import { Plus, Play, Pause, Edit, Trash2, Settings, Zap, Clock, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/dateFormat';

export function WorkflowManager() {
  const { toast } = useToast();
  const [workflows, setWorkflows] = useState<AutomatedWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<AutomatedWorkflow | null>(null);
  const [newWorkflow, setNewWorkflow] = useState({
    name: '',
    description: '',
    triggers: [] as string[],
    actions: [] as WorkflowAction[],
    enabled: true
  });

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    try {
      setLoading(true);
      // This would fetch from the database
      const mockWorkflows: AutomatedWorkflow[] = [
        {
          id: '1',
          name: 'Campaign Launch Automation',
          description: 'Automatically create campaigns and notify KOLs when budget is allocated',
          triggers: ['budget_allocated', 'campaign_created'],
          actions: [
            {
              type: 'create_campaign',
              parameters: { name: 'Auto Campaign', budget: 50000 }
            },
            {
              type: 'send_message',
              parameters: { template: 'campaign_launch', recipients: 'kol_list' }
            }
          ],
          enabled: true,
          successRate: 85,
          lastRun: new Date().toISOString()
        },
        {
          id: '2',
          name: 'Performance Monitoring',
          description: 'Monitor campaign performance and generate reports',
          triggers: ['campaign_updated', 'daily_check'],
          actions: [
            {
              type: 'generate_report',
              parameters: { type: 'performance', frequency: 'daily' }
            },
            {
              type: 'notify_user',
              parameters: { channel: 'email', template: 'performance_alert' }
            }
          ],
          enabled: true,
          successRate: 92,
          lastRun: new Date().toISOString()
        }
      ];
      setWorkflows(mockWorkflows);
    } catch (error) {
      console.error('Error loading workflows:', error);
      toast({
        title: 'Load failed',
        description: error instanceof Error ? error.message : 'Failed to load workflows',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWorkflow = async () => {
    try {
      const workflow = await AdvancedAIService.createAutomatedWorkflow(newWorkflow);
      setWorkflows(prev => [workflow, ...prev]);
      setIsCreateDialogOpen(false);
      setNewWorkflow({
        name: '',
        description: '',
        triggers: [],
        actions: [],
        enabled: true
      });
      toast({ title: 'Workflow created' });
    } catch (error) {
      console.error('Error creating workflow:', error);
      toast({
        title: 'Create failed',
        description: error instanceof Error ? error.message : 'Failed to create workflow',
        variant: 'destructive',
      });
    }
  };

  const handleExecuteWorkflow = async (workflowId: string) => {
    try {
      const success = await AdvancedAIService.executeWorkflow(workflowId);
      if (success) {
        toast({ title: 'Workflow executed' });
        loadWorkflows(); // Refresh to get updated success rate
      } else {
        toast({
          title: 'Workflow completed with errors',
          description: 'Some steps failed during execution.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error executing workflow:', error);
      toast({
        title: 'Execute failed',
        description: error instanceof Error ? error.message : 'Failed to execute workflow',
        variant: 'destructive',
      });
    }
  };

  const handleToggleWorkflow = async (workflowId: string, enabled: boolean) => {
    try {
      // Update workflow enabled status
      setWorkflows(prev => prev.map(w => 
        w.id === workflowId ? { ...w, enabled } : w
      ));
      toast({
        title: enabled ? 'Workflow enabled' : 'Workflow disabled',
      });
    } catch (error) {
      console.error('Error toggling workflow:', error);
      toast({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Failed to update workflow status',
        variant: 'destructive',
      });
    }
  };

  const addAction = () => {
    setNewWorkflow(prev => ({
      ...prev,
      actions: [...prev.actions, {
        type: 'create_campaign',
        parameters: {},
        conditions: []
      }]
    }));
  };

  const updateAction = (index: number, action: WorkflowAction) => {
    setNewWorkflow(prev => ({
      ...prev,
      actions: prev.actions.map((a, i) => i === index ? action : a)
    }));
  };

  const removeAction = (index: number) => {
    setNewWorkflow(prev => ({
      ...prev,
      actions: prev.actions.filter((_, i) => i !== index)
    }));
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'create_campaign': return <Plus className="w-4 h-4" />;
      case 'send_message': return <Zap className="w-4 h-4" />;
      case 'update_status': return <Settings className="w-4 h-4" />;
      case 'generate_report': return <CheckCircle className="w-4 h-4" />;
      case 'notify_user': return <Clock className="w-4 h-4" />;
      default: return <Settings className="w-4 h-4" />;
    }
  };

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 90) return 'text-emerald-600';
    if (rate >= 70) return 'text-yellow-600';
    return 'text-rose-600';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-ink-warm-900">Automated Workflows</h2>
          <Button disabled>
            <Plus className="w-4 h-4 mr-2" />
            New Workflow
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <Skeleton className="h-6 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                  <Skeleton className="h-6 w-12" />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-4">
                  <div>
                    <Skeleton className="h-4 w-16 mb-2" />
                    <div className="flex flex-wrap gap-1">
                      <Skeleton className="h-5 w-20" />
                      <Skeleton className="h-5 w-24" />
                    </div>
                  </div>
                  <div>
                    <Skeleton className="h-4 w-12 mb-2" />
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-4" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-4" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-4">
                      <Skeleton className="h-4 w-12" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                    <div className="flex gap-2">
                      <Skeleton className="h-8 w-8" />
                      <Skeleton className="h-8 w-8" />
                    </div>
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-ink-warm-900">Automated Workflows</h2>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="brand">
              <Plus className="w-4 h-4 mr-2" />
              New Workflow
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Create New Workflow</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-1 py-2 space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Workflow Name</Label>
                  <Input
                    id="name"
                    value={newWorkflow.name}
                    onChange={(e) => setNewWorkflow(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter workflow name"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={newWorkflow.description}
                    onChange={(e) => setNewWorkflow(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe what this workflow does"
                    rows={3}
                  />
                </div>
              </div>

              {/* Triggers */}
              <div>
                <Label>Triggers</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {['campaign_created', 'budget_allocated', 'kol_added', 'daily_check', 'performance_alert'].map(trigger => (
                    <div key={trigger} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={trigger}
                        checked={newWorkflow.triggers.includes(trigger)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewWorkflow(prev => ({
                              ...prev,
                              triggers: [...prev.triggers, trigger]
                            }));
                          } else {
                            setNewWorkflow(prev => ({
                              ...prev,
                              triggers: prev.triggers.filter(t => t !== trigger)
                            }));
                          }
                        }}
                      />
                      <Label htmlFor={trigger} className="text-sm capitalize">
                        {trigger.replace('_', ' ')}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <Label>Actions</Label>
                  <Button size="sm" onClick={addAction} variant="outline">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Action
                  </Button>
                </div>
                <div className="space-y-4">
                  {newWorkflow.actions.map((action, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {getActionIcon(action.type)}
                          <Select
                            value={action.type}
                            onValueChange={(value: any) => updateAction(index, { ...action, type: value })}
                          >
                            <SelectTrigger className="w-48">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="create_campaign">Create Campaign</SelectItem>
                              <SelectItem value="send_message">Send Message</SelectItem>
                              <SelectItem value="update_status">Update Status</SelectItem>
                              <SelectItem value="generate_report">Generate Report</SelectItem>
                              <SelectItem value="notify_user">Notify User</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeAction(index)}
                          className="text-rose-600 hover:text-rose-800"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm">Parameters (JSON)</Label>
                        <Textarea
                          value={JSON.stringify(action.parameters, null, 2)}
                          onChange={(e) => {
                            try {
                              const params = JSON.parse(e.target.value);
                              updateAction(index, { ...action, parameters: params });
                            } catch (error) {
                              // Invalid JSON, ignore
                            }
                          }}
                          placeholder="{}"
                          rows={3}
                          className="font-mono text-sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button onClick={handleCreateWorkflow} disabled={!newWorkflow.name || newWorkflow.actions.length === 0}>
                  Create Workflow
                </Button>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Workflows Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workflows.map((workflow) => (
          <Card key={workflow.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg font-semibold text-ink-warm-900">
                    {workflow.name}
                  </CardTitle>
                  <p className="text-sm text-ink-warm-700 mt-1">
                    {workflow.description}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={workflow.enabled}
                    onCheckedChange={(enabled) => handleToggleWorkflow(workflow.id, enabled)}
                    className="switch-teal"
                  />
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {/* Triggers */}
              <div>
                <h4 className="text-sm font-medium text-ink-warm-700 mb-2">Triggers</h4>
                <div className="flex flex-wrap gap-1">
                  {workflow.triggers.map((trigger) => (
                    <Badge key={trigger} variant="outline" className="text-xs">
                      {trigger.replace('_', ' ')}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div>
                <h4 className="text-sm font-medium text-ink-warm-700 mb-2">Actions</h4>
                <div className="space-y-2">
                  {workflow.actions.map((action, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm text-ink-warm-700">
                      {getActionIcon(action.type)}
                      <span className="capitalize">{action.type.replace('_', ' ')}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span className={getSuccessRateColor(workflow.successRate)}>
                      {workflow.successRate}%
                    </span>
                  </div>
                  {workflow.lastRun && (
                    <div className="flex items-center gap-1 text-ink-warm-500">
                      <Clock className="w-4 h-4" />
                      <span>{formatDate(workflow.lastRun)}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleExecuteWorkflow(workflow.id)}
                    disabled={!workflow.enabled}
                  >
                    <Play className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline">
                    <Edit className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {workflows.length === 0 && (
        <div className="text-center py-8">
          <Zap className="w-12 h-12 text-ink-warm-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-ink-warm-900 mb-2">No workflows yet</h3>
          <p className="text-ink-warm-700 mb-4">
            Create your first automated workflow to streamline campaign management tasks.
          </p>
          <Button variant="brand" onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Workflow
          </Button>
        </div>
      )}
    </div>
  );
}
