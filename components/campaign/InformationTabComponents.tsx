'use client';

/**
 * InformationTabComponents — the 5 sub-components that the Information
 * tab body composes:
 *
 *   - `CampaignDetailViewLayout` — the read-only view-mode 3-column
 *     grid (Engagement / Budget / Approved Access on the main column +
 *     Resources / Renewal / Recent Activity in the sidebar).
 *   - `ResourcesCard` — the edit-anywhere brand-tinted resources card
 *     used inside the view layout.
 *   - `ApprovedAccessCard` — the edit-anywhere approved-emails list.
 *   - `EngagementEditForm` — per-card edit overlay for the Engagement
 *     fields (dates, type, account lead).
 *   - `BudgetEditForm` — per-card edit overlay for the Budget fields
 *     (total + regional allocations + budget types).
 *
 * Extracted from `app/campaigns/[id]/page.tsx` on 2026-06-02 — these
 * lived as module-level helpers after the page's default export.
 * They're pure prop-driven components with no closures over the
 * page's React state, so the extraction is mechanical: same props
 * in, same JSX out. The page imports them and renders inside its
 * Information tab body (still inline on the page for now).
 */

import { useState } from 'react';
import {
  Calendar,
  Calendar as CalendarIcon,
  CheckCircle,
  ChevronRight,
  Edit,
  ExternalLink,
  Eye,
  File,
  FileText,
  Globe,
  Image as ImageIcon,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import type { CampaignWithDetails } from '@/lib/campaignService';
import {
  displayRegion,
  formatDateForInput,
  formatDateLong,
  parseDate,
} from '@/lib/campaignHelpers';

/* ──────────────────────────────────────────────────────────────────────
 * CampaignDetailViewLayout
 * ──────────────────────────────────────────────────────────────────────
 *
 * v11 view-mode layout for the Campaign Information tab. Mirrors the
 * holohive-ui-revamp.html PROPOSED detail-page treatment: a 3-column
 * grid (main col-span-2 + sidebar col-span-1) with:
 *
 *   Main column:
 *     - Engagement card     (Start / End / Type / Lead + progress bar)
 *     - Resources card      (colored icon tiles, editable)
 *
 *   Sidebar column:
 *     - Quick Stats card    (KOL count / Content / Budget / Days left)
 *     - Renewal action card (brand-tinted, shown when end_date < 60d)
 *     - Recent activity     (placeholder — wires up to events later)
 *
 * Edit mode keeps using the existing form layout (legacy). The two
 * paths share the underlying campaign object; view mode is read-mostly
 * except for Resources (which writes back immediately via
 * handleSaveResources so users don't have to flip into Edit mode just
 * to add a Telegram link).
 */
type ResourceIcon = 'telegram' | 'drive' | 'notion' | 'docs' | 'link';
type CampaignResource = { label: string; url: string; icon?: ResourceIcon };

// Icon tile palette per resource kind — matches the mockup's colored
// 36px squares (Telegram = sky, Drive = amber, Notion = emerald,
// Docs = rose, generic Link = cream).
const RESOURCE_ICON_TILES: Record<ResourceIcon, { bg: string; text: string; border: string }> = {
  telegram: { bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-100' },
  drive:    { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-100' },
  notion:   { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100' },
  docs:     { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-100' },
  link:     { bg: 'bg-cream-100',  text: 'text-ink-warm-700',border: 'border-cream-200' },
};

export function CampaignDetailViewLayout({
  campaign,
  setCampaign,
  campaignKOLs,
  payments,
  contents,
  allUsers,
  allocations,
  editingCard,
  setEditingCard,
  onResourcesChange,
}: {
  campaign: CampaignWithDetails;
  setCampaign: (c: CampaignWithDetails) => void;
  campaignKOLs: any[];
  payments: any[];
  contents: any[];
  allUsers: any[];
  allocations: any[];
  editingCard: null | 'engagement' | 'budget' | 'approved';
  setEditingCard: (next: null | 'engagement' | 'budget' | 'approved') => void;
  onResourcesChange: (next: CampaignResource[]) => void;
}) {
  // Derived metrics — single source of truth for the sidebar Quick
  // Stats card and the Engagement card's progress bar.
  const startDate = campaign.start_date ? new Date(campaign.start_date + 'T00:00:00') : null;
  const endDate = campaign.end_date ? new Date(campaign.end_date + 'T00:00:00') : null;
  const totalDays = startDate && endDate ? Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86_400_000)) : 0;
  const elapsedDays = startDate ? Math.max(0, Math.floor((Date.now() - startDate.getTime()) / 86_400_000)) : 0;
  const progressPct = totalDays > 0 ? Math.min(100, Math.round((elapsedDays / totalDays) * 100)) : 0;
  const daysRemaining = endDate ? Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / 86_400_000)) : null;
  const totalWeeks = totalDays > 0 ? Math.max(1, Math.ceil(totalDays / 7)) : 0;
  const currentWeek = totalWeeks > 0 ? Math.min(totalWeeks, Math.max(1, Math.ceil((elapsedDays + 1) / 7))) : 0;

  const totalPaid = (payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
  const postedContentCount = (contents || []).filter((c: any) => c.status === 'posted' || c.status === 'published').length;
  const totalContentCount = (contents || []).length;

  const manager = allUsers.find((u) => u.id === campaign.manager);

  // Resources — pulled from campaign.resources (added 2026-06-XX as
  // a jsonb column). Defaults to empty so the page works even before
  // the Resources card has been populated.
  const resources: CampaignResource[] = ((campaign as any).resources || []) as CampaignResource[];

  // Renewal trigger — show the brand-tinted action card when the
  // engagement ends within 60 days AND the campaign is still active.
  const showRenewalCard = daysRemaining != null && daysRemaining <= 60 && daysRemaining > 0 && campaign.status === 'Active';

  // KV cell helper — keeps the mockup's 10px uppercase tracked-out
  // label + 14px font-medium value rhythm consistent across the
  // Engagement card.
  const KV = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-1.5">{label}</div>
      <div className="text-ink-warm-900 font-medium text-sm">{children}</div>
    </div>
  );

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    try {
      return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return iso;
    }
  };

  const formatCurrency = (n: number) => {
    if (!Number.isFinite(n)) return '$0';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
    return `$${n.toLocaleString()}`;
  };

  return (
    <div className="pt-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* ── Main column ──────────────────────────────────────────── */}
      <div className="lg:col-span-2 space-y-5">

        {/* Engagement card — consolidates Start / End / Type / Lead
            with a progress bar at the bottom showing Week X of Y.
            Per-card inline Edit affordance on the header. */}
        <div className="bg-white rounded-[14px] border border-cream-200 shadow-card p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Engagement</h3>
            {editingCard !== 'engagement' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingCard('engagement')}
                className="h-7 px-2 text-xs font-medium text-brand-deep hover:text-brand hover:bg-cream-50"
              >
                <Edit className="w-3 h-3 mr-1" />
                Edit
              </Button>
            )}
          </div>
          {editingCard === 'engagement' ? (
            <EngagementEditForm
              campaign={campaign}
              setCampaign={setCampaign}
              allUsers={allUsers}
              onDone={() => setEditingCard(null)}
            />
          ) : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              <KV label="Start date"><span className="mono tabular-nums">{formatDate(campaign.start_date)}</span></KV>
              <KV label="End date"><span className="mono tabular-nums">{formatDate(campaign.end_date)}</span></KV>
              <KV label="Region">
                {(() => {
                  // Mirrors the inline `displayRegion` helper used in
                  // edit mode — APAC/EMEA/MENA stay all-caps, Global
                  // title-case, others title-case.
                  const region = (campaign as any).region as string | null;
                  if (!region) return <span className="text-ink-warm-400 italic">Unset</span>;
                  const lower = region.toLowerCase();
                  if (lower === 'apac') return 'APAC';
                  if (lower === 'emea') return 'EMEA';
                  if (lower === 'mena') return 'MENA';
                  if (lower === 'global') return 'Global';
                  return region.charAt(0).toUpperCase() + region.slice(1).toLowerCase();
                })()}
              </KV>
              <KV label="Account lead">
                {manager ? (
                  <div className="flex items-center gap-2">
                    {/* Profile photo when available, falls back to a
                        brand-tinted initial tile (same chrome as /team
                        and /dashboard NameWithAvatar pattern). */}
                    {manager.profile_photo_url ? (
                      <div className="w-6 h-6 rounded-full overflow-hidden border border-cream-200 shrink-0 bg-white">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={manager.profile_photo_url}
                          alt={manager.name || manager.email || 'Account lead'}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center text-[10px] font-semibold shrink-0">
                        {(manager.name || manager.email || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="truncate">{manager.name || manager.email}</span>
                  </div>
                ) : (
                  <span className="text-ink-warm-400 italic">Unassigned</span>
                )}
              </KV>
            </div>
          )}
          {/* Progress bar + description — only in view mode (edit
              form handles dates + description with inputs). */}
          {editingCard !== 'engagement' && startDate && endDate && (
            <div className="mt-6 pt-5 border-t border-cream-200">
              <div className="flex items-baseline justify-between mb-2.5">
                <span className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em]">Campaign progress</span>
                <span className="text-xs text-ink-warm-900 mono tabular-nums font-medium">
                  Week <span className="font-semibold">{currentWeek}</span> of {totalWeeks}
                </span>
              </div>
              <div className="h-[3px] bg-cream-200 rounded-full overflow-hidden">
                <div className="h-full bg-brand rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-[10px] text-ink-warm-400 mono uppercase tracking-[0.1em]">{formatDate(campaign.start_date)}</span>
                <span className="text-[10px] text-ink-warm-400 mono uppercase tracking-[0.1em]">{formatDate(campaign.end_date)}</span>
              </div>
            </div>
          )}
          {editingCard !== 'engagement' && campaign.description && (
            <div className="mt-6 pt-5 border-t border-cream-200">
              <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">Description</div>
              <p className="text-sm text-ink-warm-700 leading-relaxed whitespace-pre-line">{campaign.description}</p>
            </div>
          )}
        </div>

        {/* Resources card — colored icon tile per resource, editable
            in place. Mockup pattern: 2-column grid of link rows with
            36px icon tile + label + truncated URL underneath. */}
        <ResourcesCard resources={resources} onChange={onResourcesChange} />

        {/* Budget + Approved Access — paired side-by-side in a 2-col
            sub-grid so the dense Approved Access chip list sits
            alongside the Budget summary instead of stacking below
            (mockup pattern: secondary cards side-by-side under the
            primary cards). Both cards still stack vertically on
            screens narrower than md. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Budget card — total + per-region allocations + progress
            bar showing how much has been paid out. Per-card Edit
            affordance links into the Budget tab where the full
            editor lives (we don't duplicate the allocation editor
            inline — it's complex and lives elsewhere). */}
        <div className="bg-white rounded-[14px] border border-cream-200 shadow-card p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Budget</h3>
            <div className="flex items-center gap-2">
              <span className="text-[11px] mono uppercase tracking-[0.14em] text-ink-warm-500">
                {campaign.total_budget > 0
                  ? `${Math.round((totalPaid / campaign.total_budget) * 100)}% paid`
                  : 'Not set'}
              </span>
              {editingCard === 'budget' ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingCard('budget')}
                  className="h-7 px-2 text-xs font-medium text-brand-deep hover:text-brand hover:bg-cream-50"
                >
                  <Edit className="w-3 h-3 mr-1" />
                  Edit
                </Button>
              )}
            </div>
          </div>
          {editingCard === 'budget' ? (
            <BudgetEditForm
              campaign={campaign}
              setCampaign={setCampaign}
              onDone={() => setEditingCard(null)}
            />
          ) : (
            <div className="grid grid-cols-3 gap-x-6 gap-y-5">
              <KV label="Total"><span className="mono tabular-nums">{formatCurrency(campaign.total_budget || 0)}</span></KV>
              <KV label="Paid"><span className="mono tabular-nums text-emerald-700">{formatCurrency(totalPaid)}</span></KV>
              <KV label="Remaining"><span className="mono tabular-nums">{formatCurrency(Math.max(0, (campaign.total_budget || 0) - totalPaid))}</span></KV>
            </div>
          )}
          {/* Paid progress bar — emerald to read as "good news" */}
          {campaign.total_budget > 0 && (
            <div className="mt-5 pt-5 border-t border-cream-200">
              <div className="h-[3px] bg-cream-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (totalPaid / campaign.total_budget) * 100)}%` }}
                />
              </div>
            </div>
          )}
          {/* Budget types + per-region allocations. Budget types
              are campaign-level (Token / Fiat / WL chips); region
              allocations are per-row with currency-formatted amounts.
              Tone palette by budget type:
                Token → brand-soft (default)
                Fiat → emerald (real money)
                WL → purple (whitelist allocation) */}
          {(((campaign as any).budget_type && (campaign as any).budget_type.length > 0) || (allocations && allocations.length > 0)) && (
            <div className="mt-5 pt-5 border-t border-cream-200 space-y-4">
              {(campaign as any).budget_type && (campaign as any).budget_type.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">Budget types</div>
                  <div className="flex flex-wrap gap-1.5">
                    {((campaign as any).budget_type as string[]).map((bt) => {
                      const lower = bt.toLowerCase();
                      const cls = lower === 'fiat'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                        : lower === 'wl' || lower === 'whitelist'
                          ? 'bg-purple-50 text-purple-700 border-purple-100'
                          : 'bg-brand-soft text-brand-deep border-brand-light';
                      return (
                        <span
                          key={bt}
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs border ${cls}`}
                        >
                          {bt}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              {allocations && allocations.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-3">By region</div>
                  <div className="space-y-2">
                    {allocations.map((alloc, idx) => {
                      // Same region-formatting rules as the Region
                      // cell above: APAC/EMEA/MENA all-caps, Global
                      // title-case, others title-case.
                      const r = (alloc.region || 'Unknown') as string;
                      const lower = r.toLowerCase();
                      const display = lower === 'apac' ? 'APAC'
                        : lower === 'emea' ? 'EMEA'
                        : lower === 'mena' ? 'MENA'
                        : lower === 'global' ? 'Global'
                        : r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
                      const amt = parseFloat(alloc.allocated_budget || '0') || 0;
                      const pct = (campaign.total_budget || 0) > 0
                        ? Math.round((amt / campaign.total_budget) * 100)
                        : null;
                      return (
                        <div key={idx} className="text-sm">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <Globe className="h-3.5 w-3.5 text-ink-warm-400 shrink-0" />
                              <span className="text-ink-warm-700 font-medium">{display}</span>
                              {pct != null && (
                                <span className="text-[10px] text-ink-warm-400 mono tabular-nums">{pct}%</span>
                              )}
                            </div>
                            <span className="mono tabular-nums text-ink-warm-900 font-medium">
                              {formatCurrency(amt)}
                            </span>
                          </div>
                          {/* Per-region progress bar — same brand
                              hue as the campaign progress bar above. */}
                          {pct != null && (
                            <div className="h-[2px] bg-cream-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-brand rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Approved Access card — emails + domains allowed to access
            the public campaign view (in addition to the client email
            and same-domain users). Inline Add affordances for both
            email and domain entries; per-chip Remove on hover. */}
        <ApprovedAccessCard
          campaign={campaign}
          setCampaign={setCampaign}
          isEditing={editingCard === 'approved'}
          onStartEdit={() => setEditingCard('approved')}
          onDone={() => setEditingCard(null)}
        />
        </div>
      </div>

      {/* ── Sidebar column ───────────────────────────────────────── */}
      <div className="space-y-5">

        {/* Quick stats — matches mockup's Live dot + KV list pattern */}
        <div className="bg-white rounded-[14px] border border-cream-200 shadow-card p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Quick stats</h3>
            <span className="flex items-center gap-1 text-[10px] text-emerald-700 font-semibold uppercase tracking-[0.2em]">
              <span className="dot-pulse bg-emerald-500" aria-hidden />
              Live
            </span>
          </div>
          <div className="space-y-3.5">
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-ink-warm-500">KOLs</span>
              <span className="text-lg text-ink-warm-900 mono tabular-nums font-medium" style={{ letterSpacing: '-0.025em' }}>
                {campaignKOLs.length}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-ink-warm-500">Content {totalContentCount > 0 && <span className="text-[10px] text-ink-warm-400 mono">live</span>}</span>
              <span className="text-lg text-ink-warm-900 mono tabular-nums font-medium" style={{ letterSpacing: '-0.025em' }}>
                {postedContentCount}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-ink-warm-500">Paid</span>
              <span className="text-lg text-ink-warm-900 mono tabular-nums font-medium" style={{ letterSpacing: '-0.025em' }}>
                {formatCurrency(totalPaid)}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-ink-warm-500">Total budget</span>
              <span className="text-lg text-ink-warm-900 mono tabular-nums font-medium" style={{ letterSpacing: '-0.025em' }}>
                {formatCurrency(campaign.total_budget || 0)}
              </span>
            </div>
            {daysRemaining != null && (
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-ink-warm-500">Days left</span>
                <span className={`flex items-center gap-1.5`}>
                  {daysRemaining <= 14 && <span className="dot bg-rose-500" aria-hidden />}
                  <span className={`text-lg mono tabular-nums font-medium ${daysRemaining <= 14 ? 'text-rose-700' : 'text-ink-warm-900'}`} style={{ letterSpacing: '-0.025em' }}>
                    {daysRemaining}
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Renewal action card — brand-tinted, shown when end < 60d */}
        {showRenewalCard && (
          <div className="crd-feature p-6">
            <div className="flex items-center gap-1.5 mb-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-brand-deep">
              <span className="dot bg-brand" aria-hidden />
              <span>Action needed</span>
            </div>
            <h3 className="display-serif text-[20px] leading-[1.1] text-ink-warm-900">
              Renewal in{' '}
              <span className="display-serif-italic text-brand">{daysRemaining} days.</span>
            </h3>
            <p className="text-[13px] leading-relaxed mt-3 mb-5 text-ink-warm-700">
              Engagement ends <span className="font-medium mono text-ink-warm-900">{formatDate(campaign.end_date)}</span>.
              Worth opening the renewal conversation now while momentum is high.
            </p>
            <Button variant="brand" size="sm" className="w-full">
              Schedule check-in
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        )}

        {/* Recent activity — placeholder for now; will wire to a
            campaign_events query in a follow-up. */}
        <div className="bg-white rounded-[14px] border border-cream-200 shadow-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Recent activity</h3>
            <span className="text-[10px] text-ink-warm-400 mono uppercase tracking-[0.2em]">Coming soon</span>
          </div>
          <p className="text-sm text-ink-warm-500 italic">
            Campaign event feed (KOL adds, content posts, payments) will surface here.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── ResourcesCard ────────────────────────────────────────────────────
   In-place editable list of campaign resources. Matches the mockup's
   2-column grid with colored icon tile + label + truncated URL. Add
   button opens a small inline form; each row gets hover-action icons
   for edit + delete. Changes persist immediately via onChange. */
export function ResourcesCard({
  resources,
  onChange,
}: {
  resources: CampaignResource[];
  onChange: (next: CampaignResource[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  const [draftIcon, setDraftIcon] = useState<ResourceIcon>('link');

  const reset = () => {
    setAdding(false);
    setDraftLabel('');
    setDraftUrl('');
    setDraftIcon('link');
  };

  const handleAdd = () => {
    if (!draftLabel.trim() || !draftUrl.trim()) return;
    onChange([...resources, { label: draftLabel.trim(), url: draftUrl.trim(), icon: draftIcon }]);
    reset();
  };

  const handleRemove = (idx: number) => {
    onChange(resources.filter((_, i) => i !== idx));
  };

  // Strip protocol for compact display under the label.
  const displayUrl = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

  return (
    <div className="bg-white rounded-[14px] border border-cream-200 shadow-card p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-baseline gap-2.5">
          <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Resources</h3>
          <span className="text-[11px] text-ink-warm-400 mono tabular-nums">{resources.length}</span>
        </div>
        {!adding && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs font-medium text-brand-deep hover:text-brand hover:bg-cream-50"
            onClick={() => setAdding(true)}
          >
            <Plus className="w-3 h-3 mr-1" />
            Add
          </Button>
        )}
      </div>

      {adding && (
        <div className="mb-4 rounded-md border border-cream-200 bg-cream-50 p-3 space-y-2">
          <div className="grid grid-cols-[100px_1fr] gap-2">
            <Select value={draftIcon} onValueChange={(v) => setDraftIcon(v as ResourceIcon)}>
              <SelectTrigger className="h-9 text-sm focus-brand bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="telegram">Telegram</SelectItem>
                <SelectItem value="drive">Drive</SelectItem>
                <SelectItem value="notion">Notion</SelectItem>
                <SelectItem value="docs">Docs</SelectItem>
                <SelectItem value="link">Link</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Label (e.g. Telegram Group)"
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              className="h-9 text-sm focus-brand bg-white"
              autoFocus
            />
          </div>
          <Input
            placeholder="URL (https://...)"
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
            className="h-9 text-sm focus-brand bg-white"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={reset}>Cancel</Button>
            <Button variant="brand" size="sm" onClick={handleAdd} disabled={!draftLabel.trim() || !draftUrl.trim()}>
              Add resource
            </Button>
          </div>
        </div>
      )}

      {resources.length === 0 && !adding ? (
        <p className="text-sm text-ink-warm-500 italic">
          No resources yet. Pin commonly-referenced links (Telegram group, brand assets, GTM plan, etc.).
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
          {resources.map((r, idx) => {
            const tile = RESOURCE_ICON_TILES[r.icon || 'link'];
            return (
              <div key={idx} className="group flex items-center justify-between p-3 -mx-1.5 rounded-lg hover:bg-cream-50 transition">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 min-w-0 flex-1"
                >
                  <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 border ${tile.bg} ${tile.text} ${tile.border}`}>
                    {r.icon === 'telegram' && (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                    )}
                    {r.icon === 'drive' && (
                      <ImageIcon className="w-4 h-4" />
                    )}
                    {r.icon === 'notion' && (
                      <FileText className="w-4 h-4" />
                    )}
                    {r.icon === 'docs' && (
                      <File className="w-4 h-4" />
                    )}
                    {(!r.icon || r.icon === 'link') && (
                      <ExternalLink className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink-warm-900 truncate">{r.label}</div>
                    <div className="text-[11px] text-ink-warm-400 mono truncate">{displayUrl(r.url)}</div>
                  </div>
                </a>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0 ml-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 rounded-md text-ink-warm-500 hover:text-rose-600 hover:bg-rose-50"
                    onClick={() => handleRemove(idx)}
                    title="Remove resource"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                  <ExternalLink className="w-4 h-4 text-ink-warm-300 group-hover:text-brand transition shrink-0" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── ApprovedAccessCard ───────────────────────────────────────────────
   Read-only view of campaigns.approved_emails + approved_domains.
   Edit happens in the form body (edit mode) — this card is just a
   surface to confirm "who has access" at a glance from the view-mode
   layout. Mockup pattern: KV-style display with chip rows. */
export function ApprovedAccessCard({
  campaign,
  setCampaign,
  isEditing,
  onStartEdit,
  onDone,
}: {
  campaign: CampaignWithDetails;
  setCampaign: (c: CampaignWithDetails) => void;
  isEditing: boolean;
  onStartEdit: () => void;
  onDone: () => void;
}) {
  const emails: string[] = ((campaign as any).approved_emails || []) as string[];
  const domains: string[] = ((campaign as any).approved_domains || []) as string[];
  const hasAny = emails.length > 0 || domains.length > 0;

  const [draftEmail, setDraftEmail] = useState('');
  const [draftDomain, setDraftDomain] = useState('');

  const persist = async (nextEmails: string[], nextDomains: string[]) => {
    const previous = { emails, domains };
    setCampaign({ ...campaign, approved_emails: nextEmails, approved_domains: nextDomains } as any);
    try {
      const { error } = await (supabase as any)
        .from('campaigns')
        .update({
          approved_emails: nextEmails.length > 0 ? nextEmails : null,
          approved_domains: nextDomains.length > 0 ? nextDomains : null,
        })
        .eq('id', campaign.id);
      if (error) throw error;
    } catch (err: any) {
      setCampaign({ ...campaign, approved_emails: previous.emails, approved_domains: previous.domains } as any);
      console.error('Failed to update approved access:', err);
    }
  };

  const addEmail = async () => {
    const e = draftEmail.trim().toLowerCase();
    if (!e || !e.includes('@') || emails.includes(e)) return;
    setDraftEmail('');
    await persist([...emails, e], domains);
  };
  const addDomain = async () => {
    const d = draftDomain.trim().toLowerCase().replace(/^@/, '');
    if (!d || domains.includes(d)) return;
    setDraftDomain('');
    await persist(emails, [...domains, d]);
  };
  const removeEmail = async (email: string) => {
    await persist(emails.filter((e) => e !== email), domains);
  };
  const removeDomain = async (domain: string) => {
    await persist(emails, domains.filter((d) => d !== domain));
  };

  return (
    <div className="bg-white rounded-[14px] border border-cream-200 shadow-card p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-baseline gap-2.5">
          <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Approved Access</h3>
          {hasAny && (
            <span className="text-[11px] text-ink-warm-400 mono tabular-nums">
              {emails.length + domains.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] mono uppercase tracking-[0.14em] text-ink-warm-500 hidden sm:inline">
            Public portal allowlist
          </span>
          {isEditing ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDone}
              className="h-7 px-2 text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
            >
              Done
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={onStartEdit}
              className="h-7 px-2 text-xs font-medium text-brand-deep hover:text-brand hover:bg-cream-50"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add
            </Button>
          )}
        </div>
      </div>
      {isEditing && (
        <div className="mb-4 rounded-md border border-cream-200 bg-cream-50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              placeholder="email@example.com"
              value={draftEmail}
              onChange={(e) => setDraftEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addEmail(); }}
              className="h-9 text-sm focus-brand bg-white"
            />
            <Button variant="outline" size="sm" className="h-9 text-xs shrink-0" onClick={addEmail} disabled={!draftEmail.trim()}>
              Add email
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="@example.com"
              value={draftDomain}
              onChange={(e) => setDraftDomain(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addDomain(); }}
              className="h-9 text-sm focus-brand bg-white"
            />
            <Button variant="outline" size="sm" className="h-9 text-xs shrink-0" onClick={addDomain} disabled={!draftDomain.trim()}>
              Add domain
            </Button>
          </div>
        </div>
      )}
      {!hasAny && !isEditing ? (
        <p className="text-sm text-ink-warm-500 italic">
          No additional emails or domains approved. Only the client email
          and same-domain addresses can access the public campaign view.
        </p>
      ) : (
        <div className="space-y-4">
          {emails.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5">
                <Eye className="h-3 w-3" />
                Emails <span className="text-ink-warm-400 mono tabular-nums">{emails.length}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {emails.map((email) => (
                  <span
                    key={email}
                    className="group inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-brand-soft text-brand-deep border border-brand-light mono"
                  >
                    {email}
                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => removeEmail(email)}
                        className="ml-1.5 text-brand-deep hover:text-rose-600"
                        title="Remove"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
          {domains.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5">
                <Globe className="h-3 w-3" />
                Domains <span className="text-ink-warm-400 mono tabular-nums">{domains.length}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {domains.map((domain) => (
                  <span
                    key={domain}
                    className="group inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-sky-50 text-sky-700 border border-sky-100 mono"
                  >
                    @{domain}
                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => removeDomain(domain)}
                        className="ml-1.5 text-sky-700 hover:text-rose-600"
                        title="Remove"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── EngagementEditForm ───────────────────────────────────────────────
   Inline form for editing the Engagement card's fields directly from
   the view-mode layout. Persists immediately on Save; no full-form
   round-trip required. */
export function EngagementEditForm({
  campaign,
  setCampaign,
  allUsers,
  onDone,
}: {
  campaign: CampaignWithDetails;
  setCampaign: (c: CampaignWithDetails) => void;
  allUsers: any[];
  onDone: () => void;
}) {
  const [startDate, setStartDate] = useState<string>(campaign.start_date || '');
  const [endDate, setEndDate] = useState<string>(campaign.end_date || '');
  const [region, setRegion] = useState<string>((campaign as any).region || '');
  const [manager, setManager] = useState<string>(campaign.manager || '');
  const [description, setDescription] = useState<string>(campaign.description || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const previous = {
      start_date: campaign.start_date,
      end_date: campaign.end_date,
      region: (campaign as any).region,
      manager: campaign.manager,
      description: campaign.description,
    };
    const patch: any = {
      start_date: startDate || null,
      end_date: endDate || null,
      region: region || null,
      manager: manager || null,
      description: description || null,
    };
    // Optimistic
    setCampaign({ ...campaign, ...patch } as any);
    try {
      const { error } = await (supabase as any).from('campaigns').update(patch).eq('id', campaign.id);
      if (error) throw error;
      onDone();
    } catch (err: any) {
      setCampaign({ ...campaign, ...previous } as any);
      console.error('Failed to save engagement:', err);
    } finally {
      setSaving(false);
    }
  };

  // Local date helpers — mirror the page-level parseDate +
  // formatDateForInput so we don't have to thread them through props.
  // YYYY-MM-DD storage format; midday parse so a UTC-vs-local
  // off-by-one doesn't shift the displayed day.
  const parseDateLocal = (s: string): Date | undefined => {
    if (!s) return undefined;
    const d = new Date(s + 'T12:00:00');
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  const formatDateForStorage = (d: Date | undefined): string => {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const displayDate = (s: string) => {
    if (!s) return '';
    try {
      return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return s;
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        {/* Start date — Popover + Calendar (v11 DateField pattern,
            shared with the legacy edit-mode form so the user sees
            the same chrome regardless of how they enter edit mode). */}
        <div>
          <Label className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-1.5 block">Start date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="h-9 w-full justify-start text-left font-normal focus-brand text-sm"
                style={{ color: startDate ? '#111827' : '#9ca3af' }}
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {startDate ? displayDate(startDate) : 'Select start date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-50" align="start">
              <CalendarComponent
                mode="single"
                selected={parseDateLocal(startDate)}
                onSelect={(date) => setStartDate(formatDateForStorage(date))}
                initialFocus
                classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <Label className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-1.5 block">End date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="h-9 w-full justify-start text-left font-normal focus-brand text-sm"
                style={{ color: endDate ? '#111827' : '#9ca3af' }}
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {endDate ? displayDate(endDate) : 'Select end date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-50" align="start">
              <CalendarComponent
                mode="single"
                selected={parseDateLocal(endDate)}
                onSelect={(date) => setEndDate(formatDateForStorage(date))}
                initialFocus
                classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <Label className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-1.5 block">Region</Label>
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger className="h-9 text-sm focus-brand">
              <SelectValue placeholder="Select region…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="apac">APAC</SelectItem>
              <SelectItem value="emea">EMEA</SelectItem>
              <SelectItem value="mena">MENA</SelectItem>
              <SelectItem value="global">Global</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-1.5 block">Account lead</Label>
          <Select value={manager} onValueChange={setManager}>
            <SelectTrigger className="h-9 text-sm focus-brand">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {allUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="engagement-desc" className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-1.5 block">Description</Label>
        <Textarea
          id="engagement-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="focus-brand min-h-[80px] text-sm"
          placeholder="Campaign description…"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-cream-200">
        <Button variant="ghost" size="sm" onClick={onDone} disabled={saving}>Cancel</Button>
        <Button variant="brand" size="sm" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

/* ── BudgetEditForm ───────────────────────────────────────────────────
   Inline form for editing the campaign's total budget directly from
   the view-mode layout. Region allocations stay in the Budget tab —
   that editor is too complex to inline here. */
export function BudgetEditForm({
  campaign,
  setCampaign,
  onDone,
}: {
  campaign: CampaignWithDetails;
  setCampaign: (c: CampaignWithDetails) => void;
  onDone: () => void;
}) {
  const [total, setTotal] = useState<string>(String(campaign.total_budget || 0));
  // Budget types — multi-select of Token / Fiat / WL. Stored as a
  // string[] in campaigns.budget_type; rendered in the view as the
  // chip row beside the per-region allocation list.
  const [budgetTypes, setBudgetTypes] = useState<string[]>(((campaign as any).budget_type as string[]) || []);
  const [saving, setSaving] = useState(false);

  const toggleBudgetType = (t: string) => {
    setBudgetTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  };

  const save = async () => {
    const parsed = parseFloat(total);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setSaving(true);
    const previous = {
      total_budget: campaign.total_budget,
      budget_type: (campaign as any).budget_type,
    };
    const next = {
      total_budget: parsed,
      budget_type: budgetTypes.length > 0 ? budgetTypes : null,
    };
    setCampaign({ ...campaign, ...next } as any);
    try {
      const { error } = await (supabase as any)
        .from('campaigns')
        .update(next)
        .eq('id', campaign.id);
      if (error) throw error;
      onDone();
    } catch (err: any) {
      setCampaign({ ...campaign, ...previous } as any);
      console.error('Failed to save budget:', err);
    } finally {
      setSaving(false);
    }
  };

  // Tone palette mirrors the view-mode chip row so the user sees
  // the same color encoding while picking ↔ as displayed.
  const TYPE_CLS: Record<string, string> = {
    Token: 'bg-brand-soft text-brand-deep border-brand-light',
    Fiat: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    WL: 'bg-purple-50 text-purple-700 border-purple-100',
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="budget-total" className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-1.5 block">Total budget (USD)</Label>
        <Input
          id="budget-total"
          type="number"
          min={0}
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          className="h-9 text-sm focus-brand"
        />
      </div>
      <div>
        <Label className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2 block">Budget types</Label>
        <div className="flex flex-wrap gap-1.5">
          {(['Token', 'Fiat', 'WL'] as const).map((t) => {
            const active = budgetTypes.includes(t);
            const activeCls = TYPE_CLS[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleBudgetType(t)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border transition-colors ${
                  active
                    ? activeCls
                    : 'bg-white text-ink-warm-500 border-cream-200 hover:bg-cream-50 hover:text-ink-warm-700'
                }`}
              >
                {active && <CheckCircle className="h-3 w-3" />}
                {t}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-ink-warm-500 mt-1.5">Toggle the types this campaign uses. WL = whitelist allocation.</p>
      </div>
      <p className="text-xs text-ink-warm-500">
        Per-region allocations stay in the <strong>Budget</strong> tab — that editor includes regions, budget types, and per-allocation breakdowns.
      </p>
      <div className="flex justify-end gap-2 pt-2 border-t border-cream-200">
        <Button variant="ghost" size="sm" onClick={onDone} disabled={saving}>Cancel</Button>
        <Button variant="brand" size="sm" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
