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

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'project', label: 'Project/Protocol' },
  { value: 'exchange', label: 'Exchange' },
  { value: 'fund', label: 'Fund/VC' },
  { value: 'agency', label: 'Agency' },
  { value: 'individual', label: 'Individual' },
  { value: 'other', label: 'Other' }
];

const SOURCE_OPTIONS = [
  { value: 'referral', label: 'Referral' },
  { value: 'website', label: 'Website' },
  { value: 'twitter', label: 'Twitter/X' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'conference', label: 'Conference/Event' },
  { value: 'cold_outreach', label: 'Cold Outreach' },
  { value: 'other', label: 'Other' }
];

const SCOPE_OPTIONS = [
  { value: 'kol_activation', label: 'KOL Activation' },
  { value: 'gtm', label: 'Go-to-Market (GTM)' },
  { value: 'advisory', label: 'Advisory' },
  { value: 'bd_partnerships', label: 'BD/Partnerships' },
  { value: 'fundraising', label: 'Fundraising' },
  { value: 'apac', label: 'APAC Expansion' }
];

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'USDT', label: 'USDT' },
  { value: 'USDC', label: 'USDC' },
  { value: 'ETH', label: 'ETH' },
  { value: 'BTC', label: 'BTC' }
];

export default function LeadSubmitPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scopePopoverOpen, setScopePopoverOpen] = useState(false);
  const [referrerPopoverOpen, setReferrerPopoverOpen] = useState(false);
  const [existingReferrers, setExistingReferrers] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    account_type: '',
    scope: [] as string[],
    deal_value: '',
    currency: 'USD',
    source: '',
    referrer: '',
    gc: '',
    notes: '',
    contact_name: '',
    contact_email: '',
    contact_telegram: ''
  });

  // Fetch existing referrers for suggestions
  useEffect(() => {
    const fetchReferrers = async () => {
      const { data } = await supabase
        .from('crm_opportunities')
        .select('referrer')
        .not('referrer', 'is', null);

      if (data) {
        const referrers = new Set<string>();
        data.forEach((opp: { referrer: string | null }) => {
          if (opp.referrer && opp.referrer.trim()) {
            referrers.add(opp.referrer.trim());
          }
        });
        setExistingReferrers(Array.from(referrers).sort());
      }
    };
    fetchReferrers();
  }, []);

  const referrerSuggestions = useMemo(() => {
    return existingReferrers;
  }, [existingReferrers]);

  const toggleScope = (scope: string) => {
    setFormData(prev => ({
      ...prev,
      scope: prev.scope.includes(scope)
        ? prev.scope.filter(s => s !== scope)
        : [...prev.scope, scope]
    }));
  };

  const getScopeLabel = (value: string) => {
    return SCOPE_OPTIONS.find(s => s.value === value)?.label || value;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError('Lead/Opportunity name is required');
      return;
    }

    if (!formData.contact_name.trim()) {
      setError('Contact name is required');
      return;
    }

    if (!formData.contact_email.trim() && !formData.contact_telegram.trim()) {
      setError('At least one contact method (email or Telegram) is required');
      return;
    }

    if (formData.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contact_email)) {
      setError('Please enter a valid email address');
      return;
    }

    if (formData.deal_value && isNaN(parseFloat(formData.deal_value))) {
      setError('Deal value must be a valid number');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/leads/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit lead');
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
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Lead Submitted!</h2>
            <p className="text-gray-500 mb-8">Thank you for your submission. Our team will review and follow up shortly.</p>
            <Button
              onClick={() => {
                setIsSubmitted(false);
                setFormData({
                  name: '',
                  account_type: '',
                  scope: [],
                  deal_value: '',
                  currency: 'USD',
                  source: '',
                  referrer: '',
                  gc: '',
                  notes: '',
                  contact_name: '',
                  contact_email: '',
                  contact_telegram: ''
                });
              }}
              variant="outline"
              className="px-6"
            >
              Submit Another Lead
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
          <h1 className="text-2xl font-bold text-gray-900">Submit a Lead</h1>
          <p className="text-gray-500 mt-1">Share a potential opportunity with us</p>
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
              <Label htmlFor="name">Lead/Opportunity Name <span className="text-red-500">*</span></Label>
              <Input
                id="name"
                placeholder="Enter company or project name"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                disabled={isSubmitting}
                className="auth-input"
              />
            </div>

            <div className="space-y-2">
              <Label>Account Type</Label>
              <Select
                value={formData.account_type}
                onValueChange={(value) => setFormData(prev => ({ ...prev, account_type: value }))}
                disabled={isSubmitting}
              >
                <SelectTrigger className="auth-input">
                  <SelectValue placeholder="Select account type..." />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Scope of Interest</Label>
              <Popover open={scopePopoverOpen} onOpenChange={setScopePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal auth-input"
                    disabled={isSubmitting}
                  >
                    {formData.scope.length > 0
                      ? `${formData.scope.length} selected`
                      : 'Select scope...'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0">
                  <Command>
                    <CommandInput placeholder="Search scope..." />
                    <CommandList>
                      <CommandEmpty>No scope found.</CommandEmpty>
                      <CommandGroup>
                        {SCOPE_OPTIONS.map(scope => (
                          <CommandItem
                            key={scope.value}
                            value={scope.label}
                            onSelect={() => toggleScope(scope.value)}
                          >
                            <Checkbox
                              checked={formData.scope.includes(scope.value)}
                              className="mr-2"
                            />
                            {scope.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {formData.scope.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {formData.scope.map(scope => (
                    <Badge key={scope} variant="secondary" className="text-xs">
                      {getScopeLabel(scope)}
                      <button
                        type="button"
                        onClick={() => toggleScope(scope)}
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
                <Label htmlFor="deal_value">Estimated Deal Value</Label>
                <Input
                  id="deal_value"
                  type="text"
                  placeholder="e.g., 10000"
                  value={formData.deal_value}
                  onChange={e => setFormData(prev => ({ ...prev, deal_value: e.target.value }))}
                  disabled={isSubmitting}
                  className="auth-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, currency: value }))}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className="auth-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Source</Label>
              <Select
                value={formData.source}
                onValueChange={(value) => setFormData(prev => ({ ...prev, source: value }))}
                disabled={isSubmitting}
              >
                <SelectTrigger className="auth-input">
                  <SelectValue placeholder="How did they find us?" />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Referrer</Label>
              <Popover open={referrerPopoverOpen} onOpenChange={setReferrerPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal auth-input"
                    disabled={isSubmitting}
                  >
                    {formData.referrer || 'Select or type referrer...'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0">
                  <Command>
                    <CommandInput
                      placeholder="Search or type referrer..."
                      value={formData.referrer}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, referrer: value }))}
                    />
                    <CommandList>
                      <CommandEmpty>
                        <div className="py-2 px-3 text-sm">
                          Press enter to use "{formData.referrer}"
                        </div>
                      </CommandEmpty>
                      <CommandGroup>
                        {referrerSuggestions.map(referrer => (
                          <CommandItem
                            key={referrer}
                            value={referrer}
                            onSelect={() => {
                              setFormData(prev => ({ ...prev, referrer }));
                              setReferrerPopoverOpen(false);
                            }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${formData.referrer === referrer ? 'opacity-100' : 'opacity-0'}`} />
                            {referrer}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gc">Telegram Group Chat</Label>
              <Input
                id="gc"
                placeholder="Telegram GC link or ID (if applicable)"
                value={formData.gc}
                onChange={e => setFormData(prev => ({ ...prev, gc: e.target.value }))}
                disabled={isSubmitting}
                className="auth-input"
              />
            </div>

            <div className="border-t border-gray-200 pt-5 mt-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Contact Information</h3>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="contact_name">Name <span className="text-red-500">*</span></Label>
                  <Input
                    id="contact_name"
                    placeholder="Primary contact name"
                    value={formData.contact_name}
                    onChange={e => setFormData(prev => ({ ...prev, contact_name: e.target.value }))}
                    disabled={isSubmitting}
                    className="auth-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact_email">Email</Label>
                  <Input
                    id="contact_email"
                    type="email"
                    placeholder="contact@example.com"
                    value={formData.contact_email}
                    onChange={e => setFormData(prev => ({ ...prev, contact_email: e.target.value }))}
                    disabled={isSubmitting}
                    className="auth-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact_telegram">Telegram</Label>
                  <Input
                    id="contact_telegram"
                    placeholder="@username"
                    value={formData.contact_telegram}
                    onChange={e => setFormData(prev => ({ ...prev, contact_telegram: e.target.value }))}
                    disabled={isSubmitting}
                    className="auth-input"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Additional Notes</Label>
              <Textarea
                id="notes"
                placeholder="Any other relevant information about this lead..."
                value={formData.notes}
                onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                disabled={isSubmitting}
                className="auth-input"
                rows={3}
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
                'Submit Lead'
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
