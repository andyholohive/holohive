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

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/dateFormat';
import { ListChecks, Wallet, Download } from 'lucide-react';

/**
 * The per-client tabs mount the REAL editing surfaces, not copies:
 * `LineupsTab` is the same Lineup Manager the campaign page renders (in its
 * `embedded` mode), and `EmbeddedBudgetTable` wraps the same
 * `BudgetTableView` behind a self-contained provider. Payments carry an
 * audit trigger and already have several write paths — a "lite" duplicate of
 * either table is how the two of them drift apart.
 *
 * Both are dynamic + ssr:false: they're heavy, and nobody pays for them
 * until a client tab is actually opened.
 */
const LineupsTab = dynamic(() => import('@/components/campaign/LineupsTab'), {
  ssr: false,
  loading: () => <Skeleton className="h-96 w-full rounded-lg" />,
});
const EmbeddedBudgetTable = dynamic(() => import('@/components/campaign/EmbeddedBudgetTable'), {
  ssr: false,
  loading: () => <Skeleton className="h-96 w-full rounded-lg" />,
});

export type RollupMode = 'lineups' | 'budgets';

type TabClient = {
  client_id: string;
  client_name: string;
  campaigns: Array<{
    campaign_id: string;
    campaign_name: string;
    start_date: string | null;
    covered_through: string | null;
  }>;
};

type LineupRow = {
  client_id: string; client_name: string;
  campaign_id: string; campaign_name: string;
  week_number: number; week_of: string; stage: string; kol_count: number;
};

/**
 * Budget is client-level, campaigns nest under it. See the long note on the
 * route's `BudgetClient` type: the contracted budget is the sum of the
 * client's engagement TERMS, so it belongs to the client, and repeating it on
 * each campaign row would imply N× the money for a client with N campaigns.
 */
type BudgetClient = {
  client_id: string; client_name: string;
  budget: number;
  budget_source: 'engagement_terms' | 'allocations' | 'campaign_total' | 'none';
  term_count: number;
  spent: number; remaining: number; pct_used: number | null;
  unpaid_count: number; unpaid_amount: number;
  campaigns: Array<{
    campaign_id: string; campaign_name: string; spent: number; paid_count: number;
    unpaid_count: number; unpaid_amount: number;
  }>;
};

/**
 * The one thing in this dialog that needs chasing today. A count is easy to
 * read past in a list of twelve clients; a dot is not, which is the whole
 * point of putting it beside the name.
 */
