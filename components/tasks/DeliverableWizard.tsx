'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  DeliverableService,
  DeliverableTemplate,
  DeliverableTemplateStep,
} from '@/lib/deliverableService';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Check,
  Rocket,
  FileText,
  Handshake,
  Search,
  Eye,
  BarChart3,
  ClipboardList,
  Loader2,
} from 'lucide-react';

const ICON_MAP: Record<string, any> = {
  Rocket,
  FileText,
  Handshake,
  Search,
  Eye,
  BarChart3,
  ClipboardList,
};

const CATEGORY_LABELS: Record<string, string> = {
  client: 'Client',
  internal: 'Internal',
  bd: 'BD',
};

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type ClientOption = {
  id: string;
  name: string;
};

interface DeliverableWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamMembers: TeamMember[];
  clients: ClientOption[];
  onCreated: () => void;
  /** Pre-select a template when the wizard opens. Used by the "Run this
   *  SOP" button on /sops to skip step 0 and land directly on Configure.
   *  Added 2026-05-07 (migration 048 / SOP-task linking). */
  preselectedTemplateId?: string;
  /** Optional starting title — pre-fills the title field if provided.
   *  The "Run this SOP" flow uses this to seed with the SOP name. */
  initialTitle?: string;
}

const toLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const STEPS = ['Select Type', 'Configure', 'Assign Roles', 'Review & Create'] as const;

