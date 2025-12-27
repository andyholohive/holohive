import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/contexts/AuthContext';
import { ChangelogProvider } from '@/contexts/ChangelogContext';
import { Toaster } from '@/components/ui/toaster';
import FloatingChat from '@/components/ai/FloatingChat';
import ChangelogModal from '@/components/changelog/ChangelogModal';
import { ChunkErrorHandler } from '@/components/ChunkErrorHandler';

const inter = Inter({ subsets: ['latin'] });

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
    <html lang="en">
      <body className={inter.className}>
        <ChunkErrorHandler />
        <AuthProvider>
          <ChangelogProvider>
            {children}
            <FloatingChat />
            <ChangelogModal />
          </ChangelogProvider>
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}