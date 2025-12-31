'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Plus, Search, Edit, Trash2, ExternalLink, Link as LinkIcon,
  Check, ChevronsUpDown, X, ChevronRight, ChevronDown, Building2
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface Link {
  id: string;
  name: string;
  url: string;
  client_id: string | null;
  link_types: string[];
  access: 'public' | 'partners' | 'team' | 'client';
  status: 'active' | 'inactive' | 'archived';
  created_by: string | null;
  created_at: string;
  updated_at: string;
  client?: {
    id: string;
    name: string;
  } | null;
}

interface Client {
  id: string;
  name: string;
}

const LINK_TYPES = [
  { value: 'client delivery', label: 'Client Delivery' },
  { value: 'templates', label: 'Templates' },
  { value: 'report/research', label: 'Report/Research' },
  { value: 'operations', label: 'Operations' },
  { value: 'public/pr', label: 'Public/PR' },
  { value: 'resources', label: 'Resources' },
  { value: 'list', label: 'List' },
  { value: 'loom', label: 'Loom' },
  { value: 'others', label: 'Others' },
  { value: 'sales', label: 'Sales' },
  { value: 'guide', label: 'Guide' },
  { value: 'contract', label: 'Contract' }
];

const ACCESS_OPTIONS = [
  { value: 'public', label: 'Public' },
  { value: 'partners', label: 'Partners' },
  { value: 'team', label: 'Team' },
  { value: 'client', label: 'Client' }
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' }
];

