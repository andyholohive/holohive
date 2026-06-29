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

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Calendar,
  Calendar as CalendarIcon,
  CheckCircle,
  ChevronRight,
  CircleCheck,
  CircleDot,
  DollarSign,
  Edit,
  Eye,
  ExternalLink,
  File,
  FileText,
  Globe,
  Image as ImageIcon,
  Pencil,
  Plus,
  Trash2,
  Users,
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
import { formatDate as fmtDate } from '@/lib/dateFormat';
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
  campaignKOLs,
  payments,
  contents,
  allUsers,
  onEditClick,
  onResourcesChange,
}: {
  campaign: CampaignWithDetails;
  /** kept for prop compatibility with the page; the inline `setCampaign`
   *  flow is no longer used now that Overview is read-only. */
  setCampaign?: (c: CampaignWithDetails) => void;
  campaignKOLs: any[];
  payments: any[];
  contents: any[];
  allUsers: any[];
  /** kept for prop compatibility; allocations now show on the Budget tab. */
  allocations?: any[];
  /** kept for prop compatibility; per-card edit state is no longer used. */
  editingCard?: null | 'engagement' | 'budget' | 'approved';
  setEditingCard?: (next: null | 'engagement' | 'budget' | 'approved') => void;
  /** Hero "Edit campaign" → flips the page into full edit mode. */
  onEditClick?: () => void;
  onResourcesChange: (next: CampaignResource[]) => void;
}) {
  // Derived metrics — KPI strip values.
  const startDate = campaign.start_date ? new Date(campaign.start_date + 'T00:00:00') : null;
  const endDate = campaign.end_date ? new Date(campaign.end_date + 'T00:00:00') : null;
  const daysRemaining = endDate ? Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / 86_400_000)) : null;

  const totalPaid = (payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
  const postedContentCount = (contents || []).filter((c: any) => c.status === 'posted' || c.status === 'published').length;
  const totalContentCount = (contents || []).length;

  const manager = allUsers.find((u) => u.id === campaign.manager);
  const resources: CampaignResource[] = ((campaign as any).resources || []) as CampaignResource[];
  const clientId = (campaign as any).client_id as string | null;

  // Client + coverage + activity — single fetch wave, scoped to the
  // campaign's client. The Linked Client card and the coverage pill
  // both read from this; the Activity feed pulls from
  // client_activity_log filtered to recent inserts.
  type Client = { id: string; name: string };
  type Coverage = { covered_through: string | null; days_left: number | null; coverage_tone: string | null };
  type ActivityRow = {
    id: string;
    title: string;
    activity_category: string;
    activity_type: string;
    created_at: string | null;
    created_by_name: string | null;
  };
  const [client, setClient] = useState<Client | null>(null);
  const [clientScope, setClientScope] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      const [clientRes, contextRes, coverageRes, activityRes] = await Promise.all([
        supabase.from('clients').select('id,name').eq('id', clientId).maybeSingle(),
        supabase.from('client_context').select('scope').eq('client_id', clientId).maybeSingle(),
        supabase
          .from('client_coverage_status')
          .select('covered_through,days_left,coverage_tone,stint_status')
          .eq('client_id', clientId)
          .eq('stint_status', 'active')
          .maybeSingle(),
        supabase
          .from('client_activity_log')
          .select('id,title,activity_category,activity_type,created_at,created_by_name')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);
      if (cancelled) return;
      if (clientRes.data) setClient({ id: clientRes.data.id, name: clientRes.data.name });
      if (contextRes.data?.scope) setClientScope(contextRes.data.scope);
      if (coverageRes.data) {
        setCoverage({
          covered_through: coverageRes.data.covered_through,
          days_left: coverageRes.data.days_left,
          coverage_tone: coverageRes.data.coverage_tone,
        });
      }
      if (activityRes.data) setActivity(activityRes.data as ActivityRow[]);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    try {
      return fmtDate(iso + 'T00:00:00') || iso;
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

  const formatRelative = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay === 1) return 'yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;
    return fmtDate(iso) || '';
  };

  // Coverage pill tone — same green/amber/red ramp the dashboard uses
  // via the client_coverage_status view's coverage_tone column.
  const COVERAGE_PILL: Record<string, { bg: string; text: string; border: string }> = {
    green:  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100' },
    amber:  { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-100' },
    red:    { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-100' },
  };
  const covPill = coverage?.coverage_tone ? COVERAGE_PILL[coverage.coverage_tone] : null;

  const STATUS_PILL: Record<string, { bg: string; text: string }> = {
    Active:    { bg: 'bg-brand-soft', text: 'text-brand-deep' },
    Planning:  { bg: 'bg-sky-50',     text: 'text-sky-700' },
    Paused:    { bg: 'bg-amber-50',   text: 'text-amber-700' },
    Completed: { bg: 'bg-cream-100',  text: 'text-ink-warm-700' },
  };
  const statusPill = STATUS_PILL[campaign.status as string] ?? STATUS_PILL.Planning;

  // Activity icon by category — falls back to a neutral dot.
  const ACTIVITY_ICON: Record<string, { icon: typeof Activity; tone: string }> = {
    content:    { icon: CircleCheck, tone: 'text-emerald-500' },
    payment:    { icon: DollarSign,  tone: 'text-amber-500' },
    lineup:     { icon: Eye,         tone: 'text-sky-500' },
    edit:       { icon: Pencil,      tone: 'text-ink-warm-500' },
    onboarding: { icon: Users,       tone: 'text-purple-500' },
  };

  return (
    /* ── Overview layout — 2026-06-23 ──────────────────────────────────
       Replaces the prior 3-column edit-grid (Engagement / Budget /
       Approved Access + Quick Stats + Renewal + Activity placeholder).
       Now a glance-only dashboard:
         1. Hero band — name + status + coverage pill + account lead +
            single "Edit campaign" button (opens InformationEditMode).
         2. KPI strip — KpiCard-style 4-up: KOLs, Content, Budget, Days.
         3. Two columns —
             Left: Resources (kept) + Recent activity (real data from
                   client_activity_log scoped to this campaign's client).
             Right: Linked Client card — read-only summary + link to
                    the Client Context modal's Engagement tab.

       What got removed and why:
         - Engagement editor card → all dates / lead / status edits go
           through the Edit Campaign dialog (single source of truth).
         - Budget card → the Budget tab does this better.
         - Approved Access editor → already on Edit Client dialog.
         - Renewal Alert card → dashboard already shows it via the same
           coverage_tone the hero pill uses.
         - "Coming soon" recent-activity placeholder → real data now. */
    <div className="space-y-5">
      {/* ── Hero band ────────────────────────────────────────────── */}
      <div className="bg-white rounded-[14px] border border-cream-200 shadow-card px-5 py-4 flex items-center gap-3 flex-wrap">
        <p className="text-base font-semibold text-ink-warm-900 truncate">{campaign.name || 'Untitled campaign'}</p>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusPill.bg} ${statusPill.text}`}>
          {campaign.status || 'Planning'}
        </span>
        {covPill && coverage?.covered_through && coverage?.days_left != null && (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${covPill.bg} ${covPill.text} ${covPill.border}`}>
            <CircleDot className="h-3 w-3" />
            Covered through {formatDate(coverage.covered_through)} · {coverage.days_left}d
          </span>
        )}
        {manager && (
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-warm-700">
            {manager.profile_photo_url ? (
              <span className="w-5 h-5 rounded-full overflow-hidden border border-cream-200 bg-white shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={manager.profile_photo_url} alt={manager.name || 'Lead'} className="w-full h-full object-cover" />
              </span>
            ) : (
              <span className="w-5 h-5 rounded-full bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center text-[9px] font-semibold shrink-0">
                {(manager.name || manager.email || '?').charAt(0).toUpperCase()}
              </span>
            )}
            <span className="truncate max-w-[140px]">{manager.name || manager.email}</span>
          </span>
        )}
        {onEditClick && (
          <Button
            variant="outline"
            size="sm"
            onClick={onEditClick}
            className="ml-auto h-8 text-xs font-medium"
          >
            <Edit className="h-3.5 w-3.5 mr-1.5" />
            Edit campaign
          </Button>
        )}
      </div>

      {/* ── KPI strip ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-cream-50/60 border border-cream-200 rounded-xl p-4">
          <p className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em]">KOLs</p>
          <p className="mt-1.5 text-2xl font-bold text-ink-warm-900 tabular-nums">{campaignKOLs.length}</p>
        </div>
        <div className="bg-cream-50/60 border border-cream-200 rounded-xl p-4">
          <p className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em]">Content</p>
          <p className="mt-1.5 text-2xl font-bold text-ink-warm-900 tabular-nums">
            {postedContentCount}<span className="text-base text-ink-warm-400"> / {totalContentCount}</span>
          </p>
        </div>
        <div className="bg-cream-50/60 border border-cream-200 rounded-xl p-4">
          <p className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em]">Budget</p>
          <p className="mt-1.5 text-2xl font-bold text-ink-warm-900 tabular-nums">
            {formatCurrency(totalPaid)}<span className="text-base text-ink-warm-400"> / {formatCurrency(campaign.total_budget || 0)}</span>
          </p>
        </div>
        <div className="bg-cream-50/60 border border-cream-200 rounded-xl p-4">
          <p className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em]">Days left</p>
          <p className={`mt-1.5 text-2xl font-bold tabular-nums ${daysRemaining != null && daysRemaining <= 14 ? 'text-rose-700' : 'text-ink-warm-900'}`}>
            {daysRemaining ?? '—'}
          </p>
        </div>
      </div>

      {/* ── Two-column body ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <ResourcesCard resources={resources} onChange={onResourcesChange} />

          {/* Recent activity — real client_activity_log rows for this
              campaign's client. Empty state when no rows. */}
          <div className="bg-white rounded-[14px] border border-cream-200 shadow-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Recent activity</h3>
              {client && (
                <Link
                  href={`/clients?contextModalClientId=${client.id}&tab=engagement`}
                  className="text-xs text-ink-warm-500 hover:text-brand-deep inline-flex items-center gap-1"
                >
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>
            {activity.length === 0 ? (
              <p className="text-sm text-ink-warm-500 italic">No recent activity for this client.</p>
            ) : (
              <ul className="space-y-3">
                {activity.map((row) => {
                  const meta = ACTIVITY_ICON[row.activity_category] || ACTIVITY_ICON.edit;
                  const Icon = meta.icon;
                  return (
                    <li key={row.id} className="flex items-center gap-3">
                      <Icon className={`h-4 w-4 flex-shrink-0 ${meta.tone}`} />
                      <span className="text-sm text-ink-warm-800 flex-1 truncate">{row.title}</span>
                      <span className="text-xs text-ink-warm-400 mono whitespace-nowrap">{formatRelative(row.created_at)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* ── Linked Client (right column) ─────────────────────────── */}
        <div>
          <div className="bg-white rounded-[14px] border border-cream-200 shadow-card p-6">
            <p className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-3">Linked client</p>
            {client ? (
              <>
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center text-xs font-semibold shrink-0">
                    {client.name.charAt(0).toUpperCase()}
                  </div>
                  <p className="text-sm font-semibold text-ink-warm-900 truncate">{client.name}</p>
                </div>
                {clientScope && (
                  <>
                    <p className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-1.5">Scope</p>
                    <p className="text-sm text-ink-warm-700 mb-4 line-clamp-3 leading-relaxed">{clientScope}</p>
                  </>
                )}
                {coverage?.covered_through && (
                  <>
                    <p className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-1.5">Coverage</p>
                    <p className="text-sm text-ink-warm-700 mb-4">
                      Covered through {formatDate(coverage.covered_through)}
                      {coverage.days_left != null && (
                        <span className="text-ink-warm-500"> · {coverage.days_left}d left</span>
                      )}
                    </p>
                  </>
                )}
                <Button asChild variant="outline" size="sm" className="w-full text-xs">
                  <Link href={`/clients?contextModalClientId=${client.id}&tab=engagement`}>
                    Open client context
                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
              </>
            ) : (
              <p className="text-sm text-ink-warm-500 italic">No client linked.</p>
            )}
          </div>
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
            className="h-7 px-2 text-xs font-medium text-brand-deep hover:bg-cream-50"
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
              className="h-7 px-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
            >
              Done
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={onStartEdit}
              className="h-7 px-2 text-xs font-medium text-brand-deep hover:bg-cream-50"
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
      return fmtDate(s + 'T12:00:00') || s;
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
