'use client';

/**
 * Theme provider — class-based dark mode via next-themes. [2026-11-08]
 *
 * Default is light so nobody's portal changes under them on deploy; the
 * choice lives in localStorage (`hhp-theme`) and 'system' is available from
 * Settings. `attribute="class"` puts `.dark` on <html>, which is what
 * tailwind.config.ts (darkMode: ['class']) and app/theme-tokens.css key on.
 */
import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem storageKey="hhp-theme" disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
