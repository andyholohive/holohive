'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Loader2, Send, AlertTriangle, CheckCircle, XCircle, Bell,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/**
 * Configures Telegram alert routing for the Intelligence page.
 *
 * Two event types fire alerts to one shared chat:
 *   - hot_tier: a Discovery scan inserts a new prospect with REACH_OUT_NOW or PRE_TOKEN_PRIORITY
 *   - grok_hot: a Deep Dive returns korea_interest_score >= 70 (with at least 1 new signal)
 *
 * Each event has its own customizable HTML message template. The user
 * can save / test independently before flipping the master enable toggle.
 */

interface ChatOption {
  chat_id: string;
  title: string | null;
  chat_type: string | null;
  last_message_at: string | null;
  message_count: number | null;
}

interface ChannelConfig {
  channel_key: string;
  telegram_chat_id: string | null;
  is_enabled: boolean;
  templates: {
    hot_tier?: string;
    grok_hot?: string;
    korea_listing?: string;
    cron_failed?: string;
  };
  last_test_at: string | null;
  last_test_status: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Documented variables surfaced under each template editor so the user
// knows what's available without reading the code.
const HOT_TIER_VARS = [
  '{project_name}', '{tier}', '{score}', '{funding_round}',
  '{funding_amount}', '{funding_line}', '{prospect_url}',
];
const GROK_HOT_VARS = [
  '{project_name}', '{poc_handle}', '{poc_name}', '{korea_score}',
  '{signal_count}', '{signal_plural}', '{prospect_url}',
];
const KOREA_LISTING_VARS = [
  '{project_name}', '{exchange}', '{exchange_raw}', '{market_pair}',
  '{symbol}', '{prospect_url}',
];
const CRON_FAILED_VARS = [
  '{run_type}', '{error_message}', '{triggered_at}',
  '{triggered_at_iso}', '{intelligence_url}',
];

export default function IntelligenceAlertsDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [chats, setChats] = useState<ChatOption[]>([]);
  const [config, setConfig] = useState<ChannelConfig | null>(null);
  type AlertEvent = 'hot_tier' | 'grok_hot' | 'korea_listing' | 'cron_failed';
  const [testing, setTesting] = useState<AlertEvent | null>(null);

