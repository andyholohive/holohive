'use client';

/**
 * Orbit — deals parked rather than closed (timing, internal priority).
 *
 * Orbit is an outcome, not a board column, so a deal moved there left the
 * board and the new pipeline had nowhere to see it [Yano 2026-10-07: "where
 * do orbits go?"]. This lists them, most recently parked first, with a way
 * to bring one back onto the board as a new lead.
 */

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Orbit, RotateCcw, Search } from 'lucide-react';
import { formatDate } from '@/lib/dateFormat';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LOSS_REASONS, ORBIT_FOLLOW_UP_OPTIONS, PipelineV13Service, orbitFollowUpAt } from '@/lib/pipelineV13Service';

const DAY = 86_400_000;
/** "due today" / "3d overdue" / "in 12d" — the same words the Outreach queue uses. */
function followUpLabel(iso: string | null): { text: string; overdue: boolean; soon: boolean } {
  if (!iso) return { text: '—', overdue: false, soon: false };
  const days = Math.floor((Date.parse(iso) - Date.now()) / DAY);
  if (days < 0) return { text: `${-days}d overdue`, overdue: true, soon: false };
  if (days === 0) return { text: 'due today', overdue: false, soon: true };
  return { text: `in ${days}d`, overdue: false, soon: days <= 7 };
}

type Row = Awaited<ReturnType<typeof PipelineV13Service.listOrbit>>[number];

const reasonLabel = (key: string | null) => (key ? LOSS_REASONS.find(r => r.key === key)?.label ?? key.replace(/_/g, ' ') : '—');

export default function OrbitList({ onReopened }: { onReopened?: () => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Due-first: the list exists to say who to go back to next [Yano 2026-10-26].
    try { setRows((await PipelineV13Service.listOrbit()).sort((a, b) => (a.follow_up_at ?? '9').localeCompare(b.follow_up_at ?? '9'))); }
    catch (err: any) {
      toast({ title: 'Could not load Orbit', description: err?.message, variant: 'destructive' });
      setRows([]);
    }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  async function bringBack(r: Row) {
    setBusyId(r.id);
    try {
      await PipelineV13Service.reopenFromOrbit(r.id);
      setRows(prev => (prev ?? []).filter(x => x.id !== r.id));
      toast({ title: 'Back on the board', description: `${r.name} is a New Lead again.` });
      onReopened?.();
    } catch (err: any) {
      toast({ title: 'Could not bring it back', description: err?.message, variant: 'destructive' });
    } finally { setBusyId(null); }
  }

  async function changeFollowUp(r: Row, days: number) {
    const before = rows ?? [];
    setRows(before.map(x => (x.id === r.id ? { ...x, followup_days: days, follow_up_at: orbitFollowUpAt(x.parked_at, days) } : x)));
    try { await PipelineV13Service.setOrbitFollowUpDays(r.id, days); }
    catch (err: any) {
      setRows(before);
      toast({ title: 'Could not change the follow-up', description: err?.message, variant: 'destructive' });
    }
  }

  const dueCount = (rows ?? []).filter(r => r.follow_up_at && Date.parse(r.follow_up_at) <= Date.now()).length;
  const term = q.trim().toLowerCase();
  const shown = (rows ?? []).filter(r => !term || r.name.toLowerCase().includes(term) || (r.tg_handle ?? '').toLowerCase().includes(term));

  return (
    <Card className="border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search Orbit" className="h-9 w-56 focus-brand" />
        <div className="ml-auto text-xs text-gray-500">
          {rows === null ? '' : `${shown.length} of ${rows.length} parked`}
          {dueCount > 0 && <span className="text-rose-600 font-semibold"> · {dueCount} due for a follow-up</span>}
        </div>
      </div>
      {rows === null ? (
        <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
      ) : shown.length === 0 ? (
        <EmptyState icon={Orbit} title={rows.length ? 'No Orbit deals match' : 'Nothing in Orbit'}
          description={rows.length ? 'Try a different search.' : 'Deals lost on timing or internal priority park here instead of closing.'} />
      ) : (
        <div className="max-h-[480px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                {['Deal', 'Reason', 'Owner', 'Parked', 'Follow up', ''].map(h => (
                  <TableHead key={h} className="h-9 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map(r => (
                <TableRow key={r.id} className="border-gray-100">
                  <TableCell className="py-3">
                    <span className="font-medium text-gray-900">{r.name}</span>
                    {r.tg_handle && <span className="ml-2 text-xs text-gray-500">{r.tg_handle}</span>}
                  </TableCell>
                  <TableCell className="py-3 text-sm text-gray-600 capitalize">{reasonLabel(r.orbit_reason)}</TableCell>
                  <TableCell className="py-3 text-sm text-gray-600">{r.owner_name ?? '—'}</TableCell>
                  <TableCell className="py-3 text-sm text-gray-600 tabular-nums">{r.parked_at ? formatDate(r.parked_at) : '—'}</TableCell>
                  <TableCell className="py-3">
                    {(() => {
                      const f = followUpLabel(r.follow_up_at);
                      return (
                        <div className="flex items-center gap-2">
                          <span className={`text-sm tabular-nums ${f.overdue ? 'text-rose-600 font-semibold' : f.soon ? 'text-amber-600 font-medium' : 'text-gray-600'}`}
                            title={r.follow_up_at ? formatDate(r.follow_up_at) : undefined}>
                            {f.text}
                          </span>
                          <Select value={String(r.followup_days)} onValueChange={v => changeFollowUp(r, Number(v))}>
                            <SelectTrigger className="h-6 w-[72px] text-[11px] px-2 focus-brand" aria-label="Follow-up window"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Array.from(new Set([...ORBIT_FOLLOW_UP_OPTIONS, r.followup_days])).sort((a, b) => a - b).map(d => (
                                <SelectItem key={d} value={String(d)}>{d}d</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    <Button variant="outline" size="sm" className="h-7" disabled={busyId === r.id} onClick={() => bringBack(r)}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />Bring back
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
