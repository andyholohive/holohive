'use client';

/**
 * ActivityTimelineSection — the slide-over's bottom block. Two
 * children:
 *
 *   1. **Add Activity form** — type tabs (Note / Message / Meeting /
 *      Proposal), optional Direction for messages, title/description/
 *      outcome/next-step inputs, optional meeting date+time picker for
 *      meeting-type activities, next-step date popover, file
 *      attachment, and the Add button.
 *   2. **Timeline feed** — the unified `TimelineEntry` list (manual
 *      activities + auto-stamped stage transitions + meetings +
 *      Telegram messages). Each entry has a tone-coded source badge
 *      and an inline `linkifyText` pass over title/description/outcome/
 *      next-step.
 *
 * Extracted from `OpportunitySlideOver.tsx` 2026-06-03 (Pass 2 of the
 * slide-over slice). Two utilities (`linkifyText`, `activityIcon`)
 * moved with it — they're only used here.
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowRight,
  Calendar,
  Clock,
  FileText,
  MessageSquare,
  Paperclip,
  Phone,
  StickyNote,
  X,
  Zap,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useSalesPipeline } from '@/contexts/SalesPipelineContext';
import type { ActivityType } from '@/lib/salesPipelineService';
import { formatDate } from '@/lib/dateFormat';

/** Convert URLs inside free-text into clickable anchors. Used by the
 *  timeline entries so pasted Notion/Linear/Calendly links work
 *  inline. */
function linkifyText(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    urlRegex.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand hover:underline break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {part}
      </a>
    ) : part
  );
}

/** Icon for a timeline entry. Accepts the union 'ActivityType |
 *  "stage_change"' so synthetic entries from crm_stage_history can
 *  render their own icon. Unhandled types render no icon (JSX
 *  treats `undefined` as nothing). */
function activityIcon(type: ActivityType | 'stage_change') {
  switch (type) {
    case 'call': return <Phone className="h-3.5 w-3.5" />;
    case 'message': return <MessageSquare className="h-3.5 w-3.5" />;
    case 'meeting': return <Calendar className="h-3.5 w-3.5" />;
    case 'proposal': return <FileText className="h-3.5 w-3.5" />;
    case 'note': return <StickyNote className="h-3.5 w-3.5" />;
    case 'bump': return <Zap className="h-3.5 w-3.5" />;
    case 'stage_change': return <ArrowRight className="h-3.5 w-3.5" />;
  }
}

