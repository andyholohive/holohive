import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { TelegramService } from '@/lib/telegramService';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      account_type,
      scope,
      deal_value,
      currency,
      source,
      referrer,
      gc,
      notes,
      contact_name,
      contact_email,
      contact_telegram
    } = body;

    // Validate required fields
    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Lead name is required' },
        { status: 400 }
      );
    }

    if (!contact_name || !contact_name.trim()) {
      return NextResponse.json(
        { error: 'Contact name is required' },
        { status: 400 }
      );
    }

    // Validate at least one contact method
    if ((!contact_email || !contact_email.trim()) && (!contact_telegram || !contact_telegram.trim())) {
      return NextResponse.json(
        { error: 'At least one contact method (email or Telegram) is required' },
        { status: 400 }
      );
    }

    // Validate email format if provided
    if (contact_email && contact_email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(contact_email.trim())) {
        return NextResponse.json(
          { error: 'Invalid email format' },
          { status: 400 }
        );
      }
    }

    // Validate deal value if provided
    if (deal_value && isNaN(parseFloat(deal_value))) {
      return NextResponse.json(
        { error: 'Deal value must be a valid number' },
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

    // Build notes with contact info
    let combinedNotes = '';
    if (contact_name || contact_email || contact_telegram) {
      combinedNotes += `Contact: ${contact_name || 'N/A'}`;
      if (contact_email) combinedNotes += ` | Email: ${contact_email}`;
      if (contact_telegram) combinedNotes += ` | Telegram: ${contact_telegram}`;
    }
    if (notes?.trim()) {
      combinedNotes += combinedNotes ? `\n\n${notes.trim()}` : notes.trim();
    }

    // Build scope string (join array into comma-separated string)
    const scopeValue = Array.isArray(scope) && scope.length > 0 ? scope.join(', ') : null;

    // Insert opportunity
    const { data: opportunity, error } = await supabaseAdmin
      .from('crm_opportunities')
      .insert([{
        name: name.trim(),
        account_type: account_type || null,
        scope: scopeValue,
        deal_value: deal_value ? parseFloat(deal_value) : null,
        currency: currency || 'USD',
        source: source || null,
        referrer: referrer?.trim() || null,
        gc: gc?.trim() || null,
        notes: combinedNotes || null,
        stage: 'new'
      }])
      .select()
      .single();

    if (error) {
      console.error('Error inserting opportunity:', error);
      return NextResponse.json(
        { error: 'Failed to save lead' },
        { status: 500 }
      );
    }

    // Send Telegram notification
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://portal.holohive.agency';
    const pipelineUrl = `${baseUrl}/crm/pipeline`;
    const message = `<b>New Lead Submitted</b>\n\n` +
      `<b>Name:</b> ${name.trim()}\n` +
      `<b>Type:</b> ${account_type || 'N/A'}\n` +
      `<b>Scope:</b> ${Array.isArray(scope) ? scope.join(', ') : scope || 'N/A'}\n` +
      `<b>Value:</b> ${deal_value ? `${currency || 'USD'} ${deal_value}` : 'N/A'}\n` +
      `<b>Contact:</b> ${contact_name?.trim() || 'N/A'}\n` +
      `<b>Source:</b> ${source || 'N/A'}\n\n` +
      `<a href="${pipelineUrl}">View Pipeline</a>`;

    TelegramService.sendMessage(message).catch(err => {
      console.error('[Leads Submit] Telegram notification error:', err);
    });

    return NextResponse.json({
      success: true,
      opportunity
    });

  } catch (error) {
    console.error('Error in lead submission:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
