/**
 * KR Signal Bot — per-client config, loaded from the kr_signal_clients table
 * (the standalone repo used static JSON; in HHP the DB is the source of truth).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface KrSignalFeatures {
  weekly_market_report: boolean;
  korea_listings_digest: boolean;
  client_listing_alert: boolean;
}

export interface KrSignalThresholds {
  kimchi_hot?: number;
  kimchi_positive?: number;
  kimchi_flat?: number;
  trend_deadband?: number;
}

export interface KrSignalClient {
  id: string;
  key: string;
  name: string;
  ticker: string;
  contract: string | null;
  chain: string | null;
  coingecko_id: string | null;
  kr_listed: boolean;
  kr_venues: string[];
  global_venues: string[];
  peer_basket: string[];
  content_log_source: string | null;
  telegram_chat_id: string | null;
  telegram_thread_id: string | null;
  features: KrSignalFeatures;
  thresholds: KrSignalThresholds;
  is_active: boolean;
}

const COLUMNS =
  "id, key, name, ticker, contract, chain, coingecko_id, kr_listed, kr_venues, global_venues, peer_basket, content_log_source, telegram_chat_id, telegram_thread_id, features, thresholds, is_active";

/** All active clients (config source for the crons). */
export async function loadActiveClients(supabase: SupabaseClient): Promise<KrSignalClient[]> {
  const { data, error } = await supabase
    .from("kr_signal_clients")
    .select(COLUMNS)
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(`loadActiveClients: ${error.message}`);
  return (data ?? []) as unknown as KrSignalClient[];
}

/** One client by lookup key (e.g. 'venice'), or null. */
export async function loadClientByKey(supabase: SupabaseClient, key: string): Promise<KrSignalClient | null> {
  const { data, error } = await supabase
    .from("kr_signal_clients")
    .select(COLUMNS)
    .eq("key", key.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`loadClientByKey: ${error.message}`);
  return (data as unknown as KrSignalClient) ?? null;
}
