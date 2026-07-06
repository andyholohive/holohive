'use client';

/**
 * MessageTemplateEditor — per-notification custom message editor for
 * /admin/telegram-comm (per Andy 2026-07-06). Self-contained: loads /
 * saves its app_settings tmpl_* row, shows the available {variables},
 * and falls back to the built-in default when cleared.
 *
 * Rev 2 (same day, per Andy):
 *   • The textarea is PREFILLED with the currently-sending message
 *     (custom if set, otherwise the default) so edits happen on top
 *     of it instead of against an empty box.
 *   • Telegram formatting toolbar — wraps the selection in the right
 *     markup for the template's parse mode (HTML: <b>/<i>/<u>/<s>/
 *     <code>/<a>; Markdown: * _ ` [](url) — Telegram's Markdown mode
 *     has no underline/strike, so those buttons hide).
 *   • Variable chips insert {var} at the cursor.
 *
 * Saving a message identical to the default stores null — senders via
 * lib/messageTemplates getTemplate() treat unset/empty as "use the
 * default", so the Default badge stays honest and a blank message can
 * never go out.
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { Save, RotateCcw, Bold, Italic, Underline, Strikethrough, Code, Link2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { TEMPLATE_META, type TemplateKey } from '@/lib/messageTemplates';

type FormatAction = {
  icon: any;
  title: string;
  prefix: string;
  suffix: string;
  /** Selection placeholder when nothing is selected. */
  fallback?: string;
};

const HTML_ACTIONS: FormatAction[] = [
  { icon: Bold, title: 'Bold', prefix: '<b>', suffix: '</b>' },
  { icon: Italic, title: 'Italic', prefix: '<i>', suffix: '</i>' },
  { icon: Underline, title: 'Underline', prefix: '<u>', suffix: '</u>' },
  { icon: Strikethrough, title: 'Strikethrough', prefix: '<s>', suffix: '</s>' },
  { icon: Code, title: 'Monospace', prefix: '<code>', suffix: '</code>' },
  { icon: Link2, title: 'Link', prefix: '<a href="https://">', suffix: '</a>', fallback: 'link text' },
];

// Telegram's 'Markdown' parse mode (used by the confirmed-lineup post)
// supports *bold* _italic_ `code` [text](url) — no underline/strike.
const MARKDOWN_ACTIONS: FormatAction[] = [
  { icon: Bold, title: 'Bold', prefix: '*', suffix: '*' },
  { icon: Italic, title: 'Italic', prefix: '_', suffix: '_' },
  { icon: Code, title: 'Monospace', prefix: '`', suffix: '`' },
  { icon: Link2, title: 'Link', prefix: '[', suffix: '](https://)', fallback: 'link text' },
];

export function MessageTemplateEditor({
  settingKey,
  label = 'Custom message',
  disabled = false,
}: {
  settingKey: TemplateKey;
  label?: string;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const meta = TEMPLATE_META[settingKey];
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Raw DB value ('' = unset → default is what actually sends).
  const [savedRaw, setSavedRaw] = useState('');
  const [value, setValue] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await (supabase as any)
          .from('app_settings')
          .select('value')
          .eq('key', settingKey)
          .maybeSingle();
        const raw = ((data as any)?.value as string) ?? '';
        setSavedRaw(raw);
        // Prefill with what's currently being sent so the team edits
        // on top of the live message, not against an empty box.
        setValue(raw.trim() ? raw : meta.default);
      } finally {
        setLoading(false);
      }
    })();
  }, [settingKey, meta.default]);

  const effectiveSaved = savedRaw.trim() ? savedRaw : meta.default;
  const isDirty = value !== effectiveSaved;
  const isCustom = !!savedRaw.trim();
  const actions = meta.format === 'Markdown' ? MARKDOWN_ACTIONS : HTML_ACTIONS;

  /** Insert text at the cursor / wrap the current selection. */
  function applyAt(prefix: string, suffix: string, fallback = '') {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const selected = value.slice(start, end) || fallback;
    const next = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
    setValue(next);
    // Re-select the wrapped text so chained formatting works.
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  }

  async function persist(next: string) {
    setSaving(true);
    try {
      // Identical-to-default (or empty) → store null so the badge and
      // the sender-side fallback both read "default".
      const isDefault = !next.trim() || next.trim() === meta.default.trim();
      const { error } = await (supabase as any)
        .from('app_settings')
        .upsert({ key: settingKey, value: isDefault ? null : next }, { onConflict: 'key' });
      if (error) throw error;
      setSavedRaw(isDefault ? '' : next);
      setValue(isDefault ? meta.default : next);
      toast({
        title: isDefault ? 'Using default message' : 'Custom message saved',
        description: isDefault ? 'This matches the built-in default.' : undefined,
      });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Skeleton className="h-24 w-full rounded-lg" />;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Label className="text-xs font-medium text-ink-warm-700 m-0">{label}</Label>
        <StatusBadge tone={isCustom ? 'brand' : 'neutral'} size="sm">
          {isCustom ? 'Custom' : 'Default'}
        </StatusBadge>
        {/* Formatting toolbar — Telegram markup for this template's parse mode */}
        <div className="ml-auto flex items-center gap-0.5">
          {actions.map(a => (
            <Button
              key={a.title}
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-ink-warm-500 hover:text-ink-warm-900"
              title={a.title}
              disabled={disabled || saving}
              onClick={() => applyAt(a.prefix, a.suffix, a.fallback)}
            >
              <a.icon className="h-3.5 w-3.5" />
            </Button>
          ))}
        </div>
      </div>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled || saving}
        rows={Math.min(7, Math.max(3, value.split('\n').length + 1))}
        className="focus-brand font-mono text-xs leading-relaxed"
      />
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="text-[10px] text-ink-warm-500 space-y-0.5 min-w-0">
          <p className="flex items-center gap-1 flex-wrap">
            <span>Insert:</span>
            {meta.vars.map(v => (
              <button
                key={v}
                type="button"
                title={`Insert {${v}} at cursor`}
                disabled={disabled || saving}
                onClick={() => applyAt(`{${v}}`, '')}
                className="bg-cream-100 hover:bg-cream-200 px-1 py-0.5 rounded font-mono transition-colors"
              >
                {`{${v}}`}
              </button>
            ))}
            <span>· {meta.format} formatting</span>
          </p>
          {meta.appended && <p>{meta.appended}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(isCustom || value.trim() !== meta.default.trim()) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => persist(meta.default)}
              disabled={disabled || saving}
              className="h-7 text-xs text-ink-warm-500"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset to default
            </Button>
          )}
          <Button
            variant="brand"
            size="sm"
            onClick={() => persist(value)}
            disabled={disabled || saving || !isDirty}
            className="h-7 text-xs"
          >
            <Save className="h-3 w-3 mr-1" />
            {saving ? 'Saving…' : 'Save message'}
          </Button>
        </div>
      </div>
    </div>
  );
}
