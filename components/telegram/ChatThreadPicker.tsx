'use client';

/**
 * ChatThreadPicker — reusable Telegram chat + forum-topic picker.
 *
 * Extracted from BacklogSettingsDialog 2026-06-12 so the same UX can
 * back any setting that needs a TG destination. The picker:
 *   - Lists chats from `telegram_chats` + forum topics from
 *     `telegram_threads` (hidden rows filtered out).
 *   - Nests threads under their parent chat with an indented "↳ Topic"
 *     row. Selecting a thread saves BOTH chat_id + thread_id.
 *   - Search hits chat title, chat ID, topic name, and topic ID.
 *   - Has a manual thread-ID input that accepts a bare number OR a
 *     t.me/c/<chat>/<thread>/<msg> URL.
 *   - "None" option clears both.
 *   - Refresh button re-fetches the roster (useful right after the
 *     operator posts in a new topic to make the bot index it).
 *
 * Controlled component — caller owns chatId + threadId state and
 * receives an onChange when the user picks.
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import {
  Check, ChevronsUpDown, MessageSquare, Hash, RefreshCw, Pencil, X as XIcon,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { formatRelativeShort } from '@/lib/dateFormat';

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

const CHAT_TYPE_TONE: Record<string, BadgeTone> = {
  supergroup: 'brand',
  group: 'info',
  private: 'purple',
  channel: 'success',
};

const CHAT_TYPE_LABEL: Record<string, string> = {
  supergroup: 'Supergroup',
  group: 'Group',
  private: 'DM',
  channel: 'Channel',
};

/**
 * Parse a thread ID from one of:
 *   - Bare number: "4280"
 *   - t.me URL with chat + thread: "https://t.me/c/1234567890/4280"
 *   - t.me URL with chat + thread + message
 *   - Empty / non-numeric: returns ''
 */
export function parseThreadInput(input: string): string {
  const raw = (input || '').trim();
  if (!raw) return '';
  const urlMatch = raw.match(/t\.me\/c\/\d+\/(\d+)(?:\/|$)/);
  if (urlMatch) return urlMatch[1];
  const numMatch = raw.match(/^\d+$/);
  if (numMatch) return raw;
  return '';
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'no messages';
  return formatRelativeShort(iso);
}

export type ChatThreadPickerProps = {
  /** Currently-selected chat_id (controlled). Empty string = nothing selected. */
  chatId: string;
  /** Currently-selected thread_id (controlled). Empty string = no thread. */
  threadId: string;
  /** Fires when the user changes either value via picker or manual input. */
  onChange: (next: { chatId: string; threadId: string }) => void;
  /** Optional label above the picker. Default: "Telegram destination". */
  label?: string;
  /** Disable interaction (used during async saves etc.). */
  disabled?: boolean;
  /** Width of the popover. Default: 540px. */
  popoverWidth?: number;
  /** Show the manual thread ID input below the picker. Default: true. */
  showManualThreadInput?: boolean;
};

