'use client';

/**
 * OpportunitySlideOver — the right-side drawer that opens when the
 * user clicks a kanban card / table row / action item / forecast
 * card to focus on one opportunity. Two modes:
 *
 *   - **view** (default): read-only summary at the top + a stack of
 *     editable cards (Details / Notes / Bump Counter / Quick Actions
 *     / Stage Move / 5-for-5 Qualification / Deal / Orbit Tracking
 *     / Post-Proposal Tracking / Activity Timeline) — most of these
 *     are inline-edit-on-blur via `applyOppPatch`.
 *   - **edit**: identity-focused form (name, POC, source, owner,
 *     affiliate, etc.). High-traffic state fields moved out of this
 *     form in May 2026 in favor of inline editing in the view.
 *
 * The slide-over is rendered via `createPortal(..., document.body)`
 * so it can float above the page's main scroll surface and overlay
 * dialog z-index ordering works:
 *
 *   z-[60] : backdrop
 *   z-[70] : the drawer itself
 *   z-[80] : Stage History / Closed Lost / Activity Log dialogs that
 *            float on top of the drawer
 *
 * The drawer body is its own `ScrollArea` so its scroll is independent
 * of the page.
 *
 * Extracted from `app/crm/sales-pipeline/page.tsx` (was `renderSlideOver`,
 * ~1,308 LOC) on 2026-06-02 as the largest single Phase 3 extraction.
 * The body sections then split into their own files on 2026-06-03 —
 * see `sections/` next to this file (BumpCounter, QualificationGrid,
 * DealSection, OrbitTrackingSection, PostProposalTrackingSection,
 * ActivityTimelineSection). What remains here is the portal + esc
 * handler + header + BAMFAM banner + action-guidance card + Details
 * grid + Notes + Quick Actions + Stage Move + Edit-mode form.
 *
 * v11 note: gray-* tokens preserved during the structural split. The
 * inline date-picker chrome (`style={{ borderColor: '#e5e7eb', ... }}`
 * on Popover triggers) is the most obvious follow-up — the v11 pass
 * at the end of Phase 4 will swap those for explicit cream-200 +
 * conditional ink-warm classes (same fix pattern I used on the
 * ActivityLogDialog).
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
// `Checkbox` import dropped 2026-06-03 — moved into <QualificationGrid />.
import {
  Calendar as CalendarPicker,
} from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertTriangle,
  Building2,
  Calendar,
  Edit,
  History,
  Loader2,
  RotateCcw,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { format, formatDistanceToNow } from 'date-fns';
import { useSalesPipeline } from '@/contexts/SalesPipelineContext';
import {
  ALL_V2_STAGES,
  BUCKET_COLORS,
  POC_PLATFORMS,
  SalesPipelineService,
  STAGE_COLORS,
  STAGE_LABELS,
  type Bucket,
  type PocPlatform,
  type SalesPipelineOpportunity,
  type SalesPipelineStage,
} from '@/lib/salesPipelineService';
import { cleanPocHandle } from '@/lib/salesPipelineHelpers';
import { BumpCounter } from '@/components/crm/sales-pipeline/slideovers/sections/BumpCounter';
import { QualificationGrid } from '@/components/crm/sales-pipeline/slideovers/sections/QualificationGrid';
import { DealSection } from '@/components/crm/sales-pipeline/slideovers/sections/DealSection';
import { OrbitTrackingSection } from '@/components/crm/sales-pipeline/slideovers/sections/OrbitTrackingSection';
import { PostProposalTrackingSection } from '@/components/crm/sales-pipeline/slideovers/sections/PostProposalTrackingSection';
import { ActivityTimelineSection } from '@/components/crm/sales-pipeline/slideovers/sections/ActivityTimelineSection';

// ───────────────────────────────────────────────────────────────────
// Local utilities — kept inline because they're only used in this
// file. Promotable to lib/ if/when another component needs them.
// ───────────────────────────────────────────────────────────────────

// `cleanPocHandle` → lib/salesPipelineHelpers.ts (2026-06-03).
// `linkifyText` + `activityIcon` → moved into
//   components/crm/sales-pipeline/slideovers/sections/ActivityTimelineSection.tsx
//   on 2026-06-03 — they were only used there.

export function OpportunitySlideOver() {
  const {
    slideOverOpp,
    setSlideOverOpp,
    slideOverMode,
    setSlideOverMode,
    actionGuidance,
    setActionGuidance,
    opportunities,
    affiliates,
    activeUsers,
    users,
    bookingUserId,
    setBookingUserId,
    copyBookingLink,
    getUserName,
    isBAMFAM,
    applyOppPatch,
    openStageHistory,
    openEditDialog,
    handleStageChange,
    handleDelete,
    handleUpdate,
    isSubmitting,
    form,
    setForm,
    editingOpp,
    setEditingOpp,
    // Activity-timeline state (activities, activityForm,
    // activityMeetingDate/Time, activityFile/Ref, handleAddActivity,
    // isActivitySubmitting) moved into <ActivityTimelineSection /> on
    // 2026-06-03 (Pass 2 slide-over slice).
    // Bump state (handleRecordBump / handleReduceBump / isBumping)
    // moved into <BumpCounter /> on 2026-06-03 (Pass 1).
  } = useSalesPipeline();

  // Esc-to-close — the slide-over no longer has a backdrop click-out
  // (it's a true side panel post-2026-06-02), so we need a non-mouse
  // dismiss. Esc closes view mode immediately; in edit mode it prompts
  // for confirmation (same UX as the old backdrop-click handler).
  useEffect(() => {
    if (!slideOverOpp) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (slideOverMode === 'edit') {
        if (!confirm('You have unsaved changes. Close anyway?')) return;
        setSlideOverMode('view');
        setEditingOpp(null);
        setForm({ name: '' });
      }
      setSlideOverOpp(null);
      setActionGuidance(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slideOverOpp, slideOverMode, setSlideOverMode, setEditingOpp, setForm, setSlideOverOpp, setActionGuidance]);

  if (!slideOverOpp || typeof document === 'undefined') return null;
  const opp = opportunities.find(o => o.id === slideOverOpp.id) || slideOverOpp;
  const bamfam = isBAMFAM(opp);
  const stageColors = STAGE_COLORS[opp.stage as SalesPipelineStage] || STAGE_COLORS.cold_dm;

  return createPortal(
    <>
      {/* Backdrop removed 2026-06-02 — was a `bg-black/20` overlay
          that locked the page behind a click-trap and dimmed every-
          thing. Now the slide-over reads as a true side panel: the
          user can still see the kanban / table behind it, can
          continue scrolling, and uses the X button or Esc to close.
          Less "modal", more "panel" — matches Linear's issue panel
          pattern. The X button + click-out-on-narrow-screens (handled
          by the panel itself) cover dismissal. */}
      <div className="fixed inset-y-0 right-0 w-[480px] max-w-[calc(100vw-2rem)] bg-white border-l shadow-xl z-[70] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-gradient-to-r from-cream-50 to-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-ink-warm-400 flex-shrink-0" />
                <h3 className="font-semibold text-lg text-ink-warm-900 truncate">
                  {slideOverMode === 'edit' ? 'Edit Opportunity' : opp.name}
                </h3>
              </div>
              {slideOverMode === 'view' && (
                <>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge className={`text-xs ${stageColors.bg} ${stageColors.text} border ${stageColors.border}`}>
                      {STAGE_LABELS[opp.stage as SalesPipelineStage] || opp.stage}
                    </Badge>
                    {opp.bucket && (
                      <Badge className={`text-xs ${BUCKET_COLORS[opp.bucket].bg} ${BUCKET_COLORS[opp.bucket].text} border-0`}>
                        Bucket {opp.bucket}
                      </Badge>
                    )}
                    {opp.dm_account && (
                      <Badge variant="outline" className={`text-xs bg-white ${opp.dm_account === 'closer' ? 'border-blue-300 text-blue-600' : 'border-emerald-300 text-emerald-600'}`}>
                        {opp.dm_account === 'closer' ? 'Closer' : opp.dm_account === 'sdr' ? 'SDR' : 'Other'}
                      </Badge>
                    )}
                  </div>
                  {opp.deal_value && (
                    <p className="text-xl font-bold text-emerald-600 mt-2">${opp.deal_value.toLocaleString()} <span className="text-sm font-normal text-ink-warm-400">{opp.currency}</span></p>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {slideOverMode === 'view' ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={openStageHistory}
                    title="Stage history"
                  >
                    <History className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEditDialog(opp)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => { setSlideOverMode('view'); setEditingOpp(null); setForm({ name: '' }); }}>
                  Cancel
                </Button>
              )}
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setSlideOverOpp(null); setSlideOverMode('view'); setEditingOpp(null); setForm({ name: '' }); setActionGuidance(null); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Edit mode */}
        {slideOverMode === 'edit' && (
          <ScrollArea className="flex-1">
            <form onSubmit={e => { e.preventDefault(); handleUpdate(); }} className="p-6">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider">Name <RequiredAsterisk /></Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Company or contact name" className="focus-brand" />
                </div>
                {/* Path (dm_account) field removed 2026-05-13 — kept the
                    DB column intact (existing rows still have a value),
                    but it's no longer surfaced in the slide-over edit
                    form. Bucket takes the left slot; new Twitter Handle
                    input on the right. Temperature slider also removed —
                    the score auto-updates from activity, so manual
                    override was rarely used. */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider">Bucket</Label>
                    <Select value={form.bucket || ''} onValueChange={v => setForm(f => ({ ...f, bucket: v as Bucket }))}>
                      <SelectTrigger className="focus-brand"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A">A - High Priority</SelectItem>
                        <SelectItem value="B">B - Medium</SelectItem>
                        <SelectItem value="C">C - Low Priority</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider">Project Twitter</Label>
                    <Input
                      value={form.twitter_handle || ''}
                      onChange={e => setForm(f => ({ ...f, twitter_handle: e.target.value }))}
                      placeholder="@handle or https://x.com/handle"
                      className="focus-brand"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider">POC Platform</Label>
                    <Select value={form.poc_platform || ''} onValueChange={v => setForm(f => ({ ...f, poc_platform: v as PocPlatform }))}>
                      <SelectTrigger className="focus-brand"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {POC_PLATFORMS.map(p => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider">POC Handle / ID</Label>
                    <Input value={form.poc_handle || ''} onChange={e => setForm(f => ({ ...f, poc_handle: e.target.value }))} placeholder="@handle or ID" className="focus-brand" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider">Source</Label>
                    <Select value={form.source || ''} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
                      <SelectTrigger className="focus-brand"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="referral">Referral</SelectItem>
                        <SelectItem value="inbound">Inbound</SelectItem>
                        <SelectItem value="event">Event</SelectItem>
                        <SelectItem value="cold_outreach">Cold Outreach</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider">TG Handle</Label>
                    <Input value={form.tg_handle || ''} onChange={e => setForm(f => ({ ...f, tg_handle: e.target.value }))} placeholder="@handle" className="focus-brand" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider">Owner</Label>
                    <Select value={form.owner_id || ''} onValueChange={v => setForm(f => ({ ...f, owner_id: v }))}>
                      <SelectTrigger className="focus-brand"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {activeUsers.map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider">Referrer</Label>
                    <Input value={form.referrer || ''} onChange={e => setForm(f => ({ ...f, referrer: e.target.value }))} placeholder="Who referred?" className="focus-brand" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider">Co-Owners</Label>
                  <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 border rounded-md bg-white">
                    {(form.co_owner_ids || []).map(id => {
                      const u = users.find(u => u.id === id);
                      return (
                        <span key={id} className="inline-flex items-center gap-1 bg-brand/10 text-brand text-xs px-2 py-0.5 rounded-full">
                          {u?.name || u?.email || id}
                          <button type="button" onClick={() => setForm(f => ({ ...f, co_owner_ids: (f.co_owner_ids || []).filter(i => i !== id) }))} className="ml-0.5">&times;</button>
                        </span>
                      );
                    })}
                    <Select value="" onValueChange={v => { if (v && !(form.co_owner_ids || []).includes(v) && v !== form.owner_id) setForm(f => ({ ...f, co_owner_ids: [...(f.co_owner_ids || []), v] })); }}>
                      <SelectTrigger className="border-none shadow-none bg-transparent h-6 w-auto px-1 text-xs text-ink-warm-400 focus:ring-0"><SelectValue placeholder="+ Add" /></SelectTrigger>
                      <SelectContent>
                        {activeUsers.filter(u => u.id !== form.owner_id && !(form.co_owner_ids || []).includes(u.id)).map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider">Affiliate</Label>
                  <Select value={form.affiliate_id || ''} onValueChange={v => setForm(f => ({ ...f, affiliate_id: v }))}>
                    <SelectTrigger className="focus-brand"><SelectValue placeholder="Select affiliate..." /></SelectTrigger>
                    <SelectContent>
                      {affiliates.map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Deal Value / Currency / Meeting Date / Time / Type
                    moved 2026-05-14 out of this Edit form and into the
                    slide-over view's "Deal" card. Those fields shift
                    often during a deal — inline-edit in the view is
                    faster than opening this modal each time. The Edit
                    form is now identity-focused (name, POC, source,
                    owner, affiliate, etc.). */}
                {editingOpp?.stage === 'orbit' && (
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider">Orbit Follow-up Days</Label>
                    <Input type="number" min={1} value={form.orbit_followup_days || 90} onChange={e => setForm(f => ({ ...f, orbit_followup_days: Math.max(1, parseInt(e.target.value) || 90) }))} className="focus-brand" />
                  </div>
                )}
                <div className="grid gap-2">
                  <Label className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider">Notes</Label>
                  <Textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional notes..." className="focus-brand" rows={3} />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => { setSlideOverMode('view'); setEditingOpp(null); setForm({ name: '' }); }}>
                  Cancel
                </Button>
                <Button variant="brand" type="submit" disabled={isSubmitting || !form.name.trim()}>
                  {isSubmitting ? 'Saving...' : 'Update'}
                </Button>
              </div>
            </form>
          </ScrollArea>
        )}

        {/* View mode */}
        {slideOverMode === 'view' && bamfam && (
          <div className="px-6 py-2.5 bg-rose-50 border-b border-rose-200 flex items-center gap-2 text-rose-700 text-sm">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span className="font-medium">BAMFAM: No upcoming meeting scheduled</span>
          </div>
        )}

        {slideOverMode === 'view' && actionGuidance && (
          <div className="px-6 py-3 border-b border-sky-200" style={{ backgroundColor: '#f0f9fa' }}>
            <div className="flex items-start gap-2">
              <Zap className="h-4 w-4 flex-shrink-0 mt-0.5 text-brand"/>
              <div>
                <p className="text-sm font-semibold text-brand">{actionGuidance.label}</p>
                <p className="text-xs text-ink-warm-700 mt-0.5">{actionGuidance.hint}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 ml-auto flex-shrink-0 text-ink-warm-400"
                onClick={() => setActionGuidance(null)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {slideOverMode === 'view' && (
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            {/* Details — first section, no border-t. Plain section
                pattern matches the rest of the slide-over (Deal, Orbit
                Tracking, etc.) — was a cream card pre 2026-06-03. */}
            <div>
              <h4 className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider mb-3">Details</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm min-w-0">
                <div className="min-w-0">
                  <span className="text-[10px] text-ink-warm-500 uppercase tracking-wider">Temperature</span>
                  <div className="flex items-center gap-2 mt-1">
                    {/* Wider track (was w-20 / 80px) so low scores
                        don't render as a 3-4px sliver. Combined with
                        max-w on the container so the bar doesn't take
                        over the cell on wide viewports. */}
                    <div className="h-2 w-full max-w-[140px] bg-cream-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${opp.temperature_score >= 70 ? 'bg-emerald-500' : opp.temperature_score >= 40 ? 'bg-amber-500' : 'bg-rose-400'}`}
                        style={{ width: `${opp.temperature_score}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium tabular-nums">{opp.temperature_score}%</span>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-ink-warm-500 uppercase tracking-wider">Owner</span>
                  <p className="font-medium mt-0.5">{getUserName(opp.owner_id)}</p>
                  {opp.co_owner_ids && opp.co_owner_ids.length > 0 && (
                    <p className="text-[10px] text-ink-warm-400 mt-0.5">
                      +{opp.co_owner_ids.map(id => getUserName(id)).join(', ')}
                    </p>
                  )}
                </div>
                <div>
                  <span className="text-[10px] text-ink-warm-500 uppercase tracking-wider">POC</span>
                  {opp.poc_handle ? (
                    <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize flex-shrink-0 bg-white">{opp.poc_platform || 'other'}</Badge>
                      <span className="font-medium truncate">{cleanPocHandle(opp.poc_handle)}</span>
                    </div>
                  ) : (
                    <p className="font-medium mt-0.5 text-ink-warm-400">—</p>
                  )}
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] text-ink-warm-500 uppercase tracking-wider">TG Handle</span>
                  <p className="font-medium mt-0.5 truncate">{opp.tg_handle || '—'}</p>
                </div>
                <div>
                  <span className="text-[10px] text-ink-warm-500 uppercase tracking-wider">Source</span>
                  <p className="font-medium mt-0.5 capitalize">{opp.source?.replace('_', ' ') || '—'}</p>
                </div>
                {opp.next_meeting_at && (
                  <div>
                    <span className="text-[10px] text-ink-warm-500 uppercase tracking-wider">Next Meeting</span>
                    <p className="font-medium mt-0.5">{format(new Date(opp.next_meeting_at), 'MMM d, yyyy h:mm a')}</p>
                  </div>
                )}
                {opp.referrer && (
                  <div>
                    <span className="text-[10px] text-ink-warm-500 uppercase tracking-wider">Referrer</span>
                    <p className="font-medium mt-0.5">{opp.referrer}</p>
                  </div>
                )}
                {opp.last_contacted_at && (
                  <div>
                    <span className="text-[10px] text-ink-warm-500 uppercase tracking-wider">Last Contacted</span>
                    <p className="font-medium mt-0.5">{formatDistanceToNow(new Date(opp.last_contacted_at), { addSuffix: true })}</p>
                  </div>
                )}
                <div>
                  <span className="text-[10px] text-ink-warm-500 uppercase tracking-wider">Affiliate</span>
                  {opp.affiliate ? (
                    <div className="mt-0.5">
                      {/* Softer brand tone to match how affiliates
                          render elsewhere (StatusBadge tone="brand").
                          Was solid `bg-brand text-white` — the only
                          place on the page using solid brand fill. */}
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-brand-light text-brand">
                        {opp.affiliate.name}
                      </span>
                    </div>
                  ) : (
                    <p className="font-medium mt-0.5 text-ink-warm-400">—</p>
                  )}
                </div>
              </div>
            </div>

            {/* Notes — section pattern, matches Deal / Orbit / etc. */}
            {opp.notes && (
              <div className="border-t pt-6">
                <h4 className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider mb-3">Notes</h4>
                <p className="text-sm text-ink-warm-700 whitespace-pre-wrap break-words" style={{ overflowWrap: 'anywhere' }}>{opp.notes}</p>
              </div>
            )}

            <BumpCounter opp={opp} />

            {/* Quick Actions — grouped: booking on the left, stage
                transitions on the right with a small visual gap.
                2026-06-03 cleanup: dropped the per-button colored
                borders (brand/orange/rose) — neutral outline buttons
                now, with the icon tints carrying the semantic. The
                booking-link Select also drops its `border-brand/30`
                in favor of the default focus-brand pattern. */}
            <div className="flex gap-3 flex-wrap min-w-0">
              <div className="flex items-center gap-1 flex-wrap">
                <Select
                  value={bookingUserId[`slide-${opp.id}`] || opp.owner_id || ''}
                  onValueChange={v => setBookingUserId(prev => ({ ...prev, [`slide-${opp.id}`]: v }))}
                >
                  <SelectTrigger className="h-8 text-xs w-[120px] focus-brand">
                    <SelectValue placeholder="Team member" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeUsers.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline" size="sm" className="h-8 text-xs"
                  onClick={() => copyBookingLink(bookingUserId[`slide-${opp.id}`] || opp.owner_id || '', opp.id)}
                >
                  <Calendar className="h-3.5 w-3.5 mr-1 text-brand" /> Copy Booking Link
                </Button>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <Button
                  variant="outline" size="sm" className="h-8 text-xs"
                  onClick={() => handleStageChange(opp.id, 'orbit', opp.stage)}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1 text-orange-500" /> Move to Orbit
                </Button>
                <Button
                  variant="outline" size="sm" className="h-8 text-xs"
                  onClick={() => handleDelete(opp.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1 text-rose-500" /> Delete
                </Button>
              </div>
            </div>

            {/* Stage Move */}
            <div className="grid gap-2">
              <Label className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider">Move to Stage</Label>
              <Select
                value={opp.stage}
                onValueChange={(v) => handleStageChange(opp.id, v as SalesPipelineStage, opp.stage)}
              >
                <SelectTrigger className="focus-brand">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_V2_STAGES.filter(s => s !== 'proposal_sent').map(s => (
                    <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <QualificationGrid opp={opp} />

            <DealSection opp={opp} />

            <OrbitTrackingSection opp={opp} />

            <PostProposalTrackingSection opp={opp} />

            <ActivityTimelineSection />
          </div>
        </ScrollArea>
        )}
      </div>
    </>,
    document.body
  );
}
