import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Book a Meeting - HoloHive',
  robots: {
    index: false,
    follow: false,
  },
};

export default function BookingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
