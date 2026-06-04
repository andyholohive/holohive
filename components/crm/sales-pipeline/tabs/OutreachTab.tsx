'use client';

/**
 * OutreachTab — the Cold-DM table. The rep's primary work surface
 * for top-of-funnel activity.
 *
 * Layout:
 *   1. Personal metrics strip (top) — 7 stat cells (Touch 1s,
 *      Replies, Reply %, Qualified, Booked, Held, No-show) over the
 *      last 30 days for the logged-in user. Links to the team view.
 *   2. Owner sub-tabs — "My Outreach" → "All Owners" → one tab per
 *      active teammate. Default = "Mine".
 *   3. Filter row — Search + Path (Closer/SDR) + Bucket + Bump
 *      Status. The page hides search when this tab is nested inside
 *      the Overview tab's collapsible section (it has its own
 *      unified search there).
 *   4. Sticky bulk-action toolbar — only renders when ≥1 row is
 *      selected. Bump All, Move to Warm, Reassign (searchable
 *      teammate Popover with "Unassigned" option), Delete.
 *   5. Section header — sky-tinted "Cold DM · N" + pagination
 *      summary.
 *   6. Table — 9 columns (checkbox/row#, Name, POC, TG Handle,
 *      Source, Owner, Created, "Last engaged · next move" combo
 *      cell, actions menu).
 *   7. Pagination.
 *
 * The "Last engaged · next move" combo cell is the merged version of
 * the old separate Bumps + Last Bump + Next Move columns. Top row
 * shows the bump dot tracker + how long since last engagement (amber
 * when ≥3d stale); bottom row shows the action engine's recommended
 * next step, color-coded by priority. Inline Zap button records a
 * bump without leaving the row.
 *
 * Extracted from `app/crm/sales-pipeline/page.tsx` (was
 * `renderOutreachTab`, ~543 LOC) on 2026-06-02 as part of Phase 2.
 * Consumes ~30 fields from `SalesPipelineContext`. The function
 * signature accepts a `hideSearch` flag because the page renders
 * this tab in two places (the standalone Outreach tab + the
 * Overview tab's collapsible Outreach section).
 */

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  Edit,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Search,
  Trash2,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useSalesPipeline } from '@/contexts/SalesPipelineContext';
import { ProjectNameSuffix } from '@/components/crm/sales-pipeline/ProjectNameSuffix';
import { OwnerCell } from '@/components/crm/sales-pipeline/cells/OwnerCell';
import { PocCell } from '@/components/crm/sales-pipeline/cells/PocCell';
import type {
  Bucket,
  DmAccount,
} from '@/lib/salesPipelineService';
import type { OpportunityStage } from '@/lib/crmService';

/** No props. The standalone-Overall-Outreach collapsible (which used
 *  to pass `hideSearch={true}`) was removed; the page-level unified
 *  search now drives this tab's filter regardless. */
