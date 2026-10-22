'use client';

/**
 * Share Portal dialog — extracted from app/clients/page.tsx [2026-10-22],
 * second cut of the page split. Loads the published forms when opened and
 * owns the portal / form link helpers. The page keeps which client is
 * being shared and whether the dialog is open.
 */

import type { ClientWithAccess } from '@/lib/clientService';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormService, FormWithStats } from '@/lib/formService';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Link as LinkIcon, ExternalLink, Copy, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEffect, useState } from 'react';

export function SharePortalDialog({ client, open, onOpenChange }: { client: ClientWithAccess | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const [shareForms, setShareForms] = useState<FormWithStats[]>([]);
  const [shareExtraForms, setShareExtraForms] = useState<string[]>([]);
  const [shareAddFormOpen, setShareAddFormOpen] = useState(false);

  const load = async () => {
    setShareExtraForms([]);
    setShareAddFormOpen(false);
    try {
      const forms = await FormService.getAllForms();
      setShareForms(forms.filter(f => f.status === 'published'));
    } catch (err) {
      console.error('Error fetching forms:', err);
    }
  };

  const copyPortalLink = () => {
    if (!client) return;
    const portalUrl = `${window.location.origin}/public/portal/${client.slug || client.id}`;
    navigator.clipboard.writeText(portalUrl);
    toast({
      title: 'Link copied',
      description: 'Portal link copied to clipboard.',
    });
  };

  const ONBOARDING_FORM_SLUG = 'holo-hive-onboarding';

  const getFormUrl = (formSlugOrId: string) => {
    if (!client) return '';
    return `${typeof window !== 'undefined' ? window.location.origin : ''}/public/forms/${formSlugOrId}?client=${client.id}`;
  };

  const copyFormLink = (formSlugOrId: string, formName: string) => {
    const url = getFormUrl(formSlugOrId);
    if (!url) return;
    navigator.clipboard.writeText(url);
    toast({
      title: 'Link copied',
      description: `${formName} link copied to clipboard.`,
    });
  };

  useEffect(() => { if (open) void load(); }, [open, client?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share Links: {client?.name}</DialogTitle>
          <DialogDescription>
            Share portal and form links with this client.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Portal Link</Label>
            <div className="flex gap-2">
              <Input
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/public/portal/${client?.slug || client?.id}`}
                readOnly
                className="flex-1 focus-brand"
              />
              <Button variant="outline" className="h-10" onClick={copyPortalLink}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="h-10" onClick={() => {
                if (typeof window !== 'undefined' && client) {
                  window.open(`${window.location.origin}/public/portal/${client.slug || client.id}`, '_blank');
                }
              }}>
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Onboarding Form</Label>
            <div className="flex gap-2">
              <Input
                value={getFormUrl(ONBOARDING_FORM_SLUG)}
                readOnly
                className="flex-1 focus-brand"
              />
              <Button variant="outline" className="h-10" onClick={() => copyFormLink(ONBOARDING_FORM_SLUG, 'Onboarding form')}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="h-10" onClick={() => {
                const url = getFormUrl(ONBOARDING_FORM_SLUG);
                if (url) window.open(url, '_blank');
              }}>
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {shareExtraForms.map(formSlugOrId => {
            const form = shareForms.find(f => (f.slug || f.id) === formSlugOrId);
            if (!form) return null;
            return (
              <div key={formSlugOrId} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{form.name}</Label>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-ink-warm-400 hover:text-rose-500" onClick={() => setShareExtraForms(prev => prev.filter(s => s !== formSlugOrId))}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input value={getFormUrl(formSlugOrId)} readOnly className="flex-1 focus-brand" />
                  <Button variant="outline" className="h-10" onClick={() => copyFormLink(formSlugOrId, form.name)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" className="h-10" onClick={() => {
                    const url = getFormUrl(formSlugOrId);
                    if (url) window.open(url, '_blank');
                  }}>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
          {(() => {
            const availableForms = shareForms.filter(f => (f.slug || f.id) !== ONBOARDING_FORM_SLUG && !shareExtraForms.includes(f.slug || f.id));
            if (availableForms.length === 0) return null;
            return shareAddFormOpen ? (
              <div className="space-y-2">
                <Label>Add Form</Label>
                <Select onValueChange={v => { setShareExtraForms(prev => [...prev, v]); setShareAddFormOpen(false); }}>
                  <SelectTrigger className="focus-brand">
                    <SelectValue placeholder="Select a form..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableForms.map(f => (
                      <SelectItem key={f.id} value={f.slug || f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="w-full" onClick={() => setShareAddFormOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add Form
              </Button>
            );
          })()}
          <p className="text-sm text-ink-warm-500">
            Clients can access the portal using their registered email address ({client?.email}).
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
