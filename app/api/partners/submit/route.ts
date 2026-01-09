import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      affiliation,
      category,
      commission_model,
      poc_name,
      poc_email,
      poc_telegram,
      terms_of_interest,
      notes
    } = body;

    // Validate required fields
    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Partner name is required' },
        { status: 400 }
      );
    }

    if (!poc_name || !poc_name.trim()) {
      return NextResponse.json(
        { error: 'Point of contact name is required' },
        { status: 400 }
      );
    }

    // Validate at least one contact method
    if ((!poc_email || !poc_email.trim()) && (!poc_telegram || !poc_telegram.trim())) {
      return NextResponse.json(
        { error: 'At least one contact method (email or Telegram) is required' },
        { status: 400 }
      );
    }

    // Validate email format if provided
    if (poc_email && poc_email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(poc_email.trim())) {
        return NextResponse.json(
          { error: 'Invalid email format' },
          { status: 400 }
        );
      }
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

    // Insert affiliate/partner
    const { data: affiliate, error } = await supabaseAdmin
      .from('crm_affiliates')
      .insert([{
        name: name.trim(),
        affiliation: affiliation?.trim() || null,
        category: category || null,
        commission_model: commission_model || null,
        poc_name: poc_name?.trim() || null,
        poc_email: poc_email?.trim() || null,
        poc_telegram: poc_telegram?.trim() || null,
        terms_of_interest: terms_of_interest?.trim() || null,
        notes: notes?.trim() || null,
        status: 'new'
      }])
      .select()
      .single();

    if (error) {
      console.error('Error inserting affiliate:', error);
      return NextResponse.json(
        { error: 'Failed to save partner application' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      affiliate
    });

  } catch (error) {
    console.error('Error in partner submission:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
