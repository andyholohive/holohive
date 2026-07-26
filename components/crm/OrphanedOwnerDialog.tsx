'use client';

/**
 * Orphaned-owner reconcile prompt. [2026-07-25]
 *
 * Opens by itself when the CRM loads and finds opportunities owned by a UUID
 * that no longer resolves to a user — which is what an offboarding leaves
 * behind, since `crm_opportunities.owner_id` has no FK. The pipeline keeps the
 * deals but every owner-scoped view reads them as unowned, so nobody picks
 * them up and the dashboard quietly under-reports the book.
 *
 * Deliberately generic: it lists whatever orphans exist rather than naming
 * anyone, so it fires again on its own the next time someone leaves. It is
 * dismissible — this is a nudge, not a blocker — and it re-appears next load
 * until the orphans are actually resolved.
 *
 * Super-admin only (the API enforces this independently; the render gate here
 * is just to avoid a pointless fetch for everyone else).
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/dateFormat';
import { UserX, Loader2 } from 'lucide-react';

type Orphan = {
  ownerId: string;
  email: string | null;
  activeOpps: number;
  totalOpps: number;
  lastActivityAt: string | null;
};

type Assignee = { id: string; name: string };

export function OrphanedOwnerDialog() {
  const { userProfile } = useAuth();
  const { toast } = useToast();

  const [orphans, setOrphans] = useState<Orphan[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [open, setOpen] = useState(false);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const isSuperAdmin = userProfile?.role === 'super_admin';

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/crm/orphaned-owners');
      if (!res.ok) return; // 403 for non-super-admins is expected; stay silent
      const data = await res.json();
      const found: Orphan[] = data.orphans || [];
      setOrphans(found);
      setAssignees(data.assignees || []);
      if (found.length > 0) setOpen(true);
    } catch {
      // Never block the CRM on this — it's a housekeeping nudge.
    }
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    void load();
  }, [isSuperAdmin, load]);

  const reassign = async (orphan: Orphan) => {
    const toUserId = picks[orphan.ownerId];
    if (!toUserId) return;
    setSavingId(orphan.ownerId);
    try {
      const res = await fetch('/api/crm/orphaned-owners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromOwnerId: orphan.ownerId, toUserId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Reassign failed', description: data.error, variant: 'destructive' });
        return;
      }
      toast({
        title: `${data.reassigned} opportunities reassigned`,
        description: `Now owned by ${data.to}. Refresh the board to see them.`,
      });
      const remaining = orphans.filter(o => o.ownerId !== orphan.ownerId);
      setOrphans(remaining);
      if (remaining.length === 0) setOpen(false);
    } catch (err: any) {
      toast({ title: 'Reassign failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  };

  if (!isSuperAdmin || orphans.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserX className="h-4 w-4 text-amber-600" />
            Pipeline with no owner
          </DialogTitle>
          <DialogDescription>
            These opportunities belong to someone whose account no longer exists, so
            they don&apos;t show up in anyone&apos;s pipeline. Pick who takes over each book.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {orphans.map(orphan => (
            <div key={orphan.ownerId} className="border border-cream-200 rounded-lg p-3 space-y-2.5">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <span className="font-semibold text-ink-warm-900 text-sm">
                  {orphan.email || 'Unknown account'}
                </span>
                <StatusBadge tone="warning" size="sm">
                  {orphan.activeOpps} active
                </StatusBadge>
              </div>
              <p className="text-xs text-ink-warm-500">
                {orphan.totalOpps} total opportunities
                {orphan.lastActivityAt
                  ? ` · last active ${formatDate(orphan.lastActivityAt)}`
                  : ' · no recorded activity'}
              </p>
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Reassign to</Label>
                  <Select
                    value={picks[orphan.ownerId] || ''}
                    onValueChange={v => setPicks(p => ({ ...p, [orphan.ownerId]: v }))}
                  >
                    <SelectTrigger className="h-9 focus-brand">
                      <SelectValue placeholder="Choose a teammate" />
                    </SelectTrigger>
                    <SelectContent>
                      {assignees.map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="brand"
                  size="sm"
                  className="h-9"
                  disabled={!picks[orphan.ownerId] || savingId === orphan.ownerId}
                  onClick={() => reassign(orphan)}
                >
                  {savingId === orphan.ownerId
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Moving…</>
                    : 'Reassign'}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Decide later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
