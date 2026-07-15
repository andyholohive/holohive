import { supabase } from './supabase';
import { TaskService, Task } from './taskService';

// ==================== TYPES ====================

export type DeliverableTemplate = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: 'client' | 'internal' | 'bd';
  icon: string;
  color: string;
  is_active: boolean;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DeliverableTemplateStep = {
  id: string;
  template_id: string;
  step_name: string;
  step_order: number;
  description: string | null;
  default_role: string;
  role_label: string;
  estimated_duration_days: number;
  /** Days after the cycle start this step is due (0 = same day). Replaces
   *  cumulative estimated_duration_days for scheduling [Bolt 2026-07-15]. */
  day_offset: number;
  task_type: string;
  checklist_items: string[];
  is_blocking: boolean;
};

export type Deliverable = {
  id: string;
  template_id: string;
  parent_task_id: string;
  client_id: string | null;
  title: string;
  status: 'active' | 'complete' | 'cancelled';
  role_assignments: Record<string, string>;
  start_date: string | null;
  target_completion: string | null;
  metadata: Record<string, any>;
  actual_duration_days: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DeliverableWithProgress = Deliverable & {
  template: DeliverableTemplate;
  completedSteps: number;
  totalSteps: number;
  parentTask: Task | null;
  subtasks: Task[];
};

export type CreateDeliverableConfig = {
  templateId: string;
  title: string;
  clientId: string | null;
  startDate: string;
  priority: string;
  /** Default assignment by role — used when stepAssignments doesn't
   *  override for a given step. Multiple steps can share a role; this
   *  used to mean "all those steps go to the same person", which the
   *  team flagged as a bug 2026-05-07 (Client Onboarding has 8 steps
   *  with the same role → all dumped on one person). The wizard now
   *  populates stepAssignments instead, so roleAssignments stays for
   *  back-compat callers but is the FALLBACK, not the primary source. */
  roleAssignments: Record<string, { userId: string; userName: string }>;
  /** Per-step assignment override, keyed by step.id. Populated by the
   *  DeliverableWizard so users can pick a different assignee per
   *  step even when multiple steps share a default_role. */
  stepAssignments?: Record<string, { userId: string; userName: string }>;
  dueDateOverrides?: Record<number, string>; // stepOrder -> date override
  createdBy: string;
  createdByName: string;
};

// ==================== SERVICE ====================

export class DeliverableService {

  // ---- Templates ----

  static async getTemplates(): Promise<DeliverableTemplate[]> {
    try {
      const { data, error } = await supabase
        .from('deliverable_templates')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return (data as DeliverableTemplate[]) || [];
    } catch (error) {
      console.error('Error fetching deliverable templates:', error);
      throw error;
    }
  }

  static async getTemplateWithSteps(id: string): Promise<{ template: DeliverableTemplate; steps: DeliverableTemplateStep[] } | null> {
    try {
      const { data: template, error: tErr } = await supabase
        .from('deliverable_templates')
        .select('*')
        .eq('id', id)
        .single();

      if (tErr) {
        if (tErr.code === 'PGRST116') return null;
        throw tErr;
      }

      const { data: steps, error: sErr } = await supabase
        .from('deliverable_template_steps')
        .select('*')
        .eq('template_id', id)
        .order('step_order');

      if (sErr) throw sErr;

      return {
        template: template as DeliverableTemplate,
        steps: (steps as DeliverableTemplateStep[]) || [],
      };
    } catch (error) {
      console.error('Error fetching template with steps:', error);
      throw error;
    }
  }

  // ---- Create Deliverable (wizard submit) ----

  static async createDeliverable(config: CreateDeliverableConfig): Promise<{
    deliverable: Deliverable;
    parentTask: Task;
    subtasks: Task[];
  }> {
    const templateData = await this.getTemplateWithSteps(config.templateId);
    if (!templateData) throw new Error('Template not found');

    const { template, steps } = templateData;

    // 1. Create parent task
    const parentTask = await TaskService.createTask({
      task_name: config.title,
      task_type: template.category === 'bd' ? 'Marketing & Sales' : 'Client Delivery',
      frequency: 'one-time',
      status: 'in_progress',
      priority: config.priority,
      client_id: config.clientId || null,
      assigned_to: config.createdBy,
      assigned_to_name: config.createdByName,
      created_by: config.createdBy,
      created_by_name: config.createdByName,
      due_date: config.startDate,
      description: `<p>Deliverable: ${template.name}</p><p>${template.description || ''}</p>`,
    });

    // 2. Build role_assignments as { role_key: user_id }
    const roleAssignmentsFlat: Record<string, string> = {};
    for (const [role, info] of Object.entries(config.roleAssignments)) {
      roleAssignmentsFlat[role] = info.userId;
    }

    // Target completion = the latest step's day_offset (no longer the SUM of
    // durations, which over-inflated the timeline) [Bolt 2026-07-15].
    const maxOffset = steps.reduce((max, s) => Math.max(max, s.day_offset || 0), 0);
    const targetDate = new Date(config.startDate);
    targetDate.setDate(targetDate.getDate() + maxOffset);
    const targetCompletion = targetDate.toISOString().split('T')[0];

    // 3. Insert deliverables record
    const { data: deliverable, error: dErr } = await supabase
      .from('deliverables')
      .insert({
        template_id: config.templateId,
        parent_task_id: parentTask.id,
        client_id: config.clientId || null,
        title: config.title,
        status: 'active',
        role_assignments: roleAssignmentsFlat,
        start_date: config.startDate,
        target_completion: targetCompletion,
        metadata: { template_name: template.name, template_slug: template.slug },
        created_by: config.createdBy,
      })
      .select()
      .single();

    if (dErr) throw dErr;

    // Update parent task due_date to target completion
    await TaskService.updateTask(parentTask.id, { due_date: targetCompletion });

    // 4. Create subtasks for each step. Due = startDate + step.day_offset, so
    //    offset-0 steps land on the start day and steps can share a day.
    const subtasks: Task[] = [];

    for (const step of steps) {
      const dueDate = config.dueDateOverrides?.[step.step_order]
        || (() => {
          const d = new Date(config.startDate);
          d.setDate(d.getDate() + (step.day_offset || 0));
          return d.toISOString().split('T')[0];
        })();

      // Per-step assignment wins over role-based default (2026-05-07
      // fix: was assigning all steps with the same role to one person,
      // which broke for templates like "Client Onboarding - Internal
      // Setup" where 8 steps share a single role).
      const assignee =
        config.stepAssignments?.[step.id] ??
        config.roleAssignments[step.default_role];

      const subtask = await TaskService.createTask({
        task_name: `${step.step_order}. ${step.step_name}`,
        parent_task_id: parentTask.id,
        task_type: step.task_type,
        frequency: 'one-time',
        status: 'to_do',
        priority: config.priority,
        client_id: config.clientId || null,
        assigned_to: assignee?.userId || config.createdBy,
        assigned_to_name: assignee?.userName || config.createdByName,
        created_by: config.createdBy,
        created_by_name: config.createdByName,
        due_date: dueDate,
        description: step.description || '',
        sort_order: step.step_order,
      });

      // 5. Add checklist items
      const checklistItems = Array.isArray(step.checklist_items) ? step.checklist_items : [];
      for (let i = 0; i < checklistItems.length; i++) {
        const text = typeof checklistItems[i] === 'string' ? checklistItems[i] : String(checklistItems[i]);
        await TaskService.addChecklistItem(subtask.id, text, i);
      }

      subtasks.push(subtask);
    }

    return {
      deliverable: deliverable as Deliverable,
      parentTask,
      subtasks,
    };
  }

  // ---- Spawn from Template (cron-friendly, unassigned) ----

  /**
   * [2026-06-11] Spawn a deliverable from a template with all tasks
   * UNASSIGNED. Used by /api/cron/spawn-recurring-deliverables to
   * auto-generate weekly deliverables per active client per
   * HQ Deliverable Templates spec § Template 2 Notes:
   *   "should auto-generate as a recurring deliverable per active
   *    client, every week."
   *
   * Differs from `createDeliverable` in two deliberate ways:
   *   1. assigned_to is NULL (not falling back to createdBy). CMs claim
   *      tasks from the unassigned bucket Monday morning during normal
   *      triage. Better than the manual wizard because there's no
   *      "remember to run this" risk.
   *   2. role_assignments is empty {} — the cron has no UX surface to
   *      pick assignees, and per-step assignment is a CM judgment call
   *      that should happen at claim time, not spawn time.
   *
   * Idempotency: the caller (cron) checks last_fired_at on the
   * recurring_deliverables row before calling. This method does NOT
   * defend against duplicates — calling twice in a day creates two
   * task trees.
   */
  static async spawnFromTemplateUnassigned(opts: {
    templateId: string;
    clientId: string;
    title: string;
    startDate: string;        // YYYY-MM-DD
    createdBy: string | null; // System user (Andy/Bolt) for audit trail
    createdByName: string | null;
    priority?: string;
  }): Promise<{ deliverable: Deliverable; parentTask: Task; subtasks: Task[] }> {
    const templateData = await this.getTemplateWithSteps(opts.templateId);
    if (!templateData) throw new Error('Template not found');
    const { template, steps } = templateData;

    const priority = opts.priority || 'medium';

    // 1. Parent task — unassigned, in_progress.
    const parentTask = await TaskService.createTask({
      task_name: opts.title,
      task_type: template.category === 'bd' ? 'Marketing & Sales' : 'Client Delivery',
      frequency: 'one-time',
      status: 'in_progress',
      priority,
      client_id: opts.clientId,
      assigned_to: null,
      assigned_to_name: null,
      created_by: opts.createdBy,
      created_by_name: opts.createdByName,
      due_date: opts.startDate,
      description: `<p>Deliverable: ${template.name}</p><p>${template.description || ''}</p><p><em>Auto-spawned by recurring cron.</em></p>`,
    });

    // 2. Target completion = latest step's day_offset (was sum of durations).
    const maxOffset = steps.reduce((max, s) => Math.max(max, s.day_offset || 0), 0);
    const target = new Date(opts.startDate);
    target.setDate(target.getDate() + maxOffset);
    const targetCompletion = target.toISOString().slice(0, 10);

    // 3. Deliverable row
    const { data: deliverable, error: dErr } = await supabase
      .from('deliverables')
      .insert({
        template_id: opts.templateId,
        parent_task_id: parentTask.id,
        client_id: opts.clientId,
        title: opts.title,
        status: 'active',
        role_assignments: {},
        start_date: opts.startDate,
        target_completion: targetCompletion,
        metadata: {
          template_name: template.name,
          template_slug: template.slug,
          source: 'recurring_cron',
          auto_spawned_at: new Date().toISOString(),
        },
        created_by: opts.createdBy,
      })
      .select()
      .single();
    if (dErr) throw dErr;

    // Sync parent task due_date to target completion
    await TaskService.updateTask(parentTask.id, { due_date: targetCompletion });

    // 4. Subtask per step — all unassigned. Due = startDate + step.day_offset.
    const subtasks: Task[] = [];
    for (const step of steps) {
      const due = new Date(opts.startDate);
      due.setDate(due.getDate() + (step.day_offset || 0));
      const dueDate = due.toISOString().slice(0, 10);

      const subtask = await TaskService.createTask({
        task_name: `${step.step_order}. ${step.step_name}`,
        parent_task_id: parentTask.id,
        task_type: step.task_type,
        frequency: 'one-time',
        status: 'to_do',
        priority,
        client_id: opts.clientId,
        assigned_to: null,
        assigned_to_name: null,
        created_by: opts.createdBy,
        created_by_name: opts.createdByName,
        due_date: dueDate,
        description: step.description || '',
        sort_order: step.step_order,
      });

      // Carry checklist items forward exactly like createDeliverable does
      const checklistItems = Array.isArray(step.checklist_items) ? step.checklist_items : [];
      for (let i = 0; i < checklistItems.length; i++) {
        const text = typeof checklistItems[i] === 'string' ? checklistItems[i] : String(checklistItems[i]);
        await TaskService.addChecklistItem(subtask.id, text, i);
      }

      subtasks.push(subtask);
    }

    return { deliverable: deliverable as Deliverable, parentTask, subtasks };
  }

  // ---- Multi-Template SOP (v2) — Run All / Run Next helpers ----

  /**
   * [2026-06-11] Apply an SOP's recurring-trigger entries to the given client
   * by inserting rows into `recurring_deliverables`. Used by the SOP Run All
   * flow: when the user runs an SOP for a client, the on_sop_start entry
   * spawns immediately via the wizard, and this helper queues every
   * `recurring` entry so the cron picks them up Mondays.
   *
   * Idempotency: the partial unique index `uniq_recurring_deliverable_active`
   * on `(client_id, template_id) WHERE active = true` makes re-runs a no-op
   * for already-bound rows. Returns the count of newly-created bindings.
   *
   * Why service-role: this is called from a client component (/sops page)
   * via the regular supabase client; the helper relies on that auth path
   * being authenticated. The recurring_deliverables RLS policy allows
   * authenticated insert.
   */
  static async applyRecurringEntriesForSop(opts: {
    sequence: Array<{
      template_id: string;
      trigger_type: 'on_sop_start' | 'after_previous' | 'recurring' | 'manual';
      recurrence_cadence: 'weekly' | 'biweekly' | 'monthly' | null;
    }>;
    clientId: string;
    createdBy: string | null;
  }): Promise<{ created: number; skipped: number }> {
    const recurringEntries = opts.sequence.filter(e => e.trigger_type === 'recurring');
    if (recurringEntries.length === 0) return { created: 0, skipped: 0 };

    let created = 0;
    let skipped = 0;
    for (const entry of recurringEntries) {
      const { error } = await (supabase as any)
        .from('recurring_deliverables')
        .insert({
          client_id: opts.clientId,
          template_id: entry.template_id,
          cadence: entry.recurrence_cadence || 'weekly',
          day_of_week: 1, // Monday default. Spec § Template 2 Notes is weekly Mondays
          active: true,
          created_by: opts.createdBy,
        });
      if (error) {
        // 23505 = unique_violation — already a row for this (client, template).
        // Treat as a benign skip; user re-ran the SOP for the same client.
        if ((error as any).code === '23505') {
          skipped++;
          continue;
        }
        // Anything else is unexpected — log + continue so one failure doesn't
        // blow up the whole batch.
        console.error('[applyRecurringEntriesForSop] insert failed:', error);
      } else {
        created++;
      }
    }
    return { created, skipped };
  }

  /**
   * [2026-07-15, per Bolt] List every recurring binding for the management
   * panel on /sops, joined to client + template names so the row is
   * self-describing. Ordered active-first, then by client name.
   */
  static async listRecurringDeliverables(): Promise<Array<{
    id: string;
    client_id: string;
    template_id: string;
    cadence: 'weekly' | 'biweekly' | 'monthly';
    day_of_week: number;
    active: boolean;
    last_fired_at: string | null;
    client_name: string | null;
    template_name: string | null;
    /** true when the cron will auto-skip this row because the client's
     *  engagement has lapsed (coverage_tone = 'inactive') even though the
     *  recurring row itself is still `active`. Lets the UI explain why a
     *  seemingly-active cycle stops generating. */
    client_lapsed: boolean;
    /** Number of steps with a pre-assigned person (keys in step_assignees). */
    assigned_count: number;
  }>> {
    const { data, error } = await (supabase as any)
      .from('recurring_deliverables')
      .select(`
        id, client_id, template_id, cadence, day_of_week, active, last_fired_at, step_assignees,
        client:clients(name),
        template:deliverable_templates(name)
      `)
      .order('active', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) {
      console.error('[listRecurringDeliverables] load failed:', error);
      return [];
    }
    const rows = (data ?? []) as any[];

    // Merge in coverage status so the panel can flag auto-skipped (lapsed)
    // clients. One extra query keyed by the distinct client_ids.
    const clientIds = Array.from(new Set(rows.map((r) => r.client_id).filter(Boolean)));
    const lapsedSet = new Set<string>();
    if (clientIds.length > 0) {
      const { data: coverage } = await (supabase as any)
        .from('client_coverage_status')
        .select('client_id, coverage_tone')
        .in('client_id', clientIds);
      for (const c of (coverage ?? []) as any[]) {
        if (c.coverage_tone === 'inactive') lapsedSet.add(c.client_id);
      }
    }

    return rows.map((r) => ({
      id: r.id,
      client_id: r.client_id,
      template_id: r.template_id,
      cadence: r.cadence,
      day_of_week: r.day_of_week,
      active: r.active,
      last_fired_at: r.last_fired_at,
      client_name: r.client?.name ?? null,
      template_name: r.template?.name ?? null,
      client_lapsed: lapsedSet.has(r.client_id),
      assigned_count: Object.values((r.step_assignees ?? {}) as Record<string, string>)
        .filter(Boolean).length,
    }));
  }

  /**
   * Pause / resume a recurring cycle. `active=false` makes the Monday cron
   * skip it entirely — a manual stop that complements the automatic
   * client-paused guard in the cron.
   */
  static async setRecurringActive(id: string, active: boolean): Promise<boolean> {
    const { error } = await (supabase as any)
      .from('recurring_deliverables')
      .update({ active })
      .eq('id', id);
    if (error) {
      console.error('[setRecurringActive] update failed:', error);
      return false;
    }
    return true;
  }

  /**
   * [2026-07-15, per Bolt] Load the per-step assignee config for a recurring
   * cycle: the template's steps (for labels) + the current step->user map.
   * Powers the "Assignees" dialog on the Recurring Cycles panel.
   */
  static async getRecurringAssigneeConfig(recurringId: string): Promise<{
    steps: Array<{ id: string; step_name: string; step_order: number }>;
    assignees: Record<string, string>;
  }> {
    const { data: row, error: rowErr } = await (supabase as any)
      .from('recurring_deliverables')
      .select('template_id, step_assignees')
      .eq('id', recurringId)
      .maybeSingle();
    if (rowErr || !row) {
      console.error('[getRecurringAssigneeConfig] row load failed:', rowErr);
      return { steps: [], assignees: {} };
    }
    const { data: steps } = await (supabase as any)
      .from('deliverable_template_steps')
      .select('id, step_name, step_order')
      .eq('template_id', (row as any).template_id)
      .order('step_order');
    return {
      steps: ((steps ?? []) as any[]).map((s) => ({
        id: s.id, step_name: s.step_name, step_order: s.step_order,
      })),
      assignees: ((row as any).step_assignees ?? {}) as Record<string, string>,
    };
  }

  /**
   * Persist the step->user assignee map on a recurring cycle. The Monday cron
   * stamps spawned subtasks from this — set once, applies every cycle.
   */
  static async setRecurringStepAssignees(
    recurringId: string,
    assignees: Record<string, string>,
  ): Promise<boolean> {
    const { error } = await (supabase as any)
      .from('recurring_deliverables')
      .update({ step_assignees: assignees })
      .eq('id', recurringId);
    if (error) {
      console.error('[setRecurringStepAssignees] update failed:', error);
      return false;
    }
    return true;
  }

  /** Permanently remove a recurring binding. Already-spawned tasks are untouched. */
  static async deleteRecurringDeliverable(id: string): Promise<boolean> {
    const { error } = await (supabase as any)
      .from('recurring_deliverables')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('[deleteRecurringDeliverable] delete failed:', error);
      return false;
    }
    return true;
  }

  /**
   * Build the list of templates that a Run Next flow should offer for a
   * given SOP. Excludes `recurring` entries (those auto-fire via cron) and
   * `on_sop_start` (that's what Run All handled). Returns entries in
   * sequence order with their template names hydrated.
   */
  static async listRunNextOptionsForSop(
    sequence: Array<{
      template_id: string;
      sort_order: number;
      trigger_type: 'on_sop_start' | 'after_previous' | 'recurring' | 'manual';
      timing_offset_label: string | null;
    }>,
  ): Promise<Array<{
    template_id: string;
    sort_order: number;
    trigger_type: 'after_previous' | 'manual';
    timing_offset_label: string | null;
    template_name: string | null;
  }>> {
    const eligible = sequence
      .filter(e => e.trigger_type === 'after_previous' || e.trigger_type === 'manual')
      .sort((a, b) => a.sort_order - b.sort_order);
    if (eligible.length === 0) return [];

    const templateIds = Array.from(new Set(eligible.map(e => e.template_id)));
    const { data: templates } = await supabase
      .from('deliverable_templates')
      .select('id, name')
      .in('id', templateIds);
    const nameById = new Map((templates ?? []).map(t => [(t as any).id as string, (t as any).name as string]));

    return eligible.map(e => ({
      template_id: e.template_id,
      sort_order: e.sort_order,
      trigger_type: e.trigger_type as 'after_previous' | 'manual',
      timing_offset_label: e.timing_offset_label,
      template_name: nameById.get(e.template_id) ?? null,
    }));
  }

  // ---- Query Deliverables ----

  static async getDeliverableByTaskId(parentTaskId: string): Promise<(Deliverable & { template: DeliverableTemplate; steps: DeliverableTemplateStep[] }) | null> {
    try {
      const { data, error } = await supabase
        .from('deliverables')
        .select('*')
        .eq('parent_task_id', parentTaskId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const templateData = await this.getTemplateWithSteps(data.template_id);
      if (!templateData) return null;

      return {
        ...(data as Deliverable),
        template: templateData.template,
        steps: templateData.steps,
      };
    } catch (error) {
      console.error('Error fetching deliverable by task ID:', error);
      return null;
    }
  }

  static async getDeliverables(filters?: {
    clientId?: string;
    status?: string;
    templateId?: string;
  }): Promise<DeliverableWithProgress[]> {
    try {
      let query = supabase
        .from('deliverables')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.clientId) query = query.eq('client_id', filters.clientId);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.templateId) query = query.eq('template_id', filters.templateId);

      const { data, error } = await query;
      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Fetch all templates in one go
      const templateIds = [...new Set(data.map((d: any) => d.template_id))];
      const { data: templates } = await supabase
        .from('deliverable_templates')
        .select('*')
        .in('id', templateIds);

      const templateMap = new Map((templates || []).map((t: any) => [t.id, t as DeliverableTemplate]));

      // For each deliverable, count completed subtasks
      const results: DeliverableWithProgress[] = [];
      for (const d of data) {
        const del = d as Deliverable;
        const template = templateMap.get(del.template_id);
        if (!template) continue;

        const subtasks = await TaskService.getSubtasks(del.parent_task_id);
        const completedSteps = subtasks.filter(s => s.status === 'complete').length;
        const parentTask = await TaskService.getTaskById(del.parent_task_id);

        results.push({
          ...del,
          template,
          completedSteps,
          totalSteps: subtasks.length,
          parentTask,
          subtasks,
        });
      }

      return results;
    } catch (error) {
      console.error('Error fetching deliverables:', error);
      throw error;
    }
  }

  /**
   * Delete a deliverable and the entire workflow it owns (parent task
   * + all subtasks). The `deliverables` row is removed first, then the
   * parent task; subtasks cascade via the parent_task_id FK on
   * `tasks`. Idempotent — missing rows just return without error.
   *
   * Added 2026-06-03 so users can purge mis-created deliverables from
   * the /tasks/deliverables list without going to the DB. */
  static async deleteDeliverable(deliverableId: string): Promise<void> {
    try {
      // Need parent_task_id BEFORE deleting the deliverable row, so
      // fetch once up front.
      const { data: del, error: fetchErr } = await supabase
        .from('deliverables')
        .select('parent_task_id')
        .eq('id', deliverableId)
        .single();
      if (fetchErr && fetchErr.code !== 'PGRST116') throw fetchErr; // PGRST116 = not found
      const parentTaskId = del?.parent_task_id as string | undefined;

      // Delete the deliverable row first so the parent-task delete
      // doesn't trip any "deliverable still references this task" FK
      // constraint (depends on the schema's ON DELETE setup; safest
      // to delete in dependency order).
      const { error: delErr } = await supabase
        .from('deliverables')
        .delete()
        .eq('id', deliverableId);
      if (delErr) throw delErr;

      // Delete the parent task — subtasks cascade via parent_task_id.
      if (parentTaskId) {
        await TaskService.deleteTask(parentTaskId);
      }
    } catch (error) {
      console.error('Error deleting deliverable:', error);
      throw error;
    }
  }

  // ---- Auto-complete ----

  static async checkAndUpdateStatus(parentTaskId: string): Promise<boolean> {
    try {
      const subtasks = await TaskService.getSubtasks(parentTaskId);
      if (subtasks.length === 0) return false;

      const allComplete = subtasks.every(s => s.status === 'complete');
      if (!allComplete) return false;

      // Fetch deliverable to compute cycle time
      const { data: del } = await supabase
        .from('deliverables')
        .select('*')
        .eq('parent_task_id', parentTaskId)
        .maybeSingle();

      const updatePayload: Record<string, any> = {
        status: 'complete',
        updated_at: new Date().toISOString(),
      };

      // Compute actual_duration_days if start_date exists
      if (del?.start_date) {
        const start = new Date(del.start_date + 'T00:00:00');
        const now = new Date();
        updatePayload.actual_duration_days = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      }

      // Mark deliverable as complete
      const { error: dErr } = await supabase
        .from('deliverables')
        .update(updatePayload)
        .eq('parent_task_id', parentTaskId);

      if (dErr) throw dErr;

      // Mark parent task as complete
      await TaskService.updateTask(parentTaskId, { status: 'complete' });

      return true;
    } catch (error) {
      console.error('Error checking deliverable status:', error);
      return false;
    }
  }

  // ---- Template CRUD (admin) ----

  static async createTemplate(template: Partial<DeliverableTemplate>): Promise<DeliverableTemplate> {
    const { data, error } = await supabase
      .from('deliverable_templates')
      .insert(template as any)
      .select()
      .single();
    if (error) throw error;
    return data as DeliverableTemplate;
  }

  static async updateTemplate(id: string, updates: Partial<DeliverableTemplate>): Promise<DeliverableTemplate> {
    // Fetch current version to bump it
    const { data: current } = await supabase
      .from('deliverable_templates')
      .select('version')
      .eq('id', id)
      .single();

    const newVersion = ((current as any)?.version || 1) + 1;

    const { data, error } = await supabase
      .from('deliverable_templates')
      .update({ ...updates, version: newVersion, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as DeliverableTemplate;
  }

  static async deleteTemplate(id: string): Promise<void> {
    const { error } = await supabase
      .from('deliverable_templates')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  static async createStep(step: Partial<DeliverableTemplateStep>): Promise<DeliverableTemplateStep> {
    const { data, error } = await supabase
      .from('deliverable_template_steps')
      .insert(step as any)
      .select()
      .single();
    if (error) throw error;
    return data as DeliverableTemplateStep;
  }

  static async updateStep(id: string, updates: Partial<DeliverableTemplateStep>): Promise<DeliverableTemplateStep> {
    const { data, error } = await supabase
      .from('deliverable_template_steps')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as DeliverableTemplateStep;
  }

  static async deleteStep(id: string): Promise<void> {
    const { error } = await supabase
      .from('deliverable_template_steps')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}
