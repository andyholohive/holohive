'use client';

/**
 * Theme controls [2026-11-08]. Two shapes of the same thing:
 *   - ThemeToggleButton — icon button for the sidebar footer, flips light/dark.
 *   - ThemeSelect        — Light / Dark / System select for Settings.
 * Both read and write next-themes; the choice persists per browser.
 */
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** next-themes resolves on the client; render nothing theme-specific until mounted to avoid a hydration mismatch. */
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export function ThemeToggleButton({ className = '' }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const dark = mounted && resolvedTheme === 'dark';
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      className={`hover:bg-cream-100 w-auto px-2 ${className}`}
      title={label}
      aria-label={label}
    >
      {dark ? <Sun className="h-4 w-4 text-ink-warm-500" /> : <Moon className="h-4 w-4 text-ink-warm-500" />}
    </Button>
  );
}

export function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  return (
    <Select value={mounted ? (theme ?? 'light') : 'light'} onValueChange={(v) => setTheme(v)}>
      <SelectTrigger className="h-9 w-44 focus-brand" aria-label="Appearance">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="light">Light</SelectItem>
        <SelectItem value="dark">Dark</SelectItem>
        <SelectItem value="system">Match system</SelectItem>
      </SelectContent>
    </Select>
  );
}
