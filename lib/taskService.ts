import { supabase } from './supabase';

export type Task = {
  id: string;
  // Human-typeable short ID (T-001, T-002, ...). Auto-assigned by the
  // tasks_assign_short_id trigger on insert (migration 066). Used by
  // the Telegram bot for /done <id> and shown on the row in the UI.
  short_id: string | null;
  task_name: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  due_date: string | null;
  latest_comment: string | null;
  frequency: string;
  task_type: string;
  link: string | null;
  description: string | null;
  status: string;
  created_by: string | null;
  created_by_name: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // New M1 columns
  client_id: string | null;
  parent_task_id: string | null;
  priority: string;
  completed_at: string | null;
  recurring_config: Record<string, any> | null;
  template_id: string | null;
};

export type TaskInsert = Omit<Task, 'id' | 'created_at' | 'updated_at' | 'sort_order'> & {
  sort_order?: number;
};

export type TaskUpdate = Partial<Omit<Task, 'id' | 'created_at'>>;

export type TaskComment = {
  id: string;
  task_id: string;
  user_id: string | null;
  user_name: string | null;
  content: string;
  parent_comment_id: string | null;
  created_at: string;
  updated_at: string;
  replies?: TaskComment[];
};

export type TaskAttachment = {
  id: string;
  task_id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
};

export type TaskChecklistItem = {
  id: string;
  task_id: string;
  text: string;
  is_done: boolean;
  display_order: number;
  created_at: string;
};

export type DashboardStats = {
  total: number;
  overdue: number;
  dueThisWeek: number;
  completedThisWeek: number;
  inProgress: number;
  byStatus: Record<string, number>;
};

export type RecurringConfig = {
  frequency: 'daily' | 'weekly' | 'monthly';
  day_of_week?: number; // 0=Sun, 1=Mon, ..., 6=Sat (for weekly)
  day_of_month?: number; // 1-31 (for monthly)
  end_date?: string; // YYYY-MM-DD, stop generating after this
};