function AttentionDot({ title }: { title: string }) {
  return (
    <span
      title={title}
      aria-label={title}
      className="inline-block h-2 w-2 rounded-full bg-rose-500 flex-shrink-0"
    />
  );
}

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
  // Sign outside the symbol — `$-250` reads as a typo; `-$250` reads as debt.
  const v = Math.round(n);
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US')}`;
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
  const [budgets, setBudgets] = useState<BudgetClient[]>([]);
  const [tabs, setTabs] = useState<TabClient[]>([]);
  const [failed, setFailed] = useState(false);
  const { userProfile } = useAuth();

  /** `null` = the cross-client Overview; otherwise a client_id. */
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  /** Only meaningful for clients with more than one campaign. */
  const [campaignByClient, setCampaignByClient] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch('/api/campaigns/rollup', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Request failed');
      setLineups(json.lineups ?? []);
      setBudgets(json.budgets ?? []);
      setTabs(json.tabs ?? []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on open rather than on mount — this is a rollup over every active
  // client, and the page shouldn't pay for it unless someone asks.
  useEffect(() => { if (open) void load(); }, [open, load]);

  // A fresh open always lands on the Overview — the working question is
  // "who needs attention", and reopening into whichever client you edited
  // last hides that.
  useEffect(() => { if (open) setActiveClientId(null); }, [open]);

  const isLineups = mode === 'lineups';
  const Icon = isLineups ? ListChecks : Wallet;
  const grouped = groupByClient(lineups);
  const isEmpty = isLineups ? grouped.length === 0 : budgets.length === 0;

  const activeTab = useMemo(
    () => tabs.find(t => t.client_id === activeClientId) ?? null,
    [tabs, activeClientId],
  );
  const activeCampaign = useMemo(() => {
    if (!activeTab) return null;
    const chosen = campaignByClient[activeTab.client_id];
    return activeTab.campaigns.find(c => c.campaign_id === chosen) ?? activeTab.campaigns[0];
  }, [activeTab, campaignByClient]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        `[transform:none!important]` + explicit insets replace DialogContent's
        default `translate-x/y-[-50%]` centering. A transformed ancestor
        becomes the containing block for `position: fixed` descendants, and
        dnd-kit's DragOverlay is fixed — with the transform in place the KOL
        you drag in the embedded Lineup Manager renders offset by half the
        dialog, which reads as a broken drag rather than a CSS artifact.
      */}
      <DialogContent className="!bg-white !left-[2vw] !right-[2vw] !top-[5vh] [transform:none!important] w-auto max-w-none max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-brand flex-shrink-0" />
            {isLineups ? 'All Lineups' : 'All Budgets'}
            {/* [2026-08-18, Andy] One button to pull every unpaid payment
                out for a finance chase. Budgets only — there is no unpaid
                anything on the lineups side. Deliberately exports ALL
                unpaid rows, not just this dialog's active non-ad-hoc
                clients: only 2 of 83 sit in that scope, so scoping it here
                would hide the other 81. See the route for the reasoning;
                the CSV carries an "In Rollup Scope" column instead. */}
            {!isLineups && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto mr-8"
                onClick={() => { window.location.href = '/api/campaigns/unpaid-export'; }}
                title="Download every payment with no payment date, across all clients"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export unpaid
              </Button>
            )}
          </DialogTitle>
          <DialogDescription>
            {activeTab
              ? (isLineups
                ? `Editing ${activeTab.client_name}'s lineups — the same Lineup Manager as the campaign page.`
                : `Editing ${activeTab.client_name}'s payments — the same table as the campaign's Budget tab.`)
              : (isLineups
                ? 'Every week across every active client, with its current stage. Pick a client to edit its lineups.'
                : 'Contracted budget against spend for every active client. Budget is the sum of the client’s engagement terms, renewals included. Pick a client to edit its payments.')}
          </DialogDescription>
        </DialogHeader>

        {/* Client tab strip. Overview stays first and unchanged — it's the
            reason the dialog exists; the per-client tabs are the follow-up
            action once the overview shows you where to look. */}
        {!loading && !failed && tabs.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto border-b border-cream-200 pb-2 -mb-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => setActiveClientId(null)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                activeClientId === null
                  ? 'bg-brand-light text-brand'
                  : 'text-ink-warm-500 hover:bg-cream-100'
              }`}
            >
              Overview
            </button>
            {tabs.map(t => (
              <button
                key={t.client_id}
                type="button"
                onClick={() => setActiveClientId(t.client_id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  activeClientId === t.client_id
                    ? 'bg-brand-light text-brand'
                    : 'text-ink-warm-500 hover:bg-cream-100'
                }`}
              >
                {t.client_name}
              </button>
            ))}
          </div>
        )}

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
          ) : activeTab ? (
            <div className="space-y-3">
              {/* Campaign sub-picker, only when there's a choice to make.
                  Lineups and payments are per-CAMPAIGN while the tab is per
                  CLIENT, and 8 of 9 active clients have exactly one campaign
                  — a picker that always renders would be dead chrome on
                  nearly every tab. */}
              {activeTab.campaigns.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wider text-ink-warm-400">Campaign</span>
                  <Select
                    value={activeCampaign?.campaign_id ?? ''}
                    onValueChange={(v) => setCampaignByClient(prev => ({ ...prev, [activeTab.client_id]: v }))}
                  >
                    <SelectTrigger className="h-9 w-[280px] focus-brand"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {activeTab.campaigns.map(c => (
                        <SelectItem key={c.campaign_id} value={c.campaign_id}>{c.campaign_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {!activeCampaign ? (
                <EmptyState
                  icon={Icon}
                  title="No campaign yet"
                  description="This client has no campaign to edit."
                />
              ) : isLineups ? (
                <LineupsTab
                  key={activeCampaign.campaign_id}
                  embedded
                  campaignId={activeCampaign.campaign_id}
                  campaignStartDate={activeCampaign.start_date ?? ''}
                  campaignCoveredThrough={activeCampaign.covered_through}
                  campaignName={activeCampaign.campaign_name}
                  currentUserId={(userProfile as any)?.id ?? null}
                  currentUserName={(userProfile as any)?.name ?? (userProfile as any)?.email ?? 'User'}
                />
              ) : (
                <EmbeddedBudgetTable key={activeCampaign.campaign_id} campaignId={activeCampaign.campaign_id} />
              )}

              <div className="flex justify-end pt-1">
                <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                  <a href={`/campaigns/${activeCampaign?.campaign_id ?? ''}`} target="_blank" rel="noopener noreferrer">
                    Open full campaign page →
                  </a>
                </Button>
              </div>
            </div>
          ) : isEmpty ? (
            <EmptyState
              icon={Icon}
              title={isLineups ? 'No lineups yet' : 'No campaigns yet'}
              description={isLineups
                ? 'Lineups appear here once a campaign has its first week.'
                : 'Budgets appear here once an active client has a campaign.'}
            />
          ) : (
            <div className="space-y-6">
              {!isLineups && budgets.map(b => (
                <div key={b.client_id}>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-sm font-semibold text-ink-warm-900">{b.client_name}</h3>
                    {b.unpaid_count > 0 && (
                      <AttentionDot title={`${b.unpaid_count} unpaid payment${b.unpaid_count === 1 ? '' : 's'} · ${money(b.unpaid_amount)}`} />
                    )}
                    {/* Where the budget came from. A client on engagement terms
                        is the normal case; anything else is worth noticing,
                        because it means nobody has recorded the contract. */}
                    <span className="text-[11px] uppercase tracking-wider text-ink-warm-400 tabular">
                      {b.budget_source === 'engagement_terms'
                        ? `${b.term_count} ${b.term_count === 1 ? 'term' : 'terms'}`
                        : b.budget_source === 'allocations' ? 'From allocations'
                          : b.budget_source === 'campaign_total' ? 'From campaign total'
                            : 'No terms recorded'}
                    </span>
                    <span className="flex-1 h-px bg-cream-200" aria-hidden />
                  </div>

                  <div className="rounded-lg border border-cream-200 overflow-hidden bg-white">
                    <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {([
                        ['Budget', b.budget > 0 ? money(b.budget) : 'Not set'],
                        ['Spent', money(b.spent)],
                        ['Remaining', b.budget > 0 ? money(b.remaining) : '—'],
                      ] as const).map(([label, value]) => (
                        <div key={label}>
                          <p className="text-[10px] uppercase tracking-wider text-ink-warm-400">{label}</p>
                          <p className={`text-lg font-bold tabular-nums ${
                            label === 'Remaining' && b.budget > 0 && b.remaining < 0 ? 'text-rose-600' : 'text-ink-warm-900'
                          }`}>{value}</p>
                        </div>
                      ))}
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-ink-warm-400">Used</p>
                        {b.pct_used === null ? (
                          <p className="text-lg font-bold text-ink-warm-400">—</p>
                        ) : (
                          <>
                            <p className={`text-lg font-bold tabular-nums ${b.pct_used > 100 ? 'text-rose-600' : 'text-ink-warm-900'}`}>
                              {Math.round(b.pct_used)}%
                            </p>
                            <div className="h-1.5 mt-1 rounded-full bg-cream-200 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  b.pct_used > 100 ? 'bg-rose-500'
                                    : b.pct_used > 85 ? 'bg-amber-500'
                                      : 'bg-brand'
                                }`}
                                style={{ width: `${Math.min(100, Math.max(0, b.pct_used))}%` }}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Spend split by campaign. Only shown when there's more
                        than one — for a single-campaign client the split is
                        the total again, and the row adds nothing.

                        [2026-08-19, Andy] While anything is unpaid, this lists
                        only the campaigns that owe money — that is the reason
                        anyone opens this dialog. Once a client is fully paid
                        there is nothing to chase, so it falls back to the full
                        split rather than rendering an empty table. */}
                    {(() => {
                      const owing = b.campaigns.filter(c => c.unpaid_count > 0);
                      const rows = owing.length > 0 ? owing : b.campaigns;
                      const filtered = owing.length > 0;
                      if (rows.length <= 1 && !filtered) return null;
                      return (
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                            <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Campaign</TableHead>
                            <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Spent</TableHead>
                            <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                              {filtered ? 'Owing' : 'Payments'}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map(c => (
                            <TableRow key={c.campaign_id} className="border-gray-100">
                              <TableCell className="py-3 font-medium">
                                <span className="inline-flex items-center gap-2">
                                  {c.unpaid_count > 0 && (
                                    <AttentionDot title={`${c.unpaid_count} unpaid · ${money(c.unpaid_amount)}`} />
                                  )}
                                  {c.campaign_name}
                                </span>
                              </TableCell>
                              <TableCell className="py-3 tabular-nums">{money(c.spent)}</TableCell>
                              <TableCell className="py-3 tabular-nums">
                                {c.unpaid_count > 0
                                  ? <span className="text-rose-600">{c.unpaid_count} unpaid</span>
                                  : c.paid_count}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      );
                    })()}
                  </div>
                </div>
              ))}

              {isLineups && grouped.map(([clientId, group]) => {
                // Proposed means sent to the client and still waiting on them.
                // It is the only stage in this dialog where someone is blocked,
                // so it gets the same dot unpaid money gets on the other tab.
                const pending = group.rows.filter(r => r.stage === 'proposed').length;
                return (
                <div key={clientId}>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-sm font-semibold text-ink-warm-900">{group.name}</h3>
                    {pending > 0 && (
                      <AttentionDot title={`${pending} lineup${pending === 1 ? '' : 's'} proposed, awaiting confirmation`} />
                    )}
                    <span className="text-[11px] uppercase tracking-wider text-ink-warm-400 tabular">
                      {group.rows.length} {group.rows.length === 1 ? 'week' : 'weeks'}
                    </span>
                    <span className="flex-1 h-px bg-cream-200" aria-hidden />
                  </div>

                  <div className="rounded-lg border border-cream-200 overflow-hidden">
                    <div className="overflow-x-auto">
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
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
