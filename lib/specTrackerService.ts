/**
 * Spec Tracker service layer.
 *
 * Feature-level rollout tracking for Jdot-style specs. Built
 * 2026-06-11 to answer "what's working and what's not, by feature."
 *
 * Tables: specs, spec_features (hierarchical), spec_feature_test_history.
 * "Mark broken" auto-files a backlog item via the existing backlog
 * service so issues never just sit in someone's head.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export type SpecStatus = 'planned' | 'in_progress' | 'shipped' | 'paused' | 'cancelled';
export type BuildStatus = 'not_started' | 'in_progress' | 'built';
export type TestStatus = 'untested' | 'working' | 'issues' | 'broken';

export type Spec = {
  id: string;
  name: string;
  summary: string | null;
  doc_url: string | null;
  status: SpecStatus;
  metadata: Record<string, any>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SpecFeature = {
  id: string;
  spec_id: string;
  parent_feature_id: string | null;
  name: string;
  description: string | null;
  sort_order: number;
  build_status: BuildStatus;
  test_status: TestStatus;
  last_tested_at: string | null;
  last_tested_by: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SpecFeatureTestHistoryRow = {
  id: string;
  feature_id: string;
  prev_status: TestStatus | null;
  new_status: TestStatus;
  notes: string | null;
  backlog_item_id: string | null;
  tested_by: string | null;
  tested_at: string;
};

/** Composite: spec + tree of features, used by the detail UI. */
export type SpecFull = Spec & {
  features: Array<SpecFeature & { children: SpecFeature[] }>;
  rollup: {
    total: number;
    built: number;
    working: number;
    issues: number;
    broken: number;
    untested: number;
  };
};

/** Spec card data — for the grid view. */
export type SpecCard = Spec & {
  rollup: SpecFull['rollup'];
};

// ─── Helpers ───────────────────────────────────────────────────────

/** Roll up feature counts to summary numbers shown on a card. */
function computeRollup(features: SpecFeature[]): SpecFull['rollup'] {
  const r = { total: features.length, built: 0, working: 0, issues: 0, broken: 0, untested: 0 };
  for (const f of features) {
    if (f.build_status === 'built') r.built++;
    switch (f.test_status) {
      case 'working':  r.working++;  break;
      case 'issues':   r.issues++;   break;
      case 'broken':   r.broken++;   break;
      case 'untested': r.untested++; break;
    }
  }
  return r;
}

/** Worst-status priority for the spec status chip (so one broken
 *  feature surfaces immediately on the grid). */
export function worstTestStatus(rollup: SpecFull['rollup']): TestStatus {
  if (rollup.broken > 0)  return 'broken';
  if (rollup.issues > 0)  return 'issues';
  if (rollup.untested > 0) return 'untested';
  return 'working';
}

// ─── Service ───────────────────────────────────────────────────────

export class SpecTrackerService {
  constructor(private readonly supabase: SupabaseClient) {}

  // ── Specs ────────────────────────────────────────────────────────

  /** Grid view — every spec with its feature rollup numbers. */
  async listAllWithRollup(): Promise<SpecCard[]> {
    const [{ data: specs, error: sErr }, { data: features, error: fErr }] = await Promise.all([
      (this.supabase as any).from('specs').select('*').order('created_at', { ascending: false }),
      (this.supabase as any).from('spec_features').select('id, spec_id, build_status, test_status'),
    ]);
    if (sErr) throw sErr;
    if (fErr) throw fErr;
    const featsBySpec = new Map<string, SpecFeature[]>();
    for (const f of (features || []) as SpecFeature[]) {
      const arr = featsBySpec.get(f.spec_id) || [];
      arr.push(f);
      featsBySpec.set(f.spec_id, arr);
    }
    return ((specs || []) as Spec[]).map(s => ({
      ...s,
      rollup: computeRollup(featsBySpec.get(s.id) || []),
    }));
  }

