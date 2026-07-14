'use client';

/**
 * TopPostEmbed
 * ────────────
 * Renders the "Top Performing Post" content body on the public client
 * portal (app/public/portal/[id]/page.tsx) by embedding the live post
 * from X/Twitter or Telegram using each platform's official widget.
 *
 * Why widgets and not raw iframes:
 *   - Twitter/X: only their widgets.js renders a properly-styled tweet
 *     with media, link cards, native engagement counts. There's no
 *     stable public iframe URL.
 *   - Telegram: a t.me/<channel>/<id>?embed=1 iframe works but the
 *     official telegram-widget.js auto-sizes + handles theming better.
 *
 * Fallback chain (graceful degradation):
 *   1. URL is null / empty / unparseable          → LinkCard with "post pending" treatment
 *   2. URL parses but platform isn't X/Telegram   → LinkCard with the URL
 *   3. Widget script fails to load (network/CSP)  → LinkCard after timeout
 *   4. Widget loads but post is deleted/private   → LinkCard after timeout (widget renders nothing)
 *
 * Timeout: 6 seconds. Real embeds typically render in <2s. 6s gives
 * generous headroom for slow networks without making a broken embed
 * feel laggy.
 *
 * Data audit (2026-05-27, run before building this):
 *   62% of contents.content_link are Telegram URLs · 25% are X/Twitter ·
 *   12% are null (post not yet live) · 0.4% junk. 100% of valid links
 *   are embeddable via this component. No need for a third platform.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Clock } from 'lucide-react';

type Props = {
  url: string | null;
  notes?: string | null;
};

type Parsed =
  | { platform: 'twitter'; tweetId: string }
  | { platform: 'telegram'; channel: string; msgId: string }
  | { platform: 'unknown' };

// ─── URL parsing ──────────────────────────────────────────────────────
// Reliable patterns observed in production data:
//   Twitter: https://twitter.com/<user>/status/<id>(/...)? OR x.com variant
//   Telegram: https://t.me/<channel>/<msgid>(/...)? — channel may include underscores
function parsePostUrl(url: string | null | undefined): Parsed {
  if (!url || typeof url !== 'string') return { platform: 'unknown' };
  const trimmed = url.trim();
  if (!trimmed) return { platform: 'unknown' };

  // Twitter / X — extract tweet ID from /status/<id>
  const xMatch = trimmed.match(/(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/i);
  if (xMatch) return { platform: 'twitter', tweetId: xMatch[1] };

  // Telegram — extract channel + message id from t.me/<channel>/<msgid>
  const tgMatch = trimmed.match(/t\.me\/([A-Za-z0-9_]+)\/(\d+)/i);
  if (tgMatch) return { platform: 'telegram', channel: tgMatch[1], msgId: tgMatch[2] };

  return { platform: 'unknown' };
}

// ─── Twitter / X embed ────────────────────────────────────────────────
// Uses Twitter's official widgets.js. Pattern:
//   1. Render a <blockquote class="twitter-tweet"> placeholder
//   2. Load widgets.js once globally
//   3. Call window.twttr.widgets.load(container) — transforms the
//      blockquote into a styled iframe in-place
//   4. If after TIMEOUT_MS the container has no <iframe> child, treat
//      as failed and call onFailure()
const TIMEOUT_MS = 6000;

function TwitterEmbed({
  tweetId,
  fallbackUrl,
  onFailure,
}: {
  tweetId: string;
  fallbackUrl: string;
  onFailure: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    let cancelled = false;

    const renderTweet = () => {
      const w = (window as any).twttr;
      if (cancelled || !w?.widgets?.createTweet) return;
      // createTweet returns a Promise<HTMLElement | undefined>
      // undefined = the tweet doesn't exist / was deleted / is private
      w.widgets
        .createTweet(tweetId, container, {
          theme: 'light',
          dnt: true,
          align: 'center',
        })
        .then((el: HTMLElement | undefined) => {
          if (cancelled) return;
          if (!el) {
            // Tweet missing / deleted / protected — fall back
            onFailure();
          } else {
            setLoaded(true);
          }
        })
        .catch(() => {
          if (!cancelled) onFailure();
        });
    };

    // Load widgets.js once
    if ((window as any).twttr?.widgets) {
      renderTweet();
    } else if (!document.querySelector('script[src*="platform.twitter.com/widgets.js"]')) {
      const script = document.createElement('script');
      script.src = 'https://platform.twitter.com/widgets.js';
      script.async = true;
      script.onload = renderTweet;
      script.onerror = () => { if (!cancelled) onFailure(); };
      document.body.appendChild(script);
    } else {
      // Another instance is loading the script — poll for it briefly
      const poll = setInterval(() => {
        if ((window as any).twttr?.widgets) {
          clearInterval(poll);
          renderTweet();
        }
      }, 100);
      setTimeout(() => clearInterval(poll), TIMEOUT_MS);
    }

    // Timeout fallback — covers script failure + render hang
    const timer = setTimeout(() => {
      if (!cancelled && !loaded) onFailure();
    }, TIMEOUT_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // tweetId is the only effective dep — fallbackUrl/onFailure are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tweetId]);

  return (
    <div ref={ref} className="twitter-embed-container my-3" suppressHydrationWarning>
      {/* widgets.js will inject the iframe here on mount */}
    </div>
  );
}

