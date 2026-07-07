'use client';

/**
 * Reimbursements — self-service expense reimbursement requests for any
 * logged-in team member. Users submit a request (amount, category, date,
 * receipt) and track their own requests here. Super-admins review the
 * pending queue on /expenses → "Requests" tab; on approval a request
 * becomes a real (unpaid) expense.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { PageHeader } from '@/components/ui/page-header';
import { KpiCard } from '@/components/ui/kpi-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { useToast } from '@/hooks/use-toast';
import { formatDate as fmtDate } from '@/lib/dateFormat';
import {
  Receipt, Plus, Calendar as CalendarIcon, X, Upload, FileText, CreditCard, Clock, CheckCircle2,
} from 'lucide-react';

type ExpenseType = 'travel' | 'software' | 'meals_drinks' | 'others';
type Status = 'pending' | 'approved' | 'rejected';

interface ReimbursementRequest {
  id: string;
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

const TYPE_LABEL: Record<ExpenseType, string> = {
  travel: 'Travel',
  software: 'Software',
  meals_drinks: 'Meals / Drinks',
  others: 'Others',
};
const STATUS_TONES: Record<Status, BadgeTone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};
const STATUS_LABEL: Record<Status, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const formatUSD = (n: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0,
}).format(n);
const formatDate = (iso: string | null) => (iso ? fmtDate(iso + (iso.length === 10 ? 'T00:00:00' : '')) : '—');

export default function ReimbursementsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [requests, setRequests] = useState<ReimbursementRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/reimbursements?scope=mine');
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load');
      setRequests(json.requests || []);
    } catch (err: any) {
      toast({ title: 'Could not load requests', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (user) load(); /* eslint-disable-next-line */ }, [user]);

  const pendingCount = useMemo(() => requests.filter(r => r.status === 'pending').length, [requests]);
  const approvedTotal = useMemo(
    () => requests.filter(r => r.status === 'approved').reduce((s, r) => s + Number(r.amount_usd || 0), 0),
    [requests],
  );
  const pendingTotal = useMemo(
    () => requests.filter(r => r.status === 'pending').reduce((s, r) => s + Number(r.amount_usd || 0), 0),
    [requests],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Receipt}
        title="Reimbursements"
        subtitle="Submit an expense for reimbursement and track its status"
        kicker="Resources · Reimbursements"
        kickerDot="amber"
        actions={(
          <Button variant="brand" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> New Request
          </Button>
        )}
      />

      {loading ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <Skeleton className="h-64 rounded-lg" />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <KpiCard icon={Clock} label="Pending" value={pendingCount} sub={pendingTotal > 0 ? formatUSD(pendingTotal) + ' awaiting review' : 'None awaiting review'} accent={pendingCount > 0 ? 'amber' : 'gray'} />
            <KpiCard icon={CheckCircle2} label="Approved" value={formatUSD(approvedTotal)} sub={`${requests.filter(r => r.status === 'approved').length} request${requests.filter(r => r.status === 'approved').length === 1 ? '' : 's'}`} accent="emerald" />
            <KpiCard icon={CreditCard} label="Total requests" value={requests.length} sub="All time" />
          </div>

          {requests.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No reimbursement requests yet"
              description="Submit your first expense for reimbursement — attach the receipt and we'll route it for review."
            >
              <Button variant="brand" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> New Request
              </Button>
            </EmptyState>
          ) : (
            <Card className="border-cream-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Date</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Category</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Description</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Amount</TableHead>
                    <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map(r => (
                    <TableRow key={r.id} className="border-gray-100">
                      <TableCell className="py-3 whitespace-nowrap">{formatDate(r.expense_date)}</TableCell>
                      <TableCell className="py-3">{TYPE_LABEL[r.expense_type]}</TableCell>
                      <TableCell className="py-3 max-w-[320px]">
                        <div className="truncate" title={r.description}>{r.description}</div>
                        {r.status === 'rejected' && r.review_note && (
                          <div className="text-[11px] text-rose-600 mt-0.5 truncate" title={r.review_note}>Note: {r.review_note}</div>
                        )}
                      </TableCell>
                      <TableCell className="py-3 text-right tabular-nums font-medium">{formatUSD(Number(r.amount_usd))}</TableCell>
                      <TableCell className="py-3"><StatusBadge tone={STATUS_TONES[r.status]} size="sm">{STATUS_LABEL[r.status]}</StatusBadge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}

      <NewRequestDialog open={addOpen} onClose={() => setAddOpen(false)} onCreated={() => { setAddOpen(false); load(); }} />
    </div>
  );
}

// ─── DateField (mirrors app/expenses/page.tsx canonical picker) ──────────
function DateField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const selectedDate = value ? new Date(value + 'T00:00:00') : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 w-full justify-start font-normal focus-brand" style={{ color: value ? '#111827' : '#9ca3af' }}>
          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
          {value ? fmtDate(selectedDate!) : (placeholder || 'Select date')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
        <CalendarPicker
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            if (!date) { onChange(''); return; }
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            onChange(`${y}-${m}-${d}`);
          }}
          initialFocus
          classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
          modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
        />
      </PopoverContent>
    </Popover>
  );
}

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
const MAX_SIZE = 10 * 1024 * 1024;

function NewRequestDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [amount, setAmount] = useState('');
  const [expenseType, setExpenseType] = useState<ExpenseType>('travel');
  const [expenseDate, setExpenseDate] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);

  function reset() {
    setAmount(''); setExpenseType('travel'); setExpenseDate(''); setDescription(''); setNotes(''); setFile(null);
  }

  function pickFile(f: File | null) {
    if (!f) { setFile(null); return; }
    if (f.size > MAX_SIZE) { toast({ title: 'File too large', description: 'Max 10 MB.', variant: 'destructive' }); return; }
    if (!ALLOWED_MIME.includes(f.type)) { toast({ title: 'Unsupported file', description: 'JPG, PNG, GIF, WebP or PDF only.', variant: 'destructive' }); return; }
    setFile(f);
  }

  async function submit() {
    if (!amount || Number(amount) <= 0) { toast({ title: 'Enter an amount', variant: 'destructive' }); return; }
    if (!expenseDate) { toast({ title: 'Pick the expense date', variant: 'destructive' }); return; }
    if (!description.trim()) { toast({ title: 'Add a description', variant: 'destructive' }); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/reimbursements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_usd: Number(amount),
          expense_type: expenseType,
          description: description.trim(),
          notes: notes.trim() || null,
          expense_date: expenseDate,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to submit');

      // Upload receipt if provided (non-fatal if it fails).
      if (file && json.request?.id) {
        const fd = new FormData();
        fd.append('file', file);
        const upRes = await fetch(`/api/reimbursements/${json.request.id}/attachments`, { method: 'POST', body: fd });
        if (!upRes.ok) {
          const upJson = await upRes.json().catch(() => ({}));
          toast({ title: 'Request submitted, but receipt upload failed', description: upJson?.error || 'You can re-submit with the receipt.', variant: 'destructive' });
          reset(); onCreated(); return;
        }
      }

      toast({ title: 'Reimbursement submitted', description: 'Your request is now pending review.' });
      reset();
      onCreated();
    } catch (err: any) {
      toast({ title: 'Submit failed', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>New Reimbursement Request</DialogTitle>
          <DialogDescription>Submit an out-of-pocket expense for reimbursement. Attach the receipt so it can be reviewed quickly.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount (USD) <RequiredAsterisk /></Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-9 focus-brand" />
            </div>
            <div className="space-y-1.5">
              <Label>Category <RequiredAsterisk /></Label>
              <Select value={expenseType} onValueChange={(v) => setExpenseType(v as ExpenseType)}>
                <SelectTrigger className="h-9 focus-brand"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABEL) as ExpenseType[]).map(t => (
                    <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Date of expense <RequiredAsterisk /></Label>
            <DateField value={expenseDate} onChange={setExpenseDate} placeholder="Select date" />
          </div>

          <div className="space-y-1.5">
            <Label>Description <RequiredAsterisk /></Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Client dinner — Seoul offsite" className="h-9 focus-brand" />
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional context for the reviewer" className="focus-brand min-h-[64px]" />
          </div>

          <div className="space-y-1.5">
            <Label>Receipt</Label>
            {file ? (
              <div className="flex items-center gap-2 rounded-md border border-cream-200 bg-cream-50/40 px-3 py-2">
                <FileText className="h-4 w-4 text-ink-warm-400 shrink-0" />
                <span className="text-sm truncate flex-1">{file.name}</span>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setFile(null)}><X className="h-4 w-4" /></Button>
              </div>
            ) : (
              <label className="flex items-center gap-2 rounded-md border border-dashed border-cream-300 px-3 py-2.5 cursor-pointer hover:bg-cream-50/40 transition-colors">
                <Upload className="h-4 w-4 text-ink-warm-400" />
                <span className="text-sm text-ink-warm-500">Attach receipt (JPG, PNG, PDF · max 10 MB)</span>
                <input type="file" className="hidden" accept={ALLOWED_MIME.join(',')} onChange={(e) => pickFile(e.target.files?.[0] || null)} />
              </label>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={submitting}>Cancel</Button>
          <Button variant="brand" onClick={submit} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
