import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { TelegramService } from '@/lib/telegramService';
import { authorizePortalEmail } from '@/lib/portalDocAuth';
import { fireActionBoardRule } from '@/lib/actionBoardService';

export const dynamic = 'force-dynamic';

// Best-effort capture of a failed form submission so the client's answers are
// never silently lost. Writes the raw payload + error to form_submission_failures
// with its own service-role client; any error here is swallowed and never blocks
// the response. This is the safety net for when an insert/resolve/exception fails.
async function captureFormFailure(
  request: NextRequest,
  payload: { form_id?: any; client_id?: any; response_data?: any; submitted_by_email?: any; submitted_by_name?: any },
  errorMessage: string,
  stage: 'resolve' | 'insert' | 'exception',
) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;
    const admin = createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    await (admin as any).from('form_submission_failures').insert({
      form_id_raw: payload.form_id != null ? String(payload.form_id) : null,
      client_id_raw: payload.client_id != null ? String(payload.client_id) : null,
      response_data: payload.response_data ?? null,
      submitted_by_email: payload.submitted_by_email ?? null,
      submitted_by_name: payload.submitted_by_name ?? null,
      error_message: errorMessage,
      error_stage: stage,
      user_agent: request.headers.get('user-agent'),
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null,
    });
  } catch (e) {
    console.error('[Form Submit] Failed to capture failure row:', e);
  }
}

