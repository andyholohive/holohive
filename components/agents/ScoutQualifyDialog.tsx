'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Loader2, CheckCircle, XCircle, AlertTriangle, TrendingUp, ExternalLink } from 'lucide-react';

// Format snake_case or UPPER_SNAKE to Title Case, preserving known acronyms
const ACRONYMS = new Set(['tge', 'icp', 'dm', 'evm', 'nft', 'dao', 'defi', 'rwa', 'depin', 'bd', 'vc', 'tg', 'l1', 'l2', 'api', 'sdk']);
function formatLabel(str: string): string {
  return str
    .replace(/_/g, ' ')
    .split(' ')
    .map((word) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

interface ScoutQualifyDialogProps {
  open: boolean;
  onClose: () => void;
  onOpportunityCreated?: (id: string) => void;
  initialReport?: any;
}

export default function ScoutQualifyDialog({ open, onClose, onOpportunityCreated, initialReport }: ScoutQualifyDialogProps) {
  const [url, setUrl] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [autoCreate, setAutoCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(initialReport || null);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialReport) setReport(initialReport);
  }, [initialReport]);

  const handleSubmit = async () => {
    if (!url && !companyName) return;
    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const res = await fetch('/api/agents/scout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url || undefined,
          company_name: companyName || undefined,
          auto_create: autoCreate,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to qualify prospect');
        return;
      }

      setReport(data.summary);

      if (data.summary?.opportunity_id && onOpportunityCreated) {
        onOpportunityCreated(data.summary.opportunity_id);
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setUrl('');
    setCompanyName('');
    setReport(null);
    setError(null);
    onClose();
  };

  const icpCheck = report?.report?.icp_check;
  const enrichment = report?.report?.enrichment;
  const signals = report?.report?.signals_detected;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Qualify Prospect</DialogTitle>
          <DialogDescription>
            Evaluate a Web3 project against ICP criteria.
          </DialogDescription>
        </DialogHeader>

        {/* Input Form */}
        {!report && (
          <form onSubmit={e => { e.preventDefault(); handleSubmit(); }}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Project URL</Label>
                <Input
                  placeholder="https://example-protocol.xyz"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={loading}
                  className="auth-input"
                />
              </div>
              <div className="grid gap-2">
                <Label>Company / Project Name</Label>
                <Input
                  placeholder="Example Protocol"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={loading}
                  className="auth-input"
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="autoCreate"
                  checked={autoCreate}
                  onCheckedChange={(v) => setAutoCreate(v === true)}
                  className="data-[state=checked]:bg-[#3e8692] data-[state=checked]:border-[#3e8692]"
                />
                <Label htmlFor="autoCreate" className="text-sm text-gray-600 cursor-pointer font-normal">
                  Auto-create opportunity if qualified
                </Label>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={handleClose}>Cancel</Button>
              <Button
                type="submit"
                disabled={loading || (!url && !companyName)}
                style={{ backgroundColor: '#3e8692', color: 'white' }}
                className="hover:opacity-90"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Qualify
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* Results */}
        {report && (
          <>
            <ScrollArea className="max-h-[55vh]">
              <div className="grid gap-4 pr-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{report.project_name}</h3>
                    {report.report?.url_analyzed && (
                      <a href={report.report.url_analyzed} target="_blank" rel="noopener noreferrer"
                         className="text-xs hover:underline flex items-center gap-1" style={{ color: '#3e8692' }}>
                        {report.report.url_analyzed}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  {report.qualified ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Qualified</Badge>
                  ) : (
                    <Badge className="bg-red-100 text-red-800 border-red-200">Not Qualified</Badge>
                  )}
                </div>

                {/* Score Summary */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                    <div className="text-xl font-bold" style={{ color: '#3e8692' }}>{report.composite_score}</div>
                    <div className="text-[10px] text-gray-500 font-medium">Score</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                    <div className="text-sm font-semibold text-gray-700">{report.report?.scores?.icp_fit || 0}/40</div>
                    <div className="text-[10px] text-gray-500 font-medium">ICP Fit</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                    <div className="text-sm font-semibold text-gray-700">{report.report?.scores?.signal_strength || 0}/35</div>
                    <div className="text-[10px] text-gray-500 font-medium">Signal</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                    <div className="text-sm font-semibold text-gray-700">{report.report?.scores?.timing || 0}/25</div>
                    <div className="text-[10px] text-gray-500 font-medium">Timing</div>
                  </div>
                </div>

                {/* Action Tier */}
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-gray-500">Action Tier</Label>
                  <Badge className="text-white text-xs" style={{ backgroundColor: '#3e8692' }}>{formatLabel(report.action_tier)}</Badge>
                </div>

                {report.disqualification_reason && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <strong>Disqualified:</strong> {report.disqualification_reason}
                  </div>
                )}

                {/* ICP Check */}
                {icpCheck && (
                  <div className="grid gap-2">
                    <Label>ICP Criteria ({icpCheck.criteria_passed || report.criteria_passed})</Label>
                    <div className="space-y-1.5">
                      {Object.entries(icpCheck).filter(([k]) => k !== 'criteria_passed').map(([key, val]: [string, any]) => (
                        <div key={key} className="flex items-start gap-2 text-sm">
                          {val?.pass ? (
                            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <span className="font-medium text-gray-700">{formatLabel(key)}</span>
                            {val?.detail && (
                              <p className="text-xs text-gray-500">{val.detail}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Enrichment */}
                {enrichment && (
                  <div className="grid gap-2">
                    <Label>Enrichment Data</Label>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                      {enrichment.category && (
                        <div><span className="text-gray-500">Category:</span> <span className="font-medium">{enrichment.category}</span></div>
                      )}
                      {enrichment.funding_amount && (
                        <div><span className="text-gray-500">Funding:</span> <span className="font-medium">{enrichment.funding_amount}</span></div>
                      )}
                      {enrichment.token_status && (
                        <div><span className="text-gray-500">Token:</span> <span className="font-medium">{formatLabel(enrichment.token_status)}</span></div>
                      )}
                      {enrichment.product_status && (
                        <div><span className="text-gray-500">Product:</span> <span className="font-medium">{formatLabel(enrichment.product_status)}</span></div>
                      )}
                      {enrichment.korea_presence && (
                        <div><span className="text-gray-500">Korea:</span> <span className="font-medium">{formatLabel(enrichment.korea_presence)}</span></div>
                      )}
                      {enrichment.narrative_fit && (
                        <div><span className="text-gray-500">Narrative:</span> <span className="font-medium">{formatLabel(enrichment.narrative_fit)}</span></div>
                      )}
                      {enrichment.twitter_followers && (
                        <div><span className="text-gray-500">Twitter:</span> <span className="font-medium">{enrichment.twitter_followers?.toLocaleString()} followers</span></div>
                      )}
                      {enrichment.team_doxxed !== undefined && (
                        <div><span className="text-gray-500">Team Doxxed:</span> <span className="font-medium">{enrichment.team_doxxed ? 'Yes' : 'No'}</span></div>
                      )}
                    </div>
                  </div>
                )}

                {/* Signals */}
                {signals && signals.length > 0 && (
                  <div className="grid gap-2">
                    <Label>Detected Signals ({signals.length})</Label>
                    <div className="space-y-2">
                      {signals.map((s: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 p-2 bg-gray-50 rounded-md text-sm border border-gray-100">
                          <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${
                            s.tier === 1 ? 'text-red-500' : s.tier === 2 ? 'text-amber-500' : 'text-blue-500'
                          }`} />
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge className={`text-[10px] border ${
                                s.tier === 1 ? 'bg-red-50 text-red-700 border-red-200' :
                                s.tier === 2 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                'bg-blue-50 text-blue-700 border-blue-200'
                              }`}>Tier {s.tier}</Badge>
                              <Badge variant="outline" className="text-[10px]">{formatLabel(s.signal_type)}</Badge>
                              <Badge className={`text-[10px] border ${
                                s.confidence === 'CONFIRMED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                s.confidence === 'LIKELY' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                'bg-gray-50 text-gray-600 border-gray-200'
                              }`}>{formatLabel(s.confidence)}</Badge>
                            </div>
                            <p className="text-gray-600 mt-0.5">{s.signal_detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recommended */}
                {report.report?.recommended_next_step && (
                  <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: '#3e869215', border: '1px solid #3e869240', color: '#2d6269' }}>
                    <strong>Recommended:</strong> {report.report.recommended_next_step}
                  </div>
                )}

                {/* Created indicator */}
                {report.opportunity_created && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4" />
                    Opportunity created in pipeline
                  </div>
                )}
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Close</Button>
              <Button
                onClick={() => { setReport(null); setUrl(''); setCompanyName(''); }}
                style={{ backgroundColor: '#3e8692', color: 'white' }}
                className="hover:opacity-90"
              >
                Qualify Another
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