// ─── Telegram embed ───────────────────────────────────────────────────
// Telegram's widget script reads `data-telegram-post` from a script tag
// and creates an iframe at that location. Each instance needs its own
// script tag — can't be reused like Twitter's widgets.load().
function TelegramEmbed({
  channel,
  msgId,
  fallbackUrl,
  onFailure,
}: {
  channel: string;
  msgId: string;
  fallbackUrl: string;
  onFailure: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    let cancelled = false;
    let settled = false;

    // Success signal: Telegram's embedded post posts a
    //   {"event":"resize","height":<n>}
    // message to the parent window ONLY once the post content actually
    // renders. We treat THAT as "loaded" — NOT the mere presence of an
    // <iframe>. Telegram injects the iframe near-instantly (~200ms) even
    // when the post is blocked (Safari/iOS ITP, tracking protection,
    // ad-blockers), private, or deleted, in which case it stays blank.
    // Keying off iframe-presence meant a blank frame counted as success
    // and the LinkCard fallback never fired — leaving a dead box.
    const onMessage = (e: MessageEvent) => {
      if (cancelled || settled) return;
      const origin = e.origin || '';
      if (origin !== 'https://t.me' && !origin.endsWith('.t.me') && !origin.includes('telegram.org')) {
        return;
      }
      let data: any = e.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { return; }
      }
      if (data && data.event === 'resize' && typeof data.height === 'number' && data.height > 0) {
        settled = true;
        setLoaded(true);
      }
    };
    window.addEventListener('message', onMessage);

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-post', `${channel}/${msgId}`);
    script.setAttribute('data-width', '100%');
    script.onerror = () => {
      if (!cancelled && !settled) { settled = true; onFailure(); }
    };

    container.appendChild(script);

    // No resize message within the window → the post never actually
    // rendered (blocked third-party frame, private channel, deleted
    // post). Fall back to the clickable link card instead of a dead box.
    const timer = setTimeout(() => {
      if (!cancelled && !settled) { settled = true; onFailure(); }
    }, TIMEOUT_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      // Don't remove the script — Telegram's widget may still be
      // initializing async. Leaving it doesn't affect re-renders since
      // we re-render the whole component on prop change.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, msgId]);

  return (
    <div ref={ref} className="telegram-embed-container my-3" suppressHydrationWarning>
      {/* telegram-widget.js will inject the iframe here on mount */}
    </div>
  );
}

// ─── Fallback link card ───────────────────────────────────────────────
// Mirrors the pre-embed UX from app/public/portal/[id]/page.tsx so the
// fallback feels intentional, not like a degraded state.
function LinkCard({ url, notes }: { url: string | null; notes?: string | null }) {
  // No URL at all — "post pending" treatment
  if (!url || !url.trim()) {
    return (
      <div className="block bg-gray-50 border border-gray-200 rounded-lg p-4 my-5">
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Post link not yet captured.</span>
        </p>
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block bg-gray-50 border border-gray-200 rounded-lg p-4 my-5 hover:bg-gray-100 hover:border-gray-300 transition-all"
    >
      <p className="text-sm text-gray-700 flex items-center gap-2 break-all">
        <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-gray-500" />
        <span className="truncate">{url}</span>
      </p>
      {notes && (
        <p className="text-xs text-gray-500 italic mt-2 leading-relaxed">
          &ldquo;{notes.length > 120 ? notes.slice(0, 120).trim() + '…' : notes}&rdquo;
        </p>
      )}
    </a>
  );
}

// ─── Main component ───────────────────────────────────────────────────
export default function TopPostEmbed({ url, notes }: Props) {
  const [embedFailed, setEmbedFailed] = useState(false);
  const parsed = parsePostUrl(url);

  // Reset failure state if the URL changes (different top post)
  useEffect(() => {
    setEmbedFailed(false);
  }, [url]);

  // Unparseable / unknown / failed → link card fallback
  if (parsed.platform === 'unknown' || embedFailed) {
    return <LinkCard url={url} notes={notes} />;
  }

  // Wrap embeds in a container that mirrors the link card padding so
  // the layout doesn't jump when fallback fires.
  if (parsed.platform === 'twitter') {
    return (
      <div className="my-5">
        <TwitterEmbed
          tweetId={parsed.tweetId}
          fallbackUrl={url!}
          onFailure={() => setEmbedFailed(true)}
        />
      </div>
    );
  }

  if (parsed.platform === 'telegram') {
    return (
      <div className="my-5">
        <TelegramEmbed
          channel={parsed.channel}
          msgId={parsed.msgId}
          fallbackUrl={url!}
          onFailure={() => setEmbedFailed(true)}
        />
      </div>
    );
  }

  return <LinkCard url={url} notes={notes} />;
}
