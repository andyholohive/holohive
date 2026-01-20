'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  MessageSquare,
  RefreshCw,
  Copy,
  Link as LinkIcon,
  Unlink,
  Clock,
  Hash,
  CheckCircle,
  Search,
  Check,
  ChevronsUpDown,
  Plus,
  Edit,
  Trash2,
  Terminal,
  ToggleLeft,
  ToggleRight,
  User,
  Users,
  Megaphone
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { CRMOpportunity } from '@/lib/crmService';

interface TelegramChat {
  id: string;
  chat_id: string;
  title: string | null;
  chat_type: string | null;
  member_count: number | null;
  first_seen_at: string;
  last_message_at: string | null;
  message_count: number;
  opportunity_id: string | null;
  master_kol_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  opportunity?: {
    id: string;
    name: string;
    stage: string;
  } | null;
  master_kol?: {
    id: string;
    name: string;
    platform: string[] | null;
  } | null;
}

interface MasterKOL {
  id: string;
  name: string;
  platform: string[] | null;
}

interface TelegramMessage {
  id: string;
  chat_id: string;
  message_id: string;
  from_user_id: string | null;
  from_user_name: string | null;
  from_username: string | null;
  text: string | null;
  message_date: string;
}

interface TelegramCommand {
  id: string;
  command: string;
  response: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  team_only: boolean;
  created_at: string;
  updated_at: string;
}

// Sample data for demo purposes
const SAMPLE_CHATS: TelegramChat[] = [
  {
    id: 'sample-1',
    chat_id: '-1001234567890',
    title: 'Project Alpha Discussion',
    chat_type: 'supergroup',
    member_count: 12,
    first_seen_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    last_message_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    message_count: 156,
    opportunity_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    opportunity: { id: 'opp-1', name: 'Alpha Corp Deal', stage: 'proposal' }
  },
  {
    id: 'sample-2',
    chat_id: '-1009876543210',
    title: 'Beta Partners Group',
    chat_type: 'supergroup',
    member_count: 8,
    first_seen_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    last_message_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    message_count: 89,
    opportunity_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    opportunity: null
  },
  {
    id: 'sample-3',
    chat_id: '-1005555555555',
    title: 'New Leads Chat',
    chat_type: 'group',
    member_count: 5,
    first_seen_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    last_message_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    message_count: 23,
    opportunity_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    opportunity: null
  }
];

