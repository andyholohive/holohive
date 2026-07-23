'use client';

/**
 * Deliverable Templates tab — formerly /tasks/deliverables/templates
 * (admin-only page). Multi-step workflow templates with role
 * assignments + checklists + DnD step reordering. Moved here on
 * 2026-06-03 when the three "Templates" sidebar entries were
 * consolidated into one Templates page with three tabs. The outer
 * shell handles the admin gate.
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { CardHeaderEditorial } from '@/components/ui/card-header-editorial';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { CustomColorPicker } from '@/components/ui/custom-color-picker';
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

// kebab-case slug from a free-text name. Used as a fallback when the
// user doesn't type a custom slug — see handleSaveTemplate below.
// Mirrors the slug shape that the existing six 2026-06-05 templates
// landed with (`client-onboarding-week-0`, `kol-brief-cycle`, etc.).
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')   // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')                          // non-alnum → hyphen
    .replace(/^-+|-+$/g, '')                              // trim leading/trailing
    .slice(0, 60);                                        // safety cap
}

// v11 preset palette for the Color picker — anchored on the same
// tones the rest of the app uses (brand teal, the 8 StatusBadge
// accent tones, plus a few neutrals). The CustomColorPicker behind
// "Custom…" is the escape hatch for anything outside this set.
const PRESET_COLORS = [
  '#3E8692', // brand teal
  '#10B981', // emerald
  '#0EA5E9', // sky
  '#A855F7', // purple
  '#F59E0B', // amber
  '#F43F5E', // rose
  '#EC4899', // pink
  '#64748B', // slate
  '#84CC16', // lime
  '#06B6D4', // cyan
  '#F97316', // orange
  '#1F2937', // ink-warm-900-ish
];

function SortableStepRow({ step, onEdit, onDelete }: { step: DeliverableTemplateStep; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center justify-between bg-white rounded px-3 py-2 border border-cream-100">
      <div className="flex items-center gap-2">
        <button type="button" {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing" aria-label="Drag handle">
          <GripVertical className="h-3.5 w-3.5 text-ink-warm-300" />
        </button>
        <span className="text-xs font-medium text-ink-warm-500 w-5">{step.step_order}.</span>
        <span className="text-sm">{step.step_name}</span>
        <Badge variant="outline" className="text-[10px]">{step.role_label}</Badge>
        <span className="text-[10px] text-ink-warm-400" title={`Due day ${step.day_offset ?? 0} of the cycle`}>
          {(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][step.day_offset ?? 0]) ?? `+${step.day_offset ?? 0}d`}
        </span>
        {step.is_blocking && <Badge className="text-[10px] bg-amber-100 text-amber-700 border-0 hover:bg-amber-100">Blocking</Badge>}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onEdit} aria-label="Edit step">
          <Pencil className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onDelete} aria-label="Delete step">
          <Trash2 className="h-3 w-3 text-rose-500" />
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

export default function DeliverableTemplatesTab() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [templates, setTemplates] = useState<DeliverableTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [steps, setSteps] = useState<Record<string, DeliverableTemplateStep[]>>({});

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DeliverableTemplate | null>(null);
  const [editForm, setEditForm] = useState({ name: '', slug: '', description: '', category: 'client', icon: 'ClipboardList', color: '#3e8692' });

  const [stepDialogOpen, setStepDialogOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<DeliverableTemplateStep | null>(null);

  // v11 destructive-confirm state — replaces the native confirm() calls
  // that used to live in handleDeleteTemplate / handleDeleteStep. The
  // *Pending entries hold the row(s) to delete on user confirm; null
  // means the dialog is closed. 2026-06-05.
  const [deleteTemplatePending, setDeleteTemplatePending] = useState<DeliverableTemplate | null>(null);
  const [deleteStepPending, setDeleteStepPending] = useState<{ step: DeliverableTemplateStep; templateId: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Custom color picker dialog state. Triggered from the Color popover
  // when the user wants something off-palette. 2026-06-05.
  const [customColorOpen, setCustomColorOpen] = useState(false);
  const [stepForm, setStepForm] = useState({
    step_name: '', description: '', default_role: '', role_label: '',
    estimated_duration_days: 1, day_offset: 0, task_type: 'Client Delivery', is_blocking: false,
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
    } catch (err) {
      toast({ title: 'Load failed', description: err instanceof Error ? err.message : 'Failed to load templates', variant: 'destructive' });
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
    const updated = reordered.map((s, i) => ({ ...s, step_order: i + 1 }));
    setSteps(prev => ({ ...prev, [templateId]: updated }));

    try {
      await Promise.all(updated.map(s => DeliverableService.updateStep(s.id, { step_order: s.step_order } as any)));
      toast({ title: 'Steps reordered' });
    } catch (err) {
      toast({ title: 'Reorder failed', description: err instanceof Error ? err.message : 'Failed to reorder steps', variant: 'destructive' });
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
      // Auto-generate slug from name when the user leaves the field
      // empty. This matches the pattern Andy wanted: the slug field
      // is optional, and we fall back to a kebab-case version of the
      // name. Trim first so a slug of pure whitespace doesn't sneak
      // through. 2026-06-05.
      const trimmedSlug = (editForm.slug || '').trim();
      const finalSlug = trimmedSlug || slugify(editForm.name);
      const payload = { ...editForm, slug: finalSlug };

      if (editingTemplate) {
        // `as any` matches the pattern used on createTemplate below —
        // editForm's `category`/`icon` are typed `string` while
        // updateTemplate wants stricter unions. Pre-existing in the
        // original /tasks/deliverables/templates page; carried over
        // unchanged in the 2026-06-03 consolidation.
        await DeliverableService.updateTemplate(editingTemplate.id, payload as any);
        toast({ title: 'Template updated' });
      } else {
        await DeliverableService.createTemplate({ ...payload, created_by: user?.id } as any);
        toast({ title: 'Template created' });
      }
      setEditDialogOpen(false);
      await loadTemplates();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    }
  };

  // Stages the template for delete; the actual deletion fires from
  // the v11 destructive Dialog below on user confirm. 2026-06-05.
  const handleDeleteTemplate = (template: DeliverableTemplate) => {
    setDeleteTemplatePending(template);
  };

  const confirmDeleteTemplate = async () => {
    if (!deleteTemplatePending) return;
    setDeleting(true);
    try {
      const { archived } = await DeliverableService.deleteTemplate(deleteTemplatePending.id);
      toast(
        archived
          ? {
              title: 'Template archived',
              description: `"${deleteTemplatePending.name}" has past deliverables, so it was archived (hidden) instead of deleted to keep that history intact. It will no longer spawn recurring work.`,
            }
          : {
              title: 'Template deleted',
              description: `"${deleteTemplatePending.name}" and its steps are gone.`,
            },
      );
      setDeleteTemplatePending(null);
      await loadTemplates();
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const openEditStep =(templateId: string, step?: DeliverableTemplateStep) => {
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
        day_offset: step.day_offset ?? 0,
        task_type: step.task_type,
        is_blocking: step.is_blocking,
        checklist_items: items.join('\n'),
      });
    } else {
      setEditingStep(null);
      setStepForm({
        step_name: '', description: '', default_role: '', role_label: '',
        estimated_duration_days: 1, day_offset: 0, task_type: 'Client Delivery', is_blocking: false,
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
      const data = await DeliverableService.getTemplateWithSteps(stepTemplateId);
      if (data) setSteps(prev => ({ ...prev, [stepTemplateId]: data.steps }));
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    }
  };

  // Stages the step for delete; the actual deletion fires from the
  // v11 destructive Dialog below on user confirm. 2026-06-05.
  const handleDeleteStep = (step: DeliverableTemplateStep, templateId: string) => {
    setDeleteStepPending({ step, templateId });
  };

  const confirmDeleteStep = async () => {
    if (!deleteStepPending) return;
    const { step, templateId } = deleteStepPending;
    setDeleting(true);
    try {
      await DeliverableService.deleteStep(step.id);
      toast({
        title: 'Step deleted',
        description: `"${step.step_name}" removed.`,
      });
      setDeleteStepPending(null);
      const data = await DeliverableService.getTemplateWithSteps(templateId);
      if (data) setSteps(prev => ({ ...prev, [templateId]: data.steps }));
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  // Header toolbar — shared between loading + loaded so the row
  // doesn't shift on data arrival.
  const headerToolbar = (loadingState: boolean) => (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <p className="text-sm text-ink-warm-500">
        Multi-step workflow templates with roles, durations, and blocking dependencies. Drag step rows to reorder.
      </p>
      <Button variant="brand" onClick={() => openEditTemplate()} disabled={loadingState}>
        <Plus className="h-4 w-4 mr-2" />
        New Template
      </Button>
    </div>
  );

  // ── Loading branch ────────────────────────────────────────────────
  // Structural skeleton mirroring loaded shape: toolbar + Card with
  // editorial header + 3 row skeletons. Was a centered "Loading..."
  // text before, which gave no hint of the actual list density.
  if (loading) {
    return (
      <div className="space-y-4">
        {headerToolbar(true)}
        <Card className="border-cream-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-cream-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-[18px] w-[18px] rounded" />
              <Skeleton className="h-5 w-40" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
          <div>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3 border-b border-cream-100 last:border-0">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-7 w-7 rounded-md" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-72" />
                </div>
                <Skeleton className="h-5 w-16 rounded" />
                <Skeleton className="h-7 w-7 rounded-md" />
                <Skeleton className="h-7 w-7 rounded-md" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {headerToolbar(false)}

      {/* Templates list — wrapped in a single Card +
          CardHeaderEditorial to match TaskTemplatesTab. Each template
          is a row with an inline expandable steps panel. */}
      <Card className="border-cream-200 overflow-hidden">
        <CardHeaderEditorial
          icon={Plus}
          title="Deliverable Templates"
          action={
            <span className="text-sm text-ink-warm-700 tabular-nums">
              <span className="font-semibold text-ink-warm-900">{templates.length}</span>
              <span className="text-ink-warm-500 ml-1">template{templates.length === 1 ? '' : 's'}</span>
            </span>
          }
        />

        {templates.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No deliverable templates yet."
            description="Create one above to define a multi-step workflow with roles + duration estimates."
            className="py-12"
          />
        ) : (
          <div className="divide-y divide-cream-100">
            {templates.map(t => {
              const Icon = ICON_MAP[t.icon] || ClipboardList;
              const isExpanded = expandedId === t.id;
              const templateSteps = steps[t.id] || [];

              return (
                <div key={t.id}>
                  {/* Template header row */}
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-cream-50/60 transition-colors"
                    onClick={() => toggleExpand(t.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-ink-warm-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-ink-warm-400 shrink-0" />}
                      <div className="p-1.5 rounded-md shrink-0" style={{ backgroundColor: t.color + '15' }}>
                        <Icon className="h-4 w-4" style={{ color: t.color }} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-ink-warm-900 truncate">{t.name}</div>
                        {t.description && (
                          <div className="text-xs text-ink-warm-400 truncate">{t.description}</div>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px] ml-2 capitalize shrink-0">{t.category}</Badge>
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditTemplate(t)} aria-label="Edit template">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-rose-50" onClick={() => handleDeleteTemplate(t)} aria-label="Delete template">
                        <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded steps panel */}
                  {isExpanded && (
                    <div className="border-t border-cream-100 bg-cream-50 p-4">
                      {templateSteps.length === 0 ? (
                        <div className="text-xs text-ink-warm-400 text-center py-2">No steps defined</div>
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
                                  onDelete={() => handleDeleteStep(s, t.id)}
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
      </Card>

      {/* Template Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Template' : 'New Template'}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-1 py-2 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input className="focus-brand" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Slug <span className="text-ink-warm-400 font-normal">(optional)</span></Label>
              <Input
                className="focus-brand"
                value={editForm.slug}
                onChange={e => setEditForm(f => ({ ...f, slug: e.target.value }))}
                placeholder={editForm.name ? slugify(editForm.name) || 'auto-generated-on-save' : 'auto-generated-on-save'}
              />
              <p className="text-[11px] text-ink-warm-500">
                Leave blank and we&apos;ll generate one from the name (e.g. <code className="bg-cream-100 px-1 rounded font-mono">{editForm.name ? (slugify(editForm.name) || 'my-template') : 'my-template'}</code>).
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input className="focus-brand" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Select value={editForm.category} onValueChange={v => setEditForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="focus-brand"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Icon</Label>
                {/* Icon picker — renders the actual lucide icon next to
                    its name in both the trigger and the dropdown
                    options. Was a name-only `<SelectItem>i</SelectItem>`
                    that just showed strings like "ClipboardList". The
                    trigger preview uses the brand color so the picked
                    icon matches what the user sees on the template
                    card. 2026-06-05. */}
                <Select value={editForm.icon} onValueChange={v => setEditForm(f => ({ ...f, icon: v }))}>
                  <SelectTrigger className="focus-brand">
                    <SelectValue>
                      {(() => {
                        const Picked = ICON_MAP[editForm.icon] || ClipboardList;
                        return (
                          <span className="inline-flex items-center gap-2">
                            <Picked className="h-4 w-4 text-brand" />
                            <span className="text-sm">{editForm.icon}</span>
                          </span>
                        );
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map(name => {
                      const Icon = ICON_MAP[name] || ClipboardList;
                      return (
                        <SelectItem key={name} value={name}>
                          <span className="inline-flex items-center gap-2">
                            <Icon className="h-4 w-4 text-ink-warm-700" />
                            <span className="text-sm">{name}</span>
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Color</Label>
              {/* v11 color picker — preset swatches in a Popover with
                  an inline "Custom…" escape hatch that opens the full
                  CustomColorPicker (HSL grid + hue slider + hex input).
                  Was a raw `<Input type="color">` which surfaced the
                  unstyled browser native picker. 2026-06-05. */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 w-full justify-start gap-2 focus-brand"
                  >
                    <span
                      className="w-5 h-5 rounded border border-cream-300 shrink-0"
                      style={{ backgroundColor: editForm.color }}
                      aria-hidden
                    />
                    <span className="font-mono text-xs text-ink-warm-700">{(editForm.color || '#000000').toUpperCase()}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-72 p-3 bg-white border-cream-200"
                  align="start"
                >
                  <div className="space-y-3">
                    <div>
                      <Label className="text-[10px] mono uppercase tracking-[0.18em] text-ink-warm-500">Presets</Label>
                      <div className="grid grid-cols-6 gap-2 mt-1.5">
                        {PRESET_COLORS.map(c => {
                          const isActive = (editForm.color || '').toUpperCase() === c.toUpperCase();
                          return (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setEditForm(f => ({ ...f, color: c }))}
                              className={`h-8 w-full rounded transition-all ${isActive ? 'ring-2 ring-brand ring-offset-1' : 'border border-cream-200 hover:scale-110'}`}
                              style={{ backgroundColor: c }}
                              aria-label={`Use ${c}`}
                              title={c}
                            />
                          );
                        })}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] mono uppercase tracking-[0.18em] text-ink-warm-500">Hex</Label>
                      <Input
                        value={editForm.color}
                        onChange={e => setEditForm(f => ({ ...f, color: e.target.value }))}
                        className="focus-brand h-8 text-xs font-mono"
                        placeholder="#3E8692"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setCustomColorOpen(true)}
                    >
                      Custom Color Picker…
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button variant="brand" size="sm" onClick={handleSaveTemplate}>
              {editingTemplate ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step Edit Dialog */}
      <Dialog open={stepDialogOpen} onOpenChange={setStepDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingStep ? 'Edit Step' : 'Add Step'}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-1 py-2 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Step Name</Label>
              <Input className="focus-brand" value={stepForm.step_name} onChange={e => setStepForm(f => ({ ...f, step_name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input className="focus-brand" value={stepForm.description} onChange={e => setStepForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Role Key</Label>
                <Input className="focus-brand" value={stepForm.default_role} onChange={e => setStepForm(f => ({ ...f, default_role: e.target.value }))} placeholder="e.g. translator" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Role Label</Label>
                <Input className="focus-brand" value={stepForm.role_label} onChange={e => setStepForm(f => ({ ...f, role_label: e.target.value }))} placeholder="e.g. Translator" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Due day</Label>
                <Select
                  value={String(stepForm.day_offset)}
                  onValueChange={(v) => setStepForm(f => ({ ...f, day_offset: parseInt(v) || 0 }))}
                >
                  <SelectTrigger className="h-9 focus-brand">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
                      <SelectItem key={i} value={String(i)}>{d}{i === 0 ? ' (cycle start)' : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-ink-warm-400">Which day of the cycle this task is due. Multiple steps can share a day.</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Task Type</Label>
                <Input className="focus-brand" value={stepForm.task_type} onChange={e => setStepForm(f => ({ ...f, task_type: e.target.value }))} />
              </div>
            </div>
            {/* v11 Switch (was a raw HTML checkbox). Matches every
                other toggle in the app — /admin/changelog Publish
                switch, /reminders Active toggle, etc. 2026-06-05. */}
            <div className="flex items-center justify-between gap-2 border border-cream-200 rounded-md p-3">
              <div className="flex flex-col">
                <Label htmlFor="is_blocking" className="text-sm cursor-pointer">Blocking step</Label>
                <span className="text-[11px] text-ink-warm-500">Downstream steps can&apos;t start until this one&apos;s done.</span>
              </div>
              <Switch
                id="is_blocking"
                checked={stepForm.is_blocking}
                onCheckedChange={(checked) => setStepForm(f => ({ ...f, is_blocking: checked }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Checklist Items (one per line)</Label>
              <textarea
                className="focus-brand w-full border rounded-md p-2 text-sm min-h-[80px]"
                value={stepForm.checklist_items}
                onChange={e => setStepForm(f => ({ ...f, checklist_items: e.target.value }))}
                placeholder="Check item 1&#10;Check item 2"
              />
            </div>
          </div>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" size="sm" onClick={() => setStepDialogOpen(false)}>Cancel</Button>
            <Button variant="brand" size="sm" onClick={handleSaveStep}>
              {editingStep ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete template confirm — v11 destructive Dialog replacing
          the native confirm() that used to live in
          handleDeleteTemplate. Icon + Title Case header, bolded
          subject in the description, variant="destructive" primary
          + disabled state during the in-flight delete. 2026-06-05. */}
      <Dialog open={!!deleteTemplatePending} onOpenChange={(open) => { if (!open) setDeleteTemplatePending(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Trash2 className="h-4 w-4 text-rose-500" />
              Delete Template?
            </DialogTitle>
            <DialogDescription className="text-sm text-ink-warm-700 pt-2">
              <strong>{deleteTemplatePending?.name ?? ''}</strong> and all its steps will be permanently deleted. Deliverables already spawned from this template are not affected. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setDeleteTemplatePending(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteTemplate} disabled={deleting}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete step confirm — same pattern as Delete Template. */}
      <Dialog open={!!deleteStepPending} onOpenChange={(open) => { if (!open) setDeleteStepPending(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Trash2 className="h-4 w-4 text-rose-500" />
              Delete Step?
            </DialogTitle>
            <DialogDescription className="text-sm text-ink-warm-700 pt-2">
              <strong>{deleteStepPending?.step.step_name ?? ''}</strong> will be permanently removed from this template. Existing tasks already spawned from this step are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setDeleteStepPending(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteStep} disabled={deleting}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom color picker — the off-palette escape hatch behind
          the "Custom Color Picker…" button in the template editor's
          Color popover. CustomColorPicker is self-contained
          modal-style content; we wrap it in a Dialog so it stacks
          cleanly above the template editor (the depth-aware overlay
          shipped in `components/ui/dialog.tsx` keeps the backdrop
          from doubling). 2026-06-05. */}
      <Dialog open={customColorOpen} onOpenChange={setCustomColorOpen}>
        <DialogContent className="sm:max-w-md">
          <CustomColorPicker
            isOpen={customColorOpen}
            onClose={() => setCustomColorOpen(false)}
            onApply={(color) => {
              setEditForm(f => ({ ...f, color }));
              setCustomColorOpen(false);
            }}
            initialColor={editForm.color || '#3E8692'}
            presetColors={PRESET_COLORS}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
