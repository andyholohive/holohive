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
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Switch } from '@/components/ui/switch';
import { CustomColorPicker } from '@/components/ui/custom-color-picker';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  DeliverableService,
  DeliverableTemplate,
  DeliverableTemplateStep,
  resolveStepOwner,
} from '@/lib/deliverableService';
import { TASK_TYPES } from '@/lib/taskTypes';
import { UserService } from '@/lib/userService';
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
  Check,
  ChevronsUpDown,
  Users,
  History,
  Calendar as CalendarIcon,
} from 'lucide-react';

/** Sentinel for "no one" in a Select — Radix forbids an empty-string value. */
const NO_ASSIGNEE = '__none__';

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

// Role keys are snake_case by convention (`client_lead`, `campaign_ops`).
// slugify() above produces hyphens, which is right for template slugs and
// wrong here — `Client Lead` must normalize to the SAME key an earlier step
// already used, or assignment stops matching. Applied only to keys the user
// types fresh; picking an existing key never re-slugs it. [2026-08-06]
function roleKeySlug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/**
 * The key a given role label should carry.
 *
 * Reusing the label's EXISTING key matters more than generating a tidy one:
 * assignment resolves by exact key, so re-slugging a known label is how a
 * role silently forks. "Client Lead + Dev" slugs to `client_lead_dev`, which
 * would stop matching the `client_lead` its 20 sibling steps use — the exact
 * drift this change exists to stop. Only genuinely new labels get slugged.
 */
function deriveRoleKey(
  label: string,
  vocab: Array<{ key: string; label: string }>,
): string {
  const trimmed = label.trim();
  if (!trimmed) return '';
  const known = vocab.find(r => r.label.toLowerCase() === trimmed.toLowerCase());
  return known ? known.key : roleKeySlug(trimmed);
}

/**
 * Pick-or-type field, modelled on the affiliate picker in
 * components/crm/sales-pipeline/dialogs/CreateEditOpportunityDialog.tsx —
 * same Popover + Command shape, same "Add …" row under an empty search.
 *
 * Used for both Role Key and Role Label. The options are whatever the
 * existing templates already use, so the common case is one click and the
 * typo path takes deliberate effort. Free text still gets through — new
 * roles are legitimate — it just isn't the default anymore.
 */
