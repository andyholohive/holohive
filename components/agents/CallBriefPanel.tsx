'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, Loader2, CheckCircle, XCircle, AlertTriangle, Phone, RefreshCw } from 'lucide-react';

interface CallBriefPanelProps {
  opportunityId: string;
  opportunityName: string;
}

export default function CallBriefPanel({ opportunityId, opportunityName }: CallBriefPanelProps) {
  const [brief, setBrief] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch existing call brief
  useEffect(() => {
    fetchBrief();
  }, [opportunityId]);

  const fetchBrief = async () => {
    setLoading(true);
    try {
      // Use the runs API to check for existing briefs
      const res = await fetch(`/api/agents/runs?limit=1&agent=ORACLE`);
      // For now, we'll generate on demand
    } catch (err) {
      console.error('Error fetching brief:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateBrief = async (callType: string = 'DISCOVERY') => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/agents/oracle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunity_id: opportunityId, call_type: callType }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to generate brief');
        return;
      }

      setBrief(data.summary);
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setGenerating(false);
    }
  };

  const gatekeeperScore = brief?.brief?.gatekeeper_score;
  const fiveForFive = brief?.brief?.five_for_five;
  const talkingPoints = brief?.brief?.talking_points || [];
  const riskFlags = brief?.brief?.risk_flags || [];
  const objectionHandlers = brief?.brief?.objection_handlers || {};

  if (!brief) {
    return (
      <Card className="border border-gray-200">
        <CardContent className="pt-4 pb-4">
          <div className="text-center space-y-3">
            <Eye className="w-8 h-8 mx-auto text-purple-400" />
            <div>
              <p className="text-sm font-medium text-gray-700">ORACLE Intel</p>
              <p className="text-xs text-gray-500">Generate a call brief with deep prospect research</p>
            </div>
            {error && (
              <p className="text-xs text-red-500">{error}</p>
            )}
            <div className="flex gap-2 justify-center">
              <Button
                size="sm"
                variant="outline"
                onClick={() => generateBrief('DISCOVERY')}
                disabled={generating}
              >
                {generating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Phone className="w-3 h-3 mr-1" />}
                Discovery Brief
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => generateBrief('PROPOSAL')}
                disabled={generating}
              >
                {generating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Eye className="w-3 h-3 mr-1" />}
                Proposal Brief
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-purple-200 bg-purple-50/30">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Eye className="w-4 h-4 text-purple-600" />
            ORACLE Call Brief
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{brief.call_type}</Badge>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={() => generateBrief(brief.call_type || 'DISCOVERY')}
              disabled={generating}
            >
              <RefreshCw className={`w-3 h-3 ${generating ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-3 pr-2">
            {/* Gatekeeper Score */}
            {gatekeeperScore && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-600">Gatekeeper Score</span>
                  <span className={`text-lg font-bold ${
                    (gatekeeperScore.total || 0) >= 70 ? 'text-emerald-600' :
                    (gatekeeperScore.total || 0) >= 50 ? 'text-amber-600' : 'text-red-600'
                  }`}>{gatekeeperScore.total || 0}/100</span>
                </div>
                {gatekeeperScore.dimensions && (
                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    {Object.entries(gatekeeperScore.dimensions).map(([key, val]: [string, any]) => (
                      <div key={key} className="flex justify-between text-gray-500">
                        <span>{key.replace(/_/g, ' ')}</span>
                        <span className="font-medium text-gray-700">{val}/10</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 5-for-5 */}
            {fiveForFive && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-600">5-for-5 Readiness</span>
                  <Badge variant="outline" className="text-[10px]">{fiveForFive.gates_passed || '0/5'}</Badge>
                </div>
                <div className="space-y-0.5 text-xs">
                  {[
                    ['problem', 'Problem articulated'],
                    ['implication', 'Implication understood'],
                    ['dm_confirmed', 'DM confirmed'],
                    ['timeline', 'Timeline established'],
                    ['q2_answered', 'Q2 answered'],
                  ].map(([key, label]) => (
                    <div key={key} className="flex items-center gap-1.5">
                      {fiveForFive[key] ? (
                        <CheckCircle className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <XCircle className="w-3 h-3 text-gray-300" />
                      )}
                      <span className={fiveForFive[key] ? 'text-gray-700' : 'text-gray-400'}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Talking Points */}
            {talkingPoints.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-gray-600">Talking Points</span>
                <ul className="mt-1 space-y-1">
                  {talkingPoints.map((point: string, i: number) => (
                    <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                      <span className="text-purple-400 font-bold shrink-0">{i + 1}.</span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Risk Flags */}
            {riskFlags.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-red-600">Risk Flags</span>
                <div className="mt-1 space-y-1">
                  {riskFlags.map((flag: string, i: number) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-red-600">
                      <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                      {flag}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Objection Handlers */}
            {Object.keys(objectionHandlers).length > 0 && (
              <div>
                <span className="text-xs font-semibold text-gray-600">Objection Handlers</span>
                <div className="mt-1 space-y-1.5">
                  {Object.entries(objectionHandlers).map(([objection, handler]: [string, any]) => (
                    <div key={objection} className="text-xs bg-white rounded p-2 border border-gray-100">
                      <div className="font-medium text-gray-700 mb-0.5">"{objection}"</div>
                      <div className="text-gray-500">{String(handler)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
