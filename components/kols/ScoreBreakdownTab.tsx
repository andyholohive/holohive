"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Info, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatRelativeShort } from "@/lib/dateFormat";
import type { ScoreResult, Tier } from "@/lib/kolScoreService";

/**
 * Score breakdown tab — renders the per-dimension bars for one KOL.
 *
 * Per Jdot's TG Addendum (Doc 2):
 *   - Top: blended displayed score + tier, with the Channel/Campaign
 *     components called out separately so the team can see what's
 *     driving the number.
 *   - Channel Score panel: 5 dimension bars (or 4, if a dim was dropped
 *     via the renormalize-on-missing rule per Jdot Q2 / Q4).
 *   - Campaign Performance panel: 3 dim bars when activated (3+
 *     deliverables); otherwise a "Not activated yet" callout.
 *
 * Scores are internal-only per Doc 2 §9 + Jdot Q6b — this tab is never
 * rendered on the public campaign view.
 */
interface Props {
  kolId: string;
  /** Bump to force a refetch when the parent knows snapshots/deliverables changed. */
  refreshKey?: number;
}

export function ScoreBreakdownTab({ kolId, refreshKey = 0 }: Props) {
  const [data, setData] = useState<ScoreResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // [2026-06-30] PROF.4 — on-demand TG scan (Doc 2 §4 Mode 3). State
  // tracks the in-flight POST and the "queued at" timestamp so we can
  // both disable the button mid-flight and show a "queued Nm ago" hint
  // until the next score refetch.
  const [refreshing, setRefreshing] = useState(false);
  const [queuedAt, setQueuedAt] = useState<Date | null>(null);
  const [bumpKey, setBumpKey] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/kols/${kolId}/score`, { credentials: "include" })
      .then(async r => {
        if (!r.ok) throw new Error(`Score fetch failed (${r.status})`);
        const json = await r.json();
        return json.score as ScoreResult;
      })
      .then(score => { if (!cancelled) { setData(score); setLoading(false); } })
      .catch(err => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [kolId, refreshKey, bumpKey]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/kols/${kolId}/refresh-tg`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: 'Refresh failed',
          description: json.hint || json.error || `HTTP ${res.status}`,
          variant: 'destructive',
        });
        return;
      }
      setQueuedAt(new Date(json.queued_at || Date.now()));
      toast({
        title: 'Scan queued',
        description: `${json.handle || 'KOL'} — snapshot + profile will land in ~${json.eta_seconds ?? 60}s.`,
      });
      // Auto-refetch the score after 90s to surface the new snapshot.
      // The score endpoint reads the latest snapshot/deliverables row
      // each call, so just bumping bumpKey re-runs the effect above.
      window.setTimeout(() => setBumpKey(k => k + 1), 90_000);
    } catch (err: any) {
      toast({
        title: 'Refresh failed',
        description: err?.message || 'Network error',
        variant: 'destructive',
      });
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <div className="text-sm text-rose-600">{error}</div>;
  if (!data) return <div className="text-sm text-ink-warm-500">No score data.</div>;

  const { scores, channel, activation } = data;

  return (
    <div className="space-y-4 text-sm">
      {/* Hero — Round 2: two scores side by side, no blend. Channel =
          potential, Activation = proven ("—" until participants logged).
          The Refresh button dispatches scan-one.yml in the MCP repo. */}
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-3xl font-bold text-ink-warm-900 tabular-nums leading-none">
                {Math.round(scores.channel)}
                <span className="text-ink-warm-300 font-normal"> / </span>
                <span className={scores.activation != null ? 'text-brand-dark' : 'text-ink-warm-300 font-normal'}>
                  {scores.activation != null ? Math.round(scores.activation) : '—'}
                </span>
              </span>
              <TierBadge tier={scores.tier} />
              {scores.lowConfidence && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                  <Info className="h-3 w-3" /> Low-confidence
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs text-ink-warm-500 flex-wrap">
              <span>
                <span className="text-ink-warm-700 font-medium">Channel = potential</span>
                <span className="mx-1.5">·</span>
                <span className="text-ink-warm-700 font-medium">
                  Activation = proven{scores.activation == null ? ' (never tested)' : ''}
                </span>
              </span>
              {queuedAt && (
                <span className="text-ink-warm-400 italic">
                  · Scan queued {formatRelativeShort(queuedAt.toISOString())} — score updates in ~1 min
                </span>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="shrink-0"
            title="Re-scan this KOL's Telegram channel + AI-refresh their profile fields"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Queuing…' : 'Refresh from TG'}
          </Button>
        </div>
      </Card>

      {/* Channel Score breakdown. */}
      <Card className="p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-warm-500">Channel Score</h3>
          <span className="text-sm font-semibold text-ink-warm-900 tabular-nums">{Math.round(channel.composite)}</span>
        </div>
        <DimBar label="Average Views"     weight="35%" value={channel.averageViews} />
        <DimBar label="Engagement Rate"   weight="35%" value={channel.engagementRate}
                emptyHint="No views data on the latest snapshot" />
        <DimBar label="Channel Health"    weight="15%" value={channel.channelHealth} />
        <DimBar label="Growth Trajectory" weight="15%" value={channel.growthTrajectory}
                emptyHint="Needs a 2nd monthly snapshot" />
      </Card>

      {/* Activation Score — participants driven, "—" until logged. */}
      {activation ? (
        <Card className="p-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-warm-500">
              Activation Score
              <span className="ml-2 text-ink-warm-400 normal-case font-normal">
                · {activation.campaignsCounted} campaign{activation.campaignsCounted === 1 ? '' : 's'} · {activation.deliverableCount} deliverable{activation.deliverableCount === 1 ? '' : 's'}
              </span>
            </h3>
            <span className="text-sm font-semibold text-ink-warm-900 tabular-nums">{Math.round(activation.composite)}</span>
          </div>
          <DimBar label="Activation Impact" weight="100%" value={activation.activationImpact} />
          <p className="text-[11px] text-ink-warm-400">
            Participants percentiled within each campaign (top driver ≈ 100), averaged across campaigns, then ranked across the activated pool.
          </p>
        </Card>
      ) : (
        <Card className="p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-warm-500 mb-1">Activation Score</h3>
          <p className="text-xs text-ink-warm-500">
            — · Strong channel, never tested. Appears once activation participants are logged on this KOL&apos;s deliverables.
          </p>
        </Card>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function DimBar({ label, weight, value, emptyHint }: {
  label: string;
  weight: string;
  value: number | null;
  emptyHint?: string;
}) {
  const isEmpty = value == null;
  const display = isEmpty ? '—' : String(Math.round(value));
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-ink-warm-700 font-medium">{label} <span className="text-ink-warm-400">· {weight}</span></span>
        <span className="text-ink-warm-900 tabular-nums font-medium" title={isEmpty ? emptyHint : undefined}>
          {display}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-cream-100 overflow-hidden">
        {!isEmpty && (
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }}
          />
        )}
      </div>
    </div>
  );
}

function TierBadge({ tier }: { tier: Tier }) {
  // Match the absolute tier bands from Doc 2 §5 + the v11 brand palette.
  const classes: Record<Tier, string> = {
    S: 'bg-amber-100 text-amber-800 border-amber-300',
    A: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    B: 'bg-sky-100 text-sky-800 border-sky-300',
    C: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    D: 'bg-rose-100 text-rose-800 border-rose-300',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${classes[tier]}`}>
      {tier}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 rounded-lg" />
      <Skeleton className="h-44 rounded-lg" />
      <Skeleton className="h-32 rounded-lg" />
    </div>
  );
}
