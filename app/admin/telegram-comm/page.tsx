'use client';

/**
 * Telegram Comm — admin settings page (renamed from lineup-settings
 * 2026-06-12 per Andy). Sections:
 *
 *   1. Lineup Approvers — list of users who receive a TG DM when a
 *      lineup is proposed.
 *   2. Per-campaign ops group chats — destination for the confirmed-
 *      lineup post + Submission-Progress Alert.
 *   3. Content Review Channel — destination for KOL /submit forwards
 *      with Approve/Reject buttons. Single central channel per the
 *      TG Bot Content Submission spec § Team Review Flow Option 1.
 *
 * The Content Submissions approver list is NOT exposed in this UI yet
 * (super_admin auto-included covers the common case; future work to add
 * a similar multi-user picker for non-super-admin approvers).
 */

import { useEffect, useMemo, useState, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Search, Check, AlertTriangle, MessageCircle, Save, UserCheck,
  ExternalLink, Plus, X, MessagesSquare, ChevronRight, ClipboardList,
  CheckCircle2, Activity,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ChatThreadPicker } from '@/components/telegram/ChatThreadPicker';

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
    <div className="space-y-3">
      {/* ─── Approvers section ─── */}
      <CollapsibleSection
        icon={UserCheck}
        title="Lineup Approvers"
        badge={!approversLoading ? <CountChip n={approvers.length} /> : null}
        subtitle={(
          <>Every user listed below receives a TG DM when a lineup is proposed. Anyone in the list can confirm a proposed lineup. Empty list → falls back to <code className="bg-cream-100 px-1 rounded text-[10px]">LINEUP_APPROVER_EMAIL</code> env var, then <code className="bg-cream-100 px-1 rounded text-[10px]">jdot@holohive.io</code>.</>
        )}
      >
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
      </CollapsibleSection>

      {/* ─── Submission-Progress Alert section [2026-06-30] ─── */}
      <SubmissionProgressChannelSection />

      {/* ─── Per-campaign ops chat section ─── */}
      <CollapsibleSection
        icon={MessageCircle}
        title="Campaign Ops Chats (legacy fallback)"
        badge={!campaignsLoading ? <CountChip n={campaigns.filter(c => c.tg_ops_group_id).length} total={campaigns.length} /> : null}
        subtitle={(
          <>Per-campaign fallback chat. Used only when the global Submission-Progress Alert destination above is empty. Going forward, leave this blank and configure the single global chat instead.</>
        )}
      >
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
      </CollapsibleSection>

      {/* ─── Content Review Channel section [2026-06-12] ─── */}
      <ContentReviewChannelSection />

      {/* ─── Lineup Proposals Channel section [2026-06-19] ─── */}
      <LineupProposalChannelSection />

      {/* ─── Confirmed Lineups Channel section [2026-06-26] ─── */}
      <LineupConfirmedChannelSection />
    </div>
  );
}

/**
 * LineupProposalChannelSection — picker for the global lineup-proposals
 * broadcast chat. When a lineup is proposed, the existing approver DMs
 * still fire AND a copy of the same message is posted to this chat for
 * team-wide visibility. Writes to app_settings.lineup_proposal_chat_id
 * + lineup_proposal_chat_thread_id. Per Andy 2026-06-19.
 */
