'use client';

/**
 * KolDashboardCardsView — the "Cards" view of the KOL Dashboard tab.
 * Renders the Filters Popover (8 widgets in a 2-col grid), the
 * inline active-filter chip row, and a 3-col responsive grid of
 * per-KOL v11 cards (brand-soft avatar tile + display-serif name +
 * StatusBadge + mono KV labels).
 *
 * Extracted from `app/campaigns/[id]/page.tsx` (KOL Dashboard tab,
 * `kolViewMode === 'graph'` branch) on 2026-06-02. The filter state
 * stays on the page because the Table view (still inline) uses the
 * same filters — we accept it as props rather than duplicating the
 * shape into context.
 */

import { ChevronDown, ExternalLink, Flag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { KOLService } from '@/lib/kolService';
import { getRegionIcon, getPlatformIcon } from '@/lib/campaignHelpers';
import { useCampaignDetail } from '@/contexts/CampaignDetailContext';
import { MultiSelect } from '@/components/campaign/MultiSelect';

/** Local KV tone map — same as the page-level one. Kept inline so
 *  the cards view is self-contained. */
const KOL_STATUS_TONES: Record<string, BadgeTone> = {
  Curated:    'info',
  Contacted:  'purple',
  Interested: 'warning',
  Onboarded:  'warning',
  Concluded:  'success',
};

export type KolFilters = {
  platform: string[];
  region: string[];
  creator_type: string[];
  content_type: string[];
  hh_status: string[];
  budget_type: string[];
  followers_operator: string;
  followers_value: string;
  budget_operator: string;
  budget_value: string;
  paid_operator: string;
  paid_value: string;
};

const EMPTY_FILTERS: KolFilters = {
  platform: [], region: [], creator_type: [], content_type: [],
  hh_status: [], budget_type: [],
  followers_operator: '', followers_value: '',
  budget_operator: '', budget_value: '',
  paid_operator: '', paid_value: '',
};

interface KolDashboardCardsViewProps {
  /** Already-derived list from the page (campaignKOLs filtered by
   *  searchTerm + kolFilters + kolVisibilityTab). */
  filteredKOLs: any[];
  kolFilters: KolFilters;
  setKolFilters: React.Dispatch<React.SetStateAction<KolFilters>>;
}

/** Compact label-above-control field used inside the Filters
 *  Popover. Keeps every row visually aligned so the 2-col grid
 *  reads cleanly. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em]">{label}</div>
      {children}
    </div>
  );
}

export function KolDashboardCardsView({ filteredKOLs, kolFilters, setKolFilters }: KolDashboardCardsViewProps) {
  const { contents } = useCampaignDetail();

  const activeFilterCount =
    kolFilters.platform.length +
    kolFilters.region.length +
    kolFilters.creator_type.length +
    kolFilters.content_type.length +
    kolFilters.hh_status.length +
    kolFilters.budget_type.length +
    (kolFilters.followers_operator && kolFilters.followers_value ? 1 : 0) +
    (kolFilters.budget_operator && kolFilters.budget_value ? 1 : 0);

  const resetFilters = () => setKolFilters(EMPTY_FILTERS);

  return (
    <>
      {/* Filters toolbar — single Popover trigger + inline chip row */}
      <div className="mb-3 flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <Flag className="h-3.5 w-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-1 text-[10px] font-semibold bg-brand-light text-brand px-1.5 py-0.5 rounded-full mono tabular-nums">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown className="h-3 w-3 ml-0.5 text-ink-warm-400" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[640px] max-w-[95vw] p-4 shadow-card border-cream-200 rounded-[14px]">
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-cream-100">
              <div className="flex items-center gap-2">
                <span className="text-[10px] mono uppercase tracking-[0.2em] text-ink-warm-500">Filter KOLs</span>
                {activeFilterCount > 0 && (
                  <span className="text-[10px] font-semibold bg-brand-light text-brand px-1.5 py-0.5 rounded-full mono tabular-nums">
                    {activeFilterCount} active
                  </span>
                )}
              </div>
              {activeFilterCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="h-7 text-xs text-ink-warm-500"
                >
                  Clear all
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Platform">
                <MultiSelect
                  options={['X', 'Telegram', 'YouTube', 'Facebook', 'TikTok']}
                  selected={kolFilters.platform}
                  onSelectedChange={(platform) => setKolFilters(prev => ({ ...prev, platform }))}
                  className="w-full"
                />
              </Field>
              <Field label="Region">
                <MultiSelect
                  options={['Vietnam', 'Turkey', 'SEA', 'Philippines', 'Korea', 'Global', 'China', 'Brazil']}
                  selected={kolFilters.region}
                  onSelectedChange={(region) => setKolFilters(prev => ({ ...prev, region }))}
                  className="w-full"
                  renderOption={(option: string) => (
                    <div className="flex items-center space-x-2">
                      <span>{getRegionIcon(option).flag}</span>
                      <span>{option}</span>
                    </div>
                  )}
                />
              </Field>
              <Field label="Creator type">
                <MultiSelect
                  options={['Micro Influencer', 'KOL', 'Celebrity']}
                  selected={kolFilters.creator_type}
                  onSelectedChange={(creator_type) => setKolFilters(prev => ({ ...prev, creator_type }))}
                  className="w-full"
                />
              </Field>
              <Field label="Content type">
                <MultiSelect
                  options={['Meme', 'News', 'Trading', 'Deep Dive', 'Meme/Cultural Narrative', 'Drama Queen', 'Sceptics', 'Technical Educator', 'Bridge Builders', 'Visionaries']}
                  selected={kolFilters.content_type}
                  onSelectedChange={(content_type) => setKolFilters(prev => ({ ...prev, content_type }))}
                  className="w-full"
                />
              </Field>
              <Field label="Status">
                <MultiSelect
                  options={['Curated', 'Contacted', 'Interested', 'Onboarded', 'Concluded']}
                  selected={kolFilters.hh_status}
                  onSelectedChange={(hh_status) => setKolFilters(prev => ({ ...prev, hh_status }))}
                  className="w-full"
                />
              </Field>
              <Field label="Budget type">
                <MultiSelect
                  options={['Token', 'Fiat', 'WL']}
                  selected={kolFilters.budget_type}
                  onSelectedChange={(budget_type) => setKolFilters(prev => ({ ...prev, budget_type }))}
                  className="w-full"
                />
              </Field>
              <Field label="Followers">
                <div className="flex items-center gap-1.5">
                  <Select
                    value={kolFilters.followers_operator}
                    onValueChange={(value) => setKolFilters(prev => ({ ...prev, followers_operator: value }))}
                  >
                    <SelectTrigger className="h-9 w-14 text-sm focus-brand">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value=">">{'>'}</SelectItem>
                      <SelectItem value="<">{'<'}</SelectItem>
                      <SelectItem value="=">=</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="e.g. 10000"
                    value={kolFilters.followers_value}
                    onChange={(e) => setKolFilters(prev => ({ ...prev, followers_value: e.target.value }))}
                    className="h-9 text-sm focus-brand flex-1"
                  />
                </div>
              </Field>
              <Field label="Budget (USD)">
                <div className="flex items-center gap-1.5">
                  <Select
                    value={kolFilters.budget_operator}
                    onValueChange={(value) => setKolFilters(prev => ({ ...prev, budget_operator: value }))}
                  >
                    <SelectTrigger className="h-9 w-14 text-sm focus-brand">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value=">">{'>'}</SelectItem>
                      <SelectItem value="<">{'<'}</SelectItem>
                      <SelectItem value="=">=</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="e.g. 500"
                    value={kolFilters.budget_value}
                    onChange={(e) => setKolFilters(prev => ({ ...prev, budget_value: e.target.value }))}
                    className="h-9 text-sm focus-brand flex-1"
                  />
                </div>
              </Field>
            </div>
          </PopoverContent>
        </Popover>

        {/* Inline active-filter chips */}
        {activeFilterCount > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {kolFilters.platform.length > 0 && (
              <button type="button" onClick={() => setKolFilters(prev => ({ ...prev, platform: [] }))} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-brand-soft text-brand-deep border border-brand-light hover:bg-cream-100 hover:text-rose-600 transition-colors">
                Platform · {kolFilters.platform.length}
                <X className="h-3 w-3" />
              </button>
            )}
            {kolFilters.region.length > 0 && (
              <button type="button" onClick={() => setKolFilters(prev => ({ ...prev, region: [] }))} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-brand-soft text-brand-deep border border-brand-light hover:bg-cream-100 hover:text-rose-600 transition-colors">
                Region · {kolFilters.region.length}
                <X className="h-3 w-3" />
              </button>
            )}
            {kolFilters.creator_type.length > 0 && (
              <button type="button" onClick={() => setKolFilters(prev => ({ ...prev, creator_type: [] }))} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-brand-soft text-brand-deep border border-brand-light hover:bg-cream-100 hover:text-rose-600 transition-colors">
                Creator · {kolFilters.creator_type.length}
                <X className="h-3 w-3" />
              </button>
            )}
            {kolFilters.content_type.length > 0 && (
              <button type="button" onClick={() => setKolFilters(prev => ({ ...prev, content_type: [] }))} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-brand-soft text-brand-deep border border-brand-light hover:bg-cream-100 hover:text-rose-600 transition-colors">
                Content · {kolFilters.content_type.length}
                <X className="h-3 w-3" />
              </button>
            )}
            {kolFilters.hh_status.length > 0 && (
              <button type="button" onClick={() => setKolFilters(prev => ({ ...prev, hh_status: [] }))} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-brand-soft text-brand-deep border border-brand-light hover:bg-cream-100 hover:text-rose-600 transition-colors">
                Status · {kolFilters.hh_status.length}
                <X className="h-3 w-3" />
              </button>
            )}
            {kolFilters.budget_type.length > 0 && (
              <button type="button" onClick={() => setKolFilters(prev => ({ ...prev, budget_type: [] }))} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-brand-soft text-brand-deep border border-brand-light hover:bg-cream-100 hover:text-rose-600 transition-colors">
                Budget type · {kolFilters.budget_type.length}
                <X className="h-3 w-3" />
              </button>
            )}
            {kolFilters.followers_operator && kolFilters.followers_value && (
              <button type="button" onClick={() => setKolFilters(prev => ({ ...prev, followers_operator: '', followers_value: '' }))} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-brand-soft text-brand-deep border border-brand-light hover:bg-cream-100 hover:text-rose-600 transition-colors mono">
                Followers {kolFilters.followers_operator} {kolFilters.followers_value}
                <X className="h-3 w-3" />
              </button>
            )}
            {kolFilters.budget_operator && kolFilters.budget_value && (
              <button type="button" onClick={() => setKolFilters(prev => ({ ...prev, budget_operator: '', budget_value: '' }))} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-brand-soft text-brand-deep border border-brand-light hover:bg-cream-100 hover:text-rose-600 transition-colors mono">
                Budget {kolFilters.budget_operator} {kolFilters.budget_value}
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredKOLs.map((campaignKOL) => {
          const initials = (campaignKOL.master_kol.name || '?')
            .split(' ')
            .map((w: string) => w.charAt(0).toUpperCase())
            .join('')
            .slice(0, 2);
          const tone: BadgeTone = campaignKOL.hh_status
            ? (KOL_STATUS_TONES[campaignKOL.hh_status] ?? 'neutral')
            : 'neutral';
          const contentCount = contents.filter(
            content => content.campaign_kols_id === campaignKOL.id,
          ).length;
          return (
            <Card key={campaignKOL.id} className="crd-hover flex flex-col h-full">
              <CardHeader className="pb-2">
                <div className="flex flex-col items-center text-center">
                  <div className="w-14 h-14 rounded-md bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center mb-3 font-semibold text-base">
                    {initials}
                  </div>
                  <h3 className="display-serif text-base font-semibold text-ink-warm-900 tracking-tight">
                    {campaignKOL.master_kol.name}
                  </h3>
                  <p className="text-xs text-ink-warm-500 mt-0.5">
                    {campaignKOL.master_kol.region || 'No region'}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <StatusBadge tone={tone} size="sm" bordered>
                      {campaignKOL.hh_status || 'No status'}
                    </StatusBadge>
                    {(campaignKOL.master_kol.platform || []).length > 0 && (
                      <span className="flex items-center gap-1 text-ink-warm-500">
                        {(campaignKOL.master_kol.platform || []).map((platform: string) => (
                          <span
                            key={platform}
                            className="flex items-center justify-center h-4 w-4"
                            title={platform}
                          >
                            {getPlatformIcon(platform)}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-3 border-t border-cream-100 flex flex-col flex-1">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[10px] mono uppercase tracking-[0.2em] text-ink-warm-500">Followers</span>
                    <span className="font-medium text-ink-warm-900 tabular-nums">
                      {campaignKOL.master_kol.followers ? KOLService.formatFollowers(campaignKOL.master_kol.followers) : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[10px] mono uppercase tracking-[0.2em] text-ink-warm-500">Content</span>
                    <span className="font-medium text-ink-warm-900 tabular-nums">{contentCount}</span>
                  </div>
                  {campaignKOL.wallet && (
                    <div className="flex items-center justify-between text-sm gap-2">
                      <span className="text-[10px] mono uppercase tracking-[0.2em] text-ink-warm-500 shrink-0">Wallet</span>
                      <span className="font-medium text-ink-warm-900 truncate mono text-xs" title={campaignKOL.wallet}>
                        {campaignKOL.wallet}
                      </span>
                    </div>
                  )}
                </div>

                {campaignKOL.notes && (
                  <div className="mt-3 pt-3 border-t border-cream-100">
                    <span className="text-[10px] mono uppercase tracking-[0.2em] text-ink-warm-500">Notes</span>
                    <p className="text-sm text-ink-warm-900 mt-1 line-clamp-2">{campaignKOL.notes}</p>
                  </div>
                )}

                {campaignKOL.master_kol.link && (
                  <div className="mt-auto pt-3 border-t border-cream-100">
                    <a
                      href={campaignKOL.master_kol.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-brand hover:text-brand-dark mono"
                    >
                      View Profile
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
