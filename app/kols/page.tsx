"use client";
import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, Crown, Save, X, Trash2, Star, Globe, Flag, Menu, Filter, Settings, ChevronLeft, ChevronRight, ChevronDown, MessageSquare, Maximize2, Activity, RefreshCw } from "lucide-react";
import { KolProfileModal } from "@/components/kols/KolProfileModal";
// [2026-06-22] Migrated off lib/kolScoringEngine (legacy May 2026 5-dim
// model) to Jdot's TG Addendum two-score model. Score data now comes
// from /api/kols/scores which runs the new compute server-side against
// the full roster; client-side roster compute went away with it.
import type { ScoreResult, Tier } from "@/lib/kolScoreService";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Tier badge styling for the Score column. Bands are absolute per Doc 2 §5.
// Mirrors the palette used inside ScoreBreakdownTab — keep in sync if
// either side changes.
const TIER_CLASSES: Record<Tier, string> = {
  S: 'bg-amber-100 text-amber-800 border-amber-300',
  A: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  B: 'bg-sky-100 text-sky-800 border-sky-300',
  C: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  D: 'bg-rose-100 text-rose-800 border-rose-300',
};
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { KOLService, MasterKOL } from "@/lib/kolService";
import { FieldOptionsService } from "@/lib/fieldOptionsService";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import KolActivationsDialog from './_components/KolActivationsDialog';

/**
 * Treat an empty / null / missing `creator_type` as the implicit
 * "General" bucket — a KOL without a more specific creator type is a
 * generalist, not an unclassified data hole. Centralizing the coalesce
 * here so display, search, and filter all agree on the same fallback,
 * and we don't need a DB backfill to migrate existing nulls. Brand-new
 * KOLs created via `handleAddNew` save with `['General']` explicitly so
 * the data eventually catches up on its own.
 */
const effectiveCreatorTypes = (raw: string[] | null | undefined): string[] =>
  Array.isArray(raw) && raw.length > 0 ? raw : ['General'];

