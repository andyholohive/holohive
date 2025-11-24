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

  console.log('Campaign metadata:', { campaign, error });

  // Extract client name - handle both possible response structures
  const clientName = campaign?.clients?.name || 'Client';

  // Construct the base URL for the logo
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
                  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  const logoUrl = `${baseUrl}/images/logo.png`;

  const title = 'Holo Hive Partner Portal';
  const description = `${clientName} Campaign Tracker`;

  console.log('Metadata generated:', { title, description, logoUrl, baseUrl });

  return {
    title,
    description,
    metadataBase: new URL(baseUrl),
    openGraph: {
      title,
      description,
      images: [
        {
          url: logoUrl,
          width: 1200,
          height: 630,
          alt: 'Holo Hive Logo',
        },
      ],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [logoUrl],
    },
    other: {
      'og:image': logoUrl,
      'og:image:width': '1200',
      'og:image:height': '630',
    },
  };
}

export default function PublicCampaignLayout({ children }: Props) {
  return <>{children}</>;
}
