'use client';

/**
 * Tokens + activation sources manager for the Activation Settings dialog.
 * Replaces the old single `activation_api_base_url` field so one campaign can
 * hold multiple activations (Fogo=2, Venice=3). All reads/writes go through the
 * super-admin server routes — the config table + tokens are service-role only,
 * and token values are write-only (never read back to the browser).
 */
import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { Plus, Trash2, KeyRound, RefreshCw, Save, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/dateFormat';

type Source = {
  id: string;
  activation_key: string;
  display_name: string | null;
  base_url: string;
  activation_id_param: string | null;
  token_family: string;
  enabled: boolean;
  status: string | null;
  last_synced_at: string | null;
};

type TokenState = Record<string, { set: boolean; updated_at: string | null }>;

const FAMILIES = ['fogo', 'venice'] as const;
const emptyNew = { activation_key: '', display_name: '', base_url: '', activation_id_param: '', token_family: 'venice' };

export default function ActivationSourcesManager({ campaignId }: { campaignId: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState<Source[]>([]);
  const [tokens, setTokens] = useState<TokenState>({});
  const [tokenInput, setTokenInput] = useState<Record<string, string>>({ fogo: '', venice: '' });
  const [savingToken, setSavingToken] = useState<string | null>(null);
  const [newSrc, setNewSrc] = useState({ ...emptyNew });
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, tRes] = await Promise.all([
        fetch(`/api/admin/activation-sources?campaign_id=${campaignId}`),
        fetch('/api/admin/activation-token'),
      ]);
      const sJson = await sRes.json();
      const tJson = await tRes.json();
      setSources(sJson.sources ?? []);
      setTokens(tJson.families ?? {});
    } catch (e: any) {
      toast({ title: 'Load failed', description: e?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [campaignId, toast]);

  useEffect(() => { load(); }, [load]);

  const saveToken = async (family: string) => {
    const token = tokenInput[family]?.trim();
    if (!token) return;
    setSavingToken(family);
    try {
      const res = await fetch('/api/admin/activation-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token_family: family, token }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'save failed');
      setTokenInput((p) => ({ ...p, [family]: '' }));
      toast({ title: `${family.toUpperCase()} token saved` });
      load();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message, variant: 'destructive' });
    } finally {
      setSavingToken(null);
    }
  };

  const addSource = async () => {
    if (!newSrc.activation_key.trim() || !newSrc.base_url.trim()) {
      toast({ title: 'Missing fields', description: 'Activation key and base URL are required.', variant: 'destructive' });
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/admin/activation-sources', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId, ...newSrc }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'add failed');
      setNewSrc({ ...emptyNew });
      toast({ title: 'Activation added' });
      load();
    } catch (e: any) {
      toast({ title: 'Add failed', description: e?.message, variant: 'destructive' });
    } finally {
      setAdding(false);
    }
  };

  const patchSource = async (id: string, patch: Partial<Source>) => {
    setBusyId(id);
    try {
      const res = await fetch('/api/admin/activation-sources', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'update failed');
      load();
    } catch (e: any) {
      toast({ title: 'Update failed', description: e?.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const deleteSource = async (id: string) => {
    if (!window.confirm('Remove this activation source? Its snapshot stays until the next sync overwrites nothing.')) return;
    setBusyId(id);
    try {
      const res = await fetch('/api/admin/activation-sources', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'delete failed');
      toast({ title: 'Activation removed' });
      load();
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e?.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-ink-warm-500 py-4 text-center"><RefreshCw className="h-4 w-4 inline animate-spin mr-1.5" />Loading activations…</p>;
  }

  return (
    <div className="space-y-5">
      {/* ── Tokens (per client family, write-only) ── */}
      <div className="space-y-2">
        <Label className="text-[11px] uppercase tracking-wider text-ink-warm-500 flex items-center gap-1.5">
          <KeyRound className="h-3.5 w-3.5" /> API tokens
        </Label>
        <div className="space-y-2">
          {FAMILIES.map((f) => (
            <div key={f} className="flex items-center gap-2">
              <span className="w-16 text-xs font-medium uppercase text-ink-warm-700">{f}</span>
              {tokens[f]?.set ? (
                <StatusBadge tone="success" size="sm"><Check className="h-3 w-3 mr-0.5" />Set</StatusBadge>
              ) : (
                <StatusBadge tone="neutral" size="sm">Not set</StatusBadge>
              )}
              <Input
                type="password"
                value={tokenInput[f] || ''}
                onChange={(e) => setTokenInput((p) => ({ ...p, [f]: e.target.value }))}
                placeholder={tokens[f]?.set ? 'Replace token…' : 'Paste token…'}
                className="focus-brand h-8 font-mono flex-1"
              />
              <Button size="sm" variant="outline" className="h-8" disabled={savingToken === f || !tokenInput[f]?.trim()} onClick={() => saveToken(f)}>
                {savingToken === f ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              </Button>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-ink-warm-400">Stored server-side, never shown again. The hourly sync reads them; the browser only sees whether a token is set.</p>
      </div>

      {/* ── Sources ── */}
      <div className="space-y-2">
        <Label className="text-[11px] uppercase tracking-wider text-ink-warm-500">Activations on this campaign</Label>
        {sources.length === 0 ? (
          <p className="text-xs text-ink-warm-500 italic py-1">None yet. Add one below.</p>
        ) : (
          <div className="space-y-1.5">
            {sources.map((s) => (
              <div key={s.id} className="border border-cream-200 rounded-md p-2.5 text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium text-ink-warm-900">{s.activation_key}</span>
                  <StatusBadge tone={s.status === 'completed' ? 'success' : s.status ? 'brand' : 'neutral'} size="sm">
                    {s.status || 'unsynced'}
                  </StatusBadge>
                  <span className="uppercase text-[10px] text-ink-warm-400">{s.token_family}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={busyId === s.id} onClick={() => patchSource(s.id, { enabled: !s.enabled })}>
                      {s.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-rose-600 hover:text-rose-700" disabled={busyId === s.id} onClick={() => deleteSource(s.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="text-ink-warm-500 break-all">
                  {s.base_url}{s.activation_id_param ? <span className="text-brand">?activation_id={s.activation_id_param}</span> : ''}
                  {!s.enabled && <span className="ml-1 text-rose-500">· disabled</span>}
                  {s.last_synced_at && <span className="ml-1">· synced {formatDateTime(s.last_synced_at)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add form */}
        <div className="border border-dashed border-cream-300 rounded-md p-2.5 space-y-2 mt-1">
          <div className="grid grid-cols-2 gap-2">
            <Input value={newSrc.activation_key} onChange={(e) => setNewSrc({ ...newSrc, activation_key: e.target.value })} placeholder="activation key (e.g. fogo-pfp-2026q2)" className="focus-brand h-8" />
            <Select value={newSrc.token_family} onValueChange={(v) => setNewSrc({ ...newSrc, token_family: v })}>
              <SelectTrigger className="h-8 focus-brand"><SelectValue /></SelectTrigger>
              <SelectContent className="!bg-white">
                {FAMILIES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Input value={newSrc.base_url} onChange={(e) => setNewSrc({ ...newSrc, base_url: e.target.value })} placeholder="https://www.venicekorea.app" className="focus-brand h-8" />
          <div className="flex items-center gap-2">
            <Input value={newSrc.activation_id_param} onChange={(e) => setNewSrc({ ...newSrc, activation_id_param: e.target.value })} placeholder="activation_id param (only if base hosts >1)" className="focus-brand h-8 flex-1" />
            <Button size="sm" variant="brand" className="h-8" disabled={adding} onClick={addSource}>
              {adding ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}Add
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
