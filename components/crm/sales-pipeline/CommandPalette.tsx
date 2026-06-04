'use client';

/**
 * CommandPalette — `Cmd+K` (or `Ctrl+K`) fuzzy-search popover that
 * lets a sales rep jump straight to any opportunity by typing a few
 * letters of the project name.
 *
 * Built on the existing `<CommandDialog>` (cmdk-based) primitive, so
 * the fuzzy matching, keyboard navigation (Up/Down/Enter), and Esc
 * dismiss all come for free.
 *
 * Why this fixes the navigation problem:
 *   - Before: finding a specific opp meant picking a tab → applying
 *     filters → scrolling → clicking the row → waiting for the
 *     slide-over to open. 4-5 clicks + scroll.
 *   - After: `Cmd+K` → type "andy" → Enter. Slide-over opens. 0
 *     scrolls, no tab gymnastics. Works from anywhere on the page.
 *
 * Sections (in order of likely intent):
 *   1. **Opportunities** — match `name`, `poc_handle`, `tg_handle`.
 *      Shows stage badge + bucket so the user can disambiguate
 *      multi-POC projects with the same name.
 *   2. **Pages** — quick-jump to a tab (Outreach / Pipeline / Orbit
 *      / Templates / Discovery). The actual cmd-K classic.
 *   3. **Actions** — "New Opportunity", "Export CSV", etc. — same
 *      as the PageHeader overflow menu, just keyboard-driven.
 *
 * Open via `Cmd+K` / `Ctrl+K`. The keybinding lives on the page so
 * the listener mounts once at the top.
 */

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Building2,
  Download,
  FileText,
  MessageSquare,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';
import { useSalesPipeline } from '@/contexts/SalesPipelineContext';
import {
  STAGE_LABELS,
  type SalesPipelineStage,
} from '@/lib/salesPipelineService';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open the New Opportunity dialog — wired from the page since it
   *  needs to seed form fields with the current user as owner. */
  onNewOpportunity: () => void;
  /** Trigger the CSV export — wired from the page since it depends
   *  on `filteredOpportunities` and `downloadCsv`. */
  onExportCsv: () => void;
}

/** Cap matched opps at this many rows. Beyond ~20 the dropdown
 *  becomes harder to scan than just opening the tab directly. */
const PALETTE_OPP_CAP = 20;

export function CommandPalette({ open, onOpenChange, onNewOpportunity, onExportCsv }: CommandPaletteProps) {
  const { opportunities, openSlideOver, setActiveTab } = useSalesPipeline();

  /** Close the palette after firing a selection. Without this every
   *  click leaves the palette stuck open over the slide-over. */
  const close = () => onOpenChange(false);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search opportunities, pages, or actions..." />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>

        {/* Opportunities — the headline use case. Search matches
            name + POC handle + TG handle so reps can find by any
            identifier they remember. */}
        <CommandGroup heading="Opportunities">
          {opportunities.slice(0, PALETTE_OPP_CAP).map(opp => {
            const stageLabel = STAGE_LABELS[opp.stage as SalesPipelineStage] || opp.stage;
            // Build a fuzzy-search value that includes all the
            // searchable strings so cmdk can match against any of
            // them. Tab-separated to keep them as logically distinct.
            const searchValue = [
              opp.name,
              opp.poc_handle || '',
              opp.tg_handle || '',
              stageLabel,
            ].filter(Boolean).join(' ');
            return (
              <CommandItem
                key={opp.id}
                value={`opp:${opp.id} ${searchValue}`}
                onSelect={() => { openSlideOver(opp); close(); }}
              >
                <Building2 className="h-3.5 w-3.5 mr-2 text-ink-warm-400 flex-shrink-0" />
                <span className="truncate flex-1">{opp.name}</span>
                <span className="ml-2 text-[10px] text-ink-warm-400 capitalize flex-shrink-0">
                  {stageLabel}
                </span>
                {opp.bucket && (
                  <span className="ml-2 text-[10px] text-ink-warm-500 flex-shrink-0">
                    {opp.bucket}
                  </span>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        {/* Pages — keyboard-driven tab jump. The classic Linear /
            Notion command-palette destinations. The "Overall" entry
            was removed 2026-06-03 along with the Overall tab itself
            (merged into Actions). */}
        <CommandGroup heading="Pages">
          <CommandItem
            value="page:actions today queue"
            onSelect={() => { setActiveTab('actions'); close(); }}
          >
            <Zap className="h-3.5 w-3.5 mr-2 text-ink-warm-400" />
            Actions
          </CommandItem>
          <CommandItem
            value="page:outreach cold dm"
            onSelect={() => { setActiveTab('outreach'); close(); }}
          >
            <MessageSquare className="h-3.5 w-3.5 mr-2 text-ink-warm-400" />
            Outreach
          </CommandItem>
          <CommandItem
            value="page:pipeline deals"
            onSelect={() => { setActiveTab('pipeline'); close(); }}
          >
            <Target className="h-3.5 w-3.5 mr-2 text-ink-warm-400" />
            Pipeline
          </CommandItem>
          <CommandItem
            value="page:orbit paused"
            onSelect={() => { setActiveTab('orbit'); close(); }}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-2 text-ink-warm-400" />
            Orbit
          </CommandItem>
          <CommandItem
            value="page:templates dm"
            onSelect={() => { setActiveTab('templates'); close(); }}
          >
            <FileText className="h-3.5 w-3.5 mr-2 text-ink-warm-400" />
            Templates
          </CommandItem>
          <CommandItem
            value="page:discovery prospects"
            onSelect={() => { setActiveTab('discovery'); close(); }}
          >
            <Sparkles className="h-3.5 w-3.5 mr-2 text-ink-warm-400" />
            Discovery
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Actions — mirror the PageHeader's New Opportunity CTA +
            the overflow menu's Export CSV. Lets power users keep
            their hands on the keyboard. */}
        <CommandGroup heading="Actions">
          <CommandItem
            value="action:new opportunity create add"
            onSelect={() => { onNewOpportunity(); close(); }}
          >
            <Plus className="h-3.5 w-3.5 mr-2 text-brand" />
            New Opportunity
          </CommandItem>
          <CommandItem
            value="action:export csv download"
            onSelect={() => { onExportCsv(); close(); }}
          >
            <Download className="h-3.5 w-3.5 mr-2 text-ink-warm-400" />
            Export current view as CSV
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
