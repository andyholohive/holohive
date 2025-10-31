import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import FloatingChat from '@/components/ai/FloatingChat';
import { ChunkErrorHandler } from '@/components/ChunkErrorHandler';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Campaign Manager - SaaS Platform',
  description: 'Manage your marketing campaigns and client relationships',
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
          {children}
          <FloatingChat />
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}