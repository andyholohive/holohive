'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Check, Loader2, ChevronsUpDown, X } from 'lucide-react';
import Image from 'next/image';
import { createClient } from '@supabase/supabase-js';

// Create a standalone Supabase client for public access
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

export default function LinkSubmitPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkTypesPopoverOpen, setLinkTypesPopoverOpen] = useState(false);
  const [clientPopoverOpen, setClientPopoverOpen] = useState(false);
  const [existingClients, setExistingClients] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    url: '',
    description: '',
    client: '',
    link_types: [] as string[],
    access: 'team'
  });

  // Fetch existing clients for suggestions
  useEffect(() => {
    const fetchClients = async () => {
      const { data } = await supabase
        .from('links')
        .select('client')
        .not('client', 'is', null);

      if (data) {
        const clients = new Set<string>();
        data.forEach((link: { client: string | null }) => {
          if (link.client && link.client.trim()) {
            clients.add(link.client.trim());
          }
        });
        clients.add('Holo Hive');
        setExistingClients(Array.from(clients).sort());
      }
    };
    fetchClients();
  }, []);

  const clientSuggestions = useMemo(() => {
    return existingClients;
  }, [existingClients]);

  const toggleLinkType = (type: string) => {
    setFormData(prev => ({
      ...prev,
      link_types: prev.link_types.includes(type)
        ? prev.link_types.filter(t => t !== type)
        : [...prev.link_types, type]
    }));
  };

  const getLinkTypeLabel = (value: string) => {
    return LINK_TYPES.find(t => t.value === value)?.label || value;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!formData.url.trim()) {
      setError('URL is required');
      return;
    }

    try {
      new URL(formData.url);
    } catch {
      setError('Please enter a valid URL (include https://)');
      return;
    }

    if (!formData.client.trim()) {
      setError('Client is required');
      return;
    }
    if (formData.link_types.length === 0) {
      setError('At least one link type is required');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/links/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit link');
      }

      setIsSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'An error occurred while submitting');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Link Submitted!</h2>
            <p className="text-gray-500 mb-8">Your link has been successfully added to the repository.</p>
            <Button
              onClick={() => {
                setIsSubmitted(false);
                setFormData({
                  name: '',
                  url: '',
                  description: '',
                  client: '',
                  link_types: [],
                  access: 'team'
                });
              }}
              variant="outline"
              className="px-6"
            >
              Submit Another Link
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header with logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center mb-4">
            <Image
              src="/images/logo.png"
              alt="Logo"
              width={48}
              height={48}
              className="rounded-lg"
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Submit a Link</h1>
          <p className="text-gray-500 mt-1">Add a new link to the repository</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Name <span className="text-red-500">*</span></Label>
              <Input
                id="name"
                placeholder="Enter link name"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                disabled={isSubmitting}
                className="auth-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="url">URL <span className="text-red-500">*</span></Label>
              <Input
                id="url"
                type="url"
                placeholder="https://example.com"
                value={formData.url}
                onChange={e => setFormData(prev => ({ ...prev, url: e.target.value }))}
                disabled={isSubmitting}
                className="auth-input"
              />
            </div>

            <div className="space-y-2">
              <Label>Client <span className="text-red-500">*</span></Label>
              <Popover open={clientPopoverOpen} onOpenChange={setClientPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal auth-input"
                    disabled={isSubmitting}
                  >
                    {formData.client || 'Select or type client...'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0">
                  <Command>
                    <CommandInput
                      placeholder="Search or type client name..."
                      value={formData.client}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, client: value }))}
                    />
                    <CommandList>
                      <CommandEmpty>
                        <div className="py-2 px-3 text-sm">
                          Press enter to use "{formData.client}"
                        </div>
                      </CommandEmpty>
                      <CommandGroup>
                        {clientSuggestions.map(client => (
                          <CommandItem
                            key={client}
                            value={client}
                            onSelect={() => {
                              setFormData(prev => ({ ...prev, client }));
                              setClientPopoverOpen(false);
                            }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${formData.client === client ? 'opacity-100' : 'opacity-0'}`} />
                            {client}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Link Type <span className="text-red-500">*</span></Label>
              <Popover open={linkTypesPopoverOpen} onOpenChange={setLinkTypesPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal auth-input"
                    disabled={isSubmitting}
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
                        type="button"
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
                onValueChange={(value) => setFormData(prev => ({ ...prev, access: value }))}
                disabled={isSubmitting}
              >
                <SelectTrigger className="auth-input">
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
                placeholder="Optional description for this link"
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                disabled={isSubmitting}
                className="auth-input"
                rows={2}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              style={{ backgroundColor: '#3e8692', color: 'white' }}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Link'
              )}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          Powered by Holo Hive
        </p>
      </div>
    </div>
  );
}
