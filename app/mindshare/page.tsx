'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import {
  BarChart3,
  Plus,
  Trash2,
  Radio,
  AlertTriangle,
  Search,
} from 'lucide-react';

type MonitoredChannel = {
  id: string;
  channel_name: string;
  channel_username: string | null;
  channel_tg_id: string | null;
  language: string;
  is_active: boolean;
  created_at: string;
};

type MindshareConfig = {
  id: string;
  client_id: string;
  is_enabled: boolean;
  tracked_keywords: string[];
  campaign_start_date: string | null;
};

type ClientInfo = {
  id: string;
  name: string;
};

export default function MindsharePage() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<MonitoredChannel[]>([]);
  const [configs, setConfigs] = useState<(MindshareConfig & { client_name: string })[]>([]);
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Add channel form
  const [newChannel, setNewChannel] = useState({ name: '', username: '' });
  const [addingChannel, setAddingChannel] = useState(false);

  // Add keywords form
  const [editingKeywords, setEditingKeywords] = useState<string | null>(null);
  const [keywordInput, setKeywordInput] = useState('');

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [{ data: channelData }, { data: configData }, { data: clientData }] = await Promise.all([
        supabase.from('tg_monitored_channels').select('*').order('created_at', { ascending: false }),
        supabase.from('client_mindshare_config').select('*'),
        supabase.from('clients').select('id, name').order('name'),
      ]);

      setChannels(channelData || []);
      setClients(clientData || []);

      const clientMap = new Map((clientData || []).map(c => [c.id, c.name]));
      setConfigs(
        (configData || []).map(c => ({
          ...c,
          tracked_keywords: c.tracked_keywords || [],
          client_name: clientMap.get(c.client_id) || 'Unknown',
        }))
      );
    } catch (err) {
      console.error('Error loading mindshare data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddChannel = async () => {
    if (!newChannel.name.trim() || !newChannel.username.trim()) return;
    setAddingChannel(true);
    try {
      const username = newChannel.username.replace('@', '').trim();
      await supabase.from('tg_monitored_channels').insert({
        channel_name: newChannel.name.trim(),
        channel_username: username,
      });
      setNewChannel({ name: '', username: '' });
      toast({ title: 'Added', description: `Channel @${username} added.` });
      await loadData();
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to add channel.', variant: 'destructive' });
    } finally {
      setAddingChannel(false);
    }
  };

  const toggleChannel = async (id: string, isActive: boolean) => {
    await supabase.from('tg_monitored_channels').update({ is_active: !isActive }).eq('id', id);
    setChannels(prev => prev.map(c => c.id === id ? { ...c, is_active: !isActive } : c));
  };

  const deleteChannel = async (id: string) => {
    await supabase.from('tg_monitored_channels').delete().eq('id', id);
    setChannels(prev => prev.filter(c => c.id !== id));
    toast({ title: 'Deleted', description: 'Channel removed.' });
  };

  const addKeyword = async (configId: string, clientId: string) => {
    if (!keywordInput.trim()) return;
    const existing = configs.find(c => c.id === configId);
    const keywords = [...(existing?.tracked_keywords || []), keywordInput.trim()];
    await supabase.from('client_mindshare_config').update({ tracked_keywords: keywords }).eq('id', configId);
    setKeywordInput('');
    await loadData();
  };

  const removeKeyword = async (configId: string, keyword: string) => {
    const existing = configs.find(c => c.id === configId);
    const keywords = (existing?.tracked_keywords || []).filter(k => k !== keyword);
    await supabase.from('client_mindshare_config').update({ tracked_keywords: keywords }).eq('id', configId);
    await loadData();
  };

  const filteredChannels = channels.filter(c =>
    !searchTerm ||
    c.channel_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.channel_username || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isAdmin) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-3" />
          <p className="text-gray-600">Admin access required.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-gray-50 p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50">
      <div className="w-full space-y-4">
        {/* Header */}
        <div className="w-full bg-white border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-[#e8f4f5] p-2 rounded-lg">
                <BarChart3 className="h-6 w-6 text-[#3e8692]" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Mindshare Monitor</h2>
                <p className="text-sm text-gray-500">Manage Telegram channels and client keywords for mindshare tracking</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                <Radio className="h-3 w-3 mr-1" />
                {channels.filter(c => c.is_active).length} Active Channels
              </Badge>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Monitored Channels */}
          <div className="bg-white border border-gray-200 shadow-sm rounded-lg">
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-[#3e8692]" />
                  <h3 className="font-semibold text-sm text-gray-900">Monitored Channels</h3>
                  <Badge variant="secondary" className="text-xs">{channels.length}</Badge>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search channels..."
                  className="auth-input pl-8"
                />
              </div>
            </div>

            <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-50">
              {filteredChannels.map((ch) => (
                <div key={ch.id} className={`px-4 py-2.5 flex items-center gap-3 ${!ch.is_active ? 'opacity-50' : ''}`}>
                  <Switch
                    checked={ch.is_active}
                    onCheckedChange={() => toggleChannel(ch.id, ch.is_active)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{ch.channel_name}</p>
                    <p className="text-xs text-gray-500">@{ch.channel_username}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] uppercase">{ch.language}</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                    onClick={() => deleteChannel(ch.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {filteredChannels.length === 0 && (
                <div className="p-6 text-center">
                  <Radio className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No channels yet.</p>
                </div>
              )}
            </div>

            {/* Add channel form */}
            <div className="px-4 py-3 border-t border-gray-100 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={newChannel.name}
                  onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
                  placeholder="Channel name"
                  className="auth-input"
                />
                <Input
                  value={newChannel.username}
                  onChange={(e) => setNewChannel({ ...newChannel, username: e.target.value })}
                  placeholder="@username"
                  className="auth-input"
                />
              </div>
              <Button
                size="sm"
                className="w-full hover:opacity-90 text-xs"
                style={{ backgroundColor: '#3e8692', color: 'white' }}
                onClick={handleAddChannel}
                disabled={!newChannel.name.trim() || !newChannel.username.trim() || addingChannel}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Channel
              </Button>
            </div>
          </div>

          {/* Client Keywords */}
          <div className="bg-white border border-gray-200 shadow-sm rounded-lg">
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-[#3e8692]" />
                <h3 className="font-semibold text-sm text-gray-900">Client Keywords</h3>
                <Badge variant="secondary" className="text-xs">{configs.length} Clients</Badge>
              </div>
              <p className="text-xs text-gray-500 mt-1">Keywords the scanner looks for in monitored channels</p>
            </div>

            <div className="max-h-[500px] overflow-y-auto divide-y divide-gray-50">
              {configs.map((config) => (
                <div key={config.id} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{config.client_name}</p>
                      <Badge variant={config.is_enabled ? 'default' : 'secondary'} className="text-[10px]">
                        {config.is_enabled ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                  </div>

                  {/* Keywords */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {config.tracked_keywords.map((kw, i) => (
                      <span key={i} className="inline-flex items-center gap-1 bg-[#e8f4f5] text-[#3e8692] text-xs px-2 py-0.5 rounded-full">
                        {kw}
                        <button onClick={() => removeKeyword(config.id, kw)} className="text-[#3e8692]/50 cursor-pointer">
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                    {config.tracked_keywords.length === 0 && (
                      <span className="text-xs text-gray-400">No keywords set</span>
                    )}
                  </div>

                  {/* Add keyword */}
                  {editingKeywords === config.id ? (
                    <div className="flex gap-1.5">
                      <Input
                        value={keywordInput}
                        onChange={(e) => setKeywordInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addKeyword(config.id, config.client_id); }}
                        placeholder="Add keyword..."
                        className="auth-input flex-1"
                        autoFocus
                      />
                      <Button size="sm" className="h-7 text-xs px-2" style={{ backgroundColor: '#3e8692', color: 'white' }} onClick={() => addKeyword(config.id, config.client_id)} disabled={!keywordInput.trim()}>
                        Add
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => { setEditingKeywords(null); setKeywordInput(''); }}>
                        Done
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" className="h-6 text-xs text-gray-500" onClick={() => setEditingKeywords(config.id)}>
                      <Plus className="h-3 w-3 mr-1" /> Add keyword
                    </Button>
                  )}
                </div>
              ))}
              {configs.length === 0 && (
                <div className="p-6 text-center">
                  <BarChart3 className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No clients with mindshare enabled.</p>
                  <p className="text-xs text-gray-400 mt-1">Enable it in the client Context Modal.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
