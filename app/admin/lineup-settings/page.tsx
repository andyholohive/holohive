'use client';

/**
 * Lineup Manager admin settings.
 *
 * Two sections, both per HHP Lineup Manager Spec (Jdot, 2026-06-01)
 * plus the multi-approver and chat-picker enhancements requested
 * during testing:
 *
 *   1. Approvers (§ 7.1, extended) — list of users who receive a
 *      TG DM when a lineup is proposed. Add/remove via picker. Each
 *      row shows TG ID status so admins know who's actually reachable.
 *
 *   2. Per-campaign ops group chats (§ 5.5) — destination for the
 *      confirmed-lineup post. Picker reads from telegram_chats so
 *      operators don't have to copy/paste numeric chat IDs.
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Search, Check, AlertTriangle, MessageCircle, Save, UserCheck,
  ExternalLink, Plus, X, MessagesSquare,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  telegram_id: string | null;
  telegram_username: string | null;
  role: string | null;
};

type ApproverRow = {
  user_id: string;
  added_at: string;
  user: UserRow | null;
};

type CampaignRow = {
  id: string;
  name: string;
  slug: string | null;
  status: string | null;
  tg_ops_group_id: string | null;
};

type TelegramChatRow = {
  chat_id: string;
  title: string | null;
  chat_type: string | null;
  member_count: number | null;
  is_internal: boolean | null;
  is_hidden: boolean | null;
};

export default function LineupSettingsPage() {
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const currentUserId = (userProfile as any)?.id as string | undefined;

  // ─── Approvers state ────────────────────────────────────────────
  const [approversLoading, setApproversLoading] = useState(true);
  const [approvers, setApprovers] = useState<ApproverRow[]>([]);
  const [allUsers, setAllUsers] = useState<UserRow[]>([]);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  // ─── Campaigns + chats state ────────────────────────────────────
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [tgChats, setTgChats] = useState<TelegramChatRow[]>([]);
  const [campaignSearch, setCampaignSearch] = useState('');
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [chatPickerSearch, setChatPickerSearch] = useState('');
  const [savingCampaignId, setSavingCampaignId] = useState<string | null>(null);

  // ─── Initial load ───────────────────────────────────────────────
  useEffect(() => {
    refreshApprovers();
    refreshCampaignsAndChats();
  }, []);

  async function refreshApprovers() {
    setApproversLoading(true);
    try {
      const [approverRes, usersRes] = await Promise.all([
        // FK hint: lineup_approvers has TWO references to users
        // (user_id + added_by), so PostgREST won't auto-pick which
        // one to embed. Naming the constraint explicitly resolves
        // the "more than one relation" error.
        (supabase as any)
          .from('lineup_approvers')
          .select('user_id, added_at, users!lineup_approvers_user_id_fkey(id, email, name, telegram_id, telegram_username, role)')
          .order('added_at', { ascending: true }),
        (supabase as any)
          .from('users')
          .select('id, email, name, telegram_id, telegram_username, role')
          .eq('is_active', true)
          .order('email'),
      ]);
      if (approverRes.error) throw approverRes.error;
      if (usersRes.error) throw usersRes.error;
      // Normalize the joined shape.
      const rows = ((approverRes.data || []) as any[]).map(r => ({
        user_id: r.user_id,
        added_at: r.added_at,
        user: r.users as UserRow | null,
      }));
      setApprovers(rows);
      setAllUsers((usersRes.data || []) as UserRow[]);
    } catch (err: any) {
      toast({
        title: 'Failed to load approvers',
        description: err?.message,
        variant: 'destructive',
      });
    } finally {
      setApproversLoading(false);
    }
  }

  async function refreshCampaignsAndChats() {
    setCampaignsLoading(true);
    try {
      const [campRes, chatRes] = await Promise.all([
        (supabase as any)
          .from('campaigns')
          .select('id, name, slug, status, tg_ops_group_id')
          .is('archived_at', null)
          .order('created_at', { ascending: false }),
        (supabase as any)
          .from('telegram_chats')
          .select('chat_id, title, chat_type, member_count, is_internal, is_hidden')
          .order('last_message_at', { ascending: false, nullsFirst: false }),
      ]);
      if (campRes.error) throw campRes.error;
      if (chatRes.error) throw chatRes.error;
      setCampaigns((campRes.data || []) as CampaignRow[]);
      // Hide chats explicitly flagged as hidden (the /crm/telegram
      // page surfaces this same control for noise reduction).
      setTgChats(
        ((chatRes.data || []) as TelegramChatRow[]).filter(c => !c.is_hidden),
      );
    } catch (err: any) {
      toast({
        title: 'Failed to load campaigns or chats',
        description: err?.message,
        variant: 'destructive',
      });
    } finally {
      setCampaignsLoading(false);
    }
  }

  // ─── Approver actions ───────────────────────────────────────────

  const approverIds = useMemo(() => new Set(approvers.map(a => a.user_id)), [approvers]);

  const addableUsers = useMemo(() => {
    // Hide users already in the list. Sort the rest by whether they
    // have a telegram_id (yes-first) then by name.
    const candidates = allUsers.filter(u => !approverIds.has(u.id));
    candidates.sort((a, b) => {
      const aHas = !!a.telegram_id ? 0 : 1;
      const bHas = !!b.telegram_id ? 0 : 1;
      if (aHas !== bHas) return aHas - bHas;
      return (a.name || a.email).localeCompare(b.name || b.email);
    });
    if (!userSearch.trim()) return candidates;
    const q = userSearch.toLowerCase();
    return candidates.filter(u =>
      u.email.toLowerCase().includes(q)
      || (u.name && u.name.toLowerCase().includes(q))
      || (u.telegram_username && u.telegram_username.toLowerCase().includes(q)),
    );
  }, [allUsers, approverIds, userSearch]);

  const handleAddApprover = async (user: UserRow) => {
    try {
      const { error } = await (supabase as any)
        .from('lineup_approvers')
        .insert({ user_id: user.id, added_by: currentUserId || null });
      if (error) throw error;
      toast({ title: 'Approver added', description: user.name || user.email });
      setAddPickerOpen(false);
      setUserSearch('');
      await refreshApprovers();
    } catch (err: any) {
      toast({ title: 'Add failed', description: err?.message, variant: 'destructive' });
    }
  };

  const handleRemoveApprover = async (row: ApproverRow) => {
    if (!window.confirm(`Remove ${row.user?.name || row.user?.email || 'this user'} from the approver list?`)) return;
    try {
      const { error } = await (supabase as any)
        .from('lineup_approvers')
        .delete()
        .eq('user_id', row.user_id);
      if (error) throw error;
      toast({ title: 'Approver removed' });
      await refreshApprovers();
    } catch (err: any) {
      toast({ title: 'Remove failed', description: err?.message, variant: 'destructive' });
    }
  };

  // ─── Campaign ops chat actions ──────────────────────────────────

  const filteredCampaigns = useMemo(() => {
    if (!campaignSearch.trim()) return campaigns;
    const q = campaignSearch.toLowerCase();
    return campaigns.filter(c =>
      c.name.toLowerCase().includes(q)
      || (c.slug && c.slug.toLowerCase().includes(q))
      || (c.tg_ops_group_id && c.tg_ops_group_id.includes(q)),
    );
  }, [campaigns, campaignSearch]);

  const filteredChats = useMemo(() => {
    if (!chatPickerSearch.trim()) return tgChats;
    const q = chatPickerSearch.toLowerCase();
    return tgChats.filter(c =>
      (c.title && c.title.toLowerCase().includes(q))
      || c.chat_id.includes(q),
    );
  }, [tgChats, chatPickerSearch]);

  const chatById = useMemo(() => {
    const m = new Map<string, TelegramChatRow>();
    for (const c of tgChats) m.set(c.chat_id, c);
    return m;
  }, [tgChats]);

  const handleStartEdit = (c: CampaignRow) => {
    setEditingCampaignId(c.id);
    setChatPickerSearch('');
  };

  const handlePickChat = async (campaign: CampaignRow, chat: TelegramChatRow | null) => {
    setSavingCampaignId(campaign.id);
    try {
      const v = chat?.chat_id || null;
      const { error } = await (supabase as any)
        .from('campaigns')
        .update({ tg_ops_group_id: v })
        .eq('id', campaign.id);
      if (error) throw error;
      setCampaigns(prev => prev.map(x => x.id === campaign.id ? { ...x, tg_ops_group_id: v } : x));
      setEditingCampaignId(null);
      toast({
        title: v ? 'Ops chat set' : 'Ops chat cleared',
        description: chat?.title || undefined,
      });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSavingCampaignId(null);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ─── Approvers section ─── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <UserCheck className="h-4 w-4 text-brand" />
          <h3 className="text-sm font-semibold text-ink-warm-900">Lineup Approvers</h3>
        </div>
        <p className="text-xs text-ink-warm-500 mb-3">
          Every user listed below receives a TG DM when a lineup is proposed. Anyone in the list can confirm a proposed lineup. Empty list → falls back to <code className="bg-cream-100 px-1 rounded text-[10px]">LINEUP_APPROVER_EMAIL</code> env var, then <code className="bg-cream-100 px-1 rounded text-[10px]">jdot@holohive.io</code>.
        </p>

        {approversLoading ? (
          <Skeleton className="h-32 rounded-lg" />
        ) : (
          <Card className="border-cream-200">
            <CardContent className="p-0">
              {approvers.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-ink-warm-700 mb-1">No approvers configured</p>
                  <p className="text-[11px] text-ink-warm-500 mb-3">
                    Using fallback chain. Add at least one approver to take control.
                  </p>
                  <ApproverAddButton
                    addableUsers={addableUsers}
                    userSearch={userSearch}
                    setUserSearch={setUserSearch}
                    open={addPickerOpen}
                    setOpen={setAddPickerOpen}
                    onAdd={handleAddApprover}
                  />
                </div>
              ) : (
                <>
                  <ul className="divide-y divide-cream-100">
                    {approvers.map(row => (
                      <li key={row.user_id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-cream-50/40">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink-warm-900 truncate">
                            {row.user?.name || row.user?.email || row.user_id.slice(0, 8)}
                          </p>
                          {row.user && (
                            <p className="text-[11px] text-ink-warm-500 truncate">
                              {row.user.email}
                              {row.user.role && <span> · {row.user.role}</span>}
                            </p>
                          )}
                        </div>
                        {/* TG status */}
                        {row.user?.telegram_id ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 inline-flex items-center gap-0.5 shrink-0">
                            <Check className="h-2.5 w-2.5" />
                            {row.user.telegram_username ? `@${row.user.telegram_username}` : 'TG set'}
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 inline-flex items-center gap-0.5 shrink-0" title="User needs to DM the bot first">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            No TG
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveApprover(row)}
                          className="h-7 w-7 p-0 text-ink-warm-400 hover:text-rose-600 shrink-0"
                          title="Remove from approvers"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <div className="border-t border-cream-100 p-2.5 flex items-center gap-2 bg-cream-50/30">
                    <ApproverAddButton
                      addableUsers={addableUsers}
                      userSearch={userSearch}
                      setUserSearch={setUserSearch}
                      open={addPickerOpen}
                      setOpen={setAddPickerOpen}
                      onAdd={handleAddApprover}
                    />
                    <p className="text-[11px] text-ink-warm-500 ml-2">
                      {approvers.length} approver{approvers.length === 1 ? '' : 's'} · all get DM'd on propose
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </section>

      {/* ─── Per-campaign ops chat section ─── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <MessageCircle className="h-4 w-4 text-brand" />
          <h3 className="text-sm font-semibold text-ink-warm-900">Campaign Ops Chats</h3>
        </div>
        <p className="text-xs text-ink-warm-500 mb-3">
          Telegram group chat where confirmed lineups get auto-posted (§ 6.3). Pick from the list of chats HHP has seen — same source as <code className="bg-cream-100 px-1 rounded text-[10px]">/crm/telegram</code>.
        </p>

        <Card className="border-cream-200">
          <div className="p-3 border-b border-cream-100">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-ink-warm-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                placeholder="Search by campaign name, slug, or chat ID…"
                value={campaignSearch}
                onChange={(e) => setCampaignSearch(e.target.value)}
                className="focus-brand h-8 text-sm pl-7"
              />
            </div>
          </div>
          <CardContent className="p-0">
            {campaignsLoading ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded" />
                ))}
              </div>
            ) : filteredCampaigns.length === 0 ? (
              <p className="p-6 text-center text-xs text-ink-warm-500 italic">
                {campaigns.length === 0 ? 'No campaigns yet.' : 'No campaigns match.'}
              </p>
            ) : (
              <ul className="divide-y divide-cream-100">
                {filteredCampaigns.map(c => {
                  const linkedChat = c.tg_ops_group_id ? chatById.get(c.tg_ops_group_id) : null;
                  return (
                    <li key={c.id} className="px-3 py-2.5 flex items-center gap-3 hover:bg-cream-50/40">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-ink-warm-900 truncate">{c.name}</p>
                          {c.status && (
                            <StatusBadge tone="neutral" size="sm">{c.status}</StatusBadge>
                          )}
                        </div>
                        {c.slug && (
                          <p className="text-[10px] text-ink-warm-500 font-mono">{c.slug}</p>
                        )}
                      </div>

                      {/* Chat picker */}
                      <div className="shrink-0">
                        <Popover
                          open={editingCampaignId === c.id}
                          onOpenChange={(o) => o ? handleStartEdit(c) : setEditingCampaignId(null)}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              size="sm"
                              variant={c.tg_ops_group_id ? 'outline' : 'outline'}
                              className="h-7 text-xs max-w-[260px]"
                              disabled={savingCampaignId === c.id}
                            >
                              <MessagesSquare className="h-3 w-3 mr-1 text-ink-warm-500" />
                              <span className="truncate">
                                {linkedChat
                                  ? (linkedChat.title || linkedChat.chat_id)
                                  : c.tg_ops_group_id
                                    ? c.tg_ops_group_id
                                    : 'Pick a chat'}
                              </span>
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[380px] p-0" align="end">
                            <div className="p-2 border-b border-cream-100">
                              <div className="relative">
                                <Search className="h-3.5 w-3.5 text-ink-warm-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <Input
                                  placeholder="Search chats…"
                                  value={chatPickerSearch}
                                  onChange={(e) => setChatPickerSearch(e.target.value)}
                                  className="focus-brand h-8 text-sm pl-7"
                                  autoFocus
                                />
                              </div>
                            </div>
                            <div className="max-h-[320px] overflow-y-auto">
                              {filteredChats.length === 0 ? (
                                <p className="p-6 text-center text-xs text-ink-warm-500 italic">
                                  {tgChats.length === 0
                                    ? 'No chats captured yet. The bot needs to be added to a group and receive at least one message.'
                                    : 'No chats match.'}
                                </p>
                              ) : (
                                <ul className="divide-y divide-cream-100">
                                  {filteredChats.map(chat => {
                                    const isCurrent = chat.chat_id === c.tg_ops_group_id;
                                    return (
                                      <li key={chat.chat_id}>
                                        <button
                                          type="button"
                                          onClick={() => handlePickChat(c, chat)}
                                          className={`w-full text-left px-3 py-2 hover:bg-cream-50/40 ${isCurrent ? 'bg-brand/5' : ''}`}
                                        >
                                          <div className="flex items-center gap-2">
                                            <div className="min-w-0 flex-1">
                                              <p className="text-sm font-medium text-ink-warm-900 truncate">
                                                {chat.title || `Chat ${chat.chat_id}`}
                                              </p>
                                              <p className="text-[10px] text-ink-warm-500 truncate">
                                                {chat.chat_type || 'chat'}
                                                {chat.member_count && <span> · {chat.member_count} members</span>}
                                                {chat.is_internal && <span> · internal</span>}
                                                <span className="font-mono ml-1">{chat.chat_id}</span>
                                              </p>
                                            </div>
                                            {isCurrent && <Check className="h-3.5 w-3.5 text-brand shrink-0" />}
                                          </div>
                                        </button>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                            {c.tg_ops_group_id && (
                              <div className="p-2 border-t border-cream-100">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handlePickChat(c, null)}
                                  className="w-full text-xs text-rose-600 hover:text-rose-700"
                                >
                                  <X className="h-3 w-3 mr-1" />
                                  Clear ops chat for this campaign
                                </Button>
                              </div>
                            )}
                          </PopoverContent>
                        </Popover>
                      </div>

                      {/* Open campaign */}
                      <a
                        href={`/campaigns/${c.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ink-warm-400 hover:text-brand shrink-0"
                        title="Open campaign admin"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

// ─── Approver "+ Add" picker (shared between empty-state + footer) ─

function ApproverAddButton({
  addableUsers, userSearch, setUserSearch, open, setOpen, onAdd,
}: {
  addableUsers: UserRow[];
  userSearch: string;
  setUserSearch: (s: string) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
  onAdd: (user: UserRow) => void;
}) {
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="brand">
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add approver
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <div className="p-2 border-b border-cream-100">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-ink-warm-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              placeholder="Search by email, name, or @telegram"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="focus-brand h-8 text-sm pl-7"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {addableUsers.length === 0 ? (
            <p className="p-6 text-center text-xs text-ink-warm-500 italic">
              {userSearch ? 'No users match.' : 'All eligible users already added.'}
            </p>
          ) : (
            <ul className="divide-y divide-cream-100">
              {addableUsers.map(u => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => onAdd(u)}
                    className="w-full text-left px-3 py-2 hover:bg-cream-50/40"
                  >
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink-warm-900 truncate">
                          {u.name || u.email}
                        </p>
                        <p className="text-[11px] text-ink-warm-500 truncate">
                          {u.email}
                          {u.role && <span> · {u.role}</span>}
                        </p>
                      </div>
                      {u.telegram_id ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 inline-flex items-center gap-0.5 shrink-0">
                          <Check className="h-2.5 w-2.5" />
                          TG
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 shrink-0" title="No telegram_id">
                          No TG
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
