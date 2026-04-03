'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, RefreshCw } from 'lucide-react';

interface AIScoreDisplayProps {
  opportunityId: string;
  compositeScore: number;
  icpFitScore: number;
  signalStrengthScore: number;
  timingScore: number;
  actionTier: string | null;
  lastScoredAt: string | null;
  compact?: boolean;
  onScoreUpdated?: (scores: any) => void;
}

const ACTION_TIER_COLORS: Record<string, { bg: string; text: string }> = {
  REACH_OUT_NOW: { bg: 'bg-red-100', text: 'text-red-800' },
  PRE_TOKEN_PRIORITY: { bg: 'bg-orange-100', text: 'text-orange-800' },
  RESEARCH_FIRST: { bg: 'bg-blue-100', text: 'text-blue-800' },
  WATCH_FOR_TRIGGER: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  NURTURE: { bg: 'bg-gray-100', text: 'text-gray-700' },
  SKIP: { bg: 'bg-gray-50', text: 'text-gray-500' },
};

export default function AIScoreDisplay({
  opportunityId,
  compositeScore,
  icpFitScore,
  signalStrengthScore,
  timingScore,
  actionTier,
  lastScoredAt,
  compact = false,
  onScoreUpdated,
}: AIScoreDisplayProps) {
  const [rescoring, setRescoring] = useState(false);

  const handleRescore = async () => {
    setRescoring(true);
    try {
      const res = await fetch('/api/agents/atlas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunity_id: opportunityId }),
      });
      const data = await res.json();
      if (data.success && onScoreUpdated) {
        onScoreUpdated(data.summary);
      }
    } catch (err) {
      console.error('Rescore failed:', err);
    } finally {
      setRescoring(false);
    }
  };

  const tierColors = actionTier ? ACTION_TIER_COLORS[actionTier] || ACTION_TIER_COLORS.SKIP : ACTION_TIER_COLORS.SKIP;

  // Score bar helper
  const ScoreBar = ({ value, max, color }: { value: number; max: number; color: string }) => (
    <div className="w-full bg-gray-100 rounded-full h-1.5">
      <div
        className={`h-1.5 rounded-full ${color}`}
        style={{ width: `${Math.min((value / max) * 100, 100)}%` }}
      />
    </div>
  );

  if (compact) {
    // Compact view for kanban cards
    if (!compositeScore && !actionTier) return null;
    return (
      <div className="flex items-center gap-1.5">
        {compositeScore > 0 && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
            compositeScore >= 80 ? 'bg-red-100 text-red-700' :
            compositeScore >= 60 ? 'bg-orange-100 text-orange-700' :
            compositeScore >= 45 ? 'bg-blue-100 text-blue-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            {compositeScore}
          </span>
        )}
        {actionTier && (
          <span className={`text-[9px] px-1 py-0.5 rounded ${tierColors.bg} ${tierColors.text}`}>
            {actionTier.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          </span>
        )}
      </div>
    );
  }

  // Full view for detail panel
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-semibold text-gray-700">AI Score</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={handleRescore}
          disabled={rescoring}
        >
          {rescoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          <span className="ml-1">Re-score</span>
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className={`text-3xl font-bold ${
          compositeScore >= 80 ? 'text-red-600' :
          compositeScore >= 60 ? 'text-orange-600' :
          compositeScore >= 45 ? 'text-blue-600' :
          'text-gray-500'
        }`}>
          {compositeScore || '—'}
        </div>
        <div>
          <div className="text-xs text-gray-500">/100</div>
          {actionTier && (
            <Badge className={`${tierColors.bg} ${tierColors.text} border-0 text-[10px]`}>
              {actionTier.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </Badge>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <div className="flex justify-between text-xs mb-0.5">
            <span className="text-gray-500">ICP Fit</span>
            <span className="font-medium">{icpFitScore}/40</span>
          </div>
          <ScoreBar value={icpFitScore} max={40} color="bg-emerald-500" />
        </div>
        <div>
          <div className="flex justify-between text-xs mb-0.5">
            <span className="text-gray-500">Signal Strength</span>
            <span className="font-medium">{signalStrengthScore}/35</span>
          </div>
          <ScoreBar value={signalStrengthScore} max={35} color="bg-blue-500" />
        </div>
        <div>
          <div className="flex justify-between text-xs mb-0.5">
            <span className="text-gray-500">Timing</span>
            <span className="font-medium">{timingScore}/25</span>
          </div>
          <ScoreBar value={timingScore} max={25} color="bg-amber-500" />
        </div>
      </div>

      {lastScoredAt && (
        <div className="text-[10px] text-gray-400">
          Last scored: {new Date(lastScoredAt).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}