  // Local edit buffer — separate from `config` so unsaved tweaks don't
  // leak into "what we last loaded" when the user cancels or reloads.
  const [draftChatId, setDraftChatId] = useState<string>('');
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [draftHotTier, setDraftHotTier] = useState('');
  const [draftGrokHot, setDraftGrokHot] = useState('');
  const [draftKoreaListing, setDraftKoreaListing] = useState('');
  const [draftCronFailed, setDraftCronFailed] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/intelligence/alerts/config');
      const data = await res.json();
      if (!res.ok || data.error) {
        toast({ title: 'Failed to load', description: data.error || 'Unknown error', variant: 'destructive' });
      } else {
        setChats(data.chats || []);
        setConfig(data.channel);
        setDraftChatId(data.channel?.telegram_chat_id ?? '');
        setDraftEnabled(!!data.channel?.is_enabled);
        setDraftHotTier(data.channel?.templates?.hot_tier ?? '');
        setDraftGrokHot(data.channel?.templates?.grok_hot ?? '');
        setDraftKoreaListing(data.channel?.templates?.korea_listing ?? '');
        setDraftCronFailed(data.channel?.templates?.cron_failed ?? '');
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message ?? 'Failed to load', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Reload every time the dialog opens — fresh chats list, fresh test status.
  useEffect(() => { if (open) load(); }, [open, load]);

  const dirty = !!config && (
    draftChatId !== (config.telegram_chat_id ?? '') ||
    draftEnabled !== config.is_enabled ||
    draftHotTier !== (config.templates?.hot_tier ?? '') ||
    draftGrokHot !== (config.templates?.grok_hot ?? '') ||
    draftKoreaListing !== (config.templates?.korea_listing ?? '') ||
    draftCronFailed !== (config.templates?.cron_failed ?? '')
  );

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/intelligence/alerts/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_chat_id: draftChatId === '' ? null : draftChatId,
          is_enabled: draftEnabled,
          templates: {
            hot_tier: draftHotTier,
            grok_hot: draftGrokHot,
            korea_listing: draftKoreaListing,
            cron_failed: draftCronFailed,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast({ title: 'Save failed', description: data.error || 'Unknown error', variant: 'destructive' });
      } else {
        setConfig(data.channel);
        // Reflect what the server actually saved (e.g. is_enabled may be
        // forced false if no chat was selected).
        setDraftEnabled(!!data.channel.is_enabled);
        toast({ title: 'Saved', description: 'Alert config updated.' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message ?? 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async (event: AlertEvent) => {
    if (dirty) {
      toast({ title: 'Save first', description: 'You have unsaved changes — save them so the test uses your latest template.', variant: 'destructive' });
      return;
    }
    setTesting(event);
    try {
      const res = await fetch('/api/intelligence/alerts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast({
          title: 'Test failed',
          description: data.error || 'Unknown error',
          variant: 'destructive',
        });
      } else {
        const label =
          event === 'hot_tier'      ? 'hot tier'
          : event === 'grok_hot'    ? 'Grok-hot'
          : event === 'korea_listing' ? 'Korea listing'
          : 'cron failed';
        toast({ title: 'Test sent', description: `Check the selected Telegram chat for the "[TEST]" ${label} alert.` });
        // Refresh to pick up last_test_at / last_test_status
        load();
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message ?? 'Test failed', variant: 'destructive' });
    } finally {
      setTesting(null);
    }
  };

  // Friendly label for the dropdown options. Truncates long titles, shows
  // chat type, and a stale-indicator if the chat hasn't seen activity in 30d
  // so the user picks an active chat over a dormant one.
  const chatLabel = (c: ChatOption): string => {
    const type = c.chat_type === 'supergroup' || c.chat_type === 'group' ? 'group' : c.chat_type;
    const title = (c.title || '(untitled)').slice(0, 40);
    const stale = c.last_message_at && (Date.now() - new Date(c.last_message_at).getTime()) > 30 * 86400_000
      ? ' · stale'
      : '';
    return `${title} · ${type}${stale}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-[#3e8692]" />
            Intelligence alerts
          </DialogTitle>
          <DialogDescription>
            Send a Telegram message when a Discovery scan finds a hot prospect
            (REACH_OUT_NOW / PRE_TOKEN_PRIORITY) or when a Deep Dive returns
            a Korea interest score of 70+.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex items-center justify-center text-gray-500 text-sm">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Loading config…
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Chat picker */}
            <div>
              <Label htmlFor="chat-picker">Telegram chat</Label>
              <Select value={draftChatId || 'none'} onValueChange={v => setDraftChatId(v === 'none' ? '' : v)}>
                <SelectTrigger id="chat-picker" className="mt-1">
                  <SelectValue placeholder="Pick a chat…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None (alerts disabled)</SelectItem>
                  {chats.map(c => (
                    <SelectItem key={c.chat_id} value={c.chat_id}>
                      {chatLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                Bot must already be in the chat. {chats.length} known chats.
              </p>
            </div>

            {/* Master enable toggle */}
            <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
              <Switch
                id="alerts-enabled"
                checked={draftEnabled}
                onCheckedChange={setDraftEnabled}
                disabled={!draftChatId}
              />
              <Label htmlFor="alerts-enabled" className="text-sm cursor-pointer flex-1">
                <div className="font-medium">{draftEnabled ? 'Alerts ON' : 'Alerts OFF'}</div>
                <div className="text-xs text-gray-500 font-normal">
                  {!draftChatId
                    ? 'Pick a chat above to enable'
                    : draftEnabled
                      ? 'Real alerts will fire on the next Discovery scan or Deep Dive'
                      : 'No alerts will be sent until enabled'}
                </div>
              </Label>
            </div>

            {/* Hot-tier template */}
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <Label htmlFor="tmpl-hot-tier">Hot prospect alert</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => sendTest('hot_tier')}
                  disabled={!config?.telegram_chat_id || testing !== null || dirty}
                  title={dirty ? 'Save your changes first to test the latest template' : 'Send a [TEST] message to the configured chat'}
                >
                  {testing === 'hot_tier' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                  Send test
                </Button>
              </div>
              <textarea
                id="tmpl-hot-tier"
                className="auth-input w-full font-mono text-xs leading-relaxed p-3 resize-y min-h-[100px]"
                value={draftHotTier}
                onChange={e => setDraftHotTier(e.target.value)}
                spellCheck={false}
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Variables: {HOT_TIER_VARS.map(v => <code key={v} className="bg-gray-100 px-1 rounded mr-1">{v}</code>)}
              </p>
              <p className="text-[10px] text-gray-500">
                HTML allowed: <code>&lt;b&gt;</code> <code>&lt;i&gt;</code> <code>&lt;a href&gt;</code>. Use <code>\n</code> for line breaks.
              </p>
            </div>

            {/* Grok-hot template */}
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <Label htmlFor="tmpl-grok-hot">Grok-hot alert</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => sendTest('grok_hot')}
                  disabled={!config?.telegram_chat_id || testing !== null || dirty}
                  title={dirty ? 'Save your changes first to test the latest template' : 'Send a [TEST] message to the configured chat'}
                >
                  {testing === 'grok_hot' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                  Send test
                </Button>
              </div>
              <textarea
                id="tmpl-grok-hot"
                className="auth-input w-full font-mono text-xs leading-relaxed p-3 resize-y min-h-[100px]"
                value={draftGrokHot}
                onChange={e => setDraftGrokHot(e.target.value)}
                spellCheck={false}
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Variables: {GROK_HOT_VARS.map(v => <code key={v} className="bg-gray-100 px-1 rounded mr-1">{v}</code>)}
              </p>
            </div>

            {/* Korea-listing template */}
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <Label htmlFor="tmpl-korea-listing">Korea listing alert</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => sendTest('korea_listing')}
                  disabled={!config?.telegram_chat_id || testing !== null || dirty}
                  title={dirty ? 'Save your changes first to test the latest template' : 'Send a [TEST] message to the configured chat'}
                >
                  {testing === 'korea_listing' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                  Send test
                </Button>
              </div>
              <textarea
                id="tmpl-korea-listing"
                className="auth-input w-full font-mono text-xs leading-relaxed p-3 resize-y min-h-[100px]"
                value={draftKoreaListing}
                onChange={e => setDraftKoreaListing(e.target.value)}
                spellCheck={false}
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Variables: {KOREA_LISTING_VARS.map(v => <code key={v} className="bg-gray-100 px-1 rounded mr-1">{v}</code>)}
              </p>
              <p className="text-[10px] text-gray-500">
                Fires when an Upbit/Bithumb cron-detected listing matches one of our prospects.
              </p>
            </div>

            {/* Cron-failure template */}
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <Label htmlFor="tmpl-cron-failed">Cron failed alert</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => sendTest('cron_failed')}
                  disabled={!config?.telegram_chat_id || testing !== null || dirty}
                  title={dirty ? 'Save your changes first to test the latest template' : 'Send a [TEST] message to the configured chat'}
                >
                  {testing === 'cron_failed' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                  Send test
                </Button>
              </div>
              <textarea
                id="tmpl-cron-failed"
                className="auth-input w-full font-mono text-xs leading-relaxed p-3 resize-y min-h-[100px]"
                value={draftCronFailed}
                onChange={e => setDraftCronFailed(e.target.value)}
                spellCheck={false}
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Variables: {CRON_FAILED_VARS.map(v => <code key={v} className="bg-gray-100 px-1 rounded mr-1">{v}</code>)}
              </p>
              <p className="text-[10px] text-gray-500">
                Fires when a scheduled job (e.g. the daily Auto Discovery scan) returns a failed status.
                Operational alert — separate from prospect-related alerts above.
              </p>
            </div>

            {/* Last test status footer */}
            {config?.last_test_at && (
              <div className={`rounded-lg border p-2.5 text-xs flex items-center gap-2 ${
                config.last_test_status === 'ok'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}>
                {config.last_test_status === 'ok'
                  ? <CheckCircle className="h-3.5 w-3.5" />
                  : <XCircle className="h-3.5 w-3.5" />}
                Last test: <span className="font-semibold">{config.last_test_status}</span>
                <span className="text-gray-500">
                  · {new Date(config.last_test_at).toLocaleString()}
                </span>
              </div>
            )}

            {/* Unsaved warning */}
            {dirty && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                Unsaved changes — click Save to apply.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Close
          </Button>
          <Button
            onClick={save}
            disabled={saving || !dirty || loading}
            style={{ backgroundColor: 'var(--brand)', color: 'white' }}
            className="hover:opacity-90"
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
