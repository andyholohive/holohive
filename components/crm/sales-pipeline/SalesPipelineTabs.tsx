'use client';

/**
 * SalesPipelineTabs — the page's main tab strip + its 7 TabsContent
 * wrappers (Overall / Actions / Outreach / Pipeline / Orbit /
 * Discovery / Templates). Carries the right-side per-tab controls
 * (Path filter + Table/Kanban view toggle) that only show when the
 * Pipeline tab is active.
 *
 * Extracted from `app/crm/sales-pipeline/page.tsx` on 2026-06-03 —
 * the inline Tabs block was ~210 LOC and made the page's main return
 * hard to scan. After the SalesDashboard extraction earlier in the
 * day this is the next-biggest cohesive chunk that can move.
 *
 * Page still owns:
 *   - The 7-value `activeTab` union state (the fetch effects + recalc
 *     handler key off it).
 *   - The Pipeline `viewMode` (persisted to localStorage on the page).
 *   - The Pipeline `pathFilter`.
 *   - The Discovery onPromoted refresh chain (touches multiple
 *     page-local fetch fns).
 *
 * Pulls from context: opportunities + the various derived counts the
 * tab badges show (`allActionItems`, `outreachAllTotal`,
 * `engagedOrbitOpps`, `coldDmOrbitOpps`).
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileText,
  LayoutGrid,
  MessageSquare,
  RotateCcw,
  Sparkles,
  TableIcon,
  Target,
  Zap,
} from 'lucide-react';
import { useSalesPipeline } from '@/contexts/SalesPipelineContext';
import {
  PIPELINE_STAGES,
  type SalesPipelineStage,
} from '@/lib/salesPipelineService';
import { PipelineKanban } from '@/components/crm/sales-pipeline/kanban/PipelineKanban';
import { PipelineTable } from '@/components/crm/sales-pipeline/table/PipelineTable';
// OverviewTab + the Overall tab were removed 2026-06-03 — content
// merged into ActionsTab as a single action queue surface.
import { ActionsTab } from '@/components/crm/sales-pipeline/tabs/ActionsTab';
import { OutreachTab } from '@/components/crm/sales-pipeline/tabs/OutreachTab';
import { OrbitTab } from '@/components/crm/sales-pipeline/tabs/OrbitTab';
import { TemplatesTab } from '@/components/crm/sales-pipeline/tabs/TemplatesTab';
import DiscoveryTab from '@/components/sales/DiscoveryTab';

export type SalesPipelineActiveTab =
  | 'actions'
  | 'outreach'
  | 'pipeline'
  | 'orbit'
  | 'discovery'
  | 'templates';

interface SalesPipelineTabsProps {
  activeTab: SalesPipelineActiveTab;
  onActiveTabChange: (v: SalesPipelineActiveTab) => void;
  /** Pipeline view-mode (kanban/table). Persisted to localStorage on
   *  the page; we just render the v11 segmented control here. */
  viewMode: 'kanban' | 'table';
  onViewModeChange: (v: 'kanban' | 'table') => void;
  /** Pipeline path filter (Closer / SDR / all). */
  pathFilter: 'all' | 'closer' | 'sdr';
  onPathFilterChange: (v: 'all' | 'closer' | 'sdr') => void;
  /** Discovery → CRM promotion refresh chain. Page-owned because it
   *  touches multiple page-local fetch fns. */
  onDiscoveryPromoted: () => void;
}