  /** Detail view — spec + hierarchical features + rollup. */
  async getFull(specId: string): Promise<SpecFull | null> {
    const { data: spec, error: sErr } = await (this.supabase as any)
      .from('specs').select('*').eq('id', specId).maybeSingle();
    if (sErr) throw sErr;
    if (!spec) return null;
    const { data: features, error: fErr } = await (this.supabase as any)
      .from('spec_features')
      .select('*')
      .eq('spec_id', specId)
      .order('sort_order');
    if (fErr) throw fErr;
    const rows = (features || []) as SpecFeature[];
    // Bucket sub-features by parent
    const childrenByParent = new Map<string, SpecFeature[]>();
    for (const f of rows) {
      if (!f.parent_feature_id) continue;
      const arr = childrenByParent.get(f.parent_feature_id) || [];
      arr.push(f);
      childrenByParent.set(f.parent_feature_id, arr);
    }
    const topLevel = rows
      .filter(f => !f.parent_feature_id)
      .map(f => ({ ...f, children: childrenByParent.get(f.id) || [] }));
    return {
      ...(spec as Spec),
      features: topLevel,
      rollup: computeRollup(rows),
    };
  }

  async createSpec(input: {
    name: string;
    summary?: string;
    doc_url?: string;
    status?: SpecStatus;
    metadata?: Record<string, any>;
    actorId: string | null;
  }): Promise<Spec> {
    const { data, error } = await (this.supabase as any)
      .from('specs')
      .insert({
        name: input.name,
        summary: input.summary ?? null,
        doc_url: input.doc_url ?? null,
        status: input.status ?? 'in_progress',
        metadata: input.metadata ?? {},
        created_by: input.actorId,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as Spec;
  }

  async updateSpec(specId: string, patch: Partial<Pick<Spec, 'name' | 'summary' | 'doc_url' | 'status' | 'metadata'>>): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('specs').update(patch).eq('id', specId);
    if (error) throw error;
  }

  async deleteSpec(specId: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('specs').delete().eq('id', specId);
    if (error) throw error;
  }

  // ── Features ─────────────────────────────────────────────────────

  async createFeature(input: {
    spec_id: string;
    parent_feature_id?: string | null;
    name: string;
    description?: string;
    sort_order?: number;
    build_status?: BuildStatus;
    test_status?: TestStatus;
    notes?: string;
    actorId: string | null;
  }): Promise<SpecFeature> {
    const { data, error } = await (this.supabase as any)
      .from('spec_features')
      .insert({
        spec_id: input.spec_id,
        parent_feature_id: input.parent_feature_id ?? null,
        name: input.name,
        description: input.description ?? null,
        sort_order: input.sort_order ?? 0,
        build_status: input.build_status ?? 'not_started',
        test_status: input.test_status ?? 'untested',
        notes: input.notes ?? null,
        created_by: input.actorId,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as SpecFeature;
  }

  async updateFeature(
    featureId: string,
    patch: Partial<Pick<SpecFeature, 'name' | 'description' | 'sort_order' | 'build_status' | 'notes'>>,
  ): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('spec_features').update(patch).eq('id', featureId);
    if (error) throw error;
  }

  async deleteFeature(featureId: string): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('spec_features').delete().eq('id', featureId);
    if (error) throw error;
  }

  // ── Test result logging ──────────────────────────────────────────

  /**
   * Set the test_status on a feature + write an audit row to
   * spec_feature_test_history. If newStatus is 'broken' or 'issues'
   * AND the caller provided bug-filing data, the backlog item is
   * created in the same transaction-shaped flow.
   *
   * The bug filing is intentionally optional even for 'broken' — the
   * caller can pass `null` if the user just wants to record the
   * status without surfacing a ticket (e.g., already filed
   * separately).
   */
  async logTestResult(input: {
    featureId: string;
    newStatus: TestStatus;
    notes?: string;
    actorId: string | null;
    // When provided, a backlog item is created and linked. Skipped
    // for 'working' / 'untested' transitions.
    fileBacklogItem?: {
      title: string;
      description?: string;
      area?: string;
    } | null;
  }): Promise<{
    feature: SpecFeature;
    backlogItemId: string | null;
  }> {
    // 1. Read current status for the audit prev_status
    const { data: existing, error: rErr } = await (this.supabase as any)
      .from('spec_features')
      .select('*')
      .eq('id', input.featureId)
      .single();
    if (rErr) throw rErr;
    const prevStatus = (existing as SpecFeature).test_status;

    // 2. Optionally file a backlog item BEFORE the status update so we
    //    can link both directions in one round-trip.
    let backlogItemId: string | null = null;
    if (input.fileBacklogItem && (input.newStatus === 'broken' || input.newStatus === 'issues')) {
      const { data: backlogRow, error: bErr } = await (this.supabase as any)
        .from('backlog_items')
        .insert({
          type: 'bug',
          area: input.fileBacklogItem.area ?? null,
          title: input.fileBacklogItem.title,
          description: input.fileBacklogItem.description ?? null,
          status: 'new',
          reporter_id: input.actorId,
          source: 'spec_tracker',
          source_ref: input.featureId,
          spec_feature_id: input.featureId,
        })
        .select('id')
        .single();
      if (bErr) throw bErr;
      backlogItemId = (backlogRow as { id: string }).id;
    }

    // 3. Update the feature's test_status
    const updatedAt = new Date().toISOString();
    const { data: updated, error: uErr } = await (this.supabase as any)
      .from('spec_features')
      .update({
        test_status: input.newStatus,
        last_tested_at: updatedAt,
        last_tested_by: input.actorId,
        // Notes only update if explicitly passed — preserves existing
        // long-form notes that aren't about the latest test.
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      })
      .eq('id', input.featureId)
      .select('*')
      .single();
    if (uErr) throw uErr;

    // 4. Write the audit row
    try {
      await (this.supabase as any)
        .from('spec_feature_test_history')
        .insert({
          feature_id: input.featureId,
          prev_status: prevStatus,
          new_status: input.newStatus,
          notes: input.notes ?? null,
          backlog_item_id: backlogItemId,
          tested_by: input.actorId,
        });
    } catch (err) {
      console.warn('SpecTracker: audit log write failed', err);
    }

    return {
      feature: updated as SpecFeature,
      backlogItemId,
    };
  }

  async getTestHistory(featureId: string): Promise<SpecFeatureTestHistoryRow[]> {
    const { data, error } = await (this.supabase as any)
      .from('spec_feature_test_history')
      .select('*')
      .eq('feature_id', featureId)
      .order('tested_at', { ascending: false });
    if (error) throw error;
    return (data || []) as SpecFeatureTestHistoryRow[];
  }

  // ── Bulk seed (used by the seeder for already-shipped specs) ────

  async bulkSeed(input: {
    spec: Omit<Parameters<SpecTrackerService['createSpec']>[0], 'actorId'>;
    features: Array<{
      name: string;
      description?: string;
      build_status?: BuildStatus;
      test_status?: TestStatus;
      children?: Array<{ name: string; description?: string; build_status?: BuildStatus; test_status?: TestStatus }>;
    }>;
    actorId: string | null;
  }): Promise<Spec> {
    const spec = await this.createSpec({ ...input.spec, actorId: input.actorId });
    let order = 0;
    for (const f of input.features) {
      const top = await this.createFeature({
        spec_id: spec.id,
        name: f.name,
        description: f.description,
        sort_order: order++,
        build_status: f.build_status ?? 'built',
        test_status: f.test_status ?? 'untested',
        actorId: input.actorId,
      });
      let childOrder = 0;
      for (const c of f.children || []) {
        await this.createFeature({
          spec_id: spec.id,
          parent_feature_id: top.id,
          name: c.name,
          description: c.description,
          sort_order: childOrder++,
          build_status: c.build_status ?? 'built',
          test_status: c.test_status ?? 'untested',
          actorId: input.actorId,
        });
      }
    }
    return spec;
  }
}
