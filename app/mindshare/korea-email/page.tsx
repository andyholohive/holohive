'use client';

/**
 * Korea weekly email — team preview (admin+).
 *
 * Shows exactly what a client's weekly Korea email would contain, rendered
 * from the same summary as the portal's Korea section. Test sends need an
 * email provider (RESEND_API_KEY + KOREA_EMAIL_FROM); until one is configured
 * the send box explains that instead of failing quietly.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { CardHeaderEditorial } from '@/components/ui/card-header-editorial';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Mail, Send, ExternalLink, Lock } from 'lucide-react';

type KoreaClient = { name: string; ticker: string; active: boolean; listed: boolean; clientId: string };

export default function KoreaEmailPreviewPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin';

  const [clients, setClients] = useState<KoreaClient[] | null>(null);
  const [canSend, setCanSend] = useState(false);
  const [clientId, setClientId] = useState('');
  const [html, setHtml] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [to, setTo] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const res = await fetch('/api/korea-intel');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        setClients(json.clients);
        setCanSend(!!json.canSend);
        const first = json.clients.find((c: KoreaClient) => c.active) ?? json.clients[0];
        if (first) setClientId(first.clientId);
      } catch (e) {
        setClients([]);
        toast({ title: 'Could not load Korea clients', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
      }
    })();
  }, [isAdmin, toast]);

  useEffect(() => {
    if (userProfile?.email && !to) setTo(userProfile.email);
  }, [userProfile?.email, to]);

  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    setLoadingEmail(true);
    (async () => {
      try {
        const res = await fetch(`/api/korea-intel/${clientId}/email`);
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
        const text = await res.text();
        if (!alive) return;
        setHtml(text);
        setSubject(decodeURIComponent(res.headers.get('x-email-subject') || ''));
      } catch (e) {
        if (alive) { setHtml(null); toast({ title: 'Could not render the email', description: e instanceof Error ? e.message : String(e), variant: 'destructive' }); }
      } finally {
        if (alive) setLoadingEmail(false);
      }
    })();
    return () => { alive = false; };
  }, [clientId, toast]);

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
      <PageHeader icon={Mail} kicker="Measurement · Korea Signal · Email" kickerDot="emerald" title="Korea weekly email"
        subtitle="What each client would get every Saturday, from their real data" />
    </>
  );

  if (authLoading) return <div className="space-y-6">{header}<Skeleton className="h-96 rounded-lg" /></div>;
  if (!isAdmin) {
    return (
      <div className="space-y-6">{header}
        <Card><EmptyState icon={Lock} title="Admins only" description="The Korea email preview is limited to admin and super-admin accounts." /></Card>
      </div>
    );
  }

  const current = clients?.find((c) => c.clientId === clientId);

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
        <Card><EmptyState icon={Mail} title="No clients with a Korea setup" description="Clients appear here once they have a KR Signal configuration." /></Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card>
            <CardHeaderEditorial icon={Mail} title="Preview" subtitle={subject ? `Subject · ${subject}` : 'Rendering…'} />
            <div className="bg-cream-50 p-3 sm:p-4">
              {loadingEmail || !html ? <Skeleton className="h-[720px] rounded-lg" /> : (
                <iframe title="Korea weekly email preview" srcDoc={html} sandbox="" className="h-[960px] w-full rounded-lg border border-cream-200 bg-white" />
              )}
            </div>
          </Card>

          <div className="space-y-4">
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
                  <p className="text-xs text-ink-warm-500">
                    Sending is off: HHP has no email provider yet. Add <span className="font-mono">RESEND_API_KEY</span> and a verified <span className="font-mono">KOREA_EMAIL_FROM</span> to turn on test sends.
                  </p>
                )}
              </div>
            </Card>
            {current && (
              <Card className="p-5">
                <p className="text-sm text-ink-warm-700">The email links to the Korea section of the client’s portal, which shows the same verdict with the trend and detail tabs underneath.</p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <a href={`/public/portal/${current.clientId}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Open client portal</a>
                </Button>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
