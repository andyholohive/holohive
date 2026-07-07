'use client';

/**
 * Public reimbursement request form (no login). Shareable link; anyone can
 * submit a request (name, email, amount, category, date, description,
 * receipt). Posts to the allowlisted POST /api/public/reimbursements.
 * Super-admins review submissions on /expenses → Reimbursement Requests.
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { formatDate as fmtDate } from '@/lib/dateFormat';
import { Receipt, Calendar as CalendarIcon, Upload, FileText, X, CheckCircle2 } from 'lucide-react';

type ExpenseType = 'travel' | 'software' | 'meals_drinks' | 'others';

const TYPE_LABEL: Record<ExpenseType, string> = {
  travel: 'Travel',
  software: 'Software',
  meals_drinks: 'Meals / Drinks',
  others: 'Others',
};

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
const MAX_SIZE = 10 * 1024 * 1024;

export default function PublicReimbursementPage() {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseType, setExpenseType] = useState<ExpenseType>('travel');
  const [expenseDate, setExpenseDate] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);

  function reset() {
    setName(''); setEmail(''); setAmount(''); setExpenseType('travel');
    setExpenseDate(''); setDescription(''); setNotes(''); setFile(null);
  }

  function pickFile(f: File | null) {
    if (!f) { setFile(null); return; }
    if (f.size > MAX_SIZE) { toast({ title: 'File too large', description: 'Max 10 MB.', variant: 'destructive' }); return; }
    if (!ALLOWED_MIME.includes(f.type)) { toast({ title: 'Unsupported file', description: 'JPG, PNG, GIF, WebP or PDF only.', variant: 'destructive' }); return; }
    setFile(f);
  }

  async function submit() {
    if (!name.trim()) { toast({ title: 'Enter your name', variant: 'destructive' }); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { toast({ title: 'Enter a valid email', variant: 'destructive' }); return; }
    if (!amount || Number(amount) <= 0) { toast({ title: 'Enter an amount', variant: 'destructive' }); return; }
    if (!expenseDate) { toast({ title: 'Pick the expense date', variant: 'destructive' }); return; }
    if (!description.trim()) { toast({ title: 'Add a description', variant: 'destructive' }); return; }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('requester_name', name.trim());
      fd.append('requester_email', email.trim());
      fd.append('amount_usd', String(Number(amount)));
      fd.append('expense_type', expenseType);
      fd.append('description', description.trim());
      fd.append('notes', notes.trim());
      fd.append('expense_date', expenseDate);
      if (file) fd.append('file', file);

      const res = await fetch('/api/public/reimbursements', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to submit');

      if (json.receiptError) {
        toast({ title: 'Submitted, but the receipt failed to upload', description: json.receiptError, variant: 'destructive' });
      }
      reset();
      setDone(true);
    } catch (err: any) {
      toast({ title: 'Submit failed', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream-50 flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="h-9 w-9 rounded-xl bg-brand/10 flex items-center justify-center">
            <Receipt className="h-4.5 w-4.5 text-brand" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-ink-warm-900 leading-tight">Reimbursement Request</h1>
            <p className="text-xs text-ink-warm-500">HoloHive · submit an out-of-pocket expense</p>
          </div>
        </div>

        {done ? (
          <Card className="border-cream-200">
            <CardContent className="p-8 text-center">
              <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <h2 className="text-base font-semibold text-ink-warm-900 mb-1">Request submitted</h2>
              <p className="text-sm text-ink-warm-500 mb-5">Thanks — your reimbursement request is now pending review. You&apos;ll be reimbursed once it&apos;s approved.</p>
              <Button variant="outline" onClick={() => setDone(false)}>Submit another</Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-cream-200">
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Your name <RequiredAsterisk /></Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="h-9 focus-brand" />
                </div>
                <div className="space-y-1.5">
                  <Label>Your email <RequiredAsterisk /></Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@holohive.io" className="h-9 focus-brand" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

              <Button variant="brand" className="w-full" onClick={submit} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit Request'}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
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
