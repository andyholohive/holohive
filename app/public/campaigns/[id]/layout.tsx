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

  // Fetch campaign data
  const { data: campaign } = await supabase
    .from('campaigns')
    .select(`
      id,
      name,
      client_id,
      clients!inner (
        name
      )
    `)
    .eq('id', params.id)
    .single();

  const clientName = campaign?.clients?.name || 'Client';

  // Construct the base URL for the logo
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
                  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` :
                  'http://localhost:3000';
  const logoUrl = `${baseUrl}/images/logo.png`;

  return {
    title: 'Holo Hive Partner Portal',
    description: `${clientName} Campaign Tracker`,
    openGraph: {
      title: 'Holo Hive Partner Portal',
      description: `${clientName} Campaign Tracker`,
      images: [
        {
          url: logoUrl,
          width: 1200,
          height: 630,
          alt: 'Holo Hive Logo',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Holo Hive Partner Portal',
      description: `${clientName} Campaign Tracker`,
      images: [logoUrl],
    },
  };
}

export default function PublicCampaignLayout({ children }: Props) {
  return <>{children}</>;
}
