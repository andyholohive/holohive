'use client';

/**
 * MessageTemplateEditor — per-notification custom message editor for
 * /admin/telegram-comm (per Andy 2026-07-06). Self-contained: loads /
 * saves its app_settings tmpl_* row, shows the available {variables},
 * and falls back to the built-in default when cleared. Senders resolve
 * templates via lib/messageTemplates getTemplate(), so an empty row
 * here always means "use the default" — never a blank message.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { Save, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { TEMPLATE_META, type TemplateKey } from '@/lib/messageTemplates';

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
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
        const v = ((data as any)?.value as string) ?? '';
        setSaved(v);
        setValue(v);
      } finally {
        setLoading(false);
      }
    })();
  }, [settingKey]);

  const isDirty = value !== saved;
  const isCustom = !!saved.trim();

  async function persist(next: string) {
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from('app_settings')
        .upsert({ key: settingKey, value: next.trim() ? next : null }, { onConflict: 'key' });
      if (error) throw error;
      setSaved(next);
      setValue(next);
      toast({
        title: next.trim() ? 'Custom message saved' : 'Reset to default message',
        description: next.trim() ? undefined : 'The built-in default will be sent.',
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
      <div className="flex items-center gap-2">
        <Label className="text-xs font-medium text-ink-warm-700 m-0">{label}</Label>
        <StatusBadge tone={isCustom ? 'brand' : 'neutral'} size="sm">
          {isCustom ? 'Custom' : 'Default'}
        </StatusBadge>
      </div>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={meta.default}
        disabled={disabled || saving}
        rows={Math.min(6, Math.max(2, meta.default.split('\n').length))}
        className="focus-brand font-mono text-xs leading-relaxed"
      />
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="text-[10px] text-ink-warm-500 space-y-0.5 min-w-0">
          <p className="flex items-center gap-1 flex-wrap">
            <span>Variables:</span>
            {meta.vars.map(v => (
              <code key={v} className="bg-cream-100 px-1 py-0.5 rounded font-mono">{`{${v}}`}</code>
            ))}
            <span>· {meta.format} formatting</span>
          </p>
          {meta.appended && <p>{meta.appended} Leave empty to use the default.</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isCustom && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => persist('')}
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
