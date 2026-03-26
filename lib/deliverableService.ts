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
};

export type CreateDeliverableConfig = {
  templateId: string;
  title: string;
  clientId: string | null;
  startDate: string;
  priority: string;
  roleAssignments: Record<string, { userId: string; userName: string }>;
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

    // Calculate target completion from start + sum of durations
    const totalDays = steps.reduce((sum, s) => sum + s.estimated_duration_days, 0);
    const targetDate = new Date(config.startDate);
    targetDate.setDate(targetDate.getDate() + totalDays);
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

    // 4. Create subtasks for each step
    const subtasks: Task[] = [];
    let cumulativeDays = 0;

    for (const step of steps) {
      cumulativeDays += step.estimated_duration_days;
      const dueDate = config.dueDateOverrides?.[step.step_order]
        || (() => {
          const d = new Date(config.startDate);
          d.setDate(d.getDate() + cumulativeDays);
          return d.toISOString().split('T')[0];
        })();

      const assignee = config.roleAssignments[step.default_role];

      const subtask = await TaskService.createTask({
        task_name: `${step.step_order}. ${step.step_name}`,
        parent_task_id: parentTask.id,
        task_type: step.task_type,
        frequency: 'one-time',
        status: 'to_do',
        priority: config.priority,
        client_id: config.clientId || null,
        assigned_to: assignee?.userId || null,
        assigned_to_name: assignee?.userName || null,
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
        });
      }

      return results;
    } catch (error) {
      console.error('Error fetching deliverables:', error);
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
      .insert(template)
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
      .insert(step)
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
