import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/prospects/signals/schedule — Save auto-scan schedule preference
 * Body: { frequency: 'off' | 'daily' | 'weekly' | 'biweekly' }
 *
 * Stores the schedule in the settings table (or a simple key-value store).
 * The actual cron job at /api/cron/signals-scan reads this setting.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const frequency = body.frequency || 'off';

    if (!['off', 'daily', 'weekly', 'biweekly'].includes(frequency)) {
      return NextResponse.json({ error: 'Invalid frequency' }, { status: 400 });
    }

    // Store in prospects metadata — use a simple upsert to a settings-like pattern
    // We'll use the prospects table's metadata approach or a simple key in localStorage
    // For now, store in a scan_settings record
    const { error } = await supabase
      .from('prospect_signals')
      .upsert({
        prospect_id: null,
        project_name: '__scan_schedule__',
        signal_type: 'scan_schedule',
        headline: frequency,
        snippet: JSON.stringify({
          frequency,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
          modes: ['api', 'claude'],
          recency_months: 1,
        }),
        source_url: null,
        source_name: 'system',
        relevancy_weight: 0,
        is_active: frequency !== 'off',
      }, {
        onConflict: 'project_name,signal_type,source_name',
      });

    // If upsert fails (no unique constraint), try insert/update pattern
    if (error) {
      // Try to find existing schedule record
      const { data: existing } = await supabase
        .from('prospect_signals')
        .select('id')
        .eq('project_name', '__scan_schedule__')
        .eq('signal_type', 'scan_schedule')
        .limit(1)
        .single();

      if (existing) {
        await supabase
          .from('prospect_signals')
          .update({
            headline: frequency,
            snippet: JSON.stringify({
              frequency,
              updated_by: user.id,
              updated_at: new Date().toISOString(),
              modes: ['api', 'claude'],
              recency_months: 1,
            }),
            is_active: frequency !== 'off',
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('prospect_signals')
          .insert({
            prospect_id: null,
            project_name: '__scan_schedule__',
            signal_type: 'scan_schedule',
            headline: frequency,
            snippet: JSON.stringify({
              frequency,
              updated_by: user.id,
              updated_at: new Date().toISOString(),
              modes: ['api', 'claude'],
              recency_months: 1,
            }),
            source_url: null,
            source_name: 'system',
            relevancy_weight: 0,
            is_active: frequency !== 'off',
          });
      }
    }

    return NextResponse.json({ success: true, frequency });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/prospects/signals/schedule — Get current auto-scan schedule
 */
export async function GET(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data } = await supabase
      .from('prospect_signals')
      .select('headline, snippet')
      .eq('project_name', '__scan_schedule__')
      .eq('signal_type', 'scan_schedule')
      .limit(1)
      .single();

    if (data) {
      let settings = {};
      try { settings = JSON.parse(data.snippet || '{}'); } catch {}
      return NextResponse.json({ frequency: data.headline, ...settings });
    }

    return NextResponse.json({ frequency: 'off' });
  } catch {
    return NextResponse.json({ frequency: 'off' });
  }
}