export default function LinksPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [links, setLinks] = useState<Link[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<Link | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    client_id: '',
    link_types: [] as string[],
    access: 'team' as 'public' | 'partners' | 'team' | 'client',
    status: 'active' as 'active' | 'inactive' | 'archived'
  });

  // Filter state
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterAccess, setFilterAccess] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');

  // Collapsed clients state
  const [collapsedClients, setCollapsedClients] = useState<Set<string>>(new Set());

  // Combobox state
  const [clientPopoverOpen, setClientPopoverOpen] = useState(false);
  const [linkTypesPopoverOpen, setLinkTypesPopoverOpen] = useState(false);

  // Adding to client state
  const [addingToClient, setAddingToClient] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchLinks(), fetchClients()]);
    setLoading(false);
  };

  const fetchLinks = async () => {
    try {
      const { data, error } = await supabase
        .from('links')
        .select(`
          *,
          client:clients(id, name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLinks(data || []);
    } catch (error) {
      console.error('Error fetching links:', error);
      toast({
        title: 'Error',
        description: 'Failed to load links',
        variant: 'destructive',
      });
    }
  };

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const openDialog = (link?: Link, clientId?: string) => {
    if (link) {
      setEditingLink(link);
      setFormData({
        name: link.name,
        url: link.url,
        client_id: link.client_id || '',
        link_types: link.link_types || [],
        access: link.access,
        status: link.status
      });
    } else {
      setEditingLink(null);
      setFormData({
        name: '',
        url: '',
        client_id: clientId || '',
        link_types: [],
        access: 'team',
        status: 'active'
      });
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

    setIsSubmitting(true);
    try {
      if (editingLink) {
        const { error } = await supabase
          .from('links')
          .update({
            name: formData.name.trim(),
            url: formData.url.trim(),
            client_id: formData.client_id || null,
            link_types: formData.link_types,
            access: formData.access,
            status: formData.status,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingLink.id);

        if (error) throw error;
        toast({ title: 'Link updated' });
      } else {
        const { error } = await supabase
          .from('links')
          .insert({
            name: formData.name.trim(),
            url: formData.url.trim(),
            client_id: formData.client_id || null,
            link_types: formData.link_types,
            access: formData.access,
            status: formData.status,
            created_by: user?.id
          });

        if (error) throw error;
        toast({ title: 'Link created' });
      }

      setIsDialogOpen(false);
      setAddingToClient(null);
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

  const toggleClientCollapse = (clientId: string) => {
    setCollapsedClients(prev => {
      const newSet = new Set(prev);
      if (newSet.has(clientId)) {
        newSet.delete(clientId);
      } else {
        newSet.add(clientId);
      }
      return newSet;
    });
  };

  // Filter links
  const filteredLinks = links.filter(link => {
    // Search filter
    if (searchTerm) {
      const query = searchTerm.toLowerCase();
      if (!link.name.toLowerCase().includes(query) &&
          !link.url.toLowerCase().includes(query) &&
          !link.client?.name?.toLowerCase().includes(query)) {
        return false;
      }
    }

    // Status filter
    if (filterStatus !== 'all' && link.status !== filterStatus) return false;

    // Access filter
    if (filterAccess !== 'all' && link.access !== filterAccess) return false;

    // Type filter
    if (filterType !== 'all' && !link.link_types.includes(filterType)) return false;

    return true;
  });

  // Group links by client
  const groupedLinks = () => {
    const groups: { clientId: string; clientName: string; links: Link[] }[] = [];
    const clientMap = new Map<string, Link[]>();

    // Group by client_id
    filteredLinks.forEach(link => {
      const clientId = link.client_id || '__no_client__';
      if (!clientMap.has(clientId)) {
        clientMap.set(clientId, []);
      }
      clientMap.get(clientId)!.push(link);
    });

    // Convert to array and sort
    clientMap.forEach((links, clientId) => {
      const clientName = clientId === '__no_client__'
        ? 'No Client'
        : links[0]?.client?.name || 'Unknown Client';
      groups.push({ clientId, clientName, links });
    });

    // Sort: clients with names first (alphabetically), then "No Client" at the end
    groups.sort((a, b) => {
      if (a.clientId === '__no_client__') return 1;
      if (b.clientId === '__no_client__') return -1;
      return a.clientName.localeCompare(b.clientName);
    });

    return groups;
  };

  const hasActiveFilters = filterStatus !== 'all' || filterAccess !== 'all' || filterType !== 'all';

  const clearFilters = () => {
    setFilterStatus('all');
    setFilterAccess('all');
    setFilterType('all');
  };

  const getAccessBadgeColor = (access: string) => {
    switch (access) {
      case 'public': return 'bg-green-100 text-green-800';
      case 'partners': return 'bg-blue-100 text-blue-800';
      case 'team': return 'bg-purple-100 text-purple-800';
      case 'client': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-yellow-100 text-yellow-800';
      case 'archived': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getLinkTypeLabel = (value: string) => {
    const type = LINK_TYPES.find(t => t.value === value);
    return type?.label || value;
  };

  const getAccessLabel = (value: string) => {
    const opt = ACCESS_OPTIONS.find(o => o.value === value);
    return opt?.label || value;
  };

  const getStatusLabel = (value: string) => {
    const opt = STATUS_OPTIONS.find(o => o.value === value);
    return opt?.label || value;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-5 w-48" />
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
        <Button
          onClick={() => openDialog()}
          className="hover:opacity-90"
          style={{ backgroundColor: '#3e8692', color: 'white' }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Link
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center space-x-4 flex-wrap gap-y-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search links..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 auth-input"
          />
        </div>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px] auth-input">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {STATUS_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterAccess} onValueChange={setFilterAccess}>
          <SelectTrigger className="w-[140px] auth-input">
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
          <SelectTrigger className="w-[160px] auth-input">
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
                : 'Try adjusting your filters'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map(group => {
            const isCollapsed = collapsedClients.has(group.clientId);
            const isNoClient = group.clientId === '__no_client__';

            return (
              <div key={group.clientId}>
                {/* Client Header */}
                <div
                  className={`flex items-center justify-between px-4 py-3 bg-gray-100 ${isCollapsed ? 'rounded-lg' : 'rounded-t-lg'} border border-gray-200 ${isCollapsed ? '' : 'border-b-0'} cursor-pointer select-none transition-all hover:bg-gray-150`}
                  onClick={() => toggleClientCollapse(group.clientId)}
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
                      openDialog(undefined, isNoClient ? '' : group.clientId);
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
                          <TableHead>Name</TableHead>
                          <TableHead>URL</TableHead>
                          <TableHead>Types</TableHead>
                          <TableHead>Access</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="w-16 text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.links.map(link => (
                          <TableRow key={link.id} className="hover:bg-gray-50">
                            <TableCell className="font-medium">{link.name}</TableCell>
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
                              <div className="flex flex-wrap gap-1 max-w-[200px]">
                                {link.link_types.length > 0 ? (
                                  link.link_types.slice(0, 2).map(type => (
                                    <Badge key={type} variant="outline" className="text-xs">
                                      {getLinkTypeLabel(type)}
                                    </Badge>
                                  ))
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                                {link.link_types.length > 2 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{link.link_types.length - 2}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={getAccessBadgeColor(link.access)}>
                                {getAccessLabel(link.access)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={getStatusBadgeColor(link.status)}>
                                {getStatusLabel(link.status)}
                              </Badge>
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
                className="auth-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="url">URL *</Label>
              <Input
                id="url"
                placeholder="https://example.com"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                className="auth-input"
              />
            </div>

            <div className="space-y-2">
              <Label>Client</Label>
              <Popover open={clientPopoverOpen} onOpenChange={setClientPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    {formData.client_id
                      ? clients.find(c => c.id === formData.client_id)?.name
                      : 'Select client...'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0">
                  <Command>
                    <CommandInput placeholder="Search clients..." />
                    <CommandList>
                      <CommandEmpty>No client found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value=""
                          onSelect={() => {
                            setFormData({ ...formData, client_id: '' });
                            setClientPopoverOpen(false);
                          }}
                        >
                          <Check className={`mr-2 h-4 w-4 ${!formData.client_id ? 'opacity-100' : 'opacity-0'}`} />
                          No client
                        </CommandItem>
                        {clients.map(client => (
                          <CommandItem
                            key={client.id}
                            value={client.name}
                            onSelect={() => {
                              setFormData({ ...formData, client_id: client.id });
                              setClientPopoverOpen(false);
                            }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${formData.client_id === client.id ? 'opacity-100' : 'opacity-0'}`} />
                            {client.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Link Types</Label>
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Access</Label>
                <Select
                  value={formData.access}
                  onValueChange={(value: 'public' | 'partners' | 'team' | 'client') =>
                    setFormData({ ...formData, access: value })
                  }
                >
                  <SelectTrigger>
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
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: 'active' | 'inactive' | 'archived') =>
                    setFormData({ ...formData, status: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