export function OutreachTab() {
  const { user } = useAuth();
  const {
    computeOutreachMetrics,
    openMetricsView,
    activeUsers,
    overallSearch,
    outreachFilters,
    setOutreachFilters,
    outreachPage,
    setOutreachPage,
    outreachTotal,
    outreachTotalPages,
    outreachAllTotal,
    outreachLoading,
    outreachOpps,
    sortedOutreach,
    outreachNameCounts,
    outreachStart,
    outreachEnd,
    selectedOutreach,
    setSelectedOutreach,
    toggleOutreachSelect,
    selectAllOnPage,
    handleBulkBump,
    handleBulkMoveToWarm,
    handleBulkDelete,
    handleBulkReassignOwner,
    isBulkBumping,
    isBulkMoving,
    isBulkReassigning,
    bulkOwnerOpen,
    setBulkOwnerOpen,
    getNextAction,
    handleRecordBump,
    isBumping,
    handleStageChange,
    handleDelete,
    openSlideOver,
    openEditDialog,
    setForm,
    setIsCreateOpen,
  } = useSalesPipeline();

  return (
    <div className="pb-8">
      {/* Personal metrics strip — current user's last-30-day scorecard
          for self-feedback while they're working. Manager-style team
          aggregate lives on the Metrics tab. */}
      {user?.id && (() => {
        const personal = computeOutreachMetrics(user.id, 30);
        const items = [
          { label: 'Touch 1s', value: personal.touch1s },
          { label: 'Replies', value: personal.replies },
          { label: 'Reply %', value: `${(personal.replyRate * 100).toFixed(0)}%`, tone: personal.replyRate >= 0.2 ? 'good' as const : 'neutral' as const },
          { label: 'Qualified', value: personal.qualified },
          { label: 'Booked', value: personal.callsBooked },
          { label: 'Held', value: personal.callsHeld, tone: 'good' as const },
          { label: 'No-show', value: personal.noShows, tone: personal.noShows > 0 ? 'bad' as const : 'neutral' as const },
        ];
        return (
          <div className="mb-4 bg-gradient-to-r from-sky-50 to-white border border-sky-100 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-sky-700 uppercase tracking-wide">My outreach · last 30 days</span>
              <button
                onClick={openMetricsView}
                className="text-xs text-sky-700 hover:underline"
              >
                View team metrics →
              </button>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {items.map(it => (
                <div key={it.label} className="text-center">
                  <div className="text-[10px] text-ink-warm-500 uppercase tracking-wider">{it.label}</div>
                  <div className={`text-lg font-bold tabular-nums ${
                    it.tone === 'good' ? 'text-emerald-700' :
                    it.tone === 'bad' ? 'text-rose-600' :
                    'text-ink-warm-900'
                  }`}>{it.value}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Owner sub-tabs — v11 segmented control. Mirrors the
          main tab strip, the ActionsTab phase tabs, and the
          Intelligence sub-tabs so all "pick one of N" affordances
          look identical across the app. The previous sky-tinted
          pills competed with the section header tints; the cream
          base lets the badge tones carry the only color signal. */}
      <div className="inline-flex bg-cream-100 p-1 rounded-md border border-cream-200 mb-4 flex-wrap">
        <button
          type="button"
          onClick={() => { setOutreachFilters(prev => ({ ...prev, owner_id: 'mine' })); setOutreachPage(1); setSelectedOutreach([]); }}
          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
            outreachFilters.owner_id === 'mine'
              ? 'bg-white shadow-card text-brand'
              : 'text-ink-warm-500 hover:bg-cream-200'
          }`}
        >
          My Outreach
        </button>
        <button
          type="button"
          onClick={() => { setOutreachFilters(prev => ({ ...prev, owner_id: undefined })); setOutreachPage(1); setSelectedOutreach([]); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
            !outreachFilters.owner_id
              ? 'bg-white shadow-card text-brand'
              : 'text-ink-warm-500 hover:bg-cream-200'
          }`}
        >
          All Owners
          <span className="text-[10px] tabular-nums opacity-70">{outreachAllTotal}</span>
        </button>
        {activeUsers.filter(u => u.id !== user?.id).map(u => (
          <button
            key={u.id}
            type="button"
            onClick={() => { setOutreachFilters(prev => ({ ...prev, owner_id: u.id })); setOutreachPage(1); setSelectedOutreach([]); }}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              outreachFilters.owner_id === u.id
                ? 'bg-white shadow-card text-brand'
                : 'text-ink-warm-500 hover:bg-cream-200'
            }`}
          >
            {u.name || u.email}
          </button>
        ))}
      </div>

      {/* Filters — search input removed 2026-06-03 (driven from the
          page-level unified search; outreachFilters.searchTerm is
          updated via the broadcast useEffect). */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Select
          value={outreachFilters.dm_account || 'all'}
          onValueChange={v => { setOutreachFilters(prev => ({ ...prev, dm_account: v === 'all' ? undefined : v as DmAccount })); setOutreachPage(1); setSelectedOutreach([]); }}
        >
          <SelectTrigger className="h-9 w-auto text-sm focus-brand [&>span]:truncate-none [&>span]:line-clamp-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Paths</SelectItem>
            <SelectItem value="closer">Closer</SelectItem>
            <SelectItem value="sdr">SDR</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={outreachFilters.bucket || 'all'}
          onValueChange={v => { setOutreachFilters(prev => ({ ...prev, bucket: v === 'all' ? undefined : v as Bucket })); setOutreachPage(1); setSelectedOutreach([]); }}
        >
          <SelectTrigger className="h-9 w-auto text-sm focus-brand [&>span]:truncate-none [&>span]:line-clamp-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Buckets</SelectItem>
            <SelectItem value="A">Bucket A</SelectItem>
            <SelectItem value="B">Bucket B</SelectItem>
            <SelectItem value="C">Bucket C</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={outreachFilters.bumpRange || 'all'}
          onValueChange={v => { setOutreachFilters(prev => ({ ...prev, bumpRange: v === 'all' ? undefined : v as 'none' | '1-2' | '3+' })); setOutreachPage(1); setSelectedOutreach([]); }}
        >
          <SelectTrigger className="h-9 w-auto text-sm focus-brand [&>span]:truncate-none [&>span]:line-clamp-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Bump Status</SelectItem>
            <SelectItem value="none">No Bumps</SelectItem>
            <SelectItem value="1-2">1-2 Bumps</SelectItem>
            <SelectItem value="3+">3+ Bumps</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action toolbar — sticky so it stays visible while
          scrolling. `top-0` pins it to the viewport; z-30 keeps it
          above the table header but below dialogs/dropdowns.
          [Cleanup 2026-06-02] Was bg-sky-50 with solid bg-sky-600 /
          bg-amber-600 buttons — competed visually with the Outreach
          section header. Now neutral cream-50 toolbar with outline
          buttons + colored icon cues; the destructive Delete keeps
          its rose treatment as the only color signal. */}
      {selectedOutreach.length > 0 && (
        <div className="sticky top-0 z-30 flex items-center gap-2 mb-3 px-4 py-2.5 bg-cream-50 border border-cream-200 rounded-lg shadow-sm">
          <span className="text-sm font-medium text-ink-warm-900">{selectedOutreach.length} selected</span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectAllOnPage}>
            Select All on Page
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSelectedOutreach([])}>
            Deselect All
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleBulkBump}
            disabled={isBulkBumping}
          >
            {isBulkBumping ? <Loader2 className="h-3 w-3 animate-spin mr-1 text-sky-500" /> : <Zap className="h-3 w-3 mr-1 text-sky-500" />}
            Bump All
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleBulkMoveToWarm}
            disabled={isBulkMoving}
          >
            {isBulkMoving ? <Loader2 className="h-3 w-3 animate-spin mr-1 text-amber-500" /> : <ArrowRight className="h-3 w-3 mr-1 text-amber-500" />}
            Move to Warm
          </Button>
          {/* Bulk owner reassign — searchable list of teammates.
              "Unassigned" clears the owner. */}
          <Popover open={bulkOwnerOpen} onOpenChange={setBulkOwnerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={isBulkReassigning}
              >
                {isBulkReassigning
                  ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  : <Users className="h-3 w-3 mr-1" />}
                Reassign
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="end">
              <Command>
                <CommandInput placeholder="Reassign to..." />
                <CommandList>
                  <CommandEmpty>No matches.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="__unassigned__"
                      onSelect={() => handleBulkReassignOwner(null, 'Unassigned')}
                    >
                      <span className="text-ink-warm-500 italic">Unassigned</span>
                    </CommandItem>
                    {activeUsers.map(u => (
                      <CommandItem
                        key={u.id}
                        value={`${u.name || ''} ${u.email}`}
                        onSelect={() => handleBulkReassignOwner(u.id, u.name || u.email)}
                      >
                        <div className="flex flex-col">
                          <span>{u.name || u.email}</span>
                          {u.name && <span className="text-[10px] text-ink-warm-400">{u.email}</span>}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
            onClick={handleBulkDelete}
          >
            <Trash2 className="h-3 w-3 mr-1" /> Delete
          </Button>
        </div>
      )}

      {/* Stage Header — cream-neutral chrome (was bg-sky-50) per
          the Overview neutralization pass. The "Cold DM" label
          stays prominent via font weight + StatusBadge with info
          tone for the count chip — same visual rhythm as the
          PipelineTable stage section headers (which keep STAGE_COLORS
          deliberately, since stage taxonomy is its own semantic
          system). */}
      <div className="flex items-center justify-between px-4 py-3 bg-cream-50 rounded-t-lg border border-cream-200 border-b-0">
        <div className="flex items-center gap-2.5">
          <MessageSquare className="h-4 w-4 text-ink-warm-500" />
          <h4 className="font-semibold text-ink-warm-900">Cold DM</h4>
          <StatusBadge tone="info" size="sm">{outreachTotal}</StatusBadge>
        </div>
        {outreachTotalPages > 1 && (
          <span className="text-sm text-ink-warm-500 tabular-nums">
            Page {outreachPage} of {outreachTotalPages}
          </span>
        )}
      </div>

      {/* Table */}
      {outreachLoading ? (
        // Structural skeleton — header row + 10 body rows in the
        // exact shape of the loaded layout. Widths match the real
        // TableHead column widths so the layout doesn't shift when
        // data arrives. Real columns (for reference):
        //   w-10 · min-w-[160px] · w-[200px] · w-[150px] · w-[80px]
        //   · w-[100px] · w-[90px] · w-[260px] · w-[50px]
        <div className="bg-white rounded-b-lg border border-cream-200 border-t-0 overflow-hidden">
          <div className="border-b border-cream-200 bg-cream-50/50 py-3 px-4 flex items-center gap-3">
            <div className="w-10 flex justify-center"><Skeleton className="h-3 w-3" /></div>
            <div className="min-w-[160px] flex-1"><Skeleton className="h-3 w-12" /></div>
            <div className="w-[200px]"><Skeleton className="h-3 w-10" /></div>
            <div className="w-[150px]"><Skeleton className="h-3 w-16" /></div>
            <div className="w-[80px]"><Skeleton className="h-3 w-12" /></div>
            <div className="w-[100px]"><Skeleton className="h-3 w-12" /></div>
            <div className="w-[90px]"><Skeleton className="h-3 w-14" /></div>
            <div className="w-[260px]"><Skeleton className="h-3 w-40" /></div>
            <div className="w-[50px]"></div>
          </div>
          <div>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3 px-4 border-b border-cream-100 last:border-0">
                <div className="w-10 flex justify-center"><Skeleton className="h-4 w-4" /></div>
                <div className="min-w-[160px] flex-1 flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 flex-1 max-w-[140px]" />
                </div>
                <div className="w-[200px] flex items-center gap-1.5">
                  <Skeleton className="h-5 w-14 rounded-md" />
                  <Skeleton className="h-3 flex-1 max-w-[110px]" />
                </div>
                <div className="w-[150px]"><Skeleton className="h-3 w-24" /></div>
                <div className="w-[80px]"><Skeleton className="h-3 w-14" /></div>
                <div className="w-[100px]"><Skeleton className="h-5 w-16 rounded-full" /></div>
                <div className="w-[90px]"><Skeleton className="h-3 w-12" /></div>
                <div className="w-[260px] space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-8" />
                    <Skeleton className="h-2 w-12" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-3 w-40" />
                </div>
                <div className="w-[50px]"><Skeleton className="h-4 w-4 rounded" /></div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-b-lg border border-cream-200 border-t-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-10"></TableHead>
                <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap min-w-[160px]">Name</TableHead>
                <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[200px] max-w-[200px]">POC</TableHead>
                <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[150px]">TG Handle</TableHead>
                <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[80px]">Source</TableHead>
                <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[100px]">Owner</TableHead>
                <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[90px]">Created</TableHead>
                <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[260px]">Last engaged · next move</TableHead>
                <TableHead className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outreachOpps.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-xs text-ink-warm-400 italic py-8">
                    {overallSearch || outreachFilters.dm_account || outreachFilters.bucket || outreachFilters.bumpRange
                      ? 'No matching cold-DMs · try widening the filters'
                      : "No cold-DMs in this view · use 'New Opportunity' in the page header to add one"}
                  </TableCell>
                </TableRow>
              ) : sortedOutreach.map((opp, index) => {
                const isChecked = selectedOutreach.includes(opp.id);
                const rowNum = outreachStart + index;
                const prevName = index > 0 ? sortedOutreach[index - 1].name : null;
                const isFirstInGroup = opp.name !== prevName;
                const groupCount = outreachNameCounts.get(opp.name || '') || 1;
                const nextName = index < sortedOutreach.length - 1 ? sortedOutreach[index + 1].name : null;
                const isLastInGroup = opp.name !== nextName;
                return (
                  <TableRow
                    key={opp.id}
                    className={`group hover:bg-cream-50 cursor-pointer ${!isFirstInGroup ? 'border-t-0' : ''} ${isLastInGroup && groupCount > 1 ? 'border-b-2 border-b-cream-200' : ''}`}
                    onClick={() => openSlideOver(opp)}
                  >
                    <TableCell className="text-ink-warm-500 text-sm w-10" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center">
                        {isChecked ? (
                          <Checkbox
                            checked={true}
                            onCheckedChange={() => toggleOutreachSelect(opp.id)}
                          />
                        ) : (
                          <>
                            <span className="block group-hover:hidden text-xs">{rowNum}</span>
                            <span className="hidden group-hover:flex">
                              <Checkbox
                                checked={false}
                                onCheckedChange={() => toggleOutreachSelect(opp.id)}
                              />
                            </span>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className={`${!isFirstInGroup ? 'pt-0' : ''}`}>
                      {isFirstInGroup ? (
                        <div className="flex items-center gap-1.5 cursor-pointer hover:bg-cream-100 rounded px-2 py-1 -mx-2 -my-1 whitespace-nowrap overflow-hidden">
                          <Building2 className="h-4 w-4 text-ink-warm-400 shrink-0" />
                          <span className="font-medium truncate">{opp.name}</span>
                          <ProjectNameSuffix twitterHandle={opp.twitter_handle} onEdit={() => openEditDialog(opp)} />
                          {groupCount > 1 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cream-100 text-ink-warm-500 font-medium shrink-0 whitespace-nowrap">{groupCount} POCs</span>
                          )}
                          {/* "Add another POC" — sits inline next to the
                              Twitter + button so both add-affordances
                              are grouped (one adds a contact, the other
                              adds an attribute). */}
                          <button
                            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 flex items-center justify-center rounded hover:bg-cream-200 text-ink-warm-400 "
                            title="Add another POC for this project"
                            onClick={e => {
                              e.stopPropagation();
                              setForm({
                                name: opp.name,
                                stage: 'cold_dm' as OpportunityStage,
                                dm_account: opp.dm_account,
                                bucket: opp.bucket || undefined,
                                source: opp.source || undefined,
                                owner_id: opp.owner_id || undefined,
                                co_owner_ids: opp.co_owner_ids || undefined,
                                referrer: opp.referrer || undefined,
                                affiliate_id: opp.affiliate_id || undefined,
                                twitter_handle: opp.twitter_handle || undefined,
                              });
                              setIsCreateOpen(true);
                            }}
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="pl-8 text-ink-warm-300 text-xs">└</div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap max-w-[200px] overflow-hidden">
                      <PocCell opp={opp} maxWidth="max-w-[150px]" />
                    </TableCell>
                    <TableCell className="text-ink-warm-500 whitespace-nowrap">{opp.tg_handle || '—'}</TableCell>
                    <TableCell className="text-ink-warm-500 text-xs capitalize">{opp.source?.replace('_', ' ') || '—'}</TableCell>
                    <TableCell><OwnerCell opp={opp} /></TableCell>
                    <TableCell className="text-ink-warm-500 text-xs">
                      {opp.created_at ? format(new Date(opp.created_at), 'MMM d') : '—'}
                    </TableCell>
                    {/* Combined "Last engaged · next move" cell.
                        Top row: bump dots + count, last-engagement timestamp,
                                 and the Zap button to record another bump.
                        Bottom row: the recommended next move from
                                 getNextAction (same logic the Actions tab
                                 uses), color-coded by priority.
                        Stops click propagation so the inline buttons don't
                        bubble into openSlideOver. */}
                    <TableCell className="text-xs" onClick={e => e.stopPropagation()}>
                      {(() => {
                        const action = getNextAction(opp);
                        const lastEngaged = opp.last_bump_date || opp.last_contacted_at;
                        const lastEngagedLabel = lastEngaged
                          ? formatDistanceToNow(new Date(lastEngaged), { addSuffix: true })
                          : 'Not engaged yet';
                        const daysSinceLast = lastEngaged
                          ? Math.floor((Date.now() - new Date(lastEngaged).getTime()) / 86_400_000)
                          : null;
                        const stale = daysSinceLast !== null && daysSinceLast >= 3;
                        const priorityColor =
                          action.priority === 'urgent' ? 'text-rose-600'
                          : action.priority === 'high' ? 'text-amber-600'
                          : action.priority === 'medium' ? 'text-sky-700'
                          : 'text-ink-warm-500';
                        return (
                          <div className="flex flex-col gap-0.5 min-w-0">
                            {/* Top row */}
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <span className="text-ink-warm-700 tabular-nums">{opp.bump_number}/4</span>
                              <div className="flex gap-0.5">
                                {[1, 2, 3, 4].map(i => (
                                  <div key={i} className={`w-1.5 h-1.5 rounded-full ${i <= opp.bump_number ? 'bg-sky-500' : 'bg-cream-200'}`} />
                                ))}
                              </div>
                              <span className={`text-[11px] ${stale ? 'text-amber-600 font-medium' : 'text-ink-warm-500'}`}>
                                · {lastEngagedLabel}
                              </span>
                              <div className="relative group/bump inline-flex ml-auto">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1.5 text-sky-600 hover:bg-sky-50"
                                  onClick={() => handleRecordBump(opp.id)}
                                  disabled={isBumping}
                                >
                                  <Zap className="h-3 w-3" />
                                </Button>
                                <div className="absolute bottom-full right-0 mb-1.5 px-2.5 py-1 text-white text-[11px] rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover/bump:opacity-100 transition-opacity z-50 bg-brand">
                                  Record bump #{opp.bump_number + 1}
                                </div>
                              </div>
                            </div>
                            {/* Next-move hint (from Actions tab logic) */}
                            <div className={`text-[11px] leading-tight ${priorityColor}`}>
                              <span className="font-medium">{action.label}</span>
                              {action.hint && <span className="text-ink-warm-500"> · {action.hint}</span>}
                            </div>
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 z-[80]">
                          <DropdownMenuItem onClick={e => { e.stopPropagation(); handleRecordBump(opp.id); }}>
                            <Zap className="h-4 w-4 mr-2" /> Record Bump
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={e => { e.stopPropagation(); handleStageChange(opp.id, 'warm', opp.stage); }}>
                            <ArrowRight className="h-4 w-4 mr-2" /> Move to Warm
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={e => { e.stopPropagation(); openEditDialog(opp); }}>
                            <Edit className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={e => { e.stopPropagation(); handleDelete(opp.id); }} className="text-rose-600">
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {outreachTotalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-1">
          <div className="text-sm text-ink-warm-700">
            Showing {outreachStart}-{outreachEnd} of {outreachTotal}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setOutreachPage(p => Math.max(1, p - 1)); setSelectedOutreach([]); }}
              disabled={outreachPage === 1}
              className="flex items-center gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, outreachTotalPages) }, (_, i) => {
                let pageNum: number;
                if (outreachTotalPages <= 5) {
                  pageNum = i + 1;
                } else if (outreachPage <= 3) {
                  pageNum = i + 1;
                } else if (outreachPage >= outreachTotalPages - 2) {
                  pageNum = outreachTotalPages - 4 + i;
                } else {
                  pageNum = outreachPage - 2 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={outreachPage === pageNum ? 'brand' : 'outline'}
                    size="sm"
                    onClick={() => { setOutreachPage(pageNum); setSelectedOutreach([]); }}
                    className="w-8 h-8 p-0"
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setOutreachPage(p => Math.min(outreachTotalPages, p + 1)); setSelectedOutreach([]); }}
              disabled={outreachPage === outreachTotalPages}
              className="flex items-center gap-1"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
