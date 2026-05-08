'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, MessageCircleQuestion, ArrowLeft, CheckCircle2, X, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

/**
 * /dashboard/check-in
 *
 * Per-team-member weekly self-report form. Linked from Sunday-evening
 * Telegram DMs (cron: /api/cron/dashboard-self-reports). Each user can
 * fill out their own check-in for the upcoming week.
 *
 * Reads/writes via /api/dashboard/check-in. UPSERTs by (user, week_of)
 * so re-submits update the existing row.
 *
 * Form fields:
 *   - Top 3 things you're focused on (array)
 *   - Anything blocked or waiting on someone? (text)
 *   - What's on the docket for next week? (text)
 *   - Optional notes (text)
 */

function mondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function CheckInForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  // Honor ?week_of= from the DM link, otherwise default to current Monday.
  const initialWeek = searchParams.get('week_of') || mondayOfWeek(new Date());

  const [weekOf] = useState<string>(initialWeek);
  const [primaryFocus, setPrimaryFocus] = useState<string[]>(['', '', '']);
  const [blockers, setBlockers] = useState('');
  const [nextWeek, setNextWeek] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  // Pre-fill from existing report if the user already submitted this week.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/dashboard/check-in?week_of=${weekOf}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        const r = json.report;
        if (r) {
          // Pad with empties so the user can add a 3rd focus item if they
          // had only 1 or 2 last time.
          const focus = Array.isArray(r.primary_focus) ? [...r.primary_focus] : [];
          while (focus.length < 3) focus.push('');
          setPrimaryFocus(focus);
          setBlockers(r.blockers || '');
          setNextWeek(r.next_week || '');
          setNotes(r.notes || '');
          setSubmittedAt(r.responded_at);
        }
      } catch (err: any) {
        toast({ title: 'Failed to load existing check-in', description: err?.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, [weekOf, toast]);

  const handleSubmit = async () => {
    // Strip empty focus items, keep order.
    const focus = primaryFocus.map(s => s.trim()).filter(Boolean);
    if (focus.length === 0) {
      toast({ title: 'At least one focus item required', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/dashboard/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_of: weekOf,
          primary_focus: focus,
          blockers: blockers.trim() || undefined,
          next_week: nextWeek.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      toast({ title: 'Check-in saved', description: 'Thanks — see you on the dashboard.' });
      setSubmittedAt(new Date().toISOString());
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 h-8">
          <Link href="/dashboard">
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
            Back to dashboard
          </Link>
        </Button>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <MessageCircleQuestion className="h-6 w-6 text-brand" />
          Weekly Check-In
        </h2>
        <p className="text-gray-600 text-sm mt-0.5">
          For the week of <span className="font-semibold">{weekOf}</span>.
          {submittedAt && (
            <span className="ml-2 inline-flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Submitted {new Date(submittedAt).toLocaleString()} — re-submit to update.
            </span>
          )}
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top focus items */}
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-semibold text-gray-900">Top focus this week</Label>
              <p className="text-xs text-gray-500 mt-0.5">
                The 3 main things you're spending time on. Keep each short — one sentence is enough.
              </p>
            </div>
            <div className="space-y-2">
              {primaryFocus.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 font-mono w-4">{i + 1}.</span>
                  <Input
                    value={item}
                    onChange={(e) => {
                      const next = [...primaryFocus];
                      next[i] = e.target.value;
                      setPrimaryFocus(next);
                    }}
                    placeholder={i === 0 ? 'e.g. Fogo week 7 delivery' : i === 1 ? 'e.g. ADI proposal' : 'e.g. ClickUp migration fixes'}
                    className="focus-brand"
                    maxLength={200}
                  />
                  {/* Allow removing rows after the first, and adding more (up to 5). */}
                  {primaryFocus.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setPrimaryFocus(primaryFocus.filter((_, idx) => idx !== i))}
                      title="Remove this item"
                    >
                      <X className="h-3.5 w-3.5 text-gray-400" />
                    </Button>
                  )}
                </div>
              ))}
              {primaryFocus.length < 5 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-brand h-7 px-2"
                  onClick={() => setPrimaryFocus([...primaryFocus, ''])}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add another
                </Button>
              )}
            </div>
          </div>

          {/* Blockers */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-gray-900">Blocked or waiting on someone?</Label>
            <p className="text-xs text-gray-500">
              Anything you're stuck on, or that you need from someone else to move forward.
            </p>
            <Textarea
              value={blockers}
              onChange={(e) => setBlockers(e.target.value)}
              placeholder="e.g. Waiting on Bolt to fix the ClickUp sync before I can ..."
              className="focus-brand"
              rows={3}
              maxLength={1000}
            />
          </div>

          {/* Next week */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-gray-900">What's on the docket for next week?</Label>
            <p className="text-xs text-gray-500">
              Big-picture priorities heading into next week. Skip if it's the same as this week.
            </p>
            <Textarea
              value={nextWeek}
              onChange={(e) => setNextWeek(e.target.value)}
              placeholder="e.g. Ship Fogo week 8 brief, kick off Robonet beta, ..."
              className="focus-brand"
              rows={3}
              maxLength={1000}
            />
          </div>

          {/* Optional notes */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-gray-900">Anything else? <span className="text-gray-400 font-normal">(optional)</span></Label>
            <p className="text-xs text-gray-500">
              Wins, callouts, things the team should know. Surfaced on the dashboard.
            </p>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Closed our first APAC partnership this week 🎉"
              className="focus-brand"
              rows={2}
              maxLength={2000}
            />
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200">
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="hover:opacity-90"
              style={{ backgroundColor: '#3e8692', color: 'white' }}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {submittedAt ? 'Update check-in' : 'Submit check-in'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Suspense boundary required by Next 13 App Router for any client page
// that uses useSearchParams().
export default function CheckInPage() {
  return (
    <Suspense fallback={<div className="space-y-4 max-w-2xl mx-auto"><Skeleton className="h-8 w-48" /><Skeleton className="h-32" /></div>}>
      <CheckInForm />
    </Suspense>
  );
}