const SAMPLE_MESSAGES: Record<string, TelegramMessage[]> = {
  '-1001234567890': [
    { id: 'm1', chat_id: '-1001234567890', message_id: '101', from_user_id: '111', from_user_name: 'John Smith', from_username: 'johnsmith', text: "Let's schedule a call for tomorrow to discuss the proposal", message_date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
    { id: 'm2', chat_id: '-1001234567890', message_id: '100', from_user_id: '222', from_user_name: 'Sarah Chen', from_username: 'sarahc', text: 'Sounds good! I can do 2pm or 4pm', message_date: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() },
    { id: 'm3', chat_id: '-1001234567890', message_id: '99', from_user_id: '111', from_user_name: 'John Smith', from_username: 'johnsmith', text: "Perfect, let's do 2pm. I'll send the invite", message_date: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() },
  ],
  '-1009876543210': [
    { id: 'm4', chat_id: '-1009876543210', message_id: '50', from_user_id: '333', from_user_name: 'Mike Johnson', from_username: 'mikej', text: 'Has anyone reviewed the partnership terms?', message_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 'm5', chat_id: '-1009876543210', message_id: '49', from_user_id: '444', from_user_name: 'Lisa Wong', from_username: 'lisaw', text: 'Yes, looks good to me. Ready to proceed', message_date: new Date(Date.now() - 3.5 * 24 * 60 * 60 * 1000).toISOString() },
  ],
  '-1005555555555': [
    { id: 'm6', chat_id: '-1005555555555', message_id: '20', from_user_id: '555', from_user_name: 'Alex Turner', from_username: null, text: 'Welcome to the group! Looking forward to working together', message_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() },
  ]
};

export default function TelegramChatsPage() {
  const { toast } = useToast();
  const [chats, setChats] = useState<TelegramChat[]>([]);
  const [messages, setMessages] = useState<Record<string, TelegramMessage[]>>({});
  const [opportunities, setOpportunities] = useState<CRMOpportunity[]>([]);
  const [masterKOLs, setMasterKOLs] = useState<MasterKOL[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDemo, setShowDemo] = useState(false);

  // Link dialog state (for opportunities)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedChat, setSelectedChat] = useState<TelegramChat | null>(null);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string>('');
  const [linking, setLinking] = useState(false);
  const [opportunityPopoverOpen, setOpportunityPopoverOpen] = useState(false);

  // KOL Link dialog state
  const [kolLinkDialogOpen, setKolLinkDialogOpen] = useState(false);
  const [selectedKolId, setSelectedKolId] = useState<string>('');
  const [kolPopoverOpen, setKolPopoverOpen] = useState(false);

  // Send message dialog state
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [chatToMessage, setChatToMessage] = useState<TelegramChat | null>(null);
  const [messageContent, setMessageContent] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // Commands state
  const [commands, setCommands] = useState<TelegramCommand[]>([]);
  const [loadingCommands, setLoadingCommands] = useState(true);
  const [commandDialogOpen, setCommandDialogOpen] = useState(false);
  const [editingCommand, setEditingCommand] = useState<TelegramCommand | null>(null);
  const [commandForm, setCommandForm] = useState({ command: '', response: '', description: '', image_url: '', team_only: false });
  const [savingCommand, setSavingCommand] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState('unassigned');

  useEffect(() => {
    fetchData();
    fetchCommands();
  }, []);

  const fetchData = async () => {
    await Promise.all([fetchChats(), fetchMessages(), fetchOpportunities(), fetchMasterKOLs()]);
  };

  const fetchChats = async () => {
    try {
      const { data, error } = await supabase
        .from('telegram_chats')
        .select(`
          *,
          opportunity:crm_opportunities(id, name, stage),
          master_kol:master_kols(id, name, platform)
        `)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (error) throw error;
      setChats(data || []);
    } catch (error) {
      console.error('Error fetching chats:', error);
      toast({
        title: 'Error',
        description: 'Failed to load Telegram chats',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchMasterKOLs = async () => {
    try {
      const { data, error } = await supabase
        .from('master_kols')
        .select('id, name, platform')
        .is('archived_at', null)
        .order('name');

      if (error) throw error;
      setMasterKOLs(data || []);
    } catch (error) {
      console.error('Error fetching master KOLs:', error);
    }
  };

  // Platform icon helper
  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'X':
        return <span className="font-bold text-black text-sm">𝕏</span>;
      case 'Telegram':
        return (
          <svg className="h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.13-.31-1.09-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
          </svg>
        );
      case 'YouTube':
        return (
          <svg className="h-4 w-4 text-red-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
        );
      case 'Facebook':
        return (
          <svg className="h-4 w-4 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
        );
      case 'TikTok':
        return (
          <svg className="h-4 w-4 text-black" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.10-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
          </svg>
        );
      default:
        return null;
    }
  };

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('telegram_messages')
        .select('*')
        .order('message_date', { ascending: false });

      if (error) throw error;

      // Group messages by chat_id
      const grouped: Record<string, TelegramMessage[]> = {};
      (data || []).forEach((msg: TelegramMessage) => {
        if (!grouped[msg.chat_id]) {
          grouped[msg.chat_id] = [];
        }
        // Keep only last 5 messages per chat for display
        if (grouped[msg.chat_id].length < 5) {
          grouped[msg.chat_id].push(msg);
        }
      });
      setMessages(grouped);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const fetchOpportunities = async () => {
    try {
      const { data, error } = await supabase
        .from('crm_opportunities')
        .select('id, name, stage')
        .order('name');

      if (error) throw error;
      setOpportunities(data || []);
    } catch (error) {
      console.error('Error fetching opportunities:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    toast({
      title: 'Refreshed',
      description: 'Chat list updated',
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: 'Chat ID copied to clipboard',
    });
  };

  const openLinkDialog = (chat: TelegramChat) => {
    setSelectedChat(chat);
    setSelectedOpportunityId(chat.opportunity_id || '__none__');
    setLinkDialogOpen(true);
  };

  const handleUnlink = async (chat: TelegramChat) => {
    if (!chat.opportunity_id) return;

    try {
      // Update telegram_chats table to remove opportunity link
      const { error: chatError } = await supabase
        .from('telegram_chats')
        .update({
          opportunity_id: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', chat.id);

      if (chatError) throw chatError;

      // Clear the gc field on the opportunity
      await supabase
        .from('crm_opportunities')
        .update({
          gc: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', chat.opportunity_id);

      toast({
        title: 'Chat unlinked',
        description: 'Chat has been unlinked from the opportunity',
      });

      fetchChats();
    } catch (error) {
      console.error('Error unlinking chat:', error);
      toast({
        title: 'Error',
        description: 'Failed to unlink chat',
        variant: 'destructive',
      });
    }
  };

  const handleLink = async () => {
    if (!selectedChat) return;

    // Treat "__none__" as no link (unlink)
    const opportunityId = selectedOpportunityId === '__none__' ? null : selectedOpportunityId;

    setLinking(true);
    try {
      // Update telegram_chats table
      const { error: chatError } = await supabase
        .from('telegram_chats')
        .update({
          opportunity_id: opportunityId,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedChat.id);

      if (chatError) throw chatError;

      // Also update the opportunity's gc field if linking
      if (opportunityId) {
        const { error: oppError } = await supabase
          .from('crm_opportunities')
          .update({
            gc: selectedChat.chat_id,
            updated_at: new Date().toISOString()
          })
          .eq('id', opportunityId);

        if (oppError) throw oppError;
      }

      // If unlinking, clear the gc field on the old opportunity
      if (selectedChat.opportunity_id && !opportunityId) {
        await supabase
          .from('crm_opportunities')
          .update({
            gc: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedChat.opportunity_id);
      }

      toast({
        title: opportunityId ? 'Chat linked' : 'Chat unlinked',
        description: opportunityId
          ? 'Chat has been linked to the opportunity'
          : 'Chat has been unlinked from the opportunity',
      });

      setLinkDialogOpen(false);
      fetchChats();
    } catch (error) {
      console.error('Error linking chat:', error);
      toast({
        title: 'Error',
        description: 'Failed to update chat link',
        variant: 'destructive',
      });
    } finally {
      setLinking(false);
    }
  };

  // KOL Link functions
  const openKolLinkDialog = (chat: TelegramChat) => {
    setSelectedChat(chat);
    setSelectedKolId(chat.master_kol_id || '__none__');
    setKolLinkDialogOpen(true);
  };

  const handleUnlinkKol = async (chat: TelegramChat) => {
    if (!chat.master_kol_id) return;

    try {
      const { error: chatError } = await supabase
        .from('telegram_chats')
        .update({
          master_kol_id: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', chat.id);

      if (chatError) throw chatError;

      toast({
        title: 'Chat unlinked',
        description: 'Chat has been unlinked from the KOL',
      });

      fetchChats();
    } catch (error) {
      console.error('Error unlinking chat from KOL:', error);
      toast({
        title: 'Error',
        description: 'Failed to unlink chat',
        variant: 'destructive',
      });
    }
  };

  const handleLinkKol = async () => {
    if (!selectedChat) return;

    const kolId = selectedKolId === '__none__' ? null : selectedKolId;

    setLinking(true);
    try {
      const { error: chatError } = await supabase
        .from('telegram_chats')
        .update({
          master_kol_id: kolId,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedChat.id);

      if (chatError) throw chatError;

      toast({
        title: kolId ? 'Chat linked' : 'Chat unlinked',
        description: kolId
          ? 'Chat has been linked to the KOL'
          : 'Chat has been unlinked from the KOL',
      });

      setKolLinkDialogOpen(false);
      fetchChats();
    } catch (error) {
      console.error('Error linking chat to KOL:', error);
      toast({
        title: 'Error',
        description: 'Failed to update chat link',
        variant: 'destructive',
      });
    } finally {
      setLinking(false);
    }
  };

  // Open message dialog
  const openMessageDialog = (chat: TelegramChat) => {
    setChatToMessage(chat);
    setMessageContent('');
    setMessageDialogOpen(true);
  };

  // Send message to chat
  const handleSendMessage = async () => {
    if (!chatToMessage || !messageContent.trim()) return;

    setSendingMessage(true);
    try {
      const response = await fetch('/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: chatToMessage.chat_id,
          message: messageContent.trim()
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message');
      }

      toast({
        title: 'Message sent',
        description: `Message sent to ${chatToMessage.title || 'the chat'} successfully`,
      });

      setMessageDialogOpen(false);
      setMessageContent('');
      setChatToMessage(null);

      // Refresh messages after sending
      fetchMessages();
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to send message',
        variant: 'destructive',
      });
    } finally {
      setSendingMessage(false);
    }
  };

  const fetchCommands = async () => {
    setLoadingCommands(true);
    try {
      const { data, error } = await supabase
        .from('telegram_commands')
        .select('*')
        .order('command');

      if (error) throw error;
      setCommands(data || []);
    } catch (error) {
      console.error('Error fetching commands:', error);
      toast({
        title: 'Error',
        description: 'Failed to load commands',
        variant: 'destructive',
      });
    } finally {
      setLoadingCommands(false);
    }
  };

  const openCommandDialog = (command?: TelegramCommand) => {
    if (command) {
      setEditingCommand(command);
      setCommandForm({
        command: command.command,
        response: command.response,
        description: command.description || '',
        image_url: command.image_url || '',
        team_only: command.team_only || false
      });
    } else {
      setEditingCommand(null);
      setCommandForm({ command: '', response: '', description: '', image_url: '', team_only: false });
    }
    setCommandDialogOpen(true);
  };

  const handleSaveCommand = async () => {
    if (!commandForm.command.trim() || !commandForm.response.trim()) {
      toast({
        title: 'Error',
        description: 'Command and response are required',
        variant: 'destructive',
      });
      return;
    }

    // Clean up command (remove leading slash if present)
    const cleanCommand = commandForm.command.replace(/^\//, '').toLowerCase().trim();

    setSavingCommand(true);
    try {
      if (editingCommand) {
        // Update existing
        const { error } = await supabase
          .from('telegram_commands')
          .update({
            command: cleanCommand,
            response: commandForm.response.trim(),
            description: commandForm.description.trim() || null,
            image_url: commandForm.image_url.trim() || null,
            team_only: commandForm.team_only,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingCommand.id);

        if (error) throw error;

        toast({
          title: 'Command updated',
          description: `/${cleanCommand} has been updated`,
        });
      } else {
        // Create new
        const { error } = await supabase
          .from('telegram_commands')
          .insert({
            command: cleanCommand,
            response: commandForm.response.trim(),
            description: commandForm.description.trim() || null,
            image_url: commandForm.image_url.trim() || null,
            team_only: commandForm.team_only,
            is_active: true
          });

        if (error) throw error;

        toast({
          title: 'Command created',
          description: `/${cleanCommand} has been added`,
        });
      }

      setCommandDialogOpen(false);
      fetchCommands();
    } catch (error: any) {
      console.error('Error saving command:', error);
      toast({
        title: 'Error',
        description: error.message?.includes('duplicate')
          ? 'A command with this name already exists'
          : 'Failed to save command',
        variant: 'destructive',
      });
    } finally {
      setSavingCommand(false);
    }
  };

  const handleDeleteCommand = async (command: TelegramCommand) => {
    if (!confirm(`Are you sure you want to delete /${command.command}?`)) return;

    try {
      const { error } = await supabase
        .from('telegram_commands')
        .delete()
        .eq('id', command.id);

      if (error) throw error;

      toast({
        title: 'Command deleted',
        description: `/${command.command} has been removed`,
      });
      fetchCommands();
    } catch (error) {
      console.error('Error deleting command:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete command',
        variant: 'destructive',
      });
    }
  };

  const handleToggleCommand = async (command: TelegramCommand) => {
    try {
      const { error } = await supabase
        .from('telegram_commands')
        .update({
          is_active: !command.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', command.id);

      if (error) throw error;

      toast({
        title: command.is_active ? 'Command disabled' : 'Command enabled',
        description: `/${command.command} is now ${command.is_active ? 'disabled' : 'enabled'}`,
      });
      fetchCommands();
    } catch (error) {
      console.error('Error toggling command:', error);
      toast({
        title: 'Error',
        description: 'Failed to update command',
        variant: 'destructive',
      });
    }
  };

  const formatTimeAgo = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getActivityStatus = (lastMessageAt: string | null) => {
    if (!lastMessageAt) return { color: 'bg-gray-400', label: 'No activity' };
    const date = new Date(lastMessageAt);
    const now = new Date();
    const diffHours = (now.getTime() - date.getTime()) / 3600000;

    if (diffHours < 24) return { color: 'bg-green-500', label: 'Active' };
    if (diffHours < 72) return { color: 'bg-yellow-500', label: 'Recent' };
    if (diffHours < 168) return { color: 'bg-orange-500', label: 'Quiet' };
    return { color: 'bg-red-500', label: 'Inactive' };
  };

  // Use demo data if showDemo is true, otherwise use real data
  const displayChats = showDemo ? SAMPLE_CHATS : chats;
  const displayMessages = showDemo ? SAMPLE_MESSAGES : messages;

  // Separate group chats from DMs and KOL chats
  const groupChats = displayChats.filter(chat => chat.chat_type === 'group' || chat.chat_type === 'supergroup');
  const dmChats = displayChats.filter(chat => chat.chat_type === 'private');
  const kolChats = displayChats.filter(chat => chat.master_kol_id !== null);
  const unassignedChats = displayChats.filter(chat => !chat.opportunity_id && !chat.master_kol_id && chat.chat_type !== 'private');
  const leadsChats = displayChats.filter(chat => chat.opportunity_id !== null);

  const filteredGroupChats = groupChats.filter(chat => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      chat.title?.toLowerCase().includes(query) ||
      chat.chat_id.includes(query) ||
      chat.opportunity?.name?.toLowerCase().includes(query)
    );
  });

  const filteredDMChats = dmChats.filter(chat => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      chat.title?.toLowerCase().includes(query) ||
      chat.chat_id.includes(query)
    );
  });

  const filteredKolChats = kolChats.filter(chat => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      chat.title?.toLowerCase().includes(query) ||
      chat.chat_id.includes(query) ||
      chat.master_kol?.name?.toLowerCase().includes(query)
    );
  });

  const filteredUnassignedChats = unassignedChats.filter(chat => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      chat.title?.toLowerCase().includes(query) ||
      chat.chat_id.includes(query)
    );
  });

  const filteredLeadsChats = leadsChats.filter(chat => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      chat.title?.toLowerCase().includes(query) ||
      chat.chat_id.includes(query) ||
      chat.opportunity?.name?.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <div className="flex flex-col h-full gap-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-5 w-64" />
          </div>
          <Skeleton className="h-10 w-24" />
        </div>
        <Skeleton className="h-10 w-80" />
        <div className="grid gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Telegram</h2>
          <p className="text-gray-600">
            Manage Telegram chats and bot commands
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
        <TabsList>
          <TabsTrigger value="unassigned" className="flex items-center gap-2">
            <Unlink className="h-4 w-4" />
            Unassigned
            {unassignedChats.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{unassignedChats.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="leads" className="flex items-center gap-2">
            <LinkIcon className="h-4 w-4" />
            Leads
            {leadsChats.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{leadsChats.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="chats" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Groups
            {groupChats.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{groupChats.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="dms" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            DMs
            {dmChats.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{dmChats.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="kols" className="flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            KOLs
            {kolChats.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{kolChats.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="commands" className="flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Commands
          </TabsTrigger>
        </TabsList>

        {/* Unassigned Tab */}
        <TabsContent value="unassigned" className="mt-4 space-y-4">
          {/* Unassigned Header */}
          <div className="flex items-center justify-between">
            <p className="text-gray-600">
              Chats not linked to any opportunity or KOL ({unassignedChats.length} total)
            </p>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
                <Input
                  placeholder="Search chats..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="auth-input pl-10 w-64"
                />
              </div>
              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Unassigned Chat List */}
          {filteredUnassignedChats.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Unlink className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {unassignedChats.length === 0 ? 'No unassigned chats' : 'No matching chats'}
                </h3>
                <p className="text-gray-500 max-w-md mx-auto">
                  {unassignedChats.length === 0
                    ? 'All chats have been assigned to opportunities or KOLs.'
                    : 'Try a different search term.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredUnassignedChats.map(chat => {
                const activity = getActivityStatus(chat.last_message_at);
                return (
                  <Card key={chat.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        {/* Left: Chat Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <div className={`w-3 h-3 rounded-full ${activity.color}`} title={activity.label} />
                            <h3 className="font-semibold text-gray-900 truncate">
                              {chat.title || 'Unnamed Chat'}
                            </h3>
                            <Badge variant="secondary" className="text-xs">
                              {(chat.chat_type || 'chat').charAt(0).toUpperCase() + (chat.chat_type || 'chat').slice(1)}
                            </Badge>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                            <div className="flex items-center gap-1.5">
                              <Hash className="h-3.5 w-3.5" />
                              <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                                {chat.chat_id}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => copyToClipboard(chat.chat_id)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5" />
                              <span>{formatTimeAgo(chat.last_message_at)}</span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <MessageSquare className="h-3.5 w-3.5" />
                              <span>{chat.message_count} messages</span>
                            </div>
                          </div>

                          {/* Recent Messages */}
                          {displayMessages[chat.chat_id] && displayMessages[chat.chat_id].length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <p className="text-xs font-medium text-gray-500 mb-2">Recent Messages:</p>
                              <div className="space-y-1.5">
                                {displayMessages[chat.chat_id].slice(0, 3).map((msg) => (
                                  <div key={msg.id} className="text-xs bg-gray-50 rounded px-2 py-1.5">
                                    <span className="font-medium text-gray-700">
                                      {msg.from_user_name || msg.from_username || 'Unknown'}:
                                    </span>{' '}
                                    <span className="text-gray-600">
                                      {msg.text && msg.text.length > 80
                                        ? msg.text.substring(0, 80) + '...'
                                        : msg.text || '[No text]'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right: Actions */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openLinkDialog(chat)}
                          >
                            <LinkIcon className="h-4 w-4 mr-1.5" />
                            Link to Lead
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openKolLinkDialog(chat)}
                          >
                            <Megaphone className="h-4 w-4 mr-1.5" />
                            Link to KOL
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Leads Tab (Opportunities) */}
        <TabsContent value="leads" className="mt-4 space-y-4">
          {/* Leads Header */}
          <div className="flex items-center justify-between">
            <p className="text-gray-600">
              Chats linked to opportunities ({leadsChats.length} total)
            </p>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
                <Input
                  placeholder="Search leads..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="auth-input pl-10 w-64"
                />
              </div>
              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Leads Chat List */}
          {filteredLeadsChats.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <LinkIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {leadsChats.length === 0 ? 'No leads linked yet' : 'No matching leads'}
                </h3>
                <p className="text-gray-500 max-w-md mx-auto">
                  {leadsChats.length === 0
                    ? 'Link chats to opportunities from the Unassigned tab to track them here.'
                    : 'Try a different search term.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredLeadsChats.map(chat => {
                const activity = getActivityStatus(chat.last_message_at);
                return (
                  <Card key={chat.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        {/* Left: Chat Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <div className={`w-3 h-3 rounded-full ${activity.color}`} title={activity.label} />
                            <h3 className="font-semibold text-gray-900 truncate">
                              {chat.title || 'Unnamed Chat'}
                            </h3>
                            <Badge variant="secondary" className="text-xs">
                              {(chat.chat_type || 'chat').charAt(0).toUpperCase() + (chat.chat_type || 'chat').slice(1)}
                            </Badge>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                            <div className="flex items-center gap-1.5">
                              <Hash className="h-3.5 w-3.5" />
                              <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                                {chat.chat_id}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => copyToClipboard(chat.chat_id)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5" />
                              <span>{formatTimeAgo(chat.last_message_at)}</span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <MessageSquare className="h-3.5 w-3.5" />
                              <span>{chat.message_count} messages</span>
                            </div>
                          </div>

                          {/* Linked Opportunity */}
                          {chat.opportunity && (
                            <div className="mt-3 flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              <span className="text-sm text-gray-700">
                                Linked to: <strong>{chat.opportunity.name}</strong>
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {chat.opportunity.stage.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                              </Badge>
                            </div>
                          )}

                          {/* Recent Messages */}
                          {displayMessages[chat.chat_id] && displayMessages[chat.chat_id].length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <p className="text-xs font-medium text-gray-500 mb-2">Recent Messages:</p>
                              <div className="space-y-1.5">
                                {displayMessages[chat.chat_id].slice(0, 3).map((msg) => (
                                  <div key={msg.id} className="text-xs bg-gray-50 rounded px-2 py-1.5">
                                    <span className="font-medium text-gray-700">
                                      {msg.from_user_name || msg.from_username || 'Unknown'}:
                                    </span>{' '}
                                    <span className="text-gray-600">
                                      {msg.text && msg.text.length > 80
                                        ? msg.text.substring(0, 80) + '...'
                                        : msg.text || '[No text]'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right: Actions */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            onClick={() => openMessageDialog(chat)}
                            style={{ backgroundColor: '#3e8692', color: 'white' }}
                            className="hover:opacity-90"
                          >
                            <MessageSquare className="h-4 w-4 mr-1.5" />
                            Send Message
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUnlink(chat)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                          >
                            <Unlink className="h-4 w-4 mr-1.5" />
                            Unlink
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openLinkDialog(chat)}
                          >
                            <Edit className="h-4 w-4 mr-1.5" />
                            Change Lead
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Chats Tab (Groups only) */}
        <TabsContent value="chats" className="mt-4 space-y-4">
          {/* Chats Header */}
          <div className="flex items-center justify-between">
            <p className="text-gray-600">
              {showDemo ? (
                <span className="text-amber-600">Showing demo data • </span>
              ) : null}
              Group chats discovered by the bot ({groupChats.length} total)
            </p>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
                <Input
                  placeholder="Search chats..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="auth-input pl-10 w-64"
                />
              </div>
              {false && (
              <Button
                variant={showDemo ? "default" : "outline"}
                onClick={() => setShowDemo(!showDemo)}
                className={showDemo ? "bg-amber-500 hover:bg-amber-600" : ""}
              >
                {showDemo ? 'Hide Demo' : 'Show Demo'}
              </Button>
              )}
              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Chat List */}
      {filteredGroupChats.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {groupChats.length === 0 ? 'No group chats discovered yet' : 'No matching chats'}
            </h3>
            <p className="text-gray-500 max-w-md mx-auto">
              {groupChats.length === 0
                ? 'Group chats will appear here when messages are sent in groups where your bot is a member. Make sure the webhook is connected in Settings.'
                : 'Try a different search term.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredGroupChats.map(chat => {
            const activity = getActivityStatus(chat.last_message_at);
            return (
              <Card key={chat.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: Chat Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-3 h-3 rounded-full ${activity.color}`} title={activity.label} />
                        <h3 className="font-semibold text-gray-900 truncate">
                          {chat.title || 'Unnamed Chat'}
                        </h3>
                        <Badge variant="secondary" className="text-xs">
                          {(chat.chat_type || 'group').charAt(0).toUpperCase() + (chat.chat_type || 'group').slice(1)}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                        <div className="flex items-center gap-1.5">
                          <Hash className="h-3.5 w-3.5" />
                          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                            {chat.chat_id}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => copyToClipboard(chat.chat_id)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{formatTimeAgo(chat.last_message_at)}</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <MessageSquare className="h-3.5 w-3.5" />
                          <span>{chat.message_count} messages</span>
                        </div>
                      </div>

                      {/* Linked Opportunity */}
                      {chat.opportunity && (
                        <div className="mt-3 flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="text-sm text-gray-700">
                            Linked to: <strong>{chat.opportunity.name}</strong>
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {chat.opportunity.stage.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                          </Badge>
                        </div>
                      )}

                      {/* Recent Messages */}
                      {displayMessages[chat.chat_id] && displayMessages[chat.chat_id].length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <p className="text-xs font-medium text-gray-500 mb-2">Recent Messages:</p>
                          <div className="space-y-1.5">
                            {displayMessages[chat.chat_id].slice(0, 3).map((msg) => (
                              <div key={msg.id} className="text-xs bg-gray-50 rounded px-2 py-1.5">
                                <span className="font-medium text-gray-700">
                                  {msg.from_user_name || msg.from_username || 'Unknown'}:
                                </span>{' '}
                                <span className="text-gray-600">
                                  {msg.text && msg.text.length > 80
                                    ? msg.text.substring(0, 80) + '...'
                                    : msg.text || '[No text]'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {chat.opportunity_id && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUnlink(chat)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                        >
                          <Unlink className="h-4 w-4 mr-1.5" />
                          Unlink
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openLinkDialog(chat)}
                      >
                        {chat.opportunity_id ? (
                          <>
                            <Edit className="h-4 w-4 mr-1.5" />
                            Change Link
                          </>
                        ) : (
                          <>
                            <LinkIcon className="h-4 w-4 mr-1.5" />
                            Link to Opp
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openKolLinkDialog(chat)}
                      >
                        {chat.master_kol_id ? (
                          <>
                            <Edit className="h-4 w-4 mr-1.5" />
                            Change KOL
                          </>
                        ) : (
                          <>
                            <Megaphone className="h-4 w-4 mr-1.5" />
                            Link to KOL
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
        </TabsContent>

        {/* DMs Tab */}
        <TabsContent value="dms" className="mt-4 space-y-4">
          {/* DMs Header */}
          <div className="flex items-center justify-between">
            <p className="text-gray-600">
              {showDemo ? (
                <span className="text-amber-600">Showing demo data • </span>
              ) : null}
              Direct messages with the bot ({dmChats.length} total)
            </p>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
                <Input
                  placeholder="Search DMs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="auth-input pl-10 w-64"
                />
              </div>
              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* DM List */}
          {filteredDMChats.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <User className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {dmChats.length === 0 ? 'No direct messages yet' : 'No matching DMs'}
                </h3>
                <p className="text-gray-500 max-w-md mx-auto">
                  {dmChats.length === 0
                    ? 'Direct messages will appear here when users message your bot privately.'
                    : 'Try a different search term.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredDMChats.map(chat => {
                const activity = getActivityStatus(chat.last_message_at);
                return (
                  <Card key={chat.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        {/* Left: DM Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <div className={`w-3 h-3 rounded-full ${activity.color}`} title={activity.label} />
                            <div className="p-1.5 bg-blue-50 rounded-full">
                              <User className="h-4 w-4 text-blue-600" />
                            </div>
                            <h3 className="font-semibold text-gray-900 truncate">
                              {chat.title || 'Unknown User'}
                            </h3>
                            <Badge variant="secondary" className="text-xs">
                              DM
                            </Badge>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                            <div className="flex items-center gap-1.5">
                              <Hash className="h-3.5 w-3.5" />
                              <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                                {chat.chat_id}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => copyToClipboard(chat.chat_id)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5" />
                              <span>{formatTimeAgo(chat.last_message_at)}</span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <MessageSquare className="h-3.5 w-3.5" />
                              <span>{chat.message_count} messages</span>
                            </div>
                          </div>

                          {/* Linked KOL */}
                          {chat.master_kol && (
                            <div className="mt-3 flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              <span className="text-sm text-gray-700">
                                Linked to KOL: <strong>{chat.master_kol.name}</strong>
                              </span>
                            </div>
                          )}

                          {/* Recent Messages */}
                          {displayMessages[chat.chat_id] && displayMessages[chat.chat_id].length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <p className="text-xs font-medium text-gray-500 mb-2">Recent Messages:</p>
                              <div className="space-y-1.5">
                                {displayMessages[chat.chat_id].slice(0, 3).map((msg) => (
                                  <div key={msg.id} className="text-xs bg-gray-50 rounded px-2 py-1.5">
                                    <span className="font-medium text-gray-700">
                                      {msg.from_user_name || msg.from_username || 'Unknown'}:
                                    </span>{' '}
                                    <span className="text-gray-600">
                                      {msg.text && msg.text.length > 80
                                        ? msg.text.substring(0, 80) + '...'
                                        : msg.text || '[No text]'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right: Actions */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {chat.master_kol_id && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUnlinkKol(chat)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                            >
                              <Unlink className="h-4 w-4 mr-1.5" />
                              Unlink
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openKolLinkDialog(chat)}
                          >
                            {chat.master_kol_id ? (
                              <>
                                <Edit className="h-4 w-4 mr-1.5" />
                                Change KOL
                              </>
                            ) : (
                              <>
                                <Megaphone className="h-4 w-4 mr-1.5" />
                                Link to KOL
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* KOLs Tab */}
        <TabsContent value="kols" className="mt-4 space-y-4">
          {/* KOLs Header */}
          <div className="flex items-center justify-between">
            <p className="text-gray-600">
              Chats linked to KOLs ({kolChats.length} total)
            </p>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
                <Input
                  placeholder="Search KOL chats..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="auth-input pl-10 w-64"
                />
              </div>
              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* KOL Chat List */}
          {filteredKolChats.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Megaphone className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {kolChats.length === 0 ? 'No KOL chats linked yet' : 'No matching KOL chats'}
                </h3>
                <p className="text-gray-500 max-w-md mx-auto">
                  {kolChats.length === 0
                    ? 'Link chats to KOLs from the Groups or DMs tab to track conversations with them.'
                    : 'Try a different search term.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredKolChats.map(chat => {
                const activity = getActivityStatus(chat.last_message_at);
                return (
                  <Card key={chat.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        {/* Left: Chat Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <div className={`w-3 h-3 rounded-full ${activity.color}`} title={activity.label} />
                            <h3 className="font-semibold text-gray-900 truncate">
                              {chat.title || 'Unnamed Chat'}
                            </h3>
                            <Badge variant="secondary" className="text-xs">
                              {(chat.chat_type || 'chat').charAt(0).toUpperCase() + (chat.chat_type || 'chat').slice(1)}
                            </Badge>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                            <div className="flex items-center gap-1.5">
                              <Hash className="h-3.5 w-3.5" />
                              <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                                {chat.chat_id}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => copyToClipboard(chat.chat_id)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5" />
                              <span>{formatTimeAgo(chat.last_message_at)}</span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <MessageSquare className="h-3.5 w-3.5" />
                              <span>{chat.message_count} messages</span>
                            </div>
                          </div>

                          {/* Linked KOL */}
                          {chat.master_kol && (
                            <div className="mt-3 flex items-center gap-2">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              <span className="text-sm text-gray-700">
                                Linked to KOL: <strong>{chat.master_kol.name}</strong>
                              </span>
                              {chat.master_kol.platform && chat.master_kol.platform.length > 0 && (
                                <div className="flex items-center gap-1">
                                  {chat.master_kol.platform.map((p, i) => (
                                    <span key={i} title={p}>{getPlatformIcon(p)}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Recent Messages */}
                          {displayMessages[chat.chat_id] && displayMessages[chat.chat_id].length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <p className="text-xs font-medium text-gray-500 mb-2">Recent Messages:</p>
                              <div className="space-y-1.5">
                                {displayMessages[chat.chat_id].slice(0, 3).map((msg) => (
                                  <div key={msg.id} className="text-xs bg-gray-50 rounded px-2 py-1.5">
                                    <span className="font-medium text-gray-700">
                                      {msg.from_user_name || msg.from_username || 'Unknown'}:
                                    </span>{' '}
                                    <span className="text-gray-600">
                                      {msg.text && msg.text.length > 80
                                        ? msg.text.substring(0, 80) + '...'
                                        : msg.text || '[No text]'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right: Actions */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            onClick={() => openMessageDialog(chat)}
                            style={{ backgroundColor: '#3e8692', color: 'white' }}
                            className="hover:opacity-90"
                          >
                            <MessageSquare className="h-4 w-4 mr-1.5" />
                            Send Message
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUnlinkKol(chat)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                          >
                            <Unlink className="h-4 w-4 mr-1.5" />
                            Unlink
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openKolLinkDialog(chat)}
                          >
                            <Edit className="h-4 w-4 mr-1.5" />
                            Change KOL
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Commands Tab */}
        <TabsContent value="commands" className="mt-4 space-y-4">
          {/* Commands Header */}
          <div className="flex items-center justify-between">
            <p className="text-gray-600">
              Bot commands that respond to users ({commands.length} total)
            </p>
            <Button
              onClick={() => openCommandDialog()}
              style={{ backgroundColor: '#3e8692', color: 'white' }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Command
            </Button>
          </div>

          {/* Commands List */}
          {loadingCommands ? (
            <div className="grid gap-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : commands.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Terminal className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No commands yet
                </h3>
                <p className="text-gray-500 max-w-md mx-auto mb-4">
                  Add bot commands that will respond when users type them in Telegram chats.
                </p>
                <Button
                  onClick={() => openCommandDialog()}
                  style={{ backgroundColor: '#3e8692', color: 'white' }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Command
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {commands.map(command => (
                <Card key={command.id} className={`hover:shadow-md transition-shadow ${!command.is_active ? 'opacity-60' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      {/* Left: Command Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <code className="text-lg font-semibold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                            /{command.command}
                          </code>
                          {command.team_only && (
                            <Badge variant="outline" className="text-xs border-blue-300 text-blue-600">
                              <Users className="h-3 w-3 mr-1" />
                              Team Only
                            </Badge>
                          )}
                          {!command.is_active && (
                            <Badge variant="secondary" className="text-xs">
                              Disabled
                            </Badge>
                          )}
                        </div>

                        {command.description && (
                          <p className="text-sm text-gray-600 mb-2">
                            {command.description}
                          </p>
                        )}

                        <div className="mt-2 p-3 bg-gray-50 rounded-md">
                          <p className="text-xs font-medium text-gray-500 mb-1">Response:</p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">
                            {command.response.length > 200
                              ? command.response.substring(0, 200) + '...'
                              : command.response}
                          </p>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleCommand(command)}
                          title={command.is_active ? 'Disable command' : 'Enable command'}
                        >
                          {command.is_active ? (
                            <ToggleRight className="h-5 w-5 text-green-600" />
                          ) : (
                            <ToggleLeft className="h-5 w-5 text-gray-400" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openCommandDialog(command)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteCommand(command)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Link Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Chat to Opportunity</DialogTitle>
            <DialogDescription>
              Connect this Telegram chat to a CRM opportunity to track message activity.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Chat</Label>
              <div className="p-3 bg-gray-50 rounded-md">
                <p className="font-medium">{selectedChat?.title || 'Unnamed Chat'}</p>
                <code className="text-xs text-gray-500">{selectedChat?.chat_id}</code>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="opportunity">Opportunity</Label>
              <Popover open={opportunityPopoverOpen} onOpenChange={setOpportunityPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={opportunityPopoverOpen}
                    className="w-full justify-between font-normal"
                  >
                    {selectedOpportunityId && selectedOpportunityId !== '__none__'
                      ? opportunities.find(opp => opp.id === selectedOpportunityId)?.name
                      : selectedOpportunityId === '__none__'
                        ? 'No link (unlink)'
                        : 'Select an opportunity...'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search opportunities..." className="h-9" />
                    <CommandList>
                      <CommandEmpty>No opportunity found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="__none__"
                          onSelect={() => {
                            setSelectedOpportunityId('__none__');
                            setOpportunityPopoverOpen(false);
                          }}
                        >
                          <Check className={`mr-2 h-4 w-4 ${selectedOpportunityId === '__none__' ? 'opacity-100' : 'opacity-0'}`} />
                          <span className="text-gray-500">No link (unlink)</span>
                        </CommandItem>
                        {opportunities.map(opp => (
                          <CommandItem
                            key={opp.id}
                            value={opp.name}
                            onSelect={() => {
                              setSelectedOpportunityId(opp.id);
                              setOpportunityPopoverOpen(false);
                            }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${selectedOpportunityId === opp.id ? 'opacity-100' : 'opacity-0'}`} />
                            {opp.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-xs text-gray-500">
                This will also update the opportunity's Telegram Chat ID field.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleLink}
              disabled={linking}
              style={{ backgroundColor: '#3e8692', color: 'white' }}
            >
              {linking ? 'Saving...' : (selectedOpportunityId && selectedOpportunityId !== '__none__') ? 'Link Chat' : 'Unlink Chat'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* KOL Link Dialog */}
      <Dialog open={kolLinkDialogOpen} onOpenChange={setKolLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Chat to KOL</DialogTitle>
            <DialogDescription>
              Connect this Telegram chat to a KOL to track conversations with them.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Chat</Label>
              <div className="p-3 bg-gray-50 rounded-md">
                <p className="font-medium">{selectedChat?.title || 'Unnamed Chat'}</p>
                <code className="text-xs text-gray-500">{selectedChat?.chat_id}</code>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="kol">KOL</Label>
              <Popover open={kolPopoverOpen} onOpenChange={setKolPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={kolPopoverOpen}
                    className="w-full justify-between font-normal"
                  >
                    {selectedKolId && selectedKolId !== '__none__'
                      ? masterKOLs.find(kol => kol.id === selectedKolId)?.name
                      : selectedKolId === '__none__'
                        ? 'No link (unlink)'
                        : 'Select a KOL...'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search KOLs..." className="h-9" />
                    <CommandList>
                      <CommandEmpty>No KOL found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="__none__"
                          onSelect={() => {
                            setSelectedKolId('__none__');
                            setKolPopoverOpen(false);
                          }}
                        >
                          <Check className={`mr-2 h-4 w-4 ${selectedKolId === '__none__' ? 'opacity-100' : 'opacity-0'}`} />
                          <span className="text-gray-500">No link (unlink)</span>
                        </CommandItem>
                        {masterKOLs.map(kol => (
                          <CommandItem
                            key={kol.id}
                            value={kol.name}
                            onSelect={() => {
                              setSelectedKolId(kol.id);
                              setKolPopoverOpen(false);
                            }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${selectedKolId === kol.id ? 'opacity-100' : 'opacity-0'}`} />
                            <div className="flex items-center gap-2">
                              <span>{kol.name}</span>
                              {kol.platform && kol.platform.length > 0 && (
                                <div className="flex items-center gap-1">
                                  {kol.platform.map((p, i) => (
                                    <span key={i} title={p}>{getPlatformIcon(p)}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-xs text-gray-500">
                Link this chat to a KOL to track your conversations with them.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setKolLinkDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleLinkKol}
              disabled={linking}
              style={{ backgroundColor: '#3e8692', color: 'white' }}
            >
              {linking ? 'Saving...' : (selectedKolId && selectedKolId !== '__none__') ? 'Link Chat' : 'Unlink Chat'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Command Dialog (Add/Edit) */}
      <Dialog open={commandDialogOpen} onOpenChange={setCommandDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCommand ? 'Edit Command' : 'Add Command'}</DialogTitle>
            <DialogDescription>
              {editingCommand
                ? 'Update the command and its response.'
                : 'Create a new bot command. Users can trigger it by typing /<command> in any chat where the bot is present.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="command">Command</Label>
              <div className="flex items-center gap-2">
                <span className="text-lg text-gray-500">/</span>
                <Input
                  id="command"
                  placeholder="help"
                  value={commandForm.command}
                  onChange={(e) => setCommandForm({ ...commandForm, command: e.target.value })}
                  className="auth-input flex-1"
                />
              </div>
              <p className="text-xs text-gray-500">
                Lowercase letters only, no spaces. e.g., help, info, support
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Input
                id="description"
                placeholder="Shows help information"
                value={commandForm.description}
                onChange={(e) => setCommandForm({ ...commandForm, description: e.target.value })}
                className="auth-input"
              />
              <p className="text-xs text-gray-500">
                A short description of what this command does.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="image_url">Image URL (Optional)</Label>
              <Input
                id="image_url"
                placeholder="https://example.com/image.jpg"
                value={commandForm.image_url}
                onChange={(e) => setCommandForm({ ...commandForm, image_url: e.target.value })}
                className="auth-input"
              />
              <p className="text-xs text-gray-500">
                If set, the image will appear above the response text.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="response">Response</Label>
              <Textarea
                id="response"
                placeholder="Welcome! Here's how to get help..."
                value={commandForm.response}
                onChange={(e) => setCommandForm({ ...commandForm, response: e.target.value })}
                rows={5}
                className="auth-input"
              />
              <p className="text-xs text-gray-500">
                The message the bot will send when this command is used. Supports HTML formatting.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="team_only" className="text-sm font-medium">Team Only</Label>
                <p className="text-xs text-gray-500">
                  Only team members can use this command
                </p>
              </div>
              <Switch
                id="team_only"
                checked={commandForm.team_only}
                onCheckedChange={(checked) => setCommandForm({ ...commandForm, team_only: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCommandDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveCommand}
              disabled={savingCommand}
              style={{ backgroundColor: '#3e8692', color: 'white' }}
            >
              {savingCommand ? 'Saving...' : editingCommand ? 'Update Command' : 'Add Command'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Message Dialog */}
      <Dialog open={messageDialogOpen} onOpenChange={setMessageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Message</DialogTitle>
            <DialogDescription>
              {chatToMessage?.master_kol
                ? `Send a message to ${chatToMessage.master_kol.name} via ${chatToMessage.title || 'Telegram'}`
                : `Send a message to ${chatToMessage?.title || 'this chat'}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                placeholder="Type your message here..."
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                rows={5}
                className="auth-input resize-none"
              />
              {chatToMessage && (
                <p className="text-xs text-gray-500">
                  Will be sent to: {chatToMessage.title || `Chat ${chatToMessage.chat_id}`}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMessageDialogOpen(false)}
              disabled={sendingMessage}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendMessage}
              disabled={sendingMessage || !messageContent.trim()}
              style={{ backgroundColor: '#3e8692', color: 'white' }}
            >
              {sendingMessage ? 'Sending...' : 'Send Message'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
