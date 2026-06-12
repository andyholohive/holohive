'use client';

/**
 * Spec Tracker — feature-level rollout dashboard.
 *
 * Built 2026-06-11 in response to: "make a way for us to better track
 * this in the initiatives so that team can see where we are at + a
 * detailed system so that we are exactly sure what is working and
 * not working."
 *
 * Two views in this one component:
 *   • Grid view (default) — every spec as a card with progress bars
 *     and worst-status chip
 *   • Detail view — feature tree under a spec with inline status
 *     edits, "Mark working" / "Mark broken" buttons, test history
 *
 * Mark broken auto-files a backlog item (with auto-link) so issues
 * don't sit in someone's head.
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  ChevronLeft, ChevronRight, ChevronDown, Plus, Upload, CheckCircle2,
  AlertTriangle, XCircle, Circle, FileText, ExternalLink, History, MapPin, Database, Loader2,
  Sparkles, Search, Edit2, Trash2, ArrowLeft, FileCheck2,
} from 'lucide-react';
import { SectionHeader } from '@/components/ui/section-header';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  SpecTrackerService,
  type SpecCard, type SpecFull, type SpecFeature,
  type TestStatus, type BuildStatus,
  worstTestStatus,
} from '@/lib/specTrackerService';

/** Display-only title case for spec status. DB stores snake_case
 *  ('in_progress'); UI shows Title Case ('In Progress'). */
const SPEC_STATUS_LABEL: Record<string, string> = {
  planned:     'Planned',
  in_progress: 'In Progress',
  shipped:     'Shipped',
  paused:      'Paused',
  cancelled:   'Cancelled',
};

const SPEC_STATUS_TONE: Record<string, BadgeTone> = {
  planned:     'neutral',
  in_progress: 'brand',
  shipped:     'success',
  paused:      'warning',
  cancelled:   'danger',
};

