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
import { EmptyState } from '@/components/ui/empty-state';
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
import { FileText, Upload, Eye, Ban, BarChart3, CalendarClock, Flame, ChevronRight, ChevronDown } from 'lucide-react';
import { formatDate, formatDateTime, toIsoDate } from '@/lib/dateFormat';

const STATUS_TONE: Record<string, BadgeTone> = { draft: 'neutral', published: 'success', revoked: 'danger' };

interface ClientOpt { id: string; name: string }
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
  const [expandedRecipient, setExpandedRecipient] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [docsRes, clientsRes] = await Promise.all([
        (supabase as any).from('documents').select('*, clients(name)').order('created_at', { ascending: false }),
        (supabase as any).from('clients').select('id, name').is('archived_at', null).order('name'),
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
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
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
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">{clientName}</p>
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Title</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Status</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Reads</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Shared</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Download</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Expires</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map(d => {
                    const r = rollups.get(d.id);
                    const expired = !!d.expires_at && new Date(d.expires_at).getTime() < Date.now();
                    return (
                      <TableRow key={d.id} className="border-gray-100">
                        <TableCell className="py-3 font-medium">{d.title}</TableCell>
                        <TableCell className="py-3"><StatusBadge tone={STATUS_TONE[d.status] ?? 'neutral'} size="sm">{d.status}</StatusBadge></TableCell>
                        <TableCell className="py-3">
                          {r && r.opens > 0 ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                              <span className="tabular-nums">{r.opens} open{r.opens === 1 ? '' : 's'}</span>
                              <span className="text-gray-300">·</span>
                              <span className="tabular-nums">{r.recipients} ppl</span>
                              {r.hotCount > 0 && <Flame className="h-3.5 w-3.5 text-amber-500" />}
                            </span>
                          ) : <span className="text-xs text-gray-400">—</span>}
                        </TableCell>
                        <TableCell className="py-3"><Switch checked={d.shared} onCheckedChange={() => toggleShared(d)} disabled={d.status === 'revoked'} /></TableCell>
                        <TableCell className="py-3"><Switch checked={d.download_enabled} onCheckedChange={() => toggleDownload(d)} disabled={d.status === 'revoked'} /></TableCell>
                        <TableCell className="py-3">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 px-2 font-normal text-xs focus-brand" disabled={d.status === 'revoked'}>
                                <CalendarClock className="h-3.5 w-3.5 mr-1" />
                                {d.expires_at ? <span className={expired ? 'text-rose-600' : ''}>{formatDate(d.expires_at)}</span> : <span className="text-gray-400">Set</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
                              <Calendar
                                mode="single"
                                selected={d.expires_at ? new Date(d.expires_at) : undefined}
                                onSelect={(day) => { if (day) void setExpiry(d, toIsoDate(day)); }}
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
                        <TableCell className="py-3">
                          <div className="flex items-center justify-end gap-1">
                            {d.current_version_id && d.status !== 'revoked' && (
                              <Button asChild variant="outline" size="sm" className="h-7">
                                <Link href={`/documents/${d.id}`}><Eye className="h-3.5 w-3.5 mr-1" />View</Link>
                              </Button>
                            )}
                            <Button variant="outline" size="sm" className="h-7" onClick={() => openAnalytics(d)}>
                              <BarChart3 className="h-3.5 w-3.5 mr-1" />Analytics
                            </Button>
                            {d.status !== 'revoked' && (
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
              <Input id="doc-file" type="file" accept="application/pdf" onChange={(e) => setForm(f => ({ ...f, file: e.target.files?.[0] ?? null }))} className="h-9 focus-brand" />
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
                  <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Recipient</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Opens</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Focused</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Read</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Last opened</TableHead>
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
                        <TableRow className="border-gray-100 cursor-pointer hover:bg-gray-50/60" onClick={() => setExpandedRecipient(isOpen ? null : key)}>
                          <TableCell className="py-3">
                            <span className="inline-flex items-center gap-1.5 font-medium">
                              {pages.length > 0 ? (isOpen ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />) : <span className="w-3.5" />}
                              {rec.viewer_email ?? <span className="italic text-gray-400">Internal preview</span>}
                              {rec.hot && <Flame className="h-3.5 w-3.5 text-amber-500" />}
                            </span>
                          </TableCell>
                          <TableCell className="py-3 tabular-nums">{rec.opens}</TableCell>
                          <TableCell className="py-3 tabular-nums">{fmtFocused(rec.totalFocusedMs)}</TableCell>
                          <TableCell className="py-3 tabular-nums">{Math.round(rec.completion * 100)}%</TableCell>
                          <TableCell className="py-3 text-xs text-gray-500">{rec.lastOpened ? formatDateTime(rec.lastOpened) : '—'}</TableCell>
                        </TableRow>
                        {isOpen && pages.length > 0 && (
                          <TableRow className="border-gray-100 bg-gray-50/40">
                            <TableCell colSpan={5} className="py-3">
                              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Per-page attention</p>
                              <div className="space-y-1.5">
                                {pages.map(({ page, ms }) => (
                                  <div key={page} className="flex items-center gap-2">
                                    <span className="w-14 text-xs text-gray-500 flex-shrink-0">Page {page}</span>
                                    <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
                                      <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round((ms / maxMs) * 100)}%` }} />
                                    </div>
                                    <span className="w-16 text-right text-xs tabular-nums text-gray-600 flex-shrink-0">{fmtFocused(ms)}</span>
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
    </div>
  );
}
