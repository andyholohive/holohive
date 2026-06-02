import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        // Brand palette (HoloHive teal).
        // Prefer using these tokens over hardcoded hex values:
        //   bg-brand / text-brand / border-brand    → primary teal
        //   bg-brand-hover                           → darker hover variant
        //   bg-brand-light / text-brand              → subtle tint background
        // Existing `#3e8692` / `#2d6b75` / `#e8f4f5` hex usages remain valid
        // and can be swapped to these tokens incrementally.
        brand: {
          DEFAULT: '#3e8692',
          hover: '#2d6b75',
          light: '#e8f4f5',
          // v11 additions (2026-06-01) — used by .crd-feature surface,
          // chapter section headers, layered btn-brand shadow.
          // Existing DEFAULT/hover/light stay unchanged so the 51
          // existing surfaces don't drift.
          soft: '#EFF5F4',
          dark: '#2d6470',
          deep: '#1f4651',
        },
        // Warm cream palette — v11 chrome. Page bg + sidebar regions +
        // warm hairline borders. Sits alongside existing gray-/stone-*
        // tokens which keep working unchanged.
        cream: {
          50:  '#FBF9F4',
          100: '#F5F2E9',
          200: '#EBE6D8',
          300: '#D9D2BD',
        },
        // Warm ink — alternative to gray-* for v11 surfaces.
        'ink-warm': {
          900: '#16140F',
          800: '#2A2722',
          700: '#46423A',
          500: '#6B6557',
          400: '#9A9385',
          300: '#C7C0AF',
          200: '#E2DDCE',
          100: '#F1ECDD',
          50:  '#FBF9F4',
        },
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
      // v11 design system — fonts. Geist replaces Inter as the default
      // sans on the body element (see app/layout.tsx). Loaded via Google
      // Fonts CDN since Next 13.5 doesn't ship Geist in next/font/google;
      // referenced by family name in the fontFamily token below. Inter
      // remains mounted via next/font as the legacy fallback face — used
      // by .font-inter where needed and as a layout-shift-free fallback
      // while Geist fetches.
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        inter: ['Inter', 'system-ui', 'sans-serif'],
      },
      // v11 shadow tokens — warm-tinted (brown-ish, not pure black).
      // - `card`     — default surface lift on white cards
      // - `card-hover` — interaction lift on .crd-hover surfaces
      // - `btn-brand`  — layered shadow for primary buttons:
      //                  inner top highlight + inner bottom shadow +
      //                  outer drop + hairline edge
      boxShadow: {
        // Default Card lift — includes the 1px inset top highlight so
        // every <Card> automatically gets the "catches the light" effect.
        card:        '0 1px 0 rgba(255,255,255,0.75) inset, 0 1px 2px rgba(60,40,20,0.04), 0 2px 4px -2px rgba(60,40,20,0.04)',
        'card-hover':'0 1px 0 rgba(255,255,255,0.75) inset, 0 1px 2px rgba(60,40,20,0.04), 0 10px 24px -8px rgba(60,40,20,0.10)',
        'btn-brand': '0 1px 0 rgba(255,255,255,0.20) inset, 0 -1px 0 rgba(20,40,45,0.12) inset, 0 1px 2px rgba(20,40,45,0.20), 0 1px 0 rgba(20,40,45,0.06)',
        'inset-hl':  '0 1px 0 rgba(255,255,255,0.75) inset',
      },
    },
  },
  plugins: [require('tailwindcss-animate'), require('@tailwindcss/typography')],
};
export default config;
