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

/** Server-side getter. Pass any supabase client. */
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