export function ActivityTimelineSection() {
  const {
    activities,
    activityForm,
    setActivityForm,
    activityMeetingDate,
    setActivityMeetingDate,
    activityMeetingTime,
    setActivityMeetingTime,
    isActivitySubmitting,
    activityFile,
    setActivityFile,
    activityFileRef,
    handleAddActivity,
  } = useSalesPipeline();

  return (
    <div className="border-t pt-6">
      <h4 className="text-xs font-semibold text-ink-warm-500 uppercase tracking-wider mb-3">Activity Timeline</h4>

      {/* Add activity form */}
      <div className="space-y-3 mb-6 p-4 bg-cream-50 rounded-lg border border-cream-200">
        <div className="flex items-center gap-1 mb-1">
          {([
            { key: 'note' as const,     label: 'Note',     icon: <StickyNote className="h-3.5 w-3.5" />,    color: 'bg-cream-100 text-ink-warm-700 border-cream-200',           iconTone: 'text-ink-warm-500' },
            { key: 'message' as const,  label: 'Message',  icon: <MessageSquare className="h-3.5 w-3.5" />, color: 'bg-sky-100 text-sky-700 border-sky-200',                   iconTone: 'text-sky-500' },
            { key: 'meeting' as const,  label: 'Meeting',  icon: <Calendar className="h-3.5 w-3.5" />,      color: 'bg-purple-100 text-purple-700 border-purple-200',          iconTone: 'text-purple-500' },
            { key: 'proposal' as const, label: 'Proposal', icon: <FileText className="h-3.5 w-3.5" />,      color: 'bg-amber-100 text-amber-700 border-amber-200',             iconTone: 'text-amber-500' },
          ]).map(t => {
            const active = activityForm.type === t.key;
            // Inactive state keeps a hint of the type's tone on the
            // icon (was uniformly text-ink-warm-400, which made the
            // buttons read as disabled). Active state still wears the
            // full tinted bg + text combo.
            const inactiveIcon = (
              <span className={`flex-shrink-0 ${t.iconTone}`}>{t.icon}</span>
            );
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActivityForm(f => ({ ...f, type: t.key }))}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  active ? t.color : 'bg-white text-ink-warm-600 border-cream-200 hover:bg-cream-50'
                }`}
                aria-pressed={active}
              >
                {active ? t.icon : inactiveIcon}
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Direction toggle — only meaningful for messages. Defaults to
            outbound. Setting to inbound stamps last_reply_at on the
            opportunity (so the funnel can count replies). Hidden for
            note/meeting/proposal since those are always team-side
            actions. */}
        {activityForm.type === 'message' && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-ink-warm-500">Direction:</span>
            {([
              { v: 'outbound' as const, label: 'Outbound (we sent)', cls: 'bg-sky-100 text-sky-700 border-sky-200' },
              { v: 'inbound' as const,  label: 'Inbound (reply)',    cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
            ]).map(opt => {
              const current = activityForm.direction ?? 'outbound';
              const active = current === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setActivityForm(f => ({ ...f, direction: opt.v }))}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-colors ${
                    active ? opt.cls : 'bg-white text-ink-warm-400 border-cream-200 hover:bg-cream-50'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            placeholder="Title..."
            value={activityForm.title}
            onChange={e => setActivityForm(f => ({ ...f, title: e.target.value }))}
            className="h-9 text-sm flex-1 focus-brand"
          />
        </div>
        <Textarea
          placeholder="Description (optional)"
          value={activityForm.description || ''}
          onChange={e => setActivityForm(f => ({ ...f, description: e.target.value }))}
          className="text-sm min-h-[60px] focus-brand"
          rows={2}
        />
        <div className="flex gap-2">
          <Input
            placeholder="Outcome"
            value={activityForm.outcome || ''}
            onChange={e => setActivityForm(f => ({ ...f, outcome: e.target.value }))}
            className="h-9 text-sm flex-1 focus-brand"
          />
          <Input
            placeholder="Next step"
            value={activityForm.next_step || ''}
            onChange={e => setActivityForm(f => ({ ...f, next_step: e.target.value }))}
            className="h-9 text-sm flex-1 focus-brand"
          />
        </div>

        {/* Meeting Date/Time (only for meeting type) */}
        {activityForm.type === 'meeting' && (
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={`h-9 text-sm flex-1 focus-brand justify-start font-normal bg-white border-cream-200 ${activityMeetingDate ? 'text-ink-warm-900' : 'text-ink-warm-400'}`}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  {activityMeetingDate ? format(new Date(activityMeetingDate), 'MMM d, yyyy') : 'Meeting date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
                <CalendarPicker
                  mode="single"
                  selected={activityMeetingDate ? new Date(activityMeetingDate) : undefined}
                  onSelect={date => setActivityMeetingDate(date ? date.toISOString() : undefined)}
                  initialFocus
                  classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                  modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
                />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={`h-9 text-sm flex-1 focus-brand justify-start font-normal bg-white border-cream-200 ${activityMeetingTime ? 'text-ink-warm-900' : 'text-ink-warm-400'}`}
                >
                  <Clock className="mr-2 h-4 w-4" />
                  {activityMeetingTime
                    ? (() => { const [h, m] = activityMeetingTime.split(':').map(Number); return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; })()
                    : 'Time'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="!bg-white border shadow-md p-0 w-auto z-[80]" align="start">
                <div className="flex gap-0 divide-x">
                  <ScrollArea className="h-[200px] w-[70px]">
                    <div className="p-1">
                      {Array.from({ length: 24 }, (_, h) => {
                        const label = `${h === 0 ? 12 : h > 12 ? h - 12 : h} ${h >= 12 ? 'PM' : 'AM'}`;
                        const isSelected = activityMeetingTime && parseInt(activityMeetingTime.split(':')[0]) === h;
                        return (
                          <Button
                            key={h}
                            variant={isSelected ? 'brand' : 'ghost'}
                            className="w-full justify-center font-normal text-xs h-7 px-1"
                            onClick={() => {
                              const currentMin = activityMeetingTime ? activityMeetingTime.split(':')[1] : '00';
                              setActivityMeetingTime(`${String(h).padStart(2, '0')}:${currentMin}`);
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
                        const isSelected = activityMeetingTime && parseInt(activityMeetingTime.split(':')[1]) === m;
                        return (
                          <Button
                            key={m}
                            variant={isSelected ? 'brand' : 'ghost'}
                            className="w-full justify-center font-normal text-xs h-7 px-1"
                            onClick={() => {
                              const currentHour = activityMeetingTime ? activityMeetingTime.split(':')[0] : '09';
                              setActivityMeetingTime(`${currentHour}:${String(m).padStart(2, '0')}`);
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
        )}

        <div className="flex gap-2 items-center">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={`h-9 text-sm flex-1 focus-brand justify-start font-normal bg-white border-cream-200 ${activityForm.next_step_date ? 'text-ink-warm-900' : 'text-ink-warm-400'}`}
              >
                <Calendar className="mr-2 h-4 w-4" />
                {activityForm.next_step_date
                  ? formatDate(activityForm.next_step_date)
                  : 'Next step date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarPicker
                mode="single"
                selected={activityForm.next_step_date ? new Date(activityForm.next_step_date) : undefined}
                onSelect={(date) => setActivityForm(f => ({ ...f, next_step_date: date ? date.toISOString() : undefined }))}
                initialFocus
                classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
                modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="brand"
            size="sm"
            className="h-9 text-sm"
            onClick={handleAddActivity}
            disabled={isActivitySubmitting || !activityForm.title.trim()}
          >
            {isActivitySubmitting ? '...' : 'Add'}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={activityFileRef}
            className="hidden"
            onChange={e => setActivityFile(e.target.files?.[0] || null)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs text-ink-warm-500"
            onClick={() => activityFileRef.current?.click()}
          >
            <Paperclip className="h-3.5 w-3.5 mr-1" />
            {activityFile ? 'Change file' : 'Attach file'}
          </Button>
          {activityFile && (
            <div className="flex items-center gap-1.5 text-xs text-ink-warm-700 bg-white border rounded-md px-2 py-1">
              <Paperclip className="h-3 w-3 text-ink-warm-400" />
              <span className="truncate max-w-[180px]">{activityFile.name}</span>
              <button
                type="button"
                onClick={() => {
                  setActivityFile(null);
                  if (activityFileRef.current) activityFileRef.current.value = '';
                }}
                className="text-ink-warm-400"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Activity list — unified TimelineEntry feed (manual + stage +
          meetings + Telegram). Source-specific tone via `sourceStyle`. */}
      <div className="space-y-4">
        {activities.length === 0 ? (
          <p className="text-sm text-ink-warm-400 text-center py-6">No activity yet</p>
        ) : activities.map(act => {
          const sourceStyle =
            act.source === 'stage_change' ? { wrapper: 'bg-brand/10 text-brand', badge: 'bg-brand/10 text-brand border-brand/30' } :
            act.source === 'meeting'      ? { wrapper: 'bg-purple-100 text-purple-700', badge: 'bg-purple-50 text-purple-700 border-purple-200' } :
            act.source === 'telegram'     ? { wrapper: 'bg-sky-50 text-sky-600',    badge: 'bg-sky-50 text-sky-700 border-sky-200' } :
            { wrapper: 'bg-cream-100 text-ink-warm-500', badge: 'bg-white' };
          const sourceLabel =
            act.source === 'stage_change' ? 'stage' :
            act.source === 'meeting'      ? 'meeting' :
            act.source === 'telegram'     ? 'telegram' :
            act.type;
          return (
            <div key={act.id} className="flex gap-3">
              <div className="mt-0.5 flex flex-col items-center">
                <div className={`p-2 rounded-full ${sourceStyle.wrapper}`}>
                  {activityIcon(act.type)}
                </div>
                <div className="w-px flex-1 bg-cream-200 mt-2" />
              </div>
              <div className="flex-1 min-w-0 pb-4 overflow-hidden">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-ink-warm-900 break-words">{linkifyText(act.title)}</span>
                  <Badge variant="outline" className={`text-[10px] px-1.5 capitalize flex-shrink-0 ${sourceStyle.badge}`}>{sourceLabel}</Badge>
                </div>
                {act.description && (
                  <p className="text-sm text-ink-warm-700 mt-1 break-words" style={{ overflowWrap: 'anywhere' }}>
                    {linkifyText(act.description)}
                  </p>
                )}
                {act.outcome && (
                  <p className="text-sm text-ink-warm-500 mt-1 break-words" style={{ overflowWrap: 'anywhere' }}>
                    <span className="font-medium text-ink-warm-700">Outcome:</span> {linkifyText(act.outcome)}
                  </p>
                )}
                {act.next_step && (
                  <div className="flex items-start gap-1 mt-1 text-sm text-blue-600">
                    <ArrowRight className="h-3 w-3 flex-shrink-0 mt-0.5" />
                    <span className="break-words" style={{ overflowWrap: 'anywhere' }}>{linkifyText(act.next_step)}</span>
                    {act.next_step_date && (
                      <span className="text-ink-warm-400 ml-1">
                        ({format(new Date(act.next_step_date), 'MMM d')})
                      </span>
                    )}
                  </div>
                )}
                {act.attachment_url && (
                  <a
                    href={act.attachment_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1.5 text-xs text-brand hover:underline"
                    onClick={e => e.stopPropagation()}
                  >
                    <Paperclip className="h-3 w-3" />
                    {act.attachment_name || 'Attachment'}
                  </a>
                )}
                <span className="text-xs text-ink-warm-400 mt-1.5 block">
                  {formatDistanceToNow(new Date(act.created_at), { addSuffix: true })}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
