/**
 * App settings — HHP-configurable key/value store.
 *
 * Pulls from the `app_settings` table created in the Phase 6.5 migration.
 * Designed so feature crons and server routes can read configuration
 * that an operator changes from the UI without a Vercel redeploy.
 *
 * Two variants per operation:
 *   • `*Browser` — for client components, using the browser supabase
 *     client. Reads are RLS-scoped to authenticated users (everyone
 *     can see settings); writes require super_admin.
 *   • `*Server` — for API routes / crons, takes a supabase client
 *     parameter so the caller can choose service-role vs anon-key
 *     depending on context.
 */

import { supabase as browserClient } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AppSettingKey =
  | 'backlog_channel_id'
  | string; // open to future keys

/** Server-side getter. Pass any supabase client.
 *
 *  Returns null both when the key is genuinely absent and when the read
 *  failed. Callers that treat "unset" as a decision rather than as missing
 *  information must use `getAppSettingStrict` instead — see the note there. */
export async function getAppSetting(
  client: SupabaseClient,
  key: AppSettingKey,
): Promise<string | null> {
  const { data, error } = await (client as any)
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.error(`[appSettings] getSetting(${key}) failed:`, error);
    return null;
  }
  return data?.value ?? null;
}

/**
 * Same read, but a failure throws instead of looking like an unset key.
 *
 * [2026-09-13, Andy] The KR Signal listings digest for the week of Sep 7–13
 * was queued and never sent, and the run that did it reported success. The
 * chain: Supabase was returning Gateway Timeouts that day, the settings read
 * failed, `getAppSetting` logged and returned null, and the cron read null as
 * "no review chat is configured" — so it queued the digest, wrote a warning
 * into a summary nobody reads, and finished `completed`. The review card was
 * never posted, so there was nobody to approve it.
 *
 * A transient read failure and a deliberately empty setting are not the same
 * fact and must not collapse into the same value. Where the difference decides
 * whether a message reaches anyone, use this: a thrown error fails the run,
 * which is visible and retried on the next tick. Absence still returns null,
 * because "not configured" remains a legitimate answer.
 */
export async function getAppSettingStrict(
  client: SupabaseClient,
  key: AppSettingKey,
): Promise<string | null> {
  const { data, error } = await (client as any)
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) {
    throw new Error(
      `app_settings read failed for "${key}": ${error.message ?? error}. `
      + 'Treating this as unset would silently change behaviour, so the run fails instead.',
    );
  }
  return data?.value ?? null;
}

/** Browser-client getter, for client components. */
export async function getAppSettingBrowser(
  key: AppSettingKey,
): Promise<string | null> {
  return getAppSetting(browserClient, key);
}

/**
 * Upsert a setting from the browser. RLS enforces super_admin so a
 * regular member's call will get rejected at the policy layer.
 * Stamps updated_at + updated_by automatically.
 */
export async function setAppSettingBrowser(
  key: AppSettingKey,
  value: string | null,
  updatedBy: string,
): Promise<void> {
  const { error } = await (browserClient as any)
    .from('app_settings')
    .upsert({
      key,
      value,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
}
