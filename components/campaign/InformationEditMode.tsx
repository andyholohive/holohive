'use client';

/**
 * InformationEditMode — the edit-mode form for the Information tab.
 * Renders inside the tab body when `editMode` is true (the view-mode
 * 3-column layout is handled by `CampaignDetailViewLayout` and only
 * renders when `editMode` is false).
 *
 * Extracted from `app/campaigns/[id]/page.tsx` on 2026-06-02. Big
 * props API because the form state + the regional-allocation editor
 * state + the validation flags + the dropdown options all live on
 * the page (they're shared with the per-card edit-mode toggles and
 * the page hero's "Save" action). Lifting them into context would
 * pollute it for one consumer; props are the right shape here.
 */

import {
  Activity,
  BadgeCheck,
  Building2,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Edit,
  FileText,
  MapPin,
  Phone,
  Plus,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import { CampaignService } from '@/lib/campaignService';
import { supabase } from '@/lib/supabase';
import { useCampaignDetail } from '@/contexts/CampaignDetailContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
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
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { CampaignWithDetails } from '@/lib/campaignService';
import {
  displayRegion,
  formatDateForInput,
  formatDateLong as formatDate,
  parseDate,
} from '@/lib/campaignHelpers';

// Loose CampaignDetails type — matches the page's local type. Kept
// loose because the page form state is allowed to hold partial /
// in-progress shapes during edit mode.
type CampaignDetails = any;

/** Phase dropdown options — matches the page's CURRENT_PHASE_OPTIONS.
 *  Backed by campaigns.current_phase (mig 078). */
const CURRENT_PHASE_OPTIONS = [
  'Setup',
  'Seeding Phase',
  'Amplification Phase',
  'Activation Phase',
  'Reporting Phase',
] as const;

interface InformationEditModeProps {
  /** Current form state (the editable copy of campaign). */
  form: CampaignDetails | null;
  /** Generic field setter — the page's `handleChange(field, value)`. */
  handleChange: (field: any, value: any) => void;

  /** The persisted campaign (view-mode source of truth). Used for
   *  fallbacks when a form field has been cleared back to undefined.
   *  Non-null because the parent only renders the edit-mode form when
   *  the campaign is already loaded (the loading branch above shows
   *  the skeleton instead). */
  campaign: CampaignWithDetails;

  /** Allocation editor state (regional budget breakdown). */
  allocations: any[];
  setAllocations: React.Dispatch<React.SetStateAction<any[]>>;
  deletedAllocIds: string[];
  setDeletedAllocIds: React.Dispatch<React.SetStateAction<string[]>>;

  /** Page-loaded reference data. */
  campaignKOLs: any[];
  allUsers: any[];
  allClients: any[];

  /** KOLService.getFieldOptions() — region / pricing / etc dropdowns. */
  fieldOptions: any;
  /** ['Token', 'Fiat', 'WL'] */
  budgetTypeOptions: string[];

  /** Add-update affordance (Recent Updates carousel is hidden via
   *  `false &&` but the dialog still needs the open state). */
  isAddUpdateDialogOpen: boolean;
  setIsAddUpdateDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  updateText: string;
  setUpdateText: React.Dispatch<React.SetStateAction<string>>;
  isAddingUpdate: boolean;
  handleAddUpdate: () => void;

  /** Carousel — also retained behind `false`. */
  campaignUpdates: any[];
  currentUpdateIndex: number;
  prevUpdate: () => void;
  nextUpdate: () => void;
  loadingUpdates: boolean;
  isDeleteUpdateDialogOpen: boolean;
  setIsDeleteUpdateDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleDeleteUpdate: () => void;
  setCurrentUpdateIndex: React.Dispatch<React.SetStateAction<number>>;
  setIsAddingUpdate: React.Dispatch<React.SetStateAction<boolean>>;
  fetchCampaignUpdates: () => Promise<void>;

  /** Approved-emails editor (for the public-view share gate). */
  emailInput: string;
  setEmailInput: React.Dispatch<React.SetStateAction<string>>;

  /** Save + cancel hooks for the page hero. */
  handleSave: () => Promise<void>;
  handleCancel: () => void;
  saving: boolean;
}

export function InformationEditMode({
  form,
  handleChange,
  campaign,
  allocations,
  setAllocations,
  deletedAllocIds,
  setDeletedAllocIds,
  campaignKOLs,
  allUsers,
  allClients,
  fieldOptions,
  budgetTypeOptions,
  isAddUpdateDialogOpen,
  setIsAddUpdateDialogOpen,
  updateText,
  setUpdateText,
  isAddingUpdate,
  handleAddUpdate,
  campaignUpdates,
  currentUpdateIndex,
  prevUpdate,
  nextUpdate,
  loadingUpdates,
  isDeleteUpdateDialogOpen,
  setIsDeleteUpdateDialogOpen,
  handleDeleteUpdate,
  setCurrentUpdateIndex,
  setIsAddingUpdate,
  fetchCampaignUpdates,
  emailInput,
  setEmailInput,
  handleSave,
  handleCancel,
  saving,
}: InformationEditModeProps) {
  const { toast } = useCampaignDetail();
  // This component ONLY renders when the parent page is in edit mode,
  // but the JSX still has `{editMode ? input : static}` ternaries
  // inherited from the pre-extraction code where view-mode and
  // edit-mode were interleaved. Hardcode `true` here so those
  // ternaries always pick the input branch (without rewriting all
  // 29 occurrences in a 1,000-line block).
  const editMode = true;

  // ── Helper for the regional allocation editor — pulled from
  //    KOLService.getFieldOptions().regions on the page; passed in
  //    via fieldOptions so we don't duplicate the service call.
  const regionOptions: string[] = fieldOptions?.regions || [];

  return (
    <>
                {/* [2026-06-05] `pt-6` override removed — `CardContent`
                    defaults to `p-6 pt-0`, which leaves 24px on the
                    sides + bottom (right for the form grid) and 0 on
                    top (so the form sits flush below the "Editing"
                    toolbar above, matching KOLs/Contents/Payments tab
                    spacing). The override added 24px of dead top
                    space the other tabs don't have. */}
                <CardContent>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-8">
                                {/* [May 2026 audit] Recent Updates carousel
                                    hidden — feature had near-zero usage and
                                    cluttered the Info tab. State + handlers
                                    + the campaign_updates table all stay,
                                    so re-enable by flipping `false` below. */}
                                {false && (
                  <div className="flex items-center justify-between col-span-2">
                    {/* Campaign Updates Carousel */}
                    <div className="flex-1 max-w-md">
                      <div className="text-sm font-medium text-ink-warm-700 mb-2">Recent Updates</div>
                      {loadingUpdates ? (
                        <div className="flex items-center gap-2">
                          {/* Left Arrow Skeleton */}
                          <Skeleton className="h-8 w-8 rounded-full" />
                          
                          {/* Update Card Skeleton */}
                          <div className="flex-1 bg-cream-50 border border-cream-200 rounded-lg p-3 min-h-[80px]">
                            <div className="space-y-2">
                              <Skeleton className="h-4 w-full" />
                              <Skeleton className="h-4 w-3/4" />
                              <Skeleton className="h-3 w-1/2" />
                            </div>
                          </div>
                          
                          {/* Right Arrow Skeleton */}
                          <Skeleton className="h-8 w-8 rounded-full" />
                        </div>
                      ) : campaignUpdates.length === 0 ? (
                        <div className="text-sm text-ink-warm-500 italic">No updates yet</div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            {/* Left Arrow */}
                            {campaignUpdates.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 bg-white hover:bg-cream-50 border border-cream-200 rounded-full flex-shrink-0"
                                onClick={prevUpdate}
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </Button>
                            )}
                            
                            {/* Update Card */}
                            <div className="flex-1 bg-cream-50 border border-cream-200 rounded-lg p-3 min-h-[80px] relative">
                              <div className="text-sm text-ink-warm-900 mb-1">
                                {campaignUpdates[currentUpdateIndex]?.update_text}
                              </div>
                              <div className="text-xs text-ink-warm-500">
                                {campaignUpdates[currentUpdateIndex] && new Date(campaignUpdates[currentUpdateIndex].created_at).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                              {/* Delete Button */}
                              <Dialog open={isDeleteUpdateDialogOpen} onOpenChange={setIsDeleteUpdateDialogOpen}>
                                <DialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="absolute bottom-2 right-2 h-6 w-6 p-0 text-ink-warm-400 hover:text-rose-500 hover:bg-rose-50"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-md">
                                  <DialogHeader>
                                    <DialogTitle>Confirm Delete</DialogTitle>
                                  </DialogHeader>
                                  <div className="text-sm text-ink-warm-700 mt-2 mb-2">
                                    Are you sure you want to delete this update?
                                  </div>
                                  <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
                                    <Button variant="outline" onClick={() => setIsDeleteUpdateDialogOpen(false)}>Cancel</Button>
                                    <Button 
                                      variant="destructive" 
                                      onClick={async () => {
                                        try {
                                          const updateToDelete = campaignUpdates[currentUpdateIndex];
                                          await supabase
                                            .from('campaign_updates')
                                            .delete()
                                            .eq('id', updateToDelete.id);
                                          
                                          toast({
                                            title: 'Update deleted',
                                            description: 'Campaign update deleted successfully.',
                                            duration: 3000,
                                          });
                                          
                                          // Refresh campaign updates
                                          fetchCampaignUpdates();
                                          setCurrentUpdateIndex(0);
                                          setIsDeleteUpdateDialogOpen(false);
                                        } catch (error) {
                                          console.error('Error deleting update:', error);
                                          toast({
                                            title: 'Delete failed',
                                            description: error instanceof Error ? error.message : 'Failed to delete update',
                                            variant: 'destructive',
                                            duration: 3000,
                                          });
                                        }
                                      }}
                                    >
                                      Delete Update
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                            </div>
                            
                            {/* Right Arrow */}
                            {campaignUpdates.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 bg-white hover:bg-cream-50 border border-cream-200 rounded-full flex-shrink-0"
                                onClick={nextUpdate}
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          
                          {/* Dots Indicator */}
                          {campaignUpdates.length > 1 && (
                            <div className="flex justify-center mt-2 space-x-1">
                              {campaignUpdates.map((_, index) => (
                                <button
                                  key={index}
                                  className={`w-2 h-2 rounded-full transition-colors ${
                                    index === currentUpdateIndex 
                                      ? 'bg-brand' 
                                      : 'bg-cream-300 hover:bg-cream-300'
                                  }`}
                                  onClick={() => setCurrentUpdateIndex(index)}
                                />
                              ))}
                            </div>
                          )}
                          
                          {/* Update Counter */}
                          {campaignUpdates.length > 1 && (
                            <div className="text-xs text-ink-warm-500 text-center mt-1">
                              {currentUpdateIndex + 1} of {campaignUpdates.length}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {/* Add Update Button */}
                    <div className="flex-shrink-0">
                      <Dialog open={isAddUpdateDialogOpen} onOpenChange={setIsAddUpdateDialogOpen}>
                        <DialogTrigger asChild>
                          <Button variant="brand" size="sm">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Update
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                          <DialogHeader>
                            <DialogTitle>Add Campaign Update</DialogTitle>
                          </DialogHeader>
                          <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                              <Label htmlFor="update-text">Update</Label>
                              <Textarea
                                id="update-text"
                                placeholder="Enter the latest update for this campaign..."
                                value={updateText}
                                onChange={(e) => setUpdateText(e.target.value)}
                                className="focus-brand min-h-[120px]"
                                rows={4}
                              />
                            </div>
                          </div>
                          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
                            <Button variant="outline" onClick={() => {
                              setIsAddUpdateDialogOpen(false);
                              setUpdateText('');
                            }}>
                              Cancel
                            </Button>
                            <Button variant="brand" disabled={!updateText.trim() || isAddingUpdate} onClick={async () => {
                                if (!updateText.trim()) return;
                                
                                setIsAddingUpdate(true);
                                try {
                                  const { error } = await supabase
                                    .from('campaign_updates')
                                    .insert({
                                      // Non-null assertion: this code is in a
                                      // `false && ...` dead branch (Updates
                                      // section hidden per May 2026 audit).
                                      // TS still type-checks the JSX though.
                                      campaign_id: campaign!.id,
                                      update_text: updateText.trim()
                                    });
                                  
                                  if (error) {
                                    console.error('Error adding update:', error);
                                    toast({
                                      title: 'Add failed',
                                      description: error.message || 'Failed to add update',
                                      variant: 'destructive',
                                      duration: 3000,
                                    });
                                    return;
                                  }

                                  toast({
                                    title: 'Update added',
                                    duration: 3000,
                                  });
                                  
                                  setIsAddUpdateDialogOpen(false);
                                  setUpdateText('');
                                  // Refresh campaign updates
                                  fetchCampaignUpdates();
                                  setCurrentUpdateIndex(0);
                                } catch (err) {
                                  console.error('Unexpected error:', err);
                                  toast({
                                    title: 'Add failed',
                                    description: err instanceof Error ? err.message : 'Failed to add update',
                                    variant: 'destructive',
                                    duration: 3000,
                                  });
                                } finally {
                                  setIsAddingUpdate(false);
                                }
                              }}
                            >
                              {isAddingUpdate ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                              ) : (
                                'Add Update'
                              )}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                )}
                  {/* Campaign Name — only editable in edit mode; the
                      hero above shows it as the page title in view
                      mode so we don't duplicate. */}
                  {editMode && (
                    <div className="col-span-2 bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                      <Label htmlFor="campaign-name" className="text-[10px] mono uppercase tracking-[0.14em] text-ink-warm-500 mb-2 block">
                        Campaign Name <RequiredAsterisk />
                      </Label>
                      <Input
                        id="campaign-name"
                        value={form?.name || ""}
                        onChange={e => handleChange("name", e.target.value)}
                        className="focus-brand display-serif text-[19px] text-ink-warm-900 h-auto py-2"
                        placeholder="Enter campaign name"
                      />
                    </div>
                  )}
                  {/* Campaign Overview Section */}
                  <div className="bg-white p-6 rounded-[14px] border border-cream-200 shadow-card">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-9 h-9 rounded-md bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4" />
                      </div>
                      <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Campaign Overview</h3>
                    </div>
                    <div className="space-y-5">
                      {/* [May 2026 audit] Outline field hidden — Description
                          (the client-facing field below) covers the same
                          ground. Data + handler still wired so the save
                          payload preserves whatever was previously typed. */}
                      {false && (
                      <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em]">
                            Outline
                          </div>
                          <Badge variant="outline" className="text-[10px] text-ink-warm-500 border-cream-300">Internal</Badge>
                        </div>
                        {editMode ? (
                          <Textarea
                            value={form?.outline || ""}
                            onChange={e => handleChange("outline", e.target.value)}
                            className="focus-brand focus:ring-2 focus:ring-brand focus:border-brand"
                           
                            placeholder="Enter campaign outline..."
                            rows={3}
                          />
                        ) : (
                          <div className="text-sm text-ink-warm-700 leading-relaxed whitespace-pre-line">{campaign?.outline || <span className="text-ink-warm-400 italic">No outline provided</span>}</div>
                        )}
                      </div>
                      )}
                      <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em]">
                            Description
                          </div>
                          <Badge variant="outline" className="text-[10px] text-brand border-brand">Client-Facing</Badge>
                        </div>
                        {editMode ? (
                          <Textarea
                            value={form?.description || ""}
                            onChange={e => handleChange("description", e.target.value)}
                            className="focus-brand focus:ring-2 focus:ring-brand focus:border-brand"
                           
                            rows={3}
                          />
                        ) : (
                          <div className="text-sm text-ink-warm-700 leading-relaxed whitespace-pre-line">{campaign.description || <span className="text-ink-warm-400 italic">No description provided</span>}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Timeline Section */}
                  <div className="bg-white p-6 rounded-[14px] border border-cream-200 shadow-card">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-9 h-9 rounded-md bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center shrink-0">
                        <CalendarIcon className="h-4 w-4" />
                      </div>
                      <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Timeline</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">Start Date</div>
                        {editMode ? (
                      <Popover key="start-date-popover">
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={`focus-brand justify-start text-left font-normal h-9 ${form?.start_date ? 'text-ink-warm-900' : 'text-ink-warm-400'}`}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {form?.start_date ? formatDate(form.start_date) : "Select start date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-50" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={parseDate(form?.start_date)}
                            onSelect={date => handleChange("start_date", date ? formatDateForInput(date) : undefined)}
                            initialFocus
                            classNames={{ day_selected: "text-white hover:text-white focus:text-white" }}
                            modifiersStyles={{ selected: { backgroundColor: "#3e8692" } }}
                          />
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <div className="display-serif text-[17px] text-ink-warm-900 leading-tight">{formatDate(campaign?.start_date)}</div>
                    )}
                  </div>
                  <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                    <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">End Date</div>
                    {editMode ? (
                      <Popover key="end-date-popover">
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={`focus-brand justify-start text-left font-normal h-9 ${form?.end_date ? 'text-ink-warm-900' : 'text-ink-warm-400'}`}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {form?.end_date ? formatDate(form.end_date) : "Select end date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-50" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={parseDate(form?.end_date)}
                            onSelect={date => handleChange("end_date", date ? formatDateForInput(date) : undefined)}
                            disabled={date => form?.start_date ? date < parseDate(form.start_date)! : false}
                            initialFocus
                            classNames={{ day_selected: "text-white hover:text-white focus:text-white" }}
                            modifiersStyles={{ selected: { backgroundColor: "#3e8692" } }}
                          />
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <div className="display-serif text-[17px] text-ink-warm-900 leading-tight">{formatDate(campaign?.end_date)}</div>
                    )}
                  </div>
                  <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                    <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-brand" />
                      Region
                    </div>
                    {editMode ? (
                      <Select value={form?.region || ""} onValueChange={value => handleChange("region", value)}>
                        <SelectTrigger className="w-full focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand focus-brand">
                          <SelectValue />
                        </SelectTrigger>
                        {/* Region options match the view-mode
                            display-formatting rules (APAC / EMEA /
                            MENA / Global stay all-caps); aligned
                            across both modes so the user picks the
                            same label they read. */}
                        <SelectContent>
                          <SelectItem value="apac">APAC</SelectItem>
                          <SelectItem value="emea">EMEA</SelectItem>
                          <SelectItem value="mena">MENA</SelectItem>
                          <SelectItem value="global">Global</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="display-serif text-[17px] text-ink-warm-900 leading-tight">{displayRegion(campaign?.region)}</div>
                    )}
                  </div>
                  {/* [Phase edit relocation] Current Phase moved to the
                      Edit Portal popup on /clients (top of the Context
                      tab) so it lives next to the portal it controls.
                      The campaign list view still has the inline Phase
                      column for bulk visibility/editing. Block kept
                      under `false &&` so the data + handler logic is
                      preserved — flip to true to restore the field here. */}
                  {false && (
                  <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                    <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                      <Activity className="h-3.5 w-3.5 text-brand" />
                      Current Phase
                    </div>
                    {editMode ? (
                      <>
                        <Select
                          value={form?.current_phase ?? '__none__'}
                          onValueChange={value =>
                            handleChange('current_phase' as any, value === '__none__' ? null : value)
                          }
                        >
                          <SelectTrigger className="w-full focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand focus-brand">
                            <SelectValue placeholder="— None (hide badge)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— None (hide badge)</SelectItem>
                            {CURRENT_PHASE_OPTIONS.map(phase => (
                              <SelectItem key={phase} value={phase}>{phase}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-ink-warm-500 mt-1.5 leading-snug">
                          Shown in the client portal hero once onboarding completes.
                        </p>
                      </>
                    ) : campaign?.current_phase ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand/10 text-brand text-sm font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand" />
                        {campaign?.current_phase}
                      </span>
                    ) : (
                      <div className="text-sm text-ink-warm-400 italic">Not set</div>
                    )}
                  </div>
                  )}
                    </div>
                  </div>

                  {/* Client Information Section */}
                  <div className="bg-white p-6 rounded-[14px] border border-cream-200 shadow-card">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-9 h-9 rounded-md bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center shrink-0">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Client Information</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-3">Client</div>
                        {editMode ? (
                          <Select value={form?.client_id || ""} onValueChange={value => handleChange("client_id", value)}>
                            <SelectTrigger className="w-full focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand focus-brand">
                              <SelectValue placeholder="Select client" />
                            </SelectTrigger>
                            <SelectContent>
                              {allClients.map((client) => (
                                <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          (() => {
                            const clientName = campaign?.client_name || '-';
                            const clientEmail = campaign?.client_email || '';
                            const clientLogoUrl = campaign?.client_logo_url;
                            const initials = clientName !== '-' ? clientName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) : '?';
                            return (
                              <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10">
                                  {clientLogoUrl && <AvatarImage src={clientLogoUrl} alt={clientName} className="object-cover" />}
                                  <AvatarFallback className="bg-brand-soft text-brand-deep border border-brand-light font-semibold">
                                    {initials}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="font-semibold text-ink-warm-900">{clientName}</div>
                                  {clientEmail && <div className="text-xs text-ink-warm-500">{clientEmail}</div>}
                                </div>
                              </div>
                            );
                          })()
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Client Communication Section - Hidden */}
                  {false && <div className="bg-white p-6 rounded-[14px] border border-cream-200 shadow-card">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-9 h-9 rounded-md bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center shrink-0">
                        <Phone className="h-4 w-4" />
                      </div>
                      <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Client Communication</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">Intro Call</div>
                        {editMode ? (
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="intro_call"
                              checked={!!form?.intro_call}
                              onCheckedChange={checked => handleChange("intro_call", !!checked)}
                            />
                            <Label htmlFor="intro_call" className="text-sm">Intro call held?</Label>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {campaign?.intro_call ? (
                              <>
                                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                <span className="text-base font-semibold text-emerald-600">Completed</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-5 w-5 text-ink-warm-400" />
                                <span className="text-base font-medium text-ink-warm-400">Not Held</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      {!!(editMode ? form?.intro_call : campaign?.intro_call) && (
                        <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                          <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">Intro Call Date</div>
                          {editMode ? (
                        <Popover key="intro-call-popover">
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={`focus-brand justify-start text-left font-normal h-9 ${form?.intro_call_date ? 'text-ink-warm-900' : 'text-ink-warm-400'}`}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {form?.intro_call_date ? formatDate(form?.intro_call_date) : "Select intro call date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-50" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={parseDate(form?.intro_call_date)}
                              onSelect={date => handleChange("intro_call_date", date ? formatDateForInput(date) : undefined)}
                              initialFocus
                              classNames={{ day_selected: "text-white hover:text-white focus:text-white" }}
                              modifiersStyles={{ selected: { backgroundColor: "#3e8692" } }}
                            />
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <div className="text-base font-semibold text-ink-warm-900">{campaign?.intro_call_date ? formatDate(campaign?.intro_call_date) : '-'}</div>
                      )}
                        </div>
                      )}
                      <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">Proposal Sent</div>
                        {editMode ? (
                          <Checkbox id="proposal_sent" checked={!!form?.proposal_sent} onCheckedChange={checked => handleChange("proposal_sent", !!checked)} />
                        ) : (
                          <div className="flex items-center gap-2">
                            {campaign?.proposal_sent ? (
                              <>
                                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                <span className="text-base font-semibold text-emerald-600">Sent</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-5 w-5 text-ink-warm-400" />
                                <span className="text-base font-medium text-ink-warm-400">Not Sent</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">NDA Signed</div>
                        {editMode ? (
                          <Checkbox id="nda_signed" checked={!!form?.nda_signed} onCheckedChange={checked => handleChange("nda_signed", !!checked)} />
                        ) : (
                          <div className="flex items-center gap-2">
                            {campaign?.nda_signed ? (
                              <>
                                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                <span className="text-base font-semibold text-emerald-600">Signed</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-5 w-5 text-ink-warm-400" />
                                <span className="text-base font-medium text-ink-warm-400">Not Signed</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>}

                  {/* Team & Management Section */}
                  <div className="bg-white p-6 rounded-[14px] border border-cream-200 shadow-card">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-9 h-9 rounded-md bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center shrink-0">
                        <Users className="h-4 w-4" />
                      </div>
                      <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Team & Management</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-3">Manager</div>
                        {editMode ? (
                          <Select value={form?.manager || ""} onValueChange={value => handleChange("manager", value)}>
                            <SelectTrigger className="w-full focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand focus-brand">
                              <SelectValue placeholder="Select manager" />
                            </SelectTrigger>
                            <SelectContent>
                              {allUsers.map((user) => (
                                <SelectItem key={user.id} value={user.id}>{user.name || user.email}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          (() => {
                            const manager = allUsers.find(u => u.id === campaign.manager);
                            const managerName = manager?.name || manager?.email || '-';
                            const managerPhotoUrl = manager?.profile_photo_url;
                            const initials = managerName !== '-' ? managerName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) : '?';
                            return (
                              <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10">
                                  {managerPhotoUrl && <AvatarImage src={managerPhotoUrl} alt={managerName} className="object-cover" />}
                                  <AvatarFallback className="bg-brand-soft text-brand-deep border border-brand-light font-semibold">
                                    {initials}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="font-semibold text-ink-warm-900">{managerName}</div>
                                  {manager?.email && <div className="text-xs text-ink-warm-500">{manager.email}</div>}
                                </div>
                              </div>
                            );
                          })()
                        )}
                      </div>
                      {/* [May 2026 audit] Call Support hidden — flag was
                          rarely toggled and the value wasn't surfaced
                          anywhere downstream. Form state + save still
                          plumbed so existing data isn't lost. */}
                      {false && (
                      <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">Call Support</div>
                        {editMode ? (
                          <Checkbox id="call_support" checked={!!form?.call_support} onCheckedChange={checked => handleChange("call_support", !!checked)} />
                        ) : (
                          <div className="flex items-center gap-2">
                            {campaign?.call_support ? (
                              <>
                                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                <span className="text-base font-semibold text-emerald-600">Available</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-5 w-5 text-ink-warm-400" />
                                <span className="text-base font-medium text-ink-warm-400">Not Available</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      )}
                    </div>
                  </div>

                  {/* Campaign Settings Section */}
                  <div className="bg-white p-6 rounded-[14px] border border-cream-200 shadow-card">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-9 h-9 rounded-md bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center shrink-0">
                        <BadgeCheck className="h-4 w-4" />
                      </div>
                      <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Campaign Settings</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">Client Choosing KOLs</div>
                        {editMode ? (
                          <Checkbox id="client_choosing_kols" checked={!!form?.client_choosing_kols} onCheckedChange={checked => handleChange("client_choosing_kols", !!checked)} />
                        ) : (
                          <div className="flex items-center gap-2">
                            {campaign?.client_choosing_kols ? (
                              <>
                                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                <span className="text-base font-semibold text-emerald-600">Enabled</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-5 w-5 text-ink-warm-400" />
                                <span className="text-base font-medium text-ink-warm-400">Disabled</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">Multi-Activation</div>
                        {editMode ? (
                          <Checkbox id="multi_activation" checked={!!form?.multi_activation} onCheckedChange={checked => handleChange("multi_activation", !!checked)} />
                        ) : (
                          <div className="flex items-center gap-2">
                            {campaign?.multi_activation ? (
                              <>
                                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                <span className="text-base font-semibold text-emerald-600">Enabled</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-5 w-5 text-ink-warm-400" />
                                <span className="text-base font-medium text-ink-warm-400">Disabled</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Approved Access Section */}
                  <div className="bg-white p-6 rounded-[14px] border border-cream-200 shadow-card">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-9 h-9 rounded-md bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center shrink-0">
                        <Users className="h-4 w-4" />
                      </div>
                      <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Approved Access</h3>
                    </div>
                    <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                      <p className="text-sm text-ink-warm-700 mb-3">
                        {editMode
                          ? 'Add email addresses or domains that are allowed to access the public campaign view (in addition to the client email and same-domain emails).'
                          : 'Email addresses and domains allowed to access the public campaign view (in addition to the client email and same-domain emails).'}
                      </p>
                      {editMode && (
                        <div className="flex flex-col gap-2">
                          <Textarea
                            value={emailInput}
                            onChange={(e) => setEmailInput(e.target.value)}
                            placeholder={"Enter emails or domains (comma or newline separated)\ne.g. user@example.com, partner.com"}
                            className="focus-brand min-h-[80px]"
                          />
                          <Button
                            type="button"
                            onClick={() => {
                              const entries = emailInput
                                .split(/[\n,]+/)
                                .map(entry => entry.trim().toLowerCase())
                                .filter(entry => entry.length > 0);
                              const currentEmails = (form as any)?.approved_emails || [];
                              const newEmails = entries.filter(entry =>
                                entry.includes('@') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry) && !currentEmails.includes(entry)
                              );
                              if (newEmails.length > 0) {
                                handleChange('approved_emails' as any, [...currentEmails, ...newEmails]);
                                setEmailInput('');
                              }
                            }}
                            disabled={!emailInput.trim()}
                            variant="brand"
                            className="w-fit"
                          >
                            Add
                          </Button>
                        </div>
                      )}
                      {(() => {
                        const emails = (editMode ? (form as any)?.approved_emails : campaign?.approved_emails) || [];
                        return emails.length > 0 ? (
                          <div className={`flex flex-wrap gap-2 ${editMode ? 'mt-3' : ''}`}>
                            {emails.map((email: string, index: number) => (
                              <div
                                key={`email-${index}`}
                                className="inline-flex items-center gap-1 px-3 py-1 bg-cream-100 text-ink-warm-700 rounded-full text-sm"
                              >
                                {email}
                                {editMode && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const currentEmails = (form as any)?.approved_emails || [];
                                      handleChange('approved_emails' as any, currentEmails.filter((_: string, i: number) => i !== index));
                                    }}
                                    className="ml-1 text-ink-warm-500 hover:text-ink-warm-700"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          !editMode && (
                            <p className="text-sm text-ink-warm-400 italic">No approved emails or domains added yet.</p>
                          )
                        );
                      })()}
                    </div>
                  </div>

                  {/* Budget Section */}
                  <div className="bg-white p-6 rounded-[14px] border border-cream-200 shadow-card">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-9 h-9 rounded-md bg-brand-soft text-brand-deep border border-brand-light flex items-center justify-center shrink-0">
                        <DollarSign className="h-4 w-4" />
                      </div>
                      <h3 className="display-serif text-[17px] text-ink-warm-900 leading-tight">Budget</h3>
                    </div>
                    <div className="space-y-4">
                      {/* Budget Overview Card */}
                      <div className="bg-white p-5 rounded-lg border border-cream-200">
                        <div className="grid grid-cols-2 gap-6 mb-4">
                          <div>
                            <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">Total Budget</div>
                            {editMode ? (
                              <div className="relative w-full">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-warm-500 pointer-events-none">$</span>
                                <Input
                                  type="text"
                                  className="pl-6 w-full focus-brand focus:ring-2 focus:ring-brand focus:border-brand"
                                 
                                  value={form?.total_budget ? Number(form.total_budget).toLocaleString() : ""}
                                  onChange={e => {
                                    const value = e.target.value.replace(/,/g, '');
                                    if (value === '' || !isNaN(Number(value))) {
                                      handleChange("total_budget", value);
                                    }
                                  }}
                                />
                              </div>
                            ) : (
                              <div className="display-serif text-[28px] font-semibold text-ink-warm-900 tabular-nums leading-tight" style={{ letterSpacing: '-0.03em' }}>{CampaignService.formatCurrency(campaign.total_budget)}</div>
                            )}
                          </div>
                          <div>
                            <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-2">Allocated</div>
                            <div className="display-serif text-[28px] font-semibold text-brand tabular-nums leading-tight" style={{ letterSpacing: '-0.03em' }}>{CampaignService.formatCurrency(campaign.total_allocated || 0)}</div>
                          </div>
                        </div>
                        {/* Progress Bar */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-ink-warm-700">Budget Utilization</span>
                            <span className="text-sm font-bold text-ink-warm-900">{CampaignService.calculateBudgetUtilization(campaign.total_budget, campaign.total_allocated || 0)}%</span>
                          </div>
                          <div className="w-full bg-cream-200 rounded-full h-3 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-brand to-brand-dark transition-all duration-300 rounded-full"
                              style={{ width: `${Math.min(CampaignService.calculateBudgetUtilization(campaign.total_budget, campaign.total_allocated || 0), 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>

                      {/* Budget Type */}
                      <div className="bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-3">Budget Type</div>
                        {editMode ? (
                          <div className="flex gap-4">
                            {budgetTypeOptions.map(type => (
                              <div key={type} className="flex items-center gap-2">
                                <Checkbox
                                  id={`budget_type_${type}`}
                                  checked={form?.budget_type?.includes(type) || false}
                                  onCheckedChange={checked => {
                                    const current = form?.budget_type || [];
                                    if (checked) {
                                      handleChange("budget_type", [...current, type]);
                                    } else {
                                      handleChange("budget_type", current.filter((t: string) => t !== type));
                                    }
                                  }}
                                />
                                <Label htmlFor={`budget_type_${type}`} className="text-sm capitalize">{type}</Label>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {(campaign?.budget_type || []).length > 0 ? (
                              (campaign?.budget_type || []).map((type: string) => (
                                <Badge key={type} variant="outline" className="capitalize text-brand border-brand">{type}</Badge>
                              ))
                            ) : (
                              <span className="text-ink-warm-400 italic">No budget types specified</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {editMode ? (
                      <div className="mt-4 bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                        <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-3">Regional Allocations</div>
                        <div className="flex flex-col gap-2">
                      {allocations.map((alloc, idx) => (
                        <div key={alloc.id || idx} className="flex items-center gap-2">
                          <Select value={alloc.region} onValueChange={value => {
                            const updated = [...allocations];
                            updated[idx].region = value;
                            setAllocations(updated);
                          }}>
                            <SelectTrigger className="w-32 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand focus-brand">
                              <SelectValue placeholder="Select region" />
                            </SelectTrigger>
                            <SelectContent>
                              {regionOptions.map(region => (
                                <SelectItem key={region} value={region}>{region}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="relative w-28">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-warm-500 pointer-events-none">$</span>
                            <Input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9,]*"
                              className="focus-brand pl-6 w-full"
                              placeholder="Amount"
                              value={alloc.allocated_budget ? Number(String(alloc.allocated_budget).replace(/,/g, '')).toLocaleString('en-US') : ''}
                              onChange={e => {
                                // Remove all non-digit and non-comma characters, then remove commas
                                const raw = e.target.value.replace(/[^\d,]/g, '').replace(/,/g, '');
                                const updated = [...allocations];
                                updated[idx].allocated_budget = raw;
                                setAllocations(updated);
                              }}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-rose-500 hover:text-rose-700"
                            onClick={() => {
                              if (alloc.id) setDeletedAllocIds(ids => [...ids, alloc.id]);
                              setAllocations(allocations.filter((_, i) => i !== idx));
                            }}
                            aria-label="Remove allocation"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => setAllocations([...allocations, { region: '', allocated_budget: '' }])}
                      >Add Allocation</Button>
                        </div>
                      </div>
                    ) : (
                      Array.isArray(campaign.budget_allocations) && campaign.budget_allocations.length > 0 && (
                        <div className="mt-4 bg-white p-4 rounded-[14px] border border-cream-200 shadow-card">
                          <div className="text-[10px] font-semibold text-ink-warm-500 uppercase tracking-[0.2em] mb-3">Regional Allocations</div>
                          <div className="flex flex-wrap gap-2">
                            {campaign.budget_allocations.map((alloc: any) => (
                              <Badge key={alloc.id} variant="secondary" className="px-3 py-1.5 text-sm">
                                <MapPin className="h-3.5 w-3.5 mr-1.5 inline" />
                                {alloc.region === 'apac' ? 'APAC' : alloc.region === 'global' ? 'Global' : alloc.region}: {CampaignService.formatCurrency(alloc.allocated_budget)}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </div>

                {editMode && (
                  <div className="flex gap-2 mt-6 col-span-2">
                    <Button variant="brand" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
                    <Button variant="outline" onClick={handleCancel} disabled={saving}>Cancel</Button>
                  </div>
                )}
                    </div>
              </CardContent>
    </>
  );
}
