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
  ToggleRight
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
  created_at: string;
  updated_at: string;
  // Joined
  opportunity?: {
    id: string;
    name: string;
    stage: string;
  } | null;
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDemo, setShowDemo] = useState(false);

  // Link dialog state
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedChat, setSelectedChat] = useState<TelegramChat | null>(null);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string>('');
  const [linking, setLinking] = useState(false);
  const [opportunityPopoverOpen, setOpportunityPopoverOpen] = useState(false);

  // Commands state
  const [commands, setCommands] = useState<TelegramCommand[]>([]);
  const [loadingCommands, setLoadingCommands] = useState(true);
  const [commandDialogOpen, setCommandDialogOpen] = useState(false);
  const [editingCommand, setEditingCommand] = useState<TelegramCommand | null>(null);
  const [commandForm, setCommandForm] = useState({ command: '', response: '', description: '', image_url: '' });
  const [savingCommand, setSavingCommand] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState('chats');

  useEffect(() => {
    fetchData();
    fetchCommands();
  }, []);

  const fetchData = async () => {
    await Promise.all([fetchChats(), fetchMessages(), fetchOpportunities()]);
  };

  const fetchChats = async () => {
    try {
      const { data, error } = await supabase
        .from('telegram_chats')
        .select(`
          *,
          opportunity:crm_opportunities(id, name, stage)
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
        image_url: command.image_url || ''
      });
    } else {
      setEditingCommand(null);
      setCommandForm({ command: '', response: '', description: '', image_url: '' });
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

  const filteredChats = displayChats.filter(chat => {
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
          <TabsTrigger value="chats" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Chats
          </TabsTrigger>
          <TabsTrigger value="commands" className="flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Commands
          </TabsTrigger>
        </TabsList>

        {/* Chats Tab */}
        <TabsContent value="chats" className="mt-4 space-y-4">
          {/* Chats Header */}
          <div className="flex items-center justify-between">
            <p className="text-gray-600">
              {showDemo ? (
                <span className="text-amber-600">Showing demo data • </span>
              ) : null}
              Group chats discovered by the bot ({displayChats.length} total)
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
                variant={showDemo ? "default" : "outline"}
                onClick={() => setShowDemo(!showDemo)}
                className={showDemo ? "bg-amber-500 hover:bg-amber-600" : ""}
              >
                {showDemo ? 'Hide Demo' : 'Show Demo'}
              </Button>
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
      {filteredChats.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {chats.length === 0 ? 'No chats discovered yet' : 'No matching chats'}
            </h3>
            <p className="text-gray-500 max-w-md mx-auto">
              {chats.length === 0
                ? 'Chats will appear here when messages are sent in groups where your bot is a member. Make sure the webhook is connected in Settings.'
                : 'Try a different search term.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredChats.map(chat => {
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openLinkDialog(chat)}
                      >
                        {chat.opportunity_id ? (
                          <>
                            <Unlink className="h-4 w-4 mr-1.5" />
                            Change Link
                          </>
                        ) : (
                          <>
                            <LinkIcon className="h-4 w-4 mr-1.5" />
                            Link to Opp
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
    </div>
  );
}
