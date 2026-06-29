'use client';

/**
 * KolDashboardTableView — the Table view of the KOL Dashboard tab.
 * The heaviest single sub-piece in the campaign-detail refactor (was
 * ~1,150 lines inline on the page). Owns:
 *
 * - Active/Hidden visibility tab switch (delegated via prop because
 *   the page's `filteredKOLs` derivation needs to see the active
 *   value to share with the Cards view).
 * - Search input.
 * - Bulk-actions toolbar (Select All, bulk status, bulk hide/unhide,
 *   bulk delete).
 * - Column sort (`kolSort` is internal here — Cards view doesn't sort).
 * - Per-column filter dropdowns (multi-select chips + numeric
 *   operator/value pairs).
 * - The `<Table>` itself, with inline-edit on the text/number
 *   fields and select-on-click on status/budget-type.
 * - The KOL delete confirmation dialog.
 *
 * Shared concerns (cell-selection state, pricing-suggestion dialog,
 * Payment Terms dialog, toast, campaign data) come from
 * `useCampaignDetail()` — see the context for the full surface.
 *
 * Page-owned state (`searchTerm`, `kolVisibilityTab`, `kolFilters`)
 * stays on the page because `filteredKOLs` derives from all three;
 * passing both views the same derived list keeps the two view-modes
 * in lockstep.
 *
 * 2026-06-02 — Extracted from `app/campaigns/[id]/page.tsx` as the
 * final big sub-piece of the KOL Dashboard tab body. Cell-selection
 * helpers + Payment Terms helpers were added to the context in the
 * same commit to support this extraction.
 */

import { useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  Edit,
  Eye,
  EyeOff,
  FileText,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { CampaignService } from '@/lib/campaignService';
import {
  CampaignKOLService,
  type CampaignKOLWithDetails,
} from '@/lib/campaignKolService';
import { KOLService, type MasterKOL } from '@/lib/kolService';
import {
  getContentTypeColor,
  getCreatorTypeColor,
  getNewContentTypeColor,
  getPlatformIcon,
  getPricingColor,
  getRegionIcon,
} from '@/lib/campaignHelpers';
import { useCampaignDetail } from '@/contexts/CampaignDetailContext';
import { MultiSelect } from '@/components/campaign/MultiSelect';
import type { KolFilters } from '@/components/campaign/KolDashboardCardsView';

// ───────────────────────────────────────────────────────────────────
// Sort machinery — moved here from page module level since it's only
// used by the table view.
// ───────────────────────────────────────────────────────────────────

/** Columns the user can sort the KOL Dashboard table by. */
type KolSortKey =
  | 'name' | 'followers' | 'region' | 'platform' | 'creator_type'
  | 'content_type' | 'deliverables' | 'pricing' | 'hh_status' | 'budget_type'
  | 'budget' | 'paid' | 'date_added';

/** KOL workflow stages, in journey order. Used so default sort
 *  on `hh_status` produces Curated → Contacted → Interested →
 *  Onboarded → Concluded (the natural pipeline order), not
 *  alphabetical (which would surface Concluded ahead of Onboarded). */
const KOL_STATUS_ORDER = ['Curated', 'Contacted', 'Interested', 'Onboarded', 'Concluded'] as const;
const statusOrderIndex = (s: string | null | undefined): number => {
  if (!s) return KOL_STATUS_ORDER.length;
  const idx = KOL_STATUS_ORDER.indexOf(s as any);
  return idx === -1 ? KOL_STATUS_ORDER.length : idx;
};

function compareKolByColumn(a: any, b: any, key: KolSortKey): number {
  const pull = (row: any) => {
    switch (key) {
      case 'name':         return row.master_kol?.name || '';
      case 'followers':    return row.master_kol?.followers ?? null;
      case 'region':       return row.master_kol?.region || '';
      case 'platform':     return (row.master_kol?.platform || []).join(', ');
      case 'creator_type': return (row.master_kol?.creator_type || []).join(', ');
      case 'content_type': return (row.master_kol?.content_type || []).join(', ');
      case 'deliverables': return (row.deliverables || row.master_kol?.deliverables || []).join(', ');
      case 'pricing':      return row.master_kol?.pricing || '';
      case 'hh_status':    return statusOrderIndex(row.hh_status);
      case 'budget_type':  return row.budget_type || '';
      case 'budget':       return row.budget ?? null;
      case 'paid':         return row.paid ?? null;
      case 'date_added':   return row.created_at ? new Date(row.created_at).getTime() : null;
      default:             return '';
    }
  };
  const av = pull(a);
  const bv = pull(b);

  // Missing values bucket to the end (asc) / top (desc later via dir flip).
  const aMissing = av === null || av === undefined || av === '';
  const bMissing = bv === null || bv === undefined || bv === '';
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;

  if (typeof av === 'number' && typeof bv === 'number') return av - bv;
  return String(av).localeCompare(String(bv));
}

/** Local v1 of getStatusColor — same className map the page used
 *  for the inline `<Select>` background tint on the status cell. */
function getStatusColor(status: string): string {
  switch (status) {
    case 'Curated':    return 'bg-sky-100 text-sky-800';
    case 'Contacted':  return 'bg-purple-100 text-purple-800';
    case 'Interested': return 'bg-amber-100 text-amber-800';
    case 'Onboarded':  return 'bg-amber-100 text-amber-800';
    case 'Concluded':  return 'bg-emerald-100 text-emerald-800';
    default:           return 'bg-cream-100 text-ink-warm-700';
  }
}

// ───────────────────────────────────────────────────────────────────
// Component props
// ───────────────────────────────────────────────────────────────────

interface KolDashboardTableViewProps {
  /** Derived list from page (filtered by searchTerm + kolFilters +
   *  kolVisibilityTab). Sorted internally based on `kolSort`. */
  filteredKOLs: any[];
  loadingKOLs: boolean;
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  kolVisibilityTab: 'active' | 'hidden';
  setKolVisibilityTab: React.Dispatch<React.SetStateAction<'active' | 'hidden'>>;
  kolFilters: KolFilters;
  setKolFilters: React.Dispatch<React.SetStateAction<KolFilters>>;
}

export function KolDashboardTableView({
  filteredKOLs,
  loadingKOLs,
  searchTerm,
  setSearchTerm,
  kolVisibilityTab,
  setKolVisibilityTab,
  kolFilters,
  setKolFilters,
}: KolDashboardTableViewProps) {
  const {
    campaign,
    setCampaign,
    campaignKOLs,
    setCampaignKOLs,
    contents,
    payments,
    latestCostMap,
    fetchCampaignKOLs,
    fetchAvailableKOLs,
    fetchContents,
    fetchPayments,
    setPricingSuggestionDialog,
    openPaymentTermsForKol,
    setPaymentTermsQueue,
    openMasterKolEditDialog,
    setActiveTab,
    setContentsSearchTerm,
    getCellClassName,
    handleCellSelect,
    toast,
  } = useCampaignDetail();

  const fieldOptions = KOLService.getFieldOptions();

  // ── Internal state ──────────────────────────────────────────────
  const [selectedKOLs, setSelectedKOLs] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<CampaignKOLWithDetails['hh_status'] | ''>('');
  const [editingKolCell, setEditingKolCell] = useState<{ kolId: string; field: string } | null>(null);
  const [editingKolValue, setEditingKolValue] = useState<any>(null);
  const [kolsToDelete, setKolsToDelete] = useState<string[]>([]);
  const [showKOLDeleteDialog, setShowKOLDeleteDialog] = useState(false);
  // [2026-06-05] Hidden KOL just got moved to Onboarded → prompt the
  // user to also unhide them. The Projects field on /kols filters out
  // hidden links, so an onboarded-but-still-hidden KOL would silently
  // not show up on that KOL's row. Almost always a mistake; almost
  // always the user wants to unhide. We ask rather than auto-toggle
  // because there are legitimate edge cases (e.g. onboarding a KOL we
  // still want suppressed from the public dashboard temporarily).
  const [unhidePromptKol, setUnhidePromptKol] = useState<CampaignKOLWithDetails | null>(null);
  const [unhiding, setUnhiding] = useState(false);
  const [kolSort, setKolSort] = useState<{ key: KolSortKey | null; dir: 'asc' | 'desc' }>({ key: 'hh_status', dir: 'asc' });
  const kolTableRef = useRef<HTMLDivElement>(null);

  // Second cell-edit slot — distinct from `editingKolCell` because the
  // `followers` cell (master_kol field) lives outside the
  // campaign_kols row update path and needs its own edit handler.
  const [editingCell, setEditingCell] = useState<{ row: string; field: string } | null>(null);
  const [editingValue, setEditingValue] = useState<any>(null);

  // Section 5 of HHP Campaign Dashboard Spec — Profile note edit.
  // Mirrors the notes editor pattern below but writes to
  // campaign_kols.profile_note so it appears on the public KOL
  // Dashboard's Profile subtitle.
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState<{ [key: string]: string }>({});
  const handleProfileChange = (kolId: string, value: string) => {
    setEditingProfile(prev => ({ ...prev, [kolId]: value }));
  };
  const handleProfileSave = async (kolId: string) => {
    const next = editingProfile[kolId];
    if (next === undefined) {
      setEditingProfileId(null);
      return;
    }
    try {
      await CampaignKOLService.updateCampaignKOL(kolId, { profile_note: next || null } as any);
      setCampaignKOLs(prev => prev.map(k => k.id === kolId ? { ...k, profile_note: next || null } : k));
    } catch (err) {
      console.error('Error saving profile_note:', err);
    }
    setEditingProfileId(null);
  };

  // Notes edit — uses a separate state slice because notes are
  // multi-line and have their own debounced save behaviour.
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<{ [key: string]: string }>({});

  // Quick-add-content inline popover state.
  const [quickAddContentKolId, setQuickAddContentKolId] = useState<string | null>(null);
  const [quickAddContentCount, setQuickAddContentCount] = useState(1);

  // ── Sorted view derived from filteredKOLs + internal kolSort ───
  const sortedKOLs = (() => {
    if (!kolSort.key) return filteredKOLs;
    const dir = kolSort.dir === 'asc' ? 1 : -1;
    return [...filteredKOLs]
      .map((kol, i) => ({ kol, i }))
      .sort((a, b) => {
        const cmp = compareKolByColumn(a.kol, b.kol, kolSort.key as KolSortKey);
        return cmp !== 0 ? cmp * dir : a.i - b.i;
      })
      .map(x => x.kol);
  })();

  // ── Sort helpers ────────────────────────────────────────────────
  const toggleKolSort = (key: KolSortKey) => {
    setKolSort(prev => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: null, dir: 'asc' };
    });
  };

  const kolSortIndicator = (key: KolSortKey) => {
    if (kolSort.key !== key) {
      return <ArrowUpDown className="inline-block h-3 w-3 ml-1 opacity-30" />;
    }
    return kolSort.dir === 'asc'
      ? <ArrowUp className="inline-block h-3 w-3 ml-1" />
      : <ArrowDown className="inline-block h-3 w-3 ml-1" />;
  };

  // ── Inline cell-edit handlers ──────────────────────────────────
  const handleKolCellSaveImmediate = async (kol: any, field: string, newValue: any) => {
    const updatedKOLs = campaignKOLs.map(k => k.id === kol.id ? { ...k, [field]: newValue } : k);
    setCampaignKOLs(updatedKOLs);

    try {
      await supabase.from('campaign_kols').update({ [field]: newValue } as any).eq('id', kol.id);
    } catch (err) {
      console.error('Error updating KOL:', err);
    }

    // Auto-complete the campaign when every KOL is concluded.
    if (field === 'hh_status' && newValue === 'Concluded' && campaign?.status !== 'Completed') {
      const allConcluded = updatedKOLs.every(k => k.hh_status === 'Concluded');
      if (allConcluded && updatedKOLs.length > 0) {
        try {
          await CampaignService.updateCampaign(campaign!.id, { status: 'Completed' });
          setCampaign(prev => prev ? { ...prev, status: 'Completed' } : null);
        } catch (err) {
          console.error('Error auto-updating campaign status to Completed:', err);
        }
      }
    }

    // Prompt for payment terms when a KOL is newly onboarded.
    if (field === 'hh_status' && newValue === 'Onboarded') {
      openPaymentTermsForKol(kol.id, updatedKOLs);
      // If this KOL was hidden, prompt to unhide. The Projects field
      // on /kols filters hidden links, so onboarded-but-hidden is
      // almost certainly a mistake. Reads from `kol` (pre-update
      // snapshot) since hidden didn't change in this transition.
      if (kol.hidden === true) {
        setUnhidePromptKol(kol);
      }
    }

    setEditingKolCell(null);
    setEditingKolValue(null);
  };

  const handleKolCellSave = async () => {
    if (!editingKolCell) return;
    const { kolId, field } = editingKolCell;
    const kolToUpdate = campaignKOLs.find(k => k.id === kolId);
    if (!kolToUpdate) return;
    await handleKolCellSaveImmediate(kolToUpdate, field, editingKolValue);
  };

  const handleKolCellCancel = () => {
    setEditingKolCell(null);
    setEditingKolValue(null);
  };

  const renderEditableKolCell = (value: any, field: string, kol: any) => {
    const isEditing = editingKolCell?.kolId === kol.id && editingKolCell?.field === field;
    const textFields = ['notes', 'wallet_address'];
    const numberFields = ['allocated_budget'];
    const selectFields = ['hh_status', 'budget_type'];

    if (selectFields.includes(field)) {
      let options: string[] = [];
      let getColorClass = () => '';
      if (field === 'hh_status') {
        options = ['Curated', 'Contacted', 'Interested', 'Onboarded', 'Concluded'];
        getColorClass = () => value ? getStatusColor(value) : 'bg-cream-100 text-ink-warm-700';
      } else if (field === 'budget_type') {
        options = ['Token', 'Fiat', 'WL'];
      }

      return (
        <Select value={value || ''} onValueChange={async v => {
          setEditingKolCell({ kolId: kol.id, field });
          setEditingKolValue(v);
          await handleKolCellSaveImmediate(kol, field, v);
        }}>
          <SelectTrigger
            className={`border-none shadow-none bg-transparent w-auto h-auto px-2 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none ${field === 'hh_status' ? getColorClass() : ''}`}
            style={{ outline: 'none', boxShadow: 'none', minWidth: 90 }}
          >
            <SelectValue>
              {field === 'hh_status' && value ? (
                <span>{value}</span>
              ) : field === 'budget_type' && value ? (
                <span>{value}</span>
              ) : value || '-'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {options.map(option => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (isEditing && (textFields.includes(field) || numberFields.includes(field))) {
      return (
        <Input
          type={numberFields.includes(field) ? 'number' : 'text'}
          value={editingKolValue ?? ''}
          onChange={e => setEditingKolValue(e.target.value)}
          onBlur={handleKolCellSave}
          onKeyDown={e => {
            if (e.key === 'Enter') handleKolCellSave();
            if (e.key === 'Escape') handleKolCellCancel();
          }}
          className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none"
          style={{ outline: 'none', boxShadow: 'none', userSelect: 'text' }}
          autoFocus
        />
      );
    }

    return (
      <div
        className="cursor-pointer w-full h-full flex items-center px-1 py-1"
        onDoubleClick={() => {
          if (textFields.includes(field) || numberFields.includes(field)) {
            setEditingKolCell({ kolId: kol.id, field });
            setEditingKolValue(value);
          }
        }}
        title={textFields.includes(field) || numberFields.includes(field) ? 'Double-click to edit' : undefined}
      >
        {numberFields.includes(field) && value ? Number(value).toLocaleString() : (value || '-')}
      </div>
    );
  };

  // ── Local helpers for delete + hide ────────────────────────────
  const handleDeleteKOL = async (kolId: string) => {
    try {
      await CampaignKOLService.deleteCampaignKOL(kolId);
      fetchCampaignKOLs();
      fetchAvailableKOLs();
    } catch (error) {
      console.error('Error deleting KOL:', error);
    }
  };

  const handleUpdateKOLStatus = async (kolId: string, status: 'Curated' | 'Contacted' | 'Interested' | 'Onboarded' | 'Concluded') => {
    try {
      await CampaignKOLService.updateCampaignKOL(kolId, { hh_status: status });
      const updatedKOLs = campaignKOLs.map(kol => kol.id === kolId ? { ...kol, hh_status: status } : kol);
      setCampaignKOLs(updatedKOLs);

      // Newly-onboarded KOL with no rate yet → prompt for payment terms.
      if (status === 'Onboarded') {
        openPaymentTermsForKol(kolId, updatedKOLs);
        // Also prompt to unhide if the KOL was hidden. See the
        // matching block in handleKolCellSaveImmediate for rationale.
        const wasHidden = campaignKOLs.find(k => k.id === kolId)?.hidden === true;
        if (wasHidden) {
          const target = updatedKOLs.find(k => k.id === kolId);
          if (target) setUnhidePromptKol(target);
        }
      }

      // Auto-complete the campaign when every KOL is concluded.
      if (status === 'Concluded' && campaign?.status !== 'Completed') {
        const allConcluded = updatedKOLs.every(k => k.hh_status === 'Concluded');
        if (allConcluded && updatedKOLs.length > 0) {
          await CampaignService.updateCampaign(campaign!.id, { status: 'Completed' });
          setCampaign(prev => prev ? { ...prev, status: 'Completed' } : null);
        }
      }
    } catch (error) {
      console.error('Error updating KOL status:', error);
    }
  };

  const handleToggleKOLHidden = async (kolId: string, hidden: boolean) => {
    try {
      await CampaignKOLService.updateCampaignKOL(kolId, { hidden } as any);
      setCampaignKOLs(prev => prev.map(kol => kol.id === kolId ? { ...kol, hidden } : kol));
    } catch (error) {
      console.error('Error updating KOL visibility:', error);
    }
  };

  const handleNotesChange = (kolId: string, value: string) => {
    setEditingNotes(prev => ({ ...prev, [kolId]: value }));
  };

  const handleNotesSave = async (kolId: string) => {
    const newNotes = editingNotes[kolId];
    if (newNotes === undefined) {
      setEditingNotesId(null);
      return;
    }
    try {
      await CampaignKOLService.updateCampaignKOL(kolId, { notes: newNotes });
      setCampaignKOLs(prev => prev.map(kol => kol.id === kolId ? { ...kol, notes: newNotes } : kol));
    } catch (error) {
      console.error('Error saving notes:', error);
    }
    setEditingNotesId(null);
  };

  return (
    <>
                {/* Active/Hidden Tab Switcher */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="inline-flex items-center rounded-md bg-cream-100 p-1 border border-cream-200">
                    <button
                      onClick={() => setKolVisibilityTab('active')}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                        kolVisibilityTab === 'active'
                          ? 'bg-white text-brand shadow-card'
                          : 'text-ink-warm-700 hover:text-ink-warm-900'
                      }`}
                    >
                      Active ({campaignKOLs.filter(k => !k.hidden).length})
                    </button>
                    <button
                      onClick={() => setKolVisibilityTab('hidden')}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                        kolVisibilityTab === 'hidden'
                          ? 'bg-white text-brand shadow-card'
                          : 'text-ink-warm-700 hover:text-ink-warm-900'
                      }`}
                    >
                      Hidden ({campaignKOLs.filter(k => k.hidden === true).length})
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-2">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ink-warm-400" />
                    <Input
                      placeholder="Search KOLs by name, region, or status..."
                      className="pl-10 focus-brand"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                {selectedKOLs.length > 0 && (
                <div className="mb-6 mt-6">
                  <div className="bg-white border border-cream-200 rounded-[14px] p-6 shadow-card">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-cream-500 rounded-full"></div>
                      <span className="text-sm font-semibold text-ink-warm-700">{selectedKOLs.length} KOL{selectedKOLs.length !== 1 ? 's' : ''} selected</span>
                    </div>
                    <div className="h-4 w-px bg-cream-300"></div>
                    <span className="text-xs text-ink-warm-700 font-medium">Bulk Edit Fields</span>
                  </div>
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="flex flex-col items-end justify-end">
                      <div className="h-5"></div>
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
                    <div className="min-w-[120px] flex flex-col items-end justify-end">
                      <span className="text-xs text-ink-warm-700 font-semibold mb-1 self-start">Status</span>
                      <div className="w-full flex items-center h-7 min-h-[28px] justify-start">
                        <Select value={bulkStatus || ''} onValueChange={(value: string) => setBulkStatus(value as CampaignKOLWithDetails['hh_status'] | "") }>
                          <SelectTrigger
                            className="border-none shadow-none bg-transparent h-7 px-0 py-0 text-xs font-semibold text-black focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none [&>span]:text-xs [&>span]:font-semibold [&>span]:text-black"
                            style={{ outline: 'none', boxShadow: 'none' }}
                          >
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {CampaignKOLService.getHHStatusOptions().map((status) => (
                              <SelectItem key={status} value={status || ''}>{status}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex flex-col items-end justify-end">
                        <div className="h-5"></div>
                        <Button
                          variant="brand"
                          size="sm"
                          className="whitespace-nowrap"
                          disabled={selectedKOLs.length === 0 || !bulkStatus}
                          onClick={async () => {
                            if (!bulkStatus || selectedKOLs.length === 0) return;
                            const updatedKOLs = campaignKOLs.map(kol => selectedKOLs.includes(kol.id) ? { ...kol, hh_status: bulkStatus } : kol);
                            setCampaignKOLs(updatedKOLs);
                            await Promise.all(selectedKOLs.map(kolId => CampaignKOLService.updateCampaignKOL(kolId, { hh_status: bulkStatus })));

                            // If bulk-onboarding, queue up payment terms dialogs
                            // for each KOL that doesn't already have an agreed_rate.
                            // The first one opens immediately; the rest fire as each closes.
                            if (bulkStatus === 'Onboarded') {
                              const needsTerms = selectedKOLs.filter(id => {
                                const k = updatedKOLs.find(x => x.id === id);
                                return k && (k.agreed_rate ?? null) === null;
                              });
                              if (needsTerms.length > 0) {
                                const [first, ...rest] = needsTerms;
                                setPaymentTermsQueue(rest);
                                openPaymentTermsForKol(first, updatedKOLs);
                              }
                            }

                            // Auto-update campaign status to Completed when all KOLs are concluded
                            if (bulkStatus === 'Concluded' && campaign?.status !== 'Completed') {
                              const allConcluded = updatedKOLs.every(k => k.hh_status === 'Concluded');
                              if (allConcluded && updatedKOLs.length > 0) {
                                try {
                                  await CampaignService.updateCampaign(campaign!.id, { status: 'Completed' });
                                  setCampaign(prev => prev ? { ...prev, status: 'Completed' } : null);
                                } catch (err) {
                                  console.error('Error auto-updating campaign status to Completed:', err);
                                }
                              }
                            }

                            setBulkStatus("");
                          }}
                        >
                          Apply
                        </Button>
                      </div>
                      <div className="flex flex-col items-end justify-end">
                        <div className="h-5"></div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="whitespace-nowrap"
                          disabled={selectedKOLs.length === 0}
                          onClick={async () => {
                            const newHiddenState = kolVisibilityTab === 'active';
                            setCampaignKOLs(prev => prev.map(kol => selectedKOLs.includes(kol.id) ? { ...kol, hidden: newHiddenState } : kol));
                            await Promise.all(selectedKOLs.map(kolId => CampaignKOLService.updateCampaignKOL(kolId, { hidden: newHiddenState })));
                            setSelectedKOLs([]);
                          }}
                        >
                          {kolVisibilityTab === 'active' ? <><EyeOff className="h-3 w-3 mr-1" /> Hide</> : <><Eye className="h-3 w-3 mr-1" /> Unhide</>}
                        </Button>
                      </div>
                      <div className="flex flex-col items-end justify-end">
                        <div className="h-5"></div>
                        <Button
                          size="sm"
                          variant="destructive" className="whitespace-nowrap"
                          disabled={selectedKOLs.length === 0}
                          onClick={() => {
                            setKolsToDelete(selectedKOLs);
                            setShowKOLDeleteDialog(true);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-ink-warm-500 font-medium ml-auto whitespace-nowrap">
                      {selectedKOLs.length > 0 && `${selectedKOLs.length} item${selectedKOLs.length !== 1 ? 's' : ''} selected`}
                    </div>
                  </div>
                  </div>
                </div>
                )}

                {loadingKOLs ? (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">KOL</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Followers</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Region</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Status</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Notes</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...Array(5)].map((_, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <div className="space-y-2">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-3 w-24" />
                              </div>
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-4 w-16" />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                <Skeleton className="h-4 w-4 rounded" />
                                <Skeleton className="h-4 w-20" />
                              </div>
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-8 w-24 rounded-md" />
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-4 w-32" />
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-8 w-8 rounded" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : campaignKOLs.length === 0 ? (
                  <div className="text-center py-8 text-ink-warm-500">
                    <Users className="h-12 w-12 mx-auto mb-4 text-ink-warm-300" />
                    <p className="text-lg font-medium mb-2">No KOLs assigned yet</p>
                    <p className="text-sm text-ink-warm-400">Add KOLs to this campaign to get started.</p>
                  </div>
                ) : (
                  <div ref={kolTableRef} className="border rounded-lg" style={{ position: 'relative', overflow: 'auto', overflowX: 'auto', overflowY: 'auto' }}>
                    <Table className="min-w-full" style={{
                      tableLayout: 'auto',
                      width: 'auto',
                      borderCollapse: 'collapse',
                      whiteSpace: 'nowrap'
                    }} suppressHydrationWarning>
                      <TableHeader>
                        <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 sticky left-0 z-20 bg-cream-50 text-center whitespace-nowrap group cursor-pointer hover:bg-cream-100 transition-colors px-4" style={{ minWidth: '60px', width: '60px', boxShadow: 'inset -1px 0 0 0 #d1d5db' }} onClick={() => {
                            const allIds = filteredKOLs.map(kol => kol.id);
                            if (allIds.every(id => selectedKOLs.includes(id))) {
                              setSelectedKOLs(prev => prev.filter(id => !allIds.includes(id)));
                            } else {
                              setSelectedKOLs(prev => Array.from(new Set([...prev, ...allIds])));
                            }
                          }}>
                            <span className="group-hover:hidden">#</span>
                            <Checkbox
                              className="hidden group-hover:inline-flex"
                              checked={filteredKOLs.length > 0 && filteredKOLs.every(kol => selectedKOLs.includes(kol.id))}
                            />
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 sticky bg-cream-50 text-left select-none z-20" style={{ left: '60px', boxShadow: 'inset -1px 0 0 0 #d1d5db' }}>
                            <button
                              type="button"
                              onClick={() => toggleKolSort('name')}
                              className="hover:underline inline-flex items-center font-medium"
                              title="Sort by KOL name"
                            >
                              KOL{kolSortIndicator('name')}
                            </button>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 group">
                              <button type="button" onClick={() => toggleKolSort('platform')} className="hover:underline inline-flex items-center" title="Sort by platform">
                                Platform{kolSortIndicator('platform')}
                              </button>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Platform</div>
                                    {['X','Telegram','YouTube','Facebook','TikTok'].map((platform) => (
                                      <div
                                        key={platform}
                                        className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
                                        onClick={() => {
                                          const newPlatforms = kolFilters.platform.includes(platform)
                                            ? kolFilters.platform.filter(p => p !== platform)
                                            : [...kolFilters.platform, platform];
                                          setKolFilters(prev => ({ ...prev, platform: newPlatforms }));
                                        }}
                                      >
                                        <Checkbox checked={kolFilters.platform.includes(platform)} />
                                        <div className="flex items-center gap-1" title={platform}>
                                          {getPlatformIcon(platform)}
                                        </div>
                                      </div>
                                    ))}
                                    {kolFilters.platform.length > 0 && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full mt-2 text-xs"
                                        onClick={() => setKolFilters(prev => ({ ...prev, platform: [] }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {kolFilters.platform.length > 0 && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  {kolFilters.platform.length}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 group">
                              <button type="button" onClick={() => toggleKolSort('followers')} className="hover:underline inline-flex items-center" title="Sort by followers">
                                Followers{kolSortIndicator('followers')}
                              </button>
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
                                        value={kolFilters.followers_operator}
                                        onValueChange={(value) => setKolFilters(prev => ({ ...prev, followers_operator: value }))}
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
                                        value={kolFilters.followers_value}
                                        onChange={(e) => setKolFilters(prev => ({ ...prev, followers_value: e.target.value }))}
                                        className="h-8 text-xs focus-brand"
                                      />
                                    </div>
                                    {(kolFilters.followers_operator || kolFilters.followers_value) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setKolFilters(prev => ({ ...prev, followers_operator: '', followers_value: '' }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {(kolFilters.followers_operator && kolFilters.followers_value) && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  1
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 group">
                              <button type="button" onClick={() => toggleKolSort('region')} className="hover:underline inline-flex items-center" title="Sort by region">
                                Region{kolSortIndicator('region')}
                              </button>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Region</div>
                                    {['Vietnam','Turkey','SEA','Philippines','Korea','Global','China','Brazil'].map((region) => (
                                      <div
                                        key={region}
                                        className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
                                        onClick={() => {
                                          const newRegions = kolFilters.region.includes(region)
                                            ? kolFilters.region.filter(r => r !== region)
                                            : [...kolFilters.region, region];
                                          setKolFilters(prev => ({ ...prev, region: newRegions }));
                                        }}
                                      >
                                        <Checkbox checked={kolFilters.region.includes(region)} />
                                        <div className="flex items-center gap-2">
                                          <span>{getRegionIcon(region).flag}</span>
                                          <span className="text-sm">{region}</span>
                                        </div>
                                      </div>
                                    ))}
                                    {kolFilters.region.length > 0 && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full mt-2 text-xs"
                                        onClick={() => setKolFilters(prev => ({ ...prev, region: [] }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {kolFilters.region.length > 0 && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  {kolFilters.region.length}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 group">
                              <button type="button" onClick={() => toggleKolSort('creator_type')} className="hover:underline inline-flex items-center" title="Sort by creator type">
                                Creator Type{kolSortIndicator('creator_type')}
                              </button>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Creator Type</div>
                                    {['Nano','Micro','Mid-Tier','Macro','Mega'].map((creatorType) => (
                                      <div
                                        key={creatorType}
                                        className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
                                        onClick={() => {
                                          const newCreatorTypes = kolFilters.creator_type.includes(creatorType)
                                            ? kolFilters.creator_type.filter(ct => ct !== creatorType)
                                            : [...kolFilters.creator_type, creatorType];
                                          setKolFilters(prev => ({ ...prev, creator_type: newCreatorTypes }));
                                        }}
                                      >
                                        <Checkbox checked={kolFilters.creator_type.includes(creatorType)} />
                                        <span className="text-sm">{creatorType}</span>
                                      </div>
                                    ))}
                                    {kolFilters.creator_type.length > 0 && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full mt-2 text-xs"
                                        onClick={() => setKolFilters(prev => ({ ...prev, creator_type: [] }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {kolFilters.creator_type.length > 0 && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  {kolFilters.creator_type.length}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 group">
                              <button type="button" onClick={() => toggleKolSort('hh_status')} className="hover:underline inline-flex items-center" title="Sort by status">
                                Status{kolSortIndicator('hh_status')}
                              </button>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Status</div>
                                    {['Curated','Contacted','Interested','Onboarded','Concluded'].map((status) => (
                                      <div
                                        key={status}
                                        className="flex items-center space-x-2 py-1.5 px-2 rounded hover:bg-cream-100 cursor-pointer"
                                        onClick={() => {
                                          const newStatuses = kolFilters.hh_status.includes(status)
                                            ? kolFilters.hh_status.filter(s => s !== status)
                                            : [...kolFilters.hh_status, status];
                                          setKolFilters(prev => ({ ...prev, hh_status: newStatuses }));
                                        }}
                                      >
                                        <Checkbox checked={kolFilters.hh_status.includes(status)} />
                                        <span className={`px-2 py-1 rounded-md text-xs font-medium ${getStatusColor(status as any)}`}>
                                          {status}
                                        </span>
                                      </div>
                                    ))}
                                    {kolFilters.hh_status.length > 0 && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full mt-2 text-xs"
                                        onClick={() => setKolFilters(prev => ({ ...prev, hh_status: [] }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {kolFilters.hh_status.length > 0 && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  {kolFilters.hh_status.length}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          {/* Paid column hidden
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">
                            <div className="flex items-center gap-1 cursor-pointer group">
                              <span>Paid <span className="text-ink-warm-500 text-xs">(Internal)</span></span>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className="opacity-50 group-hover:opacity-100 transition-opacity">
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0" align="start">
                                  <div className="p-3">
                                    <div className="text-xs font-semibold text-ink-warm-700 mb-2">Filter Paid (USD)</div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Select
                                        value={kolFilters.paid_operator}
                                        onValueChange={(value) => setKolFilters(prev => ({ ...prev, paid_operator: value }))}
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
                                        value={kolFilters.paid_value}
                                        onChange={(e) => setKolFilters(prev => ({ ...prev, paid_value: e.target.value }))}
                                        className="h-8 text-xs focus-brand"
                                      />
                                    </div>
                                    {(kolFilters.paid_operator || kolFilters.paid_value) && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full text-xs"
                                        onClick={() => setKolFilters(prev => ({ ...prev, paid_operator: '', paid_value: '' }))}
                                      >
                                        Clear
                                      </Button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              {(kolFilters.paid_operator && kolFilters.paid_value) && (
                                <span className="ml-1 bg-brand text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                                  1
                                </span>
                              )}
                            </div>
                          </TableHead>
                          */}
                          {/* Section 5 — Profile column. Client-facing
                              one-line bio per KOL per campaign. Double-
                              click to edit, same UX as Notes. Self-hides
                              on the public page until populated. */}
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">Profile</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">Notes</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">Add Content</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 border-r border-cream-200 select-none">Content</TableHead>
                          <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 relative bg-cream-50 select-none">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="bg-white">
                        {filteredKOLs.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={12} className="text-center py-12">
                              <div className="flex flex-col items-center justify-center text-ink-warm-500">
                                <Users className="h-12 w-12 mb-4 text-ink-warm-300" />
                                <p className="text-lg font-medium mb-2">No KOLs match your filters</p>
                                <p className="text-sm text-ink-warm-400 mb-4">Try adjusting your filter criteria</p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setKolFilters({
                                      platform: [],
                                      region: [],
                                      creator_type: [],
                                      content_type: [],
                                      hh_status: [],
                                      budget_type: [],
                                      followers_operator: '',
                                      followers_value: '',
                                      budget_operator: '',
                                      budget_value: '',
                                      paid_operator: '',
                                      paid_value: ''
                                    });
                                  }}
                                >
                                  Reset All Filters
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          sortedKOLs.map((campaignKOL, index) => {
                          return (
                            <TableRow key={campaignKOL.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} hover:bg-cream-100 transition-colors border-b border-cream-200`}>
                              <TableCell className={`sticky left-0 z-10 ${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} px-4 py-2 overflow-hidden text-center text-ink-warm-700 group`} style={{ verticalAlign: 'middle', minWidth: '60px', width: '60px', boxShadow: 'inset -1px 0 0 0 #d1d5db' }}>
                                <div className="flex items-center justify-center w-full h-full">
                                  {selectedKOLs.includes(campaignKOL.id) ? (
                                    <Checkbox
                                      checked={true}
                                      onCheckedChange={(checked) => {
                                        setSelectedKOLs(prev => checked ? [...prev, campaignKOL.id] : prev.filter(id => id !== campaignKOL.id));
                                      }}
                                      className="mx-auto"
                                    />
                                  ) : (
                                    <>
                                      <span className="block group-hover:hidden w-full text-center">{index + 1}</span>
                                      <span className="hidden group-hover:flex w-full justify-center">
                                        <Checkbox
                                          checked={selectedKOLs.includes(campaignKOL.id)}
                                          onCheckedChange={(checked) => {
                                            setSelectedKOLs(prev => checked ? [...prev, campaignKOL.id] : prev.filter(id => id !== campaignKOL.id));
                                          }}
                                          className="mx-auto"
                                        />
                                      </span>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell
                                className={getCellClassName(`sticky z-10 ${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} p-2 overflow-hidden text-ink-warm-700 group cursor-pointer`, 'kols', campaignKOL.id, 'name')}
                                style={{ left: '60px', verticalAlign: 'middle', fontWeight: 'bold', width: '20%', boxShadow: 'inset -1px 0 0 0 #d1d5db' }}
                                onClick={() => handleCellSelect('kols', campaignKOL.id, 'name', campaignKOL.master_kol.name)}
                              >
                                <div className="flex items-center w-full h-full">
                                  <div className="truncate font-bold">{campaignKOL.master_kol.name}</div>
                                  {/* Edit pencil — opens the master KOL edit
                                      dialog. Always visible for discoverability;
                                      low-key gray → brand-on-hover styling so
                                      it doesn't compete visually with the name. */}
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); openMasterKolEditDialog(campaignKOL.master_kol as unknown as MasterKOL); }}
                                    className="ml-1.5 inline-flex items-center justify-center h-5 w-5 rounded text-ink-warm-400 hover:text-brand hover:bg-brand-light/40 transition-colors"
                                    title="Edit KOL info"
                                  >
                                    <Edit className="h-3 w-3" />
                                  </button>
                                  {campaignKOL.master_kol.link && (
                                    <a
                                      href={campaignKOL.master_kol.link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm ml-2 underline hover:no-underline font-normal"
                                      style={{ color: 'inherit' }}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      View Profile
                                    </a>
                                  )}
                                </div>
                                {/* [2026-06-16] HHP Campaign Dashboard § 2 GAP —
                                    KOL activation-recency badge (distinct from
                                    hh_status relationship lifecycle). Source:
                                    campaign_kol_activation_status view.
                                    Green Active / gray Last active / amber
                                    Onboarded — see spec for tone rule. */}
                                {(() => {
                                  const aw = (campaignKOL as any).activation_active_week as number | null | undefined;
                                  const lw = (campaignKOL as any).activation_last_week as number | null | undefined;
                                  if (aw != null) {
                                    return (
                                      <div className="mt-1">
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                          Active Week {aw}
                                        </span>
                                      </div>
                                    );
                                  }
                                  if (lw != null) {
                                    return (
                                      <div className="mt-1">
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
                                          Last active Week {lw}
                                        </span>
                                      </div>
                                    );
                                  }
                                  return (
                                    <div className="mt-1">
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                        Onboarded
                                      </span>
                                    </div>
                                  );
                                })()}
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden`}>
                                <MultiSelect
                                  options={fieldOptions?.platforms || []}
                                  selected={campaignKOL.master_kol.platform || []}
                                  onSelectedChange={async (newValues) => {
                                    const updatedMasterKOL = { ...campaignKOL.master_kol, platform: newValues };
                                    setCampaignKOLs(prevKOLs =>
                                      prevKOLs.map(k => k.id === campaignKOL.id ? { ...k, master_kol: updatedMasterKOL } : k)
                                    );
                                    try {
                                      await KOLService.updateKOL(updatedMasterKOL);
                                    } catch (error) {
                                      console.error('Error updating platform:', error);
                                      setCampaignKOLs(prevKOLs =>
                                        prevKOLs.map(k => k.id === campaignKOL.id ? campaignKOL : k)
                                      );
                                    }
                                  }}
                                  placeholder="Select platforms..."
                                  renderOption={(option) => (
                                    <div className="flex items-center justify-center h-5 w-5" title={option}>
                                      {getPlatformIcon(option)}
                                    </div>
                                  )}
                                  triggerContent={
                                    <div className="w-full flex items-center h-7 min-h-[28px]">
                                      {campaignKOL.master_kol.platform && campaignKOL.master_kol.platform.length > 0 ? (
                                        <>
                                          {campaignKOL.master_kol.platform.map((platform: string) => (
                                            <span key={platform} className="flex items-center justify-center h-5 w-5" title={platform}>
                                              {getPlatformIcon(platform)}
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
                              </TableCell>
                                  <TableCell
                                    className={getCellClassName(`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden cursor-pointer`, 'kols', campaignKOL.id, 'followers')}
                                    onClick={() => {
                                      if (editingCell?.row !== campaignKOL.id || editingCell?.field !== 'followers') {
                                        handleCellSelect('kols', campaignKOL.id, 'followers', campaignKOL.master_kol.followers);
                                      }
                                    }}
                                    onDoubleClick={() => {
                                      setEditingCell({ row: campaignKOL.id, field: 'followers' });
                                      setEditingValue(campaignKOL.master_kol.followers);
                                    }}
                                  >
                                    {editingCell?.row === campaignKOL.id && editingCell?.field === 'followers' ? (
                                      <Input
                                        type="number"
                                        value={editingValue || ''}
                                        onChange={(e) => setEditingValue(parseInt(e.target.value) || null)}
                                        onBlur={async () => {
                                          const updatedMasterKOL = { ...campaignKOL.master_kol, followers: editingValue };
                                          setCampaignKOLs(prevKOLs =>
                                            prevKOLs.map(k => k.id === campaignKOL.id ? { ...k, master_kol: updatedMasterKOL } : k)
                                          );
                                          try {
                                            await KOLService.updateKOL(updatedMasterKOL);
                                          } catch (error) {
                                            console.error('Error updating followers:', error);
                                            setCampaignKOLs(prevKOLs =>
                                              prevKOLs.map(k => k.id === campaignKOL.id ? campaignKOL : k)
                                            );
                                          }
                                          setEditingCell(null);
                                          setEditingValue(null);
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.currentTarget.blur();
                                          }
                                        }}
                                        className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none"
                                        autoFocus
                                      />
                                    ) : (
                                      campaignKOL.master_kol.followers ? KOLService.formatFollowers(campaignKOL.master_kol.followers) : '-'
                                    )}
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden`}>
                                <MultiSelect
                                  options={fieldOptions?.regions || []}
                                  selected={campaignKOL.master_kol.region ? [campaignKOL.master_kol.region] : []}
                                  onSelectedChange={async (selected) => {
                                    const newValue = selected.length > 0 ? selected[selected.length - 1] : null;
                                    const updatedMasterKOL = { ...campaignKOL.master_kol, region: newValue };
                                    setCampaignKOLs(prevKOLs =>
                                      prevKOLs.map(k => k.id === campaignKOL.id ? { ...k, master_kol: updatedMasterKOL } : k)
                                    );
                                    try {
                                      await KOLService.updateKOL(updatedMasterKOL);
                                    } catch (error) {
                                      console.error('Error updating region:', error);
                                      setCampaignKOLs(prevKOLs =>
                                        prevKOLs.map(k => k.id === campaignKOL.id ? campaignKOL : k)
                                      );
                                    }
                                  }}
                                  renderOption={(option) => (
                                    <div className="flex items-center space-x-2">
                                      <span>{getRegionIcon(option).flag}</span>
                                      <span>{option}</span>
                                    </div>
                                  )}
                                  triggerContent={
                                    <div className="w-full flex items-center h-7 min-h-[28px]">
                                      {campaignKOL.master_kol.region ? (
                                        <div className="flex items-center space-x-1">
                                          <span>{getRegionIcon(campaignKOL.master_kol.region).flag}</span>
                                          <span className="text-xs font-semibold text-black">{campaignKOL.master_kol.region}</span>
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
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden`}>
                                <MultiSelect
                                  options={fieldOptions?.creatorTypes || []}
                                  selected={campaignKOL.master_kol.creator_type || []}
                                  onSelectedChange={async (newValues) => {
                                    const updatedMasterKOL = { ...campaignKOL.master_kol, creator_type: newValues };
                                    setCampaignKOLs(prevKOLs =>
                                      prevKOLs.map(k => k.id === campaignKOL.id ? { ...k, master_kol: updatedMasterKOL } : k)
                                    );
                                    try {
                                      await KOLService.updateKOL(updatedMasterKOL);
                                    } catch (error) {
                                      console.error('Error updating creator_type:', error);
                                      setCampaignKOLs(prevKOLs =>
                                        prevKOLs.map(k => k.id === campaignKOL.id ? campaignKOL : k)
                                      );
                                    }
                                  }}
                                  placeholder="Select creator types..."
                                  renderOption={(option) => (
                                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${getCreatorTypeColor(option)}`}>
                                      {option}
                                    </span>
                                  )}
                                  triggerContent={
                                    <div className="w-full flex items-center h-7 min-h-[28px]">
                                      {campaignKOL.master_kol.creator_type && campaignKOL.master_kol.creator_type.length > 0 ? (
                                        <>
                                          {campaignKOL.master_kol.creator_type.map((type: string) => (
                                            <span key={type} className={`px-2 py-1 rounded-md text-xs font-medium flex-shrink-0 ${getCreatorTypeColor(type)} mr-1`}>
                                              {type}
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
                              </TableCell>
                                  <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden`}>
                                <Select
                                  value={campaignKOL.hh_status} 
                                  onValueChange={(value) => handleUpdateKOLStatus(campaignKOL.id, value as any)}
                                >
                                  <SelectTrigger 
                                    className={`border-none shadow-none bg-transparent w-auto h-auto px-2 py-1 rounded-md text-xs font-medium inline-flex items-center focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none ${getStatusColor(campaignKOL.hh_status)}`}
                                    style={{ outline: 'none', boxShadow: 'none', minWidth: 90 }}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {CampaignKOLService.getHHStatusOptions().map((status) => (
                                          <SelectItem key={status} value={status || ''}>{status}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                                  {/* Paid cell hidden
                                  <TableCell
                                    className={getCellClassName(`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden cursor-pointer`, 'kols', campaignKOL.id, 'paid')}
                                    onClick={() => handleCellSelect('kols', campaignKOL.id, 'paid', campaignKOL.paid)}
                                  >
                                    <div className="truncate min-h-[32px] flex items-center px-1 py-1" style={{ minHeight: 32 }} title={campaignKOL.paid?.toString()}>
                                      {campaignKOL.paid != null ? `$${campaignKOL.paid.toLocaleString()}` : <span className="text-ink-warm-400 italic">No payments</span>}
                                    </div>
                                  </TableCell>
                                  */}
                                  {/* Section 5 — Profile note cell.
                                      Mirrors Notes UX exactly so muscle
                                      memory carries over (double-click
                                      to edit, blur or Enter to save). */}
                                  <TableCell
                                    className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 align-middle overflow-hidden cursor-pointer`}
                                    style={{ width: '20%' }}
                                    onDoubleClick={() => {
                                      setEditingProfileId(campaignKOL.id);
                                      setEditingProfile((prev) => ({ ...prev, [campaignKOL.id]: (campaignKOL as any).profile_note ?? '' }));
                                    }}
                                  >
                                    {editingProfileId === campaignKOL.id ? (
                                      <Input
                                        value={editingProfile[campaignKOL.id] ?? (campaignKOL as any).profile_note ?? ''}
                                        onChange={e => handleProfileChange(campaignKOL.id, e.target.value)}
                                        onBlur={() => handleProfileSave(campaignKOL.id)}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleProfileSave(campaignKOL.id); }}}
                                        className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none min-h-[32px]"
                                        style={{ outline: 'none', boxShadow: 'none', userSelect: 'text' }}
                                        autoFocus
                                      />
                                    ) : (
                                      <div className="truncate min-h-[32px] flex items-center px-1 py-1" style={{ minHeight: 32 }} title={(campaignKOL as any).profile_note || ''}>
                                        {(campaignKOL as any).profile_note || <span className="text-ink-warm-400 italic">Double-click to add profile</span>}
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell
                                    className={getCellClassName(`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 align-middle overflow-hidden cursor-pointer`, 'kols', campaignKOL.id, 'notes')}
                                    style={{ width: '20%' }}
                                    onClick={() => {
                                      if (editingNotesId !== campaignKOL.id) {
                                        handleCellSelect('kols', campaignKOL.id, 'notes', campaignKOL.notes);
                                      }
                                    }}
                                    onDoubleClick={() => {
                                      setEditingNotesId(campaignKOL.id);
                                      setEditingNotes((prev) => ({ ...prev, [campaignKOL.id]: campaignKOL.notes ?? '' }));
                                    }}
                                  >
                                {editingNotesId === campaignKOL.id ? (
                                  <Input
                                    value={editingNotes[campaignKOL.id] ?? campaignKOL.notes ?? ''}
                                    onChange={e => handleNotesChange(campaignKOL.id, e.target.value)}
                                    onBlur={() => handleNotesSave(campaignKOL.id)}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleNotesSave(campaignKOL.id); }}}
                                    className="w-full border-none shadow-none p-0 h-auto bg-transparent focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none min-h-[32px]"
                                    style={{ outline: 'none', boxShadow: 'none', userSelect: 'text' }}
                                    autoFocus
                                  />
                                ) : (
                                      <div className="truncate min-h-[32px] flex items-center px-1 py-1" style={{ minHeight: 32 }} title={campaignKOL.notes || ''}>
                                    {campaignKOL.notes || <span className="text-ink-warm-400 italic">Double-click to add notes</span>}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden`}>
                                <div className="flex flex-wrap gap-1 items-center">
                                  {(() => {
                                    // Get all content types for this KOL
                                    const kolContents = contents.filter(content => content.campaign_kols_id === campaignKOL.id);

                                    // Count occurrences of each content type
                                    const typeCounts = kolContents.reduce((acc: { [key: string]: number }, content) => {
                                      const type = content.type || 'No Type';
                                      acc[type] = (acc[type] || 0) + 1;
                                      return acc;
                                    }, {});

                                    // Different colors for different content types
                                    const getContentColor = (type: string) => {
                                      const colors: {[key: string]: string} = {
                                        'Post': 'bg-sky-100 text-sky-800',
                                        'Tweet': 'bg-cyan-100 text-cyan-800',
                                        'Story': 'bg-purple-100 text-purple-800',
                                        'Reel': 'bg-pink-100 text-pink-800',
                                        'Video': 'bg-rose-100 text-rose-800',
                                        'Article': 'bg-emerald-100 text-emerald-800',
                                        'Review': 'bg-amber-100 text-amber-800',
                                        'Thread': 'bg-indigo-100 text-indigo-800',
                                      };
                                      return colors[type] || 'bg-cream-100 text-ink-warm-700';
                                    };

                                    return Object.entries(typeCounts).map(([type, count], idx) => (
                                      <span
                                        key={idx}
                                        className={`px-2 py-1 rounded-md text-xs font-medium ${getContentColor(type)}`}
                                      >
                                        {count > 1 ? `${count} ${type}s` : type}
                                      </span>
                                    ));
                                  })()}
                                  <Popover
                                    open={quickAddContentKolId === campaignKOL.id}
                                    onOpenChange={(open) => {
                                      setQuickAddContentKolId(open ? campaignKOL.id : null);
                                      if (!open) setQuickAddContentCount(1);
                                    }}
                                  >
                                    <PopoverTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 w-6 p-0 hover:bg-cream-200"
                                      >
                                        <Plus className="h-4 w-4 text-ink-warm-700" />
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[220px] p-3" align="start">
                                      <div className="space-y-3">
                                        <div className="text-xs font-semibold text-ink-warm-700">Add Contents</div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm text-ink-warm-700">Count:</span>
                                          <Input
                                            type="number"
                                            min={1}
                                            max={20}
                                            value={quickAddContentCount}
                                            onChange={(e) => setQuickAddContentCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                                            className="w-16 h-8 text-center focus-brand"
                                          />
                                        </div>
                                        <div className="text-xs font-semibold text-ink-warm-700">Select Type</div>
                                        <div className="space-y-1">
                                          {fieldOptions.deliverables.map((type) => (
                                            <div
                                              key={type}
                                              className="px-3 py-2 text-sm hover:bg-cream-100 cursor-pointer rounded flex items-center justify-between"
                                              onClick={async () => {
                                                const count = quickAddContentCount;
                                                // Auto-set platform from KOL's first platform
                                                const kolPlatforms = campaignKOL.master_kol?.platform || [];
                                                const autoPlatform = kolPlatforms.length > 0 ? kolPlatforms[0] : null;
                                                const payloads = Array.from({ length: count }, () => ({
                                                  campaign_id: campaign?.id,
                                                  campaign_kols_id: campaignKOL.id,
                                                  type: type,
                                                  status: 'pending',
                                                  activation_date: null,
                                                  content_link: null,
                                                  platform: autoPlatform,
                                                  impressions: null,
                                                  likes: null,
                                                  retweets: null,
                                                  comments: null,
                                                  bookmarks: null,
                                                }));
                                                try {
                                                  console.log(`Creating ${count} contents with type:`, type);
                                                  const { error, data } = await supabase.from('contents').insert(payloads as any).select();
                                                  if (error) {
                                                    console.error('Error creating contents:', error);
                                                    toast({
                                                      title: 'Create failed',
                                                      description: error.message || 'Failed to create contents',
                                                      variant: 'destructive'
                                                    });
                                                    return;
                                                  }

                                                  // Auto-create payments for each content.
                                                  // Amount priority:
                                                  //   1. QRT (repost): master_kol.repost_rate
                                                  //      → fallback master_kol.standard_rate * 0.5
                                                  //   2. campaign_kol.agreed_rate (set at onboarding)
                                                  //   3. master_kol.standard_rate (mastersheet)
                                                  //   4. most recent payment amount for this KOL
                                                  //   5. 0 (user will need to fill in manually)
                                                  const stdRate = campaignKOL.master_kol?.standard_rate != null
                                                    ? Number(campaignKOL.master_kol.standard_rate)
                                                    : null;
                                                  const repostRate = (campaignKOL.master_kol as any)?.repost_rate != null
                                                    ? Number((campaignKOL.master_kol as any).repost_rate)
                                                    : null;
                                                  const defaultAmount = type === 'QRT'
                                                    ? (repostRate ?? (stdRate != null ? Math.round(stdRate * 0.5 * 100) / 100 : 0))
                                                    : (campaignKOL.agreed_rate ?? null) !== null
                                                      ? Number(campaignKOL.agreed_rate)
                                                      : stdRate != null
                                                      ? stdRate
                                                      : (campaignKOL.master_kol?.id && latestCostMap.get(campaignKOL.master_kol.id)) || 0;

                                                  if (data && data.length > 0) {
                                                    const paymentPayloads = data.map((content: any) => ({
                                                      campaign_id: campaign?.id,
                                                      campaign_kol_id: campaignKOL.id,
                                                      content_id: [content.id],
                                                      amount: defaultAmount,
                                                      payment_date: null,
                                                      payment_method: 'Fiat',
                                                      notes: null
                                                    }));

                                                    const { error: paymentError, data: paymentData } = await supabase
                                                      .from('payments')
                                                      .insert(paymentPayloads as any)
                                                      .select();

                                                    if (paymentError) {
                                                      console.error('Error creating payments:', paymentError);
                                                      toast({
                                                        title: 'Payment records failed',
                                                        description: 'Contents created but payment records failed.',
                                                        variant: 'destructive'
                                                      });
                                                    } else {
                                                      fetchPayments();

                                                      // Only show the "use latest pricing?" suggestion if we couldn't
                                                      // auto-fill — i.e. there's no agreed_rate and no master standard_rate.
                                                      const hasStoredRate = (campaignKOL.agreed_rate ?? null) !== null
                                                        || (campaignKOL.master_kol?.standard_rate ?? null) !== null;
                                                      const masterKolId = campaignKOL.master_kol?.id;
                                                      const latestCost = masterKolId ? latestCostMap.get(masterKolId) : undefined;
                                                      if (!hasStoredRate && latestCost && latestCost > 0 && paymentData && paymentData.length > 0) {
                                                        const paymentIds = paymentData.map((p: any) => p.id);
                                                        setPricingSuggestionDialog({
                                                          open: true,
                                                          kolId: campaignKOL.id,
                                                          kolName: campaignKOL.master_kol?.name || 'Unknown',
                                                          masterKolId: masterKolId,
                                                          latestCost: latestCost,
                                                          paymentIndex: 0,
                                                          paymentIds: paymentIds,
                                                          mode: 'content-created'
                                                        });
                                                      }
                                                    }
                                                  }

                                                  fetchContents();
                                                  setQuickAddContentKolId(null);
                                                  setQuickAddContentCount(1);
                                                  toast({
                                                    title: 'Content created',
                                                    description: `${count} ${type}${count > 1 ? 's' : ''} and payment${count > 1 ? 's' : ''} created.`,
                                                  });
                                                } catch (err) {
                                                  console.error('Unexpected error:', err);
                                                }
                                              }}
                                            >
                                              <span>{type}</span>
                                              {quickAddContentCount > 1 && (
                                                <span className="text-xs text-ink-warm-400">×{quickAddContentCount}</span>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                </div>
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} border-r border-cream-200 p-2 overflow-hidden text-center`}>
                                <div className="font-medium text-ink-warm-900">
                                  {contents.filter(content => content.campaign_kols_id === campaignKOL.id).length}
                                </div>
                              </TableCell>
                              <TableCell className={`${index % 2 === 0 ? 'bg-white' : 'bg-cream-50'} p-2 overflow-hidden`}>
                                <div className="flex space-x-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      const kolName = campaignKOL.master_kol?.name || '';
                                      setActiveTab('contents');
                                      setTimeout(() => {
                                        setContentsSearchTerm(kolName);
                                      }, 100);
                                    }}
                                    title="View Content"
                                  >
                                    <FileText className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleToggleKOLHidden(campaignKOL.id, !campaignKOL.hidden)}
                                    title={campaignKOL.hidden ? "Unhide KOL" : "Hide KOL"}
                                  >
                                    {campaignKOL.hidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setKolsToDelete([campaignKOL.id]);
                                          setShowKOLDeleteDialog(true);
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                        )}
                      </TableBody>
                    </Table>
                      </div>
                    )}

      {/* KOL delete confirmation dialog — moved into the component so
          the entire bulk-delete flow is self-contained. Was previously
          rendered in the page's trailing dialog cluster. */}
      <Dialog open={showKOLDeleteDialog} onOpenChange={setShowKOLDeleteDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-ink-warm-700 mt-2 mb-2">
            Are you sure you want to delete {kolsToDelete.length} KOL{kolsToDelete.length !== 1 ? 's' : ''}?
          </div>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setShowKOLDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              setShowKOLDeleteDialog(false);
              if (kolsToDelete.length === 0) return;
              try {
                await Promise.all(kolsToDelete.map(kolId => handleDeleteKOL(kolId)));
                toast({
                  title: 'KOLs deleted',
                  description: `${kolsToDelete.length} KOL${kolsToDelete.length !== 1 ? 's' : ''} deleted.`,
                  variant: 'destructive',
                });
                setSelectedKOLs([]);
                setKolsToDelete([]);
              } catch (error) {
                toast({
                  title: 'Delete failed',
                  description: error instanceof Error ? error.message : 'Failed to delete KOL(s)',
                  variant: 'destructive',
                });
              }
            }}>Delete KOL{kolsToDelete.length !== 1 ? 's' : ''}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unhide prompt — fired when a hidden KOL's status transitions
          to Onboarded. Confirms the user really meant to keep the KOL
          hidden (default action: unhide). 2026-06-05. */}
      <Dialog open={!!unhidePromptKol} onOpenChange={(open) => { if (!open) setUnhidePromptKol(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Eye className="h-4 w-4 text-brand" />
              Unhide KOL?
            </DialogTitle>
            <DialogDescription className="text-sm text-ink-warm-700 pt-2">
              <strong>{unhidePromptKol?.master_kol?.name || 'This KOL'}</strong> was just moved to <strong>Onboarded</strong> but is still hidden from the dashboard. Unhide them so they show up everywhere?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button
              variant="outline"
              onClick={() => setUnhidePromptKol(null)}
              disabled={unhiding}
            >
              Keep Hidden
            </Button>
            <Button
              variant="brand"
              disabled={unhiding}
              onClick={async () => {
                if (!unhidePromptKol) return;
                setUnhiding(true);
                try {
                  await CampaignKOLService.updateCampaignKOL(unhidePromptKol.id, { hidden: false } as any);
                  setCampaignKOLs(prev => prev.map(k =>
                    k.id === unhidePromptKol.id ? { ...k, hidden: false } : k
                  ));
                  toast({
                    title: 'KOL Unhidden',
                    description: `${unhidePromptKol.master_kol?.name || 'KOL'} is now visible on the dashboard.`,
                  });
                  setUnhidePromptKol(null);
                } catch (err) {
                  toast({
                    title: 'Unhide failed',
                    description: err instanceof Error ? err.message : 'Unknown error',
                    variant: 'destructive',
                  });
                } finally {
                  setUnhiding(false);
                }
              }}
            >
              <Eye className="h-3.5 w-3.5 mr-1.5" />
              {unhiding ? 'Unhiding…' : 'Unhide'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
