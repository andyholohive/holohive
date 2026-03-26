'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  DeliverableService,
  DeliverableTemplate,
  DeliverableTemplateStep,
} from '@/lib/deliverableService';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  Settings,
  Trash2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Pencil,
  Rocket,
  FileText,
  Handshake,
  Search,
  Eye,
  BarChart3,
  ClipboardList,
} from 'lucide-react';

function SortableStepRow({ step, onEdit, onDelete }: { step: DeliverableTemplateStep; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center justify-between bg-white rounded px-3 py-2 border border-gray-100">
      <div className="flex items-center gap-2">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="h-3.5 w-3.5 text-gray-300" />
        </button>
        <span className="text-xs font-medium text-gray-500 w-5">{step.step_order}.</span>
        <span className="text-sm">{step.step_name}</span>
        <Badge variant="outline" className="text-[10px]">{step.role_label}</Badge>
        <span className="text-[10px] text-gray-400">{step.estimated_duration_days}d</span>
        {step.is_blocking && <Badge className="text-[10px] bg-amber-100 text-amber-700 border-0 hover:bg-amber-100">Blocking</Badge>}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onEdit}>
          <Pencil className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={onDelete}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

const ICON_MAP: Record<string, any> = {
  Rocket, FileText, Handshake, Search, Eye, BarChart3, ClipboardList,
};

const ICON_OPTIONS = ['Rocket', 'FileText', 'Handshake', 'Search', 'Eye', 'BarChart3', 'ClipboardList'];
const CATEGORY_OPTIONS = [
  { value: 'client', label: 'Client' },
  { value: 'internal', label: 'Internal' },
  { value: 'bd', label: 'BD' },
];

export default function DeliverableTemplatesPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [templates, setTemplates] = useState<DeliverableTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [steps, setSteps] = useState<Record<string, DeliverableTemplateStep[]>>({});

  // Template edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DeliverableTemplate | null>(null);
  const [editForm, setEditForm] = useState({ name: '', slug: '', description: '', category: 'client', icon: 'ClipboardList', color: '#3e8692' });

  // Step edit dialog
  const [stepDialogOpen, setStepDialogOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<DeliverableTemplateStep | null>(null);
  const [stepForm, setStepForm] = useState({
    step_name: '', description: '', default_role: '', role_label: '',
    estimated_duration_days: 1, task_type: 'Client Delivery', is_blocking: false,
    checklist_items: '',
  });
  const [stepTemplateId, setStepTemplateId] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => { loadTemplates(); }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await DeliverableService.getTemplates();
      setTemplates(data);
    } catch {
      toast({ title: 'Error', description: 'Failed to load templates', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleStepDragEnd = async (event: DragEndEvent, templateId: string) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const templateSteps = steps[templateId] || [];
    const oldIndex = templateSteps.findIndex(s => s.id === active.id);
    const newIndex = templateSteps.findIndex(s => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(templateSteps, oldIndex, newIndex);
    // Optimistically update with new step_order values
    const updated = reordered.map((s, i) => ({ ...s, step_order: i + 1 }));
    setSteps(prev => ({ ...prev, [templateId]: updated }));

    // Persist each step's new order
    try {
      await Promise.all(updated.map(s => DeliverableService.updateStep(s.id, { step_order: s.step_order } as any)));
      toast({ title: 'Steps reordered' });
    } catch {
      toast({ title: 'Error', description: 'Failed to reorder steps', variant: 'destructive' });
      const data = await DeliverableService.getTemplateWithSteps(templateId);
      if (data) setSteps(prev => ({ ...prev, [templateId]: data.steps }));
    }
  };

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!steps[id]) {
      const data = await DeliverableService.getTemplateWithSteps(id);
      if (data) {
        setSteps(prev => ({ ...prev, [id]: data.steps }));
      }
    }
  };

  const openEditTemplate = (t?: DeliverableTemplate) => {
    if (t) {
      setEditingTemplate(t);
      setEditForm({ name: t.name, slug: t.slug, description: t.description || '', category: t.category, icon: t.icon, color: t.color });
    } else {
      setEditingTemplate(null);
      setEditForm({ name: '', slug: '', description: '', category: 'client', icon: 'ClipboardList', color: '#3e8692' });
    }
    setEditDialogOpen(true);
  };

  const handleSaveTemplate = async () => {
    try {
      if (editingTemplate) {
        await DeliverableService.updateTemplate(editingTemplate.id, editForm);
        toast({ title: 'Template updated' });
      } else {
        await DeliverableService.createTemplate({ ...editForm, created_by: user?.id } as any);
        toast({ title: 'Template created' });
      }
      setEditDialogOpen(false);
      await loadTemplates();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Delete this template and all its steps?')) return;
    try {
      await DeliverableService.deleteTemplate(id);
      toast({ title: 'Template deleted' });
      await loadTemplates();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const openEditStep = (templateId: string, step?: DeliverableTemplateStep) => {
    setStepTemplateId(templateId);
    if (step) {
      setEditingStep(step);
      const items = Array.isArray(step.checklist_items) ? step.checklist_items : [];
      setStepForm({
        step_name: step.step_name,
        description: step.description || '',
        default_role: step.default_role,
        role_label: step.role_label,
        estimated_duration_days: step.estimated_duration_days,
        task_type: step.task_type,
        is_blocking: step.is_blocking,
        checklist_items: items.join('\n'),
      });
    } else {
      setEditingStep(null);
      const existingSteps = steps[templateId] || [];
      setStepForm({
        step_name: '', description: '', default_role: '', role_label: '',
        estimated_duration_days: 1, task_type: 'Client Delivery', is_blocking: false,
        checklist_items: '',
      });
    }
    setStepDialogOpen(true);
  };

  const handleSaveStep = async () => {
    const checklistArr = stepForm.checklist_items
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    const payload = {
      ...stepForm,
      checklist_items: checklistArr,
      template_id: stepTemplateId,
      step_order: editingStep?.step_order ?? ((steps[stepTemplateId]?.length || 0) + 1),
    };

    try {
      if (editingStep) {
        await DeliverableService.updateStep(editingStep.id, payload as any);
        toast({ title: 'Step updated' });
      } else {
        await DeliverableService.createStep(payload as any);
        toast({ title: 'Step added' });
      }
      setStepDialogOpen(false);
      // Reload steps
      const data = await DeliverableService.getTemplateWithSteps(stepTemplateId);
      if (data) setSteps(prev => ({ ...prev, [stepTemplateId]: data.steps }));
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleDeleteStep = async (stepId: string, templateId: string) => {
    if (!confirm('Delete this step?')) return;
    try {
      await DeliverableService.deleteStep(stepId);
      toast({ title: 'Step deleted' });
      const data = await DeliverableService.getTemplateWithSteps(templateId);
      if (data) setSteps(prev => ({ ...prev, [templateId]: data.steps }));
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="w-full bg-white border border-gray-200 shadow-sm p-6">
        <div className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gray-100 p-2 rounded-lg">
              <Settings className="h-6 w-6 text-gray-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Deliverable Templates</h2>
              <p className="text-sm text-gray-500">Manage workflow templates and their steps</p>
            </div>
          </div>
          <Button
            className="hover:opacity-90"
            style={{ backgroundColor: '#3e8692', color: 'white' }}
            onClick={() => openEditTemplate()}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </div>
      </div>

      {/* Templates list */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : (
        <div className="space-y-2">
          {templates.map(t => {
            const Icon = ICON_MAP[t.icon] || ClipboardList;
            const isExpanded = expandedId === t.id;
            const templateSteps = steps[t.id] || [];

            return (
              <div key={t.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                {/* Template header */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleExpand(t.id)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                    <div className="p-1.5 rounded-md" style={{ backgroundColor: t.color + '15' }}>
                      <Icon className="h-4 w-4" style={{ color: t.color }} />
                    </div>
                    <div>
                      <div className="font-medium text-sm">{t.name}</div>
                      <div className="text-xs text-gray-400">{t.description}</div>
                    </div>
                    <Badge variant="outline" className="text-[10px] ml-2 capitalize">{t.category}</Badge>
                  </div>
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditTemplate(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={() => handleDeleteTemplate(t.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Steps accordion */}
                {isExpanded && (
                  <div className="border-t bg-gray-50 p-4">
                    {templateSteps.length === 0 ? (
                      <div className="text-xs text-gray-400 text-center py-2">No steps defined</div>
                    ) : (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(event) => handleStepDragEnd(event, t.id)}
                      >
                        <SortableContext items={templateSteps.map(s => s.id)} strategy={verticalListSortingStrategy}>
                          <div className="space-y-1">
                            {templateSteps.map(s => (
                              <SortableStepRow
                                key={s.id}
                                step={s}
                                onEdit={() => openEditStep(t.id, s)}
                                onDelete={() => handleDeleteStep(s.id, t.id)}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 text-xs"
                      onClick={() => openEditStep(t.id)}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add Step
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Template Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Template' : 'New Template'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input className="auth-input" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Slug</Label>
              <Input className="auth-input" value={editForm.slug} onChange={e => setEditForm(f => ({ ...f, slug: e.target.value }))} placeholder="unique-slug" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input className="auth-input" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Select value={editForm.category} onValueChange={v => setEditForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="auth-input"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Icon</Label>
                <Select value={editForm.icon} onValueChange={v => setEditForm(f => ({ ...f, icon: v }))}>
                  <SelectTrigger className="auth-input"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Color</Label>
              <Input type="color" className="h-9 w-20" value={editForm.color} onChange={e => setEditForm(f => ({ ...f, color: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button size="sm" style={{ backgroundColor: '#3e8692', color: 'white' }} onClick={handleSaveTemplate}>
              {editingTemplate ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step Edit Dialog */}
      <Dialog open={stepDialogOpen} onOpenChange={setStepDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingStep ? 'Edit Step' : 'Add Step'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Step Name</Label>
              <Input className="auth-input" value={stepForm.step_name} onChange={e => setStepForm(f => ({ ...f, step_name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input className="auth-input" value={stepForm.description} onChange={e => setStepForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Role Key</Label>
                <Input className="auth-input" value={stepForm.default_role} onChange={e => setStepForm(f => ({ ...f, default_role: e.target.value }))} placeholder="e.g. translator" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Role Label</Label>
                <Input className="auth-input" value={stepForm.role_label} onChange={e => setStepForm(f => ({ ...f, role_label: e.target.value }))} placeholder="e.g. Translator" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Duration (days)</Label>
                <Input type="number" min={1} className="auth-input" value={stepForm.estimated_duration_days} onChange={e => setStepForm(f => ({ ...f, estimated_duration_days: parseInt(e.target.value) || 1 }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Task Type</Label>
                <Input className="auth-input" value={stepForm.task_type} onChange={e => setStepForm(f => ({ ...f, task_type: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_blocking" checked={stepForm.is_blocking} onChange={e => setStepForm(f => ({ ...f, is_blocking: e.target.checked }))} />
              <Label htmlFor="is_blocking" className="text-xs">Blocking step</Label>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Checklist Items (one per line)</Label>
              <textarea
                className="auth-input w-full border rounded-md p-2 text-sm min-h-[80px]"
                value={stepForm.checklist_items}
                onChange={e => setStepForm(f => ({ ...f, checklist_items: e.target.value }))}
                placeholder="Check item 1&#10;Check item 2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setStepDialogOpen(false)}>Cancel</Button>
            <Button size="sm" style={{ backgroundColor: '#3e8692', color: 'white' }} onClick={handleSaveStep}>
              {editingStep ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
