'use client';

/**
 * Showcase Settings — admin UI for the Campaign Dashboard spec's
 * Section 9 (revocable sales-safe public link). Standalone so the
 * 2.7k-line campaigns admin page doesn't grow with masking config.
 *
 * Five things it does:
 *   1. Toggle showcase enabled/disabled
 *   2. Generate a fresh token on first enable (URL-safe random)
 *   3. Rotate the token on demand (revokes the old link)
 *   4. Edit the mask config (4 boolean checkboxes)
 *   5. Copy the shareable URL with the active token
 *
 * Saves are write-through to `campaigns.showcase_*`. RLS protects
 * writes — this dialog should only be opened by admin/super_admin
 * (already gated at the campaigns admin page level).
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Eye, RefreshCw, Copy, Check, XCircle, AlertTriangle, ExternalLink,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';

type ShowcaseConfig = {
  hide_client_identity?: boolean;
  hide_kol_handles?: boolean;
  hide_budget?: boolean;
  hide_notes?: boolean;
};

/** URL-safe random token. Uses crypto.getRandomValues — fails loud
 *  if unavailable so we don't silently fall back to weak randomness.
 *  Every modern browser has crypto; the only way this throws is in a
 *  Node SSR context, which doesn't render this client component. */
function generateToken(): string {
  if (typeof crypto === 'undefined' || !('getRandomValues' in crypto)) {
    throw new Error('crypto.getRandomValues unavailable — cannot generate a secure token.');
  }
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  const hex = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
  return `s_${hex.slice(0, 24)}`;
}