function RoleCombobox({
  value, onChange, options, placeholder, emptyHint, transform, renderMeta,
}: {
  value: string;
  onChange: (next: string) => void;
  options: Array<{ value: string; meta?: string }>;
  placeholder: string;
  emptyHint: string;
  /** Normalizer applied to typed-in values only (snake_case for keys). */
  transform?: (raw: string) => string;
  renderMeta?: (meta?: string) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const typed = transform ? transform(search) : search.trim();
  const isNew = !!typed && !options.some(o => o.value.toLowerCase() === typed.toLowerCase());

  const commit = (next: string) => {
    onChange(next);
    setSearch('');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(''); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className="h-9 w-full justify-between font-normal focus-brand"
        >
          <span className={value ? 'truncate' : 'truncate text-ink-warm-400'}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0 !bg-white border-cream-200 z-[90]" align="start">
        <Command>
          <CommandInput placeholder={emptyHint} value={search} onValueChange={setSearch} />
          <CommandList>
            {/* CommandEmpty only renders when nothing matches; the same
                "Add" row is repeated in a CommandGroup below so you can
                still create a value that happens to be a substring of an
                existing one (e.g. "writer" while "comms_writer" matches). */}
            <CommandEmpty className="p-0">
              {typed ? (
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-cream-50 flex items-center gap-2"
                  onClick={() => commit(typed)}
                >
                  <Plus className="h-3.5 w-3.5 text-brand shrink-0" />
                  <span>Use &quot;<strong>{typed}</strong>&quot;</span>
                </button>
              ) : (
                <p className="px-3 py-3 text-xs text-ink-warm-400">Type to add a new one.</p>
              )}
            </CommandEmpty>
            <CommandGroup>
              {options.map(o => (
                <CommandItem key={o.value} value={o.value} onSelect={() => commit(o.value)}>
                  <Check className={`mr-2 h-3.5 w-3.5 shrink-0 ${value === o.value ? 'opacity-100' : 'opacity-0'}`} />
                  <span className="truncate">{o.value}</span>
                  {renderMeta?.(o.meta)}
                </CommandItem>
              ))}
            </CommandGroup>
            {isNew && (
              <CommandGroup className="border-t border-cream-100">
                <CommandItem value={`__create__${typed}`} onSelect={() => commit(typed)}>
                  <Plus className="mr-2 h-3.5 w-3.5 text-brand shrink-0" />
                  <span>Use &quot;<strong>{typed}</strong>&quot;</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
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

/**
 * Cycle grid for a step's day offset. [2026-08-06 per Andy]
 *
 * NOT a real calendar — there are no real dates here, because a template has
 * no start date until it runs. This is a schematic laid out Mon–Sun with
 * Day 0 pinned to Monday, purely so you can see the shape of the run: which
 * days cluster, what lands on a weekend, where the gaps are. Labelled as
 * illustrative in the UI so nobody reads a delivery date off it.
 *
 * Clicking a cell sets the offset. The template's other steps are marked so a
 * new step can be placed relative to them rather than by counting in your head.
 */
function CycleDayGrid({ dayOffset, onPick, siblings }: {
  dayOffset: number;
  onPick: (offset: number) => void;
  siblings: Array<{ name: string; dayOffset: number }>;
}) {
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const siblingDays = new Set(siblings.map(s => s.dayOffset));

  // Render whole weeks: enough to cover the run, plus one spare week so a step
  // can always be pushed later without the grid running out of room.
  const furthest = Math.max(dayOffset, ...siblings.map(s => s.dayOffset), 0);
  const weeks = Math.floor(furthest / 7) + 2;
  const days = Array.from({ length: weeks * 7 }).map((_, i) => i);

  const label = (n: number) => `${DOW[n % 7]}, week ${Math.floor(n / 7) + 1}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-9 font-normal focus-brand">
          <CalendarIcon className="h-3.5 w-3.5 mr-1.5 text-ink-warm-400" />
          {label(dayOffset)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
        <div className="px-3 pt-3 pb-2 border-b border-cream-100">
          <p className="text-xs font-medium text-ink-warm-900">Day {dayOffset} — {label(dayOffset)}</p>
          <p className="text-[10px] text-ink-warm-400 mt-0.5">
            Click a day to set the offset. Teal dots are the template&rsquo;s other steps.
          </p>
        </div>
        <div className="p-3">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DOW.map(d => (
              <div key={d} className="text-[10px] text-ink-warm-400 text-center w-9">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map(n => {
              const isSelected = n === dayOffset;
              const isSibling = siblingDays.has(n);
              const isWeekend = n % 7 >= 5;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => onPick(n)}
                  title={`Day ${n} — ${label(n)}`}
                  className={[
                    'h-9 w-9 rounded-md text-xs tabular-nums transition-colors relative',
                    isSelected
                      ? 'bg-brand text-white font-semibold'
                      : isWeekend
                        ? 'bg-cream-100 text-ink-warm-400 hover:bg-cream-200'
                        : 'text-ink-warm-700 hover:bg-cream-100',
                  ].join(' ')}
                >
                  {n}
                  {isSibling && !isSelected && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-brand" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="px-3 py-2 border-t border-cream-100">
          <p className="text-[10px] text-ink-warm-400">
            <span className="text-ink-warm-500 font-medium">Illustrative only.</span> Day 0 is drawn
            on a Monday so the week shape is readable — the real weekday depends on when the
            template is actually run.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SortableStepRow({ step, ownerName, isOverride, onEdit, onDelete }: {
  step: DeliverableTemplateStep;
  /** Resolved owner (step override, else the template's role default). */
  ownerName: string | null;
  /** True when the step names someone directly, rather than following its role. */
  isOverride: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
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
        {/* 28 steps carry no role at all; an empty outline badge just reads
            as a rendering glitch, so show nothing instead. */}
        {step.role_label ? <Badge variant="outline" className="text-[10px]">{step.role_label}</Badge> : null}
        {/* [2026-08-06 per Andy] Was a Mon–Sun weekday name, which only held
            for the handful of templates that start on a Monday and stay
            inside one week — 40 of 121 steps run past day 6 (Client
            Onboarding reaches day 38) and fell through to a bare "+38d".
            day_offset is days-from-run-start, so say that. */}
        <span
          className="text-[10px] text-ink-warm-400"
          title={`Due ${step.day_offset ?? 0} day${(step.day_offset ?? 0) === 1 ? '' : 's'} after the run starts`}
        >
          Day {step.day_offset ?? 0}
        </span>
        {step.is_blocking && <Badge className="text-[10px] bg-amber-100 text-amber-700 border-0 hover:bg-amber-100">Blocking</Badge>}
        {/* Who this lands on. The dot marks a step-level override so you can
            see at a glance which steps don't follow their role. */}
        {ownerName && (
          <span
            className="inline-flex items-center gap-1 text-[10px] text-ink-warm-500"
            title={isOverride ? 'Set on this step, overriding the role' : 'From the role’s default owner'}
          >
            {isOverride && <span className="h-1 w-1 rounded-full bg-brand" aria-hidden />}
            {ownerName}
          </span>
        )}
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
  // Role keys + labels already in use, usage-first. Feeds both pickers in
  // the step dialog so the vocabulary stays self-reinforcing rather than
  // re-invented per step. [2026-08-06]
  const [roleVocab, setRoleVocab] = useState<Array<{ key: string; label: string; uses: number }>>([]);
  // Active users only — a picker that lists people who can't log in produces
  // assignments nobody ever sees.
  const [team, setTeam] = useState<Array<{ id: string; name: string }>>([]);
  // Role -> person, global across every template. [2026-08-06 per Andy]
  const [roleOwners, setRoleOwners] = useState<Record<string, string>>({});
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [roleDraft, setRoleDraft] = useState<Record<string, string>>({});
  const [savingRoles, setSavingRoles] = useState(false);
  // Who's actually been doing each role in past runs — the "Use history" source.
  const [roleHistory, setRoleHistory] = useState<Record<string, Array<{ userId: string; times: number }>>>({});
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
    checklist_items: '', default_assignee_id: '' as string,
  });
  const [stepTemplateId, setStepTemplateId] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => { loadTemplates(); void loadRoleVocab(); void loadTeam(); void loadRoleOwners(); }, []);

  const loadTeam = async () => {
    try {
      const users = await UserService.getActiveUsers();
      setTeam(users.map((u: any) => ({ id: u.id, name: u.name || u.email })));
    } catch {
      setTeam([]);
    }
  };

  const nameOf = (userId: string | null | undefined) =>
    userId ? (team.find(m => m.id === userId)?.name ?? 'Unknown user') : null;

  const loadRoleOwners = async () => {
    try {
      setRoleOwners(await DeliverableService.getRoleOwners());
    } catch {
      setRoleOwners({});
    }
  };

  const openRoleDialog = async () => {
    setRoleDraft({ ...roleOwners });
    setRoleDialogOpen(true);
    // History only matters while the dialog is open, so fetch it here rather
    // than on every page load.
    try {
      setRoleHistory(await DeliverableService.getRoleAssignmentHistory());
    } catch {
      setRoleHistory({});
    }
  };

  /** Fill blanks from what past runs actually did. Never overwrites a choice
   *  already made in the dialog — a suggestion shouldn't undo a decision. */
  const applyHistorySuggestions = () => {
    setRoleDraft(prev => {
      const next = { ...prev };
      let filled = 0;
      for (const r of roleVocab) {
        if (next[r.key]) continue;
        const top = roleHistory[r.key]?.[0];
        // Only suggest people still on the team; a departed teammate's history
        // is real but useless as a default.
        if (top && team.some(m => m.id === top.userId)) { next[r.key] = top.userId; filled += 1; }
      }
      toast(filled
        ? { title: `Filled ${filled} role${filled === 1 ? '' : 's'}`, description: 'From who has done them most often. Review before saving.' }
        : { title: 'Nothing to fill', description: 'Every role with history is already set.' });
      return next;
    });
  };

  const saveRoleOwners = async () => {
    setSavingRoles(true);
    try {
      const clean = Object.fromEntries(
        Object.entries(roleDraft).filter(([, v]) => !!v),
      ) as Record<string, string>;
      await DeliverableService.setRoleOwners(clean, user?.id ?? null);
      toast({
        title: 'Role owners saved',
        description: 'Every template using these roles now starts pre-assigned.',
      });
      setRoleDialogOpen(false);
      await loadRoleOwners();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setSavingRoles(false);
    }
  };

  // Labels for the picker, deduped and usage-summed. Two keys can share a
  // label (they don't today, but nothing prevents it), so collapse on the
  // label and add their counts rather than showing the same name twice.
  const labelOptions = (() => {
    const byLabel = new Map<string, number>();
    for (const r of roleVocab) {
      if (!r.label) continue;
      byLabel.set(r.label, (byLabel.get(r.label) ?? 0) + r.uses);
    }
    return Array.from(byLabel.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([label, uses]) => ({ value: label, meta: String(uses) }));
  })();

  // Canonical types, plus any off-list value already in use by a loaded step,
  // plus whatever this step currently holds. Without the union, a Radix Select
  // renders blank on an unknown value ('Client SOP', 'Internal') and the next
  // save would quietly rewrite it. [2026-08-06]
  const taskTypeOptions = (() => {
    const seen = new Set<string>(TASK_TYPES);
    for (const list of Object.values(steps)) {
      for (const s of list) {
        const v = (s.task_type || '').trim();
        if (v) seen.add(v);
      }
    }
    const current = (stepForm.task_type || '').trim();
    if (current) seen.add(current);
    return Array.from(seen);
  })();

  // The other steps in the template being edited, so the calendar can show
  // where this step sits relative to the rest of the run. [2026-08-06]
  const stepDialogSiblings = (steps[stepTemplateId] ?? [])
    .filter(s => s.id !== editingStep?.id)
    .map(s => ({ name: s.step_name, dayOffset: s.day_offset ?? 0 }));

  const loadRoleVocab = async () => {
    try {
      setRoleVocab(await DeliverableService.getRoleVocabulary());
    } catch {
      // Non-fatal: the pickers still accept free text, so a failed vocab
      // fetch degrades to the old behaviour rather than blocking the dialog.
      setRoleVocab([]);
    }
  };

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
        default_assignee_id: step.default_assignee_id ?? '',
      });
    } else {
      setEditingStep(null);
      setStepForm({
        step_name: '', description: '', default_role: '', role_label: '',
        estimated_duration_days: 1, day_offset: 0, task_type: 'Client Delivery', is_blocking: false,
        checklist_items: '', default_assignee_id: '',
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
      // '' is the Select's "follow the role" state; the column is a uuid FK,
      // so it has to go to the DB as NULL or the insert blows up.
      default_assignee_id: stepForm.default_assignee_id || null,
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
      // A role coined here should be offered on the next step, not stay
      // invisible until reload — that gap is how near-duplicates start.
      void loadRoleVocab();
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
      <div className="flex items-center gap-2">
        {/* [2026-08-06 per Andy] One map for every template — comms_writer is
            the same person wherever it appears, so it's set once here rather
            than repeated per template. */}
        <Button variant="outline" onClick={() => void openRoleDialog()} disabled={loadingState}>
          <Users className="h-4 w-4 mr-2" />
          Role Owners
          {Object.keys(roleOwners).length > 0 && (
            <span className="ml-1.5 text-xs text-ink-warm-400 tabular-nums">
              {Object.keys(roleOwners).length}
            </span>
          )}
        </Button>
        <Button variant="brand" onClick={() => openEditTemplate()} disabled={loadingState}>
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </div>
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
                                  ownerName={nameOf(resolveStepOwner(s, roleOwners))}
                                  isOverride={!!s.default_assignee_id}
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
            {/* [2026-08-06 per Andy] One Role field, not two.
                Role Key was free-text with only a placeholder to go on, so
                every step invented its own — 28 blank, two capitalized ones
                that can never match, four near-duplicate pairs. Since the key
                is derivable from the label there was never a reason to ask
                for it: pick or type the human name, and the key follows.
                It's still shown (read-only) because it's what assignment
                matches on, so a silent value would be worse than a visible
                one. */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Role</Label>
                <RoleCombobox
                  value={stepForm.role_label}
                  onChange={(label) => setStepForm(f => ({
                    ...f,
                    role_label: label,
                    default_role: deriveRoleKey(label, roleVocab),
                  }))}
                  options={labelOptions}
                  placeholder="Select or add a role"
                  emptyHint="Search or type a new role…"
                  renderMeta={(uses) => (
                    <span className="ml-auto pl-2 text-[10px] tabular-nums text-ink-warm-400">
                      {uses} step{uses === '1' ? '' : 's'}
                    </span>
                  )}
                />
                <p className="text-[10px] font-mono text-ink-warm-400">
                  {stepForm.default_role
                    ? <>Key: {stepForm.default_role}</>
                    : 'No role — this step spawns unassigned by default.'}
                </p>
              </div>
              {/* [2026-08-06 per Andy] Was a free-text Input, which is how
                  'Client SOP' and 'Internal' drifted in alongside the eight
                  canonical types. Dropdown now, but the options union in
                  whatever this step already holds — picking a type shouldn't
                  be the thing that silently rewrites a legacy value. */}
              <div className="space-y-1">
                <Label className="text-xs">Task Type</Label>
                <Select
                  value={stepForm.task_type}
                  onValueChange={(v) => setStepForm(f => ({ ...f, task_type: v }))}
                >
                  <SelectTrigger className="h-9 focus-brand"><SelectValue placeholder="Select a type" /></SelectTrigger>
                  <SelectContent>
                    {taskTypeOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* [2026-08-06 per Andy] Per-step override. Default is "follow the
                role", so the common case needs no decision here — you only
                touch this for the step that doesn't fit the pattern. */}
            <div className="space-y-1">
              <Label className="text-xs">Assignee</Label>
              <Select
                value={stepForm.default_assignee_id || NO_ASSIGNEE}
                onValueChange={(v) => setStepForm(f => ({ ...f, default_assignee_id: v === NO_ASSIGNEE ? '' : v }))}
              >
                <SelectTrigger className="h-9 focus-brand"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ASSIGNEE}>
                    {(() => {
                      // [2026-08-06 per Andy] Show the role's actual owner
                      // rather than the abstract "Follow the role" — the
                      // useful fact is WHO this lands on, and the mechanism
                      // is secondary. Falls back to naming what's missing so
                      // an empty state still says where to go fix it.
                      const roleOwner = roleOwners[stepForm.default_role];
                      const who = nameOf(roleOwner);
                      if (who) return `${who} — from ${stepForm.role_label || stepForm.default_role}`;
                      if (stepForm.default_role) {
                        return `Unassigned — ${stepForm.role_label || stepForm.default_role} has no owner`;
                      }
                      return 'Unassigned — this step has no role';
                    })()}
                  </SelectItem>
                  {team.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-ink-warm-400">
                Leave as-is to follow the role. Set someone to override this step only —
                role owners live behind <span className="text-ink-warm-500">Assign</span> on the template row.
              </p>
            </div>
            {/* [2026-08-06 per Andy] Offset model. Was a Mon–Sun Select, which
                could only express days 0–6 — the 40 steps that run past a week
                (Client Onboarding reaches day 38) rendered blank and couldn't
                be edited at all. day_offset is days-from-run-start, so the
                input is a plain day number, and the calendar shows what that
                lands on for a chosen start date. */}
            <div className="space-y-1">
              <Label className="text-xs">Due day</Label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-ink-warm-500">Day</span>
                  <Input
                    type="number"
                    min={0}
                    className="h-9 w-20 focus-brand"
                    value={String(stepForm.day_offset)}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      setStepForm(f => ({ ...f, day_offset: Number.isFinite(n) && n > 0 ? n : 0 }));
                    }}
                  />
                </div>
                <CycleDayGrid
                  dayOffset={stepForm.day_offset}
                  onPick={(offset) => setStepForm(f => ({ ...f, day_offset: offset }))}
                  siblings={stepDialogSiblings}
                />
              </div>
              <p className="text-[10px] text-ink-warm-400">
                Days after the run starts. Day 0 is the start day itself; multiple steps can share a day.
              </p>
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

      {/* ─── Role -> person dialog ────────────────────────────────────
          Lists only the roles this template's steps actually use. A list of
          every role in the app would make you scan for the four that matter.
          [2026-08-06 per Andy] */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="sm:max-w-[520px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Role Owners
            </DialogTitle>
            <DialogDescription className="text-sm text-ink-warm-600 pt-1">
              Who normally does each role, across every template. Runs start pre-assigned from
              this; individual steps can override it, and the wizard can still change any step
              before it spawns.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-2 border-b border-cream-100 pb-2">
            <p className="text-[11px] text-ink-warm-500">
              {Object.keys(roleHistory).length > 0
                ? 'Fill blanks from who has actually done each role.'
                : 'No past runs to learn from yet.'}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={applyHistorySuggestions}
              disabled={Object.keys(roleHistory).length === 0}
            >
              <History className="h-3.5 w-3.5 mr-1.5" />
              Use history
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-1 py-2 space-y-3">
            {roleVocab.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No roles yet"
                description="Give template steps a role first — that's what an owner attaches to."
                className="py-8"
              />
            ) : roleVocab.map(r => {
              const hist = roleHistory[r.key] ?? [];
              const top = hist[0];
              const total = hist.reduce((n, h) => n + h.times, 0);
              // Show the split, not just the leader: a 54/32 role is a
              // judgment call and the UI shouldn't hide that it's close.
              const share = top && total ? Math.round((top.times / total) * 100) : 0;
              return (
                <div key={r.key} className="grid grid-cols-[1fr_1.3fr] items-center gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-ink-warm-900 truncate">{r.label}</div>
                    <div className="text-[10px] text-ink-warm-400 truncate">
                      <span className="font-mono">{r.key}</span>
                      <span className="mx-1">·</span>
                      {r.uses} step{r.uses === 1 ? '' : 's'}
                      {top && (
                        <> · usually {nameOf(top.userId) ?? 'someone'} ({share}%)</>
                      )}
                    </div>
                  </div>
                  <Select
                    value={roleDraft[r.key] || NO_ASSIGNEE}
                    onValueChange={(v) => setRoleDraft(d => ({ ...d, [r.key]: v === NO_ASSIGNEE ? '' : v }))}
                  >
                    <SelectTrigger className="h-9 focus-brand"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_ASSIGNEE}>Unassigned</SelectItem>
                      {team.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>

          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button type="button" variant="outline" size="sm" onClick={() => setRoleDialogOpen(false)} disabled={savingRoles}>
              Cancel
            </Button>
            <Button type="button" variant="brand" size="sm" onClick={saveRoleOwners} disabled={savingRoles}>
              {savingRoles ? 'Saving…' : 'Save'}
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
