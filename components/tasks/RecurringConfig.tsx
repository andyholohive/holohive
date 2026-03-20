'use client';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RecurringConfig as RecurringConfigType } from '@/lib/taskService';
import { RefreshCw, X, Calendar as CalendarIcon } from 'lucide-react';

interface RecurringConfigProps {
  value: RecurringConfigType | null;
  onChange: (config: RecurringConfigType | null) => void;
}

const DAYS_OF_WEEK = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

export function RecurringConfigEditor({ value, onChange }: RecurringConfigProps) {
  const isEnabled = !!value;

  const enable = () => {
    onChange({ frequency: 'weekly' });
  };

  const disable = () => {
    onChange(null);
  };

  const update = (partial: Partial<RecurringConfigType>) => {
    onChange({ ...value!, ...partial });
  };

  const endDate = value?.end_date ? new Date(value.end_date + 'T00:00:00') : undefined;

  if (!isEnabled) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-gray-500" />
          <Label className="text-sm font-semibold text-gray-700">Recurring</Label>
        </div>
        <Button variant="outline" size="sm" className="text-xs" onClick={enable}>
          <RefreshCw className="h-3 w-3 mr-1" /> Enable recurring
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3 bg-blue-50/50 border border-blue-100 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-blue-600" />
          <Label className="text-sm font-semibold text-blue-700">Recurring Task</Label>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-red-500" onClick={disable}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <p className="text-xs text-blue-600">When this task is completed, a new instance will be auto-created with the next due date.</p>

      <div className="grid grid-cols-2 gap-3">
        {/* Frequency */}
        <div className="grid gap-1">
          <Label className="text-xs text-gray-600">Frequency</Label>
          <Select value={value.frequency} onValueChange={(v) => update({ frequency: v as any })}>
            <SelectTrigger className="auth-input">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Day of week (for weekly) */}
        {value.frequency === 'weekly' && (
          <div className="grid gap-1">
            <Label className="text-xs text-gray-600">Day of Week</Label>
            <Select
              value={value.day_of_week?.toString() ?? ''}
              onValueChange={(v) => update({ day_of_week: parseInt(v) })}
            >
              <SelectTrigger className="auth-input">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                {DAYS_OF_WEEK.map(d => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Day of month (for monthly) */}
        {value.frequency === 'monthly' && (
          <div className="grid gap-1">
            <Label className="text-xs text-gray-600">Day of Month</Label>
            <Input
              type="number"
              min={1}
              max={31}
              value={value.day_of_month || ''}
              onChange={(e) => update({ day_of_month: parseInt(e.target.value) || undefined })}
              className="auth-input"
              placeholder="1-31"
            />
          </div>
        )}
      </div>

      {/* End date */}
      <div className="grid gap-1">
        <Label className="text-xs text-gray-600">End Date (optional)</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="auth-input justify-start text-left font-normal"
              style={{ borderColor: '#e5e7eb', backgroundColor: 'white', color: endDate ? '#111827' : '#9ca3af' }}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {endDate ? endDate.toLocaleDateString() : 'Select end date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={endDate}
              onSelect={(date) => {
                if (date) {
                  const year = date.getFullYear();
                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  const day = String(date.getDate()).padStart(2, '0');
                  update({ end_date: `${year}-${month}-${day}` });
                } else {
                  update({ end_date: undefined });
                }
              }}
              initialFocus
              classNames={{ day_selected: 'text-white hover:text-white focus:text-white' }}
              modifiersStyles={{ selected: { backgroundColor: '#3e8692' } }}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
