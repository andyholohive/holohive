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
  /** HHP clients.id this config belongs to (nullable). Set from the /clients
   *  Korea Signal dialog; links the config to a client so digests can default
   *  to that client's chat. */
  client_id?: string | null;
  /** Resolved digest destination, filled by loadActiveClients: the override
   *  (telegram_chat_id) when set, else the client's /crm/telegram GC. The crons
   *  send here so an unset override falls back to the client chat, mirroring
   *  the Weekly Content Recap [Andy 2026-07-15]. */
  resolved_chat_id?: string | null;
  resolved_thread_id?: string | null;
}

const COLUMNS =
  "id, key, name, ticker, contract, chain, coingecko_id, kr_listed, kr_venues, global_venues, peer_basket, content_log_source, telegram_chat_id, telegram_thread_id, features, thresholds, is_active, client_id";

/** All active clients (config source for the crons), each with its digest
 *  destination resolved (override → client chat). */
export async function loadActiveClients(supabase: SupabaseClient): Promise<KrSignalClient[]> {
  const { data, error } = await supabase
    .from("kr_signal_clients")
    .select(COLUMNS)
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(`loadActiveClients: ${error.message}`);
  const clients = (data ?? []) as unknown as KrSignalClient[];
  await attachResolvedChats(supabase, clients);
  return clients;
}

/**
 * Fill resolved_chat_id / resolved_thread_id on each client:
 *   - override set (telegram_chat_id) → use it (+ its thread)
 *   - else → the client's /crm/telegram GC (telegram_chats.client_id,
 *            non-internal, most-recently-active), no thread
 * Same default-chat resolution the Weekly Content Recap cron uses, so the two
 * bots post to the same client GC by default.
 */
async function attachResolvedChats(supabase: SupabaseClient, clients: KrSignalClient[]): Promise<void> {
  const clientIds = Array.from(
    new Set(clients.map((c) => c.client_id).filter((x): x is string => !!x)),
  );
  const defaultByClient = new Map<string, string>();
  if (clientIds.length > 0) {
    const { data: chats } = await supabase
      .from("telegram_chats")
      .select("chat_id, client_id, is_internal, is_hidden, last_message_at")
      .in("client_id", clientIds)
      .or("is_hidden.is.null,is_hidden.eq.false");
    for (const cid of clientIds) {
      const cands = ((chats ?? []) as any[]).filter((x) => x.client_id === cid && x.chat_id);
      cands.sort((a, b) => {
        const ai = a.is_internal ? 1 : 0, bi = b.is_internal ? 1 : 0; // prefer client-facing
        if (ai !== bi) return ai - bi;
        const at = a.last_message_at ? Date.parse(a.last_message_at) : 0;
        const bt = b.last_message_at ? Date.parse(b.last_message_at) : 0;
        return bt - at;
      });
      if (cands[0]?.chat_id) defaultByClient.set(cid, String(cands[0].chat_id));
    }
  }
  for (const c of clients) {
    const override = c.telegram_chat_id || null;
    const dflt = c.client_id ? (defaultByClient.get(c.client_id) ?? null) : null;
    c.resolved_chat_id = override ?? dflt;
    c.resolved_thread_id = override ? (c.telegram_thread_id ?? null) : null;
  }
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

/** The KR Signal config linked to a HHP client, or null if none exists yet.
 *  Powers the per-client Korea Signal settings dialog on /clients. */
export async function loadConfigByHhpClientId(
  supabase: SupabaseClient,
  clientId: string,
): Promise<KrSignalClient | null> {
  const { data, error } = await supabase
    .from("kr_signal_clients")
    .select(COLUMNS)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) throw new Error(`loadConfigByHhpClientId: ${error.message}`);
  return (data as unknown as KrSignalClient) ?? null;
}

/** The editable subset of a KR Signal config (what the settings dialog sends). */
export interface KrSignalConfigPatch {
  ticker?: string;
  coingecko_id?: string | null;
  contract?: string | null;
  chain?: string | null;
  kr_listed?: boolean;
  kr_venues?: string[];
  global_venues?: string[];
  peer_basket?: string[];
  content_log_source?: string | null;
  telegram_chat_id?: string | null;
  telegram_thread_id?: string | null;
  features?: Partial<KrSignalFeatures>;
  thresholds?: KrSignalThresholds;
  is_active?: boolean;
}

/**
 * Create-or-update the KR Signal config for a HHP client. Idempotent on
 * client_id — the first save for a client inserts a row (deriving a unique
 * `key`/`name`/`ticker` from the client), later saves patch it. Used by the
 * /clients Korea Signal dialog via the admin API route.
 */
export async function upsertConfigForHhpClient(
  admin: SupabaseClient,
  clientId: string,
  clientName: string,
  patch: KrSignalConfigPatch,
): Promise<KrSignalClient> {
  const existing = await loadConfigByHhpClientId(admin, clientId);

  if (existing) {
    const { data, error } = await (admin as any)
      .from("kr_signal_clients")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", (existing as any).id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`upsertConfigForHhpClient(update): ${error.message}`);
    return data as unknown as KrSignalClient;
  }

  // First save → insert. Derive a stable, unique key from the client name.
  const baseKey = (clientName || "client")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || `client-${clientId.slice(0, 8)}`;
  let key = baseKey;
  for (let i = 2; i < 50; i++) {
    const { data: clash } = await (admin as any)
      .from("kr_signal_clients").select("id").eq("key", key).maybeSingle();
    if (!clash) break;
    key = `${baseKey}-${i}`;
  }

  const insertRow = {
    client_id: clientId,
    key,
    name: clientName || key,
    ticker: patch.ticker || (clientName || key).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || "TOKEN",
    contract: patch.contract ?? null,
    chain: patch.chain ?? null,
    coingecko_id: patch.coingecko_id ?? null,
    kr_listed: patch.kr_listed ?? false,
    kr_venues: patch.kr_venues ?? [],
    global_venues: patch.global_venues ?? [],
    peer_basket: patch.peer_basket ?? [],
    content_log_source: patch.content_log_source ?? `hhp:${clientId}`,
    telegram_chat_id: patch.telegram_chat_id ?? null,
    telegram_thread_id: patch.telegram_thread_id ?? null,
    features: patch.features ?? {},
    thresholds: patch.thresholds ?? {},
    is_active: patch.is_active ?? true,
  };
  const { data, error } = await (admin as any)
    .from("kr_signal_clients")
    .insert(insertRow)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`upsertConfigForHhpClient(insert): ${error.message}`);
  return data as unknown as KrSignalClient;
}
