'use client';

/**
 * Exclude phrases for a Korea Signal project — preview, then apply.
 *
 * Exclusions blank a phrase out of a post before keyword matching ("jump
 * crypto" so JUMP stops counting Jump Crypto). Applying also removes past
 * mentions the phrase knocks out and recounts those days, so it goes through
 * /api/mindshare/projects/[id]/exclusions with a dry run first, never through
 * the plain project save.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Eye, Loader2, ShieldMinus } from 'lucide-react';
import { formatDate } from '@/lib/dateFormat';

interface Preview { total: number; remove: number; samples: Array<{ date: string; text: string }> }

export function ExclusionsEditor({ projectId, initial, onApplied }: { projectId: string | null; initial: string[]; onApplied?: () => void }) {
  const { toast } = useToast();
  const [text, setText] = useState(initial.join(', '));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const phrases = text.split(',').map((s) => s.trim()).filter(Boolean);
  const changed = phrases.join('|').toLowerCase() !== initial.join('|').toLowerCase();

  async function call(apply: boolean) {
    if (!projectId) return;
    setBusy(apply ? 'apply' : 'preview');
    try {
      const r = await fetch(`/api/mindshare/projects/${projectId}/exclusions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phrases, apply }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Request failed');
      if (apply) {
        toast({ title: 'Exclusions applied', description: d.removed ? `${d.removed} past mention${d.removed === 1 ? '' : 's'} removed across ${d.days} day${d.days === 1 ? '' : 's'}.` : 'No past mentions were affected.' });
        setPreview(null);
        onApplied?.();
      } else setPreview(d);
    } catch (e: any) {
      toast({ title: apply ? 'Could not apply' : 'Could not preview', description: e.message, variant: 'destructive' });
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5"><ShieldMinus className="h-3.5 w-3.5 text-ink-warm-500" />Exclude phrases (comma-separated)</Label>
      <Textarea rows={2} value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }} disabled={!projectId}
        placeholder={projectId ? 'jump crypto, jump trading, 점프크립토' : 'Save the project first, then add exclusions'} className="focus-brand" />
      <p className="text-[11px] text-ink-warm-500">Removed from a post before matching, so a keyword inside one of these phrases doesn&apos;t count. Applying also clears past mentions it knocks out.</p>
      {projectId && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => call(false)} disabled={!!busy || !changed}>
            {busy === 'preview' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Eye className="h-3 w-3 mr-1" />}Preview
          </Button>
          {preview && (
            <Button type="button" variant="brand" size="sm" className="h-7 text-xs" onClick={() => call(true)} disabled={!!busy}>
              {busy === 'apply' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Apply{preview.remove ? `, remove ${preview.remove}` : ''}
            </Button>
          )}
          {!changed && initial.length > 0 && <span className="text-[11px] text-ink-warm-500">{initial.length} phrase{initial.length === 1 ? '' : 's'} in effect</span>}
        </div>
      )}
      {preview && (
        <div className="mt-2 rounded-lg border border-cream-200 bg-cream-50/70 p-3">
          <p className="text-xs font-medium text-ink-warm-900">
            {preview.remove ? `Removes ${preview.remove} of ${preview.total} past mentions.` : `None of the ${preview.total} past mentions are affected; only new posts will be filtered.`}
          </p>
          {preview.samples.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {preview.samples.map((x, i) => (
                <li key={i} className="text-[11.5px] leading-snug text-ink-warm-700"><span className="mr-1.5 font-mono text-ink-warm-400">{formatDate(x.date)}</span>{x.text}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
