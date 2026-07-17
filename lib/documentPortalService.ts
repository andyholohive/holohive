/**
 * Document Portal — service layer (spec v4, 2026-07-11).
 *
 * Hosted PDF delivery + per-page engagement tracking, scoped to a client stint
 * (F1). Rendering is pdf.js live-render [Andy 2026-07-16]: store the PDF, render
 * client-side, track per-page dwell via IntersectionObserver — no image pipeline.
 *
 * The AccessLog is the source of truth: every analytic is a query over
 * document_access_log, never a stored counter. Client-side import via
 * `DocumentPortalService`; logAccess/analytics are also safe from a server route
 * with a service-role client (the portal viewer path).
 */

import { SupabaseClient } from '@supabase/supabase-js';

export type DocumentStatus = 'draft' | 'published' | 'revoked';
export type DocAccessEvent = 'doc_opened' | 'page_view' | 'doc_closed' | 'download';

export interface DocumentRow {
  id: string;
  stint_id: string | null;
  client_id: string;
  campaign_id: string | null;
  title: string;
  doc_type: string;
  shared: boolean;
  current_version_id: string | null;
  status: DocumentStatus;
  download_enabled: boolean;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersionRow {
  id: string;
  document_id: string;
  version_no: number;
  storage_ref: string;
  page_count: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface AccessEventInput {
  event_type: DocAccessEvent;
  document_id: string;
  portal_user_id?: string | null;
  viewer_email?: string | null;
  client_id?: string | null;
  stint_id?: string | null;
  version_id?: string | null;
  page_no?: number | null;
  dwell_ms?: number | null;
  session_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
}

/** One row per recipient (contact) in the document detail analytics table. */
export interface RecipientAnalytics {
  /** The gate email the recipient authenticated with (the portal's only identity). */
  viewer_email: string | null;
  portal_user_id: string | null;
  opens: number;            // distinct sessions with a doc_opened
  totalFocusedMs: number;   // sum of dwell_ms across page_view
  pagesViewed: number;      // distinct page_no with a page_view
  completion: number;       // pagesViewed / version page_count (0..1)
  lastOpened: string | null;
  hot: boolean;
  /** Per-page focused ms for the L3 drill-down (page_no → summed dwell_ms). */
  pageDwell: Record<number, number>;
}

/** L1 per-document rollup for the team document list. */
export interface DocumentRollup {
  document_id: string;
  opens: number;        // distinct doc_opened sessions
  recipients: number;   // distinct viewer_email (non-null)
  hotCount: number;     // recipients meeting the HOT rule
  lastOpened: string | null;
}

/** Team-tunable "hot" thresholds (spec §5 — a tunable rule, not stored). */
const HOT = { minSessions: 2, minFocusedMs: 3 * 60_000, minCompletion: 0.8 };

export class DocumentPortalService {
  constructor(private readonly supabase: SupabaseClient) {}

  /** Create a draft Document (a Client Delivery Links entry that will host a PDF). */
  async createDocument(input: {
    client_id: string;
    stint_id?: string | null;
    campaign_id?: string | null;
    title: string;
    doc_type?: string;
    shared?: boolean;
    created_by?: string | null;
  }): Promise<DocumentRow> {
    const { data, error } = await (this.supabase as any)
      .from('documents')
      .insert({
        client_id: input.client_id,
        stint_id: input.stint_id ?? null,
        campaign_id: input.campaign_id ?? null,
        title: input.title,
        doc_type: input.doc_type ?? 'client delivery',
        shared: input.shared ?? false,
        created_by: input.created_by ?? null,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as DocumentRow;
  }

  /**
   * Attach an uploaded PDF as a new version and make it current. First version
   * publishes the doc; a later version = "replace" (history retained, the
   * AccessLog references version_id so old analytics stay accurate).
   */
  async addVersion(
    documentId: string,
    input: { storage_ref: string; page_count?: number | null; uploaded_by?: string | null },
  ): Promise<DocumentVersionRow> {
    const { data: last } = await (this.supabase as any)
      .from('document_versions')
      .select('version_no')
      .eq('document_id', documentId)
      .order('version_no', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextNo = ((last as any)?.version_no ?? 0) + 1;

    const { data: version, error } = await (this.supabase as any)
      .from('document_versions')
      .insert({
        document_id: documentId,
        version_no: nextNo,
        storage_ref: input.storage_ref,
        page_count: input.page_count ?? null,
        uploaded_by: input.uploaded_by ?? null,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    // Publish the doc by pointing it at the new version. This MUST be checked
    // (audit H3): if it silently failed, addVersion returned "success" while the
    // document stayed draft with a dangling, unreferenced version row — the doc
    // renders but its View button is hidden. Surface the error so the caller can
    // clean up rather than reporting a half-created document as uploaded.
    const { error: pubErr } = await (this.supabase as any)
      .from('documents')
      .update({ current_version_id: (version as any).id, status: 'published', updated_at: new Date().toISOString() })
      .eq('id', documentId);
    if (pubErr) throw new Error(`version saved but publish failed: ${pubErr.message}`);
    return version as DocumentVersionRow;
  }

  /** Documents for a stint (the Active Clients management surface). */
  async listForStint(stintId: string): Promise<DocumentRow[]> {
    const { data, error } = await (this.supabase as any)
      .from('documents')
      .select('*')
      .eq('stint_id', stintId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as DocumentRow[];
  }

  async getDocument(documentId: string): Promise<{ document: DocumentRow; version: DocumentVersionRow | null }> {
    const { data: document, error } = await (this.supabase as any)
      .from('documents').select('*').eq('id', documentId).single();
    if (error || !document) throw new Error(error?.message || 'Document not found');
    let version: DocumentVersionRow | null = null;
    if ((document as DocumentRow).current_version_id) {
      const { data: v } = await (this.supabase as any)
        .from('document_versions').select('*').eq('id', (document as DocumentRow).current_version_id).maybeSingle();
      version = (v as DocumentVersionRow) ?? null;
    }
    return { document: document as DocumentRow, version };
  }

  // ── Controls (spec §8) ────────────────────────────────────────────
  async setShared(documentId: string, shared: boolean): Promise<void> {
    await this.patch(documentId, { shared });
  }
  async setDownloadEnabled(documentId: string, enabled: boolean): Promise<void> {
    await this.patch(documentId, { download_enabled: enabled });
  }
  async setExpiry(documentId: string, expiresAt: string | null): Promise<void> {
    await this.patch(documentId, { expires_at: expiresAt });
  }
  async revoke(documentId: string): Promise<void> {
    await this.patch(documentId, { status: 'revoked' });
  }
  private async patch(documentId: string, fields: Record<string, any>): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('documents').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', documentId);
    if (error) throw new Error(error.message);
  }

  /** Append an access event (server-side, from the portal viewer's beacon). */
  async logAccess(ev: AccessEventInput): Promise<void> {
    const { error } = await (this.supabase as any).from('document_access_log').insert({
      event_type: ev.event_type,
      document_id: ev.document_id,
      portal_user_id: ev.portal_user_id ?? null,
      viewer_email: ev.viewer_email ?? null,
      client_id: ev.client_id ?? null,
      stint_id: ev.stint_id ?? null,
      version_id: ev.version_id ?? null,
      page_no: ev.page_no ?? null,
      dwell_ms: ev.dwell_ms ?? null,
      session_id: ev.session_id ?? null,
      ip: ev.ip ?? null,
      user_agent: ev.user_agent ?? null,
    });
    if (error) throw new Error(error.message);
  }

  /**
   * Page through a document_access_log query in 1000-row windows so an
   * aggregation never silently truncates at the PostgREST default cap
   * (audit H4). Orders by `id` for a stable window and throws on error rather
   * than swallowing it. `build` must return a fresh query builder each call.
   */
  private async fetchAllAccessRows<T>(build: () => any): Promise<T[]> {
    const PAGE = 1000;
    const all: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await build().order('id', { ascending: true }).range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const chunk = (data ?? []) as T[];
      all.push(...chunk);
      if (chunk.length < PAGE) break;
    }
    return all;
  }

  /**
   * Per-recipient analytics for a document — all derived from the AccessLog
   * (spec §5/§6). Denominator for completion is the current version page_count.
   */
  async getDocumentAnalytics(documentId: string): Promise<RecipientAnalytics[]> {
    const { version } = await this.getDocument(documentId);
    const pageCount = version?.page_count ?? 0;

    // Paginate + surface errors (audit H4). document_access_log is the
    // fastest-growing table here; a plain select silently capped at 1000 rows
    // and every recipient's opens/completion/hot flag under-reported at once.
    const rows = await this.fetchAllAccessRows<{
      event_type: DocAccessEvent; portal_user_id: string | null; viewer_email: string | null;
      page_no: number | null; dwell_ms: number | null; session_id: string | null; occurred_at: string;
    }>(() => (this.supabase as any)
      .from('document_access_log')
      .select('event_type, portal_user_id, viewer_email, page_no, dwell_ms, session_id, occurred_at')
      .eq('document_id', documentId));

    // Recipients are keyed by the gate email; team-internal previews (no email)
    // collapse under a single "Internal preview" bucket so they never masquerade
    // as a client read.
    const byRecipient = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = r.viewer_email ?? ' internal';
      if (!byRecipient.has(key)) byRecipient.set(key, []);
      byRecipient.get(key)!.push(r);
    }

    const out: RecipientAnalytics[] = [];
    for (const [key, evs] of byRecipient) {
      const openSessions = new Set(evs.filter(e => e.event_type === 'doc_opened').map(e => e.session_id));
      const pages = new Set(evs.filter(e => e.event_type === 'page_view' && e.page_no != null).map(e => e.page_no));
      const totalFocusedMs = evs.reduce((s, e) => s + (e.event_type === 'page_view' ? (e.dwell_ms ?? 0) : 0), 0);
      const lastOpened = evs.reduce<string | null>((m, e) => (!m || e.occurred_at > m ? e.occurred_at : m), null);
      const completion = pageCount > 0 ? pages.size / pageCount : 0;
      const hot =
        openSessions.size >= HOT.minSessions ||
        totalFocusedMs >= HOT.minFocusedMs ||
        completion >= HOT.minCompletion;
      const pageDwell: Record<number, number> = {};
      for (const e of evs) {
        if (e.event_type === 'page_view' && e.page_no != null) {
          pageDwell[e.page_no] = (pageDwell[e.page_no] ?? 0) + (e.dwell_ms ?? 0);
        }
      }
      out.push({
        viewer_email: key === ' internal' ? null : key,
        portal_user_id: evs.find(e => e.portal_user_id)?.portal_user_id ?? null,
        opens: openSessions.size,
        totalFocusedMs,
        pagesViewed: pages.size,
        completion,
        lastOpened,
        hot,
        pageDwell,
      });
    }
    // Most-engaged first.
    out.sort((a, b) => b.totalFocusedMs - a.totalFocusedMs);
    return out;
  }

  /**
   * L1 rollup for a set of documents — one AccessLog scan, grouped by document.
   * Recipients count distinct gate emails; hot re-applies the HOT rule per email.
   */
  async getRollupsForDocuments(documentIds: string[]): Promise<Map<string, DocumentRollup>> {
    const result = new Map<string, DocumentRollup>();
    if (documentIds.length === 0) return result;

    // Paginate + surface errors (audit H4) — see getDocumentAnalytics.
    const rows = await this.fetchAllAccessRows<{
      document_id: string; event_type: DocAccessEvent; viewer_email: string | null;
      page_no: number | null; dwell_ms: number | null; session_id: string | null; occurred_at: string;
    }>(() => (this.supabase as any)
      .from('document_access_log')
      .select('document_id, event_type, viewer_email, page_no, dwell_ms, session_id, occurred_at')
      .in('document_id', documentIds));

    const byDoc = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!byDoc.has(r.document_id)) byDoc.set(r.document_id, []);
      byDoc.get(r.document_id)!.push(r);
    }

    for (const id of documentIds) {
      const evs = byDoc.get(id) ?? [];
      const openSessions = new Set(evs.filter(e => e.event_type === 'doc_opened').map(e => e.session_id));
      const recipients = new Set(evs.map(e => e.viewer_email).filter((e): e is string => !!e));
      let hotCount = 0;
      for (const email of recipients) {
        const rev = evs.filter(e => e.viewer_email === email);
        const sessions = new Set(rev.filter(e => e.event_type === 'doc_opened').map(e => e.session_id)).size;
        const focused = rev.reduce((s, e) => s + (e.event_type === 'page_view' ? (e.dwell_ms ?? 0) : 0), 0);
        if (sessions >= HOT.minSessions || focused >= HOT.minFocusedMs) hotCount += 1;
      }
      const lastOpened = evs.reduce<string | null>((m, e) => (!m || e.occurred_at > m ? e.occurred_at : m), null);
      result.set(id, { document_id: id, opens: openSessions.size, recipients: recipients.size, hotCount, lastOpened });
    }
    return result;
  }

  /**
   * Documents a client may see in their portal: shared + published + not revoked
   * + not past expiry. Scoped by client (the portal is stint-agnostic).
   */
  async listSharedForClient(clientId: string): Promise<Array<DocumentRow & { page_count: number | null }>> {
    const { data, error } = await (this.supabase as any)
      .from('documents')
      .select('*, document_versions!documents_current_version_fk(page_count)')
      .eq('client_id', clientId)
      .eq('shared', true)
      .eq('status', 'published')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    const now = Date.now();
    return ((data ?? []) as any[])
      .filter(d => !d.expires_at || new Date(d.expires_at).getTime() > now)
      .map(d => ({ ...d, page_count: d.document_versions?.page_count ?? null }));
  }
}
