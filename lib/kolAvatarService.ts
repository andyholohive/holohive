/**
 * KOL avatar fetch + upload service.
 *
 * Two sources, in order of preference:
 *   1. Telegram — bot.getChat(chat_id).photo → bot.getFile → download bytes →
 *      upload to Supabase Storage. Stable URL once stored.
 *   2. X / Twitter — unavatar.io/twitter/HANDLE. Always-fresh, free, no auth.
 *      Stored as a passthrough URL (no bytes downloaded by us).
 *
 * Telegram preferred because (a) it's official API, (b) the URL we mint is
 * stable, (c) it works for KOL group chats where the bot is already a member.
 * Falls through to X when we don't have a telegram_id but do have an X link.
 *
 * Storage layout: `kol-avatars/{kol_id}.jpg`. Public bucket, so the public URL
 * is simply `${SUPABASE_URL}/storage/v1/object/public/kol-avatars/{kol_id}.jpg`.
 *
 * Called from:
 *   - app/api/kols/[id]/refresh-avatar  — manual single refresh (super_admin)
 *   - app/api/admin/refresh-all-kol-avatars  — batch over the roster
 */
import { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'kol-avatars';

export type AvatarSource = 'telegram' | 'x' | 'none';

export interface AvatarFetchResult {
  success: boolean;
  source: AvatarSource;
  url: string | null;
  error?: string;
}

/** Pull the username from common social URLs. Returns null if no pattern matches. */
function extractXHandle(link: string | null | undefined): string | null {
  if (!link) return null;
  const patterns = [/(?:twitter|x)\.com\/(@?[\w_]+)/i];
  for (const p of patterns) {
    const m = link.match(p);
    if (m) {
      return m[1].replace('@', '').replace(/\/$/, '');
    }
  }
  return null;
}

/**
 * Call Telegram bot.getChat → bot.getFile → download photo bytes →
 * upload to kol-avatars bucket. Returns the public Supabase URL.
 *
 * Returns null if any step fails (chat photo absent, bot lacks access, etc).
 * Errors are swallowed; the caller falls back to X.
 */
async function fetchAvatarFromTelegram(
  kolId: string,
  chatId: string,
  supabaseAdmin: SupabaseClient,
  botToken: string,
): Promise<AvatarFetchResult> {
  try {
    // 1. getChat → returns chat photo metadata (small_file_id / big_file_id)
    const chatRes = await fetch(`https://api.telegram.org/bot${botToken}/getChat?chat_id=${chatId}`);
    if (!chatRes.ok) {
      return { success: false, source: 'telegram', url: null, error: `getChat ${chatRes.status}` };
    }
    const chatJson = await chatRes.json();
    const bigFileId = chatJson?.result?.photo?.big_file_id;
    if (!bigFileId) {
      return { success: false, source: 'telegram', url: null, error: 'no photo on chat' };
    }

    // 2. getFile → returns file_path on Telegram's CDN
    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${bigFileId}`);
    if (!fileRes.ok) {
      return { success: false, source: 'telegram', url: null, error: `getFile ${fileRes.status}` };
    }
    const fileJson = await fileRes.json();
    const filePath = fileJson?.result?.file_path;
    if (!filePath) {
      return { success: false, source: 'telegram', url: null, error: 'no file_path' };
    }

    // 3. Download bytes (Telegram file URLs expire in ~1h — that's why we
    //    copy them to our own storage instead of just persisting the URL).
    const photoRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
    if (!photoRes.ok) {
      return { success: false, source: 'telegram', url: null, error: `download ${photoRes.status}` };
    }
    const bytes = await photoRes.arrayBuffer();

    // 4. Upload to bucket. upsert=true so repeat refresh just overwrites.
    const objectKey = `${kolId}.jpg`;
    const { error: upErr } = await supabaseAdmin
      .storage
      .from(BUCKET)
      .upload(objectKey, bytes, {
        contentType: 'image/jpeg',
        upsert: true,
      });
    if (upErr) {
      return { success: false, source: 'telegram', url: null, error: `upload ${upErr.message}` };
    }

    // 5. Get the stable public URL. Cache-bust on the synced timestamp
    //    so the UI shows the new pic immediately after refresh.
    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(objectKey);
    const url = `${pub.publicUrl}?t=${Date.now()}`;
    return { success: true, source: 'telegram', url };
  } catch (err) {
    return {
      success: false,
      source: 'telegram',
      url: null,
      error: err instanceof Error ? err.message : 'unknown',
    };
  }
}

/**
 * Resolve an X profile pic via unavatar.io. We don't download — just persist
 * the unavatar URL. Their CDN caches and redirects to the current avatar.
 *
 * Free service, no API key. Trade-off: if unavatar.io ever goes down, our
 * avatars break. For ~424 KOLs the dependency seems worth it vs paying for
 * the official Twitter API.
 */
function fetchAvatarFromX(link: string | null | undefined): AvatarFetchResult {
  const handle = extractXHandle(link);
  if (!handle) {
    return { success: false, source: 'x', url: null, error: 'no X handle in link' };
  }
  return {
    success: true,
    source: 'x',
    url: `https://unavatar.io/twitter/${handle}`,
  };
}

/**
 * Top-level entry — try TG first (durable), fall through to X. Returns the
 * URL to persist on master_kols.profile_picture_url + the source for logging.
 */
export async function refreshKolAvatar(
  kol: { id: string; telegram_id?: string | null; group_chat_id?: string | null; link?: string | null },
  supabaseAdmin: SupabaseClient,
): Promise<AvatarFetchResult> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  // Prefer telegram_id (KOL's own channel) over group_chat_id (per-team chat).
  // The personal channel has the KOL's actual avatar; the team chat is usually
  // group-styled.
  const chatId = kol.telegram_id || kol.group_chat_id;

  if (chatId && botToken) {
    const tg = await fetchAvatarFromTelegram(kol.id, chatId, supabaseAdmin, botToken);
    if (tg.success) return tg;
    // Telegram failed — fall through to X.
  }

  // X fallback. Returns success=false silently if no X handle in the link.
  return fetchAvatarFromX(kol.link);
}
