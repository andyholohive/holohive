'use client';

import { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Composer that shows bold as bold while you type, with ⌘B / Ctrl+B —
 * the same shortcut Telegram uses.
 *
 * [2026-08-11] Call notes previously used a plain Textarea, so the only way
 * to mark emphasis was typing literal `**asterisks**` and hoping. A textarea
 * cannot render styled text at all, so the field has to be contentEditable
 * for the styling to show in place.
 *
 * STORAGE IS STILL MARKDOWN. The DOM is a rendering detail: `value` in and
 * out is the same `**bold**` string the Telegram serializer already parses
 * (lib/callNoteFormat.ts), so nothing downstream changes and existing notes
 * keep working. Only bold is offered here — italic and links still translate
 * on send if someone types them, they just don't have a shortcut.
 *
 * Deliberately not a rich-text library: one mark, one shortcut, and a
 * markdown string on both sides is a fraction of the surface area of a
 * document model we'd then have to migrate notes into.
 */

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * `**bold**` → `<b>`. Everything else is escaped, so a note containing
 * `<script>` renders as text rather than markup even inside the editor.
 */
function markdownToHtml(md: string): string {
  const parts: string[] = [];
  const re = /\*\*([^*\n]+)\*\*/g;
  let last = 0;
  for (let m = re.exec(md); m; m = re.exec(md)) {
    if (m.index > last) parts.push(escapeHtml(md.slice(last, m.index)));
    parts.push(`<b>${escapeHtml(m[1])}</b>`);
    last = m.index + m[0].length;
  }
  if (last < md.length) parts.push(escapeHtml(md.slice(last)));
  return parts.join('') || '';
}

/**
 * Walk the DOM back to markdown.
 *
 * contentEditable represents newlines as `<br>` or as block wrappers
 * depending on the browser and how the line was created, so both are folded
 * back to `\n`. An empty bold node emits nothing rather than a stray `****`.
 */
function htmlToMarkdown(root: HTMLElement): string {
  let out = '';

  const walk = (node: Node, insideBold: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue ?? '';
      return;
    }
    if (!(node instanceof HTMLElement)) return;

    const tag = node.tagName;
    if (tag === 'BR') { out += '\n'; return; }

    const isBold = tag === 'B' || tag === 'STRONG'
      || (node.style?.fontWeight === 'bold' || node.style?.fontWeight === '700');

    // A block element starts a new line unless we're already at one.
    const isBlock = tag === 'DIV' || tag === 'P';
    if (isBlock && out.length > 0 && !out.endsWith('\n')) out += '\n';

    if (isBold && !insideBold) {
      const before = out.length;
      out += '**';
      node.childNodes.forEach(c => walk(c, true));
      // Nothing between the markers — drop them instead of emitting `****`.
      if (out.length === before + 2) out = out.slice(0, before);
      else out += '**';
      return;
    }

    node.childNodes.forEach(c => walk(c, insideBold));
  };

  root.childNodes.forEach(c => walk(c, false));
  return out;
}

export function BoldTextEditor({ value, onChange, placeholder, className, id }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // What we last handed upward. Re-rendering from `value` on every keystroke
  // would reset the caret to the start, so we only sync when the incoming
  // value is something we didn't produce (external reset, edit-existing).
  const lastEmitted = useRef<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value === lastEmitted.current) return;
    el.innerHTML = markdownToHtml(value ?? '');
    lastEmitted.current = value ?? '';
  }, [value]);

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const md = htmlToMarkdown(el);
    lastEmitted.current = md;
    onChange(md);
  }, [onChange]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      // execCommand is deprecated but is still the only cross-browser way to
      // toggle a mark on the current selection without shipping a full
      // editor. Every current browser implements it for bold.
      document.execCommand('bold');
      emit();
    }
  }, [emit]);

  /** Paste as plain text — otherwise copying from a doc drags its markup in. */
  const onPaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
    emit();
  }, [emit]);

  return (
    <div
      id={id}
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      data-placeholder={placeholder}
      onInput={emit}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      className={cn(
        'w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
        'whitespace-pre-wrap break-words focus-brand',
        'focus-visible:outline-none ring-offset-background',
        // Placeholder — contentEditable has no native one.
        'empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground empty:before:pointer-events-none',
        className,
      )}
    />
  );
}
