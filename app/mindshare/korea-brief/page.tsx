'use client';

/**
 * Korea weekly brief — team view (admin+).
 *
 * The brief is a readable page clients open from the button under the weekly
 * report in their Telegram group (/public/korea/<token>). This page shows it
 * at phone size, the link, whether the client has actually opened it, and a
 * reset for a link that has travelled too far. The email version of the same
 * content stays available as a second tab, for clients who do prefer email.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { CardHeaderEditorial } from '@/components/ui/card-header-editorial';
import { EmptyState } from '@/components/ui/empty-state';
import { KpiCard } from '@/components/ui/kpi-card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Send, Mail, Copy, ExternalLink, Lock, RefreshCw, Eye, Smartphone } from 'lucide-react';
import { formatDateTime, formatRelativeShort } from '@/lib/dateFormat';

type KoreaClient = {
  name: string; ticker: string; active: boolean; listed: boolean; clientId: string;
  briefToken: string | null; views30d: number; lastViewed: string | null;
};

export default function KoreaBriefTeamPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin';

  const [clients, setClients] = useState<KoreaClient[] | null>(null);
  const [canSend, setCanSend] = useState(false);
  const [clientId, setClientId] = useState('');
  const [origin, setOrigin] = useState('');
  const [rotating, setRotating] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);

  // Email tab
  const [html, setHtml] = useState<string | null>(null);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [to, setTo] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => { setOrigin(window.location.origin); }, []);

  async function loadClients(keep?: string) {
    try {
      const res = await fetch('/api/korea-intel');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setClients(json.clients);
      setCanSend(!!json.canSend);
      const pick = keep || (json.clients.find((c: KoreaClient) => c.active) ?? json.clients[0])?.clientId;
      if (pick) setClientId(pick);
    } catch (e) {
      setClients([]);
      toast({ title: 'Could not load Korea clients', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  }

  useEffect(() => { if (isAdmin) void loadClients(); }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (userProfile?.email && !to) setTo(userProfile.email); }, [userProfile?.email, to]);

  const current = clients?.find((c) => c.clientId === clientId) ?? null;
  const briefUrl = current?.briefToken && origin ? `${origin}/public/korea/${current.briefToken}` : null;

  async function loadEmail() {
    if (!clientId) return;
    setLoadingEmail(true);
    try {
      const res = await fetch(`/api/korea-intel/${clientId}/email`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setHtml(await res.text());
    } catch (e) {
      setHtml(null);
      toast({ title: 'Could not render the email', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setLoadingEmail(false);
    }
  }
  useEffect(() => { setHtml(null); setConfirmRotate(false); }, [clientId]);

  async function copyLink() {
    if (!briefUrl) return;
    try {
      await navigator.clipboard.writeText(briefUrl);
      toast({ title: 'Link copied', description: 'Paste it into the client’s Telegram group.' });
    } catch {
      toast({ title: 'Couldn’t copy', description: 'Select the link and copy it manually.', variant: 'destructive' });
    }
  }

  async function rotate() {
    setRotating(true);
    try {
      const res = await fetch(`/api/korea-intel/${clientId}/brief-link`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      toast({ title: 'New link issued', description: 'The old link and any buttons already posted no longer work.' });
      setConfirmRotate(false);
      await loadClients(clientId);
    } catch (e) {
      toast({ title: 'Link not reset', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setRotating(false);
    }
  }

  async function sendTest() {
    setSending(true);
    try {
      const res = await fetch(`/api/korea-intel/${clientId}/email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      toast({ title: 'Test email sent', description: `Sent to ${json.to}` });
    } catch (e) {
      toast({ title: 'Test email not sent', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSending(false);
    }
  }

  const header = (
    <>
      <Link href="/mindshare" className="inline-flex w-fit items-center text-xs text-ink-warm-500 transition-colors hover:text-brand">
        <ArrowLeft className="mr-1 h-3 w-3" />Back to Korea Signal
      </Link>
      <PageHeader icon={Send} kicker="Measurement · Korea Signal · Brief" kickerDot="emerald" title="Weekly Korea brief"
        subtitle="The page clients open from the button under their weekly Telegram report" />
    </>
  );

  if (authLoading) return <div className="space-y-6">{header}<Skeleton className="h-96 rounded-lg" /></div>;
  if (!isAdmin) {
    return (
      <div className="space-y-6">{header}
        <Card><EmptyState icon={Lock} title="Admins only" description="The Korea brief tools are limited to admin and super-admin accounts." /></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full max-w-xs">
          {clients === null ? <Skeleton className="h-9 rounded-md" /> : (
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="h-9 focus-brand"><SelectValue placeholder="Choose a client" /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.clientId} value={c.clientId}>{c.name} · ${c.ticker}{c.active ? '' : ' (inactive)'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {current && <StatusBadge tone={current.listed ? 'brand' : 'info'}>{current.listed ? 'Listed in Korea' : 'Not listed in Korea yet'}</StatusBadge>}
      </div>

      {clients && clients.length === 0 ? (
        <Card><EmptyState icon={Send} title="No clients with a Korea setup" description="Clients appear here once they have a KR Signal configuration." /></Card>
      ) : current && (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <KpiCard icon={Eye} accent={current.views30d ? 'emerald' : 'amber'} label="Client opens · 30 days" value={current.views30d}
              sub={current.views30d ? 'Your team’s previews aren’t counted' : 'Nobody at the client has opened it yet'} />
            <KpiCard icon={Smartphone} label="Last opened" value={current.lastViewed ? formatRelativeShort(current.lastViewed) : '—'}
              sub={current.lastViewed ? formatDateTime(current.lastViewed) : 'No opens yet'} />
            <KpiCard icon={Send} accent="brand" label="Delivered by" value="Telegram" sub="Button under the weekly report, once approved" />
          </div>

          <Tabs defaultValue="brief" className="space-y-4" onValueChange={(v) => { if (v === 'email' && !html) void loadEmail(); }}>
            <TabsList className="h-auto border border-cream-200 bg-cream-100 p-1">
              <TabsTrigger value="brief" className="text-sm data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card">
                <Send className="mr-2 h-4 w-4" />Telegram brief
              </TabsTrigger>
              <TabsTrigger value="email" className="text-sm data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-card">
                <Mail className="mr-2 h-4 w-4" />Email version
              </TabsTrigger>
            </TabsList>

            <TabsContent value="brief" className="mt-0">
              <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <Card>
                  <CardHeaderEditorial icon={Smartphone} title="What the client sees" subtitle="At phone size, as opened from Telegram" />
                  <div className="flex justify-center bg-cream-100 p-4 sm:p-6">
                    {briefUrl ? (
                      <iframe key={briefUrl} title="Korea brief preview" src={`${briefUrl}?preview=1`}
                        className="h-[760px] w-full max-w-[390px] rounded-[22px] border-[6px] border-ink-warm-900 bg-white shadow-card-hover" />
                    ) : <Skeleton className="h-[760px] w-full max-w-[390px] rounded-[22px]" />}
                  </div>
                </Card>

                <div className="space-y-4">
                  <Card>
                    <CardHeaderEditorial icon={Copy} title="The link" subtitle="Private to this client" />
                    <div className="space-y-3 p-5">
                      <Input readOnly value={briefUrl ?? ''} onFocus={(e) => e.currentTarget.select()} className="h-9 font-mono text-xs focus-brand" aria-label="Brief link" />
                      <div className="flex flex-wrap gap-2">
                        <Button variant="brand" size="sm" onClick={copyLink} disabled={!briefUrl}><Copy className="mr-1.5 h-3.5 w-3.5" />Copy link</Button>
                        <Button asChild variant="outline" size="sm" disabled={!briefUrl}>
                          <a href={briefUrl ? `${briefUrl}?preview=1` : '#'} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Open</a>
                        </Button>
                      </div>
                      <p className="text-xs text-ink-warm-500">
                        Once the weekly report is approved, this link goes out as a “Read this week’s Korea brief” button under it. Anyone with the link can read the brief, so treat it like a shared doc link.
                      </p>
                    </div>
                  </Card>

                  <Card>
                    <CardHeaderEditorial icon={RefreshCw} title="Reset the link" subtitle="If it was shared too widely" />
                    <div className="space-y-3 p-5">
                      {confirmRotate ? (
                        <>
                          <p className="text-sm text-ink-warm-700">The current link, and every button already posted in Telegram, will stop working. The next weekly report carries the new one.</p>
                          <div className="flex gap-2">
                            <Button variant="destructive" size="sm" onClick={rotate} disabled={rotating}>{rotating ? 'Resetting…' : 'Reset link'}</Button>
                            <Button variant="outline" size="sm" onClick={() => setConfirmRotate(false)} disabled={rotating}>Cancel</Button>
                          </div>
                        </>
                      ) : (
                        <Button variant="outline" size="sm" className="border-rose-300 text-rose-600 hover:bg-rose-50" onClick={() => setConfirmRotate(true)}>
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />Issue a new link…
                        </Button>
                      )}
                    </div>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="email" className="mt-0">
              <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                <Card>
                  <CardHeaderEditorial icon={Mail} title="Email version" subtitle="Same content, for clients who prefer email" />
                  <div className="bg-cream-50 p-3 sm:p-4">
                    {loadingEmail || !html ? <Skeleton className="h-[720px] rounded-lg" /> : (
                      <iframe title="Korea weekly email preview" srcDoc={html} sandbox="" className="h-[960px] w-full rounded-lg border border-cream-200 bg-white" />
                    )}
                  </div>
                </Card>
                <Card>
                  <CardHeaderEditorial icon={Send} title="Send a test" subtitle="One copy, to one address" />
                  <div className="space-y-3 p-5">
                    <div className="space-y-1.5">
                      <Label htmlFor="korea-email-to">Send to</Label>
                      <Input id="korea-email-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 focus-brand" />
                    </div>
                    <Button variant="brand" className="w-full" disabled={!clientId || sending || !canSend} onClick={sendTest}>
                      <Send className="mr-2 h-4 w-4" />{sending ? 'Sending…' : 'Send test email'}
                    </Button>
                    {!canSend && (
                      <p className="text-xs text-ink-warm-500">Sending is off: HHP has no email provider yet. Add <span className="font-mono">RESEND_API_KEY</span> and a verified <span className="font-mono">KOREA_EMAIL_FROM</span> to turn on test sends.</p>
                    )}
                  </div>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