export function SalesPipelineTabs({
  activeTab,
  onActiveTabChange,
  viewMode,
  onViewModeChange,
  pathFilter,
  onPathFilterChange,
  onDiscoveryPromoted,
}: SalesPipelineTabsProps) {
  const {
    opportunities,
    allActionItems,
    outreachAllTotal,
    engagedOrbitOpps,
    coldDmOrbitOpps,
  } = useSalesPipeline();

  // Active pipeline count — pipeline-stage opps minus cold_dm (which
  // has its own Outreach tab). Used by the Pipeline tab count chip.
  const pipelineCount = opportunities.filter(
    o => PIPELINE_STAGES.includes(o.stage as SalesPipelineStage) && o.stage !== 'cold_dm',
  ).length;
  // `totalOrbitCount` removed 2026-06-03 — the Orbit tab badge now
  // shows just the engaged count (the actionable signal); the cold-DM
  // revisit-pool size lives inside the tab body.

  return (
    <Tabs value={activeTab} onValueChange={(v) => onActiveTabChange(v as SalesPipelineActiveTab)}>
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        {/* v11 main tab strip — cream-100 base + cream-200 border,
            per-tab active tone matches the section semantic.
            [Overall → Actions merge, 2026-06-03] The Overall tab was
            removed; its sole content (Today's Queue) was identical to
            Actions, just paginated without filters. Actions is now the
            default landing tab and carries Today's Attention above its
            filter row. */}
        <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200">
          <TabsTrigger
            value="actions"
            className="flex items-center gap-2 px-3 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-amber-700"
          >
            <Zap className="h-4 w-4" />
            Actions
            <TabCount value={allActionItems.length} />
          </TabsTrigger>
          <TabsTrigger
            value="outreach"
            className="flex items-center gap-2 px-3 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-sky-700"
          >
            <MessageSquare className="h-4 w-4" />
            Outreach
            <TabCount value={outreachAllTotal} />
          </TabsTrigger>
          <TabsTrigger
            value="pipeline"
            className="flex items-center gap-2 px-3 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-brand"
          >
            <Target className="h-4 w-4" />
            Pipeline
            <TabCount value={pipelineCount} />
          </TabsTrigger>
          <TabsTrigger
            value="orbit"
            className="flex items-center gap-2 px-3 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-amber-700"
          >
            <RotateCcw className="h-4 w-4" />
            Orbit
            {/* Engaged orbit count — the actionable signal. Cold-DM
                orbit (re-engagement pool) used to render here too as
                "+N", but the implicit math read as `3+12` with no
                separator and no label context. Dropped 2026-06-03 —
                the Orbit tab body shows the split clearly inside. */}
            {engagedOrbitOpps.length > 0 && (
              <span
                className="ml-1 text-[11px] text-emerald-700 font-medium tabular-nums"
                title={`${engagedOrbitOpps.length} engaged · ${coldDmOrbitOpps.length} cold-DM revisit pool inside`}
              >
                {engagedOrbitOpps.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="discovery"
            className="flex items-center gap-2 px-3 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-sky-700"
          >
            <Sparkles className="h-4 w-4" />
            Discovery
          </TabsTrigger>
          <TabsTrigger
            value="templates"
            className="flex items-center gap-2 px-3 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-card data-[state=active]:text-emerald-700"
          >
            <FileText className="h-4 w-4" />
            Templates
          </TabsTrigger>
        </TabsList>

        {/* Per-tab right-side controls — only the Pipeline tab has any
            (Path filter + View Toggle). Wrapped in a sibling flex so
            they don't collapse onto the tab strip on mobile. */}
        <div className="flex items-center gap-3">
          {activeTab === 'pipeline' && (
            <Select value={pathFilter} onValueChange={(v) => onPathFilterChange(v as 'all' | 'closer' | 'sdr')}>
              <SelectTrigger className="h-9 w-40 text-sm focus-brand">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Paths</SelectItem>
                <SelectItem value="closer">Path A (Closer)</SelectItem>
                <SelectItem value="sdr">Path B (SDR)</SelectItem>
              </SelectContent>
            </Select>
          )}

          {activeTab === 'pipeline' && (
            <div className="inline-flex bg-cream-100 p-1 rounded-md border border-cream-200">
              <button
                type="button"
                onClick={() => onViewModeChange('table')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded transition-colors ${
                  viewMode === 'table'
                    ? 'bg-white shadow-card text-brand'
                    : 'text-ink-warm-500 hover:bg-cream-200'
                }`}
                aria-pressed={viewMode === 'table'}
              >
                <TableIcon className="h-3.5 w-3.5" />
                Table
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('kanban')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded transition-colors ${
                  viewMode === 'kanban'
                    ? 'bg-white shadow-card text-brand'
                    : 'text-ink-warm-500 hover:bg-cream-200'
                }`}
                aria-pressed={viewMode === 'kanban'}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Kanban
              </button>
            </div>
          )}
        </div>
      </div>

      <TabsContent value="actions" className="mt-0">
        <ActionsTab />
      </TabsContent>
      <TabsContent value="outreach" className="mt-0">
        <OutreachTab />
      </TabsContent>
      <TabsContent value="pipeline" className="mt-0">
        {viewMode === 'kanban' ? <PipelineKanban /> : <PipelineTable />}
      </TabsContent>
      <TabsContent value="orbit" className="mt-0">
        <OrbitTab />
      </TabsContent>
      <TabsContent value="discovery" className="mt-0">
        <DiscoveryTab onPromoted={onDiscoveryPromoted} />
      </TabsContent>
      <TabsContent value="templates" className="mt-0">
        <TemplatesTab />
      </TabsContent>
    </Tabs>
  );
}

/** Small numeric chip next to a tab label. Hidden when zero so the
 *  tab strip stays calm; numbers only appear when there's something
 *  to surface. */
function TabCount({ value }: { value: number }) {
  if (value === 0) return null;
  return (
    <span className="ml-1 text-[11px] text-ink-warm-400 tabular-nums">
      {value}
    </span>
  );
}
