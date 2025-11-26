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

  // Fetch list data
  const { data: list, error } = await supabase
    .from('lists')
    .select('id, name, notes')
    .eq('id', params.id)
    .single();

  const title = list?.name || 'Holo Hive Partner Portal';
  const description = list?.notes || 'KOL List';

  // Construct the base URL for the logo
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
                  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  const logoUrl = `${baseUrl}/images/logo.png`;

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

export default function PublicListLayout({ children }: Props) {
  return <>{children}</>;
}
