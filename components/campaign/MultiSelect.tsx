'use client';

/**
 * MultiSelect — popover-based multi-select picker used by the Content
 * dashboard table (per-row platform / content-type / deliverables
 * filters) and the Record Payment dialog (per-payment content linker).
 *
 * Lifted from `app/campaigns/[id]/page.tsx` (~line 1161 of the
 * pre-refactor file) on 2026-06-02 as part of the structural pass —
 * `<RecordPaymentDialog>` is being extracted to its own file and
 * needed access to the same picker, so MultiSelect had to live
 * somewhere both could import it.
 *
 * Lives under `components/campaign/` rather than `components/ui/`
 * because the styling / hover behavior is currently tuned for the
 * campaign-detail surfaces; if a second page wants the same picker,
 * promote to `components/ui/multi-select.tsx`.
 */

import { useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface MultiSelectProps {
  options: string[];
  selected: string[];
  onSelectedChange: (selected: string[]) => void;
  placeholder?: string;
  renderOption?: (option: string) => React.ReactNode;
  className?: string;
  triggerContent?: React.ReactNode;
}

export function MultiSelect({
  options,
  selected,
  onSelectedChange,
  placeholder = 'Select options...',
  renderOption = (option: string) => option,
  className = '',
  triggerContent = null,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const safeOptions = Array.isArray(options) ? options : [];
  const safeSelected = Array.isArray(selected) ? selected : [];

  const filteredOptions = safeOptions.filter(option =>
    option.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  try {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {triggerContent ? (
            <div className={`cursor-pointer w-full ${className}`}>
              {triggerContent}
            </div>
          ) : (
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className={`h-auto border-none shadow-none p-1 bg-transparent hover:bg-transparent text-xs font-medium inline-flex items-center ${className}`}
            >
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0" align="start">
          <div className="flex items-center border-b px-3 py-2">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border-0 p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          <div className="max-h-[300px] overflow-auto">
            {filteredOptions.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground">No options found.</div>
            ) : (
              filteredOptions.map((option) => (
                <div
                  key={option}
                  className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                  onClick={() => {
                    try {
                      const newSelected = safeSelected.includes(option)
                        ? safeSelected.filter(item => item !== option)
                        : [...safeSelected, option];
                      onSelectedChange(newSelected);
                    } catch (error) {
                      console.error('Error in onSelect:', error);
                    }
                  }}
                >
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    {safeSelected.includes(option) && (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m5 12 5 5L20 7" />
                      </svg>
                    )}
                  </span>
                  <div className="flex items-center space-x-2">
                    {renderOption(option)}
                  </div>
                </div>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  } catch (error) {
    console.error('MultiSelect render error:', error);
    return <div className="text-rose-500">Error rendering multiselect</div>;
  }
}
