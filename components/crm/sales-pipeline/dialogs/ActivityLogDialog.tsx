'use client';

/**
 * ActivityLogDialog — the omnibus "log an activity" modal triggered
 * from quick-action buttons across the kanban / table / slide-over.
 *
 * Sections (top to bottom, all in one inner-scroll body):
 *   1. **Type picker** — pill row for {Note · Message · Meeting ·
 *      Proposal · Bump}. Changes the rest of the form's tone (e.g.
 *      `message` swaps Description's label + adds a Template
 *      picker + a Copy-to-clipboard button).
 *   2. **DM Template picker** (shown only for message/bump) — searches
 *      `templates`, splits results into "Current Stage" vs "Other
 *      Stages" groups for the opp's current stage. Selecting a
 *      template fills the Description.
 *   3. **Title** — always editable.
 *   4. **Send Booking Link panel** (shown only for activities with
 *      `showMeetingPicker`) — lets the user copy a Calendly link
 *      personalized to a chosen team member instead of forcing a
 *      manual schedule.
 *   5. **Meeting Date + Time pickers** (shown only with
 *      `showMeetingPicker`) — Popover-based date/time pickers with
 *      AM/PM hour scroll + minute scroll.
 *   6. **Co-Owners** (shown only with `showMeetingPicker`) — chip
 *      list + add picker. Surfaces meeting attribution for
 *      multi-rep deals.
 *   7. **Description** — Textarea. Adds a Copy button for `message`
 *      type so the rep can paste the DM elsewhere.
 *   8. **Outcome + Next Step** — two short inputs in a grid.
 *   9. **Next Step Date** — Popover Calendar.
 *
 * Extracted from `app/crm/sales-pipeline/page.tsx` (was
 * `renderActivityLogPrompt`, ~377 LOC) on 2026-06-02 as part of
 * Phase 3 of the structural split. Consumes ~12 fields from
 * `SalesPipelineContext`. The local `ACTIVITY_TYPE_LABELS` map and
 * `getMeetingDateTime` helper stay inline since they're only used
 * here.
 *
 * v11 note: gray-* tokens preserved during the structural split.
 * The blue/sky/purple/amber/orange/cream pills for the type-picker
 * row will be reconsidered when the page-wide v11 pass runs at the
 * end of Phase 4. Some inline `style={{ borderColor: '#e5e7eb', ... }}`
 * on date-picker buttons are also flagged for that pass.
 */

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import {
  Calendar,
  ChevronsUpDown,
  Clock,
  Copy,
  FileText,
  Loader2,
  MessageSquare,
  Phone,
  StickyNote,
  Zap,
} from 'lucide-react';
import { format } from 'date-fns';
import { useSalesPipeline } from '@/contexts/SalesPipelineContext';
import type { ActivityType } from '@/lib/salesPipelineService';
import { formatDate } from '@/lib/dateFormat';

const ACTIVITY_TYPE_LABELS: Record<ActivityType, { label: string; icon: React.ReactNode; color: string }> = {
  call:     { label: 'Call',     icon: <Phone className="h-3.5 w-3.5" />,           color: 'bg-blue-100 text-blue-700' },
  message:  { label: 'Message',  icon: <MessageSquare className="h-3.5 w-3.5" />,   color: 'bg-sky-100 text-sky-700' },
  meeting:  { label: 'Meeting',  icon: <Calendar className="h-3.5 w-3.5" />,        color: 'bg-purple-100 text-purple-700' },
  proposal: { label: 'Proposal', icon: <FileText className="h-3.5 w-3.5" />,        color: 'bg-amber-100 text-amber-700' },
  note:     { label: 'Note',     icon: <StickyNote className="h-3.5 w-3.5" />,      color: 'bg-cream-100 text-ink-warm-700' },
  bump:     { label: 'Bump',     icon: <Zap className="h-3.5 w-3.5" />,             color: 'bg-orange-100 text-orange-700' },
};

