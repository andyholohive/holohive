'use client';

/**
 * Reimbursement review queue — rendered inside /expenses (super-admin) as
 * the "Requests" tab. Lists user-submitted reimbursement requests with
 * receipts and Approve / Reject actions. Approving creates a one-time
 * (unpaid) expense from the request, so the caller should refresh the
 * expenses table afterwards (onApproved).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatDate as fmtDate } from '@/lib/dateFormat';
import { Receipt, Check, X, Filter as FilterIcon, Paperclip, Loader2, Link2 } from 'lucide-react';

type ExpenseType = 'travel' | 'software' | 'meals_drinks' | 'others';
type Status = 'pending' | 'approved' | 'rejected';

interface ReimbursementRequest {
  id: string;
  requested_by: string | null;
  requester_name: string | null;
  requester_email: string | null;
  amount_usd: number;
  expense_type: ExpenseType;
  description: string;
  notes: string | null;
  expense_date: string;
  status: Status;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}
interface Attachment { id: string; file_name: string }
interface SimpleUser { id: string; name: string; email: string }

const TYPE_LABEL: Record<ExpenseType, string> = {
  travel: 'Travel', software: 'Software', meals_drinks: 'Meals / Drinks', others: 'Others',
};
const STATUS_TONES: Record<Status, BadgeTone> = { pending: 'warning', approved: 'success', rejected: 'danger' };
const STATUS_LABEL: Record<Status, string> = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };

const formatUSD = (n: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0,
}).format(n);
const formatDate = (iso: string | null) => (iso ? fmtDate(iso + (iso.length === 10 ? 'T00:00:00' : '')) : '—');

export function ReimbursementReviewPanel({
  users, onApproved, onPendingCountChange,
}: {
  users: SimpleUser[];
  onApproved: () => void;
  onPendingCountChange?: (n: number) => void;
}) {
  const { toast } = useToast();
  const [requests, setRequests] = useState<ReimbursementRequest[]>([]);
  const [attachmentsByReq, setAttachmentsByReq] = useState<Record<string, Attachment[]>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('pending');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ReimbursementRequest | null>(null);

  const userName = useCallback((id: string) => users.find(u => u.id === id)?.name || 'Unknown', [users]);

  function copyFormLink() {
    const url = `${window.location.origin}/public/reimbursements`;
    navigator.clipboard?.writeText(url).then(
      () => toast({ title: 'Public form link copied', description: url }),
      () => toast({ title: 'Copy failed', description: url, variant: 'destructive' }),
    );
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reimbursements?scope=all${statusFilter !== 'all' ? `&status=${statusFilter}` : ''}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load');
      const rows: ReimbursementRequest[] = json.requests || [];
      setRequests(rows);
      // Fetch receipts per request (small queue — parallel is fine).
      const entries = await Promise.all(rows.map(async (r) => {
        try {
          const aRes = await fetch(`/api/reimbursements/${r.id}/attachments`);
          const aJson = await aRes.json();
          return [r.id, aRes.ok ? (aJson.attachments || []) : []] as const;
        } catch { return [r.id, []] as const; }
      }));
      setAttachmentsByReq(Object.fromEntries(entries));
    } catch (err: any) {
      toast({ title: 'Could not load requests', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => { load(); }, [load]);

  // Report the pending count up (for the tab badge). Fetch it independently
  // of the current filter so the badge stays accurate on any filter.
  const refreshPendingCount = useCallback(async () => {
    if (!onPendingCountChange) return;
    try {
      const res = await fetch('/api/reimbursements?scope=all&status=pending');
      const json = await res.json();
      if (res.ok) onPendingCountChange((json.requests || []).length);
    } catch { /* non-fatal */ }
  }, [onPendingCountChange]);
  useEffect(() => { refreshPendingCount(); }, [refreshPendingCount, requests.length]);

  async function openReceipt(attId: string) {
    try {
      const res = await fetch(`/api/reimbursements/attachments/${attId}/signed-url`);
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json?.error || 'Could not open receipt');
      window.open(json.url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      toast({ title: 'Receipt unavailable', description: err.message, variant: 'destructive' });
    }
  }

  async function approve(req: ReimbursementRequest) {
    setActioningId(req.id);
    try {
      const res = await fetch(`/api/reimbursements/${req.id}/approve`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Approve failed');
      toast({ title: 'Approved', description: 'Created an unpaid expense from the request.' });
      await load();
      onApproved();
    } catch (err: any) {
      toast({ title: 'Approve failed', description: err.message, variant: 'destructive' });
    } finally {
      setActioningId(null);
    }
  }

  async function confirmReject(note: string) {
    if (!rejectTarget) return;
    setActioningId(rejectTarget.id);
    try {
      const res = await fetch(`/api/reimbursements/${rejectTarget.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Reject failed');
      toast({ title: 'Rejected', description: 'The requester will see the status update.' });
      setRejectTarget(null);
      await load();
    } catch (err: any) {
      toast({ title: 'Reject failed', description: err.message, variant: 'destructive' });
    } finally {
      setActioningId(null);
    }
  }

  const totalPending = useMemo(
    () => requests.filter(r => r.status === 'pending').reduce((s, r) => s + Number(r.amount_usd || 0), 0),
    [requests],
  );

  return (
    <div className="space-y-4">
      <Card className="border-cream-200 overflow-hidden">
        <div className="p-4 border-b border-cream-100 flex items-center gap-3 flex-wrap">
          <FilterIcon className="h-4 w-4 text-ink-warm-400 flex-shrink-0" />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as Status | 'all')}>
            <SelectTrigger className="w-[150px] h-9 text-sm focus-brand"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="ml-auto h-8" onClick={copyFormLink}>
            <Link2 className="h-3.5 w-3.5 mr-1.5" /> Copy form link
          </Button>
          <div className="text-xs text-ink-warm-500">
            {requests.length} request{requests.length === 1 ? '' : 's'}
            {statusFilter === 'pending' && totalPending > 0 ? ` · ${formatUSD(totalPending)} awaiting` : ''}
          </div>
        </div>

        {loading ? (
          <div className="p-4"><Skeleton className="h-40 rounded-lg" /></div>
        ) : requests.length === 0 ? (
          <div className="p-2">
            <EmptyState
              icon={Receipt}
              title={statusFilter === 'pending' ? 'No requests awaiting review' : 'No requests here'}
              description="Reimbursement requests submitted by the team will appear here for approval."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Submitted</TableHead>
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Requester</TableHead>
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Date</TableHead>
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Category</TableHead>
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Description</TableHead>
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Amount</TableHead>
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Receipt</TableHead>
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map(r => {
                const atts = attachmentsByReq[r.id] || [];
                const busy = actioningId === r.id;
                return (
                  <TableRow key={r.id} className="border-gray-100">
                    <TableCell className="py-3 whitespace-nowrap text-ink-warm-500">{formatDate(r.created_at)}</TableCell>
                    <TableCell className="py-3 whitespace-nowrap">
                      <div className="font-medium">{r.requester_name || (r.requested_by ? userName(r.requested_by) : 'Unknown')}</div>
                      {r.requester_email && <div className="text-[11px] text-ink-warm-400">{r.requester_email}</div>}
                    </TableCell>
                    <TableCell className="py-3 whitespace-nowrap">{formatDate(r.expense_date)}</TableCell>
                    <TableCell className="py-3">{TYPE_LABEL[r.expense_type]}</TableCell>
                    <TableCell className="py-3 max-w-[280px]">
                      <div className="truncate" title={r.description}>{r.description}</div>
                      {r.notes && <div className="text-[11px] text-ink-warm-400 truncate" title={r.notes}>{r.notes}</div>}
                      {r.status === 'rejected' && r.review_note && (
                        <div className="text-[11px] text-rose-600 mt-0.5 truncate" title={r.review_note}>Rejected: {r.review_note}</div>
                      )}
                    </TableCell>
                    <TableCell className="py-3 text-right tabular-nums font-medium">{formatUSD(Number(r.amount_usd))}</TableCell>
                    <TableCell className="py-3">
                      {atts.length === 0 ? (
                        <span className="text-xs text-ink-warm-400">—</span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {atts.map(a => (
                            <button key={a.id} type="button" onClick={() => openReceipt(a.id)} className="inline-flex items-center gap-1 text-xs text-brand hover:underline max-w-[140px]">
                              <Paperclip className="h-3 w-3 shrink-0" />
                              <span className="truncate">{a.file_name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-3 text-right whitespace-nowrap">
                      {r.status === 'pending' ? (
                        <div className="inline-flex items-center gap-1.5">
                          <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busy} onClick={() => approve(r)}>
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Check className="h-3.5 w-3.5 mr-1" /> Approve</>}
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 border-rose-300 text-rose-600 hover:bg-rose-50" disabled={busy} onClick={() => setRejectTarget(r)}>
                            <X className="h-3.5 w-3.5 mr-1" /> Reject
                          </Button>
                        </div>
                      ) : (
                        <StatusBadge tone={STATUS_TONES[r.status]} size="sm">{STATUS_LABEL[r.status]}</StatusBadge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <RejectDialog
        request={rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={confirmReject}
        busy={!!rejectTarget && actioningId === rejectTarget.id}
      />
    </div>
  );
}

function RejectDialog({
  request, onClose, onConfirm, busy,
}: {
  request: ReimbursementRequest | null;
  onClose: () => void;
  onConfirm: (note: string) => void;
  busy: boolean;
}) {
  const [note, setNote] = useState('');
  useEffect(() => { if (request) setNote(''); }, [request]);
  return (
    <Dialog open={!!request} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Reject reimbursement</DialogTitle>
          <DialogDescription>Optionally tell the requester why. They&apos;ll see this note on their request.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-1">
          <Label>Reason (optional)</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Missing itemized receipt" className="focus-brand min-h-[72px]" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={() => onConfirm(note.trim())} disabled={busy}>
            {busy ? 'Rejecting…' : 'Confirm Reject'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