export async function POST(request: NextRequest) {
  let body: any = null;
  try {
    body = await request.json();
    const { form_id, response_data, submitted_by_email, submitted_by_name, client_id } = body;

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

    // Resolve form_id BEFORE inserting. It normally arrives as a UUID, but it
    // can arrive as the form's SLUG (e.g. a client on an older cached bundle, or
    // a slug-based share link). form_responses.form_id is a UUID column, so a
    // slug would 500 the insert with "invalid input syntax for type uuid" and
    // the client just sees "Failed to submit". Look the form up by id-or-slug and
    // always store the canonical UUID.
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(form_id));
    const { data: form } = await supabaseAdmin
      .from('forms')
      .select('id, name, slug')
      .eq(isUUID ? 'id' : 'slug', form_id)
      .maybeSingle();

    if (!form) {
      await captureFormFailure(request, { form_id, client_id, response_data, submitted_by_email, submitted_by_name }, `Form not found for form_id "${String(form_id)}"`, 'resolve');
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }
    const realFormId = (form as any).id as string;

    // Insert form response
    const { data: response, error } = await supabaseAdmin
      .from('form_responses')
      .insert([{
        form_id: realFormId,
        response_data,
        submitted_by_email: submitted_by_email || null,
        submitted_by_name: submitted_by_name || null,
        client_id: client_id || null
      }])
      .select()
      .single();

    if (error) {
      console.error('Error inserting form response:', error);
      await captureFormFailure(request, { form_id, client_id, response_data, submitted_by_email, submitted_by_name }, error.message || 'insert error', 'insert');
      return NextResponse.json(
        { error: 'Failed to submit form response' },
        { status: 500 }
      );
    }

    // Auto-complete Milestone 1 ("Kickoff & Setup") when the holo-hive
    // onboarding form is submitted. Per May 2026 spec: M1 is the only
    // milestone that auto-completes (the others stay manual). When M1
    // flips to complete we also bump M2 to 'active' so the Action Board
    // / progress bar advances visibly.
    //
    // Gated on form.slug === 'holo-hive-onboarding' so other forms
    // submitted against a client (e.g. brand-asset upload form) don't
    // accidentally trigger this. Best-effort — failures here are
    // logged but never block the form submission response.
    //
    // SECURITY (audit C2): this route is public/unauthenticated and
    // client_id is caller-supplied (there is no forms→client FK to
    // validate against). Advancing a client's onboarding milestones is a
    // state mutation, so we gate it behind the SAME portal email check the
    // portal itself enforces: submitted_by_email must authorize for this
    // client (exact email / approved_emails / same corp domain /
    // approved_domains). A crafted POST with a victim client_id but no
    // authorized email can no longer flip their milestones. The response
    // row itself is still stored (harmless data); only the mutation is
    // gated. Legit portal submitters carry their gate email in the body.
    let milestoneAuthorized = false;
    if (client_id && form?.slug === 'holo-hive-onboarding') {
      try {
        const auth = await authorizePortalEmail(supabaseAdmin as any, client_id, submitted_by_email || '');
        milestoneAuthorized = auth.ok && auth.clientId === client_id;
        if (!milestoneAuthorized) {
          console.warn(
            '[Form Submit] Milestone auto-complete SKIPPED — submitter email not authorized for client',
            { client_id, hasEmail: !!submitted_by_email },
          );
        }
      } catch (authErr) {
        console.error('[Form Submit] Portal auth check failed:', authErr);
        milestoneAuthorized = false;
      }
    }
    if (milestoneAuthorized) {
      // [2026-07-28] The blunt "force M1 complete" block that used to live here
      // was removed. It set milestone 1 to 'complete' on form submission
      // WITHOUT looking at that milestone's items — so a client whose M1 was
      // 2-of-6 done saw "Kickoff & Setup: complete", and then watched it move
      // BACKWARDS to in-progress the moment the item-level rollup recomputed
      // it. Two mechanisms owned the same field from different inputs.
      //
      // Milestone status and progression are now derived in exactly one place:
      // trg_action_items_rollup_milestone on client_action_items. All items
      // done → complete, and the next milestone opens. Any item not done →
      // back to in_progress. That holds no matter who completed the item.
      //
      // The 'upcoming' → 'active' advance this block also did is preserved in
      // that same trigger — dropping it outright would have stranded every
      // milestone on "Upcoming", since nothing else ever set 'active'.

      // [2026-07-28] Action Board: "Onboarding form completed".
      //
      // Per Jdot's map the form webhook closes HQ task 7 and the board item
      // flips downstream via trg_tasks_propagate_milestone, so HQ stays the
      // source of truth. fireActionBoardRule handles that indirection.
      //
      // Behind the SAME milestoneAuthorized gate as the block above, and for
      // the same audit-C2 reason: this route is public and client_id is
      // caller-supplied, so completing a client's board item is a mutation a
      // crafted POST must not be able to trigger.
      //
      // Best-effort — never block the submission response.
      try {
        await fireActionBoardRule(supabaseAdmin as any, client_id, 'form_submitted');
      } catch (abErr) {
        console.error('[Form Submit] Action Board rule failed:', abErr);
      }
    }

    console.log('[Form Submit] Sending Telegram notification for form:', {
      formId: form_id,
      formName: form?.name,
      hasSubmitterName: !!submitted_by_name,
      hasSubmitterEmail: !!submitted_by_email
    });

    // Send Telegram notification (wait for it but don't fail if it errors)
    try {
      // Check if there's a form_submission reminder rule with a specific chatroom
      const { data: formRule } = await supabaseAdmin
        .from('reminder_rules' as any)
        .select('id, telegram_chat_id, telegram_thread_id')
        .eq('rule_type', 'form_submission')
        .eq('is_active', true)
        .limit(1)
        .single();

      let telegramSuccess = false;

      if (formRule && (formRule as any).telegram_chat_id && (formRule as any).telegram_chat_id !== 'PLACEHOLDER_CHAT_ID') {
        // Route to the configured chatroom
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
          ? (process.env.NEXT_PUBLIC_BASE_URL.startsWith('http')
              ? process.env.NEXT_PUBLIC_BASE_URL
              : `https://${process.env.NEXT_PUBLIC_BASE_URL}`)
          : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
        const formUrl = `${baseUrl}/forms/${form_id}`;
        const message = `\u{1F4E9} <b>${form?.name || 'Unknown Form'}</b> has been submitted.\n<a href="${formUrl}">View Form</a>`;
        telegramSuccess = await TelegramService.sendToChat(
          (formRule as any).telegram_chat_id,
          message,
          'HTML',
          (formRule as any).telegram_thread_id || undefined
        );
        // Only the routed branch counts as the rule firing — the fallback
        // below sends to the default chat and has nothing to do with it.
        if (telegramSuccess) {
          await supabaseAdmin
            .from('reminder_rules' as any)
            .update({ last_fired_at: new Date().toISOString() } as any)
            .eq('id', (formRule as any).id);
        }
      } else {
        // Fallback to default notification
        telegramSuccess = await TelegramService.sendFormSubmissionNotification(
          form?.name || 'Unknown Form',
          form_id,
          {
            name: submitted_by_name,
            email: submitted_by_email,
          },
          response_data
        );
      }

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
  } catch (error: any) {
    console.error('Error in form submission API:', error);
    await captureFormFailure(
      request,
      { form_id: body?.form_id, client_id: body?.client_id, response_data: body?.response_data, submitted_by_email: body?.submitted_by_email, submitted_by_name: body?.submitted_by_name },
      error?.message || 'unknown exception',
      'exception',
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
