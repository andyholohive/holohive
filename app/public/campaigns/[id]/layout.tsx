import { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type Props = {
  params: { id: string };
  children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Fetch campaign data with client information
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select(`
      id,
      name,
      client_id,
      clients (
        name
      )
    `)
    .eq('id', params.id)
    .single();

  // Extract client name - handle both possible response structures
  const clientName = campaign?.clients?.name || 'Client';

  // Construct the base URL for the logo
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    ? (process.env.NEXT_PUBLIC_BASE_URL.startsWith('http')
        ? process.env.NEXT_PUBLIC_BASE_URL
        : `https://${process.env.NEXT_PUBLIC_BASE_URL}`)
    : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  const logoUrl = `${baseUrl}/images/logo.png`;

  const title = 'Holo Hive Portal';
  const description = `${clientName} Campaign Tracker`;

  return {
    title,
    description,
    metadataBase: new URL(baseUrl),
    robots: {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
      },
    },
    openGraph: {
      title,
      description,
      images: [
        {
          url: logoUrl,
          width: 500,
          height: 500,
          alt: 'Holo Hive Logo',
        },
      ],
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: [logoUrl],
    },
    other: {
      'og:image': logoUrl,
      'og:image:width': '500',
      'og:image:height': '500',
      'og:image:type': 'image/png',
    },
  };
}

export default function PublicCampaignLayout({ children }: Props) {
  return <>{children}</>;
}
