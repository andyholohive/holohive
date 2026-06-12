'use client';

/**
 * ContentSubmissionsBanner — per-campaign pending-review banner.
 *
 * Sits at the top of the Content Dashboard. Lists pending content
 * submissions for THIS campaign with Approve/Reject buttons. Calls
 * /api/content-submissions/[id]/review (same path as TG callback).
 * Hides itself when nothing is pending.
 *
 * Reviewer auth: super_admin auto-included + explicit content_submission_approvers.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Check,
  X,
  ExternalLink,
  Inbox,
  Twitter,
  Youtube,
  Send,
  Link as LinkIcon,
  Clock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

type PendingSubmission = {
  id: string;
  kol_id: string;
  link: string;
  platform: string;
  content_type: string;
  submitted_at: string;
  kol: { id: string; name: string } | null;
};

export function ContentSubmissionsBanner({ campaignId }: { campaignId: string }) {
  const { toast } = useToast();
  const [submissions, setSubmissions] = useState<PendingSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  async function refresh() {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('content_submissions')
      .select('id, kol_id, link, platform, content_type, submitted_at, kol:master_kols!inner(id, name)')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending_review')
      .order('submitted_at', { ascending: false });
    setSubmissions((data ?? []) as any);
    setLoading(false);
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [campaignId]);

  async function review(id: string, action: 'approve' | 'reject', reason?: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/content-submissions/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, rejection_reason: reason }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: `${action} failed`, description: json?.error ?? 'Unknown error', variant: 'destructive' });
        return;
      }
      toast({
        title: action === 'approve' ? 'Approved' : 'Rejected',
        description: action === 'approve' && json.created_content_id
          ? 'Content added to dashboard.'
          : `KOL notified in their group chat.`,
      });
      setRejectingId(null);
      setRejectReason('');
      await refresh();
    } catch (err: any) {
      toast({ title: 'Network error', description: err?.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  }

  if (loading || submissions.length === 0) return null;

  return (
    <Card className="border-sky-200 bg-sky-50/30 mb-4 overflow-hidden">
      {/* Header — info-tone (sky), not warning-amber. These are
          opportunities to review, not problems to fix. */}
      <div className="px-4 py-3 border-b border-sky-100 flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center flex-shrink-0">
          <Inbox className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-ink-warm-900">
              Pending KOL Submissions
            </p>
            <StatusBadge tone="info" size="sm">{submissions.length}</StatusBadge>
          </div>
          <p className="text-[11px] text-ink-warm-500 mt-0.5">
            Sent via <code className="text-ink-warm-700">/submit</code> in KOL group chats.
            Approving adds to the Content Dashboard and DMs the KOL a 👍.
          </p>
        </div>
      </div>

      <ul className="divide-y divide-sky-100/60">
        {submissions.map(s => {
          const isExpanded = rejectingId === s.id;
          const isBusy = busyId === s.id;
          return (
            <li key={s.id} className="px-4 py-3 hover:bg-sky-50/40 transition-colors">
              <div className="flex items-start gap-3">
                {/* Left: KOL initials avatar + platform icon overlay */}
                <div className="relative flex-shrink-0">
                  <KolInitials name={s.kol?.name ?? '?'} />
                  <div
                    className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-white border border-cream-200 flex items-center justify-center text-ink-warm-700"
                    title={s.platform}
                  >
                    <PlatformGlyph platform={s.platform} size={10} />
                  </div>
                </div>

                {/* Middle: KOL name + metadata + link */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-ink-warm-900 truncate">
                      {s.kol?.name ?? 'Unknown KOL'}
                    </span>
                    <StatusBadge tone="neutral" size="sm">
                      {formatType(s.content_type)}
                    </StatusBadge>
                    <span className="inline-flex items-center gap-1 text-[11px] text-ink-warm-500 tabular-nums">
                      <Clock className="h-2.5 w-2.5" />
                      {relativeTime(s.submitted_at)}
                    </span>
                  </div>

                  <a
                    href={s.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-brand hover:text-brand-deep hover:underline mt-1 max-w-full truncate"
                    title={s.link}
                  >
                    <LinkPreview link={s.link} />
                    <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-60" />
                  </a>
                </div>

                {/* Right: action buttons */}
                {!isExpanded && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="brand"
                      disabled={isBusy}
                      onClick={() => review(s.id, 'approve')}
                      className="h-8"
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      {isBusy && busyId === s.id ? 'Approving…' : 'Approve'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isBusy}
                      onClick={() => { setRejectingId(s.id); setRejectReason(''); }}
                      className="h-8 border-rose-300 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Reject
                    </Button>
                  </div>
                )}
              </div>

              {/* Inline reject-reason expander */}
              {isExpanded && (
                <div className="mt-3 ml-13 pl-13 border-l-2 border-rose-200 bg-rose-50/40 -mx-4 px-4 py-3 -mb-3">
                  <p className="text-xs font-medium text-rose-900 mb-1.5">
                    Reject submission — message KOL with reason
                  </p>
                  <Textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="e.g. Link is broken / wrong content / off-brief. Leave blank for default message."
                    className="focus-brand min-h-[60px] text-sm bg-white"
                    autoFocus
                  />
                  <div className="flex items-center justify-end gap-2 mt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setRejectingId(null); setRejectReason(''); }}
                      disabled={isBusy}
                      className="h-8"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => review(s.id, 'reject', rejectReason.trim() || undefined)}
                      disabled={isBusy}
                      className="h-8"
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      {isBusy ? 'Sending…' : 'Send Rejection'}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers — kept local so this file is self-contained.
// Promote to /components/ui when a second consumer needs them.
// ─────────────────────────────────────────────────────────────────────

function KolInitials({ name }: { name: string }) {
  const initials = (name || '?').split(' ').map(w => w.charAt(0).toUpperCase()).join('').slice(0, 2);
  return (
    <div className="w-9 h-9 bg-brand text-white rounded-full flex items-center justify-center text-xs font-bold">
      {initials}
    </div>
  );
}

function PlatformGlyph({ platform, size = 12 }: { platform: string; size?: number }) {
  const p = platform?.toLowerCase() ?? '';
  const props = { width: size, height: size };
  if (p.includes('twitter') || p === 'x' || p === 'tweet') return <Twitter {...props} />;
  if (p.includes('youtube') || p === 'video') return <Youtube {...props} />;
  if (p.includes('telegram') || p === 'tg' || p.includes('tg_post')) return <Send {...props} />;
  return <LinkIcon {...props} />;
}

/** Render a short, scannable link preview: "x.com / status/123" */
function LinkPreview({ link }: { link: string }) {
  try {
    const u = new URL(link);
    const host = u.host.replace(/^www\./, '');
    const path = u.pathname.length > 1 ? u.pathname : '';
    return (
      <>
        <span className="font-medium">{host}</span>
        {path && (
          <span className="text-ink-warm-500 truncate font-mono">
            {path.length > 32 ? path.slice(0, 30) + '…' : path}
          </span>
        )}
      </>
    );
  } catch {
    return <span className="truncate font-mono">{link}</span>;
  }
}

function formatType(t: string): string {
  if (!t) return '—';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "2h ago", "5m ago", "Mar 12". Short + scannable. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