function titleCaseStatus(s: string): string {
  return SPEC_STATUS_LABEL[s] ?? s
    .replace(/_/g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

const TEST_STATUS_CONFIG: Record<TestStatus, { label: string; tone: BadgeTone; icon: React.ReactNode }> = {
  working:  { label: 'Working',  tone: 'success', icon: <CheckCircle2 className="h-3 w-3" /> },
  issues:   { label: 'Issues',   tone: 'warning', icon: <AlertTriangle className="h-3 w-3" /> },
  broken:   { label: 'Broken',   tone: 'danger',  icon: <XCircle className="h-3 w-3" /> },
  untested: { label: 'Untested', tone: 'neutral', icon: <Circle className="h-3 w-3" /> },
};

const BUILD_STATUS_LABEL: Record<BuildStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  built:       'Built',
};

export default function SpecsTab() {
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const currentUserId = (userProfile as any)?.id as string | undefined;
  const service = useMemo(() => new SpecTrackerService(supabase as any), []);

  const [specs, setSpecs] = useState<SpecCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // [2026-06-12] URL-linked spec routing — `?tab=specs&spec=<id>` deep
  // links straight to the detail view. Browser back/forward + share-URL
  // both work. Reads + writes via URLSearchParams so we don't add a
  // routing library dependency.
  const [selectedSpecId, setSelectedSpecId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('spec');
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (selectedSpecId) params.set('spec', selectedSpecId);
    else params.delete('spec');
    const next = `${window.location.pathname}?${params.toString()}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', next);
    }
  }, [selectedSpecId]);


  // Doc upload dialog
  const [uploadOpen, setUploadOpen] = useState(false);
  // New-spec dialog state. Replaces window.prompt.
  const [newSpecOpen, setNewSpecOpen] = useState(false);
  const [newSpecName, setNewSpecName] = useState('');
  const [newSpecSummary, setNewSpecSummary] = useState('');
  const [creatingSpec, setCreatingSpec] = useState(false);

  // [2026-06-11] Picker data for test_reference placeholders like
  // {campaign_id} and {client_id}. Lazy-loaded once when the tab mounts.
  // Used by TestReferenceChip when a feature's reference contains a
  // placeholder — renders a Select inline so the validator can navigate
  // directly to a specific record instead of guessing.
  const [pickerOptions, setPickerOptions] = useState<Record<string, Array<{ id: string; name: string }>>>({});

  useEffect(() => {
    refresh();
    loadPickerOptions();
  }, []);

  async function loadPickerOptions() {
    try {
      const [campaignsRes, clientsRes] = await Promise.all([
        (supabase as any)
          .from('campaigns')
          .select('id, name')
          .eq('status', 'Active')
          .is('archived_at', null)
          .order('name'),
        (supabase as any)
          .from('clients')
          .select('id, name')
          .eq('is_active', true)
          .is('archived_at', null)
          .order('name'),
      ]);
      setPickerOptions({
        campaign_id: campaignsRes.data || [],
        client_id: clientsRes.data || [],
      });
    } catch (err) {
      console.error('[SpecsTab] loadPickerOptions failed:', err);
    }
  }

  async function refresh() {
    setLoading(true);
    try {
      const rows = await service.listAllWithRollup();
      setSpecs(rows);
    } catch (err: any) {
      toast({ title: 'Failed to load specs', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  const filteredSpecs = useMemo(() => {
    if (!search.trim()) return specs;
    const q = search.toLowerCase();
    return specs.filter(s =>
      s.name.toLowerCase().includes(q)
      || (s.summary && s.summary.toLowerCase().includes(q)),
    );
  }, [specs, search]);

  if (selectedSpecId) {
    return (
      <SpecDetailView
        specId={selectedSpecId}
        currentUserId={currentUserId ?? null}
        service={service}
        onBack={() => { setSelectedSpecId(null); refresh(); }}
        pickerOptions={pickerOptions}
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 max-w-md rounded-md" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="h-3.5 w-3.5 text-ink-warm-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            placeholder="Search specs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="focus-brand h-9 pl-8"
          />
        </div>
        <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          Upload spec doc
        </Button>
        <Button size="sm" variant="brand" onClick={() => {
          setNewSpecName('');
          setNewSpecSummary('');
          setNewSpecOpen(true);
        }}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New spec
        </Button>
      </div>

      {filteredSpecs.length === 0 ? (
        <div className="border border-cream-200 rounded-lg bg-white">
          <EmptyState
            icon={FileText}
            title="No specs yet"
            description="Upload a spec doc or create one manually to get started."
            className="py-12"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredSpecs.map(spec => (
            <SpecGridCard
              key={spec.id}
              spec={spec}
              onOpen={() => setSelectedSpecId(spec.id)}
            />
          ))}
        </div>
      )}

      <DocUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onCreated={async (specId) => {
          setUploadOpen(false);
          await refresh();
          setSelectedSpecId(specId);
        }}
        currentUserId={currentUserId ?? null}
      />

      {/* New-spec dialog — replaces window.prompt. v11 standard
          dialog with a Label + RequiredAsterisk + focus-brand input. */}
      <Dialog open={newSpecOpen} onOpenChange={(o) => { if (!o && !creatingSpec) setNewSpecOpen(false); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-brand" />
              New spec
            </DialogTitle>
            <DialogDescription>
              Track a new spec or product surface. Add features after it's created.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="new-spec-name">Name <RequiredAsterisk /></Label>
              <Input
                id="new-spec-name"
                value={newSpecName}
                onChange={(e) => setNewSpecName(e.target.value)}
                placeholder="e.g. HHP Reminder System"
                className="focus-brand"
                autoFocus
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-spec-summary">Summary</Label>
              <Textarea
                id="new-spec-summary"
                value={newSpecSummary}
                onChange={(e) => setNewSpecSummary(e.target.value)}
                placeholder="One-line summary"
                className="focus-brand"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setNewSpecOpen(false)} disabled={creatingSpec}>
              Cancel
            </Button>
            <Button
              variant="brand"
              onClick={async () => {
                if (!newSpecName.trim()) return;
                setCreatingSpec(true);
                try {
                  const created = await service.createSpec({
                    name: newSpecName.trim(),
                    summary: newSpecSummary.trim() || undefined,
                    actorId: currentUserId ?? null,
                  });
                  setNewSpecOpen(false);
                  await refresh();
                  setSelectedSpecId(created.id);
                } catch (err: any) {
                  toast({ title: 'Create failed', description: err?.message, variant: 'destructive' });
                } finally {
                  setCreatingSpec(false);
                }
              }}
              disabled={!newSpecName.trim() || creatingSpec}
            >
              {creatingSpec ? 'Creating…' : 'Create spec'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Spec card on the grid ─────────────────────────────────────────

function SpecGridCard({ spec, onOpen }: { spec: SpecCard; onOpen: () => void }) {
  const builtPct = spec.rollup.total > 0 ? Math.round((spec.rollup.built / spec.rollup.total) * 100) : 0;
  const worst = worstTestStatus(spec.rollup);
  const worstCfg = TEST_STATUS_CONFIG[worst];

  // [2026-06-11] Colored top accent rail when the worst test status is
  // attention-grabbing — matches the v11 initiative card pattern on
  // /dashboard. Rose for broken (or any failure), amber for issues, no
  // rail for working / untested (the neutral default state).
  const accentRail =
    worst === 'broken' ? 'before:bg-rose-400' :
    worst === 'issues' ? 'before:bg-amber-400' :
    'before:bg-transparent';

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group relative text-left border border-cream-200 rounded-lg bg-white p-3.5 hover:border-brand/40 hover:shadow-sm transition-all before:absolute before:top-0 before:left-0 before:right-0 before:h-[2px] before:rounded-t-lg ${accentRail}`}
    >
      {/* Title row — name + status badge inline, matching the dashboard
          initiative card layout. Worst test status moves to its own
          row below so the title doesn't compete with two badges. */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-sm font-semibold text-ink-warm-900 group-hover:text-brand transition-colors truncate flex-1">
          {spec.name}
        </p>
        <StatusBadge tone={SPEC_STATUS_TONE[spec.status] ?? 'neutral'} size="sm">
          {titleCaseStatus(spec.status)}
        </StatusBadge>
      </div>
      {spec.summary && (
        <p className="text-[11px] text-ink-warm-500 mb-3 line-clamp-2">{spec.summary}</p>
      )}

      {/* Build progress bar with inline count */}
      <div className="mb-2">
        <div className="flex items-baseline justify-between text-[10px] text-ink-warm-500 mb-0.5">
          <span>Built</span>
          <span className="tabular-nums">{spec.rollup.built}/{spec.rollup.total}</span>
        </div>
        <div className="h-1.5 bg-cream-100 rounded-full overflow-hidden">
          <div className="h-full bg-brand transition-all" style={{ width: `${builtPct}%` }} />
        </div>
      </div>

      {/* Status chip row — matches the tag-chip styling used on the
          dashboard initiative cards (text-[10px] px-1.5 py-0.5 rounded
          bg-cream-100 text-ink-warm-700 border border-cream-200). Each
          chip is a (count + label) pair so the meaning is immediate. */}
      <div className="flex items-center gap-1 flex-wrap">
        <StatusChip
          icon={worstCfg.icon}
          label={`Worst: ${worstCfg.label}`}
          tone={worst === 'broken' ? 'rose' : worst === 'issues' ? 'amber' : worst === 'working' ? 'emerald' : 'neutral'}
        />
        {spec.rollup.working > 0 && (
          <StatusChip
            icon={<CheckCircle2 className="h-2.5 w-2.5" />}
            label={`${spec.rollup.working} working`}
            tone="emerald"
          />
        )}
        {spec.rollup.issues > 0 && (
          <StatusChip
            icon={<AlertTriangle className="h-2.5 w-2.5" />}
            label={`${spec.rollup.issues} issues`}
            tone="amber"
          />
        )}
        {spec.rollup.broken > 0 && (
          <StatusChip
            icon={<XCircle className="h-2.5 w-2.5" />}
            label={`${spec.rollup.broken} broken`}
            tone="rose"
          />
        )}
        {spec.rollup.untested > 0 && (
          <StatusChip
            icon={<Circle className="h-2.5 w-2.5" />}
            label={`${spec.rollup.untested} untested`}
            tone="neutral"
          />
        )}
      </div>
    </button>
  );
}

/**
 * Inline tag-chip helper used on the spec grid cards. Matches the
 * tag-chip styling used on the /dashboard initiative card grid:
 * tiny 10px text, 1.5px rounded square, soft tone-tinted bg + border.
 */
function StatusChip({
  icon, label, tone,
}: {
  icon: React.ReactNode;
  label: string;
  tone: 'neutral' | 'emerald' | 'amber' | 'rose';
}) {
  const toneClasses = {
    neutral: 'bg-cream-100 text-ink-warm-700 border-cream-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber:   'bg-amber-50 text-amber-700 border-amber-100',
    rose:    'bg-rose-50 text-rose-700 border-rose-100',
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium ${toneClasses}`}>
      {icon}
      <span className="tabular-nums">{label}</span>
    </span>
  );
}

// ─── Detail view ──────────────────────────────────────────────────

function SpecDetailView({
  specId, currentUserId, service, onBack, pickerOptions,
}: {
  specId: string;
  currentUserId: string | null;
  service: SpecTrackerService;
  onBack: () => void;
  pickerOptions: Record<string, Array<{ id: string; name: string }>>;
}) {
  const { toast } = useToast();
  const [spec, setSpec] = useState<SpecFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportDialogFor, setReportDialogFor] = useState<SpecFeature | null>(null);
  const [historyFor, setHistoryFor] = useState<SpecFeature | null>(null);
  // Replace window.prompt / window.confirm with proper dialogs
  const [addFeatureOpen, setAddFeatureOpen] = useState(false);
  const [newFeatureName, setNewFeatureName] = useState('');
  const [newFeatureDesc, setNewFeatureDesc] = useState('');
  const [creatingFeature, setCreatingFeature] = useState(false);
  const [deleteFeatureTarget, setDeleteFeatureTarget] = useState<SpecFeature | null>(null);
  const [deletingFeature, setDeletingFeature] = useState(false);

  // [2026-06-12] Test-status filter tabs within the detail view. Narrows
  // the feature list to a single status bucket so the validator can focus
  // on just the working / untested / issues / broken slice.
  const [statusFilter, setStatusFilter] = useState<'all' | TestStatus>('all');

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specId]);

  async function refresh() {
    setLoading(true);
    try {
      const full = await service.getFull(specId);
      setSpec(full);
    } catch (err: any) {
      toast({ title: 'Failed to load spec', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function setTestStatus(feature: SpecFeature, status: TestStatus, notes?: string) {
    try {
      await service.logTestResult({
        featureId: feature.id,
        newStatus: status,
        notes,
        actorId: currentUserId,
      });
      toast({ title: `Marked ${TEST_STATUS_CONFIG[status].label}` });
      await refresh();
    } catch (err: any) {
      toast({ title: 'Update failed', description: err?.message, variant: 'destructive' });
    }
  }

  async function handleReportSubmit(feature: SpecFeature, status: 'issues' | 'broken', notes: string, fileBacklog: boolean) {
    try {
      const result = await service.logTestResult({
        featureId: feature.id,
        newStatus: status,
        notes,
        actorId: currentUserId,
        fileBacklogItem: fileBacklog ? {
          title: `[${spec?.name}] ${feature.name}`,
          description: notes || `Reported via Spec Tracker on ${feature.name}.`,
        } : null,
      });
      toast({
        title: `Marked ${TEST_STATUS_CONFIG[status].label}`,
        description: result.backlogItemId
          ? 'Backlog item filed and linked to this feature.'
          : 'Status updated.',
      });
      setReportDialogFor(null);
      await refresh();
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    }
  }

  if (loading || !spec) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 max-w-md rounded-md" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  const overallTested = spec.rollup.working + spec.rollup.issues + spec.rollup.broken;
  const testedPct = spec.rollup.total > 0 ? Math.round((overallTested / spec.rollup.total) * 100) : 0;

  return (
    <>
      {/* v11 sub-route pattern (CLAUDE.md "Sub-route back-buttons"):
          breadcrumb above + structured header section below.
          Lightweight back affordance: text Link with ArrowLeft. */}
      <div className="space-y-3 mb-5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-ink-warm-500 hover:text-brand transition-colors w-fit"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Specs
        </button>

        {/* Header section — matches the PageHeader rhythm without
            using PageHeader itself (we're inside a tab, so the
            page-level title already belongs to /initiatives). */}
        <div className="flex items-start justify-between gap-3 flex-wrap pb-3 border-b border-cream-200">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-brand mb-1">
              Specs · Detail
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-ink-warm-900 truncate">{spec.name}</h2>
              <StatusBadge tone={SPEC_STATUS_TONE[spec.status] ?? 'neutral'} size="sm">
                {titleCaseStatus(spec.status)}
              </StatusBadge>
            </div>
            {spec.summary && (
              <p className="text-xs text-ink-warm-500 mt-1 max-w-2xl">{spec.summary}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {spec.doc_url && (
              <Button asChild variant="outline" size="sm">
                <a href={spec.doc_url} target="_blank" rel="noopener noreferrer">
                  <FileText className="h-3.5 w-3.5 mr-1" />
                  Spec doc
                  <ExternalLink className="h-2.5 w-2.5 ml-1" />
                </a>
              </Button>
            )}
            <Button
              size="sm"
              variant="brand"
              onClick={() => {
                setNewFeatureName('');
                setNewFeatureDesc('');
                setAddFeatureOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add feature
            </Button>
          </div>
        </div>
      </div>

      {/* Rollup summary */}
      <Card className="border-cream-200 mb-4">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-ink-warm-500">Built</p>
              <p className="text-xl font-bold text-ink-warm-900 tabular-nums">{spec.rollup.built} / {spec.rollup.total}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-ink-warm-500">Tested</p>
              <p className="text-xl font-bold text-ink-warm-900 tabular-nums">{testedPct}%</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-emerald-600">Working</p>
              <p className="text-xl font-bold text-emerald-700 tabular-nums">{spec.rollup.working}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-amber-600">Issues</p>
              <p className="text-xl font-bold text-amber-700 tabular-nums">{spec.rollup.issues}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-rose-600">Broken</p>
              <p className="text-xl font-bold text-rose-700 tabular-nums">{spec.rollup.broken}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feature list */}
      <Card className="border-cream-200">
        <div className="px-4 py-3 border-b border-cream-100 bg-cream-50/40 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm font-semibold text-ink-warm-900">Features</p>
          {/* [2026-06-12] Status filter tabs in the detail view. Counts
              come from this spec's rollup, not the whole tracker. */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-md border border-cream-200">
            {([
              { key: 'all',      label: 'All',      count: spec.rollup.total,     color: 'text-ink-warm-900' },
              { key: 'working',  label: 'Working',  count: spec.rollup.working,   color: 'text-emerald-700' },
              { key: 'untested', label: 'Untested', count: spec.rollup.untested,  color: 'text-ink-warm-600' },
              { key: 'issues',   label: 'Issues',   count: spec.rollup.issues,    color: 'text-amber-700' },
              { key: 'broken',   label: 'Broken',   count: spec.rollup.broken,    color: 'text-rose-700' },
            ] as const).map(t => {
              const active = statusFilter === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setStatusFilter(t.key)}
                  className={`text-xs px-2.5 py-1 rounded transition-colors ${
                    active
                      ? 'bg-cream-100 shadow-sm font-medium ' + t.color
                      : 'text-ink-warm-600 hover:text-ink-warm-900'
                  }`}
                >
                  {t.label}
                  <span className={`ml-1.5 tabular-nums ${active ? 'opacity-80' : 'opacity-60'}`}>
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <CardContent className="p-0">
          {spec.features.length === 0 ? (
            <p className="p-6 text-center text-xs text-ink-warm-500 italic">No features yet.</p>
          ) : (() => {
            const visible = statusFilter === 'all'
              ? spec.features
              : spec.features.filter(f => f.test_status === statusFilter);
            if (visible.length === 0) {
              return <p className="p-6 text-center text-xs text-ink-warm-500 italic">No features in this status.</p>;
            }
            return (
            <ul className="divide-y divide-cream-100">
              {visible.map(feature => (
                <FeatureRow
                  key={feature.id}
                  feature={feature}
                  pickerOptions={pickerOptions}
                  onMarkWorking={() => setTestStatus(feature, 'working')}
                  onReport={() => setReportDialogFor(feature)}
                  onShowHistory={() => setHistoryFor(feature)}
                  onUpdateNotes={async (notes) => {
                    try {
                      await service.updateFeature(feature.id, { notes });
                      await refresh();
                    } catch (err: any) {
                      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
                    }
                  }}
                  onUpdateBuildStatus={async (s) => {
                    try {
                      await service.updateFeature(feature.id, { build_status: s });
                      await refresh();
                    } catch (err: any) {
                      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
                    }
                  }}
                  onDelete={() => setDeleteFeatureTarget(feature)}
                />
              ))}
            </ul>
            );
          })()}
        </CardContent>
      </Card>

      {/* Report dialog */}
      {reportDialogFor && (
        <ReportDialog
          feature={reportDialogFor}
          onClose={() => setReportDialogFor(null)}
          onSubmit={handleReportSubmit}
        />
      )}

      {/* History dialog */}
      {historyFor && (
        <HistoryDialog
          feature={historyFor}
          service={service}
          onClose={() => setHistoryFor(null)}
        />
      )}

      {/* Add Feature dialog — replaces window.prompt with the project's
          standard Dialog primitive so users get focus management,
          Esc-to-close, and v11 visual consistency. */}
      <Dialog open={addFeatureOpen} onOpenChange={(o) => { if (!o && !creatingFeature) setAddFeatureOpen(false); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-brand" />
              Add feature
            </DialogTitle>
            <DialogDescription>
              Add a feature to <strong>{spec.name}</strong>. It will start as Not started · Untested.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="new-feature-name">Name <RequiredAsterisk /></Label>
              <Input
                id="new-feature-name"
                value={newFeatureName}
                onChange={(e) => setNewFeatureName(e.target.value)}
                placeholder="e.g. Audit log popover"
                className="focus-brand"
                autoFocus
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-feature-desc">Description</Label>
              <Textarea
                id="new-feature-desc"
                value={newFeatureDesc}
                onChange={(e) => setNewFeatureDesc(e.target.value)}
                placeholder="1-2 sentence explanation. Cite the spec section if numbered."
                className="focus-brand"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setAddFeatureOpen(false)} disabled={creatingFeature}>
              Cancel
            </Button>
            <Button
              variant="brand"
              onClick={async () => {
                if (!newFeatureName.trim()) return;
                setCreatingFeature(true);
                try {
                  await service.createFeature({
                    spec_id: spec.id,
                    name: newFeatureName.trim(),
                    description: newFeatureDesc.trim() || undefined,
                    sort_order: spec.features.length,
                    actorId: currentUserId,
                  });
                  setAddFeatureOpen(false);
                  await refresh();
                } catch (err: any) {
                  toast({ title: 'Add failed', description: err?.message, variant: 'destructive' });
                } finally {
                  setCreatingFeature(false);
                }
              }}
              disabled={!newFeatureName.trim() || creatingFeature}
            >
              {creatingFeature ? 'Adding…' : 'Add feature'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Feature confirm — replaces window.confirm with a
          proper destructive-action confirmation per CLAUDE.md
          conventions. */}
      <Dialog open={!!deleteFeatureTarget} onOpenChange={(o) => { if (!o && !deletingFeature) setDeleteFeatureTarget(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-rose-600" />
              Delete feature?
            </DialogTitle>
            <DialogDescription className="pt-2">
              <strong>{deleteFeatureTarget?.name}</strong> will be removed permanently, including its test history and any sub-features.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setDeleteFeatureTarget(null)} disabled={deletingFeature}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!deleteFeatureTarget) return;
                setDeletingFeature(true);
                try {
                  await service.deleteFeature(deleteFeatureTarget.id);
                  setDeleteFeatureTarget(null);
                  await refresh();
                } catch (err: any) {
                  toast({ title: 'Delete failed', description: err?.message, variant: 'destructive' });
                } finally {
                  setDeletingFeature(false);
                }
              }}
              disabled={deletingFeature}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              {deletingFeature ? 'Deleting…' : 'Delete feature'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Feature row ───────────────────────────────────────────────────

function FeatureRow({
  feature,
  onMarkWorking, onReport, onShowHistory, onUpdateNotes, onUpdateBuildStatus, onDelete,
  pickerOptions,
}: {
  feature: SpecFeature & { children?: SpecFeature[] };
  onMarkWorking: () => void;
  onReport: () => void;
  onShowHistory: () => void;
  onUpdateNotes: (notes: string) => void;
  onUpdateBuildStatus: (s: BuildStatus) => void;
  onDelete: () => void;
  pickerOptions: Record<string, Array<{ id: string; name: string }>>;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState(feature.notes || '');
  const cfg = TEST_STATUS_CONFIG[feature.test_status];

  return (
    <li className="px-4 py-3 hover:bg-cream-50/30">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="text-sm font-medium text-ink-warm-900 truncate">{feature.name}</p>
            <StatusBadge tone={cfg.tone} size="sm">
              <span className="inline-flex items-center gap-1">{cfg.icon}{cfg.label}</span>
            </StatusBadge>
            <span className="text-[10px] text-ink-warm-500">{BUILD_STATUS_LABEL[feature.build_status]}</span>
          </div>
          {feature.description && (
            <p className="text-[11px] text-ink-warm-500 mb-1">{feature.description}</p>
          )}
          {feature.test_reference && (
            <TestReferenceChip reference={feature.test_reference} pickerOptions={pickerOptions} />
          )}
          {feature.test_instructions && (
            <TestInstructionsBlock instructions={feature.test_instructions} />
          )}
          {feature.notes && !notesOpen && (
            <p className="text-[11px] text-ink-warm-600 italic">📝 {feature.notes}</p>
          )}
          {feature.last_tested_at && (
            <p className="text-[10px] text-ink-warm-400 mt-1">
              Last tested {new Date(feature.last_tested_at).toLocaleString()}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 flex-wrap shrink-0">
          <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-700 hover:bg-emerald-50" onClick={onMarkWorking}>
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Working
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-rose-600 hover:bg-rose-50" onClick={onReport}>
            <AlertTriangle className="h-3 w-3 mr-1" />
            Report issue
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-ink-warm-400 hover:text-brand" onClick={() => { setNotesOpen(!notesOpen); setNotesDraft(feature.notes || ''); }} title="Notes">
            <Edit2 className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-ink-warm-400 hover:text-brand" onClick={onShowHistory} title="Test history">
            <History className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-ink-warm-400 hover:text-rose-600" onClick={onDelete} title="Delete feature">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {notesOpen && (
        <div className="mt-2 flex items-start gap-2">
          <Textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="Notes (e.g., 'Works on Venice; not yet tested on Altura')"
            className="focus-brand text-xs min-h-[60px]"
          />
          <div className="flex flex-col gap-1">
            <Button
              size="sm"
              variant="brand"
              className="h-7 text-xs"
              onClick={() => {
                onUpdateNotes(notesDraft);
                setNotesOpen(false);
              }}
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setNotesOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Sub-features */}
      {feature.children && feature.children.length > 0 && (
        <ul className="mt-2 ml-4 border-l-2 border-cream-200 pl-3 space-y-1">
          {feature.children.map(child => (
            <li key={child.id} className="text-xs text-ink-warm-600 flex items-center gap-2">
              <span>{child.name}</span>
              <StatusBadge tone={TEST_STATUS_CONFIG[child.test_status].tone} size="sm">
                {TEST_STATUS_CONFIG[child.test_status].label}
              </StatusBadge>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// ─── Report dialog ────────────────────────────────────────────────

function ReportDialog({
  feature, onClose, onSubmit,
}: {
  feature: SpecFeature;
  onClose: () => void;
  onSubmit: (feature: SpecFeature, status: 'issues' | 'broken', notes: string, fileBacklog: boolean) => Promise<void>;
}) {
  const [status, setStatus] = useState<'issues' | 'broken'>('broken');
  const [notes, setNotes] = useState('');
  const [fileBacklog, setFileBacklog] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-500" />
            Report issue
          </DialogTitle>
          <DialogDescription>
            Mark <strong>{feature.name}</strong> as having issues or broken.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid gap-1.5">
            <Label className="text-xs">Severity</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as 'issues' | 'broken')}>
              <SelectTrigger className="focus-brand">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="issues">⚠️ Issues — works mostly, edge-case problems</SelectItem>
                <SelectItem value="broken">🛑 Broken — doesn't work as intended</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">What's wrong?</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe what's not working. Steps to reproduce help."
              className="focus-brand"
              rows={4}
            />
          </div>
          <label className="flex items-start gap-2 p-2 rounded-md bg-cream-50 cursor-pointer">
            <input
              type="checkbox"
              checked={fileBacklog}
              onChange={(e) => setFileBacklog(e.target.checked)}
              className="mt-0.5"
            />
            <div className="text-xs">
              <p className="font-medium text-ink-warm-900">Also file a backlog item</p>
              <p className="text-[11px] text-ink-warm-500">
                Creates a new bug in the Backlog tab linked to this feature so it doesn't get lost.
              </p>
            </div>
          </label>
        </div>
        <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={async () => {
              setSubmitting(true);
              await onSubmit(feature, status, notes, fileBacklog);
              setSubmitting(false);
            }}
            disabled={submitting}
          >
            <AlertTriangle className="h-3.5 w-3.5 mr-1" />
            {submitting ? 'Submitting…' : status === 'broken' ? 'Mark broken' : 'Mark issues'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── History dialog ───────────────────────────────────────────────

function HistoryDialog({
  feature, service, onClose,
}: {
  feature: SpecFeature;
  service: SpecTrackerService;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<Awaited<ReturnType<typeof service.getTestHistory>> | null>(null);

  useEffect(() => {
    service.getTestHistory(feature.id)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [feature.id, service]);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Test history · {feature.name}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[400px] overflow-y-auto">
          {history === null ? (
            <Skeleton className="h-32 rounded" />
          ) : history.length === 0 ? (
            <p className="text-xs text-ink-warm-500 italic text-center py-6">No history yet.</p>
          ) : (
            <ul className="divide-y divide-cream-100">
              {history.map(row => {
                const cfg = TEST_STATUS_CONFIG[row.new_status as TestStatus];
                return (
                  <li key={row.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <StatusBadge tone={cfg.tone} size="sm">
                          {cfg.label}
                        </StatusBadge>
                        {row.prev_status && (
                          <span className="text-[10px] text-ink-warm-400">
                            from {row.prev_status}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-ink-warm-400 tabular-nums">
                        {new Date(row.tested_at).toLocaleString()}
                      </span>
                    </div>
                    {row.notes && (
                      <p className="text-xs text-ink-warm-700">{row.notes}</p>
                    )}
                    {row.backlog_item_id && (
                      <p className="text-[10px] text-brand mt-0.5">→ Backlog item filed</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Doc upload dialog ────────────────────────────────────────────

function DocUploadDialog({
  open, onClose, onCreated, currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (specId: string) => void;
  currentUserId: string | null;
}) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);

  async function handleExtract() {
    if (!file) return;
    setExtracting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/specs/extract', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      toast({
        title: 'Spec extracted',
        description: `${json.featureCount} features identified.`,
      });
      onCreated(json.specId);
    } catch (err: any) {
      toast({
        title: 'Extraction failed',
        description: err?.message,
        variant: 'destructive',
      });
    } finally {
      setExtracting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" />
            Upload spec doc
          </DialogTitle>
          <DialogDescription>
            Drop a .docx file — we'll use AI to extract the spec name, features, and sub-features automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <input
            type="file"
            accept=".docx,.md,.txt"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-brand/10 file:text-brand hover:file:bg-brand/20"
          />
          {file && (
            <p className="text-xs text-ink-warm-500 truncate">
              Selected: <span className="font-mono">{file.name}</span> ({Math.round(file.size / 1024)} KB)
            </p>
          )}
          <div className="text-[11px] text-ink-warm-500 bg-cream-50 border border-cream-200 rounded p-2">
            Tip: best results with structured docs that use section headings and bullet lists. The AI will create one feature per Section/heading and sub-features for nested items.
          </div>
        </div>
        <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={onClose} disabled={extracting}>Cancel</Button>
          <Button variant="brand" onClick={handleExtract} disabled={!file || extracting}>
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            {extracting ? 'Extracting…' : 'Extract features'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * "How to validate this" collapsible block. Sits under the
 * test_reference chip. Default collapsed so the feature list stays
 * scannable; expand for the step-by-step.
 *
 * Renders newlines as separate paragraphs so SQL inserts can use
 * plain `\n` line breaks. No Markdown parsing — keep it boring.
 */
function TestInstructionsBlock({ instructions }: { instructions: string }) {
  const [open, setOpen] = useState(false);
  const lines = instructions.split('\n').map(l => l.trim()).filter(Boolean);
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(prev => !prev); }}
        className="inline-flex items-center gap-1 text-[10px] text-ink-warm-500 hover:text-brand transition-colors"
      >
        <ChevronDown className={`h-2.5 w-2.5 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`} />
        <span>How to test ({lines.length} step{lines.length === 1 ? '' : 's'})</span>
      </button>
      {open && (
        <ul className="mt-1.5 ml-3 space-y-1 border-l-2 border-brand/20 pl-2.5">
          {lines.map((line, i) => (
            <li key={i} className="text-[11px] leading-snug text-ink-warm-700">
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * "Where to test this" chip on each feature row. Four render modes:
 *
 *   1. `TABLE: <table_name>` → click → Popover with the first 50 rows
 *      of the table, rendered as a compact table. Lets the validator
 *      verify schema features (`pre_ship_gate_log`, `content_submissions`)
 *      without leaving HQ.
 *   2. Reference contains a `{placeholder}` token (e.g. `{campaign_id}`)
 *      → Popover-based picker (searchable list). Pick → resolve token →
 *      open in new tab. Switched from SelectTrigger because that primitive
 *      forces a `w-full` width that overflowed inline.
 *   3. Reference looks like a URL (starts with `/` or `http`)
 *      → clickable link, opens in new tab.
 *   4. Anything else (TG commands, written prose, intentional non-builds)
 *      → plain monospace text with the 📍 icon.
 */
function TestReferenceChip({
  reference,
  pickerOptions,
}: {
  reference: string;
  pickerOptions: Record<string, Array<{ id: string; name: string }>>;
}) {
  const trimmed = reference.trim();

  // ── Mode 1: TABLE preview ──────────────────────────────────────────
  if (trimmed.toUpperCase().startsWith('TABLE:')) {
    const tableName = trimmed.slice(6).trim();
    return <TablePreviewChip tableName={tableName} />;
  }

  // ── Mode 2: {placeholder} → searchable picker ──────────────────────
  const placeholderMatch = trimmed.match(/\{(\w+)\}/);
  if (placeholderMatch) {
    const placeholder = placeholderMatch[1];
    const options = pickerOptions[placeholder] || [];
    const label = placeholder.replace(/_id$/, '').replace(/_/g, ' ');
    return <PlaceholderPickerChip template={trimmed} placeholder={placeholder} options={options} label={label} />;
  }

  // ── Mode 3: plain URL ──────────────────────────────────────────────
  const isUrl = trimmed.startsWith('/') || trimmed.startsWith('http://') || trimmed.startsWith('https://');
  if (isUrl) {
    return (
      <a
        href={trimmed}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-brand-light text-brand border border-brand/20 font-medium hover:bg-brand/15 transition-colors mb-1 max-w-full"
        title="Open where to test this feature"
        onClick={(e) => e.stopPropagation()}
      >
        <MapPin className="h-2.5 w-2.5 flex-shrink-0" />
        <span className="font-mono truncate">{trimmed}</span>
        <ExternalLink className="h-2.5 w-2.5 opacity-60 flex-shrink-0" />
      </a>
    );
  }

  // ── Mode 4: plain text ─────────────────────────────────────────────
  return (
    <p className="inline-flex items-center gap-1 text-[10px] text-ink-warm-600 mb-1 max-w-full">
      <MapPin className="h-2.5 w-2.5 text-brand flex-shrink-0" />
      <span className="font-mono break-all">{trimmed}</span>
    </p>
  );
}

/**
 * Popover picker for `{placeholder}` references. Search input filters the
 * list; clicking an option resolves the URL and opens it in a new tab.
 *
 * Why a Popover instead of Select: SelectTrigger is a w-full button by
 * default + forces a chevron, which overflowed the inline chip slot.
 * Popover lets us drive the trigger size from a plain button.
 */
function PlaceholderPickerChip({
  template,
  placeholder,
  options,
  label,
}: {
  template: string;
  placeholder: string;
  options: Array<{ id: string; name: string }>;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = search
    ? options.filter(o => o.name.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-brand-light text-brand border border-brand/20 font-medium hover:bg-brand/15 transition-colors mb-1 max-w-full"
        >
          <MapPin className="h-2.5 w-2.5 flex-shrink-0" />
          <span className="font-mono truncate">{template}</span>
          <span className="opacity-60 flex-shrink-0">· pick {label}</span>
          <ChevronDown className="h-2.5 w-2.5 opacity-60 flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="p-2 border-b border-cream-100">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${label}…`}
            className="h-7 text-xs focus-brand"
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {options.length === 0 ? (
            <p className="px-3 py-3 text-xs text-ink-warm-500 italic">No options loaded yet.</p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-3 text-xs text-ink-warm-500 italic">No matches.</p>
          ) : (
            filtered.map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  const resolved = template.replace(`{${placeholder}}`, opt.id);
                  setOpen(false);
                  window.open(resolved, '_blank', 'noopener,noreferrer');
                }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-cream-100 transition-colors text-ink-warm-900"
              >
                {opt.name}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Popover preview for `TABLE: <name>` references. Fetches up to 50 rows
 * lazily on first open and renders a compact column-by-row table so the
 * validator can confirm schema features actually contain data.
 *
 * Uses the regular supabase client (not service-role) — RLS applies.
 * Andy is super_admin so the policies don't block him; other validators
 * see only what their role lets them.
 */
function TablePreviewChip({ tableName }: { tableName: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadRows() {
    if (rows !== null || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: e } = await (supabase as any)
        .from(tableName)
        .select('*')
        .limit(50);
      if (e) {
        setError(e.message);
      } else {
        setRows(data || []);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) loadRows(); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-brand-light text-brand border border-brand/20 font-medium hover:bg-brand/15 transition-colors mb-1 max-w-full"
        >
          <Database className="h-2.5 w-2.5 flex-shrink-0" />
          <span className="font-mono truncate">{tableName}</span>
          <span className="opacity-60 flex-shrink-0">· preview</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[640px] max-w-[90vw] p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="px-3 py-2 border-b border-cream-100 flex items-center justify-between">
          <p className="text-xs font-semibold text-ink-warm-900">
            <Database className="h-3 w-3 inline mr-1 text-brand" />
            <span className="font-mono">{tableName}</span>
            {rows && <span className="ml-2 text-ink-warm-500 font-normal">· {rows.length} {rows.length === 1 ? 'row' : 'rows'}</span>}
          </p>
          <span className="text-[10px] text-ink-warm-500">first 50</span>
        </div>
        <div className="max-h-[400px] overflow-auto">
          {loading ? (
            <div className="px-3 py-6 text-center text-xs text-ink-warm-500">
              <Loader2 className="h-3 w-3 inline animate-spin mr-1" />
              Loading…
            </div>
          ) : error ? (
            <p className="px-3 py-3 text-xs text-rose-600 italic font-mono">Error: {error}</p>
          ) : !rows || rows.length === 0 ? (
            <p className="px-3 py-3 text-xs text-ink-warm-500 italic">No rows.</p>
          ) : (
            <table className="text-[10px] w-full">
              <thead className="bg-cream-50 sticky top-0">
                <tr>
                  {Object.keys(rows[0]).map(k => (
                    <th key={k} className="text-left px-2 py-1 font-mono text-ink-warm-600 border-b border-cream-100 whitespace-nowrap">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-cream-50/40 border-b border-cream-50">
                    {Object.keys(rows[0]).map(k => (
                      <td key={k} className="px-2 py-1 align-top font-mono text-ink-warm-900 whitespace-nowrap max-w-[160px] truncate" title={String(r[k] ?? '')}>
                        {formatPreviewCell(r[k])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Render a single DB cell value into the preview table. Compact + null-safe;
 * timestamps shortened to date+HH:MM; objects stringified; booleans labeled.
 */
function formatPreviewCell(v: any): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'boolean') return v ? '✓' : '·';
  if (typeof v === 'object') return JSON.stringify(v);
  const str = String(v);
  // Detect ISO timestamps and shorten to "MMM D HH:MM"
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str)) {
    return new Date(str).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  return str;
}
