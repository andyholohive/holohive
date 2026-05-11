'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { toneClassName, type BadgeTone } from '@/components/ui/status-badge';

// Access-level tone map. Module-scope so the closure-captured object
// isn't reallocated each render. See components/ui/status-badge.tsx.
const ACCESS_TONES: Record<string, BadgeTone> = {
  public:   'success', // emerald, was green
  partners: 'info',    // sky, was blue
  team:     'purple',  // unchanged
  client:   'warning', // amber, was orange — closest in palette
};
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Plus, Search, Edit, Trash2, ExternalLink, Link as LinkIcon,
  ChevronsUpDown, X, ChevronRight, ChevronDown, Building2, BookOpen, Users, Info
} from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { formatDistanceToNow } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

// Field nullability mirrors the Supabase schema. The narrow string-union
// types on `access` and `status` are kept because they're enforced by
// the form's Select component — the DB column is broader (any string)
// but our writes are always one of these values.
interface Link {
  id: string;
  name: string;
  url: string;
  description: string | null;
  client: string | null;
  client_id: string | null;
  link_types: string[] | null;
  access: 'public' | 'partners' | 'team' | 'client';
  status: 'active' | 'inactive' | 'archived';
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

type ClientOption = {
  id: string;
  name: string;
};

const LINK_TYPES = [
  { value: 'client delivery', label: 'Client Delivery' },
  { value: 'templates', label: 'Templates' },
  { value: 'report/research', label: 'Report/Research' },
  { value: 'operations', label: 'Operations' },
  { value: 'public/pr', label: 'Public/PR' },
  { value: 'resources', label: 'Resources' },
  { value: 'list', label: 'List' },
  { value: 'loom', label: 'Loom' },
  { value: 'sales', label: 'Sales' },
  { value: 'guide', label: 'Guide' },
  { value: 'contract', label: 'Contract' },
  { value: 'others', label: 'Others' }
];

const ACCESS_OPTIONS = [
  { value: 'public', label: 'Public' },
  { value: 'partners', label: 'Partners' },
  { value: 'team', label: 'Team' },
  { value: 'client', label: 'Client' }
];

export default function LinksPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [links, setLinks] = useState<Link[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Tab state
  const [activeTab, setActiveTab] = useState<'holohive' | 'guide' | 'clients'>('holohive');
  // Sort state for the in-table column headers. Click "Name" or "Added"
  // to toggle direction. Applied within each client group across all
  // tabs (the grouping itself stays — sort is per-group, not flat).
  const [sortColumn, setSortColumn] = useState<'name' | 'created_at'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<Link | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    description: '',
    client: '',
    client_id: '' as string,
    link_types: [] as string[],
    access: 'team' as 'public' | 'partners' | 'team' | 'client'
  });

  // Filter state
  const [filterAccess, setFilterAccess] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');

  // Collapsed clients state
  const [collapsedClients, setCollapsedClients] = useState<Set<string>>(new Set());

  // Combobox state
  const [linkTypesPopoverOpen, setLinkTypesPopoverOpen] = useState(false);
  const [clientInputMode, setClientInputMode] = useState<'select' | 'text'>('select');

  // Client lookup map
  const clientMap = useMemo(() => {
    const map: Record<string, string> = {};
    clients.forEach(c => { map[c.id] = c.name; });
    return map;
  }, [clients]);

  useEffect(() => {
    fetchLinks();
  }, []);

  const fetchLinks = async () => {
    setLoading(true);
    try {
      const [{ data, error }, { data: clientData }] = await Promise.all([
        supabase.from('links').select('*').order('created_at', { ascending: false }),
        supabase.from('clients').select('id, name').order('name'),
      ]);
      setClients(clientData || []);

      if (error) throw error;
      // Cast: DB returns access/status as plain strings; our local Link
      // narrows them to unions enforced by the form Select. Runtime
      // values are constrained to the union by the write path.
      setLinks((data || []) as Link[]);
    } catch (error) {
      console.error('Error fetching links:', error);
      toast({
        title: 'Error',
        description: 'Failed to load links',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const openDialog = (link?: Link, clientName?: string) => {
    if (link) {
      setEditingLink(link);
      setFormData({
        name: link.name,
        url: link.url,
        description: link.description || '',
        client: link.client || '',
        client_id: link.client_id || '',
        link_types: link.link_types || [],
        access: link.access
      });
      setClientInputMode(link.client_id ? 'select' : 'text');
    } else {
      setEditingLink(null);
      setFormData({
        name: '',
        url: '',
        description: '',
        client: clientName || (activeTab === 'holohive' ? 'Holo Hive' : ''),
        client_id: '',
        link_types: activeTab === 'guide' ? ['guide'] : [],
        access: 'team'
      });
      setClientInputMode('select');
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.url.trim()) {
      toast({
        title: 'Error',
        description: 'Name and URL are required',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.client_id && !formData.client.trim()) {
      toast({
        title: 'Error',
        description: 'Client is required',
        variant: 'destructive',
      });
      return;
    }

    if (formData.link_types.length === 0) {
      toast({
        title: 'Error',
        description: 'At least one link type is required',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingLink) {
        const clientName = formData.client_id ? (clientMap[formData.client_id] || formData.client.trim()) : formData.client.trim();
        const { error } = await supabase
          .from('links')
          .update({
            name: formData.name.trim(),
            url: formData.url.trim(),
            description: formData.description.trim() || null,
            client: clientName || null,
            client_id: formData.client_id || null,
            link_types: formData.link_types,
            access: formData.access,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingLink.id);

        if (error) throw error;
        toast({ title: 'Link updated' });
      } else {
        const clientName = formData.client_id ? (clientMap[formData.client_id] || formData.client.trim()) : formData.client.trim();
        const { error } = await supabase
          .from('links')
          .insert({
            name: formData.name.trim(),
            url: formData.url.trim(),
            description: formData.description.trim() || null,
            client: clientName || null,
            client_id: formData.client_id || null,
            link_types: formData.link_types,
            access: formData.access,
            status: 'active',
            created_by: user?.id
          });

        if (error) throw error;
        toast({ title: 'Link created' });

        // Log activity for client-access links
        if (formData.access === 'client' && formData.client_id) {
          await supabase.from('client_activity_log').insert({
            client_id: formData.client_id,
            activity_type: 'link_added',
            title: 'New resource shared',
            description: formData.name.trim(),
            created_by: user?.id || null,
          });
        }

        // Send Telegram notification to terminal chat (same as form submission)
        try {
          const baseUrl = window.location.origin;
          const linkUrl = `${baseUrl}/links`;
          const message = `<b>New Link Submitted</b>\n\n` +
            `<b>Name:</b> ${formData.name.trim()}\n` +
            `<b>Client:</b> ${formData.client_id ? (clientMap[formData.client_id] || formData.client.trim()) : formData.client.trim() || 'N/A'}\n` +
            `<b>Type:</b> ${formData.link_types.map((t: string) => t.charAt(0).toUpperCase() + t.slice(1)).join(', ') || 'N/A'}\n\n` +
            `<a href="${linkUrl}">View Links</a>`;

          await fetch('/api/telegram/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, useTerminalChat: true })
          });
        } catch (telegramError) {
          // Don't fail the link creation if notification fails
          console.error('Failed to send Telegram notification:', telegramError);
        }
      }

      setIsDialogOpen(false);
      fetchLinks();
    } catch (error) {
      console.error('Error saving link:', error);
      toast({
        title: 'Error',
        description: 'Failed to save link',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (link: Link) => {
    if (!confirm(`Are you sure you want to delete "${link.name}"?`)) return;

    try {
      const { error } = await supabase
        .from('links')
        .delete()
        .eq('id', link.id);

      if (error) throw error;
      toast({ title: 'Link deleted' });
      fetchLinks();
    } catch (error) {
      console.error('Error deleting link:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete link',
        variant: 'destructive',
      });
    }
  };

  const toggleLinkType = (type: string) => {
    setFormData(prev => ({
      ...prev,
      link_types: prev.link_types.includes(type)
        ? prev.link_types.filter(t => t !== type)
        : [...prev.link_types, type]
    }));
  };

  const toggleClientCollapse = (clientName: string) => {
    setCollapsedClients(prev => {
      const newSet = new Set(prev);
      if (newSet.has(clientName)) {
        newSet.delete(clientName);
      } else {
        newSet.add(clientName);
      }
      return newSet;
    });
  };

  // Filter links based on active tab
  const getTabLinks = () => {
    let tabLinks = links;

    // Filter by tab
    switch (activeTab) {
      case 'holohive':
        tabLinks = links.filter(link => link.client === 'Holo Hive');
        break;
      case 'guide':
        tabLinks = links.filter(link => link.link_types?.includes('guide'));
        break;
      case 'clients':
        tabLinks = links.filter(link => link.client && link.client !== 'Holo Hive');
        break;
    }

    return tabLinks;
  };

  // Apply search and filters
  const filteredLinks = getTabLinks().filter(link => {
    // Search filter
    if (searchTerm) {
      const query = searchTerm.toLowerCase();
      if (!link.name.toLowerCase().includes(query) &&
          !link.url.toLowerCase().includes(query) &&
          !link.client?.toLowerCase().includes(query)) {
        return false;
      }
    }

    // Access filter
    if (filterAccess !== 'all' && link.access !== filterAccess) return false;

    // Type filter
    if (filterType !== 'all' && !link.link_types?.includes(filterType)) return false;

    return true;
  });

  // Group links by client
  const groupedLinks = () => {
    const groups: { clientName: string; links: Link[] }[] = [];
    const clientGroups = new Map<string, Link[]>();

    // Group by client
    filteredLinks.forEach(link => {
      const name = (link.client_id && clientMap[link.client_id]) ? clientMap[link.client_id] : (link.client || 'No Client');
      if (!clientGroups.has(name)) {
        clientGroups.set(name, []);
      }
      clientGroups.get(name)!.push(link);
    });

    // Sort links within each group by the active column. Defaults
    // are: Name → A→Z, Added → newest first. Direction toggles when
    // the user clicks the column header.
    const dir = sortDirection === 'asc' ? 1 : -1;
    clientGroups.forEach((links, clientName) => {
      links.sort((a, b) => {
        if (sortColumn === 'created_at') {
          const aT = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bT = b.created_at ? new Date(b.created_at).getTime() : 0;
          return (aT - bT) * dir;
        }
        return a.name.localeCompare(b.name) * dir;
      });
      groups.push({ clientName, links });
    });

    // Sort: clients with names first (alphabetically), then "No Client" at the end
    groups.sort((a, b) => {
      if (a.clientName === 'No Client') return 1;
      if (b.clientName === 'No Client') return -1;
      return a.clientName.localeCompare(b.clientName);
    });

    return groups;
  };

  const hasActiveFilters = filterAccess !== 'all' || filterType !== 'all';

  const clearFilters = () => {
    setFilterAccess('all');
    setFilterType('all');
  };

  // Access tones — migrated to centralized palette 2026-05-06.
  // 'orange' isn't in the shared palette; mapped client → warning (amber)
  // as the closest visual neighbor.
  const getAccessBadgeColor = (access: string) =>
    toneClassName(ACCESS_TONES[access] ?? 'neutral');

  const getLinkTypeLabel = (value: string) => {
    const type = LINK_TYPES.find(t => t.value === value);
    return type?.label || value;
  };

  const getAccessLabel = (value: string) => {
    const opt = ACCESS_OPTIONS.find(o => o.value === value);
    return opt?.label || value;
  };

  /**
   * Toggle the active sort column. Same column = flip direction;
   * different column = pick a sensible default (names A→Z, dates newest first).
   */
  const toggleSort = (col: 'name' | 'created_at') => {
    if (sortColumn === col) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection(col === 'created_at' ? 'desc' : 'asc');
    }
  };

  /** Renders a small ▲/▼ indicator on the active sort column header. */
  const sortIndicator = (col: 'name' | 'created_at') => {
    if (sortColumn !== col) return null;
    return <span className="ml-1 text-[10px] text-gray-400">{sortDirection === 'asc' ? '▲' : '▼'}</span>;
  };

  // Count links per tab
  const holoHiveCount = links.filter(l => l.client === 'Holo Hive').length;
  const guideCount = links.filter(l => l.link_types?.includes('guide')).length;
  const clientsCount = links.filter(l => l.client && l.client !== 'Holo Hive').length;

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header — real title/subtitle render immediately. */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Links</h2>
            <p className="text-gray-600">Manage all your important links</p>
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-10 w-80" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const groups = groupedLinks();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Links</h2>
          <p className="text-gray-600">
            Manage all your important links ({links.length} total)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => window.open('/public/links/submit', '_blank')}
            className="hover:opacity-90"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Submission Form
          </Button>
          <Button
            onClick={() => openDialog()}
            className="hover:opacity-90"
            style={{ backgroundColor: '#3e8692', color: 'white' }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Link
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="holohive" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Holo Hive
            <Badge variant="secondary" className="ml-1 text-xs">{holoHiveCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="guide" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Guide
            <Badge variant="secondary" className="ml-1 text-xs">{guideCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="clients" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Clients
            <Badge variant="secondary" className="ml-1 text-xs">{clientsCount}</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Search and Filters */}
      <div className="flex items-center space-x-4 flex-wrap gap-y-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search links..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 focus-brand"
          />
        </div>

        <Select value={filterAccess} onValueChange={setFilterAccess}>
          <SelectTrigger className="w-[140px] focus-brand">
            <SelectValue placeholder="Access" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Access</SelectItem>
            {ACCESS_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px] focus-brand">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {LINK_TYPES.map(type => (
              <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Grouped Links by Client */}
      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <LinkIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium text-gray-900">No links found</p>
            <p className="text-sm text-gray-500 mt-1">
              {links.length === 0
                ? 'Add your first link to get started'
                : 'Try adjusting your filters or switch tabs'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
                    {groups.map(group => {
            const isCollapsed = collapsedClients.has(group.clientName);
            const isNoClient = group.clientName === 'No Client';

            return (
              <div key={group.clientName}>
                {/* Client Header */}
                <div
                  className={`flex items-center justify-between px-4 py-3 bg-gray-100 ${isCollapsed ? 'rounded-lg' : 'rounded-t-lg'} border border-gray-200 ${isCollapsed ? '' : 'border-b-0'} cursor-pointer select-none transition-all hover:bg-gray-150`}
                  onClick={() => toggleClientCollapse(group.clientName)}
                >
                  <div className="flex items-center gap-3">
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-gray-600" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-600" />
                    )}
                    <Building2 className={`w-4 h-4 ${isNoClient ? 'text-gray-400' : 'text-gray-600'}`} />
                    <h3 className={`font-semibold ${isNoClient ? 'text-gray-500 italic' : 'text-gray-800'}`}>
                      {group.clientName}
                    </h3>
                    <Badge variant="secondary" className="text-xs font-medium">
                      {group.links.length}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-gray-600 hover:bg-gray-200"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDialog(undefined, isNoClient ? '' : group.clientName);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {/* Client Links Table */}
                {!isCollapsed && (
                  <div className="bg-white rounded-b-lg border border-gray-200 border-t-0 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50/50">
                          <TableHead className="w-[200px]">
                            <button
                              type="button"
                              onClick={() => toggleSort('name')}
                              className="inline-flex items-center hover:text-gray-900"
                            >
                              Name{sortIndicator('name')}
                            </button>
                          </TableHead>
                          <TableHead className="w-[200px]">URL</TableHead>
                          <TableHead className="w-[230px]">Link Type</TableHead>
                          <TableHead className="w-[100px]">Access</TableHead>
                          <TableHead className="w-[120px]">
                            <button
                              type="button"
                              onClick={() => toggleSort('created_at')}
                              className="inline-flex items-center hover:text-gray-900"
                            >
                              Added{sortIndicator('created_at')}
                            </button>
                          </TableHead>
                          <TableHead className="w-16 text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.links.map(link => (
                          <TableRow key={link.id} className="hover:bg-gray-50">
                            <TableCell className="font-medium">
                              {link.description ? (
                                <HoverCard>
                                  <HoverCardTrigger asChild>
                                    <span className="cursor-help flex items-center gap-1">
                                      {link.name}
                                      <Info className="h-3 w-3 text-gray-400" />
                                    </span>
                                  </HoverCardTrigger>
                                  <HoverCardContent className="w-80">
                                    <div className="space-y-1">
                                      <h4 className="text-sm font-semibold">{link.name}</h4>
                                      <p className="text-sm text-gray-600">{link.description}</p>
                                    </div>
                                  </HoverCardContent>
                                </HoverCard>
                              ) : (
                                link.name
                              )}
                            </TableCell>
                            <TableCell>
                              <a
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline flex items-center gap-1 max-w-[200px] truncate"
                              >
                                {link.url.replace(/^https?:\/\//, '').substring(0, 30)}
                                {link.url.length > 30 ? '...' : ''}
                                <ExternalLink className="h-3 w-3 flex-shrink-0" />
                              </a>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {(link.link_types ?? []).length > 0 ? (
                                  (link.link_types ?? []).map(type => (
                                    <Badge key={type} variant="outline" className="text-xs cursor-default">
                                      {getLinkTypeLabel(type)}
                                    </Badge>
                                  ))
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={`${getAccessBadgeColor(link.access)} cursor-default`}>
                                {getAccessLabel(link.access)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-gray-500 whitespace-nowrap" title={link.created_at || ''}>
                              {link.created_at
                                ? formatDistanceToNow(new Date(link.created_at), { addSuffix: true })
                                : '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    •••
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => window.open(link.url, '_blank')}>
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    Open Link
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => openDialog(link)}>
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleDelete(link)}
                                    className="text-red-600"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingLink ? 'Edit Link' : 'Add Link'}</DialogTitle>
            <DialogDescription>
              {editingLink ? 'Update the link details below.' : 'Add a new link to your collection.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="Link name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="focus-brand"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="url">URL *</Label>
              <Input
                id="url"
                placeholder="https://example.com"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                className="focus-brand"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Client <span className="text-red-500">*</span></Label>
                <button
                  type="button"
                  className="text-xs text-brand cursor-pointer"
                  onClick={() => {
                    setClientInputMode(clientInputMode === 'select' ? 'text' : 'select');
                    setFormData({ ...formData, client_id: '', client: '' });
                  }}
                >
                  {clientInputMode === 'select' ? 'Type custom name' : 'Select from clients'}
                </button>
              </div>
              {clientInputMode === 'select' ? (
                <Select
                  value={formData.client_id || '_holo_hive'}
                  onValueChange={(v) => {
                    if (v === '_holo_hive') {
                      setFormData({ ...formData, client_id: '', client: 'Holo Hive' });
                    } else {
                      const selected = clients.find(c => c.id === v);
                      setFormData({ ...formData, client_id: v, client: selected?.name || '' });
                    }
                  }}
                >
                  <SelectTrigger className="focus-brand"><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_holo_hive">Holo Hive (Internal)</SelectItem>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={formData.client}
                  onChange={(e) => setFormData({ ...formData, client: e.target.value, client_id: '' })}
                  placeholder="Type client or group name..."
                  className="focus-brand"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>Link Type <span className="text-red-500">*</span></Label>
              <Popover open={linkTypesPopoverOpen} onOpenChange={setLinkTypesPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    {formData.link_types.length > 0
                      ? `${formData.link_types.length} selected`
                      : 'Select types...'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0">
                  <Command>
                    <CommandInput placeholder="Search types..." />
                    <CommandList>
                      <CommandEmpty>No type found.</CommandEmpty>
                      <CommandGroup>
                        {LINK_TYPES.map(type => (
                          <CommandItem
                            key={type.value}
                            value={type.label}
                            onSelect={() => toggleLinkType(type.value)}
                          >
                            <Checkbox
                              checked={formData.link_types.includes(type.value)}
                              className="mr-2"
                            />
                            {type.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {formData.link_types.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {formData.link_types.map(type => (
                    <Badge key={type} variant="secondary" className="text-xs">
                      {getLinkTypeLabel(type)}
                      <button
                        onClick={() => toggleLinkType(type)}
                        className="ml-1 hover:text-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Access <span className="text-red-500">*</span></Label>
              <Select
                value={formData.access}
                onValueChange={(value: 'public' | 'partners' | 'team' | 'client') =>
                  setFormData({ ...formData, access: value })
                }
              >
                <SelectTrigger className="focus-brand">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCESS_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Optional description (shown on hover)"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="focus-brand"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              style={{ backgroundColor: '#3e8692', color: 'white' }}
            >
              {isSubmitting ? 'Saving...' : editingLink ? 'Update' : 'Add Link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
