'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus, Search, Edit, BookOpen, User, Trash2, Calendar, ExternalLink,
  AlertCircle, CheckCircle, Clock, ChevronLeft, ChevronRight, Link as LinkIcon,
  Play, FileText, History, ArrowUp, ArrowDown, X, RotateCcw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { StatusBadge, toneClassName, type BadgeTone } from '@/components/ui/status-badge';
import { DeliverableWizard } from '@/components/tasks/DeliverableWizard';
import { DeliverableService } from '@/lib/deliverableService';
import dynamic from 'next/dynamic';

// Dynamically import ReactQuill to avoid SSR issues
const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });
import 'react-quill/dist/quill.snow.css';

/**
 * One entry in an SOP's deliverable_template_sequence. Stored as jsonb
 * on the sops row. See migration sops_deliverable_template_sequence
 * for the column comment + rationale.
 *
 * [2026-06-05] trigger_type semantics:
 *   - 'on_sop_start'   — spawn immediately when the user clicks Run All
 *   - 'after_previous' — display-only in v1; user manually triggers via Run Next
 *   - 'recurring'      — display-only in v1; cron will fire later (Week 2 build)
 *   - 'manual'         — never auto-spawns; only via per-entry Run button
 */
type SequenceTriggerType = 'on_sop_start' | 'after_previous' | 'recurring' | 'manual';
type RecurrenceCadence = 'weekly' | 'biweekly' | 'monthly';

interface SequenceEntry {
  template_id: string;
  sort_order: number;
  trigger_type: SequenceTriggerType;
  recurrence_cadence: RecurrenceCadence | null;
  timing_offset_label: string | null;
  timing_offset_days: number | null;
}

