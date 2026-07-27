import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/contexts/AuthContext';
import { ChangelogProvider } from '@/contexts/ChangelogContext';
import { ViewAsProvider } from '@/contexts/ViewAsContext';
import ViewAsBanner from '@/components/ViewAsBanner';
import { Toaster } from '@/components/ui/toaster';
import ChangelogModal from '@/components/changelog/ChangelogModal';
import { ChunkErrorHandler } from '@/components/ChunkErrorHandler';

// v11 design system (2026-06-01) — Geist replaces Inter as the body font.
// Next 13.5 doesn't ship Geist in `next/font/google`, so we load it via
// Google Fonts CDN `<link>` tags in <head> instead. Tailwind's font-sans
// then maps to Geist with Inter / system-ui as fallbacks (see tailwind.config.ts).
//
// Inter stays loaded via next/font/google as the legacy fallback face
// for any surface that explicitly uses `.font-inter`.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Holo Hive Portal',
  description: 'Manage your marketing campaigns and client relationships with Holo Hive',
  icons: {
    icon: '/images/logo.png',
    shortcut: '/images/logo.png',
    apple: '/images/logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        {/* Geist + Geist Mono loaded from Google Fonts CDN.
            display=swap so the page renders with the fallback (Inter)
            immediately while Geist fetches. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body className="font-sans antialiased bg-cream-50 text-ink-warm-900">
        <ChunkErrorHandler />
        <AuthProvider>
          {/* ViewAsProvider sits inside AuthProvider (it reads the real
              user's role to decide who may preview) and outside everything
              that renders nav, so the sidebar re-renders when preview
              starts or stops. [2026-07-28] */}
          <ViewAsProvider>
            <ChangelogProvider>
              <ViewAsBanner />
              {children}
              <ChangelogModal />
            </ChangelogProvider>
          </ViewAsProvider>
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