export type TaskTemplate = {
  id: string;
  name: string;
  description: string | null;
  task_name_template: string;
  task_type: string;
  frequency: string;
  priority: string;
  default_assigned_to: string | null;
  default_client_id: string | null;
  recurring_config: Record<string, any> | null;
  checklist_items: Array<{ text: string; is_done: boolean }>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FormTaskMapping = {
  id: string;
  form_id: string;
  template_id: string | null;
  is_active: boolean;
  field_mappings: Record<string, string>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskAutomation = {
  id: string;
  name: string;
  is_active: boolean;
  trigger_type: string;
  trigger_config: Record<string, any>;
  action_type: string;
  action_config: Record<string, any>;
  scope: string;
  scope_value: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskAutomationLog = {
  id: string;
  automation_id: string | null;
  task_id: string | null;
  action_taken: string;
  details: Record<string, any> | null;
  executed_at: string;
};

export class TaskService {
  /**
   * Get all tasks ordered by sort_order then created_at
   */
  static async getAllTasks(): Promise<Task[]> {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as Task[]) || [];
    } catch (error) {
      console.error('Error fetching tasks:', error);
      throw error;
    }
  }

  /**
   * Get a single task by ID
   */
  static async getTaskById(id: string): Promise<Task | null> {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return data as Task;
    } catch (error) {
      console.error('Error fetching task:', error);
      throw error;
    }
  }

  /**
   * Create a new task
   */
  /**
   * Best-effort fire-and-forget Telegram notification for an assignment.
   * Server-side dedupes via tasks.last_assignee_notified_to so calling
   * this on every save is safe — it'll skip if the same person was
   * already notified for the current assignment.
   */
  private static notifyAssignment(taskId: string): void {
    if (typeof window === 'undefined') return; // server-side calls skip
    fetch('/api/tasks/notify-assignment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId }),
    }).catch(err => console.warn('[tasks] notify-assignment failed:', err));
  }

  /**
   * Best-effort fire-and-forget Telegram announcement for a task field
   * change. Posts to the chat configured on the `task_changed` reminder
   * rule. The server-side endpoint formats the human-readable diff
   * ("status: in_progress → complete", "due date: May 15 → May 20") and
   * is idempotent — calling twice for the same change is harmless
   * because the message dedupe is at the rule + task + field level.
   *
   * Only fires on the three "shift visibility" fields the doc cares
   * about: status, due_date, assigned_to. We pass the previous values
   * so the server can compose a meaningful diff message.
   */
  private static notifyChange(
    taskId: string,
    changes: { status?: string | null; due_date?: string | null; assigned_to?: string | null },
    prev: { status?: string | null; due_date?: string | null; assigned_to?: string | null },
  ): void {
    if (typeof window === 'undefined') return;
    fetch('/api/tasks/notify-changed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, changes, prev }),
    }).catch(err => console.warn('[tasks] notify-changed failed:', err));
  }

  static async createTask(task: Partial<TaskInsert>): Promise<Task> {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .insert(task)
        .select()
        .single();

      if (error) throw error;
      const created = data as Task;
      // Fire DM to assignee if one was set on creation
      if (created.assigned_to) this.notifyAssignment(created.id);
      return created;
    } catch (error) {
      console.error('Error creating task:', error);
      throw error;
    }
  }

  /**
   * Update a task. Automatically sets completed_at on status change.
   * Triggers recurring clone if task has recurring_config and status → complete.
   */
  static async updateTask(id: string, updates: TaskUpdate): Promise<Task> {
    try {
      // Snapshot previous values for the change announcer. Only need the
      // three "shift visibility" fields the doc cares about. Skipping
      // the fetch if none of them are in `updates` keeps the path cheap
      // for high-frequency edits like comment-only saves.
      const willAnnounce = 'status' in updates || 'due_date' in updates || 'assigned_to' in updates;
      let prev: { status?: string | null; due_date?: string | null; assigned_to?: string | null } | null = null;
      if (willAnnounce) {
        const { data: existing } = await supabase
          .from('tasks')
          .select('status, due_date, assigned_to')
          .eq('id', id)
          .single();
        if (existing) prev = existing;
      }

      // Handle completed_at logic on status change
      const payload: Record<string, any> = {
        ...updates,
        updated_at: new Date().toISOString(),
      };

      if (updates.status === 'complete' && !updates.completed_at) {
        payload.completed_at = new Date().toISOString();
      } else if (updates.status && updates.status !== 'complete') {
        payload.completed_at = null;
      }

      const { data, error } = await supabase
        .from('tasks')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      const updatedTask = data as Task;

      // Auto-clone if completing a recurring task
      if (updates.status === 'complete' && this.isRecurringTask(updatedTask)) {
        await this.cloneRecurringTask(updatedTask);
      }

      // Auto-complete parent deliverable if all subtasks are done
      if (updates.status === 'complete' && updatedTask.parent_task_id) {
        this.checkDeliverableAutoComplete(updatedTask.parent_task_id).catch(() => {});
      }

      // Fire DM if assignment was touched on this update. Server-side
      // dedupes against last_assignee_notified_to so re-saves of the
      // same assignment don't spam the assignee.
      if ('assigned_to' in updates && updatedTask.assigned_to) {
        this.notifyAssignment(updatedTask.id);
      }

      // Auto-shift announcer — fire to the configured task_changed
      // chat for any of (status / due_date / assigned_to) that actually
      // changed. The server endpoint composes the diff message and
      // skips no-op writes (e.g. saving the same value twice).
      if (willAnnounce && prev) {
        const changed: typeof prev = {};
        if ('status' in updates && (updates.status ?? null) !== (prev.status ?? null)) changed.status = updates.status as any;
        if ('due_date' in updates && (updates.due_date ?? null) !== (prev.due_date ?? null)) changed.due_date = updates.due_date as any;
        if ('assigned_to' in updates && (updates.assigned_to ?? null) !== (prev.assigned_to ?? null)) changed.assigned_to = updates.assigned_to as any;
        if (Object.keys(changed).length > 0) this.notifyChange(updatedTask.id, changed, prev);
      }

      return updatedTask;
    } catch (error) {
      console.error('Error updating task:', error);
      throw error;
    }
  }

  /**
   * Delete a task
   */
  static async deleteTask(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting task:', error);
      throw error;
    }
  }

  /**
   * Update a single field on a task (for inline edits).
   * Handles completed_at logic for status changes.
   */
  static async updateField(id: string, field: string, value: any): Promise<void> {
    try {
      // Snapshot previous value if we'll need it for the announcer.
      const announceField = field === 'status' || field === 'due_date' || field === 'assigned_to';
      let prev: { status?: string | null; due_date?: string | null; assigned_to?: string | null } | null = null;
      if (announceField) {
        const { data: existing } = await supabase
          .from('tasks')
          .select('status, due_date, assigned_to')
          .eq('id', id)
          .single();
        if (existing) prev = existing;
      }

      const payload: Record<string, any> = {
        [field]: value,
        updated_at: new Date().toISOString(),
      };

      // Handle completed_at on status changes
      if (field === 'status' && value === 'complete') {
        payload.completed_at = new Date().toISOString();
      } else if (field === 'status' && value !== 'complete') {
        payload.completed_at = null;
      }

      const { error } = await supabase
        .from('tasks')
        .update(payload)
        .eq('id', id);

      if (error) throw error;

      // Auto-clone if completing a recurring task
      if (field === 'status' && value === 'complete') {
        const task = await this.getTaskById(id);
        if (task && this.isRecurringTask(task)) {
          await this.cloneRecurringTask(task);
        }
        // Auto-complete parent deliverable if all subtasks are done
        if (task?.parent_task_id) {
          this.checkDeliverableAutoComplete(task.parent_task_id).catch(() => {});
        }
      }

      // Fire DM if the assignment field was just touched. Server-side
      // dedupes via last_assignee_notified_to so re-saves of the same
      // assignee don't spam them.
      if (field === 'assigned_to' && value) {
        this.notifyAssignment(id);
      }

      // Auto-shift announcer for the three visibility fields. Only
      // fires if the value actually changed (skips re-saves of the same
      // value). Same single-field shape that updateTask uses, just
      // narrowed to one field at a time.
      if (announceField && prev) {
        const prevVal = (prev as any)[field] ?? null;
        if ((value ?? null) !== prevVal) {
          this.notifyChange(id, { [field]: value } as any, prev);
        }
      }
    } catch (error) {
      console.error('Error updating task field:', error);
      throw error;
    }
  }

  /**
   * Check if all subtasks of a parent task are complete, and if so,
   * auto-complete the parent task and its linked deliverable.
   */
  static async checkDeliverableAutoComplete(parentTaskId: string): Promise<boolean> {
    try {
      const subtasks = await this.getSubtasks(parentTaskId);
      if (subtasks.length === 0) return false;

      const allComplete = subtasks.every(s => s.status === 'complete');
      if (!allComplete) return false;

      // Mark deliverable as complete
      const { error: dErr } = await supabase
        .from('deliverables')
        .update({ status: 'complete', updated_at: new Date().toISOString() })
        .eq('parent_task_id', parentTaskId);

      // Mark parent task as complete (ignore dErr — parent may not be a deliverable)
      await this.updateTask(parentTaskId, { status: 'complete' });

      return true;
    } catch (error) {
      console.error('Error in deliverable auto-complete:', error);
      return false;
    }
  }

  /**
   * Reorder tasks by updating sort_order for multiple tasks
   */
  static async reorderTasks(moves: { id: string; sort_order: number }[]): Promise<void> {
    try {
      await Promise.all(
        moves.map(({ id, sort_order }) =>
          supabase.from('tasks').update({ sort_order }).eq('id', id)
        )
      );
    } catch (error) {
      console.error('Error reordering tasks:', error);
      throw error;
    }
  }

  /**
   * Get tasks assigned to a specific user
   */
  static async getTasksForUser(userId: string): Promise<Task[]> {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('assigned_to', userId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as Task[]) || [];
    } catch (error) {
      console.error('Error fetching tasks for user:', error);
      throw error;
    }
  }

  /**
   * Get tasks linked to a specific client
   */
  static async getTasksForClient(clientId: string): Promise<Task[]> {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('client_id', clientId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as Task[]) || [];
    } catch (error) {
      console.error('Error fetching tasks for client:', error);
      throw error;
    }
  }

  /**
   * Get subtasks of a parent task
   */
  static async getSubtasks(parentTaskId: string): Promise<Task[]> {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('parent_task_id', parentTaskId)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return (data as Task[]) || [];
    } catch (error) {
      console.error('Error fetching subtasks:', error);
      throw error;
    }
  }

  /**
   * Get overdue tasks (due_date < today, not complete)
   */
  static async getOverdueTasks(): Promise<Task[]> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .lt('due_date', today)
        .neq('status', 'complete')
        .order('due_date', { ascending: true });

      if (error) throw error;
      return (data as Task[]) || [];
    } catch (error) {
      console.error('Error fetching overdue tasks:', error);
      throw error;
    }
  }

  /**
   * Get tasks due within the next N days (not complete)
   */
  static async getTasksDueSoon(days: number = 7): Promise<Task[]> {
    try {
      const today = new Date();
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + days);

      const todayStr = today.toISOString().split('T')[0];
      const futureStr = futureDate.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .gte('due_date', todayStr)
        .lte('due_date', futureStr)
        .neq('status', 'complete')
        .order('due_date', { ascending: true });

      if (error) throw error;
      return (data as Task[]) || [];
    } catch (error) {
      console.error('Error fetching tasks due soon:', error);
      throw error;
    }
  }

  // ─── Comments ──────────────────────────────────────────────

  /**
   * Get comments for a task, organized into threads
   */
  static async getComments(taskId: string): Promise<TaskComment[]> {
    try {
      const { data, error } = await supabase
        .from('task_comments')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Build threaded structure
      const comments = (data as TaskComment[]) || [];
      const topLevel: TaskComment[] = [];
      const childMap = new Map<string, TaskComment[]>();

      for (const c of comments) {
        if (c.parent_comment_id) {
          if (!childMap.has(c.parent_comment_id)) childMap.set(c.parent_comment_id, []);
          childMap.get(c.parent_comment_id)!.push(c);
        } else {
          topLevel.push(c);
        }
      }

      for (const c of topLevel) {
        c.replies = childMap.get(c.id) || [];
      }

      return topLevel;
    } catch (error) {
      console.error('Error fetching comments:', error);
      throw error;
    }
  }

  /**
   * Get comment count for a task
   */
  static async getCommentCount(taskId: string): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('task_comments')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', taskId);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error fetching comment count:', error);
      return 0;
    }
  }

  /**
   * Get comment counts for multiple tasks at once
   */
  static async getCommentCounts(taskIds: string[]): Promise<Record<string, number>> {
    if (taskIds.length === 0) return {};
    try {
      const { data, error } = await supabase
        .from('task_comments')
        .select('task_id')
        .in('task_id', taskIds);

      if (error) throw error;

      const counts: Record<string, number> = {};
      for (const row of data || []) {
        counts[row.task_id] = (counts[row.task_id] || 0) + 1;
      }
      return counts;
    } catch (error) {
      console.error('Error fetching comment counts:', error);
      return {};
    }
  }

  /**
   * Bulk-fetch checklist progress for many tasks at once. Returns a map
   * of task_id → { done, total }. Tasks with no checklist items are
   * absent from the map (not present with zeros) — render call sites
   * can short-circuit on `if (counts[taskId])`.
   *
   * Used by the tasks page to render a clickable checklist badge on
   * each row (added 2026-05-07 — checklists were previously invisible
   * outside the task detail modal).
   */
  static async getChecklistCounts(taskIds: string[]): Promise<Record<string, { done: number; total: number }>> {
    if (taskIds.length === 0) return {};
    try {
      const { data, error } = await supabase
        .from('task_checklist_items')
        .select('task_id, is_done')
        .in('task_id', taskIds);

      if (error) throw error;

      const counts: Record<string, { done: number; total: number }> = {};
      for (const row of (data || []) as Array<{ task_id: string; is_done: boolean | null }>) {
        if (!counts[row.task_id]) counts[row.task_id] = { done: 0, total: 0 };
        counts[row.task_id].total++;
        if (row.is_done) counts[row.task_id].done++;
      }
      return counts;
    } catch (error) {
      console.error('Error fetching checklist counts:', error);
      return {};
    }
  }

  /**
   * Add a comment to a task. Updates latest_comment on the task for backward compat.
   */
  static async addComment(
    taskId: string,
    userId: string,
    userName: string,
    content: string,
    parentCommentId?: string
  ): Promise<TaskComment> {
    try {
      const { data, error } = await supabase
        .from('task_comments')
        .insert({
          task_id: taskId,
          user_id: userId,
          user_name: userName,
          content,
          parent_comment_id: parentCommentId || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Update latest_comment on the task (backward compat)
      await supabase
        .from('tasks')
        .update({
          latest_comment: content.substring(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId);

      return data as TaskComment;
    } catch (error) {
      console.error('Error adding comment:', error);
      throw error;
    }
  }

  /**
   * Update a comment
   */
  static async updateComment(commentId: string, content: string): Promise<TaskComment> {
    try {
      const { data, error } = await supabase
        .from('task_comments')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', commentId)
        .select()
        .single();

      if (error) throw error;
      return data as TaskComment;
    } catch (error) {
      console.error('Error updating comment:', error);
      throw error;
    }
  }

  /**
   * Delete a comment
   */
  static async deleteComment(commentId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('task_comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting comment:', error);
      throw error;
    }
  }

  // ─── Attachments ───────────────────────────────────────────

  /**
   * Get attachments for a task
   */
  static async getAttachments(taskId: string): Promise<TaskAttachment[]> {
    try {
      const { data, error } = await supabase
        .from('task_attachments')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as TaskAttachment[]) || [];
    } catch (error) {
      console.error('Error fetching attachments:', error);
      throw error;
    }
  }

  /**
   * Get attachment count for a task
   */
  static async getAttachmentCount(taskId: string): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('task_attachments')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', taskId);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error fetching attachment count:', error);
      return 0;
    }
  }

  /**
   * Upload a file and create an attachment record
   */
  static async uploadAttachment(
    taskId: string,
    file: File,
    uploadedBy: string,
    uploadedByName: string
  ): Promise<TaskAttachment> {
    try {
      const fileExt = file.name.split('.').pop();
      const storagePath = `${taskId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('task-attachments')
        .upload(storagePath, file, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      // Get a signed URL (private bucket)
      const { data: signedData } = await supabase.storage
        .from('task-attachments')
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365); // 1 year

      const fileUrl = signedData?.signedUrl || storagePath;

      const { data, error } = await supabase
        .from('task_attachments')
        .insert({
          task_id: taskId,
          file_name: file.name,
          file_url: fileUrl,
          file_size: file.size,
          mime_type: file.type,
          uploaded_by: uploadedBy,
          uploaded_by_name: uploadedByName,
        })
        .select()
        .single();

      if (error) throw error;
      return data as TaskAttachment;
    } catch (error) {
      console.error('Error uploading attachment:', error);
      throw error;
    }
  }

  /**
   * Delete an attachment (removes storage file and DB record)
   */
  static async deleteAttachment(attachmentId: string): Promise<void> {
    try {
      // Get the attachment to find the storage path
      const { data: attachment, error: fetchError } = await supabase
        .from('task_attachments')
        .select('*')
        .eq('id', attachmentId)
        .single();

      if (fetchError) throw fetchError;

      // Try to extract storage path from URL and delete from storage
      if (attachment?.file_url) {
        const match = attachment.file_url.match(/task-attachments\/(.+?)(\?|$)/);
        if (match) {
          await supabase.storage.from('task-attachments').remove([match[1]]);
        }
      }

      // Delete DB record
      const { error } = await supabase
        .from('task_attachments')
        .delete()
        .eq('id', attachmentId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting attachment:', error);
      throw error;
    }
  }

  // ─── Checklist ─────────────────────────────────────────────

  /**
   * Get checklist items for a task
   */
  static async getChecklist(taskId: string): Promise<TaskChecklistItem[]> {
    try {
      const { data, error } = await supabase
        .from('task_checklist_items')
        .select('*')
        .eq('task_id', taskId)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data as TaskChecklistItem[]) || [];
    } catch (error) {
      console.error('Error fetching checklist:', error);
      throw error;
    }
  }

  /**
   * Add a checklist item
   */
  static async addChecklistItem(taskId: string, text: string, displayOrder?: number): Promise<TaskChecklistItem> {
    try {
      const { data, error } = await supabase
        .from('task_checklist_items')
        .insert({
          task_id: taskId,
          text,
          display_order: displayOrder ?? 0,
        })
        .select()
        .single();

      if (error) throw error;
      return data as TaskChecklistItem;
    } catch (error) {
      console.error('Error adding checklist item:', error);
      throw error;
    }
  }

  /**
   * Toggle a checklist item's done state
   */
  static async toggleChecklistItem(itemId: string, isDone: boolean): Promise<void> {
    try {
      const { error } = await supabase
        .from('task_checklist_items')
        .update({ is_done: isDone })
        .eq('id', itemId);

      if (error) throw error;
    } catch (error) {
      console.error('Error toggling checklist item:', error);
      throw error;
    }
  }

  /**
   * Update checklist item text
   */
  static async updateChecklistItem(itemId: string, text: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('task_checklist_items')
        .update({ text })
        .eq('id', itemId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating checklist item:', error);
      throw error;
    }
  }

  /**
   * Delete a checklist item
   */
  static async deleteChecklistItem(itemId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('task_checklist_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting checklist item:', error);
      throw error;
    }
  }

  // ─── Dashboard Queries ─────────────────────────────────────

  /**
   * Get dashboard stats for a specific user
   */
  static async getDashboardStats(userId: string): Promise<DashboardStats> {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('assigned_to', userId);

      if (error) throw error;
      const tasks = (data as Task[]) || [];
      return this.computeStats(tasks);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      throw error;
    }
  }

  /**
   * Get admin dashboard stats (all tasks)
   */
  static async getAdminDashboardStats(): Promise<{
    overall: DashboardStats;
    byUser: { userId: string; userName: string; stats: DashboardStats }[];
    byClient: { clientId: string; clientName: string; count: number }[];
  }> {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const tasks = (data as Task[]) || [];

      // Overall stats
      const overall = this.computeStats(tasks);

      // Group by user
      const userMap = new Map<string, { name: string; tasks: Task[] }>();
      for (const t of tasks) {
        const key = t.assigned_to || '_unassigned';
        if (!userMap.has(key)) {
          userMap.set(key, { name: t.assigned_to_name || 'Unassigned', tasks: [] });
        }
        userMap.get(key)!.tasks.push(t);
      }

      const byUser = Array.from(userMap.entries()).map(([userId, { name, tasks: userTasks }]) => ({
        userId,
        userName: name,
        stats: this.computeStats(userTasks),
      }));

      // Group by client
      const clientMap = new Map<string, { name: string; count: number }>();
      for (const t of tasks) {
        if (t.client_id) {
          if (!clientMap.has(t.client_id)) {
            clientMap.set(t.client_id, { name: t.client_id, count: 0 });
          }
          clientMap.get(t.client_id)!.count++;
        }
      }

      const byClient = Array.from(clientMap.entries()).map(([clientId, { name, count }]) => ({
        clientId,
        clientName: name,
        count,
      }));

      return { overall, byUser, byClient };
    } catch (error) {
      console.error('Error fetching admin dashboard stats:', error);
      throw error;
    }
  }

  /**
   * Get task data for a specific client dashboard
   */
  static async getClientDashboardData(clientId: string): Promise<{
    tasks: Task[];
    stats: DashboardStats;
  }> {
    try {
      const tasks = await this.getTasksForClient(clientId);
      return { tasks, stats: this.computeStats(tasks) };
    } catch (error) {
      console.error('Error fetching client dashboard:', error);
      throw error;
    }
  }

  /**
   * Compute stats from a list of tasks
   */
  private static computeStats(tasks: Task[]): DashboardStats {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    const byStatus: Record<string, number> = {};
    let overdue = 0;
    let dueThisWeek = 0;
    let completedThisWeek = 0;
    let inProgress = 0;

    for (const t of tasks) {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;

      if (t.status === 'in_progress') inProgress++;

      if (t.due_date && t.due_date < todayStr && t.status !== 'complete') {
        overdue++;
      }

      if (t.due_date && t.due_date >= todayStr && t.due_date <= weekEndStr && t.status !== 'complete') {
        dueThisWeek++;
      }

      if (t.status === 'complete' && t.completed_at) {
        const completedDate = new Date(t.completed_at);
        if (completedDate >= weekAgo) {
          completedThisWeek++;
        }
      }
    }

    return {
      total: tasks.length,
      overdue,
      dueThisWeek,
      completedThisWeek,
      inProgress,
      byStatus,
    };
  }

  // ─── Recurring ─────────────────────────────────────────────

  /**
   * Calculate the next due date based on recurring config
   */
  static calculateNextDueDate(currentDueDate: string | null, config: RecurringConfig): string {
    const base = currentDueDate ? new Date(currentDueDate + 'T00:00:00') : new Date();

    switch (config.frequency) {
      case 'daily':
        base.setDate(base.getDate() + 1);
        break;
      case 'weekly': {
        base.setDate(base.getDate() + 7);
        if (config.day_of_week !== undefined) {
          // Adjust to next occurrence of the specified day
          const diff = (config.day_of_week - base.getDay() + 7) % 7;
          if (diff > 0) base.setDate(base.getDate() + diff);
        }
        break;
      }
      case 'monthly': {
        base.setMonth(base.getMonth() + 1);
        if (config.day_of_month) {
          const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
          base.setDate(Math.min(config.day_of_month, lastDay));
        }
        break;
      }
    }

    const year = base.getFullYear();
    const month = String(base.getMonth() + 1).padStart(2, '0');
    const day = String(base.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Clone a recurring task with the next due date
   */
  /** Check if a task should recur based on recurring_config or frequency field */
  static isRecurringTask(task: Task): boolean {
    if (task.recurring_config && (task.recurring_config as RecurringConfig).frequency) return true;
    return ['daily', 'weekly', 'monthly', 'recurring'].includes(task.frequency);
  }

  /** Build a RecurringConfig from the frequency field when recurring_config is null */
  private static buildConfigFromFrequency(task: Task): RecurringConfig {
    const freqMap: Record<string, 'daily' | 'weekly' | 'monthly'> = {
      daily: 'daily',
      weekly: 'weekly',
      monthly: 'monthly',
      recurring: 'weekly', // default "recurring" to weekly
    };
    return { frequency: freqMap[task.frequency] || 'weekly' };
  }

  static async cloneRecurringTask(task: Task): Promise<Task | null> {
    try {
      let config = task.recurring_config as RecurringConfig;
      // If recurring_config is null but frequency indicates recurring, auto-generate config
      if (!config || !config.frequency) {
        if (!this.isRecurringTask(task)) return null;
        config = this.buildConfigFromFrequency(task);
      }

      const nextDueDate = this.calculateNextDueDate(task.due_date, config);

      // Check end_date
      if (config.end_date && nextDueDate > config.end_date) return null;

      const newTask = await this.createTask({
        task_name: task.task_name,
        assigned_to: task.assigned_to,
        assigned_to_name: task.assigned_to_name,
        due_date: nextDueDate,
        frequency: task.frequency,
        task_type: task.task_type,
        link: task.link,
        description: task.description,
        status: 'to_do',
        priority: task.priority,
        client_id: task.client_id,
        parent_task_id: task.parent_task_id,
        recurring_config: task.recurring_config || config,
        created_by: task.created_by,
        created_by_name: task.created_by_name,
      });

      // Backfill recurring_config on original task if it was null
      if (!task.recurring_config) {
        await supabase.from('tasks').update({ recurring_config: config }).eq('id', task.id);
      }

      return newTask;
    } catch (error) {
      console.error('Error cloning recurring task:', error);
      return null;
    }
  }

  /**
   * Generate any missed recurring instances (cron safety net)
   */
  static async generateMissedRecurring(): Promise<number> {
    try {
      // Fetch completed tasks that are recurring (either via recurring_config or frequency field)
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'complete')
        .in('frequency', ['daily', 'weekly', 'monthly', 'recurring']);

      if (error) throw error;
      const completedRecurring = (data as Task[]) || [];

      let generated = 0;
      for (const task of completedRecurring) {
        let config = task.recurring_config as RecurringConfig;
        if (!config?.frequency) {
          config = this.buildConfigFromFrequency(task);
        }

        // Check if a next instance already exists
        const nextDueDate = this.calculateNextDueDate(task.due_date, config);
        if (config.end_date && nextDueDate > config.end_date) continue;

        const { data: existing } = await supabase
          .from('tasks')
          .select('id')
          .eq('task_name', task.task_name)
          .eq('due_date', nextDueDate)
          .neq('status', 'complete')
          .limit(1);

        if (existing && existing.length > 0) continue;

        // Also check if there's any non-complete instance at all (by name + recurring frequency)
        const { data: anyPending } = await supabase
          .from('tasks')
          .select('id')
          .eq('task_name', task.task_name)
          .neq('status', 'complete')
          .in('frequency', ['daily', 'weekly', 'monthly', 'recurring'])
          .limit(1);

        if (anyPending && anyPending.length > 0) continue;

        await this.cloneRecurringTask(task);
        generated++;
      }

      return generated;
    } catch (error) {
      console.error('Error generating missed recurring tasks:', error);
      return 0;
    }
  }

  // ─── Automations ───────────────────────────────────────────

  /**
   * Get all automations
   */
  static async getAutomations(): Promise<TaskAutomation[]> {
    try {
      const { data, error } = await supabase
        .from('task_automations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as TaskAutomation[]) || [];
    } catch (error) {
      console.error('Error fetching automations:', error);
      throw error;
    }
  }

  /**
   * Create an automation rule
   */
  static async createAutomation(automation: Partial<TaskAutomation>): Promise<TaskAutomation> {
    try {
      const { data, error } = await supabase
        .from('task_automations')
        .insert(automation)
        .select()
        .single();

      if (error) throw error;
      return data as TaskAutomation;
    } catch (error) {
      console.error('Error creating automation:', error);
      throw error;
    }
  }

  /**
   * Update an automation
   */
  static async updateAutomation(id: string, updates: Partial<TaskAutomation>): Promise<TaskAutomation> {
    try {
      const { data, error } = await supabase
        .from('task_automations')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as TaskAutomation;
    } catch (error) {
      console.error('Error updating automation:', error);
      throw error;
    }
  }

  /**
   * Delete an automation
   */
  static async deleteAutomation(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('task_automations')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting automation:', error);
      throw error;
    }
  }

  /**
   * Get automation execution logs
   */
  static async getAutomationLogs(limit: number = 50): Promise<TaskAutomationLog[]> {
    try {
      const { data, error } = await supabase
        .from('task_automation_logs')
        .select('*')
        .order('executed_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data as TaskAutomationLog[]) || [];
    } catch (error) {
      console.error('Error fetching automation logs:', error);
      throw error;
    }
  }

  /**
   * Log an automation execution
   */
  static async logAutomationExecution(
    automationId: string | null,
    taskId: string | null,
    actionTaken: string,
    details?: Record<string, any>
  ): Promise<void> {
    try {
      await supabase
        .from('task_automation_logs')
        .insert({
          automation_id: automationId,
          task_id: taskId,
          action_taken: actionTaken,
          details: details || null,
        });
    } catch (error) {
      console.error('Error logging automation:', error);
    }
  }

  // ==================== TEMPLATES ====================

  static async getTemplates(): Promise<TaskTemplate[]> {
    try {
      const { data, error } = await supabase
        .from('task_templates')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as TaskTemplate[];
    } catch (error) {
      console.error('Error fetching templates:', error);
      return [];
    }
  }

  static async getTemplateById(id: string): Promise<TaskTemplate | null> {
    try {
      const { data, error } = await supabase
        .from('task_templates')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as TaskTemplate;
    } catch (error) {
      console.error('Error fetching template:', error);
      return null;
    }
  }

  static async createTemplate(template: Omit<TaskTemplate, 'id' | 'created_at' | 'updated_at'>): Promise<TaskTemplate | null> {
    try {
      const { data, error } = await supabase
        .from('task_templates')
        .insert(template)
        .select()
        .single();
      if (error) throw error;
      return data as TaskTemplate;
    } catch (error) {
      console.error('Error creating template:', error);
      return null;
    }
  }

  static async updateTemplate(id: string, updates: Partial<TaskTemplate>): Promise<void> {
    try {
      const { error } = await supabase
        .from('task_templates')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('Error updating template:', error);
    }
  }

  static async deleteTemplate(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('task_templates')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting template:', error);
    }
  }

  static async saveTaskAsTemplate(
    taskId: string,
    templateName: string,
    createdBy: string | null
  ): Promise<TaskTemplate | null> {
    try {
      const task = await this.getTaskById(taskId);
      if (!task) return null;

      // Get checklist items
      const checklist = await this.getChecklist(taskId);
      const checklistItems = checklist.map(c => ({ text: c.text, is_done: false }));

      return await this.createTemplate({
        name: templateName,
        description: task.description,
        task_name_template: task.task_name,
        task_type: task.task_type,
        frequency: task.frequency,
        priority: task.priority,
        default_assigned_to: task.assigned_to,
        default_client_id: task.client_id,
        recurring_config: task.recurring_config,
        checklist_items: checklistItems,
        created_by: createdBy,
      });
    } catch (error) {
      console.error('Error saving task as template:', error);
      return null;
    }
  }

  static async createTaskFromTemplate(
    templateId: string,
    overrides: Partial<TaskInsert> & { created_by: string; created_by_name: string },
    fieldValues?: Record<string, string>
  ): Promise<Task | null> {
    try {
      const template = await this.getTemplateById(templateId);
      if (!template) return null;

      // Replace placeholders in task name
      let taskName = template.task_name_template;
      if (fieldValues) {
        for (const [key, val] of Object.entries(fieldValues)) {
          taskName = taskName.replace(`{{${key}}}`, val);
        }
      }

      const task = await this.createTask({
        task_name: taskName,
        description: template.description,
        task_type: template.task_type,
        frequency: template.frequency,
        priority: template.priority,
        assigned_to: template.default_assigned_to,
        assigned_to_name: null,
        default_client_id: template.default_client_id,
        client_id: template.default_client_id,
        recurring_config: template.recurring_config,
        template_id: template.id,
        status: 'to_do',
        link: null,
        latest_comment: null,
        parent_task_id: null,
        completed_at: null,
        ...overrides,
      } as any);

      // Create checklist items from template
      if (task && template.checklist_items?.length > 0) {
        for (let i = 0; i < template.checklist_items.length; i++) {
          await this.addChecklistItem(task.id, template.checklist_items[i].text, i);
        }
      }

      return task;
    } catch (error) {
      console.error('Error creating task from template:', error);
      return null;
    }
  }

  // ==================== FORM→TASK MAPPINGS ====================

  static async getFormTaskMappings(formId?: string): Promise<FormTaskMapping[]> {
    try {
      let query = supabase
        .from('form_task_mappings')
        .select('*')
        .order('created_at', { ascending: false });

      if (formId) {
        query = query.eq('form_id', formId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as FormTaskMapping[];
    } catch (error) {
      console.error('Error fetching form task mappings:', error);
      return [];
    }
  }

  static async createFormTaskMapping(mapping: Omit<FormTaskMapping, 'id' | 'created_at' | 'updated_at'>): Promise<FormTaskMapping | null> {
    try {
      const { data, error } = await supabase
        .from('form_task_mappings')
        .insert(mapping)
        .select()
        .single();
      if (error) throw error;
      return data as FormTaskMapping;
    } catch (error) {
      console.error('Error creating form task mapping:', error);
      return null;
    }
  }

  static async deleteFormTaskMapping(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('form_task_mappings')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting form task mapping:', error);
    }
  }
}
