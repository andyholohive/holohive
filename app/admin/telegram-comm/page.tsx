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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Search, Check, AlertTriangle, MessageCircle, Save, UserCheck,
  ExternalLink, Plus, X, MessagesSquare, ChevronRight, ClipboardList,
  CheckCircle2, Activity, AlarmClock, Clock, Sunrise, Radio, Newspaper, Send,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ChatThreadPicker } from '@/components/telegram/ChatThreadPicker';
import { MessageTemplateEditor } from '@/components/telegram/MessageTemplateEditor';

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
          <>A reference list of who signs off on proposed lineups. Proposals now post to the lineup channel below instead of DMing approvers individually.</>
        )}
      >
        <WhenItSends>
          Nothing auto-sends from this list. On propose, the lineup posts to
          the proposal channel (configured below) — approvers are no longer
          DM&#39;d individually. This is just a reference of who signs off.
        </WhenItSends>

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
                      {approvers.length} approver{approvers.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="border-cream-200">
          <CardContent className="p-4">
            <MessageTemplateEditor settingKey="tmpl_lineup_proposed_dm" label="Approver DM message" />
          </CardContent>
        </Card>
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
        <WhenItSends>
          Nothing directly — this is a fallback destination. The
          Submission-Progress Alert and Confirmed Lineup posts land here
          only when their global channels are unset.
        </WhenItSends>
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

      {/* ─── Lineup Deadline Reminders section [2026-07-06] ─── */}
      <LineupReminderChannelSection />

      {/* ─── Weekly Content Recap section [2026-07-13] ─── */}
      <WeeklyContentRecapChannelSection />

      {/* ─── New KOL Join & Scan Prompt section [2026-07-06] ─── */}
      <NewKolAlertChannelSection />

      {/* ─── Daily Pulse section [2026-07-09] ─── */}
      <DailyPulseChannelSection />

      {/* ─── KR Signal Bot section [2026-07-10] ─── */}
      <KrSignalClientsSection />
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
          ? threadId ? 'Proposals will post in this topic.' : 'Proposals will post in this chat.'
          : 'Proposals won’t post anywhere until a channel is set.',
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
        <>The chat that receives every <code className="bg-cream-100 px-1 rounded text-[10px]">proposed</code> lineup — this is now the only place proposals are posted (no more approver DMs). Pick a chat (or a specific forum topic inside it). If empty, proposals won&#39;t post anywhere.</>
      )}
    >
      <WhenItSends>
        Instantly when a lineup is proposed — a copy of the proposal
        notification posts here alongside the approver DMs.
      </WhenItSends>
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
      <Card className="border-cream-200">
        <CardContent className="p-4">
          <MessageTemplateEditor settingKey="tmpl_lineup_proposed_broadcast" label="Broadcast message" />
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
      <WhenItSends>
        Instantly when a proposed lineup is approved (confirmed) — the
        full lineup roster posts here.
      </WhenItSends>
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
      <Card className="border-cream-200">
        <CardContent className="p-4">
          <MessageTemplateEditor settingKey="tmpl_lineup_confirmed_header" label="Post header line" />
        </CardContent>
      </Card>
    </CollapsibleSection>
  );
}

/**
 * WeeklyContentRecapChannelSection — per-CLIENT routing for the Monday
 * 12:00 UTC "«Campaign» Weekly Content Recap" post (per Andy 2026-07-13).
 *
 * Each campaign's recap goes to its client's chat (the chat linked to the
 * client in /crm/telegram). This section lets you set a per-client
 * OVERRIDE chat — when set, that client's recaps post there instead of
 * the /crm/telegram default. Overrides are stored as a JSON map
 * { <client_id>: { chat_id, thread_id } } under
 * app_settings.weekly_recap_client_overrides.
 */
