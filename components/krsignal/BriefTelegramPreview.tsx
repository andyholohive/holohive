'use client';

/**
 * What a client sees in their Telegram group: the bot's message, the link
 * preview Telegram builds from the brief page, and the button.
 *
 * Renders the exact Telegram HTML the bot sends (see lib/koreaIntel/
 * telegramBrief.ts), or the current long report as monospace text. The
 * message sits near the top, unlike real Telegram, so it's on screen.
 */

import Image from 'next/image';
import type { BriefTelegramMessage } from '@/lib/koreaIntel/telegramBrief';
import { BRIEF_BUTTON_TEXT } from '@/lib/koreaIntel/telegramBrief';

export type TelegramPreviewContent =
  | { kind: 'short'; message: BriefTelegramMessage }
  | { kind: 'long'; text: string; withButton: boolean }
  | { kind: 'none'; title: string; body: string };

export function BriefTelegramPreview({ chatTitle, content, notice }: {
  chatTitle: string;
  content: TelegramPreviewContent;
  /** Shown above the message, e.g. "This won't arrive yet". */
  notice?: { title: string; body: string } | null;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#dfe8ee] font-sans">
      <div className="flex items-center gap-2.5 bg-[#3f6d93] px-3.5 py-2.5 text-white">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-white">
          <Image src="/images/logo.png" alt="" width={26} height={26} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{chatTitle}</p>
          <p className="text-xs opacity-85">group · Korea Signal bot</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 px-2.5 pb-5 pt-3.5">
        <span className="self-center rounded-full bg-black/40 px-2.5 py-0.5 text-[11.5px] text-white">Saturday</span>

        {notice && (
          <div className="self-center rounded-xl bg-white/85 px-4 py-3 text-center text-[13px] text-ink-warm-700">
            <b className="mb-1 block text-ink-warm-900">{notice.title}</b>{notice.body}
          </div>
        )}

        {content.kind === 'none' ? (
          <div className="self-center rounded-xl bg-white/85 px-4 py-3 text-center text-[13px] text-ink-warm-700">
            <b className="mb-1 block text-ink-warm-900">{content.title}</b>{content.body}
          </div>
        ) : (
          <>
            <div className="max-w-[94%] rounded-[14px_14px_14px_4px] bg-white px-2.5 pb-1.5 pt-2 text-sm leading-snug text-[#111] shadow-[0_1px_1px_rgba(0,0,0,.08)]">
              <p className="mb-0.5 text-[13px] font-semibold text-[#22699a]">Holo Hive Korea Signal</p>
              {content.kind === 'short' ? (
                <>
                  {/* Same Telegram-HTML string the bot sends; built and escaped in telegramBrief.ts. */}
                  <div className="whitespace-pre-line" dangerouslySetInnerHTML={{ __html: content.message.html }} />
                  <div className="mt-2 border-l-[3px] border-[#22699a] py-0.5 pl-2">
                    <p className="text-[13px] font-semibold text-[#22699a]">{content.message.linkPreview.site}</p>
                    <p className="mt-px text-[13.5px] font-semibold">{content.message.linkPreview.title}</p>
                    <p className="mt-px text-[13px] text-[#333]">{content.message.linkPreview.description}</p>
                  </div>
                </>
              ) : (
                <pre className="m-0 whitespace-pre-wrap break-words font-mono text-[11px] leading-normal text-[#222]">{content.text}</pre>
              )}
              <p className="mt-0.5 text-right text-[11px] text-[#5f6f7e]">Sat 21:00</p>
            </div>
            {(content.kind === 'short' ? !!content.message.button : content.withButton) && (
              <span className="block max-w-[94%] rounded-[10px] bg-[rgba(83,121,153,.62)] px-2.5 py-2 text-center text-[13.5px] font-medium text-white">
                {content.kind === 'short' ? content.message.button!.text : BRIEF_BUTTON_TEXT}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
