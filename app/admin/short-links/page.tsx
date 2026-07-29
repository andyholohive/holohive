'use client';

/**
 * Short Links — branded redirects for KOL briefs.
 *
 *   tria.holohive.io/fitcheck → https://tria-fit-check.vercel.app/?lang=ko
 *
 * DNS can't route a path (the resolver only ever sees the hostname), so
 * each link is a row here and the hop runs through our own app via the
 * host rewrite in next.config.js → app/l/[sub]/[...slug].
 *
 * Creating a link is instant; a NEW subdomain also needs a one-time CNAME
 * in GoDaddy plus the domain added in Vercel. The dialog spells that out
 * rather than letting someone hand a KOL a link that silently 404s.
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiCard } from '@/components/ui/kpi-card';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { formatRelativeShort } from '@/lib/dateFormat';
import { Link2, Plus, Copy, Trash2, ExternalLink, MousePointerClick, Power, RefreshCw, AlertTriangle } from 'lucide-react';

const LINK_DOMAIN = 'holohive.io';

type DnsStatus = 'manual' | 'pending' | 'provisioned' | 'failed';

type ShortLinkRow = {
  id: string;
  subdomain: string;
  slug: string;
  dns_status: DnsStatus;
  dns_error: string | null;
  destination_url: string;
  label: string | null;
  is_active: boolean;
  client_id: string | null;
  client?: { id: string; name: string } | null;
  click_count: number;
  last_clicked_at: string | null;
};

type ClientOption = { id: string; name: string };

const BLANK = { subdomain: '', slug: '', destination_url: '', label: '', client_id: '' };

export default function ShortLinksPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [links, setLinks] = useState<ShortLinkRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  // Whether GoDaddy + Vercel credentials are configured server-side. Decides
  // between "we'll set DNS up for you" and the manual two-step instructions.
  const [autoDns, setAutoDns] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...BLANK });

  const load = async () => {
    try {
      const res = await fetch('/api/short-links');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load links');
      setLinks(json.links ?? []);
      setAutoDns(Boolean(json.autoDns));
    } catch (err: any) {
      toast({ title: 'Could not load links', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    (async () => {
      const { data } = await supabase
        .from('clients').select('id, name').eq('is_active', true).order('name');
      setClients((data as any) ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const publicUrl = (l: { subdomain: string; slug: string }) =>
    `https://${l.subdomain}.${LINK_DOMAIN}${l.slug ? `/${l.slug}` : ''}`;

  // Subdomains already live somewhere — a second link on one of these needs
  // no DNS work, which is the difference between "works now" and "works
  // after someone edits GoDaddy".
  const existingSubdomains = useMemo(
    () => new Set(links.map(l => l.subdomain)),
    [links],
  );

  const previewSub = form.subdomain.trim().toLowerCase();
  const previewSlug = form.slug.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
  const needsDns = previewSub.length > 0 && !existingSubdomains.has(previewSub);

  const totals = useMemo(() => ({
    total: links.length,
    active: links.filter(l => l.is_active).length,
    clicks: links.reduce((sum, l) => sum + (l.click_count || 0), 0),
  }), [links]);

  const create = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/short-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subdomain: previewSub,
          slug: previewSlug,
          destination_url: form.destination_url.trim(),
          label: form.label,
          client_id: form.client_id || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create link');
      toast({
        title: 'Link created',
        description: !needsDns
          ? `${publicUrl({ subdomain: previewSub, slug: previewSlug })} is live.`
          : json.provision?.status === 'provisioned'
            ? `DNS for ${previewSub} was set up automatically — allow a few minutes to propagate.`
            : json.provision?.error
              ? `Link saved, but DNS needs attention: ${json.provision.error}`
              : `Add the CNAME for ${previewSub} before sharing it.`,
        variant: needsDns && json.provision?.status === 'failed' ? 'destructive' : undefined,
      });
      setDialogOpen(false);
      setForm({ ...BLANK });
      load();
    } catch (err: any) {
      toast({ title: 'Could not create link', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (link: ShortLinkRow) => {
    const res = await fetch(`/api/short-links/${link.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !link.is_active }),
    });
    if (!res.ok) {
      toast({ title: 'Could not update link', variant: 'destructive' });
      return;
    }
    setLinks(prev => prev.map(l => (l.id === link.id ? { ...l, is_active: !l.is_active } : l)));
  };

  const remove = async (link: ShortLinkRow) => {
    const res = await fetch(`/api/short-links/${link.id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast({ title: 'Could not delete link', variant: 'destructive' });
      return;
    }
    setLinks(prev => prev.filter(l => l.id !== link.id));
    toast({ title: 'Link deleted', description: 'It will stop redirecting immediately.' });
  };

  const retryDns = async (link: ShortLinkRow) => {
    setRetrying(link.id);
    try {
      const res = await fetch(`/api/short-links/${link.id}/provision`, { method: 'POST' });
      const json = await res.json();
      const r = json.result ?? {};
      toast({
        title: r.status === 'provisioned' ? 'DNS set up' : 'Still not ready',
        description: r.status === 'provisioned'
          ? `${link.subdomain}.${LINK_DOMAIN} is pointed here. DNS can take a few minutes to propagate.`
          : (r.error || 'No API credentials configured.'),
        variant: r.status === 'provisioned' ? undefined : 'destructive',
      });
      load();
    } finally {
      setRetrying(null);
    }
  };

  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast({ title: 'Copied', description: url });
  };

  // No previewSlug requirement — an empty path means the subdomain root,
  // which is how a migrated GoDaddy forward keeps its old destination.
  const canSubmit = previewSub && form.destination_url.trim() && !saving;

  const header = (
    <PageHeader
      icon={Link2}
      title="Short Links"
      subtitle="Branded redirects for KOL briefs — and click counts on every one"
      actions={(
        <Button variant="brand" size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />New Link
        </Button>
      )}
    />
  );

  if (loading) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard icon={Link2} label="Links" value={totals.total} accent="brand" />
        <KpiCard icon={Power} label="Active" value={totals.active} accent="emerald" />
        <KpiCard icon={MousePointerClick} label="Total Clicks" value={totals.clicks} accent="sky" />
      </div>

      {links.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="No short links yet"
          description="Create one to hand KOLs a branded URL instead of a raw Vercel link."
        >
          <Button variant="brand" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />Create First Link
          </Button>
        </EmptyState>
      ) : (
        <Card className="border-gray-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Link</TableHead>
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Destination</TableHead>
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Client</TableHead>
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Clicks</TableHead>
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Status</TableHead>
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">DNS</TableHead>
                <TableHead className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map(link => (
                <TableRow key={link.id} className="border-gray-100">
                  <TableCell className="py-3">
                    <div className="font-medium text-sm">
                      {link.subdomain}.{LINK_DOMAIN}/{link.slug}
                    </div>
                    {link.label && <div className="text-xs text-gray-500 mt-0.5">{link.label}</div>}
                  </TableCell>
                  <TableCell className="py-3">
                    <a
                      href={link.destination_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-600 hover:text-brand inline-flex items-center gap-1 max-w-[22rem] truncate"
                    >
                      <span className="truncate">{link.destination_url}</span>
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  </TableCell>
                  <TableCell className="py-3 text-sm text-gray-600">
                    {link.client?.name ?? '—'}
                  </TableCell>
                  <TableCell className="py-3">
                    <div className="text-sm font-medium tabular-nums">{link.click_count}</div>
                    {link.last_clicked_at && (
                      <div className="text-xs text-gray-500">{formatRelativeShort(link.last_clicked_at)}</div>
                    )}
                  </TableCell>
                  <TableCell className="py-3">
                    <StatusBadge tone={link.is_active ? 'success' : 'neutral'} size="sm">
                      {link.is_active ? 'Active' : 'Off'}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="py-3">
                    {(() => {
                      // A link whose DNS isn't done resolves nowhere, so this
                      // column is the difference between "sendable" and "not".
                      const tone = link.dns_status === 'provisioned' ? 'success'
                        : link.dns_status === 'failed' ? 'danger'
                        : link.dns_status === 'pending' ? 'warning' : 'neutral';
                      const label = link.dns_status === 'provisioned' ? 'Ready'
                        : link.dns_status === 'failed' ? 'Needs fix'
                        : link.dns_status === 'pending' ? 'Setting up' : 'Manual';
                      return (
                        <div className="flex items-center gap-1.5">
                          <StatusBadge tone={tone as any} size="sm">{label}</StatusBadge>
                          {link.dns_status !== 'provisioned' && (
                            <Button
                              variant="ghost" size="sm" className="h-6 w-6 p-0"
                              title={link.dns_error || 'Retry DNS setup'}
                              disabled={retrying === link.id}
                              onClick={() => retryDns(link)}
                            >
                              <RefreshCw className={`h-3.5 w-3.5 ${retrying === link.id ? 'animate-spin' : ''}`} />
                            </Button>
                          )}
                        </div>
                      );
                    })()}
                    {link.dns_error && (
                      <div className="text-xs text-rose-600 mt-1 max-w-[18rem]">{link.dns_error}</div>
                    )}
                  </TableCell>
                  <TableCell className="py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost" size="sm" className="h-7 w-7 p-0"
                        title="Copy link"
                        onClick={() => copy(publicUrl(link))}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="h-7 w-7 p-0"
                        title={link.is_active ? 'Turn off' : 'Turn on'}
                        onClick={() => toggleActive(link)}
                      >
                        <Power className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50"
                        title="Delete"
                        onClick={() => remove(link)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Short Link</DialogTitle>
            <DialogDescription>
              The link goes live the moment you save — as long as its subdomain already points here.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sub">Subdomain <RequiredAsterisk /></Label>
                <Input
                  id="sub" className="h-9 focus-brand" placeholder="tria"
                  value={form.subdomain}
                  onChange={e => setForm({ ...form, subdomain: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slug">Path</Label>
                <Input
                  id="slug" className="h-9 focus-brand" placeholder="fitcheck (blank = root)"
                  value={form.slug}
                  onChange={e => setForm({ ...form, slug: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dest">Destination URL <RequiredAsterisk /></Label>
              <Input
                id="dest" className="h-9 focus-brand"
                placeholder="https://tria-fit-check.vercel.app/?lang=ko"
                value={form.destination_url}
                onChange={e => setForm({ ...form, destination_url: e.target.value })}
              />
              <p className="text-xs text-gray-500">
                Keep any query string the destination needs — <code>?lang=ko</code> is preserved as-is.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="label">Label</Label>
                <Input
                  id="label" className="h-9 focus-brand" placeholder="Fit Check microsite"
                  value={form.label}
                  onChange={e => setForm({ ...form, label: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Select
                  value={form.client_id || 'none'}
                  onValueChange={v => setForm({ ...form, client_id: v === 'none' ? '' : v })}
                >
                  <SelectTrigger className="h-9 focus-brand"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {previewSub && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">KOLs will receive</div>
                <div className="font-mono text-sm break-all">
                  https://{previewSub}.{LINK_DOMAIN}{previewSlug ? `/${previewSlug}` : ''}
                </div>
                {!previewSlug && (
                  <div className="text-xs text-gray-500 mt-1">
                    Empty path = the subdomain root itself.
                  </div>
                )}
              </div>
            )}

            {needsDns && autoDns && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                <div className="text-sm font-medium text-sky-900">
                  DNS for <code>{previewSub}</code> will be set up automatically
                </div>
                <p className="text-xs text-sky-800 mt-1">
                  The CNAME and the Vercel domain are created on save — nothing for you to do.
                  Propagation usually takes a few minutes.
                </p>
              </div>
            )}

            {needsDns && !autoDns && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1.5">
                <div className="text-sm font-medium text-amber-900">
                  One-time DNS step for <code>{previewSub}</code>
                </div>
                <p className="text-xs text-amber-800">
                  No link uses this subdomain yet, so it doesn&apos;t point anywhere. Until you do both
                  of these, the URL will not resolve:
                </p>
                <ol className="text-xs text-amber-800 list-decimal list-inside space-y-0.5">
                  <li>GoDaddy → add CNAME <code>{previewSub}</code> → <code>cname.vercel-dns.com</code></li>
                  <li>Vercel → add <code>{previewSub}.{LINK_DOMAIN}</code> as a domain on this project</li>
                </ol>
                <p className="text-xs text-amber-800">
                  Set <code>GODADDY_API_TOKEN</code>, <code>VERCEL_API_TOKEN</code> and{' '}
                  <code>VERCEL_PROJECT_ID</code> to have this done for you automatically.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="brand" onClick={create} disabled={!canSubmit}>
              {saving ? 'Creating…' : 'Create Link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
