'use client';

/**
 * Document Portal — Links "Active Clients" management + analytics surface
 * (spec §2/§5/§6/§8).
 *
 * Team surface for hosted Client Delivery PDFs: upload a PDF (stored in the
 * private client-documents bucket, page_count extracted client-side via pdf.js),
 * toggle share-with-client + download, set a one-off expiry, open the pdf.js
 * viewer, revoke, and drill into per-recipient / per-page engagement analytics
 * (L1 rollup columns → L2 recipient table → L3 per-page dwell). Grouped by client.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  DocumentPortalService, type DocumentRow, type DocumentRollup, type RecipientAnalytics,
} from '@/lib/documentPortalService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { FileText, Upload, Eye, Ban, BarChart3, CalendarClock, Flame, ChevronRight, ChevronDown, RotateCcw, Link2, Building2 } from 'lucide-react';
import ShareLinkDialog from '@/components/documents/ShareLinkDialog';
import { formatDate, formatDateTime } from '@/lib/dateFormat';

const STATUS_TONE: Record<string, BadgeTone> = { draft: 'neutral', published: 'success', revoked: 'danger' };

/**
 * Expiry means "readable through the END of the day you picked".
 *
 * [2026-07-27] This used to store `toIsoDate(day)` — a bare 'YYYY-MM-DD'. Every
 * reader then did `new Date('YYYY-MM-DD')`, which JS parses as UTC midnight,
 * i.e. 09:00 KST. So picking today killed the document immediately, and picking
 * a future date killed it at the START of that day rather than the end. It also
 * rendered as the previous day for any viewer west of UTC.
 *
 * Storing an absolute instant at 23:59:59.999 local time fixes the enforcement
 * AND the display in one move: the stored value is a real timestamptz, so
 * formatDate and the Calendar's `selected` both resolve to the intended day.
 */
function endOfLocalDayIso(day: Date): string {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
  return d.toISOString();
}

/**
 * Display labels for the stored lowercase statuses. "Draft" here means the row
 * exists but no PDF is attached yet — it is derived, never chosen by a user
 * (attaching a version publishes it). Client visibility is the Shared toggle.
 */
const STATUS_LABEL: Record<string, string> = { draft: 'Draft', published: 'Published', revoked: 'Revoked' };

interface ClientOpt { id: string; name: string; logo_url?: string | null }
type DocWithClient = DocumentRow & { client_name?: string };

function fmtFocused(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
}

