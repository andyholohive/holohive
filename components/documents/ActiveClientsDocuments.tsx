'use client';

/**
 * Document Portal — Links "Active Clients" management surface (spec §2/§6).
 *
 * Team surface for hosted Client Delivery PDFs: upload a PDF (stored in the
 * private client-documents bucket, page_count extracted client-side via pdf.js),
 * toggle share-with-client + download, open the pdf.js viewer, and revoke.
 * Grouped by client. The 3-level engagement analytics drill-down is a later
 * phase; this ships upload → store → share → view.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { DocumentPortalService, type DocumentRow } from '@/lib/documentPortalService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { FileText, Upload, Eye, Ban } from 'lucide-react';
import { formatDate } from '@/lib/dateFormat';

const STATUS_TONE: Record<string, BadgeTone> = { draft: 'neutral', published: 'success', revoked: 'danger' };

interface ClientOpt { id: string; name: string }
type DocWithClient = DocumentRow & { client_name?: string };

export default function ActiveClientsDocuments() {
  const { toast } = useToast();
  const { user } = useAuth();
  const service = useMemo(() => new DocumentPortalService(supabase as any), []);
  const [docs, setDocs] = useState<DocWithClient[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ client_id: '', title: '', shared: true, download: false, file: null as File | null });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [docsRes, clientsRes] = await Promise.all([
        (supabase as any).from('documents').select('*, clients(name)').order('created_at', { ascending: false }),
        (supabase as any).from('clients').select('id, name').is('archived_at', null).order('name'),
      ]);
      setDocs(((docsRes.data ?? []) as any[]).map(d => ({ ...d, client_name: d.clients?.name })));
      setClients((clientsRes.data ?? []) as ClientOpt[]);
    } catch (e) {
      toast({ title: 'Load failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

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

      const doc = await service.createDocument({
        client_id: form.client_id,
        stint_id: (stint as any)?.id ?? null,
        title: form.title.trim(),
        shared: form.shared,
        created_by: user?.id ?? null,
      });
      await service.addVersion(doc.id, { storage_ref: path, page_count: pageCount, uploaded_by: user?.id ?? null });
      if (form.download) await service.setDownloadEnabled(doc.id, true);

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
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Shared</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Download</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Added</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map(d => (
                    <TableRow key={d.id} className="border-gray-100">
                      <TableCell className="py-3 font-medium">{d.title}</TableCell>
                      <TableCell className="py-3"><StatusBadge tone={STATUS_TONE[d.status] ?? 'neutral'} size="sm">{d.status}</StatusBadge></TableCell>
                      <TableCell className="py-3"><Switch checked={d.shared} onCheckedChange={() => toggleShared(d)} disabled={d.status === 'revoked'} /></TableCell>
                      <TableCell className="py-3"><Switch checked={d.download_enabled} onCheckedChange={() => toggleDownload(d)} disabled={d.status === 'revoked'} /></TableCell>
                      <TableCell className="py-3 text-xs text-gray-500">{d.created_at ? formatDate(d.created_at) : '—'}</TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center justify-end gap-1">
                          {d.current_version_id && d.status !== 'revoked' && (
                            <Button asChild variant="outline" size="sm" className="h-7">
                              <Link href={`/documents/${d.id}`}><Eye className="h-3.5 w-3.5 mr-1" />View</Link>
                            </Button>
                          )}
                          {d.status !== 'revoked' && (
                            <Button variant="outline" size="sm" className="h-7 border-rose-300 text-rose-600 hover:bg-rose-50" onClick={() => revoke(d)}>
                              <Ban className="h-3.5 w-3.5 mr-1" />Revoke
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
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
    </div>
  );
}
