import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all message examples that are marked as sent (used for learning)
    const { data: examples, error } = await supabase
      .from('client_message_examples')
      .select(`
        *,
        client:clients(name),
        campaign:campaigns(name)
      `)
      .eq('was_sent', true)
      .order('user_rating', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching learning examples:', error);
      return NextResponse.json(
        { error: 'Failed to fetch learning examples' },
        { status: 500 }
      );
    }

    // Transform the data to flatten client and campaign names
    const transformedExamples = examples?.map(example => ({
      ...example,
      client_name: example.client?.name,
      campaign_name: example.campaign?.name,
    })) || [];

    return NextResponse.json(transformedExamples);
  } catch (error) {
    console.error('Error in learning examples API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
