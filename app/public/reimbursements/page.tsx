'use client';

/**
 * Public reimbursement request form (no login). Styled to match the other
 * public forms (app/public/forms/[id]): white page, centered HoloHive logo,
 * large title, single-column fields, brand submit, full-page thank-you.
 * Posts to the allowlisted POST /api/public/reimbursements. Super-admins
 * review submissions on /expenses → Reimbursement Requests.
 */

import React, { useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { formatDate as fmtDate } from '@/lib/dateFormat';
import { Calendar as CalendarIcon, Upload, FileText, X, CheckCircle2, Loader, ChevronRight } from 'lucide-react';

type ExpenseType = 'travel' | 'software' | 'meals_drinks' | 'others';

const TYPE_LABEL: Record<ExpenseType, string> = {
  travel: 'Travel',
  software: 'Software',
  meals_drinks: 'Meals / Drinks',
  others: 'Others',
};

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
const MAX_SIZE = 10 * 1024 * 1024;

const Req = () => <span className="text-rose-500 ml-1">*</span>;

export default function PublicReimbursementPage() {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseType, setExpenseType] = useState<ExpenseType>('travel');
  const [expenseDate, setExpenseDate] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);

  function pickFile(f: File | null) {
    if (!f) { setFile(null); return; }
    if (f.size > MAX_SIZE) { toast({ title: 'File too large', description: 'Max 10 MB.', variant: 'destructive' }); return; }
    if (!ALLOWED_MIME.includes(f.type)) { toast({ title: 'Unsupported file', description: 'JPG, PNG, GIF, WebP or PDF only.', variant: 'destructive' }); return; }
    setFile(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      setSubmitted(true);
    } catch (err: any) {
      toast({ title: 'Submit failed', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Success state (full-page, matches public forms) ──────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="flex justify-center mb-6">
            <Image src="/images/logo.png" alt="Logo" width={60} height={60} className="rounded-xl" />
          </div>
          <div className="rounded-full bg-emerald-50 p-4 w-20 h-20 mx-auto mb-6 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Thank you!</h2>
          <p className="text-lg text-gray-600 leading-relaxed">Your reimbursement request has been submitted. You&apos;ll be reimbursed once it&apos;s approved.</p>
        </div>
      </div>
    );
  }

  // ─── Form state ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-6 py-16">
        {/* Logo and Title */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <Image src="/images/logo.png" alt="Logo" width={60} height={60} className="rounded-xl" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Reimbursement Request</h1>
          <p className="text-lg text-gray-600 leading-relaxed max-w-xl mx-auto">
            Submit an out-of-pocket expense for reimbursement. Attach your receipt and we&apos;ll route it for review.
          </p>
        </div>

        {/* Form Content */}
        <div className="max-w-xl mx-auto">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="rb-name">Your name<Req /></Label>
              <Input id="rb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="focus-brand" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rb-email">Your email<Req /></Label>
              <Input id="rb-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@holohive.io" className="focus-brand" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rb-amount">Amount (USD)<Req /></Label>
              <Input id="rb-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="focus-brand" />
            </div>

            <div className="space-y-2">
              <Label>Category<Req /></Label>
              <Select value={expenseType} onValueChange={(v) => setExpenseType(v as ExpenseType)}>
                <SelectTrigger className="focus-brand"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABEL) as ExpenseType[]).map(t => (
                    <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Date of expense<Req /></Label>
              <DateField value={expenseDate} onChange={setExpenseDate} placeholder="Select date" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rb-desc">Description<Req /></Label>
              <Input id="rb-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Client dinner — Seoul offsite" className="focus-brand" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rb-notes">Notes</Label>
              <Textarea id="rb-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional context for the reviewer" className="focus-brand" />
            </div>

            <div className="space-y-2">
              <Label>Receipt</Label>
              {file ? (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-700 truncate flex-1">{file.name}</span>
                  <button type="button" onClick={() => setFile(null)} className="text-gray-400 hover:text-rose-600" aria-label="Remove receipt">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer flex flex-col items-center gap-2">
                  <Upload className="h-6 w-6 text-gray-400" />
                  <span className="text-sm text-gray-600">Click to attach a receipt</span>
                  <span className="text-xs text-gray-400">JPG, PNG, GIF, WebP or PDF · max 10 MB</span>
                  <input type="file" className="hidden" accept={ALLOWED_MIME.join(',')} onChange={(e) => pickFile(e.target.files?.[0] || null)} />
                </label>
              )}
            </div>

            <div className="pt-8 flex justify-center">
              <Button
                type="submit"
                disabled={submitting}
                className="px-6 h-12 text-base font-medium rounded-lg bg-brand hover:bg-[#2d6570] text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting ? (
                  <><Loader className="h-5 w-5 animate-spin" /> Submitting...</>
                ) : (
                  <>Submit <ChevronRight className="h-5 w-5" /></>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── DateField (Popover + Calendar, brand-teal selection) ────────────────
function DateField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const selectedDate = value ? new Date(value + 'T00:00:00') : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-10 w-full justify-start font-normal focus-brand" style={{ color: value ? '#111827' : '#9ca3af' }}>
          <CalendarIcon className="mr-2 h-4 w-4" />
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