const TYPE_PILLS: Array<{ key: ActivityType; label: string; icon: React.ReactNode; color: string }> = [
  { key: 'note',     label: 'Note',     icon: <StickyNote className="h-3.5 w-3.5" />,   color: 'bg-cream-100 text-ink-warm-700 border-cream-300' },
  { key: 'message',  label: 'Message',  icon: <MessageSquare className="h-3.5 w-3.5" />, color: 'bg-sky-100 text-sky-700 border-sky-300' },
  { key: 'meeting',  label: 'Meeting',  icon: <Calendar className="h-3.5 w-3.5" />,      color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { key: 'proposal', label: 'Proposal', icon: <FileText className="h-3.5 w-3.5" />,      color: 'bg-amber-100 text-amber-700 border-amber-300' },
  { key: 'bump',     label: 'Bump',     icon: <Zap className="h-3.5 w-3.5" />,           color: 'bg-orange-100 text-orange-700 border-orange-300' },
];

export function ActivityLogDialog() {
  const {
    activityLogPrompt,
    setActivityLogPrompt,
    activityLogForm,
    setActivityLogForm,
    isActivityLogSubmitting,
    templatePopoverOpen,
    setTemplatePopoverOpen,
    opportunities,
    templates,
    users,
    activeUsers,
    bookingUserId,
    setBookingUserId,
    confirmActivityLog,
    copyBookingLink,
    toast,
  } = useSalesPipeline();

  // Suppress unused-var warning for ACTIVITY_TYPE_LABELS — kept exported-locally for parity with the inline version
  // and possible future use (e.g. a "log activity" surface that needs the icon+color map by type id).
  void ACTIVITY_TYPE_LABELS;

  const meetingDateObj = activityLogForm.meeting_date ? new Date(activityLogForm.meeting_date) : undefined;

  /** Reset the form to its empty default on cancel/dismiss. */
  const resetForm = () => {
    setActivityLogPrompt(null);
    setActivityLogForm({
      title: '',
      description: '',
      outcome: '',
      next_step: '',
      meeting_date: undefined,
      meeting_time: undefined,
      next_step_date: undefined,
      co_owner_ids: undefined,
    });
  };

  return (
    <Dialog
      open={!!activityLogPrompt}
      onOpenChange={open => { if (!open) resetForm(); }}
    >
      <DialogContent className="sm:max-w-md z-[80] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Log Activity — {activityLogPrompt?.oppName}</DialogTitle>
          <DialogDescription>Add context to this activity before saving.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto flex-1 px-1 -mx-1">
          {/* Type selector */}
          <div className="flex flex-wrap items-center gap-1">
            {TYPE_PILLS.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setActivityLogPrompt(prev => prev ? { ...prev, type: t.key } : prev)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  activityLogPrompt?.type === t.key ? t.color : 'bg-white text-ink-warm-400 border-cream-200 hover:bg-cream-50'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* Template picker for message/bump type */}
          {(activityLogPrompt?.type === 'message' || activityLogPrompt?.type === 'bump') && (() => {
            const opp = opportunities.find(o => o.id === activityLogPrompt.oppId);
            const oppStage = opp?.stage || '';
            const stageTemplates = templates.filter(t => t.is_active && (t.stage === oppStage || (activityLogPrompt.type === 'bump' && t.stage === 'bump')));
            const otherTemplates = templates.filter(t => t.is_active && t.stage !== oppStage && !(activityLogPrompt.type === 'bump' && t.stage === 'bump'));
            return (
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider">DM Template <span className="font-normal normal-case text-ink-warm-400">(optional)</span></Label>
                <Popover open={templatePopoverOpen} onOpenChange={setTemplatePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="focus-brand justify-between font-normal text-sm h-10">
                      Pick a template...
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[90]" align="start">
                    <Command>
                      <CommandInput placeholder="Search templates..." />
                      <CommandList>
                        <CommandEmpty>No templates found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem onSelect={() => { setActivityLogForm(f => ({ ...f, description: '' })); setTemplatePopoverOpen(false); }}>
                            No template
                          </CommandItem>
                        </CommandGroup>
                        {stageTemplates.length > 0 && (
                          <CommandGroup heading={`Current Stage — ${oppStage.replace(/_/g, ' ')}`}>
                            {stageTemplates.map(t => (
                              <CommandItem key={t.id} onSelect={() => { setActivityLogForm(f => ({ ...f, description: t.content })); setTemplatePopoverOpen(false); }}>
                                <div className="flex items-center gap-2 w-full">
                                  <span>{t.name}</span>
                                  {(t.tags || []).length > 0 && (
                                    <span className="text-[10px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">{(t.tags || []).join(', ')}</span>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                        {otherTemplates.length > 0 && (
                          <CommandGroup heading="Other Stages">
                            {otherTemplates.map(t => (
                              <CommandItem key={t.id} onSelect={() => { setActivityLogForm(f => ({ ...f, description: t.content })); setTemplatePopoverOpen(false); }}>
                                <div className="flex items-center gap-2 w-full">
                                  <span>{t.name}</span>
                                  <span className="text-ink-warm-400 text-xs">({t.stage.replace(/_/g, ' ')})</span>
                                  {(t.tags || []).length > 0 && (
                                    <span className="text-[10px] text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">{(t.tags || []).join(', ')}</span>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            );
          })()}

          {/* Title (editable) */}
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider">Title</Label>
            <Input
              value={activityLogForm.title}
              onChange={e => setActivityLogForm(f => ({ ...f, title: e.target.value }))}
              className="focus-brand"
              placeholder="Activity title..."
            />
          </div>

          {/* Copy Booking Link — send to prospect so they self-book */}
          {activityLogPrompt?.showMeetingPicker && (
            <div className="p-3 bg-brand/5 border border-brand/20 rounded-lg">
              <p className="text-xs text-ink-warm-700 mb-2">Send a booking link so they can pick a time themselves:</p>
              <div className="flex items-center gap-2">
                <Select
                  value={bookingUserId[`activity-${activityLogPrompt.oppId}`] || activityLogPrompt.ownerId || ''}
                  onValueChange={v => setBookingUserId(prev => ({ ...prev, [`activity-${activityLogPrompt.oppId}`]: v }))}
                >
                  <SelectTrigger className="h-8 text-sm flex-1 border-brand/30">
                    <SelectValue placeholder="Team member" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeUsers.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-sm whitespace-nowrap border-brand/30 text-brand hover:bg-brand/10"
                  onClick={() => copyBookingLink(bookingUserId[`activity-${activityLogPrompt.oppId}`] || activityLogPrompt.ownerId || '', activityLogPrompt.oppId)}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Booking Link
                </Button>
              </div>
            </div>
          )}

          {/* Meeting Date/Time pickers */}
          {activityLogPrompt?.showMeetingPicker && (
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider">Meeting Date <span className="font-normal normal-case text-ink-warm-400">(optional)</span></Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={`focus-brand justify-start text-left font-normal w-full bg-white border-cream-200 ${activityLogForm.meeting_date ? 'text-ink-warm-900' : 'text-ink-warm-400'}`}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {meetingDateObj ? format(meetingDateObj, 'MMM d, yyyy') : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[90]" align="start">
                    <CalendarPicker
                      mode="single"
                      selected={meetingDateObj}
                      onSelect={date => {
                        setActivityLogForm(f => ({ ...f, meeting_date: date ? date.toISOString() : undefined }));
                      }}
                      initialFocus
                      classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                      modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider">Meeting Time <span className="font-normal normal-case text-ink-warm-400">(optional)</span></Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={`focus-brand justify-start text-left font-normal w-full bg-white border-cream-200 ${activityLogForm.meeting_time ? 'text-ink-warm-900' : 'text-ink-warm-400'}`}
                    >
                      <Clock className="mr-2 h-4 w-4" />
                      {activityLogForm.meeting_time
                        ? (() => { const [h, m] = activityLogForm.meeting_time!.split(':').map(Number); return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; })()
                        : 'Select time'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[90]" align="start">
                    <div className="flex gap-0 divide-x">
                      <ScrollArea className="h-[200px] w-[70px]">
                        <div className="p-1">
                          {Array.from({ length: 24 }, (_, h) => {
                            const label = `${h === 0 ? 12 : h > 12 ? h - 12 : h} ${h >= 12 ? 'PM' : 'AM'}`;
                            const isSelected = activityLogForm.meeting_time && parseInt(activityLogForm.meeting_time.split(':')[0]) === h;
                            return (
                              <Button
                                key={h}
                                variant={isSelected ? 'brand' : 'ghost'}
                                className="w-full justify-center font-normal text-xs h-7 px-1"
                                onClick={() => {
                                  const currentMin = activityLogForm.meeting_time ? activityLogForm.meeting_time.split(':')[1] : '00';
                                  setActivityLogForm(f => ({ ...f, meeting_time: `${String(h).padStart(2, '0')}:${currentMin}` }));
                                }}
                              >
                                {label}
                              </Button>
                            );
                          })}
                        </div>
                      </ScrollArea>
                      <ScrollArea className="h-[200px] w-[50px]">
                        <div className="p-1">
                          {Array.from({ length: 60 }, (_, m) => {
                            const isSelected = activityLogForm.meeting_time && parseInt(activityLogForm.meeting_time.split(':')[1]) === m;
                            return (
                              <Button
                                key={m}
                                variant={isSelected ? 'brand' : 'ghost'}
                                className="w-full justify-center font-normal text-xs h-7 px-1"
                                onClick={() => {
                                  const currentHour = activityLogForm.meeting_time ? activityLogForm.meeting_time.split(':')[0] : '09';
                                  setActivityLogForm(f => ({ ...f, meeting_time: `${currentHour}:${String(m).padStart(2, '0')}` }));
                                }}
                              >
                                {String(m).padStart(2, '0')}
                              </Button>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {/* Co-Owners — shown when booking a meeting */}
          {activityLogPrompt?.showMeetingPicker && (
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider">Co-Owners for this Meeting</Label>
              <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 border rounded-md bg-white">
                {(activityLogForm.co_owner_ids || []).map(id => {
                  const u = users.find(u => u.id === id);
                  return (
                    <span key={id} className="inline-flex items-center gap-1 bg-brand/10 text-brand text-xs px-2 py-0.5 rounded-full">
                      {u?.name || u?.email || id}
                      <button type="button" onClick={() => setActivityLogForm(f => ({ ...f, co_owner_ids: (f.co_owner_ids || []).filter(i => i !== id) }))} className="ml-0.5">&times;</button>
                    </span>
                  );
                })}
                <Select value="" onValueChange={v => {
                  if (v && !(activityLogForm.co_owner_ids || []).includes(v)) {
                    setActivityLogForm(f => ({ ...f, co_owner_ids: [...(f.co_owner_ids || []), v] }));
                  }
                }}>
                  <SelectTrigger className="border-none shadow-none bg-transparent h-6 w-auto px-1 text-xs text-ink-warm-400 focus:ring-0"><SelectValue placeholder="+ Add" /></SelectTrigger>
                  <SelectContent>
                    {activeUsers.filter(u => !(activityLogForm.co_owner_ids || []).includes(u.id)).map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Description */}
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider">{activityLogPrompt?.type === 'message' ? 'Message' : 'Description'} <span className="font-normal normal-case text-ink-warm-400">(optional)</span></Label>
              {activityLogPrompt?.type === 'message' && activityLogForm.description && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-ink-warm-500 "
                  onClick={() => {
                    navigator.clipboard.writeText(activityLogForm.description);
                    toast({ title: 'Copied to clipboard' });
                  }}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </Button>
              )}
            </div>
            <Textarea
              value={activityLogForm.description}
              onChange={e => setActivityLogForm(f => ({ ...f, description: e.target.value }))}
              className="focus-brand min-h-[60px]"
              placeholder={activityLogPrompt?.type === 'message' ? 'DM content...' : 'Add context...'}
              rows={activityLogPrompt?.type === 'message' ? 4 : 2}
            />
          </div>

          {/* Outcome + Next Step */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider">Outcome <span className="font-normal normal-case text-ink-warm-400">(optional)</span></Label>
              <Input
                value={activityLogForm.outcome}
                onChange={e => setActivityLogForm(f => ({ ...f, outcome: e.target.value }))}
                className="focus-brand"
                placeholder="Result..."
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider">Next Step <span className="font-normal normal-case text-ink-warm-400">(optional)</span></Label>
              <Input
                value={activityLogForm.next_step}
                onChange={e => setActivityLogForm(f => ({ ...f, next_step: e.target.value }))}
                className="focus-brand"
                placeholder="What's next..."
              />
            </div>
          </div>

          {/* Next Step Date */}
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider">Next Step Date <span className="font-normal normal-case text-ink-warm-400">(optional)</span></Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={`focus-brand justify-start text-left font-normal w-full bg-white border-cream-200 ${activityLogForm.next_step_date ? 'text-ink-warm-900' : 'text-ink-warm-400'}`}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  {activityLogForm.next_step_date
                    ? formatDate(activityLogForm.next_step_date)
                    : 'Select date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[90]" align="start">
                <CalendarPicker
                  mode="single"
                  selected={activityLogForm.next_step_date ? new Date(activityLogForm.next_step_date) : undefined}
                  onSelect={date => setActivityLogForm(f => ({ ...f, next_step_date: date ? date.toISOString() : undefined }))}
                  initialFocus
                  classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                  modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={resetForm}>Cancel</Button>
          <Button variant="brand" onClick={confirmActivityLog} disabled={isActivityLogSubmitting}>
            {isActivityLogSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Log Activity
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