interface SOP {
  id: string;
  name: string;
  trigger: string | null;
  outcome: string | null;
  content: string | null;
  clickup_link: string | null;
  documentation_link: string | null;
  owner_id: string | null;
  category: string;
  status: string;
  automation_review_requested: boolean;
  automation_review_completed: boolean;
  automation_notes: string | null;
  /** Legacy: optional link to a single deliverable_template. Kept for
   *  backward compatibility — the canonical multi-template wiring is
   *  `deliverable_template_sequence` below. On save we keep
   *  `deliverable_template_id` in sync with sequence[0].template_id so
   *  any code that reads only the legacy column still works.
   *  (added 2026-05-07, migration 048; deprecated 2026-06-05). */
  deliverable_template_id: string | null;
  /** Ordered list of deliverable templates to fire when this SOP is
   *  run. Empty when no templates are linked. (added 2026-06-05, see
   *  migration sops_deliverable_template_sequence.) */
  deliverable_template_sequence: SequenceEntry[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  owner?: {
    id: string;
    name: string;
    email: string;
  };
  creator?: {
    id: string;
    name: string;
    email: string;
  };
}

interface SOPVersion {
  id: string;
  sop_id: string;
  version_number: number;
  snapshot: any;
  changed_by: string | null;
  changed_at: string;
  change_summary: string | null;
  changer?: {
    name: string;
  };
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
}

const CATEGORIES = [
  { value: 'campaign', label: 'Campaign' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'bd', label: 'BD' },
  { value: 'kol', label: 'KOL' },
  { value: 'client', label: 'Client' },
  { value: 'general', label: 'General' },
];

// Status + category tone maps. Migrated to centralized StatusBadge palette
// 2026-05-06 — was inventing yellow/teal/orange tones inline. The palette
// defined in components/ui/status-badge.tsx is the source of truth; pick
// the closest existing tone rather than adding new colors here.
const STATUS_TONES: Record<string, BadgeTone> = {
  draft:    'warning',  // amber, was bg-yellow-100
  active:   'success',  // emerald, was bg-emerald-100
  inactive: 'neutral',  // gray, unchanged
};
const STATUSES = [
  { value: 'draft',    label: 'Draft' },
  { value: 'active',   label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

// [2026-06-05] Trigger-type display labels for the sequence editor.
// `recurring` and `after_previous` are valid options on save (the
// jsonb supports them) but they're display-only in v1 — Run still
// has to be manual. The Recurring cron is a Week-2 build; the
// "after previous completes" auto-spawn likewise.
const TRIGGER_LABEL: Record<SequenceTriggerType, string> = {
  on_sop_start:    'On SOP start',
  after_previous:  'After previous completes',
  recurring:       'Recurring',
  manual:          'Manual',
};
const TRIGGER_TONE: Record<SequenceTriggerType, BadgeTone> = {
  on_sop_start:    'brand',
  after_previous:  'info',
  recurring:       'purple',
  manual:          'neutral',
};
const CADENCE_LABEL: Record<RecurrenceCadence, string> = {
  weekly:   'Weekly',
  biweekly: 'Biweekly',
  monthly:  'Monthly',
};

const CATEGORY_TONES: Record<string, BadgeTone> = {
  campaign:   'info',    // sky, was blue
  onboarding: 'purple',  // unchanged
  bd:         'warning', // amber, was orange — closest in palette
  kol:        'pink',    // unchanged
  client:     'brand',   // brand teal, was teal-100 (same intent, palette token)
  general:    'neutral', // gray, unchanged
};

const getStatusColor = (status: string) =>
  toneClassName(STATUS_TONES[status] ?? 'neutral');

const getCategoryColor = (category: string) =>
  toneClassName(CATEGORY_TONES[category] ?? 'neutral');

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

// Quill editor modules configuration
const quillModules = {
  toolbar: [
    [{ 'header': [1, 2, 3, false] }],
    ['bold', 'italic', 'underline'],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    [{ 'indent': '-1'}, { 'indent': '+1' }],
    ['link'],
    ['clean']
  ],
};

export default function SOPsPage() {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const [sops, setSops] = useState<SOP[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Dialog states
  const [isCreateEditOpen, setIsCreateEditOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [editingSOP, setEditingSOP] = useState<SOP | null>(null);
  const [viewingSOP, setViewingSOP] = useState<SOP | null>(null);
  const [deletingSOP, setDeletingSOP] = useState<SOP | null>(null);
  const [sopVersions, setSopVersions] = useState<SOPVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Form state. Tracks the editable shape of an SOP:
  //   - `deliverable_template_sequence` is the canonical multi-template
  //     wiring (added 2026-06-05). Rendered as a sortable list in the
  //     edit dialog and persisted as-is to the jsonb column.
  //   - `deliverable_template_id` is the legacy single-template field.
  //     We keep it in sync with sequence[0]?.template_id on save so any
  //     code reading only the legacy column still works (e.g. the list
  //     card's "Runnable" badge before sequence migration).
  const [formData, setFormData] = useState<{
    name: string;
    trigger: string;
    outcome: string;
    content: string;
    clickup_link: string;
    documentation_link: string;
    owner_id: string;
    category: string;
    status: string;
    deliverable_template_id: string;
    deliverable_template_sequence: SequenceEntry[];
  }>({
    name: '',
    trigger: '',
    outcome: '',
    content: '',
    clickup_link: '',
    documentation_link: '',
    owner_id: '',
    category: 'general',
    status: 'draft',
    deliverable_template_id: '',  // empty string = unlinked (form convention)
    deliverable_template_sequence: [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // Deliverable templates dropdown for the "link this SOP to a template"
  // field. Loaded once on mount alongside the SOP list.
  const [deliverableTemplates, setDeliverableTemplates] = useState<Array<{ id: string; name: string }>>([]);
  // Wizard state — opened when user clicks "Run this SOP" on the
  // detail view. Pre-loaded with the linked template + SOP name.
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardTemplateId, setWizardTemplateId] = useState<string | null>(null);
  const [wizardInitialTitle, setWizardInitialTitle] = useState<string>('');
  const [wizardClients, setWizardClients] = useState<Array<{ id: string; name: string }>>([]);

  // [2026-06-11] Multi-Template SOP v2 — Run All / Run Next state.
  // Run All: open client picker → write recurring_deliverables for every
  // 'recurring' entry → spawn the first on_sop_start template via wizard.
  // Run Next: show a picker of un-spawned manual/after_previous entries →
  // open the wizard for the chosen template.
  const [runAllPickerOpen, setRunAllPickerOpen] = useState(false);
  const [runAllPickerClientId, setRunAllPickerClientId] = useState<string>('');
  const [runAllBusy, setRunAllBusy] = useState(false);
  const [runNextPickerOpen, setRunNextPickerOpen] = useState(false);
  const [runNextOptions, setRunNextOptions] = useState<Array<{
    template_id: string;
    sort_order: number;
    trigger_type: 'after_previous' | 'manual';
    timing_offset_label: string | null;
    template_name: string | null;
  }>>([]);

  useEffect(() => {
    fetchSOPs();
    fetchTeamMembers();
    fetchDeliverableTemplatesAndClients();
  }, []);

  // Load deliverable templates (for the link picker) + active clients
  // (for the wizard's client field). Both are small + rarely change,
  // so a single load on mount is fine.
  const fetchDeliverableTemplatesAndClients = async () => {
    try {
      const [tmplRes, clientsRes] = await Promise.all([
        (supabase as any)
          .from('deliverable_templates')
          .select('id, name')
          .eq('is_active', true)
          .order('name'),
        (supabase as any)
          .from('clients')
          .select('id, name')
          .eq('is_active', true)
          .is('archived_at', null)
          .order('name'),
      ]);
      setDeliverableTemplates(tmplRes.data || []);
      setWizardClients(clientsRes.data || []);
    } catch (err) {
      console.error('Error loading templates/clients:', err);
    }
  };

  const fetchSOPs = async () => {
    try {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('sops')
        .select(`
          *,
          owner:users!sops_owner_id_fkey(id, name, email),
          creator:users!sops_created_by_fkey(id, name, email)
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setSops(data || []);
    } catch (error) {
      console.error('Error fetching SOPs:', error);
      toast({
        title: 'Load failed',
        description: error instanceof Error ? error.message : 'Failed to load SOPs',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamMembers = async () => {
    try {
      // is_active + role filter: powers both the Owner filter dropdown
      // and the SOP form Owner picker. Excludes deactivated teammates,
      // pending sign-ups (is_active=false), and client-role accounts.
      // 2026-06-04.
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('is_active', true)
        .in('role', ['admin', 'super_admin', 'member'])
        .order('name');

      if (error) throw error;
      setTeamMembers(data || []);
    } catch (error) {
      console.error('Error fetching team members:', error);
    }
  };

  const fetchVersionHistory = async (sopId: string) => {
    try {
      setLoadingVersions(true);
      const { data, error } = await (supabase as any)
        .from('sop_versions')
        .select(`
          *,
          changer:users!sop_versions_changed_by_fkey(name)
        `)
        .eq('sop_id', sopId)
        .order('version_number', { ascending: false });

      if (error) throw error;
      setSopVersions(data || []);
    } catch (error) {
      console.error('Error fetching version history:', error);
    } finally {
      setLoadingVersions(false);
    }
  };

  // Filter SOPs
  const filteredSOPs = sops.filter(sop => {
    const matchesSearch =
      sop.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sop.trigger?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sop.outcome?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || sop.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || sop.category === categoryFilter;
    const matchesOwner = ownerFilter === 'all' || sop.owner_id === ownerFilter;
    return matchesSearch && matchesStatus && matchesCategory && matchesOwner;
  });

  // Pagination
  const totalPages = Math.ceil(filteredSOPs.length / itemsPerPage);
  const paginatedSOPs = filteredSOPs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, categoryFilter, ownerFilter]);

  // [2026-06-05] Automation Review feature removed — the underlying
  // workflow was half-built (only the "Request" half existed; no UI
  // ever shipped to mark a review complete or write the notes). DB
  // columns `automation_review_requested` / `automation_review_completed`
  // / `automation_notes` left in place so existing flagged SOPs aren't
  // blown away; they're just no longer read or written by any UI.

  // Status counts
  const statusCounts = {
    all: sops.length,
    draft: sops.filter(s => s.status === 'draft').length,
    active: sops.filter(s => s.status === 'active').length,
    inactive: sops.filter(s => s.status === 'inactive').length,
  };

  const handleCreateNew = () => {
    setEditingSOP(null);
    setFormData({
      name: '',
      trigger: '',
      outcome: '',
      content: '',
      clickup_link: '',
      documentation_link: '',
      owner_id: user?.id || '',
      category: 'general',
      status: 'draft',
      deliverable_template_id: '',
      deliverable_template_sequence: [],
    });
    setIsCreateEditOpen(true);
  };

  // Build a sequence array from a SOP row. Legacy single-template SOPs
  // (sequence is empty but `deliverable_template_id` is set) get a
  // synthetic 1-entry sequence so the new editor renders the right
  // initial state. Saves the legacy-→-canonical migration silently
  // the first time the user opens the dialog.
  const sequenceFromSop = (sop: SOP): SequenceEntry[] => {
    if (sop.deliverable_template_sequence && sop.deliverable_template_sequence.length > 0) {
      return sop.deliverable_template_sequence;
    }
    if (sop.deliverable_template_id) {
      return [{
        template_id: sop.deliverable_template_id,
        sort_order: 0,
        trigger_type: 'on_sop_start',
        recurrence_cadence: null,
        timing_offset_label: null,
        timing_offset_days: null,
      }];
    }
    return [];
  };

  /**
   * [2026-06-11] Multi-Template SOP v2 — Run All flow.
   *
   * Spec § "Run this SOP" — Run All "spawns Template 1 immediately and
   * queues the rest by trigger type." We split that into two phases so
   * each does one honest thing:
   *   1. Open a client picker dialog. User picks the client this SOP runs
   *      against (which is the same client all recurring rows bind to).
   *   2. On confirm: write a `recurring_deliverables` row for every
   *      `recurring` sequence entry (the cron picks them up), THEN open
   *      the wizard for the first `on_sop_start` (or sequence[0])
   *      template with the client + title pre-filled.
   *
   * The wizard handles per-step assignments + actual task spawn for the
   * first template; the cron handles the rest from Monday morning on.
   */
  const handleRunAll = (sop: SOP) => {
    setViewingSOP(sop);
    setRunAllPickerClientId('');
    setRunAllPickerOpen(true);
  };

  const handleRunAllConfirm = async () => {
    if (!viewingSOP || !runAllPickerClientId) return;
    const seq = sequenceFromSop(viewingSOP);
    if (seq.length === 0) {
      toast({ title: 'No templates linked to this SOP', variant: 'destructive' });
      return;
    }
    setRunAllBusy(true);
    try {
      // 1. Queue recurring bindings via the service helper.
      const recurringResult = await DeliverableService.applyRecurringEntriesForSop({
        sequence: seq.map(e => ({
          template_id: e.template_id,
          trigger_type: e.trigger_type,
          recurrence_cadence: e.recurrence_cadence,
        })),
        clientId: runAllPickerClientId,
        createdBy: user?.id ?? null,
      });

      // 2. Open wizard for the first on_sop_start (or sequence[0]) template.
      const first = seq.find(e => e.trigger_type === 'on_sop_start') ?? seq[0];
      const tpl = deliverableTemplates.find(t => t.id === first.template_id);
      const clientName = wizardClients.find(c => c.id === runAllPickerClientId)?.name || 'Client';

      // Close picker, switch to wizard. The wizard mounts globally below
      // and reads its open state from `wizardOpen`.
      setRunAllPickerOpen(false);
      setIsViewOpen(false);
      setWizardTemplateId(first.template_id);
      setWizardInitialTitle(`${viewingSOP.name} — ${tpl?.name ?? 'Template'} — ${clientName}`);
      setWizardOpen(true);

      // Toast describes what just happened — recurring counts are honest
      // even when they're 0 (so the user knows nothing happened silently).
      const recurringMsg = recurringResult.created > 0
        ? ` ${recurringResult.created} recurring binding${recurringResult.created === 1 ? '' : 's'} created.`
        : recurringResult.skipped > 0
          ? ' Recurring bindings already in place.'
          : '';
      toast({
        title: `Run All — ${viewingSOP.name}`,
        description: `Spawning first template via wizard.${recurringMsg}`,
      });
    } catch (err) {
      console.error('[Run All] failed:', err);
      toast({
        title: 'Run All failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setRunAllBusy(false);
    }
  };

  /**
   * [2026-06-11] Multi-Template SOP v2 — Run Next flow.
   *
   * Spec § "Run this SOP" — Run Next "spawns just the next template in
   * sequence." For v2 MVP we show the user a picker of all eligible
   * templates (manual + after_previous) and let them choose. Auto-progression
   * on parent task complete is a v2.1 polish — flagged in the spec tracker.
   *
   * Skips `recurring` (the cron handles those) and `on_sop_start` (that's
   * what Run All spawned).
   */
  const handleRunNext = async (sop: SOP) => {
    setViewingSOP(sop);
    const seq = sequenceFromSop(sop);
    const options = await DeliverableService.listRunNextOptionsForSop(seq);
    setRunNextOptions(options);
    setRunNextPickerOpen(true);
  };

  const handleRunNextPick = (templateId: string) => {
    if (!viewingSOP) return;
    const tpl = deliverableTemplates.find(t => t.id === templateId);
    setRunNextPickerOpen(false);
    setIsViewOpen(false);
    setWizardTemplateId(templateId);
    setWizardInitialTitle(`${viewingSOP.name} — ${tpl?.name ?? 'Template'}`);
    setWizardOpen(true);
  };

  const handleEdit = (sop: SOP) => {
    setEditingSOP(sop);
    setFormData({
      name: sop.name,
      trigger: sop.trigger || '',
      outcome: sop.outcome || '',
      content: sop.content || '',
      clickup_link: sop.clickup_link || '',
      documentation_link: sop.documentation_link || '',
      owner_id: sop.owner_id || '',
      category: sop.category,
      status: sop.status,
      deliverable_template_id: sop.deliverable_template_id || '',
      deliverable_template_sequence: sequenceFromSop(sop),
    });
    setIsCreateEditOpen(true);
  };

  const handleView = (sop: SOP) => {
    setViewingSOP(sop);
    setIsViewOpen(true);
  };

  const handleDelete = (sop: SOP) => {
    setDeletingSOP(sop);
    setIsDeleteOpen(true);
  };

  const handleViewHistory = async (sop: SOP) => {
    setViewingSOP(sop);
    await fetchVersionHistory(sop.id);
    setIsHistoryOpen(true);
  };

  const saveVersion = async (sopId: string, sopData: any, changeSummary?: string) => {
    // Get current version number
    const { data: versions } = await (supabase as any)
      .from('sop_versions')
      .select('version_number')
      .eq('sop_id', sopId)
      .order('version_number', { ascending: false })
      .limit(1);

    const nextVersion = versions && versions.length > 0 ? versions[0].version_number + 1 : 1;

    await (supabase as any).from('sop_versions').insert({
      sop_id: sopId,
      version_number: nextVersion,
      snapshot: sopData,
      changed_by: user?.id,
      change_summary: changeSummary || null,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({
        title: 'SOP name required',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Normalize the sequence — reassign sort_order in array index
      // order so it always stays canonical regardless of how the user
      // reordered entries in the editor.
      const normalizedSequence: SequenceEntry[] = formData.deliverable_template_sequence.map((entry, i) => ({
        ...entry,
        sort_order: i,
      }));
      // Sync the legacy single-template column with sequence[0] so any
      // older code reading `deliverable_template_id` still works (the
      // "Runnable" card badge, the legacy single-template Run button,
      // etc.). When sequence is empty, fall back to whatever the user
      // typed in the legacy picker (still works for SOPs created
      // before this feature shipped).
      const legacyTemplateId = normalizedSequence.length > 0
        ? normalizedSequence[0].template_id
        : (formData.deliverable_template_id || null);

      if (editingSOP) {
        // Update existing SOP
        const { error } = await (supabase as any)
          .from('sops')
          .update({
            name: formData.name,
            trigger: formData.trigger || null,
            outcome: formData.outcome || null,
            content: formData.content || null,
            clickup_link: formData.clickup_link || null,
            documentation_link: formData.documentation_link || null,
            owner_id: formData.owner_id || null,
            category: formData.category,
            status: formData.status,
            deliverable_template_id: legacyTemplateId,
            deliverable_template_sequence: normalizedSequence,
          })
          .eq('id', editingSOP.id);

        if (error) throw error;

        // Save version
        await saveVersion(editingSOP.id, formData, 'Updated SOP');

        toast({ title: 'SOP updated' });
      } else {
        // Create new SOP
        const { data, error } = await (supabase as any)
          .from('sops')
          .insert({
            name: formData.name,
            trigger: formData.trigger || null,
            outcome: formData.outcome || null,
            content: formData.content || null,
            clickup_link: formData.clickup_link || null,
            documentation_link: formData.documentation_link || null,
            owner_id: formData.owner_id || null,
            category: formData.category,
            status: formData.status,
            deliverable_template_id: legacyTemplateId,
            deliverable_template_sequence: normalizedSequence,
            created_by: user?.id,
          })
          .select()
          .single();

        if (error) throw error;

        // Save initial version
        if (data) {
          await saveVersion(data.id, formData, 'Initial version');
        }

        toast({ title: 'SOP created' });
      }

      setIsCreateEditOpen(false);
      fetchSOPs();
    } catch (error) {
      console.error('Error saving SOP:', error);
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Failed to save SOP',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingSOP) return;

    try {
      const { error } = await (supabase as any)
        .from('sops')
        .delete()
        .eq('id', deletingSOP.id);

      if (error) throw error;

      toast({ title: 'SOP deleted' });
      setIsDeleteOpen(false);
      setDeletingSOP(null);
      fetchSOPs();
    } catch (error) {
      console.error('Error deleting SOP:', error);
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Failed to delete SOP',
        variant: 'destructive',
      });
    }
  };

  // [2026-06-05] Automation-review handlers removed — see the count
  // comment above for context. The "Request" half was the only one
  // ever wired to a button; the "Complete" half had no UI at all.

  // Loading skeleton
  const SOPCardSkeleton = () => (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="flex gap-2 mt-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-3/4 mb-4" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="space-y-6">
          <PageHeader
            icon={BookOpen}
            title="SOPs"
            subtitle="Standard Operating Procedures"
            kicker="Workspace · HQ · SOPs"
            kickerDot="brand"
            actions={(
              <Button variant="brand" disabled>
                <Plus className="h-4 w-4 mr-2" />
                Create SOP
              </Button>
            )}
          />
          <div className="flex items-center space-x-4">
            <div className="relative flex-1 max-w-sm">
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-10 w-[150px]" />
            <Skeleton className="h-10 w-[150px]" />
          </div>
          {/* Tabs Skeleton */}
          <div className="flex gap-2">
            <Skeleton className="h-9 w-16 rounded-md" />
            <Skeleton className="h-9 w-20 rounded-md" />
            <Skeleton className="h-9 w-20 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SOPCardSkeleton key={i} />
            ))}
          </div>
        </div>
    );
  }

  return (
    <div className="space-y-6">
        <PageHeader
          icon={BookOpen}
          title="SOPs"
          subtitle="Standard Operating Procedures"
          kicker="Workspace · HQ · SOPs"
          kickerDot="brand"
          actions={(
            <Button variant="brand" onClick={handleCreateNew}>
              <Plus className="h-4 w-4 mr-2" />
              Create SOP
            </Button>
          )}
        />

        {/* Search and Filters */}
        <div className="flex items-center space-x-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-warm-400" />
            <Input
              placeholder="Search SOPs..."
              className="pl-10 focus-brand"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[150px] focus-brand">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map(cat => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-[150px] focus-brand">
              <SelectValue placeholder="Owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Owners</SelectItem>
              {teamMembers.map(member => (
                <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status Tabs — v11 chrome (cream-100 outer, white active tile
            with shadow-card). Per-tab semantic active text color
            preserved (yellow-700 for Draft, brand for Active, ink-warm
            for All/Inactive). Was bg-cream-100 + shadow-sm before. */}
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200">
            <TabsTrigger
              value="all"
              className="data-[state=active]:bg-white data-[state=active]:text-ink-warm-900 data-[state=active]:shadow-card px-4 py-2"
            >
              All
              <span className="ml-2 text-xs bg-brand-light text-brand px-2 py-0.5 rounded-full pointer-events-none tabular-nums">
                {statusCounts.all}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="draft"
              className="data-[state=active]:bg-white data-[state=active]:text-yellow-700 data-[state=active]:shadow-card px-4 py-2"
            >
              Draft
              <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full pointer-events-none tabular-nums">
                {statusCounts.draft}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="active"
              className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card px-4 py-2"
            >
              Active
              <span className="ml-2 text-xs bg-brand-light text-brand px-2 py-0.5 rounded-full pointer-events-none tabular-nums">
                {statusCounts.active}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="inactive"
              className="data-[state=active]:bg-white data-[state=active]:text-ink-warm-700 data-[state=active]:shadow-card px-4 py-2"
            >
              Inactive
              <span className="ml-2 text-xs bg-cream-200 text-ink-warm-700 px-2 py-0.5 rounded-full pointer-events-none tabular-nums">
                {statusCounts.inactive}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* SOP Cards */}
        {filteredSOPs.length === 0 ? (
          <Card className="border-cream-200 overflow-hidden">
            <EmptyState
              icon={BookOpen}
              title={
                searchTerm || statusFilter !== 'all' || categoryFilter !== 'all' || ownerFilter !== 'all'
                  ? 'No SOPs found matching your filters.'
                  : 'No SOPs yet.'
              }
              description={
                searchTerm || statusFilter !== 'all' || categoryFilter !== 'all' || ownerFilter !== 'all'
                  ? 'Try widening the filters or clearing the search.'
                  : 'Create your first SOP to get started.'
              }
              className="py-16"
            >
              {!searchTerm && statusFilter === 'all' && categoryFilter === 'all' && ownerFilter === 'all' && (
                <Button variant="brand" onClick={handleCreateNew}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First SOP
                </Button>
              )}
            </EmptyState>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedSOPs.map((sop) => (
              <Card key={sop.id} className="h-full flex flex-col group border-cream-200">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="bg-cream-100 p-1.5 rounded-lg flex-shrink-0">
                        <BookOpen className="h-4 w-4 text-ink-warm-700" />
                      </div>
                      <h3 className="font-semibold text-ink-warm-900 truncate">{sop.name}</h3>
                    </div>
                    <Badge className={`flex-shrink-0 pointer-events-none ${getStatusColor(sop.status)}`}>
                      {sop.status.charAt(0).toUpperCase() + sop.status.slice(1)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant="outline" className={`pointer-events-none ${getCategoryColor(sop.category)}`}>
                      {CATEGORIES.find(c => c.value === sop.category)?.label || sop.category}
                    </Badge>
                    {(sop.deliverable_template_id || (sop.deliverable_template_sequence?.length ?? 0) > 0) && (
                      <Badge variant="outline" className="bg-brand/10 text-brand border-brand/30 pointer-events-none">
                        <Play className="h-3 w-3 mr-1" />
                        Runnable
                        {(sop.deliverable_template_sequence?.length ?? 0) > 1 && (
                          <span className="ml-1 tabular-nums">· {sop.deliverable_template_sequence.length}</span>
                        )}
                      </Badge>
                    )}
                    {/* Review Pending / Reviewed badges removed
                        2026-06-05 alongside the Automation Review
                        feature retire — see the count-removal comment
                        above for context. */}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  {sop.trigger && (
                    <div className="mb-2">
                      <p className="text-xs text-ink-warm-500 font-medium">Trigger:</p>
                      <p className="text-sm text-ink-warm-700 line-clamp-1 whitespace-pre-wrap">{sop.trigger}</p>
                    </div>
                  )}
                  {sop.outcome && (
                    <div className="mb-3">
                      <p className="text-xs text-ink-warm-500 font-medium">Outcome:</p>
                      <p className="text-sm text-ink-warm-700 line-clamp-2 whitespace-pre-wrap">{sop.outcome}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-4 text-xs text-ink-warm-500 mb-3">
                    {sop.owner && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {sop.owner.name}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(sop.updated_at)}
                    </span>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleView(sop)}>
                      View
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleEdit(sop)}>
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewHistory(sop)}
                    >
                      <History className="h-3 w-3 mr-1" />
                      History
                    </Button>
                    {/* [2026-06-05] Delete affordance — the delete
                        confirm Dialog + `handleConfirmDelete` handler
                        + `handleDelete` opener all existed in the
                        codebase, but no UI button was wired to call
                        `handleDelete(sop)`. Users couldn't delete
                        SOPs because there was nothing to click. Ghost
                        rose-tint icon button at the end of the row
                        matches the action-cluster pattern on
                        /admin/changelog + /clients/templates. */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-8 w-8 p-0 text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                      onClick={() => handleDelete(sop)}
                      title="Delete SOP"
                      aria-label={`Delete SOP "${sop.name}"`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {filteredSOPs.length > itemsPerPage && (
          <div className="flex items-center justify-between pt-4">
            <p className="text-sm text-ink-warm-700">
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredSOPs.length)} of {filteredSOPs.length} SOPs
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm text-ink-warm-700">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={isCreateEditOpen} onOpenChange={setIsCreateEditOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>{editingSOP ? 'Edit SOP' : 'Create New SOP'}</DialogTitle>
              <DialogDescription>
                {editingSOP ? 'Update the SOP details below.' : 'Fill in the details to create a new SOP.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0"><div className="flex-1 overflow-y-auto px-1 py-2 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="name">SOP Name <RequiredAsterisk /></Label>
                  <Input
                    id="name"
                    className="focus-brand"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., KOL Campaign – From Confirmation to Post Live"
                  />
                </div>
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger className="focus-brand">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(cat => (
                        <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger className="focus-brand">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map(status => (
                        <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="owner">Owner</Label>
                  <Select
                    value={formData.owner_id}
                    onValueChange={(value) => setFormData({ ...formData, owner_id: value })}
                  >
                    <SelectTrigger className="focus-brand">
                      <SelectValue placeholder="Select owner" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamMembers.map(member => (
                        <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* [2026-06-05] ClickUp Template Link field HIDDEN
                    per Andy. The team is off ClickUp; `documentation_link`
                    below covers external-doc needs. DB column +
                    formData field kept for backward compat so existing
                    `clickup_link` values aren't blown away on save —
                    flip the `false &&` to true if the field needs to
                    return. */}
                {false && (
                  <div>
                    <Label htmlFor="clickup_link">ClickUp Template Link</Label>
                    <Input
                      id="clickup_link"
                      className="focus-brand"
                      value={formData.clickup_link}
                      onChange={(e) => setFormData({ ...formData, clickup_link: e.target.value })}
                      placeholder="https://app.clickup.com/..."
                    />
                  </div>
                )}
                <div className="col-span-2">
                  <Label htmlFor="documentation_link">Documentation Link</Label>
                  <Input
                    id="documentation_link"
                    className="focus-brand"
                    value={formData.documentation_link}
                    onChange={(e) => setFormData({ ...formData, documentation_link: e.target.value })}
                    placeholder="https://notion.so/... or other documentation"
                  />
                </div>
                {/* Deliverable Template Sequence — the canonical
                    multi-template wiring. Was a single Select linking
                    one template; replaced 2026-06-05 with a sortable
                    list so an SOP can fire several templates in
                    sequence (master campaign lifecycle pattern). The
                    legacy `deliverable_template_id` column is kept in
                    sync with sequence[0].template_id on save for
                    backward compat. */}
                <div className="col-span-2">
                  <Label>Deliverable Templates <span className="text-ink-warm-400 font-normal">(optional, ordered)</span></Label>
                  <div className="mt-2 space-y-2">
                    {formData.deliverable_template_sequence.length === 0 && (
                      <div className="text-xs text-ink-warm-500 italic border border-dashed border-cream-200 rounded-md p-3 text-center">
                        No templates linked yet. Add one below — when the SOP is run, each template spawns a multi-person task tree in the order listed.
                      </div>
                    )}
                    {formData.deliverable_template_sequence.map((entry, idx) => {
                      const tpl = deliverableTemplates.find(t => t.id === entry.template_id);
                      const isFirst = idx === 0;
                      const isLast = idx === formData.deliverable_template_sequence.length - 1;
                      const updateEntry = (patch: Partial<SequenceEntry>) => {
                        setFormData(f => ({
                          ...f,
                          deliverable_template_sequence: f.deliverable_template_sequence.map((e, i) =>
                            i === idx ? { ...e, ...patch } : e
                          ),
                        }));
                      };
                      const removeEntry = () => {
                        setFormData(f => ({
                          ...f,
                          deliverable_template_sequence: f.deliverable_template_sequence.filter((_, i) => i !== idx),
                        }));
                      };
                      const move = (dir: -1 | 1) => {
                        const target = idx + dir;
                        if (target < 0 || target >= formData.deliverable_template_sequence.length) return;
                        setFormData(f => {
                          const next = [...f.deliverable_template_sequence];
                          [next[idx], next[target]] = [next[target], next[idx]];
                          return { ...f, deliverable_template_sequence: next };
                        });
                      };
                      return (
                        <div key={idx} className="border border-cream-200 rounded-md p-3 bg-white">
                          <div className="flex items-start gap-2">
                            <span className="text-[10px] mono uppercase tracking-[0.18em] text-ink-warm-500 mt-2 tabular-nums w-6 text-right">{idx + 1}.</span>
                            <div className="flex-1 space-y-2 min-w-0">
                              {/* Row 1: Template picker */}
                              <Select
                                value={entry.template_id || 'none'}
                                onValueChange={(value) => updateEntry({ template_id: value === 'none' ? '' : value })}
                              >
                                <SelectTrigger className="focus-brand h-9 text-sm">
                                  <SelectValue placeholder="Select a deliverable template" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">— Select template</SelectItem>
                                  {deliverableTemplates.map(t => (
                                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {/* Row 2: Trigger / Cadence / Timing */}
                              <div className="grid grid-cols-3 gap-2">
                                <Select
                                  value={entry.trigger_type}
                                  onValueChange={(value) => updateEntry({
                                    trigger_type: value as SequenceTriggerType,
                                    recurrence_cadence: value === 'recurring' ? (entry.recurrence_cadence || 'weekly') : null,
                                  })}
                                >
                                  <SelectTrigger className="focus-brand h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(Object.keys(TRIGGER_LABEL) as SequenceTriggerType[]).map(t => (
                                      <SelectItem key={t} value={t}>{TRIGGER_LABEL[t]}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {entry.trigger_type === 'recurring' ? (
                                  <Select
                                    value={entry.recurrence_cadence || 'weekly'}
                                    onValueChange={(value) => updateEntry({ recurrence_cadence: value as RecurrenceCadence })}
                                  >
                                    <SelectTrigger className="focus-brand h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(Object.keys(CADENCE_LABEL) as RecurrenceCadence[]).map(c => (
                                        <SelectItem key={c} value={c}>{CADENCE_LABEL[c]}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input
                                    placeholder="Day 0"
                                    value={entry.timing_offset_label || ''}
                                    onChange={(e) => updateEntry({ timing_offset_label: e.target.value || null })}
                                    className="focus-brand h-8 text-xs"
                                  />
                                )}
                                <Input
                                  type="number"
                                  placeholder="Days"
                                  value={entry.timing_offset_days ?? ''}
                                  onChange={(e) => updateEntry({ timing_offset_days: e.target.value === '' ? null : Number(e.target.value) })}
                                  className="focus-brand h-8 text-xs"
                                />
                              </div>
                            </div>
                            {/* Row controls */}
                            <div className="flex flex-col gap-1 shrink-0">
                              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => move(-1)} disabled={isFirst} title="Move up">
                                <ArrowUp className="h-3 w-3" />
                              </Button>
                              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => move(1)} disabled={isLast} title="Move down">
                                <ArrowDown className="h-3 w-3" />
                              </Button>
                              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50" onClick={removeEntry} title="Remove">
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setFormData(f => ({
                        ...f,
                        deliverable_template_sequence: [
                          ...f.deliverable_template_sequence,
                          {
                            template_id: '',
                            sort_order: f.deliverable_template_sequence.length,
                            trigger_type: f.deliverable_template_sequence.length === 0 ? 'on_sop_start' : 'manual',
                            recurrence_cadence: null,
                            timing_offset_label: null,
                            timing_offset_days: null,
                          },
                        ],
                      }))}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Template
                    </Button>
                  </div>
                  <p className="text-xs text-ink-warm-500 mt-2">
                    Each linked template adds a Run button to the SOP detail view. Use trigger types like <code className="bg-cream-100 px-1 rounded">On SOP start</code> (spawns immediately on Run All) or <code className="bg-cream-100 px-1 rounded">Manual</code> (spawn later via the per-template Run button). Recurring is display-only in v1 — the cron will fire it automatically once that's wired up.
                  </p>
                </div>
                <div className="col-span-2">
                  <Label htmlFor="trigger">Trigger (What starts this process?)</Label>
                  <Textarea
                    id="trigger"
                    className="focus-brand"
                    value={formData.trigger}
                    onChange={(e) => setFormData({ ...formData, trigger: e.target.value })}
                    placeholder="e.g., New client signs contract"
                    rows={2}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="outcome">Outcome (What does 'done' mean?)</Label>
                  <Textarea
                    id="outcome"
                    className="focus-brand"
                    value={formData.outcome}
                    onChange={(e) => setFormData({ ...formData, outcome: e.target.value })}
                    placeholder="e.g., All KOL posts are live, links tracked, and performance logged in HHP"
                    rows={2}
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="content">SOP Content / Steps</Label>
                  <div className="mt-1 sop-editor-wrapper">
                    <style jsx global>{`
                      .sop-editor-wrapper {
                        height: 300px;
                        min-height: 150px;
                        max-height: 70vh;
                        overflow-y: auto;
                        border: 1px solid #e5e7eb;
                        border-radius: 0.375rem;
                        resize: vertical;
                      }
                      .sop-editor-wrapper .ql-toolbar {
                        position: sticky;
                        top: 0;
                        z-index: 10;
                        background: white;
                        border-top: none;
                        border-left: none;
                        border-right: none;
                      }
                      .sop-editor-wrapper .ql-container {
                        border: none;
                        min-height: 200px;
                      }
                    `}</style>
                    <ReactQuill
                      theme="snow"
                      value={formData.content}
                      onChange={(value) => setFormData({ ...formData, content: value })}
                      modules={quillModules}
                      placeholder="Write the SOP steps here..."
                      className="bg-white"
                    />
                  </div>
                  <p className="text-xs text-ink-warm-500 mt-1">Drag the bottom-right corner to resize</p>
                </div>
              </div>
              </div>
              <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
                <Button type="button" variant="outline" onClick={() => setIsCreateEditOpen(false)}>
                  Cancel
                </Button>
                <Button variant="brand" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : (editingSOP ? 'Update SOP' : 'Create SOP')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* View Dialog — v11-aligned: icon-prefixed Title Case header
            with h-4 w-4 brand icon (was h-5 w-5 plain), StatusBadge
            tones for status + category chips (was Badge with manual
            color class), DialogDescription pulling owner + last-
            updated into the natural subtitle slot. 2026-06-05. */}
        <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-brand" />
                {viewingSOP?.name}
              </DialogTitle>
              {viewingSOP && (
                <DialogDescription>
                  {viewingSOP.owner && <>Owned by <strong>{viewingSOP.owner.name}</strong> · </>}
                  Last updated {formatDate(viewingSOP.updated_at)}
                </DialogDescription>
              )}
            </DialogHeader>
            {viewingSOP && (
              <div className="flex-1 overflow-y-auto px-1 py-2 space-y-4">
                {/* Status + category chips — moved out of the header
                    into a meta row inside the scroll body so they
                    flow with the rest of the content rather than
                    competing with the title for header space. */}
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={STATUS_TONES[viewingSOP.status] ?? 'neutral'} size="sm">
                    {viewingSOP.status.charAt(0).toUpperCase() + viewingSOP.status.slice(1)}
                  </StatusBadge>
                  <StatusBadge tone={CATEGORY_TONES[viewingSOP.category] ?? 'neutral'} size="sm" bordered>
                    {CATEGORIES.find(c => c.value === viewingSOP.category)?.label ?? viewingSOP.category}
                  </StatusBadge>
                </div>

                {viewingSOP.trigger && (
                  <div>
                    <h4 className="font-semibold text-sm text-ink-warm-700 mb-1">Trigger</h4>
                    <p className="text-ink-warm-700 bg-cream-50 p-3 rounded-lg whitespace-pre-wrap">{viewingSOP.trigger}</p>
                  </div>
                )}

                {viewingSOP.outcome && (
                  <div>
                    <h4 className="font-semibold text-sm text-ink-warm-700 mb-1">Outcome</h4>
                    <p className="text-ink-warm-700 bg-cream-50 p-3 rounded-lg whitespace-pre-wrap">{viewingSOP.outcome}</p>
                  </div>
                )}

                {viewingSOP.content && (
                  <div>
                    <h4 className="font-semibold text-sm text-ink-warm-700 mb-1">SOP Content</h4>
                    <div
                      className="prose prose-sm max-w-none bg-cream-50 p-4 rounded-lg"
                      dangerouslySetInnerHTML={{ __html: viewingSOP.content }}
                    />
                  </div>
                )}

                <div className="flex flex-wrap gap-3 pt-2">
                  {/* ClickUp Template link hidden 2026-06-05 — see
                      the edit dialog for context. */}
                  {viewingSOP.documentation_link && (
                    <a
                      href={viewingSOP.documentation_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
                    >
                      <FileText className="h-4 w-4" />
                      Documentation
                    </a>
                  )}
                </div>

                {/* Automation Notes block removed 2026-06-05 — see
                    the automation-review removal comment above. */}

                {/* Deliverable Template Sequence — visual timeline of
                    the linked templates with a per-template Run button.
                    Each Run opens the DeliverableWizard pre-loaded with
                    that specific template. Synthesizes a 1-entry
                    sequence for legacy SOPs that only have
                    deliverable_template_id set (so they keep working
                    without a manual edit + save). 2026-06-05. */}
                {(() => {
                  const seq = sequenceFromSop(viewingSOP);
                  if (seq.length === 0) return null;
                  return (
                    <div className="border border-cream-200 rounded-lg p-4 bg-cream-50/40">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-sm text-ink-warm-900 flex items-center gap-2">
                          <Play className="h-3.5 w-3.5 text-brand" />
                          Deliverable Sequence
                          <span className="text-xs text-ink-warm-500 font-normal tabular-nums">· {seq.length} template{seq.length === 1 ? '' : 's'}</span>
                        </h4>
                      </div>
                      <ol className="space-y-2">
                        {seq.map((entry, idx) => {
                          const tpl = deliverableTemplates.find(t => t.id === entry.template_id);
                          const tplName = tpl?.name ?? '(template not found)';
                          const tone = TRIGGER_TONE[entry.trigger_type];
                          const triggerLabel = entry.trigger_type === 'recurring' && entry.recurrence_cadence
                            ? `${TRIGGER_LABEL.recurring} · ${CADENCE_LABEL[entry.recurrence_cadence]}`
                            : TRIGGER_LABEL[entry.trigger_type];
                          return (
                            <li key={idx} className="flex items-start gap-3 bg-white border border-cream-200 rounded-md p-2.5">
                              <span className="text-[10px] mono uppercase tracking-[0.18em] text-ink-warm-500 mt-1 tabular-nums w-5 text-right shrink-0">{idx + 1}.</span>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-ink-warm-900 truncate">{tplName}</div>
                                <div className="flex items-center gap-2 flex-wrap mt-1">
                                  <StatusBadge tone={tone} size="sm">{triggerLabel}</StatusBadge>
                                  {entry.timing_offset_label && (
                                    <span className="text-[11px] text-ink-warm-500">{entry.timing_offset_label}</span>
                                  )}
                                  {entry.timing_offset_days !== null && entry.timing_offset_days !== undefined && (
                                    <span className="text-[11px] text-ink-warm-500 tabular-nums">+{entry.timing_offset_days}d</span>
                                  )}
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="shrink-0 h-8"
                                disabled={!tpl}
                                onClick={() => {
                                  setWizardTemplateId(entry.template_id);
                                  setWizardInitialTitle(`${viewingSOP.name} — ${tplName}`);
                                  setIsViewOpen(false);
                                  setWizardOpen(true);
                                }}
                              >
                                <Play className="h-3 w-3 mr-1" />
                                Run
                              </Button>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  );
                })()}

              </div>
            )}
            {/* v11 DialogFooter — was an inline div with manual
                `pt-4 border-t` styling that didn't match other v11
                dialogs (which use the proper DialogFooter primitive
                with `border-t border-cream-100 pt-3 mt-0`). The
                "Last updated" metadata moved up to the
                DialogDescription so the footer is just actions. */}
            {viewingSOP && (
              <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
                {/* [2026-06-11] Multi-Template SOP v2 — Run All + Run Next
                    buttons. Replaces the "Run First" button:
                      - Run All: prompts for client → queues recurring entries →
                        opens wizard for the first on_sop_start template
                      - Run Next: shows a picker of un-spawned manual/
                        after_previous templates
                    Single-template SOPs collapse to a single "Run this SOP"
                    button (no Run Next when there's nothing to pick from). */}
                {(() => {
                  const seq = sequenceFromSop(viewingSOP);
                  if (seq.length === 0) return null;
                  const eligibleForRunNext = seq.filter(
                    e => e.trigger_type === 'after_previous' || e.trigger_type === 'manual',
                  );
                  const isMulti = seq.length > 1;
                  return (
                    <>
                      <Button variant="brand" size="sm" onClick={() => handleRunAll(viewingSOP)}>
                        <Play className="h-3 w-3 mr-1" />
                        {isMulti ? 'Run All' : 'Run this SOP'}
                      </Button>
                      {isMulti && eligibleForRunNext.length > 0 && (
                        <Button variant="outline" size="sm" onClick={() => handleRunNext(viewingSOP)}>
                          <Play className="h-3 w-3 mr-1" />
                          Run Next
                        </Button>
                      )}
                    </>
                  );
                })()}
                {/* Request Automation Review button removed
                    2026-06-05 — see the handler-removal comment above. */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsViewOpen(false);
                    handleEdit(viewingSOP);
                  }}
                >
                  <Edit className="h-3 w-3 mr-1" />
                  Edit
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog — v11 destructive Dialog pattern:
            icon-prefixed Title Case header, bolded subject in
            description, Trash2 icon on the primary button. Matches
            the delete confirms on /clients/templates, /admin/changelog,
            and the rest of the recently-migrated surfaces. */}
        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Trash2 className="h-4 w-4 text-rose-500" />
                Delete SOP?
              </DialogTitle>
              <DialogDescription className="text-sm text-ink-warm-700 pt-2">
                <strong>{deletingSOP?.name ?? ''}</strong> will be permanently deleted, along with its version history. SOPs already in use by deliverables are not affected. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
              <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleConfirmDelete}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Version History Dialog */}
        <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Version History: {viewingSOP?.name}</DialogTitle>
              <DialogDescription>
                View all changes made to this SOP over time.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-1 py-2">
            {loadingVersions ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : sopVersions.length === 0 ? (
              <p className="text-ink-warm-500 text-center py-8">No version history available.</p>
            ) : (
              <div className="space-y-3">
                {sopVersions.map((version) => (
                  <div
                    key={version.id}
                    className="border rounded-lg p-4 hover:bg-cream-50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">v{version.version_number}</Badge>
                        <span className="text-sm text-ink-warm-700">
                          {version.changer?.name || 'Unknown'}
                        </span>
                      </div>
                      <span className="text-xs text-ink-warm-500">
                        {new Date(version.changed_at).toLocaleString()}
                      </span>
                    </div>
                    {version.change_summary && (
                      <p className="text-sm text-ink-warm-700">{version.change_summary}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Run-this-SOP wizard. Lazy-mounted; only renders when a user
            clicks "Run this SOP" on a linked SOP. Pre-selects the
            template + seeds the title with the SOP name. The wizard's
            existing per-step assignment table handles multi-person
            assignment (fixed 2026-05-07 in the deliverables flow). */}
        {/* [2026-06-11] Run All client picker. Spec § Run All — pick the
            client this SOP runs against so the recurring entries bind to
            the right client before the wizard fires. */}
        <Dialog open={runAllPickerOpen} onOpenChange={(open) => { if (!open && !runAllBusy) setRunAllPickerOpen(false); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Play className="h-4 w-4 text-brand" />
                Run All — {viewingSOP?.name}
              </DialogTitle>
              <DialogDescription>
                Pick a client. The first template spawns via the wizard; any recurring entries auto-fire Mondays via the cron.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="run-all-client">Client</Label>
              <Select value={runAllPickerClientId} onValueChange={setRunAllPickerClientId}>
                <SelectTrigger id="run-all-client" className="focus-brand">
                  <SelectValue placeholder="Pick a client" />
                </SelectTrigger>
                <SelectContent>
                  {wizardClients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {viewingSOP && (() => {
                const seq = sequenceFromSop(viewingSOP);
                const recurringCount = seq.filter(e => e.trigger_type === 'recurring').length;
                return recurringCount > 0 ? (
                  <p className="text-xs text-ink-warm-500 pt-1">
                    {recurringCount} recurring template{recurringCount === 1 ? '' : 's'} will bind to this client and fire on the configured day each week.
                  </p>
                ) : null;
              })()}
            </div>
            <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
              <Button variant="outline" size="sm" onClick={() => setRunAllPickerOpen(false)} disabled={runAllBusy}>
                Cancel
              </Button>
              <Button variant="brand" size="sm" onClick={handleRunAllConfirm} disabled={runAllBusy || !runAllPickerClientId}>
                <Play className="h-3 w-3 mr-1" />
                {runAllBusy ? 'Running…' : 'Run All'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* [2026-06-11] Run Next picker. Shows all eligible templates
            (manual + after_previous) for the SOP — recurring entries are
            excluded (cron handles them) and on_sop_start is excluded
            (Run All handled it). User picks one, wizard fires for it. */}
        <Dialog open={runNextPickerOpen} onOpenChange={setRunNextPickerOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Play className="h-4 w-4 text-brand" />
                Run Next — {viewingSOP?.name}
              </DialogTitle>
              <DialogDescription>
                Pick the next template to spawn in this sequence.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2 max-h-[400px] overflow-y-auto">
              {runNextOptions.length === 0 ? (
                <p className="text-xs text-ink-warm-500 italic py-4 text-center">
                  No eligible templates. Recurring entries auto-fire from the cron; on_sop_start fires via Run All.
                </p>
              ) : (
                runNextOptions.map(opt => (
                  <button
                    key={`${opt.template_id}-${opt.sort_order}`}
                    type="button"
                    onClick={() => handleRunNextPick(opt.template_id)}
                    className="w-full text-left px-3 py-2 border border-cream-200 rounded-md hover:border-brand/40 hover:bg-cream-50/60 transition-colors"
                  >
                    <p className="text-sm font-medium text-ink-warm-900">
                      {opt.template_name || 'Template'}
                    </p>
                    <p className="text-[11px] text-ink-warm-500 mt-0.5">
                      {opt.trigger_type === 'after_previous' ? 'After previous completes' : 'Manual'}
                      {opt.timing_offset_label && ` · ${opt.timing_offset_label}`}
                    </p>
                  </button>
                ))
              )}
            </div>
            <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
              <Button variant="outline" size="sm" onClick={() => setRunNextPickerOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <DeliverableWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          teamMembers={teamMembers.map(m => ({
            id: m.id,
            name: m.name,
            email: m.email,
            role: null,
            profile_photo_url: null,
          })) as any}
          clients={wizardClients}
          onCreated={() => {
            setWizardOpen(false);
            toast({
              title: 'Deliverable created',
              description: 'Tasks have been generated from the SOP. Open Tasks to view them.',
            });
          }}
          preselectedTemplateId={wizardTemplateId ?? undefined}
          initialTitle={wizardInitialTitle}
        />
      </div>
  );
}
