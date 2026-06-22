"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Info } from "lucide-react";
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
  }, [kolId, refreshKey]);

  if (loading) return <LoadingState />;
  if (error) return <div className="text-sm text-rose-600">{error}</div>;
  if (!data) return <div className="text-sm text-ink-warm-500">No score data.</div>;

  const { blended, channel, campaign } = data;

  return (
    <div className="space-y-4 text-sm">
      {/* Hero — blended displayed score + tier + Channel/Campaign split. */}
      <Card className="p-4">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold text-ink-warm-900 tabular-nums leading-none">
            {Math.round(blended.displayed)}
          </span>
          <TierBadge tier={blended.tier} />
          {blended.lowConfidence && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
              <Info className="h-3 w-3" /> Low-confidence
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs text-ink-warm-500">
          <span>
            <span className="text-ink-warm-700 font-medium">Channel {Math.round(blended.channel)}</span>
            {blended.activated && blended.campaign != null && (
              <> <span className="mx-1.5">·</span>
                <span className="text-ink-warm-700 font-medium">Campaign {Math.round(blended.campaign)}</span></>
            )}
          </span>
          {!blended.activated && (
            <span className="text-ink-warm-400">Not activated — needs 3+ deliverables for Campaign Performance.</span>
          )}
        </div>
      </Card>

      {/* Channel Score breakdown. */}
      <Card className="p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-warm-500">Channel Score</h3>
          <span className="text-sm font-semibold text-ink-warm-900 tabular-nums">{Math.round(channel.composite)}</span>
        </div>
        <DimBar label="Engagement Quality"    weight="30%" value={channel.engagementQuality} />
        <DimBar label="Reach Efficiency"      weight="25%" value={channel.reachEfficiency} />
        <DimBar label="Discussion Engagement" weight="15%" value={channel.discussionEngagement}
                emptyHint="Channel has no linked discussion group" />
        <DimBar label="Channel Health"        weight="15%" value={channel.channelHealth} />
        <DimBar label="Growth Trajectory"     weight="15%" value={channel.growthTrajectory}
                emptyHint="Needs a 2nd monthly snapshot" />
      </Card>

      {/* Campaign Performance — only when activated. */}
      {campaign ? (
        <Card className="p-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-warm-500">
              Campaign Performance
              <span className="ml-2 text-ink-warm-400 normal-case font-normal">
                · {campaign.deliverableCount} deliverable{campaign.deliverableCount === 1 ? '' : 's'}
              </span>
            </h3>
            <span className="text-sm font-semibold text-ink-warm-900 tabular-nums">{Math.round(campaign.composite)}</span>
          </div>
          <DimBar label="Activation Impact"          weight="50%" value={campaign.activationImpact} />
          <DimBar label="Sponsored Engagement Lift"  weight="30%" value={campaign.sponsoredEngagementLift} />
          <DimBar label="Sponsored Reach"            weight="20%" value={campaign.sponsoredReach} />
        </Card>
      ) : (
        <Card className="p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-warm-500 mb-1">Campaign Performance</h3>
          <p className="text-xs text-ink-warm-500">
            Activates at 3+ logged deliverables. Until then, the displayed Score is the Channel Score (100%).
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
