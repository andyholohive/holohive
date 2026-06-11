'use client';

/**
 * BacklogSettingsDialog — super_admin-only configuration surface
 * for the Backlog Tab.
 *
 * Phase 6.5 of the spec — the weekly-digest Telegram channel ID was
 * originally a Vercel env var. Moving it here means:
 *   • Andy can change it without a Vercel deploy
 *   • A "Send test message" button confirms the chat ID + bot
 *     membership BEFORE saving (catches typos and "bot was kicked"
 *     situations before the next Monday silently fails)
 *
 * Picker UX:
 *   • Lists chats from the `telegram_chats` table + forum topics
 *     from `telegram_threads` so the operator can pick either the
 *     parent chat (General feed) OR a specific topic.
 *   • Threads are rendered nested under their parent chat (indented
 *     "↳ Topic name"); selecting a thread saves BOTH the chat_id
 *     and the thread_id.
 *   • Hidden chats / threads (is_hidden = true) are filtered out.
 *   • Sorted by `last_message_at` desc within chats; threads inherit
 *     their parent's position and sort by `last_seen_at` desc within
 *     each chat group.
 */

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import {
  Settings as SettingsIcon, Send, CheckCircle2, XCircle,
  Check, ChevronsUpDown, MessageSquare, Hash, RefreshCw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import {
  getAppSettingBrowser, setAppSettingBrowser,
} from '@/lib/appSettings';

type TelegramChat = {
  id: string;
  chat_id: string;
  title: string | null;
  chat_type: string | null;
  last_message_at: string | null;
  is_internal: boolean;
};

type TelegramThread = {
  id: string;
  chat_id: string;
  message_thread_id: number;
  name: string | null;
  last_seen_at: string;
};

type TestState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

const CHAT_TYPE_TONE: Record<string, BadgeTone> = {
  supergroup: 'brand',
  group:      'info',
  private:    'purple',
  channel:    'success',
};

const CHAT_TYPE_LABEL: Record<string, string> = {
  supergroup: 'Supergroup',
  group:      'Group',
  private:    'DM',
  channel:    'Channel',
};

/**
 * Parse a thread ID from one of these forms:
 *   • Bare number: "4280"
 *   • t.me URL with chat + thread: "https://t.me/c/1234567890/4280"
 *   • t.me URL with chat + thread + message: "https://t.me/c/1234567890/4280/12345"
 *   • Empty / non-numeric: returns null
 *
 * The thread ID is always the FIRST numeric segment after the chat
 * ID in a t.me/c/<chat>/<thread>/<msg> URL.
 */
function parseThreadInput(input: string): string {
  const raw = (input || '').trim();
  if (!raw) return '';
  // Strip any t.me URL parts; keep only digits.
  const urlMatch = raw.match(/t\.me\/c\/\d+\/(\d+)(?:\/|$)/);
  if (urlMatch) return urlMatch[1];
  // Bare digits only.
  const numMatch = raw.match(/^\d+$/);
  if (numMatch) return raw;
  // Not parseable — return empty so the field signals "invalid"
  // (or '0' which never matches anything). Returning empty matches
  // "not set" so the dialog falls back gracefully.
  return '';
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'no messages';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function BacklogSettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { userProfile } = useAuth();
  const { toast } = useToast();

  const [chats, setChats] = useState<TelegramChat[]>([]);
  const [threads, setThreads] = useState<TelegramThread[]>([]);
  const [chatsLoading, setChatsLoading] = useState(false);

  // Saved + selected for BOTH channel and thread, so we can detect
  // dirty state when only one of them changes.
  const [savedChannelId, setSavedChannelId] = useState<string>('');
  const [savedThreadId, setSavedThreadId] = useState<string>('');
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [selectedThreadId, setSelectedThreadId] = useState<string>('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [testState, setTestState] = useState<TestState>({ kind: 'idle' });
  // Manual thread-ID input. Separate from selectedThreadId so the
  // user can type freely (even while a picker option is highlighted)
  // and we can parse on commit. When the user picks a thread from
  // the popover, we mirror into this field so it shows the live value.
  const [manualThreadInput, setManualThreadInput] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Re-fetch chats + threads — used by the refresh button after the
  // user has triggered new bot activity (e.g. posted in a topic).
  const fetchRoster = async () => {
    const [chatsRes, threadsRes] = await Promise.all([
      supabase
        .from('telegram_chats')
        .select('id, chat_id, title, chat_type, last_message_at, is_internal')
        .eq('is_hidden', false)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(500),
      (supabase as any)
        .from('telegram_threads')
        .select('id, chat_id, message_thread_id, name, last_seen_at')
        .eq('is_hidden', false)
        .order('last_seen_at', { ascending: false })
        .limit(2000),
    ]);
    if (chatsRes.error) {
      toast({
        title: 'Failed to load chats',
        description: chatsRes.error.message,
        variant: 'destructive',
      });
    } else {
      setChats((chatsRes.data || []) as TelegramChat[]);
    }
    if (threadsRes.error) {
      console.error('Failed to load threads:', threadsRes.error);
    } else {
      setThreads((threadsRes.data || []) as TelegramThread[]);
    }
  };

  // Load settings + roster on open.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setChatsLoading(true);
    setTestState({ kind: 'idle' });
    Promise.all([
      getAppSettingBrowser('backlog_channel_id'),
      getAppSettingBrowser('backlog_channel_thread_id'),
      fetchRoster(),
    ]).then(([channelSetting, threadSetting]) => {
      const c = channelSetting || '';
      const t = threadSetting || '';
      setSavedChannelId(c);
      setSavedThreadId(t);
      setSelectedChannelId(c);
      setSelectedThreadId(t);
      setManualThreadInput(t);
    }).catch(err => {
      toast({
        title: 'Failed to load setting',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }).finally(() => {
      setLoading(false);
      setChatsLoading(false);
    });
    // fetchRoster is captured in scope; safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, toast]);

  const handleRefreshRoster = async () => {
    setRefreshing(true);
    try {
      await fetchRoster();
      toast({ title: 'Refreshed' });
    } finally {
      setRefreshing(false);
    }
  };

  const isDirty = selectedChannelId !== savedChannelId
    || selectedThreadId !== savedThreadId;

  // Group threads by parent chat ID for the nested render.
  const threadsByChat = useMemo(() => {
    const map = new Map<string, TelegramThread[]>();
    for (const t of threads) {
      const arr = map.get(t.chat_id) || [];
      arr.push(t);
      map.set(t.chat_id, arr);
    }
    return map;
  }, [threads]);

  // The chat object matching the selected channel.
  const selectedChat = useMemo(
    () => chats.find(c => c.chat_id === selectedChannelId) || null,
    [chats, selectedChannelId],
  );

  // The thread object matching the selected thread, if any.
  const selectedThread = useMemo(() => {
    if (!selectedThreadId || !selectedChannelId) return null;
    return threads.find(
      t => t.chat_id === selectedChannelId
        && String(t.message_thread_id) === selectedThreadId,
    ) || null;
  }, [threads, selectedChannelId, selectedThreadId]);

  const orphanedSelected = selectedChannelId
    && !chats.some(c => c.chat_id === selectedChannelId);

  const handleTest = async () => {
    if (!selectedChannelId) return;
    setTestState({ kind: 'testing' });
    try {
      const res = await fetch('/api/backlog/test-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_id: selectedChannelId,
          thread_id: selectedThreadId || null,
        }),
      });
      const json = await res.json();
      if (json.ok && json.sent) {
        setTestState({ kind: 'success' });
      } else {
        setTestState({ kind: 'error', message: json.error || 'Unknown error' });
      }
    } catch (err) {
      setTestState({ kind: 'error', message: (err as Error).message });
    }
  };

  const handleSave = async () => {
    if (!userProfile) return;
    setSaving(true);
    try {
      // Save BOTH keys atomically (well, two sequential writes — but
      // either order produces a consistent end state).
      await setAppSettingBrowser(
        'backlog_channel_id',
        selectedChannelId || null,
        userProfile.id,
      );
      await setAppSettingBrowser(
        'backlog_channel_thread_id',
        selectedThreadId || null,
        userProfile.id,
      );
      toast({
        title: selectedChannelId ? 'Saved' : 'Channel cleared',
        description: selectedChannelId
          ? selectedThreadId
            ? 'The Monday digest will post to this thread.'
            : 'The Monday digest will post to this chat.'
          : 'The weekly digest will be skipped until a channel is set.',
      });
      setSavedChannelId(selectedChannelId);
      setSavedThreadId(selectedThreadId);
      onClose();
    } catch (err) {
      toast({
        title: 'Save failed',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!userProfile || userProfile.role !== 'super_admin') return null;

  // Trigger-button label — three states: chat selected, chat+thread,
  // orphaned/raw ID, nothing selected.
  const triggerLabel = (() => {
    if (selectedChat && selectedThread) {
      return (
        <span className="flex items-center gap-2 min-w-0">
          <MessageSquare className="h-3.5 w-3.5 text-ink-warm-400 shrink-0" />
          <span className="truncate">
            {selectedChat.title || `Chat ${selectedChat.chat_id}`}
            <span className="text-ink-warm-400 mx-1">→</span>
            <Hash className="inline h-3 w-3 text-ink-warm-400" />
            {selectedThread.name || `Topic ${selectedThread.message_thread_id}`}
          </span>
        </span>
      );
    }
    if (selectedChat) {
      return (
        <span className="flex items-center gap-2 min-w-0">
          <MessageSquare className="h-3.5 w-3.5 text-ink-warm-400 shrink-0" />
          <span className="truncate">{selectedChat.title || `Chat ${selectedChat.chat_id}`}</span>
          {selectedChat.chat_type && (
            <StatusBadge
              tone={CHAT_TYPE_TONE[selectedChat.chat_type] || 'neutral'}
              size="sm"
              bordered
            >
              {CHAT_TYPE_LABEL[selectedChat.chat_type] || selectedChat.chat_type}
            </StatusBadge>
          )}
        </span>
      );
    }
    if (orphanedSelected) {
      return (
        <span className="flex items-center gap-2 min-w-0">
          <MessageSquare className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span className="font-mono text-xs truncate">
            {selectedChannelId}
            {selectedThreadId && (
              <>
                <span className="text-ink-warm-400 mx-1">→</span>
                <Hash className="inline h-3 w-3" />
                {selectedThreadId}
              </>
            )}
          </span>
          <span className="text-[10px] text-amber-700 shrink-0">not in roster</span>
        </span>
      );
    }
    return (
      <span className="text-ink-warm-500">
        {loading ? 'Loading…' : 'Select a chat or thread...'}
      </span>
    );
  })();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4 text-brand" />
            Backlog settings
          </DialogTitle>
          <DialogDescription>
            Where the weekly digest posts every Monday morning. Pick a chat or a specific forum topic.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-1.5">
            <Label>Telegram destination</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={pickerOpen}
                  className="w-full justify-between font-normal focus-brand h-9"
                  disabled={loading}
                >
                  {triggerLabel}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[540px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search chats and topics..." className="h-9" />
                  <CommandList className="max-h-[400px]">
                    <CommandEmpty>Nothing matches.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="__none__"
                        onSelect={() => {
                          setSelectedChannelId('');
                          setSelectedThreadId('');
                          setManualThreadInput('');
                          setPickerOpen(false);
                          if (testState.kind !== 'idle') setTestState({ kind: 'idle' });
                        }}
                      >
                        <Check className={`mr-2 h-4 w-4 ${selectedChannelId === '' ? 'opacity-100' : 'opacity-0'}`} />
                        <span className="text-ink-warm-500">None (skip digest)</span>
                      </CommandItem>
                    </CommandGroup>
                    <CommandGroup heading={`Chats (${chats.length})`}>
                      {chatsLoading && (
                        <div className="px-2 py-4 text-xs text-ink-warm-500">Loading chats…</div>
                      )}
                      {chats.flatMap(c => {
                        const title = c.title || `Chat ${c.chat_id}`;
                        const chatThreads = threadsByChat.get(c.chat_id) || [];
                        const chatRow = (
                          <CommandItem
                            key={`chat-${c.chat_id}`}
                            // Including chat_id in the value powers
                            // "search by ID" too.
                            value={`${title} ${c.chat_id}`}
                            onSelect={() => {
                              setSelectedChannelId(c.chat_id);
                              setSelectedThreadId('');
                              setManualThreadInput('');
                              setPickerOpen(false);
                              if (testState.kind !== 'idle') setTestState({ kind: 'idle' });
                            }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${(selectedChannelId === c.chat_id && !selectedThreadId) ? 'opacity-100' : 'opacity-0'}`} />
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div className="min-w-0 flex-1">
                                <div className="text-sm text-ink-warm-900 truncate">{title}</div>
                                <div className="text-[10px] text-ink-warm-500 font-mono truncate">
                                  {c.chat_id} · {relativeTime(c.last_message_at)}
                                  {chatThreads.length > 0 && (
                                    <span className="ml-1.5 text-ink-warm-400">
                                      · {chatThreads.length} topic{chatThreads.length === 1 ? '' : 's'}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {c.chat_type && (
                                <StatusBadge
                                  tone={CHAT_TYPE_TONE[c.chat_type] || 'neutral'}
                                  size="sm"
                                  bordered
                                >
                                  {CHAT_TYPE_LABEL[c.chat_type] || c.chat_type}
                                </StatusBadge>
                              )}
                            </div>
                          </CommandItem>
                        );

                        // Thread rows — indented under their parent
                        // so they read as nested. Each is selectable
                        // independently of the parent chat.
                        const threadRows = chatThreads.map(thr => {
                          const threadName = thr.name || `Topic ${thr.message_thread_id}`;
                          const isSelected = selectedChannelId === c.chat_id
                            && String(thr.message_thread_id) === selectedThreadId;
                          return (
                            <CommandItem
                              key={`thread-${c.chat_id}-${thr.message_thread_id}`}
                              // Search matches: thread name + parent
                              // chat title + parent chat ID + thread
                              // ID. Lets the user find a topic by any
                              // of those.
                              value={`${threadName} ${title} ${c.chat_id} ${thr.message_thread_id}`}
                              onSelect={() => {
                                setSelectedChannelId(c.chat_id);
                                setSelectedThreadId(String(thr.message_thread_id));
                                setManualThreadInput(String(thr.message_thread_id));
                                setPickerOpen(false);
                                if (testState.kind !== 'idle') setTestState({ kind: 'idle' });
                              }}
                            >
                              <Check className={`mr-2 h-4 w-4 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                              <div className="flex items-center gap-2 min-w-0 flex-1 pl-5">
                                <span className="text-ink-warm-400 text-[10px] font-mono">↳</span>
                                <Hash className="h-3 w-3 text-ink-warm-400 shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm text-ink-warm-900 truncate">{threadName}</div>
                                  <div className="text-[10px] text-ink-warm-500 font-mono truncate">
                                    topic #{thr.message_thread_id} · {relativeTime(thr.last_seen_at)}
                                  </div>
                                </div>
                              </div>
                            </CommandItem>
                          );
                        });

                        return [chatRow, ...threadRows];
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-ink-warm-500 flex-1">
                Chats appear once the bot has seen a message there. Forum topics appear once someone posts in them.
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[11px] text-ink-warm-500 hover:text-brand shrink-0"
                onClick={handleRefreshRoster}
                disabled={refreshing}
                title="Re-fetch chats + topics from the database"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Manual thread ID — escape hatch for "the bot hasn't seen
              activity in this topic yet" + "I know the ID, just let
              me type it." Accepts a number OR a t.me URL — we extract
              the thread segment. Only visible when a chat is picked
              (no point asking for a thread with no chat). */}
          {selectedChannelId && (
            <div className="grid gap-1.5">
              <Label htmlFor="bl-thread" className="text-xs">
                Forum topic ID <span className="text-ink-warm-500 font-normal">(optional)</span>
              </Label>
              <Input
                id="bl-thread"
                value={manualThreadInput}
                onChange={(e) => {
                  const raw = e.target.value;
                  setManualThreadInput(raw);
                  const parsed = parseThreadInput(raw);
                  setSelectedThreadId(parsed);
                  if (testState.kind !== 'idle') setTestState({ kind: 'idle' });
                }}
                placeholder="e.g. 4280 or https://t.me/c/1234567890/4280"
                className="focus-brand font-mono text-xs h-8"
              />
              <p className="text-[10px] text-ink-warm-500">
                Right-click a topic in Telegram desktop → Copy Link, then paste here. Leave blank to post to the chat's General feed.
              </p>
              {manualThreadInput && !selectedThreadId && (
                <p className="text-[11px] text-amber-700">
                  Couldn't parse a thread ID — paste either a bare number or a <code className="bg-cream-100 px-1 rounded">t.me/c/…</code> URL.
                </p>
              )}
            </div>
          )}

          {/* Send-test affordance */}
          <div className="rounded-md border border-cream-200 bg-cream-50 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={handleTest}
                disabled={!selectedChannelId || testState.kind === 'testing'}
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                {testState.kind === 'testing' ? 'Sending…' : 'Send test message'}
              </Button>
              {!selectedChannelId && (
                <span className="text-[11px] text-ink-warm-500">
                  Pick a destination first
                </span>
              )}
            </div>
            {testState.kind === 'success' && (
              <div className="flex items-start gap-2 text-xs text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>Sent. Check the destination for the test message, then click Save.</span>
              </div>
            )}
            {testState.kind === 'error' && (
              <div className="flex items-start gap-2 text-xs text-rose-700">
                <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">Test failed</div>
                  <div className="font-mono text-[11px] text-rose-600">{testState.message}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            variant="brand"
            onClick={handleSave}
            disabled={saving || !isDirty}
          >
            {saving ? 'Saving…' : selectedChannelId ? 'Save' : 'Clear destination'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
