'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Settings as SettingsIcon, Search, MessageSquare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * /dashboard/settings — chat tagging for the Priority Dashboard analyzer.
 *
 * Lists every Telegram chat the bot has tracked. Each row has a
 * dashboard_role selector (Ops / Client / Team Personal / —). Tagged
 * chats feed the LLM analyzer; untagged chats are ignored.
 *
 * Why this lives here instead of /crm/telegram: that page is a 1000+
 * line management surface for the whole CRM-Telegram integration.
 * Adding a column to it would be invasive. This page is dashboard-
 * specific and surfaces the recent-message count so the operator can
 * tell at a glance which chats are worth tagging.
 */

type DashboardRole = 'ops' | 'client' | 'team_personal' | null;

type ChatRow = {
  id: string;
  chat_id: string;
  title: string | null;
  chat_type: string | null;
  dashboard_role: DashboardRole;
  opportunity_id: string | null;
  master_kol_id: string | null;
  last_message_at: string | null;
  message_count: number;
  recent_message_count: number;
};

const ROLE_LABELS: Record<string, string> = {
  ops:           'Ops (internal coord)',
  client:        'Client chat',
  team_personal: 'Team personal DM',
};

const ROLE_TONES: Record<string, string> = {
  ops:           'bg-amber-100 text-amber-800',
  client:        'bg-sky-100 text-sky-800',
  team_personal: 'bg-purple-100 text-purple-800',
};

export default function DashboardSettingsPage() {
  const { toast } = useToast();
  const [chats, setChats] = useState<ChatRow[] | null>(null);
  const [search, setSearch] = useState('');
  const [savingChatId, setSavingChatId] = useState<string | null>(null);

  const fetchChats = async () => {
    try {
      const res = await fetch('/api/dashboard/chats');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setChats(json.chats);
    } catch (err: any) {
      toast({ title: 'Failed to load chats', description: err?.message, variant: 'destructive' });
    }
  };

  useEffect(() => { fetchChats(); }, []);

  const updateRole = async (chat: ChatRow, role: DashboardRole) => {
    setSavingChatId(chat.chat_id);
    // Optimistic
    setChats(prev => prev?.map(c => c.chat_id === chat.chat_id ? { ...c, dashboard_role: role } : c) ?? null);
    try {
      const res = await fetch('/api/dashboard/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat.chat_id, dashboard_role: role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
      fetchChats(); // revert
    } finally {
      setSavingChatId(null);
    }
  };

  const filtered = useMemo(() => {
    if (!chats) return null;
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter(c =>
      (c.title?.toLowerCase().includes(q) ?? false) ||
      c.chat_id.includes(q),
    );
  }, [chats, search]);

  const counts = useMemo(() => {
    if (!chats) return null;
    return {
      total: chats.length,
      ops: chats.filter(c => c.dashboard_role === 'ops').length,
      client: chats.filter(c => c.dashboard_role === 'client').length,
      team_personal: chats.filter(c => c.dashboard_role === 'team_personal').length,
    };
  }, [chats]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 h-8">
          <Link href="/dashboard">
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
            Back to dashboard
          </Link>
        </Button>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-brand" />
          Dashboard Settings
        </h2>
        <p className="text-gray-600 text-sm mt-0.5">
          Tag which Telegram chats feed the weekly LLM analyzer. Untagged chats are ignored.
        </p>
      </div>

      {/* Counts */}
      {counts && (
        <div className="flex items-center gap-3 flex-wrap text-sm">
          <Badge variant="secondary" className="bg-gray-100 text-gray-700">{counts.total} total</Badge>
          <Badge variant="secondary" className="bg-amber-100 text-amber-800">{counts.ops} Ops</Badge>
          <Badge variant="secondary" className="bg-sky-100 text-sky-800">{counts.client} Client</Badge>
          <Badge variant="secondary" className="bg-purple-100 text-purple-800">{counts.team_personal} Team</Badge>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by chat title or ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10 focus-brand"
        />
      </div>

      {/* Chat list */}
      {!filtered ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={search ? 'No chats match your search.' : 'No Telegram chats tracked yet.'}
          description={search ? undefined : 'Add the bot to your team chats to populate this list.'}
        />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80 text-xs text-gray-500 uppercase tracking-wider">
                <th className="text-left py-2 px-4 font-semibold">Chat</th>
                <th className="text-left py-2 px-4 font-semibold w-24">Type</th>
                <th className="text-right py-2 px-4 font-semibold w-32">Last 7d msgs</th>
                <th className="text-left py-2 px-4 font-semibold w-56">Dashboard role</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(chat => (
                <tr key={chat.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                  <td className="py-3 px-4">
                    <p className="font-medium text-gray-900 truncate max-w-md">
                      {chat.title || <span className="text-gray-400 italic">(untitled)</span>}
                    </p>
                    <p className="text-[11px] text-gray-400 font-mono">{chat.chat_id}</p>
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant="secondary" className="text-[10px] capitalize">
                      {chat.chat_type || '?'}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className={`text-sm tabular-nums ${chat.recent_message_count > 0 ? 'font-semibold text-gray-900' : 'text-gray-300'}`}>
                      {chat.recent_message_count}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <Select
                      value={chat.dashboard_role ?? 'none'}
                      onValueChange={(v) => updateRole(chat, v === 'none' ? null : v as DashboardRole)}
                      disabled={savingChatId === chat.chat_id}
                    >
                      <SelectTrigger className="h-8 text-xs w-[180px] focus-brand">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none"><span className="text-gray-400">— Untagged</span></SelectItem>
                        <SelectItem value="ops">{ROLE_LABELS.ops}</SelectItem>
                        <SelectItem value="client">{ROLE_LABELS.client}</SelectItem>
                        <SelectItem value="team_personal">{ROLE_LABELS.team_personal}</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Inline help */}
      <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-xs text-gray-600 max-w-2xl space-y-1.5">
        <p className="font-semibold text-gray-700">How tagging works</p>
        <p>
          <span className="font-semibold">Ops</span> — internal team coordination chat. The analyzer reads this
          for cross-team signals, initiative status, and overall company direction.
        </p>
        <p>
          <span className="font-semibold">Client</span> — a per-client group chat. Used for &quot;Client Health&quot; rows
          (phase, this-week status). Should already be linked to an opportunity or KOL.
        </p>
        <p>
          <span className="font-semibold">Team personal</span> — a team member&apos;s DM with the bot. Used for
          self-report follow-ups (Session 3).
        </p>
        <p className="pt-1 text-gray-500">
          The Sunday-evening DM cron and Monday refresh use these tags to know which chats to read.
          Re-tagging takes effect on the next refresh.
        </p>
      </div>
    </div>
  );
}
