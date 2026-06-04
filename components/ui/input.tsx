import * as React from 'react';

import { cn } from '@/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onWheel, ...props }, ref) => {
    // [2026-06-05] Disable wheel-to-change on type="number" inputs.
    // Browsers default `<input type="number">` to incrementing on wheel
    // events, which causes accidental edits while users are scrolling
    // a long form or table. The fix is to blur the input on wheel so
    // the focus-required wheel-change doesn't fire. Callers can still
    // provide their own onWheel — we call it first, then blur.
    const handleWheel = type === 'number'
      ? (e: React.WheelEvent<HTMLInputElement>) => {
          onWheel?.(e);
          (e.currentTarget as HTMLInputElement).blur();
        }
      : onWheel;
    return (
      <input
        type={type}
        onWheel={handleWheel}
        className={cn(
          'flex h-10 w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