type RecapOverride = { chat_id: string; thread_id: string };
function WeeklyContentRecapChannelSection() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Array<{ id: string; name: string; defaultChat: string | null }>>([]);
  const [saved, setSaved] = useState<Record<string, RecapOverride>>({});
  const [draft, setDraft] = useState<Record<string, RecapOverride>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [clientsRes, overrideRes] = await Promise.all([
          (supabase as any).from('clients').select('id, name, is_active, is_ad_hoc').eq('is_active', true).order('name'),
          (supabase as any).from('app_settings').select('value').eq('key', 'weekly_recap_client_overrides').maybeSingle(),
        ]);
        const allActive = ((clientsRes.data as any[]) ?? []);

        // Restrict to the same "Active" bucket the /clients cards show:
        // is_active && !is_ad_hoc && covered_through >= today (else it's
        // Ad-hoc / Paused / Inactive). covered_through is the max stint
        // coverage from the client_coverage view [Andy 2026-07-15].
        const today = new Date().toISOString().slice(0, 10);
        const coveredByClient = new Map<string, string>();
        if (allActive.length > 0) {
          const { data: cov } = await (supabase as any)
            .from('client_coverage')
            .select('client_id, covered_through')
            .in('client_id', allActive.map((c: any) => c.id));
          for (const row of ((cov as any[]) ?? [])) {
            if (!row.covered_through) continue;
            const prev = coveredByClient.get(row.client_id);
            if (!prev || row.covered_through > prev) coveredByClient.set(row.client_id, row.covered_through);
          }
        }
        const clientRows = allActive.filter((c: any) => {
          if (c.is_ad_hoc) return false;
          const covered = coveredByClient.get(c.id) ?? null;
          return !!covered && covered >= today;
        });
        const clientIds = clientRows.map((c: any) => c.id);

        // Default per-client chat title (client-facing GC from /crm/telegram)
        // so the user can see what happens without an override.
        const chatByClient = new Map<string, string>();
        if (clientIds.length > 0) {
          const { data: chats } = await (supabase as any)
            .from('telegram_chats')
            .select('title, client_id, is_internal, is_hidden, last_message_at')
            .in('client_id', clientIds)
            .or('is_hidden.is.null,is_hidden.eq.false');
          for (const id of clientIds) {
            const cands = ((chats as any[]) ?? []).filter(x => x.client_id === id);
            cands.sort((a, b) => {
              const ai = a.is_internal ? 1 : 0, bi = b.is_internal ? 1 : 0;
              if (ai !== bi) return ai - bi;
              const at = a.last_message_at ? Date.parse(a.last_message_at) : 0;
              const bt = b.last_message_at ? Date.parse(b.last_message_at) : 0;
              return bt - at;
            });
            if (cands[0]?.title) chatByClient.set(id, cands[0].title);
          }
        }

        setClients(clientRows.map(c => ({ id: c.id, name: c.name, defaultChat: chatByClient.get(c.id) ?? null })));

        let parsed: Record<string, RecapOverride> = {};
        try { parsed = JSON.parse(((overrideRes.data as any)?.value as string) || '{}') || {}; } catch { parsed = {}; }
        // Normalize to {chat_id, thread_id} strings.
        const norm: Record<string, RecapOverride> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (v && (v as any).chat_id) norm[k] = { chat_id: String((v as any).chat_id), thread_id: (v as any).thread_id ? String((v as any).thread_id) : '' };
        }
        setSaved(norm);
        setDraft(norm);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const overrideCount = Object.keys(saved).length;

  function setOverride(clientId: string, chatId: string, threadId: string) {
    setDraft(prev => {
      const next = { ...prev };
      if (chatId) next[clientId] = { chat_id: chatId, thread_id: threadId || '' };
      else delete next[clientId]; // clearing the chat removes the override
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Drop empties before persisting.
      const clean: Record<string, RecapOverride> = {};
      for (const [k, v] of Object.entries(draft)) if (v.chat_id) clean[k] = v;
      await (supabase as any)
        .from('app_settings')
        .upsert({ key: 'weekly_recap_client_overrides', value: JSON.stringify(clean) }, { onConflict: 'key' });
      setSaved(clean);
      setDraft(clean);
      toast({
        title: 'Recap routing saved',
        description: Object.keys(clean).length > 0
          ? `${Object.keys(clean).length} client override(s) active; the rest use their /crm/telegram chat.`
          : 'All recaps route to each client’s /crm/telegram chat.',
      });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <CollapsibleSection
      icon={Newspaper}
      title="Weekly Content Recap"
      badge={!loading
        ? (overrideCount > 0
            ? <StatusBadge tone="brand" size="sm"><span className="inline-flex items-center gap-1"><Check className="h-2.5 w-2.5" />{overrideCount} override{overrideCount === 1 ? '' : 's'}</span></StatusBadge>
            : <StatusBadge tone="neutral" size="sm">Per-client</StatusBadge>)
        : null}
      subtitle={(
        <>The <b>&ldquo;Weekly Content Recap&rdquo;</b> post — per campaign whose just-ended week had posted content, grouped by angle, each KOL linked to their content. It routes to each <b>client&rsquo;s chat</b> (linked in <code className="bg-cream-100 px-1 rounded text-[10px]">/crm/telegram</code>). Set a per-client <b>override</b> below to send that client&rsquo;s recaps somewhere else.</>
      )}
    >
      <WhenItSends>
        Every Monday 12:00 UTC — recaps the week that just ended.
      </WhenItSends>
      <Card className="border-cream-200">
        <CardContent className="p-4 space-y-4">
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : clients.length === 0 ? (
            <p className="text-sm text-ink-warm-500">No active clients.</p>
          ) : (
            <>
              <div className="space-y-4">
                {clients.map(c => (
                  <div key={c.id} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-ink-warm-900">{c.name}</span>
                      <span className="text-[11px] text-ink-warm-400">
                        {draft[c.id]?.chat_id
                          ? 'Override set'
                          : c.defaultChat
                            ? <>Default: {c.defaultChat}</>
                            : 'No /crm/telegram chat linked'}
                      </span>
                    </div>
                    <ChatThreadPicker
                      chatId={draft[c.id]?.chat_id || ''}
                      threadId={draft[c.id]?.thread_id || ''}
                      onChange={({ chatId: nextChat, threadId: nextThread }) => setOverride(c.id, nextChat, nextThread)}
                      label={`Override for ${c.name} (optional)`}
                      disabled={saving}
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button variant="brand" size="sm" onClick={handleSave} disabled={saving || !isDirty}>
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <Card className="border-cream-200">
        <CardContent className="p-4">
          <MessageTemplateEditor settingKey="tmpl_weekly_content_recap_header" label="Recap header line" />
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
/**
 * NewKolAlertChannelSection — destination for the "new KOL added" DM.
 * When a KOL first gets its Telegram channel link on /kols, the bot posts
 * here with the channel link + a "✅ Joined — Scan now" button so someone
 * can join the channel then trigger the niche/score scan. Writes to
 * app_settings.kol_new_alert_chat_id + kol_new_alert_chat_thread_id; the
 * /api/kols/[id]/notify-join route falls back to TELEGRAM_TERMINAL_CHAT_ID
 * when this is unset. 2026-07-06.
 */
function NewKolAlertChannelSection() {
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
          (supabase as any).from('app_settings').select('value').eq('key', 'kol_new_alert_chat_id').maybeSingle(),
          (supabase as any).from('app_settings').select('value').eq('key', 'kol_new_alert_chat_thread_id').maybeSingle(),
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
        .upsert({ key: 'kol_new_alert_chat_id', value: chatId || null }, { onConflict: 'key' });
      await (supabase as any)
        .from('app_settings')
        .upsert({ key: 'kol_new_alert_chat_thread_id', value: threadId || null }, { onConflict: 'key' });
      setSavedChatId(chatId);
      setSavedThreadId(threadId);
      toast({
        title: chatId ? 'New-KOL alert destination saved' : 'Channel cleared',
        description: chatId
          ? threadId ? 'New-KOL join prompts will post in this topic.' : 'New-KOL join prompts will post in this chat.'
          : 'New-KOL join prompts will fall back to the default terminal chat.',
      });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <CollapsibleSection
      icon={UserCheck}
      title="New KOL — Join & Scan Prompt"
      badge={!loading
        ? (savedChatId
            ? <StatusBadge tone="success" size="sm"><span className="inline-flex items-center gap-1"><Check className="h-2.5 w-2.5" />Set</span></StatusBadge>
            : <StatusBadge tone="warning" size="sm">Fallback</StatusBadge>)
        : null}
      subtitle={(
        <>Chat that receives the DM when a new KOL gets its Telegram channel — the channel link plus a <b>✅ Joined — Scan now</b> button. The scanner can only read channels it has joined, so join the channel then tap the button to pull the KOL&apos;s niche + score. Leave empty to fall back to the default <code className="bg-cream-100 px-1 rounded text-[10px]">TELEGRAM_TERMINAL_CHAT_ID</code>.</>
      )}
    >
      <WhenItSends>
        Instantly when a new KOL&apos;s Telegram link is first set on <code className="bg-cream-100 px-1 rounded text-[10px]">/kols</code>.
      </WhenItSends>
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
                label="New-KOL alert destination"
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
      <WhenItSends>
        Instantly when a KOL&apos;s submitted content is approved — the
        post-live progress alert fires here.
      </WhenItSends>
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
      <Card className="border-cream-200">
        <CardContent className="p-4">
          <MessageTemplateEditor settingKey="tmpl_spa_header" label="Alert header" />
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
      <WhenItSends>
        Instantly when a KOL sends <code className="bg-cream-100 px-1 rounded text-[10px]">/submit</code> — the
        review card with Approve/Reject buttons lands here.
      </WhenItSends>
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
      <Card className="border-cream-200">
        <CardContent className="p-4">
          <MessageTemplateEditor settingKey="tmpl_content_review_card" label="Review card message" />
        </CardContent>
      </Card>
    </CollapsibleSection>
  );
}

// ─── "When it sends" info line ────────────────────────────────────────

/**
 * DailyPulseChannelSection — configures the Daily Pulse Bot (DP.2).
 * Two things: the digest destination (ChatThreadPicker → app_settings
 * daily_pulse_digest_chat_id + daily_pulse_digest_thread_id) and the
 * roster of team members DM'd each morning (checkbox list →
 * daily_pulse_roster, a JSON array of user ids). Members with no linked
 * Telegram can't be DM'd, so they're shown disabled.
 */
function DailyPulseChannelSection() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [savedChatId, setSavedChatId] = useState<string>('');
  const [savedThreadId, setSavedThreadId] = useState<string>('');
  const [savedRoster, setSavedRoster] = useState<string[]>([]);
  const [chatId, setChatId] = useState<string>('');
  const [threadId, setThreadId] = useState<string>('');
  const [roster, setRoster] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [chatSetting, threadSetting, rosterSetting, usersRes] = await Promise.all([
          (supabase as any).from('app_settings').select('value').eq('key', 'daily_pulse_digest_chat_id').maybeSingle(),
          (supabase as any).from('app_settings').select('value').eq('key', 'daily_pulse_digest_thread_id').maybeSingle(),
          (supabase as any).from('app_settings').select('value').eq('key', 'daily_pulse_roster').maybeSingle(),
          (supabase as any).from('users').select('id, email, name, telegram_id, telegram_username, role').order('name'),
        ]);
        const c = (chatSetting.data as any)?.value ?? '';
        const t = (threadSetting.data as any)?.value ?? '';
        let r: string[] = [];
        try { const parsed = JSON.parse((rosterSetting.data as any)?.value ?? '[]'); if (Array.isArray(parsed)) r = parsed.map(String); } catch { r = []; }
        setSavedChatId(c); setSavedThreadId(t); setSavedRoster(r);
        setChatId(c); setThreadId(t); setRoster(r);
        setUsers(((usersRes.data as UserRow[]) ?? []));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const rosterDirty = roster.length !== savedRoster.length || roster.some(id => !savedRoster.includes(id));
  const isDirty = chatId !== savedChatId || threadId !== savedThreadId || rosterDirty;
  const toggleMember = (id: string) => setRoster(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  async function handleSave() {
    setSaving(true);
    try {
      await (supabase as any).from('app_settings').upsert({ key: 'daily_pulse_digest_chat_id', value: chatId || null }, { onConflict: 'key' });
      await (supabase as any).from('app_settings').upsert({ key: 'daily_pulse_digest_thread_id', value: threadId || null }, { onConflict: 'key' });
      await (supabase as any).from('app_settings').upsert({ key: 'daily_pulse_roster', value: JSON.stringify(roster) }, { onConflict: 'key' });
      setSavedChatId(chatId); setSavedThreadId(threadId); setSavedRoster(roster);
      toast({ title: 'Daily Pulse saved', description: `${roster.length} member${roster.length === 1 ? '' : 's'} on the roster.` });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const ready = !!savedChatId && savedRoster.length > 0;

  return (
    <CollapsibleSection
      icon={Sunrise}
      title="Daily Pulse"
      badge={!loading
        ? (ready
            ? <StatusBadge tone="success" size="sm"><span className="inline-flex items-center gap-1"><Check className="h-2.5 w-2.5" />Live</span></StatusBadge>
            : <StatusBadge tone="neutral" size="sm">Needs setup</StatusBadge>)
        : null}
      subtitle={(
        <>Morning blocker check-in. Each roster member is DM&#39;d at 06:00 UTC (Fridays also ask for one win); a shared digest posts to this channel at 12:00 UTC. Needs a digest channel and at least one roster member.</>
      )}
    >
      <WhenItSends>
        DMs fire daily at 06:00 UTC. The digest posts once at 12:00 UTC (Mon–Fri).
      </WhenItSends>
      <Card className="border-cream-200">
        <CardContent className="p-4 space-y-4">
          {loading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <>
              <ChatThreadPicker
                chatId={chatId}
                threadId={threadId}
                onChange={({ chatId: nextChat, threadId: nextThread }) => { setChatId(nextChat); setThreadId(nextThread); }}
                label="Digest destination"
                disabled={saving}
              />
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Roster</Label>
                <p className="text-xs text-gray-500 mt-1 mb-2">Team members DM&#39;d each morning. Members with no linked Telegram can&#39;t be added.</p>
                <div className="space-y-1 max-h-64 overflow-y-auto rounded-lg border border-cream-200 p-2">
                  {users.length === 0 ? (
                    <p className="text-xs text-gray-400 px-1 py-2">No team members found.</p>
                  ) : users.map(u => {
                    const linked = !!u.telegram_id;
                    const checked = roster.includes(u.id);
                    return (
                      <label key={u.id} className={`flex items-center gap-2 px-1.5 py-1 rounded ${linked ? 'cursor-pointer hover:bg-cream-50' : 'opacity-50 cursor-not-allowed'}`}>
                        <Checkbox checked={checked} disabled={!linked || saving} onCheckedChange={() => { if (linked) toggleMember(u.id); }} />
                        <span className="text-sm text-ink-warm-800">{u.name || u.email}</span>
                        {u.telegram_username && <span className="text-xs text-gray-400">@{u.telegram_username}</span>}
                        {!linked && <span className="ml-auto text-[10px] text-gray-400">no Telegram</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
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

// ─── KR Signal Bot — per-client chat + feature config ───────────────
// kr_signal_clients is RLS-locked, so this section reads/writes through
// the super-admin /api/admin/kr-signal-clients route (not browser Supabase).

interface KrClient {
  id: string;
  key: string;
  name: string;
  ticker: string;
  kr_listed: boolean;
  telegram_chat_id: string | null;
  telegram_thread_id: string | null;
  features: { weekly_market_report?: boolean; korea_listings_digest?: boolean; client_listing_alert?: boolean };
  is_active: boolean;
  /** §6.4 — CoinGecko ids ranked against for "#N in KR vol share". */
  peer_basket: string[] | null;
  /** §6.5 — SoV source ref; 'hhp:<clients.id>' counts posted HHP content. */
  content_log_source: string | null;
  /** Linked HHP client — drives the default digest chat (its /crm/telegram GC). */
  client_id: string | null;
}

type KrEdit = {
  telegram_chat_id: string;
  telegram_thread_id: string;
  features: KrClient['features'];
  is_active: boolean;
  /** Comma-separated in the input; split/trimmed on save. */
  peer_basket: string;
  content_log_source: string;
};

function KrSignalClientsSection() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<KrClient[]>([]);
  const [edits, setEdits] = useState<Record<string, KrEdit>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  // HHP clients for the content-source picker (§6.5 — SoV counts posted
  // content across the linked client's campaigns).
  const [hhpClients, setHhpClients] = useState<{ id: string; name: string }[]>([]);
  // Default digest chat per linked client (its /crm/telegram GC) — the picker
  // below is an OVERRIDE; when empty the digest falls back to this.
  const [defaultChatByClient, setDefaultChatByClient] = useState<Record<string, { chatId: string; title: string | null }>>({});

  const toEdit = (c: KrClient): KrEdit => ({
    telegram_chat_id: c.telegram_chat_id ?? '',
    telegram_thread_id: c.telegram_thread_id ?? '',
    features: { ...c.features },
    is_active: c.is_active,
    peer_basket: (c.peer_basket ?? []).join(', '),
    content_log_source: c.content_log_source ?? '',
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/admin/kr-signal-clients');
        const json = await res.json();
        const list: KrClient[] = json.clients ?? [];
        setClients(list);
        const e: Record<string, KrEdit> = {};
        for (const c of list) e[c.id] = toEdit(c);
        setEdits(e);

        // Resolve each linked client's default GC (same rule as the Weekly
        // Content Recap) so the picker below can be framed as an override.
        const linkedIds = Array.from(new Set(list.map(c => c.client_id).filter((x): x is string => !!x)));
        if (linkedIds.length > 0) {
          const { data: chats } = await (supabase as any)
            .from('telegram_chats')
            .select('chat_id, title, client_id, is_internal, is_hidden, last_message_at')
            .in('client_id', linkedIds)
            .or('is_hidden.is.null,is_hidden.eq.false');
          const byClient: Record<string, { chatId: string; title: string | null }> = {};
          for (const cid of linkedIds) {
            const cands = ((chats as any[]) ?? []).filter(x => x.client_id === cid && x.chat_id);
            cands.sort((a, b) => {
              const ai = a.is_internal ? 1 : 0, bi = b.is_internal ? 1 : 0;
              if (ai !== bi) return ai - bi;
              const at = a.last_message_at ? Date.parse(a.last_message_at) : 0;
              const bt = b.last_message_at ? Date.parse(b.last_message_at) : 0;
              return bt - at;
            });
            if (cands[0]?.chat_id) byClient[cid] = { chatId: String(cands[0].chat_id), title: cands[0].title ?? null };
          }
          setDefaultChatByClient(byClient);
        }
      } catch {
        /* leave empty */
      } finally {
        setLoading(false);
      }
    })();
    (async () => {
      const { data } = await supabase.from('clients').select('id, name').eq('is_active', true).order('name');
      setHhpClients(((data as any[]) ?? []).map(r => ({ id: r.id, name: r.name })));
    })();
  }, []);

  const parseBasket = (s: string) => s.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  const dirty = (c: KrClient) => {
    const e = edits[c.id];
    if (!e) return false;
    return (e.telegram_chat_id ?? '') !== (c.telegram_chat_id ?? '')
      || (e.telegram_thread_id ?? '') !== (c.telegram_thread_id ?? '')
      || e.is_active !== c.is_active
      || JSON.stringify(e.features) !== JSON.stringify(c.features)
      || JSON.stringify(parseBasket(e.peer_basket)) !== JSON.stringify(c.peer_basket ?? [])
      || (e.content_log_source ?? '') !== (c.content_log_source ?? '');
  };
  const setEdit = (id: string, patch: Partial<KrEdit>) =>
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  const toggleFeature = (id: string, key: keyof KrClient['features']) =>
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], features: { ...prev[id].features, [key]: !prev[id].features[key] } } }));

  async function handleSave(c: KrClient) {
    const e = edits[c.id];
    if (!e) return;
    setSavingId(c.id);
    try {
      const res = await fetch('/api/admin/kr-signal-clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: c.id,
          telegram_chat_id: e.telegram_chat_id,
          telegram_thread_id: e.telegram_thread_id,
          features: e.features,
          is_active: e.is_active,
          peer_basket: parseBasket(e.peer_basket),
          content_log_source: e.content_log_source,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      const updated: KrClient = json.client;
      setClients(prev => prev.map(x => (x.id === c.id ? updated : x)));
      setEdits(prev => ({ ...prev, [c.id]: toEdit(updated) }));
      toast({ title: `${updated.name} saved`, description: updated.telegram_chat_id ? 'Override set — digests post here.' : (defaultOf(updated) ? 'Override cleared — digests use the client chat.' : 'No override + no client chat — skipped until one is set.') });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  }

  // A client is reachable if it has an override OR a default client chat.
  const defaultOf = (c: KrClient) => (c.client_id ? defaultChatByClient[c.client_id] : undefined);
  const configured = clients.filter(c => c.is_active && (!!c.telegram_chat_id || !!defaultOf(c))).length;

  // Fire a real test ping via the KR Signal bot to the client's resolved chat
  // (override ?? client default) — confirms the bot can actually post there.
  async function handleTest(c: KrClient) {
    setTestingId(c.id);
    try {
      const res = await fetch('/api/admin/kr-signal-clients/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id }),
      });
      const json = await res.json();
      if (json?.ok) {
        toast({ title: `Test sent to ${c.name}`, description: `Posted to the ${json.source === 'override' ? 'override' : 'client default'} chat (${json.chat_id}).` });
      } else {
        toast({ title: `Test failed for ${c.name}`, description: json?.error || 'Unknown error', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Test failed', description: err?.message, variant: 'destructive' });
    } finally {
      setTestingId(null);
    }
  }

  return (
    <CollapsibleSection
      icon={Radio}
      title="KR Signal Bot"
      badge={!loading ? <CountChip n={configured} total={clients.length} /> : null}
      subtitle={<>Client-facing Korea market-intel bot (separate token). Digests default to the client&#39;s linked chat (from <code className="bg-cream-100 px-1 rounded text-[10px]">/crm/telegram</code>); set an <b>override</b> below only to send somewhere else. Clients with no default and no override are skipped.</>}
    >
      <WhenItSends>
        Weekly report posts Sundays 12:00 UTC. Listing alerts + Saturday digest run off the hourly Korea-listings sweep.
      </WhenItSends>
      <Card className="border-cream-200">
        <CardContent className="p-4 space-y-4">
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : clients.length === 0 ? (
            <p className="text-xs text-gray-400">No KR Signal clients configured.</p>
          ) : clients.map(c => {
            const e = edits[c.id];
            if (!e) return null;
            return (
              <div key={c.id} className="rounded-lg border border-cream-200 p-3 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-ink-warm-900">{c.name}</span>
                  <StatusBadge tone="neutral" size="sm">${c.ticker}</StatusBadge>
                  {c.telegram_chat_id
                    ? <StatusBadge tone="brand" size="sm">Override set</StatusBadge>
                    : defaultOf(c)
                      ? <StatusBadge tone="success" size="sm">Default chat</StatusBadge>
                      : <StatusBadge tone="warning" size="sm">No chat</StatusBadge>}
                </div>
                <ChatThreadPicker
                  chatId={e.telegram_chat_id}
                  threadId={e.telegram_thread_id}
                  onChange={({ chatId: nextChat, threadId: nextThread }) => setEdit(c.id, { telegram_chat_id: nextChat, telegram_thread_id: nextThread })}
                  label="Override chat (optional)"
                  disabled={savingId === c.id}
                />
                <p className="text-[11px] text-ink-warm-500 -mt-1">
                  {e.telegram_chat_id
                    ? 'Override active — digests post here instead of the client chat.'
                    : defaultOf(c)
                      ? <>Defaults to <b>{defaultOf(c)!.title || defaultOf(c)!.chatId}</b> (the client&#39;s linked chat). Set an override only to redirect.</>
                      : 'No client chat linked in /crm/telegram — set an override here, or link one there.'}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {(([
                    ['weekly_market_report', 'Weekly report'],
                    ['korea_listings_digest', 'Listings digest'],
                    ['client_listing_alert', 'Listing alert'],
                  ]) as [keyof KrClient['features'], string][]).map(([fk, flabel]) => (
                    <label key={fk} className="flex items-center gap-1.5 cursor-pointer">
                      <Checkbox checked={!!e.features[fk]} disabled={savingId === c.id} onCheckedChange={() => toggleFeature(c.id, fk)} />
                      <span className="text-xs text-ink-warm-800">{flabel}</span>
                    </label>
                  ))}
                </div>
                {/* §6.4 peer basket + §6.5 SoV source — the weekly report's
                    "Holo Hive Signal" lines render flat/#1 until these are set. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-ink-warm-600">Peer basket · CoinGecko ids, comma-separated</Label>
                    <Input
                      value={e.peer_basket}
                      onChange={(ev) => setEdit(c.id, { peer_basket: ev.target.value })}
                      placeholder="virtuals-protocol, ai16z, freysa-ai"
                      className="h-9 focus-brand"
                      disabled={savingId === c.id}
                    />
                    <p className="text-[11px] text-ink-warm-500">Ranks ${c.ticker} vs these tokens on KR vol share (&quot;#N in KR vol share&quot; line).</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-ink-warm-600">Content source · for KR share-of-voice</Label>
                    <Select
                      value={/^hhp:/.test(e.content_log_source) ? e.content_log_source : e.content_log_source ? '__custom__' : '__none__'}
                      onValueChange={(v) => setEdit(c.id, { content_log_source: v === '__none__' ? '' : v === '__custom__' ? e.content_log_source : v })}
                      disabled={savingId === c.id}
                    >
                      <SelectTrigger className="h-9 focus-brand">
                        <SelectValue placeholder="Not set" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Not set</SelectItem>
                        {e.content_log_source && !/^hhp:/.test(e.content_log_source) && (
                          <SelectItem value="__custom__">Custom: {e.content_log_source}</SelectItem>
                        )}
                        {hhpClients.map(hc => (
                          <SelectItem key={hc.id} value={`hhp:${hc.id}`}>HHP client · {hc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-ink-warm-500">Counts posted HHP content for this client → WoW growth on the SoV line.</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox checked={e.is_active} disabled={savingId === c.id} onCheckedChange={() => setEdit(c.id, { is_active: !e.is_active })} />
                    <span className="text-xs text-ink-warm-600">Active</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTest(c)}
                      disabled={testingId === c.id || savingId === c.id || dirty(c) || (!c.telegram_chat_id && !defaultOf(c))}
                      title={dirty(c) ? 'Save your changes first' : (!c.telegram_chat_id && !defaultOf(c)) ? 'No chat to send to' : 'Send a test ping to the resolved chat'}
                    >
                      <Send className="h-3.5 w-3.5 mr-1.5" />
                      {testingId === c.id ? 'Sending…' : 'Send test'}
                    </Button>
                    <Button variant="brand" size="sm" onClick={() => handleSave(c)} disabled={savingId === c.id || !dirty(c)}>
                      <Save className="h-3.5 w-3.5 mr-1.5" />
                      {savingId === c.id ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </CollapsibleSection>
  );
}

/**
 * Per Andy 2026-07-06: every Telegram Comm section states plainly WHEN
 * its notification fires (event-driven vs cron schedule), so nobody
 * has to reverse-engineer the trigger from the section subtitle.
 */
function WhenItSends({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-1.5 text-[11px] text-ink-warm-600 bg-cream-50 border border-cream-200 rounded-md px-2.5 py-1.5">
      <Clock className="h-3 w-3 mt-0.5 text-brand shrink-0" />
      <span><span className="font-semibold">Sends:</span> {children}</span>
    </div>
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

/**
 * LineupReminderChannelSection — destination for the weekly lineup
 * deadline reminder pings (per Andy 2026-07-06):
 *   Friday 12:00 UTC  — next week's lineup not yet proposed
 *   Monday 12:00 UTC  — this week's lineup not yet approved
 *   Thursday 12:00 UTC — this week's lineup not fully posted
 * Fired by /api/cron/lineup-deadlines. Writes to
 * app_settings.lineup_reminder_chat_id + lineup_reminder_chat_thread_id.
 * When unset the cron skips silently — no pings anywhere.
 */
function LineupReminderChannelSection() {
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
          (supabase as any).from('app_settings').select('value').eq('key', 'lineup_reminder_chat_id').maybeSingle(),
          (supabase as any).from('app_settings').select('value').eq('key', 'lineup_reminder_chat_thread_id').maybeSingle(),
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
        .upsert({ key: 'lineup_reminder_chat_id', value: chatId || null }, { onConflict: 'key' });
      await (supabase as any)
        .from('app_settings')
        .upsert({ key: 'lineup_reminder_chat_thread_id', value: threadId || null }, { onConflict: 'key' });
      setSavedChatId(chatId);
      setSavedThreadId(threadId);
      toast({
        title: chatId ? 'Reminder destination saved' : 'Reminders disabled',
        description: chatId
          ? 'Friday / Monday / Thursday lineup deadline pings will post here.'
          : 'No chat set — the deadline cron will skip silently.',
      });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <CollapsibleSection
      icon={AlarmClock}
      title="Lineup Deadline Reminders"
      badge={!loading
        ? (savedChatId
            ? <StatusBadge tone="success" size="sm"><span className="inline-flex items-center gap-1"><Check className="h-2.5 w-2.5" />Set</span></StatusBadge>
            : <StatusBadge tone="neutral" size="sm">Off</StatusBadge>)
        : null}
      subtitle={(
        <>Weekly deadline pings. Only campaigns with lineup activity in the last 3 weeks are checked. Leave empty to turn the pings off.</>
      )}
    >
      <WhenItSends>
        On a schedule — <code className="bg-cream-100 px-1 rounded text-[10px]">Fri 12:00 UTC</code> if next
        week&apos;s lineup isn&apos;t proposed, <code className="bg-cream-100 px-1 rounded text-[10px]">Mon 12:00 UTC</code> if
        this week&apos;s isn&apos;t approved, <code className="bg-cream-100 px-1 rounded text-[10px]">Thu 12:00 UTC</code> if
        this week&apos;s isn&apos;t fully posted. Quiet when all clear.
      </WhenItSends>
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
                label="Deadline-reminder destination"
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
      <Card className="border-cream-200">
        <CardContent className="p-4 space-y-5">
          <MessageTemplateEditor settingKey="tmpl_lineup_reminder_friday" label="Friday ping (proposal deadline)" />
          <MessageTemplateEditor settingKey="tmpl_lineup_reminder_monday" label="Monday ping (approval deadline)" />
          <MessageTemplateEditor settingKey="tmpl_lineup_reminder_thursday" label="Thursday ping (posting deadline)" />
        </CardContent>
      </Card>
    </CollapsibleSection>
  );
}