export default function ActiveClientsDocuments() {
  const { toast } = useToast();
  const { user } = useAuth();
  const service = useMemo(() => new DocumentPortalService(supabase as any), []);
  const [docs, setDocs] = useState<DocWithClient[]>([]);
  const [rollups, setRollups] = useState<Map<string, DocumentRollup>>(new Map());
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ client_id: '', title: '', shared: true, download: false, file: null as File | null });

  // Analytics drill-down (L2/L3).
  const [analyticsDoc, setAnalyticsDoc] = useState<DocWithClient | null>(null);
  const [recipients, setRecipients] = useState<RecipientAnalytics[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  // Per-document share links (2026-08-05). Held here rather than inside the
  // dialog so the row's Share button controls which document it targets.
  const [shareDoc, setShareDoc] = useState<DocWithClient | null>(null);
  const [expandedRecipient, setExpandedRecipient] = useState<string | null>(null);
  // Per-client collapse, matching the other /links tabs.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapse = (name: string) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [docsRes, clientsRes] = await Promise.all([
        (supabase as any).from('documents').select('*, clients(name)').order('created_at', { ascending: false }),
        // [2026-07-31 per Andy] Active clients only. `archived_at IS NULL`
        // alone still listed every inactive-but-unarchived client, so the
        // upload picker was mostly names nobody is delivering to — and
        // picking a stale one silently attaches a document to a dead
        // engagement. is_active is the field /clients and /campaigns already
        // filter on, so this now matches what those pages call "active".
        (supabase as any)
          .from('clients')
          .select('id, name, logo_url')
          .is('archived_at', null)
          .eq('is_active', true)
          .order('name'),
      ]);
      const list = ((docsRes.data ?? []) as any[]).map(d => ({ ...d, client_name: d.clients?.name }));
      setDocs(list);
      setClients((clientsRes.data ?? []) as ClientOpt[]);
      try {
        setRollups(await service.getRollupsForDocuments(list.map((d: DocWithClient) => d.id)));
      } catch { /* rollups are best-effort — the list still renders */ }
    } catch (e) {
      toast({ title: 'Load failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [service, toast]);

  useEffect(() => { void load(); }, [load]);

  const handleUpload = async () => {
    if (!form.client_id || !form.title.trim() || !form.file) {
      toast({ title: 'Client, title and a PDF are required', variant: 'destructive' });
      return;
    }
    if (form.file.type !== 'application/pdf') {
      toast({ title: 'Please choose a PDF', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      // Page count via pdf.js (dynamic import — keeps pdf.js out of SSR).
      let pageCount: number | null = null;
      try {
        const { pdfjs } = await import('react-pdf');
        // Same-origin worker — a CDN URL throws SecurityError (see
        // scripts/copy-pdf-worker.mjs). Cross-origin worker scripts are banned
        // outright, so page_count would silently fall back to null.
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const buf = await form.file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: buf }).promise;
        pageCount = pdf.numPages;
      } catch { /* page_count stays null; not fatal */ }

      // Resolve the client's most recent stint (nullable).
      const { data: stint } = await (supabase as any)
        .from('client_stints').select('id').eq('client_id', form.client_id)
        .order('start_date', { ascending: false }).limit(1).maybeSingle();

      const path = `${form.client_id}/${(globalThis.crypto?.randomUUID?.() ?? Date.now())}.pdf`;
      const { error: upErr } = await (supabase as any).storage
        .from('client-documents').upload(path, form.file, { contentType: 'application/pdf', upsert: false });
      if (upErr) throw upErr;

      // The three writes below (create doc → add version → optional download flag)
      // aren't a transaction. If a later step fails we must roll back the earlier
      // ones (audit H3) — otherwise we strand the uploaded PDF in the bucket and/or
      // leave a version-less draft doc that renders in the list but can't be opened.
      let createdDocId: string | null = null;
      try {
        const doc = await service.createDocument({
          client_id: form.client_id,
          stint_id: (stint as any)?.id ?? null,
          title: form.title.trim(),
          shared: form.shared,
          created_by: user?.id ?? null,
        });
        createdDocId = doc.id;
        await service.addVersion(doc.id, { storage_ref: path, page_count: pageCount, uploaded_by: user?.id ?? null });
        if (form.download) await service.setDownloadEnabled(doc.id, true);
      } catch (inner) {
        // Best-effort compensation, then re-throw so the user still sees the error.
        try { await (supabase as any).storage.from('client-documents').remove([path]); } catch { /* ignore */ }
        if (createdDocId) {
          try { await (supabase as any).from('documents').delete().eq('id', createdDocId); } catch { /* ignore */ }
        }
        throw inner;
      }

      toast({ title: 'Document uploaded', description: form.title.trim() });
      setOpen(false);
      setForm({ client_id: '', title: '', shared: true, download: false, file: null });
      await load();
    } catch (e) {
      toast({ title: 'Upload failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const toggleShared = async (d: DocumentRow) => {
    try { await service.setShared(d.id, !d.shared); await load(); }
    catch (e) { toast({ title: 'Update failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' }); }
  };
  const toggleDownload = async (d: DocumentRow) => {
    try { await service.setDownloadEnabled(d.id, !d.download_enabled); await load(); }
    catch (e) { toast({ title: 'Update failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' }); }
  };
  const revoke = async (d: DocumentRow) => {
    try { await service.revoke(d.id); toast({ title: 'Access revoked' }); await load(); }
    catch (e) { toast({ title: 'Update failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' }); }
  };
  /**
   * Replace the PDF with a new version [2026-07-27]. addVersion() always
   * supported this — version_no increments, current_version_id repoints, and
   * the old version's access-log rows survive — but nothing in the UI ever
   * called it except first upload, so a document could never be corrected
   * after the fact.
   */
  const replaceVersion = async (d: DocumentRow, file: File) => {
    if (file.type !== 'application/pdf') {
      toast({ title: 'Please choose a PDF', variant: 'destructive' });
      return;
    }
    setReplacingId(d.id);
    try {
      let pageCount: number | null = null;
      try {
        const { pdfjs } = await import('react-pdf');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
        pageCount = pdf.numPages;
      } catch { /* page_count stays null; not fatal */ }

      const path = `${d.client_id}/${(globalThis.crypto?.randomUUID?.() ?? Date.now())}.pdf`;
      const { error: upErr } = await (supabase as any).storage
        .from('client-documents').upload(path, file, { contentType: 'application/pdf', upsert: false });
      if (upErr) throw upErr;
      try {
        await service.addVersion(d.id, { storage_ref: path, page_count: pageCount, uploaded_by: user?.id ?? null });
      } catch (inner) {
        // Same compensation as first upload — never strand the object.
        try { await (supabase as any).storage.from('client-documents').remove([path]); } catch { /* ignore */ }
        throw inner;
      }
      toast({
        title: 'New version published',
        description: 'Earlier reads stay in the log, attributed to the version they read.',
      });
      await load();
    } catch (e) {
      toast({ title: 'Replace failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setReplacingId(null);
    }
  };

  const restore = async (d: DocumentRow) => {
    try {
      await service.restore(d.id);
      toast({ title: 'Document restored', description: 'Still hidden from the client — flip Shared on when ready.' });
      await load();
    } catch (e) { toast({ title: 'Restore failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' }); }
  };
  const setExpiry = async (d: DocumentRow, expiresAt: string | null) => {
    try { await service.setExpiry(d.id, expiresAt); toast({ title: expiresAt ? 'Expiry set' : 'Expiry cleared' }); await load(); }
    catch (e) { toast({ title: 'Update failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' }); }
  };

  const openAnalytics = async (d: DocWithClient) => {
    setAnalyticsDoc(d);
    setExpandedRecipient(null);
    setAnalyticsLoading(true);
    try { setRecipients(await service.getDocumentAnalytics(d.id)); }
    catch (e) { toast({ title: 'Analytics failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' }); setRecipients([]); }
    finally { setAnalyticsLoading(false); }
  };

  // Client logo by name, so the group header can show the client's brand
  // mark like the other /links tabs do.
  const clientLogoByName = useMemo(() => {
    const map: Record<string, string> = {};
    clients.forEach(c => { if (c.logo_url) map[c.name] = c.logo_url; });
    return map;
  }, [clients]);

  // Group by client.
  const groups = useMemo(() => {
    const m = new Map<string, DocWithClient[]>();
    for (const d of docs) {
      const key = d.client_name || 'Unknown client';
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(d);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [docs]);

  return (
    <div className="space-y-4">
      {/* Chapter divider, so this tab opens the same way the link tabs do
          (they render a SectionHeader from the page). */}
      <SectionHeader
        label="Documents"
        dot="brand"
        counter={`${docs.length} document${docs.length === 1 ? '' : 's'}`}
        first
      />

      <div className="flex items-center gap-2">
        <p className="text-xs text-ink-warm-500">Hosted client-delivery PDFs, tracked in-portal.</p>
        <Button variant="brand" size="sm" className="ml-auto" onClick={() => setOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />Upload document
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : docs.length === 0 ? (
        <EmptyState icon={FileText} title="No documents yet" description="Upload a client-delivery PDF to host and track it in the portal.">
          <Button variant="brand" onClick={() => setOpen(true)}><Upload className="h-4 w-4 mr-2" />Upload document</Button>
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {groups.map(([clientName, list]) => (
            <div key={clientName}>
              {/* Same collapsible client header the other /links tabs use —
                  cream bar, client logo, count badge — so switching to
                  Documents doesn't change how the page reads. */}
              <div
                className={`flex items-center justify-between px-4 py-3 bg-cream-100 ${collapsed.has(clientName) ? 'rounded-lg' : 'rounded-t-lg'} border border-cream-200 ${collapsed.has(clientName) ? '' : 'border-b-0'} cursor-pointer select-none transition-all hover:bg-cream-200`}
                onClick={() => toggleCollapse(clientName)}
              >
                <div className="flex items-center gap-3">
                  {collapsed.has(clientName)
                    ? <ChevronRight className="w-4 h-4 text-ink-warm-700" />
                    : <ChevronDown className="w-4 h-4 text-ink-warm-700" />}
                  {clientLogoByName[clientName] ? (
                    <img src={clientLogoByName[clientName]} alt="" className="w-5 h-5 rounded object-contain bg-white border border-cream-200" />
                  ) : (
                    <Building2 className="w-4 h-4 text-ink-warm-700" />
                  )}
                  <h3 className="font-semibold text-ink-warm-700">{clientName}</h3>
                  <Badge variant="secondary" className="text-xs font-medium">{list.length}</Badge>
                </div>
              </div>

              {!collapsed.has(clientName) && (
              <Card className="border-cream-200 border-t-0 rounded-t-none overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                    <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Title</TableHead>
                    <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Status</TableHead>
                    <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Engagement</TableHead>
                    <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Shared</TableHead>
                    <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Download</TableHead>
                    <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Expires</TableHead>
                    <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map(d => {
                    const r = rollups.get(d.id);
                    const expired = !!d.expires_at && new Date(d.expires_at).getTime() < Date.now();
                    return (
                      <TableRow key={d.id} className="border-cream-100">
                        <TableCell className="py-3.5 px-5 font-medium">{d.title}</TableCell>
                        <TableCell className="py-3.5 px-5"><StatusBadge tone={STATUS_TONE[d.status] ?? 'neutral'} size="sm">{STATUS_LABEL[d.status] ?? d.status}</StatusBadge></TableCell>
                        <TableCell className="py-3.5 px-5">
                          {r && r.opens > 0 ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-ink-warm-700">
                              <span className="tabular-nums">{r.opens} Open{r.opens === 1 ? '' : 's'}</span>
                              <span className="text-ink-warm-300">·</span>
                              <span className="tabular-nums">
                                {r.recipients} {r.recipients === 1 ? 'Reader' : 'Readers'}
                              </span>
                              {r.hotCount > 0 && <Flame className="h-3.5 w-3.5 text-amber-500" />}
                            </span>
                          ) : <span className="text-xs text-ink-warm-400">—</span>}
                        </TableCell>
                        <TableCell className="py-3.5 px-5"><Switch checked={d.shared} onCheckedChange={() => toggleShared(d)} disabled={d.status === 'revoked'} /></TableCell>
                        <TableCell className="py-3.5 px-5"><Switch checked={d.download_enabled} onCheckedChange={() => toggleDownload(d)} disabled={d.status === 'revoked'} /></TableCell>
                        <TableCell className="py-3.5 px-5">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 px-2 font-normal text-xs focus-brand" disabled={d.status === 'revoked'}>
                                <CalendarClock className="h-3.5 w-3.5 mr-1" />
                                {d.expires_at
                                  ? <span className={expired ? 'text-rose-600' : ''}>{formatDate(d.expires_at)}</span>
                                  : <span className="text-ink-warm-400">Never</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
                              <Calendar
                                mode="single"
                                selected={d.expires_at ? new Date(d.expires_at) : undefined}
                                onSelect={(day) => { if (day) void setExpiry(d, endOfLocalDayIso(day)); }}
                                classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                                modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                              />
                              {d.expires_at && (
                                <div className="border-t p-2">
                                  <Button variant="ghost" size="sm" className="w-full text-xs text-rose-600 hover:bg-rose-50" onClick={() => void setExpiry(d, null)}>
                                    Clear expiry
                                  </Button>
                                </div>
                              )}
                            </PopoverContent>
                          </Popover>
                        </TableCell>
                        <TableCell className="py-3.5 px-5">
                          <div className="flex items-center justify-end gap-1">
                            {d.current_version_id && d.status !== 'revoked' && (
                              <Button asChild variant="outline" size="sm" className="h-7">
                                <Link href={`/documents/${d.id}`}><Eye className="h-3.5 w-3.5 mr-1" />View</Link>
                              </Button>
                            )}
                            {/* Only offer a share link once the document could
                                actually be opened — Shared off or no PDF means
                                the link would answer "not available" and look
                                broken to the client. */}
                            {d.current_version_id && d.status === 'published' && d.shared && (
                              <Button variant="outline" size="sm" className="h-7" onClick={() => setShareDoc(d)}>
                                <Link2 className="h-3.5 w-3.5 mr-1" />Share
                              </Button>
                            )}
                            <Button variant="outline" size="sm" className="h-7" onClick={() => openAnalytics(d)}>
                              <BarChart3 className="h-3.5 w-3.5 mr-1" />Analytics
                            </Button>
                            {d.status !== 'revoked' && (
                              <Button
                                asChild
                                variant="outline"
                                size="sm"
                                className="h-7 cursor-pointer"
                                disabled={replacingId === d.id}
                              >
                                <label>
                                  <Upload className="h-3.5 w-3.5 mr-1" />
                                  {replacingId === d.id ? 'Uploading…' : 'Replace'}
                                  <input
                                    type="file"
                                    accept="application/pdf"
                                    className="hidden"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      e.target.value = '';   // allow re-picking the same file
                                      if (f) void replaceVersion(d, f);
                                    }}
                                  />
                                </label>
                              </Button>
                            )}
                            {d.status === 'revoked' ? (
                              /* Revoke is reversible — nothing is destroyed by it. */
                              <Button variant="outline" size="sm" className="h-7" onClick={() => restore(d)}>
                                <RotateCcw className="h-3.5 w-3.5 mr-1" />Restore
                              </Button>
                            ) : (
                              <Button variant="outline" size="sm" className="h-7 border-rose-300 text-rose-600 hover:bg-rose-50" onClick={() => revoke(d)}>
                                <Ban className="h-3.5 w-3.5 mr-1" />Revoke
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </Card>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="!bg-white">
          <DialogHeader><DialogTitle>Upload client-delivery document</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Client <RequiredAsterisk /></Label>
              <Select value={form.client_id} onValueChange={(v) => setForm(f => ({ ...f, client_id: v }))}>
                <SelectTrigger className="h-9 focus-brand"><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent className="!bg-white">
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="doc-title">Title <RequiredAsterisk /></Label>
              <Input id="doc-title" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Week 3 Report" className="h-9 focus-brand" />
            </div>
            <div>
              <Label htmlFor="doc-file">PDF <RequiredAsterisk /></Label>
              {/* [2026-08-03 per feedback] Picking a file fills Title from the
                  filename (extension stripped) when Title is still empty, so
                  the common case is one action instead of two. Typing a Title
                  first — or editing it after — always wins; this never
                  overwrites what someone actually entered. */}
              <Input
                id="doc-file"
                type="file"
                accept="application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setForm(f => ({
                    ...f,
                    file,
                    title: f.title.trim() === '' && file
                      ? file.name.replace(/\.[^.]+$/, '')
                      : f.title,
                  }));
                }}
                className="h-9 focus-brand"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="doc-share" className="cursor-pointer">Share with the client</Label>
              <Switch id="doc-share" checked={form.shared} onCheckedChange={(v) => setForm(f => ({ ...f, shared: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="doc-dl" className="cursor-pointer">Allow download</Label>
              <Switch id="doc-dl" checked={form.download} onCheckedChange={(v) => setForm(f => ({ ...f, download: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={uploading}>Cancel</Button>
            <Button variant="brand" onClick={handleUpload} disabled={uploading}>{uploading ? 'Uploading…' : 'Upload'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Analytics drill-down: L2 recipients → L3 per-page dwell */}
      <Dialog open={!!analyticsDoc} onOpenChange={(o) => { if (!o) setAnalyticsDoc(null); }}>
        <DialogContent className="!bg-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8">
              <BarChart3 className="h-5 w-5 text-brand" />
              <span className="truncate">Engagement · {analyticsDoc?.title}</span>
            </DialogTitle>
          </DialogHeader>
          {analyticsLoading ? (
            <Skeleton className="h-40 rounded-lg" />
          ) : recipients.length === 0 ? (
            <EmptyState icon={Eye} title="No opens yet" description="Engagement will appear here once a recipient opens this document." />
          ) : (
            <div className="max-h-[70vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                    <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Recipient</TableHead>
                    <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Opens</TableHead>
                    <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Focused</TableHead>
                    <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Read</TableHead>
                    <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Last opened</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipients.map((rec) => {
                    const key = rec.viewer_email ?? 'internal';
                    const isOpen = expandedRecipient === key;
                    const pages = Object.entries(rec.pageDwell).map(([p, ms]) => ({ page: Number(p), ms })).sort((a, b) => a.page - b.page);
                    const maxMs = Math.max(1, ...pages.map(p => p.ms));
                    return (
                      <Fragment key={key}>
                        <TableRow className="border-cream-100 cursor-pointer hover:bg-cream-50/60" onClick={() => setExpandedRecipient(isOpen ? null : key)}>
                          <TableCell className="py-3.5 px-5">
                            <span className="inline-flex items-center gap-1.5 font-medium">
                              {pages.length > 0 ? (isOpen ? <ChevronDown className="h-3.5 w-3.5 text-ink-warm-400" /> : <ChevronRight className="h-3.5 w-3.5 text-ink-warm-400" />) : <span className="w-3.5" />}
                              {rec.viewer_email ?? <span className="italic text-ink-warm-400">Internal preview</span>}
                              {rec.hot && <Flame className="h-3.5 w-3.5 text-amber-500" />}
                            </span>
                          </TableCell>
                          <TableCell className="py-3 tabular-nums">{rec.opens}</TableCell>
                          <TableCell className="py-3 tabular-nums">{fmtFocused(rec.totalFocusedMs)}</TableCell>
                          <TableCell className="py-3 tabular-nums">{Math.round(rec.completion * 100)}%</TableCell>
                          <TableCell className="py-3.5 px-5 text-xs text-ink-warm-500">{rec.lastOpened ? formatDateTime(rec.lastOpened) : '—'}</TableCell>
                        </TableRow>
                        {isOpen && pages.length > 0 && (
                          <TableRow className="border-cream-100 bg-cream-50/40">
                            <TableCell colSpan={5} className="py-3.5 px-5">
                              <p className="text-xs font-semibold uppercase tracking-wider text-ink-warm-500 mb-2">Per-page attention</p>
                              <div className="space-y-1.5">
                                {pages.map(({ page, ms }) => (
                                  <div key={page} className="flex items-center gap-2">
                                    <span className="w-14 text-xs text-ink-warm-500 flex-shrink-0">Page {page}</span>
                                    <div className="flex-1 h-2 rounded-full bg-cream-200 overflow-hidden">
                                      <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round((ms / maxMs) * 100)}%` }} />
                                    </div>
                                    <span className="w-16 text-right text-xs tabular-nums text-ink-warm-700 flex-shrink-0">{fmtFocused(ms)}</span>
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ShareLinkDialog
        documentId={shareDoc?.id ?? null}
        documentTitle={shareDoc?.title ?? ''}
        open={!!shareDoc}
        onOpenChange={(o) => { if (!o) setShareDoc(null); }}
      />
    </div>
  );
}
