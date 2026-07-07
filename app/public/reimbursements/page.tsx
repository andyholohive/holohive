'use client';

/**
 * Public reimbursement request form (no login). Styled to match the public
 * link-submit form (app/public/links/submit): gray gradient background,
 * centered white card, 48px logo, compact fields, inline error banner,
 * full-width brand submit, "Powered by Holo Hive" footer. Posts to the
 * allowlisted POST /api/public/reimbursements. Super-admins review on
 * /expenses → Reimbursement Requests.
 */

import { useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { formatDate as fmtDate } from '@/lib/dateFormat';
import { Check, Loader2, Calendar as CalendarIcon, Upload, FileText, X } from 'lucide-react';

type ExpenseType = 'travel' | 'software' | 'meals_drinks' | 'others';
type Frequency = 'one_time' | 'daily' | 'weekly' | 'monthly';

const CATEGORIES: { value: ExpenseType; label: string }[] = [
  { value: 'travel', label: 'Travel' },
  { value: 'software', label: 'Software' },
  { value: 'meals_drinks', label: 'Meals / Drinks' },
  { value: 'others', label: 'Others' },
];

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'one_time', label: 'One-time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
const MAX_SIZE = 10 * 1024 * 1024;

export default function ReimbursementSubmitPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    amount: '',
    expense_type: 'travel' as ExpenseType,
    frequency: 'one_time' as Frequency,
    expense_date: '',
    recurrence_end: '',
    description: '',
    notes: '',
  });
  const [file, setFile] = useState<File | null>(null);

  const isRecurring = formData.frequency !== 'one_time';

  const resetForm = () => {
    setFormData({ name: '', email: '', amount: '', expense_type: 'travel', frequency: 'one_time', expense_date: '', recurrence_end: '', description: '', notes: '' });
    setFile(null);
  };

  const pickFile = (f: File | null) => {
    if (!f) { setFile(null); return; }
    if (f.size > MAX_SIZE) { setError('Receipt exceeds the 10 MB limit'); return; }
    if (!ALLOWED_MIME.includes(f.type)) { setError('Receipt must be a JPG, PNG, GIF, WebP or PDF'); return; }
    setError(null);
    setFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) { setError('Name is required'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(formData.email.trim())) { setError('A valid email is required'); return; }
    if (!formData.amount || Number(formData.amount) <= 0) { setError('Amount must be greater than 0'); return; }
    if (!formData.expense_date) { setError(isRecurring ? 'Start date is required' : 'Date of expense is required'); return; }
    if (isRecurring && formData.recurrence_end && formData.recurrence_end < formData.expense_date) {
      setError('End date must be on or after the start date'); return;
    }
    if (!formData.description.trim()) { setError('Description is required'); return; }

    setIsSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('requester_name', formData.name.trim());
      fd.append('requester_email', formData.email.trim());
      fd.append('amount_usd', String(Number(formData.amount)));
      fd.append('expense_type', formData.expense_type);
      fd.append('description', formData.description.trim());
      fd.append('notes', formData.notes.trim());
      fd.append('expense_date', formData.expense_date);
      fd.append('frequency', formData.frequency);
      if (isRecurring && formData.recurrence_end) fd.append('recurrence_end_date', formData.recurrence_end);
      if (file) fd.append('file', file);

      const response = await fetch('/api/public/reimbursements', { method: 'POST', body: fd });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to submit request');
      setIsSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'An error occurred while submitting');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
              <Check className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Request Submitted!</h2>
            <p className="text-gray-500 mb-8">Your reimbursement request is now pending review. You&apos;ll be reimbursed once it&apos;s approved.</p>
            <Button onClick={() => { setIsSubmitted(false); resetForm(); }} variant="outline" className="px-6">
              Submit Another Request
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header with logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center mb-4">
            <Image src="/images/logo.png" alt="Logo" width={48} height={48} className="rounded-lg" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Reimbursement Request</h1>
          <p className="text-gray-500 mt-1">Submit an out-of-pocket expense for reimbursement</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Your name <span className="text-rose-500">*</span></Label>
              <Input
                id="name"
                placeholder="Full name"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                disabled={isSubmitting}
                className="focus-brand"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Your email <span className="text-rose-500">*</span></Label>
              <Input
                id="email"
                type="email"
                placeholder="you@holohive.io"
                value={formData.email}
                onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                disabled={isSubmitting}
                className="focus-brand"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount (USD) <span className="text-rose-500">*</span></Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={formData.amount}
                onChange={e => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                disabled={isSubmitting}
                className="focus-brand"
              />
            </div>

            <div className="space-y-2">
              <Label>Category <span className="text-rose-500">*</span></Label>
              <Select
                value={formData.expense_type}
                onValueChange={(value) => setFormData(prev => ({ ...prev, expense_type: value as ExpenseType }))}
                disabled={isSubmitting}
              >
                <SelectTrigger className="focus-brand"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Frequency <span className="text-rose-500">*</span></Label>
              <Select
                value={formData.frequency}
                onValueChange={(value) => setFormData(prev => ({ ...prev, frequency: value as Frequency, recurrence_end: value === 'one_time' ? '' : prev.recurrence_end }))}
                disabled={isSubmitting}
              >
                <SelectTrigger className="focus-brand"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{isRecurring ? 'Start date' : 'Date of expense'} <span className="text-rose-500">*</span></Label>
              <DateField
                value={formData.expense_date}
                onChange={(v) => setFormData(prev => ({ ...prev, expense_date: v }))}
                disabled={isSubmitting}
              />
            </div>

            {isRecurring && (
              <div className="space-y-2">
                <Label>End date (Optional)</Label>
                <DateField
                  value={formData.recurrence_end}
                  onChange={(v) => setFormData(prev => ({ ...prev, recurrence_end: v }))}
                  disabled={isSubmitting}
                  placeholder="No end date"
                  allowClear
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="description">Description <span className="text-rose-500">*</span></Label>
              <Input
                id="description"
                placeholder="e.g. Client dinner — Seoul offsite"
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                disabled={isSubmitting}
                className="focus-brand"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Optional context for the reviewer"
                value={formData.notes}
                onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                disabled={isSubmitting}
                className="focus-brand"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Receipt (Optional)</Label>
              {file ? (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-700 truncate flex-1">{file.name}</span>
                  <button type="button" onClick={() => setFile(null)} className="text-gray-400 hover:text-rose-600" aria-label="Remove receipt">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 px-3 py-3 cursor-pointer hover:bg-gray-50 transition-colors">
                  <Upload className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-500">Attach receipt (JPG, PNG, PDF · max 10 MB)</span>
                  <input type="file" className="hidden" accept={ALLOWED_MIME.join(',')} disabled={isSubmitting} onChange={e => pickFile(e.target.files?.[0] || null)} />
                </label>
              )}
            </div>

            <Button variant="brand" type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
              ) : (
                'Submit Request'
              )}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          Powered by Holo Hive
        </p>
      </div>
    </div>
  );
}

// ─── DateField (Popover + Calendar, brand-teal selection) ────────────────
function DateField({ value, onChange, disabled, placeholder, allowClear }: { value: string; onChange: (v: string) => void; disabled?: boolean; placeholder?: string; allowClear?: boolean }) {
  const selectedDate = value ? new Date(value + 'T00:00:00') : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled} className="w-full justify-start font-normal focus-brand" style={{ color: value ? '#111827' : '#6b7280' }}>
          <CalendarIcon className="mr-2 h-4 w-4 opacity-70" />
          {value ? fmtDate(selectedDate!) : (placeholder || 'Select date')}
          {allowClear && value && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onChange(''); }}
              className="ml-auto opacity-50 hover:opacity-100"
              aria-label="Clear date"
            >
              <X className="h-4 w-4" />
            </span>
          )}
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
