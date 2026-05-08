'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Custom time picker styled to match the rest of the app.
 *
 * Why we built this instead of using <input type="time">:
 *   - The native widget looks different in every browser (Chrome's combo
 *     box, Safari's spinner wheel, Firefox's text input). Hard to make it
 *     match the brand.
 *   - On macOS Chrome the up/down arrows on the native input are tiny and
 *     hard to discover.
 *
 * Design:
 *   - Popover trigger looks like an Input — same height, border, focus ring
 *   - Body shows a scrollable list of times in `stepMinutes` increments
 *   - Display format is 12-hour ("9:00 AM") for readability; values pass
 *     through as "HH:MM" 24-hour strings to match the existing data shape
 *     (booking_pages.available_slots, etc.)
 *
 * Accepts both "HH:MM" and "HH:MM:SS" on input; always emits "HH:MM".
 */

interface TimePickerProps {
  value: string;                // "HH:MM" or "HH:MM:SS"
  onChange: (value: string) => void;
  stepMinutes?: number;         // default 30
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  /**
   * Optional bound to filter selectable times. Useful to prevent picking
   * an end time before the start time. Strings in "HH:MM" format.
   */
  minTime?: string;
  maxTime?: string;
}

export function TimePicker({
  value,
  onChange,
  stepMinutes = 30,
  className,
  placeholder = 'Select time',
  disabled = false,
  minTime,
  maxTime,
}: TimePickerProps) {
  const [open, setOpen] = useState(false);

  // Normalize value to "HH:MM" — strips seconds if present.
  const normalized = value ? value.substring(0, 5) : '';

  // Generate the list of selectable times once.
  const options = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    const minMinutes = minTime ? toMinutes(minTime) : 0;
    const maxMinutes = maxTime ? toMinutes(maxTime) : 24 * 60;
    for (let m = 0; m < 24 * 60; m += stepMinutes) {
      if (m < minMinutes || m > maxMinutes) continue;
      const hh = Math.floor(m / 60);
      const mm = m % 60;
      const value24 = `${pad(hh)}:${pad(mm)}`;
      out.push({ value: value24, label: format12(hh, mm) });
    }
    return out;
  }, [stepMinutes, minTime, maxTime]);

  // When opening, scroll the selected option into view so the user lands
  // on roughly the right spot in a long list of 48 entries.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // Defer until popover content has mounted in the DOM.
    requestAnimationFrame(() => {
      const target = listRef.current?.querySelector<HTMLButtonElement>(
        `[data-time="${normalized}"]`,
      );
      target?.scrollIntoView({ block: 'center' });
    });
  }, [open, normalized]);

  const displayLabel = normalized
    ? (() => {
        const [h, m] = normalized.split(':').map(Number);
        return format12(h, m);
      })()
    : '';

  return (
    <Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-sm',
            'h-8 hover:border-gray-400 focus-brand transition-colors',
            'disabled:cursor-not-allowed disabled:opacity-50',
            !displayLabel && 'text-gray-400',
            className,
          )}
        >
          <Clock className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
          <span className="flex-1 text-left tabular-nums">
            {displayLabel || placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-32 p-0 max-h-64 overflow-hidden"
        align="start"
      >
        <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
          {options.map((opt) => {
            const isSelected = opt.value === normalized;
            return (
              <button
                key={opt.value}
                data-time={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  'w-full text-left px-3 py-1.5 text-sm tabular-nums transition-colors',
                  isSelected
                    ? 'bg-brand-light text-brand font-medium'
                    : 'hover:bg-gray-50 text-gray-700',
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── helpers ────────────────────────────────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.substring(0, 5).split(':').map(Number);
  return h * 60 + m;
}

function format12(h: number, m: number): string {
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${pad(m)} ${suffix}`;
}
