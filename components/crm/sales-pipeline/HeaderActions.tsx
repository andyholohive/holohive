'use client';

/**
 * SalesPipelineHeaderActions — the three buttons that live in the
 * PageHeader's `actions` slot:
 *
 *   [Quick find ⌘K] · [⋮ overflow] · [+ New Opportunity]
 *
 * Extracted from `app/crm/sales-pipeline/page.tsx` on 2026-06-03 to
 * keep the page's main return shape readable. Behaviour callbacks
 * (opening the palette, opening the New Opp dialog, firing Export
 * CSV) are page-owned and threaded through as props rather than
 * pulled from `useSalesPipeline()` — they touch refs / page-local
 * state (`SP_CSV_COLUMNS`, `todayStamp()`, `filteredOpportunities`)
 * that the page already has in scope.
 */

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, MoreHorizontal, Plus, Search } from 'lucide-react';

interface SalesPipelineHeaderActionsProps {
  /** Open the Cmd+K command palette. The button is a discoverability
   *  affordance — the keyboard shortcut is still the primary path. */
  onOpenPalette: () => void;
  /** Fire the CSV export over the currently-filtered opp set. The
   *  page owns the column config + filename + filter scope; this
   *  component just renders the menu item. */
  onExportCsv: () => void;
  /** Disable the Export CSV item when nothing is in the filter (also
   *  drives the trailing count chip). */
  exportCount: number;
  /** Open the Create Opportunity dialog with the current user pre-
   *  selected as owner. Page-owned (touches `setForm` + `setIsCreateOpen`). */
  onNewOpportunity: () => void;
}

export function SalesPipelineHeaderActions({
  onOpenPalette,
  onExportCsv,
  exportCount,
  onNewOpportunity,
}: SalesPipelineHeaderActionsProps) {
  return (
    <>
      {/* Quick find — surfaces the ⌘K palette so users discover the
          keyboard shortcut. Hidden on mobile (the kbd hint doesn't
          render on touch UAs anyway). */}
      <button
        type="button"
        onClick={onOpenPalette}
        className="hidden md:inline-flex items-center gap-2 h-9 px-3 text-xs text-ink-warm-500 bg-cream-50 hover:bg-cream-100 border border-cream-200 rounded-md transition-colors"
        title="Open command palette"
      >
        <Search className="h-3.5 w-3.5" />
        Quick find
        <kbd className="ml-1 text-[10px] tabular-nums bg-white border border-cream-200 rounded px-1 py-0 text-ink-warm-500">⌘K</kbd>
      </button>

      {/* Overflow menu — Export CSV lives here so it doesn't compete
          with the primary New Opportunity CTA for header attention.
          New menu items (Run Discovery, etc.) can land here too. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" title="More actions" aria-label="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={onExportCsv} disabled={exportCount === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
            <span className="ml-auto text-[10px] text-ink-warm-400 tabular-nums">
              {exportCount}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="brand" onClick={onNewOpportunity}>
        <Plus className="h-4 w-4 mr-2" />
        New Opportunity
      </Button>
    </>
  );
}