function LineupProposalChannelSection() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedChatId, setSavedChatId] = useState<string>('');
  const [savedThreadId, setSavedThreadId] = useState<string>('');
  const [chatId, setChatId] = useState<string>('');
  const [threadId, setThreadId] = useState<string>('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [chatSetting, threadSetting] = await Promise.all([
          (supabase as any).from('app_settings').select('value').eq('key', 'lineup_proposal_chat_id').maybeSingle(),
          (supabase as any).from('app_settings').select('value').eq('key', 'lineup_proposal_chat_thread_id').maybeSingle(),
        ]);
        const c = (chatSetting.data as any)?.value ?? '';
        const t = (threadSetting.data as any)?.value ?? '';
        setSavedChatId(c);
        setSavedThreadId(t);
        setChatId(c);
        setThreadId(t);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isDirty = chatId !== savedChatId || threadId !== savedThreadId;

  async function handleSave() {
    setSaving(true);
    try {
      await (supabase as any)
        .from('app_settings')
        .upsert({ key: 'lineup_proposal_chat_id', value: chatId || null }, { onConflict: 'key' });
      await (supabase as any)
        .from('app_settings')
        .upsert({ key: 'lineup_proposal_chat_thread_id', value: threadId || null }, { onConflict: 'key' });
      setSavedChatId(chatId);
      setSavedThreadId(threadId);
      toast({
        title: chatId ? 'Lineup proposal destination saved' : 'Channel cleared',
        description: chatId
          ? threadId ? 'Proposals will also post in this topic.' : 'Proposals will also post in this chat.'
          : 'Proposals will only DM approvers until set.',
      });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <CollapsibleSection
      icon={ClipboardList}
      title="Lineup Proposal Channel"
      badge={!loading
        ? (savedChatId
            ? <StatusBadge tone="success" size="sm"><span className="inline-flex items-center gap-1"><Check className="h-2.5 w-2.5" />Set</span></StatusBadge>
            : <StatusBadge tone="neutral" size="sm">Optional</StatusBadge>)
        : null}
      subtitle={(
        <>Optional shared chat that receives a copy of every <code className="bg-cream-100 px-1 rounded text-[10px]">proposed</code> lineup notification. Approvers still get their DMs — this is for team-wide visibility. Pick a chat (or a specific forum topic inside it). Leave empty to only DM approvers.</>
      )}
    >
      <Card className="border-cream-200">
        <CardContent className="p-4 space-y-4">
          {loading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <>
              <ChatThreadPicker
                chatId={chatId}
                threadId={threadId}
                onChange={({ chatId: nextChat, threadId: nextThread }) => {
                  setChatId(nextChat);
                  setThreadId(nextThread);
                }}
                label="Broadcast destination"
                disabled={saving}
              />
              <div className="flex items-center justify-end gap-2">
                <Button variant="brand" size="sm" onClick={handleSave} disabled={saving || !isDirty}>
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </CollapsibleSection>
  );
}

/**
 * LineupConfirmedChannelSection — global destination for the formatted
 * post that fires when a lineup is confirmed. Replaces the legacy
 * per-campaign `campaigns.tg_ops_group_id` routing as of 2026-06-26:
 * confirm is an internal team coordination milestone, so the post
 * goes to one shared chat instead of fanning into each client's ops
 * chat. Writes to app_settings.lineup_confirmed_chat_id +
 * lineup_confirmed_chat_thread_id; the notify route falls back to the
 * per-campaign chat only when this is unset.
 */
function LineupConfirmedChannelSection() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedChatId, setSavedChatId] = useState<string>('');
  const [savedThreadId, setSavedThreadId] = useState<string>('');
  const [chatId, setChatId] = useState<string>('');
  const [threadId, setThreadId] = useState<string>('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [chatSetting, threadSetting] = await Promise.all([
          (supabase as any).from('app_settings').select('value').eq('key', 'lineup_confirmed_chat_id').maybeSingle(),
          (supabase as any).from('app_settings').select('value').eq('key', 'lineup_confirmed_chat_thread_id').maybeSingle(),
        ]);
        const c = (chatSetting.data as any)?.value ?? '';
        const t = (threadSetting.data as any)?.value ?? '';
        setSavedChatId(c);
        setSavedThreadId(t);
        setChatId(c);
        setThreadId(t);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isDirty = chatId !== savedChatId || threadId !== savedThreadId;

  async function handleSave() {
    setSaving(true);
    try {
      await (supabase as any)
        .from('app_settings')
        .upsert({ key: 'lineup_confirmed_chat_id', value: chatId || null }, { onConflict: 'key' });
      await (supabase as any)
        .from('app_settings')
        .upsert({ key: 'lineup_confirmed_chat_thread_id', value: threadId || null }, { onConflict: 'key' });
      setSavedChatId(chatId);
      setSavedThreadId(threadId);
      toast({
        title: chatId ? 'Confirmed lineup destination saved' : 'Channel cleared',
        description: chatId
          ? threadId ? 'Confirmed lineups will post in this topic.' : 'Confirmed lineups will post in this chat.'
          : 'Confirmed lineups will fall back to per-campaign tg_ops_group_id.',
      });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <CollapsibleSection
      icon={CheckCircle2}
      title="Confirmed Lineup Channel"
      badge={!loading
        ? (savedChatId
            ? <StatusBadge tone="success" size="sm"><span className="inline-flex items-center gap-1"><Check className="h-2.5 w-2.5" />Set</span></StatusBadge>
            : <StatusBadge tone="warning" size="sm">Fallback</StatusBadge>)
        : null}
      subtitle={(
        <>Global chat that receives the formatted post when a lineup is <code className="bg-cream-100 px-1 rounded text-[10px]">confirmed</code>. Replaces the legacy per-campaign client ops chat — confirm is an internal team milestone, so one shared feed beats fanning into each client&apos;s chat. Leave empty to fall back to <code className="bg-cream-100 px-1 rounded text-[10px]">campaigns.tg_ops_group_id</code>.</>
      )}
    >
      <Card className="border-cream-200">
        <CardContent className="p-4 space-y-4">
          {loading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <>
              <ChatThreadPicker
                chatId={chatId}
                threadId={threadId}
                onChange={({ chatId: nextChat, threadId: nextThread }) => {
                  setChatId(nextChat);
                  setThreadId(nextThread);
                }}
                label="Confirmed-lineup destination"
                disabled={saving}
              />
              <div className="flex items-center justify-end gap-2">
                <Button variant="brand" size="sm" onClick={handleSave} disabled={saving || !isDirty}>
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </CollapsibleSection>
  );
}

/**
 * SubmissionProgressChannelSection — picker for the global destination of
 * the post-live Submission-Progress Alert ("X just posted, N live this
 * week"). Replaces the per-campaign `campaigns.tg_ops_group_id` routing
 * as of 2026-06-30: every alert now lands in one shared chat, matching
 * the other team-wide sections (proposals, confirmed lineups, review).
 * Writes to app_settings.spa_chat_id + spa_chat_thread_id; the webhook
 * falls back to per-campaign tg_ops_group_id only when this is unset.
 */
function SubmissionProgressChannelSection() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedChatId, setSavedChatId] = useState<string>('');
  const [savedThreadId, setSavedThreadId] = useState<string>('');
  const [chatId, setChatId] = useState<string>('');
  const [threadId, setThreadId] = useState<string>('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [chatSetting, threadSetting] = await Promise.all([
          (supabase as any).from('app_settings').select('value').eq('key', 'spa_chat_id').maybeSingle(),
          (supabase as any).from('app_settings').select('value').eq('key', 'spa_chat_thread_id').maybeSingle(),
        ]);
        const c = (chatSetting.data as any)?.value ?? '';
        const t = (threadSetting.data as any)?.value ?? '';
        setSavedChatId(c);
        setSavedThreadId(t);
        setChatId(c);
        setThreadId(t);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isDirty = chatId !== savedChatId || threadId !== savedThreadId;

  async function handleSave() {
    setSaving(true);
    try {
      await (supabase as any)
        .from('app_settings')
        .upsert({ key: 'spa_chat_id', value: chatId || null }, { onConflict: 'key' });
      await (supabase as any)
        .from('app_settings')
        .upsert({ key: 'spa_chat_thread_id', value: threadId || null }, { onConflict: 'key' });
      setSavedChatId(chatId);
      setSavedThreadId(threadId);
      toast({
        title: chatId ? 'Submission-Progress destination saved' : 'Channel cleared',
        description: chatId
          ? threadId ? 'Post-live alerts will fire in this topic.' : 'Post-live alerts will fire in this chat.'
          : 'Post-live alerts will fall back to the per-campaign tg_ops_group_id.',
      });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <CollapsibleSection
      icon={Activity}
      title="Submission-Progress Alert Channel"
      badge={!loading
        ? (savedChatId
            ? <StatusBadge tone="success" size="sm"><span className="inline-flex items-center gap-1"><Check className="h-2.5 w-2.5" />Set</span></StatusBadge>
            : <StatusBadge tone="warning" size="sm">Fallback</StatusBadge>)
        : null}
      subtitle={(
        <>Global chat that receives the post-live alert after every approved <code className="bg-cream-100 px-1 rounded text-[10px]">/submit</code> ("X just posted, N live this week"). Replaces the legacy per-campaign client ops chat — every campaign&apos;s alerts now feed one shared team channel. Leave empty to fall back to <code className="bg-cream-100 px-1 rounded text-[10px]">campaigns.tg_ops_group_id</code>.</>
      )}
    >
      <Card className="border-cream-200">
        <CardContent className="p-4 space-y-4">
          {loading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <>
              <ChatThreadPicker
                chatId={chatId}
                threadId={threadId}
                onChange={({ chatId: nextChat, threadId: nextThread }) => {
                  setChatId(nextChat);
                  setThreadId(nextThread);
                }}
                label="Submission-Progress destination"
                disabled={saving}
              />
              <div className="flex items-center justify-end gap-2">
                <Button variant="brand" size="sm" onClick={handleSave} disabled={saving || !isDirty}>
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </CollapsibleSection>
  );
}

/**
 * ContentReviewChannelSection — picker for the central KOL /submit review
 * queue. Uses the shared ChatThreadPicker (chat + optional forum topic).
 * Writes to app_settings.content_submissions_channel_id +
 * content_submissions_channel_thread_id.
 */
function ContentReviewChannelSection() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedChatId, setSavedChatId] = useState<string>('');
  const [savedThreadId, setSavedThreadId] = useState<string>('');
  const [chatId, setChatId] = useState<string>('');
  const [threadId, setThreadId] = useState<string>('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [chatSetting, threadSetting] = await Promise.all([
          (supabase as any).from('app_settings').select('value').eq('key', 'content_submissions_channel_id').maybeSingle(),
          (supabase as any).from('app_settings').select('value').eq('key', 'content_submissions_channel_thread_id').maybeSingle(),
        ]);
        const c = (chatSetting.data as any)?.value ?? '';
        const t = (threadSetting.data as any)?.value ?? '';
        setSavedChatId(c);
        setSavedThreadId(t);
        setChatId(c);
        setThreadId(t);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isDirty = chatId !== savedChatId || threadId !== savedThreadId;

  async function handleSave() {
    setSaving(true);
    try {
      await (supabase as any)
        .from('app_settings')
        .upsert({ key: 'content_submissions_channel_id', value: chatId || null }, { onConflict: 'key' });
      await (supabase as any)
        .from('app_settings')
        .upsert({ key: 'content_submissions_channel_thread_id', value: threadId || null }, { onConflict: 'key' });
      setSavedChatId(chatId);
      setSavedThreadId(threadId);
      toast({
        title: chatId ? 'Content review destination saved' : 'Channel cleared',
        description: chatId
          ? threadId ? 'Submissions will post in this topic.' : 'Submissions will post in this chat.'
          : 'Forwards are suppressed silently until set.',
      });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <CollapsibleSection
      icon={MessagesSquare}
      title="Content Review Channel"
      badge={!loading
        ? (savedChatId
            ? <StatusBadge tone="success" size="sm"><span className="inline-flex items-center gap-1"><Check className="h-2.5 w-2.5" />Set</span></StatusBadge>
            : <StatusBadge tone="warning" size="sm"><span className="inline-flex items-center gap-1"><AlertTriangle className="h-2.5 w-2.5" />Unset</span></StatusBadge>)
        : null}
      subtitle={(
        <>Central TG channel where KOL <code className="bg-cream-100 px-1 rounded text-[10px]">/submit</code> forwards land with Approve/Reject buttons. Per the TG Bot Content Submission spec — one channel for the whole team, not per-campaign. Pick a chat (or a specific forum topic inside it). Approve/Reject reply goes back to the KOL&apos;s per-KOL group chat.</>
      )}
    >
      <Card className="border-cream-200">
        <CardContent className="p-4 space-y-4">
          {loading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <>
              {!savedChatId && (
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge tone="warning" size="sm">
                    <span className="inline-flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Not configured
                    </span>
                  </StatusBadge>
                  <span className="text-xs text-ink-warm-500">
                    /submit forwards are suppressed silently until set.
                  </span>
                </div>
              )}
              <ChatThreadPicker
                chatId={chatId}
                threadId={threadId}
                onChange={({ chatId: nextChat, threadId: nextThread }) => {
                  setChatId(nextChat);
                  setThreadId(nextThread);
                }}
                label="Review destination"
                disabled={saving}
              />
              <div className="flex items-center justify-end gap-2">
                <Button variant="brand" size="sm" onClick={handleSave} disabled={saving || !isDirty}>
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </CollapsibleSection>
  );
}

// ─── Collapsible section wrapper + small count chip ──────────────────

/**
 * Per Andy 2026-06-12: Telegram Comm sections start collapsed so the
 * page lands clean. Click the header to toggle. The badge (count chip
 * or status pill) stays visible while collapsed so you can see at a
 * glance how many approvers/campaigns are configured.
 */
function CollapsibleSection({
  icon: Icon,
  title,
  subtitle,
  badge,
  defaultOpen = false,
  children,
}: {
  icon: any;
  title: string;
  subtitle?: ReactNode;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 -mx-2 px-2 py-1.5 rounded-md hover:bg-cream-50/60 transition-colors group"
      >
        <ChevronRight className={`h-4 w-4 text-ink-warm-400 transition-transform ${open ? 'rotate-90' : ''}`} />
        <Icon className="h-4 w-4 text-brand" />
        <h3 className="text-sm font-semibold text-ink-warm-900">{title}</h3>
        {badge && <span className="ml-1">{badge}</span>}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {subtitle && <p className="text-xs text-ink-warm-500">{subtitle}</p>}
          {children}
        </div>
      )}
    </section>
  );
}

/** Small N or N/total chip for collapsed-section glance state. */
function CountChip({ n, total }: { n: number; total?: number }) {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-light text-brand font-semibold tabular-nums">
      {total !== undefined ? `${n}/${total}` : n}
    </span>
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
