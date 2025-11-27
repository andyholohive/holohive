import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { TelegramService } from '@/lib/telegramService';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { form_id, response_data, submitted_by_email, submitted_by_name } = body;

    // Validate required fields
    if (!form_id || !response_data) {
      return NextResponse.json(
        { error: 'Missing required fields: form_id and response_data' },
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

    // Insert form response
    const { data: response, error } = await supabaseAdmin
      .from('form_responses')
      .insert([{
        form_id,
        response_data,
        submitted_by_email: submitted_by_email || null,
        submitted_by_name: submitted_by_name || null
      }])
      .select()
      .single();

    if (error) {
      console.error('Error inserting form response:', error);
      return NextResponse.json(
        { error: 'Failed to submit form response' },
        { status: 500 }
      );
    }

    // Fetch form details for Telegram notification
    const { data: form } = await supabaseAdmin
      .from('forms')
      .select('name')
      .eq('id', form_id)
      .single();

    console.log('[Form Submit] Sending Telegram notification for form:', {
      formId: form_id,
      formName: form?.name,
      hasSubmitterName: !!submitted_by_name,
      hasSubmitterEmail: !!submitted_by_email
    });

    // Send Telegram notification (wait for it but don't fail if it errors)
    try {
      const telegramSuccess = await TelegramService.sendFormSubmissionNotification(
        form?.name || 'Unknown Form',
        form_id,
        {
          name: submitted_by_name,
          email: submitted_by_email,
        },
        response_data
      );

      if (telegramSuccess) {
        console.log('[Form Submit] Telegram notification sent successfully');
      } else {
        console.warn('[Form Submit] Telegram notification failed (returned false)');
      }
    } catch (err) {
      console.error('[Form Submit] Exception while sending Telegram notification:', err);
      // Don't fail the request if Telegram notification fails
    }

    return NextResponse.json(
      { success: true, data: response },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in form submission API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