export default function KOLsPage() {
  const { user, userProfile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [kols, setKols] = useState<MasterKOL[]>([]);
  // HHP Campaign Dashboard Spec § 4.3 (Tier 1) — per-KOL activation
  // aggregates pulled from the kol_activation_participation view.
  // Keyed by kol_id (UUID) → { activations, totalEntries }. Used
  // to render the Activations column + open the detail dialog.
  // Fetched separately from KOLs so a slow snapshot table doesn't
  // delay the main list render.
  const [kolActivations, setKolActivations] = useState<Map<string, { activations: number; totalEntries: number }>>(new Map());
  const [activationsDialogKolId, setActivationsDialogKolId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<{kolId: string, field: string} | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [editingCell, setEditingCell] = useState<{kolId: string, field: keyof MasterKOL} | null>(null);
  const [editingValue, setEditingValue] = useState<any>(null);
  const [selectedKOLs, setSelectedKOLs] = useState<string[]>([]);
  const [bulkEdit, setBulkEdit] = useState<Partial<MasterKOL>>({});
  const [bulkEditDropdown, setBulkEditDropdown] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    name: '',
    link: '',
    platform: [] as string[],
    followers: '',
    followersOperator: '>' as '>' | '<' | '=',
    region: [] as string[],
    creator_type: [] as string[],
    niche: [] as string[],
    content_type: [] as string[],
    deliverables: [] as string[],
    pricing: [] as string[],
    // `rating` filter removed alongside the column (migration 071).
    community: '',
    group_chat: '',
    in_house: [] as string[],
    description: '',
    projects: '',
  });

  // Default visible columns. Updated for the May 2026 KOL overhaul
  // spec — Score becomes the new anchor (currently placeholder until
  // Phase 3 ships kol_channel_snapshots + the formula); rating is gone.
  // Spec list view (in order, all defaults shown):
  //   Name | Platform | Followers | Region | Score | Projects |
  //   Creator Type | Content Type | Pricing | Community Founder |
  //   In-House | Group Chat
  // Other columns (link, latest_cost, description, wallet, telegram,
  // deliverables) stay opt-in via the column visibility menu so power
  // users can still toggle them on without code changes.
  const defaultVisibleColumns = {
    name: true,
    link: true,
    platform: true,
    followers: true,
    region: true,
    score: true,
    projects: true,
    creator_type: true,
    niche: true,
    // content_type + pricing (Pricing Tier) intentionally hidden — the
    // toggle dropdown no longer exposes them either. Cells still render
    // if a saved URL pre-dating this change has them on, but power
    // users can't switch them on going forward.
    content_type: false,
    deliverables: true,
    pricing: false,
    latest_cost: true,
    community: true,
    group_chat: true,
    in_house: true,
    description: true,
    wallet: true,
    telegram: true,
    // HHP Campaign Dashboard Spec § 4.3 (Tier 1) — per-KOL activation
    // participation aggregate column. On by default since activation
    // data is one of the few signals visible without a profile click.
    activations: true,
  };

  // Initialize visible columns from URL params
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const columnsParam = searchParams.get('columns');
    if (columnsParam) {
      try {
        const parsedColumns = JSON.parse(decodeURIComponent(columnsParam));
        return { ...defaultVisibleColumns, ...parsedColumns };
      } catch (e) {
        console.error('Error parsing columns from URL:', e);
      }
    }
    return defaultVisibleColumns;
  });
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [filterSearchTerms, setFilterSearchTerms] = useState<{[key: string]: string}>({});
  const [dynamicFieldOptions, setDynamicFieldOptions] = useState<{ [key: string]: string[] }>({});
  const [addingNewOptionForRow, setAddingNewOptionForRow] = useState<string | null>(null);
  const [isAddingNewOptionBulk, setIsAddingNewOptionBulk] = useState(false);
  const [newOptionValue, setNewOptionValue] = useState('');
  const [newOptionValueBulk, setNewOptionValueBulk] = useState('');
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isSavingNewKOL, setIsSavingNewKOL] = useState(false);
  // Bulk avatar refresh (super_admin only) — sits in the PageHeader actions.
  const [bulkAvatarRunning, setBulkAvatarRunning] = useState(false);
  // 1. Add state for delete dialog (single KOL)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [kolToDelete, setKolToDelete] = useState<string | null>(null);

  // 2. Add state for bulk delete dialog
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  // KOL profile modal — opens via the expand icon in the Name cell.
  // Houses the Deliverables and Call Logs sections per Phase 2 spec.
  const [profileModalKol, setProfileModalKol] = useState<MasterKOL | null>(null);

  // Doc 2 two-score model: blended displayed score + tier per KOL,
  // computed server-side at /api/kols/scores with cross-roster min-max
  // normalization. Score is always present (never "Insufficient data"
  // — Channel-only when activation < 3 deliverables per Doc 2 §5).
  const [scoreMap, setScoreMap] = useState<Map<string, ScoreResult>>(new Map());
  // Bumped by the modal when a deliverable/snapshot edit invalidates
  // the score — triggers a refetch.
  const [scoreRefreshNonce, setScoreRefreshNonce] = useState(0);

  // Sticky scrollbar state
  const [stickyScrollbar, setStickyScrollbar] = useState<{
    visible: boolean;
    width: number;
    scrollWidth: number;
    scrollLeft: number;
    opacity: number;
  } | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const scrollableRef = useRef<HTMLElement | null>(null);

  // Tab state
  const [kolTab, setKolTab] = useState<string>('all');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  // Telegram chat links for KOLs
  const [kolTelegramChats, setKolTelegramChats] = useState<Record<string, { chat_id: string; title: string | null }>>({});

  // Latest cost per KOL (master_kol_id -> { amount, campaignSlug })
  const [latestCostMap, setLatestCostMap] = useState<Map<string, { amount: number; campaignSlug: string }>>(new Map());

  // Auto-derived "Projects Worked Together" per KOL.
  //
  // The May 2026 spec says "Free text tags for v1" — i.e. manual entry.
  // But we already have the truth in campaign_kols, so manual entry would
  // be redundant data the team has to maintain. Skip straight to v2's
  // behavior: derive from the join, present as chips, zero maintenance.
  //
  // master_kols.projects_worked_together stays in the schema as an
  // unused safety hatch — useful later if we ever want manual override
  // tags (e.g. external projects that aren't in campaign_kols).
  //
  // Map shape: kol.id → [{ name, slug }] sorted by most-recent campaign.
  const [projectsMap, setProjectsMap] = useState<Map<string, Array<{ name: string; slug: string | null }>>>(new Map());

  const fieldOptions = KOLService.getFieldOptions();
  const { toast } = useToast();

  // Function to update URL with column visibility
  const updateColumnVisibilityInURL = (newVisibleColumns: typeof defaultVisibleColumns) => {
    const params = new URLSearchParams(searchParams.toString());
    const columnsParam = encodeURIComponent(JSON.stringify(newVisibleColumns));
    params.set('columns', columnsParam);
    router.replace(`/kols?${params.toString()}`, { scroll: false });
  };

  // Function to handle column visibility changes
  const handleColumnVisibilityChange = (columnKey: keyof typeof defaultVisibleColumns, checked: boolean) => {
    const newVisibleColumns = { ...visibleColumns, [columnKey]: checked };
    setVisibleColumns(newVisibleColumns);
    updateColumnVisibilityInURL(newVisibleColumns);
  };

  // Multi-select dropdown component - CUSTOM IMPLEMENTATION (no Popover)
  const MultiSelect = ({
    options,
    selected,
    onSelectedChange,
    placeholder = "Select options...",
    renderOption = (option: string) => option,
    className = "",
    triggerContent = null,
    isOpen = false,
    onOpenChange,
    // HHP Creator Taxonomy Spec — cap creator_type at 2. Generic prop
    // so any other field needing a hard ceiling can opt in. ONLY
    // applies to *assignment* surfaces (inline cell edit, bulk edit,
    // detail modal). Filter surfaces don't pass it because filtering
    // by 5+ types is a legit use case.
    maxSelected,
  }: {
    options: string[];
    selected: string[];
    onSelectedChange: (selected: string[]) => void;
    placeholder?: string;
    renderOption?: (option: string) => React.ReactNode;
    className?: string;
    triggerContent?: React.ReactNode;
    isOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    maxSelected?: number;
  }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    // Trigger rect captured when the dropdown opens — drives the portal's
    // fixed coordinates. Recomputed via useLayoutEffect on scroll/resize so
    // the dropdown follows its trigger if the table scrolls underneath.
    const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
    // 'down' = dropdown below trigger, 'up' = above. Flips when there's
    // not enough room below — keeps the panel fully visible even when the
    // trigger is near the bottom of the viewport.
    const [placement, setPlacement] = useState<'down' | 'up'>('down');

    // Add safety checks
    const safeOptions = Array.isArray(options) ? options : [];
    const safeSelected = Array.isArray(selected) ? selected : [];

    // Filter options based on search term
    const filteredOptions = safeOptions.filter(option =>
      option.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Position the portal-rendered dropdown relative to its trigger.
    // Uses fixed positioning so the dropdown escapes any ancestor with
    // overflow:hidden (e.g. the KOLs table) — the original bug was that
    // the absolute-positioned panel got clipped by the table container.
    useLayoutEffect(() => {
      if (!isOpen) {
        setTriggerRect(null);
        return;
      }
      const recompute = () => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        setTriggerRect(rect);
        // If there's less than 320px below the trigger, flip up.
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        setPlacement(spaceBelow < 320 && spaceAbove > spaceBelow ? 'up' : 'down');
      };
      recompute();
      // Track scroll on any ancestor — the table scrolls independently
      // of the page, and the dropdown needs to follow its trigger.
      window.addEventListener('scroll', recompute, true);
      window.addEventListener('resize', recompute);
      return () => {
        window.removeEventListener('scroll', recompute, true);
        window.removeEventListener('resize', recompute);
      };
    }, [isOpen]);

    try {
      return (
        <>
          <div ref={containerRef} className={`relative ${className}`}>
            {/* Trigger */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                onOpenChange?.(!isOpen);
              }}
              className="cursor-pointer w-full"
            >
              {triggerContent ? (
                <div className="w-full">{triggerContent}</div>
              ) : (
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={isOpen}
                  className="h-auto border-none shadow-none p-1 bg-transparent hover:bg-transparent text-xs font-medium inline-flex items-center"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </Button>
              )}
            </div>
          </div>

          {/* Dropdown rendered via portal so it escapes table overflow:hidden.
              Fixed positioning aligned to the captured trigger rect. */}
          {isOpen && triggerRect && typeof document !== 'undefined' && createPortal(
            <>
              {/* Backdrop — covers entire screen, closes on click */}
              <div
                className="fixed inset-0 z-[9998]"
                onClick={() => onOpenChange?.(false)}
              />
              <div
                className="fixed z-[9999] w-[220px] bg-white border border-cream-200 rounded-md shadow-lg"
                style={{
                  left: triggerRect.left,
                  top: placement === 'down' ? triggerRect.bottom + 4 : undefined,
                  bottom: placement === 'up' ? window.innerHeight - triggerRect.top + 4 : undefined,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center border-b px-3 py-2">
                  <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                  <Input
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="border-0 p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div className="max-h-[300px] overflow-y-auto overscroll-contain">
                  {filteredOptions.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">No options found.</div>
                  ) : (
                    filteredOptions.map((option) => {
                      const isSelected = safeSelected.includes(option);
                      // Cap-aware disabled state — when maxSelected is
                      // set and the user is already at the limit, new
                      // selections (but not deselections) are blocked.
                      const atCap = typeof maxSelected === 'number'
                        && safeSelected.length >= maxSelected;
                      const disabled = atCap && !isSelected;
                      return (
                        <div
                          key={option}
                          className={`relative flex w-full select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none ${
                            disabled
                              ? 'cursor-not-allowed opacity-40'
                              : 'cursor-pointer hover:bg-cream-100'
                          }`}
                          title={disabled ? `Max ${maxSelected} selected — deselect one to swap.` : undefined}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (disabled) return;
                            const newSelected = isSelected
                              ? safeSelected.filter(item => item !== option)
                              : [...safeSelected, option];
                            onSelectedChange(newSelected);
                          }}
                        >
                          <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                            {isSelected && (
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m5 12 5 5L20 7" />
                              </svg>
                            )}
                          </span>
                          <div className="flex items-center space-x-2">
                            {renderOption(option)}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>,
            document.body,
          )}
        </>
      );
    } catch (error) {
      console.error('MultiSelect render error:', error);
      return <div className="text-rose-500">Error rendering multiselect</div>;
    }
  };

  const fetchLatestCosts = async () => {
    try {
      const { data: rawData, error: rawError } = await supabase
        .from('payments')
        .select('amount, payment_date, campaign:campaigns!inner(id, slug), campaign_kol:campaign_kols!inner(master_kol_id)')
        .order('payment_date', { ascending: false });
      if (!rawError && rawData) {
        const map = new Map<string, { amount: number; campaignSlug: string }>();
        for (const row of rawData) {
          const masterKolId = (row.campaign_kol as any)?.master_kol_id;
          const campaign = row.campaign as any;
          if (masterKolId && !map.has(masterKolId)) {
            map.set(masterKolId, {
              amount: row.amount,
              campaignSlug: campaign?.slug || campaign?.id || '',
            });
          }
        }
        setLatestCostMap(map);
      }
    } catch (err) {
      console.error('Error fetching latest costs:', err);
    }
  };

  // Auto-derive Projects from campaign_kols rather than the manual
  // projects_worked_together column. One query, joined to campaigns
  // for the display name + slug. Filtered to non-archived campaigns
  // (we don't want stale projects from campaigns the team has buried).
  // Dedup per KOL — same campaign can only appear once even if there
  // are multiple campaign_kols rows (e.g. KOL re-added after dropout).
  //
  // [2026-06-05] Also skips rows where `campaign_kols.hidden = true`.
  // The Hidden flag is set per-KOL-per-campaign when the team has
  // pulled a KOL out of a project (NDA conflict, swap-out, etc.); in
  // that case the KOL shouldn't appear to have "worked on" that
  // project on their /kols row. If a KOL has multiple campaign_kols
  // rows for the same campaign and ONLY some are hidden, the dedup
  // below keeps the most-recent visible one (because the query is
  // ordered created_at desc, and the hidden row is skipped before
  // it can claim the campaign_id slot in `seen`).
  const fetchProjectsPerKol = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('campaign_kols')
        .select('master_kol_id, hidden, campaign:campaigns!inner(id, name, slug, archived_at, created_at)')
        .order('created_at', { ascending: false });
      if (error || !data) return;

      const map = new Map<string, Array<{ name: string; slug: string | null }>>();
      const seen = new Map<string, Set<string>>(); // kol_id → set of campaign_ids

      for (const row of data as any[]) {
        const kolId: string | null = row.master_kol_id;
        const campaign = row.campaign;
        if (!kolId || !campaign) continue;
        if (campaign.archived_at) continue; // skip archived campaigns
        if (row.hidden === true) continue;  // skip hidden links

        const existing = seen.get(kolId) || new Set<string>();
        if (existing.has(campaign.id)) continue;
        existing.add(campaign.id);
        seen.set(kolId, existing);

        const list = map.get(kolId) || [];
        list.push({ name: campaign.name || '(unnamed)', slug: campaign.slug || null });
        map.set(kolId, list);
      }
      setProjectsMap(map);
    } catch (err) {
      console.error('Error fetching projects per KOL:', err);
    }
  };

  useEffect(() => {
    fetchKOLs();
    // Activation aggregates fire in parallel — not awaited so the
    // table renders as fast as before; column updates when data
    // lands. Soft-fails silently if the view is unreachable.
    fetchKolActivations();
    loadDynamicFieldOptions();
    fetchTelegramChats();
    fetchLatestCosts();
    fetchProjectsPerKol();
  }, []);

  // Score-fetch effect — pulls the full Doc-2 two-score breakdown for
  // every roster KOL from /api/kols/scores. Server computes against
  // the entire master_kols roster (Channel dims need cross-roster
  // min-max normalization, can't score one KOL in isolation), so the
  // batch call is mandatory not an optimization.
  // Doesn't depend on `kols` — the API already fans out to every
  // non-archived KOL; pagination on the client doesn't change which
  // scores we need cached. scoreRefreshNonce is the only invalidator.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/kols/scores', { credentials: 'include' });
        if (!res.ok) throw new Error(`scores fetch ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        const map = new Map<string, ScoreResult>();
        for (const [kolId, score] of Object.entries(json.scores ?? {})) {
          map.set(kolId, score as ScoreResult);
        }
        setScoreMap(map);
      } catch (err) {
        console.error("Failed to fetch KOL scores:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [scoreRefreshNonce]);

  // Debounce search term for performance (300ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadDynamicFieldOptions = async () => {
    try {
      const inHouseOptions = await KOLService.getDynamicFieldOptions('in_house');
      setDynamicFieldOptions(prev => ({
        ...prev,
        in_house: inHouseOptions
      }));
    } catch (error) {
      console.error('Error loading dynamic field options:', error);
    }
  };

  const handleAddNewOption = async (fieldName: string, optionValue: string, isBulk: boolean = false) => {
    try {
      if (!optionValue.trim()) return;
      
      await FieldOptionsService.createFieldOption({
        field_name: fieldName,
        option_value: optionValue.trim(),
        display_order: (dynamicFieldOptions[fieldName]?.length || 0) + 1
      });
      
      // Reload the options
      await loadDynamicFieldOptions();
      
      // Reset the appropriate input
      if (isBulk) {
        setNewOptionValueBulk('');
        setIsAddingNewOptionBulk(false);
      } else {
        setNewOptionValue('');
        setAddingNewOptionForRow(null);
      }
      
      toast({
        title: 'Option added',
        description: `Added "${optionValue}".`,
      });
    } catch (error) {
      console.error('Error adding new option:', error);
      toast({
        title: 'Add failed',
        description: error instanceof Error ? error.message : 'Failed to add new option',
        variant: 'destructive',
      });
    }
  };

  const fetchKOLs = async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedKOLs = await KOLService.getAllKOLs();
      setKols(fetchedKOLs);
    } catch (err) {
      console.error('Error fetching KOLs:', err);
      setError('Failed to load KOLs');
    } finally {
      setLoading(false);
    }
  };

  /**
   * HHP Campaign Dashboard Spec § 4.3 (Tier 1) — load per-KOL
   * activation aggregates. Single query against the
   * kol_activation_participation view → reduced client-side into a
   * Map for O(1) row lookup. Soft-fails to empty Map so the table
   * still renders if the view is unavailable.
   */
  const fetchKolActivations = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('kol_activation_participation')
        .select('kol_id, entries');
      if (error) {
        console.warn('Failed to load KOL activation aggregates:', error.message);
        return;
      }
      const next = new Map<string, { activations: number; totalEntries: number }>();
      for (const row of (data || []) as Array<{ kol_id: string; entries: number }>) {
        const prev = next.get(row.kol_id) || { activations: 0, totalEntries: 0 };
        next.set(row.kol_id, {
          activations: prev.activations + 1,
          totalEntries: prev.totalEntries + (row.entries || 0),
        });
      }
      setKolActivations(next);
    } catch (err) {
      console.warn('KOL activation aggregates fetch failed:', err);
    }
  };

  const fetchTelegramChats = async () => {
    try {
      const { data, error } = await supabase
        .from('telegram_chats')
        .select('chat_id, title, master_kol_id')
        .not('master_kol_id', 'is', null);

      if (error) throw error;

      // Build a map of kol_id -> chat info
      const chatsMap: Record<string, { chat_id: string; title: string | null }> = {};
      data?.forEach(chat => {
        if (chat.master_kol_id) {
          chatsMap[chat.master_kol_id] = {
            chat_id: chat.chat_id,
            title: chat.title
          };
        }
      });
      setKolTelegramChats(chatsMap);
    } catch (err) {
      console.error('Error fetching telegram chats:', err);
    }
  };

  // Filter KOLs based on filter state and search term (memoized for performance)
  const filteredKOLs = useMemo(() => {
    return kols.filter(kol => {
      const matchesSearch = !debouncedSearchTerm ||
        kol.name?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        kol.region?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        // Empty creator_type → 'General' (matches search for "general")
        effectiveCreatorTypes(kol.creator_type).some(ct => ct.toLowerCase().includes(debouncedSearchTerm.toLowerCase())) ||
        kol.content_type?.some(ct => ct.toLowerCase().includes(debouncedSearchTerm.toLowerCase())) ||
        kol.deliverables?.some(d => d.toLowerCase().includes(debouncedSearchTerm.toLowerCase())) ||
        kol.platform?.some(p => p.toLowerCase().includes(debouncedSearchTerm.toLowerCase())) ||
        kol.description?.toLowerCase().includes(debouncedSearchTerm.toLowerCase());

      const matchesFilters = (
        (!filters.name || kol.name?.toLowerCase().includes(filters.name.toLowerCase())) &&
        (!filters.link || kol.link?.toLowerCase().includes(filters.link.toLowerCase())) &&
        (!filters.platform.length || filters.platform.some(p => kol.platform?.includes(p))) &&
        (!filters.followers || (() => {
          const followers = parseInt(kol.followers?.toString() || '0');
          const filterVal = parseInt(filters.followers);
          if (filters.followersOperator === '>') return followers > filterVal;
          if (filters.followersOperator === '<') return followers < filterVal;
          if (filters.followersOperator === '=') return followers === filterVal;
          return true;
        })()) &&
        (!filters.region.length || filters.region.some(r => kol.region === r)) &&
        // Empty creator_type matches the "General" filter chip so the
        // filter bucket actually contains every implicitly-General KOL.
        (!filters.creator_type.length || filters.creator_type.some(ct => effectiveCreatorTypes(kol.creator_type).includes(ct))) &&
        (!filters.content_type.length || filters.content_type.some(ct => kol.content_type?.includes(ct))) &&
        (!filters.deliverables.length || filters.deliverables.some(d => kol.deliverables?.includes(d))) &&
        (!filters.pricing.length || filters.pricing.some(p => kol.pricing === p)) &&
        // rating filter removed alongside the column (migration 071).
        (!filters.community || kol.community === (filters.community === 'yes')) &&
        (!filters.group_chat || kol.group_chat === (filters.group_chat === 'yes')) &&
        (!filters.in_house.length || filters.in_house.some(ih => kol.in_house === ih)) &&
        (!filters.description || kol.description?.toLowerCase().includes(filters.description.toLowerCase())) &&
        // Substring match across the derived project list (campaign
        // names from campaign_kols join). Falls through cleanly when
        // projectsMap hasn't loaded yet — empty list = no match if
        // user has typed a filter, but page won't crash.
        (!filters.projects || (projectsMap.get(kol.id) || []).some(p =>
          p.name.toLowerCase().includes(filters.projects.toLowerCase())))
      );

      return matchesSearch && matchesFilters;
    });
  }, [kols, debouncedSearchTerm, filters, projectsMap]);

  const STALE_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000;

  // Apply tab filter on top of filteredKOLs
  const tabbedKOLs = useMemo(() => {
    if (kolTab === 'need_update') {
      return filteredKOLs.filter(kol => {
        if (!kol.updated_at) return true;
        return (Date.now() - new Date(kol.updated_at).getTime()) > STALE_THRESHOLD_MS;
      });
    }
    return filteredKOLs;
  }, [filteredKOLs, kolTab]);

  // Count for need update tab badge
  const needUpdateCount = useMemo(() => {
    return filteredKOLs.filter(kol => {
      if (!kol.updated_at) return true;
      return (Date.now() - new Date(kol.updated_at).getTime()) > STALE_THRESHOLD_MS;
    }).length;
  }, [filteredKOLs]);

  // Reset to page 1 when filters, search, or tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, filters, kolTab]);

  // Sticky scrollbar effect
  useEffect(() => {
    // Function to find the actual scrollable element
    const findScrollableElement = (container: HTMLElement): HTMLElement | null => {
      if (container.scrollWidth > container.clientWidth) {
        return container;
      }
      const allElements = container.querySelectorAll('*');
      for (const el of Array.from(allElements)) {
        const htmlEl = el as HTMLElement;
        if (htmlEl.scrollWidth > htmlEl.clientWidth) {
          return htmlEl;
        }
      }
      return null;
    };

    const updateStickyScrollbar = () => {
      if (!tableContainerRef.current) {
        setStickyScrollbar(null);
        return;
      }

      const container = tableContainerRef.current;
      const scrollableElement = findScrollableElement(container);

      if (scrollableElement) {
        scrollableRef.current = scrollableElement;

        const rect = container.getBoundingClientRect();
        const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;

        if (isInViewport) {
          // Calculate opacity based on distance to bottom of page
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          const windowHeight = window.innerHeight;
          const documentHeight = document.documentElement.scrollHeight;
          const distanceFromBottom = documentHeight - (scrollTop + windowHeight);

          // Check if page has scrollable content
          const hasVerticalScroll = documentHeight > windowHeight + 10;

          const fadeThreshold = 100;
          let opacity = 1;

          if (hasVerticalScroll) {
            if (distanceFromBottom < fadeThreshold && distanceFromBottom > 0) {
              opacity = distanceFromBottom / fadeThreshold;
            } else if (distanceFromBottom <= 0) {
              opacity = 0;
            }
          }

          setStickyScrollbar({
            visible: true,
            width: scrollableElement.clientWidth,
            scrollWidth: scrollableElement.scrollWidth,
            scrollLeft: scrollableElement.scrollLeft,
            opacity: opacity
          });
          return;
        }
      }

      setStickyScrollbar(null);
    };

    const handleScroll = () => {
      updateStickyScrollbar();
    };

    // Attach listeners
    const container = tableContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll, true);
    }
    window.addEventListener('scroll', updateStickyScrollbar);
    window.addEventListener('resize', updateStickyScrollbar);

    // Initial check with delay to ensure table is rendered
    const timer1 = setTimeout(updateStickyScrollbar, 100);
    const timer2 = setTimeout(updateStickyScrollbar, 500);

    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll, true);
      }
      window.removeEventListener('scroll', updateStickyScrollbar);
      window.removeEventListener('resize', updateStickyScrollbar);
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [filteredKOLs, currentPage, visibleColumns]);

  // Pagination calculations (memoized for performance)
  const paginationData = useMemo(() => {
    const totalItems = tabbedKOLs.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const paginatedKOLs = tabbedKOLs.slice(startIndex, endIndex);

    return {
      totalItems,
      totalPages,
      startIndex,
      endIndex,
      paginatedKOLs,
      currentPage,
    };
  }, [tabbedKOLs, currentPage, ITEMS_PER_PAGE]);

  const handleCellDoubleClick = (kolId: string, field: keyof MasterKOL, currentValue: any) => {
    setEditingCell({ kolId, field });
    setEditingValue(currentValue);
  };

  const handleCellSave = async () => {
    if (!editingCell) return;
    try {
      const kolToUpdate = kols.find(k => k.id === editingCell.kolId);
      if (!kolToUpdate) return;

      // Check for duplicate link
      if (editingCell.field === 'link' && editingValue && editingValue.trim()) {
        const duplicateKOL = kols.find(k =>
          k.id !== editingCell.kolId &&
          k.link &&
          k.link.trim().toLowerCase() === editingValue.trim().toLowerCase()
        );

        if (duplicateKOL) {
          toast({
            title: 'Duplicate link',
            description: `Link already used by "${duplicateKOL.name || 'another KOL'}".`,
            variant: 'destructive',
            duration: 5000,
          });
          setEditingCell(null);
          setEditingValue(null);
          return;
        }
      }

      const updatedKOL = { ...kolToUpdate, [editingCell.field]: editingValue };
      const kolId = editingCell.kolId;
      setKols(prevKols =>
        prevKols.map(k => k.id === kolId ? updatedKOL : k)
      );
      setEditingCell(null);
      setEditingValue(null);
      try {
        await KOLService.updateKOL(updatedKOL);
      } catch (error) {
        console.error('Error updating KOL:', error);
        setKols(prevKols =>
          prevKols.map(k => k.id === kolId ? kolToUpdate : k)
        );
      }
    } catch (err) {
      console.error('Error updating KOL:', err);
      setEditingCell(null);
      setEditingValue(null);
    }
  };

  const handleCellCancel = () => {
    setEditingCell(null);
    setEditingValue(null);
  };

  // 3. Update handleDelete to open dialog instead of window.confirm
  const handleDelete = (kolId: string) => {
    setKolToDelete(kolId);
    setShowDeleteDialog(true);
  };

  const handleAddNew = async () => {
    try {
      setIsSavingNewKOL(true);
      const emptyKOL = {
        name: '',
        link: '',
        platform: [],
        followers: undefined, // fix linter error
        region: null,
        community: false,
        community_link: null,
        content_type: [],
        niche: [],
        // [2026-06-08] New KOLs default to ['General'] creator_type —
        // the catch-all bucket. Without this, new rows landed with an
        // empty array and silently fell through every creator-type
        // filter. The display-side coalesce in effectiveCreatorTypes
        // handles existing empties; this stops creating new ones.
        creator_type: ['General'],
        pricing: null,
        group_chat: false,
        in_house: null,
        description: '',
        projects_worked_together: [],
      };
      const createdKOL = await KOLService.createKOL(emptyKOL);
      setKols(prevKols => [createdKOL, ...prevKols]); // add to top
      setEditingCell({ kolId: createdKOL.id, field: 'name' });
      setEditingValue('');
    } catch (err) {
      console.error('Error creating KOL:', err);
    } finally {
      setIsSavingNewKOL(false);
    }
  };

  const getRegionIcon = (region: string) => {
    const regionMap: { [key: string]: { flag: string; icon: any } } = {
      'Vietnam': { flag: '🇻🇳', icon: Flag },
      'Turkey': { flag: '🇹🇷', icon: Flag },
      'SEA': { flag: '🌏', icon: Globe },
      'Philippines': { flag: '🇵🇭', icon: Flag },
      'Korea': { flag: '🇰🇷', icon: Flag },
      'Global': { flag: '🌍', icon: Globe },
      'China': { flag: '🇨🇳', icon: Flag },
      'Brazil': { flag: '🇧🇷', icon: Flag }
    };
    return regionMap[region] || { flag: '🏳️', icon: Flag };
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'X':
        return <span className="font-bold text-black text-sm">𝕏</span>;
      case 'Telegram':
        return (
          <svg className="h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.13-.31-1.09-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
          </svg>
        );
      case 'YouTube':
        return (
          <svg className="h-4 w-4 text-rose-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
        );
      case 'Facebook':
        return (
          <svg className="h-4 w-4 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
        );
      case 'TikTok':
        return (
          <svg className="h-4 w-4 text-black" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
          </svg>
        );
      default:
        return null;
    }
  };

  const getNewContentTypeColor = (contentType: string) => {
    const colorMap: { [key: string]: string } = {
      'Meme': 'bg-yellow-100 text-yellow-800',
      'News': 'bg-blue-100 text-blue-800',
      'Trading': 'bg-emerald-100 text-emerald-800',
      'Deep Dive': 'bg-purple-100 text-purple-800',
      'Meme/Cultural Narrative': 'bg-pink-100 text-pink-800',
      'Drama Queen': 'bg-rose-100 text-rose-800',
      'Sceptics': 'bg-orange-100 text-orange-800',
      'Technical Educator': 'bg-indigo-100 text-indigo-800',
      'Bridge Builders': 'bg-teal-100 text-teal-800',
      'Visionaries': 'bg-cyan-100 text-cyan-800'
    };
    return colorMap[contentType] || 'bg-cream-100 text-ink-warm-700';
  };

  const getNicheColor = (niche: string) => {
    const colorMap: { [key: string]: string } = {
      // ─── Spec niches (HHP Creator Taxonomy Spec) ───
      'AI':          'bg-slate-100 text-slate-800',
      'DeFi':        'bg-emerald-100 text-emerald-800',
      'L1/L2':       'bg-indigo-100 text-indigo-800',
      'Trading':     'bg-cyan-100 text-cyan-800',
      'Airdrop':     'bg-lime-100 text-lime-800',
      'NFT/Gaming':  'bg-violet-100 text-violet-800',
      'RWA':         'bg-amber-100 text-amber-800',
      'Regulation':  'bg-zinc-100 text-zinc-800',
      'Macro':       'bg-blue-100 text-blue-800',
      'Meme/Degen':  'bg-pink-100 text-pink-800',
      'Base':        'bg-sky-100 text-sky-800',
      'Solana':      'bg-purple-100 text-purple-800',
      'Ethereum':    'bg-teal-100 text-teal-800',
      // ─── Legacy values (kept for backward-compat) ───
      'General':  'bg-cream-100 text-ink-warm-700',
      'Gaming':   'bg-indigo-100 text-indigo-800',
      'Crypto':   'bg-emerald-100 text-emerald-800',
      'Memecoin': 'bg-pink-100 text-pink-800',
      'NFT':      'bg-violet-100 text-violet-800',
      'Research': 'bg-amber-100 text-amber-800',
      'Art':      'bg-rose-100 text-rose-800',
    };
    return colorMap[niche] || 'bg-cream-100 text-ink-warm-700';
  };

  const getPricingColor = (pricing: string) => {
    const colorMap: { [key: string]: string } = {
      '<$200': 'bg-emerald-100 text-emerald-800',
      '$200-500': 'bg-yellow-100 text-yellow-800',
      '$500-1K': 'bg-orange-100 text-orange-800',
      '$1K-2K': 'bg-rose-100 text-rose-800',
      '$2K-3K': 'bg-purple-100 text-purple-800',
      '>$3K': 'bg-pink-100 text-pink-800'
    };
    return colorMap[pricing] || 'bg-blue-100 text-blue-800';
  };

  const getTierColor = (tier: string) => {
    const colorMap: { [key: string]: string } = {
      'Tier S': 'bg-purple-100 text-purple-800',
      'Tier 1': 'bg-rose-100 text-rose-800',
      'Tier 2': 'bg-orange-100 text-orange-800',
      'Tier 3': 'bg-yellow-100 text-yellow-800',
      'Tier 4': 'bg-emerald-100 text-emerald-800'
    };
    return colorMap[tier] || 'bg-cream-100 text-ink-warm-700';
  };

  const getCreatorTypeColor = (creatorType: string) => {
    const colorMap: { [key: string]: string } = {
      // ─── Spec types (8, HHP Creator Taxonomy Spec) ───
      'Native':    'bg-orange-100 text-orange-800',
      'Scout':     'bg-sky-100 text-sky-800',
      'Tracker':   'bg-slate-100 text-slate-800',
      'Analyst':   'bg-cyan-100 text-cyan-800',
      'Educator':  'bg-blue-100 text-blue-800',
      'Visionary': 'bg-indigo-100 text-indigo-800',
      'Onboarder': 'bg-teal-100 text-teal-800',
      'Curator':   'bg-lime-100 text-lime-800',
      // ─── Legacy values (kept for backward-compat) ───
      'Native (Meme/Culture)': 'bg-purple-100 text-purple-800',
      'Drama-Forward':  'bg-rose-100 text-rose-800',
      'Skeptic':        'bg-orange-100 text-orange-800',
      'Bridge Builder': 'bg-emerald-100 text-emerald-800',
      'General':   'bg-cream-100 text-ink-warm-700',
      'Gaming':    'bg-pink-100 text-pink-800',
      'Crypto':    'bg-yellow-100 text-yellow-800',
      'Memecoin':  'bg-orange-100 text-orange-800',
      'NFT':       'bg-purple-100 text-purple-800',
      'Trading':   'bg-emerald-100 text-emerald-800',
      'AI':        'bg-blue-100 text-blue-800',
      'Research':  'bg-indigo-100 text-indigo-800',
      'Airdrop':   'bg-teal-100 text-teal-800',
      'Art':       'bg-pink-100 text-pink-800',
    };
    return colorMap[creatorType] || 'bg-cream-100 text-ink-warm-700';
  };

  const getInHouseColor = (inHouse: string) => {
    const colorMap: { [key: string]: string } = {
      'Yes': 'bg-emerald-100 text-emerald-800',
      'No': 'bg-rose-100 text-rose-800',
      'Contractor': 'bg-blue-100 text-blue-800',
      'Freelancer': 'bg-purple-100 text-purple-800'
    };
    return colorMap[inHouse] || 'bg-cream-100 text-ink-warm-700';
  };

  const getActiveFilterCount = (filterKey: string) => {
    const filter = filters[filterKey as keyof typeof filters];
    if (Array.isArray(filter)) {
      return filter.length;
    }
    if (typeof filter === 'string' && filter !== '' && filter !== 'all') {
      return 1;
    }
    return 0;
  };

  // KOLTableSkeleton extracted to module scope (audit 2026-05-06):
  // was inline here, re-allocated every render. visibleColumns + the
  // addingNewOptionForRow flag are passed as props since they live in
  // this component's state.

  // Column resize handlers
  // Remove columnWidths, isResizing, resizingColumn, handleMouseDown, handleMouseMove, handleMouseUp, ResizeHandle
  // Remove all style={{ width: ... }}, minWidth, maxWidth from TableHead and TableCell
  // Set tableLayout to 'auto' or remove it from <Table>

  // Add resize line component


  const renderEditableCell = (value: any, field: keyof MasterKOL, kolId: string, type: 'text' | 'number' | 'select' | 'multiselect' | 'boolean' = 'text') => {
    const isEditing = editingCell?.kolId === kolId && editingCell?.field === field;
    if (type === 'boolean' || type === 'select' || type === 'multiselect') {
      switch (type) {
        case 'boolean':
          if (field === 'community' || field === 'group_chat') {
            return (
              <Select 
                value={Boolean(value) ? 'yes' : 'no'} 
                onValueChange={async (newValue) => {
                  const boolValue = newValue === 'yes';
                  const kolToUpdate = kols.find(k => k.id === kolId);
                  if (kolToUpdate) {
                    const updatedKOL = { ...kolToUpdate, [field]: boolValue };
                    setKols(prevKols => 
                      prevKols.map(k => k.id === kolId ? updatedKOL : k)
                    );
                    try {
                      await KOLService.updateKOL(updatedKOL);
                    } catch (error) {
                      console.error('Error updating boolean:', error);
                      setKols(prevKols => 
                        prevKols.map(k => k.id === kolId ? kolToUpdate : k)
                      );
                    }
                  }
                }}
              >
                <SelectTrigger 
                  className={`border-none shadow-none bg-transparent w-auto ${
                  value ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  } px-2 py-1 rounded-md text-xs font-medium inline-flex items-center h-auto focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none`}
                  style={{ outline: 'none', boxShadow: 'none' }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            );
          }
          break;
        // 'rating' case removed — column dropped per migration 071.
        case 'select':
          const options = field === 'region' ? (fieldOptions?.regions || []) :
                         field === 'pricing' ? (fieldOptions?.pricingTiers || []) :
                         // 'tier' option removed alongside the column (migration 071).
                         field === 'creator_type' ? (fieldOptions?.creatorTypes || []) :
                         field === 'in_house' ? (dynamicFieldOptions?.in_house || []) : [];
          const getSelectStyling = () => {
            if (field === 'pricing' && value) {
              return `${getPricingColor(value)} px-2 py-1 rounded-md text-xs font-medium inline-flex items-center`;
            }
            // 'tier' branch removed — column dropped per migration 071.
            if (field === 'creator_type' && value) {
              return `${getCreatorTypeColor(value)} px-2 py-1 rounded-md text-xs font-medium inline-flex items-center`;
            }
            if (field === 'in_house' && value) {
              return `px-2 py-1 text-xs font-medium inline-flex items-center`;
            }
            if (field === 'region' && value) {
              return `px-2 py-1 text-xs font-medium inline-flex items-center`;
            }
            return 'px-2 py-1 text-xs font-medium inline-flex items-center';
          };

          // Handle in_house field with "Add New Option" feature
          if (field === 'in_house') {
            return (
              <div className="relative w-full">
                <Select
                  value={value || ''}
                  onValueChange={async (newValue) => {
                    if (newValue === 'ADD_NEW') {
                      setAddingNewOptionForRow(kolId);
                      return;
                    }

                    // Handle "none" as clearing the field
                    const actualValue = newValue === 'none' ? null : newValue;

                    const kolToUpdate = kols.find(k => k.id === kolId);
                    if (kolToUpdate) {
                      const updatedKOL = { ...kolToUpdate, in_house: actualValue };
                      setKols(prevKols =>
                        prevKols.map(k => k.id === kolId ? updatedKOL : k)
                      );
                      try {
                        await KOLService.updateKOL(updatedKOL);
                      } catch (err) {
                        console.error('Error updating KOL:', err);
                        // Revert on error
                        setKols(prevKols =>
                          prevKols.map(k => k.id === kolId ? kolToUpdate : k)
                        );
                      }
                    }
                  }}
                >
                  <SelectTrigger className={`w-full h-8 text-xs border-none shadow-none bg-transparent p-1 ${getSelectStyling()}`}>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-ink-warm-500">
                      None
                    </SelectItem>
                    {dynamicFieldOptions.in_house?.map(option => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                    <SelectItem value="ADD_NEW" className="text-ink-warm-900 font-medium">
                      <Plus className="h-3 w-3 mr-1 inline" />
                      Add New Option
                    </SelectItem>
                  </SelectContent>
                </Select>
                
                {addingNewOptionForRow === kolId && (
                  <div className="absolute top-full left-0 mt-1 p-2 bg-white border border-cream-200 rounded-md shadow-lg z-50 w-64">
                    <div className="flex flex-col gap-2">
                      <Input
                        value={newOptionValue}
                        onChange={(e) => setNewOptionValue(e.target.value)}
                        placeholder="Enter new option"
                        className="focus-brand h-7 text-xs"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleAddNewOption('in_house', newOptionValue, false);
                          } else if (e.key === 'Escape') {
                            setAddingNewOptionForRow(null);
                            setNewOptionValue('');
                          }
                        }}
                      />
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setAddingNewOptionForRow(null);
                            setNewOptionValue('');
                          }}
                          className="h-6 px-2 text-xs"
                        >
                          Cancel
                        </Button>
                        <Button variant="brand" size="sm" onClick={() => handleAddNewOption('in_house', newOptionValue, false)} disabled={!newOptionValue.trim()} className="h-6 px-2 text-xs">
                          Add
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          }

          // Handle region and pricing as single-select MultiSelect
          if (field === 'region' || field === 'pricing') {
            const fieldKey = field as 'region' | 'pricing';
            return (
              <MultiSelect
                options={options}
                selected={value ? [value] : []}
                onSelectedChange={async (selected) => {
                  // For single-select behavior, always take the last selected item
                  const newValue = selected.length > 0 ? selected[selected.length - 1] : null;
                  const kolToUpdate = kols.find(k => k.id === kolId);
                  if (kolToUpdate) {
                    const updatedKOL = { ...kolToUpdate, [fieldKey]: newValue };
                    setKols(prevKols =>
                      prevKols.map(k => k.id === kolId ? updatedKOL : k)
                    );
                    try {
                      await KOLService.updateKOL(updatedKOL);
                    } catch (error) {
                      console.error('Error updating field:', error);
                      setKols(prevKols =>
                        prevKols.map(k => k.id === kolId ? kolToUpdate : k)
                      );
                    }
                  }
                }}
                isOpen={openDropdown?.kolId === kolId && openDropdown?.field === field}
                onOpenChange={(open) => {
                  if (open) {
                    setOpenDropdown({ kolId, field: field as string });
                  } else {
                    setOpenDropdown(null);
                  }
                }}
                renderOption={(option) => {
                  if (fieldKey === 'region') {
                    return (
                      <div className="flex items-center space-x-2">
                        <span>{getRegionIcon(option).flag}</span>
                        <span>{option}</span>
                      </div>
                    );
                  } else if (fieldKey === 'pricing') {
                    return (
                      <span className={`px-2 py-1 rounded-md text-xs font-medium ${getPricingColor(option)}`}>
                        {option}
                      </span>
                    );
                  }
                  return option;
                }}
                triggerContent={
                  <div className="w-full flex items-center h-7 min-h-[28px]">
                    {value ? (
                      fieldKey === 'region' ? (
                        <div className="flex items-center space-x-1">
                          <span>{getRegionIcon(value).flag}</span>
                          <span className="text-xs font-semibold text-black">{value}</span>
                        </div>
                      ) : fieldKey === 'pricing' ? (
                        <span className={`px-2 py-1 rounded-md text-xs font-medium ${getPricingColor(value)}`}>
                          {value}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-black">{value}</span>
                      )
                    ) : (
                      <span className="flex items-center text-xs font-semibold text-black">Select</span>
                    )}
                    <svg className="h-3 w-3 ml-1 flex-shrink-0 text-ink-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                }
              />
            );
          }

          // Handle other select fields with original Select component
          return (
            <Select 
              value={value || ''} 
              onValueChange={async (newValue) => {
                const kolToUpdate = kols.find(k => k.id === kolId);
                if (kolToUpdate) {
                  const updatedKOL = { ...kolToUpdate, [field]: newValue };
                  setKols(prevKols => 
                    prevKols.map(k => k.id === kolId ? updatedKOL : k)
                  );
                  try {
                    await KOLService.updateKOL(updatedKOL);
                  } catch (error) {
                    console.error('Error updating select:', error);
                    setKols(prevKols => 
                      prevKols.map(k => k.id === kolId ? kolToUpdate : k)
                    );
                  }
                }
              }}
            >
              <SelectTrigger 
                className={`border-none shadow-none bg-transparent w-auto h-auto ${getSelectStyling()} focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none data-[state=open]:outline-none data-[state=open]:ring-0 data-[state=open]:border-none`}
                style={{ outline: 'none', boxShadow: 'none' }}
              >
                <SelectValue>
                  {(field as string) === 'region' && value && (
                    <div className="flex items-center space-x-1">
                      <span>{getRegionIcon(value).flag}</span>
                      <span>{value}</span>
                    </div>
                  )}
                  {(field as string) !== 'region' && value}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {options.map(option => (
                  <SelectItem key={option} value={option}>
                    {(field as string) === 'region' ? (
                      <div className="flex items-center space-x-2">
                        <span>{getRegionIcon(option).flag}</span>
                        <span>{option}</span>
                      </div>
                    ) : option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        case 'multiselect':
          const multiOptions = (field as string) === 'platform' ? (fieldOptions?.platforms || []) :
                              (field as string) === 'deliverables' ? (fieldOptions?.deliverables || []) :
                              (field as string) === 'niche' ? (fieldOptions?.niches || []) :
                                                              (field as string) === 'creator_type' ? (fieldOptions?.creatorTypes || []) :
                                (field as string) === 'content_type' ? (fieldOptions?.contentTypes || []) : [];
          const currentValues = Array.isArray(value) ? value : [];
                      const placeholder = (field as string) === 'platform' ? 'Select platforms...' :
                              (field as string) === 'deliverables' ? 'Select deliverables...' :
                              (field as string) === 'niche' ? 'Select niches...' :
                              (field as string) === 'creator_type' ? 'Select creator types...' :
                              (field as string) === 'content_type' ? 'Select content types...' : 'Select options...';
          const renderOption = (option: string) => {
            if ((field as string) === 'platform') {
              return (
                <div className="flex items-center justify-center h-5 w-5" title={option}>
                  {getPlatformIcon(option)}
                </div>
              );
            }
            if ((field as string) === 'deliverables') {
              return (
                <span className={`px-2 py-1 rounded-md text-xs font-medium ${getNewContentTypeColor(option)}`}>
                  {option}
                </span>
              );
            }
            if (field === 'content_type') {
              return (
                <span className={`px-2 py-1 rounded-md text-xs font-medium ${getNewContentTypeColor(option)}`}>
                  {option}
                </span>
              );
            }
            if (field === 'creator_type') {
              return (
                <span className={`px-2 py-1 rounded-md text-xs font-medium ${getCreatorTypeColor(option)}`}>
                  {option}
                </span>
              );
            }
            return <span>{option}</span>;
          };
          return (
            <div className="relative w-full">
              <MultiSelect
                options={multiOptions}
                selected={currentValues}
                // HHP Creator Taxonomy Spec — Creator Type capped at
                // 2. Only applies to that field; other multi-selects
                // (niche, platform, etc.) stay uncapped.
                maxSelected={field === 'creator_type' ? 2 : undefined}
                onSelectedChange={async (newValues) => {
                  const kolToUpdate = kols.find(k => k.id === kolId);
                  if (kolToUpdate) {
                    const updatedKOL = { ...kolToUpdate, [field]: newValues };
                    setKols(prevKols => 
                      prevKols.map(k => k.id === kolId ? updatedKOL : k)
                    );
                    try {
                      await KOLService.updateKOL(updatedKOL);
                    } catch (error) {
                      console.error('Error updating multiselect:', error);
                      setKols(prevKols => 
                        prevKols.map(k => k.id === kolId ? kolToUpdate : k)
                      );
                    }
                  }
                }}
                placeholder={placeholder}
                className="w-full"
                isOpen={openDropdown?.kolId === kolId && openDropdown?.field === field}
                onOpenChange={(open) => {
                  if (open) {
                    setOpenDropdown({ kolId, field: field as string });
                  } else {
                    setOpenDropdown(null);
                  }
                }}
                triggerContent={
                  <div className="w-full flex items-center h-7 min-h-[28px]">
                    {/* For creator_type, coalesce empty to ['General'] so
                        the cell never shows a "Select" placeholder for
                        a category every KOL implicitly belongs to. The
                        underlying value (and dropdown checks) stay empty
                        until the user actively picks one. */}
                    {(() => {
                      const displayValues = field === 'creator_type'
                        ? effectiveCreatorTypes(currentValues)
                        : currentValues;
                      return displayValues.length > 0 ? (
                      <>
                        {displayValues.map((item, idx) => (
                        <span key={item} className={`px-2 py-1 rounded-md text-xs font-medium flex-shrink-0 ${
                            field === 'platform' ? '' :
                            field === 'deliverables' ? getNewContentTypeColor(item) :
                          field === 'niche' ? getNicheColor(item) :
                            field === 'creator_type' ? getCreatorTypeColor(item) :
                            field === 'content_type' ? getNewContentTypeColor(item) : 'bg-cream-100 text-ink-warm-700'
                          } ${field === 'creator_type' || field === 'niche' || field === 'deliverables' || field === 'content_type' ? 'mr-1' : ''}`}>
                            {field === 'platform' ? getPlatformIcon(item) : item}
                        </span>
                      ))}
                      </>
                    ) : (
                      <span className="flex items-center text-xs font-semibold text-black">Select</span>
                    );
                    })()}
                    <svg className="h-3 w-3 ml-1 flex-shrink-0 text-ink-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                }
              />
            </div>
          );
        default:
          break;
      }
    }
    if (isEditing && (type === 'text' || type === 'number')) {
      const getInputStyling = () => {
        let baseStyles = "w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none";
        if (field === 'name') {
          return `${baseStyles} font-bold`;
        }
        if (field === 'link') {
          return `${baseStyles} text-blue-600`;
        }
        return `${baseStyles}`;
      };
      switch (type) {
        case 'number':
          return (
            <Input
              type="number"
              value={editingValue || ''}
              onChange={(e) => setEditingValue(parseInt(e.target.value) || null)}
              onBlur={handleCellSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCellSave();
                if (e.key === 'Escape') handleCellCancel();
              }}
              className={getInputStyling()}
              style={{ outline: 'none', boxShadow: 'none', userSelect: 'text' }}
              autoFocus
            />
          );
        default:
          return (
            <Input
              value={editingValue || ''}
              onChange={(e) => setEditingValue(e.target.value)}
              onBlur={handleCellSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCellSave();
                if (e.key === 'Escape') handleCellCancel();
              }}
              className={getInputStyling()}
              style={{ outline: 'none', boxShadow: 'none', userSelect: 'text' }}
              autoFocus
            />
          );
      }
    }
    const displayContent = (() => {
      switch (type) {
        case 'number':
          return field === 'followers' ? KOLService.formatFollowers(value) : value;
        default:
          if (field === 'name' && value) {
            return (
              <span className="font-bold">
                {value}
              </span>
            );
          }
          if (field === 'link' && value) {
            return (
              <a 
                href={value} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-blue-600 hover:text-blue-800"
              >
                <span className="truncate max-w-32">{value}</span>
              </a>
            );
          }
          return value || '-';
      }
    })();
    return (
      <div 
        className="cursor-pointer w-full h-full flex items-center px-1 py-1"
        onDoubleClick={() => handleCellDoubleClick(kolId, field, value)}
        title="Double-click to edit"
      >
        {displayContent}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="KOLs"
          subtitle="Manage your Key Opinion Leaders"
          kicker="KOLs"
          kickerDot="violet"
          actions={
            <Button variant="brand" disabled>
              <Plus className="h-4 w-4 mr-2" />
              Add KOL
            </Button>
          }
        />

        {/* ── Roster skeleton ────────────────────────────────────
            Mirrors loaded layout — SectionHeader + filter toolbar
            (tabs left, search middle, columns right) + table. */}
        <div className="space-y-4">
          <div className="section-head first flex items-center gap-3">
            <span className="dot bg-brand/30" aria-hidden />
            <Skeleton className="h-3 w-20" />
            <span className="flex-1 h-px bg-cream-200" aria-hidden />
            <Skeleton className="h-3 w-28" />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1 p-1 rounded-md bg-cream-100 border border-cream-200">
              <Skeleton className="h-8 w-16 rounded" />
              <Skeleton className="h-8 w-32 rounded" />
            </div>
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-warm-400" />
              <Input placeholder="Search KOLs by name, region, or niche..." className="pl-10 focus-brand" disabled />
            </div>
            <Button variant="outline" size="sm" className="ml-auto flex items-center gap-2" disabled>
              <Settings className="h-4 w-4" />
              Columns
            </Button>
          </div>

          <p className="text-xs text-ink-warm-500">
            <span className="text-rose-500 font-bold">!</span> indicates KOL not updated in 90+ days
          </p>

          <KOLTableSkeleton visibleColumns={visibleColumns} addingNewOptionForRow={addingNewOptionForRow} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="KOLs" subtitle="Manage your Key Opinion Leaders" kicker="KOLs" kickerDot="violet" />
        <div className="text-center py-8">
          <p className="text-rose-600">{error}</p>
          <Button onClick={fetchKOLs} className="mt-4">Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="KOLs"
        subtitle="Manage your Key Opinion Leaders"
        kicker="KOLs"
        kickerDot="violet"
        actions={
          <div className="flex items-center gap-2">
            {userProfile?.role === 'super_admin' && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (bulkAvatarRunning) return;
                  if (!confirm('Refresh avatars for all ~424 active KOLs? Takes ~2 minutes.')) return;
                  setBulkAvatarRunning(true);
                  toast({ title: 'Refreshing avatars...', description: 'Iterating over the roster — this takes ~2 min.' });
                  try {
                    const res = await fetch('/api/admin/refresh-all-kol-avatars', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ delay_ms: 250 }),
                    });
                    const json = await res.json();
                    if (json?.ok && json?.stats) {
                      toast({
                        title: 'Avatars refreshed',
                        description: `${json.stats.telegram} from Telegram + ${json.stats.x} from X. ${json.stats.skipped} skipped.`,
                      });
                      // Reload to pick up new URLs.
                      fetchKOLs();
                    } else {
                      toast({
                        title: 'Bulk refresh failed',
                        description: json?.error || 'Unknown error',
                        variant: 'destructive',
                      });
                    }
                  } catch (err: any) {
                    toast({
                      title: 'Network error',
                      description: err?.message || 'Could not reach server',
                      variant: 'destructive',
                    });
                  } finally {
                    setBulkAvatarRunning(false);
                  }
                }}
                disabled={bulkAvatarRunning}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${bulkAvatarRunning ? 'animate-spin' : ''}`} />
                {bulkAvatarRunning ? 'Refreshing...' : 'Refresh avatars'}
              </Button>
            )}
            <Button variant="brand" size="sm" onClick={handleAddNew} disabled={isSavingNewKOL}>
              {isSavingNewKOL ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Add KOL
                </>
              )}
            </Button>
          </div>
        }
      />

      {/* Bulk action bar — v11 Card chrome (rounded-[14px], warm
          hairline border, inset top highlight) so the selection
          surface visually belongs to the page instead of feeling like
          a standalone widget. Brand-soft accent strip on the left
          reinforces "selection mode is on." */}
      {selectedKOLs.length > 0 && (
      <Card className="mb-4 mt-6 p-6 accent-l-brand">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="dot bg-brand" aria-hidden />
              <span className="text-sm font-semibold text-ink-warm-900">{selectedKOLs.length} KOL{selectedKOLs.length !== 1 ? 's' : ''} selected</span>
            </div>
            <div className="h-4 w-px bg-cream-200"></div>
            <span className="text-[11px] mono uppercase tracking-[0.14em] text-ink-warm-500">Bulk Edit Fields</span>
          </div>
          <div className="mb-4 pb-4 border-b border-cream-200">
            <Button
              size="sm"
              variant="outline"
              className="text-ink-warm-700 border-cream-300 hover:bg-cream-50"
              onClick={() => {
                const allIds = filteredKOLs.map(kol => kol.id);
                if (allIds.every(id => selectedKOLs.includes(id))) {
                  setSelectedKOLs(prev => prev.filter(id => !allIds.includes(id)));
                } else {
                  setSelectedKOLs(prev => Array.from(new Set([...prev, ...allIds])));
                }
              }}
            >
              {filteredKOLs.length > 0 && filteredKOLs.every(kol => selectedKOLs.includes(kol.id)) ? 'Deselect All' : 'Select All'}
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
          {/* Platform */}
          <div className="min-w-[120px] flex flex-col items-end justify-end">
            <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Platform</span>
            <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
              <MultiSelect
                options={fieldOptions.platforms || []}
                selected={bulkEdit.platform || []}
                onSelectedChange={platform => setBulkEdit(prev => ({ ...prev, platform }))}
                placeholder="Platform"
                className="w-full"
                isOpen={bulkEditDropdown === 'platform'}
                onOpenChange={(open) => setBulkEditDropdown(open ? 'platform' : null)}
                triggerContent={
                  <div className="w-full flex items-center h-7 min-h-[28px]">
                    {bulkEdit.platform && bulkEdit.platform.length > 0 ? (
                      <>
                        {bulkEdit.platform.map((item, idx) => (
                          <span key={item} className="px-2 py-1 rounded-md text-xs font-medium bg-cream-100 text-ink-warm-700 flex items-center">
                            {getPlatformIcon ? getPlatformIcon(item) : null}
                          </span>
                        ))}
                      </>
                    ) : (
                      <span className="flex items-center text-xs font-semibold text-black">Select</span>
                    )}
                    <svg className="h-3 w-3 ml-1 flex-shrink-0 text-ink-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                }
              />
            </div>
          </div>
          {/* Region */}
          <div className="min-w-[100px] flex flex-col items-end justify-end">
            <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Region</span>
            <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
              <MultiSelect
                options={fieldOptions.regions || []}
                selected={bulkEdit.region ? [bulkEdit.region] : []}
                onSelectedChange={regions => {
                  // For single-select behavior, always take the last selected item
                  const newRegion = regions.length > 0 ? regions[regions.length - 1] : null;
                  setBulkEdit(prev => ({ ...prev, region: newRegion }));
                }}
                placeholder="Region"
                className="w-full"
                isOpen={bulkEditDropdown === 'region'}
                onOpenChange={(open) => setBulkEditDropdown(open ? 'region' : null)}
                renderOption={(option) => (
                  <div className="flex items-center space-x-2">
                    <span>{getRegionIcon(option).flag}</span>
                    <span>{option}</span>
                  </div>
                )}
                triggerContent={
                  <div className="w-full flex items-center h-7 min-h-[28px]">
                    {bulkEdit.region ? (
                      <div className="flex items-center space-x-1">
                        <span>{getRegionIcon(bulkEdit.region).flag}</span>
                        <span className="text-xs font-semibold text-black">{bulkEdit.region}</span>
                      </div>
                    ) : (
                      <span className="flex items-center text-xs font-semibold text-black">Select</span>
                    )}
                    <svg className="h-3 w-3 ml-1 flex-shrink-0 text-ink-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                }
              />
            </div>
          </div>
          {/* Creator Type */}
          <div className="min-w-[120px] flex flex-col items-end justify-end">
            <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Creator Type <span className="font-normal text-ink-warm-400">· max 2</span></span>
            <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
              <MultiSelect
                options={fieldOptions.creatorTypes || []}
                selected={bulkEdit.creator_type || []}
                onSelectedChange={creator_type => setBulkEdit(prev => ({ ...prev, creator_type }))}
                placeholder="Creator Type"
                className="w-full"
                // HHP Creator Taxonomy Spec — max 2.
                maxSelected={2}
                isOpen={bulkEditDropdown === 'creator_type'}
                onOpenChange={(open) => setBulkEditDropdown(open ? 'creator_type' : null)}
                triggerContent={
                  <div className="w-full flex items-center h-7 min-h-[28px]">
                    {bulkEdit.creator_type && bulkEdit.creator_type.length > 0 ? (
                      <>
                        {bulkEdit.creator_type.map((item, idx) => (
                          <span key={item} className={`px-2 py-1 rounded-md text-xs font-medium flex-shrink-0 ${getCreatorTypeColor(item)} mr-1`}>{item}</span>
                        ))}
                      </>
                    ) : (
                      <span className="flex items-center text-xs font-semibold text-black">Select</span>
                    )}
                    <svg className="h-3 w-3 ml-1 flex-shrink-0 text-ink-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                }
              />
            </div>
          </div>
          {/* Content Type */}
          <div className="min-w-[120px] flex flex-col items-end justify-end">
            <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Content Type</span>
            <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
              <MultiSelect
                options={fieldOptions.contentTypes || []}
                selected={bulkEdit.content_type || []}
                onSelectedChange={content_type => setBulkEdit(prev => ({ ...prev, content_type }))}
                placeholder="Content Type"
                className="w-full"
                isOpen={bulkEditDropdown === 'content_type'}
                onOpenChange={(open) => setBulkEditDropdown(open ? 'content_type' : null)}
                triggerContent={
                  <div className="w-full flex items-center h-7 min-h-[28px]">
                    {bulkEdit.content_type && bulkEdit.content_type.length > 0 ? (
                      <>
                        {bulkEdit.content_type.map((item, idx) => (
                          <span key={item} className={`px-2 py-1 rounded-md text-xs font-medium flex-shrink-0 ${getNewContentTypeColor(item)} mr-1`}>{item}</span>
                        ))}
                      </>
                    ) : (
                      <span className="flex items-center text-xs font-semibold text-black">Select</span>
                    )}
                    <svg className="h-3 w-3 ml-1 flex-shrink-0 text-ink-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                }
              />
            </div>
          </div>
          {/* Deliverables */}
          <div className="min-w-[120px] flex flex-col items-end justify-end">
            <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Deliverables</span>
            <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
              <MultiSelect
                options={fieldOptions.deliverables || []}
                selected={bulkEdit.deliverables || []}
                onSelectedChange={deliverables => setBulkEdit(prev => ({ ...prev, deliverables }))}
                placeholder="Deliverables"
                className="w-full"
                isOpen={bulkEditDropdown === 'deliverables'}
                onOpenChange={(open) => setBulkEditDropdown(open ? 'deliverables' : null)}
                triggerContent={
                  <div className="w-full flex items-center h-7 min-h-[28px]">
                    {bulkEdit.deliverables && bulkEdit.deliverables.length > 0 ? (
                      <>
                        {bulkEdit.deliverables.map((item, idx) => (
                          <span key={item} className={`px-2 py-1 rounded-md text-xs font-medium flex-shrink-0 ${getNewContentTypeColor(item)} mr-1`}>{item}</span>
                        ))}
                      </>
                    ) : (
                      <span className="flex items-center text-xs font-semibold text-black">Select</span>
                    )}
                    <svg className="h-3 w-3 ml-1 flex-shrink-0 text-ink-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                }
              />
            </div>
          </div>
          {/* Pricing */}
          <div className="min-w-[100px] flex flex-col items-end justify-end">
            <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Pricing</span>
            <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
              <MultiSelect
                options={fieldOptions.pricingTiers || []}
                selected={bulkEdit.pricing ? [bulkEdit.pricing] : []}
                onSelectedChange={pricingTiers => {
                  // For single-select behavior, always take the last selected item
                  const newPricing = pricingTiers.length > 0 ? pricingTiers[pricingTiers.length - 1] : null;
                  setBulkEdit(prev => ({ ...prev, pricing: newPricing }));
                }}
                placeholder="Pricing"
                className="w-full"
                isOpen={bulkEditDropdown === 'pricing'}
                onOpenChange={(open) => setBulkEditDropdown(open ? 'pricing' : null)}
                renderOption={(option) => (
                  <span className={`px-2 py-1 rounded-md text-xs font-medium ${getPricingColor(option)}`}>
                    {option}
                  </span>
                )}
                triggerContent={
                  <div className="w-full flex items-center h-7 min-h-[28px]">
                    {bulkEdit.pricing ? (
                      <span className={`px-2 py-1 rounded-md text-xs font-medium ${getPricingColor(bulkEdit.pricing)}`}>
                        {bulkEdit.pricing}
                      </span>
                    ) : (
                      <span className="flex items-center text-xs font-semibold text-black">Select</span>
                    )}
                    <svg className="h-3 w-3 ml-1 flex-shrink-0 text-ink-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
          </div>
                }
              />
          </div>
          </div>
          {/* Community Founder (renamed from "Community" per May 2026 spec). */}
          <div className="min-w-[100px] flex flex-col items-end justify-end">
            <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Community Founder</span>
            <Select value={bulkEdit.community === true ? 'yes' : bulkEdit.community === false ? 'no' : ''} onValueChange={v => setBulkEdit(prev => ({ ...prev, community: v === 'yes' }))}>
              <SelectTrigger
                className={`border-none shadow-none bg-transparent w-full h-7 min-h-[28px] px-2 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1 focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none data-[state=open]:outline-none data-[state=open]:ring-0 data-[state=open]:border-none ${bulkEdit.community !== undefined ? (bulkEdit.community ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800') : ''}`}
                style={{ outline: 'none', boxShadow: 'none' }}
              >
                <span>{bulkEdit.community === true ? 'Yes' : bulkEdit.community === false ? 'No' : 'Select'}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Group Chat */}
          <div className="min-w-[100px] flex flex-col items-end justify-end">
            <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Group Chat</span>
            <Select value={bulkEdit.group_chat === true ? 'yes' : bulkEdit.group_chat === false ? 'no' : ''} onValueChange={v => setBulkEdit(prev => ({ ...prev, group_chat: v === 'yes' }))}>
              <SelectTrigger
                className={`border-none shadow-none bg-transparent w-full h-7 min-h-[28px] px-2 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1 focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none data-[state=open]:outline-none data-[state=open]:ring-0 data-[state=open]:border-none ${bulkEdit.group_chat !== undefined ? (bulkEdit.group_chat ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800') : ''}`}
                style={{ outline: 'none', boxShadow: 'none' }}
              >
                <span>{bulkEdit.group_chat === true ? 'Yes' : bulkEdit.group_chat === false ? 'No' : 'Select'}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* In-House */}
          <div className="min-w-[100px] flex flex-col items-end justify-end">
            <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">In-House</span>
            <div className="relative w-full">
              <Select value={bulkEdit.in_house || ''} onValueChange={v => {
                if (v === 'ADD_NEW') {
                  setIsAddingNewOptionBulk(true);
                  return;
                }
                setBulkEdit(prev => ({ ...prev, in_house: v }));
              }}>
                <SelectTrigger
                  className={`border-none shadow-none bg-transparent w-full h-7 min-h-[28px] px-2 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1 focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none data-[state=open]:outline-none data-[state=open]:ring-0 data-[state=open]:border-none ${bulkEdit.in_house ? getInHouseColor(bulkEdit.in_house) : ''}`}
                  style={{ outline: 'none', boxShadow: 'none' }}
                >
                  <span>{bulkEdit.in_house || 'Select'}</span>
                </SelectTrigger>
                <SelectContent>
                  {dynamicFieldOptions.in_house?.map(option => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                  <SelectItem value="ADD_NEW" className="text-ink-warm-900 font-medium">
                    <Plus className="h-3 w-3 mr-1 inline" />
                    Add New Option
                  </SelectItem>
                </SelectContent>
              </Select>

              {isAddingNewOptionBulk && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-25" onClick={() => {
                  setIsAddingNewOptionBulk(false);
                  setNewOptionValueBulk('');
                }}>
                  <div className="bg-white border border-cream-200 rounded-md shadow-lg p-4 min-w-[300px]" onClick={(e) => e.stopPropagation()}>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium text-ink-warm-700 mb-1 block">Add New In-House Option</label>
                        <Input
                          value={newOptionValueBulk}
                          onChange={(e) => setNewOptionValueBulk(e.target.value)}
                          placeholder="Enter new option"
                          className="focus-brand"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleAddNewOption('in_house', newOptionValueBulk, true);
                            } else if (e.key === 'Escape') {
                              setIsAddingNewOptionBulk(false);
                              setNewOptionValueBulk('');
                            }
                          }}
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setIsAddingNewOptionBulk(false);
                            setNewOptionValueBulk('');
                          }}
                          className="text-xs"
                        >
                          Cancel
                        </Button>
                        <Button variant="brand" onClick={() => handleAddNewOption('in_house', newOptionValueBulk, true)} disabled={!newOptionValueBulk.trim()} className="text-xs">
                          Add Option
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-cream-200">
          <div className="flex items-center justify-between">
            <div className="flex gap-3">
              <Button
                variant="brand"
                size="sm"
                className="shadow-sm"
                disabled={selectedKOLs.length === 0}
                onClick={async () => {
                  if (selectedKOLs.length === 0) return;
                  const updates = { ...bulkEdit };
                  setKols(prev => prev.map(kol => selectedKOLs.includes(kol.id) ? { ...kol, ...updates } : kol));
                  await Promise.all(selectedKOLs.map(kolId => {
                    const { id, ...fields } = { ...kols.find(k => k.id === kolId), ...updates };
                    return KOLService.updateKOL({ id: kolId, ...fields });
                  }));
                  setBulkEdit({});
                  setSelectedKOLs([]);
                }}
              >
                Apply
              </Button>
              <Button
                size="sm"
                className="bg-rose-600 hover:bg-rose-700 text-white border-0 shadow-sm"
                disabled={selectedKOLs.length === 0 || isBulkDeleting}
                onClick={() => setShowBulkDeleteDialog(true)}
              >
                Delete
              </Button>
            </div>
            <div className="text-xs text-ink-warm-500 font-medium">
              {selectedKOLs.length > 0 && `${selectedKOLs.length} item${selectedKOLs.length !== 1 ? 's' : ''} selected`}
            </div>
          </div>
        </div>
        </div>
      </Card>
      )}

      {/* Filter Menu - Hidden as filters are now in table headers */}
      {false && (
      <div className="mb-4">
        <div className="bg-white border border-cream-200 rounded-lg p-6 shadow-sm">
          <div className="flex flex-wrap items-end gap-2">
            {/* Platform Filter */}
            <div className="min-w-[120px] flex flex-col items-end justify-end">
              <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Platform</span>
              <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
                <MultiSelect
                  options={fieldOptions.platforms || []}
                  selected={filters.platform}
                  onSelectedChange={(platform) => setFilters(prev => ({ ...prev, platform }))}
                  placeholder="Platform"
                  className="w-full"
                  triggerContent={
                    <div className="w-full flex items-center h-7 min-h-[28px]">
                      {filters.platform && filters.platform.length > 0 ? (
                        <>
                          {filters.platform.map((item, idx) => (
                            <span key={item} className="px-2 py-1 rounded-md text-xs font-medium bg-cream-100 text-ink-warm-700 flex items-center">
                              {getPlatformIcon ? getPlatformIcon(item) : null}
                            </span>
                          ))}
                        </>
                      ) : (
                        <span className="flex items-center text-xs font-semibold text-black">Select</span>
                      )}
                      <svg className="h-3 w-3 ml-1 flex-shrink-0 text-ink-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  }
                />
              </div>
            </div>
            {/* Region Filter */}
            <div className="min-w-[100px] flex flex-col items-end justify-end">
              <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Region</span>
              <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
                <MultiSelect
                  options={fieldOptions.regions || []}
                  selected={filters.region}
                  onSelectedChange={(region) => setFilters(prev => ({ ...prev, region }))}
                  placeholder="Region"
                  className="w-full"
                  renderOption={(option: string) => (
                    <div className="flex items-center space-x-2">
                      <span>{getRegionIcon(option).flag}</span>
                      <span>{option}</span>
                    </div>
                  )}
                  triggerContent={
                    <div className="w-full flex items-center h-7 min-h-[28px]">
                      {filters.region && filters.region.length > 0 ? (
                        <>
                          {filters.region.map(item => (
                            <div key={item} className="flex items-center space-x-1 mr-2">
                              <span>{getRegionIcon(item).flag}</span>
                              <span className="text-xs font-semibold text-black">{item}</span>
                            </div>
                          ))}
                        </>
                      ) : (
                        <span className="flex items-center text-xs font-semibold text-black">Select</span>
                      )}
                      <svg className="h-3 w-3 ml-1 flex-shrink-0 text-ink-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  }
                />
              </div>
            </div>
            {/* Creator Type Filter */}
            <div className="min-w-[120px] flex flex-col items-end justify-end">
              <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Creator Type</span>
              <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
                <MultiSelect
                  options={fieldOptions.creatorTypes || []}
                  selected={filters.creator_type}
                  onSelectedChange={(creator_type) => setFilters(prev => ({ ...prev, creator_type }))}
                  placeholder="Creator Type"
                  className="w-full"
                  triggerContent={
                    <div className="w-full flex items-center h-7 min-h-[28px]">
                      {filters.creator_type && filters.creator_type.length > 0 ? (
                        <>
                          {filters.creator_type.map(item => (
                            <span key={item} className={`px-2 py-1 rounded-md text-xs font-medium flex-shrink-0 ${getCreatorTypeColor(item)} mr-1`}>{item}</span>
                          ))}
                        </>
                      ) : (
                        <span className="flex items-center text-xs font-semibold text-black">Select</span>
                      )}
                      <svg className="h-3 w-3 ml-1 flex-shrink-0 text-ink-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  }
                />
              </div>
            </div>
            {/* Content Type Filter */}
            <div className="min-w-[120px] flex flex-col items-end justify-end">
              <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Content Type</span>
              <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
                <MultiSelect
                  options={fieldOptions.contentTypes || []}
                  selected={filters.content_type}
                  onSelectedChange={(content_type) => setFilters(prev => ({ ...prev, content_type }))}
                  placeholder="Content Type"
                  className="w-full"
                  triggerContent={
                    <div className="w-full flex items-center h-7 min-h-[28px]">
                      {filters.content_type && filters.content_type.length > 0 ? (
                        <>
                          {filters.content_type.map(item => (
                            <span key={item} className={`px-2 py-1 rounded-md text-xs font-medium flex-shrink-0 ${getNewContentTypeColor(item)} mr-1`}>{item}</span>
                          ))}
                        </>
                      ) : (
                        <span className="flex items-center text-xs font-semibold text-black">Select</span>
                      )}
                      <svg className="h-3 w-3 ml-1 flex-shrink-0 text-ink-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  }
                />
              </div>
            </div>
            {/* Deliverables Filter */}
            <div className="min-w-[120px] flex flex-col items-end justify-end">
              <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Deliverables</span>
              <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
                <MultiSelect
                  options={fieldOptions.deliverables || []}
                  selected={filters.deliverables}
                  onSelectedChange={(deliverables) => setFilters(prev => ({ ...prev, deliverables }))}
                  placeholder="Deliverables"
                  className="w-full"
                  triggerContent={
                    <div className="w-full flex items-center h-7 min-h-[28px]">
                      {filters.deliverables && filters.deliverables.length > 0 ? (
                        <>
                          {filters.deliverables.map(item => (
                            <span key={item} className={`px-2 py-1 rounded-md text-xs font-medium flex-shrink-0 ${getNewContentTypeColor(item)} mr-1`}>{item}</span>
                          ))}
                        </>
                      ) : (
                        <span className="flex items-center text-xs font-semibold text-black">Select</span>
                      )}
                      <svg className="h-3 w-3 ml-1 flex-shrink-0 text-ink-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  }
                />
              </div>
            </div>
            {/* Pricing Filter */}
            <div className="min-w-[100px] flex flex-col items-end justify-end">
              <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Pricing</span>
              <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
                <MultiSelect
                  options={fieldOptions.pricingTiers || []}
                  selected={filters.pricing}
                  onSelectedChange={(pricing) => setFilters(prev => ({ ...prev, pricing }))}
                  placeholder="Pricing"
                  className="w-full"
                  renderOption={(option) => (
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${getPricingColor(option)}`}>
                      {option}
                    </span>
                  )}
                  triggerContent={
                    <div className="w-full flex items-center h-7 min-h-[28px]">
                      {filters.pricing && filters.pricing.length > 0 ? (
                        <>
                          {filters.pricing.map(item => (
                            <span key={item} className={`px-2 py-1 rounded-md text-xs font-medium flex-shrink-0 ${getPricingColor(item)} mr-1`}>{item}</span>
                          ))}
                        </>
                      ) : (
                        <span className="flex items-center text-xs font-semibold text-black">Select</span>
                      )}
                      <svg className="h-3 w-3 ml-1 flex-shrink-0 text-ink-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  }
                />
              </div>
            </div>
            {/* Community Founder filter (renamed from "Community"). */}
            <div className="min-w-[100px] flex flex-col items-end justify-end">
              <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Community Founder</span>
              <Select value={filters.community} onValueChange={v => setFilters(prev => ({ ...prev, community: v }))}>
                <SelectTrigger
                  className={`border-none shadow-none bg-transparent w-full h-7 min-h-[28px] px-2 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1 focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none data-[state=open]:outline-none data-[state=open]:ring-0 data-[state=open]:border-none ${filters.community === 'yes' ? 'bg-emerald-100 text-emerald-800' : filters.community === 'no' ? 'bg-rose-100 text-rose-800' : ''}`}
                  style={{ outline: 'none', boxShadow: 'none' }}
                >
                  <span>{filters.community === 'yes' ? 'Yes' : filters.community === 'no' ? 'No' : 'Select'}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Group Chat Filter */}
            <div className="min-w-[100px] flex flex-col items-end justify-end">
              <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Group Chat</span>
              <Select value={filters.group_chat} onValueChange={v => setFilters(prev => ({ ...prev, group_chat: v }))}>
                <SelectTrigger
                  className={`border-none shadow-none bg-transparent w-full h-7 min-h-[28px] px-2 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1 focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none data-[state=open]:outline-none data-[state=open]:ring-0 data-[state=open]:border-none ${filters.group_chat === 'yes' ? 'bg-emerald-100 text-emerald-800' : filters.group_chat === 'no' ? 'bg-rose-100 text-rose-800' : ''}`}
                  style={{ outline: 'none', boxShadow: 'none' }}
                >
                  <span>{filters.group_chat === 'yes' ? 'Yes' : filters.group_chat === 'no' ? 'No' : 'Select'}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* In House Filter */}
            <div className="min-w-[100px] flex flex-col items-end justify-end">
              <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">In House</span>
              <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
                <MultiSelect
                  options={[]}
                  selected={filters.in_house}
                  onSelectedChange={(in_house) => setFilters(prev => ({ ...prev, in_house }))}
                  placeholder="In House"
                  className="w-full"
                  triggerContent={
                    <div className="w-full flex items-center h-7 min-h-[28px]">
                      {filters.in_house && filters.in_house.length > 0 ? (
                        <>
                          {filters.in_house.map(item => (
                            <span key={item} className="px-2 py-1 rounded-md text-xs font-medium bg-cream-100 text-ink-warm-700 flex-shrink-0 mr-1">{item}</span>
                          ))}
                        </>
                      ) : (
                        <span className="flex items-center text-xs font-semibold text-black">Select</span>
                      )}
                      <svg className="h-3 w-3 ml-1 flex-shrink-0 text-ink-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  }
                />
              </div>
            </div>
            {/* Followers Filter */}
            <div className="min-w-[130px] flex flex-col items-end justify-end">
              <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Followers</span>
              <div className="w-full flex items-center gap-1 h-7 min-h-[28px] justify-start">
                <Select
                  value={filters.followersOperator}
                  onValueChange={(value) => setFilters(prev => ({ ...prev, followersOperator: value as '>' | '<' | '=' }))}
                >
                  <SelectTrigger className="border-none shadow-none bg-transparent w-auto h-auto px-1 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none" style={{ outline: 'none', boxShadow: 'none', minWidth: 40 }}>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=">">{'>'}</SelectItem>
                    <SelectItem value="<">{'<'}</SelectItem>
                    <SelectItem value="=">=</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  value={filters.followers}
                  onChange={(e) => setFilters(prev => ({ ...prev, followers: e.target.value }))}
                  className="focus-brand h-7 text-xs w-16"
                />
              </div>
            </div>
            {/* Rating filter removed — rating column dropped per migration 071. */}
            {/* Reset Filters Button */}
            <div className="flex flex-col items-end justify-end">
              <span className="text-xs text-transparent mb-1 self-start">Reset</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => {
                  setFilters({
                    name: '',
                    link: '',
                    platform: [],
                    followers: '',
                    followersOperator: '>',
                    region: [],
                    creator_type: [],
                    niche: [],
                    content_type: [],
                    deliverables: [],
                    pricing: [],
                    community: '',
                    group_chat: '',
                    in_house: [],
                    description: '',
                    projects: '',
                  });
                }}
              >
                Reset Filters
              </Button>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* ── Roster ───────────────────────────────────────────────────
          SectionHeader carries the chapter rhythm; the filter toolbar
          beneath it consolidates tabs (left, primary filter) + search
          (middle, refine-within) + column visibility (right, power
          user). Matches the /clients & /team toolbar pattern. */}
      <div className="space-y-4">
        <SectionHeader
          label="Roster"
          dot="amber"
          counter={`${kolTab === 'need_update' ? needUpdateCount : filteredKOLs.length} ${kolTab === 'need_update' ? 'need update' : 'of total'}`}
          first
        />

        <div className="flex items-center gap-3 flex-wrap">
          <Tabs value={kolTab} onValueChange={setKolTab}>
            <TabsList className="bg-cream-100 p-1 h-auto border border-cream-200">
              <TabsTrigger
                value="all"
                className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card text-sm px-4 py-2"
              >
                All
                <span className="ml-2 text-xs bg-cream-200 text-ink-warm-700 px-2 py-0.5 rounded-full pointer-events-none data-[state=active]:bg-brand-light data-[state=active]:text-brand">{filteredKOLs.length}</span>
              </TabsTrigger>
              <TabsTrigger
                value="need_update"
                className="data-[state=active]:bg-white data-[state=active]:text-rose-700 data-[state=active]:shadow-card text-sm px-4 py-2"
              >
                <span className="text-rose-500 font-bold mr-1">!</span> Need Update
                <span className="ml-2 text-xs bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full pointer-events-none">{needUpdateCount}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-warm-400" />
            <Input
              placeholder="Search KOLs by name, region, or niche..."
              className="pl-10 focus-brand"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Column visibility — pushed to the right; power-user
              affordance kept out of the primary filter flow. */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="ml-auto flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Columns
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto min-w-80" align="end" side="bottom">
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Toggle Columns</h4>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries({
                    name: 'Name',
                    link: 'Link',
                    platform: 'Platform',
                    followers: 'Followers',
                    region: 'Region',
                    score: 'Score',
                    projects: 'Projects',
                    creator_type: 'Creator Type',
                    niche: 'Niche',
                    deliverables: 'Deliverables',
                    latest_cost: 'Pricing',
                    community: 'Community Founder',
                    group_chat: 'Group Chat',
                    in_house: 'In-House',
                    description: 'Notes'
                  }).map(([key, label]) => (
                    <label key={key} className="flex items-center justify-between cursor-pointer hover:bg-cream-50 p-2 rounded transition-colors">
                      <span className="text-sm font-medium mr-4">{label}</span>
                      <Switch
                        checked={visibleColumns[key as keyof typeof visibleColumns]}
                        onCheckedChange={(checked) => {
                          handleColumnVisibilityChange(key as keyof typeof defaultVisibleColumns, checked);
                        }}
                        className="data-[state=checked]:bg-brand data-[state=unchecked]:bg-cream-200"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <p className="text-xs text-ink-warm-500">
          <span className="text-rose-500 font-bold">!</span> indicates KOL not updated in 90+ days
        </p>
      </div>

      <div ref={tableContainerRef} className="border rounded-lg overflow-auto">
        <Table className="min-w-full" style={{
          tableLayout: 'auto',
          borderCollapse: 'separate',
          borderSpacing: 0,
          whiteSpace: 'nowrap'
        }} suppressHydrationWarning>
          <TableHeader>
            <TableRow className="bg-cream-50 hover:bg-cream-50 border-b border-cream-200">
              <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-center whitespace-nowrap sticky left-0 z-20" style={{ width: 48, minWidth: 48, maxWidth: 48 }}>#</TableHead>
              {visibleColumns.name && <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 whitespace-nowrap sticky left-[48px] z-20" style={{ boxShadow: '-1px 0 0 0 #e5e7eb, 2px 0 4px -2px rgba(0,0,0,0.1)' }}>Name</TableHead>}
              {visibleColumns.link && <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 whitespace-nowrap">Link</TableHead>}
              {visibleColumns.platform && (
                <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 whitespace-nowrap">
                  <div className="flex items-center gap-1 cursor-pointer group">
                    <span>Platform</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[200px] p-0" align="start">
                        <div className="p-3">
                          <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Platform</div>
                          {(fieldOptions.platforms || []).map((platform) => (
                            <div
                              key={platform}
                              className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const newPlatforms = filters.platform.includes(platform)
                                  ? filters.platform.filter(p => p !== platform)
                                  : [...filters.platform, platform];
                                setFilters(prev => ({ ...prev, platform: newPlatforms }));
                              }}
                            >
                              <Checkbox checked={filters.platform.includes(platform)} />
                              <div className="flex items-center gap-1" title={platform}>
                                {getPlatformIcon ? getPlatformIcon(platform) : null}
                              </div>
                            </div>
                          ))}
                          {filters.platform.length > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full mt-2 text-xs"
                              onClick={() => setFilters(prev => ({ ...prev, platform: [] }))}
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <FilterCountBadge count={filters.platform.length} />
                  </div>
                </TableHead>
              )}
              {visibleColumns.followers && (
                <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">
                  <div className="flex items-center gap-1 cursor-pointer group">
                    <span>Followers</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[200px] p-0" align="start">
                        <div className="p-3">
                          <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Followers</div>
                          <div className="flex items-center gap-2 mb-2">
                            <Select
                              value={filters.followersOperator}
                              onValueChange={(value) => setFilters(prev => ({ ...prev, followersOperator: value as '>' | '<' | '=' }))}
                            >
                              <SelectTrigger className="w-16 h-8 text-xs focus:ring-0 focus:ring-offset-0">
                                <SelectValue placeholder="=" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value=">">{'>'}</SelectItem>
                                <SelectItem value="<">{'<'}</SelectItem>
                                <SelectItem value="=">=</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              type="number"
                              placeholder="Value"
                              value={filters.followers}
                              onChange={(e) => setFilters(prev => ({ ...prev, followers: e.target.value }))}
                              className="h-8 text-xs focus-brand"
                            />
                          </div>
                          {(filters.followersOperator || filters.followers) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full text-xs"
                              onClick={() => setFilters(prev => ({ ...prev, followersOperator: '>' as '>' | '<' | '=', followers: '' }))}
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                    {(filters.followersOperator && filters.followers) && <FilterCountBadge count={1} />}
                  </div>
                </TableHead>
              )}
              {visibleColumns.region && (
                <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">
                  <div className="flex items-center gap-1 cursor-pointer group">
                    <span>Region</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[200px] p-0" align="start">
                        <div className="p-3">
                          <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Region</div>
                          {(fieldOptions.regions || []).map((region) => (
                            <div
                              key={region}
                              className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const newRegions = filters.region.includes(region)
                                  ? filters.region.filter(r => r !== region)
                                  : [...filters.region, region];
                                setFilters(prev => ({ ...prev, region: newRegions }));
                              }}
                            >
                              <Checkbox checked={filters.region.includes(region)} />
                              <div className="flex items-center gap-1">
                                <span>{getRegionIcon(region).flag}</span>
                                <span className="text-sm">{region}</span>
                              </div>
                            </div>
                          ))}
                          {filters.region.length > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full mt-2 text-xs"
                              onClick={() => setFilters(prev => ({ ...prev, region: [] }))}
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <FilterCountBadge count={filters.region.length} />
                  </div>
                </TableHead>
              )}
              {visibleColumns.creator_type && (
                <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">
                  <div className="flex items-center gap-1 cursor-pointer group">
                    <span>Creator Type</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[200px] p-0" align="start">
                        <div className="p-3">
                          <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Creator Type</div>
                          {(fieldOptions.creatorTypes || []).map((type) => (
                            <div
                              key={type}
                              className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const newTypes = filters.creator_type.includes(type)
                                  ? filters.creator_type.filter(t => t !== type)
                                  : [...filters.creator_type, type];
                                setFilters(prev => ({ ...prev, creator_type: newTypes }));
                              }}
                            >
                              <Checkbox checked={filters.creator_type.includes(type)} />
                              <span className={`px-2 py-1 rounded-md text-xs font-medium ${getCreatorTypeColor(type)}`}>{type}</span>
                            </div>
                          ))}
                          {filters.creator_type.length > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full mt-2 text-xs"
                              onClick={() => setFilters(prev => ({ ...prev, creator_type: [] }))}
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <FilterCountBadge count={filters.creator_type.length} />
                  </div>
                </TableHead>
              )}
              {visibleColumns.niche && (
                <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">
                  <div className="flex items-center gap-1 cursor-pointer group">
                    <span>Niche</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[200px] p-0" align="start">
                        <div className="p-3">
                          <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Niche</div>
                          {(fieldOptions.niches || []).map((tag) => (
                            <div
                              key={tag}
                              className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const next = filters.niche.includes(tag)
                                  ? filters.niche.filter(t => t !== tag)
                                  : [...filters.niche, tag];
                                setFilters(prev => ({ ...prev, niche: next }));
                              }}
                            >
                              <Checkbox checked={filters.niche.includes(tag)} />
                              <span className={`px-2 py-1 rounded-md text-xs font-medium ${getNicheColor(tag)}`}>{tag}</span>
                            </div>
                          ))}
                          {filters.niche.length > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full mt-2 text-xs"
                              onClick={() => setFilters(prev => ({ ...prev, niche: [] }))}
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <FilterCountBadge count={filters.niche.length} />
                  </div>
                </TableHead>
              )}
              {visibleColumns.content_type && (
                <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">
                  <div className="flex items-center gap-1 cursor-pointer group">
                    <span>Content Type</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[250px] p-0" align="start">
                        <div className="p-3">
                          <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Content Type</div>
                          {(fieldOptions.contentTypes || []).map((type) => (
                            <div
                              key={type}
                              className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const newTypes = filters.content_type.includes(type)
                                  ? filters.content_type.filter(t => t !== type)
                                  : [...filters.content_type, type];
                                setFilters(prev => ({ ...prev, content_type: newTypes }));
                              }}
                            >
                              <Checkbox checked={filters.content_type.includes(type)} />
                              <span className="text-sm">{type}</span>
                            </div>
                          ))}
                          {filters.content_type.length > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full mt-2 text-xs"
                              onClick={() => setFilters(prev => ({ ...prev, content_type: [] }))}
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <FilterCountBadge count={filters.content_type.length} />
                  </div>
                </TableHead>
              )}
              {visibleColumns.deliverables && (
                <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">
                  <div className="flex items-center gap-1 cursor-pointer group">
                    <span>Deliverables</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[200px] p-0" align="start">
                        <div className="p-3">
                          <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Deliverables</div>
                          {(fieldOptions.deliverables || []).map((deliverable) => (
                            <div
                              key={deliverable}
                              className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const newDeliverables = filters.deliverables.includes(deliverable)
                                  ? filters.deliverables.filter(d => d !== deliverable)
                                  : [...filters.deliverables, deliverable];
                                setFilters(prev => ({ ...prev, deliverables: newDeliverables }));
                              }}
                            >
                              <Checkbox checked={filters.deliverables.includes(deliverable)} />
                              <span className="text-sm">{deliverable}</span>
                            </div>
                          ))}
                          {filters.deliverables.length > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full mt-2 text-xs"
                              onClick={() => setFilters(prev => ({ ...prev, deliverables: [] }))}
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <FilterCountBadge count={filters.deliverables.length} />
                  </div>
                </TableHead>
              )}
              {visibleColumns.pricing && (
                <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">
                  <div className="flex items-center gap-1 cursor-pointer group">
                    <span>Pricing</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[200px] p-0" align="start">
                        <div className="p-3">
                          <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Pricing</div>
                          {(fieldOptions.pricingTiers || []).map((pricing) => (
                            <div
                              key={pricing}
                              className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const newPricing = filters.pricing.includes(pricing)
                                  ? filters.pricing.filter(p => p !== pricing)
                                  : [...filters.pricing, pricing];
                                setFilters(prev => ({ ...prev, pricing: newPricing }));
                              }}
                            >
                              <Checkbox checked={filters.pricing.includes(pricing)} />
                              <span className="text-sm">{pricing}</span>
                            </div>
                          ))}
                          {filters.pricing.length > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full mt-2 text-xs"
                              onClick={() => setFilters(prev => ({ ...prev, pricing: [] }))}
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <FilterCountBadge count={filters.pricing.length} />
                  </div>
                </TableHead>
              )}
              {visibleColumns.latest_cost && (
                <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">Pricing</TableHead>
              )}
              {/* Score: placeholder until Phase 3 (kol_channel_snapshots
                  + scoring formula) ships. Show a static "Score" header;
                  no filter yet (will get a numeric range filter in Phase 3). */}
              {visibleColumns.score && (
                <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">Score</TableHead>
              )}
              {/* Projects Worked Together: free-text tags per spec v1.
                  Substring-match filter on the chip list. */}
              {visibleColumns.projects && (
                <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">
                  <div className="flex items-center gap-1 cursor-pointer group">
                    <span>Projects</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[200px] p-0" align="start">
                        <div className="p-3">
                          <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Projects</div>
                          <Input
                            type="text"
                            placeholder="Project name…"
                            value={filters.projects}
                            onChange={(e) => setFilters(prev => ({ ...prev, projects: e.target.value }))}
                            className="h-8 text-xs focus-brand"
                          />
                          {filters.projects && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full text-xs mt-2"
                              onClick={() => setFilters(prev => ({ ...prev, projects: '' }))}
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                    {filters.projects && <FilterCountBadge count={1} />}
                  </div>
                </TableHead>
              )}
              {visibleColumns.community && (
                <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">
                  <div className="flex items-center gap-1 cursor-pointer group">
                    <span>Community Founder</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[200px] p-0" align="start">
                        <div className="p-3">
                          <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Community</div>
                          {['Yes', 'No'].map((option) => (
                            <div
                              key={option}
                              className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setFilters(prev => ({ ...prev, community: prev.community === option ? '' : option }));
                              }}
                            >
                              <Checkbox checked={filters.community === option} />
                              <span className="text-sm">{option}</span>
                            </div>
                          ))}
                          {filters.community && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full mt-2 text-xs"
                              onClick={() => setFilters(prev => ({ ...prev, community: '' }))}
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                    {filters.community && <FilterCountBadge count={1} />}
                  </div>
                </TableHead>
              )}
              {visibleColumns.group_chat && (
                <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">
                  <div className="flex items-center gap-1 cursor-pointer group">
                    <span>Group Chat</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[200px] p-0" align="start">
                        <div className="p-3">
                          <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Group Chat</div>
                          {['Yes', 'No'].map((option) => (
                            <div
                              key={option}
                              className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setFilters(prev => ({ ...prev, group_chat: prev.group_chat === option ? '' : option }));
                              }}
                            >
                              <Checkbox checked={filters.group_chat === option} />
                              <span className="text-sm">{option}</span>
                            </div>
                          ))}
                          {filters.group_chat && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full mt-2 text-xs"
                              onClick={() => setFilters(prev => ({ ...prev, group_chat: '' }))}
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                    {filters.group_chat && <FilterCountBadge count={1} />}
                  </div>
                </TableHead>
              )}
              {visibleColumns.in_house && (
                <TableHead className={`bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none ${addingNewOptionForRow ? 'w-80' : 'w-56'}`}>
                  <div className="flex items-center gap-1 cursor-pointer group">
                    <span>In-House</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[200px] p-0" align="start">
                        <div className="p-3">
                          <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter In-House</div>
                          {(dynamicFieldOptions.in_house || []).map((option) => (
                            <div
                              key={option}
                              className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const newInHouse = filters.in_house.includes(option)
                                  ? filters.in_house.filter(h => h !== option)
                                  : [...filters.in_house, option];
                                setFilters(prev => ({ ...prev, in_house: newInHouse }));
                              }}
                            >
                              <Checkbox checked={filters.in_house.includes(option)} />
                              <span className="text-sm">{option}</span>
                            </div>
                          ))}
                          {filters.in_house.length > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full mt-2 text-xs"
                              onClick={() => setFilters(prev => ({ ...prev, in_house: [] }))}
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <FilterCountBadge count={filters.in_house.length} />
                  </div>
                </TableHead>
              )}
              {visibleColumns.description && <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">Notes</TableHead>}
              {visibleColumns.wallet && <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">Wallet</TableHead>}
              {visibleColumns.telegram && <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">Telegram</TableHead>}
              {/* HHP Campaign Dashboard Spec § 4.3 (Tier 1) — Activations
                  column. Click any row's cell to open the per-KOL
                  participation breakdown. */}
              {visibleColumns.activations && <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none whitespace-nowrap">Activations</TableHead>}
              <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap text-right w-16">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="bg-white">
            {paginationData.paginatedKOLs.map((kol, index) => {
              const kolWithVerified = kol as MasterKOL & { verifiedFollowers?: boolean };
              const isChecked = selectedKOLs.includes(kol.id);
              return (
                <TableRow key={kol.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} hover:bg-cream-100 transition-colors border-b border-cream-200`}>
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} p-2 overflow-hidden text-center text-ink-warm-700 group sticky left-0 z-10`} style={{ verticalAlign: 'middle', width: 48, minWidth: 48, maxWidth: 48 }}>
                    <div className="flex items-center justify-center w-full h-full">
                      {isChecked ? (
                        <Checkbox
                          checked={true}
                          onCheckedChange={checked => {
                            if (checked) {
                              setSelectedKOLs(prev => Array.from(new Set([...prev, kol.id])));
                            } else {
                              setSelectedKOLs(prev => prev.filter(id => id !== kol.id));
                            }
                          }}
                          className="mx-auto"
                        />
                      ) : (
                        <>
                          <span className="block group-hover:hidden w-full text-center">{index + 1}</span>
                          <span className="hidden group-hover:flex w-full justify-center">
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={checked => {
                                if (checked) {
                                  setSelectedKOLs(prev => Array.from(new Set([...prev, kol.id])));
                                } else {
                                  setSelectedKOLs(prev => prev.filter(id => id !== kol.id));
                                }
                              }}
                              className="mx-auto"
                            />
                          </span>
                        </>
                      )}
                    </div>
                  </TableCell>
                  {visibleColumns.name && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden sticky left-[48px] z-10`} style={{ boxShadow: '-1px 0 0 0 #e5e7eb, 2px 0 4px -2px rgba(0,0,0,0.1)' }}>
                      <div className="truncate flex items-center gap-1.5">
                        {/* Avatar chip — visible whenever profile_picture_url
                            is synced. Cheap object-cover thumbnail on the
                            left of the name. Per KOL-AVATAR.4 follow-up. */}
                        {kol.profile_picture_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={kol.profile_picture_url}
                            alt=""
                            className="w-6 h-6 rounded-full object-cover flex-shrink-0 border border-cream-200"
                          />
                        )}
                        {(() => {
                          const isStale = kol.updated_at ?
                            (Date.now() - new Date(kol.updated_at).getTime()) > (90 * 24 * 60 * 60 * 1000) :
                            false;
                          return (
                            <>
                              {isStale && (
                                <span className="text-rose-500 font-bold" title="Not updated in 90+ days">!</span>
                              )}
                              {renderEditableCell(kol.name, 'name', kol.id, 'text')}
                              {/* Expand icon — opens the profile modal
                                  (Deliverables + Call Logs + Overview).
                                  Phase 2 of the May 2026 KOL overhaul.
                                  Sits AFTER the inline-editable name so
                                  double-click-to-rename still works on
                                  the name itself. */}
                              <button
                                type="button"
                                onClick={() => setProfileModalKol(kol)}
                                className="ml-1 opacity-40 hover:opacity-100 transition-opacity flex-shrink-0"
                                title="Open KOL profile (deliverables + call logs)"
                              >
                                <Maximize2 className="h-3 w-3 text-ink-warm-700" />
                              </button>
                            </>
                          );
                        })()}
                      </div>
                  </TableCell>
                  )}
                  {visibleColumns.link && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden`}>
                      <div className="truncate">{renderEditableCell(kol.link, 'link', kol.id, 'text')}</div>
                  </TableCell>
                  )}
                  {visibleColumns.platform && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-visible`}>
                    <div>{renderEditableCell(kol.platform, 'platform', kol.id, 'multiselect')}</div>
                  </TableCell>
                  )}
                  {visibleColumns.followers && (
                    <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden`}>
                      <div className="truncate">{renderEditableCell(kol.followers, 'followers', kol.id, 'number')}</div>
                  </TableCell>
                  )}
                  {visibleColumns.region && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-visible`}>
                    <div>{renderEditableCell(kol.region, 'region', kol.id, 'select')}</div>
                  </TableCell>
                  )}
                  {visibleColumns.creator_type && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-visible`}>
                      <div>{renderEditableCell(kol.creator_type, 'creator_type', kol.id, 'multiselect')}</div>
                  </TableCell>
                  )}
                  {visibleColumns.niche && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-visible`}>
                      <div>{renderEditableCell(kol.niche, 'niche', kol.id, 'multiselect')}</div>
                  </TableCell>
                  )}
                  {visibleColumns.content_type && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-visible`}>
                    <div>{renderEditableCell(kol.content_type, 'content_type', kol.id, 'multiselect')}</div>
                  </TableCell>
                  )}
                  {visibleColumns.deliverables && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-visible`}>
                      <div>{renderEditableCell(kol.deliverables, 'deliverables', kol.id, 'multiselect')}</div>
                  </TableCell>
                  )}
                  {visibleColumns.pricing && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-visible`}>
                    <div>{renderEditableCell(kol.pricing, 'pricing', kol.id, 'select')}</div>
                  </TableCell>
                  )}
                  {visibleColumns.latest_cost && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden`}>
                    <div className="truncate text-sm">
                      {latestCostMap.has(kol.id) ? (
                        <button
                          className="text-brand hover:underline cursor-pointer"
                          onClick={() => {
                            const entry = latestCostMap.get(kol.id)!;
                            if (entry.campaignSlug) {
                              router.push(`/campaigns/${entry.campaignSlug}`);
                            }
                          }}
                        >
                          ${latestCostMap.get(kol.id)!.amount.toLocaleString()}
                        </button>
                      ) : '-'}
                    </div>
                  </TableCell>
                  )}
                  {/* Score: Doc 2 two-score blended display. Hover →
                      Channel/Campaign split per Jdot Q6c. Tier from
                      result.blended.tier (absolute bands S 85+ / A 70 /
                      B 50 / C 30 / D below). Distinct color treatment
                      when Campaign data is present (blended ≠ Channel
                      composite) per Doc 2 §5. */}
                  {visibleColumns.score && (() => {
                    const result = scoreMap.get(kol.id);
                    return (
                      <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden`}>
                        {result ? (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="inline-flex items-center gap-1.5 cursor-default">
                                  <span className={`text-sm font-semibold tabular-nums ${result.blended.activated ? 'text-brand-dark' : 'text-ink-warm-900'}`}>
                                    {Math.round(result.blended.displayed)}
                                  </span>
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${TIER_CLASSES[result.blended.tier]}`}>
                                    {result.blended.tier}
                                  </span>
                                  {result.blended.lowConfidence && <span className="text-[9px] text-amber-700" title="Low organic volume">⚠</span>}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="text-xs">
                                <div>Channel {Math.round(result.blended.channel)}</div>
                                {result.blended.activated && result.blended.campaign != null && (
                                  <div>Campaign {Math.round(result.blended.campaign)}</div>
                                )}
                                {!result.blended.activated && (
                                  <div className="text-ink-warm-400 mt-0.5">Channel-only (needs 3+ deliverables for Campaign Performance)</div>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <div
                            className="text-xs text-ink-warm-400"
                            title="Score loading..."
                          >
                            —
                          </div>
                        )}
                      </TableCell>
                    );
                  })()}
                  {/* Projects: auto-derived from campaign_kols (NOT the
                      manual projects_worked_together column). Each chip
                      links to the campaign — quick pivot from "who is
                      this KOL" to "what work has she done with us." */}
                  {visibleColumns.projects && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden`}>
                    <div className="flex flex-wrap gap-1 max-w-[260px]">
                      {(projectsMap.get(kol.id) || []).length > 0 ? (
                        (projectsMap.get(kol.id) || []).slice(0, 5).map((p, i) => (
                          p.slug ? (
                            <a
                              key={i}
                              href={`/campaigns/${p.slug}`}
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                              title={p.name}
                            >
                              {p.name}
                            </a>
                          ) : (
                            <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-cream-100 text-ink-warm-700" title={p.name}>
                              {p.name}
                            </span>
                          )
                        ))
                      ) : (
                        <span className="text-ink-warm-400 text-xs">-</span>
                      )}
                      {(projectsMap.get(kol.id) || []).length > 5 && (
                        <span className="text-ink-warm-500 text-[10px]" title={(projectsMap.get(kol.id) || []).slice(5).map(p => p.name).join(', ')}>
                          +{(projectsMap.get(kol.id) || []).length - 5}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  )}
                  {visibleColumns.community && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden`}>
                    <div className="flex items-center gap-2">
                      {renderEditableCell(kol.community, 'community', kol.id, 'boolean')}
                      {/* Show the community link inline when the toggle is
                          on. Lets the team paste a URL without opening a
                          separate dialog. Empty when null. */}
                      {kol.community && (
                        <a
                          href={kol.community_link || undefined}
                          target="_blank"
                          rel="noreferrer"
                          className={`text-xs underline truncate max-w-[120px] ${kol.community_link ? 'text-blue-600 hover:text-blue-800' : 'text-ink-warm-400 pointer-events-none'}`}
                          title={kol.community_link || 'No link set'}
                        >
                          {kol.community_link ? 'link' : '(no link)'}
                        </a>
                      )}
                    </div>
                  </TableCell>
                  )}
                  {visibleColumns.group_chat && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden`}>
                    <div className="truncate">{renderEditableCell(kol.group_chat, 'group_chat', kol.id, 'boolean')}</div>
                  </TableCell>
                  )}
                  {visibleColumns.in_house && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 ${addingNewOptionForRow === kol.id ? 'overflow-visible w-80' : 'overflow-hidden w-56'}`}>
                    <div className={addingNewOptionForRow === kol.id ? '' : 'truncate'}>{renderEditableCell(kol.in_house, 'in_house', kol.id, 'select')}</div>
                  </TableCell>
                  )}
                  {visibleColumns.description && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2`}>
                      <div className="min-w-[300px] max-w-2xl whitespace-pre-wrap break-words">{renderEditableCell(kol.description, 'description', kol.id, 'text')}</div>
                  </TableCell>
                  )}
                  {visibleColumns.wallet && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden`}>
                      <div className="truncate">{renderEditableCell(kol.wallet, 'wallet', kol.id, 'text')}</div>
                  </TableCell>
                  )}
                  {visibleColumns.telegram && (
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden`}>
                      {kolTelegramChats[kol.id] ? (
                        <a
                          href={`/crm/telegram?tab=kols`}
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                        >
                          <MessageSquare className="h-3 w-3" />
                          <span className="text-xs truncate max-w-24" title={kolTelegramChats[kol.id].title || 'Linked Chat'}>
                            {kolTelegramChats[kol.id].title || 'Linked Chat'}
                          </span>
                        </a>
                      ) : (
                        <span className="text-ink-warm-400 text-xs">-</span>
                      )}
                  </TableCell>
                  )}
                  {/* HHP Campaign Dashboard Spec § 4.3 (Tier 1) — Activations
                      cell. Renders a brand chip "N · Xk" when this KOL has
                      participated, dash otherwise. Click opens the detail
                      dialog with per-activation breakdown. */}
                  {visibleColumns.activations && (() => {
                    const agg = kolActivations.get(kol.id);
                    return (
                      <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden`}>
                        {agg && agg.activations > 0 ? (
                          <button
                            type="button"
                            onClick={() => setActivationsDialogKolId(kol.id)}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-brand/10 text-brand hover:bg-brand/20 transition-colors"
                            title="View activation participation"
                          >
                            <Activity className="h-3 w-3" />
                            <span className="tabular-nums">
                              {agg.activations} · {agg.totalEntries >= 1000
                                ? `${(agg.totalEntries / 1000).toFixed(1).replace(/\.0$/, '')}K`
                                : agg.totalEntries.toLocaleString()}
                            </span>
                          </button>
                        ) : (
                          <span className="text-ink-warm-400 text-xs">-</span>
                        )}
                      </TableCell>
                    );
                  })()}
                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} p-2 overflow-hidden text-right w-16`}>
                    <div className="flex space-x-1 justify-end">
                      <Button size="sm" variant="outline" onClick={() => handleDelete(kol.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      {paginationData.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pb-14 px-4">
          <div className="text-sm text-ink-warm-700">
            Showing {paginationData.startIndex + 1}-{Math.min(paginationData.endIndex, paginationData.totalItems)} of {paginationData.totalItems} KOLs
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="flex items-center gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, paginationData.totalPages) }, (_, i) => {
                let pageNum: number;
                if (paginationData.totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= paginationData.totalPages - 2) {
                  pageNum = paginationData.totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? 'brand' : 'outline'}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
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
              onClick={() => setCurrentPage(prev => Math.min(paginationData.totalPages, prev + 1))}
              disabled={currentPage === paginationData.totalPages}
              className="flex items-center gap-1"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {filteredKOLs.length === 0 && (() => {
        const hasFilters = searchTerm || Object.values(filters).some(value =>
          (typeof value === 'string' && value !== '') ||
          (Array.isArray(value) && value.length > 0)
        );
        return (
          <EmptyState
            icon={Crown}
            title={hasFilters ? 'No KOLs found' : 'No KOLs yet'}
            description={hasFilters
              ? 'Could not find KOLs with the selected filters. Try clearing them.'
              : 'Start by adding your first KOL.'}
          />
        );
      })()}
      {/* KOL Profile modal — Phase 2 of the May 2026 KOL overhaul.
          Lifted out of any inline render path so opening it doesn't
          re-mount on every row update. */}
      <KolProfileModal
        kol={profileModalKol}
        isOpen={profileModalKol !== null}
        onClose={() => setProfileModalKol(null)}
        onKolChanged={(updated) => {
          // Keep the list in sync with edits made in the modal (notes
          // field). Optimistic — we already trust the modal's save call.
          setKols((prev) => prev.map((k) => (k.id === updated.id ? updated : k)));
          setProfileModalKol(updated);
        }}
        // Score breakdown lives on the modal's own Score tab — it
        // fetches /api/kols/[id]/score directly, no need to thread the
        // value through. Modal still notifies us on snapshot/deliverable
        // edits so /kols can refresh its Score column.
        onMetricsChanged={() => setScoreRefreshNonce((n) => n + 1)}
      />

      {/* HHP Campaign Dashboard Spec § 4.3 (Tier 1) — activation participation
          detail dialog. Opens when any Activations chip is clicked. */}
      <KolActivationsDialog
        open={activationsDialogKolId !== null}
        onClose={() => setActivationsDialogKolId(null)}
        kolId={activationsDialogKolId}
        kolName={kols.find(k => k.id === activationsDialogKolId)?.name}
      />

      {/* 4. Add Dialog for single delete at the bottom of the component */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Archive KOL</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-ink-warm-700 mt-2 mb-2">Are you sure you want to archive this KOL? You can restore it later from the Archive page.</div>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              setShowDeleteDialog(false);
              if (!kolToDelete) return;
              const kolToDeleteObj = kols.find(k => k.id === kolToDelete);
              if (!kolToDeleteObj) return;
              setKols(prevKols => prevKols.filter(k => k.id !== kolToDelete));
              try {
                await KOLService.archiveKOL(kolToDelete);
                toast({
                  title: 'KOL archived',
                  description: 'You can restore it from the Archive page.',
                  duration: 3000,
                });
              } catch (error) {
                console.error('Error archiving KOL:', error);
                setKols(prevKols => [...prevKols, kolToDeleteObj]);
              }
              setKolToDelete(null);
            }}>Archive</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* 5. Add Dialog for bulk delete at the bottom of the component */}
      <Dialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Archive KOLs</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-ink-warm-700 mt-2 mb-2">Are you sure you want to archive {selectedKOLs.length} KOL{selectedKOLs.length !== 1 ? 's' : ''}? You can restore them from the Archive page.</div>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setShowBulkDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              setShowBulkDeleteDialog(false);
              const toArchive = selectedKOLs;
              setKols(prev => prev.filter(kol => !toArchive.includes(kol.id)));
              await Promise.all(toArchive.map(kolId => KOLService.archiveKOL(kolId)));
              toast({
                title: 'KOLs archived',
                description: `${toArchive.length} KOL${toArchive.length !== 1 ? 's' : ''} archived.`,
                duration: 3000,
              });
              setSelectedKOLs([]);
            }}>Archive</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sticky Horizontal Scrollbar */}
      {stickyScrollbar && (
        <div
          className="fixed bottom-4 bg-white border border-cream-200 shadow-lg z-40 flex items-center rounded-lg transition-opacity duration-300"
          style={{
            height: '32px',
            opacity: stickyScrollbar.opacity,
            left: '50%',
            transform: 'translateX(-50%)',
            width: `${stickyScrollbar.width}px`
          }}
        >
          <div
            className="overflow-x-scroll hover:overflow-x-scroll rounded-lg"
            style={{
              width: '100%',
              height: '100%',
              scrollbarWidth: 'thin',
              scrollbarColor: '#3e8692 #f3f4f6'
            }}
            onScroll={(e) => {
              const scrollLeft = e.currentTarget.scrollLeft;
              if (scrollableRef.current) {
                scrollableRef.current.scrollLeft = scrollLeft;
              }
            }}
            ref={(el) => {
              if (el && stickyScrollbar) {
                el.scrollLeft = stickyScrollbar.scrollLeft;
              }
            }}
          >
            <div style={{ width: `${stickyScrollbar.scrollWidth}px`, height: '1px' }}></div>
          </div>
        </div>
      )}
    </div>
  );
}

// Module-scope skeleton — see comment in main page component for context.
// Memoized so React's reconciler treats every instance as the same
// component type across re-renders (no remount on parent re-render).
//
/**
 * FilterCountBadge — tight 16px brand-light circle that sits next to
 * a column header when one or more filter values are active. Extracted
 * from 11 identical inline spans (one per filterable column) so the
 * chrome lives in one place: if we ever want to swap the pill style
 * (e.g. neutral when 0, brand when ≥1), it changes in one spot
 * instead of 11.
 */
function FilterCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-1 bg-brand-light text-brand text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
      {count}
    </span>
  );
}

// Props mirror the two state values it depends on inside the page:
//   - visibleColumns: which columns to render skeleton cells for
//   - addingNewOptionForRow: drives the In-House column's width variant
type KOLTableSkeletonProps = {
  visibleColumns: Record<string, boolean>;
  addingNewOptionForRow: string | null;
};

const KOLTableSkeleton = React.memo(function KOLTableSkeleton({
  visibleColumns,
  addingNewOptionForRow,
}: KOLTableSkeletonProps) {
  return (
    <div className="border rounded-lg overflow-auto">
      <Table className="min-w-max whitespace-nowrap">
        <TableHeader>
          <TableRow className="bg-cream-50 hover:bg-cream-50 border-b border-cream-200">
            <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 text-center whitespace-nowrap sticky left-0 z-20" style={{ width: 48, minWidth: 48, maxWidth: 48 }}>#</TableHead>
            {visibleColumns.name && <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 whitespace-nowrap sticky left-[48px] z-20" style={{ boxShadow: '-1px 0 0 0 #e5e7eb, 2px 0 4px -2px rgba(0,0,0,0.1)' }}>Name</TableHead>}
            {visibleColumns.link && <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 whitespace-nowrap">Link</TableHead>}
            {visibleColumns.platform && <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 whitespace-nowrap">Platform</TableHead>}
            {visibleColumns.followers && <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">Followers</TableHead>}
            {visibleColumns.region && <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">Region</TableHead>}
            {visibleColumns.creator_type && <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">Creator Type</TableHead>}
            {visibleColumns.niche && <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">Niche</TableHead>}
            {visibleColumns.content_type && <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">Content Type</TableHead>}
            {visibleColumns.deliverables && <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">Deliverables</TableHead>}
            {visibleColumns.pricing && <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">Pricing</TableHead>}
            {visibleColumns.latest_cost && <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">Pricing</TableHead>}
            {/* Score + Projects added per May 2026 KOL overhaul spec.
                Rating column removed (migration 071). Loading skeleton
                mirrors the live table so columns don't reflow on load. */}
            {visibleColumns.score && <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">Score</TableHead>}
            {visibleColumns.projects && <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">Projects</TableHead>}
            {visibleColumns.community && <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">Community Founder</TableHead>}
            {visibleColumns.group_chat && <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">Group Chat</TableHead>}
            {visibleColumns.in_house && <TableHead className={`bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none ${addingNewOptionForRow ? 'w-80' : 'w-56'}`}>In-House</TableHead>}
            {visibleColumns.description && <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">Notes</TableHead>}
            {visibleColumns.wallet && <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">Wallet</TableHead>}
            {visibleColumns.telegram && <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none">Telegram</TableHead>}
            {/* Skeleton header — matches the live table column. */}
            {visibleColumns.activations && <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 border-r border-cream-200 select-none whitespace-nowrap">Activations</TableHead>}
            <TableHead className="bg-cream-50 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap text-right w-16">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="bg-white">
          {Array.from({ length: 8 }).map((_, index) => (
            <TableRow key={index} className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-b border-cream-200`}>
              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden text-center w-12`}><Skeleton className="h-4 w-6 mx-auto" /></TableCell>
              {visibleColumns.name && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden w-32`}><Skeleton className="h-4 w-full" /></TableCell>}
              {visibleColumns.link && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden w-24`}><Skeleton className="h-4 w-full" /></TableCell>}
              {visibleColumns.platform && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden w-24`}><div className="flex flex-nowrap gap-1 items-center w-full"><Skeleton className="h-5 w-5 rounded-full" /><Skeleton className="h-5 w-5 rounded-full" /></div></TableCell>}
              {visibleColumns.followers && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden w-20`}><Skeleton className="h-4 w-full" /></TableCell>}
              {visibleColumns.region && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden w-28`}><div className="flex items-center gap-1 w-full"><Skeleton className="h-4 w-4 rounded" /><Skeleton className="h-4 w-20" /></div></TableCell>}
              {visibleColumns.creator_type && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden w-20`}><Skeleton className="h-6 w-full rounded-full" /></TableCell>}
              {visibleColumns.niche && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden w-32`}><div className="flex flex-nowrap gap-1 w-full"><Skeleton className="h-6 w-14 rounded-md" /><Skeleton className="h-6 w-16 rounded-md" /></div></TableCell>}
              {visibleColumns.content_type && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden w-32`}><div className="flex flex-nowrap gap-1 w-full"><Skeleton className="h-6 w-16 rounded-md" /><Skeleton className="h-6 w-20 rounded-md" /></div></TableCell>}
              {visibleColumns.deliverables && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden w-32`}><div className="flex flex-nowrap gap-1 w-full"><Skeleton className="h-6 w-18 rounded-md" /><Skeleton className="h-6 w-16 rounded-md" /><Skeleton className="h-6 w-14 rounded-md" /></div></TableCell>}
              {visibleColumns.pricing && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden w-20`}><Skeleton className="h-4 w-full" /></TableCell>}
              {visibleColumns.latest_cost && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden w-24`}><Skeleton className="h-4 w-full" /></TableCell>}
              {visibleColumns.score && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden w-20`}><Skeleton className="h-4 w-12" /></TableCell>}
              {visibleColumns.projects && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden w-40`}><div className="flex flex-nowrap gap-1 w-full"><Skeleton className="h-5 w-16 rounded" /><Skeleton className="h-5 w-12 rounded" /></div></TableCell>}
              {visibleColumns.community && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden w-20`}><Skeleton className="h-6 w-full rounded-full" /></TableCell>}
              {visibleColumns.group_chat && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden w-20`}><Skeleton className="h-6 w-full rounded-full" /></TableCell>}
              {visibleColumns.in_house && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden ${addingNewOptionForRow ? 'w-80' : 'w-56'}`}><Skeleton className="h-6 w-full rounded-full" /></TableCell>}
              {visibleColumns.description && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden w-40`}><Skeleton className="h-4 w-full" /></TableCell>}
              {visibleColumns.wallet && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden w-40`}><Skeleton className="h-4 w-full" /></TableCell>}
              {visibleColumns.telegram && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden w-24`}><Skeleton className="h-4 w-full" /></TableCell>}
              {/* Skeleton chip placeholder — matches the live "N · X.X K" pill width. */}
              {visibleColumns.activations && <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden w-24`}><Skeleton className="h-5 w-16 rounded" /></TableCell>}
              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} p-2 overflow-hidden w-16 text-right`}><div className="flex space-x-1 w-full justify-end"><Skeleton className="h-8 w-8 rounded" /><Skeleton className="h-8 w-8 rounded" /></div></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}); 