export function DeliverableWizard({ open, onOpenChange, teamMembers, clients, onCreated, preselectedTemplateId, initialTitle }: DeliverableWizardProps) {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [templates, setTemplates] = useState<DeliverableTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: selected template
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateSteps, setTemplateSteps] = useState<DeliverableTemplateStep[]>([]);

  // Step 2: configuration
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [priority, setPriority] = useState('medium');

  // Step 3: per-step assignments + due date overrides.
  //
  // Was previously keyed by `default_role` which meant "all steps with
  // the same role got the same assignee." Templates like "Client
  // Onboarding - Internal Setup" have 8 steps sharing one role —
  // picking any assignee dumped all 8 onto one person. Now we key by
  // step.id so each row in the wizard table is independently assigned.
  // Picking a person in one row no longer overwrites peers (2026-05-07).
  const [stepAssignments, setStepAssignments] = useState<Record<string, { userId: string; userName: string }>>({});
  const [dueDateOverrides, setDueDateOverrides] = useState<Record<number, string>>({});

  useEffect(() => {
    if (open) {
      // When a template is pre-selected (the "Run this SOP" path),
      // skip step 0 and seed the template + start at Configure.
      // loadTemplateSteps fires from a separate effect when
      // selectedTemplateId changes — same hook that runs after the
      // user clicks a template tile in step 0.
      const startStep = preselectedTemplateId ? 1 : 0;
      setStep(startStep);
      setSelectedTemplateId(preselectedTemplateId ?? null);
      setTemplateSteps([]);
      setTitle(initialTitle ?? '');
      setClientId('');
      setStartDate(new Date());
      setPriority('medium');
      setStepAssignments({});
      setDueDateOverrides({});
      loadTemplates();
    }
  }, [open, preselectedTemplateId, initialTitle]);

  // Auto-compute priority from start date
  useEffect(() => {
    const now = new Date();
    const due = new Date(startDate);
    due.setHours(23, 59, 59);
    const hoursLeft = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursLeft < 0) setPriority('urgent');
    else if (hoursLeft <= 24) setPriority('urgent');
    else if (hoursLeft <= 48) setPriority('high');
    else if (hoursLeft <= 72) setPriority('medium');
    else setPriority('low');
  }, [startDate]);

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const data = await DeliverableService.getTemplates();
      setTemplates(data);
    } catch {
      toast({ title: 'Error', description: 'Failed to load templates', variant: 'destructive' });
    } finally {
      setLoadingTemplates(false);
    }
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) || null;

  // Load template steps whenever selectedTemplateId changes — covers
  // both the manual-click path (handleSelectTemplate) AND the pre-select
  // path used by "Run this SOP". Without this effect, opening with a
  // pre-selected template would land on Configure with empty steps.
  useEffect(() => {
    if (!selectedTemplateId) return;
    if (templateSteps.length > 0 && templateSteps[0].template_id === selectedTemplateId) return;
    let cancelled = false;
    (async () => {
      const data = await DeliverableService.getTemplateWithSteps(selectedTemplateId);
      if (cancelled || !data) return;
      setTemplateSteps(data.steps);
      // Auto-fill title only if it's empty (the "Run this SOP" caller
      // can pass initialTitle to seed it with the SOP name).
      setTitle(prev => prev || data.template?.name || '');
    })();
    return () => { cancelled = true; };
  }, [selectedTemplateId]);

  const handleSelectTemplate = async (id: string) => {
    setSelectedTemplateId(id);
    const data = await DeliverableService.getTemplateWithSteps(id);
    if (data) {
      setTemplateSteps(data.steps);
      // Auto-generate title
      const tmpl = templates.find(t => t.id === id);
      if (tmpl) {
        const clientName = clientId ? clients.find(c => c.id === clientId)?.name : '';
        setTitle(clientName ? `${tmpl.name} - ${clientName}` : tmpl.name);
      }
    }
  };

  // When client changes, update title
  useEffect(() => {
    if (selectedTemplate) {
      const clientName = clientId ? clients.find(c => c.id === clientId)?.name : '';
      setTitle(clientName ? `${selectedTemplate.name} - ${clientName}` : selectedTemplate.name);
    }
  }, [clientId, selectedTemplate, clients]);

  const computedDueDates = (overrides: Record<number, string>) => {
    const dates: Record<number, string> = {};
    let cumDays = 0;
    for (const s of templateSteps) {
      cumDays += s.estimated_duration_days;
      if (overrides[s.step_order]) {
        dates[s.step_order] = overrides[s.step_order];
      } else {
        const d = new Date(startDate);
        d.setDate(d.getDate() + cumDays);
        dates[s.step_order] = toLocalDateString(d);
      }
    }
    return dates;
  };

  const dueDates = computedDueDates(dueDateOverrides);

  const canAdvance = () => {
    switch (step) {
      case 0: return !!selectedTemplateId;
      case 1: return !!title.trim() && !!startDate;
      case 2: return true; // roles are optional
      case 3: return true;
      default: return false;
    }
  };

  const handleSubmit = async () => {
    if (!user?.id || !userProfile) return;
    setSubmitting(true);
    try {
      const result = await DeliverableService.createDeliverable({
        templateId: selectedTemplateId!,
        title: title.trim(),
        clientId: clientId || null,
        startDate: toLocalDateString(startDate),
        priority,
        // Pass an empty roleAssignments — stepAssignments is the source
        // of truth post-2026-05-07. The service still accepts both for
        // back-compat but we only populate the per-step map.
        roleAssignments: {},
        stepAssignments,
        dueDateOverrides,
        createdBy: user.id,
        createdByName: userProfile.name || userProfile.email || '',
      });

      toast({
        title: 'Deliverable created',
        description: `Created "${result.parentTask.task_name}" with ${result.subtasks.length} subtasks`,
      });
      onOpenChange(false);
      onCreated();
    } catch (err: any) {
      console.error('Error creating deliverable:', err);
      toast({ title: 'Error', description: err.message || 'Failed to create deliverable', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const IconComponent = selectedTemplate ? (ICON_MAP[selectedTemplate.icon] || ClipboardList) : ClipboardList;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[800px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>New Deliverable</DialogTitle>
          <DialogDescription>Create a structured workflow from a template</DialogDescription>
        </DialogHeader>

        {/* Info banner */}
        <div className="bg-brand/5 border border-brand/20 rounded-lg px-4 py-3 text-xs text-gray-600 leading-relaxed">
          <span className="font-medium text-brand">How it works:</span> Pick a workflow template, configure details, and assign team members to each step. This will create a <span className="font-medium">parent task</span> with individual <span className="font-medium">subtasks</span> for each step — complete with due dates and checklists. Track progress in the Workflow tab.
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 py-3">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <button
                onClick={() => i < step && setStep(i)}
                className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                  i === step
                    ? 'bg-brand text-white'
                    : i < step
                    ? 'bg-brand/10 text-brand cursor-pointer hover:bg-brand/20'
                    : 'bg-gray-100 text-gray-400'
                }`}
                disabled={i > step}
              >
                {i < step ? <Check className="h-3 w-3" /> : <span className="w-4 text-center">{i + 1}</span>}
                <span className="hidden sm:inline">{label}</span>
              </button>
              {i < STEPS.length - 1 && <div className="w-6 h-px bg-gray-300" />}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto min-h-0 px-1">
          {/* Step 1: Select Type */}
          {step === 0 && (
            <div className="space-y-3">
              {loadingTemplates ? (
                <div className="flex justify-center py-12 text-gray-400">Loading templates...</div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {templates.map(t => {
                    const Icon = ICON_MAP[t.icon] || ClipboardList;
                    const isSelected = selectedTemplateId === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => handleSelectTemplate(t.id)}
                        className={`text-left p-4 rounded-lg border-2 transition-all ${
                          isSelected
                            ? 'border-brand bg-brand/5'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className="p-2 rounded-lg"
                            style={{ backgroundColor: t.color + '15', color: t.color }}
                          >
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-gray-900">{t.name}</div>
                            <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.description}</div>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {CATEGORY_LABELS[t.category] || t.category}
                              </Badge>
                            </div>
                          </div>
                          {isSelected && (
                            <Check className="h-5 w-5 text-brand flex-shrink-0" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Configure */}
          {step === 1 && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  className="focus-brand"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Deliverable title"
                />
              </div>

              <div className="space-y-2">
                <Label>Client</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger className="focus-brand">
                    <SelectValue placeholder="Select client (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No client</SelectItem>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="focus-brand w-full justify-start text-left font-normal"
                      style={{ borderColor: '#e5e7eb', backgroundColor: 'white', color: '#111827' }}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate.toLocaleDateString()}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={d => d && setStartDate(d)}
                      initialFocus
                      classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                      modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">Priority <span className="text-[10px] text-gray-400 font-normal">(auto)</span></Label>
                <div className={`flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 text-sm font-medium capitalize ${
                  priority === 'urgent' ? 'text-red-600 bg-red-50' :
                  priority === 'high' ? 'text-orange-600 bg-orange-50' :
                  priority === 'medium' ? 'text-blue-600 bg-blue-50' :
                  'text-gray-400 bg-gray-50'
                }`}>
                  {priority}
                </div>
              </div>

              {selectedTemplate && (
                <div className="bg-gray-50 rounded-lg p-3 mt-2">
                  <div className="flex items-center gap-2 mb-2">
                    <IconComponent className="h-4 w-4" style={{ color: selectedTemplate.color }} />
                    <span className="text-sm font-medium">{selectedTemplate.name}</span>
                  </div>
                  <div className="text-xs text-gray-500">{templateSteps.length} steps will be created as subtasks</div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Assign Roles */}
          {step === 2 && (
            <div className="space-y-1 py-2">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-500">Assign team members to each step. Leave empty to assign later.</p>
                {user?.id && userProfile && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => {
                      // Assign every step (by step.id, not by role) to the
                      // current user. Updated post-2026-05-07 to match the
                      // per-step keying used by the Select inputs below.
                      const all: Record<string, { userId: string; userName: string }> = {};
                      templateSteps.forEach(s => {
                        all[s.id] = { userId: user.id, userName: userProfile.name || userProfile.email || '' };
                      });
                      setStepAssignments(all);
                    }}
                  >
                    Assign all to me
                  </Button>
                )}
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="text-left p-2 font-medium text-gray-600 text-xs">Step</th>
                      <th className="text-left p-2 font-medium text-gray-600 text-xs">Role</th>
                      <th className="text-left p-2 font-medium text-gray-600 text-xs">Assignee</th>
                      <th className="text-left p-2 font-medium text-gray-600 text-xs w-[150px]">
                        <div className="flex items-center justify-between gap-1">
                          <span>Due Date</span>
                          {/* Bulk-apply trigger. Two actions in one popover:
                              - Set all steps to a single date (flatten)
                              - Shift dates so the LAST step lands on the
                                picked date (preserves spacing — useful when
                                the deadline moves but the relative cadence
                                between steps should stay intact). */}
                          <BulkDueDatePopover
                            templateSteps={templateSteps}
                            currentDates={dueDates}
                            onApplyAll={(dateStr) => {
                              const overrides: Record<number, string> = {};
                              for (const s of templateSteps) overrides[s.step_order] = dateStr;
                              setDueDateOverrides(overrides);
                            }}
                            onShiftToEndOn={(targetEndDateStr) => {
                              // Shift everything by the delta between the
                              // current LAST step's date and the target.
                              // Walks every step's existing computed date
                              // forward/backward by the same number of days,
                              // preserving the relative spacing the template
                              // designed in.
                              if (templateSteps.length === 0) return;
                              const lastStep = [...templateSteps].sort(
                                (a, b) => b.step_order - a.step_order,
                              )[0];
                              const currentLast = dueDates[lastStep.step_order];
                              if (!currentLast) return;
                              const fromDate = new Date(currentLast + 'T00:00:00');
                              const toDate = new Date(targetEndDateStr + 'T00:00:00');
                              const deltaMs = toDate.getTime() - fromDate.getTime();
                              const overrides: Record<number, string> = {};
                              for (const s of templateSteps) {
                                const orig = dueDates[s.step_order];
                                if (!orig) continue;
                                const shifted = new Date(new Date(orig + 'T00:00:00').getTime() + deltaMs);
                                overrides[s.step_order] = toLocalDateString(shifted);
                              }
                              setDueDateOverrides(overrides);
                            }}
                          />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {templateSteps.map(s => (
                      <tr key={s.id} className="border-b last:border-0">
                        <td className="p-2">
                          <div className="text-xs font-medium">{s.step_order}. {s.step_name}</div>
                          <div className="text-[10px] text-gray-400">{s.estimated_duration_days}d</div>
                        </td>
                        <td className="p-2">
                          <Badge variant="outline" className="text-[10px]">{s.role_label}</Badge>
                        </td>
                        <td className="p-2">
                          <Select
                            value={stepAssignments[s.id]?.userId || 'unassigned'}
                            onValueChange={val => {
                              const member = teamMembers.find(m => m.id === val);
                              setStepAssignments(prev => {
                                if (val === 'unassigned') {
                                  const next = { ...prev };
                                  delete next[s.id];
                                  return next;
                                }
                                // Convenience: when picking an assignee for
                                // the FIRST step of a given role, auto-fill
                                // peers that share the same role and are
                                // still unassigned. Subsequent picks for
                                // OTHER steps don't propagate — preserves
                                // independent per-step control.
                                const next: typeof prev = { ...prev, [s.id]: { userId: val, userName: member?.name || '' } };
                                const sameRolePeers = templateSteps.filter(
                                  p => p.id !== s.id && p.default_role === s.default_role && !prev[p.id]
                                );
                                const isFirstPickForRole = !templateSteps.some(
                                  p => p.id !== s.id && p.default_role === s.default_role && prev[p.id]
                                );
                                if (isFirstPickForRole) {
                                  for (const peer of sameRolePeers) {
                                    next[peer.id] = { userId: val, userName: member?.name || '' };
                                  }
                                }
                                return next;
                              });
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Unassigned" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">Unassigned</SelectItem>
                              {teamMembers.map(m => (
                                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className="focus-brand h-8 text-xs w-full justify-start text-left font-normal"
                                style={{
                                  borderColor: '#e5e7eb',
                                  backgroundColor: 'white',
                                  color: (dueDateOverrides[s.step_order] || dueDates[s.step_order]) ? '#111827' : '#9ca3af',
                                }}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {(() => {
                                  const dateStr = dueDateOverrides[s.step_order] || dueDates[s.step_order];
                                  if (!dateStr) return 'Select date';
                                  return new Date(dateStr + 'T00:00:00').toLocaleDateString();
                                })()}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={(() => {
                                  const dateStr = dueDateOverrides[s.step_order] || dueDates[s.step_order];
                                  return dateStr ? new Date(dateStr + 'T00:00:00') : undefined;
                                })()}
                                onSelect={d => {
                                  if (d) setDueDateOverrides(prev => ({ ...prev, [s.step_order]: toLocalDateString(d) }));
                                }}
                                initialFocus
                                classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                                modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                              />
                            </PopoverContent>
                          </Popover>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 3 && (
            <div className="space-y-4 py-2">
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: (selectedTemplate?.color || '#3e8692') + '15' }}>
                    <IconComponent className="h-5 w-5" style={{ color: selectedTemplate?.color }} />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{title}</div>
                    <div className="text-xs text-gray-500">
                      {selectedTemplate?.name} &middot; {templateSteps.length} steps
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-gray-500">Client</span>
                    <div className="font-medium">{clients.find(c => c.id === clientId)?.name || 'None'}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Start Date</span>
                    <div className="font-medium">{toLocalDateString(startDate)}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Priority</span>
                    <div className="font-medium capitalize">{priority}</div>
                  </div>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="text-left p-2 font-medium text-gray-600">Step</th>
                      <th className="text-left p-2 font-medium text-gray-600">Assignee</th>
                      <th className="text-left p-2 font-medium text-gray-600">Due</th>
                      <th className="text-left p-2 font-medium text-gray-600">Checklist</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templateSteps.map(s => {
                      const assignee = stepAssignments[s.id];
                      const checklistCount = Array.isArray(s.checklist_items) ? s.checklist_items.length : 0;
                      return (
                        <tr key={s.id} className="border-b last:border-0">
                          <td className="p-2 font-medium">{s.step_order}. {s.step_name}</td>
                          <td className="p-2 text-gray-600">{assignee?.userName || 'Unassigned'}</td>
                          <td className="p-2 text-gray-600">{dueDates[s.step_order] || '-'}</td>
                          <td className="p-2 text-gray-600">{checklistCount} items</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="flex items-center justify-between pt-3 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => step === 0 ? onOpenChange(false) : setStep(step - 1)}
            disabled={submitting}
          >
            {step === 0 ? 'Cancel' : <><ChevronLeft className="h-4 w-4 mr-1" /> Back</>}
          </Button>

          {step < 3 ? (
            <Button
              size="sm"
              onClick={() => setStep(step + 1)}
              disabled={!canAdvance()}
              style={{ backgroundColor: '#3e8692', color: 'white' }}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={submitting}
              style={{ backgroundColor: '#3e8692', color: 'white' }}
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
              ) : (
                'Create Deliverable'
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ────────────────────────── Bulk due-date popover ─────────────────────── */

/**
 * Bulk-apply trigger for the per-step Due Date column. Two real
 * actions because they answer different questions:
 *
 *   "All steps share the same hard deadline" → Apply to all
 *     (e.g. campaign launches Friday, every step needs to be done
 *     before then; spacing doesn't matter)
 *
 *   "Project moved but cadence stays" → Shift to end on
 *     (e.g. template scheduled X over 30 days, the launch slipped
 *     by a week; just push everything back proportionally)
 *
 * Renders as a small icon button next to the column header. Compact
 * popover: calendar + two buttons. No third "shift by N days" option
 * — the end-date framing is more concrete and covers the same use
 * case ("set end-on to a week from today" = "shift forward by 7d").
 */
function BulkDueDatePopover({
  templateSteps,
  currentDates,
  onApplyAll,
  onShiftToEndOn,
}: {
  templateSteps: Array<{ step_order: number }>;
  currentDates: Record<number, string>;
  onApplyAll: (dateStr: string) => void;
  onShiftToEndOn: (dateStr: string) => void;
}) {
  const [picked, setPicked] = useState<Date | undefined>(undefined);
  const [open, setOpen] = useState(false);

  // Disable shift if no current dates exist to shift FROM (caller
  // can't compute a delta without them). The first time the wizard
  // opens, the auto-computed dates are present, so this is rarely
  // hit — but defensive in case the template has no estimated
  // durations.
  const lastStepOrder = templateSteps.length > 0
    ? Math.max(...templateSteps.map(s => s.step_order))
    : 0;
  const canShift = !!currentDates[lastStepOrder];

  // Shared close-after-action handler. Both buttons call onApply,
  // close the popover, and reset the picked date so the next open
  // starts fresh (less surprising than retaining stale state).
  const apply = (mode: 'all' | 'shift') => {
    if (!picked) return;
    const dateStr = `${picked.getFullYear()}-${String(picked.getMonth() + 1).padStart(2, '0')}-${String(picked.getDate()).padStart(2, '0')}`;
    if (mode === 'all') onApplyAll(dateStr);
    else onShiftToEndOn(dateStr);
    setOpen(false);
    setPicked(undefined);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-[10px] text-brand hover:underline flex items-center gap-0.5 font-medium"
          title="Bulk apply a date to all steps"
        >
          <CalendarIcon className="h-3 w-3" />
          Bulk
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="p-2 border-b text-[11px] text-gray-600 font-medium">
          Bulk apply due date
        </div>
        <Calendar
          mode="single"
          selected={picked}
          onSelect={setPicked}
          initialFocus
          classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
          modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
        />
        <div className="p-2 border-t flex flex-col gap-1.5">
          <Button
            type="button"
            size="sm"
            disabled={!picked}
            onClick={() => apply('all')}
            className="text-xs h-8"
          >
            Apply to all steps
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!picked || !canShift}
            onClick={() => apply('shift')}
            className="text-xs h-8"
            title={canShift ? 'Shift every step by the same delta so the last step lands on this date' : 'Needs existing dates to shift from'}
          >
            Shift so last step ends on this date
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
