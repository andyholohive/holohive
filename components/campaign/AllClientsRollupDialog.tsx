'use client';

/**
 * All Lineups / All Budgets — cross-client overview dialogs on /campaigns.
 *
 * Per Andy 2026-08-14: both answers already exist, but only one client at a
 * time, inside that client's own modal. "Which weeks are still unconfirmed"
 * and "who is close to their budget" were seven-click questions. These two
 * dialogs are the same data grouped by client so the whole book reads at once.
 *
 * One component with a `mode` prop rather than two files: the chrome, the
 * fetch, the client grouping and the empty/loading states are identical, and
 * only the row body differs. Both share a single /api/campaigns/rollup call.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/dateFormat';
import { ListChecks, Wallet } from 'lucide-react';

export type RollupMode = 'lineups' | 'budgets';

type LineupRow = {
  client_id: string; client_name: string;
  campaign_id: string; campaign_name: string;
  week_number: number; week_of: string; stage: string; kol_count: number;
};

type BudgetRow = {
  client_id: string; client_name: string;
  campaign_id: string; campaign_name: string;
  budget: number; spent: number; remaining: number;
  pct_used: number | null; paid_count: number;
};

/** Same tones the Lineup Manager uses, so a week reads identically in both. */
const STAGE_TONE: Record<string, BadgeTone> = {
  draft: 'neutral',
  proposed: 'warning',
  confirmed: 'success',
  brief_preview: 'info',
  approved: 'brand',
  delivered: 'success',
  completed: 'info',
};
const STAGE_LABEL: Record<string, string> = {
  draft: 'Draft',
  proposed: 'Proposed',
  confirmed: 'Confirmed',
  brief_preview: 'Brief Preview',
  approved: 'Approved · Links Minted',
  delivered: 'Delivered',
  completed: 'Completed',
};

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** Group any row set by client, preserving the API's ordering. */
function groupByClient<T extends { client_id: string; client_name: string }>(rows: T[]) {
  const map = new Map<string, { name: string; rows: T[] }>();
  for (const r of rows) {
    const cur = map.get(r.client_id) ?? { name: r.client_name, rows: [] as T[] };
    cur.rows.push(r);
    map.set(r.client_id, cur);
  }
  return [...map.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
}

export function AllClientsRollupDialog({
  mode,
  open,
  onOpenChange,
}: {
  mode: RollupMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [lineups, setLineups] = useState<LineupRow[]>([]);
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch('/api/campaigns/rollup', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Request failed');
      setLineups(json.lineups ?? []);
      setBudgets(json.budgets ?? []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on open rather than on mount — this is a rollup over every active
  // client, and the page shouldn't pay for it unless someone asks.
  useEffect(() => { if (open) void load(); }, [open, load]);

  const isLineups = mode === 'lineups';
  const Icon = isLineups ? ListChecks : Wallet;
  const grouped = isLineups ? groupByClient(lineups) : groupByClient(budgets);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!bg-white w-[95vw] max-w-5xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-brand flex-shrink-0" />
            {isLineups ? 'All Lineups' : 'All Budgets'}
          </DialogTitle>
          <DialogDescription>
            {isLineups
              ? 'Every week across every active client, with its current stage. Read-only — open a campaign to edit.'
              : 'Budget against spend for every active client campaign. Read-only — open a campaign to record payments.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-24 w-full rounded-lg" />
                </div>
              ))}
            </div>
          ) : failed ? (
            <EmptyState
              icon={Icon}
              title="Couldn't load"
              description="The rollup request failed. Close and reopen to try again."
            />
          ) : grouped.length === 0 ? (
            <EmptyState
              icon={Icon}
              title={isLineups ? 'No lineups yet' : 'No campaigns yet'}
              description={isLineups
                ? 'Lineups appear here once a campaign has its first week.'
                : 'Budgets appear here once an active client has a campaign.'}
            />
          ) : (
            <div className="space-y-6">
              {grouped.map(([clientId, group]) => (
                <div key={clientId}>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-sm font-semibold text-ink-warm-900">{group.name}</h3>
                    <span className="text-[11px] uppercase tracking-wider text-ink-warm-400 tabular">
                      {group.rows.length} {isLineups
                        ? (group.rows.length === 1 ? 'week' : 'weeks')
                        : (group.rows.length === 1 ? 'campaign' : 'campaigns')}
                    </span>
                    <span className="flex-1 h-px bg-cream-200" aria-hidden />
                  </div>

                  <div className="rounded-lg border border-cream-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      {isLineups ? (
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                              <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Campaign</TableHead>
                              <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Week</TableHead>
                              <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Week of</TableHead>
                              <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">KOLs</TableHead>
                              <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(group.rows as LineupRow[]).map(r => (
                              <TableRow key={`${r.campaign_id}-${r.week_number}`} className="border-gray-100">
                                <TableCell className="py-3 font-medium">{r.campaign_name}</TableCell>
                                <TableCell className="py-3 tabular-nums">{r.week_number}</TableCell>
                                <TableCell className="py-3">{formatDate(r.week_of)}</TableCell>
                                <TableCell className="py-3 tabular-nums">
                                  {r.kol_count > 0
                                    ? r.kol_count
                                    : <span className="text-ink-warm-400">—</span>}
                                </TableCell>
                                <TableCell className="py-3">
                                  <StatusBadge tone={STAGE_TONE[r.stage] ?? 'neutral'} size="sm">
                                    {STAGE_LABEL[r.stage] ?? r.stage}
                                  </StatusBadge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                              <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Campaign</TableHead>
                              <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Budget</TableHead>
                              <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Spent</TableHead>
                              <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Remaining</TableHead>
                              <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Used</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(group.rows as BudgetRow[]).map(r => (
                              <TableRow key={r.campaign_id} className="border-gray-100">
                                <TableCell className="py-3 font-medium">{r.campaign_name}</TableCell>
                                <TableCell className="py-3 tabular-nums">
                                  {r.budget > 0
                                    ? money(r.budget)
                                    : <span className="text-ink-warm-400">Not set</span>}
                                </TableCell>
                                <TableCell className="py-3 tabular-nums">{money(r.spent)}</TableCell>
                                <TableCell className={`py-3 tabular-nums ${r.budget > 0 && r.remaining < 0 ? 'text-rose-600 font-medium' : ''}`}>
                                  {r.budget > 0
                                    ? money(r.remaining)
                                    : <span className="text-ink-warm-400">—</span>}
                                </TableCell>
                                <TableCell className="py-3">
                                  {r.pct_used === null ? (
                                    <span className="text-ink-warm-400 text-xs">No budget set</span>
                                  ) : (
                                    /* Bar + number: the number is the fact, the
                                       bar is what makes an over-budget row
                                       visible without reading every cell. */
                                    <div className="flex items-center gap-2 min-w-[120px]">
                                      <div className="h-1.5 flex-1 rounded-full bg-cream-200 overflow-hidden">
                                        <div
                                          className={`h-full rounded-full ${
                                            r.pct_used > 100 ? 'bg-rose-500'
                                              : r.pct_used > 85 ? 'bg-amber-500'
                                                : 'bg-brand'
                                          }`}
                                          style={{ width: `${Math.min(100, Math.max(0, r.pct_used))}%` }}
                                        />
                                      </div>
                                      <span className={`text-xs tabular-nums ${r.pct_used > 100 ? 'text-rose-600 font-medium' : 'text-ink-warm-500'}`}>
                                        {Math.round(r.pct_used)}%
                                      </span>
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