export function ChatThreadPicker({
  chatId,
  threadId,
  onChange,
  label = 'Telegram destination',
  disabled = false,
  popoverWidth = 540,
  showManualThreadInput = true,
}: ChatThreadPickerProps) {
  const { toast } = useToast();
  const [chats, setChats] = useState<TelegramChat[]>([]);
  const [threads, setThreads] = useState<TelegramThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Manual thread input mirrors the controlled threadId on open + when
  // the user picks a thread from the popover. Lives separately so the
  // user can type freely without immediately committing partial input.
  const [manualThreadInput, setManualThreadInput] = useState(threadId);
  // [2026-06-12] Inline topic rename: telegram_threads.name often starts
  // null when topics existed before the bot joined. We auto-backfill via
  // forum_topic_created (in the webhook) but offer a manual override here.
  const [editingThreadKey, setEditingThreadKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [savingRename, setSavingRename] = useState(false);

  // Keep manual input in sync if the controlled threadId changes externally
  useEffect(() => {
    setManualThreadInput(threadId);
  }, [threadId]);

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
      toast({ title: 'Failed to load chats', description: chatsRes.error.message, variant: 'destructive' });
    } else {
      setChats((chatsRes.data || []) as TelegramChat[]);
    }
    if (threadsRes.error) {
      console.error('[ChatThreadPicker] thread fetch failed:', threadsRes.error);
    } else {
      setThreads((threadsRes.data || []) as TelegramThread[]);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchRoster().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchRoster();
      toast({ title: 'Refreshed' });
    } finally {
      setRefreshing(false);
    }
  };

  const startRename = (chatIdArg: string, messageThreadId: number, currentName: string | null) => {
    setEditingThreadKey(`${chatIdArg}:${messageThreadId}`);
    setRenameValue(currentName || '');
  };

  const cancelRename = () => {
    setEditingThreadKey(null);
    setRenameValue('');
  };

  const saveRename = async (chatIdArg: string, messageThreadId: number) => {
    const name = renameValue.trim();
    if (!name) { cancelRename(); return; }
    setSavingRename(true);
    try {
      const { error } = await (supabase as any)
        .from('telegram_threads')
        .update({ name })
        .eq('chat_id', chatIdArg)
        .eq('message_thread_id', messageThreadId);
      if (error) {
        toast({ title: 'Rename failed', description: error.message, variant: 'destructive' });
        return;
      }
      setThreads(prev => prev.map(t =>
        (t.chat_id === chatIdArg && t.message_thread_id === messageThreadId)
          ? { ...t, name }
          : t,
      ));
      cancelRename();
      toast({ title: 'Topic renamed', description: name });
    } finally {
      setSavingRename(false);
    }
  };

  const threadsByChat = useMemo(() => {
    const map = new Map<string, TelegramThread[]>();
    for (const t of threads) {
      const arr = map.get(t.chat_id) || [];
      arr.push(t);
      map.set(t.chat_id, arr);
    }
    return map;
  }, [threads]);

  const selectedChat = useMemo(
    () => chats.find(c => c.chat_id === chatId) || null,
    [chats, chatId],
  );

  const selectedThread = useMemo(() => {
    if (!threadId || !chatId) return null;
    return threads.find(t => t.chat_id === chatId && String(t.message_thread_id) === threadId) || null;
  }, [threads, chatId, threadId]);

  const orphanedSelected = chatId && !chats.some(c => c.chat_id === chatId);

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
            <StatusBadge tone={CHAT_TYPE_TONE[selectedChat.chat_type] || 'neutral'} size="sm" bordered>
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
            {chatId}
            {threadId && (
              <>
                <span className="text-ink-warm-400 mx-1">→</span>
                <Hash className="inline h-3 w-3" />
                {threadId}
              </>
            )}
          </span>
          <span className="text-[10px] text-amber-700 shrink-0">not in roster</span>
        </span>
      );
    }
    return (
      <span className="text-ink-warm-500">{loading ? 'Loading…' : 'Select a chat or thread...'}</span>
    );
  })();

  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={pickerOpen}
            className="w-full justify-between font-normal focus-brand h-9"
            disabled={disabled || loading}
          >
            {triggerLabel}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0" style={{ width: popoverWidth }} align="start">
          <Command>
            <CommandInput placeholder="Search chats and topics..." className="h-9" />
            <CommandList className="max-h-[400px]">
              <CommandEmpty>Nothing matches.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="__none__"
                  onSelect={() => {
                    onChange({ chatId: '', threadId: '' });
                    setManualThreadInput('');
                    setPickerOpen(false);
                  }}
                >
                  <Check className={`mr-2 h-4 w-4 ${chatId === '' ? 'opacity-100' : 'opacity-0'}`} />
                  <span className="text-ink-warm-500">None</span>
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading={`Chats (${chats.length})`}>
                {loading && <div className="px-2 py-4 text-xs text-ink-warm-500">Loading chats…</div>}
                {chats.flatMap(c => {
                  const title = c.title || `Chat ${c.chat_id}`;
                  const chatThreads = threadsByChat.get(c.chat_id) || [];
                  const chatRow = (
                    <CommandItem
                      key={`chat-${c.chat_id}`}
                      value={`${title} ${c.chat_id}`}
                      onSelect={() => {
                        onChange({ chatId: c.chat_id, threadId: '' });
                        setManualThreadInput('');
                        setPickerOpen(false);
                      }}
                    >
                      <Check className={`mr-2 h-4 w-4 ${(chatId === c.chat_id && !threadId) ? 'opacity-100' : 'opacity-0'}`} />
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
                          <StatusBadge tone={CHAT_TYPE_TONE[c.chat_type] || 'neutral'} size="sm" bordered>
                            {CHAT_TYPE_LABEL[c.chat_type] || c.chat_type}
                          </StatusBadge>
                        )}
                      </div>
                    </CommandItem>
                  );

                  const threadRows = chatThreads.map(thr => {
                    const threadName = thr.name || `Topic ${thr.message_thread_id}`;
                    const isSelected = chatId === c.chat_id && String(thr.message_thread_id) === threadId;
                    const editKey = `${c.chat_id}:${thr.message_thread_id}`;
                    const isEditing = editingThreadKey === editKey;
                    const hasName = !!thr.name;
                    return (
                      <CommandItem
                        key={`thread-${c.chat_id}-${thr.message_thread_id}`}
                        value={`${threadName} ${title} ${c.chat_id} ${thr.message_thread_id}`}
                        onSelect={() => {
                          if (isEditing) return; // selection disabled while editing
                          const nextThreadId = String(thr.message_thread_id);
                          onChange({ chatId: c.chat_id, threadId: nextThreadId });
                          setManualThreadInput(nextThreadId);
                          setPickerOpen(false);
                        }}
                        className="group"
                      >
                        <Check className={`mr-2 h-4 w-4 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                        <div className="flex items-center gap-2 min-w-0 flex-1 pl-5">
                          <span className="text-ink-warm-400 text-[10px] font-mono">↳</span>
                          <Hash className="h-3 w-3 text-ink-warm-400 shrink-0" />
                          <div className="min-w-0 flex-1">
                            {isEditing ? (
                              <div
                                className="flex items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Input
                                  value={renameValue}
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    e.stopPropagation();
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      saveRename(c.chat_id, thr.message_thread_id);
                                    } else if (e.key === 'Escape') {
                                      e.preventDefault();
                                      cancelRename();
                                    }
                                  }}
                                  placeholder={`Topic ${thr.message_thread_id}`}
                                  className="h-6 text-xs focus-brand"
                                  autoFocus
                                  disabled={savingRename}
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-emerald-600 hover:bg-emerald-50"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    saveRename(c.chat_id, thr.message_thread_id);
                                  }}
                                  disabled={savingRename}
                                  title="Save"
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-ink-warm-400 hover:bg-cream-100"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    cancelRename();
                                  }}
                                  disabled={savingRename}
                                  title="Cancel"
                                >
                                  <XIcon className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <div className={`text-sm truncate ${hasName ? 'text-ink-warm-900' : 'text-ink-warm-500 italic'}`}>
                                  {threadName}
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    startRename(c.chat_id, thr.message_thread_id, thr.name);
                                  }}
                                  className={`p-0.5 rounded hover:bg-cream-100 text-ink-warm-400 hover:text-brand transition-opacity ${hasName ? 'opacity-0 group-hover:opacity-100' : 'opacity-60 hover:opacity-100'}`}
                                  title={hasName ? 'Rename topic' : 'Add topic name'}
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              </div>
                            )}
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
          onClick={handleRefresh}
          disabled={refreshing}
          title="Re-fetch chats + topics from the database"
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {showManualThreadInput && chatId && (
        <div className="grid gap-1.5">
          <Label className="text-xs">
            Forum topic ID <span className="text-ink-warm-500 font-normal">(optional)</span>
          </Label>
          <Input
            value={manualThreadInput}
            onChange={(e) => {
              const raw = e.target.value;
              setManualThreadInput(raw);
              const parsed = parseThreadInput(raw);
              onChange({ chatId, threadId: parsed });
            }}
            placeholder="e.g. 4280 or https://t.me/c/1234567890/4280"
            className="focus-brand font-mono text-xs h-8"
          />
          <p className="text-[10px] text-ink-warm-500">
            Right-click a topic in Telegram desktop → Copy Link, then paste here. Leave blank to post to the chat&apos;s General feed.
          </p>
          {manualThreadInput && !threadId && (
            <p className="text-[11px] text-amber-700">
              Couldn&apos;t parse a thread ID — paste either a bare number or a <code className="bg-cream-100 px-1 rounded">t.me/c/…</code> URL.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
