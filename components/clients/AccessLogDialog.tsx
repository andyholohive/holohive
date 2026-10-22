'use client';

/**
 * Portal visits for one client — extracted from app/clients/page.tsx
 * [2026-10-22], second cut of the page split. Loads the access log when a
 * client is passed (modal-scoped: the page never fetches this for every
 * card) and renders the Visits dialog. The page only tracks which client
 * is open.
 */

import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { ClientWithAccess } from '@/lib/clientService';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Share2, Eye } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge, type BadgeTone } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';

export function AccessLogDialog({ client, onClose }: { client: ClientWithAccess | null; onClose: () => void }) {
  const { toast } = useToast();
  const [accessLogRows, setAccessLogRows] = useState<
    Array<{ id: string; email: string; authorized_via: string; accessed_at: string; user_agent: string | null; ip_address: string | null; source: string | null; campaign_id: string | null }>
  >([]);
  // [2026-07-06] campaign_id → name lookup for tracker-visit rows, so
  // the Source badge can say WHICH campaign tracker was opened.
  const [accessLogCampaignNames, setAccessLogCampaignNames] = useState<Record<string, string>>({});
  const [accessLogLoading, setAccessLogLoading] = useState(false);
  // [2026-06-08] Audience filter. Defaults to 'external' so it matches the
  // per-card "Visit log" badge (which already excludes @holohive.io /
  // @holohive.agency). 'all' = full audit log, 'internal' = team QA traffic.
  const [accessLogAudience, setAccessLogAudience] = useState<'external' | 'internal' | 'all'>('external');

  // Lazy-load the full access log for a client when the admin opens
  // the Visits modal. We don't want to fetch this for every client on
  // the initial /clients load — the page already does 11 parallel
  // queries — so it stays modal-scoped.
  const load = async (client: ClientWithAccess) => {
    setAccessLogRows([]);
    setAccessLogLoading(true);
    setAccessLogAudience('external'); // matches the on-card badge
    try {
      const { data, error } = await (supabase as any)
        .from('portal_access_log')
        .select('id, email, authorized_via, accessed_at, user_agent, ip_address, source, campaign_id')
        .eq('client_id', client.id)
        .order('accessed_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setAccessLogRows((data || []) as any);
      // Resolve campaign names for tracker-visit rows so the Source
      // badge can say which campaign tracker was opened.
      const campaignIds = [...new Set(((data || []) as any[]).map(r => r.campaign_id).filter(Boolean))];
      if (campaignIds.length > 0) {
        const { data: campRows } = await (supabase as any)
          .from('campaigns')
          .select('id, name')
          .in('id', campaignIds);
        const nameMap: Record<string, string> = {};
        for (const c of ((campRows || []) as Array<{ id: string; name: string }>)) nameMap[c.id] = c.name;
        setAccessLogCampaignNames(nameMap);
      } else {
        setAccessLogCampaignNames({});
      }
    } catch (err) {
      console.error('Error loading portal access log:', err);
      toast({ title: 'Load failed', description: err instanceof Error ? err.message : 'Failed to load access log', variant: 'destructive' });
    } finally {
      setAccessLogLoading(false);
    }
  };

  useEffect(() => { if (client) void load(client); }, [client?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={!!client} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-brand" />
            Portal visits — {client?.name}
          </DialogTitle>
          <DialogDescription>
            Who has accessed this client&apos;s public portal, when, and which allowlist rule let them in.
          </DialogDescription>
        </DialogHeader>
        {/* [2026-06-08] Audience filter — defaults to External so the
            modal matches the on-card "Visit log" badge (which always
            excludes @holohive.io / @holohive.agency). User can flip
            to Internal to QA team traffic or All to see the full
            audit log. Counts live next to each label so it's clear
            what the split is at a glance. */}
        {(() => {
          const isInternal = (email: string | null | undefined) => {
            if (!email) return false;
            const lower = email.toLowerCase();
            return lower.endsWith('@holohive.io') || lower.endsWith('@holohive.agency');
          };
          const externalCount = accessLogRows.filter(r => !isInternal(r.email)).length;
          const internalCount = accessLogRows.filter(r => isInternal(r.email)).length;
          const visibleRows = accessLogRows.filter(r => {
            if (accessLogAudience === 'all') return true;
            if (accessLogAudience === 'external') return !isInternal(r.email);
            return isInternal(r.email);
          });
          return (
            <>
              {!accessLogLoading && accessLogRows.length > 0 && (
                // Audience selector — uses the same Tabs primitive
                // as every other in-popup selector in this page
                // (Meeting Notes / Decision Log at L3597, the
                // Context / Action Board switch at L3861, etc.)
                // so dialog chrome stays consistent.
                <Tabs value={accessLogAudience} onValueChange={(v) => setAccessLogAudience(v as 'external' | 'internal' | 'all')}>
                  <TabsList className="bg-cream-100 p-1 mb-3 shrink-0 w-fit">
                    <TabsTrigger value="external" className="data-[state=active]:bg-white px-4 py-2 text-sm font-medium">
                      External
                      <span className="ml-1.5 text-xs bg-cream-200 text-ink-warm-700 px-1.5 py-0.5 rounded-full pointer-events-none">{externalCount}</span>
                    </TabsTrigger>
                    <TabsTrigger value="internal" className="data-[state=active]:bg-white px-4 py-2 text-sm font-medium">
                      Internal
                      <span className="ml-1.5 text-xs bg-cream-200 text-ink-warm-700 px-1.5 py-0.5 rounded-full pointer-events-none">{internalCount}</span>
                    </TabsTrigger>
                    <TabsTrigger value="all" className="data-[state=active]:bg-white px-4 py-2 text-sm font-medium">
                      All
                      <span className="ml-1.5 text-xs bg-cream-200 text-ink-warm-700 px-1.5 py-0.5 rounded-full pointer-events-none">{accessLogRows.length}</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
              <div className="flex-1 overflow-y-auto px-1">
                {accessLogLoading ? (
                  <div className="space-y-2 py-4">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : accessLogRows.length === 0 ? (
                  <div className="py-8 text-center text-sm text-ink-warm-500">
                    No portal visits recorded yet.
                    <p className="text-xs text-ink-warm-400 mt-1">
                      Share the portal link via the <Share2 className="inline h-3 w-3" /> icon to start tracking.
                    </p>
                  </div>
                ) : visibleRows.length === 0 ? (
                  <div className="py-8 text-center text-sm text-ink-warm-500">
                    No {accessLogAudience} visits.
                    <p className="text-xs text-ink-warm-400 mt-1">
                      Try a different audience above.
                    </p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-cream-50 hover:bg-cream-50">
                          <TableHead className="h-9 px-3 py-2 text-xs font-medium uppercase tracking-wider text-ink-warm-500">When</TableHead>
                          <TableHead className="h-9 px-3 py-2 text-xs font-medium uppercase tracking-wider text-ink-warm-500">Email</TableHead>
                          <TableHead className="h-9 px-3 py-2 text-xs font-medium uppercase tracking-wider text-ink-warm-500">Source</TableHead>
                          <TableHead className="h-9 px-3 py-2 text-xs font-medium uppercase tracking-wider text-ink-warm-500">Via</TableHead>
                          <TableHead className="h-9 px-3 py-2 text-xs font-medium uppercase tracking-wider text-ink-warm-500">IP</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleRows.map(row => {
                          // Pretty labels for the authorization-rule enum.
                          // 'cache' = returning visitor on a still-valid
                          // 24h localStorage token, distinct from a fresh
                          // login.
                          const viaLabel =
                            row.authorized_via === 'exact' ? 'Primary email'
                            : row.authorized_via === 'approved_email' ? 'Approved email'
                            : row.authorized_via === 'same_domain' ? 'Same domain'
                            : row.authorized_via === 'approved_domain' ? 'Approved domain'
                            : row.authorized_via === 'cache' ? 'Returning'
                            : row.authorized_via;
                          const viaTone: BadgeTone =
                            row.authorized_via === 'exact' ? 'success'
                            : row.authorized_via === 'cache' ? 'neutral'
                            : 'info';
                          const rowIsInternal = isInternal(row.email);
                          return (
                            <TableRow key={row.id} className="border-cream-100">
                              <TableCell className="px-3 py-2 text-xs text-ink-warm-700 whitespace-nowrap">
                                {new Date(row.accessed_at).toLocaleString()}
                              </TableCell>
                              <TableCell className="px-3 py-2 text-xs text-ink-warm-900">
                                <span className="inline-flex items-center gap-1.5">
                                  <span>{row.email}</span>
                                  {rowIsInternal && (
                                    // Tiny internal-team marker so admins can
                                    // scan the All view without reading every
                                    // domain. Slate to read as "ops/admin"
                                    // per the StatusBadge palette.
                                    <StatusBadge tone="slate" size="sm" bordered>Internal</StatusBadge>
                                  )}
                                </span>
                              </TableCell>
                              <TableCell className="px-3 py-2">
                                {/* [2026-07-06] Which door the visitor used —
                                    the client portal or a campaign tracker
                                    (with the campaign's name when known). */}
                                {row.source === 'campaign' ? (
                                  <StatusBadge tone="purple" size="sm" bordered>
                                    {row.campaign_id && accessLogCampaignNames[row.campaign_id]
                                      ? accessLogCampaignNames[row.campaign_id]
                                      : 'Campaign tracker'}
                                  </StatusBadge>
                                ) : (
                                  <StatusBadge tone="brand" size="sm" bordered>Portal</StatusBadge>
                                )}
                              </TableCell>
                              <TableCell className="px-3 py-2">
                                <StatusBadge tone={viaTone} size="sm" bordered withDot>{viaLabel}</StatusBadge>
                              </TableCell>
                              <TableCell className="px-3 py-2 text-xs text-ink-warm-400 font-mono">
                                {row.ip_address || '—'}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </>
          );
        })()}
        <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={() => onClose()}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