export default function ShowcaseSettingsDialog({
  open,
  onClose,
  campaignId,
  campaignSlug,
}: {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  /** Used to build the shareable URL — falls back to id when slug is empty. */
  campaignSlug?: string | null;
}) {
  const { toast } = useToast();

  // Loaded state. Default = hide_budget only — sensible for the
  // common "share campaign with prospect, keep money private" path.
  // Operators can flip the other three on per-share.
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [config, setConfig] = useState<ShowcaseConfig>({
    hide_client_identity: false,
    hide_kol_handles: false,
    hide_budget: true,
    hide_notes: false,
  });

  // Working state
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  // Per-checkbox save indicator. Tracks which key was last saved so
  // the corresponding row briefly flashes a check mark — the only
  // visual signal that the auto-save round-trip completed.
  const [savedKey, setSavedKey] = useState<keyof ShowcaseConfig | null>(null);
  // Confirm-on-revoke gate so a fat-finger click can't kill a live
  // link. Two-state inline confirm strip per CLAUDE.md convention.
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  // Load on open
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setCopied(false);
    (supabase as any)
      .from('campaigns')
      .select('showcase_enabled, showcase_token, showcase_config')
      .eq('id', campaignId)
      .maybeSingle()
      .then(({ data, error }: any) => {
        if (error) {
          toast({
            title: 'Failed to load',
            description: error.message,
            variant: 'destructive',
          });
        } else if (data) {
          setEnabled(!!data.showcase_enabled);
          setToken(data.showcase_token || null);
          // Fall back to the sensible default (budget-only-hidden)
          // when the row hasn't been customized yet, NOT all-hidden.
          setConfig({
            hide_client_identity: data.showcase_config?.hide_client_identity ?? false,
            hide_kol_handles:     data.showcase_config?.hide_kol_handles     ?? false,
            hide_budget:          data.showcase_config?.hide_budget          ?? true,
            hide_notes:           data.showcase_config?.hide_notes           ?? false,
          });
        }
        setLoading(false);
      });
    setConfirmingRevoke(false);
    setSavedKey(null);
  }, [open, campaignId, toast]);

  const persist = async (overrides: {
    enabled?: boolean;
    token?: string | null;
    config?: ShowcaseConfig;
  }) => {
    setSaving(true);
    const payload: Record<string, any> = {};
    if ('enabled' in overrides) payload.showcase_enabled = overrides.enabled;
    if ('token' in overrides) payload.showcase_token = overrides.token;
    if ('config' in overrides) payload.showcase_config = overrides.config;
    const { error } = await (supabase as any)
      .from('campaigns')
      .update(payload)
      .eq('id', campaignId);
    setSaving(false);
    if (error) {
      toast({
        title: 'Save failed',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const handleToggleEnabled = async (next: boolean) => {
    // If turning on for the first time and no token exists, generate
    // one so the link is ready immediately.
    const nextToken = next && !token ? generateToken() : token;
    const ok = await persist({ enabled: next, token: nextToken });
    if (ok) {
      setEnabled(next);
      setToken(nextToken);
      toast({
        title: next ? 'Showcase enabled' : 'Showcase disabled',
        description: next
          ? 'Public link is live — copy it below.'
          : 'Existing link will stop working immediately.',
      });
    }
  };

  const handleRotate = async () => {
    const fresh = generateToken();
    const ok = await persist({ token: fresh });
    if (ok) {
      setToken(fresh);
      setCopied(false);
      toast({
        title: 'Token rotated',
        description: 'Old link no longer works. Share the new link.',
      });
    }
  };

  const handleRevoke = async () => {
    // Gated by the two-state confirm strip below — when the user
    // first clicks Revoke, confirmingRevoke flips to true and the
    // button is replaced by Confirm/Cancel. Only the second
    // click actually persists. Prevents a fat-finger from killing
    // a live link.
    const ok = await persist({ enabled: false, token: null });
    if (ok) {
      setEnabled(false);
      setToken(null);
      setConfirmingRevoke(false);
      toast({
        title: 'Showcase revoked',
        description: 'Link removed. Re-enable to generate a new one.',
      });
    }
  };

  const handleToggleConfig = async (key: keyof ShowcaseConfig, next: boolean) => {
    const nextConfig = { ...config, [key]: next };
    // Optimistic — local state flips immediately, save runs in
    // background. Per-row check icon flashes for ~1.2s after the
    // DB round-trip lands so the user knows it persisted.
    setConfig(nextConfig);
    const ok = await persist({ config: nextConfig });
    if (ok) {
      setSavedKey(key);
      window.setTimeout(() => {
        setSavedKey(prev => (prev === key ? null : prev));
      }, 1200);
    } else {
      // Roll back on save failure so the UI matches DB state.
      setConfig(prev => ({ ...prev, [key]: !next }));
    }
  };

  const handlePreview = () => {
    if (!shareableUrl) return;
    window.open(shareableUrl, '_blank', 'noopener,noreferrer');
  };

  const shareableUrl = (() => {
    if (typeof window === 'undefined' || !token) return '';
    const origin = window.location.origin;
    const slug = campaignSlug || campaignId;
    return `${origin}/public/campaigns/${slug}?showcase=${token}`;
  })();

  const handleCopy = async () => {
    if (!shareableUrl) return;
    try {
      await navigator.clipboard.writeText(shareableUrl);
      setCopied(true);
      toast({ title: 'Link copied' });
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: 'Copy failed',
        description: 'Browser blocked clipboard access',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* max-w-[600px] with max-h cap + flex-col so a long token URL
          or future expansion can scroll instead of overflowing the
          dialog. */}
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-brand" />
            Showcase Settings
          </DialogTitle>
          <DialogDescription>
            Generate a sales-safe public link with masked client identity, KOL handles, budget, and notes.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-ink-warm-500 py-6 text-center">Loading…</p>
        ) : (
          <div className="space-y-5 py-2 overflow-y-auto flex-1 min-h-0 px-1">
            {/* Enable toggle */}
            <div className="flex items-center justify-between gap-3 p-3 border border-cream-200 rounded-md bg-cream-50/40">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-warm-900">Showcase enabled</p>
                <p className="text-xs text-ink-warm-500">
                  When on, the link below works without an email gate.
                </p>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={handleToggleEnabled}
                disabled={saving}
              />
            </div>

            {/* Link + token controls (only when enabled with token) */}
            {enabled && token && (
              <div className="space-y-2">
                <Label className="text-xs">Shareable link</Label>
                {/* min-w-0 on the flex item is the gotcha — without
                    it the `truncate` on the <code> doesn't apply and
                    a long token URL pushes the Copy button off-dialog. */}
                <div className="flex items-center gap-2">
                  <code
                    className="flex-1 min-w-0 text-[11px] font-mono bg-cream-100 px-2 py-1.5 rounded truncate overflow-hidden whitespace-nowrap"
                    title={shareableUrl}
                  >
                    {shareableUrl}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0"
                    onClick={handleCopy}
                  >
                    {copied
                      ? <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                      : <Copy className="h-3.5 w-3.5 mr-1" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                  {/* Preview button — opens the showcase URL in a new
                      tab so the operator can QA the masking without a
                      copy-paste round-trip. */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0"
                    onClick={handlePreview}
                    title="Open the showcase link in a new tab"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    Preview
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-ink-warm-500 hover:text-brand"
                    onClick={handleRotate}
                    disabled={saving}
                    title="Generate a new token — invalidates the old link"
                  >
                    <RefreshCw className={`h-3 w-3 mr-1 ${saving ? 'animate-spin' : ''}`} />
                    Rotate token
                  </Button>
                  {/* Two-state confirm strip: first click swaps the
                      Revoke button for Confirm/Cancel. Same pattern
                      CLAUDE.md calls out for inline destructive
                      actions (used in /clients action items). */}
                  {confirmingRevoke ? (
                    <div className="flex items-center gap-2 ml-auto">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-xs text-ink-warm-700">Revoke now?</span>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 text-xs"
                        onClick={handleRevoke}
                        disabled={saving}
                      >
                        Yes, revoke
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setConfirmingRevoke(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-rose-600 hover:text-rose-700"
                      onClick={() => setConfirmingRevoke(true)}
                      disabled={saving}
                    >
                      <XCircle className="h-3 w-3 mr-1" />
                      Revoke
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Mask config — only meaningful when showcase is on */}
            {enabled && (
              <div className="border-t border-cream-200 pt-3 space-y-2">
                <Label className="text-xs uppercase tracking-wider text-ink-warm-500">What to hide</Label>
                <p className="text-[11px] text-ink-warm-500 mb-1">
                  Default hides the budget only — flip the others on for sensitive shares.
                </p>
                <div className="space-y-2">
                  {[
                    { key: 'hide_client_identity', label: 'Hide client identity', sub: 'Replaces logo + name with "Confidential campaign"' },
                    { key: 'hide_kol_handles',     label: 'Hide KOL handles',     sub: 'KOL names show as "KOL #1", "KOL #2"…' },
                    { key: 'hide_budget',          label: 'Hide budget',          sub: 'Removes the budget pill + value-anchor line' },
                    { key: 'hide_notes',           label: 'Hide notes',           sub: 'Removes the content Notes column entirely' },
                  ].map(item => {
                    const key = item.key as keyof ShowcaseConfig;
                    const justSaved = savedKey === key;
                    return (
                      <label key={item.key} className="flex items-start gap-2 p-2 rounded hover:bg-cream-50 cursor-pointer">
                        <Checkbox
                          checked={!!config[key]}
                          onCheckedChange={(checked) => handleToggleConfig(key, !!checked)}
                          disabled={saving}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-ink-warm-900">{item.label}</p>
                          <p className="text-[10px] text-ink-warm-500">{item.sub}</p>
                        </div>
                        {/* Per-row save indicator: flashes a check
                            mark for ~1.2s after the DB write lands. */}
                        {justSaved && (
                          <Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="border-t border-cream-100 pt-3 mt-0 shrink-0">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
