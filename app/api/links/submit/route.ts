import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { TelegramService } from '@/lib/telegramService';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, url, description, client, link_types, access } = body;

    // Validate required fields
    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    if (!url || !url.trim()) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Create server-side Supabase client with service role key to bypass RLS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Insert link
    const { data: link, error } = await supabaseAdmin
      .from('links')
      .insert([{
        name: name.trim(),
        url: url.trim(),
        description: description?.trim() || null,
        client: client?.trim() || null,
        link_types: link_types || [],
        access: access || 'team',
        status: 'active'
      }])
      .select()
      .single();

    if (error) {
      console.error('Error inserting link:', error);
      return NextResponse.json(
        { error: 'Failed to save link' },
        { status: 500 }
      );
    }

    // Send Telegram notification (must await in serverless environment)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://portal.holohive.agency';
    const linkUrl = `${baseUrl}/links`;
    const message = `<b>New Link Submitted</b>\n\n` +
      `<b>Name:</b> ${name.trim()}\n` +
      `<b>Client:</b> ${client?.trim() || 'N/A'}\n` +
      `<b>Type:</b> ${link_types?.join(', ') || 'N/A'}\n\n` +
      `<a href="${linkUrl}">View Links</a>`;

    try {
      await TelegramService.sendMessage(message);
    } catch (err) {
      console.error('[Links Submit] Telegram notification error:', err);
    }

    return NextResponse.json({
      success: true,
      link
    });

  } catch (error) {
    console.error('Error in link submission:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
